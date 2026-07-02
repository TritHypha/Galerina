// rd0236-runtime-hardening.test.mjs — RED-bench regression tests for the RD-0236 runtime
// governance fail-opens fixed in tower-citizen (#1 forgeable capability mask, #3 checkTransition
// unknown-requirement fall-through, #10 tower-runtime.load unverified metadata). Each fails on the
// pre-fix code and passes after. See ../ZTF-Knowledge-Bases/galerina-rd-0236-runtime-50yr-mistake-audit.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HybridInferenceEngine, TowerRuntime, GovernanceEnforcer, TPL_DEFAULT_POLICY,
} from "../dist/index.js";

// ── #1 — the capability mask is a real #private field; a runtime field-write cannot forge it ──
test("RD-0236 #1: forging grantedCapabilityMask via a field write does NOT grant authority", async () => {
  // Construct an engine that does NOT hold the ai.inference capability bit (mask = 0).
  const engine = new HybridInferenceEngine(
    { airGapped: true, governanceTier: 1 }, undefined, undefined, undefined, false, null, 0,
  );
  // The exact exploit RD-0236 reproduced: overwrite the "readonly" field at runtime.
  try { engine.grantedCapabilityMask = 0xffffffff; } catch { /* frozen ⇒ even stronger */ }
  const receipt = await engine.infer({ prompt: "x", correlationId: "RD0236-CAP", maxNewTokens: 10 });
  // Pre-fix (private readonly erased at runtime): the forge set the field ⇒ capability held ⇒ NOT denied.
  // Post-fix (#private): the gate reads the untamperable private mask (0) ⇒ still denied.
  assert.equal(receipt.trapFired, true, "capability gate must still deny — the forge is ineffective");
  assert.equal(receipt.trapCode, "ERR_CAPABILITY_DENIED", "the #private mask (0) is read, not the forged public field");
});

// ── #3 — an unknown requirement string is rejected (was silently satisfied) ──
test("RD-0236 #3: a transition policy naming an UNKNOWN requirement is rejected at load (fail-closed)", () => {
  assert.throws(
    () => new GovernanceEnforcer({
      version: "test",
      restrictedTransitions: [{ from: 0, to: 1, requires: ["totally_unknown_requirement"] }],
      defaultAction: -1,
    }),
    /FUNGI-GOV-TPL-001/,
    "a policy that names an unverifiable requirement must be refused at load",
  );
  // A policy with only KNOWN requirements constructs fine (no over-rejection).
  assert.doesNotThrow(() => new GovernanceEnforcer(TPL_DEFAULT_POLICY));
});

// ── #10 — load refuses metadata with an unverifiable artifact identity ──
test("RD-0236 #10: TowerRuntime.load refuses metadata with an unverifiable artifactHash", async () => {
  const rt = new TowerRuntime({ auditInMemory: true });
  const bad = { engineId: "e", artifactPath: "p", artifactHash: "not-a-hash", governanceTier: 1, license: "Apache-2.0", maxMemoryMB: 1, capabilityMask: 0 };
  await assert.rejects(() => rt.load(bad), /FUNGI-ASSIMILATE-003/, "unverifiable artifactHash must be refused (fail-closed)");
  // A well-formed sha256: identity loads normally (no over-rejection).
  const ok = await rt.load({ ...bad, artifactHash: "sha256:abc123" });
  assert.ok(ok.sandbox, "valid metadata loads");
});
