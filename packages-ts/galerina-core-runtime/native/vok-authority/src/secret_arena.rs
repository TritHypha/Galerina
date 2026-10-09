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

/// Stable, indexed metadata for a host/runtime failure mode.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RuntimeErrorCode {
    pub code: &'static str,
    pub name: &'static str,
    pub severity: &'static str,
    pub message: &'static str,
}

pub const ERR_SECRET_ARENA_INVALID_LENGTH: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_INVALID_LENGTH",
    name: "SECRET_ARENA_INVALID_LENGTH",
    severity: "error",
    message: "Secret arena length is outside the supported bound.",
};
pub const ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM",
    name: "SECRET_ARENA_UNSUPPORTED_PLATFORM",
    severity: "error",
    message: "Secret arena is unavailable on this platform.",
};
pub const ERR_SECRET_ARENA_CREATE_REFUSED: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_CREATE_REFUSED",
    name: "SECRET_ARENA_CREATE_REFUSED",
    severity: "error",
    message: "Linux refused creation of the secret-memory object.",
};
pub const ERR_SECRET_ARENA_RESIZE_REFUSED: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_RESIZE_REFUSED",
    name: "SECRET_ARENA_RESIZE_REFUSED",
    severity: "error",
    message: "Linux refused sizing of the secret-memory object.",
};
pub const ERR_SECRET_ARENA_MAP_REFUSED: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_MAP_REFUSED",
    name: "SECRET_ARENA_MAP_REFUSED",
    severity: "error",
    message: "Linux refused mapping of the secret-memory object.",
};
pub const ERR_SECRET_ARENA_PAGE_SIZE_REFUSED: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_PAGE_SIZE_REFUSED",
    name: "SECRET_ARENA_PAGE_SIZE_REFUSED",
    severity: "error",
    message: "The host refused to report a valid memory page size.",
};
pub const ERR_SECRET_ARENA_NOT_ALLOCATED: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_NOT_ALLOCATED",
    name: "SECRET_ARENA_NOT_ALLOCATED",
    severity: "error",
    message: "Secret-memory pages must be allocated before access.",
};
pub const ERR_SECRET_ARENA_NOT_ACTIVE: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_NOT_ACTIVE",
    name: "SECRET_ARENA_NOT_ACTIVE",
    severity: "error",
    message: "The secret arena is no longer active.",
};
pub const ERR_SECRET_ARENA_CLEANUP_FAILED: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_SECRET_ARENA_CLEANUP_FAILED",
    name: "SECRET_ARENA_CLEANUP_FAILED",
    severity: "error",
    message: "Secret-memory cleanup could not be proved complete.",
};

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

impl SecretArenaError {
    #[must_use]
    pub const fn runtime_code(&self) -> &'static RuntimeErrorCode {
        match self {
            Self::InvalidLength => &ERR_SECRET_ARENA_INVALID_LENGTH,
            Self::UnsupportedPlatform => &ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
            Self::CreateRefused { .. } => &ERR_SECRET_ARENA_CREATE_REFUSED,
            Self::ResizeRefused => &ERR_SECRET_ARENA_RESIZE_REFUSED,
            Self::MapRefused => &ERR_SECRET_ARENA_MAP_REFUSED,
            Self::PageSizeRefused => &ERR_SECRET_ARENA_PAGE_SIZE_REFUSED,
            Self::NotAllocated => &ERR_SECRET_ARENA_NOT_ALLOCATED,
            Self::NotActive => &ERR_SECRET_ARENA_NOT_ACTIVE,
            Self::CleanupFailed => &ERR_SECRET_ARENA_CLEANUP_FAILED,
        }
    }
}

