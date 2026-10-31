//! In-crate named store over `SecretArena`. The JS runtime never sees this type.
//! Bytes at rest live only in Linux secretmem. `get` copies out for a borrow window.
//!
//! MEM-R24: entries sit in a generation-checked `HandleTable`. `put_handle`
//! returns a `SecretHandle`; a handle kept across a release or a replacement
//! is refused (`NotActive`) instead of reaching the new secret under the same
//! name. A release, replacement or exhaustion failure quarantines the store.
//! The name-only `put`/`get`/`has` remain for the custodian wire.

use super::secret_arena::{SecretArena, SecretArenaError, MAX_SECRET_ARENA_BYTES};
use super::secret_handle_table::{HandleError, HandleTable, Releasable, SecretHandle};

const MAX_NAME_BYTES: usize = 256;
const MAX_ENTRIES: usize = 64;

impl Releasable for SecretArena {
    fn release(&mut self) -> Result<(), ()> {
        if self.cleanup().is_err() || self.cleanup_failure_observed() {
            Err(())
        } else {
            Ok(())
        }
    }
}

pub(crate) struct SecretArenaStore {
    entries: HandleTable<SecretArena>,
    quarantined: bool,
    epoch: u64,
}

impl SecretArenaStore {
    /// Probe Linux secretmem with a tiny arena, then return an empty store.
    pub(crate) fn open() -> Result<Self, SecretArenaError> {
        let mut probe = SecretArena::reserve(16)?;
        probe.allocate_pages()?;
        probe.cleanup()?;
        Ok(Self {
            entries: HandleTable::new(),
            quarantined: false,
            epoch: 0,
        })
    }

    fn refuse_if_quarantined(&self) -> Result<(), SecretArenaError> {
        if self.quarantined {
            Err(SecretArenaError::CleanupFailed)
        } else {
            Ok(())
        }
    }

    fn valid_name(name: &str) -> bool {
        let bytes = name.as_bytes();
        !bytes.is_empty()
            && bytes.len() <= MAX_NAME_BYTES
            && bytes
                .iter()
                .all(|byte| byte.is_ascii_graphic() && *byte != b'\\')
    }

    pub(crate) fn put(&mut self, name: &str, bytes: &[u8]) -> Result<(), SecretArenaError> {
        self.put_handle(name, bytes).map(|_| ())
    }

    /// Store `bytes` under `name` and return the only handle that reaches
    /// them. Earlier handles for `name` become stale.
    pub(crate) fn put_handle(
        &mut self,
        name: &str,
        bytes: &[u8],
    ) -> Result<SecretHandle, SecretArenaError> {
        self.refuse_if_quarantined()?;
        if !Self::valid_name(name) {
            return Err(SecretArenaError::InvalidLength);
        }
        if bytes.is_empty() || bytes.len() > MAX_SECRET_ARENA_BYTES {
            return Err(SecretArenaError::InvalidLength);
        }
        if !self.entries.contains_name(name) && self.entries.len() >= MAX_ENTRIES {
            return Err(SecretArenaError::InvalidLength);
        }
        let mut arena = SecretArena::reserve(bytes.len())?;
        arena.allocate_pages()?;
        arena.with_bytes_mut(|dst| {
            dst.copy_from_slice(bytes);
        })?;
        let inserted = self.entries.insert(name, arena);
        inserted.map_err(|error| self.fail_closed(error))
    }

    /// Map a table refusal to the store's error, quarantining on any failure
    /// that leaves secret bytes unaccounted for or the counter exhausted.
    fn fail_closed(&mut self, error: HandleError) -> SecretArenaError {
        match error {
            HandleError::NotActive | HandleError::Stale => SecretArenaError::NotActive,
            HandleError::GenerationExhausted | HandleError::ReleaseFailed => {
                self.enter_quarantine();
                SecretArenaError::CleanupFailed
            }
        }
    }

    pub(crate) fn has(&self, name: &str) -> bool {
        !self.quarantined && self.entries.contains_name(name)
    }

