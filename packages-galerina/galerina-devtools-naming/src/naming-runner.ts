// =============================================================================
// @galerina/devtools-naming — Naming Audit Runner
//
// Orchestrates: parse source → walk AST → run naming checks → return report.
// Designed for CI integration: parse, check, return JSON.
// =============================================================================

import { parseProgram } from "@galerina/core-compiler";
import {
  checkNaming,
  type NamingCheckResult,
  type NamingCheckOptions,
  type NamingDiagnostic,
} from "./naming-checker.js";

export type {
  NamingCheckResult,
  NamingCheckOptions,
  NamingDiagnostic,
  NamingDiagnosticCode,
} from "./naming-checker.js";

export interface NamingRunnerOptions extends NamingCheckOptions {
  /** Source file name for error reporting. */
  readonly fileName?: string;
}

export interface NamingAuditReport extends NamingCheckResult {
  readonly source: string;
  readonly parseErrors: number;
}

/**
 * Run all naming checks on a Galerina source string.
 *
 * Parses the source, then runs the naming checker over the AST.
 * Returns a structured NamingAuditReport usable in CI.
 *
 * @param source  - Galerina source code (.spore content)
 * @param options - Naming audit options
 */
export function runNamingAudit(
  source: string,
  options: NamingRunnerOptions = {},
): NamingAuditReport {
  const { fileName = "source.spore", strict = false } = options;

  // Parse
  const parsed = parseProgram(source, fileName);
  const parseErrorCount = (parsed.diagnostics ?? []).filter(
    (d) => d.severity === "error",
  ).length;

  if (parseErrorCount > 0 && parsed.flows.length === 0) {
    // Hard parse failure — no AST to walk
    return {
      schemaVersion: "spore.naming.v1",
      source: source.slice(0, 200) + (source.length > 200 ? "..." : ""),
      parseErrors: parseErrorCount,
      findings: [],
      passed: false,
      summary: `FAIL — ${parseErrorCount} parse error(s), naming check skipped`,
      checkedAt: new Date().toISOString(),
    };
  }

  const result = checkNaming(parsed.ast, parsed.flows, { strict, fileName });

  return {
    ...result,
    source: source.slice(0, 200) + (source.length > 200 ? "..." : ""),
    parseErrors: parseErrorCount,
  };
}
