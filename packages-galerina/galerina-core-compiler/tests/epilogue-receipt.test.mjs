// =============================================================================
// Galerina — epilogue {} auto-policy / EpilogueReceipt tests
//
// Tests:
//   1. sha256_seal → receipt.strategy="sha256_seal", inputSeal starts "sha256:"
//   2. none        → strategy="none", no seals
//   3. no epilogue → no receipt entry in proofGraphs
//   4. zk_snark_receipt + halt_pipeline → zkReceiptStub contains "PENDING"
//   5. sha256_seal is deterministic
//   6. generateEpilogueReceipt with resultJson → outputSeal present
//   7. invalid strategy → SPORE-GOV-015 fired, no receipt
//   8. proofGraphs.get(flowName).epilogueReceipt is accessible via verifyGovernance
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProgram,
  verifyGovernance,
  generateEpilogueReceipt,
  checkEffects,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal governed Galerina program with an optional epilogue block.
 * epilogueClause is the raw text that goes inside contract { ... }, e.g.:
 *   "epilogue { generate_proof sha256_seal }"
 * Pass undefined to produce a flow without any epilogue block.
 */
function makeSource(epilogueClause) {
  const epilogue = epilogueClause != null ? `\n    ${epilogueClause}` : "";
  return `
flow testFlow(x: Int) -> Int
  contract {
    effects {
      database.read
    }${epilogue}
  }
{
  return x
}
`;
}

function parseAndVerify(source) {
  const parsed = parseProgram(source, "test.spore");
  const effectResults = checkEffects(parsed.flows, parsed.ast);
  const govResult = verifyGovernance(parsed.ast, parsed.flows, effectResults, "dev");
  return { parsed, govResult };
}

