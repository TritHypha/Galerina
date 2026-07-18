/**
 * B0 (RD-0349, R&D ruling 2026-07-18 "set a") — a non-hallmark type/record/enum may NOT shadow a
 * reserved AUTHORITY name. The un-shadowable set is exactly the names that carry authority:
 *   `Money` (gates currency validation) · the epistemic vocabulary (Verdict/Secret/Trusted/Unverified/
 *   Refuted/Tainted/SafeFor/Decision — gate trust/secrecy/verdict) · `Brand` (the validated-mint gate).
 * Shadowing one is a confused-deputy path: a downstream governance/currency check could then operate on
 * the wrong type. Structural ADT builtins (Result/Option/Array/…) carry NO authority — shadowing one is a
 * type-footgun the schema checker already catches, NOT authority laundering — so B0 must leave them clean.
 * Domain-convenience names (UserId/Email) and user names are likewise free to declare.
 *
 * This pins the boundary in BOTH directions (reject-set vs clean-set) so a future widening of the predicate
 * back onto the convenience/structural sets — which broke 8 examples + the ADT fixtures three times — fails
 * here first. The set is a curated authority allowlist; it grows only as authority types ship.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const errs = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "reserved-authority.fungi");
  const pErr = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (pErr.length > 0) return pErr; // a parse error means the fixture itself is malformed — surface it
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};

describe("B0: a non-hallmark decl may not shadow a reserved AUTHORITY name (set a)", () => {
  // The reject-set — Money, Brand, and the epistemic vocabulary, across type/record/enum forms.
  const REJECT = [
    ["type", "type Money { x: Int }", "Money"],
    ["record", "record Verdict { x: Int }", "Verdict"],
    ["enum", "enum Secret { A }", "Secret"],
    ["record", "record Brand { x: Int }", "Brand"],
    ["enum", "enum Tainted { A }", "Tainted"],
    ["type", "type Trusted { x: Int }", "Trusted"],
    ["record", "record Decision { x: Int }", "Decision"],
    ["enum", "enum SafeFor { A }", "SafeFor"],
  ];
  for (const [kind, src, nm] of REJECT) {
    it(`${kind} ${nm} → FUNGI-NAME-002, message says 'cannot shadow' (not 'already declared')`, () => {
      const es = errs(src);
      const b0 = es.find((e) => e.code === "FUNGI-NAME-002" && /reserved authority name/.test(e.message));
      assert.ok(b0, `expected a B0 reserved-authority error for '${nm}', got ${JSON.stringify(es)}`);
      assert.match(b0.message, /cannot shadow it/);
      // The name is NOT actually duplicated — the confusing "already declared in this module" variant of
      // FUNGI-NAME-002 must NOT be what fires here (that would misreport a shadow as a redeclaration).
      assert.doesNotMatch(b0.message, /already declared/);
      assert.match(b0.suggestedFix ?? "", /[Rr]ename/);
    });
  }

  // The clean-set — structural ADT builtins, domain-convenience names, and user names are all free to declare.
  const CLEAN = [
    "type Result { x: Int }",
    "enum Option { A }",
    "type GBP { x: Int }",
    "type UserId = String",
    "type Email = String",
    "record MyThing { x: Int }",
  ];
  for (const src of CLEAN) {
    it(`clean: \`${src}\` raises no reserved-authority error`, () => {
      const es = errs(src);
      const b0 = es.filter((e) => /reserved authority name/.test(e.message ?? ""));
      assert.deepEqual(b0, [], `'${src}' must NOT be flagged as authority-shadowing, got ${JSON.stringify(b0)}`);
    });
  }

  it("a genuine duplicate still fires the 'already declared' variant (B0 didn't cannibalize it)", () => {
    const es = errs(`record Widget { x: Int }\nrecord Widget { y: Int }`);
    const dup = es.find((e) => e.code === "FUNGI-NAME-002" && /already declared in this module/.test(e.message));
    assert.ok(dup, `expected the duplicate-name variant of FUNGI-NAME-002, got ${JSON.stringify(es)}`);
  });
});
