// =============================================================================
// @galerina/devtools-security — Security Test Helpers
//
// Utilities for writing security tests in Galerina projects.
// Import in your test files to get fluent security assertion APIs.
//
// Usage:
//   import { SecurityTestHelper } from "@galerina/devtools-security";
//   const s = new SecurityTestHelper();
//   await s.assertBlocked(source, "SPORE-TAINT-001");
//   await s.assertAllowed(source);
// =============================================================================

import { runSecurityAudit, type SecurityAuditOptions, type SecurityFinding } from "./audit-runner.js";
import { checkPathSandbox, type PathCheckResult } from "./path-sandbox.js";
import { validateRegexPattern, type RegexValidationResult } from "./regex-guard.js";
import { checkMetadataForSecrets, type SecretCheckResult } from "./secret-checker.js";

export interface SecurityAssertionResult {
  readonly passed: boolean;
  readonly message: string;
  readonly findings: readonly SecurityFinding[];
}

export class SecurityTestHelper {
  private defaultOptions: SecurityAuditOptions;

  constructor(defaultOptions: SecurityAuditOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /** Assert that source triggers a specific diagnostic code. */
  async assertBlocked(
    source: string,
    expectedCode: string,
    options?: SecurityAuditOptions,
  ): Promise<SecurityAssertionResult> {
    const report = await runSecurityAudit(source, { ...this.defaultOptions, ...options });
    const found = report.findings.some(f => f.code === expectedCode);
    return {
      passed:   found,
      message:  found
        ? `✓ ${expectedCode} fired as expected`
        : `✗ Expected ${expectedCode} but got: [${report.findings.map(f => f.code).join(", ")}]`,
      findings: report.findings,
    };
  }

  /** Assert that source triggers NO security findings (clean). */
  async assertAllowed(
    source: string,
    options?: SecurityAuditOptions,
  ): Promise<SecurityAssertionResult> {
    const report = await runSecurityAudit(source, { ...this.defaultOptions, ...options, strict: false });
    return {
      passed:   report.critical.length === 0 && report.high.length === 0,
      message:  report.passed
        ? `✓ No critical/high findings`
        : `✗ Found: [${[...report.critical, ...report.high].map(f => f.code).join(", ")}]`,
      findings: report.findings,
    };
  }

  /** Assert that a path is safely confined within the root. */
  assertPathSafe(fsRoot: string, userPath: string): PathCheckResult & { passed: boolean } {
    const result = checkPathSandbox(fsRoot, userPath);
    return { ...result, passed: result.allowed };
  }

  /** Assert that a path escapes the sandbox (for negative testing). */
  assertPathBlocked(fsRoot: string, userPath: string): PathCheckResult & { passed: boolean } {
    const result = checkPathSandbox(fsRoot, userPath);
    return { ...result, passed: !result.allowed };
  }

  /** Assert that a regex pattern is safe (no ReDoS risk). */
  assertRegexSafe(pattern: string): RegexValidationResult & { passed: boolean } {
    const result = validateRegexPattern(pattern);
    return { ...result, passed: result.safe };
  }

  /** Assert that a regex pattern is detected as dangerous. */
  assertRegexDangerous(pattern: string): RegexValidationResult & { passed: boolean } {
    const result = validateRegexPattern(pattern);
    return { ...result, passed: !result.safe };
  }

  /** Assert that metadata is free of credential leaks. */
  assertMetadataClean(metadata: Record<string, string>): SecretCheckResult & { passed: boolean } {
    const result = checkMetadataForSecrets(metadata);
    return { ...result, passed: result.clean };
  }

  /** Assert that metadata contains a potential secret (for negative testing). */
  assertMetadataHasSecret(metadata: Record<string, string>): SecretCheckResult & { passed: boolean } {
    const result = checkMetadataForSecrets(metadata);
    return { ...result, passed: !result.clean };
  }

  /** Run a full audit and return the structured report. */
  async audit(source: string, options?: SecurityAuditOptions) {
    return runSecurityAudit(source, { ...this.defaultOptions, ...options });
  }
}

/** Create a pre-configured helper with strict profile defaults. */
export function createStrictHelper(): SecurityTestHelper {
  return new SecurityTestHelper({ profiles: ["strict"], governanceProfile: "production" });
}

/** Create a helper for aerospace (strict + high_integrity). */
export function createAerospaceHelper(): SecurityTestHelper {
  return new SecurityTestHelper({
    profiles: ["strict", "high_integrity"],
    governanceProfile: "deterministic",
  });
}
