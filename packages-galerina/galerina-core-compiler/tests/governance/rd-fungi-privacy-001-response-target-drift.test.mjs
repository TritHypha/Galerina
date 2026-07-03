// =============================================================================================
// RED-bench — FUNGI-PRIVACY-001 (GNG-03) response-target drift fail-open
// ---------------------------------------------------------------------------------------------
// THE BUG (verified against the shipped Galerina compiler):
//   src/governance-verifier.ts extractPrivacyDeniedResponseFields() matches the privacy deny
//   clause with the regex  /deny\s+protected\s+(\w+)\s+to\s+response\s*\.\s*body/gi  — which
//   HARD-REQUIRES the literal ".body" sink suffix. But every SHIPPED example
//   (docs/examples/Level-5-Governance/222-limits-privacy, 224-contract-best-practices) and every
//   other test documents the BARE form  `deny protected Email to response`  (no ".body"). So a
//   developer who copies the shipped grammar gets ZERO enforcement: the exact class GNG-03 was
//   meant to close (a protected field returned to the API surface), narrowed to a syntax variant.
//
// CONTROLLED EXPERIMENT: the two leak fixtures below differ in EXACTLY ONE token — the deny-clause
// sink target (`to response` vs `to response.body`). Everything else (protected field, the leaking
// `return Ok({ email: email })`) is identical. So any divergence in FUNGI-PRIVACY-001 is caused by
// the target token alone. That isolates the defect.
//
//   pristine shipped dist:  BUG fixture GREEN-passes (no diag)   <- FAIL-OPEN (this bench goes RED)
//                           CONTROL fixture correctly fires      <- proves the mechanism works w/ .body
//   patched dist:           BOTH fire; no-false-positive + redact-discharge stay clean  <- GREEN
//
// Import target is overridable so the SAME bench runs against pristine prod dist and the patched
// overlay dist:   GAL_DIST=<path to dist/index.js> node --test <this file>
// Default = this package's built dist (resolved relative to the test file — no machine path).
// =============================================================================================
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = process.env.GAL_DIST ??
  fileURLToPath(new URL("../../dist/index.js", import.meta.url));
const { parseProgram, checkEffects, verifyGovernance } = await import(pathToFileURL(DIST).href);

function gov(source, profile = "production") {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}
const has = (g, code) => g.diagnostics.some((d) => d.code === code);
const codes = (g) => g.diagnostics.map((d) => d.code).join(", ") || "(none)";

// A flow that RETURNS a protected field named by the privacy deny clause — a real leak.
// `target` is the ONLY thing that varies across fixtures. `bodyReturn` lets the no-fp / redact
// variants swap the return expression. Multi-line body on purpose (inline single-line masks AST).
const leakFlow = (target, bodyReturn = "  return Ok({ email: email })") =>
`secure flow getProfile(readonly request: Request) -> Result<Summary, String>
contract {
  intent { "return a profile" }
  effects { database.read }
  privacy {
    contains PII
    deny protected Email ${target}
    require redaction before audit.write
  }
}
{
  let email: protected String = validate.email(request.params.e)?
${bodyReturn}
}`;

describe("FUNGI-PRIVACY-001: privacy deny must enforce on the DOCUMENTED bare `to response` target", () => {
  // ── The bug: the shipped/documented bare form ─────────────────────────────────────────────
  it("BUG: `deny protected Email to response` (bare — the shipped-example form) with a leak fires FUNGI-PRIVACY-001", () => {
    const g = gov(leakFlow("to response"));
    assert.ok(has(g, "FUNGI-PRIVACY-001"),
      `bare 'to response' leak was NOT caught — fail-open. diagnostics: ${codes(g)}`);
  });

  // ── Control: the one form that already works ──────────────────────────────────────────────
  it("CONTROL: `deny protected Email to response.body` with a leak fires FUNGI-PRIVACY-001 (mechanism works)", () => {
    const g = gov(leakFlow("to response.body"));
    assert.ok(has(g, "FUNGI-PRIVACY-001"),
      `.body form should fire (this is the existing supported path). diagnostics: ${codes(g)}`);
  });

  // ── No false positive: bare form, field NOT leaked (the shape of examples 222/224) ────────
  it("NO-FP: bare `to response` with only non-denied fields returned does NOT fire", () => {
    const g = gov(leakFlow("to response", "  return Ok({ id: request.params.id })"));
    assert.ok(!has(g, "FUNGI-PRIVACY-001"),
      `must not over-fire when the denied field is not returned. diagnostics: ${codes(g)}`);
  });

  // ── Discharge: redact() on the newly-enforced bare path still discharges ───────────────────
  it("DISCHARGE: bare `to response` with `return Ok({ email: redact(email) })` does NOT fire", () => {
    const g = gov(leakFlow("to response", "  return Ok({ email: redact(email) })"));
    assert.ok(!has(g, "FUNGI-PRIVACY-001"),
      `redact() must discharge the deny on the bare path too. diagnostics: ${codes(g)}`);
  });

  // ── Whitespace robustness: the documented dot-spacing tolerance must survive the fix ───────
  it("CONTROL2: `deny protected Email to response . body` (spaced dot) still fires", () => {
    const g = gov(leakFlow("to response . body"));
    assert.ok(has(g, "FUNGI-PRIVACY-001"),
      `spaced-dot .body form should still fire. diagnostics: ${codes(g)}`);
  });
});
