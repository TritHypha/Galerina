// u64-arith — strict-trapping UNSIGNED 64-bit arithmetic (the UInt64 unlock foundation).
// Mirrors i64-arith's Fork-A trap model but in [0, 2^64-1]: overflow/underflow/divzero TRAP (no silent
// wraparound), and div/rem are UNSIGNED. The layer is the proven foundation; interpreter wiring + the
// SPORE-NUMERIC-001 gate-lift land next (prove the math, then admit the type).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  U64_MIN, U64_MAX, isU64Trap,
  u64AddChecked, u64SubChecked, u64MulChecked, u64DivChecked, u64ModChecked, u64NegChecked,
} from "../dist/u64-arith.js";
import {
  I64_MAX, i64DivChecked,
} from "../dist/i64-arith.js";

test("range constants are exactly the unsigned 64-bit bounds", () => {
  assert.equal(U64_MIN, 0n);
  assert.equal(U64_MAX, 18446744073709551615n); // 2^64 - 1
  assert.equal(U64_MAX, 2n ** 64n - 1n);
});

// ── exact arithmetic (the owner's oracle + general) ──
test("3e9 + 3e9 = 6e9 exactly (the oracle; exceeds i32, exact in u64)", () => {
  assert.equal(u64AddChecked(3000000000n, 3000000000n), 6000000000n);
});
test("add/sub/mul are exact within range", () => {
  assert.equal(u64AddChecked(U64_MAX - 1n, 1n), U64_MAX); // edge: lands exactly on MAX, no trap
  assert.equal(u64SubChecked(10n, 7n), 3n);
  assert.equal(u64MulChecked(4294967296n, 2147483648n), 9223372036854775808n); // 2^32 * 2^31 = 2^63, in range
});

// ── overflow / underflow TRAP (no wraparound) ──
test("add overflow at the 2^64 boundary TRAPS (not wrap-to-0)", () => {
  assert.equal(u64AddChecked(U64_MAX, 1n), "IntegerOverflow");
  assert.ok(isU64Trap(u64AddChecked(U64_MAX, U64_MAX)));
});
test("mul overflow TRAPS (2^32 * 2^32 = 2^64 > MAX)", () => {
  assert.equal(u64MulChecked(4294967296n, 4294967296n), "IntegerOverflow");
});
test("subtraction below 0 is an unsigned UNDERFLOW → TRAP", () => {
  assert.equal(u64SubChecked(0n, 1n), "IntegerOverflow");
  assert.equal(u64SubChecked(3n, 5n), "IntegerOverflow");
});

// ── divide / modulo ──
test("div/mod by zero TRAP", () => {
  assert.equal(u64DivChecked(5n, 0n), "DivisionByZero");
  assert.equal(u64ModChecked(5n, 0n), "DivisionByZero");
});
test("div truncates toward zero; mod is the unsigned remainder", () => {
  assert.equal(u64DivChecked(10n, 3n), 3n);
  assert.equal(u64ModChecked(10n, 3n), 1n);
  assert.equal(u64ModChecked(U64_MAX, 2n), 1n); // 2^64-1 is odd
});

// ── the WHOLE POINT of a separate layer: unsigned div differs from signed for values ≥ 2^63 ──
test("unsigned division is correct for operands ABOVE 2^63 (where signed i64 cannot represent them)", () => {
  // 2^63 unsigned / 2 = 2^62. As signed i64, 2^63 is out of range entirely.
  assert.equal(u64DivChecked(9223372036854775808n, 2n), 4611686018427387904n); // 2^63 / 2 = 2^62
  // 2^64-1 (max unsigned) / 2 = 2^63 - 1 = I64_MAX. The big-unsigned division the i64 layer can't do.
  assert.equal(u64DivChecked(U64_MAX, 2n), I64_MAX);
  assert.equal(u64DivChecked(U64_MAX, 2n), 9223372036854775807n);
});
test("a high operand exposes the signed/unsigned split (justifies the dedicated u64 layer)", () => {
  const hi = 18446744073709551614n; // 2^64 - 2, far above any signed i64 value
  assert.equal(u64DivChecked(hi, 2n), 9223372036854775807n); // unsigned: exact
  // the same magnitude is simply not an i64 operand — i64DivChecked would be fed an out-of-range value;
  // this is precisely why UInt64 needed its own arithmetic rather than reusing i64.div_s.
  assert.ok(hi > I64_MAX, "operand exceeds the signed i64 max — only the unsigned layer can divide it");
});

// ── unary negation: unsigned has no negatives, so -x traps for x>0, is 0 for x=0 ──
test("negation: 0 stays 0; any positive underflows → TRAP", () => {
  assert.equal(u64NegChecked(0n), 0n);
  assert.equal(u64NegChecked(1n), "IntegerOverflow");
  assert.equal(u64NegChecked(U64_MAX), "IntegerOverflow");
});
