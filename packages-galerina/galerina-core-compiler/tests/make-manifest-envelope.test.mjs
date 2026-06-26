/**
 * 0102 / #34 — makeManifestEnvelope: single source of truth for the .lmanifest
 * hybrid/Ed25519 signing-envelope shape.
 *
 * The envelope shape (all-zero ExecutionSignature + one effect-obligation carrying
 * `lmanifest.bodyHash=<hash>` + matching evidence) was previously hardcoded in FOUR
 * places: three branches of galerina.mjs (sign, build-verify, run-admission) and the
 * rd-0102 bench. If any copy drifts, hybrid signatures silently stop verifying.
 * makeManifestEnvelope collapses those copies to one.
 *
 * This test PINS the helper's output to the exact hardcoded literal it replaced, so a
 * future change to the shape fails here (behavior-preserving guard) — and proves the
 * envelope still signs+verifies through the shipped hybrid path.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  makeManifestEnvelope, buildProofGraph,
  signProofGraphHybrid, verifyGovernanceSignatureHybrid,
  generateHybridGovernanceKeyPair,
} from "../dist/index.js";

// The EXACT literal that lived (identically) in all four hardcoded call sites.
const hardcodedEnvelope = (bodyHash, generatedAt) =>
  buildProofGraph(
    "lmanifest",
    { effectMask: 0, governanceMask: 0, inputVsFlags: 0, outputVsFlags: 0, nodeFlagsMask: 0, effectCount: 0, capabilityCallCount: 0, hasBoundaryCrossings: false },
    [{ kind: "effect", claim: `lmanifest.bodyHash=${bodyHash}`, satisfiedBy: "manifest-generator" }],
    [{ obligationKind: "effect", sourceHash: `sha256:${bodyHash}`, girHash: `sha256:${bodyHash}`, checkerPassed: true, diagnosticsFired: [] }],
    generatedAt,
  );

const BODY_HASH = "a".repeat(64);
const GENERATED_AT = "2026-06-23T00:00:00.000Z";

describe("makeManifestEnvelope — pins the .lmanifest signing-envelope shape", () => {
  it("produces output deep-equal to the previously-hardcoded literal", () => {
    assert.deepStrictEqual(
      makeManifestEnvelope(BODY_HASH, GENERATED_AT),
      hardcodedEnvelope(BODY_HASH, GENERATED_AT),
    );
  });

  it("pins the load-bearing fields exactly (shape lock)", () => {
    const env = makeManifestEnvelope(BODY_HASH, GENERATED_AT);
    assert.equal(env.flowName, "lmanifest");
    assert.equal(env.schemaVersion, "spore.proof.v1");
    assert.equal(env.verified, true);             // obligation has matching evidence
    assert.equal(env.generatedAt, GENERATED_AT);  // threaded for fidelity (excluded from signed payload)
    // all-zero ExecutionSignature
    assert.deepStrictEqual(env.executionSignature, {
      effectMask: 0, governanceMask: 0, inputVsFlags: 0, outputVsFlags: 0,
      nodeFlagsMask: 0, effectCount: 0, capabilityCallCount: 0, hasBoundaryCrossings: false,
    });
    // single effect-obligation carrying the bodyHash in `claim`
    assert.equal(env.obligations.length, 1);
    assert.equal(env.obligations[0].kind, "effect");
    assert.equal(env.obligations[0].claim, `lmanifest.bodyHash=${BODY_HASH}`);
    assert.equal(env.obligations[0].satisfiedBy, "manifest-generator");
    // matching evidence
    assert.equal(env.evidence.length, 1);
    assert.equal(env.evidence[0].obligationKind, "effect");
    assert.equal(env.evidence[0].sourceHash, `sha256:${BODY_HASH}`);
    assert.equal(env.evidence[0].girHash, `sha256:${BODY_HASH}`);
    assert.equal(env.evidence[0].checkerPassed, true);
  });

  it("signatureHash is independent of bodyHash and generatedAt (shape-only)", () => {
    // The ExecutionSignature is identical for every manifest, so the signatureHash must be
    // stable across different bodies/timestamps — that is what lets verifiers reconstruct it.
    const a = makeManifestEnvelope("b".repeat(64), "2026-01-01T00:00:00.000Z");
    const b = makeManifestEnvelope("c".repeat(64), "2030-12-31T23:59:59.000Z");
    assert.equal(a.signatureHash, b.signatureHash);
  });

  it("hybrid-signs and verifies through the shipped PQ path", async () => {
    const kp = await generateHybridGovernanceKeyPair("manifest-envelope-test");
    const signed = await signProofGraphHybrid(makeManifestEnvelope(BODY_HASH, GENERATED_AT), kp);
    assert.equal(signed.governanceSignature?.algorithm, "lln.gov.sig.v2");
    assert.ok((signed.governanceSignature?.signature ?? "").includes("|"), "both-half v2 signature");
    const ok = await verifyGovernanceSignatureHybrid(signed, kp.publicKey, kp.mlDsaPublicKey);
    assert.equal(ok, true, "envelope round-trips through hybrid sign+verify");
  });

  it("generatedAt does NOT affect the signed payload (any value verifies)", async () => {
    // The signer binds bodyHash via signatureHash+obligations; generatedAt is excluded from
    // canonicalSigningPayload. A verifier reconstructing with a DIFFERENT generatedAt must still pass.
    const kp = await generateHybridGovernanceKeyPair("manifest-envelope-gtest");
    const signed = await signProofGraphHybrid(makeManifestEnvelope(BODY_HASH, GENERATED_AT), kp);
    const reconstructed = makeManifestEnvelope(BODY_HASH, "1999-01-01T00:00:00.000Z");
    reconstructed.governanceSignature = signed.governanceSignature;
    const ok = await verifyGovernanceSignatureHybrid(reconstructed, kp.publicKey, kp.mlDsaPublicKey);
    assert.equal(ok, true, "reconstruction with a different generatedAt still verifies");
  });
});
