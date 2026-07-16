// tri-lint-verdict-match.test.mjs — conformance pair for tri-lint rule 0397-B / FUNGI-GOV-3VL-003:
// "no wildcard over DENY on a Verdict match". On a Verdict subject all three K3 members must be
// NAMED arms; the (mandatory, FUNGI-TYPE-023) wildcard is the dead backstop only. Fires-on-bad in
// BOTH directions (Deny/Unknown absorbed = deny-by-omission; Allow absorbed = out-of-domain
// admission), silent-on-good — including the RD-0399/0400 §1 ask: the LOWERED shape of a `.gate`
// `?` guard (three distinct arms, K3 no-collapse) passes -003 AND -004 with zero special-casing.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkTypes } from "../../dist/index.js";

const diagsOf = (src) => {
  const prog = parseProgram(src, "tri-lint-match.fungi");
  const r = checkTypes(prog.ast, prog.flows);
  return (r.diagnostics ?? []).concat(prog.diagnostics ?? []);
};
const codes = (src) => diagsOf(src).map((d) => d.code);
const has = (src, code) => codes(src).some((c) => c === code);
const flow = (body) => `@version 1
pure flow decide(v: Verdict) -> Bool
contract { intent { "tri-lint -003 conformance" } }
{
${body}
  return false
}
`;

describe("tri-lint FUNGI-GOV-3VL-003 — wildcard over DENY on a Verdict match", () => {
  it("FIRES when Deny and Unknown are absorbed by the wildcard", () => {
    const src = flow(`  match v {
    Allow => return true
    _ => return false
  }`);
    assert.ok(has(src, "FUNGI-GOV-3VL-003"), `expected -003, got: ${codes(src).join(", ")}`);
  });

  it("FIRES when Allow is left to the wildcard (out-of-domain admission)", () => {
    const src = flow(`  match v {
    Deny => return false
    Unknown => return false
    _ => return true
  }`);
    assert.ok(has(src, "FUNGI-GOV-3VL-003"), `expected -003 (not-denied != allowed), got: ${codes(src).join(", ")}`);
  });

  it("SILENT when all three members are named and '_' is the dead backstop", () => {
    const src = flow(`  match v {
    Allow => return true
    Deny => return false
    Unknown => return false
    _ => return false
  }`);
    assert.ok(!has(src, "FUNGI-GOV-3VL-003"), `unexpected -003 on the named-all-three form: ${codes(src).join(", ")}`);
  });

  it("SILENT on a multi-variant arm naming Deny | Unknown together", () => {
    const src = flow(`  match v {
    Allow => return true
    Deny | Unknown => return false
    _ => return false
  }`);
    assert.ok(!has(src, "FUNGI-GOV-3VL-003"), `unexpected -003 on the multi-variant form: ${codes(src).join(", ")}`);
  });

  // RD-0399/RD-0400 §1: a `.gate` `?` tri-state guard lowers to three DISTINCT arms
  // (True / False / default-drain — K3 no-collapse, spec §1.4). On a Verdict subject that is
  // exactly Allow / Deny / Unknown named + backstop — so a gate-lowered match satisfies
  // -003 BY CONSTRUCTION and must also stay clean of -004 (no ordered comparison appears).
  it("SILENT on the .gate-lowered `? authorised` shape (by construction, zero special-casing)", () => {
    const src = flow(`  match v {
    Allow => return true
    Deny => return false
    Unknown => return false
    _ => return false
  }`);
    const cs = codes(src);
    assert.ok(!cs.includes("FUNGI-GOV-3VL-003"), `gate-lowered shape tripped -003: ${cs.join(", ")}`);
    assert.ok(!cs.includes("FUNGI-GOV-3VL-004"), `gate-lowered shape tripped -004: ${cs.join(", ")}`);
  });

  it("SILENT on a non-Verdict match (domain isolation — Int subject unaffected)", () => {
    const src = `@version 1
pure flow bucket(n: Int) -> Bool
contract { intent { "domain isolation" } }
{
  match n {
    0 => return false
    1 => return true
    _ => return false
  }
  return false
}
`;
    assert.ok(!has(src, "FUNGI-GOV-3VL-003"), `unexpected -003 on an Int match: ${codes(src).join(", ")}`);
  });

  it("composes with FUNGI-TYPE-023: all three named but NO wildcard → 023 fires, -003 silent", () => {
    const src = flow(`  match v {
    Allow => return true
    Deny => return false
    Unknown => return false
  }`);
    const cs = codes(src);
    assert.ok(cs.includes("FUNGI-TYPE-023"), `mandatory-wildcard rule must still fire: ${cs.join(", ")}`);
    assert.ok(!cs.includes("FUNGI-GOV-3VL-003"), `-003 must not double-report a wildcard problem: ${cs.join(", ")}`);
  });
});
