#![deny(unsafe_code)]

use std::collections::BTreeSet;
use std::fmt;
use std::marker::PhantomData;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

mod memory_policy;
#[allow(unsafe_code)]
mod native;
mod resource;
#[allow(unsafe_code)]
mod secret_arena;
mod secret_arena_custodian;
mod secret_arena_store;
mod sha256;
mod lattice;
mod k3_frame;
#[cfg(test)]
mod k3_wire_vectors_pin;
#[cfg(test)]
mod k3_wire_u8;
#[cfg(test)]
mod k3_frame_counter;
mod veo;
mod assurance;

pub use lattice::{from_lattice, to_lattice};
pub use k3_frame::{
    decode_legacy_frame_pure, decode_legacy_frame_with_bridge, k3_parse_serial_instant_unix_s,
    k3_serial_window_contains, k3_unix_s_to_ymd, k3_wasi_realtime_ns_to_unix_s, FrameAlert,
    FrameDecode, FrameLabel, K3AlertNoopSink, K3AlertRecord, K3AlertSink, K3_ALERT_NOOP,
    K3_ALERT_SINK_STATUS,
};
use k3_frame::decode_legacy_frame_counted;
pub use memory_policy::{
    admit_isolation_claim, claim_physical_erasure, IsolationClaim, MemoryErasureClass,
};
pub use resource::{VmResourceHandle, VmResourceKind, MAX_RESOURCES_PER_LEASE};
pub use secret_arena::{
    MemoryStatus, RuntimeErrorCode, SecretArena, SecretArenaError, ERR_SECRET_ARENA_CLEANUP_FAILED,
    ERR_SECRET_ARENA_CREATE_REFUSED, ERR_SECRET_ARENA_INVALID_LENGTH, ERR_SECRET_ARENA_MAP_REFUSED,
    ERR_SECRET_ARENA_NOT_ACTIVE, ERR_SECRET_ARENA_NOT_ALLOCATED,
    ERR_SECRET_ARENA_PAGE_SIZE_REFUSED, ERR_SECRET_ARENA_RESIZE_REFUSED,
    ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
};
pub use secret_arena_custodian::run_secret_arena_custodian;
pub use veo::{
    admit_general_veo_linker, admit_veo_object, AdmittedVeoObject, VeoActionIdentity,
    VeoAdmissionRequest, VeoProfile,
};
pub use assurance::{
    envelope_file_body, framed_digest, framed_verdict_bytes, seal_file_body, sha256_prefaced,
    verify_wasm_artifact, verify_wasm_file, verify_wasm_stdin, wasm_magic_windows,
    write_verdict_files, write_verdict_stdout, Envelope, VerifyError, WaxSeal, ABI,
    CAPABILITY_DOMAIN, DEFAULT_BUILD_POINT, DEPS_DOMAIN, ENVELOPE_DOMAIN, EPOCH, EVIDENCE_DOMAIN,
    POLICY_DOMAIN, POLICY_ID, PROFILE_DOMAIN, SEAL_DOMAIN, TARGET,
};

pub const MAX_AUTHORITY_TAG_BYTES: usize = 96;
pub const MAX_TABLE_CAPACITY: usize = 65_536;
pub const MAX_OBJECT_BYTES_LIMIT: usize = 64 * 1024 * 1024;
pub const MAX_NONCE_HISTORY: usize = 262_145;
pub const RETURN_U64_OBJECT_BYTES: usize = native::OBJECT_BYTES;

/// VOK lattice trit. The enum discriminants are the INTERNAL lattice order used by
/// `authority_verdict` (Refuse < Unknown < Admit); they are NOT the K3 wire encoding.
/// Use `Trit::decode_wire` / `TryFrom<i32>` to read and `Trit::to_wire` to write: UNKNOWN is -128 on the wire.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(i8)]
pub enum Trit {
    Refuse = -1,
    Unknown = 0,
    Admit = 1,
}

/// Canonical K3 UNKNOWN wire value. Galerina emits only this for UNKNOWN, never 0.
pub const K3_UNKNOWN_WIRE: i32 = -128;

