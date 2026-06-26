// =============================================================================
// RD-0093b — LLN-VALUESTATE-008 false positive: a record-literal / named-argument
// FIELD NAME colliding with a boundary-param NAME.
//
// BUG: checkArgForUnsafeBinding hit an `identifier` node and looked up node.value
// directly. A record field `{ patientId: auditId }` parses to kind:"identifier"
// with value = the FIELD NAME ("patientId") and children = [the VALUE expr
// ("auditId")]. The checker looked up the field NAME, matched the still-live
// boundary-untrusted param, and fired VS-008 — a pure FALSE POSITIVE (no data
// flow: the field's real value is a safe local). Renaming the param made it
// clean, proving the trigger was the field-name identifier, not a real flow.
//
// FIX: mirror the already-correct checkArgForProtectedAtAuditLog (VS-006) — if the
// identifier has children, recurse into the field VALUE and return; never look up
// the field NAME.
//
// SAME bug audited in the sibling secret walkers and fixed identically:
//   • checkArgForSecretLogging (SECRET-001) — same false positive.
//   • checkArgForSecretSerialization (SECRET-003) — false positive AND a false
//     NEGATIVE: its post-lookup `return` skipped the field value, so a real
//     SecureString in a record field VALUE at AuditLog.write was MISSED.
// Regressions for all of these are below (the SECRET-003 case asserts the
// false-negative is now CLOSED — a security improvement, not just a cleanup).
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";

const check = (src, mode) => checkValueStates(parseProgram(src, "t.lln").ast, mode);
const diags = (r, code) => r.diagnostics.filter((d) => d.code === code);
const has = (r, code) => diags(r, code).length > 0;

// ── LLN-VALUESTATE-008 — the reported false positive ─────────────────────────

// Gates the param into a NEW binding (so the original `patientId` stays a live
// boundary input), passes only the gated value to real sinks, and writes an audit
// record whose FIELD NAME equals the param name but whose VALUE is a safe local.
const gatedWithCollidingAuditField = (kind, paramType) => `
${kind} flow deletePatient(patientId: ${paramType}) -> Result<String, Error>
contract { effects { database.write } }
{
  safe mut cleanId = validate.patientId(patientId)?
  let auditId = "audit-123"
  let row = DB.delete(cleanId)?
  AuditLog.write({ patientId: auditId, action: "delete" })
  return Ok("done")
}
`;

test("VS-008 FP: audit FIELD NAME colliding with a gated boundary param does NOT fire (protected param)", () => {
  const r = check(gatedWithCollidingAuditField("secure", "protected PatientId"));
  assert.ok(!has(r, "LLN-VALUESTATE-008"),
    `field-name collision must not fire VS-008; got: ${r.diagnostics.map((d) => d.code).join(",") || "none"}`);
});

test("VS-008 FP: same with a plain String param does NOT fire", () => {
  assert.ok(!has(check(gatedWithCollidingAuditField("secure", "String")), "LLN-VALUESTATE-008"),
    "plain String param field-name collision must not fire VS-008");
});

test("VS-008 FP: guarded-flow parity — field-name collision does NOT fire", () => {
  assert.ok(!has(check(gatedWithCollidingAuditField("guarded", "String")), "LLN-VALUESTATE-008"),
    "guarded flow field-name collision must not fire VS-008");
});

test("VS-008 FP: stays clean even in production mode (where VS-008 escalates to error)", () => {
  assert.ok(!has(check(gatedWithCollidingAuditField("secure", "protected PatientId"), "production"), "LLN-VALUESTATE-008"),
    "a field-name collision must not become a false ERROR in production mode");
});

test("VS-008 control: renaming the param away from the field name stays clean", () => {
  const r = check(`
secure flow deletePatient(rawPatientId: protected PatientId) -> Result<String, Error>
contract { effects { database.write } }
{
  safe mut cleanId = validate.patientId(rawPatientId)?
  let auditId = "audit-123"
  let row = DB.delete(cleanId)?
  AuditLog.write({ patientId: auditId, action: "delete" })
  return Ok("done")
}
`);
  assert.ok(!has(r, "LLN-VALUESTATE-008"), "renamed param must stay clean");
});

