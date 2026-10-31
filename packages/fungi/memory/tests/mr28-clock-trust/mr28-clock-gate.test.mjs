// MR28: the arena expiry gate admits only a trusted, positive, in-window
// caller reading. A zero or negative armed time is untrusted (the standing
// rule: any clock value <= 0 fails closed), so clock 0 can never be admitted.
import test from "node:test";
import assert from "node:assert/strict";
import { clockGate, expectPacked, leasedUse, R } from "./mr28-harness.mjs";

test("baseline in-window reading admits", () => {
  expectPacked(clockGate(), R.admit, "baseline");
  expectPacked(clockGate({ clock: 1000, armedAt: 1000 }), R.admit, "clock equals armedAt");
  expectPacked(clockGate({ clock: 5999, armedAt: 1000, budget: 5000 }), R.admit, "last tick in window");
  expectPacked(clockGate({ clock: 1, armedAt: 1, budget: 1 }), R.admit, "smallest positive window");
});

test("zero armed time is untrusted, so clock 0 never admits", () => {
  expectPacked(clockGate({ clock: 0, armedAt: 0 }), R.untrusted, "clock 0 armed 0");
  expectPacked(clockGate({ clock: 5, armedAt: 0 }), R.untrusted, "armed 0 positive clock");
  expectPacked(clockGate({ clock: 4999, armedAt: 0, budget: 5000 }), R.untrusted, "armed 0 in old window");
  expectPacked(clockGate({ clock: 0, armedAt: 0, budget: 2147483647 }), R.untrusted, "armed 0 max budget");
});

test("zero or negative clock reading fails closed", () => {
  expectPacked(clockGate({ clock: 0, armedAt: 1000 }), R.backwards, "clock 0 armed 1000");
  expectPacked(clockGate({ clock: 0, armedAt: 1 }), R.backwards, "clock 0 armed 1");
  expectPacked(clockGate({ clock: -1 }), R.untrusted, "clock -1");
  expectPacked(clockGate({ clock: -2147483647 }), R.untrusted, "clock min");
  expectPacked(clockGate({ armedAt: -1, clock: 0 }), R.untrusted, "armed -1");
});

test("missing, malformed, backwards, epoch, overflow and deadline refuse", () => {
  expectPacked(clockGate({ clockPresent: 0 }), R.missing, "clock absent");
  expectPacked(clockGate({ clockPresent: 2 }), R.untrusted, "presence not 0/1");
  expectPacked(clockGate({ clockPresent: -1 }), R.untrusted, "presence negative");
  expectPacked(clockGate({ budget: 0 }), R.untrusted, "zero budget");
  expectPacked(clockGate({ clockEpoch: 2, armedEpoch: 1 }), R.epochMismatch, "epoch moved");
  expectPacked(clockGate({ clock: 999, armedAt: 1000 }), R.backwards, "one tick backwards");
  expectPacked(clockGate({ clock: 6000, armedAt: 1000, budget: 5000 }), R.deadline, "first tick past deadline");
  expectPacked(clockGate({ clock: 2147483647, armedAt: 2147483640, budget: 100 }), R.overflow, "armed plus budget overflows");
});

test("a foreign class on any clock field never admits", () => {
  for (const key of ["clockClass", "presentClass", "armedClass", "budgetClass", "clockEpochClass", "armedEpochClass"]) {
    for (const cls of [1, 2, 3, -1]) {
      const r = clockGate({ [key]: cls });
      assert.equal(r.status, 0, key + " " + cls + " " + r.text);
      assert.equal(r.present, true, key + " " + cls + " " + r.text);
      assert.notEqual(r.value, R.admit, key + " class " + cls + " admitted");
      assert.ok(r.value === R.malformed || r.value === R.untrusted, key + " " + cls + " => " + r.value);
    }
  }
});

test("leased use with armed time 0 is refused the same way as a negative armed time", () => {
  const zero = leasedUse({ clock: 0, armedAt: 0 });
  const negative = leasedUse({ clock: 0, armedAt: -1 });
  const clean = leasedUse({});
  assert.equal(zero.status, 0, zero.text);
  assert.equal(zero.present, true, zero.text);
  assert.equal(zero.value, negative.value, "armed 0 refused like armed -1");
  assert.notEqual(zero.value, clean.value, "armed 0 is not the clean result");
});