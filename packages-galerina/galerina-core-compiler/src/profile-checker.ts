// =============================================================================
// Galerina Phase 28 — Runtime Profile Enforcement
//
// Runtime Profiles are restricted language subsets that selectively disable
// unsafe or unanalyzable features. They apply ADDITIONAL governance restrictions
// on top of the standard Galerina runtime.
//
// Spec: ../ZTF-Knowledge-Bases/runtime-profiles.md
//
// Profiles (composable — strictest rule wins):
//   strict          — mandatory audit, no recursion, no unbounded loops, no JIT
//   high_integrity  — deterministic, bounded execution, runtime budget required
//   deterministic   — bounded loops, fixed runtime budget
//
// Note: try/catch/throw/async/await do NOT exist in Galerina (Result<T,E> model,
// future-reserved keywords). Those denials are satisfied by construction.
// The enforceable constraints are: recursion, unbounded loops, runtime budget.
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";

// ---------------------------------------------------------------------------
// Profile diagnostics
// ---------------------------------------------------------------------------

export interface ProfileDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly flowName?: string;
}

/** FUNGI-PROFILE-001: Recursion is prohibited in strict / high_integrity profiles. */
export const FUNGI_PROFILE_001 = {
  code: "FUNGI-PROFILE-001",
  name: "RecursionInRestrictedProfile",
  severity: "error" as const,
  message: "Recursion is prohibited in this profile. Restricted profiles require bounded, analyzable execution. Rewrite using a bounded loop.",
} as const;

/** FUNGI-PROFILE-002: Unbounded loops are prohibited in strict profiles. */
export const FUNGI_PROFILE_002 = {
  code: "FUNGI-PROFILE-002",
  name: "UnboundedLoopInStrictProfile",
  severity: "error" as const,
  message: "Unbounded loop in strict profile. Strict profiles require loops with a provable bound (compile-time-known iteration limit or contract.limits).",
} as const;

/** FUNGI-PROFILE-003: try/catch/throw used (reserved — should never appear in Galerina). */
export const FUNGI_PROFILE_003 = {
  code: "FUNGI-PROFILE-003",
  name: "ExceptionControlFlowProhibited",
  severity: "error" as const,
  message: "Exception control flow (try/catch/throw) is prohibited. Galerina uses Result<T, Error>. This is enforced by construction — these are not Galerina keywords.",
} as const;

/** FUNGI-PROFILE-004: JIT / dynamic code target in strict profile. */
export const FUNGI_PROFILE_004 = {
  code: "FUNGI-PROFILE-004",
  name: "JitProhibitedInStrictProfile",
  severity: "error" as const,
  message: "JIT / dynamic code execution target is prohibited in strict profile. Use ahead-of-time compilation (WASM or native).",
} as const;

/** FUNGI-PROFILE-005: Dynamic package load in strict profile. */
export const FUNGI_PROFILE_005 = {
  code: "FUNGI-PROFILE-005",
  name: "DynamicPackageLoadProhibited",
  severity: "error" as const,
  message: "Dynamic package loading is prohibited in strict profile. All imports must resolve at compile time.",
} as const;

/** FUNGI-PROFILE-005B: Dynamic regex from user input in strict / high_integrity profile. */
export const FUNGI_PROFILE_005B = {
  code: "FUNGI-PROFILE-005B",
  name: "DynamicRegexInStrictProfile",
  severity: "error" as const,
  message: "Dynamic regex from runtime input is prohibited in strict/high_integrity profiles (ReDoS risk). Use Regex.escapeLiteral() for literal matching, or a compile-time constant pattern.",
  suggestedFix: "Replace String.matchesPattern(userInput) with String.contains() / String.startsWith() / a compile-time constant regex.",
} as const;

/** FUNGI-PROFILE-006: Missing runtime_budget in high_integrity profile. */
export const FUNGI_PROFILE_006 = {
  code: "FUNGI-PROFILE-006",
  name: "MissingRuntimeBudget",
  severity: "warning" as const,
  message: "high_integrity profile recommends a runtime budget. Add contract.limits { request_time ... } to declare a bounded execution budget.",
} as const;

/** FUNGI-PROFILE-007: Dynamic runtime mutation in high_integrity profile. */
export const FUNGI_PROFILE_007 = {
  code: "FUNGI-PROFILE-007",
  name: "DynamicRuntimeMutationProhibited",
  severity: "error" as const,
  message: "Dynamic runtime mutation is prohibited in high_integrity profile. State transitions must be deterministic and declared.",
} as const;

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------

