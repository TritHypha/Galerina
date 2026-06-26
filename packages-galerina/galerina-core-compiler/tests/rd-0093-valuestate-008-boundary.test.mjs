// R&D 0093 — the "34B hole" fix: SPORE-VALUESTATE-008 (BoundaryInputUnclean).
// A BARE param of a secure/guarded flow is an unmarked boundary input; reaching a governed
// sink without a gate now fires VS-008 (a stage-1 WARNING). It is INERT everywhere else
// (the new `boundary-untrusted` prefix behaves like `undefined` at the VS-001/004/005 sites),
// so plain/pure flows stay trusted-by-default (non-breaking) and string-concat is not flagged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";

const check = (src) => checkValueStates(parseProgram(src, "t.spore").ast);
const diags = (r, code) => r.diagnostics.filter((d) => d.code === code);
const has = (r, code) => diags(r, code).length > 0;

// bare param `raw` flows straight into a governed sink (DB.insert), no gate.
const sinkBody = (kind) => `
${kind} flow test(raw: String) -> Result<String, Error>
contract { effects { database.write } }
{
  let saved = DB.insert(raw)?
  return Ok(saved)
}
`;

test("VS-008: a bare param of a secure flow at a governed sink fires SPORE-VALUESTATE-008 as a WARNING", () => {
  const r = check(sinkBody("secure"));
  const d = diags(r, "SPORE-VALUESTATE-008");
  assert.equal(d.length, 1, `expected one VS-008, got: ${r.diagnostics.map((x) => x.code).join(",") || "none"}`);
  assert.equal(d[0].severity, "warning", "the 34B-hole stage-1 diagnostic must be a warning (escalates to error in production)");
});

test("VS-008: guarded-flow bare param has parity with secure (also fires VS-008)", () => {
  assert.ok(has(check(sinkBody("guarded")), "SPORE-VALUESTATE-008"), "guarded must match secure");
});

test("VS-008: plain `flow` and `pure flow` stay trusted-by-default — NO VS-008 (non-breaking)", () => {
  assert.ok(!has(check(sinkBody("flow")), "SPORE-VALUESTATE-008"), "plain flow stays trusted");
  assert.ok(!has(check(sinkBody("pure")), "SPORE-VALUESTATE-008"), "pure flow stays trusted");
});

test("VS-008: a secure-flow bare param NOT at a governed sink (string-concat) does NOT fire — no false positives", () => {
  const r = check(`
secure flow test(raw: String) -> String
contract { effects {} }
{
  let msg = "hello " + raw
  return msg
}
`);
  assert.ok(!has(r, "SPORE-VALUESTATE-008"), "string-concat is not a governed sink — boundary-untrusted is inert here (the VS-004 false-positive the scoped fix avoids)");
});

test("VS-008 stage-2: warning in dev/check, escalates to ERROR in production/deterministic (migration)", () => {
  const ast = parseProgram(sinkBody("secure"), "t.spore").ast;
  const dev = checkValueStates(ast).diagnostics.filter((d) => d.code === "SPORE-VALUESTATE-008");
  const prod = checkValueStates(ast, "production").diagnostics.filter((d) => d.code === "SPORE-VALUESTATE-008");
  assert.equal(dev[0]?.severity, "warning", "dev/check keeps the migration warning");
  assert.equal(prod[0]?.severity, "error", "production/deterministic escalates the 34B-hole to an error");
});