impl fmt::Display for SecretArenaError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Preserve the existing consumer-facing identifiers. Registered codes
        // are available separately through runtime_code().code.
        match self {
            Self::CreateRefused { os_errno } => {
                write!(formatter, "{}:{os_errno}", self.runtime_code().name)
            }
            _ => formatter.write_str(self.runtime_code().name),
        }
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
    cleanup_failure_observed: bool,
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
                cleanup_failure_observed: false,
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
    /// A later successful retry retires the bytes and releases their charge,
    /// but the first cleanup failure remains an operation-level refusal.
    pub fn cleanup(&mut self) -> Result<(), SecretArenaError> {
        if self.status == MemoryStatus::Cleaned {
            return if self.cleanup_failure_observed {
                Err(SecretArenaError::CleanupFailed)
            } else {
                Ok(())
            };
        }

        #[cfg(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ))]
        {
            let Some(mapping) = self.mapping.as_mut() else {
                return self.record_cleanup_failure(SecretArenaError::CleanupFailed);
            };
            let cleanup = if self.allocated_bytes == 0 {
                mapping.unmap_close_unexposed(self.reserved_bytes)
            } else {
                mapping.wipe_verify_unmap_close(self.reserved_bytes)
            };
            match cleanup {
                Ok(()) => {
                    self.mapping = None;
                    self.record_cleanup_success()
                }
                Err(()) => self.record_cleanup_failure(SecretArenaError::CleanupFailed),
            }
        }

        #[cfg(not(all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )))]
        {
            self.record_cleanup_failure(SecretArenaError::UnsupportedPlatform)
        }
    }

    fn record_cleanup_failure(&mut self, error: SecretArenaError) -> Result<(), SecretArenaError> {
        self.cleanup_failure_observed = true;
        self.status = MemoryStatus::CleanupFailed;
        Err(error)
    }

    #[cfg(any(
        test,
        all(
            target_os = "linux",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )
    ))]
    fn record_cleanup_success(&mut self) -> Result<(), SecretArenaError> {
        self.allocated_bytes = 0;
        self.status = MemoryStatus::Cleaned;
        if self.cleanup_failure_observed {
            Err(SecretArenaError::CleanupFailed)
        } else {
            Ok(())
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

    /// Whether any cleanup attempt for this arena failed, even if a later
    /// retry successfully retired the mapping. This is operation history, not
    /// a claim that bytes remain in memory.
    #[must_use]
    pub const fn cleanup_failure_observed(&self) -> bool {
        self.cleanup_failure_observed
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
            .field("cleanup_failure_observed", &self.cleanup_failure_observed)
            .field("contents", &"REDACTED")
            .finish()
    }
}

impl Drop for SecretArena {
    fn drop(&mut self) {
        if self.status != MemoryStatus::Cleaned {
            let _ = self.cleanup();
        }
        if self.status != MemoryStatus::Cleaned {
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
            self.wipe_verify_unmap_close_inner(length, |_| {})
        }

        #[cfg(test)]
        pub(crate) fn wipe_verify_unmap_close_observing(
            &mut self,
            length: usize,
            observe_before_unmap: impl FnOnce(&[u8]),
        ) -> Result<(), ()> {
            self.wipe_verify_unmap_close_inner(length, observe_before_unmap)
        }

        fn wipe_verify_unmap_close_inner(
            &mut self,
            length: usize,
            observe_before_unmap: impl FnOnce(&[u8]),
        ) -> Result<(), ()> {
            if self.close_failed || length != self.length {
                return Err(());
            }

            self.wipe_and_verify()?;

            // SAFETY: the live mapping remains owned at this point; unmap_close
            // has not run, and the exact full mapping was just read back as zero.
            let wiped = unsafe {
                std::slice::from_raw_parts(self.address.as_ptr(), self.length)
            };
            observe_before_unmap(wiped);
            self.unmap_close()
        }

        fn wipe_and_verify(&self) -> Result<(), ()> {
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
            Ok(())
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

    #[cfg(test)]
    mod cleanup_observation_tests {
        use super::SecretMapping;

        #[test]
        #[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
        fn cleanup_observes_zero_bytes_before_unmapping_the_real_mapping() {
            const LENGTH: usize = 4097;
            let mut mapping = SecretMapping::reserve(LENGTH).expect("supported Linux secretmem");

            // SAFETY: this test exclusively owns the fresh mapping and uses its exact length.
            let bytes = unsafe {
                std::slice::from_raw_parts_mut(mapping.address.as_ptr(), mapping.length)
            };
            bytes.fill(0xA5);

            let mut observed_wiped_before_unmap = false;
            mapping
                .wipe_verify_unmap_close_observing(LENGTH, |before_unmap| {
                    observed_wiped_before_unmap = before_unmap.iter().all(|byte| *byte == 0);
                })
                .expect("wipe, read-back, unmap, and close must succeed");

            assert!(
                observed_wiped_before_unmap,
                "cleanup must expose zeroed bytes to the test observer before unmapping"
            );
        }
    }
}

#[cfg(test)]
mod cleanup_history_tests {
    use super::*;

    fn retained_arena() -> SecretArena {
        SecretArena {
            reserved_bytes: 8,
            allocated_bytes: 4096,
            status: MemoryStatus::Retained,
            cleanup_failure_observed: false,
            #[cfg(all(
                target_os = "linux",
                target_pointer_width = "64",
                any(target_arch = "x86_64", target_arch = "aarch64")
            ))]
            mapping: None,
            _not_send_or_sync: PhantomData,
        }
    }

    #[test]
    fn successful_retry_retires_bytes_but_keeps_cleanup_refusal_sticky() {
        let mut arena = retained_arena();

        assert_eq!(
            arena.record_cleanup_failure(SecretArenaError::CleanupFailed),
            Err(SecretArenaError::CleanupFailed)
        );
        assert_eq!(arena.status(), MemoryStatus::CleanupFailed);
        assert_eq!(arena.unresolved_bytes(), 8);

        assert_eq!(
            arena.record_cleanup_success(),
            Err(SecretArenaError::CleanupFailed)
        );
        assert_eq!(arena.status(), MemoryStatus::Cleaned);
        assert_eq!(arena.allocated_bytes(), 0);
        assert_eq!(arena.unresolved_bytes(), 0);
        assert!(arena.cleanup_failure_observed());
        assert_eq!(arena.cleanup(), Err(SecretArenaError::CleanupFailed));
    }

    #[test]
    fn cleanup_failure_keeps_the_specific_initial_platform_refusal() {
        let mut arena = retained_arena();

        assert_eq!(
            arena.record_cleanup_failure(SecretArenaError::UnsupportedPlatform),
            Err(SecretArenaError::UnsupportedPlatform)
        );
        assert_eq!(arena.status(), MemoryStatus::CleanupFailed);
        assert_eq!(arena.unresolved_bytes(), 8);
        assert!(arena.cleanup_failure_observed());
        assert_eq!(
            arena.record_cleanup_success(),
            Err(SecretArenaError::CleanupFailed)
        );
    }
}
