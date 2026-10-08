//! Opaque Galerina VM / component-resource transfer into the bounded native floor.
//!
//! Handles carry kind + table/slot/generation/nonce only. No native pointer, path,
//! JSON decoder or machine-code field exists on this surface.

use crate::{
    AuthorityContext, AuthorityTable, LeaseHandle, NonceSource, Trit, VokExecutionReceipt,
    VokFailure,
};
use std::fmt;
use std::marker::PhantomData;
use std::rc::Rc;

pub const MAX_RESOURCES_PER_LEASE: usize = 16;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum VmResourceKind {
    Function = 1,
    Memory = 2,
    Table = 3,
    ComponentInstance = 4,
    ComponentResource = 5,
}

impl TryFrom<u8> for VmResourceKind {
    type Error = VokFailure;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Function),
            2 => Ok(Self::Memory),
            3 => Ok(Self::Table),
            4 => Ok(Self::ComponentInstance),
            5 => Ok(Self::ComponentResource),
            _ => Err(VokFailure::new(Trit::Refuse, "VOK_RESOURCE_KIND_INVALID")),
        }
    }
}

impl VmResourceKind {
    #[must_use]
    pub const fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Opaque, flow-local authority over one VM/component resource.
///
/// ```compile_fail
/// use galerina_vok_authority::VmResourceHandle;
/// let handle = VmResourceHandle {
///     table_nonce: [1; 16],
///     slot: 0,
///     generation: 0,
///     resource_nonce: [2; 16],
///     kind: galerina_vok_authority::VmResourceKind::Function,
///     thread_marker: Default::default(),
/// };
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::VmResourceHandle;
/// fn require_clone<T: Clone>() {}
/// require_clone::<VmResourceHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::VmResourceHandle;
/// fn require_copy<T: Copy>() {}
/// require_copy::<VmResourceHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::VmResourceHandle;
/// fn require_send<T: Send>() {}
/// require_send::<VmResourceHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::VmResourceHandle;
/// fn require_sync<T: Sync>() {}
/// require_sync::<VmResourceHandle>();
/// ```
#[must_use = "dropping a VM resource handle releases no native mapping"]
pub struct VmResourceHandle {
    pub(crate) table_nonce: [u8; 16],
    pub(crate) slot: usize,
    pub(crate) generation: u64,
    pub(crate) resource_nonce: [u8; 16],
    pub(crate) kind: VmResourceKind,
    pub(crate) thread_marker: PhantomData<Rc<()>>,
}

impl fmt::Debug for VmResourceHandle {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("VmResourceHandle(REDACTED)")
    }
}

impl Drop for VmResourceHandle {
    fn drop(&mut self) {
        self.table_nonce.fill(0);
        self.slot = usize::MAX;
        self.generation = u64::MAX;
        self.resource_nonce.fill(0);
    }
}

pub(crate) struct ResourceEntry {
    pub(crate) kind: VmResourceKind,
    pub(crate) resource_nonce: [u8; 16],
}

impl ResourceEntry {
    pub(crate) fn clear(&mut self) {
        self.resource_nonce.fill(0);
        self.kind = VmResourceKind::Function;
    }
}

pub(crate) struct ResourceSlot {
    pub(crate) generation: u64,
    pub(crate) entry: Option<ResourceEntry>,
    pub(crate) retired: bool,
}

impl ResourceSlot {
    pub(crate) fn fresh() -> Self {
        Self {
            generation: 0,
            entry: None,
            retired: false,
        }
    }
}

