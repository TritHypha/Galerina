// MR22 spend gate: unspent admits, spent refuses 152, a broken receipt
// invariant is 106 UNKNOWN, foreign classes refuse as 111/110.
import { test } from "node:test";
import { spend, expectPacked, LEASE_SPENT } from "./mr22-harness.mjs";

test("unspent lease with no receipt admits 100", () => {
  expectPacked(spend(), 100, "0/0");
});

test("spent lease with its one receipt refuses 152 LEASE_SPENT", () => {
  expectPacked(spend({ spentCount: 1, receiptCount: 1 }), LEASE_SPENT, "1/1");
});

test("spent mark without a receipt is 106 (use left no receipt)", () => {
  expectPacked(spend({ spentCount: 1, receiptCount: 0 }), 106, "1/0");
});

test("receipt without a spent mark is 106 (orphan receipt)", () => {
  expectPacked(spend({ spentCount: 0, receiptCount: 1 }), 106, "0/1");
});

test("negative or more than one of either count is 106", () => {
  for (const [s, r] of [[-1, 0], [0, -1], [2, 2], [2, 1], [1, 2], [0, 2], [2, 0], [-1, -1], [2147483647, 2147483647]]) {
    expectPacked(spend({ spentCount: s, receiptCount: r }), 106, `${s}/${r}`);
  }
});

test("unlisted and malformed classes refuse before the counts are read", () => {
  expectPacked(spend({ spentClass: 99, spentCount: 1, receiptCount: 1 }), 111, "spent unlisted");
  expectPacked(spend({ receiptClass: 99 }), 111, "receipt unlisted");
  expectPacked(spend({ spentClass: 1 }), 110, "spent listed foreign tag");
  expectPacked(spend({ receiptClass: 2, spentCount: 1 }), 110, "receipt listed foreign tag");
});