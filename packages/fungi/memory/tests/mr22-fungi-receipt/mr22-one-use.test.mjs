// MR22 one-use leased use: the spend gate runs before the lease opens, so a
// second use is refused with 152, reads nothing and does not depend on any
// use input; an unspent lease behaves exactly like arenaLeasedUse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { oneUse, leasedUse, expectPacked, ST, LEASE_SPENT } from "./mr22-harness.mjs";

const USE_VARIANTS = [
  {},
  { dataLen: 4096 },
  { callbackToken: 2 },
  { callbackToken: 4 },
  { wipeToken: 1 },
  { wipeToken: 2 },
  { abortToken: 1 },
  { liveCount: 1 },
  { stateToken: ST.quarantined },
  { stateToken: ST.disposed },
  { stateClass: 99 },
  { clock: 0 },
  { budget: 1 },
];

test("unspent lease returns exactly the arenaLeasedUse verdict", () => {
  for (const v of USE_VARIANTS) {
    const a = oneUse(v);
    const b = leasedUse(v);
    assert.equal(a.status, 0, JSON.stringify(v));
    assert.equal(a.value, b.value, `variant ${JSON.stringify(v)}`);
  }
});

test("first use of a fresh lease is ok", () => {
  expectPacked(oneUse(), 100, "fresh");
});

test("second use is 152 for every use input (refused before any read)", () => {
  for (const v of USE_VARIANTS) {
    expectPacked(oneUse({ ...v, spentCount: 1, receiptCount: 1 }), LEASE_SPENT, `spent ${JSON.stringify(v)}`);
  }
});

test("broken receipt invariant is 106 for every use input", () => {
  for (const v of USE_VARIANTS) {
    expectPacked(oneUse({ ...v, spentCount: 1, receiptCount: 0 }), 106, `1/0 ${JSON.stringify(v)}`);
    expectPacked(oneUse({ ...v, spentCount: 0, receiptCount: 1 }), 106, `0/1 ${JSON.stringify(v)}`);
  }
});

test("spend gate wins over a disposed or nested lease state", () => {
  expectPacked(oneUse({ spentCount: 1, receiptCount: 1, stateToken: ST.disposed }), LEASE_SPENT, "disposed");
  expectPacked(oneUse({ spentCount: 1, receiptCount: 1, liveCount: 1 }), LEASE_SPENT, "nested");
  expectPacked(oneUse({ spentClass: 99, liveCount: 1 }), 111, "unlisted spend class");
});