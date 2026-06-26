import { test } from "node:test";
import assert from "node:assert/strict";
import { RingBuffer } from "../dist/ring-buffer.js";

test("push up to capacity returns true", () => {
  const rb = new RingBuffer(3);
  assert.equal(rb.push("a"), true);
  assert.equal(rb.push("b"), true);
  assert.equal(rb.push("c"), true);
  assert.equal(rb.size, 3);
  assert.equal(rb.capacity, 3);
  assert.equal(rb.isFull, true);
});

test("the (capacity+1)th push returns false (backpressure)", () => {
  const rb = new RingBuffer(2);
  assert.equal(rb.push("a"), true);
  assert.equal(rb.push("b"), true);
  assert.equal(rb.push("c"), false);
  assert.equal(rb.size, 2);
});

test("drain returns FIFO order and empties the buffer", () => {
  const rb = new RingBuffer(4);
  rb.push("x");
  rb.push("y");
  rb.push("z");
  const out = rb.drain();
  assert.deepEqual(out, ["x", "y", "z"]);
  assert.equal(rb.size, 0);
  assert.equal(rb.isFull, false);
});

test("ring wraps correctly across drain cycles (FIFO preserved)", () => {
  const rb = new RingBuffer(3);
  rb.push("a");
  rb.push("b");
  assert.deepEqual(rb.drain(), ["a", "b"]);
  // After a partial drain, head moved; ensure wrap math still FIFO.
  rb.push("c");
  rb.push("d");
  rb.push("e");
  assert.equal(rb.push("f"), false); // full again
  assert.deepEqual(rb.drain(), ["c", "d", "e"]);
});

test("capacity 0 throws EGR-RING-001", () => {
  assert.throws(() => new RingBuffer(0), (e) => e.code === "EGR-RING-001");
});

test("negative capacity throws EGR-RING-001", () => {
  assert.throws(() => new RingBuffer(-5), (e) => e.code === "EGR-RING-001");
});

test("non-integer capacity throws EGR-RING-001", () => {
  assert.throws(() => new RingBuffer(2.5), (e) => e.code === "EGR-RING-001");
});
