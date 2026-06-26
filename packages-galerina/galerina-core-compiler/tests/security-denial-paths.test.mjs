/**
 * Security Denial-Path Conformance Tests
 *
 * Proves that DENIAL paths work — each test verifies that a specific bad
 * pattern is caught by the appropriate checker.  Happy paths are NOT the
 * focus here; every test confirms a rejection.
 *
 * Coverage:
 *   SPORE-TAINT-001   SQL injection: raw req.body → Database.query()
 *   SPORE-TAINT-003   Wrong-context untaint: HTML-escaped value at SQL sink
 *   SPORE-TAINT-004   Discouraged sanitiser: Sql.escape
 *   SPORE-PROFILE-001 Recursion in strict profile
 *   SPORE-PROFILE-002 Unbounded loop in strict profile
 *   SPORE-PROFILE-006 Missing runtime budget in high_integrity profile
 *   SPORE-VAL-001     safety_critical without audit.write
 *   SPORE-VAL-002     safety_critical without deterministic_execution
 *   SPORE-VAL-003     Unknown classification
 *   SPORE-HW-001      Quantum target without FormalRequired
 *   SPORE-HW-002      NPU target without audit.write
 *   SPORE-VALUESTATE-006  Protected value assigned to plain binding (no gate)
 *   SPORE-NET-001     (constant) Network destination not in allowlist
 *   SPORE-EFFECT-001  Effect used without declaration (network call)
 *   SPORE-SOURCE-ESCAPE-001  eval() in flow body
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram,
  checkTaint,
  SPORE_TAINT_001,
  SPORE_TAINT_003,
  SPORE_TAINT_004,
  checkProfiles,
  SPORE_PROFILE_001,
  SPORE_PROFILE_002,
  SPORE_PROFILE_006,
  checkEffects,
  effectResultsToDiagnostics,
  verifyGovernance,
  SPORE_VAL_001,
  SPORE_VAL_002,
  SPORE_VAL_003,
  SPORE_HW_001,
  SPORE_HW_002,
  checkValueStates,
  SPORE_VALUESTATE_006,
  SPORE_NET_001,
  checkSourceEscapes,
  SPORE_SOURCE_ESCAPE_001,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parse and run the taint checker; return array of diagnostic codes. */
function taintCodes(src) {
  const prog = parseProgram(src, "test.spore");
  return checkTaint(prog.ast, prog.flows).map(d => d.code);
}

/** Parse and run the profile checker; return array of diagnostic codes. */
function profileCodes(src, profiles) {
  const prog = parseProgram(src, "test.spore");
  return checkProfiles(prog.ast, prog.flows, profiles).map(d => d.code);
}

/** Parse, run effects + governance verifier; return all diagnostic codes. */
function governanceCodes(src, profile = "production") {
  const prog = parseProgram(src, "test.spore");
  const fx = checkEffects(prog.flows, prog.ast);
  return verifyGovernance(prog.ast, prog.flows, fx, profile).diagnostics.map(d => d.code);
}

/** Parse and run the value-state checker; return array of diagnostic codes. */
function valueStateCodes(src) {
  const prog = parseProgram(src, "test.spore");
  return checkValueStates(prog.ast).diagnostics.map(d => d.code);
}

/** Parse and run the effect checker; return all diagnostic codes. */
function effectCodes(src) {
  const prog = parseProgram(src, "test.spore");
  const results = checkEffects(prog.flows, prog.ast);
  return effectResultsToDiagnostics(results).map(d => d.code);
}

/** Parse and run the source escape checker; return all diagnostic codes. */
function escapeCodes(src) {
  const prog = parseProgram(src, "test.spore");
  return checkSourceEscapes(prog.ast).diagnostics.map(d => d.code);
}

// ---------------------------------------------------------------------------
// 1. SQL injection: raw req.body reaches Database.query() → SPORE-TAINT-001
// ---------------------------------------------------------------------------

