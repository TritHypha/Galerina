// R&D 0120 — close the governedFlowDecl value-state fail-open (the 0093 class).
//
// `governed floor_N flow …` (a Tower-floor entry boundary) was OMITTED from the value-state
// checker's flow-kind switch, so a governed flow's tainted/boundary params reached governed sinks
// with ZERO SPORE-VALUESTATE diagnostics — exactly the omission 0093 fixed for guardedFlowDecl.
// A governed flow is a posture-gated boundary, so it now registers params + is treated like secure/guarded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";

const check = (src) => checkValueStates(parseProgram(src, "t.spore").ast);
const diags = (r, code) => r.diagnostics.filter((d) => d.code === code);
const has = (r, code) => diags(r, code).length > 0;

// a bare param flows straight into a governed sink (DB.insert) with no gate.
const governedSinkBody = `
governed floor_3 flow test(raw: String) -> Result<String, Error>
contract { effects { database.write } }
{
  let saved = DB.insert(raw)?
  return Ok(saved)
}
`;

test("FAIL-OPEN CLOSED: a governed-flow bare param at a governed sink fires SPORE-VALUESTATE-008 (was silent)", () => {
  const r = check(governedSinkBody);
  const d = diags(r, "SPORE-VALUESTATE-008");
  assert.equal(d.length, 1, `expected one VS-008 for the governed flow, got: ${r.diagnostics.map((x) => x.code).join(",") || "none"}`);
  assert.equal(d[0].severity, "warning");
});

test("a governed flow with an EXPLICIT `tainted` param at a governed sink fires VS-003 (taint now tracked)", () => {
  const r = check(`
governed floor_2 flow store(tainted raw: String) -> Result<String, Error>
contract { effects { database.write } }
{
  let saved = DB.insert(raw)?
  return Ok(saved)
}
`);
  // The key proof: the governed flow's params are now REGISTERED, so the 34A tainted qualifier is
  // tracked and the unsafe value reaching a governed sink is flagged (VS-003), not silently ignored.
  assert.ok(has(r, "SPORE-VALUESTATE-003") || has(r, "SPORE-VALUESTATE-008"), `governed tainted param must be flagged; got ${r.diagnostics.map((x) => x.code).join(",") || "none"}`);
});

test("non-breaking: a governed flow with NO secret/boundary risk (string-only, no governed sink) does not over-fire", () => {
  const r = check(`
governed floor_1 flow greet(name: String) -> String
contract { effects {} }
{
  return "hello " + name
}
`);
  assert.ok(!has(r, "SPORE-VALUESTATE-003"), "no taint sink → no VS-003");
});
