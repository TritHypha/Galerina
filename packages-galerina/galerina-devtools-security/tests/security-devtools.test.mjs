/**
 * @galerina/devtools-security — Integration Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runSecurityAudit,
  checkPathSandbox, isPathEscape, PATH_SANDBOX_TEST_VECTORS,
  validateRegexPattern, REDOS_TEST_VECTORS,
  checkKeyValueForSecret, checkMetadataForSecrets, redactMetadata,
  assessRisk, DataClassification,
  SecurityTestHelper, createStrictHelper, createAerospaceHelper,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Path sandbox
// ---------------------------------------------------------------------------

describe("path-sandbox: segment-safe confinement", () => {
  it("runs all standard test vectors", () => {
    for (const v of PATH_SANDBOX_TEST_VECTORS) {
      const blocked = isPathEscape("/app", v.path);
      assert.equal(blocked, v.expectBlocked, `${v.label}: expected blocked=${v.expectBlocked}, got ${blocked}`);
    }
  });

  it("allows normal nested path", () => {
    assert.equal(checkPathSandbox("/app/root", "a/b/c.txt").allowed, true);
  });

  it("blocks sibling-prefix bypass (the key audit finding)", () => {
    // /app/root2 when root = /app/root was the critical startsWith bypass
    assert.equal(isPathEscape("/app/root", "/app/root2/evil"), true);
    assert.equal(isPathEscape("/app/root", "/app/rootother"), true);
  });

  it("blocks .. traversal", () => {
    assert.equal(isPathEscape("/app", "../etc/passwd"), true);
  });

  it("blocks absolute path outside root", () => {
    assert.equal(isPathEscape("/app", "/etc/shadow"), true);
  });
});

// ---------------------------------------------------------------------------
// Regex ReDoS guard
// ---------------------------------------------------------------------------

describe("regex-guard: ReDoS prevention", () => {
  it("runs all standard test vectors", () => {
    for (const v of REDOS_TEST_VECTORS) {
      const result = validateRegexPattern(v.pattern);
      assert.equal(result.safe, v.expectSafe, `${v.label}: expected safe=${v.expectSafe}`);
    }
  });

  it("allows normal safe patterns", () => {
    assert.ok(validateRegexPattern("^[a-z0-9]+$").safe);
    assert.ok(validateRegexPattern("\\d{3}-\\d{4}").safe);
  });

  it("rejects oversized patterns", () => {
    assert.ok(!validateRegexPattern("a".repeat(600)).safe);
  });

  it("rejects nested quantifier catastrophic patterns", () => {
    assert.ok(!validateRegexPattern("(a+)+b").safe);
    assert.ok(!validateRegexPattern("(a*)*").safe);
  });
});

// ---------------------------------------------------------------------------
// Secret checker
// ---------------------------------------------------------------------------

describe("secret-checker: credential detection", () => {
  it("detects sensitive key names", () => {
    assert.ok(!checkKeyValueForSecret("password", "anything").clean);
    assert.ok(!checkKeyValueForSecret("api_key", "anything").clean);
    assert.ok(!checkKeyValueForSecret("Authorization", "anything").clean);
  });

  it("detects JWT values", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    assert.ok(!checkKeyValueForSecret("token_value", jwt).clean);
  });

  it("detects OpenAI-style keys", () => {
    assert.ok(!checkKeyValueForSecret("config", "sk-abcdefghijklmnopqrstu").clean);
  });

  it("detects Bearer auth header values", () => {
    assert.ok(!checkKeyValueForSecret("auth_header", "Bearer eyJhbGciOiJSUzI1NiJ9.abc").clean);
  });

  it("allows safe metadata", () => {
    assert.ok(checkMetadataForSecrets({ event: "Login", userId: "user_123", status: "ok" }).clean);
  });

  it("redactMetadata replaces secrets with [REDACTED]", () => {
    const out = redactMetadata({ event: "Login", password: "s3cr3t" });
    assert.equal(out["password"], "[REDACTED]");
    assert.equal(out["event"], "Login");
  });
});

// ---------------------------------------------------------------------------
// Risk calculator
// ---------------------------------------------------------------------------

describe("risk-calculator: breach cost model", () => {
  it("PII records at $160/record", () => {
    const a = assessRisk({
      classification: DataClassification.Customer_PII,
      recordCount: 1, breachProbability: 1.0,
      isMultiCloud: false, isUngovernedAI: false,
    });
    // 1 record × $160 × 1.0 probability × 0.79 GBP/USD = £126.40
    assert.ok(a.riskCostGbp > 100 && a.riskCostGbp < 200, `Expected ~£126, got £${a.riskCostGbp}`);
  });

  it("escalates to sealed proof when risk > £1000", () => {
    const a = assessRisk({
      classification: DataClassification.Customer_PII,
      recordCount: 10000, breachProbability: 0.01,
      isMultiCloud: false, isUngovernedAI: false,
    });
    assert.ok(a.proofLevel !== "standard", `risk £${a.riskCostGbp.toFixed(2)} should escalate`);
  });

  it("multi-cloud penalty inflates cost", () => {
    const base  = assessRisk({ classification: DataClassification.Customer_PII, recordCount: 100, breachProbability: 1.0, isMultiCloud: false, isUngovernedAI: false });
    const multi = assessRisk({ classification: DataClassification.Customer_PII, recordCount: 100, breachProbability: 1.0, isMultiCloud: true,  isUngovernedAI: false });
    assert.ok(multi.riskCostGbp > base.riskCostGbp, "multi-cloud must cost more");
  });
});

// ---------------------------------------------------------------------------
// SecurityAuditRunner
// ---------------------------------------------------------------------------

describe("SecurityAuditRunner: full pipeline", () => {
  it("passes a clean pure flow", async () => {
    const report = await runSecurityAudit(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      { profiles: ["strict"] }
    );
    assert.ok(report.passed, `Expected pass, got: ${report.summary}`);
  });

  it("catches SQL injection (SPORE-TAINT-001)", async () => {
    const report = await runSecurityAudit([
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let r: String = Database.query(req.body)  return r }",
    ].join("\n"), { profiles: ["strict"] });
    assert.ok(report.findings.some(f => f.code === "SPORE-TAINT-001"), `Expected SPORE-TAINT-001, got: ${report.summary}`);
    assert.ok(!report.passed, "should fail when injection is detected");
  });

  it("catches recursion in strict profile (SPORE-PROFILE-001)", async () => {
    const report = await runSecurityAudit(
      "pure flow fib(n: Int) -> Int contract { effects {} } { if n <= 1 { return n } return fib(n-1) + fib(n-2) }",
      { profiles: ["strict"] }
    );
    assert.ok(report.findings.some(f => f.code === "SPORE-PROFILE-001"));
    assert.ok(!report.passed);
  });

  it("catches dynamic regex in strict profile (SPORE-PROFILE-005B)", async () => {
    const report = await runSecurityAudit(
      "pure flow f(p: String, s: String) -> Bool contract { effects {} } { return s.matchesPattern(p) }",
      { profiles: ["strict"] }
    );
    assert.ok(report.findings.some(f => f.code === "SPORE-PROFILE-005B"));
  });

  it("schemaVersion is spore.security-audit.v1", async () => {
    const report = await runSecurityAudit("pure flow f() -> Int contract { effects {} } { return 1 }", {});
    assert.equal(report.schemaVersion, "spore.security-audit.v1");
  });

  it("invalid cyber_physical_hardening value → SPORE-GOV-017 (hardware checker)", async () => {
    // enclosure_shielding with an unrecognised tier should fire SPORE-GOV-017 as an error.
    const src = [
      `secure flow hardenedFlow(x: Int) -> Int`,
      `contract {`,
      `  intent { "High-risk financial transaction requiring physical hardening." }`,
      `  effects { audit.write }`,
      `  economics { max_risk_liability "50000" }`,
      `  cyber_physical_hardening { enclosure_shielding supershield  on_tamper_signal zeroize }`,
      `}`,
      `{ return x }`,
    ].join("\n");
    const report = await runSecurityAudit(src, { governanceProfile: "production" });
    const gov017 = report.findings.find(f => f.code === "SPORE-GOV-017");
    assert.ok(gov017 !== undefined, `Expected SPORE-GOV-017 in findings. Got: ${report.findings.map(f => f.code).join(", ")}`);
    assert.equal(gov017.checker, "hardware", `GOV-017 checker should be 'hardware', got '${gov017.checker}'`);
  });

  it("manual liability {} block → SPORE-GOV-018 (governance checker)", async () => {
    // Manually declaring liability {} should trigger SPORE-GOV-018 as a warning.
    const src = [
      `secure flow liableFlow(x: Int) -> Int`,
      `contract {`,
      `  intent { "Payment flow with manually declared liability." }`,
      `  effects { audit.write }`,
      `  liability { max_exposure 10000 }`,
      `}`,
      `{ return x }`,
    ].join("\n");
    const report = await runSecurityAudit(src, { governanceProfile: "production" });
    const gov018 = report.findings.find(f => f.code === "SPORE-GOV-018");
    assert.ok(gov018 !== undefined, `Expected SPORE-GOV-018 in findings. Got: ${report.findings.map(f => f.code).join(", ")}`);
    assert.equal(gov018.checker, "governance", `GOV-018 checker should be 'governance', got '${gov018.checker}'`);
    assert.equal(gov018.severity, "medium", `GOV-018 is a warning → medium severity, got '${gov018.severity}'`);
  });
});

// ---------------------------------------------------------------------------
// SecurityTestHelper
// ---------------------------------------------------------------------------

describe("SecurityTestHelper: fluent API", () => {
  const h = createStrictHelper();

  it("assertBlocked: detects SQL injection", async () => {
    const result = await h.assertBlocked(
      ["secure flow q(req: Request) -> Response contract { effects { database.read } }",
       "{ let r: String = Database.query(req.body)  return r }"].join("\n"),
      "SPORE-TAINT-001"
    );
    assert.ok(result.passed, result.message);
  });

  it("assertAllowed: clean flow passes", async () => {
    const result = await h.assertAllowed(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }"
    );
    assert.ok(result.passed, result.message);
  });

  it("assertPathSafe: normal path allowed", () => {
    const result = h.assertPathSafe("/app/root", "subdir/file.txt");
    assert.ok(result.passed);
  });

  it("assertPathBlocked: traversal blocked", () => {
    const result = h.assertPathBlocked("/app/root", "../etc/passwd");
    assert.ok(result.passed);
  });

  it("assertRegexSafe: normal pattern", () => {
    assert.ok(h.assertRegexSafe("^[a-z]+$").passed);
  });

  it("assertRegexDangerous: catastrophic pattern", () => {
    assert.ok(h.assertRegexDangerous("(a+)+b").passed);
  });

  it("assertMetadataClean: safe data", () => {
    assert.ok(h.assertMetadataClean({ event: "login", user: "alice" }).passed);
  });

  it("assertMetadataHasSecret: JWT in value", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    assert.ok(h.assertMetadataHasSecret({ session: jwt }).passed);
  });

  it("createAerospaceHelper uses strict + high_integrity", () => {
    const helper = createAerospaceHelper();
    assert.ok(helper instanceof SecurityTestHelper);
  });
});
