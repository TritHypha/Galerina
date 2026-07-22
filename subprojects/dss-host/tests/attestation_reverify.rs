//! F3 — the sidecar re-verifies a module's #173 attestation BEFORE instantiating (interop + tamper).
//!
//! Proves both halves of closing the admission gap:
//!   (a) INTEROP  — a Node `signWasm` attestation verifies in Rust, and ONLY then does the module load.
//!   (b) FAIL-CLOSED — a tampered wasm / re-labeled profile / corrupt signature / missing attestation is
//!       REJECTED and the module is NOT instantiated. No "Node already checked" (materialise-once).
//!
//! Fixture (generated, gitignored — run: node tools/export-differential-fixture.mjs):
//!   fixtures/supervisor.wasm · fixtures/attestation.json {sha256, signature(b64), profile, publicKeyRawB64}.

use base64::Engine as _; // brings the `.decode()` method into scope without shadowing wasmtime::Engine
use dss_host::admission::{verify_admission, AdmissionPolicy, Attestation};
use std::collections::HashMap;
use std::path::PathBuf;
use wasmtime::{Caller, Config, Engine, Linker, Module, Store};

fn fx(name: &str) -> PathBuf {
    [env!("CARGO_MANIFEST_DIR"), "fixtures", name].iter().collect()
}
fn b64(s: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD.decode(s).expect("valid base64")
}

struct Fixture {
    wasm: Vec<u8>,
    att: Attestation,
    pubkey: [u8; 32],
}
fn load() -> Fixture {
    let wasm = std::fs::read(fx("supervisor.wasm"))
        .expect("missing supervisor.wasm — run: node tools/export-differential-fixture.mjs");
    let raw = std::fs::read(fx("attestation.json"))
        .expect("missing attestation.json — run: node tools/export-differential-fixture.mjs");
    let j: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    let att = Attestation {
        sha256: j["sha256"].as_str().unwrap().to_string(),
        signature: Some(b64(j["signature"].as_str().unwrap())),
        profile: j["profile"].as_str().unwrap().to_string(),
    };
    let pubkey: [u8; 32] = b64(j["publicKeyRawB64"].as_str().unwrap())
        .as_slice()
        .try_into()
        .expect("32-byte Ed25519 key");
    Fixture { wasm, att, pubkey }
}
fn signed_policy(pk: [u8; 32]) -> AdmissionPolicy {
    AdmissionPolicy {
        require_signed: true,
        require_certified_profile: false,
        public_key_raw: Some(pk),
        allowed_hashes: vec![],
    }
}

#[test]
fn interop_verify_then_instantiate() -> anyhow::Result<()> {
    let f = load();
    let v = verify_admission(&f.wasm, Some(&f.att), &signed_policy(f.pubkey));
    assert!(v.ok, "Node-signed #173 attestation must verify in Rust (interop): {:?}", v.reason);
    // The F3 ordering: a module loads ONLY after a green admission.
    instantiate(&f.wasm)?;
    println!("F3: Node signWasm attestation re-verified in Rust; module admitted + instantiated OK");
    Ok(())
}

#[test]
fn tampered_wasm_rejected() {
    let mut f = load();
    f.wasm[0] ^= 0xFF; // corrupt the module bytes
    let v = verify_admission(&f.wasm, Some(&f.att), &signed_policy(f.pubkey));
    assert!(!v.ok, "a tampered wasm must be rejected");
    assert!(
        v.reason.as_deref().unwrap_or("").contains("hash"),
        "expected a hash-mismatch rejection, got {:?}",
        v.reason
    );
}

#[test]
fn relabeled_profile_rejected() {
    let mut f = load();
    f.att.profile = "certified".to_string(); // dev -> certified: #173 binds profile, so the sig fails
    let v = verify_admission(&f.wasm, Some(&f.att), &signed_policy(f.pubkey));
    assert!(!v.ok, "a re-labeled profile must be rejected (#173 profile binding): {:?}", v);
}

#[test]
fn corrupt_signature_rejected() {
    let mut f = load();
    if let Some(sig) = f.att.signature.as_mut() {
        sig[0] ^= 0xFF;
    }
    let v = verify_admission(&f.wasm, Some(&f.att), &signed_policy(f.pubkey));
    assert!(!v.ok, "a corrupt signature must be rejected: {:?}", v);
}

#[test]
fn missing_attestation_rejected() {
    let f = load();
    let v = verify_admission(&f.wasm, None, &signed_policy(f.pubkey));
    assert_eq!(v.reason.as_deref(), Some("no attestation provided"));
    assert!(!v.ok);
}

/// Minimal instantiate — F3 proves the GATE; the M1 harness proves execution. Supplies the 3 host
/// imports the supervisor declares so a green-admitted module actually loads.
fn instantiate(wasm: &[u8]) -> anyhow::Result<()> {
    let mut cfg = Config::new();
    cfg.consume_fuel(true);
    let engine = Engine::new(&cfg)?;
    let module = Module::new(&engine, wasm)?;
    let mut linker: Linker<HashMap<i32, String>> = Linker::new(&engine);
    linker.func_wrap("host", "audit.write", |_c: Caller<'_, HashMap<i32, String>>, _a: i32, _b: i32| -> i32 { 0 })?;
    linker.func_wrap("host", "audit.log", |_c: Caller<'_, HashMap<i32, String>>, _a: i32, _b: i32| -> i32 { 0 })?;
    linker.func_wrap("host", "__str_eq", |_c: Caller<'_, HashMap<i32, String>>, a: i32, b: i32| -> i32 { if a == b { 1 } else { 0 } })?;
    let mut store = Store::new(&engine, HashMap::new());
    store.set_fuel(1_000_000_000)?;
    linker.instantiate(&mut store, &module)?;
    Ok(())
}
