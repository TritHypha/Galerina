// RD-0358 hardening (PROTOTYPE) — parser + governance-verifier INTEGRATION.
// Proves the explicit `hardening {}` block is parsed and enforced fail-closed end-to-end, AND — the
// corpus-safety invariant — that a secret flow with NO explicit block emits ZERO FUNGI-HARDEN codes
// (auto-derivation is a checker-verified shadow surfaced by scripts/hardening-show-derived.mjs, not
// build-wired here; #143). Uses the same parse → checkEffects → verifyGovernance harness as the other
// governance tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkEffects, verifyGovernance } from "../dist/index.js";

function gov(source, profile = "dev") {
  const parsed = parseProgram(source, "test.fungi");
  const parseErrors = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(parseErrors.length, 0, `parse errors: ${parseErrors.map((d) => d.message).join("; ")}`);
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}
const hardenCodes = (g) => g.diagnostics.filter((d) => d.code.startsWith("FUNGI-HARDEN-")).map((d) => d.code);

describe("RD-0358: explicit hardening {} block — parse + fail-closed enforcement", () => {
  it("a secret flow with NO hardening block emits ZERO FUNGI-HARDEN codes (auto-derivation is record-only)", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), []);
  });

  it("residency register_only on a host that cannot register-pin → FUNGI-HARDEN-005 (spill rejected)", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { residency register_only host mlock_posix } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), ["FUNGI-HARDEN-005"]);
  });

  it("residency no_swap on mlock_posix (which honours it) → clean, no FUNGI-HARDEN code", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { residency no_swap host mlock_posix } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), []);
  });

  it("register_only WITH a register_pinned host (which honours it) → clean", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { residency register_only host register_pinned } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), []);
  });

  it("an undeclared host cannot honour a declared ceiling → FUNGI-HARDEN-005 (fail-closed, H-6)", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { residency no_swap } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), ["FUNGI-HARDEN-005"]);
  });

  it("an unrecognised residency tier → FUNGI-HARDEN-001 (fail-closed value validation)", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { residency bogus_tier host register_pinned } }
{ return 1 }`;
    assert.ok(hardenCodes(gov(src)).includes("FUNGI-HARDEN-001"));
  });

  it("loosening a secret's erase default (on_exit → none) WITHOUT audited_loosen → FUNGI-HARDEN-004", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { erase none } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), ["FUNGI-HARDEN-004"]);
  });

  it("the same loosen WITH audited_loosen is permitted → clean", () => {
    const src = `secure flow handleKey(k: Int) -> Int
contract { intent { "Handle a secret." } privacy { contains PII }
  hardening { erase none audited_loosen } }
{ return 1 }`;
    assert.deepEqual(hardenCodes(gov(src)), []);
  });

  it("H-4 (partial): a `timing constant` obligation with a param-dependent branch → FUNGI-HARDEN-006 (warning)", () => {
    const src = `secure flow compare(amount: Int) -> Int
contract { intent { "Compare a secret." } privacy { contains PII }
  hardening { timing constant } }
{ if amount > 0 { return 1 } return 0 }`;
    assert.ok(hardenCodes(gov(src)).includes("FUNGI-HARDEN-006"));
  });

  it("HV8 (the honest limit): an UNLABELLED value (no privacy/secrets/secret effect, no block) is NOT auto-hardened", () => {
    // A plaintext-looking value that the developer never marked secret gets no hardening and no diagnostic —
    // auto-hardening is only as good as the taint/secret labelling. Pinned so it is never mistaken for coverage.
    const src = `pure flow addTwo(a: Int, b: Int) -> Int
contract { intent { "Plain arithmetic — nothing marked secret." } }
{ return a + b }`;
    assert.deepEqual(hardenCodes(gov(src)), []);
  });
});
