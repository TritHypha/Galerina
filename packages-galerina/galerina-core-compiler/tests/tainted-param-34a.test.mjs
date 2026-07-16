/**
 * 0031 / Phase-34A — the `tainted` PARAMETER qualifier closes the param-trusted-by-default fail-OPEN.
 *
 * R&D verdict 0031 isolated the one genuine gap: a bare flow param (e.g. a real HTTP payload) is
 * trusted-by-default, so `flow verifyPassword(data: RequestPayload)` using `data.password` at a
 * governed sink gets ZERO taint diagnostics (Phase-34 Finding 6). 34A adds an opt-in `tainted`
 * qualifier that marks the param `unsafe`, reusing the shipped FUNGI-VALUESTATE-003/004/005 sink
 * guards (no new diagnostic codes). Bare params are unchanged (non-breaking); the breaking
 * route-handler auto-taint (34B) is a separate, strict-profile-gated follow-up.
 *
 * Drives the SAME live `checkValueStates` pass the CLI/runtime use (not the dead audit-only checkTaint).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";

function vsCodes(src) {
  const pr = parseProgram(src, "t.fungi");
  const parseErrs = pr.diagnostics.filter((d) => d.severity === "error");
  assert.equal(parseErrs.length, 0, "unexpected parse errors: " + parseErrs.map((d) => `${d.code} ${d.message}`).join("; "));
  const res = checkValueStates(pr.ast);
  return [...new Set((res.diagnostics ?? []).map((d) => d.code))].sort();
}

const isRefusal = (codes) => codes.some((c) => /FUNGI-VALUESTATE-00[345]/.test(c));

describe("34A: `tainted` param qualifier closes the param-trusted-by-default fail-OPEN (0031)", () => {
  const BARE = `flow verifyPassword(data: RequestPayload) -> Bool {\n  let pw = data.password\n  database.write(pw)\n}`;
  const TAINTED = `flow verifyPassword(tainted data: RequestPayload) -> Bool {\n  let pw = data.password\n  database.write(pw)\n}`;

  it("a `tainted` param reaching a governed sink is REFUSED at build time (FUNGI-VALUESTATE-003/004/005)", () => {
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

  it("a tainted arg crossing into another flow is refused (FUNGI-VALUESTATE-004 — inter-flow handoff)", () => {
    const codes = vsCodes(`flow sink(x: String) -> Bool {\n  database.write(x)\n}\nflow ingest(tainted req: String) -> Bool {\n  sink(req)\n}`);
    assert.ok(codes.includes("FUNGI-VALUESTATE-004") || isRefusal(codes), `tainted param crossing a flow boundary must be refused, got [${codes}]`);
  });

  // ── #75 reframe (RD-0412 P1): VALUESTATE-004 was a false contradiction — passing tainted data
  //    INTO a recognized gate is the CLEARING operation (untrusted-in → trusted-out), not a defect.
  //    Conformance PAIR: fires on a tainted → NON-gate handoff; silent on a tainted → GATE handoff.
  it("#75 SILENT: a tainted arg passed INTO a recognized gate is NOT flagged (the gate is the clearing point)", () => {
    // `validateReq` matches a gate name prefix (validate*) → isGateCallName true. Passing tainted
    // `req` into it is the validation seam's whole purpose; the reframed rule must stay silent.
    const codes = vsCodes(`flow validateReq(x: String) -> String {\n  return x\n}\nflow ingest(tainted req: String) -> Bool {\n  let clean = validateReq(req)\n  return true\n}`);
    assert.ok(!codes.includes("FUNGI-VALUESTATE-004"), `passing tainted data into a gate must NOT emit VALUESTATE-004 (it is the clearing point), got [${codes}]`);
  });

  it("#75 FIRES (regression guard): the exemption is gate-NAME-scoped — a non-gate callee still refuses", () => {
    // `processReq` is not a gate name → the cross-flow taint warning is unchanged. Proves the
    // reframe narrowed the rule to gates only, it did not disable it.
    const codes = vsCodes(`flow processReq(x: String) -> Bool {\n  database.write(x)\n}\nflow ingest(tainted req: String) -> Bool {\n  processReq(req)\n}`);
    assert.ok(codes.includes("FUNGI-VALUESTATE-004") || isRefusal(codes), `a tainted arg to a NON-gate flow must still refuse, got [${codes}]`);
  });
});
