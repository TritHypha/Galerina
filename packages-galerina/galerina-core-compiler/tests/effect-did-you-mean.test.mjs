// =============================================================================
// FUNGI-EFFECT-004 nearest-name did-you-mean (2026-07-08)
//
// The self-correction half of the anti-hallucination verify-loop (see
// docs/ANTI_HALLUCINATION.md §6): a TYPO of a real effect name gets nudged to
// the canonical spelling; a WILD invention gets NO suggestion (a misleading
// nudge is worse than none). Fail-closed is UNCHANGED — both remain
// FUNGI-EFFECT-004 errors; this only adds a suggestion, never widens accept.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkEffects } from "../dist/index.js";

function eff004(name) {
  const p = parseProgram(
    `@version 1\nsecure flow f(x: Int) -> Int\ncontract { intent { "x" } effects { ${name} } }\n{ return x }`,
    "t.fungi",
  );
  return checkEffects(p.flows, p.ast, "production", true)
    .flatMap((r) => r.diagnostics ?? [])
    .find((d) => d.code === "FUNGI-EFFECT-004");
}

describe("FUNGI-EFFECT-004 did-you-mean (nearest canonical name)", () => {
  it("a typo of a real effect suggests the canonical spelling", () => {
    const d = eff004("database.wrote");
    assert.ok(d && d.severity === "error", "still a hard error (fail-closed unchanged)");
    assert.equal(d.suggestedCode, "database.write");
    assert.match(d.message, /Did you mean "database\.write"\?/);
  });

  it("a typo of a dotted secret effect suggests secret.read", () => {
    const d = eff004("secret.raed");
    assert.equal(d?.suggestedCode, "secret.read");
  });

  it("a WILD invention gets NO suggestion (no misleading nudge)", () => {
    const d = eff004("totally.fake.effect");
    assert.ok(d && d.severity === "error");
    assert.equal(d.suggestedCode, undefined);
    assert.doesNotMatch(d.message, /Did you mean/);
  });

  it("still fail-closed: every unknown name is an error regardless of suggestion", () => {
    for (const n of ["database.wrote", "totally.fake.effect", "frobnicate.the.widget"]) {
      assert.equal(eff004(n)?.severity, "error", `${n} must remain an error`);
    }
  });
});
