//! MEM-R24 (gap map 2.5 and H8): generation-checked handles for named secret
//! entries.
//!
//! Before this table the store keyed entries by name alone, so a caller that
//! kept a name across a release and a re-put silently read the new secret.
//! Every insert now takes a fresh generation from one store-wide counter, and
//! a handle only reaches the entry whose generation it carries. A handle from
//! before a release or a replacement is stale and is refused without touching
//! the live entry. Generations are never reused: the counter is checked and
//! the table refuses new inserts once it would wrap.

// The handle-addressed calls (get_mut, release) have no custodian wire op
// yet; the store exposes them in-crate and tests pin them. Until OP_RELEASE
// lands, a non-test build only uses the name-addressed path.
#![cfg_attr(not(test), allow(dead_code))]

use std::collections::BTreeMap;

/// A value that must be released (wiped and unmapped) exactly once.
pub(crate) trait Releasable {
    /// Release the value. `Err` means the release was not observed to
    /// complete and the owner must fail closed.
    fn release(&mut self) -> Result<(), ()>;
}

/// A name plus the generation it was issued under. Handles carry no secret
/// material and no address.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SecretHandle {
    name: String,
    generation: u64,
}

impl SecretHandle {
    pub(crate) fn name(&self) -> &str {
        &self.name
    }

    pub(crate) fn generation(&self) -> u64 {
        self.generation
    }

