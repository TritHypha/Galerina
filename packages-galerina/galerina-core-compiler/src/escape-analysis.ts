// =============================================================================
// escape-analysis.ts — conservative intra-procedural escape analysis for record
// literals (#96 §a / RD-0446 bump-arena / #128 memory safety).
// =============================================================================
// PURPOSE. A flow-local record `let r = { #record … }` may lower to the fast
// flow-local bump-arena ONLY if `r` does not OUTLIVE its flow. If `r` escapes
// (is returned, passed to another flow, or embedded in something that escapes)
// its storage must survive the flow — so it takes the always-correct host ABI,
// never the reclaimable arena. Reclaiming an escaping record's storage is the
// #128 dangling-pointer / use-after-free class; this analysis is the load-bearing
// safety argument that keeps that shut.
//
// DESIGN BIAS (fail-closed). PROVE flow-local, or treat as ESCAPING — never the
// reverse. A record the analysis does not fully understand escapes. This is a
// CONSERVATIVE intra-procedural analysis: sound for safety (no false "flow-local"),
// imprecise only in the safe direction (a genuinely-local record whose use is
// unclassifiable takes the host ABI — costing an optimisation, never correctness).
//
// SCOPE. Increment 1 = the pure `recordEscapes` predicate + over-approximated
// aliasing + the redundant `assertFlowLocal` guard, verifiable in ISOLATION with
// NO emitter change. The consumer (the arena-vs-host emit fork) is increment 2.
//
// NOTE (grounded 2026-07-17). At the record-literal site the current wat-emitter
// already inline bump-allocates from `$__fungi_heap` (it does NOT call a host-ABI
// handle — that is a separate boundary concern in wasm-runtime.ts). The #96 §a
// lever is the per-flow arena RESET; this predicate gates which records the reset
// may reclaim. The predicate itself is emit-independent — it answers only "does
// record r outlive flow f?" — so it is correct regardless of that integration.
//
// Grounded to the real AST node kinds (wat-emitter.ts / parser.ts AstNode):
//   record literal  = callExpr { value: "#record" | "#record-update", children: [field…] }
//   record field    = a child of that callExpr; child[0] is the field VALUE expr
//   return          = returnStmt { children: [expr] }
//   call            = callExpr { value: callee, callStyle?: "method", children: args }
//   field read      = memberExpr { children: [receiver], value: fieldName }
//   binding         = letDecl | mutDecl { value: "name[: Type]", children: [init] }
//   rebind          = assignStmt { value: "name", children: [expr] }
//   variable ref    = identifier { value: name }
//   block           = block { children: [stmt…] }
// =============================================================================

import type { AstNode } from "./parser.js";

const RECORD_LITERAL_VALUES: ReadonlySet<string> = new Set(["#record", "#record-update"]);

/** A record literal: `{ #record … }` / `{ …base, f: v }`, parsed as a callExpr. */
function isRecordLiteral(n: AstNode | undefined): boolean {
  return n !== undefined && n.kind === "callExpr" && n.value !== undefined && RECORD_LITERAL_VALUES.has(n.value);
}

/** The bound name of a letDecl/mutDecl/assignStmt, stripping any `: Type` annotation. */
function bindingName(n: AstNode): string {
  return (n.value ?? "").split(":")[0]!.trim();
}

/**
 * Collect the record-literal ALLOC SITES in a flow body: the names bound by a
 * `let r = { #record … }` (or mut). These are the candidates the arena fork
 * considers; each is then classified by `recordEscapes`.
 */
export function collectRecordAllocSites(flowBody: AstNode): string[] {
  const names: string[] = [];
  const walk = (n: AstNode | undefined): void => {
    if (n === undefined) return;
    if ((n.kind === "letDecl" || n.kind === "mutDecl") && isRecordLiteral(n.children?.[0])) {
      const name = bindingName(n);
      if (name !== "") names.push(name);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(flowBody);
  return names;
}

/**
 * A(r): the over-approximated alias set of a record binding — `{r}` plus every
 * binding whose initialiser is (transitively) a PURE PASSTHROUGH of an alias
 * (`let s = r`, `let t = s`, `s = r`). Computed to a fixpoint. Over-approximating
 * is the safe direction: more names look like `r`, so more uses count as escapes.
 */
export function computeAliases(recordName: string, flowBody: AstNode): ReadonlySet<string> {
  const aliases = new Set<string>([recordName]);
  const binds: Array<{ name: string; init: AstNode | undefined }> = [];
  const collect = (n: AstNode | undefined): void => {
    if (n === undefined) return;
    if (n.kind === "letDecl" || n.kind === "mutDecl" || n.kind === "assignStmt") {
      binds.push({ name: bindingName(n), init: n.children?.[0] });
    }
    for (const c of n.children ?? []) collect(c);
  };
  collect(flowBody);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of binds) {
      if (b.name === "" || aliases.has(b.name)) continue;
      const init = b.init;
      if (init !== undefined && init.kind === "identifier" && init.value !== undefined && aliases.has(init.value)) {
        aliases.add(b.name);
        changed = true;
      }
    }
  }
  return aliases;
}

