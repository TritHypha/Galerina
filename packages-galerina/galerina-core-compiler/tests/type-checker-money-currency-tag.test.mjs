/**
 * RD-0349 I1 — Money<CCY>'s currency tag is validated at COMPILE time.
 *
 * The runtime `Money.of` rejected an unknown currency code, but the TYPE CHECKER never imported the
 * generated MONEY_UNIT_TAGS registry, so `Money<BANANAS>`, `Money<GPB>` (a GBP typo), `Money<XAU>` (a
 * metal), and `Money<XXX>` (reserved) all COMPILED CLEAN — caught only at runtime, if the value ever
 * flowed through Money.of (R&D finding 2026-07-17). checkTypeRef now validates the tag against the same
 * pinned ISO-4217 table and emits FUNGI-TYPE-032 with a transposition-aware "did you mean" suggestion.
 *
 * This is I1's compile-time-tag-validation rung (2 of 6): the metals/reserved SPECIFIC routing to
 * `Commodity<T>` waits on Commodity<T> itself (RD-0350 C1) — but they correctly reject here regardless.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "money-ccy.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};
const money = (ccy) => `pure flow f(x: Money<${ccy}>) -> Int contract { effects {} } { return 0 }`;

describe("RD-0349 I1: Money<CCY> currency-tag validation", () => {
  it("a valid ISO-4217 code compiles clean", () => {
    for (const ccy of ["GBP", "USD", "JPY", "EUR", "CHF"]) {
      assert.deepEqual(typeErrors(money(ccy)).map((e) => e.code), [], `Money<${ccy}> should be valid`);
    }
  });

  it("an invented code (Money<BANANAS>) rejects with FUNGI-TYPE-032 — the live hole R&D found", () => {
    const errs = typeErrors(money("BANANAS"));
    assert.ok(
      errs.some((e) => e.code === "FUNGI-TYPE-032" && /BANANAS/.test(e.message) && /ISO-4217/.test(e.message)),
      JSON.stringify(errs),
    );
    // A commodity trader must be GUIDED, not merely refused: the diagnostic states Money is for
    // legal-tender currencies only, and (no near-currency to suggest) that a commodity/custom asset
    // needs its own type. Regression guard for the "what if BANANAS is a real commodity?" case.
    const e = errs.find((x) => x.code === "FUNGI-TYPE-032");
    assert.match(e.message, /legal-tender currencies only/, e.message);
    assert.match(e.suggestedFix ?? "", /commodity or custom asset/, e.suggestedFix ?? "(no suggestedFix)");
  });

  it("a transposition typo (Money<GPB>) rejects AND suggests GBP first", () => {
    const e = typeErrors(money("GPB")).find((x) => x.code === "FUNGI-TYPE-032");
    assert.ok(e, "GPB must reject");
    assert.match(e.message, /Did you mean GBP/, e.message);
  });

  it("a commodity/metal code (Money<XAU>) is not Money-admissible → rejects (routes to Commodity<T> once it exists)", () => {
    assert.ok(typeErrors(money("XAU")).some((e) => e.code === "FUNGI-TYPE-032"), "XAU must reject");
  });

  it("a reserved code (Money<XXX>) rejects", () => {
    assert.ok(typeErrors(money("XXX")).some((e) => e.code === "FUNGI-TYPE-032"), "XXX must reject");
  });

  it("detection is exact, not weakened: no false positive on a valid code, no missed invalid one", () => {
    assert.deepEqual(typeErrors(money("AUD")).map((e) => e.code), [], "AUD is valid");
    assert.ok(typeErrors(money("AUDD")).some((e) => e.code === "FUNGI-TYPE-032"), "AUDD (typo) must reject");
  });
});
