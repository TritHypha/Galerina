#![deny(unsafe_code)]

use std::collections::BTreeSet;
use std::fmt;
use std::marker::PhantomData;
use std::rc::Rc;

#[allow(unsafe_code)]
mod native;
#[allow(unsafe_code)]
mod secret_arena;

pub use secret_arena::{
    MemoryStatus, RuntimeErrorCode, SecretArena, SecretArenaError, ERR_SECRET_ARENA_CLEANUP_FAILED,
    ERR_SECRET_ARENA_CREATE_REFUSED, ERR_SECRET_ARENA_INVALID_LENGTH, ERR_SECRET_ARENA_MAP_REFUSED,
    ERR_SECRET_ARENA_NOT_ACTIVE, ERR_SECRET_ARENA_NOT_ALLOCATED,
    ERR_SECRET_ARENA_PAGE_SIZE_REFUSED, ERR_SECRET_ARENA_RESIZE_REFUSED,
    ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
};

pub const MAX_AUTHORITY_TAG_BYTES: usize = 96;
pub const MAX_TABLE_CAPACITY: usize = 65_536;
pub const MAX_OBJECT_BYTES_LIMIT: usize = 64 * 1024 * 1024;
pub const MAX_NONCE_HISTORY: usize = 262_145;
pub const RETURN_U64_OBJECT_BYTES: usize = native::OBJECT_BYTES;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(i8)]
pub enum Trit {
    Refuse = -1,
    Unknown = 0,
    Admit = 1,
}

impl TryFrom<i32> for Trit {
    type Error = VokFailure;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            -1 => Ok(Self::Refuse),
            0 => Ok(Self::Unknown),
            1 => Ok(Self::Admit),
            _ => Err(VokFailure::new(Self::Refuse, "VOK_TRIT_INVALID")),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VokFailure {
    outcome: Trit,
    failure_id: &'static str,
}

impl VokFailure {
    #[must_use]
    pub const fn new(outcome: Trit, failure_id: &'static str) -> Self {
        Self {
            outcome,
            failure_id,
        }
    }

    #[must_use]
    pub const fn outcome(&self) -> Trit {
        self.outcome
    }

    #[must_use]
    pub const fn failure_id(&self) -> &'static str {
        self.failure_id
    }
}

impl fmt::Display for VokFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.failure_id)
    }
}

impl std::error::Error for VokFailure {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NonceFailure {
    failure_id: &'static str,
}

impl NonceFailure {
    #[must_use]
    pub const fn new(failure_id: &'static str) -> Self {
        Self { failure_id }
    }

    #[must_use]
    pub const fn outcome(&self) -> Trit {
        Trit::Refuse
    }

    #[must_use]
    pub const fn failure_id(&self) -> &'static str {
        self.failure_id
    }
}

impl fmt::Display for NonceFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.failure_id)
    }
}

impl std::error::Error for NonceFailure {}

pub trait NonceSource {
    fn next_nonce(&mut self) -> Result<[u8; 16], NonceFailure>;
}

/// Production nonce source backed by the supported host operating system.
///
/// The source has no deterministic fallback. An unavailable or malformed OS
/// result refuses table construction or the current affine transition.
#[derive(Clone, Copy, Debug, Default)]
pub struct OsNonceSource;

