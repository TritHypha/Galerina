// execution-router.test.mjs — the Galerina Execution Router: one decision across all routing axes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createExecutionRouter } from "../dist/index.js";
import { resolveHardware } from "../../galerina-hardware-tier/dist/index.js";
import { routePrecision } from "../../galerina-tower-citizen/dist/index.js";
import { PartitionDecider } from "../../galerina-ext-photonic-emulator/dist/index.js";

const router = createExecutionRouter();
const decider = new PartitionDecider();
const cloud = { governanceTier: 2, fp4HardwareAvailable: false, airGapped: false };
const airgap = { governanceTier: 1, fp4HardwareAvailable: false, airGapped: true };
const big = { n: 1024, lane: "photonic", tolerance: 0.05 };

test("ternary op on attested photonic hardware with a net-win kernel → routes photonic", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big });
  assert.equal(d.tier, "photonic");
  assert.equal(d.precision.precision, "ternary");
  assert.equal(d.offloadTarget, "photonic");
  assert.equal(d.photonic, true);
});

test("binary tier (cpu) → never offloads, whatever the kernel", () => {
  const d = router.route({ opClass: "feedforward", routing: airgap, capability: { targetId: "cpu", attestationVerified: true }, kernel: big });
  assert.equal(d.tier, "binary");
  assert.equal(d.offloadTarget, "digital");
  assert.equal(d.photonic, false);
});

test("a non-ternary precision (fp16 sensitivity-critical op) is never photonic-offloaded, even on photonic hw", () => {
  const d = router.route({ opClass: "normalization", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big });
  assert.equal(d.tier, "photonic");
  assert.equal(d.precision.precision, "fp16");          // normalization is sensitivity ≥ 0.85
  assert.equal(d.offloadTarget, "digital");             // not ternary → photonic inert
  assert.match(d.offloadReason, /not ternary/);
});

test("crypto kernel → digital regardless of tier/precision (crypto-on-core)", () => {
  const d = router.route({ opClass: "feedforward", routing: airgap, capability: { targetId: "gpu", attestationVerified: true }, kernel: { n: 1024, lane: "photonic", isCrypto: true } });
  assert.equal(d.tier, "hybrid");
  assert.equal(d.precision.precision, "ternary");
  assert.equal(d.offloadTarget, "digital");
});

test("fail-closed: UNATTESTED photonic hardware → binary tier → no offload", () => {
  const d = router.route({ opClass: "feedforward", routing: airgap, capability: { targetId: "photonic", attestationVerified: false, componentFullyEligible: true }, kernel: big });
  assert.equal(d.tier, "binary");
  assert.equal(d.offloadTarget, "digital");
});

test("each axis matches its underlying router exactly (no re-derivation)", () => {
  const input = { opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big };
  const d = router.route(input);
  assert.equal(d.tier, resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true }));
  assert.deepEqual(d.precision, routePrecision("feedforward", cloud));
});

test("PROPERTY: photonic IFF (offload-capable tier ∧ ternary precision ∧ the per-kernel router says photonic)", () => {
  const opClasses = ["embedding", "attention", "normalization", "feedforward", "kv_cache", "output_head"];
  const targets = ["cpu", "gpu", "photonic", "frobnicator"];
  const kernels = [big, { n: 4, lane: "photonic" }, { n: 1024, lane: "photonic", isCrypto: true }];
  let checks = 0, violations = 0;
  for (const opClass of opClasses) {
    for (const targetId of targets) {
      for (const attestationVerified of [true, false]) {
        for (const kernel of kernels) {
          checks++;
          const routing = airgap; // air-gapped tier-1 → ternary for low-sensitivity ops
          const d = router.route({ opClass, routing, capability: { targetId, attestationVerified, componentFullyEligible: true }, kernel });
          const tier = resolveHardware({ targetId, attestationVerified, componentFullyEligible: true });
          const precision = routePrecision(opClass, routing).precision;
          const offloadCapable = (tier === "hybrid" || tier === "photonic") && precision === "ternary";
          const kernelPhotonic = offloadCapable && decider.decide(kernel).target === "photonic";
          if (d.photonic !== kernelPhotonic) violations++;
        }
      }
    }
  }
  assert.equal(violations, 0, `${violations}/${checks} routing-composition violations`);
});

// ── capability gate (the grant half of lane selection — TRACK b) ─────────────────────────────────

test("DEFAULT (no cap operand) = unchanged: ternary photonic net-win kernel still routes photonic", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big });
  assert.equal(d.offloadTarget, "photonic");
  assert.equal(d.photonic, true);
  assert.equal(d.laneGranted, true);   // digital-or-granted; no operand ⇒ granted
});

test("cap DENIES the photonic lane → falls back to digital, never throws, never routes ungranted", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big, capCheck: () => false });
  assert.equal(d.offloadTarget, "digital");
  assert.equal(d.photonic, false);
  assert.equal(d.laneGranted, false);
  assert.match(d.offloadReason, /not granted/);
  assert.match(d.offloadReason, /wanted photonic/);   // records what the net-win router wanted
});

test("cap GRANTS the photonic lane → identical to the default photonic route", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big, capCheck: (l) => l === "photonic" });
  assert.equal(d.offloadTarget, "photonic");
  assert.equal(d.photonic, true);
  assert.equal(d.laneGranted, true);
});

test("grantedLanes allow-list: photonic absent → fall back to digital", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big, grantedLanes: ["noisy"] });
  assert.equal(d.offloadTarget, "digital");
  assert.equal(d.laneGranted, false);
});

test("grantedLanes allow-list: photonic present → photonic route survives", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big, grantedLanes: ["photonic"] });
  assert.equal(d.offloadTarget, "photonic");
  assert.equal(d.laneGranted, true);
});

test("deny-by-default AND: capCheck grants but grantedLanes omits → denied", () => {
  const d = router.route({ opClass: "feedforward", routing: cloud, capability: { targetId: "photonic", attestationVerified: true, componentFullyEligible: true }, kernel: big, capCheck: () => true, grantedLanes: ["noisy"] });
  assert.equal(d.offloadTarget, "digital");
  assert.equal(d.laneGranted, false);
});

test("cap gate is INERT when the route was already digital (binary tier) — laneGranted stays true", () => {
  const airgap2 = { governanceTier: 1, fp4HardwareAvailable: false, airGapped: true };
  const d = router.route({ opClass: "feedforward", routing: airgap2, capability: { targetId: "cpu", attestationVerified: true }, kernel: big, capCheck: () => false });
  assert.equal(d.tier, "binary");
  assert.equal(d.offloadTarget, "digital");   // already digital — gate never downgrades further
  assert.equal(d.laneGranted, true);          // digital is always granted (safe floor)
});
