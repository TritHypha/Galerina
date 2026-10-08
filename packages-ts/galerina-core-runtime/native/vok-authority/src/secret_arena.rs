//! Linux secret-memory storage for the native runtime boundary.
//!
//! This is an arena primitive, not a complete memory-security boundary. The
//! caller must still prevent post-admission `fork`, constrain every output
//! path, and ensure secret-bearing providers and crypto scratch use this
//! mapping. `memfd_secret` does not prevent a process that can read the mapping
//! from copying bytes elsewhere.

use std::fmt;
use std::marker::PhantomData;
use std::rc::Rc;

/// Maximum logical arena reservation accepted by this initial bounded API.
pub const MAX_SECRET_ARENA_BYTES: usize = 64 * 1024 * 1024;

/// Total lifecycle state for one arena. No absent, null, or non-finite state
/// can be represented by this enum.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MemoryStatus {
    Reserved,
    Allocated,
    Retained,
    Cleaned,
    CleanupFailed,
}

/// Fail-closed errors for arena creation, access, and cleanup.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SecretArenaError {
    InvalidLength,
    UnsupportedPlatform,
    CreateRefused { os_errno: i32 },
    ResizeRefused,
    MapRefused,
    PageSizeRefused,
    NotAllocated,
    NotActive,
    CleanupFailed,
}

impl fmt::Display for SecretArenaError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidLength => "SECRET_ARENA_INVALID_LENGTH",
            Self::UnsupportedPlatform => "SECRET_ARENA_UNSUPPORTED_PLATFORM",
            Self::CreateRefused { os_errno } => {
                return write!(formatter, "SECRET_ARENA_CREATE_REFUSED:{os_errno}");
            }
            Self::ResizeRefused => "SECRET_ARENA_RESIZE_REFUSED",
            Self::MapRefused => "SECRET_ARENA_MAP_REFUSED",
            Self::PageSizeRefused => "SECRET_ARENA_PAGE_SIZE_REFUSED",
            Self::NotAllocated => "SECRET_ARENA_NOT_ALLOCATED",
            Self::NotActive => "SECRET_ARENA_NOT_ACTIVE",
            Self::CleanupFailed => "SECRET_ARENA_CLEANUP_FAILED",
        })
    }
}

impl std::error::Error for SecretArenaError {}

/// A non-cloneable, thread-bound owner of one bounded Linux secret mapping.
///
/// `reserved_bytes` is the exact logical request. `allocated_bytes` is the
/// page-rounded physical charge touched by this arena. These values exclude
/// the rest of the process and do not claim a process-wide memory total.
///
/// Plaintext access is crate-private so downstream callers cannot supply an
/// arbitrary callback that captures or copies the bytes out of this arena.
///
/// ```compile_fail
/// fn main() {
///     let mut arena = galerina_vok_authority::SecretArena::reserve(8).unwrap();
///     let _ = arena.with_bytes_mut(|bytes| bytes[0] = 1);
/// }
/// ```
pub struct SecretArena {
    reserved_bytes: usize,
    allocated_bytes: usize,
    status: MemoryStatus,
    #[cfg(all(
        target_os = "linux",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    mapping: Option<linux::SecretMapping>,
    // Keep the live mapping on one thread. This does not prevent fork; the
    // runtime supervisor must enforce its separate no-fork admission rule.
    _not_send_or_sync: PhantomData<Rc<()>>,
}

impl SecretArena {
    /// Create a `memfd_secret` mapping or refuse. There is no ordinary-memory
    /// fallback on Linux or other platforms.
    pub fn reserve(bytes: usize) -> Result<Self, SecretArenaError> {
        if bytes == 0 || bytes > MAX_SECRET_ARENA_BYTES {
            return Err(SecretArenaError::InvalidLength);
        }

        #[cfg(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ))]
        {
            let mapping = linux::SecretMapping::reserve(bytes)?;
            Ok(Self {
                reserved_bytes: bytes,
                allocated_bytes: 0,
                status: MemoryStatus::Reserved,
                mapping: Some(mapping),
                _not_send_or_sync: PhantomData,
            })
        }

        #[cfg(not(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )))]
        {
            let _ = bytes;
            Err(SecretArenaError::UnsupportedPlatform)
        }
    }

