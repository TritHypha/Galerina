//! Domain-separated Envelope and terminal Wax Seal for out-of-process
//! WAMR artifact verification. Signet stays process-local and is never
//! written. The verifier hashes artifact bytes itself and never accepts
//! a caller digest.

use std::fs;
use std::io::{self, Read, Write};
use std::path::Path;

use crate::native;
use crate::sha256;
use crate::{
    AuthorityContext, AuthorityTable, AuthorityTag, MintRequest, OsNonceSource, Trit,
    VokFailure, WamrLoadedDigest, RETURN_U64_OBJECT_BYTES,
};

pub const ENVELOPE_DOMAIN: &str = "galerina.assurance.envelope.v1";
pub const SEAL_DOMAIN: &str = "galerina.assurance.wax-seal.v1";
pub const PROFILE_DOMAIN: &str = "galerina.assurance.profile.v1";
pub const POLICY_DOMAIN: &str = "galerina.assurance.policy.v1";
pub const CAPABILITY_DOMAIN: &str = "galerina.assurance.capability.v1";
pub const DEPS_DOMAIN: &str = "galerina.assurance.deps.v1";
pub const EVIDENCE_DOMAIN: &str = "galerina.assurance.evidence.v1";

pub const ABI: &str = "wamr-core-wasm@2.4.5";
pub const TARGET: &str = "linux-x86_64";
pub const SCHEMA_VERSION: &str = "1";
pub const EPOCH: u64 = 1;
pub const POLICY_ID: &str = "galerina.wamr-vok.artifact.v1";
pub const DEFAULT_BUILD_POINT: &str = "git:ad0ed3acc298f4ffe76d01f7c7286b2ea5c964f9";

const WASM_MODULE_MAGIC: [u8; 4] = [0x00, 0x61, 0x73, 0x6d];
const WAMR_AOT_MAGIC: [u8; 4] = [0x00, 0x61, 0x6f, 0x74];

/// Private component-profile mint. Never serialized.
struct Signet {
    _private: (),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Envelope {
    pub abi: String,
    pub build_point: String,
    pub capability_digest: String,
    pub component_digest: String,
    pub dependency_closure_digest: String,
    pub epoch: u64,
    pub evidence_set_digest: String,
    pub policy_digest: String,
    pub schema_version: String,
    pub target: String,
    pub envelope_digest: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaxSeal {
    pub schema_version: String,
    pub kind: String,
    pub envelope_digest: String,
    pub profile_digest: String,
    pub terminal_outcome: String,
    pub authentication: String,
    pub authorizing: bool,
    pub replayable: bool,
    pub seal_digest: String,
}

#[derive(Debug)]
pub struct VerifyError {
    failure_id: &'static str,
}

impl VerifyError {
    fn refused(failure_id: &'static str) -> Self {
        Self { failure_id }
    }

    #[must_use]
    pub const fn failure_id(&self) -> &'static str {
        self.failure_id
    }
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.failure_id)
    }
}

impl From<VokFailure> for VerifyError {
    fn from(failure: VokFailure) -> Self {
        Self {
            failure_id: failure.failure_id(),
        }
    }
}

impl From<io::Error> for VerifyError {
    fn from(_: io::Error) -> Self {
        Self {
            failure_id: "VOK_VERIFIER_IO",
        }
    }
}

#[must_use]
pub fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[must_use]
pub fn framed_digest(domain: &str, payload: &str) -> String {
    let mut framed = String::with_capacity(domain.len() + payload.len() + 32);
    framed.push_str(&domain.len().to_string());
    framed.push(':');
    framed.push_str(domain);
    framed.push_str(&payload.len().to_string());
    framed.push(':');
    framed.push_str(payload);
    let digest = sha256::sha256(framed.as_bytes());
    let mut out = String::from("sha256:");
    out.push_str(&hex_lower(&digest));
    out
}

