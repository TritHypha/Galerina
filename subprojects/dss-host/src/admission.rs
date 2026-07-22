//! F3 — per-module admission re-verify (materialise-once, DP-RD-0247). The Rust sidecar re-verifies a
//! module's `#173` attestation BEFORE instantiating; it never trusts "Node already checked". This
//! mirrors the fail-closed chain of `galerina-core-runtime-wasm/src/wasm-runtime.ts` `verifyWasm`,
//! against the byte-identical `#173` pre-image the TS side signs.
//!
//! Crypto: `ed25519-dalek` (pure-Rust, owner-ruled bridge 0045). The F2 hybrid ML-DSA-65 half lands on
//! this same seam later (a second verify AND-ed in) — no C/asm re-enters the TCB.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};

/// Versioned domain tag — MUST stay byte-identical to `WASM_ADMIT_DOMAIN` in wasm-runtime.ts.
const WASM_ADMIT_DOMAIN: &str = "FUNGI-WASM-ADMIT-v1";

/// The `#173` domain-separated admission pre-image: `DOMAIN \0 sha256hex \0 profile` (UTF-8),
/// byte-identical to `admissionPreimage()` in wasm-runtime.ts. Binding the profile INTO the pre-image
/// closes the dev->certified re-label escalation: a flipped profile changes the bytes, so the signature
/// no longer verifies.
fn admission_preimage(sha256_hex: &str, profile: &str) -> Vec<u8> {
    format!("{WASM_ADMIT_DOMAIN}\0{sha256_hex}\0{profile}").into_bytes()
}

/// sha256 hex of the wasm bytes — matches `wasmHash()` in wasm-runtime.ts.
pub fn wasm_hash_hex(wasm: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(64);
    for b in Sha256::digest(wasm) {
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// A module admission attestation (the TS `WasmAttestation`). `signature` is the RAW 64-byte Ed25519
/// value (`ieee-p1363`); the caller decodes any base64/transport encoding before this TCB boundary.
pub struct Attestation {
    pub sha256: String,
    pub signature: Option<Vec<u8>>,
    pub profile: String,
}

/// The admission policy (the subset of the TS `AdmissionPolicy` the `#173` verify needs).
pub struct AdmissionPolicy {
    pub require_signed: bool,
    pub require_certified_profile: bool,
    pub public_key_raw: Option<[u8; 32]>,
    pub allowed_hashes: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdmissionVerdict {
    pub ok: bool,
    pub reason: Option<String>,
    pub hash: String,
}

/// Fail-closed admission re-verify. Mirrors `verifyWasm()`: a missing attestation, a hash mismatch, a
/// profile shortfall, an unpinned hash, or a missing/invalid signature ALL reject. Certified => signed
/// (forced, RD-0236 #11). Performs NO instantiation — a pure gate the caller consults BEFORE load.
pub fn verify_admission(
    wasm: &[u8],
    attestation: Option<&Attestation>,
    policy: &AdmissionPolicy,
) -> AdmissionVerdict {
    let require_signed = policy.require_signed || policy.require_certified_profile; // certified => signed
    let hash = wasm_hash_hex(wasm);
    let reject = |reason: String| AdmissionVerdict { ok: false, reason: Some(reason), hash: hash.clone() };

    let att = match attestation {
        Some(a) => a,
        None => return reject("no attestation provided".into()),
    };
    if att.sha256 != hash {
        return reject(format!("attestation hash {} != binary hash {}", att.sha256, hash));
    }
    if policy.require_certified_profile && att.profile != "certified" {
        return reject(format!("certified profile required, attestation is \"{}\"", att.profile));
    }
    if !policy.allowed_hashes.is_empty() && !policy.allowed_hashes.iter().any(|h| h == &hash) {
        return reject(format!("binary hash not pinned: {hash}"));
    }
    if require_signed {
        let sig_bytes = match &att.signature {
            Some(s) => s,
            None => return reject("signature required but absent".into()),
        };
        let pk_raw = match &policy.public_key_raw {
            Some(k) => k,
            None => return reject("no public key configured to verify signature".into()),
        };
        let sig_arr: [u8; 64] = match sig_bytes.as_slice().try_into() {
            Ok(a) => a,
            Err(_) => return reject(format!("signature is not 64 bytes ({} given)", sig_bytes.len())),
        };
        let signature = Signature::from_bytes(&sig_arr);
        let vk = match VerifyingKey::from_bytes(pk_raw) {
            Ok(v) => v,
            Err(_) => return reject("public key is not a valid Ed25519 key".into()),
        };
        // #173: verify over (domain || recomputed-hash || attestation.profile). `hash` was already
        // checked === att.sha256 above, so a flipped profile changes the pre-image and this fails.
        if vk.verify(&admission_preimage(&hash, &att.profile), &signature).is_err() {
            return reject("signature verification failed".into());
        }
    }
    AdmissionVerdict { ok: true, reason: None, hash }
}
