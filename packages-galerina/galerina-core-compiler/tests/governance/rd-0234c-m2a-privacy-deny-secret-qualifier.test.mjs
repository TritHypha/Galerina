// =============================================================================================
// RD-0234c M2-a (SOUND SUBSET) — privacy-deny qualifier broadening: protected → protected|secret.
// ---------------------------------------------------------------------------------------------
// FUNGI-PRIVACY-001's extractor matched the `protected` qualifier ONLY, so `deny secret X to response`
// no-opped — a `secret`-qualified field could return to the response and sign clean. `secret` IS a
// Galerina TYPE_QUALIFIER (type-registry.ts:132 = protected/redacted/unsafe/safe/secret), so denying
// it to the response is a real, documentable directive. M2-a broadens the qualifier alternation to
// {protected, secret} on the SAME response-surface family privacy-001 enforces.
//
// SCOPE — SOUND SUBSET ONLY. This does NOT broaden the SINK set to log.write/network.outbound/
// audit.write: enforcement runs through collectBodyFieldNames = the RESPONSE BODY. Recognising a
// `deny protected CardNumber to logs` directive while still enforcing it against the response body
// would be a directive that READS as log-enforced but isn't — the same WYSIWYG-inversion sin GNG-03
// exists to close. Real per-sink (log/egress) enforcement is a separate RD item (privacy Part C),
// tracked in TODO, NOT faked with a regex here. `sensitive` is intentionally omitted — not a qualifier.
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

// deny <qualifier> <Field> to response ; the flow returns the denied field (a leak) or not.
const flow = (qualifier, denyField, letLine, bodyReturn) =>
`secure flow getProfile(readonly request: Request) -> Result<Summary, String>
contract {
  intent { "return a profile" }
  effects { database.read }
  privacy {
    contains PII
    deny ${qualifier} ${denyField} to response
  }
}
{
  ${letLine}
${bodyReturn}
}`;

describe("RD-0234c M2-a: privacy deny enforces the `secret` qualifier too (response family)", () => {
  it("BUG: `deny secret Token to response` with a leak fires FUNGI-PRIVACY-001", () => {
    const g = gov(flow("secret", "Token",
      "let token: secret String = validate.token(request.params.t)?",
      "  return Ok({ token: token })"));
    assert.ok(has(g, "FUNGI-PRIVACY-001"),
      `secret-qualified deny must enforce on the response. diagnostics: ${codes(g)}`);
  });

  it("REGRESSION: `deny protected Email to response` still fires (protected path unchanged)", () => {
    const g = gov(flow("protected", "Email",
      "let email: protected String = validate.email(request.params.e)?",
      "  return Ok({ email: email })"));
    assert.ok(has(g, "FUNGI-PRIVACY-001"),
      `protected path must remain enforced. diagnostics: ${codes(g)}`);
  });

  it("NO-FP: `deny secret Token to response` with the denied field NOT returned does not fire", () => {
    const g = gov(flow("secret", "Token",
      "let token: secret String = validate.token(request.params.t)?",
      "  return Ok({ id: request.params.id })"));
    assert.ok(!has(g, "FUNGI-PRIVACY-001"),
      `must not over-fire when the secret field is not returned. diagnostics: ${codes(g)}`);
  });

  it("DISCHARGE: `deny secret Token to response` with `redact(token)` returned does not fire", () => {
    const g = gov(flow("secret", "Token",
      "let token: secret String = validate.token(request.params.t)?",
      "  return Ok({ token: redact(token) })"));
    assert.ok(!has(g, "FUNGI-PRIVACY-001"),
      `redact() must discharge the secret-qualified deny too. diagnostics: ${codes(g)}`);
  });
});
