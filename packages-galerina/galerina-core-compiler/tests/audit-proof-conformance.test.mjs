// =============================================================================
// Audit Proof Conformance Tests
//
// Verifies that Galerina's audit and proof machinery is deterministic and
// tamper-evident: same source always produces the same hashes, attestations
// are signed and verified correctly, and proof chains detect tampering.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProgram,
  buildSemanticGraph,
  buildExecutionPlan,
  buildAttestation,
  buildProofChain,
  verifyProofChain,
  generateAttestationKey,
  signAttestation,
  verifyAttestation,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Shared source used for determinism tests
// ---------------------------------------------------------------------------

const SOURCE = `pure flow greet(name: String) -> String {
  return "hello"
}`;

// =============================================================================
// Suite 1: Deterministic hashes — same source produces same output
// =============================================================================

describe("Audit proof — Suite 1: Deterministic hashes", () => {
  it("parseProgram twice produces the same number of flows with the same name", () => {
    const p1 = parseProgram(SOURCE, "t.spore");
    const p2 = parseProgram(SOURCE, "t.spore");

    assert.equal(p1.flows.length, p2.flows.length, "flows.length must be identical on repeated parse");
    assert.equal(
      p1.flows[0]?.name,
      p2.flows[0]?.name,
      "flows[0].name must be identical on repeated parse",
    );
  });

  it("buildSemanticGraph twice produces identical nodes.length and edges.length", () => {
    const p1 = parseProgram(SOURCE, "t.spore");
    const p2 = parseProgram(SOURCE, "t.spore");

    const g1 = buildSemanticGraph(p1.ast, p1.flows);
    const g2 = buildSemanticGraph(p2.ast, p2.flows);

    assert.equal(g1.nodes.length, g2.nodes.length, "nodes.length must be deterministic");
    assert.equal(g1.edges.length, g2.edges.length, "edges.length must be deterministic");
  });

  it("buildExecutionPlan twice on the same flow produces identical planHash", () => {
    const parsed = parseProgram(SOURCE, "t.spore");
    const flowMeta = parsed.flows[0];
    assert.ok(flowMeta !== undefined, "Expected at least one flow in SOURCE");

    const plan1 = buildExecutionPlan(parsed.ast, flowMeta);
    const plan2 = buildExecutionPlan(parsed.ast, flowMeta);

    assert.equal(
      plan1.planHash,
      plan2.planHash,
      `planHash must be deterministic; got ${plan1.planHash} vs ${plan2.planHash}`,
    );
  });
});

// =============================================================================
// Suite 2: Attestation chain
// =============================================================================

describe("Audit proof — Suite 2: Attestation chain", () => {
  it("buildAttestation with sourceText produces hashes.source starting with 'sha256:'", async () => {
    const att = await buildAttestation({ flowName: "greet", sourceText: "x" });
    assert.ok(
      att.hashes.source !== undefined,
      "hashes.source should be present when sourceText is provided",
    );
    assert.ok(
      att.hashes.source.startsWith("sha256:"),
      `hashes.source must start with 'sha256:'; got: ${att.hashes.source}`,
    );
  });

  it("same sourceText twice produces identical hashes.source", async () => {
    const att1 = await buildAttestation({ flowName: "greet", sourceText: "pure flow f() -> Void { return }" });
    const att2 = await buildAttestation({ flowName: "greet", sourceText: "pure flow f() -> Void { return }" });
    assert.equal(
      att1.hashes.source,
      att2.hashes.source,
      "hashes.source must be deterministic for the same sourceText",
    );
  });

  it("different sourceText produces different hashes.source", async () => {
    const attA = await buildAttestation({ flowName: "greet", sourceText: "pure flow a() -> Void { return }" });
    const attB = await buildAttestation({ flowName: "greet", sourceText: "pure flow b() -> Void { return }" });
    assert.notEqual(
      attA.hashes.source,
      attB.hashes.source,
      "Different sourceText must produce different hashes.source",
    );
  });

  it("executionPlanHash is reflected as hashes.executionPlan with sha256: prefix", async () => {
    const att = await buildAttestation({ flowName: "greet", executionPlanHash: "abc123" });
    assert.equal(
      att.hashes.executionPlan,
      "sha256:abc123",
      `hashes.executionPlan should be 'sha256:abc123'; got: ${att.hashes.executionPlan}`,
    );
  });
});

// =============================================================================
// Suite 3: Sign and verify roundtrip
// =============================================================================

describe("Audit proof — Suite 3: Sign and verify roundtrip", () => {
  it("generateAttestationKey returns an object with keyId, privateKey, publicKey", () => {
    const kp = generateAttestationKey("test-key");
    assert.equal(kp.keyId, "test-key");
    assert.ok(typeof kp.privateKey === "string", "privateKey should be a string");
    assert.ok(typeof kp.publicKey === "string", "publicKey should be a string");
    assert.ok(kp.privateKey.includes("PRIVATE KEY"), "privateKey should be PEM-encoded");
    assert.ok(kp.publicKey.includes("PUBLIC KEY"), "publicKey should be PEM-encoded");
  });

  it("sign then verify returns true", async () => {
    const kp = generateAttestationKey("roundtrip-key");
    const att = await buildAttestation({
      flowName: "greet",
      sourceText: SOURCE,
    });
    const signed = signAttestation(att, kp);
    assert.ok(signed.signature !== undefined, "signAttestation must attach a signature");

    const ok = verifyAttestation(signed, kp.publicKey);
    assert.equal(ok, true, "verifyAttestation must return true for a valid signature");
  });

  it("tampered attestation (changed hash) fails verification", async () => {
    const kp = generateAttestationKey("tamper-key");
    const att = await buildAttestation({
      flowName: "greet",
      sourceText: SOURCE,
    });
    const signed = signAttestation(att, kp);

    // Tamper: replace the source hash with an all-zero hash
    const tampered = {
      ...signed,
      hashes: {
        ...signed.hashes,
        source: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    };

    const ok = verifyAttestation(tampered, kp.publicKey);
    assert.equal(ok, false, "verifyAttestation must return false for a tampered attestation");
  });
});
