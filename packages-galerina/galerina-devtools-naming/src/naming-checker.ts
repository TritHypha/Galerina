// =============================================================================
// @galerina/devtools-naming — Naming Checker
//
// Static analysis of .spore source files for naming anti-patterns.
// Enforces "Zero Ambiguity / Maximum Semantics" naming standard.
//
// Diagnostic codes:
//   SPORE-NAMING-001  AbbreviatedIdentifier
//   SPORE-NAMING-002  ImplicitReturnType
//   SPORE-NAMING-003  GenericTypeName
//   SPORE-NAMING-004  AbbreviatedFlowName
//   SPORE-NAMING-005  MissingIntentOnPublicFlow
// =============================================================================

import type { AstNode, FlowMeta } from "@galerina/core-compiler";

// ---------------------------------------------------------------------------
// Diagnostic types
// ---------------------------------------------------------------------------

export type NamingDiagnosticCode =
  | "SPORE-NAMING-001"
  | "SPORE-NAMING-002"
  | "SPORE-NAMING-003"
  | "SPORE-NAMING-004"
  | "SPORE-NAMING-005";

export interface NamingDiagnostic {
  readonly code: NamingDiagnosticCode;
  readonly name: string;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly flowName?: string;
  readonly identifierName?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface NamingCheckResult {
  readonly schemaVersion: "spore.naming.v1";
  readonly findings: readonly NamingDiagnostic[];
  readonly passed: boolean;
  readonly summary: string;
  readonly checkedAt: string;
}

export interface NamingCheckOptions {
  /** Treat warnings as errors (--strict mode). Default: false. */
  readonly strict?: boolean;
  /** Source file name for error reporting. */
  readonly fileName?: string;
}

// ---------------------------------------------------------------------------
// SPORE-NAMING-001: Abbreviated identifier list
// ---------------------------------------------------------------------------

const BANNED_ABBREVS = new Set([
  "req", "res", "err", "ctx", "msg", "tmp", "val", "buf", "str", "obj", "num",
  "fn", "cb", "ret", "ref", "ptr", "src", "dst", "idx", "len", "cnt", "sz",
  "tx", "rx", "cfg", "conf", "opts", "args", "params", "data", "info", "meta",
]);

/**
 * Loop counter exemptions: conventional single-char loop index names.
 * SPORE-NAMING-001 does NOT fire for these.
 */
const LOOP_COUNTER_EXEMPTIONS = new Set(["i", "j", "k", "n"]);

/**
 * Geometry / math variable exemptions: conventional single-char coordinate names.
 * These are universally understood in mathematical contexts, not abbreviations.
 */
const GEOMETRY_EXEMPTIONS = new Set(["x", "y", "z"]);

/**
 * Returns true if the identifier is an abbreviation that should be expanded.
 * Single-letter names are exempt for loop counters (i, j, k, n) and geometry (x, y, z).
 */
function isAbbreviated(name: string): boolean {
  const lower = name.toLowerCase();
  if (BANNED_ABBREVS.has(lower)) return true;
  // Single-char names: exempt loop counters and geometry/math vars
  if (lower.length === 1) {
    if (LOOP_COUNTER_EXEMPTIONS.has(lower)) return false;
    if (GEOMETRY_EXEMPTIONS.has(lower)) return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SPORE-NAMING-002: Implicit return type helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the return type is missing or void (implicit/degenerate).
 * Uses FlowMeta.returnType extracted by the parser.
 */
function isImplicitReturnType(returnType: string): boolean {
  const rt = returnType.trim();
  return rt === "" || rt === "void" || rt === "Void";
}

// ---------------------------------------------------------------------------
// SPORE-NAMING-003: Generic type name helpers
// ---------------------------------------------------------------------------

const GENERIC_TYPE_NAMES = new Set(["Any", "Object", "unknown"]);

/**
 * Returns true if the type string is a generic/opaque type without a named alias.
 * Matches standalone Any, Object, or unknown (not as part of a compound type).
 */
function isGenericTypeName(typeStr: string): boolean {
  const t = typeStr.trim();
  return GENERIC_TYPE_NAMES.has(t);
}

// ---------------------------------------------------------------------------
// SPORE-NAMING-004: Abbreviated flow name heuristic
// ---------------------------------------------------------------------------

// Known short standalone flow names that are really abbreviations / compressed forms
const ABBREVIATED_FLOW_NAMES = new Set([
  "hash", "proc", "exec", "run", "init", "get", "set", "do", "go",
  "handle", "parse", "build", "make", "create", "fetch", "send", "load",
  "save", "update", "delete", "check", "validate", "format", "render",
  "compute", "calc", "convert", "transform", "process",
]);

/**
 * Returns true if the flow name looks like an abbreviated/compressed identifier.
 * Heuristic: name <= 10 chars AND is in the known abbreviation list,
 * OR name <= 6 chars with no domain noun (no uppercase after the first char beyond word 2).
 */
function isAbbreviatedFlowName(name: string): boolean {
  if (name.length > 10) return false;
  const lower = name.toLowerCase();
  if (ABBREVIATED_FLOW_NAMES.has(lower)) return true;
  // Short all-lowercase name with no domain noun indicator
  if (name.length <= 6 && /^[a-z]+$/.test(name)) {
    // Allow i, n (loop counters already excluded elsewhere)
    // This catches things like "hash", "proc", "exec" not in the set
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// AST traversal helpers
// ---------------------------------------------------------------------------

/**
 * Walk the AST recursively, applying a visitor to every node.
 */
function walkAst(node: AstNode, visitor: (n: AstNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) {
    walkAst(child, visitor);
  }
}

/**
 * Find all descendant nodes of a given kind.
 */
function findNodes(node: AstNode, kind: string): readonly AstNode[] {
  const results: AstNode[] = [];
  walkAst(node, (n) => { if (n.kind === kind) results.push(n); });
  return results;
}

/**
 * Extract the identifier name from a declaration node's value string.
 * Handles formats like:
 *   "name: Type"   → "name"
 *   "name"         → "name"
 *   "name = ..."   → "name"
 */
function extractBindingName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Take everything before first : = ( or whitespace
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

/**
 * Extract the type annotation from a binding/param value string.
 * Format: "name: Type" → "Type"
 */
function extractTypeAnnotation(value: string): string | undefined {
  const colonIndex = value.indexOf(":");
  if (colonIndex < 0) return undefined;
  return value.slice(colonIndex + 1).trim().split(/[\s={]/)[0];
}

/**
 * Returns true if the flow AST node has an intentDecl child.
 */
function hasIntentDecl(flowNode: AstNode): boolean {
  return findNodes(flowNode, "intentDecl").length > 0 ||
    (flowNode.children ?? []).some(
      (c) => c.kind === "identifier" && (c.value ?? "").startsWith("intent:"),
    );
}

// ---------------------------------------------------------------------------
// Flow-level context tracking (to suppress single-char in loop counters)
// ---------------------------------------------------------------------------

const FLOW_DECL_KINDS = new Set([
  "flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl", "fnDecl",
]);

/**
 * Returns true if the node is inside a for-loop counter context.
 * This is a best-effort heuristic: if the single-char name is `i` or `n` it
 * is already excluded by isAbbreviated(). For other single-chars in loop
 * bodies we check the parent context. Since we do not have parent tracking
 * in this simple walker, we rely on the `i`/`n` exclusion only.
 */
function extractFlowName(node: AstNode): string | undefined {
  const raw = (node.value ?? "").trim();
  if (!raw) return undefined;
  const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Main checker
// ---------------------------------------------------------------------------

/**
 * Run all naming checks on a parsed AST + flow metadata.
 */
export function checkNaming(
  ast: AstNode,
  flows: readonly FlowMeta[],
  options: NamingCheckOptions = {},
): NamingCheckResult {
  const { strict = false, fileName = "source.spore" } = options;
  const findings: NamingDiagnostic[] = [];
  const checkedAt = new Date().toISOString();

  // Build a map from flow name → AST node for GOV/naming-005 checks
  const flowNodeMap = new Map<string, AstNode>();
  walkAst(ast, (node) => {
    if (FLOW_DECL_KINDS.has(node.kind)) {
      const name = extractFlowName(node);
      if (name !== undefined) flowNodeMap.set(name, node);
    }
  });

  // ── SPORE-NAMING-001, SPORE-NAMING-003: Walk all binding/param nodes ──────────
  walkAst(ast, (node) => {
    // Binding/param identifier checks
    if (
      node.kind === "paramDecl" ||
      node.kind === "letDecl" ||
      node.kind === "mutDecl"
    ) {
      const bindingName = extractBindingName(node.value ?? "");
      const typeAnnotation = extractTypeAnnotation(node.value ?? "");

      // SPORE-NAMING-001: Check the binding name itself
      if (bindingName !== undefined && isAbbreviated(bindingName)) {
        findings.push({
          code: "SPORE-NAMING-001",
          name: "AbbreviatedIdentifier",
          severity: "warning",
          message: `Identifier '${bindingName}' is an abbreviation. Use a fully-spelled domain name (e.g. '${bindingName}' → a descriptive name like 'errorMessage', 'requestBody', 'contextData').`,
          identifierName: bindingName,
          ...(node.location !== undefined
            ? { line: node.location.line, column: node.location.column }
            : {}),
        });
      }

      // SPORE-NAMING-003: Check if the type is generic/opaque
      if (typeAnnotation !== undefined && isGenericTypeName(typeAnnotation)) {
        findings.push({
          code: "SPORE-NAMING-003",
          name: "GenericTypeName",
          severity: "warning",
          message: `Binding '${bindingName ?? "?"}' uses generic type '${typeAnnotation}'. Replace with a named domain type alias (e.g. 'type UserPayload = Object' then use UserPayload).`,
          identifierName: bindingName ?? typeAnnotation,
          ...(node.location !== undefined
            ? { line: node.location.line, column: node.location.column }
            : {}),
        });
      }
    }

    // SPORE-NAMING-001 on flow-level param identifier nodes (parsed as identifier children)
    // These are emitted by the parser when params are in identifier form
    if (node.kind === "identifier") {
      const val = (node.value ?? "").trim();
      // Skip identifiers that look like qualified names (contain dots) or type refs
      if (!val.includes(".") && !val.includes(":")) {
        if (isAbbreviated(val)) {
          // Only emit for identifiers that look like binding names (start lowercase)
          if (/^[a-z]/.test(val)) {
            findings.push({
              code: "SPORE-NAMING-001",
              name: "AbbreviatedIdentifier",
              severity: "warning",
              message: `Identifier '${val}' is an abbreviation. Use a fully-spelled domain name.`,
              identifierName: val,
              ...(node.location !== undefined
                ? { line: node.location.line, column: node.location.column }
                : {}),
            });
          }
        }
      }
    }
  });

  // ── Per-flow checks using FlowMeta ─────────────────────────────────────────
  for (const flow of flows) {
    const flowNode = flowNodeMap.get(flow.name);

    // SPORE-NAMING-001: Check param names from FlowMeta
    for (const param of flow.params) {
      const paramName = extractBindingName(param);
      if (paramName !== undefined && isAbbreviated(paramName)) {
        // Deduplicate: if already emitted from AST walk, skip
        const alreadyEmitted = findings.some(
          (f) =>
            f.code === "SPORE-NAMING-001" &&
            f.identifierName === paramName &&
            f.flowName === flow.name,
        );
        if (!alreadyEmitted) {
          findings.push({
            code: "SPORE-NAMING-001",
            name: "AbbreviatedIdentifier",
            severity: "warning",
            message: `Parameter '${paramName}' in flow '${flow.name}' is an abbreviation. Use a fully-spelled domain name.`,
            flowName: flow.name,
            identifierName: paramName,
            line: flow.location.line,
          });
        }
      }

      // SPORE-NAMING-003: Check param types from FlowMeta
      const paramType = extractTypeAnnotation(param);
      if (paramType !== undefined && isGenericTypeName(paramType)) {
        findings.push({
          code: "SPORE-NAMING-003",
          name: "GenericTypeName",
          severity: "warning",
          message: `Parameter '${paramName ?? "?"}' in flow '${flow.name}' uses generic type '${paramType}'. Replace with a named domain type alias.`,
          flowName: flow.name,
          identifierName: paramName ?? paramType,
          line: flow.location.line,
        });
      }
    }

    // SPORE-NAMING-002: Implicit return type
    if (isImplicitReturnType(flow.returnType)) {
      findings.push({
        code: "SPORE-NAMING-002",
        name: "ImplicitReturnType",
        severity: "warning",
        message: `Flow '${flow.name}' has implicit/void return type. Declare an explicit return type to communicate intent (e.g. '-> Unit' for intentional no-value, '-> Result<T, Error>' for fallible flows).`,
        flowName: flow.name,
        line: flow.location.line,
      });
    }

    // SPORE-NAMING-004: Abbreviated flow name
    if (isAbbreviatedFlowName(flow.name)) {
      findings.push({
        code: "SPORE-NAMING-004",
        name: "AbbreviatedFlowName",
        severity: "warning",
        message: `Flow name '${flow.name}' is too short or generic to convey domain intent. Use a name that includes a domain noun (e.g. 'hashPassword' instead of 'hash', 'processOrder' instead of 'proc').`,
        flowName: flow.name,
        line: flow.location.line,
      });
    }

    // SPORE-NAMING-005: secure/guarded flow with no intent
    if (
      (flow.qualifier === "secure" || flow.qualifier === "guarded") &&
      flowNode !== undefined &&
      !hasIntentDecl(flowNode)
    ) {
      findings.push({
        code: "SPORE-NAMING-005",
        name: "MissingIntentOnPublicFlow",
        severity: "warning",
        message: `${flow.qualifier} flow '${flow.name}' has no contract { intent { ... } } block. Intent documents what this flow protects and why it is ${flow.qualifier} — required by the Zero-Ambiguity standard.`,
        flowName: flow.name,
        line: flow.location.line,
      });
    }
  }

  // Deduplicate findings (same code + identifierName + line)
  const deduped = deduplicateFindings(findings);

  const passed = strict ? deduped.length === 0 : deduped.filter(f => f.severity === "error").length === 0;
  const summary = deduped.length === 0
    ? "PASS — no naming findings"
    : `${deduped.length} finding${deduped.length === 1 ? "" : "s"}: ${summariseByCodes(deduped)}`;

  return {
    schemaVersion: "spore.naming.v1",
    findings: deduped,
    passed,
    summary,
    checkedAt,
  };
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

function deduplicateFindings(findings: NamingDiagnostic[]): NamingDiagnostic[] {
  const seen = new Set<string>();
  const result: NamingDiagnostic[] = [];
  for (const f of findings) {
    const key = `${f.code}:${f.identifierName ?? ""}:${f.flowName ?? ""}:${f.line ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }
  return result;
}

function summariseByCodes(findings: readonly NamingDiagnostic[]): string {
  const counts = new Map<string, number>();
  for (const f of findings) {
    counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([code, count]) => `${count}x ${code}`)
    .join(", ");
}