/// Unsigned K3 byte table. These three literals are the only byte table in this crate.
pub const K3_BYTE_ADMIT: u8 = 0x01;
pub const K3_BYTE_DENY: u8 = 0xFF;
pub const K3_BYTE_UNKNOWN: u8 = 0x80;
pub const K3_I8_ADMIT: i32 = 1;
pub const K3_I8_DENY: i32 = -1;
pub const K3_I8_UNKNOWN: i32 = K3_UNKNOWN_WIRE;

/// Option B lock-step bridge (Phillip 2026-10-26 07:45 GMT): during Step Y -> Step Z the VOK
/// checker, like SLIDE's decoders, also reads legacy 0 as UNKNOWN (never Admit, never Refuse),
/// and counts every such read. F1 (Phillip 2026-10-26 13:40 GMT, FRAMED ONLY): that read happens
/// only through `Trit::decode_legacy_frame` (SLIDE `decodeK3WireFrame`); a bare 0 is refused.
/// SUNSET: set this to `false` and then delete the arm at Step Z, before SLIDE becomes the
/// default execution path (SLIDE TODO + K3COPIES plan). P2 date 2026-12-31 / 20261231;
/// unix exclusive 1798761600 (2027-01-01T00:00:00Z); delete the path by 2027-01-18 (dated 2026-10-27).
pub const LEGACY_UNKNOWN_ZERO_BRIDGE: bool = true;
pub const K3_WIRE_VERSION_LEGACY: i32 = 1;
pub const K3_WIRE_VERSION_CANONICAL: i32 = 2;
pub const LEGACY_UNKNOWN_ZERO_CAP: u64 = 1_000_000;
pub const LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH: i32 = 20261231;
pub const LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S: i64 = 1_798_761_600;
/// Trusted-clock window reused for the K3-EP frame-epoch close gate (SLIDE rec 3).
pub const TRUSTED_CLOCK_FLOOR_UNIX_S: i64 = 1_790_812_800;
pub const TRUSTED_CLOCK_CEILING_UNIX_S: i64 = 4_102_444_800;
/// Transitional YYYYMMDD window (rd-trusted-clock-linux-time-20261027 rec 4).
pub const K3_EPOCH_YMD_MIN: i32 = 20_261_027;
pub const K3_EPOCH_YMD_MAX: i32 = 20_991_231;

/// Failure id for a bare (unframed) 0 at a VOK boundary (F1). Mirrors SLIDE `SLIDE-K3-WIRE-003`.
pub const VOK_TRIT_BARE_LEGACY_ZERO: &str = "VOK_TRIT_BARE_LEGACY_ZERO";

/// Failure id for a value outside the K3 table (B2, 2026-10-28: named once, used everywhere).
pub const VOK_TRIT_INVALID: &str = "VOK_TRIT_INVALID";

/// Failure id for a framed legacy 0 once the bridge is closed (flag, trusted clock, epoch or cap).
pub const VOK_TRIT_LEGACY_CLOSED: &str = "VOK_TRIT_LEGACY_CLOSED";

static LEGACY_UNKNOWN_ZERO_READS: AtomicU64 = AtomicU64::new(0);
static BARE_LEGACY_ZERO_REFUSALS: AtomicU64 = AtomicU64::new(0);

/// How a trit arrived on the wire. `LegacyUnknownZero` is the typed 'legacy-unknown-0' marker.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TritWireForm {
    Canonical,
    LegacyUnknownZero,
}

/// Process-wide (saturating) count of legacy-0 UNKNOWN reads, so the bridge can be measured and removed.
#[must_use]
pub fn legacy_unknown_zero_reads() -> u64 {
    LEGACY_UNKNOWN_ZERO_READS.load(AtomicOrdering::SeqCst)
}

/// Process-wide (saturating) count of bare 0 values refused at a VOK boundary (F1).
#[must_use]
pub fn bare_legacy_zero_refusals() -> u64 {
    BARE_LEGACY_ZERO_REFUSALS.load(AtomicOrdering::SeqCst)
}

/// Off golden path / compatibility YYYYMMDD from the process clock. Invalid clocks fail closed (-1).
#[allow(dead_code)]
fn trusted_utc_ymd() -> i32 {
    let Ok(elapsed) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) else {
        return -1;
    };
    civil_ymd_from_unix_days((elapsed.as_secs() / 86_400) as i64)
}

