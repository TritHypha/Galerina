/**
 * @galerina/devtools-naming — Integration Tests
 *
 * Tests the Zero-Ambiguity / Maximum-Semantics naming checker.
 * Covers all 5 diagnostic codes: SPORE-NAMING-001..005
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runNamingAudit } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helper: write a temp .spore file, run CLI, return output + exit code
// ---------------------------------------------------------------------------

function runCli(source, ...extraArgs) {
  const file = join(tmpdir(), `spore-naming-test-${Date.now()}-${Math.random().toString(36).slice(2)}.spore`);
  writeFileSync(file, source, "utf8");
  try {
    const result = spawnSync(
      process.execPath,
      ["dist/cli.js", "check", file, ...extraArgs],
      {
        cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
        encoding: "utf8",
        timeout: 10000,
      },
    );
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 1,
    };
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Test 1 — SPORE-NAMING-001: flow with abbreviated param `req: Request`
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-001: abbreviated param name", () => {
  it("flow with param 'req: Request' emits SPORE-NAMING-001", () => {
    const source = [
      "secure flow processUserRequest(req: Request) -> Response",
      "contract {",
      "  intent { \"Handle a user request.\" }",
      "  effects { network.outbound }",
      "}",
      "{ return Response.ok() }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(f => f.code === "SPORE-NAMING-001" && f.identifierName === "req");
    assert.ok(
      finding !== undefined,
      `Expected SPORE-NAMING-001 for 'req', got: ${JSON.stringify(report.findings.map(f => f.code + ":" + f.identifierName))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2 — SPORE-NAMING-001: flow named 'hashPwd' (let binding with abbrev name)
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-001: let binding with abbreviated name", () => {
  it("let err = ... emits SPORE-NAMING-001 for 'err'", () => {
    const source = [
      "pure flow parseUserInput(userInput: String) -> Result<String, ParseError>",
      "contract { effects {} }",
      "{",
      "  let err = ParseError.invalid",
      "  return Err(err)",
      "}",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(
      f => f.code === "SPORE-NAMING-001" && f.identifierName === "err",
    );
    assert.ok(
      finding !== undefined,
      `Expected SPORE-NAMING-001 for 'err', got: ${JSON.stringify(report.findings.map(f => `${f.code}:${f.identifierName}`))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Clean: param named 'errorMessage' should NOT trigger SPORE-NAMING-001
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-001: fully-spelled param name is clean", () => {
  it("param 'errorMessage: String' produces no SPORE-NAMING-001", () => {
    const source = [
      "pure flow formatErrorMessage(errorMessage: String) -> String",
      "contract { effects {} }",
      "{ return errorMessage }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const naming001 = report.findings.filter(
      f => f.code === "SPORE-NAMING-001",
    );
    assert.equal(
      naming001.length,
      0,
      `Expected no SPORE-NAMING-001, got: ${JSON.stringify(naming001.map(f => f.identifierName))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 4 — SPORE-NAMING-005: secure flow missing intent block
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-005: secure flow missing intent", () => {
  it("secure flow with no contract intent block emits SPORE-NAMING-005", () => {
    const source = [
      "secure flow deleteUserAccount(userId: UserId) -> Result<Unit, AccountError>",
      "contract { effects { database.write audit.write } }",
      "{ return Ok(Unit) }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(f => f.code === "SPORE-NAMING-005");
    assert.ok(
      finding !== undefined,
      `Expected SPORE-NAMING-005, got: ${JSON.stringify(report.findings.map(f => f.code))}`,
    );
    assert.equal(finding.flowName, "deleteUserAccount");
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Clean flow: well-named secure flow with intent — 0 naming findings
// ---------------------------------------------------------------------------

describe("Clean: well-named secure flow with intent", () => {
  it("well-named governed flow produces no findings", () => {
    const source = [
      "secure flow verifyUserCredentials(userCredentials: Credentials) -> AuthResult",
      "contract {",
      "  intent { \"Verify user login credentials and return an auth result.\" }",
      "  effects { database.read }",
      "}",
      "{ return AuthResult.verified() }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    // Only check naming codes — we don't care if governance checker adds others
    const namingFindings = report.findings.filter(f => f.code.startsWith("SPORE-NAMING-"));
    assert.equal(
      namingFindings.length,
      0,
      `Expected 0 naming findings, got: ${JSON.stringify(namingFindings)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 6 — SPORE-NAMING-001: flow name 'hashPwd' — abbreviated via 'hash' name
// (tests that a short standalone flow name like 'hash' is caught)
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-001 + SPORE-NAMING-004: abbreviated identifiers in flow", () => {
  it("flow named 'hash' triggers SPORE-NAMING-004 (abbreviated flow name)", () => {
    const source = [
      "pure flow hash(inputValue: String) -> String",
      "contract { effects {} }",
      "{ return inputValue }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding004 = report.findings.find(f => f.code === "SPORE-NAMING-004");
    assert.ok(
      finding004 !== undefined,
      `Expected SPORE-NAMING-004 for 'hash', got: ${JSON.stringify(report.findings.map(f => f.code))}`,
    );
    assert.equal(finding004.flowName, "hash");
  });
});

// ---------------------------------------------------------------------------
// Test 6b — SPORE-NAMING-001: loop counter `mut i: Int = 0` should NOT trigger
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-001: loop counter exemption", () => {
  it("mut i: Int = 0 inside a while loop body produces no SPORE-NAMING-001 for 'i'", () => {
    const source = [
      "pure flow sumRange(limit: Int) -> Int",
      "contract { effects {} }",
      "{",
      "  mut i: Int = 0",
      "  mut total: Int = 0",
      "  while i < limit {",
      "    set total = total + i",
      "    set i = i + 1",
      "  }",
      "  return total",
      "}",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(
      f => f.code === "SPORE-NAMING-001" && f.identifierName === "i",
    );
    assert.equal(
      finding,
      undefined,
      `Expected no SPORE-NAMING-001 for loop counter 'i', got: ${JSON.stringify(report.findings.map(f => `${f.code}:${f.identifierName}`))}`,
    );
  });

  it("mut j: Int = 0 loop counter is also exempt from SPORE-NAMING-001", () => {
    const source = [
      "pure flow countDown(limit: Int) -> Int",
      "contract { effects {} }",
      "{",
      "  mut j: Int = limit",
      "  while j > 0 {",
      "    set j = j - 1",
      "  }",
      "  return j",
      "}",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(
      f => f.code === "SPORE-NAMING-001" && f.identifierName === "j",
    );
    assert.equal(
      finding,
      undefined,
      `Expected no SPORE-NAMING-001 for loop counter 'j', got: ${JSON.stringify(report.findings.map(f => `${f.code}:${f.identifierName}`))}`,
    );
  });

  it("let x: Float is exempt as geometry variable (no SPORE-NAMING-001)", () => {
    const source = [
      "pure flow computeDistance(x: Float, y: Float) -> Float",
      "contract { effects {} }",
      "{ return x + y }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const findings001 = report.findings.filter(
      f => f.code === "SPORE-NAMING-001" && (f.identifierName === "x" || f.identifierName === "y"),
    );
    assert.equal(
      findings001.length,
      0,
      `Expected no SPORE-NAMING-001 for geometry vars x/y, got: ${JSON.stringify(findings001.map(f => `${f.code}:${f.identifierName}`))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Parse error → exit code 3 (CLI test)
// ---------------------------------------------------------------------------

describe("CLI: parse error produces exit code 3", () => {
  it("malformed .spore produces exit code 3", () => {
    // Intentionally broken source — no valid flow keywords, pure lexer garbage
    // Parser produces 0 flows and errors, triggering exit code 3
    const source = "@@@ TOTALLY INVALID SOURCE @@@";
    const result = runCli(source);
    assert.equal(
      result.exitCode,
      3,
      `Expected exit code 3 for parse error, got: ${result.exitCode}\nstderr: ${result.stderr}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 8 — JSON output format
// ---------------------------------------------------------------------------

describe("CLI: --json output format", () => {
  it("--json flag produces valid JSON with schemaVersion spore.naming.v1", () => {
    const source = [
      "pure flow computeSum(firstNumber: Int, secondNumber: Int) -> Int",
      "contract { effects {} }",
      "{ return firstNumber + secondNumber }",
    ].join("\n");

    const result = runCli(source, "--json");
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (e) {
      assert.fail(`--json output was not valid JSON: ${result.stdout}\nError: ${e.message}`);
    }
    assert.equal(parsed.schemaVersion, "spore.naming.v1");
    assert.ok(Array.isArray(parsed.findings), "findings should be an array");
    assert.ok(typeof parsed.summary === "string", "summary should be a string");
    assert.ok(typeof parsed.passed === "boolean", "passed should be boolean");
  });
});

// ---------------------------------------------------------------------------
// Test 9 — SPORE-NAMING-002: implicit return type
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-002: implicit return type", () => {
  it("pure flow with void return type emits SPORE-NAMING-002", () => {
    const source = [
      "pure flow logMessage(message: String) -> void",
      "contract { effects {} }",
      "{ return }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(f => f.code === "SPORE-NAMING-002");
    assert.ok(
      finding !== undefined,
      `Expected SPORE-NAMING-002, got: ${JSON.stringify(report.findings.map(f => f.code))}`,
    );
    assert.equal(finding.flowName, "logMessage");
  });
});

// ---------------------------------------------------------------------------
// Test 10 — SPORE-NAMING-003: generic type param
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-003: generic type name in parameter", () => {
  it("param typed as 'Any' emits SPORE-NAMING-003", () => {
    const source = [
      "pure flow wrapValue(inputData: Any) -> WrappedValue",
      "contract { effects {} }",
      "{ return WrappedValue.of(inputData) }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(f => f.code === "SPORE-NAMING-003");
    assert.ok(
      finding !== undefined,
      `Expected SPORE-NAMING-003 for param typed Any, got: ${JSON.stringify(report.findings.map(f => f.code + ":" + f.identifierName))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 11 — SPORE-NAMING-005 not emitted when intent IS present
// ---------------------------------------------------------------------------

describe("SPORE-NAMING-005: not emitted when intent is present", () => {
  it("secure flow with contract intent { ... } produces no SPORE-NAMING-005", () => {
    const source = [
      "secure flow transferFunds(transferRequest: TransferRequest) -> TransferResult",
      "contract {",
      "  intent { \"Transfer funds between accounts after authorization.\" }",
      "  effects { database.write audit.write }",
      "}",
      "{ return TransferResult.success() }",
    ].join("\n");

    const report = runNamingAudit(source, { fileName: "test.spore" });
    const finding = report.findings.find(f => f.code === "SPORE-NAMING-005");
    assert.equal(
      finding,
      undefined,
      `Expected no SPORE-NAMING-005 when intent present, got: ${JSON.stringify(report.findings)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 12 — CLI: clean file exits with code 0
// ---------------------------------------------------------------------------

describe("CLI: clean file exits 0", () => {
  it("well-named flow exits with code 0", () => {
    const source = [
      "pure flow computeTotal(priceAmount: Decimal, taxRate: Decimal) -> Decimal",
      "contract { effects {} }",
      "{ return priceAmount + taxRate }",
    ].join("\n");

    const result = runCli(source);
    assert.equal(
      result.exitCode,
      0,
      `Expected exit 0 for clean file, got ${result.exitCode}\nstdout: ${result.stdout}`,
    );
  });
});