#[must_use]
pub fn sha256_prefaced(bytes: &[u8]) -> String {
    let mut out = String::from("sha256:");
    out.push_str(&hex_lower(&sha256::sha256(bytes)));
    out
}

fn digest_is_zero(digest: &[u8; 32]) -> bool {
    digest.iter().all(|byte| *byte == 0)
}

fn wasm_magic_at(bytes: &[u8], offset: usize) -> bool {
    bytes
        .get(offset..offset.saturating_add(4))
        .is_some_and(|window| window == WASM_MODULE_MAGIC)
}

fn wamr_aot_at(bytes: &[u8], offset: usize) -> bool {
    bytes
        .get(offset..offset.saturating_add(4))
        .is_some_and(|window| window == WAMR_AOT_MAGIC)
}

/// Scans every 4-byte window. Returns how many windows equal `\0asm`.
#[must_use]
pub fn wasm_magic_windows(bytes: &[u8]) -> usize {
    bytes
        .windows(4)
        .filter(|window| *window == WASM_MODULE_MAGIC)
        .count()
}

fn envelope_canonical(envelope: &Envelope) -> String {
    format!(
        "abi={}\nbuildPoint={}\ncapabilityDigest={}\ncomponentDigest={}\ndependencyClosureDigest={}\nepoch={}\nevidenceSetDigest={}\npolicyDigest={}\nschemaVersion={}\ntarget={}\n",
        envelope.abi,
        envelope.build_point,
        envelope.capability_digest,
        envelope.component_digest,
        envelope.dependency_closure_digest,
        envelope.epoch,
        envelope.evidence_set_digest,
        envelope.policy_digest,
        envelope.schema_version,
        envelope.target
    )
}

fn seal_canonical(seal: &WaxSeal) -> String {
    format!(
        "authentication={}\nauthorizing={}\nenvelopeDigest={}\nkind={}\nprofileDigest={}\nreplayable={}\nschemaVersion={}\nterminalOutcome={}\n",
        seal.authentication,
        if seal.authorizing { "true" } else { "false" },
        seal.envelope_digest,
        seal.kind,
        seal.profile_digest,
        if seal.replayable { "true" } else { "false" },
        seal.schema_version,
        seal.terminal_outcome
    )
}

fn validate_build_point(build_point: &str) -> Result<(), VerifyError> {
    let rest = build_point
        .strip_prefix("git:")
        .ok_or_else(|| VerifyError::refused("VOK_BUILD_POINT_INVALID"))?;
    if rest.len() != 40 || !rest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(VerifyError::refused("VOK_BUILD_POINT_INVALID"));
    }
    Ok(())
}

fn issue_vok_receipt(digest: [u8; 32]) -> Result<(), VerifyError> {
    let target = native::current_target()
        .ok_or_else(|| VerifyError::refused("VOK_NATIVE_TARGET_UNSUPPORTED"))?;
    let object = native::encode_return_u64_object(7, target);
    if object.len() != RETURN_U64_OBJECT_BYTES {
        return Err(VerifyError::refused("VOK_NATIVE_OBJECT_LENGTH"));
    }
    let loaded = WamrLoadedDigest::from_authority_output(digest)?;
    let context = AuthorityContext::new([0x11; 32], [0x22; 32], [0x33; 32], 1, 1);
    let tag = AuthorityTag::parse("slide.vok.execute.v1")?;
    let request = MintRequest::new(tag, context.clone(), [Trit::Admit; 8], object.to_vec())
        .with_wamr_loaded_digest(loaded)?;
    let ceiling = RETURN_U64_OBJECT_BYTES.max(1);
    let mut table = AuthorityTable::new(1, ceiling, context.clone(), OsNonceSource)?;
    let admitted = table.mint_admitted(request)?;
    let lease = table.open_lease_for_artifact(admitted, &context, &digest)?;
    table.consume_lease_for_artifact(lease, &context, Trit::Admit, &digest)?;
    Ok(())
}

