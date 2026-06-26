// atomic-writer.test.mjs — double-buffered atomic write/read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { StateSerializer, AtomicWriter } from "../dist/index.js";
import { tmpDir } from "./_tmp.mjs";

test("write → read round-trips a snapshot", () => {
  const w = new AtomicWriter(tmpDir());
  const s = new StateSerializer();
  const snap = s.serialize({ a: 1, b: [1, 2, 3] }, 5);
  w.write("ckpt", snap);
  const back = w.read("ckpt");
  assert.deepEqual(back, snap);
});

test("read of a missing name returns null", () => {
  const w = new AtomicWriter(tmpDir());
  assert.equal(w.read("does-not-exist"), null);
});
