// =============================================================================================
// RD-0234c BUG B (compile-time) — previously-inert limit kinds are now RECOGNISED by the runtime
// grammar, so the FUNGI-GOV-019 honesty gate stops falsely warning on them.
// ---------------------------------------------------------------------------------------------
// Before: `rate … per actor`, `concurrent_tasks N`, `max amount N`, `max query length N`,
// `max results N` were not in ALL_LIMIT_PATTERNS, so isRecognizedLimitDecl returned false and
// verifyLimitsBlock emitted FUNGI-GOV-019 ("declared but the runtime will NOT enforce it") — on
// shipped examples 222/226/227/468/469/470 whose headers say `expected_diagnostics: none`.
// After BUG B they are recognised (registered in ALL_LIMIT_PATTERNS) ⇒ no false GOV-019.
// The negative control proves recognition did NOT become permissive: a real typo still warns.
// =============================================================================================
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkEffects, verifyGovernance } from "../../dist/index.js";

function parseAndVerify(source, profile = "dev") {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}
const hasDiag = (r, code) => r.diagnostics.some((d) => d.code === code);
const codesOf = (r) => r.diagnostics.map((d) => d.code).join(", ") || "(none)";

const flowWith = (limitsLine) =>
`secure flow op(readonly request: Request) -> Result<Summary, String>
contract {
  intent { "run under declared limits" }
  effects { database.read }
  limits {
    ${limitsLine}
  }
}
{
  return Ok({ id: request.params.id })
}`;

describe("RD-0234c BUG B: previously-inert limit kinds recognised (no false FUNGI-GOV-019)", () => {
  const RECOGNISED = [
    "rate 500 per minute per actor",
    "concurrent_tasks 4",
    "max amount 1000000",
    "max query length 200 characters",
    "max results 50",
  ];
  for (const decl of RECOGNISED) {
    it(`\`${decl}\` no longer warns FUNGI-GOV-019 (recognised by the runtime grammar)`, () => {
      const r = parseAndVerify(flowWith(decl));
      assert.ok(!hasDiag(r, "FUNGI-GOV-019"),
        `\`${decl}\` must be recognised as a limit declaration. diagnostics: ${codesOf(r)}`);
    });
  }

  it("NEGATIVE CONTROL: a real typo `max reslts 50` STILL warns FUNGI-GOV-019 (recognition not permissive)", () => {
    const r = parseAndVerify(flowWith("max reslts 50"));
    assert.ok(hasDiag(r, "FUNGI-GOV-019"),
      `a genuine typo must still be flagged as an unrecognised limit. diagnostics: ${codesOf(r)}`);
  });
});
