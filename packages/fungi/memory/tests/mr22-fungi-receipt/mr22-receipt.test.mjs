// MR22 receipts: one receipt per lease, outcome as a K3 Int (1 / -1 / -128,
// never 0), refused reuse writes no second receipt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { outcome, receiptsAfter, oneUse, K3, LEASE_SPENT } from "./mr22-harness.mjs";

const DENY = [102, 110, 111, 113, 114, 115, 116, 141, 147, 150, 151, 152];
const UNKNOWN = [106, 117, 0, 1, 11, 99, 101, 103, 112, 121, 139, 140, 148, 153, 199, 1000, -1, -128, 2147483647];

test("100 is ALLOW", () => {
  assert.equal(outcome(100).value, K3.allow);
});

test("listed refusals are DENY", () => {
  for (const v of DENY) assert.equal(outcome(v).value, K3.deny, `verdict ${v}`);
});

test("106, 117 and unlisted verdicts are UNKNOWN (-128), never 0", () => {
  for (const v of UNKNOWN) {
    const r = outcome(v);
    assert.equal(r.status, 0);
    assert.equal(r.value, K3.unknown, `verdict ${v}`);
    assert.notEqual(r.value, 0);
  }
});

test("receipt count after one attempt is 1 or untrusted (11), never 2", () => {
  for (const s of [-1, 0, 1, 2]) {
    for (const c of [-1, 0, 1, 2]) {
      const v = receiptsAfter({ spentCount: s, receiptCount: c }).value;
      const ok = (s === 0 && c === 0) || (s === 1 && c === 1);
      assert.equal(v, ok ? 1 : 11, `${s}/${c}`);
    }
  }
  assert.equal(receiptsAfter({ spentClass: 99 }).value, 11);
});

test("two attempts on one lease: one ALLOW receipt, then DENY with no new receipt", () => {
  const first = oneUse();
  assert.equal(first.value, 100);
  assert.equal(outcome(first.value).value, K3.allow);
  assert.equal(receiptsAfter().value, 1);
  const second = oneUse({ spentCount: 1, receiptCount: 1 });
  assert.equal(second.value, LEASE_SPENT);
  assert.equal(outcome(second.value).value, K3.deny);
  assert.equal(receiptsAfter({ spentCount: 1, receiptCount: 1 }).value, 1);
});

test("a failed first use still writes its one receipt, as UNKNOWN", () => {
  const first = oneUse({ wipeToken: 1 });
  assert.equal(first.value, 117);
  assert.equal(outcome(first.value).value, K3.unknown);
  assert.equal(receiptsAfter().value, 1);
});