    #[cfg(test)]
    pub(crate) fn forged_for_tests(name: &str, generation: u64) -> Self {
        Self {
            name: name.to_owned(),
            generation,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum HandleError {
    /// No live entry under this name.
    NotActive,
    /// A live entry exists under this name but was issued under a different
    /// generation: the handle outlived a release or a replacement.
    Stale,
    /// The generation counter would wrap; no further inserts are possible.
    GenerationExhausted,
    /// An entry was removed but its release was not observed to complete.
    ReleaseFailed,
}

struct Slot<T> {
    generation: u64,
    value: T,
}

pub(crate) struct HandleTable<T: Releasable> {
    slots: BTreeMap<String, Slot<T>>,
    next_generation: u64,
}

impl<T: Releasable> HandleTable<T> {
    pub(crate) fn new() -> Self {
        Self {
            slots: BTreeMap::new(),
            // Generation 0 is never issued, so a zeroed handle is always stale.
            next_generation: 1,
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.slots.len()
    }

    pub(crate) fn contains_name(&self, name: &str) -> bool {
        self.slots.contains_key(name)
    }

    fn take_generation(&mut self) -> Result<u64, HandleError> {
        let generation = self.next_generation;
        self.next_generation = generation
            .checked_add(1)
            .ok_or(HandleError::GenerationExhausted)?;
        Ok(generation)
    }

    /// Insert under `name` with a fresh generation. A previous entry under the
    /// same name is released; its handles become stale either way, and a
    /// failed release of it is reported as `ReleaseFailed` after the new entry
    /// is in place so the owner can fail closed.
    pub(crate) fn insert(&mut self, name: &str, value: T) -> Result<SecretHandle, HandleError> {
        let generation = match self.take_generation() {
            Ok(generation) => generation,
            Err(error) => {
                let mut value = value;
                let _ = value.release();
                return Err(error);
            }
        };
        let previous = self.slots.insert(name.to_owned(), Slot { generation, value });
        let handle = SecretHandle {
            name: name.to_owned(),
            generation,
        };
        if let Some(mut previous) = previous {
            if previous.value.release().is_err() {
                return Err(HandleError::ReleaseFailed);
            }
        }
        Ok(handle)
    }

    fn check(&self, handle: &SecretHandle) -> Result<(), HandleError> {
        match self.slots.get(&handle.name) {
            None => Err(HandleError::NotActive),
            Some(slot) if slot.generation != handle.generation => Err(HandleError::Stale),
            Some(_) => Ok(()),
        }
    }

    pub(crate) fn get_mut(&mut self, handle: &SecretHandle) -> Result<&mut T, HandleError> {
        self.check(handle)?;
        match self.slots.get_mut(&handle.name) {
            Some(slot) => Ok(&mut slot.value),
            None => Err(HandleError::NotActive),
        }
    }

    /// Name-only lookup for the legacy custodian wire, which addresses entries
    /// by name. Callers that hold a handle use `get_mut`.
    pub(crate) fn get_by_name_mut(&mut self, name: &str) -> Option<&mut T> {
        self.slots.get_mut(name).map(|slot| &mut slot.value)
    }

    /// Release the entry this handle names. A stale or absent handle is
    /// refused and the live entry, if any, is left untouched.
    pub(crate) fn release(&mut self, handle: &SecretHandle) -> Result<(), HandleError> {
        self.check(handle)?;
        let Some(mut slot) = self.slots.remove(&handle.name) else {
            return Err(HandleError::NotActive);
        };
        slot.value.release().map_err(|_| HandleError::ReleaseFailed)
    }

    /// Release every entry. Returns `Err(ReleaseFailed)` if any release was
    /// not observed to complete; every entry is removed regardless.
    pub(crate) fn release_all(&mut self) -> Result<(), HandleError> {
        let mut failed = false;
        for (_, mut slot) in std::mem::take(&mut self.slots) {
            if slot.value.release().is_err() {
                failed = true;
            }
        }
        if failed {
            Err(HandleError::ReleaseFailed)
        } else {
            Ok(())
        }
    }

    #[cfg(test)]
    pub(crate) fn set_next_generation_for_tests(&mut self, next: u64) {
        self.next_generation = next;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    /// Records every release so tests can prove which entry was released.
    struct Probe {
        id: u32,
        fail_release: bool,
        log: Rc<RefCell<Vec<u32>>>,
    }

    impl Releasable for Probe {
        fn release(&mut self) -> Result<(), ()> {
            self.log.borrow_mut().push(self.id);
            if self.fail_release {
                Err(())
            } else {
                Ok(())
            }
        }
    }

    fn probe(id: u32, log: &Rc<RefCell<Vec<u32>>>) -> Probe {
        Probe {
            id,
            fail_release: false,
            log: Rc::clone(log),
        }
    }

    fn failing(id: u32, log: &Rc<RefCell<Vec<u32>>>) -> Probe {
        Probe {
            id,
            fail_release: true,
            log: Rc::clone(log),
        }
    }

    #[test]
    fn fresh_handle_reaches_its_entry() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let handle = table.insert("k", probe(1, &log)).unwrap();
        assert_eq!(handle.name(), "k");
        assert_eq!(handle.generation(), 1);
        assert_eq!(table.get_mut(&handle).unwrap().id, 1);
    }

    #[test]
    fn handle_reuse_after_release_and_reput_is_refused_as_stale() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let old = table.insert("k", probe(1, &log)).unwrap();
        table.release(&old).unwrap();
        let new = table.insert("k", probe(2, &log)).unwrap();
        assert_ne!(old.generation(), new.generation());
        assert_eq!(table.get_mut(&old).err(), Some(HandleError::Stale));
        assert_eq!(table.get_mut(&new).unwrap().id, 2);
    }

    #[test]
    fn handle_after_release_without_reput_is_not_active() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let handle = table.insert("k", probe(1, &log)).unwrap();
        table.release(&handle).unwrap();
        assert_eq!(table.get_mut(&handle).err(), Some(HandleError::NotActive));
        assert_eq!(table.release(&handle), Err(HandleError::NotActive));
        assert_eq!(*log.borrow(), vec![1], "double release must not release twice");
    }

    #[test]
    fn replacement_releases_previous_and_stales_its_handle() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let old = table.insert("k", probe(1, &log)).unwrap();
        let new = table.insert("k", probe(2, &log)).unwrap();
        assert_eq!(*log.borrow(), vec![1]);
        assert_eq!(table.len(), 1);
        assert_eq!(table.get_mut(&old).err(), Some(HandleError::Stale));
        assert_eq!(table.get_mut(&new).unwrap().id, 2);
    }

    #[test]
    fn stale_release_leaves_the_live_entry_untouched() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let old = table.insert("k", probe(1, &log)).unwrap();
        let new = table.insert("k", probe(2, &log)).unwrap();
        assert_eq!(table.release(&old), Err(HandleError::Stale));
        assert_eq!(*log.borrow(), vec![1], "only the replaced entry was released");
        assert!(table.contains_name("k"));
        assert_eq!(table.get_mut(&new).unwrap().id, 2);
    }

