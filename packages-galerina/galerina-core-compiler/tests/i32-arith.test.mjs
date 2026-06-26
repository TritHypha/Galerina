// Owner decision 2026-06-18 (Fork A = TRAP): strict-trapping i32 arithmetic — the single source of
// truth (i32-arith.ts) shared by the tree-walker, the bytecode VM, and the WASM emitter's checked
// helpers, so all execution tiers are byte-identical for the 0014 fidelity differential. Integer
// overflow and divide/modulo-by-zero TRAP (never silently wrap / never return 0).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  I32_MIN, I32_MAX,
  i32AddChecked, i32SubChecked, i32MulChecked, i32DivChecked, i32ModChecked, i32NegChecked, isI32Trap,
} from "../dist/i32-arith.js";

test("add: normal math + boundaries pass; overflow traps both directions", () => {
  assert.equal(i32AddChecked(5, 3), 8);
  assert.equal(i32AddChecked(I32_MAX, 0), I32_MAX);     // boundary OK
  assert.equal(i32AddChecked(I32_MIN, 0), I32_MIN);     // boundary OK
  assert.equal(i32AddChecked(I32_MAX, 1), "IntegerOverflow");
  assert.equal(i32AddChecked(I32_MIN, -1), "IntegerOverflow");
});

test("sub: normal passes; underflow traps", () => {
  assert.equal(i32SubChecked(3, 5), -2);
  assert.equal(i32SubChecked(I32_MIN, 1), "IntegerOverflow");
  assert.equal(i32SubChecked(I32_MAX, -1), "IntegerOverflow");
});

test("mul: exact BigInt check — small passes, the sqrt boundary is exact, overflow traps", () => {
  assert.equal(i32MulChecked(7, 6), 42);
  assert.equal(i32MulChecked(-7, 6), -42);
  assert.equal(i32MulChecked(46340, 46340), 2147395600); // < I32_MAX → OK
  assert.equal(i32MulChecked(46341, 46341), "IntegerOverflow"); // > I32_MAX → trap
  assert.equal(i32MulChecked(I32_MAX, 2), "IntegerOverflow");
  assert.equal(i32MulChecked(I32_MIN, -1), "IntegerOverflow"); // 2^31 overflows
});

test("div: truncates toward zero; div-by-zero AND the INT32_MIN/-1 overflow both trap", () => {
  assert.equal(i32DivChecked(7, 2), 3);
  assert.equal(i32DivChecked(-7, 2), -3);   // trunc toward zero
  assert.equal(i32DivChecked(10, 0), "DivisionByZero");
  assert.equal(i32DivChecked(I32_MIN, -1), "IntegerOverflow"); // the one signed-div overflow
  assert.equal(i32DivChecked(I32_MIN, 1), I32_MIN);            // not an overflow
  assert.equal(i32DivChecked(-1, 2), 0);                       // trunc gives JS -0 → canonicalized to 0 (= WASM i32)
  assert.ok(Object.is(i32DivChecked(-1, 2), 0));              // must be +0, not -0
});

test("mod: by-zero traps; otherwise never overflows", () => {
  assert.equal(i32ModChecked(7, 3), 1);
  assert.equal(i32ModChecked(-7, 3), -1);
  assert.equal(i32ModChecked(10, 0), "DivisionByZero");
  assert.equal(i32ModChecked(I32_MIN, -1), 0); // no overflow for mod
});

test("neg: -INT32_MIN traps (it would overflow i32)", () => {
  assert.equal(i32NegChecked(5), -5);
  assert.equal(i32NegChecked(I32_MAX), -I32_MAX);
  assert.equal(i32NegChecked(I32_MIN), "IntegerOverflow");
});

test("isI32Trap discriminates a trap-kind from a value", () => {
  assert.equal(isI32Trap("IntegerOverflow"), true);
  assert.equal(isI32Trap("DivisionByZero"), true);
  assert.equal(isI32Trap(0), false);
  assert.equal(isI32Trap(-1), false);
});
