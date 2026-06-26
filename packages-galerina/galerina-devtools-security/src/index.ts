// =============================================================================
// @galerina/devtools-security — Public API
// =============================================================================

// Core audit runner
export { runSecurityAudit, type SecurityAuditReport, type SecurityFinding, type SecuritySeverity, type SecurityAuditOptions } from "./audit-runner.js";

// Path sandbox
export { checkPathSandbox, isPathEscape, PATH_SANDBOX_TEST_VECTORS, type PathCheckResult } from "./path-sandbox.js";

// Regex ReDoS guard
export { validateRegexPattern, safeCompileRegex, REDOS_TEST_VECTORS, type RegexValidationResult } from "./regex-guard.js";

// Secret / credential detection
export { checkKeyValueForSecret, checkMetadataForSecrets, redactMetadata, type SecretCheckResult } from "./secret-checker.js";

// Risk calculator
export { assessRisk, formatRiskAssessment, DataClassification, type RiskProfile, type RiskAssessment } from "./risk-calculator.js";

// Test helpers
export { SecurityTestHelper, createStrictHelper, createAerospaceHelper } from "./test-helpers.js";

/** Package version — used for audit report metadata. */
export const DEVTOOLS_SECURITY_VERSION = "0.1.0";
