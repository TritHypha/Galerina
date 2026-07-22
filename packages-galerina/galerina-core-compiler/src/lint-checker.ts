// =============================================================================
// Galerina — Lint Checker (ergonomics / code-quality warnings)
//
// These are NOT governance violations — the code is correct. These are
// structural signals that a developer may want to refactor.
//
// FUNGI-LINT-001   EXCESSIVE_NESTING   — flow body nesting depth > 4 AND ≥3 identical Err(e) arms.
//                  Recommendation: extract inner logic into a named helper flow.
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";

// ---------------------------------------------------------------------------
// Diagnostic constant
// ---------------------------------------------------------------------------

export const FUNGI_LINT_001 = {
  code: "FUNGI-LINT-001",
  name: "EXCESSIVE_NESTING",
  severity: "info" as const,
  message:
    "Flow body nesting depth exceeds 4 and contains repeated Err() propagations. " +
    "Consider extracting inner logic into a named helper flow to reduce nesting.",
} as const;

export interface LintDiagnostic {
  readonly code: "FUNGI-LINT-001";
  readonly name: string;
  readonly severity: "info" | "warning";
  readonly message: string;
  readonly flowName: string;
  readonly nestingDepth: number;
  readonly repeatedErrCount: number;
}

// ---------------------------------------------------------------------------
// Nesting depth and Err-propagation counters
// ---------------------------------------------------------------------------

// AST node kinds that add a nesting level for lint purposes:
//   - `matchExpr` (match arms each introduce a level)
//   - `checkExpr` (check{} if:/deny: arms introduce a level)
//   - `ifExpr`    (if/unless block introduces a level)
//   - `block`     (anonymous block — also nests)
const NESTING_KINDS = new Set<string>(["matchExpr", "checkExpr", "ifExpr", "block"]);

/**
 * Walk an AST subtree and return the maximum nesting depth reached.
 * Only NESTING_KINDS nodes contribute a depth increment.
 */
function maxNestingDepth(node: AstNode, currentDepth = 0): number {
  let max = currentDepth;
  for (const child of node.children ?? []) {
    const childDepth = NESTING_KINDS.has(child.kind) ? currentDepth + 1 : currentDepth;
    const descendant = maxNestingDepth(child, childDepth);
    if (descendant > max) max = descendant;
  }
  return max;
}

/**
 * Count the number of Err(e) / Err(_) propagation nodes in the subtree.
 * Heuristic: a callExpr with value="Err" whose child is a single identifier
 * is considered an error-propagation arm.
 */
function countErrPropagations(node: AstNode): number {
  let count = 0;
  if (
    node.kind === "callExpr" &&
    node.value === "Err" &&
    node.children?.length === 1 &&
    node.children[0]?.kind === "identifier"
  ) {
    count += 1;
  }
  for (const child of node.children ?? []) {
    count += countErrPropagations(child);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check all flow bodies for excessive nesting (FUNGI-LINT-001).
 *
 * Fires when BOTH conditions hold:
 *   1. The flow body's maximum nesting depth > NESTING_THRESHOLD (4)
 *   2. The body contains ≥ ERR_REPEAT_THRESHOLD (3) identical Err() propagations
 *
 * Severity: "info" — this is a suggestion, never a build error.
 */
export function checkLint(
  ast: AstNode,
  flows: readonly FlowMeta[],
): LintDiagnostic[] {
  const NESTING_THRESHOLD = 4;
  const ERR_REPEAT_THRESHOLD = 3;

  const diagnostics: LintDiagnostic[] = [];
  const FLOW_KINDS = new Set(["pureFlowDecl", "guardedFlowDecl", "secureFlowDecl", "flowDecl"]);

  for (const c of ast.children ?? []) {
    if (!FLOW_KINDS.has(c.kind)) continue;
    const flowName = c.value ?? "";
    if (!flows.some(f => f.name === flowName)) continue;

    // The body is the last block child of the flow declaration
    const body = (c.children ?? []).find(ch => ch.kind === "block"); // perf-allow: loop-array-find — c.children has ≤5 elements (flow-level children: params, effects, contract, block); O(1) in practice
    if (body === undefined) continue;

    const depth = maxNestingDepth(body);
    const errCount = countErrPropagations(body);

    if (depth > NESTING_THRESHOLD && errCount >= ERR_REPEAT_THRESHOLD) {
      diagnostics.push({
        code: "FUNGI-LINT-001",
        name: "EXCESSIVE_NESTING",
        severity: "info",
        message:
          `Flow '${flowName}' has nesting depth ${depth} (>${NESTING_THRESHOLD}) and ` +
          `${errCount} repeated Err() propagations (≥${ERR_REPEAT_THRESHOLD}). ` +
          `Consider extracting inner logic into a named helper flow.`,
        flowName,
        nestingDepth: depth,
        repeatedErrCount: errCount,
      });
    }
  }

  return diagnostics;
}
