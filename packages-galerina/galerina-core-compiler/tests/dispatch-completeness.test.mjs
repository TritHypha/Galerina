// R&D-0112 completeness lemma — proves the sync raw-arith FALLBACK is unreachable for int×int.
//
// The sync evaluator (interpreter.ts:494-510) does:
//     const fn = BINARY_DISPATCH.get(dispatchKey(left.__tag, op, right.__tag));
//     if (fn !== undefined) return fn(left, right);   // <-- short-circuits here
//     // ...raw-arith fallback (the hazard) only runs if fn === undefined...
//
// So the fallback's both-int branch is DEAD iff every (int, arithOp, int) key is present in
// BINARY_DISPATCH. This test mechanically proves that — and is a CI gate: if a future edit ever
// drops an int×int arithmetic entry, THIS test goes red (pointing at the exact op) before the
// latent fail-open can ship. This is the formal version of "the agent proved it's dead today".
import { test } from "node:test";
import assert from "node:assert/strict";
import { BINARY_DISPATCH, dispatchKey } from "../dist/interpreter.js";

const ARITH_OPS = ["+", "-", "*", "/", "%"];
const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

test("LEMMA: every int×int arithmetic op is in BINARY_DISPATCH → the both-int fallback is unreachable", () => {
  for (const op of ARITH_OPS) {
    const key = dispatchKey("int", op, "int");
    assert.equal(
      BINARY_DISPATCH.has(key),
      true,
      `int ${op} int is MISSING from BINARY_DISPATCH — the raw-arith fallback (interpreter.ts:498) would now be REACHABLE for this op and could silently wrap / skip the /0 trap (R&D-0112 fail-open).`
    );
  }
});

test("the int×int handlers are the CHECKED (trapping) algebra, not raw arithmetic", () => {
  // A trap is returned (not thrown) as { __tag: "runtimeError", message } and surfaced higher up.
  // If int×int were served by the raw fallback instead, Math.imul/`+`/`/` would silently return a
  // WRAPPED { __tag: "int", value } — never a trap. So a trap tag here proves the checked path runs.
  const mul = BINARY_DISPATCH.get(dispatchKey("int", "*", "int"));
  const add = BINARY_DISPATCH.get(dispatchKey("int", "+", "int"));
  const div = BINARY_DISPATCH.get(dispatchKey("int", "/", "int"));
  const i = (value) => ({ __tag: "int", value });
  const isTrap = (r) => r.__tag === "runtimeError";
  // INT32_MAX * INT32_MAX overflows i32 → trap (raw Math.imul would return {int, 1}).
  assert.equal(isTrap(mul(i(INT32_MAX), i(INT32_MAX))), true);
  // INT32_MAX + 1 overflows → trap (raw + would return {int, 2147483648}).
  assert.equal(isTrap(add(i(INT32_MAX), i(1))), true);
  // div-by-zero → trap (raw / would return {int, Infinity|NaN}).
  assert.equal(isTrap(div(i(1), i(0))), true);
  // INT32_MIN / -1 overflows i32 → trap.
  assert.equal(isTrap(div(i(INT32_MIN), i(-1))), true);
  // ...and a normal int×int returns a plain int (sanity: the handler is real, not always-trap).
  assert.deepEqual(mul(i(6), i(7)), { __tag: "int", value: 42 });
});

test("the ONLY arithmetic combo absent from the map is float-involving `%` — the genuinely-live native path", () => {
  // Over {int,float} × {+,-,*,/,%}, enumerate which (type,op,type) keys are absent. The both-int
  // fallback only matters if a both-int key is absent (proven present above). The honest live
  // fallback path is float-involving `%` (no float `%` handler exists), where bothInt === false,
  // so the hardened branch correctly runs native `lv % rv`. This pins that exactly.
  const TYPES = ["int", "float"];
  const absent = [];
  for (const lt of TYPES) {
    for (const op of ARITH_OPS) {
      for (const rt of TYPES) {
        if (!BINARY_DISPATCH.has(dispatchKey(lt, op, rt))) absent.push(`${lt} ${op} ${rt}`);
      }
    }
  }
  // Expect EXACTLY the three `%` combos that involve a float (int%float, float%int, float%float).
  assert.deepEqual(absent.sort(), ["float % float", "float % int", "int % float"].sort());
  // ...and crucially, NO both-int combo is in the absent set.
  assert.equal(absent.some((c) => c === "int + int" || c === "int - int" || c === "int * int" || c === "int / int" || c === "int % int"), false);
});