    /// Copy plaintext out of secretmem for the caller's IPC/borrow window.
    /// The caller must zero the returned buffer on every exit (see ZeroOnDrop
    /// in the custodian). This copy is not a long-lived store.
    pub(crate) fn get(&mut self, name: &str) -> Result<Vec<u8>, SecretArenaError> {
        self.refuse_if_quarantined()?;
        let arena = self
            .entries
            .get_by_name_mut(name)
            .ok_or(SecretArenaError::NotActive)?;
        arena.with_bytes_mut(|src| src.to_vec())
    }

    /// Copy out through a handle. A stale or absent handle is `NotActive`;
    /// the same caller rules as `get` apply to the returned buffer.
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn get_by_handle(
        &mut self,
        handle: &SecretHandle,
    ) -> Result<Vec<u8>, SecretArenaError> {
        self.refuse_if_quarantined()?;
        match self.entries.get_mut(handle) {
            Ok(arena) => arena.with_bytes_mut(|src| src.to_vec()),
            Err(error) => Err(self.fail_closed(error)),
        }
    }

    /// Release (wipe, verify, unmap) the entry this handle names. A stale
    /// handle is refused and the live entry is not touched.
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn release(&mut self, handle: &SecretHandle) -> Result<(), SecretArenaError> {
        self.refuse_if_quarantined()?;
        self.entries
            .release(handle)
            .map_err(|error| self.fail_closed(error))
    }

    pub(crate) fn cleanup(&mut self) -> Result<(), SecretArenaError> {
        if self.entries.release_all().is_err() {
            self.enter_quarantine();
            Err(SecretArenaError::CleanupFailed)
        } else {
            Ok(())
        }
    }

    /// Test-only: an empty store that skips the secretmem probe, so failure
    /// paths that refuse before platform work run on any host (MEM-R15).
    #[cfg(test)]
    pub(crate) fn unopened_for_tests() -> Self {
        Self {
            entries: HandleTable::new(),
            quarantined: false,
            epoch: 0,
        }
    }

    #[cfg(test)]
    pub(crate) fn force_cleanup_failure(&mut self) {
        self.enter_quarantine();
        let _ = self.entries.release_all();
    }

    #[cfg(test)]
    pub(crate) fn set_next_generation_for_tests(&mut self, next: u64) {
        self.entries.set_next_generation_for_tests(next);
    }

    fn enter_quarantine(&mut self) {
        if !self.quarantined {
            self.quarantined = true;
            self.epoch = self.epoch.saturating_add(1);
        }
    }

    pub(crate) fn quarantined(&self) -> bool {
        self.quarantined
    }

    pub(crate) fn epoch(&self) -> u64 {
        self.epoch
    }
}

impl Drop for SecretArenaStore {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_name_and_empty_value_refuse_before_platform_work() {
        let mut store = SecretArenaStore {
            entries: HandleTable::new(),
            quarantined: false,
            epoch: 0,
        };
        assert_eq!(store.put("", b"ab"), Err(SecretArenaError::InvalidLength));
        assert_eq!(store.put("ok", b""), Err(SecretArenaError::InvalidLength));
        assert!(!store.has("ok"));
    }

    #[test]
    fn forced_cleanup_failure_quarantines_and_refuses_later_use() {
        let mut store = SecretArenaStore {
            entries: HandleTable::new(),
            quarantined: false,
            epoch: 0,
        };
        store.force_cleanup_failure();
        assert!(store.quarantined());
        assert_eq!(store.epoch(), 1);
        assert!(!store.has("any"));
        assert_eq!(store.get("any"), Err(SecretArenaError::CleanupFailed));
        assert_eq!(store.put("any", b"ab"), Err(SecretArenaError::CleanupFailed));
        store.force_cleanup_failure();
        assert_eq!(store.epoch(), 1);
    }

    #[test]
    fn double_cleanup_of_an_empty_store_is_safe() {
        let mut store = SecretArenaStore {
            entries: HandleTable::new(),
            quarantined: false,
            epoch: 0,
        };
        assert_eq!(store.cleanup(), Ok(()));
        assert_eq!(store.cleanup(), Ok(()));
        assert!(!store.quarantined());
    }

    #[test]
    fn use_after_cleanup_refuses() {
        let mut store = SecretArenaStore {
            entries: HandleTable::new(),
            quarantined: false,
            epoch: 0,
        };
        assert_eq!(store.cleanup(), Ok(()));
        assert!(!store.has("k"));
        assert_eq!(store.get("k"), Err(SecretArenaError::NotActive));
    }

