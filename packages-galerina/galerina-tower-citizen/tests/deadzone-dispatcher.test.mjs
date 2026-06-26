// deadzone-dispatcher — runtime executor of the parsed-but-dead `on_indeterminate` K3 policy.
// A K3-0 dead-zone reading now honours the author's declared disposition (trap | revote:N |
// fallback_digital), fail-closed: an unresolved dead zone always traps, never a guessed value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NoisyLane, dispatchDeadZone, SubstrateDeadZoneTrap, DEFAULT_ON_INDETERMINATE } from "../dist/index.js";

const CLEAN = { seed: 1, phaseDriftSigma: 0, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 };
const DEAD = { seed: 1, phaseDriftSigma: 0, crosstalkCoeff: 0, laneFailureProb: 1, readoutSigma: 0 };
const COMMIT = { value: 1, indeterminate: false, noiseMargin: 0 };
const ZERO = { value: 0, indeterminate: true, noiseMargin: 0 };

// ── dispatchDeadZone (policy logic) ──
test("dispatchDeadZone: trap throws (fail-closed)", () => {
  assert.throws(() => dispatchDeadZone({ kind: "trap" }, 1, () => COMMIT), SubstrateDeadZoneTrap);
});
test("dispatchDeadZone: revote that CONVERGES returns the committed reading", () => {
  assert.equal(dispatchDeadZone({ kind: "revote", n: 5 }, 1, () => COMMIT).value, 1);
});
test("dispatchDeadZone: revote that STILL lands in the dead zone traps (no guessed value)", () => {
  assert.throws(() => dispatchDeadZone({ kind: "revote", n: 5 }, 1, () => ZERO), SubstrateDeadZoneTrap);
});
test("dispatchDeadZone: revote with an even/invalid N traps", () => {
  assert.throws(() => dispatchDeadZone({ kind: "revote", n: 4 }, 1, () => COMMIT), /odd integer/);
});
test("dispatchDeadZone: fallback_digital returns the EXACT ideal trit (noiseless)", () => {
  assert.deepEqual(dispatchDeadZone({ kind: "fallback_digital" }, -1, () => ZERO),
    { value: -1, indeterminate: false, noiseMargin: 1 });
});

// ── NoisyLane.readVotedGoverned (integration) ──
test("readVotedGoverned: a DEFINITE vote is returned unchanged (policy not invoked)", () => {
  assert.equal(new NoisyLane(CLEAN).readVotedGoverned(1, 3, "op", { kind: "trap" }).value, 1);
});
test("readVotedGoverned: a dead-zone vote under trap FAILS CLOSED", () => {
  assert.throws(() => new NoisyLane(DEAD).readVotedGoverned(1, 3, "op", { kind: "trap" }), SubstrateDeadZoneTrap);
});
test("readVotedGoverned: a dead-zone vote under fallback_digital returns the exact ideal trit", () => {
  assert.equal(new NoisyLane(DEAD).readVotedGoverned(-1, 3, "op", { kind: "fallback_digital" }).value, -1);
});
test("readVotedGoverned: a dead-zone vote under revote (still dead) fails closed", () => {
  assert.throws(() => new NoisyLane(DEAD).readVotedGoverned(1, 3, "op", { kind: "revote", n: 7 }), SubstrateDeadZoneTrap);
});
test("DEFAULT_ON_INDETERMINATE is trap (fail-closed default)", () => {
  assert.equal(DEFAULT_ON_INDETERMINATE.kind, "trap");
});
