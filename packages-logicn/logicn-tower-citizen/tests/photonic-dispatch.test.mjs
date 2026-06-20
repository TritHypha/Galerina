// photonic-dispatch.test.mjs — the opt-in, fail-closed photonic offload path in the engine.
//
// Verifies the additive `photonic` config on createHybridEngine: a ternary op routed to a net-win
// photonic kernel runs on the injected backend (and is accepted only because the port already
// tolerance-verified it — so the bit-exact assertDeterminism oracle is correctly bypassed for it),
// while EVERYTHING about the default (no-photonic) path stays byte-unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine } from "../dist/index.js";
import { createPhotonicRouterPort } from "../../logicn-ext-photonic-emulator/dist/index.js";

const bigKernel = () => ({ n: 1024, lane: "photonic", tolerance: 0.05 });

test("default (no photonic config) — the digital path is unchanged (stub-ternary, no trap)", async () => {
  const eng = createHybridEngine({ auditInMemory: true });
  const r = await eng.infer({ prompt: "hi", correlationId: "d0" });
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
  assert.equal(r.trapFired, false);
  assert.equal(r.executedNatively, false);
  await eng.shutdown();
});

test("photonic configured + net-win kernel → the photonic backend runs the op", async () => {
  const eng = createHybridEngine({
    auditInMemory: true,
    photonic: { router: createPhotonicRouterPort(), kernelFor: bigKernel },
  });
  const r = await eng.infer({ prompt: "hi", correlationId: "p1" });
  assert.deepEqual(r.bridgesUsed, ["photonic-emulator"]);
  assert.equal(r.trapFired, false);
  assert.equal(r.executedNatively, false); // EMULATED, honest
  await eng.shutdown();
});

test("photonic configured but NO net win (tiny kernel) → declines to the digital path (fail-closed)", async () => {
  const eng = createHybridEngine({
    auditInMemory: true,
    photonic: { router: createPhotonicRouterPort(), kernelFor: () => ({ n: 4, lane: "photonic" }) },
  });
  const r = await eng.infer({ prompt: "hi", correlationId: "p2" });
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
  await eng.shutdown();
});

test("a router that DECLINES (returns null) → the engine runs the unchanged digital dispatch", async () => {
  const declining = { route: () => null };
  const eng = createHybridEngine({ auditInMemory: true, photonic: { router: declining, kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p3" });
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
  assert.equal(r.trapFired, false);
  await eng.shutdown();
});

test("a router that returns a hit → the engine commits the photonic value (skips the bit-exact oracle)", async () => {
  // A custom port returning a value WITHOUT being a real deterministic ternary result. The engine
  // accepts it (trusting the port's own re-verify) — this is exactly the tolerance-path substitution.
  const fixed = { route: () => ({ value: 7, bridgeId: "test-photonic" }) };
  const eng = createHybridEngine({ auditInMemory: true, photonic: { router: fixed, kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p4" });
  assert.deepEqual(r.bridgesUsed, ["test-photonic"]);
  assert.equal(r.trapFired, false);
  // the value (7 per op) accumulates into the ternary checksum: 7 × (number of ternary-routed ops).
  const nTernary = r.plan.decisions.filter((d) => d.precision === "ternary").length;
  assert.ok(nTernary > 0, "at least one op routes to ternary");
  assert.equal(r.ternaryChecksum, 7 * nTernary);
  await eng.shutdown();
});

test("the photonic config does not affect the receipt shape consumers depend on", async () => {
  const eng = createHybridEngine({ auditInMemory: true, photonic: { router: createPhotonicRouterPort(), kernelFor: bigKernel } });
  const r = await eng.infer({ prompt: "hi", correlationId: "p5" });
  for (const k of ["correlationId", "text", "tokenCount", "latencyMs", "plan", "outputHash", "enginesBlended", "avgBitsPerWeight", "deterministic", "trapFired", "bridgesUsed", "executedNatively", "ternaryChecksum"]) {
    assert.ok(k in r, `receipt has ${k}`);
  }
  await eng.shutdown();
});