impl NonceSource for OsNonceSource {
    fn next_nonce(&mut self) -> Result<[u8; 16], NonceFailure> {
        native::os_random_16().map_err(|error| NonceFailure::new(error.failure_id()))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorityTag(String);

impl AuthorityTag {
    pub fn parse(value: &str) -> Result<Self, VokFailure> {
        if value.len() > MAX_AUTHORITY_TAG_BYTES {
            return Err(VokFailure::new(Trit::Refuse, "VOK_TAG_TOO_LARGE"));
        }

        let valid = !value.is_empty()
            && value.split('.').all(|segment| {
                let mut bytes = segment.bytes();
                matches!(bytes.next(), Some(b'a'..=b'z'))
                    && bytes.all(|byte| {
                        byte.is_ascii_lowercase()
                            || byte.is_ascii_digit()
                            || matches!(byte, b'-' | b'_')
                    })
            });
        if !valid {
            return Err(VokFailure::new(Trit::Refuse, "VOK_TAG_INVALID"));
        }

        Ok(Self(value.to_owned()))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorityContext {
    target_digest: [u8; 32],
    policy_digest: [u8; 32],
    verifier_digest: [u8; 32],
    policy_epoch: u64,
    revocation_epoch: u64,
}

pub struct MintRequest {
    tag: AuthorityTag,
    context: AuthorityContext,
    gates: [Trit; 8],
    bytes: Vec<u8>,
}

impl fmt::Debug for MintRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MintRequest")
            .field("tag", &self.tag)
            .field("context", &self.context)
            .field("gates", &self.gates)
            .field("bytes", &"REDACTED")
            .finish()
    }
}

impl Drop for MintRequest {
    fn drop(&mut self) {
        self.bytes.fill(0);
        self.bytes.clear();
    }
}

impl MintRequest {
    #[must_use]
    pub fn new(
        tag: AuthorityTag,
        context: AuthorityContext,
        gates: [Trit; 8],
        bytes: Vec<u8>,
    ) -> Self {
        Self {
            tag,
            context,
            gates,
            bytes,
        }
    }

    /// Constructs the only executable semantic object admitted by the bounded
    /// native floor. Through this typed constructor callers provide data,
    /// never machine instructions. Bytes supplied through the generic request
    /// constructor still pass the same private exact-format parser.
    ///
    /// The private native executor cannot be imported or called directly:
    ///
    /// ```compile_fail
    /// use galerina_vok_authority::native;
    /// ```
    pub fn new_return_u64(
        tag: AuthorityTag,
        context: AuthorityContext,
        gates: [Trit; 8],
        value: u64,
    ) -> Result<Self, VokFailure> {
        let target = native::current_target()
            .ok_or_else(|| VokFailure::new(Trit::Refuse, "VOK_NATIVE_TARGET_UNSUPPORTED"))?;
        Ok(Self::new(
            tag,
            context,
            gates,
            native::encode_return_u64_object(value, target).to_vec(),
        ))
    }
}

impl AuthorityContext {
    #[must_use]
    pub const fn new(
        target_digest: [u8; 32],
        policy_digest: [u8; 32],
        verifier_digest: [u8; 32],
        policy_epoch: u64,
        revocation_epoch: u64,
    ) -> Self {
        Self {
            target_digest,
            policy_digest,
            verifier_digest,
            policy_epoch,
            revocation_epoch,
        }
    }

    #[must_use]
    pub const fn target_digest(&self) -> &[u8; 32] {
        &self.target_digest
    }

    #[must_use]
    pub const fn policy_digest(&self) -> &[u8; 32] {
        &self.policy_digest
    }

    #[must_use]
    pub const fn verifier_digest(&self) -> &[u8; 32] {
        &self.verifier_digest
    }

    #[must_use]
    pub const fn policy_epoch(&self) -> u64 {
        self.policy_epoch
    }

    #[must_use]
    pub const fn revocation_epoch(&self) -> u64 {
        self.revocation_epoch
    }

    fn clear(&mut self) {
        self.target_digest.fill(0);
        self.policy_digest.fill(0);
        self.verifier_digest.fill(0);
        self.policy_epoch = u64::MAX;
        self.revocation_epoch = u64::MAX;
    }
}

/// Opaque, flow-local authority over an admitted object.
///
/// Safe callers cannot construct, copy, clone or move this value between
/// threads.
///
/// ```compile_fail
/// use galerina_vok_authority::{AdmittedObjectHandle, AuthorityTag};
/// let handle = AdmittedObjectHandle {
///     table_nonce: [1; 16],
///     slot: 0,
///     generation: 0,
///     object_nonce: [2; 16],
///     tag: AuthorityTag::parse("slide.vok.execute.v1").unwrap(),
///     thread_marker: Default::default(),
/// };
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::AdmittedObjectHandle;
/// fn require_clone<T: Clone>() {}
/// require_clone::<AdmittedObjectHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::AdmittedObjectHandle;
/// fn require_copy<T: Copy>() {}
/// require_copy::<AdmittedObjectHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::AdmittedObjectHandle;
/// fn require_send<T: Send>() {}
/// require_send::<AdmittedObjectHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::AdmittedObjectHandle;
/// fn require_sync<T: Sync>() {}
/// require_sync::<AdmittedObjectHandle>();
/// ```
#[must_use = "dropping an admitted handle cannot authorize execution"]
pub struct AdmittedObjectHandle {
    table_nonce: [u8; 16],
    slot: usize,
    generation: u64,
    object_nonce: [u8; 16],
    tag: AuthorityTag,
    thread_marker: PhantomData<Rc<()>>,
}

impl fmt::Debug for AdmittedObjectHandle {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("AdmittedObjectHandle(REDACTED)")
    }
}

impl Drop for AdmittedObjectHandle {
    fn drop(&mut self) {
        self.table_nonce.fill(0);
        self.slot = usize::MAX;
        self.generation = u64::MAX;
        self.object_nonce.fill(0);
        self.tag.0.clear();
    }
}

/// Opaque, flow-local authority over one open execution lease.
///
/// ```compile_fail
/// use galerina_vok_authority::{AuthorityTag, LeaseHandle};
/// let handle = LeaseHandle {
///     table_nonce: [1; 16],
///     slot: 0,
///     generation: 0,
///     object_nonce: [2; 16],
///     tag: AuthorityTag::parse("slide.vok.execute.v1").unwrap(),
///     thread_marker: Default::default(),
/// };
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::LeaseHandle;
/// fn require_clone<T: Clone>() {}
/// require_clone::<LeaseHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::LeaseHandle;
/// fn require_copy<T: Copy>() {}
/// require_copy::<LeaseHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::LeaseHandle;
/// fn require_send<T: Send>() {}
/// require_send::<LeaseHandle>();
/// ```
///
/// ```compile_fail
/// use galerina_vok_authority::LeaseHandle;
/// fn require_sync<T: Sync>() {}
/// require_sync::<LeaseHandle>();
/// ```
#[must_use = "dropping a lease cannot produce an execution receipt"]
pub struct LeaseHandle {
    table_nonce: [u8; 16],
    slot: usize,
    generation: u64,
    object_nonce: [u8; 16],
    tag: AuthorityTag,
    thread_marker: PhantomData<Rc<()>>,
}

impl fmt::Debug for LeaseHandle {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("LeaseHandle(REDACTED)")
    }
}

