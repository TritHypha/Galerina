// flush-io-failure.test.mjs — a failed ledger write must not drop staged audit records.
//
// AuditEgress promises "an audit record is NEVER dropped". Before this fix flush() drained the ring
// BEFORE appendFileSync; when the append threw (disk full, permission flip, path replaced) the drained
// records were gone — not on disk, not staged — and the chain head stayed put, so the loss was silent
// on the next successful flush. The write failure is simulated portably by occupying the ledger path
// with a directory, which makes appendFileSync throw on every platform.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEgress, readEgressLedger } from "../dist/audit-egress.js";

const KEY = new Uint8Array(32).fill(7);
const createdDirs = [];
function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), "galerina-egress-iofail-"));
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

function blockLedger(dir) {
  const ledger = join(dir, "audit-egress.jsonl");
  mkdirSync(ledger);
  return () => rmSync(ledger, { recursive: true, force: true });
}

test("a throwing flush keeps the drained records staged and the chain head unchanged", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 10, hmacKey: KEY });
  eg.push("a-0");
  eg.push("a-1");
  eg.push("a-2");
  const headBefore = eg.chainHead;
  const unblock = blockLedger(dir);

  assert.throws(() => eg.flush());
  assert.equal(eg.pendingCount(), 3, "records drained for the failed write must be re-staged");
  assert.equal(eg.chainHead, headBefore, "a failed write must not advance the chain");

  unblock();
  const batch = eg.flush();
  assert.notEqual(batch, null);
  const batches = readEgressLedger(dir);
  assert.deepEqual(batches.flatMap((b) => [...b.records]), ["a-0", "a-1", "a-2"]);
  assert.equal(batches[0].seq, 0);
  assert.equal(AuditEgress.verifyChain(batches, KEY), true);
});

test("an auto-flush failure inside push() keeps every record, including the one being pushed", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, ringCapacity: 2, hmacKey: KEY });
  const unblock = blockLedger(dir);
  eg.push("p-0");
  assert.throws(() => eg.push("p-1")); // ring reaches batchSize → auto-flush → write fails
  assert.equal(eg.pendingCount(), 2);

  unblock();
  eg.flush();
  const all = readEgressLedger(dir).flatMap((b) => [...b.records]);
  assert.deepEqual(all, ["p-0", "p-1"]);
});

test("records staged before a failed epoch switch stay under the old epoch and are not lost", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 10, hmacKey: KEY, epochId: 1 });
  eg.push("e-0");
  const unblock = blockLedger(dir);
  assert.throws(() => eg.adoptEpoch(2, new Uint8Array(32).fill(9)));
  assert.equal(eg.epochId, 1, "the epoch must not switch when sealing the old epoch failed");
  assert.equal(eg.pendingCount(), 1);

  unblock();
  eg.flush();
  const batches = readEgressLedger(dir);
  assert.deepEqual(batches.flatMap((b) => [...b.records]), ["e-0"]);
  assert.equal(batches[0].epochId, 1);
  assert.equal(AuditEgress.verifyChainEpochAware(batches, (id) => (id === 1 ? KEY : null)), true);
});