/// Trusted i64 Unix seconds UTC for the process wrapper. Pre-epoch fails closed as 0.
fn trusted_unix_seconds() -> i64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(elapsed) => {
            let secs = elapsed.as_secs();
            if secs > i64::MAX as u64 {
                i64::MAX
            } else {
                secs as i64
            }
        }
        Err(_) => 0,
    }
}

pub(crate) fn civil_ymd_from_unix_days(days: i64) -> i32 {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32)
        .saturating_mul(10_000)
        .saturating_add((m as i32).saturating_mul(100))
        .saturating_add(d as i32)
}

impl Trit {
    fn refuse_bare_legacy_zero() -> VokFailure {
        let _ = BARE_LEGACY_ZERO_REFUSALS.fetch_update(
            AtomicOrdering::SeqCst,
            AtomicOrdering::SeqCst,
            |count| Some(count.saturating_add(1)),
        );
        VokFailure::new(Self::Refuse, VOK_TRIT_BARE_LEGACY_ZERO)
    }

    /// Unsigned K3 byte reader. Match is over the three named byte constants; default fail closed.
    pub fn decode_wire_u8(byte: u8) -> Result<(Self, TritWireForm), VokFailure> {
        match byte {
            K3_BYTE_ADMIT => Ok((Self::Admit, TritWireForm::Canonical)),
            K3_BYTE_DENY => Ok((Self::Refuse, TritWireForm::Canonical)),
            K3_BYTE_UNKNOWN => Ok((Self::Unknown, TritWireForm::Canonical)),
            0 => Err(Self::refuse_bare_legacy_zero()),
            _ => Err(VokFailure::new(Self::Refuse, VOK_TRIT_INVALID)),
        }
    }

    /// Lattice {-1, 0, 1} to unsigned K3 byte. Lattice 0 encodes to K3_BYTE_UNKNOWN, never 0.
    pub fn encode_lattice_u8(lattice: i32) -> Result<u8, VokFailure> {
        match lattice {
            -1 => Ok(K3_BYTE_DENY),
            0 => Ok(K3_BYTE_UNKNOWN),
            1 => Ok(K3_BYTE_ADMIT),
            _ => Err(VokFailure::new(Self::Refuse, VOK_TRIT_INVALID)),
        }
    }

    pub(crate) fn decode_canonical(value: i32) -> Result<(Self, TritWireForm), VokFailure> {
        match value {
            -1 => Ok((Self::Refuse, TritWireForm::Canonical)),
            K3_UNKNOWN_WIRE => Ok((Self::Unknown, TritWireForm::Canonical)),
            1 => Ok((Self::Admit, TritWireForm::Canonical)),
            _ => Err(VokFailure::new(Self::Refuse, VOK_TRIT_INVALID)),
        }
    }

    /// Signed wrapper over `decode_wire_u8`. Maps only the three sign-extended I8 constants
    /// to the named bytes, then calls the reader. Every other i32, including 0, 128 and 255,
    /// is refused before the reader. Bare 0 stays VOK_TRIT_BARE_LEGACY_ZERO.
    pub fn decode_wire(value: i32) -> Result<(Self, TritWireForm), VokFailure> {
        let byte = match value {
            K3_I8_ADMIT => K3_BYTE_ADMIT,
            K3_I8_DENY => K3_BYTE_DENY,
            K3_I8_UNKNOWN => K3_BYTE_UNKNOWN,
            0 => return Err(Self::refuse_bare_legacy_zero()),
            _ => return Err(VokFailure::new(Self::Refuse, VOK_TRIT_INVALID)),
        };
        Self::decode_wire_u8(byte)
    }

