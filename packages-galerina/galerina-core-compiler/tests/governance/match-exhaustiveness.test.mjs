// =============================================================================
// FUNGI-MATCH-001 — match exhaustiveness is an ERROR (RD-0240, 2026-07-08)
//
// The rule is STRUCTURAL: any `match` with no wildcard `_` arm (guard matches
// exempt) is a compile ERROR — the WAT backend already traps the unmatched
// case at runtime, and the compiler now refuses it up front. The old version
// was a WARNING gated on a name heuristic (subject contains signal/cap/mode),
// which was itself a fail-open: renaming the subject silenced the check.
//
// Anti-vacuous discipline (A27): every "fires" test has a paired "silent on
// the good form" test, and the heuristic-escape case is pinned RED→GREEN.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkEffects, verifyGovernance } from "../../dist/index.js";

function verify(source, profile = "production") {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}

const matchDiags = (result) => result.diagnostics.filter((d) => d.code === "FUNGI-MATCH-001");

describe("FUNGI-MATCH-001 structural exhaustiveness (error)", () => {
  it("fires as ERROR on a match with no _ arm — plain subject name (the old heuristic escape)", () => {
    // Subject "result" contains none of signal/cap/mode and is not a memberExpr:
    // the pre-2026-07-08 heuristic was SILENT here. The structural rule must fire.
    const res = verify(`
      pure flow example() -> Void {
        let result = compute()
        match result {
          Ok(v) => print(v)
          Err(e) => print(e)
        }
      }
    `);
    const diags = matchDiags(res);
    assert.equal(diags.length, 1, "structural rule must fire without any name heuristic");
    assert.equal(diags[0].severity, "error", "RD-0240: non-exhaustive match is an ERROR, not a warning");
  });

  it("fires as ERROR on a governance-flavored subject too (no regression on the old scope)", () => {
    const res = verify(`
      pure flow example() -> Void {
        match signalKind {
          Alpha => handleA()
          Beta => handleB()
        }
      }
    `);
    const diags = matchDiags(res);
    assert.equal(diags.length, 1);
    assert.equal(diags[0].severity, "error");
  });

  it("fires even when the match has 6+ arms (the old arm-count gate is gone)", () => {
    const res = verify(`
      pure flow example() -> Void {
        match kind {
          A => f1()
          B => f2()
          C => f3()
          D => f4()
          E => f5()
          F => f6()
          G => f7()
        }
      }
    `);
    assert.equal(matchDiags(res).length, 1, "arm count must not suppress the structural rule");
  });

  it("is SILENT when a _ wildcard arm is present (anti-vacuous good form)", () => {
    const res = verify(`
      pure flow example() -> Void {
        match result {
          Ok(v) => print(v)
          Err(e) => print(e)
          _ => audit()
        }
      }
    `);
    assert.equal(matchDiags(res).length, 0);
  });

  it("is SILENT on guard matches (when cond => …) — boolean chains, not enum dispatch", () => {
    const res = verify(`
      pure flow example() -> Void {
        match x {
          when x > 1 => big()
          when x < 1 => small()
          _ => equal()
        }
      }
    `);
    assert.equal(matchDiags(res).length, 0);
  });

  it("nested match inside an arm body is checked too (walk recurses)", () => {
    const res = verify(`
      pure flow example() -> Void {
        match outer {
          Ok(v) => {
            match v {
              A => f()
              B => g()
            }
          }
          _ => audit()
        }
      }
    `);
    const diags = matchDiags(res);
    assert.equal(diags.length, 1, "the inner non-exhaustive match must be caught");
    assert.equal(diags[0].severity, "error");
  });
});
