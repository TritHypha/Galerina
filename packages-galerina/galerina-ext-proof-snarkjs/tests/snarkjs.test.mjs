// =============================================================================
// galerina-ext-proof-snarkjs — tests
//
// 10 tests using node:test verifying the GalerinaSnarkjsProver implementation.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { GalerinaSnarkjsProver, createSnarkjsProver } from "../dist/index.js";

const SAMPLE_INPUT = {
  sourceText: "flow validateUser(raw: String) -> protected User { contract { effects { none } } }",
  contractHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  resultJson: '{"userId":"u-001","status":"valid"}',
};

// ---------------------------------------------------------------------------
// Test 1: GalerinaSnarkjsProver satisfies ProverBackend interface
// ---------------------------------------------------------------------------
test("GalerinaSnarkjsProver satisfies ProverBackend interface", async () => {
  const prover = new GalerinaSnarkjsProver();

  // Must have prove, verify, circuitId
  assert.equal(typeof prover.prove, "function", "prove must be a function");
  assert.equal(typeof prover.verify, "function", "verify must be a function");
  assert.equal(typeof prover.circuitId, "string", "circuitId must be a string");
  assert.ok(prover.circuitId.length > 0, "circuitId must not be empty");
});

// ---------------------------------------------------------------------------
// Test 2: prove() returns a ZkProof with protocol: "groth16"
// ---------------------------------------------------------------------------
test('prove() returns a ZkProof with protocol: "groth16"', async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);

  assert.equal(proof.protocol, "groth16", 'protocol must be "groth16"');
  assert.equal(proof.curve, "bn128", 'curve must be "bn128"');
});

// ---------------------------------------------------------------------------
// Test 3: prove() returns a non-empty proofBase64
// ---------------------------------------------------------------------------
test("prove() returns a non-empty proofBase64", async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);

  assert.ok(typeof proof.proofBase64 === "string", "proofBase64 must be a string");
  assert.ok(proof.proofBase64.length > 0, "proofBase64 must not be empty");
});

// ---------------------------------------------------------------------------
// Test 4: proofBase64 decodes to valid JSON
// ---------------------------------------------------------------------------
test("proofBase64 decodes to valid JSON", async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);

  let decoded;
  assert.doesNotThrow(() => {
    decoded = JSON.parse(Buffer.from(proof.proofBase64, "base64").toString("utf8"));
  }, "proofBase64 must decode to valid JSON");

  assert.ok(decoded !== null && typeof decoded === "object", "decoded proof must be an object");
  // Check expected fields are present
  assert.ok("type" in decoded, "decoded proof must have a 'type' field");
  assert.ok("inputHash" in decoded, "decoded proof must have an 'inputHash' field");
  assert.ok("circuitId" in decoded, "decoded proof must have a 'circuitId' field");
});

// ---------------------------------------------------------------------------
// Test 5: verificationKeyHash is a 64-char hex string (sha256)
// ---------------------------------------------------------------------------
test("verificationKeyHash is a 64-char hex string", async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);

  assert.equal(typeof proof.verificationKeyHash, "string", "verificationKeyHash must be a string");
  assert.equal(proof.verificationKeyHash.length, 64, "verificationKeyHash must be 64 chars (sha256 hex)");
  assert.ok(/^[0-9a-f]{64}$/.test(proof.verificationKeyHash), "verificationKeyHash must be lowercase hex");
});

// ---------------------------------------------------------------------------
// Test 6: publicSignalsHash is a 64-char hex string
// ---------------------------------------------------------------------------
test("publicSignalsHash is a 64-char hex string", async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);

  assert.equal(typeof proof.publicSignalsHash, "string", "publicSignalsHash must be a string");
  assert.equal(proof.publicSignalsHash.length, 64, "publicSignalsHash must be 64 chars (sha256 hex)");
  assert.ok(/^[0-9a-f]{64}$/.test(proof.publicSignalsHash), "publicSignalsHash must be lowercase hex");
});

// ---------------------------------------------------------------------------
// Test 7: Same input produces the same proof (deterministic)
// ---------------------------------------------------------------------------
test("Same input produces the same proof (deterministic)", async () => {
  const prover = createSnarkjsProver();
  const proof1 = await prover.prove(SAMPLE_INPUT);
  const proof2 = await prover.prove(SAMPLE_INPUT);

  assert.equal(proof1.proofBase64, proof2.proofBase64, "proofBase64 must be identical for same input");
  assert.equal(proof1.verificationKeyHash, proof2.verificationKeyHash, "verificationKeyHash must be identical for same input");
  assert.equal(proof1.publicSignalsHash, proof2.publicSignalsHash, "publicSignalsHash must be identical for same input");
});

// ---------------------------------------------------------------------------
// Test 8: Different inputs produce different proofs
// ---------------------------------------------------------------------------
test("Different inputs produce different proofs", async () => {
  const prover = createSnarkjsProver();

  const inputA = { sourceText: "flow A() {}", contractHash: "aaaa" };
  const inputB = { sourceText: "flow B() {}", contractHash: "bbbb" };

  const proofA = await prover.prove(inputA);
  const proofB = await prover.prove(inputB);

  assert.notEqual(proofA.proofBase64, proofB.proofBase64, "Different inputs must produce different proofBase64");
  assert.notEqual(proofA.publicSignalsHash, proofB.publicSignalsHash, "Different inputs must produce different publicSignalsHash");
});

// ---------------------------------------------------------------------------
// Test 9: verify() returns true for a valid proof
// ---------------------------------------------------------------------------
test("verify() returns true for a valid proof", async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);
  const valid = await prover.verify(proof, SAMPLE_INPUT);

  assert.equal(valid, true, "verify() must return true for a proof generated with the same input");
});

// ---------------------------------------------------------------------------
// Test 10: verify() returns false for a tampered proof
// ---------------------------------------------------------------------------
test("verify() returns false for a tampered proof", async () => {
  const prover = createSnarkjsProver();
  const proof = await prover.prove(SAMPLE_INPUT);

  // Tamper with the proof by encoding a different JSON
  const tamperedProofObj = { type: "groth16-phase1", inputHash: "deadbeef".repeat(8), resultHash: "", circuitId: "galerina-sha256-v0.1" };
  const tamperedProof = {
    ...proof,
    proofBase64: Buffer.from(JSON.stringify(tamperedProofObj)).toString("base64"),
  };

  const valid = await prover.verify(tamperedProof, SAMPLE_INPUT);
  assert.equal(valid, false, "verify() must return false for a tampered proof");
});
