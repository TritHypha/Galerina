// =============================================================================
// Galerina Phase 12A — Source Escape Checker
//
// Detects calls to eval-like functions in Galerina source (AST level).
// These calls bypass governance, capability checks, and audit trails.
//
// Fires: SPORE-SOURCE-ESCAPE-001 (SourceLevelEvalEscape)
//
// Detected patterns (call name or qualified name):
//   eval
//   Runtime.eval
//   DynamicCode.load
//   DynamicCode.execute
//   Compiler.eval
//   Script.run
//   Function   (constructor call pattern)
//
// Entry point: checkSourceEscapes(ast)
// =============================================================================

import { type AstNode, type SourceLocation } from "./parser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EscapeDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
  readonly why?: string;
}

export interface EscapeCheckResult {
  readonly diagnostics: readonly EscapeDiagnostic[];
}

// ---------------------------------------------------------------------------
// Banned call patterns
//
// Matched against the reconstructed full qualified call name
// (e.g. "Runtime.eval", "DynamicCode.load") and the bare method name
// (e.g. "eval", "Function").
// ---------------------------------------------------------------------------

const BANNED_CALL_NAMES = new Set([
  "eval",
  "Runtime.eval",
  "DynamicCode.load",
  "DynamicCode.execute",
  "Compiler.eval",
  "Script.run",
  "Function",
]);

// ---------------------------------------------------------------------------
// AST name reconstruction helpers (mirrors value-state-checker pattern)
// ---------------------------------------------------------------------------

function getNodeName(node: AstNode): string {
  if (node.kind === "identifier") return node.value ?? "";
  if (node.kind === "memberExpr") {
    const parent = node.children?.[0];
    const parentName = parent !== undefined ? getNodeName(parent) : "";
    const memberName = node.value ?? "";
    return parentName !== "" ? `${parentName}.${memberName}` : memberName;
  }
  return "";
}

function buildFullCallName(node: AstNode): string {
  const methodName = node.value ?? "";
  const receiver = node.children?.[0];
  if (receiver === undefined) return methodName;
  const receiverName = getNodeName(receiver);
  return receiverName !== "" ? `${receiverName}.${methodName}` : methodName;
}

// ---------------------------------------------------------------------------
// Escape checker implementation
// ---------------------------------------------------------------------------

function makeEscapeDiagnostic(
  callName: string,
  location: SourceLocation | undefined,
): EscapeDiagnostic {
  const base = {
    code: "SPORE-SOURCE-ESCAPE-001",
    name: "SourceLevelEvalEscape",
    severity: "error" as const,
    message: `Galerina source calls eval() or a dynamic code loading function. This bypasses governance, capability checks, and audit trails.`,
    suggestedFix: "Replace with a declared flow with explicit effects and capability declarations.",
    why: "Dynamic code cannot be effect-checked, verified, or audited.",
  };

  if (location !== undefined) {
    return { ...base, location };
  }
  return base;
}

function walkAst(
  node: AstNode,
  diagnostics: EscapeDiagnostic[],
): void {
  if (node.kind === "callExpr") {
    const fullName = buildFullCallName(node);
    const methodOnly = node.value ?? "";

    if (BANNED_CALL_NAMES.has(fullName) || BANNED_CALL_NAMES.has(methodOnly)) {
      diagnostics.push(makeEscapeDiagnostic(fullName || methodOnly, node.location));
    }
  }

  for (const child of node.children ?? []) {
    walkAst(child, diagnostics);
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Walks the Galerina AST and reports any call to eval-like functions.
 *
 * Detected patterns: eval, Runtime.eval, DynamicCode.load, DynamicCode.execute,
 * Compiler.eval, Script.run, Function (constructor call pattern).
 *
 * @param ast  The root `program` node from `parseProgram()`.
 * @returns    An EscapeCheckResult containing all SPORE-SOURCE-ESCAPE-001 diagnostics.
 */
export function checkSourceEscapes(ast: AstNode): EscapeCheckResult {
  const diagnostics: EscapeDiagnostic[] = [];
  walkAst(ast, diagnostics);
  return { diagnostics };
}