impl Drop for LeaseHandle {
    fn drop(&mut self) {
        self.table_nonce.fill(0);
        self.slot = usize::MAX;
        self.generation = u64::MAX;
        self.object_nonce.fill(0);
        self.tag.0.clear();
    }
}

struct AdmittedEntry {
    object_nonce: [u8; 16],
    tag: AuthorityTag,
    context: AuthorityContext,
    bytes: Vec<u8>,
}

impl AdmittedEntry {
    fn clear(&mut self) {
        self.object_nonce.fill(0);
        self.tag.0.clear();
        self.context.clear();
        self.bytes.fill(0);
        self.bytes.clear();
    }
}

struct Slot {
    generation: u64,
    admitted: Option<AdmittedEntry>,
    lease: Option<AdmittedEntry>,
    retired: bool,
}

/// Terminal evidence is ordinary data and cannot be replayed as a lease.
///
/// ```compile_fail
/// use galerina_vok_authority::{LeaseHandle, VokReceipt};
/// fn require_lease(_: LeaseHandle) {}
/// fn replay(receipt: VokReceipt) { require_lease(receipt); }
/// ```
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VokReceipt {
    tag: String,
    byte_length: usize,
    terminal_outcome: Trit,
    policy_epoch: u64,
    revocation_epoch: u64,
}

/// Terminal evidence for one bounded native execution.
///
/// This ordinary value cannot be converted back into a lease and never
/// releases authority.
///
/// ```compile_fail
/// use galerina_vok_authority::{LeaseHandle, VokExecutionReceipt};
/// fn require_lease(_: LeaseHandle) {}
/// fn replay(receipt: VokExecutionReceipt) { require_lease(receipt); }
/// ```
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VokExecutionReceipt {
    tag: String,
    byte_length: usize,
    value: u64,
    terminal_outcome: Trit,
    policy_epoch: u64,
    revocation_epoch: u64,
    executable_at_call: bool,
    writable_at_call: bool,
}