impl<N: NonceSource> AuthorityTable<N> {
    /// Admit one opaque VM/component resource. Callers supply a closed kind, never
    /// a pointer, path or machine image.
    pub fn admit_vm_resource(
        &mut self,
        kind: VmResourceKind,
        current_context: &AuthorityContext,
    ) -> Result<VmResourceHandle, VokFailure> {
        if current_context != &self.current_context {
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }
        let slot_index = self
            .free_resources
            .last()
            .copied()
            .ok_or_else(|| VokFailure::new(Trit::Unknown, "VOK_RESOURCE_CAPACITY_EXHAUSTED"))?;
        match self.resource_slots.get(slot_index) {
            Some(slot) if slot.entry.is_none() && !slot.retired => {}
            _ => return Err(VokFailure::new(Trit::Refuse, "VOK_TABLE_INVARIANT")),
        }
        let resource_nonce = self.next_unique_nonce()?;
        let popped = self.free_resources.pop();
        if popped != Some(slot_index) {
            return Err(VokFailure::new(Trit::Refuse, "VOK_TABLE_INVARIANT"));
        }
        let slot = self
            .resource_slots
            .get_mut(slot_index)
            .expect("the private resource free-list contains only constructed slots");
        let handle = VmResourceHandle {
            table_nonce: self.table_nonce,
            slot: slot_index,
            generation: slot.generation,
            resource_nonce,
            kind,
            thread_marker: PhantomData,
        };
        slot.entry = Some(ResourceEntry {
            kind,
            resource_nonce,
        });
        self.live_resources += 1;
        Ok(handle)
    }

    pub fn release_vm_resource(&mut self, handle: VmResourceHandle) -> Result<(), VokFailure> {
        let slot_index = self.validate_resource_handle(&handle)?;
        self.clear_resource_slot(slot_index);
        Ok(())
    }

    /// Consume validated opaque resources, then execute the bounded W^X object.
    /// Resource identity never becomes machine code; the executed value is still
    /// the closed return-u64 profile.
    pub fn execute_lease_with_resources(
        &mut self,
        lease: LeaseHandle,
        current_context: &AuthorityContext,
        resources: Vec<VmResourceHandle>,
    ) -> Result<VokExecutionReceipt, VokFailure> {
        if resources.len() > MAX_RESOURCES_PER_LEASE {
            return Err(VokFailure::new(Trit::Refuse, "VOK_RESOURCE_BUDGET"));
        }
        let mut slot_indices = Vec::with_capacity(resources.len());
        for handle in &resources {
            slot_indices.push(self.validate_resource_handle(handle)?);
        }
        let mut seen = BTreeSetLite::new();
        for slot_index in &slot_indices {
            if !seen.insert(*slot_index) {
                return Err(VokFailure::new(Trit::Refuse, "VOK_RESOURCE_DUPLICATE"));
            }
        }
        for slot_index in slot_indices {
            self.clear_resource_slot(slot_index);
        }
        let mut receipt = self.execute_lease(lease, current_context)?;
        receipt.transferred_resource_count = resources.len();
        Ok(receipt)
    }

    fn validate_resource_handle(&self, handle: &VmResourceHandle) -> Result<usize, VokFailure> {
        if handle.table_nonce != self.table_nonce {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_RESOURCE_HANDLE_MISMATCH",
            ));
        }
        let Some(slot) = self.resource_slots.get(handle.slot) else {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_RESOURCE_HANDLE_MISMATCH",
            ));
        };
        let Some(entry) = slot.entry.as_ref() else {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_RESOURCE_HANDLE_MISMATCH",
            ));
        };
        if slot.retired
            || handle.generation != slot.generation
            || handle.resource_nonce != entry.resource_nonce
            || handle.kind != entry.kind
        {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_RESOURCE_HANDLE_MISMATCH",
            ));
        }
        Ok(handle.slot)
    }

    pub(crate) fn clear_resource_slot(&mut self, slot_index: usize) {
        let Some(slot) = self.resource_slots.get_mut(slot_index) else {
            return;
        };
        let was_live = slot.entry.is_some();
        if let Some(entry) = &mut slot.entry {
            entry.clear();
        }
        slot.entry = None;
        if was_live {
            self.live_resources = self.live_resources.saturating_sub(1);
        }
        match slot.generation.checked_add(1) {
            Some(generation) => {
                slot.generation = generation;
                if !slot.retired && !self.free_resources.contains(&slot_index) {
                    self.free_resources.push(slot_index);
                }
            }
            None => {
                slot.retired = true;
                self.free_resources.retain(|index| *index != slot_index);
            }
        }
    }
}

/// Tiny insertion set so this module stays dependency-free.
struct BTreeSetLite {
    values: Vec<usize>,
}

impl BTreeSetLite {
    fn new() -> Self {
        Self { values: Vec::new() }
    }

