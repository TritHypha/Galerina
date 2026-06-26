// governance-hardening.test.mjs — closes the bypasses found in the deep analysis.
//
//   1. approvedModels can no longer be bypassed by omitting `model`.
//   2. Aerospace mode (denyHostNativeFallback) traps silent host-native fallback.
//   3. The stub bridge TRAPS the illegal 0b11 trit encoding instead of masking it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine, StubTernaryBridge, AuditLogger } from "../dist/index.js";

const cid = (s) => `HARD-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
function caught(fn) { try { fn(); return null; } catch (e) { return e; } }

test("approvedModels: omitting model is DENIED, not an implicit pass", async () => {
  const eng = createHybridEngine({ governance: { approvedModels: ["bitnet_b1_58_2b"] } });
  const r = await eng.infer({ prompt: "x", correlationId: cid("nomodel") }); // no model
  assert.equal(r.trapFired, true);
  assert.equal(r.trapCode, "ERR_AI_MODEL_REQUIRED");
  assert.equal(r.bridgesUsed.length, 0, "no compute when the model is unspecified under an allow-list");
});

test("approvedModels: a listed model still passes", async () => {
  const eng = createHybridEngine({ governance: { approvedModels: ["bitnet_b1_58_2b"] } });
  const r = await eng.infer({ prompt: "x", correlationId: cid("ok"), model: "bitnet_b1_58_2b" });
  assert.equal(r.trapFired, false);
});

test("aerospace mode: a precision with no bridge traps ERR_HOST_NATIVE_DENIED (no silent host-native)", async () => {
  // The default stub registry has no fp8/fp16 bridge; the standard transformer plan
  // routes normalization/output_head to fp8/fp16 → those would silently run host-native.
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { denyHostNativeFallback: true } });
  const r = await eng.infer({ prompt: "x", correlationId: cid("aero") });
  assert.equal(r.trapFired, true);
  assert.equal(r.trapCode, "ERR_HOST_NATIVE_DENIED");
});

test("permissive mode still allows host-native fallback (default)", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  const r = await eng.infer({ prompt: "x", correlationId: cid("perm") });
  assert.equal(r.trapFired, false, "default mode permits the host-native path");
});

test("stub bridge TRAPS the illegal 0b11 trit encoding (no corruption masking)", () => {
  const bridge = new StubTernaryBridge(new AuditLogger(null));
  // Craft a packed word whose first element (shift = byteIdx0,pos0 → 6) holds enc=0b11.
  // For element 0: byteIdx=0, posInByte=0, shift = 0*8 + (3-0)*2 = 6.
  const corrupt = Int32Array.of(0b11 << 6); // 0b11 at element 0
  const acts = Int32Array.of(1, 1, 1, 1);
  const err = caught(() => bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: "c", weights: corrupt, activations: acts, count: 4, scale: 1, offset: 0 }));
  assert.ok(err, "a corrupt packed buffer must trap, not silently decode to 0");
  assert.match(String(err.message), /corrupt|0b11|integrity/i);
});

test("engine.shutdown() releases bridges once (not per-infer)", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  await eng.infer({ prompt: "x", correlationId: cid("s1") });
  await eng.shutdown(); // should not throw; idempotent enough to re-run
  const r = await eng.infer({ prompt: "y", correlationId: cid("s2") }); // re-initializes bridges
  assert.equal(r.trapFired, false, "engine still usable after shutdown (bridges re-init)");
});
