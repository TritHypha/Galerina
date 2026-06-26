// plan-memoization.test.mjs — "pre-pay the proof, pointer-chase the plan".
//
// The HybridPlan is deterministic for a fixed routing context + op set, so the
// engine memoizes it (compute once per op-signature) instead of re-planning every
// infer(). seal() locks the deployment at preflight: an op-set never preflighted
// is denied in flight (deny-by-default extended to routing).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHybridEngine } from "../dist/index.js";

const cid = (s) => `PLAN-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

test("the plan is memoized — repeated infers reuse one plan, identical result", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  const a = await eng.infer({ prompt: "x", correlationId: cid("a") });
  const b = await eng.infer({ prompt: "y", correlationId: cid("b") });
  assert.equal(a.trapFired, false);
  // Same routing context + ops ⇒ identical blended plan + deterministic checksum.
  assert.deepEqual(a.plan.decisions.map(d => d.precision), b.plan.decisions.map(d => d.precision));
  assert.equal(a.ternaryChecksum, b.ternaryChecksum);
});

test("seal() preflights the standard plan and reports it", () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  const { plans } = eng.seal();
  assert.equal(plans.length, 1);
  assert.ok(plans[0].decisions.length > 0, "standard transformer plan is locked");
});

test("a sealed deployment DENIES an op-set that was never preflighted", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  eng.seal(); // only the standard pass is preflighted
  // A custom op-set the deployment never preflighted → denied in flight.
  const r = await eng.infer({ prompt: "x", correlationId: cid("deny"), opClasses: ["attention"] });
  assert.equal(r.trapFired, true);
  assert.equal(r.trapCode, "ERR_PLAN_NOT_PREFLIGHTED");
});

test("a sealed deployment PERMITS a preflighted op-set", async () => {
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1 });
  eng.seal([["embedding", "feedforward"]]); // preflight this exact set
  const r = await eng.infer({ prompt: "x", correlationId: cid("ok"), opClasses: ["embedding", "feedforward"] });
  assert.equal(r.trapFired, false);
  assert.ok(r.bridgesUsed.length > 0);
});
