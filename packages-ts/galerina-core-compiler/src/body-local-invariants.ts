// =============================================================================
// Galerina - body-local computed-state invariants (real I3), zero-trust defaults
//
// Rulings R-I3-1..6 (Grok Bot 2026-10-02, AGENTS reports/grok-bot-interpreter-i2-i3-20261002/
// RULINGS-DEFAULTS.md). Every ruling is a zero-trust default; the owner may revisit.
//
// ONE shared classifier for the governance verifier (FUNGI-INV-004 relaxation), the interpreter
// (FUNGI-INV-005 enforcement) and the WAT emitter (FUNGI-WAT-INV-001 refusal), so the three cannot
// drift. Narrowest admitted form (R-I3-1): an existing contract `invariant { ensure <expr> }` may
// name a local only when that local is
//   - bound by an immutable `let` that is a DIRECT statement of the flow's top-level body block,
//   - bound exactly once in the whole flow (no other binding/assignment/use-as-declaration of it),
//   - not a parameter name and not `result`,
//   - not of a governed type (protected / redacted / secret / readonly / Secret<...>).
// Anything else stays refused by FUNGI-INV-004 (typos included).
// =============================================================================

import { type AstNode } from "./parser.js";

/** One body-local `ensure`: its expression, its index among ALL ensures, and its trigger `let`. */
export interface BodyLocalInvariant {
  readonly expr: AstNode;
  readonly index: number;
  /** The top-level `letDecl` after which every referenced local is bound - the check point (R-I3-2). */
  readonly trigger: AstNode;
}

const LITERAL_KINDS: ReadonlySet<string> = new Set(["stringLiteral", "numberLiteral", "boolLiteral"]);
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Binding name of a declaration-like node value (`unsafe x: T` -> `x`). Empty string when none. */
function bindingNameOf(value: string): string {
  const stripped = value.replace(/^(unsafe|safe)\s+/, "");
  const head = stripped.split(":")[0] ?? "";
  return head.trim();
}

/** Declared type text of a binding value (`x: protected Int` -> `protected Int`). Empty when untyped. */
function bindingTypeOf(value: string): string {
  const at = value.indexOf(":");
  return at === -1 ? "" : value.slice(at + 1).trim();
}

/** Governed / secret-bearing types are RD-0873 / RD-1414 territory: refused (R-I3-1). */
function isGovernedType(typeText: string): boolean {
  return /^(protected|redacted|secret|readonly)\b/i.test(typeText) || /\bSecret\b/.test(typeText);
}

function ensureExprsOf(flowNode: AstNode): AstNode[] {
  // First match only (as Array.find), as an explicit 0-or-1 list: no absent value is ever produced.
  const out: AstNode[] = [];
  for (const contractNode of (flowNode.children ?? []).filter((c) => c.kind === "contractDecl").slice(0, 1)) {
    const blocks = (contractNode.children ?? []).filter(
      (c) => c.kind === "identifier" && c.value === "invariant:block",
    ).slice(0, 1);
    for (const invariantBlock of blocks) {
      for (const child of invariantBlock.children ?? []) {
        if (child.kind !== "ensureDecl") continue;
        for (const expr of (child.children ?? []).slice(0, 1)) out.push(expr);
      }
    }
  }
  return out;
}

/** Every identifier named anywhere in an expression, member receivers included. */
export function exprIdentifierNames(node: AstNode): ReadonlySet<string> {
  const out = new Set<string>();
  const walk = (n: AstNode): void => {
    if (n.kind === "identifier") {
      const v = n.value ?? "";
      if (v !== "") out.add(v);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

/** The flow's first top-level block as a 0-or-1 list (the explicit form of Array.find). */
function topLevelBlocks(flowNode: AstNode): readonly AstNode[] {
  return (flowNode.children ?? []).filter((c) => c.kind === "block").slice(0, 1);
}

function parameterNames(flowNode: AstNode): ReadonlySet<string> {
  return new Set(
    (flowNode.children ?? [])
      .filter((c) => c.kind === "paramDecl")
      .map((c) => bindingNameOf(c.value ?? ""))
      .filter((n) => n !== ""),
  );
}

/**
 * Eligible body-local names -> their binding `let` node and its top-level statement index.
 * Conservative by construction: a name is dropped if ANY other non-literal, non-reference node in the
 * flow body carries it as its value (another let/mut/readonly, an assignment, a for/match binder, a
 * local fn, a call of that name ...). Over-rejection is safe (it stays FUNGI-INV-004).
 */
function eligibleLets(flowNode: AstNode): ReadonlyMap<string, { readonly node: AstNode; readonly stmtIndex: number }> {
  const out = new Map<string, { readonly node: AstNode; readonly stmtIndex: number }>();
  const blocks = topLevelBlocks(flowNode);
  if (blocks.length === 0) return out;
  const block = blocks[0]!;
  const params = parameterNames(flowNode);
  const candidates = new Map<string, { readonly node: AstNode; readonly stmtIndex: number }>();
  const rejected = new Set<string>();
  (block.children ?? []).forEach((stmt, stmtIndex) => {
    if (stmt.kind !== "letDecl") return;
    const raw = stmt.value ?? "";
    const name = bindingNameOf(raw);
    if (!IDENT_RE.test(name) || name === "result" || params.has(name) || isGovernedType(bindingTypeOf(raw))) {
      rejected.add(name);
      return;
    }
    if (candidates.has(name)) rejected.add(name);
    else candidates.set(name, { node: stmt, stmtIndex });
  });
  // Any OTHER node in the body that declares/assigns/names the same identifier disqualifies it.
  const walk = (n: AstNode): void => {
    if (n.kind !== "identifier" && !LITERAL_KINDS.has(n.kind)) {
      const nm = bindingNameOf(n.value ?? "");
      if (candidates.has(nm) && candidates.get(nm)!.node !== n) rejected.add(nm);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(block);
  for (const [name, entry] of candidates) if (!rejected.has(name)) out.set(name, entry);
  return out;
}

/** R-I3-1: the names an `ensure` may reference beyond the parameters (and `result` for post-conditions). */
export function bodyLocalInvariantNames(flowNode: AstNode): ReadonlySet<string> {
  return new Set(eligibleLets(flowNode).keys());
}

/** True when an ensure is a body-local invariant: no `result`, and it names at least one eligible local. */
export function isBodyLocalEnsure(flowNode: AstNode, expr: AstNode): boolean {
  const ids = exprIdentifierNames(expr);
  if (ids.has("result")) return false;
  const names = bodyLocalInvariantNames(flowNode);
  for (const id of ids) if (names.has(id)) return true;
  return false;
}

/** The enforcement plan (R-I3-2): each body-local ensure with the `let` after which it is checked. */
export function bodyLocalInvariantPlan(flowNode: AstNode): readonly BodyLocalInvariant[] {
  const lets = eligibleLets(flowNode);
  if (lets.size === 0) return [];
  const out: BodyLocalInvariant[] = [];
  ensureExprsOf(flowNode).forEach((expr, index) => {
    const ids = exprIdentifierNames(expr);
    if (ids.has("result")) return;
    let trigger: { readonly node: AstNode; readonly stmtIndex: number } | "none" = "none";
    for (const id of ids) {
      if (!lets.has(id)) continue;
      const entry = lets.get(id)!;
      if (trigger === "none" || entry.stmtIndex > trigger.stmtIndex) trigger = entry;
    }
    if (trigger !== "none") out.push({ expr, index, trigger: trigger.node });
  });
  return out;
}

export function flowHasBodyLocalInvariants(flowNode: AstNode): boolean {
  return bodyLocalInvariantPlan(flowNode).length > 0;
}