    /// Decode a value carried inside the versioned legacy wire frame (SLIDE `decodeK3WireFrame`):
    /// canonical values as `decode_wire`, plus legacy 0 as UNKNOWN (typed, counted) while the
    /// bridge is open; VOK_TRIT_LEGACY_CLOSED once it closes. Process clock and counter are
    /// supplied to `decode_legacy_frame_pure`; this i32 API does not take version/epoch/cap.
    /// K3-EP: the counted wrapper passes `now_unix_s` as the canonical frame epoch so option-B
    /// survives epoch 0 failing closed. N2 (2026-10-28): the process counter goes through
    /// `decode_legacy_frame_counted`, which commits each accepted read with one compare-exchange,
    /// so racing callers cannot pass the cap.
    pub fn decode_legacy_frame(value: i32) -> Result<(Self, TritWireForm), VokFailure> {
        let decoded =
            decode_legacy_frame_counted(value, trusted_unix_seconds(), &LEGACY_UNKNOWN_ZERO_READS);
        match decoded.label {
            FrameLabel::Admit => Ok((Self::Admit, TritWireForm::Canonical)),
            FrameLabel::Deny => Ok((Self::Refuse, TritWireForm::Canonical)),
            FrameLabel::Unknown if value == 0 => {
                Ok((Self::Unknown, TritWireForm::LegacyUnknownZero))
            }
            FrameLabel::Unknown => Ok((Self::Unknown, TritWireForm::Canonical)),
            FrameLabel::Invalid => Err(VokFailure::new(Self::Refuse, VOK_TRIT_INVALID)),
            FrameLabel::LegacyClosed => {
                Err(VokFailure::new(Self::Refuse, VOK_TRIT_LEGACY_CLOSED))
            }
        }
    }

    /// Canonical K3 wire value. Never 0: UNKNOWN is -128.
    #[must_use]
    pub const fn to_wire(self) -> i32 {
        match self {
            Self::Refuse => -1,
            Self::Unknown => K3_UNKNOWN_WIRE,
            Self::Admit => 1,
        }
    }
}

impl TryFrom<i32> for Trit {
    type Error = VokFailure;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        Self::decode_wire(value).map(|(trit, _form)| trit)
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

fn artifact_digest_is_zero(digest: &[u8; 32]) -> bool {
    let mut acc = 0_u8;
    for byte in digest {
        acc |= *byte;
    }
    acc == 0
}

fn artifact_digest_eq_ct(left: &[u8; 32], right: &[u8; 32]) -> bool {
    let mut acc = 0_u8;
    for index in 0..32 {
        acc |= left[index] ^ right[index];
    }
    acc == 0
}

const WASM_MODULE_MAGIC: [u8; 4] = [0x00, 0x61, 0x73, 0x6d];

fn bytes_contain_wasm_module_magic(bytes: &[u8]) -> bool {
    bytes.windows(4).any(|window| window == WASM_MODULE_MAGIC)
}

/// Opaque digest produced by a successful `wamr_secrets_gateway_load_for_authority`.
/// Not constructible from an arbitrary `[u8; 32]` on the public admission path.
pub struct WamrLoadedDigest {
    digest: [u8; 32],
}

impl WamrLoadedDigest {
    #[cfg(test)]
    pub(crate) fn from_authority_output(digest: [u8; 32]) -> Result<Self, VokFailure> {
        if artifact_digest_is_zero(&digest) {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
        }
        Ok(Self { digest })
    }

    #[cfg(test)]
    pub(crate) fn from_test_fixture(digest: [u8; 32]) -> Result<Self, VokFailure> {
        Self::from_authority_output(digest)
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.digest
    }
}

impl Drop for WamrLoadedDigest {
    fn drop(&mut self) {
        self.digest.fill(0);
    }
}

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
    artifact_digest: [u8; 32],
}

impl fmt::Debug for MintRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MintRequest")
            .field("tag", &self.tag)
            .field("context", &self.context)
            .field("gates", &self.gates)
            .field("bytes", &"REDACTED")
            .field("artifact_digest", &"REDACTED")
            .finish()
    }
}

impl Drop for MintRequest {
    fn drop(&mut self) {
        self.bytes.fill(0);
        self.bytes.clear();
        self.artifact_digest.fill(0);
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
            artifact_digest: [0; 32],
        }
    }

    /// Crate-private raw setter. Public admission uses
    /// [`MintRequest::with_wamr_loaded_digest`].
    pub(crate) fn with_artifact_digest(
        mut self,
        artifact_digest: [u8; 32],
    ) -> Result<Self, VokFailure> {
        if artifact_digest_is_zero(&artifact_digest) {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
        }
        self.artifact_digest = artifact_digest;
        Ok(self)
    }

    /// Binds a digest produced by `wamr_secrets_gateway_load_for_authority`.
    pub fn with_wamr_loaded_digest(
        self,
        digest: WamrLoadedDigest,
    ) -> Result<Self, VokFailure> {
        self.with_artifact_digest(digest.digest)
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

    /// Bounded RD-0656 return-u64 profile only. The general linker cannot
    /// mint through this constructor.
    pub fn new_from_veo(
        tag: AuthorityTag,
        context: AuthorityContext,
        gates: [Trit; 8],
        object: veo::AdmittedVeoObject,
    ) -> Result<Self, VokFailure> {
        if object.profile() != veo::VeoProfile::ReturnU64 {
            return Err(VokFailure::new(
                Trit::Unknown,
                "VOK_VEO_PROFILE_UNSUPPORTED",
            ));
        }
        Self::new_return_u64(tag, context, gates, object.return_value())
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
    artifact_digest: [u8; 32],
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
        self.artifact_digest.fill(0);
        #[cfg(test)]
        LAST_DROPPED_LEASE_ARTIFACT_DIGEST.with(|cell| cell.set(self.artifact_digest));
    }
}

