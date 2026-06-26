// =============================================================================
// Flow dependency analysis — the //@USES / //@USEDBY / //@IMPACT vocabulary (R&D 0045)
//
// Computes, per flow, the OBSERVED call graph from the AST (no git, no extra analysis):
//   - USES   : upstream  — the flows THIS flow calls (out-edges)
//   - USEDBY : downstream — the flows that call THIS flow (direct callers / "dependants")
//   - IMPACT : transitive downstream blast-radius (every flow that reaches this via calls);
//              IMPACT 0 ⟺ nothing depends on it ⟹ safe to delete.
//
// Reuses the same callee-resolution pattern as SPORE-GOV-013 (findNodes(flow,"callExpr") → match a
// flow name). Only flow→flow calls count; stdlib/method calls (`Db.fetch`) are not flows. This is
// the generated-tier data behind the `//spore:` comments the CLI writes; the contract.architecture
// `depends_on` (authored intent) should agree with `//spore: USES` (observed reality) — a mismatch is a WARN.
// =============================================================================

import type { AstNode } from "./parser.js";
import { findNodes } from "./gir-emitter.js";

export interface FlowDependencies {
  /** Upstream — flows THIS flow calls (sorted, unique, flow→flow only). */
  readonly uses: readonly string[];
  /** Downstream — flows that directly call THIS flow ("dependants"). */
  readonly usedBy: readonly string[];
  /** Transitive downstream blast-radius (all flows that reach this via calls). 0 ⟹ safe to delete. */
  readonly impact: number;
}

const FLOW_KINDS = new Set(["pureFlowDecl", "flowDecl", "secureFlowDecl", "guardedFlowDecl"]);

/**
 * Build the per-flow dependency map (USES / USEDBY / IMPACT) for a program AST.
 * Self-calls (recursion) are excluded (a flow does not "use" itself).
 */
export function analyzeFlowDependencies(ast: AstNode): Map<string, FlowDependencies> {
  // 1. Collect top-level flow declarations by name.
  const flowNodes = new Map<string, AstNode>();
  for (const child of ast.children ?? []) {
    if (FLOW_KINDS.has(child.kind) && (child.value ?? "") !== "") {
      flowNodes.set(child.value as string, child);
    }
  }
  const names = [...flowNodes.keys()];

  // 2. Direct edges from each flow's flow→flow callExpr nodes.
  const uses = new Map<string, Set<string>>();
  const usedBy = new Map<string, Set<string>>();
  for (const n of names) { uses.set(n, new Set()); usedBy.set(n, new Set()); }
  for (const [name, node] of flowNodes) {
    for (const call of findNodes(node, "callExpr")) {
      const callee = call.value ?? "";
      if (callee !== "" && callee !== name && flowNodes.has(callee)) {
        uses.get(name)!.add(callee);
        usedBy.get(callee)!.add(name);
      }
    }
  }

  // 3. Transitive downstream impact = the closure over USEDBY edges (cycle-safe).
  const out = new Map<string, FlowDependencies>();
  for (const name of names) {
    const seen = new Set<string>();
    const stack = [...usedBy.get(name)!];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === name || seen.has(cur)) continue;
      seen.add(cur);
      for (const up of usedBy.get(cur) ?? []) {
        if (up !== name && !seen.has(up)) stack.push(up);
      }
    }
    out.set(name, {
      uses: [...uses.get(name)!].sort(),
      usedBy: [...usedBy.get(name)!].sort(),
      impact: seen.size,
    });
  }
  return out;
}

/** One parsed source file contributing flows to a whole-program (cross-file) analysis. */
export interface ProgramFile {
  /** The file path the flows were declared in (used to attribute the generated block back). */
  readonly file: string;
  /** The parsed program AST for that file. */
  readonly ast: AstNode;
}

/** Whole-program flow dependency analysis, spanning every supplied file. */
export interface ProgramFlowAnalysis {
  /** flow name → cross-file USES / USEDBY / IMPACT (callers from ANY file are counted). */
  readonly deps: Map<string, FlowDependencies>;
  /** flow name → the file that first declared it (duplicate names union their edges). */
  readonly fileByFlow: Map<string, string>;
}