describe("Denial #1 — SPORE-TAINT-001: SQL injection via raw req.body", () => {
  it("raw request body passed directly to Database.query() is denied", () => {
    const src = [
      "secure flow getUser(req: Request) -> Response",
      "contract { effects { database.read } }",
      "{ let userId: String = req.body  let r: String = Database.query(userId)  return r }",
    ].join("\n");

    const codes = taintCodes(src);
    assert.ok(
      codes.includes("SPORE-TAINT-001"),
      `Expected SPORE-TAINT-001 for raw req.body → Database.query, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_TAINT_001 constant has code SPORE-TAINT-001 and severity error", () => {
    assert.equal(SPORE_TAINT_001.code, "SPORE-TAINT-001");
    assert.equal(SPORE_TAINT_001.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// 2. Wrong-context untaint: HTML-escaped value at SQL sink → SPORE-TAINT-003
// ---------------------------------------------------------------------------

describe("Denial #2 — SPORE-TAINT-003: HTML-escaped value at SQL sink", () => {
  it("Html.escapeContent result passed to Database.query is denied (wrong context)", () => {
    const src = [
      "secure flow search(req: Request) -> Response",
      "contract { effects { database.read } }",
      "{ let safe: String = Html.escapeContent(req.body)  let r: String = Database.query(safe)  return r }",
    ].join("\n");

    const codes = taintCodes(src);
    assert.ok(
      codes.includes("SPORE-TAINT-003"),
      `Expected SPORE-TAINT-003 for HTML-escaped value at SQL sink, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_TAINT_003 constant has code SPORE-TAINT-003 and severity error", () => {
    assert.equal(SPORE_TAINT_003.code, "SPORE-TAINT-003");
    assert.equal(SPORE_TAINT_003.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// 3. Discouraged sanitiser: Sql.escape → SPORE-TAINT-004
// ---------------------------------------------------------------------------

describe("Denial #3 — SPORE-TAINT-004: Discouraged Sql.escape sanitiser", () => {
  it("using Sql.escape is flagged as a discouraged sanitiser", () => {
    const src = [
      "secure flow lookup(req: Request) -> Response",
      "contract { effects { database.read } }",
      "{ let s: String = Sql.escape(req.body)  return s }",
    ].join("\n");

    const codes = taintCodes(src);
    assert.ok(
      codes.includes("SPORE-TAINT-004"),
      `Expected SPORE-TAINT-004 for Sql.escape, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_TAINT_004 constant has code SPORE-TAINT-004 and severity warning", () => {
    assert.equal(SPORE_TAINT_004.code, "SPORE-TAINT-004");
    assert.equal(SPORE_TAINT_004.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// 4. Recursion in strict profile → SPORE-PROFILE-001
// ---------------------------------------------------------------------------

describe("Denial #4 — SPORE-PROFILE-001: Recursion in strict profile", () => {
  it("self-recursive flow in strict profile is denied", () => {
    const src = [
      "pure flow countdown(n: Int) -> Int contract { effects {} }",
      "{ if n <= 0 { return 0 } return countdown(n - 1) }",
    ].join("\n");

    const codes = profileCodes(src, ["strict"]);
    assert.ok(
      codes.includes("SPORE-PROFILE-001"),
      `Expected SPORE-PROFILE-001 for recursion in strict profile, got: [${codes.join(", ")}]`,
    );
  });

  it("the same recursive flow is ALLOWED when no profile is applied", () => {
    const src = [
      "pure flow countdown(n: Int) -> Int contract { effects {} }",
      "{ if n <= 0 { return 0 } return countdown(n - 1) }",
    ].join("\n");

    const codes = profileCodes(src, []);
    assert.ok(
      !codes.includes("SPORE-PROFILE-001"),
      `SPORE-PROFILE-001 must not fire with no active profile`,
    );
  });

  it("SPORE_PROFILE_001 constant has code SPORE-PROFILE-001 and severity error", () => {
    assert.equal(SPORE_PROFILE_001.code, "SPORE-PROFILE-001");
    assert.equal(SPORE_PROFILE_001.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// 5. Unbounded loop in strict profile → SPORE-PROFILE-002
// ---------------------------------------------------------------------------

describe("Denial #5 — SPORE-PROFILE-002: Unbounded loop in strict profile", () => {
  it("while loop with a variable bound in strict profile is denied", () => {
    const src = [
      "pure flow sumTo(n: Int) -> Int contract { effects {} }",
      "{ mut total: Int = 0  mut i: Int = 0  while i < n { total = total + i  i = i + 1 } return total }",
    ].join("\n");

    const codes = profileCodes(src, ["strict"]);
    assert.ok(
      codes.includes("SPORE-PROFILE-002"),
      `Expected SPORE-PROFILE-002 for unbounded while in strict profile, got: [${codes.join(", ")}]`,
    );
  });

  it("the same loop is ALLOWED when the bound is a literal constant", () => {
    const src = [
      "pure flow sum100() -> Int contract { effects {} }",
      "{ mut total: Int = 0  mut i: Int = 0  while i < 100 { total = total + i  i = i + 1 } return total }",
    ].join("\n");

    const codes = profileCodes(src, ["strict"]);
    assert.ok(
      !codes.includes("SPORE-PROFILE-002"),
      `SPORE-PROFILE-002 must not fire when the bound is a literal`,
    );
  });

  it("SPORE_PROFILE_002 constant has code SPORE-PROFILE-002 and severity error", () => {
    assert.equal(SPORE_PROFILE_002.code, "SPORE-PROFILE-002");
    assert.equal(SPORE_PROFILE_002.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// 6. Missing runtime budget in high_integrity → SPORE-PROFILE-006
// ---------------------------------------------------------------------------

describe("Denial #6 — SPORE-PROFILE-006: Missing runtime budget in high_integrity", () => {
  it("high_integrity flow without contract.limits warns with SPORE-PROFILE-006", () => {
    const src = [
      "secure flow process(n: Int) -> Int",
      "contract { effects { audit.write } }",
      "{ return n }",
    ].join("\n");

    const codes = profileCodes(src, ["high_integrity"]);
    assert.ok(
      codes.includes("SPORE-PROFILE-006"),
      `Expected SPORE-PROFILE-006 for high_integrity without budget, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_PROFILE_006 constant has code SPORE-PROFILE-006 and severity warning", () => {
    assert.equal(SPORE_PROFILE_006.code, "SPORE-PROFILE-006");
    assert.equal(SPORE_PROFILE_006.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// 7. safety_critical without audit.write → SPORE-VAL-001
// ---------------------------------------------------------------------------

describe("Denial #7 — SPORE-VAL-001: safety_critical without audit.write", () => {
  it("safety_critical flow missing audit.write is denied", () => {
    const src = [
      "secure flow armingSequence(t: Int) -> Bool",
      "contract {",
      "  effects { telemetry.read }",
      "  value { classification safety_critical domain aerospace }",
      "  safety { require deterministic_execution }",
      "}",
      "{ return true }",
    ].join("\n");

    const codes = governanceCodes(src);
    assert.ok(
      codes.includes("SPORE-VAL-001"),
      `Expected SPORE-VAL-001 for safety_critical without audit.write, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_VAL_001 constant has correct metadata", () => {
    assert.equal(SPORE_VAL_001.code, "SPORE-VAL-001");
    assert.equal(SPORE_VAL_001.severity, "error");
    assert.equal(SPORE_VAL_001.name, "SafetyCriticalMissingAudit");
  });
});

// ---------------------------------------------------------------------------
// 8. safety_critical without deterministic_execution → SPORE-VAL-002
// ---------------------------------------------------------------------------

describe("Denial #8 — SPORE-VAL-002: safety_critical without deterministic_execution", () => {
  it("safety_critical flow missing require deterministic_execution is denied", () => {
    const src = [
      "secure flow releaseMechanism(t: Int) -> Bool",
      "contract {",
      "  effects { audit.write telemetry.read }",
      "  value { classification safety_critical domain aerospace }",
      "}",
      "{ return true }",
    ].join("\n");

    const codes = governanceCodes(src);
    assert.ok(
      codes.includes("SPORE-VAL-002"),
      `Expected SPORE-VAL-002 for safety_critical without deterministic_execution, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_VAL_002 constant has correct metadata", () => {
    assert.equal(SPORE_VAL_002.code, "SPORE-VAL-002");
    assert.equal(SPORE_VAL_002.severity, "error");
    assert.equal(SPORE_VAL_002.name, "SafetyCriticalMissingDeterminism");
  });
});

// ---------------------------------------------------------------------------
// 9. Unknown classification → SPORE-VAL-003
// ---------------------------------------------------------------------------

describe("Denial #9 — SPORE-VAL-003: Unknown value classification", () => {
  it("unrecognised classification in contract.value is denied", () => {
    const src = [
      "secure flow score(x: Int) -> Bool",
      "contract {",
      "  effects { audit.write }",
      "  value { classification ultra_mega_secret }",
      "}",
      "{ return true }",
    ].join("\n");

    const codes = governanceCodes(src);
    assert.ok(
      codes.includes("SPORE-VAL-003"),
      `Expected SPORE-VAL-003 for unknown classification, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_VAL_003 constant has correct metadata", () => {
    assert.equal(SPORE_VAL_003.code, "SPORE-VAL-003");
    assert.equal(SPORE_VAL_003.severity, "error");
    assert.equal(SPORE_VAL_003.name, "UnknownValueClassification");
  });
});

// ---------------------------------------------------------------------------
// 10. Quantum target without FormalRequired → SPORE-HW-001
// ---------------------------------------------------------------------------

describe("Denial #10 — SPORE-HW-001: Quantum target without FormalRequired", () => {
  it("flow with hardware { target quantum } is denied without formal proof requirement", () => {
    const src = [
      "secure flow quantumSearch(n: Int) -> Bool",
      "contract { effects { audit.write } hardware { target quantum fallback cpu } }",
      "{ return true }",
    ].join("\n");

    const codes = governanceCodes(src);
    assert.ok(
      codes.includes("SPORE-HW-001"),
      `Expected SPORE-HW-001 for quantum target without FormalRequired, got: [${codes.join(", ")}]`,
    );
  });

  it("a cpu target does NOT trigger SPORE-HW-001", () => {
    const src = [
      "secure flow f(n: Int) -> Bool",
      "contract { effects { audit.write } hardware { target cpu } }",
      "{ return true }",
    ].join("\n");

    const codes = governanceCodes(src);
    assert.ok(
      !codes.includes("SPORE-HW-001"),
      `SPORE-HW-001 must not fire for cpu target`,
    );
  });

  it("SPORE_HW_001 constant has correct metadata", () => {
    assert.equal(SPORE_HW_001.code, "SPORE-HW-001");
    assert.equal(SPORE_HW_001.severity, "error");
    assert.equal(SPORE_HW_001.name, "QuantumTargetRequiresFormalProof");
  });
});

// ---------------------------------------------------------------------------
// 11. NPU target without audit.write → SPORE-HW-002
// ---------------------------------------------------------------------------

describe("Denial #11 — SPORE-HW-002: NPU target without audit.write", () => {
  it("flow with hardware { target npu } but no audit.write warns with SPORE-HW-002", () => {
    const src = [
      "secure flow inference(n: Int) -> Bool",
      "contract { effects { telemetry.read } hardware { target npu fallback cpu } }",
      "{ return true }",
    ].join("\n");

    const codes = governanceCodes(src);
    assert.ok(
      codes.includes("SPORE-HW-002"),
      `Expected SPORE-HW-002 for npu without audit.write, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_HW_002 constant has correct metadata", () => {
    assert.equal(SPORE_HW_002.code, "SPORE-HW-002");
    assert.equal(SPORE_HW_002.severity, "warning");
    assert.equal(SPORE_HW_002.name, "SealedTargetRequiresAuditTrace");
  });
});

// ---------------------------------------------------------------------------
// 12. Protected value used without gate → SPORE-VALUESTATE-006
// ---------------------------------------------------------------------------

describe("Denial #12 — SPORE-VALUESTATE-006: Protected value assigned to plain binding", () => {
  it("protect() value assigned to a plain typed binding is denied", () => {
    const src = `
flow storeEmail(raw: String) -> String {
  let email: Email = protect(raw)
  return email
}
`;

    const codes = valueStateCodes(src);
    assert.ok(
      codes.includes("SPORE-VALUESTATE-006"),
      `Expected SPORE-VALUESTATE-006 for protect() at plain binding, got: [${codes.join(", ")}]`,
    );
  });

  it("protect() value allowed when binding declares 'protected' qualifier", () => {
    const src = `
flow storeEmail(raw: String) -> String {
  let email: protected Email = protect(raw)
  return "ok"
}
`;
    const codes = valueStateCodes(src);
    assert.ok(
      !codes.includes("SPORE-VALUESTATE-006"),
      `SPORE-VALUESTATE-006 must not fire when binding is declared protected`,
    );
  });

  it("SPORE_VALUESTATE_006 constant has code SPORE-VALUESTATE-006 and severity error", () => {
    assert.equal(SPORE_VALUESTATE_006.code, "SPORE-VALUESTATE-006");
    assert.equal(SPORE_VALUESTATE_006.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// 13. Network call to undeclared effect → SPORE-EFFECT-001
//     (compile-time proxy for the runtime SPORE-NET-001 path)
// ---------------------------------------------------------------------------

describe("Denial #13 — SPORE-EFFECT-001: Network call without network.outbound declared", () => {
  it("http.get in a guarded flow with no network.outbound declared emits SPORE-EFFECT-001", () => {
    const src = `
guarded flow fetchData(url: String) -> String
  contract { effects {  } }
{
  let result: String = http.get(url)
  return result
}
`;
    const codes = effectCodes(src);
    assert.ok(
      codes.includes("SPORE-EFFECT-001"),
      `Expected SPORE-EFFECT-001 for http.get without network.outbound, got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_NET_001 constant has code SPORE-NET-001, name NetworkDestinationDenied, severity error", () => {
    // Verify the constant shape that runtime enforcement relies on
    assert.equal(SPORE_NET_001.code, "SPORE-NET-001");
    assert.equal(SPORE_NET_001.name, "NetworkDestinationDenied");
    assert.equal(SPORE_NET_001.severity, "error");
    assert.ok(
      typeof SPORE_NET_001.suggestedFix === "string" && SPORE_NET_001.suggestedFix.length > 0,
      "SPORE_NET_001.suggestedFix must be a non-empty string",
    );
  });
});

// ---------------------------------------------------------------------------
// 14. Effect used without declaration → SPORE-EFFECT-001 (secret.read path)
// ---------------------------------------------------------------------------

describe("Denial #14 — SPORE-EFFECT-001: secret.read used without declaration", () => {
  it("Env.get() in a guarded flow without secret.read emits SPORE-EFFECT-001", () => {
    const src = `
guarded flow loadKey(name: String) -> Result<String, Error>
  contract { effects {  } }
{
  return Env.get(name)
}
`;
    const codes = effectCodes(src);
    assert.ok(
      codes.includes("SPORE-EFFECT-001"),
      `Expected SPORE-EFFECT-001 for Env.get without secret.read, got: [${codes.join(", ")}]`,
    );
  });

  it("Env.get() is allowed when secret.read is declared", () => {
    const src = `
guarded flow loadKey(name: String) -> Result<String, Error>
  contract { effects { secret.read } }
{
  return Env.get(name)
}
`;
    const codes = effectCodes(src);
    assert.ok(
      !codes.includes("SPORE-EFFECT-001"),
      `SPORE-EFFECT-001 must not fire when secret.read is declared`,
    );
  });
});

// ---------------------------------------------------------------------------
// 15. Source escape attempt: eval() in a flow body → SPORE-SOURCE-ESCAPE-001
// ---------------------------------------------------------------------------

describe("Denial #15 — SPORE-SOURCE-ESCAPE-001: eval() source escape attempt", () => {
  it("flow calling eval() with dynamic input is denied", () => {
    const src = `
flow executeCode(code: String) -> String {
  let result: String = eval(code)
  return result
}
`;
    const codes = escapeCodes(src);
    assert.ok(
      codes.includes("SPORE-SOURCE-ESCAPE-001"),
      `Expected SPORE-SOURCE-ESCAPE-001 for eval(), got: [${codes.join(", ")}]`,
    );
  });

  it("flow calling DynamicCode.load() is also denied", () => {
    const src = `
flow loadPlugin(path: String) -> String {
  let m: String = DynamicCode.load(path)
  return m
}
`;
    const codes = escapeCodes(src);
    assert.ok(
      codes.includes("SPORE-SOURCE-ESCAPE-001"),
      `Expected SPORE-SOURCE-ESCAPE-001 for DynamicCode.load(), got: [${codes.join(", ")}]`,
    );
  });

  it("SPORE_SOURCE_ESCAPE_001 constant has correct metadata", () => {
    assert.equal(SPORE_SOURCE_ESCAPE_001.code, "SPORE-SOURCE-ESCAPE-001");
    assert.equal(SPORE_SOURCE_ESCAPE_001.severity, "error");
    assert.ok(
      typeof SPORE_SOURCE_ESCAPE_001.why === "string" && SPORE_SOURCE_ESCAPE_001.why.length > 0,
      "SPORE_SOURCE_ESCAPE_001.why must be a non-empty string",
    );
  });
});

// ---------------------------------------------------------------------------
// Bonus denial #16: protected value passed to AuditLog.write without redact()
//   Also fires as SPORE-VALUESTATE-006 (distinct from SPORE-VALUESTATE-003)
// ---------------------------------------------------------------------------

describe("Denial #16 — SPORE-VALUESTATE-006: Protected value at AuditLog.write without redact()", () => {
  it("protected Email at AuditLog.write without redact() is denied", () => {
    const src = `
secure flow logSignup(rawEmail: String) -> Result<String, Error>
contract { effects { audit.write } }
{
  let email: protected Email = validate.email(rawEmail)?
  AuditLog.write(email)
  return Ok("logged")
}
`;
    const codes = valueStateCodes(src);
    assert.ok(
      codes.includes("SPORE-VALUESTATE-006"),
      `Expected SPORE-VALUESTATE-006 for protected Email at AuditLog.write without redact(), got: [${codes.join(", ")}]`,
    );
  });

  it("protected Email wrapped in redact() at AuditLog.write is allowed", () => {
    const src = `
secure flow logSignup(rawEmail: String) -> Result<String, Error>
contract { effects { audit.write } }
{
  let email: protected Email = validate.email(rawEmail)?
  AuditLog.write(redact(email))
  return Ok("logged")
}
`;
    const codes = valueStateCodes(src);
    assert.ok(
      !codes.includes("SPORE-VALUESTATE-006"),
      `SPORE-VALUESTATE-006 must not fire when protected value is redacted before AuditLog.write`,
    );
  });
});
