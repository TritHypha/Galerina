// pbi.test.mjs — PhotonicBridgeInterface / LocalSramBus seam.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StaticMemoryPool,
  LocalSramBus,
  HardenedBorderViolation,
} from "../dist/index.js";
import { caught } from "./_helpers.mjs";

const mk = () => {
  const pool = new StaticMemoryPool({ totalBytes: 8192, blockBytes: 16, computeRatio: 1 });
  return new LocalSramBus(pool);
};

test("LocalSramBus.validateBusIntegrity() === true", () => {
  assert.equal(mk().validateBusIntegrity(), true);
});

test("channel read/write round-trips", () => {
  const bus = mk();
  const ch = bus.channel(0);
  const data = Int32Array.from([7, -3, 42, 0]);
  ch.write(0, data);
  const got = ch.read(0, 4);
  assert.deepEqual([...got], [7, -3, 42, 0]);
});

test("distinct channels are strided (do not alias)", () => {
  const bus = mk();
  const a = bus.channel(0);
  const b = bus.channel(1);
  a.write(0, Int32Array.from([111]));
  b.write(0, Int32Array.from([222]));
  assert.equal(a.read(0, 1)[0], 111);
  assert.equal(b.read(0, 1)[0], 222);
});

test("attachExternalBus('photonic') throws HardenedBorderViolation", () => {
  const bus = mk();
  const err = caught(() => bus.attachExternalBus("photonic"));
  assert.ok(err instanceof HardenedBorderViolation);
  assert.equal(err.code, "LSM-PBI-001");
});

test("attachExternalBus('local') is a no-op (already attached)", () => {
  const bus = mk();
  assert.doesNotThrow(() => bus.attachExternalBus("local"));
});