/// Independently hash `bytes`, bind an Envelope, mint a process-local
/// Signet, consume it, and emit a terminal non-authorizing Wax Seal plus
/// an in-process VOK admit/lease/receipt over a native object. Never
/// takes a caller digest.
pub fn verify_wasm_artifact(bytes: &[u8], build_point: &str) -> Result<(Envelope, WaxSeal), VerifyError> {
    if bytes.is_empty() {
        return Err(VerifyError::refused("VOK_ARTIFACT_EMPTY"));
    }
    validate_build_point(build_point)?;
    let digest = sha256::sha256(bytes);
    if digest_is_zero(&digest) {
        return Err(VerifyError::refused("VOK_ARTIFACT_DIGEST_MISSING"));
    }
    if wamr_aot_at(bytes, 0) {
        return Err(VerifyError::refused("VOK_AOT_REFUSED"));
    }
    let windows = wasm_magic_windows(bytes);
    if windows == 0 || !wasm_magic_at(bytes, 0) {
        return Err(VerifyError::refused("VOK_WASM_MAGIC_MISSING"));
    }

    let signet = Signet { _private: () };
    let component_digest = sha256_prefaced(bytes);
    let mut envelope = Envelope {
        abi: ABI.to_string(),
        build_point: build_point.to_string(),
        capability_digest: framed_digest(CAPABILITY_DOMAIN, "none"),
        component_digest,
        dependency_closure_digest: framed_digest(DEPS_DOMAIN, "closed"),
        epoch: EPOCH,
        evidence_set_digest: framed_digest(EVIDENCE_DOMAIN, "synthetic"),
        policy_digest: framed_digest(POLICY_DOMAIN, POLICY_ID),
        schema_version: SCHEMA_VERSION.to_string(),
        target: TARGET.to_string(),
        envelope_digest: String::new(),
    };
    envelope.envelope_digest = framed_digest(ENVELOPE_DOMAIN, &envelope_canonical(&envelope));

    issue_vok_receipt(digest)?;
    let _ = signet;

    let mut seal = WaxSeal {
        schema_version: SCHEMA_VERSION.to_string(),
        kind: "WAX_SEAL".to_string(),
        envelope_digest: envelope.envelope_digest.clone(),
        profile_digest: framed_digest(PROFILE_DOMAIN, POLICY_ID),
        terminal_outcome: "CONSUMED".to_string(),
        authentication: "PINNED_CHILD_PIPE".to_string(),
        authorizing: false,
        replayable: false,
        seal_digest: String::new(),
    };
    seal.seal_digest = framed_digest(SEAL_DOMAIN, &seal_canonical(&seal));
    Ok((envelope, seal))
}

#[must_use]
pub fn envelope_file_body(envelope: &Envelope) -> String {
    let mut body = envelope_canonical(envelope);
    body.push_str("envelopeDigest=");
    body.push_str(&envelope.envelope_digest);
    body.push('\n');
    body
}

#[must_use]
pub fn seal_file_body(seal: &WaxSeal) -> String {
    let mut body = seal_canonical(seal);
    body.push_str("sealDigest=");
    body.push_str(&seal.seal_digest);
    body.push('\n');
    body
}

pub fn write_verdict_files(
    envelope: &Envelope,
    seal: &WaxSeal,
    envelope_path: &Path,
    seal_path: &Path,
) -> Result<(), VerifyError> {
    fs::write(envelope_path, envelope_file_body(envelope))?;
    fs::write(seal_path, seal_file_body(seal))?;
    Ok(())
}

pub fn verify_wasm_file(
    artifact_path: &Path,
    envelope_path: &Path,
    seal_path: &Path,
    build_point: &str,
) -> Result<(), VerifyError> {
    let bytes = fs::read(artifact_path)?;
    let (envelope, seal) = verify_wasm_artifact(&bytes, build_point)?;
    write_verdict_files(&envelope, &seal, envelope_path, seal_path)
}

const MAX_STDIN_BYTES: usize = 16 * 1024 * 1024;
const VERDICT_FRAME_MAGIC: &str = "GALERINA_VOK_VERDICT_V1\n";