impl VokExecutionReceipt {
    #[must_use]
    pub fn tag(&self) -> &str {
        &self.tag
    }

    #[must_use]
    pub const fn byte_length(&self) -> usize {
        self.byte_length
    }

    #[must_use]
    pub const fn value(&self) -> u64 {
        self.value
    }

    #[must_use]
    pub const fn terminal_outcome(&self) -> Trit {
        self.terminal_outcome
    }

    #[must_use]
    pub const fn policy_epoch(&self) -> u64 {
        self.policy_epoch
    }

    #[must_use]
    pub const fn revocation_epoch(&self) -> u64 {
        self.revocation_epoch
    }

    #[must_use]
    pub const fn executable_at_call(&self) -> bool {
        self.executable_at_call
    }

    #[must_use]
    pub const fn writable_at_call(&self) -> bool {
        self.writable_at_call
    }

    #[must_use]
    pub const fn authority_released(&self) -> bool {
        false
    }
}

impl VokReceipt {
    #[must_use]
    pub fn tag(&self) -> &str {
        &self.tag
    }

    #[must_use]
    pub const fn byte_length(&self) -> usize {
        self.byte_length
    }

    #[must_use]
    pub const fn terminal_outcome(&self) -> Trit {
        self.terminal_outcome
    }

    #[must_use]
    pub const fn policy_epoch(&self) -> u64 {
        self.policy_epoch
    }

    #[must_use]
    pub const fn revocation_epoch(&self) -> u64 {
        self.revocation_epoch
    }

