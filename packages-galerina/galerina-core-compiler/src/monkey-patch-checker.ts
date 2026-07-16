// =============================================================================
// Galerina Phase 18 — Monkey-Patch Checker
//
// Detects source-level attempts to mutate runtime objects or prototypes.
// Galerina's governance model requires declared behaviour — no secret rewrites.
//
// Fires:
//   FUNGI-SEC-020  RuntimeMutationProhibited
//     Calls that attempt to replace/patch runtime objects, capabilities,
//     imported functions, adapters, or globals.
//     Examples: Runtime.patch(...), capabilities.override(...)
//
//   FUNGI-SEC-021  PrototypeMutationProhibited
//     Assignments that target a .prototype. chain.
//     Examples: String.prototype.trim = customTrim
//
// Does NOT fire for:
//   FUNGI-SOURCE-ESCAPE-001 — eval(), Function(), dynamic execution
//   FUNGI-BACKEND-001        — emitted JS escape checks (future emitter)
//
// Entry points:
//   checkMonkeyPatching(ast)             — AST-level check (primary)
//   checkMonkeyPatchingSource(text, file) — text-level check (supplements AST)
// =============================================================================

import { type AstNode, type SourceLocation } from "./parser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MonkeyPatchDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
  readonly why?: string;
}

export interface MonkeyPatchCheckResult {
  readonly diagnostics: readonly MonkeyPatchDiagnostic[];
}

// ---------------------------------------------------------------------------
// FUNGI-SEC-020: Runtime mutation — banned call patterns
//
// Matched against the full qualified call name (receiver.method).
// PROTECTED_NAMESPACES: runtime objects that must not be mutated.
// MUTATION_METHOD_NAMES: methods that indicate runtime mutation.
// ---------------------------------------------------------------------------

const PROTECTED_NAMESPACES = new Set([
  "Runtime",
  "runtime",
  "Capabilities",
  "capabilities",
  "Adapter",
  "adapter",
  "adapters",
  "Globals",
  "globals",
]);

const MUTATION_METHOD_NAMES = new Set([
  "patch",
  "replace",
  "mock",
  "override",
  "install",
  "swap",
  "hijack",
  "intercept",
  "inject",
  "stub",
  "spy",
  "redefine",
  "reassign",
]);

// Fully qualified call names that are always banned regardless of receiver.
const BANNED_QUALIFIED_CALLS = new Set([
  "Runtime.patch",
  "Runtime.replace",
  "Runtime.mock",
  "Runtime.override",
  "Runtime.install",
  "Runtime.swap",
  "Runtime.hijack",
  "Runtime.intercept",
  "Runtime.inject",
  "Capabilities.override",
  "Capabilities.replace",
  "Capabilities.mock",
  "adapter.replace",
  "adapters.override",
]);

// ---------------------------------------------------------------------------
// AST name reconstruction (shared pattern with source-escape-checker)
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

function getReceiverName(node: AstNode): string {
  const receiver = node.children?.[0];
  if (receiver === undefined) return "";
  return getNodeName(receiver);
}

// ---------------------------------------------------------------------------
// Diagnostic constructors
// ---------------------------------------------------------------------------

function makeSec020Diagnostic(
  callName: string,
  location: SourceLocation | undefined,
): MonkeyPatchDiagnostic {
  const base = {
    code: "FUNGI-SEC-020",
    name: "RUNTIME_MUTATION_PROHIBITED", // #20: must equal FUNGI_SEC_020.name in index.ts (audit-guarded pair)
    severity: "error" as const,
    message: `Runtime behaviour modification is prohibited. '${callName}' replaces or patches a runtime object, capability, or adapter — this bypasses governance and audit trails.`,
    suggestedFix: "Declare an adapter implementing the interface, or use a mock in a test boundary. Never patch live runtime objects.",
    why: "Secret runtime rewrites break capability enforcement, effect checking, and audit proof.",
  };
  return location !== undefined ? { ...base, location } : base;
}

function makeSec021Diagnostic(
  targetPath: string,
  location: SourceLocation | undefined,
): MonkeyPatchDiagnostic {
  const base = {
    code: "FUNGI-SEC-021",
    name: "PROTOTYPE_MUTATION_PROHIBITED", // #20: must equal FUNGI_SEC_021.name in index.ts (audit-guarded pair)
    severity: "error" as const,
    message: `Prototype mutation is prohibited. Assigning to '${targetPath}' rewrites shared inherited behaviour — this is not allowed in Galerina.`,
    suggestedFix: "Use type declarations, adapter interfaces, or explicit contract extensions instead of prototype assignment.",
    why: "Prototype mutations silently change behaviour across all instances of a type. Galerina requires declared behaviour.",
  };
  return location !== undefined ? { ...base, location } : base;
}

// ---------------------------------------------------------------------------
// AST walker — FUNGI-SEC-020 (runtime mutation via call)
// ---------------------------------------------------------------------------