pub fn read_bounded_stdin() -> Result<Vec<u8>, VerifyError> {
    let mut bytes = Vec::new();
    let mut stdin = io::stdin().lock();
    let mut buf = [0_u8; 8192];
    loop {
        let n = stdin.read(&mut buf)?;
        if n == 0 {
            break;
        }
        if bytes.len().saturating_add(n) > MAX_STDIN_BYTES {
            return Err(VerifyError::refused("VOK_ARTIFACT_TOO_LARGE"));
        }
        bytes.extend_from_slice(&buf[..n]);
    }
    Ok(bytes)
}

#[must_use]
pub fn framed_verdict_bytes(envelope: &Envelope, seal: &WaxSeal) -> Vec<u8> {
    let env_body = envelope_file_body(envelope);
    let seal_body = seal_file_body(seal);
    let mut out = Vec::with_capacity(
        VERDICT_FRAME_MAGIC.len() + env_body.len() + seal_body.len() + 64,
    );
    out.extend_from_slice(VERDICT_FRAME_MAGIC.as_bytes());
    out.extend_from_slice(format!("ENVELOPE {}\n", env_body.len()).as_bytes());
    out.extend_from_slice(env_body.as_bytes());
    out.extend_from_slice(format!("SEAL {}\n", seal_body.len()).as_bytes());
    out.extend_from_slice(seal_body.as_bytes());
    out
}

pub fn write_verdict_stdout(envelope: &Envelope, seal: &WaxSeal) -> Result<(), VerifyError> {
    let framed = framed_verdict_bytes(envelope, seal);
    let mut stdout = io::stdout().lock();
    stdout.write_all(&framed)?;
    stdout.flush()?;
    Ok(())
}

