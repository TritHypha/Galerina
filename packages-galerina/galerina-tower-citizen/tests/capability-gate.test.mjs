// capability-gate.test.mjs — the V_DPM capability bitmask is ENFORCED, not decorative.
//
// PluginMetadata.capabilityMask declared the ai.inference authority (V_DPM bit 5)
// but nothing checked it: an engine without that bit could still run inference.
// The Hold-First gate now runs the branchless (required & granted) === required
// check FIRST — an engine lacking the bit traps ERR_CAPABILITY_DENIED before compute.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine } from "../dist/index.js";

const AI_INFERENCE_CAP = 0b00100000;
const cid = (s) => `CAP-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

test("an engine granted the ai.inference bit runs (default)", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  const r = await eng.infer({ prompt: "x", correlationId: cid("ok"), opClasses: ["feedforward"] });
  assert.equal(r.trapFired, false);
});

test("an engine WITHOUT the ai.inference bit fails closed (ERR_CAPABILITY_DENIED)", async () => {
  // Grant some other capability, but not ai.inference.
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, capabilityMask: 0b00000001 });
  const r = await eng.infer({ prompt: "x", correlationId: cid("deny"), opClasses: ["feedforward"] });
  assert.equal(r.trapFired, true);
  assert.equal(r.trapCode, "ERR_CAPABILITY_DENIED");
});

test("the capability gate is the FIRST authority check (precedes attestation)", async () => {
  // No ai.inference bit AND an attestation policy that would otherwise trap: the
  // capability denial must win, proving it runs before the attestation check.
  const eng = createHybridEngine({
    airGapped: true, governanceTier: 1,
    capabilityMask: 0,
    attestation: { requireSigned: true, publicKeyPem: "not-a-real-key" },
  });
  const r = await eng.infer({ prompt: "x", correlationId: cid("first"), opClasses: ["feedforward"] });
  assert.equal(r.trapCode, "ERR_CAPABILITY_DENIED");
});

test("a mask carrying ai.inference among other bits still passes", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, capabilityMask: AI_INFERENCE_CAP | 0b1 });
  const r = await eng.infer({ prompt: "x", correlationId: cid("multi"), opClasses: ["feedforward"] });
  assert.equal(r.trapFired, false);
});
