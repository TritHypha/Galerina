// =============================================================================
// Coverage-of-coverage for the production security gate (RD-0234 L6-B2).
//
// The problem this test solves: a UNIT test of a checker (e.g. checkTaint) still
// passes even when that checker has ZERO pipeline call-sites — which is exactly how
// GNG-01/monkey-patch/attribute-escape stayed dead while every unit test was green.
// This test feeds a fixture that VIOLATES each security rule through the ACTUAL shared
// gate (runProductionSecurityGate — the one both cli.ts and galerina.mjs sign behind)
// and asserts the corresponding diagnostic is EMITTED and the gate BLOCKS. Remove a
// checker from the gate body and the matching case here goes red — a checker can no
// longer silently un-wire.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, runProductionSecurityGate, productionGateBlocks } from "../dist/index.js";

// Each case: a minimal .fungi source that violates ONE gated security rule, and the
// diagnostic code the wired checker must emit. The fixture need not be otherwise-clean;
// we only assert the expected code is present (and that the gate blocks).
const CASES = [
  {
    code: "FUNGI-TAINT-001", // OWASP taint → injection sink (checkTaint — GNG-01 dead gate)
    src: `
secure flow lookup(request: String) -> Result<String, String>
contract { intent { "sqli" } effects { storage.read } }
{ let row = Database.query(request)  return Ok("ok") }
`,
  },
  {
    code: "FUNGI-SEC-020", // runtime monkey-patch (checkMonkeyPatching — Class A dead gate)
    src: `
secure flow patch() -> Result<String, String>
contract { intent { "patch" } effects { } }
{ Runtime.patch("Database.find", "x")  return Ok("ok") }
`,
  },
  {
    code: "FUNGI-ATTR-001", // attribute directive wraps unverified code (Class D escape hatch)
    src: `
secure flow t(amount: Int) -> Result<String, String>
contract {
  intent { "hidden block" }
  effects { ledger.mutate }
  @experimental_profile(name: "x", status: "y") { let s = Vault.read("p")  Network.call("u", s) }
}
{ return Ok("ok") }
`,
  },
  {
    code: "FUNGI-ATTR-002", // unknown attribute directive (deny-by-default)
    src: `
secure flow t() -> Result<String, String>
contract {
  intent { "unknown attr" }
  effects { }
  @totally_unknown_directive(a: "b")
}
{ return Ok("ok") }
`,
  },
  {
    code: "FUNGI-SOURCE-ESCAPE-001", // eval / dynamic code (checkSourceEscapes)
    src: `
secure flow e(request: String) -> Result<String, String>
contract { intent { "eval" } effects { } }
{ let x = eval("2 + 2")  return Ok("ok") }
`,
  },
  {
    code: "FUNGI-PRIVACY-001", // contract.privacy deny protected X to response.body (GNG-03)
    src: `
secure flow getThing(readonly request: Request) -> Result<Summary, String>
contract {
  intent { "leak" }
  effects { database.read }
  privacy { deny protected Token to response.body }
}
{ let token: protected String = validate.token(request.params.t)?  return Ok({ token: token }) }
`,
  },
];

describe("Production security gate — coverage-of-coverage (RD-0234 L6-B2)", () => {
  for (const { code, src } of CASES) {
    it(`gate emits ${code} for a violating fixture (checker is WIRED)`, () => {
      const { ast, flows } = parseProgram(src, "coverage.fungi");
      const diags = runProductionSecurityGate(ast, flows, src, "coverage.fungi");
      const hit = diags.find((d) => d.code === code && d.severity === "error");
      assert.ok(
        hit !== undefined,
        `Expected gate to emit ${code} (error) — is the checker wired into runProductionSecurityGate? ` +
        `Got: ${[...new Set(diags.map((d) => d.code))].join(", ") || "(none)"}`,
      );
      assert.equal(productionGateBlocks(diags), true, `${code}: gate must BLOCK signing`);
    });
  }

  it("a clean flow passes the gate (no false positives)", () => {
    const src = `
pure flow add(a: Int, b: Int) -> Int
contract { intent { "sum" } }
{ return a + b }
`;
    const { ast, flows } = parseProgram(src, "clean.fungi");
    const diags = runProductionSecurityGate(ast, flows, src, "clean.fungi");
    assert.equal(productionGateBlocks(diags), false,
      `clean flow must not block: ${diags.filter((d) => d.severity === "error").map((d) => d.code).join(", ")}`);
  });
});
