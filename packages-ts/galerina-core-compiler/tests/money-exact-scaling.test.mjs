// money-exact-scaling — RD-0349 I3: Money multiply/divideBy scale EXACTLY through the BigInt decimal core,
// with NO float bridge (no parseFloat, no toFixed(10), no 1/x reciprocal). The acceptance criterion is the
// crypto blocker: an 18-decimal value survives byte-exact.
//
// R6 (Grok Bot rounding work, 2026-09-30): the stdlib's private bigIntDecimal* helpers were deleted; the
// ONE canonical decimal core (@galerina/core-runtime-wasm decimal-core, re-exported by decimal-arith) is
// the only implementation, so these cases now pin that core. The rounding mode is always explicit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decMul, decDiv, isDecTrap } from "../dist/decimal-arith.js";

// ── exact multiply: both operands as decimal strings, scales add, nothing truncates ──
test("decMul is exact and scale-adding (the VAT case still holds)", () => {
  assert.equal(decMul("100.00", "0.20"), "20.0000");
  assert.equal(decMul("0.1", "0.1"), "0.01");
  assert.equal(decMul("-0.5", "0.5"), "-0.25");
});

test("decMul survives an 18-dp factor byte-exact (the crypto blocker, I3)", () => {
  assert.equal(decMul("2", "0.333333333333333333"), "0.666666666666666666");
  assert.equal(decMul("0.000000000000000001", "2"), "0.000000000000000002");
});

test("REGRESSION GUARD: the deleted float bridge really did lose precision (why I3 exists)", () => {
  // Inline oracle of the OLD path: the exact factor went through Number → toFixed(10) before multiplying.
  const lossyOldBridge = (a, factor) => decMul(a, Number(factor).toFixed(10));
  const lossy = lossyOldBridge("2", "0.333333333333333333");
  assert.notEqual(lossy, "0.666666666666666666"); // the old path could NOT do the exact line above
  assert.equal(lossy, "0.6666666666");
});

// ── exact divide: decimal strings straight in, the caller's explicit mode, no 1/x reciprocal ──
test("decDiv is exact to the requested scale under an explicit mode (no float reciprocal, I3)", () => {
  assert.equal(decDiv("1", "3", 18, "halfUp"), "0.333333333333333333");
  assert.equal(decDiv("2", "3", 18, "halfUp"), "0.666666666666666667");
  assert.equal(decDiv("10.00", "4", 2, "halfEven"), "2.50");
  assert.equal(decDiv("-1", "3", 6, "halfUp"), "-0.333333");
});

test("decDiv fails closed on divide-by-zero with the named DivisionByZero label (never a throw)", () => {
  assert.equal(decDiv("1", "0", 2, "halfEven"), "DivisionByZero");
  assert.equal(decDiv("5", "0.00", 2, "halfEven"), "DivisionByZero");
  assert.ok(isDecTrap(decDiv("5", "0.00", 2, "halfEven")));
});

test("decDiv refuses a missing or unknown mode (no implicit default)", () => {
  assert.equal(decDiv("1", "3", 2, "nearest"), "UnknownRoundMode");
  assert.ok(isDecTrap(decDiv("1", "3", 2, "")));
});