/**
 * Cross-file dependency analysis for a whole app/package. Merges every file's top-level flow
 * declarations into ONE synthetic program AST, then runs {@link analyzeFlowDependencies} once — so
 * USES / USEDBY / IMPACT span file boundaries. The point: a flow called from ANOTHER file correctly
 * shows that USEDBY and is therefore NOT mislabelled `IMPACT: (0) — safe to delete`. A per-file loop
 * would emit that fail-OPEN "safe to delete" lie at every file boundary; this does not.
 *
 * A flow name declared in two files UNIONS their call edges. That is deliberately fail-SAFE for the
 * delete signal: a shared name can only OVER-count USEDBY (claim a dependant that belongs to the
 * other declaration), never UNDER-count — so it can never produce a false "safe to delete".
 */
export function analyzeProgramFlowDependencies(files: readonly ProgramFile[]): ProgramFlowAnalysis {
  const mergedChildren: AstNode[] = [];
  const fileByFlow = new Map<string, string>();
  for (const { file, ast } of files) {
    for (const child of ast.children ?? []) {
      if (FLOW_KINDS.has(child.kind) && (child.value ?? "") !== "") {
        mergedChildren.push(child);
        if (!fileByFlow.has(child.value as string)) fileByFlow.set(child.value as string, file);
      }
    }
  }
  const merged: AstNode = { kind: "program", children: mergedChildren };
  return { deps: analyzeFlowDependencies(merged), fileByFlow };
}

/**
 * Render the canonical generated `//spore:` dependency comment lines for one flow (R&D 0045 vocabulary).
 * Count-prefixed `(N)` so the blast-radius is visible even if a long list is truncated by a writer.
 * USES/USEDBY are omitted when empty; IMPACT always renders (it carries the safe-to-delete signal).
 */
export function renderDependencyComments(deps: FlowDependencies): string[] {
  const lines: string[] = [];
  if (deps.uses.length > 0) {
    lines.push(`//spore: USES: (${deps.uses.length}) ${deps.uses.join(", ")}`);
  }
  if (deps.usedBy.length > 0) {
    lines.push(`//spore: USEDBY: (${deps.usedBy.length}) ${deps.usedBy.join(", ")}`);
  }
  lines.push(deps.impact === 0 ? `//spore: IMPACT: (0) — safe to delete` : `//spore: IMPACT: (${deps.impact})`);
  return lines;
}

/**
 * Rewrite a .spore source so each flow has its current generated `//spore:` block immediately above its
 * declaration. SILENTLY OVERWRITES the old contiguous `//spore:` block (R&D 0045 decision #3 — the generated
 * tier is machine-owned). Touches ONLY `//spore:` lines: removes the contiguous run of `//spore:` lines directly
 * above a flow declaration and inserts the fresh block — never a human `//` line, a `contract`, or any code.
 * Processes bottom-up so line indices stay valid; idempotent when the metadata is already current.
 * `genByFlow` maps a flow name → its fresh `//spore:` lines (renderDependencyComments + renderComplexityComment).
 */
export function rewriteGeneratedComments(
  source: string,
  genByFlow: ReadonlyMap<string, readonly string[]>,
): string {
  const lines = source.split("\n");
  const flowRe = /^(\s*)(?:pure\s+|secure\s+|guarded\s+)?flow\s+(\w+)\b/;
  for (let i = lines.length - 1; i >= 0; i--) {
    const fm = (lines[i] ?? "").match(flowRe);
    if (fm === null) continue;
    const gen = genByFlow.get(fm[2] as string);
    if (gen === undefined) continue;
    const indent = fm[1] ?? "";
    let start = i;
    while (start - 1 >= 0 && /^\s*\/\/spore:/.test(lines[start - 1] ?? "")) start--;
    lines.splice(start, i - start, ...gen.map((l) => indent + l));
    i = start; // continue scanning above the block we just wrote
  }
  return lines.join("\n");
}
