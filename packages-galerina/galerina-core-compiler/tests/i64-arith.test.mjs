// =============================================================================
// i64-arith.ts — strict-trapping 64-bit integer arithmetic (sibling of i32-arith).
//
// The checked layer that makes faithful Int64 support possible: exact across the full i64 range via
// BigInt (no silent precision loss above 2^53 — the exact fail-open SPORE-NUMERIC-001 guarded), traps
// on overflow / div-by-zero / INT64_MIN÷-1, and matches WASM i64.div_s/rem_s (truncate-toward-zero,
// sign-of-dividend remainder) so every execution tier stays differential-identical.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  I64_MIN, I64_MAX, isI64Trap,
  i64AddChecked, i64SubChecked, i64MulChecked, i64DivChecked, i64ModChecked, i64NegChecked,
} from "../dist/i64-arith.js";

describe("i64-arith: range constants", () => {
  it("I64_MIN / I64_MAX are exactly -2^63 and 2^63-1", () => {
    assert.equal(I64_MIN, -9223372036854775808n);
    assert.equal(I64_MAX, 9223372036854775807n);
  });
});

describe("i64-arith: add/sub/mul trap on overflow, exact otherwise", () => {
  it("add: in-range is exact above 2^53 (no precision loss)", () => {
    assert.equal(i64AddChecked(9007199254740993n, 2n), 9007199254740995n); // 2^53+1 + 2 — a JS number would lose this
  });
  it("add: I64_MAX + 1 overflows; I64_MAX + 0 is exact", () => {
    assert.equal(i64AddChecked(I64_MAX, 1n), "IntegerOverflow");
    assert.equal(i64AddChecked(I64_MAX, 0n), I64_MAX);
  });
  it("sub: I64_MIN - 1 overflows", () => {
    assert.equal(i64SubChecked(I64_MIN, 1n), "IntegerOverflow");
    assert.equal(i64SubChecked(I64_MIN, 0n), I64_MIN);
  });
  it("mul: 2^62 * 2 overflows; large in-range exact", () => {
    assert.equal(i64MulChecked(4611686018427387904n, 2n), "IntegerOverflow"); // 2^62 * 2 = 2^63 > MAX
    assert.equal(i64MulChecked(3037000499n, 3037000499n), 9223372030926249001n); // < MAX, exact
  });
});

describe("i64-arith: division / modulo", () => {
  it("div by zero traps; INT64_MIN / -1 traps (the one signed-div overflow)", () => {
    assert.equal(i64DivChecked(5n, 0n), "DivisionByZero");
    assert.equal(i64DivChecked(I64_MIN, -1n), "IntegerOverflow");
  });
  it("div truncates toward zero (matches i64.div_s)", () => {
    assert.equal(i64DivChecked(-7n, 2n), -3n);
    assert.equal(i64DivChecked(7n, -2n), -3n);
    assert.equal(i64DivChecked(7n, 2n), 3n);
  });
  it("mod by zero traps; remainder takes the sign of the dividend; INT64_MIN % -1 = 0 (no trap)", () => {
    assert.equal(i64ModChecked(5n, 0n), "DivisionByZero");
    assert.equal(i64ModChecked(-7n, 2n), -1n);
    assert.equal(i64ModChecked(7n, -2n), 1n);
    assert.equal(i64ModChecked(I64_MIN, -1n), 0n);
  });
});

describe("i64-arith: negation + trap predicate", () => {
  it("neg of INT64_MIN traps; ordinary neg is exact", () => {
    assert.equal(i64NegChecked(I64_MIN), "IntegerOverflow");
    assert.equal(i64NegChecked(5n), -5n);
    assert.equal(i64NegChecked(I64_MAX), -9223372036854775807n);
  });
  it("isI64Trap discriminates result from trap", () => {
    assert.equal(isI64Trap(i64AddChecked(1n, 2n)), false);
    assert.equal(isI64Trap(i64DivChecked(1n, 0n)), true);
  });
});
