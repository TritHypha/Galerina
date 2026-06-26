// =============================================================================
// contract.architecture { volatility, depends_on } — R&D 0045 (parse-only + fail-closed value check)
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseProgram, checkEffects, verifyGovernance } from "../dist/index.js";

function verify(src) {
  const p = parseProgram(src, "arch.spore");
  const fx = checkEffects(p.flows, p.ast);
  const gov = verifyGovernance(p.ast, p.flows, fx, "production");
  return { parseErrors: p.diagnostics.filter((d) => d.severity === "error"), gov };
}
const mk = (arch) => `pure flow billing(x: Int) -> Int
contract { intent { "x" } architecture { ${arch} } }
{ return x }
pure flow taxCalc(x: Int) -> Int { return x }`;

describe("contract.architecture (parse-only + volatility value check)", () => {
  it("parses a valid architecture block (volatility + depends_on) with no errors", () => {
    const { parseErrors, gov } = verify(mk("volatility: HIGH  depends_on [taxCalc]"));
    assert.equal(parseErrors.length, 0, "block must parse clean (registered contract section)");
    assert.ok(!gov.diagnostics.some((d) => d.code === "SPORE-ARCH-001"), "valid volatility → no SPORE-ARCH-001");
  });

  it("accepts LOW / MED / HIGH", () => {
    for (const v of ["LOW", "MED", "HIGH"]) {
      const { gov } = verify(mk(`volatility: ${v}`));
      assert.ok(!gov.diagnostics.some((d) => d.code === "SPORE-ARCH-001"), `${v} must be valid`);
    }
  });

  it("rejects an invalid volatility token (fail-closed SPORE-ARCH-001 error)", () => {
    const { gov } = verify(mk("volatility: SOMETIMES"));
    const arch = gov.diagnostics.filter((d) => d.code === "SPORE-ARCH-001");
    assert.equal(arch.length, 1, "an invalid volatility token must be flagged");
    assert.equal(arch[0].severity, "error", "fail-closed — an invalid token is a hard error");
    assert.ok(arch[0].message.includes("SOMETIMES"), "names the bad token");
  });

  it("a depends_on-only block (no volatility) is allowed", () => {
    const { parseErrors, gov } = verify(mk("depends_on [taxCalc]"));
    assert.equal(parseErrors.length, 0);
    assert.ok(!gov.diagnostics.some((d) => d.code === "SPORE-ARCH-001"), "absent volatility is not an error");
  });
});

describe("Stable-Dependencies enforcement (SPORE-ARCH-002, always a hard error)", () => {
  // two flows where `caller` calls `callee`, each with a declared volatility
  const pair = (callerVol, calleeVol) => `pure flow caller(x: Int) -> Int
contract { intent { "c" } architecture { volatility: ${callerVol} } }
{ return callee(x) }
pure flow callee(x: Int) -> Int
contract { intent { "c" } architecture { volatility: ${calleeVol} } }
{ return x }`;
  const arch2 = (src) => verify(src).gov.diagnostics.filter((d) => d.code === "SPORE-ARCH-002");

  it("a LOW flow depending on a HIGH flow is a hard error", () => {
    const d = arch2(pair("LOW", "HIGH"));
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error", "always a hard error (owner decision #5)");
    assert.ok(d[0].message.includes("caller") && d[0].message.includes("callee"));
  });

  it("a MED flow depending on a HIGH flow is a violation (general SDP)", () => {
    assert.equal(arch2(pair("MED", "HIGH")).length, 1);
  });

  it("a HIGH flow depending on a LOW flow is FINE (volatile may depend on stable)", () => {
    assert.equal(arch2(pair("HIGH", "LOW")).length, 0);
  });

  it("equal volatility is fine", () => {
    assert.equal(arch2(pair("LOW", "LOW")).length, 0);
    assert.equal(arch2(pair("HIGH", "HIGH")).length, 0);
  });

  it("if either flow does not declare volatility, it is NOT checked (no false positive)", () => {
    const onlyCaller = `pure flow caller(x: Int) -> Int
contract { intent { "c" } architecture { volatility: LOW } }
{ return callee(x) }
pure flow callee(x: Int) -> Int { return x }`;
    assert.equal(verify(onlyCaller).gov.diagnostics.filter((d) => d.code === "SPORE-ARCH-002").length, 0);
  });
});
