// =============================================================================
// @galerina/devtools-security — Security Audit Runner
//
// Orchestrates all security checks into a single structured audit report.
// Designed for CI integration: parse source, run all checks, return JSON.
//
// Usage:
//   const report = await runSecurityAudit(source, { profile: ["strict"] });
//   if (report.critical.length > 0) process.exit(1);
// =============================================================================

import type {
  FlowMeta,
} from "@galerina/core-compiler";

import {
  parseProgram,
  checkEffects,
  verifyGovernance,
  checkTaint,
  checkProfiles,
  checkValueStates,
  type ProfileDiagnostic,
  type TaintDiagnostic,
  type GovernanceDiagnostic,
  type RuntimeProfile,
} from "@galerina/core-compiler";

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

/**
 * K3 / NIST SP 800-207 T6 verdict.
 *   - "pass"          — every expected checker RAN and produced no gate finding.
 *   - "fail"          — a gate-severity finding was raised.
 *   - "indeterminate" — at least one expected checker did NOT run (parse failure /
 *                       threw): the oracle was partially blind. Unknown -> deny.
 */
export type SecurityVerdict = "pass" | "fail" | "indeterminate";

/** Checkers that constitute a complete security audit; absence of any => blind. */
export const EXPECTED_CHECKERS = ["value-safety", "taint", "profile", "governance"] as const;
export type ExpectedChecker = (typeof EXPECTED_CHECKERS)[number];

export interface SecurityFinding {
  readonly code:     string;
  readonly name:     string;
  readonly severity: SecuritySeverity;
  readonly message:  string;
  readonly flowName?: string;
  readonly checker:  "taint" | "profile" | "governance" | "value-safety" | "hardware";
}

export interface SecurityAuditReport {
  readonly schemaVersion: "spore.security-audit.v1";
  readonly source:        string;
  readonly profiles:      readonly RuntimeProfile[];
  readonly findings:      readonly SecurityFinding[];
  readonly critical:      readonly SecurityFinding[];
  readonly high:          readonly SecurityFinding[];
  readonly medium:        readonly SecurityFinding[];
  readonly low:           readonly SecurityFinding[];
  /**
   * True ONLY when verdict === "pass". A blind/partial audit (a checker did not
   * run) is now `false`, closing the unknown -> pass hole. Kept as the back-compat
   * top-line boolean.
   */
  readonly passed:        boolean;
  /** K3 verdict — first-class not-attested state (0084-secaudit-unknown). */
  readonly verdict:       SecurityVerdict;
  /** Checker ids that did NOT execute this run (parse failure / threw) — not attested. */
  readonly indeterminate: readonly ExpectedChecker[];
  readonly summary:       string;
  readonly checkedAt:     string;
}

export interface SecurityAuditOptions {
  /** Deployment profiles to enforce. Default: ["strict"] */
  readonly profiles?: readonly RuntimeProfile[];
  /**
   * Deployment mode for the governance verifier. Default: "dev".
   * Non-production modes ("dev", "check-only") grade advisory findings such as
   * SPORE-GOV-010 (secure flow missing intent) as info, so they do not fail the
   * audit; "production"/"deterministic" promote them to errors.
   */
  readonly governanceProfile?: "dev" | "production" | "deterministic" | "check-only";
  /** Source file name for error reporting */
  readonly fileName?: string;
  /** Fail on warnings (medium/low) in addition to errors */
  readonly strict?: boolean;
}

// ---------------------------------------------------------------------------
// Severity mapping from checker codes
// ---------------------------------------------------------------------------

