// atomic-writer.test.mjs — double-buffered atomic write/read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StateSerializer, AtomicWriter, SecurityTrap } from "../dist/index.js";
import { tmpDir } from "./_tmp.mjs";

const TEST_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

test("write → read round-trips a snapshot", () => {
  const w = new AtomicWriter(tmpDir());
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 1, b: [1, 2, 3] }, 5);
  w.write("ckpt", snap);
  const back = w.read("ckpt");
  assert.deepEqual(back, snap);
});

test("read of a missing name returns null", () => {
  const w = new AtomicWriter(tmpDir());
  assert.equal(w.read("does-not-exist"), null);
});

test("write and scrub refuse a planted snapshot symlink", () => {
  const dir = tmpDir();
  const w = new AtomicWriter(dir);
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 1 }, 1);
  const outside = join(dir, "..", `outside-${process.pid}.txt`);
  writeFileSync(outside, "secret-outside");
  const live = join(dir, "ckpt.snap");
  try {
    symlinkSync(outside, live);
  } catch {
    return; // platform may refuse symlink creation
  }
  assert.throws(() => w.write("ckpt", snap), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
  assert.throws(() => w.read("ckpt"), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
  assert.throws(() => w.scrub("ckpt"), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
});

test("snapshot names cannot escape the storage directory", () => {
  const w = new AtomicWriter(tmpDir());
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 1 }, 1);
  assert.throws(() => w.write("../escape", snap), (err) => err instanceof SecurityTrap && err.code === "LSS-NAME-001");
  assert.throws(() => w.read("a/../../x"), (err) => err instanceof SecurityTrap && err.code === "LSS-NAME-001");
});