#[cfg(test)]
thread_local! {
    static LAST_DROPPED_LEASE_ARTIFACT_DIGEST: std::cell::Cell<[u8; 32]> =
        const { std::cell::Cell::new([0xff; 32]) };
}

struct AdmittedEntry {
    object_nonce: [u8; 16],
    tag: AuthorityTag,
    context: AuthorityContext,
    bytes: Vec<u8>,
    artifact_digest: [u8; 32],
}

impl AdmittedEntry {
    fn clear(&mut self) {
        self.object_nonce.fill(0);
        self.tag.0.clear();
        self.context.clear();
        self.bytes.fill(0);
        self.bytes.clear();
        self.artifact_digest.fill(0);
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
#[derive(Clone, Eq, PartialEq)]
pub struct VokReceipt {
    tag: String,
    byte_length: usize,
    terminal_outcome: Trit,
    policy_epoch: u64,
    revocation_epoch: u64,
    artifact_digest: [u8; 32],
}

impl fmt::Debug for VokReceipt {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("VokReceipt")
            .field("tag", &self.tag)
            .field("byte_length", &self.byte_length)
            .field("terminal_outcome", &self.terminal_outcome)
            .field("policy_epoch", &self.policy_epoch)
            .field("revocation_epoch", &self.revocation_epoch)
            .field("artifact_digest", &"REDACTED")
            .finish()
    }
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
    transferred_resource_count: usize,
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

    #[must_use]
    pub const fn transferred_resource_count(&self) -> usize {
        self.transferred_resource_count
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

    #[must_use]
    pub const fn artifact_digest(&self) -> &[u8; 32] {
        &self.artifact_digest
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
    resource_slots: Vec<resource::ResourceSlot>,
    free_resources: Vec<usize>,
    live_resources: usize,
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
        let resource_slots = (0..capacity)
            .map(|_| resource::ResourceSlot::fresh())
            .collect();
        let free_resources = (0..capacity).rev().collect();
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
            resource_slots,
            free_resources,
            live_resources: 0,
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
        if bytes_contain_wasm_module_magic(&request.bytes) {
            return Err(VokFailure::new(Trit::Refuse, "VOK_WASM_BYTES_REFUSED"));
        }
        if !native::is_native_floor_object(&request.bytes) {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_NATIVE_OBJECT_REQUIRED",
            ));
        }
        if artifact_digest_is_zero(&request.artifact_digest) {
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
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
            artifact_digest: request.artifact_digest,
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
        let _stored_digest = self
            .slots
            .get(slot_index)
            .and_then(|slot| slot.admitted.as_ref())
            .expect("validated private slot remains admitted until transition")
            .artifact_digest;
        self.clear_and_advance_slot(slot_index);
        Err(VokFailure::new(
            Trit::Refuse,
            "VOK_ARTIFACT_DIGEST_MISSING",
        ))
    }

    fn transition_admitted_to_lease(
        &mut self,
        handle: AdmittedObjectHandle,
    ) -> Result<LeaseHandle, VokFailure> {
        let slot_index = handle.slot;
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
            artifact_digest: entry.artifact_digest,
            thread_marker: PhantomData,
        };
        slot.lease = Some(entry);
        Ok(lease)
    }