// ── LLN-VALUESTATE-008 — true positives MUST be preserved ────────────────────

test("VS-008 TP preserved: an ungated boundary param as a record field VALUE still fires", () => {
  const r = check(`
secure flow deletePatient(patientId: String) -> Result<String, Error>
contract { effects { database.write } }
{
  AuditLog.write({ recordedId: patientId, action: "delete" })
  return Ok("done")
}
`);
  assert.ok(has(r, "LLN-VALUESTATE-008"), "an ungated boundary param in a field VALUE is a real leak and must still fire");
});

test("VS-008 TP preserved: the original RD-0093 bare-param-at-sink case still fires", () => {
  const r = check(`
secure flow test(raw: String) -> Result<String, Error>
contract { effects { database.write } }
{
  let saved = DB.insert(raw)?
  return Ok(saved)
}
`);
  assert.ok(has(r, "LLN-VALUESTATE-008"), "the original RD-0093 true positive must be preserved");
});

// ── Sibling-walker audit — SECRET-001 / SECRET-003 field-name bug ─────────────

test("SECRET-001 FP: a log record FIELD NAME colliding with a SecureString binding does NOT fire", () => {
  const r = check(`
secure flow f(id: String) -> Result<Int, ApiError>
contract { effects {} }
{
  let token: SecureString = env.secret("API_KEY")
  let safeId = "req-1"
  log.info({ token: safeId, action: "login" })
  return Ok(1)
}
`);
  assert.ok(!has(r, "LLN-SECRET-001"), "field NAME 'token' is not the secret value — must not fire SECRET-001");
});

test("SECRET-001 TP preserved: a SecureString as a log record field VALUE still fires", () => {
  const r = check(`
secure flow f(id: String) -> Result<Int, ApiError>
contract { effects {} }
{
  let token: SecureString = env.secret("API_KEY")
  log.info({ recorded: token, action: "login" })
  return Ok(1)
}
`);
  assert.ok(has(r, "LLN-SECRET-001"), "a SecureString in a logged field value must still fire SECRET-001");
});

test("SECRET-003 FP: an audit record FIELD NAME colliding with a SecureString binding does NOT fire", () => {
  const r = check(`
secure flow f(id: String) -> Result<Int, ApiError>
contract { effects { audit.write } }
{
  let token: SecureString = env.secret("API_KEY")
  let safeId = "req-1"
  AuditLog.write({ token: safeId, action: "login" })
  return Ok(1)
}
`);
  assert.ok(!has(r, "LLN-SECRET-003"), "field NAME 'token' is not the secret value — must not fire SECRET-003");
});

test("SECRET-003 FN CLOSED: a SecureString in an audit record field VALUE is now CAUGHT (was previously missed)", () => {
  const r = check(`
secure flow f(id: String) -> Result<Int, ApiError>
contract { effects { audit.write } }
{
  let token: SecureString = env.secret("API_KEY")
  AuditLog.write({ recorded: token, action: "login" })
  return Ok(1)
}
`);
  assert.ok(has(r, "LLN-SECRET-003"),
    "a real SecureString in a record field VALUE at AuditLog.write must fire SECRET-003 (the old field-name `return` skipped it)");
});

test("SECRET-003 discharge preserved: redact() in a field value still clears SECRET-003", () => {
  const r = check(`
secure flow f(id: String) -> Result<Int, ApiError>
contract { effects { audit.write } }
{
  let token: SecureString = env.secret("API_KEY")
  AuditLog.write({ recorded: redact(token), action: "login" })
  return Ok(1)
}
`);
  assert.ok(!has(r, "LLN-SECRET-003"), "redact() in a field value must still discharge SECRET-003");
});
