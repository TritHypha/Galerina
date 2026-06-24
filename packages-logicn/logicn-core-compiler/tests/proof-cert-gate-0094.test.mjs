// #0094 — certified-profile zk_snark_receipt admission is fail-closed (deny-by-default).
//
// A Phase-1 PLACEHOLDER circuit's verify() is a deterministic recompute over PUBLIC inputs, so a
// forged proof passes it. generateEpilogueReceipt used to inject the backend's proof into the
// receipt with NO verify() and NO certified gate — a forged proof could ride into a halt_pipeline
// receipt. In a certified profile the receipt builder now REFUSES a placeholder / undecodable /
// unverified proof (zkRejected, LLN-PROOF-CERT-001/002; zkProof absent). Dev / pre-ceremony
// (certified !== true) keeps the lenient behaviour. Mirrors the rd-0094 acceptance oracle (B5a-d).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateEpilogueReceipt } from "../dist/index.js";

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64");
const placeholderProof = {
  protocol: "groth16", curve: "bn128",
  proofBase64: b64({ circuitId: "logicn-sha256-v0.1", type: "groth16-phase1", inputHash: "x" }),
  verificationKeyHash: "vk", publicSignalsHash: "ps",
};
const genuineProof = {
  protocol: "groth16", curve: "bn128",
  proofBase64: b64({ circuitId: "logicn-groth16-bn128-v1.0", type: "groth16", inputHash: "x" }),
  verificationKeyHash: "vk", publicSignalsHash: "ps",
};
const opts = (over) => ({
  strategy: "zk_snark_receipt", onFailure: "halt_pipeline",
  sourceText: "secure flow pay() {}", contractHash: "sha256:deadbeef", ...over,
});
const backend = (proof, verifyResult) => ({
  prove: async () => proof,
  ...(verifyResult !== undefined ? { verify: async () => verifyResult } : {}),
});

test("#0094 certified: placeholder/forged proof is REFUSED (LLN-PROOF-CERT-001), not stored", async () => {
  const r = await generateEpilogueReceipt(opts({ certified: true, proverBackend: backend(placeholderProof, true) }));
  assert.equal(r.zkProof, undefined, "a forged placeholder proof must NOT be stored");
  assert.match(r.zkRejected ?? "", /LLN-PROOF-CERT-001/);
});

test("#0094 certified: genuine non-placeholder proof that verifies is ADMITTED", async () => {
  const r = await generateEpilogueReceipt(opts({ certified: true, proverBackend: backend(genuineProof, true) }));
  assert.ok(r.zkProof, "a genuine verified proof is admitted (gate is not blanket-deny)");
  assert.equal(r.zkRejected, undefined);
  assert.equal(r.zkProof.proofBase64, genuineProof.proofBase64);
});

test("#0094 certified: a proof that does NOT verify is REJECTED (LLN-PROOF-CERT-002)", async () => {
  const r = await generateEpilogueReceipt(opts({ certified: true, proverBackend: backend(genuineProof, false) }));
  assert.equal(r.zkProof, undefined);
  assert.match(r.zkRejected ?? "", /LLN-PROOF-CERT-002/);
});

test("#0094 certified deny-by-default: a non-placeholder proof with NO verifier supplied is REJECTED", async () => {
  const r = await generateEpilogueReceipt(opts({ certified: true, proverBackend: backend(genuineProof, undefined) }));
  assert.equal(r.zkProof, undefined, "cannot confirm without a verifier -> deny");
  assert.match(r.zkRejected ?? "", /LLN-PROOF-CERT-002/);
});

test("#0094 certified: an undecodable proof is REFUSED (deny-by-default)", async () => {
  const bad = { ...genuineProof, proofBase64: "@@@ not base64 json @@@" };
  const r = await generateEpilogueReceipt(opts({ certified: true, proverBackend: backend(bad, true) }));
  assert.equal(r.zkProof, undefined);
  assert.match(r.zkRejected ?? "", /LLN-PROOF-CERT-001/);
});

test("#0094 NON-certified (default): placeholder proof is STORED (dev/pre-ceremony back-compat)", async () => {
  const r = await generateEpilogueReceipt(opts({ proverBackend: backend(placeholderProof, true) }));
  assert.ok(r.zkProof, "non-certified keeps the lenient behaviour (placeholder allowed pre-ceremony)");
  assert.equal(r.zkRejected, undefined);
});
