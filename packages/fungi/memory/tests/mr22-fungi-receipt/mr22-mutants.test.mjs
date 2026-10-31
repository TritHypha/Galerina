// MR22 mutants: each must move a pinned value. Exact source string
// replacements on a flattened copy; the tracked unit is sha256-checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, spend, outcome, oneUse, receiptsAfter, K3, LEASE_SPENT } from "./mr22-harness.mjs";

function killed(needle, next, label, run, original) {
  withMutant(needle, next, label, () => {
    const r = run();
    assert.ok(!r.present || r.value !== original, label + " survived: " + r.text);
  });
}

test("baseline values the mutants must move", () => {
  assert.equal(spend({ spentCount: 1, receiptCount: 0 }).value, 106);
  assert.equal(oneUse({ spentCount: 1, receiptCount: 1 }).value, LEASE_SPENT);
  assert.equal(outcome(117).value, K3.unknown);
  assert.equal(outcome(152).value, K3.deny);
  assert.equal(receiptsAfter({ spentCount: 1, receiptCount: 1 }).value, 1);
  assert.equal(spend({ spentCount: 1, receiptCount: 1 }).value, LEASE_SPENT);
});

test("R1 dropped receipt-agreement check is killed", () => {
  killed("  if spentCount != receiptCount {", "  if spentCount > 999 {", "R1",
    () => spend({ spentCount: 1, receiptCount: 0 }), 106);
});

test("R2 spend gate skipped in one-use leased use is killed", () => {
  killed("  if spend != 100 {\n    return spend", "  if spend > 999 {\n    return spend", "R2",
    () => oneUse({ spentCount: 1, receiptCount: 1 }), LEASE_SPENT);
});

test("R3 UNKNOWN default written as 0 is killed", () => {
  killed("  return -128\n}\n\npure flow arenaOneUseLeasedUse", "  return 0\n}\n\npure flow arenaOneUseLeasedUse", "R3",
    () => outcome(117), K3.unknown);
});

test("R4 LEASE_SPENT outcome dropped to UNKNOWN is killed", () => {
  killed("  if verdict == 152 {\n    return -1", "  if verdict == 152 {\n    return -128", "R4",
    () => outcome(152), K3.deny);
});

test("R5 refused reuse writing a second receipt is killed", () => {
  killed("  if spendAfter == 152 {\n    return receiptCount\n", "  if spendAfter == 152 {\n    return receiptCount + 1\n", "R5",
    () => receiptsAfter({ spentCount: 1, receiptCount: 1 }), 1);
});

test("R6 spent arm admitting a second use is killed", () => {
  killed("  if spentCount == 1 {\n    return finish(52, true)", "  if spentCount == 1 {\n    return finish(0, true)", "R6",
    () => spend({ spentCount: 1, receiptCount: 1 }), LEASE_SPENT);
});