    /// Fault every backing page into the secret mapping before admitting data.
    pub fn allocate_pages(&mut self) -> Result<(), SecretArenaError> {
        match self.status {
            MemoryStatus::Allocated | MemoryStatus::Retained => return Ok(()),
            MemoryStatus::Reserved => {}
            MemoryStatus::Cleaned | MemoryStatus::CleanupFailed => {
                return Err(SecretArenaError::NotActive)
            }
        }

        #[cfg(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ))]
        {
            let mapping = self.mapping.as_ref().ok_or(SecretArenaError::NotActive)?;
            let page_size = linux::page_size()?;
            let page_count = self
                .reserved_bytes
                .checked_add(page_size - 1)
                .ok_or(SecretArenaError::InvalidLength)?
                / page_size;
            self.allocated_bytes = page_count
                .checked_mul(page_size)
                .ok_or(SecretArenaError::InvalidLength)?;
            // SAFETY: the mapping owns at least `reserved_bytes`; each offset
            // is within that range and one volatile write faults in each page.
            unsafe {
                for page in 0..page_count {
                    let offset = page * page_size;
                    std::ptr::write_volatile(mapping.address.as_ptr().add(offset), 0);
                }
                std::ptr::write_volatile(
                    mapping
                        .address
                        .as_ptr()
                        .add(self.reserved_bytes.saturating_sub(1)),
                    0,
                );
            }
            self.status = MemoryStatus::Allocated;
            Ok(())
        }

        #[cfg(not(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )))]
        {
            Err(SecretArenaError::UnsupportedPlatform)
        }
    }

    /// Borrow the active bytes only for trusted in-crate synchronous work.
    /// Retention is conservatively charged for the full allocated arena after
    /// first use. Keep this crate-private: a public callback could copy bytes
    /// out or retain them through captured state.
    #[allow(dead_code)]
    pub(crate) fn with_bytes_mut<T>(
        &mut self,
        operation: impl FnOnce(&mut [u8]) -> T,
    ) -> Result<T, SecretArenaError> {
        if !matches!(
            self.status,
            MemoryStatus::Allocated | MemoryStatus::Retained
        ) {
            return Err(match self.status {
                MemoryStatus::Reserved => SecretArenaError::NotAllocated,
                MemoryStatus::Cleaned | MemoryStatus::CleanupFailed => SecretArenaError::NotActive,
                MemoryStatus::Allocated | MemoryStatus::Retained => SecretArenaError::NotActive,
            });
        }

        #[cfg(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ))]
        {
            let outcome = {
                let mapping = self.mapping.as_ref().ok_or(SecretArenaError::NotActive)?;
                self.status = MemoryStatus::Retained;
                // SAFETY: the private mapping is live, exclusive through `&mut
                // self`, and exactly `reserved_bytes` long. The closure's result
                // type is independent of the slice borrow and cannot safely retain
                // a Rust reference into it.
                let bytes = unsafe {
                    std::slice::from_raw_parts_mut(mapping.address.as_ptr(), self.reserved_bytes)
                };
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| operation(bytes)))
            };
            match outcome {
                Ok(value) => Ok(value),
                Err(payload) => {
                    if self.cleanup().is_err() {
                        std::process::abort();
                    }
                    std::panic::resume_unwind(payload)
                }
            }
        }

        #[cfg(not(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )))]
        {
            let _ = operation;
            Err(SecretArenaError::UnsupportedPlatform)
        }
    }

    /// Explicitly wipe, read back, unmap, and close the arena. Any failed step
    /// leaves `CleanupFailed` and the full reservation charged as unresolved.
    pub fn cleanup(&mut self) -> Result<(), SecretArenaError> {
        if self.status == MemoryStatus::Cleaned {
            return Ok(());
        }

        #[cfg(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ))]
        {
            let mapping = self.mapping.as_mut().ok_or_else(|| {
                self.status = MemoryStatus::CleanupFailed;
                SecretArenaError::CleanupFailed
            })?;
            let cleanup = if self.allocated_bytes == 0 {
                mapping.unmap_close_unexposed(self.reserved_bytes)
            } else {
                mapping.wipe_verify_unmap_close(self.reserved_bytes)
            };
            match cleanup {
                Ok(()) => {
                    self.mapping = None;
                    self.allocated_bytes = 0;
                    self.status = MemoryStatus::Cleaned;
                    Ok(())
                }
                Err(()) => {
                    self.status = MemoryStatus::CleanupFailed;
                    Err(SecretArenaError::CleanupFailed)
                }
            }
        }

        #[cfg(not(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )))]
        {
            self.status = MemoryStatus::CleanupFailed;
            Err(SecretArenaError::UnsupportedPlatform)
        }
    }

    #[must_use]
    pub const fn status(&self) -> MemoryStatus {
        self.status
    }

    /// Exact logical reservation requested by this arena, not process RSS.
    #[must_use]
    pub const fn reserved_bytes(&self) -> usize {
        self.reserved_bytes
    }

    /// Page-rounded bytes physically touched by this arena, not process RSS.
    #[must_use]
    pub const fn allocated_bytes(&self) -> usize {
        self.allocated_bytes
    }

    /// Conservatively charge all touched pages after first secret access.
    #[must_use]
    pub const fn retained_bytes(&self) -> usize {
        match self.status {
            MemoryStatus::Retained | MemoryStatus::CleanupFailed => self.allocated_bytes,
            MemoryStatus::Reserved | MemoryStatus::Allocated | MemoryStatus::Cleaned => 0,
        }
    }

    /// Keep the reservation charged until wipe, read-back, unmap, and close all
    /// succeed. This is arena accounting only, not whole-process accounting.
    #[must_use]
    pub const fn unresolved_bytes(&self) -> usize {
        match self.status {
            MemoryStatus::Cleaned => 0,
            MemoryStatus::Reserved
            | MemoryStatus::Allocated
            | MemoryStatus::Retained
            | MemoryStatus::CleanupFailed => self.reserved_bytes,
        }
    }
}

