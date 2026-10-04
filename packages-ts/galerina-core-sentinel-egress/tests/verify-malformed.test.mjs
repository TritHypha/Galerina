// verify-malformed.test.mjs — chain verification answers `false` for a malformed ledger, never throws.
//
// verifyChain / verifyChainEpochAware document "Any mismatch returns false". A ledger is read back from
// disk with JSON.parse, so a hostile or corrupted line can be any JSON value. Before this fix a `null`
// line, a batch without `records`, or a non-string record threw a TypeError out of the verifier, and a
// batch whose `records` was a STRING verified true (string iteration hashes like an array of chars).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEgress, readEgressLedger } from "../dist/audit-egress.js";

const KEY = new Uint8Array(32).fill(5);
const keyForEpoch = (id) => (id === 1 ? KEY : null);
const createdDirs = [];
after(() => {
  for (const d of createdDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

function ledger(epochId) {
  const dir = mkdtempSync(join(tmpdir(), "galerina-egress-malformed-"));
  createdDirs.push(dir);
  const eg = new AuditEgress({ dir, batchSize: 3, hmacKey: KEY, ...(epochId !== undefined ? { epochId } : {}) });
  for (const r of ["a", "b", "c", "d", "e", "f"]) eg.push(r);
  eg.flush();
  return readEgressLedger(dir);
}

const mutations = [
  ["a null batch", (bs) => { bs[1] = JSON.parse("null"); }],
  ["a non-object batch", (bs) => { bs[1] = 42; }],
  ["a batch without records", (bs) => { delete bs[1].records; }],
  ["records that are not an array", (bs) => { bs[1].records = { length: 3 }; }],
  ["a non-string record", (bs) => { bs[1].records = [1, 2, 3]; }],
  ["a non-string batchHash", (bs) => { bs[1].batchHash = 7; }],
  ["a non-integer seq", (bs) => { bs[0].seq = "0"; }],
];

for (const [label, mutate] of mutations) {
  test(`verifyChain returns false (does not throw) for ${label}`, () => {
    const bs = ledger();
    assert.equal(AuditEgress.verifyChain(bs, KEY), true);
    mutate(bs);
    assert.equal(AuditEgress.verifyChain(bs, KEY), false);
  });
  test(`verifyChainEpochAware returns false (does not throw) for ${label}`, () => {
    const bs = ledger(1);
    assert.equal(AuditEgress.verifyChainEpochAware(bs, keyForEpoch), true);
    mutate(bs);
    assert.equal(AuditEgress.verifyChainEpochAware(bs, keyForEpoch), false);
  });
}

test("a batch whose records field is a string does not verify, even though its MAC matches", () => {
  const bs = ledger();
  bs[0].records = bs[0].records.join(""); // "abc" — same chars, wrong shape
  assert.equal(AuditEgress.verifyChain(bs, KEY), false);
  const be = ledger(1);
  be[0].records = be[0].records.join("");
  assert.equal(AuditEgress.verifyChainEpochAware(be, keyForEpoch), false);
});