// ---------------------------------------------------------------------------
// Test 1: sha256_seal strategy produces a receipt with inputSeal
// ---------------------------------------------------------------------------
describe("epilogue-receipt", () => {
  it("1. sha256_seal → strategy='sha256_seal' and inputSeal starts with 'sha256:'", () => {
    const { govResult } = parseAndVerify(
      makeSource("epilogue { generate_proof sha256_seal }"),
    );
    const pg = govResult.proofGraphs.get("testFlow");
    assert.ok(pg, "ProofGraph should exist for testFlow");
    assert.ok(pg.epilogueReceipt, "EpilogueReceipt should be present");
    assert.equal(pg.epilogueReceipt.strategy, "sha256_seal");
    assert.ok(
      pg.epilogueReceipt.inputSeal?.startsWith("sha256:"),
      `inputSeal should start with 'sha256:' but got: ${pg.epilogueReceipt.inputSeal}`,
    );
    assert.equal(pg.epilogueReceipt.sealAlgorithm, "sha256");
  });

  // -------------------------------------------------------------------------
  // Test 2: none strategy → no seals
  // -------------------------------------------------------------------------
  it("2. none → strategy='none', no seals", () => {
    const { govResult } = parseAndVerify(
      makeSource("epilogue { generate_proof none }"),
    );
    const pg = govResult.proofGraphs.get("testFlow");
    assert.ok(pg, "ProofGraph should exist");
    assert.ok(pg.epilogueReceipt, "EpilogueReceipt should be present for 'none'");
    assert.equal(pg.epilogueReceipt.strategy, "none");
    assert.equal(pg.epilogueReceipt.inputSeal, undefined);
    assert.equal(pg.epilogueReceipt.outputSeal, undefined);
    assert.equal(pg.epilogueReceipt.sealAlgorithm, undefined);
  });

  // -------------------------------------------------------------------------
  // Test 3: no epilogue block → no receipt
  // -------------------------------------------------------------------------
  it("3. no epilogue block → no epilogueReceipt on ProofGraph", () => {
    const { govResult } = parseAndVerify(makeSource(undefined));
    const pg = govResult.proofGraphs.get("testFlow");
    assert.ok(pg, "ProofGraph should exist");
    assert.equal(
      pg.epilogueReceipt,
      undefined,
      "epilogueReceipt should be absent when no epilogue block declared",
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: zk_snark_receipt + halt_pipeline → zkReceiptStub contains "PENDING"
  // -------------------------------------------------------------------------
  it("4. zk_snark_receipt + halt_pipeline → zkReceiptStub contains 'groth16-phase1'", () => {
    const { govResult } = parseAndVerify(
      makeSource(
        "epilogue { generate_proof zk_snark_receipt on_verification_failure halt_pipeline }",
      ),
    );
    const pg = govResult.proofGraphs.get("testFlow");
    assert.ok(pg, "ProofGraph should exist");
    assert.ok(pg.epilogueReceipt, "EpilogueReceipt should be present");
    assert.equal(pg.epilogueReceipt.strategy, "zk_snark_receipt");
    assert.ok(
      pg.epilogueReceipt.zkReceiptStub?.includes("groth16-phase1"),
      `zkReceiptStub should contain 'groth16-phase1' but got: ${pg.epilogueReceipt.zkReceiptStub}`,
    );
    assert.equal(pg.epilogueReceipt.onFailure, "halt_pipeline");
  });

  // -------------------------------------------------------------------------
  // Test 5: sha256_seal is deterministic
  // -------------------------------------------------------------------------
  it("5. sha256_seal is deterministic — same source produces same hash", () => {
    const r1 = generateEpilogueReceipt({
      strategy: "sha256_seal",
      onFailure: "log_and_continue",
      sourceText: "flow testFlow(x: Int) -> Int { return x }",
      contractHash: "testFlow",
    });
    const r2 = generateEpilogueReceipt({
      strategy: "sha256_seal",
      onFailure: "log_and_continue",
      sourceText: "flow testFlow(x: Int) -> Int { return x }",
      contractHash: "testFlow",
    });
    assert.equal(r1.inputSeal, r2.inputSeal, "inputSeal must be deterministic");
    assert.ok(r1.inputSeal?.startsWith("sha256:"), "inputSeal should start with sha256:");
  });

  // -------------------------------------------------------------------------
  // Test 6: generateEpilogueReceipt with resultJson → outputSeal present
  // -------------------------------------------------------------------------
  it("6. generateEpilogueReceipt with resultJson → outputSeal is set", () => {
    const r = generateEpilogueReceipt({
      strategy: "sha256_seal",
      onFailure: "log_and_continue",
      sourceText: "some source",
      contractHash: "flowX",
      resultJson: '{"value":42}',
    });
    assert.ok(r.outputSeal, "outputSeal should be present when resultJson is provided");
    assert.ok(
      r.outputSeal.startsWith("sha256:"),
      `outputSeal should start with 'sha256:' but got: ${r.outputSeal}`,
    );
    assert.notEqual(r.inputSeal, r.outputSeal, "inputSeal and outputSeal should differ");
  });

  // -------------------------------------------------------------------------
  // Test 7: invalid strategy → SPORE-GOV-015 fired, no receipt
  // -------------------------------------------------------------------------
  it("7. invalid strategy → SPORE-GOV-015 diagnostic, no receipt generated", () => {
    const { govResult } = parseAndVerify(
      makeSource("epilogue { generate_proof banana }"),
    );
    const pg = govResult.proofGraphs.get("testFlow");
    assert.ok(pg, "ProofGraph should still exist");
    // Receipt should NOT be generated for invalid strategy
    assert.equal(
      pg.epilogueReceipt,
      undefined,
      "epilogueReceipt should be absent when strategy is invalid",
    );
    // SPORE-GOV-015 should have been emitted
    const gov015 = govResult.diagnostics.find((d) => d.code === "SPORE-GOV-015");
    assert.ok(gov015, "SPORE-GOV-015 should be fired for invalid strategy");
  });

  // -------------------------------------------------------------------------
  // Test 8: ProofGraph.epilogueReceipt is accessible via verifyGovernance
  // -------------------------------------------------------------------------
  it("8. proofGraphs.get(flowName).epilogueReceipt accessible via verifyGovernance result", () => {
    const source = makeSource("epilogue { generate_proof sha256_seal }");
    const parsed = parseProgram(source, "test.spore");
    const effectResults = checkEffects(parsed.flows, parsed.ast);
    const result = verifyGovernance(parsed.ast, parsed.flows, effectResults, "dev");

    // The proofGraphs map should be accessible
    assert.ok(result.proofGraphs instanceof Map, "proofGraphs should be a Map");
    const pg = result.proofGraphs.get("testFlow");
    assert.ok(pg, "ProofGraph for testFlow should exist");
    assert.ok(pg.epilogueReceipt, "epilogueReceipt should be accessible on ProofGraph");
    assert.equal(pg.epilogueReceipt.strategy, "sha256_seal");
    // Confirm the inputSeal is a valid sha256 hex (64 hex chars after "sha256:")
    const hexPart = pg.epilogueReceipt.inputSeal?.slice("sha256:".length) ?? "";
    assert.match(hexPart, /^[0-9a-f]{64}$/, "inputSeal hex should be 64 lowercase hex chars");
  });
});
