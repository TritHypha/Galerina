// synchronization-gate.test.mjs — boot mapping, expected/drift math, drift enforcement.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LogicalClock,
  SynchronizationGate,
  PrecisionFault,
} from "../dist/index.js";
import { caught } from "./_helpers.mjs";

test("expectedTicks/driftTicks before sync throw LST-SYNC-001", () => {
  const gate = new SynchronizationGate(new LogicalClock(), { maxDriftTicks: 5 });
  assert.equal(caught(() => gate.expectedTicks(1000, 1)).code, "LST-SYNC-001");
  assert.equal(caught(() => gate.driftTicks(1000, 1)).code, "LST-SYNC-001");
});

test("enforceDrift before syncToPhysical throws LST-SYNC-001", () => {
  const gate = new SynchronizationGate(new LogicalClock(), { maxDriftTicks: 5 });
  const err = caught(() => gate.enforceDrift(1000, 1));
  assert.ok(err instanceof PrecisionFault);
  assert.equal(err.code, "LST-SYNC-001");
});

test("expectedTicks scales with elapsed physical time and rate", () => {
  const clock = new LogicalClock();
  const gate = new SynchronizationGate(clock, { maxDriftTicks: 10 });
  gate.syncToPhysical(1000);
  // 100 ms elapsed at 2 ticks/ms => 200 expected.
  assert.equal(gate.expectedTicks(1100, 2), 200);
  assert.equal(gate.expectedTicks(1000, 2), 0);
});

test("drift within maxDriftTicks is OK; beyond throws LST-DRIFT-001", () => {
  const clock = new LogicalClock();
  const gate = new SynchronizationGate(clock, { maxDriftTicks: 5 });
  gate.syncToPhysical(0);
  // After 100 ms at 1 tick/ms, expect 100 ticks. Advance exactly 100 => 0 drift.
  clock.advance(100);
  assert.equal(gate.driftTicks(100, 1), 0);
  assert.doesNotThrow(() => gate.enforceDrift(100, 1));

  // Within envelope: actual 103 vs expected 100 => drift +3 (<= 5).
  clock.advance(3);
  assert.equal(gate.driftTicks(100, 1), 3);
  assert.doesNotThrow(() => gate.enforceDrift(100, 1));

  // Beyond envelope: actual 103 vs expected 90 => drift +13 (> 5).
  const err = caught(() => gate.enforceDrift(90, 1));
  assert.ok(err instanceof PrecisionFault);
  assert.equal(err.code, "LST-DRIFT-001");
});

test("negative drift (clock ran slow) is faulted symmetrically", () => {
  const clock = new LogicalClock();
  const gate = new SynchronizationGate(clock, { maxDriftTicks: 5 });
  gate.syncToPhysical(0);
  // Expect 100 ticks after 100 ms, but only 90 elapsed => drift -10.
  clock.advance(90);
  assert.equal(gate.driftTicks(100, 1), -10);
  assert.equal(caught(() => gate.enforceDrift(100, 1)).code, "LST-DRIFT-001");
});

test("driftTicks measures from boot tick, not from zero", () => {
  const clock = new LogicalClock(500);
  const gate = new SynchronizationGate(clock, { maxDriftTicks: 0 });
  gate.syncToPhysical(2000);
  clock.advance(50);
  // 50 ms at 1 tick/ms expects 50; actual elapsed since boot is 50 => 0 drift.
  assert.equal(gate.driftTicks(2050, 1), 0);
  assert.doesNotThrow(() => gate.enforceDrift(2050, 1));
});
