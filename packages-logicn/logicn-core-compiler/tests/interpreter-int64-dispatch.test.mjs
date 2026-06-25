// =============================================================================
// Interpreter Int64 dispatch — numeric big-rock increment 2a.
//
// The tree-walker now carries an `int64` (bigint) value tag and routes int64 arithmetic through the
// checked i64-arith layer (exact above 2^53, traps on overflow/div-0). These keys are ADDITIVE — they
// are unreachable while scalar Int64 is rejected by LLN-NUMERIC-001, so zero regression today; they
// become live when Int64 is lifted from the gate. Tested directly via the exported BINARY_DISPATCH +
// dispatchKey (mirrors dispatch-completeness.test.mjs) so we prove the arithmetic without the gate.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BINARY_DISPATCH, dispatchKey } from "../dist/interpreter.js";
import { I64_MAX, I64_MIN } from "../dist/i64-arith.js";

const i64 = (v) => ({ __tag: "int64", value: v });
const int = (v) => ({ __tag: "int", value: v });
const run = (a, op, b) => {
  const fn = BINARY_DISPATCH.get(dispatchKey(a.__tag, op, b.__tag));
  assert.ok(fn !== undefined, `no dispatch entry for ${a.__tag} ${op} ${b.__tag}`);
  return fn(a, b);
};

describe("interpreter int64 dispatch: exact arithmetic above 2^53", () => {
  it("int64 + int64 is exact past the JS-number precision wall", () => {
    assert.deepEqual(run(i64(9007199254740993n), "+", i64(2n)), { __tag: "int64", value: 9007199254740995n });
  });
  it("int64 * int64 stays exact (a JS number would round)", () => {
    assert.deepEqual(run(i64(3037000499n), "*", i64(3037000499n)), { __tag: "int64", value: 9223372030926249001n });
  });
});

describe("interpreter int64 dispatch: traps fail closed (Fork A = TRAP)", () => {
  it("overflow → runtimeError, not a silent wrap", () => {
    assert.equal(run(i64(I64_MAX), "+", i64(1n)).__tag, "runtimeError");
    assert.equal(run(i64(I64_MIN), "-", i64(1n)).__tag, "runtimeError");
  });
  it("divide / modulo by zero → runtimeError", () => {
    assert.equal(run(i64(5n), "/", i64(0n)).__tag, "runtimeError");
    assert.equal(run(i64(5n), "%", i64(0n)).__tag, "runtimeError");
  });
  it("INT64_MIN / -1 → runtimeError (the one signed-div overflow)", () => {
    assert.equal(run(i64(I64_MIN), "/", i64(-1n)).__tag, "runtimeError");
  });
});

describe("interpreter int64 dispatch: comparisons + mixed Int/Int64 promotion", () => {
  it("int64 comparisons yield bools", () => {
    assert.deepEqual(run(i64(5n), "<", i64(10n)), { __tag: "bool", value: true });
    assert.deepEqual(run(i64(10n), "==", i64(10n)), { __tag: "bool", value: true });
    assert.deepEqual(run(i64(10n), "!=", i64(11n)), { __tag: "bool", value: true });
  });
  it("mixed Int + Int64 promotes the i32 operand → Int64 result (both directions)", () => {
    assert.deepEqual(run(int(5), "+", i64(10n)), { __tag: "int64", value: 15n });
    assert.deepEqual(run(i64(10n), "+", int(5)), { __tag: "int64", value: 15n });
    assert.deepEqual(run(i64(9007199254740993n), "+", int(2)), { __tag: "int64", value: 9007199254740995n });
  });
  it("mixed Int + Int64 comparison promotes correctly", () => {
    assert.deepEqual(run(int(5), "<", i64(10n)), { __tag: "bool", value: true });
    assert.deepEqual(run(i64(10n), ">", int(5)), { __tag: "bool", value: true });
  });
});