    pub fn consume_lease(
        &mut self,
        lease: LeaseHandle,
        current_context: &AuthorityContext,
        _terminal_outcome: Trit,
    ) -> Result<VokReceipt, VokFailure> {
        let slot_index = self.validate_lease_handle(&lease)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }
        let _stored_digest = self
            .slots
            .get(slot_index)
            .and_then(|slot| slot.lease.as_ref())
            .expect("validated private slot remains leased until transition")
            .artifact_digest;
        self.clear_and_advance_slot(slot_index);
        Err(VokFailure::new(
            Trit::Refuse,
            "VOK_ARTIFACT_DIGEST_MISSING",
        ))
    }

    fn transition_lease_to_receipt(
        &mut self,
        lease: LeaseHandle,
        terminal_outcome: Trit,
    ) -> Result<VokReceipt, VokFailure> {
        let slot_index = lease.slot;
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
            artifact_digest: entry.artifact_digest,
        };
        self.clear_and_advance_slot(slot_index);
        Ok(receipt)
    }

    pub fn open_lease_for_artifact(
        &mut self,
        handle: AdmittedObjectHandle,
        current_context: &AuthorityContext,
        expected: &[u8; 32],
    ) -> Result<LeaseHandle, VokFailure> {
        let slot_index = self.validate_admitted_handle(&handle)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }
        let entry_digest = self
            .slots
            .get(slot_index)
            .and_then(|slot| slot.admitted.as_ref())
            .expect("validated private slot remains admitted until transition")
            .artifact_digest;
        if artifact_digest_is_zero(expected) || artifact_digest_is_zero(&entry_digest) {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
        }
        if !artifact_digest_eq_ct(&entry_digest, expected) {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_ARTIFACT_MISMATCH"));
        }
        self.transition_admitted_to_lease(handle)
    }

    pub fn consume_lease_for_artifact(
        &mut self,
        lease: LeaseHandle,
        current_context: &AuthorityContext,
        terminal_outcome: Trit,
        expected: &[u8; 32],
    ) -> Result<VokReceipt, VokFailure> {
        let slot_index = self.validate_lease_handle(&lease)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }
        let entry_digest = self
            .slots
            .get(slot_index)
            .and_then(|slot| slot.lease.as_ref())
            .expect("validated private slot remains leased until transition")
            .artifact_digest;
        if artifact_digest_is_zero(expected) || artifact_digest_is_zero(&entry_digest) {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
        }
        if !artifact_digest_eq_ct(&entry_digest, expected) {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_ARTIFACT_MISMATCH"));
        }
        self.transition_lease_to_receipt(lease, terminal_outcome)
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
        let stored_digest = self
            .slots
            .get(slot_index)
            .and_then(|slot| slot.lease.as_ref())
            .expect("validated private slot remains leased until execution")
            .artifact_digest;
        if artifact_digest_is_zero(&stored_digest) {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
        }
        self.clear_and_advance_slot(slot_index);
        Err(VokFailure::new(
            Trit::Refuse,
            "VOK_ARTIFACT_DIGEST_MISSING",
        ))
    }

    pub fn execute_lease_for_artifact(
        &mut self,
        lease: LeaseHandle,
        current_context: &AuthorityContext,
        expected_artifact_digest: &[u8; 32],
    ) -> Result<VokExecutionReceipt, VokFailure> {
        let slot_index = self.validate_lease_handle(&lease)?;
        if current_context != &self.current_context {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_CONTEXT_MISMATCH"));
        }
        let stored_digest = self
            .slots
            .get(slot_index)
            .and_then(|slot| slot.lease.as_ref())
            .expect("validated private slot remains leased until execution")
            .artifact_digest;
        if artifact_digest_is_zero(expected_artifact_digest)
            || artifact_digest_is_zero(&stored_digest)
        {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(
                Trit::Refuse,
                "VOK_ARTIFACT_DIGEST_MISSING",
            ));
        }
        if !artifact_digest_eq_ct(&stored_digest, expected_artifact_digest) {
            self.clear_and_advance_slot(slot_index);
            return Err(VokFailure::new(Trit::Refuse, "VOK_ARTIFACT_MISMATCH"));
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
                transferred_resource_count: 0,
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
        for index in 0..self.resource_slots.len() {
            self.clear_resource_slot(index);
        }
        self.table_nonce.fill(0);
        self.seen_nonces.clear();
        self.live_count = 0;
        self.live_resources = 0;
    }
}

#[cfg(test)]
mod tests;