/**
 * recordEscapes — does record `recordName` OUTLIVE `flowBody`? FAIL-CLOSED.
 *
 * The ONLY proven-flow-local uses of an alias are:
 *   (i)  the RECEIVER of a `memberExpr` (`alias.field`) — a field read; the record
 *        HANDLE is not leaked, only a field value is copied out; and
 *   (ii) the pure-passthrough initialiser of an aliasing binding (`let s = alias`)
 *        — already captured in the alias set, not itself a leak.
 *
 * EVERY OTHER occurrence of an alias identifier is a NON-safe use → the record
 * escapes: returned (returnStmt child), passed to any call (callExpr arg/receiver —
 * conservatively, WITHOUT the intrinsic-allowlist precision refinement, so a bit
 * more conservative than the full RD-0446 spec), embedded as a record field VALUE
 * (callExpr "#record" child), captured in a nested `fnDecl`, used as an operator
 * operand / array element / trap condition, or ANY node kind this walk does not
 * explicitly prove safe. That last clause IS the fail-closed catch-all (e): a use
 * the analysis cannot classify counts as an escape.
 */
export function recordEscapes(recordName: string, flowBody: AstNode): boolean {
  const aliases = computeAliases(recordName, flowBody);
  const isAliasId = (n: AstNode | undefined): boolean =>
    n !== undefined && n.kind === "identifier" && n.value !== undefined && aliases.has(n.value);

  let escaped = false;
  const visit = (n: AstNode | undefined): void => {
    if (n === undefined || escaped) return;
    const kids = n.children ?? [];

    // (i) `alias.field` — a field read is a SAFE use. The receiver alias does NOT escape here. Recurse into
    //     the receiver ONLY if it is a non-alias sub-expression (which may itself escape). memberExpr carries
    //     no other alias-bearing child — `.value` is the field NAME string, not an expression.
    if (n.kind === "memberExpr") {
      const recv = kids[0];
      if (!isAliasId(recv)) visit(recv);
      return;
    }

    // (ii) `let s = alias` pure passthrough — SAFE (the aliasing is already in `aliases`). If the initialiser
    //      is a LARGER expression than a bare alias id, fall through so the alias inside it is judged in its
    //      real (possibly escaping) context.
    if ((n.kind === "letDecl" || n.kind === "mutDecl" || n.kind === "assignStmt") && isAliasId(kids[0])) {
      return;
    }

    // catch-all: ANY direct child that is an alias identifier, in any role reached here, is a NON-safe use.
    for (const c of kids) {
      if (isAliasId(c)) { escaped = true; return; }
    }
    // Recurse into every child so aliases nested deeper are judged in their own parent context.
    for (const c of kids) visit(c);
  };

  visit(flowBody);
  return escaped;
}

/**
 * assertFlowLocal — the REDUNDANT emit-time guard (defense in depth). Increment 2
 * calls this immediately BEFORE it writes the flow-local bump-arena WAT for a
 * record. If the record in fact escapes, this throws a HARD codegen error rather
 * than allowing a silent mis-lowering into the reclaimable arena. So a future
 * refactor that lets an escaping record reach the arena branch FAILS THE BUILD,
 * it does not produce a dangling pointer (#128).
 */
export function assertFlowLocal(recordName: string, flowBody: AstNode): void {
  if (recordEscapes(recordName, flowBody)) {
    throw new Error(
      `escape-analysis: record '${recordName}' escapes its flow and MUST NOT lower to the flow-local ` +
        `bump-arena (it must take the host ABI). Fail-closed #128 codegen invariant violated.`,
    );
  }
}

