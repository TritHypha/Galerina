// tri-lint-verdict-ordering.test.mjs — conformance pair for tri-lint rule 0397-C / FUNGI-GOV-3VL-004:
// "no ordered comparison on a Verdict; authorize with == only". Fires-on-bad + silent-on-good — a lint
// that can't fire is vacuous, and one that fires on the safe form is a false-reject.
//
// The hazard (RD-0397-C): `v >= 1` / `v > 0` on a Verdict is a FAIL-OPEN the instant an out-of-domain
// value appears — the SIMD `7`-byte find, generalised to the whole language. The {−1,0,+1} order is for
// the K3 algebra (min/max folds), never for a user authorization decision (which is `== Verdict.Allow`).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkTypes } from "../../dist/index.js";

const diagsOf = (src) => {
  const prog = parseProgram(src, "tri-lint.fungi");
  const r = checkTypes(prog.ast, prog.flows);
  return (r.diagnostics ?? []).concat(prog.diagnostics ?? []);
};
const has = (src, code) => diagsOf(src).some((d) => d.code === code);

describe("tri-lint FUNGI-GOV-3VL-004 — ordered comparison on Verdict", () => {
  // FIRES: each ordered operator on a Verdict operand.
  for (const [op, expr] of [[">=", "v >= Verdict.Allow"], [">", "v > Verdict.Deny"], ["<=", "v <= Verdict.Allow"], ["<", "v < Verdict.Allow"]]) {
    it(`fires on '${op}' over a Verdict`, () => {
      const src = `@version 1
pure flow decide(v: Verdict) -> Bool
contract { intent { "hazardous ordered authorization" } }
{ return ${expr} }
`;
      assert.ok(has(src, "FUNGI-GOV-3VL-004"), `expected FUNGI-GOV-3VL-004 for ${expr}, got: ${diagsOf(src).map((d) => d.code).join(", ")}`);
    });
  }

  // SILENT: the sanctioned authorization form (== Verdict.Allow) must NOT trip the rule.
  it("silent on the sanctioned '== Verdict.Allow' authorization", () => {
    const src = `@version 1
pure flow decide(v: Verdict) -> Bool
contract { intent { "sanctioned exact-match authorization" } }
{ return v == Verdict.Allow }
`;
    assert.ok(!has(src, "FUNGI-GOV-3VL-004"), `unexpected FUNGI-GOV-3VL-004 on the == form: ${diagsOf(src).map((d) => d.code).join(", ")}`);
  });

  // SILENT: ordered comparison on plain numerics is unaffected (no false-reject of normal code).
  it("silent on ordered comparison over numerics (Int)", () => {
    const src = `@version 1
pure flow bigger(a: Int, b: Int) -> Bool
contract { intent { "ordinary numeric comparison stays legal" } }
{ return a >= b }
`;
    assert.ok(!has(src, "FUNGI-GOV-3VL-004"), `unexpected FUNGI-GOV-3VL-004 on Int comparison: ${diagsOf(src).map((d) => d.code).join(", ")}`);
  });
});
