import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuditEgress,
  readEgressLedger,
} from "../dist/audit-egress.js";

// Kernel-unique scratch dir per test (mkdtemp): a recycled PID or concurrent run
// can never append to a stale ledger. Tracked + removed after the run so nothing
// accumulates. (Was a relative `build/<pid>-<n>` dir — flaky under load.)
const DEV_KEY = new Uint8Array(32);
const createdDirs = [];
function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), "galerina-egress-hmac-"));
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

test("hostile: omitted hmacKey throws EGR-KEY-002", () => {
  assert.throws(
    () => new AuditEgress({ dir: freshDir(), batchSize: 2 }),
    (e) => e.code === "EGR-KEY-002",
  );
});

test("named development zero-key is admitted without strictKey and refused with it", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY });
  eg.push("dev-a");
  eg.push("dev-b");
  eg.flush();
  assert.equal(AuditEgress.verifyChain(readEgressLedger(dir), DEV_KEY), true);
  assert.equal(AuditEgress.verifyChain(readEgressLedger(dir)), false);
  assert.throws(
    () => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: DEV_KEY, strictKey: true }),
    (e) => e.code === "EGR-KEY-001",
  );
});

test("positive: an explicit nonzero key seals a verifiable chain", () => {
  const dir = freshDir();
  const key = new Uint8Array(32);
  key.fill(7);
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: key });
  eg.push("a");
  eg.push("b");
  eg.flush();
  assert.equal(AuditEgress.verifyChain(readEgressLedger(dir), key), true);
});

test("readEgressLedger after several batches -> verifyChain === true", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 3, hmacKey: DEV_KEY });
  for (let i = 0; i < 11; i++) eg.push(`rec-${i}`);
  eg.flush(); // flush the partial tail
  const batches = readEgressLedger(dir);
  assert.ok(batches.length >= 3);
  assert.equal(batches[0].prevHash, "0".repeat(64));
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);
});

test("mutating one record in one batch -> verifyChain === false", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY });
  for (let i = 0; i < 6; i++) eg.push(`x-${i}`);
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);

  // Tamper: rewrite a record (records is readonly at the type level; mutate the
  // parsed runtime object to simulate an on-disk edit).
  const tampered = batches.map((b) => ({ ...b, records: [...b.records] }));
  tampered[1].records[0] = "TAMPERED";
  assert.equal(AuditEgress.verifyChain(tampered), false);
});

test("breaking a prevHash link -> verifyChain === false", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY });
  for (let i = 0; i < 6; i++) eg.push(`y-${i}`);
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);

  const broken = batches.map((b) => ({ ...b }));
  broken[2].prevHash = "f".repeat(64);
  assert.equal(AuditEgress.verifyChain(broken), false);
});

test("a wrong HMAC key -> verifyChain === false", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY });
  for (let i = 0; i < 4; i++) eg.push(`z-${i}`);
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);
  const wrongKey = new Uint8Array(32).fill(7);
  assert.equal(AuditEgress.verifyChain(batches, wrongKey), false);
});

test("merging newline-containing records cannot preserve the MAC", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY });
  eg.push("a");
  eg.push("b");
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);
  const merged = batches.map((b) => ({
    ...b,
    count: 1,
    records: [b.records.join("\n")],
  }));
  assert.equal(AuditEgress.verifyChain(merged), false);
});

test("splitting one record into two cannot preserve the MAC", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 1, hmacKey: DEV_KEY });
  eg.push("ab");
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);
  const split = batches.map((b) => ({
    ...b,
    count: 2,
    records: ["a", "b"],
  }));
  assert.equal(AuditEgress.verifyChain(split), false);
});

test("chain verifies under an injected (non-zero) HMAC key", () => {
  const dir = freshDir();
  const key = new Uint8Array(32).fill(42);
  const eg = new AuditEgress({ dir, batchSize: 3, hmacKey: key });
  for (let i = 0; i < 7; i++) eg.push(`k-${i}`);
  eg.flush();
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches, key), true);
  // and FALSE under the default zero key
  assert.equal(AuditEgress.verifyChain(batches), false);
});

test("hostile: omitted hmacKey does not authenticate a ZERO_KEY ledger", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY });
  for (let i = 0; i < 4; i++) eg.push(`omit-${i}`);
  eg.flush();
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChain(batches), false);
  assert.equal(AuditEgress.verifyChain(batches, DEV_KEY), true);
});
