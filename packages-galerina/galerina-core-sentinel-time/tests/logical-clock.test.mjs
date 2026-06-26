// logical-clock.test.mjs — monotonicity, now/advance/reset, fault paths, determinism.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LogicalClock, PrecisionFault } from "../dist/index.js";
import { caught } from "./_helpers.mjs";

test("tick() is monotonic, +1 each, returns the new tick", () => {
  const c = new LogicalClock();
  assert.equal(c.startTick, 0);
  assert.equal(c.tick(), 1);
  assert.equal(c.tick(), 2);
  assert.equal(c.tick(), 3);
});

test("now() reports the current tick without advancing", () => {
  const c = new LogicalClock(5);
  assert.equal(c.now(), 5);
  assert.equal(c.now(), 5);
  c.tick();
  assert.equal(c.now(), 6);
});

test("advance(n) adds n and returns the new tick", () => {
  const c = new LogicalClock();
  assert.equal(c.advance(10), 10);
  assert.equal(c.advance(0), 10);
  assert.equal(c.advance(5), 15);
  assert.equal(c.now(), 15);
});

test("reset returns to start (default 0) and re-anchors startTick", () => {
  const c = new LogicalClock(3);
  c.advance(20);
  c.reset();
  assert.equal(c.now(), 0);
  assert.equal(c.startTick, 0);
  c.reset(100);
  assert.equal(c.now(), 100);
  assert.equal(c.startTick, 100);
});

test("negative / non-integer startTick throws PrecisionFault LST-INIT-001", () => {
  let err = caught(() => new LogicalClock(-1));
  assert.ok(err instanceof PrecisionFault);
  assert.equal(err.code, "LST-INIT-001");
  assert.equal(err.name, "PrecisionFault");
  assert.equal(caught(() => new LogicalClock(1.5)).code, "LST-INIT-001");
  assert.equal(caught(() => new LogicalClock(3).reset(-2)).code, "LST-INIT-001");
});

test("advance(-1) / non-integer advance throws PrecisionFault LST-ADV-001", () => {
  const c = new LogicalClock();
  const err = caught(() => c.advance(-1));
  assert.ok(err instanceof PrecisionFault);
  assert.equal(err.code, "LST-ADV-001");
  assert.equal(caught(() => c.advance(2.5)).code, "LST-ADV-001");
});

test("determinism: same startTick yields identical tick sequences", () => {
  const a = new LogicalClock(7);
  const b = new LogicalClock(7);
  const seqA = [];
  const seqB = [];
  for (let i = 0; i < 50; i++) {
    seqA.push(a.tick());
    seqB.push(b.tick());
  }
  assert.deepEqual(seqA, seqB);
  assert.equal(a.now(), b.now());
});
