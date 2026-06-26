/**
 * GLOBAL fail-closed invariant suite (2026-06-19) — the standard guard against trap-discard fail-OPENs.
 *
 * Invariant: a checked-operation trap (i32 overflow, division-by-zero, …) MUST fail the flow closed
 * (a runtimeError result) REGARDLESS of where its result lands — on the return path, assigned to a
 * never-returned binding, or discarded inside a loop. A trap is a FAILURE, not a discardable value.
 *
 * Why this exists: the i32-overflow fail-open (R&D 0038) — `junk = 2e9 * 2e9` where `junk` is never
 * returned silently COMPLETED (the overflow's runtimeError was dropped). FIXED 2026-06-19: a CHECKED-OP
 * trap (IntegerOverflow / DivisionByZero) now propagates out of a binding/expression statement
 * (`isCheckedTrap` in interpreter.ts) so it fails the flow closed regardless of result placement. Soft
 * runtimeErrors (e.g. a missing field) keep value semantics so graceful handling still works. All cases
 * below now PASS and are permanent guards against this CLASS (any checked op × any result placement).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, executeFlow } from "../dist/index.js";

async function runFlow(body, opts = {}) {
  const src = `pure flow main() -> Int\ncontract { effects {} }\n{ ${body} }`;
  const p = parseProgram(src, "fc.spore");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "unexpected parse error: " + errs.map((e) => e.message).join("; "));
  const r = await executeFlow("main", new Map(), p.ast, p.flows, undefined, undefined, opts, undefined, undefined);
  return r.value ?? r;
}
const trapsClosed = (v) => v.__tag === "runtimeError";

// ── A trap on the RETURN path must fail closed (passes today — guards that direction) ───────────────
test("fail-closed: i32 overflow on the return path traps", async () => {
  assert.ok(trapsClosed(await runFlow("mut x: Int = 2000000000  x = x * 2000000000  return x")), "overflow on return must fail closed");
});
test("fail-closed: division-by-zero on the return path traps", async () => {
  assert.ok(trapsClosed(await runFlow("mut z: Int = 0  return 10 / z")), "div-by-zero on return must fail closed");
});

// ── A trap whose result is DISCARDED must STILL fail closed (the fail-OPEN class — R&D 0038) ─────────
// `todo`: expected-fail until 0038 lands. Removing the `todo` option turns these into permanent guards.
test("fail-closed: i32 overflow assigned to a NON-returned binding must still trap",async () => {
  const v = await runFlow("mut junk: Int = 0  junk = 2000000000 * 2000000000  return 5");
  assert.ok(trapsClosed(v), `overflow into a dead binding must fail closed (got ${v.__tag}:${v.value})`);
});
test("fail-closed: i32 overflow DISCARDED inside a loop must still trap (arithmetic-threshold shape)",async () => {
  const v = await runFlow("mut junk: Int = 0  mut i: Int = 0  while i < 5 { junk = 2000000000 * 2000000000  i = i + 1 } return i");
  assert.ok(trapsClosed(v), `overflow discarded in a loop must fail closed (got ${v.__tag}:${v.value})`);
});
test("fail-closed: division-by-zero assigned to a NON-returned binding must still trap",async () => {
  const v = await runFlow("mut junk: Int = 0  mut z: Int = 0  junk = 10 / z  return 5");
  assert.ok(trapsClosed(v), `div-by-zero into a dead binding must fail closed (got ${v.__tag}:${v.value})`);
});

// A checked trap NESTED inside a larger expression must propagate through the operator (the compute-mix
// shape: `(seed*K)+C`), not be masked into a soft "Operator '+' not supported for runtimeError".
test("fail-closed: a checked trap NESTED in an expression propagates (compute-mix shape) — fails fast + clean", async () => {
  const v = await runFlow("mut junk: Int = 0  junk = (2000000000 * 2000000000) + 1  return 5");
  assert.ok(trapsClosed(v), `nested overflow must fail closed (got ${v.__tag}:${v.value})`);
  assert.equal(v.message, "IntegerOverflow", "the original checked-trap message must survive the surrounding op, not be masked");
});