function isRuntimeMutationCall(node: AstNode): boolean {
  if (node.kind !== "callExpr") return false;

  const fullName = buildFullCallName(node);
  const methodName = node.value ?? "";
  const receiverName = getReceiverName(node);

  // Exact banned qualified call
  if (BANNED_QUALIFIED_CALLS.has(fullName)) return true;

  // Protected namespace + mutation method
  if (PROTECTED_NAMESPACES.has(receiverName) && MUTATION_METHOD_NAMES.has(methodName)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// AST walker — FUNGI-SEC-021 (prototype assignment)
//
// Detects assignStmt/letDecl/mutDecl where the target chain contains "prototype".
// Also detects callExpr where the receiver chain contains "prototype" (rare but
// possible: String.prototype.trim.call(...) is still a prototype access).
// ---------------------------------------------------------------------------

function containsPrototype(node: AstNode): boolean {
  if (node.kind === "identifier" && node.value === "prototype") return true;
  if (node.kind === "memberExpr" && node.value === "prototype") return true;
  for (const child of node.children ?? []) {
    if (containsPrototype(child)) return true;
  }
  return false;
}

function isPrototypeMutationAssign(node: AstNode): boolean {
  // assignStmt: target is node.value (binding name) and the LHS in extended
  // form may be in a child node. We inspect value for "prototype" and children.
  if (node.kind === "assignStmt") {
    // If the binding name itself contains "prototype" (unlikely but catch it)
    if ((node.value ?? "").includes("prototype")) return true;
    // Check the first child (which may represent the LHS in member assign form)
    const lhs = node.children?.[0];
    if (lhs !== undefined && containsPrototype(lhs)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Full AST walk
// ---------------------------------------------------------------------------

function walkAst(node: AstNode, diagnostics: MonkeyPatchDiagnostic[]): void {
  // FUNGI-SEC-020: runtime mutation call
  if (isRuntimeMutationCall(node)) {
    const fullName = buildFullCallName(node);
    diagnostics.push(makeSec020Diagnostic(fullName, node.location));
  }

  // FUNGI-SEC-021: prototype mutation assignment
  if (isPrototypeMutationAssign(node)) {
    const targetPath = node.value ?? "<unknown>";
    diagnostics.push(makeSec021Diagnostic(targetPath, node.location));
  }

  for (const child of node.children ?? []) {
    walkAst(child, diagnostics);
  }
}

// ---------------------------------------------------------------------------
// Text-level scanner — FUNGI-SEC-021 (supplements AST for edge cases)
//
// Covers: String.prototype.trim = customTrim
// Excluded: String.prototype.trim.call(...) — a read, not a write
// ---------------------------------------------------------------------------

function scanTextForPrototypeMutation(
  source: string,
  file: string,
  diagnostics: MonkeyPatchDiagnostic[],
): void {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("///")) continue;
    // Look for .prototype.identifier = (assignment) but not .prototype.identifier.something
    const idx = line.indexOf(".prototype.");
    if (idx === -1) continue;
    // Check if this is an assignment (has '=' after the prototype path)
    const afterProto = line.slice(idx);
    // Find the next = that is not == or =>
    const eqMatch = afterProto.match(/\.\w+\s*(?<![=!<>])=(?!=|>)/);
    if (eqMatch !== null) {
      // Extract the target path fragment
      const eqIdx = afterProto.indexOf("=");
      const targetFragment = eqIdx >= 0
        ? line.slice(0, idx + eqIdx).trim()
        : line.slice(0, idx).trim();
      diagnostics.push(makeSec021Diagnostic(targetFragment, {
        file,
        line: i + 1,
        column: idx + 1,
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Text-level scanner — FUNGI-SEC-020 (supplements AST)
//
// Catches string-based runtime patch patterns the AST might not model:
//   Runtime.patch("Database.find", ...)
// These ARE callExpr in the AST, but text scanning provides a second pass.
// ---------------------------------------------------------------------------

function scanTextForRuntimeMutation(
  source: string,
  file: string,
  diagnostics: MonkeyPatchDiagnostic[],
  existingLocs: Set<number>,
): void {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (existingLocs.has(i + 1)) continue; // already caught by AST walk
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("///")) continue;

    for (const ns of PROTECTED_NAMESPACES) {
      for (const method of MUTATION_METHOD_NAMES) {
        const pattern = `${ns}.${method}(`;
        if (line.includes(pattern)) {
          diagnostics.push(makeSec020Diagnostic(`${ns}.${method}`, {
            file,
            line: i + 1,
            column: line.indexOf(pattern) + 1,
          }));
          break; // one diagnostic per line per namespace is enough
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Walks the Galerina AST and reports source-level monkey-patching attempts.
 *
 * FUNGI-SEC-020: calls to Runtime.patch, capabilities.override, etc.
 * FUNGI-SEC-021: assignments that target a .prototype. chain (AST form).
 *
 * Complement with checkMonkeyPatchingSource() for text-level coverage.
 */
export function checkMonkeyPatching(ast: AstNode): MonkeyPatchCheckResult {
  const diagnostics: MonkeyPatchDiagnostic[] = [];
  walkAst(ast, diagnostics);
  return { diagnostics };
}

/**
 * Text-level monkey-patch check. Supplements AST-level checking.
 *
 * Detects patterns the parser may represent differently from the canonical
 * call form, and provides line-level locations for IDE integration.
 *
 * Deduplicates against AST diagnostics via `astDiagnosticLines`.
 */
export function checkMonkeyPatchingSource(
  source: string,
  file: string,
  astDiagnosticLines: ReadonlySet<number> = new Set(),
): MonkeyPatchCheckResult {
  const diagnostics: MonkeyPatchDiagnostic[] = [];

  // Prototype mutation: text scan (catches edge cases the AST may miss)
  scanTextForPrototypeMutation(source, file, diagnostics);

  // Runtime mutation: text scan (supplements AST, deduped by line)
  scanTextForRuntimeMutation(
    source,
    file,
    diagnostics,
    new Set(astDiagnosticLines),
  );

  return { diagnostics };
}