    #[test]
    fn generations_are_store_wide_and_never_repeat_across_names() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let mut seen = Vec::new();
        for round in 0..5_u32 {
            for name in ["a", "b", "c"] {
                let handle = table.insert(name, probe(round, &log)).unwrap();
                assert!(!seen.contains(&handle.generation()));
                seen.push(handle.generation());
            }
        }
        assert_eq!(seen.len(), 15);
        assert!(seen.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn generation_zero_is_never_issued_so_a_zeroed_handle_is_refused() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let _live = table.insert("k", probe(1, &log)).unwrap();
        let zeroed = SecretHandle::forged_for_tests("k", 0);
        assert_eq!(table.get_mut(&zeroed).err(), Some(HandleError::Stale));
    }

    #[test]
    fn forged_future_generation_is_refused() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let live = table.insert("k", probe(1, &log)).unwrap();
        let future = SecretHandle::forged_for_tests("k", live.generation() + 1);
        assert_eq!(table.get_mut(&future).err(), Some(HandleError::Stale));
        assert_eq!(table.release(&future), Err(HandleError::Stale));
        assert!(log.borrow().is_empty());
    }

    #[test]
    fn handle_for_another_name_does_not_cross_over() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let a = table.insert("a", probe(1, &log)).unwrap();
        let _b = table.insert("b", probe(2, &log)).unwrap();
        let crossed = SecretHandle::forged_for_tests("b", a.generation());
        assert_eq!(table.get_mut(&crossed).err(), Some(HandleError::Stale));
    }

    #[test]
    fn generation_exhaustion_refuses_insert_and_releases_the_rejected_value() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        table.set_next_generation_for_tests(u64::MAX - 1);
        let last = table.insert("k", probe(1, &log)).unwrap();
        assert_eq!(last.generation(), u64::MAX - 1);
        assert_eq!(table.insert("j", probe(2, &log)).err(), Some(HandleError::GenerationExhausted));
        assert_eq!(table.insert("j", probe(3, &log)).err(), Some(HandleError::GenerationExhausted));
        assert!(!table.contains_name("j"));
        assert_eq!(*log.borrow(), vec![2, 3], "refused values are released, not leaked");
        assert_eq!(table.get_mut(&last).unwrap().id, 1);
    }

    #[test]
    fn failed_release_on_replacement_is_reported() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let _old = table.insert("k", failing(1, &log)).unwrap();
        assert_eq!(table.insert("k", probe(2, &log)).err(), Some(HandleError::ReleaseFailed));
        assert_eq!(table.get_by_name_mut("k").unwrap().id, 2);
    }

    #[test]
    fn failed_release_removes_the_entry_and_reports() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let handle = table.insert("k", failing(1, &log)).unwrap();
        assert_eq!(table.release(&handle), Err(HandleError::ReleaseFailed));
        assert!(!table.contains_name("k"));
        assert_eq!(table.get_mut(&handle).err(), Some(HandleError::NotActive));
    }

    #[test]
    fn release_all_releases_every_entry_and_reports_any_failure() {
        let log = Rc::default();
        let mut table = HandleTable::new();
        let a = table.insert("a", probe(1, &log)).unwrap();
        table.insert("b", failing(2, &log)).unwrap();
        table.insert("c", probe(3, &log)).unwrap();
        assert_eq!(table.release_all(), Err(HandleError::ReleaseFailed));
        assert_eq!(table.len(), 0);
        let mut released = log.borrow().clone();
        released.sort();
        assert_eq!(released, vec![1, 2, 3]);
        assert_eq!(table.get_mut(&a).err(), Some(HandleError::NotActive));
        assert_eq!(table.release_all(), Ok(()));
    }

    #[test]
    fn handle_debug_text_carries_only_name_and_generation() {
        let handle = SecretHandle::forged_for_tests("k", 7);
        assert_eq!(format!("{handle:?}"), "SecretHandle { name: \"k\", generation: 7 }");
    }
}