    #[must_use]
    pub const fn authority_released(&self) -> bool {
        false
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RevocationSummary {
    revoked: usize,
    retired: usize,
}

impl RevocationSummary {
    #[must_use]
    pub const fn revoked(&self) -> usize {
        self.revoked
    }

    #[must_use]
    pub const fn retired(&self) -> usize {
        self.retired
    }
}

#[must_use]
pub fn authority_verdict(admission_gates: [Trit; 8], live_handle: Trit) -> Trit {
    admission_gates
        .into_iter()
        .chain([live_handle])
        .min()
        .expect("the fixed nine-gate VOK vector is nonempty")
}

pub struct AuthorityTable<N: NonceSource> {
    nonce_source: N,
    table_nonce: [u8; 16],
    seen_nonces: BTreeSet<[u8; 16]>,
    nonce_history_limit: usize,
    current_context: AuthorityContext,
    byte_ceiling: usize,
    slots: Vec<Slot>,
    free_slots: Vec<usize>,
    live_count: usize,
    thread_marker: PhantomData<Rc<()>>,
}

impl<N: NonceSource> AuthorityTable<N> {
    pub fn new(
        capacity: usize,
        byte_ceiling: usize,
        current_context: AuthorityContext,
        mut nonce_source: N,
    ) -> Result<Self, VokFailure> {
        if capacity == 0 || capacity > MAX_TABLE_CAPACITY {
            return Err(VokFailure::new(Trit::Refuse, "VOK_CAPACITY_INVALID"));
        }
        if byte_ceiling == 0 || byte_ceiling > MAX_OBJECT_BYTES_LIMIT {
            return Err(VokFailure::new(Trit::Refuse, "VOK_BYTE_CEILING_INVALID"));
        }

        let table_nonce = nonce_source.next_nonce().map_err(Self::nonce_error)?;
        if table_nonce == [0; 16] {
            return Err(VokFailure::new(Trit::Refuse, "VOK_NONCE_ZERO"));
        }

        let mut seen_nonces = BTreeSet::new();
        seen_nonces.insert(table_nonce);
        let slots = (0..capacity)
            .map(|_| Slot {
                generation: 0,
                admitted: None,
                lease: None,
                retired: false,
            })
            .collect();
        let free_slots = (0..capacity).rev().collect();
        Ok(Self {
            nonce_source,
            table_nonce,
            seen_nonces,
            nonce_history_limit: MAX_NONCE_HISTORY,
            current_context,
            byte_ceiling,
            slots,
            free_slots,
            live_count: 0,
            thread_marker: PhantomData,
        })
    }

    /// Mints only from the typed, closed request surface.
    ///
    /// A Boolean, score, evidence record or receipt cannot substitute for the
    /// complete request.
    ///
    /// ```compile_fail
    /// use galerina_vok_authority::{AuthorityContext, AuthorityTable, NonceFailure, NonceSource};
    /// struct Source;
    /// impl NonceSource for Source {
    ///     fn next_nonce(&mut self) -> Result<[u8; 16], NonceFailure> { Ok([1; 16]) }
    /// }
    /// let mut table = AuthorityTable::new(
    ///     1,
    ///     1,
    ///     AuthorityContext::new([1; 32], [2; 32], [3; 32], 0, 0),
    ///     Source,
    /// ).unwrap();
    /// table.mint_admitted(true).unwrap();
    /// ```
    pub fn mint_admitted(
        &mut self,
        mut request: MintRequest,
    ) -> Result<AdmittedObjectHandle, VokFailure> {
        if request.bytes.is_empty() {
            return Err(VokFailure::new(Trit::Refuse, "VOK_OBJECT_EMPTY"));
        }
        if request.bytes.len() > self.byte_ceiling {
            return Err(VokFailure::new(Trit::Refuse, "VOK_OBJECT_TOO_LARGE"));
        }
        if request.context != self.current_context {
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }

        let gate_outcome = request
            .gates
            .into_iter()
            .min()
            .expect("the fixed admission gate array is nonempty");
        if gate_outcome != Trit::Admit {
            return Err(VokFailure::new(gate_outcome, "VOK_ADMISSION_GATES_BLOCKED"));
        }

        let slot_index = self
            .free_slots
            .last()
            .copied()
            .ok_or_else(|| VokFailure::new(Trit::Unknown, "VOK_CAPACITY_EXHAUSTED"))?;
        match self.slots.get(slot_index) {
            Some(slot) if slot.admitted.is_none() && slot.lease.is_none() && !slot.retired => {}
            _ => return Err(VokFailure::new(Trit::Refuse, "VOK_TABLE_INVARIANT")),
        }
        let object_nonce = self.next_unique_nonce()?;
        let popped = self.free_slots.pop();
        if popped != Some(slot_index) {
            return Err(VokFailure::new(Trit::Refuse, "VOK_TABLE_INVARIANT"));
        }
        let slot = self
            .slots
            .get_mut(slot_index)
            .expect("the private free-list contains only constructed slots");

        let handle_tag = request.tag.clone();
        let entry_tag = request.tag.clone();
        let entry_context = request.context.clone();
        let entry_bytes = std::mem::take(&mut request.bytes);
        let handle = AdmittedObjectHandle {
            table_nonce: self.table_nonce,
            slot: slot_index,
            generation: slot.generation,
            object_nonce,
            tag: handle_tag,
            thread_marker: PhantomData,
        };
        slot.admitted = Some(AdmittedEntry {
            object_nonce,
            tag: entry_tag,
            context: entry_context,
            bytes: entry_bytes,
        });
        self.live_count += 1;
        Ok(handle)
    }

    pub fn open_lease(
        &mut self,
        handle: AdmittedObjectHandle,
        current_context: &AuthorityContext,
    ) -> Result<LeaseHandle, VokFailure> {
        let slot_index = self.validate_admitted_handle(&handle)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }

        let next_generation = match handle.generation.checked_add(1) {
            Some(generation) => generation,
            None => {
                self.retire_slot(slot_index);
                return Err(VokFailure::new(Trit::Refuse, "VOK_GENERATION_EXHAUSTED"));
            }
        };
        let next_nonce = match self.next_unique_nonce() {
            Ok(nonce) => nonce,
            Err(error) => {
                self.clear_and_advance_slot(slot_index);
                return Err(error);
            }
        };

        let slot = self
            .slots
            .get_mut(slot_index)
            .expect("validated private slot remains present in a flow-local table");
        let mut entry = slot
            .admitted
            .take()
            .expect("validated private slot remains admitted until transition");
        entry.object_nonce = next_nonce;
        slot.generation = next_generation;
        let lease = LeaseHandle {
            table_nonce: self.table_nonce,
            slot: slot_index,
            generation: next_generation,
            object_nonce: next_nonce,
            tag: entry.tag.clone(),
            thread_marker: PhantomData,
        };
        slot.lease = Some(entry);
        Ok(lease)
    }

    pub fn consume_lease(
        &mut self,
        lease: LeaseHandle,
        current_context: &AuthorityContext,
        terminal_outcome: Trit,
    ) -> Result<VokReceipt, VokFailure> {
        let slot_index = self.validate_lease_handle(&lease)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }

        let slot = self
            .slots
            .get(slot_index)
            .expect("validated private slot remains present in a flow-local table");
        let entry = slot
            .lease
            .as_ref()
            .expect("validated private slot remains leased until transition");
        let receipt = VokReceipt {
            tag: entry.tag.as_str().to_owned(),
            byte_length: entry.bytes.len(),
            terminal_outcome,
            policy_epoch: entry.context.policy_epoch,
            revocation_epoch: entry.context.revocation_epoch,
        };
        self.clear_and_advance_slot(slot_index);
        Ok(receipt)
    }

