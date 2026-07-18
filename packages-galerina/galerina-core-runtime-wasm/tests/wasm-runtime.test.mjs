// wasm-runtime.test.mjs — the border-safe TCB owns this surface, so it verifies it here (not only via the
// compiler's re-export). Covers the admission gate's FAIL-CLOSED contract: deterministic hashing, a genuine
// sign→verify roundtrip, and refusal on a missing / tampered / profile-mismatched attestation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm,
} from "../dist/index.js";

const bin = (bytes) => new Uint8Array(bytes);

test("wasmHash is deterministic sha256 hex", () => {
  const a = wasmHash(bin([1, 2, 3]));
  const b = wasmHash(bin([1, 2, 3]));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, wasmHash(bin([1, 2, 4]))); // different bytes → different hash
});

test("sign → verify roundtrip admits a genuine attestation", () => {
  const wasm = bin([10, 20, 30, 40]);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const att = signWasm(wasm, privateKeyPem, "certified");
  const v = verifyWasm(wasm, att, { requireSigned: true, publicKeyPem, requireCertifiedProfile: true });
  assert.equal(v.ok, true);
});

test("FAIL-CLOSED: no attestation is refused", () => {
  const v = verifyWasm(bin([1]), undefined, { requireSigned: true, publicKeyPem: "x" });
  assert.equal(v.ok, false);
});

test("FAIL-CLOSED: a tampered binary breaks the signature", () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const att = signWasm(bin([1, 2, 3]), privateKeyPem, "certified");
  // verify the SAME attestation against DIFFERENT bytes → hash mismatch, refused
  const v = verifyWasm(bin([1, 2, 9]), att, { requireSigned: true, publicKeyPem });
  assert.equal(v.ok, false);
});

test("FAIL-CLOSED: a dev attestation cannot pass a certified-required policy (profile bound into the signature)", () => {
  const wasm = bin([5, 5, 5]);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const devAtt = signWasm(wasm, privateKeyPem, "dev");
  // re-labelling to certified must not verify — the profile is inside the signed pre-image (#173)
  const forged = { ...devAtt, profile: "certified" };
  const v = verifyWasm(wasm, forged, { requireSigned: true, publicKeyPem, requireCertifiedProfile: true });
  assert.equal(v.ok, false);
});