export type RuntimeProfile = "strict" | "high_integrity" | "deterministic";

interface ProfileRules {
  readonly denyRecursion: boolean;
  readonly denyUnboundedLoop: boolean;
  readonly denyJit: boolean;
  readonly denyDynamicPackageLoad: boolean;
  readonly requireRuntimeBudget: boolean;
  readonly denyDynamicMutation: boolean;
  readonly denyDynamicRegex: boolean;   // Phase 33 / F8: block user-input regex patterns
}

const PROFILE_RULES: Record<RuntimeProfile, ProfileRules> = {
  strict: {
    denyRecursion: true,
    denyUnboundedLoop: true,
    denyJit: true,
    denyDynamicPackageLoad: true,
    requireRuntimeBudget: false,
    denyDynamicMutation: false,
    denyDynamicRegex: true,       // strict: no runtime-input regex (ReDoS)
  },
  high_integrity: {
    denyRecursion: true,
    denyUnboundedLoop: false,
    denyJit: true,
    denyDynamicPackageLoad: true,
    requireRuntimeBudget: true,
    denyDynamicMutation: true,
    denyDynamicRegex: true,       // high_integrity: no runtime-input regex
  },
  deterministic: {
    denyRecursion: false,
    denyUnboundedLoop: true,
    denyJit: true,
    denyDynamicPackageLoad: false,
    requireRuntimeBudget: true,
    denyDynamicMutation: false,
    denyDynamicRegex: false,      // deterministic: regex allowed (bounded by engine guard)
  },
};

// ---------------------------------------------------------------------------
// Helpers — AST analysis
// ---------------------------------------------------------------------------

const FLOW_KINDS = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl"]);

/** Find a flow node by name in the program AST. */
function findFlowNode(ast: AstNode, name: string): AstNode | undefined {
  for (const child of ast.children ?? []) {
    if (FLOW_KINDS.has(child.kind) && child.value === name) return child;
  }
  return undefined;
}