    /// Consumes one exact lease through the bounded native W^X profile.
    ///
    /// Success and failure both terminally clear the private slot. The native
    /// adapter accepts only the closed semantic object; no raw-code or path
    /// fallback is available through this method.
    pub fn execute_lease(
        &mut self,
        lease: LeaseHandle,
        current_context: &AuthorityContext,
    ) -> Result<VokExecutionReceipt, VokFailure> {
        let slot_index = self.validate_lease_handle(&lease)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }

        let result = {
            let slot = self
                .slots
                .get(slot_index)
                .expect("validated private slot remains present in a flow-local table");
            let entry = slot
                .lease
                .as_ref()
                .expect("validated private slot remains leased until execution");
            native::execute(&entry.bytes).map(|evidence| VokExecutionReceipt {
                tag: entry.tag.as_str().to_owned(),
                byte_length: entry.bytes.len(),
                value: evidence.value(),
                terminal_outcome: Trit::Admit,
                policy_epoch: entry.context.policy_epoch,
                revocation_epoch: entry.context.revocation_epoch,
                executable_at_call: evidence.executable_at_call(),
                writable_at_call: evidence.writable_at_call(),
            })
        };
        self.clear_and_advance_slot(slot_index);
        result.map_err(|error| VokFailure::new(Trit::Refuse, error.failure_id()))
    }

    pub fn advance_context(
        &mut self,
        next_context: AuthorityContext,
    ) -> Result<RevocationSummary, VokFailure> {
        if next_context.policy_epoch < self.current_context.policy_epoch
            || next_context.revocation_epoch < self.current_context.revocation_epoch
        {
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_REGRESSION"));
        }

        let policy_changed = next_context.policy_digest != self.current_context.policy_digest;
        let identity_changed = next_context.target_digest != self.current_context.target_digest
            || next_context.verifier_digest != self.current_context.verifier_digest;
        if (policy_changed && next_context.policy_epoch == self.current_context.policy_epoch)
            || (identity_changed
                && next_context.revocation_epoch == self.current_context.revocation_epoch)
        {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_CONTEXT_CHANGE_WITHOUT_EPOCH",
            ));
        }

        if next_context == self.current_context {
            return Ok(RevocationSummary {
                revoked: 0,
                retired: 0,
            });
        }

        let active_slots: Vec<usize> = self
            .slots
            .iter()
            .enumerate()
            .filter_map(|(index, slot)| {
                (slot.admitted.is_some() || slot.lease.is_some()).then_some(index)
            })
            .collect();
        let mut retired = 0;
        for slot_index in &active_slots {
            if self.clear_and_advance_slot(*slot_index) {
                retired += 1;
            }
        }
        self.current_context = next_context;
        Ok(RevocationSummary {
            revoked: active_slots.len(),
            retired,
        })
    }

    #[must_use]
    pub const fn live_len(&self) -> usize {
        self.live_count
    }

    fn next_unique_nonce(&mut self) -> Result<[u8; 16], VokFailure> {
        if self.seen_nonces.len() >= self.nonce_history_limit {
            return Err(VokFailure::new(Trit::Unknown, "VOK_NONCE_BUDGET_EXHAUSTED"));
        }
        let nonce = self.nonce_source.next_nonce().map_err(Self::nonce_error)?;
        if nonce == [0; 16] {
            return Err(VokFailure::new(Trit::Refuse, "VOK_NONCE_ZERO"));
        }
        if !self.seen_nonces.insert(nonce) {
            return Err(VokFailure::new(Trit::Refuse, "VOK_NONCE_REPEATED"));
        }
        Ok(nonce)
    }

    fn nonce_error(error: NonceFailure) -> VokFailure {
        VokFailure::new(Trit::Refuse, error.failure_id())
    }

    fn validate_admitted_handle(&self, handle: &AdmittedObjectHandle) -> Result<usize, VokFailure> {
        if handle.table_nonce != self.table_nonce {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        }
        let Some(slot) = self.slots.get(handle.slot) else {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        };
        let Some(entry) = slot.admitted.as_ref() else {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        };
        if slot.retired
            || slot.lease.is_some()
            || handle.generation != slot.generation
            || handle.object_nonce != entry.object_nonce
            || handle.tag != entry.tag
            || entry.context != self.current_context
        {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        }
        Ok(handle.slot)
    }

    fn validate_lease_handle(&self, handle: &LeaseHandle) -> Result<usize, VokFailure> {
        if handle.table_nonce != self.table_nonce {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        }
        let Some(slot) = self.slots.get(handle.slot) else {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        };
        let Some(entry) = slot.lease.as_ref() else {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        };
        if slot.retired
            || slot.admitted.is_some()
            || handle.generation != slot.generation
            || handle.object_nonce != entry.object_nonce
            || handle.tag != entry.tag
            || entry.context != self.current_context
        {
            return Err(VokFailure::new(Trit::Refuse, "VOK_HANDLE_MISMATCH"));
        }
        Ok(handle.slot)
    }

    fn clear_and_advance_slot(&mut self, slot_index: usize) -> bool {
        let Some(slot) = self.slots.get_mut(slot_index) else {
            return true;
        };
        let was_live = slot.admitted.is_some() || slot.lease.is_some();
        if let Some(entry) = &mut slot.admitted {
            entry.clear();
        }
        if let Some(entry) = &mut slot.lease {
            entry.clear();
        }
        slot.admitted = None;
        slot.lease = None;
        if was_live {
            self.live_count = self.live_count.saturating_sub(1);
        }
        match slot.generation.checked_add(1) {
            Some(generation) => {
                slot.generation = generation;
                if !slot.retired && !self.free_slots.contains(&slot_index) {
                    self.free_slots.push(slot_index);
                }
                false
            }
            None => {
                slot.retired = true;
                self.free_slots.retain(|index| *index != slot_index);
                true
            }
        }
    }

    fn retire_slot(&mut self, slot_index: usize) {
        let Some(slot) = self.slots.get_mut(slot_index) else {
            return;
        };
        let was_live = slot.admitted.is_some() || slot.lease.is_some();
        if let Some(entry) = &mut slot.admitted {
            entry.clear();
        }
        if let Some(entry) = &mut slot.lease {
            entry.clear();
        }
        slot.admitted = None;
        slot.lease = None;
        slot.retired = true;
        self.free_slots.retain(|index| *index != slot_index);
        if was_live {
            self.live_count = self.live_count.saturating_sub(1);
        }
    }
}

impl<N: NonceSource> fmt::Debug for AuthorityTable<N> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AuthorityTable")
            .field("capacity", &self.slots.len())
            .field("live_count", &self.live_count)
            .field("authority_material", &"REDACTED")
            .finish()
    }
}

impl<N: NonceSource> Drop for AuthorityTable<N> {
    fn drop(&mut self) {
        for slot in &mut self.slots {
            if let Some(entry) = &mut slot.admitted {
                entry.clear();
            }
            if let Some(entry) = &mut slot.lease {
                entry.clear();
            }
            slot.admitted = None;
            slot.lease = None;
            slot.retired = true;
        }
        self.table_nonce.fill(0);
        self.seen_nonces.clear();
        self.live_count = 0;
    }
}

#[cfg(test)]
mod tests;