// =============================================================================
// The WINDOW gate — the SUFFICIENT half of the #128 argument.
// =============================================================================
// `recordEscapes` above answers "does this NAMED record's handle outlive the flow".
// That is NECESSARY but NOT SUFFICIENT to reclaim a per-iteration window, because
// it is field-type-BLIND and only classifies let/mut-BOUND records. An ANONYMOUS
// nested record literal therefore slips through (R&D finding, reproduced live):
//
//     let b = Box { item: Inner { a: 1 } }     return b.item
//     → allocSites = ["b"]  (the anonymous `Inner` is untracked)
//     → recordEscapes("b") = false  (b really is flow-local)
//     → yet `b.item` hands OUT the anonymous Inner's POINTER, which lives in b's window.
//
// Naming the inner fixes it (it becomes a tracked alloc site and escapes on its own
// → host ABI). The anonymous one has no name to classify, so nothing puts it on the
// host ABI. This is LATENT under B2's per-INVOCATION reset (the arena survives to the
// next top-level call) and only bites the per-ITERATION reset — reclaiming a window
// that built an anonymous nested record whose pointer left the iteration → dangling (#128).
// `assertFlowLocal` cannot catch it: it is per-NAMED-record, and `b` genuinely does
// not escape — the escaper is the untracked inner.
//
// The invariant a reclaim must satisfy is therefore about the WINDOW, not one record:
//   reclaim a window ONLY IF every allocation in it — named AND anonymous-nested —
//   is proven not to outlive the window.
// `windowIsArenaSafe` is that gate, and it is DEFAULT-OFF: a window the analysis
// cannot PROVE clean keeps its records on the non-reset B2 path. That makes the hole
// provably unreachable rather than merely unhit by the current benchmarks.

/**
 * Field types this analysis can PROVE are stored by VALUE in a record slot (an
 * immediate i32), so reading such a field hands out a copy — never an arena pointer.
 *
 * Deliberately MINIMAL and fail-closed. Record slots are `WAT_REC_FIELD_SIZE` bytes
 * written with `i32.store`, so only types that are genuinely an immediate i32 qualify.
 * Everything else — `String` (a handle/pointer), `Float`/`Int64` (do not fit a 4-byte
 * slot), arrays, `Option<…>`, and every record type — is NOT proven scalar and closes
 * the gate. Widening this set requires grounding that type's ACTUAL field lowering
 * first; guessing here re-opens #128.
 */
const PROVEN_SCALAR_FIELD_TYPES: ReadonlySet<string> = new Set(["Int", "Bool"]);

/** Map of record type name → (field name → declared field type), from the `record` decls. */
export type RecordFieldTypes = ReadonlyMap<string, ReadonlyMap<string, string>>;

/**
 * Build the field-type table from a parsed program: `record Box { item: Inner }`
 * parses as `recordDecl{value:"Box", children:[paramDecl{value:"item: Inner"}]}`.
 */
export function collectRecordFieldTypes(programAst: AstNode): RecordFieldTypes {
  const types = new Map<string, Map<string, string>>();
  const walk = (n: AstNode | undefined): void => {
    if (n === undefined) return;
    if (n.kind === "recordDecl" && n.value !== undefined && n.value !== "") {
      const fields = new Map<string, string>();
      for (const p of n.children ?? []) {
        if (p.kind !== "paramDecl") continue;
        const raw = p.value ?? "";
        const name = raw.split(":")[0]!.trim();
        const ty = raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : "";
        if (name !== "") fields.set(name, ty);
      }
      types.set(n.value, fields);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(programAst);
  return types;
}

/** EVERY record literal in a subtree — named alloc sites AND anonymous nested ones. */
export function collectRecordLiterals(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  const walk = (n: AstNode | undefined): void => {
    if (n === undefined) return;
    if (isRecordLiteral(n)) out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

/**
 * windowIsArenaSafe — may a per-iteration release window reclaim EVERYTHING allocated
 * inside `windowNode`? FAIL-CLOSED / DEFAULT-OFF.
 *
 * True only when every record literal in the window (named AND anonymous-nested) has a
 * RESOLVABLE declared type whose fields are ALL proven-scalar. Any of the following
 * closes the gate: an untyped/unresolvable literal, an unknown record type, a record
 * type with a record/array/String/other non-proven-scalar field, or zero known fields.
 *
 * Why "all fields scalar" rather than "no escaping record-typed field READ": a scalar-only
 * record cannot hand out an interior pointer at all, so it needs no per-field read
 * analysis — the strongest, simplest sufficient condition. A window that fails this
 * keeps its records on the non-reset B2 path (correct, just not arena-optimised).
 */
export function windowIsArenaSafe(windowNode: AstNode, fieldTypes: RecordFieldTypes): boolean {
  const literals = collectRecordLiterals(windowNode);
  for (const lit of literals) {
    const typeName = (lit as { typeName?: string }).typeName;
    if (typeName === undefined || typeName === "") return false; // anonymous/untyped → cannot prove
    const fields = fieldTypes.get(typeName);
    if (fields === undefined || fields.size === 0) return false; // unknown type → cannot prove
    for (const ty of fields.values()) {
      if (!PROVEN_SCALAR_FIELD_TYPES.has(ty)) return false;       // any non-proven-scalar field → closed
    }
  }
  return true; // vacuously true for a window with no record literals (nothing to reclaim unsafely)
}