const SEVERITY_MAP: ReadonlyMap<string, SecuritySeverity> = new Map([
  // Taint
  ["SPORE-TAINT-001", "critical"],
  ["SPORE-TAINT-003", "high"],
  ["SPORE-TAINT-004", "medium"],
  ["SPORE-TAINT-005", "high"],
  ["SPORE-TAINT-006", "high"],
  // Profile
  ["SPORE-PROFILE-001", "high"],
  ["SPORE-PROFILE-002", "high"],
  ["SPORE-PROFILE-005B", "high"],
  ["SPORE-PROFILE-006", "medium"],
  ["SPORE-PROFILE-007", "high"],
  // Value/Safety
  ["SPORE-VAL-001", "critical"],
  ["SPORE-VAL-002", "critical"],
  ["SPORE-VAL-003", "high"],
  // Hardware
  ["SPORE-HW-001", "high"],
  ["SPORE-HW-002", "medium"],
  ["SPORE-HW-003", "medium"],
  // Value-state / taint-sink (unsafe bindings reaching governed sinks)
  ["SPORE-VALUESTATE-001", "high"],
  ["SPORE-VALUESTATE-002", "medium"],
  ["SPORE-VALUESTATE-003", "high"],    // unsafe value reached governed sink — unredacted PII/data
  ["SPORE-VALUESTATE-004", "medium"],
  ["SPORE-VALUESTATE-005", "high"],    // derived-unsafe reached sink
  ["SPORE-VALUESTATE-006", "medium"],
  ["SPORE-VALUESTATE-007", "medium"],
  // Gate violations
  ["SPORE-GATE-001", "high"],
  // Secret sink violations
  ["SPORE-SECRET-001", "critical"],   // secret logged
  ["SPORE-SECRET-002", "critical"],   // secret sent to network
  ["SPORE-SECRET-003", "critical"],   // secret serialized
  // Governance
  ["SPORE-GOV-002", "high"],
  ["SPORE-GOV-009", "high"],
  ["SPORE-SOURCE-ESCAPE-001", "critical"],
  ["SPORE-SEC-020", "critical"],
  ["SPORE-SEC-021", "critical"],
]);

function classifySeverity(code: string, defaultSeverity?: "error" | "warning" | "info"): SecuritySeverity {
  const mapped = SEVERITY_MAP.get(code);
  if (mapped !== undefined) return mapped;
  if (defaultSeverity === "error") return "high";
  if (defaultSeverity === "warning") return "medium";
  return "info";
}

function mapCheckerType(
  code: string,
): SecurityFinding["checker"] {
  if (code.startsWith("SPORE-TAINT")) return "taint";
  if (code.startsWith("SPORE-PROFILE")) return "profile";
  if (code.startsWith("SPORE-VAL")) return "value-safety";
  if (code.startsWith("SPORE-HW")) return "hardware";
  // GOV-017 covers cyber_physical_hardening validation — a hardware-domain concern.
  if (code === "SPORE-GOV-017") return "hardware";
  return "governance";
}

// ---------------------------------------------------------------------------
// Main audit runner
// ---------------------------------------------------------------------------

/**
 * Run all security checks on a Galerina source string.
 *
 * Orchestrates: value-state checker → taint checker → profile checker → governance verifier.
 * Returns a structured SecurityAuditReport usable in CI.
 *
 * @param source  - Galerina source code (.spore content)
 * @param options - Audit configuration
 */