impl fmt::Debug for SecretArena {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SecretArena")
            .field("reserved_bytes", &self.reserved_bytes)
            .field("allocated_bytes", &self.allocated_bytes)
            .field("retained_bytes", &self.retained_bytes())
            .field("unresolved_bytes", &self.unresolved_bytes())
            .field("status", &self.status)
            .field("contents", &"REDACTED")
            .finish()
    }
}

impl Drop for SecretArena {
    fn drop(&mut self) {
        if self.status != MemoryStatus::Cleaned && self.cleanup().is_err() {
            // Continuing after cleanup cannot be proved would silently abandon
            // secret storage. The owning runtime must also prohibit fork while
            // any secret arena is active.
            std::process::abort();
        }
    }
}

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
mod linux {
    use super::SecretArenaError;
    use std::ffi::{c_int, c_long, c_void};
    use std::ptr::NonNull;

    const SYS_MEMFD_SECRET: c_long = 447;
    const O_CLOEXEC: u32 = 0x0008_0000;
    const PROT_READ: c_int = 0x1;
    const PROT_WRITE: c_int = 0x2;
    const MAP_SHARED: c_int = 0x01;
    const SC_PAGESIZE: c_int = 30;

    extern "C" {
        fn syscall(number: c_long, ...) -> c_long;
        fn ftruncate(fd: c_int, length: c_long) -> c_int;
        fn mmap(
            address: *mut c_void,
            length: usize,
            protection: c_int,
            flags: c_int,
            fd: c_int,
            offset: isize,
        ) -> *mut c_void;
        fn munmap(address: *mut c_void, length: usize) -> c_int;
        fn close(fd: c_int) -> c_int;
        fn sysconf(name: c_int) -> c_long;
    }

    pub(crate) struct SecretMapping {
        pub(crate) address: NonNull<u8>,
        length: usize,
        fd: c_int,
        close_failed: bool,
    }

