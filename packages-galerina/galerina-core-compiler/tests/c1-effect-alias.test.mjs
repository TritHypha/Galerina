// C1 (threat-model) regression: a `let` alias of an effectful module must NOT smuggle the effect past
// the effect checker. `let x = AuditLog; x.write(...)` performs audit.write just as `AuditLog.write`
// does; before the fix the receiver-NAME matching saw only "x" and missed it entirely (a complete
// bypass of the effect gate + tier floor that key off the same name).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, inferDirectEffectsForFlow, buildModuleAliasMap, checkStdlibEffects } from "../dist/index.js";

function flowNode(src) {
  const p = parseProgram(src, "c1.spore");
  return (p.ast.children ?? []).find((c) => c.kind && /Flow/.test(c.kind));
}
function stdlibCodes(src) {
  const p = parseProgram(src, "c1.spore");
  const fn = (p.ast.children ?? []).find((c) => c.kind && /Flow/.test(c.kind));
  return checkStdlibEffects(p.flows[0], fn, "production").map((d) => d.code);
}
const wrap = (body) => `guarded flow f(msg: String) -> Result<Bool, ApiError>
contract { intent { "c1" } effects { } }
{
${body}
  return Ok(true)
}`;

test("C1: a direct effectful call is detected (control)", () => {
  const effects = inferDirectEffectsForFlow(flowNode(wrap("  AuditLog.write(msg)")));
  assert.ok(effects.includes("audit.write"), "direct AuditLog.write must infer audit.write");
});

test("C1: a `let` alias of an effectful module is detected (was the bypass)", () => {
  const effects = inferDirectEffectsForFlow(flowNode(wrap("  let x = AuditLog\n  x.write(msg)")));
  assert.ok(effects.includes("audit.write"), "aliased x.write must STILL infer audit.write");
});

test("C1: a transitive alias chain (let y = x; let x = AuditLog) is detected", () => {
  const effects = inferDirectEffectsForFlow(flowNode(wrap("  let x = AuditLog\n  let y = x\n  y.write(msg)")));
  assert.ok(effects.includes("audit.write"), "chained alias y.write must infer audit.write");
});

test("C1: alias map resolves names to their module (incl. transitive) and ignores literal bindings", () => {
  const m = buildModuleAliasMap(flowNode(wrap("  let x = AuditLog\n  let y = x\n  let z = 42\n  x.write(msg)")));
  assert.equal(m.get("x"), "AuditLog");
  assert.equal(m.get("y"), "AuditLog", "transitive: y → x → AuditLog");
  assert.equal(m.get("z"), undefined, "a non-identifier RHS (literal) is NOT an alias");
});

test("C1: resolving a non-module alias is harmless (no spurious effect)", () => {
  // `let r = someRecord; r.field` resolves to "someRecord.field" which matches no effect pattern.
  const effects = inferDirectEffectsForFlow(flowNode(wrap("  let r = msg\n  let v = r")));
  assert.equal(effects.length, 0, "aliasing a non-effectful value adds no effect");
});

// ── stdlib-deny (#153 / H2): an UNREGISTERED method on an aliased effectful module ──
test("C1/H2 stdlib-deny: direct unregistered effectful method requires the broad effect (control)", () => {
  assert.ok(stdlibCodes(wrap("  Database.someNewMethod(msg)")).includes("SPORE-STDLIB-002"));
});
test("C1/H2 stdlib-deny: an ALIASED unregistered effectful method still requires it (was the bypass)", () => {
  assert.ok(stdlibCodes(wrap("  let x = Database\n  x.someNewMethod(msg)")).includes("SPORE-STDLIB-002"),
    "aliasing must not escape the #153 deny-by-default broad-effect rule");
});
test("C1/H2 stdlib-deny: a transitive alias chain is covered too", () => {
  assert.ok(stdlibCodes(wrap("  let x = Database\n  let y = x\n  y.someNewMethod(msg)")).includes("SPORE-STDLIB-002"));
});
