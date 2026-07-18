/**
 * seam-adapters.test.mjs — the injectable seam providers (RD-0361 R4 / #143; R&D ruling 2026-07-18 model A).
 *
 * Driven with REAL crypto (generateRunnerKeypair/signWasm) and a REAL (hand-encoded) WASM module, then wired
 * through core-runtime's ACTUAL createGovernedRuntimeExecutor — so the whole border-safe path is exercised end
 * to end, not mocked. The load-bearing pins: (1) a valid signature admits a DEFINED export; (2) the HARD
 * export-presence gate DENIES a valid signature over a module that does not define the requested export (the
 * one way model A could drift open) — and denies it at ADMISSION, before the VM is ever touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  wasmHash, generateRunnerKeypair, signWasm,
  hashArtifact, serializeAttestation, parseAttestation,
  createWasmAdmissionVerifier, createLowLevelWasmExecutor, createBorderSafeRuntimeDeps,
} from "../dist/index.js";
import { GOVERNED_RUNTIME_SEAM_VERSION, createGovernedRuntimeExecutor } from "@galerina/core-runtime";

// A minimal, VALID wasm module exporting: add(i32,i32)->i32 (i32.add) and boom()->() (unreachable → traps).
const WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,                    // magic + version
  0x01, 0x0a, 0x02, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x60, 0x00, 0x00, // types: (i32,i32)->i32 , ()->()
  0x03, 0x03, 0x02, 0x00, 0x01,                                     // funcs: f0:type0, f1:type1
  0x07, 0x0e, 0x02, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x04, 0x62, 0x6f, 0x6f, 0x6d, 0x00, 0x01, // export "add"→f0, "boom"→f1
  0x0a, 0x0d, 0x02, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b, 0x03, 0x00, 0x00, 0x0b,       // code: add body, boom body
]);

// A module that IMPORTS env.foo — the closed host set (only "host") does not provide "env" → LinkError.
const IMPORT_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,                                // type: ()->()
  0x02, 0x0b, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x03, 0x66, 0x6f, 0x6f, 0x00, 0x00, // import "env" "foo" func type0
]);

const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
const SHA = wasmHash(WASM);
const att = signWasm(WASM, privateKeyPem, "dev");
const wire = serializeAttestation(att);
const policy = { requireSigned: true, publicKeyPem };
const V = GOVERNED_RUNTIME_SEAM_VERSION;
const sourceFor = (bytes, sha) => ({ seamVersion: V, artifactBytesFor: (s) => (s === sha ? bytes : undefined) });

// ── seam-version pin (keeps the local literal honest vs the real exported const) ────────────────────────────
test("adapters pin the runtime seam version (== @galerina/core-runtime GOVERNED_RUNTIME_SEAM_VERSION)", () => {
  assert.equal(createWasmAdmissionVerifier(policy).seamVersion, V);
  assert.equal(createLowLevelWasmExecutor().seamVersion, V);
  const deps = createBorderSafeRuntimeDeps({ policy });
  assert.equal(deps.admissionVerifier.seamVersion, V);
  assert.equal(deps.lowLevel.seamVersion, V);
});

test("hashArtifact is sha256 over the bytes", () => {
  assert.equal(hashArtifact(WASM), wasmHash(WASM));
  assert.equal(createBorderSafeRuntimeDeps({ policy }).hashArtifact(WASM), SHA);
});

// ── attestation wire format (fail-closed) ───────────────────────────────────────────────────────────────────
test("serialize/parse attestation round-trips; malformed → null (fail-closed)", () => {
  assert.deepEqual(parseAttestation(serializeAttestation(att)), att);
  assert.equal(parseAttestation("not json"), null);
  assert.equal(parseAttestation(""), null);
  assert.equal(parseAttestation(JSON.stringify({ sha256: "xyz", profile: "dev" })), null);           // bad hex
  assert.equal(parseAttestation(JSON.stringify({ sha256: SHA, profile: "root" })), null);            // bad profile
  assert.equal(parseAttestation(JSON.stringify({ sha256: SHA, profile: "dev", signature: 5 })), null); // bad sig type
});

// ── admission verifier (model A) ────────────────────────────────────────────────────────────────────────────
test("★ admission verifier: valid signature + DEFINED export → admit", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), true);
});

test("★ HARD export-presence gate: valid signature but UNDEFINED export → DENY (the model-A drift path, closed)", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: SHA, exportName: "not_an_export", artifactBytes: WASM }), false);
});

test("admission verifier: hash the composition bound us to ≠ attestation hash → deny (anti-replay)", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: "0".repeat(64), exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: tampered signature → deny", () => {
  const v = createWasmAdmissionVerifier(policy);
  const bad = { ...att, signature: Buffer.from("x".repeat(64)).toString("base64") };
  assert.equal(v.verifyAttestation({ attestation: serializeAttestation(bad), artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: unsigned attestation under requireSigned → deny", () => {
  const v = createWasmAdmissionVerifier(policy);
  const unsigned = JSON.stringify({ sha256: SHA, profile: "dev" });
  assert.equal(v.verifyAttestation({ attestation: unsigned, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: malformed wire → deny", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: "garbage", artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: certified policy REJECTS a dev attestation, ADMITS a certified one", () => {
  const certPolicy = { requireSigned: true, requireCertifiedProfile: true, publicKeyPem };
  const v = createWasmAdmissionVerifier(certPolicy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
  const certAtt = serializeAttestation(signWasm(WASM, privateKeyPem, "certified"));
  assert.equal(v.verifyAttestation({ attestation: certAtt, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), true);
});

// ── low-level executor (sync, numeric-fold ABI) ─────────────────────────────────────────────────────────────
test("★ low-level executor: instantiate + call a numeric export → ok + result", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "add", args: [2, 40] });
  assert.equal(r.ok, true);
  assert.equal(r.result, 42);
});

test("low-level executor: unknown export → deny", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "nope", args: [] });
  assert.equal(r.ok, false);
});

test("low-level executor: non-numeric arg is REFUSED (numeric-fold ABI only, no silent NaN→0)", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "add", args: ["1", 2] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /non-numeric/);
});

test("low-level executor: a trap (unreachable) is surfaced as a deny (not an ok)", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "boom", args: [] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /trap/);
});

test("low-level executor: unparseable bytes → deny", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: new Uint8Array([0, 1, 2, 3]), exportName: "add", args: [1, 2] });
  assert.equal(r.ok, false);
});

test("low-level executor: a module needing an import outside the closed host set → deny (LinkError classified)", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: IMPORT_WASM, exportName: "x", args: [] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /disallowed host import|instantiation failed/);
});

// ── end-to-end through the ACTUAL composition ───────────────────────────────────────────────────────────────
test("★ e2e: createBorderSafeRuntimeDeps → createGovernedRuntimeExecutor admits a signed twin call", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "add", args: [40, 2] });
  assert.equal(v.outcome, "admit");
  assert.equal(v.result, 42);
});

test("★ e2e: a request for an UNDEFINED export is denied at ADMISSION (never reaches the VM)", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "not_an_export", args: [] });
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /did not verify/);
});

test("★ e2e: an unsigned request is denied (admission before execution)", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const unsigned = JSON.stringify({ sha256: SHA, profile: "dev" });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: unsigned, exportName: "add", args: [1, 2] });
  assert.equal(v.outcome, "deny");
});

test("e2e: a defined-but-trapping export is admitted, then DENIED at execution (deny, not admit)", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "boom", args: [] });
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /low-level execution denied|trap/);
});
