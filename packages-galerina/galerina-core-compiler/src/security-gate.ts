// =============================================================================
// Galerina — the single authoritative production security gate
//
// RD-0234 / RD-0234b proved the compiler's "a green build is a guarantee" claim
// was false in two structural ways:
//   • dead gates — checkTaint (GNG-01), checkMonkeyPatching (Class A), and the
//     attribute-block escape hatch (Class D) had ZERO pipeline call sites, so
//     SQLi / runtime-patching / hidden-code files built clean AND signed; and
//   • boundary drift — governance verification ran only for `build --production`
//     in cli.ts (Class B: `build --deterministic` fell through and signed
//     violations), and the bundled galerina.mjs signing path ran an even thinner
//     set (no taint / monkey / attribute / source-escape / name-resolution).
//
// The fix is ONE gate, run by EVERY manifest-emitting path (all cli.ts build
// modes AND the bundled galerina.mjs), that executes the COMPLETE security /
// governance checker set at PRODUCTION strictness. A .lmanifest — an admission
// credential — is minted only when this gate is clean. Adding a new security
// checker here wires it into every signing path at once; the coverage-of-coverage
// test (RD-0234 L6-B2) asserts each PRODUCTION_BLOCKER code is caught HERE, so a
// gate can no longer silently un-wire.
//
// Note on symbol resolution (FUNGI-NAME-001): it is import-dependent and must run
// AFTER import merge, so it is intentionally NOT in this gate — each entry point
// runs gatherFileImports + resolveSymbols in its own pipeline. Everything here is
// import-safe (pattern / flow-local / already run by both CLIs).
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";
import { checkValueStates } from "./value-state-checker.js";
import { checkEffects } from "./effect-checker.js";
import { checkSourceEscapes } from "./source-escape-checker.js";
import { verifyGovernance } from "./governance-verifier.js";
import { checkTaint } from "./taint-checker.js";
import { checkMonkeyPatching, checkMonkeyPatchingSource } from "./monkey-patch-checker.js";
import { checkAttributeDirectives } from "./attribute-checker.js";

export interface GateDiagnostic {
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly flowName?: string;
}

/** A diagnostic as emitted by any of the underlying checkers (loosely typed). */
interface RawDiagnostic {
  readonly code?: string;
  readonly severity?: string;
  readonly message?: string;
  readonly flowName?: string;
  readonly line?: number;
  readonly column?: number;
  readonly location?: { readonly line?: number; readonly column?: number };
}

function normalize(d: RawDiagnostic, fallbackSeverity: GateDiagnostic["severity"] = "error"): GateDiagnostic {
  const sev = (d.severity as GateDiagnostic["severity"]) ?? fallbackSeverity;
  const line = d.location?.line ?? d.line;
  const column = d.location?.column ?? d.column;
  return {
    code: d.code ?? "",
    severity: sev === "error" || sev === "warning" || sev === "info" ? sev : "error",
    message: d.message ?? "",
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    ...(d.flowName !== undefined ? { flowName: d.flowName } : {}),
  };
}

/**
 * Run the COMPLETE security/governance checker set at production strictness.
 * Returns a flat, normalized diagnostic list. Callers refuse to sign when
 * `productionGateBlocks(result)` is true.
 *
 * @param ast       parsed program AST (imports already merged by the caller)
 * @param flows     flow metadata from parseProgram
 * @param source    the raw .fungi source text (for text-level monkey-patch scan)
 * @param filePath  the source path (for governance + diagnostics)
 */
export function runProductionSecurityGate(
  ast: AstNode,
  flows: readonly FlowMeta[],
  source: string,
  filePath: string,
): GateDiagnostic[] {
  const out: GateDiagnostic[] = [];

  // Source-level dynamic-code / eval escapes.
  for (const d of checkSourceEscapes(ast).diagnostics) out.push(normalize(d));

  // OWASP taint tracking → injection sinks (GNG-01 dead gate).
  for (const d of checkTaint(ast, flows)) out.push(normalize(d));

  // Runtime / prototype monkey-patching (FUNGI-SEC-020/021 dead gate, Class A).
  // The text scan dedups against AST-reported lines to avoid a double report.
  const monkeyAstLines = new Set<number>();
  for (const d of checkMonkeyPatching(ast).diagnostics) {
    if (d.location?.line !== undefined) monkeyAstLines.add(d.location.line);
    out.push(normalize(d));
  }
  for (const d of checkMonkeyPatchingSource(source, filePath, monkeyAstLines).diagnostics) out.push(normalize(d));

  // Attribute-directive escape hatch (Class D).
  for (const d of checkAttributeDirectives(ast).diagnostics) out.push(normalize(d));

  // Value-state safety at PRODUCTION strictness.
  for (const d of checkValueStates(ast, "production").diagnostics) out.push(normalize(d));

  // Effect declaration matching at PRODUCTION strictness + tier floor.
  const effectResults = checkEffects(flows, ast, "production", true);
  for (const r of effectResults) for (const d of r.diagnostics) out.push(normalize(d));

  // Governance verification at PRODUCTION strictness (incl. privacy-deny — GNG-03).
  for (const d of verifyGovernance(ast, flows, effectResults, "production", filePath).diagnostics) {
    out.push(normalize(d));
  }

  return out;
}

/** True when the gate found any error-severity diagnostic → the artifact must NOT be signed. */
export function productionGateBlocks(diagnostics: readonly GateDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