    #[test]
    fn unknown_or_forged_handle_refuses_before_platform_work() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let forged = SecretHandle::forged_for_tests("k", 1);
        assert_eq!(store.get_by_handle(&forged), Err(SecretArenaError::NotActive));
        assert_eq!(store.release(&forged), Err(SecretArenaError::NotActive));
        assert!(!store.quarantined(), "a refused handle is not a store failure");
    }

    #[test]
    fn quarantined_store_refuses_handle_use() {
        let mut store = SecretArenaStore::unopened_for_tests();
        store.force_cleanup_failure();
        let forged = SecretHandle::forged_for_tests("k", 1);
        assert_eq!(store.get_by_handle(&forged), Err(SecretArenaError::CleanupFailed));
        assert_eq!(store.release(&forged), Err(SecretArenaError::CleanupFailed));
        assert_eq!(store.put_handle("k", b"ab"), Err(SecretArenaError::CleanupFailed));
    }

    #[test]
    fn table_failures_map_to_fail_closed_store_errors() {
        let mut store = SecretArenaStore::unopened_for_tests();
        assert_eq!(store.fail_closed(HandleError::Stale), SecretArenaError::NotActive);
        assert_eq!(store.fail_closed(HandleError::NotActive), SecretArenaError::NotActive);
        assert!(!store.quarantined());
        assert_eq!(
            store.fail_closed(HandleError::GenerationExhausted),
            SecretArenaError::CleanupFailed
        );
        assert!(store.quarantined());
        assert_eq!(store.epoch(), 1);
        let mut store = SecretArenaStore::unopened_for_tests();
        assert_eq!(store.fail_closed(HandleError::ReleaseFailed), SecretArenaError::CleanupFailed);
        assert!(store.quarantined());
    }

    #[cfg(all(
        target_os = "linux",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    #[test]
    #[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
    fn live_handle_reuse_after_release_and_reput_is_refused() {
        let mut store = SecretArenaStore::open().expect("linux secretmem");
        let old = store.put_handle("k", b"first").expect("put");
        assert_eq!(store.get_by_handle(&old).expect("get"), b"first");
        store.release(&old).expect("release");
        assert!(!store.has("k"));
        assert_eq!(store.get_by_handle(&old), Err(SecretArenaError::NotActive));
        let new = store.put_handle("k", b"second").expect("re-put");
        assert_eq!(store.get_by_handle(&old), Err(SecretArenaError::NotActive));
        assert_eq!(store.release(&old), Err(SecretArenaError::NotActive));
        assert_eq!(store.get_by_handle(&new).expect("get new"), b"second");
        let newer = store.put_handle("k", b"third").expect("replace");
        assert_eq!(store.get_by_handle(&new), Err(SecretArenaError::NotActive));
        assert_eq!(store.get_by_handle(&newer).expect("get newer"), b"third");
        assert!(!store.quarantined());
        store.cleanup().expect("cleanup");
        assert_eq!(store.get_by_handle(&newer), Err(SecretArenaError::NotActive));
    }

    #[cfg(all(
        target_os = "linux",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    #[test]
    #[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
    fn live_generation_exhaustion_quarantines_the_store() {
        let mut store = SecretArenaStore::open().expect("linux secretmem");
        store.set_next_generation_for_tests(u64::MAX);
        assert_eq!(store.put_handle("k", b"x"), Err(SecretArenaError::CleanupFailed));
        assert!(store.quarantined());
        assert!(!store.has("k"));
    }

    #[cfg(all(
        target_os = "linux",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    #[test]
    #[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
    fn live_put_get_cleanup_and_use_after_cleanup() {
        let mut store = SecretArenaStore::open().expect("linux secretmem");
        store.put("k", b"xyz").expect("put");
        assert!(store.has("k"));
        let got = store.get("k").expect("get");
        assert_eq!(&got, b"xyz");
        store.cleanup().expect("cleanup");
        assert!(!store.has("k"));
        assert_eq!(store.get("k"), Err(SecretArenaError::NotActive));
        store.cleanup().expect("double cleanup");
    }
}
