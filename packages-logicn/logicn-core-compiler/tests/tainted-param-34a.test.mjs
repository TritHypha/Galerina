/**
 * 0031 / Phase-34A — the `tainted` PARAMETER qualifier closes the param-trusted-by-default fail-OPEN.
 *
 * R&D verdict 0031 isolated the one genuine gap: a bare flow param (e.g. a real HTTP payload) is
 * trusted-by-default, so `flow verifyPassword(data: RequestPayload)` using `data.password` at a
 * governed sink gets ZERO taint diagnostics (Phase-34 Finding 6). 34A adds an opt-in `tainted`
 * qualifier that marks the param `unsafe`, reusing the shipped LLN-VALUESTATE-003/004/005 sink
 * guards (no new diagnostic codes). Bare params are unchanged (non-breaking); the breaking
 * route-handler auto-taint (34B) is a separate, strict-profile-gated follow-up.
 *
 * Drives the SAME live `checkValueStates` pass the CLI/runtime use (not the dead audit-only checkTaint).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";

function vsCodes(src) {
  const pr = parseProgram(src, "t.lln");
  const parseErrs = pr.diagnostics.filter((d) => d.severity === "error");
  assert.equal(parseErrs.length, 0, "unexpected parse errors: " + parseErrs.map((d) => `${d.code} ${d.message}`).join("; "));
  const res = checkValueStates(pr.ast);
  return [...new Set((res.diagnostics ?? []).map((d) => d.code))].sort();
}

const isRefusal = (codes) => codes.some((c) => /LLN-VALUESTATE-00[345]/.test(c));

describe("34A: `tainted` param qualifier closes the param-trusted-by-default fail-OPEN (0031)", () => {
  const BARE = `flow verifyPassword(data: RequestPayload) -> Bool {\n  let pw = data.password\n  database.write(pw)\n}`;
  const TAINTED = `flow verifyPassword(tainted data: RequestPayload) -> Bool {\n  let pw = data.password\n  database.write(pw)\n}`;

  it("a `tainted` param reaching a governed sink is REFUSED at build time (LLN-VALUESTATE-003/004/005)", () => {
    const codes = vsCodes(TAINTED);
    assert.ok(isRefusal(codes), `expected a value-state refusal for the tainted param, got [${codes}]`);
  });

  it("the SAME flow with a BARE param stays trusted (0 diagnostics) — opt-in, non-breaking", () => {
    assert.deepEqual(vsCodes(BARE), [], "a bare param must remain trusted-by-default (unchanged behaviour)");
  });

  it("a `tainted` param discharged through a validate.* gate is ACCEPTED (0 diagnostics)", () => {
    const gated = `flow verifyPassword(tainted data: RequestPayload) -> Bool {\n  safe mut v = validate.data(data)?\n  database.write(v)\n}`;
    assert.deepEqual(vsCodes(gated), [], "validating a tainted param must discharge the taint (gate works, not luck)");
  });

  it("`tainted` composes with `readonly` (in any order) and still taints", () => {
    const codes = vsCodes(`flow h(readonly tainted req: String) -> Bool {\n  database.write(req)\n}`);
    assert.ok(isRefusal(codes), `readonly+tainted must still taint the param, got [${codes}]`);
  });

  it("a tainted arg crossing into another flow is refused (LLN-VALUESTATE-004 — inter-flow handoff)", () => {
    const codes = vsCodes(`flow sink(x: String) -> Bool {\n  database.write(x)\n}\nflow ingest(tainted req: String) -> Bool {\n  sink(req)\n}`);
    assert.ok(codes.includes("LLN-VALUESTATE-004") || isRefusal(codes), `tainted param crossing a flow boundary must be refused, got [${codes}]`);
  });
});
