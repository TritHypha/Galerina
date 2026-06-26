// =============================================================================
// @galerina/devtools-naming — Public API
// =============================================================================

// Core naming checker (low-level AST-based API)
export {
  checkNaming,
  type NamingDiagnostic,
  type NamingDiagnosticCode,
  type NamingCheckResult,
  type NamingCheckOptions,
} from "./naming-checker.js";

// High-level runner (parse + check + report)
export {
  runNamingAudit,
  type NamingAuditReport,
  type NamingRunnerOptions,
} from "./naming-runner.js";

/** Package version — used for audit report metadata. */
export const DEVTOOLS_NAMING_VERSION = "0.1.0";