    impl SecretMapping {
        pub(crate) fn reserve(length: usize) -> Result<Self, SecretArenaError> {
            // SAFETY: Linux syscall 447 is memfd_secret on the two supported
            // 64-bit ABIs; O_CLOEXEC requests close-on-exec and takes no pointers.
            let fd = unsafe { syscall(SYS_MEMFD_SECRET, O_CLOEXEC) };
            if fd < 0 {
                let os_errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(-1);
                return Err(SecretArenaError::CreateRefused { os_errno });
            }
            if fd > c_int::MAX as c_long {
                return Err(SecretArenaError::CreateRefused { os_errno: -1 });
            }
            let fd = fd as c_int;

            // SAFETY: fd is the fresh descriptor from memfd_secret; length is
            // nonzero and bounded by the public constructor.
            if unsafe { ftruncate(fd, length as c_long) } != 0 {
                close_or_abort(fd);
                return Err(SecretArenaError::ResizeRefused);
            }

            // SAFETY: arguments map exactly the bounded secret file as shared,
            // readable and writable memory. No caller-supplied address exists.
            let raw = unsafe {
                mmap(
                    std::ptr::null_mut(),
                    length,
                    PROT_READ | PROT_WRITE,
                    MAP_SHARED,
                    fd,
                    0,
                )
            };
            if raw as isize == -1 {
                close_or_abort(fd);
                return Err(SecretArenaError::MapRefused);
            }
            let Some(address) = NonNull::new(raw.cast::<u8>()) else {
                // SAFETY: a null address is rejected; unmap the exact requested
                // length before releasing the fresh descriptor.
                if unsafe { munmap(raw, length) } != 0 {
                    std::process::abort();
                }
                close_or_abort(fd);
                return Err(SecretArenaError::MapRefused);
            };

            Ok(Self {
                address,
                length,
                fd,
                close_failed: false,
            })
        }

        pub(crate) fn unmap_close_unexposed(&mut self, length: usize) -> Result<(), ()> {
            if self.close_failed || length != self.length {
                return Err(());
            }

            self.unmap_close()
        }

        pub(crate) fn wipe_verify_unmap_close(&mut self, length: usize) -> Result<(), ()> {
            if self.close_failed || length != self.length {
                return Err(());
            }

            // SAFETY: the mapping is live and owns exactly `self.length` bytes.
            // Volatile writes/read-back prevent dead-store elimination from
            // masquerading as a successful wipe; no other safe alias exists.
            unsafe {
                for offset in 0..self.length {
                    std::ptr::write_volatile(self.address.as_ptr().add(offset), 0);
                }
                for offset in 0..self.length {
                    if std::ptr::read_volatile(self.address.as_ptr().add(offset)) != 0 {
                        return Err(());
                    }
                }
            }

            self.unmap_close()
        }

        fn unmap_close(&mut self) -> Result<(), ()> {
            // SAFETY: this object owns this exact live mapping and length.
            if unsafe { munmap(self.address.as_ptr().cast::<c_void>(), self.length) } != 0 {
                return Err(());
            }
            self.address = NonNull::dangling();
            self.length = 0;

            let fd = self.fd;
            self.fd = -1;
            // On Linux close errors do not make a retry safe: the descriptor
            // may already have been released and reused. Preserve an explicit
            // unresolved state rather than risk closing another owner's fd.
            if fd >= 0 && unsafe { close(fd) } != 0 {
                self.close_failed = true;
                return Err(());
            }
            Ok(())
        }
    }

    pub(crate) fn page_size() -> Result<usize, SecretArenaError> {
        // SAFETY: sysconf reads one process-wide constant and takes no pointers.
        let value = unsafe { sysconf(SC_PAGESIZE) };
        usize::try_from(value)
            .ok()
            .filter(|size| *size > 0)
            .ok_or(SecretArenaError::PageSizeRefused)
    }

    fn close_or_abort(fd: c_int) {
        // SAFETY: fd is the descriptor owned by the failed constructor path.
        if unsafe { close(fd) } != 0 {
            std::process::abort();
        }
    }
}