    fn insert(&mut self, value: usize) -> bool {
        if self.values.contains(&value) {
            return false;
        }
        self.values.push(value);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{context, return_u64_request, table_with_nonces};

    fn nonces(count: u8) -> Vec<[u8; 16]> {
        (1..=count).map(|value| [value; 16]).collect()
    }

    #[test]
    fn closed_kinds_only() {
        assert!(VmResourceKind::try_from(0).is_err());
        assert!(VmResourceKind::try_from(6).is_err());
        assert_eq!(VmResourceKind::try_from(1).expect("function").as_u8(), 1);
    }

    #[test]
    fn opaque_resource_debug_is_redacted() {
        let handle = VmResourceHandle {
            table_nonce: [0x11; 16],
            slot: 3,
            generation: 9,
            resource_nonce: [0x22; 16],
            kind: VmResourceKind::Memory,
            thread_marker: PhantomData,
        };
        assert_eq!(format!("{handle:?}"), "VmResourceHandle(REDACTED)");
    }

    #[test]
    fn admit_and_release_is_affine() {
        let mut table = table_with_nonces(2, nonces(4));
        let handle = table
            .admit_vm_resource(VmResourceKind::Function, &context(7, 3, 5))
            .expect("resource must admit");
        table
            .release_vm_resource(handle)
            .expect("live resource must release");
    }

    #[test]
    fn forged_and_stale_resource_handles_refuse() {
        let mut table = table_with_nonces(2, nonces(6));
        let handle = table
            .admit_vm_resource(VmResourceKind::Table, &context(7, 3, 5))
            .expect("resource must admit");
        let forged = VmResourceHandle {
            table_nonce: handle.table_nonce,
            slot: handle.slot,
            generation: handle.generation,
            resource_nonce: handle.resource_nonce,
            kind: handle.kind,
            thread_marker: PhantomData,
        };
        table
            .release_vm_resource(handle)
            .expect("original must release");
        let error = table
            .release_vm_resource(forged)
            .expect_err("stale duplicate must refuse");
        assert_eq!(error.failure_id(), "VOK_RESOURCE_HANDLE_MISMATCH");
    }

    #[test]
    fn foreign_table_resource_refuses() {
        let mut first = table_with_nonces(1, nonces(3));
        let mut second = table_with_nonces(1, [[9; 16], [10; 16], [11; 16]]);
        let handle = first
            .admit_vm_resource(VmResourceKind::Memory, &context(7, 3, 5))
            .expect("first table resource");
        let error = second
            .release_vm_resource(handle)
            .expect_err("foreign table must refuse");
        assert_eq!(error.failure_id(), "VOK_RESOURCE_HANDLE_MISMATCH");
    }

    #[test]
    fn transferred_resources_do_not_change_executed_value() {
        let mut table = table_with_nonces(2, nonces(8));
        let admitted = table
            .mint_admitted(return_u64_request(0x1111_2222_3333_4444))
            .expect("object");
        let lease = table
            .open_lease(admitted, &context(7, 3, 5))
            .expect("lease");
        let resource = table
            .admit_vm_resource(VmResourceKind::ComponentInstance, &context(7, 3, 5))
            .expect("resource");
        let receipt = table
            .execute_lease_with_resources(lease, &context(7, 3, 5), vec![resource])
            .expect("bounded execute with opaque transfer");
        assert_eq!(receipt.value(), 0x1111_2222_3333_4444);
        assert_eq!(receipt.transferred_resource_count(), 1);
        assert!(receipt.executable_at_call());
        assert!(!receipt.writable_at_call());
        assert!(!receipt.authority_released());
    }

    #[test]
    fn resource_budget_refuses_before_execution_and_keeps_the_lease() {
        let mut table = table_with_nonces(1, nonces(8));
        let admitted = table.mint_admitted(return_u64_request(7)).expect("object");
        let lease = table
            .open_lease(admitted, &context(7, 3, 5))
            .expect("lease");
        let extras = (0..=MAX_RESOURCES_PER_LEASE)
            .map(|_| VmResourceHandle {
                table_nonce: [1; 16],
                slot: 0,
                generation: 0,
                resource_nonce: [2; 16],
                kind: VmResourceKind::Function,
                thread_marker: PhantomData,
            })
            .collect();
        let error = table
            .execute_lease_with_resources(lease, &context(7, 3, 5), extras)
            .expect_err("over-budget must refuse before native execute");
        assert_eq!(error.failure_id(), "VOK_RESOURCE_BUDGET");
    }
}
