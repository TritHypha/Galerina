// tri-pipe.test.mjs — the capstone: hardware() → tier → one governed engine, end-to-end.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTriPipeEngine } from "../dist/index.js";
import { resolveHardware } from "../../galerina-hardware-tier/dist/index.js";

const big = () => ({ n: 1024, lane: "photonic", tolerance: 0.05 });

async function run(opts) {
  const tp = createTriPipeEngine({ auditInMemory: true, kernelFor: big, ...opts });
  const r = await tp.engine.infer({ prompt: "hi", correlationId: "t" });
  await tp.engine.shutdown();
  return { tp, r };
}

test("binary tier (cpu, attested) → no photonic offload; digital stub runs", async () => {
  const { tp, r } = await run({ targetId: "cpu", attestationVerified: true });
  assert.equal(tp.tier, "binary");
  assert.equal(tp.photonicEnabled, false);
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
});

test("photonic tier (photonic, attested, fully eligible) → photonic backend runs the net-win kernel", async () => {
  const { tp, r } = await run({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true });
  assert.equal(tp.tier, "photonic");
  assert.equal(tp.photonicEnabled, true);
  assert.deepEqual(r.bridgesUsed, ["photonic:photonic-emulator"]); // provenance namespaced (anti-spoof)
});

test("hybrid tier (gpu, whole component) → photonic offload enabled for the eligible kernel", async () => {
  const { tp, r } = await run({ targetId: "gpu", attestationVerified: true });
  assert.equal(tp.tier, "hybrid");
  assert.equal(tp.photonicEnabled, true);
  assert.deepEqual(r.bridgesUsed, ["photonic:photonic-emulator"]); // provenance namespaced (anti-spoof)
});

test("fail-closed: UNATTESTED photonic hardware → binary tier, no offload", async () => {
  const { tp, r } = await run({ targetId: "photonic", attestationVerified: false, componentFullyEligible: true });
  assert.equal(tp.tier, "binary");
  assert.equal(tp.photonicEnabled, false);
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);
});

test("fail-closed: UNKNOWN target → binary tier, no offload", async () => {
  const { tp } = await run({ targetId: "frobnicator-9000", attestationVerified: true });
  assert.equal(tp.tier, "binary");
  assert.equal(tp.photonicEnabled, false);
});

test("the resolved tier matches the hardware() directive exactly", () => {
  for (const [targetId, attested, elig] of [["cpu", true, true], ["gpu", true, false], ["photonic", true, true], ["photonic", true, false], ["photonic", false, true]]) {
    const tp = createTriPipeEngine({ auditInMemory: true, targetId, attestationVerified: attested, componentFullyEligible: elig });
    assert.equal(tp.tier, resolveHardware({ targetId, attestationVerified: attested, componentFullyEligible: elig }));
  }
});

test("photonic offload still gated per-kernel: a sub-crossover kernel (default n=16) stays digital even on a photonic tier", async () => {
  // No kernelFor → default n = op.count (16, below the crossover) → the router declines → digital.
  const tp = createTriPipeEngine({ auditInMemory: true, targetId: "photonic", attestationVerified: true, componentFullyEligible: true });
  const r = await tp.engine.infer({ prompt: "hi", correlationId: "small" });
  assert.equal(tp.photonicEnabled, true);             // the port IS wired (hybrid/photonic tier)
  assert.deepEqual(r.bridgesUsed, ["stub-ternary"]);  // …but the per-kernel net-win router declined
  await tp.engine.shutdown();
});
