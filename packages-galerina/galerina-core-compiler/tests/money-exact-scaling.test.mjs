// money-exact-scaling — RD-0349 I3: Money multiply/divideBy scale EXACTLY through the BigInt decimal core,
// with NO float bridge (no parseFloat, no toFixed(10), no 1/x reciprocal). The acceptance criterion is the
// crypto blocker: an 18-decimal value survives byte-exact. This is the redness test for the live defect —
// the OLD path (bigIntDecimalMulNumber via factor.toFixed(10)) truncated at 10 dp and would FAIL these.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bigIntDecimalMul, bigIntDecimalDiv, bigIntDecimalMulNumber } from "../dist/stdlib.js";

// ── exact multiply: both operands as decimal strings, scales add, nothing truncates ──
test("bigIntDecimalMul is exact and scale-adding (the VAT case still holds)", () => {
  assert.equal(bigIntDecimalMul("100.00", "0.20"), "20.0000");
  assert.equal(bigIntDecimalMul("0.1", "0.1"), "0.01");
  assert.equal(bigIntDecimalMul("-0.5", "0.5"), "-0.25");
});

test("bigIntDecimalMul survives an 18-dp factor byte-exact (the crypto blocker, I3)", () => {
  // 2 × 0.333333333333333333 (18 threes) = 0.666666666666666666 (18 sixes) — EXACT.
  assert.equal(bigIntDecimalMul("2", "0.333333333333333333"), "0.666666666666666666");
  // A wei-scale amount (1 wei = 10^-18) times a whole number keeps every digit.
  assert.equal(bigIntDecimalMul("0.000000000000000001", "2"), "0.000000000000000002");
});

test("REGRESSION GUARD: the deprecated float bridge really did lose precision (why I3 exists)", () => {
  // The old money path routed the exact factor through factor.toFixed(10) → this is the loss the fix removes.
  const lossy = bigIntDecimalMulNumber("2", 0.333333333333333333); // truncates to ~10 dp
  assert.notEqual(lossy, "0.666666666666666666"); // proves the old path could NOT do the line above
});

// ── exact divide: decimal strings straight in, half-up on the guard digit, no 1/x reciprocal ──
test("bigIntDecimalDiv is exact to the requested scale (no float reciprocal, I3)", () => {
  assert.equal(bigIntDecimalDiv("1", "3", 18), "0.333333333333333333"); // 1/3 to 18 dp
  assert.equal(bigIntDecimalDiv("2", "3", 18), "0.666666666666666667"); // 2/3 to 18 dp, half-up on the tie-adjacent
  assert.equal(bigIntDecimalDiv("10.00", "4", 2), "2.50");              // terminating, currency-scale
  assert.equal(bigIntDecimalDiv("-1", "3", 6), "-0.333333");           // sign-correct
});

test("bigIntDecimalDiv fails closed on divide-by-zero (I3 — the caller maps it to Err)", () => {
  assert.throws(() => bigIntDecimalDiv("1", "0", 2), /division by zero/);
  assert.throws(() => bigIntDecimalDiv("5", "0.00", 2), /division by zero/);
});
