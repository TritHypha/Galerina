// atomic-writer-durability.test.mjs — zero-trust default, owner may revisit: a checkpoint is durable
// before it is published.
//
// AtomicWriter.write() promised crash safety but (a) made ONE unchecked writeSync, so a short write left
// a truncated `.tmp` that was then renamed over the good `.snap`, and (b) never fsynced, so after a power
// cut the renamed file could be empty or partial. It now loops until every byte is written, fsyncs the
// file before rename, and fsyncs the directory after rename where the platform supports it (POSIX;
// Windows cannot open a directory for fsync, so that step is skipped there).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { AtomicWriter, StateSerializer } from "../dist/index.js";

const require = createRequire(import.meta.url);
const fs = require("node:fs");
const original = { fsyncSync: fs.fsyncSync, writeSync: fs.writeSync };
const dirs = [];
function restore() {
  fs.fsyncSync = original.fsyncSync;
  fs.writeSync = original.writeSync;
  syncBuiltinESMExports();
}
after(() => {
  restore();
  for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
});
const freshDir = () => { const d = mkdtempSync(join(tmpdir(), "galerina-lss-durable-")); dirs.push(d); return d; };
const serializer = new StateSerializer({ hmacKey: new Uint8Array(32).fill(0x31) });

test("write() fsyncs the snapshot file before publishing it", () => {
  const writer = new AtomicWriter(freshDir());
  const synced = [];
  fs.fsyncSync = (fd) => { synced.push(fd); return original.fsyncSync(fd); };
  syncBuiltinESMExports();
  try {
    writer.write("cp", serializer.serialize({ n: 1 }, 1));
  } finally {
    restore();
  }
  const expected = process.platform === "win32" ? 1 : 2; // file, then directory (POSIX)
  assert.ok(synced.length >= expected, `expected at least ${expected} fsync call(s), saw ${synced.length}`);
});

test("a short writeSync is completed, never published truncated", () => {
  const writer = new AtomicWriter(freshDir());
  const snap = serializer.serialize({ text: "x".repeat(500) }, 2);
  fs.writeSync = (fd, data, ...rest) => {
    // Simulate a kernel that accepts at most 7 bytes per call.
    if (typeof data === "string") {
      const bytes = Buffer.from(data, "utf8").subarray(0, 7);
      return original.writeSync(fd, bytes, 0, bytes.length);
    }
    const [offset = 0, length = data.length - offset, position] = rest;
    return original.writeSync(fd, data, offset, Math.min(7, length), position);
  };
  syncBuiltinESMExports();
  try {
    writer.write("cp", snap);
  } finally {
    restore();
  }
  assert.deepEqual(writer.read("cp"), snap);
  assert.equal(serializer.verify(writer.read("cp")), true);
});

test("an fsync failure refuses the write and leaves the previous snapshot live", () => {
  const writer = new AtomicWriter(freshDir());
  const first = serializer.serialize({ gen: 1 }, 1);
  writer.write("cp", first);
  fs.fsyncSync = () => { const e = new Error("EIO: simulated"); e.code = "EIO"; throw e; };
  syncBuiltinESMExports();
  try {
    assert.throws(() => writer.write("cp", serializer.serialize({ gen: 2 }, 2)), /EIO/);
  } finally {
    restore();
  }
  assert.deepEqual(writer.read("cp"), first);
});
