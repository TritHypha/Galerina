import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuditEgress,
  readEgressLedger,
} from "../dist/audit-egress.js";

// Kernel-unique scratch dir per test (mkdtemp): a recycled PID or concurrent run
// can never append to a stale ledger. Tracked + removed after the run so nothing
// accumulates. (Was a relative `build/<pid>-<n>` dir — flaky under load.)
const createdDirs = [];
function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), "galerina-egress-"));
  createdDirs.push(dir);
  return dir;
}
after(() => {
  for (const d of createdDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

test("batchSize <= 0 throws EGR-CFG-001", () => {
  assert.throws(
    () => new AuditEgress({ dir: freshDir(), batchSize: 0 }),
    (e) => e.code === "EGR-CFG-001",
  );
  assert.throws(
    () => new AuditEgress({ dir: freshDir(), batchSize: -1 }),
    (e) => e.code === "EGR-CFG-001",
  );
});

test("pushing batchSize records auto-flushes exactly one batch to disk", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 4 });
  eg.push("e0");
  eg.push("e1");
  eg.push("e2");
  assert.equal(eg.pendingCount(), 3);
  // genesis still the head until the auto-flush
  assert.equal(eg.chainHead, "0".repeat(64));
  eg.push("e3"); // hits batchSize -> auto-flush
  assert.equal(eg.pendingCount(), 0);
  assert.notEqual(eg.chainHead, "0".repeat(64));

  const batches = readEgressLedger(dir);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 4);
  assert.equal(batches[0].seq, 0);
  assert.deepEqual([...batches[0].records], ["e0", "e1", "e2", "e3"]);
});

test("manual flush of a partial buffer writes a batch; chainHead advances", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 10 });
  eg.push("a");
  eg.push("b");
  assert.equal(eg.pendingCount(), 2);
  const head0 = eg.chainHead;
  const batch = eg.flush();
  assert.ok(batch);
  assert.equal(batch.count, 2);
  assert.equal(eg.pendingCount(), 0);
  assert.notEqual(eg.chainHead, head0);
  assert.equal(eg.chainHead, batch.batchHash);
});

test("flush() with nothing buffered returns null and writes no file content", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 5 });
  assert.equal(eg.flush(), null);
  const path = join(dir, "audit-egress.jsonl");
  // either no file, or an empty file -> readEgressLedger yields []
  assert.deepEqual(readEgressLedger(dir), []);
  if (existsSync(path)) {
    assert.deepEqual(readEgressLedger(dir), []);
  }
});

test("readEgressLedger on a missing dir returns []", () => {
  // A guaranteed-non-existent child of a fresh (empty) temp dir.
  const missing = join(freshDir(), "does-not-exist");
  assert.equal(existsSync(missing), false);
  assert.deepEqual(readEgressLedger(missing), []);
});

test("seq increments monotonically across multiple flushed batches", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2 });
  eg.push("a"); eg.push("b"); // flush -> seq 0
  eg.push("c"); eg.push("d"); // flush -> seq 1
  eg.push("e"); eg.flush();   // flush -> seq 2
  const batches = readEgressLedger(dir);
  assert.deepEqual(batches.map((b) => b.seq), [0, 1, 2]);
});