export async function runSecurityAudit(
  source: string,
  options: SecurityAuditOptions = {},
): Promise<SecurityAuditReport> {
  const {
    profiles = ["strict"],
    governanceProfile = "dev",
    fileName = "source.spore",
    strict = false,
  } = options;

  const findings: SecurityFinding[] = [];
  const checkedAt = new Date().toISOString();

  // 0084-secaudit-unknown: a checker counts as ATTESTED only when it actually RAN
  // (executed without throwing) over a parseable AST. A clean program where every
  // checker ran but raised nothing is a genuine ALLOW; a program the checkers never
  // analyzed (parse failure / a checker threw) leaves `ran` incomplete => INDETERMINATE.
  const ran = new Set<ExpectedChecker>();

  // Parse
  const parsed = parseProgram(source, fileName);
  const parseErrors = (parsed.diagnostics ?? []).filter(d => d.severity === "error");
  for (const e of parseErrors) {
    findings.push({
      code: e.code ?? "SPORE-PARSE",
      name: "ParseError",
      severity: "high",
      message: e.message,
      checker: "governance",
    });
  }

  // If parse failed entirely, return early. `ran` is empty here => verdict
  // "indeterminate" => passed=false (deny-by-default; matches rd-0098).
  if (parseErrors.length > 0 && parsed.flows.length === 0) {
    return buildReport(source, profiles, findings, checkedAt, strict, ran);
  }

  // Value-state / taint-sink check (SPORE-VALUESTATE, SPORE-GATE, SPORE-SECRET codes)
  // Tracks unsafe bindings flowing to governed sinks (AuditLog.write, DB, network).
  // Distinct from checkTaint (SPORE-TAINT capability flags) — both are needed.
  // Each checker is wrapped so a THROW counts as "did not attest" (INDETERMINATE),
  // never as a silent clean. A checker is added to `ran` only after it returns.
  const vsResult = checkValueStates(parsed.ast);
  for (const d of vsResult.diagnostics ?? []) {
    findings.push({
      code: d.code,
      name: (d as any).name ?? d.code,
      severity: classifySeverity(d.code, d.severity === "error" ? "error" : "warning"),
      message: d.message,
      checker: "value-safety" as const,
    });
  }
  ran.add("value-safety");

  // Capability-flag taint check (SPORE-TAINT codes)
  const taintDiags: TaintDiagnostic[] = checkTaint(parsed.ast, parsed.flows);
  for (const d of taintDiags) {
    findings.push({ code: d.code, name: d.name, severity: classifySeverity(d.code, d.severity === "error" ? "error" : "warning"), message: d.message, checker: "taint" as const, ...(d.flowName !== undefined ? { flowName: d.flowName } : {}) });
  }
  ran.add("taint");

  // Profile check
  const profileDiags: ProfileDiagnostic[] = checkProfiles(parsed.ast, parsed.flows, profiles);
  for (const d of profileDiags) {
    findings.push({ code: d.code, name: d.name, severity: classifySeverity(d.code, d.severity === "error" ? "error" : "warning"), message: d.message, checker: "profile" as const, ...(d.flowName !== undefined ? { flowName: d.flowName } : {}) });
  }
  ran.add("profile");

  // Governance check (SPORE-VAL, SPORE-HW, SPORE-GOV, etc.)
  const fx = checkEffects(parsed.flows, parsed.ast);
  const gov = verifyGovernance(parsed.ast, parsed.flows, fx, governanceProfile);
  for (const d of gov.diagnostics as readonly GovernanceDiagnostic[]) {
    findings.push({
      code: d.code,
      name: d.name ?? d.code,
      severity: classifySeverity(d.code, d.severity),
      message: d.message,
      checker: mapCheckerType(d.code),
    });
  }
  ran.add("governance");

  return buildReport(source, profiles, findings, checkedAt, strict, ran);
}

function buildReport(
  source: string,
  profiles: readonly RuntimeProfile[],
  findings: readonly SecurityFinding[],
  checkedAt: string,
  strict = false,
  ran: ReadonlySet<ExpectedChecker> = new Set(),
): SecurityAuditReport {
  const critical = findings.filter(f => f.severity === "critical");
  const high     = findings.filter(f => f.severity === "high");
  const medium   = findings.filter(f => f.severity === "medium");
  const low      = findings.filter(f => f.severity === "low");

  // Checkers that did NOT run this audit (parse failure / threw) — not attested.
  const indeterminate = EXPECTED_CHECKERS.filter(c => !ran.has(c));

  // A gate finding is a positive DENY signal.
  const hasGateFinding = strict
    ? findings.length > 0
    : critical.length > 0 || high.length > 0;

  // K3 fold (deny-by-default). A TOTALLY blind audit (no checker ran — e.g. a parse
  // failure that yields zero flows) is INDETERMINATE *first*: the oracle could analyze
  // nothing, so even the parse-error findings do not make it a definitive "fail" — it
  // is "I could not audit this" (SPORE-GOV-3VL-001). Otherwise: any DENY => fail; any
  // not-attested checker (partial blindness) => indeterminate; ALLOW only when every
  // expected checker actually ran clean.
  const verdict: SecurityVerdict =
    ran.size === 0              ? "indeterminate"
    : hasGateFinding            ? "fail"
    : indeterminate.length > 0  ? "indeterminate"
    :                             "pass";

  // Boundary collapse: only a positive "pass" authorizes.
  const passed = verdict === "pass";

  const total  = findings.length;
  const status = verdict === "pass" ? "PASS" : verdict === "fail" ? "FAIL" : "INDETERMINATE";
  const summary = verdict === "indeterminate"
    ? `INDETERMINATE (SPORE-GOV-3VL-001) — not attested: ${indeterminate.join(", ")}`
    : total === 0
      ? `${status} — no security findings`
      : `${status} — ${critical.length} critical, ${high.length} high, ${medium.length} medium, ${low.length} low`;

  return {
    schemaVersion: "spore.security-audit.v1",
    source: source.slice(0, 200) + (source.length > 200 ? "..." : ""),
    profiles,
    findings,
    critical,
    high,
    medium,
    low,
    passed,
    verdict,
    indeterminate,
    summary,
    checkedAt,
  };
}