pub fn verify_wasm_stdin(build_point: &str) -> Result<(Envelope, WaxSeal), VerifyError> {
    let bytes = read_bounded_stdin()?;
    verify_wasm_artifact(&bytes, build_point)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN_WASM: [u8; 8] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

    #[test]
    fn policy_capability_kats() {
        assert_eq!(
            framed_digest(POLICY_DOMAIN, POLICY_ID),
            "sha256:321112a847a44df3a57eb50dff5a1bb4fa16b22d320547046798dc45a1690c2a"
        );
        assert_eq!(
            framed_digest(CAPABILITY_DOMAIN, "none"),
            "sha256:333691431785480289b9a88e0a4c4733e0462aaed9083046a4436db55ad1668b"
        );
        assert_eq!(
            framed_digest(DEPS_DOMAIN, "closed"),
            "sha256:ae6361e9351d5779d3038f8e904f48bf2899daff46644c798b487a6e65fb5359"
        );
        assert_eq!(
            framed_digest(EVIDENCE_DOMAIN, "synthetic"),
            "sha256:55f467c665c77c5b4badbd3632494248dc1c98b2ab0107fb3e131c1fcc295762"
        );
        assert_eq!(
            framed_digest(PROFILE_DOMAIN, POLICY_ID),
            "sha256:d99e174493b76187c0f775df11dc41d9b7104d5019b32e44a9243aacf8574b38"
        );
    }

    #[test]
    fn framed_matches_length_colon_domain_len_payload() {
        let payload = "abi=x\n";
        assert_eq!(
            framed_digest(ENVELOPE_DOMAIN, payload),
            "sha256:d8fc019c1cdb9f06e3adc2f46d3c7fe4a00f5674e6700910f0f32e838300cfdc"
        );
    }

    #[test]
    fn hashes_whole_input_independently() {
        let (envelope, seal) =
            verify_wasm_artifact(&MIN_WASM, DEFAULT_BUILD_POINT).expect("min wasm");
        let mut expected = String::from("sha256:");
        expected.push_str(&hex_lower(&sha256::sha256(&MIN_WASM)));
        assert_eq!(envelope.component_digest, expected);
        assert!(!seal.authorizing);
        assert!(!seal.replayable);
        assert_eq!(seal.kind, "WAX_SEAL");
        assert_eq!(seal.authentication, "PINNED_CHILD_PIPE");
        assert_eq!(seal.terminal_outcome, "CONSUMED");
        assert_eq!(seal.envelope_digest, envelope.envelope_digest);
        assert_eq!(
            envelope.envelope_digest,
            framed_digest(ENVELOPE_DOMAIN, &envelope_canonical(&envelope))
        );
        assert_eq!(
            seal.seal_digest,
            framed_digest(SEAL_DOMAIN, &seal_canonical(&seal))
        );
    }

    #[test]
    fn empty_and_missing_magic_refuse() {
        let empty = verify_wasm_artifact(&[], DEFAULT_BUILD_POINT).unwrap_err();
        assert_eq!(empty.failure_id(), "VOK_ARTIFACT_EMPTY");
        let native = verify_wasm_artifact(&[0x47, 0x56, 0x45, 0x4f], DEFAULT_BUILD_POINT)
            .unwrap_err();
        assert_eq!(native.failure_id(), "VOK_WASM_MAGIC_MISSING");
    }

    #[test]
    fn aot_magic_refuses() {
        let aot = [0x00, 0x61, 0x6f, 0x74, 0x01, 0x00, 0x00, 0x00];
        let error = verify_wasm_artifact(&aot, DEFAULT_BUILD_POINT).unwrap_err();
        assert_eq!(error.failure_id(), "VOK_AOT_REFUSED");
    }

    #[test]
    fn whole_input_scan_sees_interior_magic_but_requires_offset_zero() {
        let mut prefixed = vec![0xff];
        prefixed.extend_from_slice(&MIN_WASM);
        assert_eq!(wasm_magic_windows(&prefixed), 1);
        assert!(!wasm_magic_at(&prefixed, 0));
        let error = verify_wasm_artifact(&prefixed, DEFAULT_BUILD_POINT).unwrap_err();
        assert_eq!(error.failure_id(), "VOK_WASM_MAGIC_MISSING");
        assert_eq!(wasm_magic_windows(&MIN_WASM), 1);
        assert!(wasm_magic_at(&MIN_WASM, 0));
    }

    #[test]
    fn tamper_changes_component_digest() {
        let (clean, _) =
            verify_wasm_artifact(&MIN_WASM, DEFAULT_BUILD_POINT).expect("min wasm");
        let mut tampered = MIN_WASM;
        tampered[7] ^= 0x01;
        let (dirty, _) =
            verify_wasm_artifact(&tampered, DEFAULT_BUILD_POINT).expect("tampered still wasm");
        assert_ne!(clean.component_digest, dirty.component_digest);
        assert_ne!(clean.envelope_digest, dirty.envelope_digest);
    }

    #[test]
    fn verify_api_has_no_caller_digest_parameter() {
        let _ = verify_wasm_artifact as fn(&[u8], &str) -> Result<(Envelope, WaxSeal), VerifyError>;
    }

    #[test]
    fn invalid_build_point_refuses() {
        let error = verify_wasm_artifact(&MIN_WASM, "not-git").unwrap_err();
        assert_eq!(error.failure_id(), "VOK_BUILD_POINT_INVALID");
    }

    #[test]
    fn framed_verdict_starts_with_magic_and_pipe_auth() {
        let (envelope, seal) =
            verify_wasm_artifact(&MIN_WASM, DEFAULT_BUILD_POINT).expect("min wasm");
        let framed = framed_verdict_bytes(&envelope, &seal);
        let text = std::str::from_utf8(&framed).expect("utf8");
        assert!(text.starts_with("GALERINA_VOK_VERDICT_V1\nENVELOPE "));
        assert!(text.contains("SEAL "));
        assert!(text.contains("authentication=PINNED_CHILD_PIPE\n"));
        assert!(!text.contains("UNAUTHENTICATED_REFERENCE"));
    }
}
