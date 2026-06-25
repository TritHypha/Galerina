// C1 (threat-model) completion — the value-state TAINT sink (LLN-VALUESTATE-008) must also resolve
// `let x = AuditLog; x.write(msg)` so an aliased governed sink can't smuggle an untrusted input past
// the taint gate. Before the fix the sink matched on the literal receiver name ("x"), so the aliased
// call was not recognised as a governed sink and the taint warning never fired (companion to the
// effect/tier fix in c1-effect-alias.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";

const wrap = (body) => `guarded flow f(msg: String) -> Result<Bool, ApiError>
contract { intent { "c1 sink" } effects { audit.write } }
{
${body}
  return Ok(true)
}`;
const diags = (src) => checkValueStates(parseProgram(src, "c1s.lln").ast).diagnostics ?? [];
const has = (ds, code) => ds.some((d) => d.code === code);

test("C1 taint sink: direct AuditLog.write flags the untrusted input (control)", () => {
  assert.ok(has(diags(wrap("  AuditLog.write(msg)")), "LLN-VALUESTATE-008"));
});

test("C1 taint sink: aliased `x.write` STILL flags the untrusted input (was the bypass)", () => {
  assert.ok(has(diags(wrap("  let x = AuditLog\n  x.write(msg)")), "LLN-VALUESTATE-008"),
    "an aliased governed sink must still be recognised");
});

test("C1 taint sink: transitive alias chain `let y = x; let x = AuditLog; y.write` flags it", () => {
  assert.ok(has(diags(wrap("  let x = AuditLog\n  let y = x\n  y.write(msg)")), "LLN-VALUESTATE-008"));
});
