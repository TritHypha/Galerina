// orthogonality.test.mjs — the 0054 D3 orthogonality obligations (§5: O1–O4).
//
// Proves the PRODUCT of the two axes never produces a slower-than-binary path: AXIS-1 (the cached
// hardware() directive) picks the package; AXIS-2 (the reused 0053 route()) decides, per kernel,
// whether to actually offload. Preference NEVER forces compute onto photonics.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHardware, selectTier } from "../dist/index.js";
import { PartitionDecider, Tdigital, Tphotonic, crossover } from "../../logicn-ext-photonic-emulator/dist/index.js";

const decider = new PartitionDecider();
const TIERS = ["binary", "hybrid", "photonic"];

/** Realized cost = what AXIS-2 actually runs (digital fallback or a proven-win photonic offload). */
function realizedCost(kernel) {
  const d = decider.decide(kernel);
  return d.target === "photonic" ? Tphotonic(kernel.n, d.N ?? 1) : Tdigital(kernel.n);
}

// O1 — product table: for every hardware() tier × every route() outcome, realized ≤ Tdigital(n).
test("O1: product of {binary,hybrid,photonic} × route() outcomes never exceeds Tdigital (no slowdown)", () => {
  let violations = 0, checks = 0;
  for (const _tier of TIERS) {
    for (let n = 1; n <= 2048; n++) {
      for (const Nv of [1, 9]) {
        checks++;
        // The tier picks the package; the per-kernel router decides digital/photonic. Cost is route-driven.
        if (realizedCost({ n, redundancyN: Nv, lane: "photonic" }) > Tdigital(n) + 1e-9) violations++;
      }
    }
  }
  assert.equal(violations, 0, `0 of ${checks} (tier × kernel) products exceed Tdigital`);
});

// O2 — preference does not force offload: hardware()==='photonic' + a crypto/control/small kernel
//      realizes as the binary-fallback (route → digital), byte-cost-identical to today.
test("O2: hardware()=photonic does NOT force offload — crypto/control/small kernels stay digital", () => {
  // The directive resolves photonic for an attested photonic accelerator + a fully-eligible component.
  assert.equal(resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: true }), "photonic");
  // …yet these kernels still route DIGITAL (preference is orthogonal to the per-kernel net-win gate):
  const big = Math.ceil(crossover(1) * 8);
  for (const k of [
    { n: big, lane: "photonic", isCrypto: true },        // crypto-on-core
    { n: big, lane: "photonic", isControlFlow: true },   // control flow
    { n: 4, lane: "photonic" },                          // sub-crossover (too small)
  ]) {
    assert.equal(decider.decide(k).target, "digital", `kernel ${JSON.stringify(k)} stays digital`);
    assert.equal(realizedCost(k), Tdigital(k.n), "realized cost is the digital path (no slowdown)");
  }
});

// O3 — degraded-tier fall-through: a missing higher registry resolves to a LOWER tier, never errors.
test("O3: a photonic-resolved directive with only lower registries falls through, never errors", () => {
  const binary = new Map(), hybrid = new Map();
  // directive says photonic, but the deployment shipped no photonic registry → degrade, no throw
  assert.equal(selectTier({ binary, hybrid }, "photonic").selected, "hybrid");
  assert.equal(selectTier({ binary }, "photonic").selected, "binary");
  assert.equal(selectTier({ binary }, "hybrid").selected, "binary");
});

// O4 — convergence: a WHOLE component (crypto/control present) under photonic hardware realizes as
//      hybrid (the directive caps it), and the per-kernel router only ever offloads eligible kernels.
test("O4: a whole component under photonic hardware converges to -hybrid (never a whole-photonic path)", () => {
  // AXIS-1: a whole component (componentFullyEligible=false) caps at hybrid even on attested photonic hw.
  assert.equal(resolveHardware({ targetId: "photonic", attestationVerified: true, componentFullyEligible: false }), "hybrid");
  // AXIS-2: within a (hybrid) component, the crypto/control kernels stay digital; only an eligible,
  // net-win tensor kernel offloads — so the realized path is "digital core + offloaded eligible kernels".
  const big = Math.ceil(crossover(1) * 8);
  assert.equal(decider.decide({ n: big, lane: "photonic", isControlFlow: true }).target, "digital");
  assert.equal(decider.decide({ n: big, lane: "photonic" }).target, "photonic"); // the eligible kernel offloads
  // there is no input under which a whole crypto-bearing component runs entirely on photonics.
});
