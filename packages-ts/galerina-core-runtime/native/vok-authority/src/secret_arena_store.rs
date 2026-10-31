//! In-crate named store over `SecretArena`. The JS runtime never sees this type.
//! Bytes at rest live only in Linux secretmem. `get` copies out for a borrow window.

use std::collections::BTreeMap;

use super::secret_arena::{SecretArena, SecretArenaError, MAX_SECRET_ARENA_BYTES};

const MAX_NAME_BYTES: usize = 256;
const MAX_ENTRIES: usize = 64;

pub(crate) struct SecretArenaStore {
    entries: BTreeMap<String, SecretArena>,
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
            entries: BTreeMap::new(),
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
        self.refuse_if_quarantined()?;
        if !Self::valid_name(name) {
            return Err(SecretArenaError::InvalidLength);
        }
        if bytes.is_empty() || bytes.len() > MAX_SECRET_ARENA_BYTES {
            return Err(SecretArenaError::InvalidLength);
        }
        if !self.entries.contains_key(name) && self.entries.len() >= MAX_ENTRIES {
            return Err(SecretArenaError::InvalidLength);
        }
        let mut arena = SecretArena::reserve(bytes.len())?;
        arena.allocate_pages()?;
        arena.with_bytes_mut(|dst| {
            dst.copy_from_slice(bytes);
        })?;
        if let Some(mut previous) = self.entries.insert(name.to_owned(), arena) {
            let _ = previous.cleanup();
        }
        Ok(())
    }

    pub(crate) fn has(&self, name: &str) -> bool {
        !self.quarantined && self.entries.contains_key(name)
    }

    /// Copy plaintext out of secretmem for the caller's IPC/borrow window.
    /// The caller must zero the returned buffer on every exit (see ZeroOnDrop
    /// in the custodian). This copy is not a long-lived store.
    pub(crate) fn get(&mut self, name: &str) -> Result<Vec<u8>, SecretArenaError> {
        self.refuse_if_quarantined()?;
        let arena = self
            .entries
            .get_mut(name)
            .ok_or(SecretArenaError::NotActive)?;
        arena.with_bytes_mut(|src| src.to_vec())
    }

    pub(crate) fn cleanup(&mut self) -> Result<(), SecretArenaError> {
        let mut failed = false;
        for arena in self.entries.values_mut() {
            if arena.cleanup().is_err() || arena.cleanup_failure_observed() {
                failed = true;
            }
        }
        self.entries.clear();
        if failed {
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
            entries: BTreeMap::new(),
            quarantined: false,
            epoch: 0,
        }
    }

    #[cfg(test)]
    pub(crate) fn force_cleanup_failure(&mut self) {
        self.enter_quarantine();
        for arena in self.entries.values_mut() {
            let _ = arena.cleanup();
        }
        self.entries.clear();
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
            entries: BTreeMap::new(),
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
            entries: BTreeMap::new(),
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
            entries: BTreeMap::new(),
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
            entries: BTreeMap::new(),
            quarantined: false,
            epoch: 0,
        };
        assert_eq!(store.cleanup(), Ok(()));
        assert!(!store.has("k"));
        assert_eq!(store.get("k"), Err(SecretArenaError::NotActive));
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
