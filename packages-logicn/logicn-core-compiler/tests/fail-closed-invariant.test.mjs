/**
 * GLOBAL fail-closed invariant suite (2026-06-19) — the standard guard against trap-discard fail-OPENs.
 *
 * Invariant: a checked-operation trap (i32 overflow, division-by-zero, …) MUST fail the flow closed
 * (a runtimeError result) REGARDLESS of where its result lands — on the return path, assigned to a
 * never-returned binding, or discarded inside a loop. A trap is a FAILURE, not a discardable value.
 *
 * Why this exists: the i32-overflow fail-open (R&D 0038) — `junk = 2e9 * 2e9` where `junk` is never
 * returned silently COMPLETES (the overflow's runtimeError is dropped). This suite catches that CLASS
 * (any checked op × any result placement), not just the one instance. The "discarded" cases are marked
 * `todo` (expected-fail until 0038 lands); when the fix lands, delete the `todo` option and they become
 * permanent regression guards. The return-path cases pass today and guard that direction now.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, executeFlow } from "../dist/index.js";

async function runFlow(body, opts = {}) {
  const src = `pure flow main() -> Int\ncontract { effects {} }\n{ ${body} }`;
  const p = parseProgram(src, "fc.lln");
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
test("fail-closed: i32 overflow assigned to a NON-returned binding must still trap", { todo: "fail-open — R&D bridge 0038" }, async () => {
  const v = await runFlow("mut junk: Int = 0  junk = 2000000000 * 2000000000  return 5");
  assert.ok(trapsClosed(v), `overflow into a dead binding must fail closed (got ${v.__tag}:${v.value})`);
});
test("fail-closed: i32 overflow DISCARDED inside a loop must still trap (arithmetic-threshold shape)", { todo: "fail-open — R&D bridge 0038" }, async () => {
  const v = await runFlow("mut junk: Int = 0  mut i: Int = 0  while i < 5 { junk = 2000000000 * 2000000000  i = i + 1 } return i");
  assert.ok(trapsClosed(v), `overflow discarded in a loop must fail closed (got ${v.__tag}:${v.value})`);
});
test("fail-closed: division-by-zero assigned to a NON-returned binding must still trap", { todo: "fail-open — R&D bridge 0038" }, async () => {
  const v = await runFlow("mut junk: Int = 0  mut z: Int = 0  junk = 10 / z  return 5");
  assert.ok(trapsClosed(v), `div-by-zero into a dead binding must fail closed (got ${v.__tag}:${v.value})`);
});