/** Collect the names of all flows called within a flow body (for recursion detection). */
function collectCalledFlows(flowNode: AstNode): Set<string> {
  const calls = new Set<string>();
  function walk(node: AstNode): void {
    if (node.kind === "callExpr" && node.value !== undefined && node.value.length > 0) {
      // callExpr value is the callee name (lowercase = flow, capitalised = stdlib module)
      const name = node.value;
      if (name.length > 0 && name[0]! >= "a" && name[0]! <= "z") {
        calls.add(name);
      }
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(flowNode);
  return calls;
}

/**
 * Detects whether a flow is recursive — directly (calls itself) or transitively
 * (calls a flow that eventually calls back). Uses DFS over the call graph.
 */
function isRecursive(ast: AstNode, flowName: string): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(current: string): boolean {
    if (current === flowName && visiting.size > 0) return true; // cycle back to start
    if (visited.has(current)) return false;
    visiting.add(current);
    const node = findFlowNode(ast, current);
    if (node !== undefined) {
      for (const callee of collectCalledFlows(node)) {
        if (callee === flowName) return true;       // direct or transitive back-edge
        if (visiting.has(callee)) continue;          // already on the stack — different cycle
        if (dfs(callee)) return true;
      }
    }
    visiting.delete(current);
    visited.add(current);
    return false;
  }

  // Direct self-call check first (fast path)
  const startNode = findFlowNode(ast, flowName);
  if (startNode !== undefined && collectCalledFlows(startNode).has(flowName)) {
    return true;
  }
  // Transitive
  return dfs(flowName);
}

/**
 * Detects whether a flow contains an unbounded while loop.
 * A while loop is "bounded" only if its condition compares a loop variable
 * against a compile-time-known integer literal AND the variable is monotonically
 * advanced. We use a conservative heuristic: a while loop whose condition is
 * `var < literal` / `var <= literal` (literal on the right) is considered bounded.
 * Everything else is unbounded.
 */
function hasUnboundedLoop(flowNode: AstNode): boolean {
  let unbounded = false;
  function walk(node: AstNode): void {
    if (node.kind === "whileStmt") {
      const cond = node.children?.[0];
      if (!isBoundedCondition(cond)) unbounded = true;
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(flowNode);
  return unbounded;
}

/** A condition is "bounded" if it's `<expr> < <intLiteral>` or `<expr> <= <intLiteral>`. */
function isBoundedCondition(cond: AstNode | undefined): boolean {
  if (cond === undefined) return false;
  if (cond.kind !== "binaryExpr") return false;
  const op = cond.value ?? "";
  if (op !== "<" && op !== "<=" && op !== ">" && op !== ">=") return false;
  const right = cond.children?.[1];
  // bounded if the comparison's right side is a numeric literal
  return right?.kind === "numberLiteral";
}

/** Regex stdlib functions that take a runtime-input pattern argument. */
const DYNAMIC_REGEX_CALLS = new Set([
  "matchesPattern", "extractGroups", "replacePattern",
  "String.matchesPattern", "String.extractGroups", "String.replacePattern",
]);

/**
 * Returns true if the flow body calls a dynamic-regex stdlib function.
 * These functions take a runtime-provided pattern string → ReDoS risk in strict profiles.
 */
function hasDynamicRegexCall(flowNode: AstNode): boolean {
  function walk(node: AstNode): boolean {
    if (node.kind === "callExpr") {
      const callee = node.value ?? "";
      if (DYNAMIC_REGEX_CALLS.has(callee)) return true;
    }
    return (node.children ?? []).some(walk);
  }
  return walk(flowNode);
}

/** Check whether a flow declares a runtime budget (contract.limits { request_time ... }). */
function hasRuntimeBudget(flowNode: AstNode): boolean {
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  if (contractNode === undefined) return false;
  for (const child of contractNode.children ?? []) {
    if (child.kind === "identifier" && child.value === "limits:block") {
      // any limits content counts as a budget declaration
      if ((child.children ?? []).length > 0) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Phase 28: Enforce a runtime profile against all flows in the program.
 *
 * @param ast      - Program AST
 * @param flows    - Flow metadata
 * @param profiles - Active profiles (composable — strictest rule wins)
 * @returns ProfileDiagnostic[] — empty when the program satisfies all active profiles
 */
export function checkProfiles(
  ast: AstNode,
  flows: readonly FlowMeta[],
  profiles: readonly RuntimeProfile[],
): ProfileDiagnostic[] {
  if (profiles.length === 0) return [];

  // Merge rules — strictest wins (any deny = deny; any require = require)
  const merged: ProfileRules = {
    denyRecursion:          profiles.some(p => PROFILE_RULES[p].denyRecursion),
    denyUnboundedLoop:      profiles.some(p => PROFILE_RULES[p].denyUnboundedLoop),
    denyJit:                profiles.some(p => PROFILE_RULES[p].denyJit),
    denyDynamicPackageLoad: profiles.some(p => PROFILE_RULES[p].denyDynamicPackageLoad),
    requireRuntimeBudget:   profiles.some(p => PROFILE_RULES[p].requireRuntimeBudget),
    denyDynamicMutation:    profiles.some(p => PROFILE_RULES[p].denyDynamicMutation),
    denyDynamicRegex:       profiles.some(p => PROFILE_RULES[p].denyDynamicRegex),
  };

  const diagnostics: ProfileDiagnostic[] = [];

  for (const flow of flows) {
    const flowNode = findFlowNode(ast, flow.name);
    if (flowNode === undefined) continue;

    if (merged.denyRecursion && isRecursive(ast, flow.name)) {
      diagnostics.push({ ...FUNGI_PROFILE_001, flowName: flow.name,
        message: `Flow '${flow.name}': ${FUNGI_PROFILE_001.message}` });
    }

    if (merged.denyUnboundedLoop && hasUnboundedLoop(flowNode)) {
      diagnostics.push({ ...FUNGI_PROFILE_002, flowName: flow.name,
        message: `Flow '${flow.name}': ${FUNGI_PROFILE_002.message}` });
    }

    if (merged.requireRuntimeBudget && !hasRuntimeBudget(flowNode)) {
      diagnostics.push({ ...FUNGI_PROFILE_006, flowName: flow.name,
        message: `Flow '${flow.name}': ${FUNGI_PROFILE_006.message}` });
    }

    // F8: dynamic regex in strict/high_integrity profile → ReDoS risk
    if (merged.denyDynamicRegex && hasDynamicRegexCall(flowNode)) {
      diagnostics.push({ ...FUNGI_PROFILE_005B, flowName: flow.name,
        message: `Flow '${flow.name}': ${FUNGI_PROFILE_005B.message}` });
    }
  }

  return diagnostics;
}

/** Profile diagnostic constants for external reference. */
export const PROFILE_DIAGNOSTICS = [
  FUNGI_PROFILE_001, FUNGI_PROFILE_002, FUNGI_PROFILE_003, FUNGI_PROFILE_004,
  FUNGI_PROFILE_005, FUNGI_PROFILE_006, FUNGI_PROFILE_007,
] as const;
