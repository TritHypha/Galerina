// Closed-shape dependency-tree explain (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Reads a declared ExplainDependencyTree JSON object and emits dependency-label
// traces. Does NOT walk the live filesystem or package graph. Edges are closed
// {from,to} dotted-token pairs rooted at `root`. Never throws. Never echoes
// refused values / paths / keys.
//
// Codes: FUNGI-EXPLAIN-007 shape/schema, FUNGI-EXPLAIN-008 domain (token/edge/
// reachability/cycle/duplicate).

import {
  FUNGI_EXPLAIN_001,
  FUNGI_EXPLAIN_004,
  createExplainResult,
  type ExplainDiagnostic,
  type ExplainDiagnosticField,
  type ExplainResult,
  type ExplainTrace,
} from "./explain-trace.js";

/** Dependency-tree record is not a closed data object / wrong schema / missing fields. */
export const FUNGI_EXPLAIN_007 = "FUNGI-EXPLAIN-007";
/** Dependency-tree domain refuse (token / edge / reachability / cycle / duplicate). */
export const FUNGI_EXPLAIN_008 = "FUNGI-EXPLAIN-008";

export const EXPLAIN_DEPENDENCY_TREE_SCHEMA = "galerina.explain-dependency-tree/v1";

export const EXPLAIN_DEPENDENCY_TREE_FIELDS = Object.freeze([
  "schema",
  "root",
  "edges",
] as const);

export const EXPLAIN_DEPENDENCY_EDGE_FIELDS = Object.freeze(["from", "to"] as const);

export interface ExplainDependencyEdge {
  readonly from: string;
  readonly to: string;
}

export interface ExplainDependencyTree {
  readonly schema: typeof EXPLAIN_DEPENDENCY_TREE_SCHEMA;
  readonly root: string;
  readonly edges: readonly ExplainDependencyEdge[];
}

const TOKEN = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;
const MAX_TOKEN = 128;
const MAX_EDGES = 4096;
const MAX_TRACES = 8192;
const KNOWN = new Set<string>(EXPLAIN_DEPENDENCY_TREE_FIELDS);
const EDGE_KNOWN = new Set<string>(EXPLAIN_DEPENDENCY_EDGE_FIELDS);

const diag = (code: string, message: string, field: ExplainDiagnosticField): ExplainDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, field });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function snapshotRecord(value: unknown, maxKeys: number): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return { ok: false };
    const values = new Map<string, unknown>();
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) return { ok: false };
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return { ok: false };
      values.set(key, d.value);
    }
    return { ok: true, values };
  } catch {
    return { ok: false };
  }
}

function snapshotArray(value: unknown, max: number): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    if (value.length > max) return undefined;
    // Dense own indices only; refuse holes / accessors on the array object itself.
    for (let i = 0; i < value.length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
    }
    return value as readonly unknown[];
  } catch {
    return undefined;
  }
}

function readToken(
  value: unknown,
  field: ExplainDiagnosticField,
  out: ExplainDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TOKEN || !TOKEN.test(value)) {
    out.push(diag(FUNGI_EXPLAIN_008, "Dependency token is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readEdge(
  value: unknown,
  out: ExplainDiagnostic[],
): ExplainDependencyEdge | undefined {
  const snap = snapshotRecord(value, EXPLAIN_DEPENDENCY_EDGE_FIELDS.length + 4);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_007, "Dependency edge must be a plain data object.", "record"));
    return undefined;
  }
  for (const key of snap.values.keys()) {
    if (!EDGE_KNOWN.has(key)) {
      out.push(diag(FUNGI_EXPLAIN_007, "Dependency edge has an unknown key.", "record"));
      return undefined;
    }
  }
  for (const req of EXPLAIN_DEPENDENCY_EDGE_FIELDS) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_EXPLAIN_007, "Dependency edge is missing a required field.", "record"));
      return undefined;
    }
  }
  const from = readToken(snap.values.get("from"), "input", out);
  if (from === undefined) return undefined;
  const to = readToken(snap.values.get("to"), "output", out);
  if (to === undefined) return undefined;
  if (from === to) {
    out.push(diag(FUNGI_EXPLAIN_008, "Dependency edge must not be a self-loop.", "record"));
    return undefined;
  }
  return Object.freeze({ from, to });
}

/**
 * Read a closed-shape ExplainDependencyTree. Never throws; never echoes values.
 */
export function readExplainDependencyTree(
  value: unknown,
):
  | { readonly ok: true; readonly value: ExplainDependencyTree }
  | { readonly ok: false; readonly diagnostics: readonly ExplainDiagnostic[] } {
  const out: ExplainDiagnostic[] = [];
  const snap = snapshotRecord(value, EXPLAIN_DEPENDENCY_TREE_FIELDS.length + 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_EXPLAIN_007, "ExplainDependencyTree must be a plain data object.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  for (const key of snap.values.keys()) {
    if (!KNOWN.has(key)) {
      out.push(diag(FUNGI_EXPLAIN_007, "ExplainDependencyTree has an unknown key.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  for (const req of EXPLAIN_DEPENDENCY_TREE_FIELDS) {
    if (!snap.values.has(req)) {
      out.push(diag(FUNGI_EXPLAIN_007, "ExplainDependencyTree is missing a required field.", "record"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
  }
  if (snap.values.get("schema") !== EXPLAIN_DEPENDENCY_TREE_SCHEMA) {
    out.push(diag(FUNGI_EXPLAIN_007, "ExplainDependencyTree schema is not admitted.", "record"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const root = readToken(snap.values.get("root"), "input", out);
  if (root === undefined) return { ok: false, diagnostics: Object.freeze(out) };

  const edgeItems = snapshotArray(snap.values.get("edges"), MAX_EDGES);
  if (edgeItems === undefined) {
    out.push(diag(FUNGI_EXPLAIN_007, "edges must be a dense array within bounds.", "traces"));
    return { ok: false, diagnostics: Object.freeze(out) };
  }
  const edges: ExplainDependencyEdge[] = [];
  const seen = new Set<string>();
  const reachable = new Set<string>([root]);
  for (const item of edgeItems) {
    const edge = readEdge(item, out);
    if (edge === undefined) return { ok: false, diagnostics: Object.freeze(out) };
    const key = `${edge.from}\0${edge.to}`;
    if (seen.has(key)) {
      out.push(diag(FUNGI_EXPLAIN_008, "Dependency edges must be unique.", "traces"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    seen.add(key);
    if (!reachable.has(edge.from)) {
      out.push(diag(FUNGI_EXPLAIN_008, "Dependency edge from-token is not reachable from root.", "input"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    if (reachable.has(edge.to)) {
      // Reaching an already-reachable node via a new edge is a cycle or diamond;
      // diamonds are allowed only if `to` was not previously introduced as a child
      // of a different path that would re-enter `from`. Refuse cycles: if `to`
      // is already reachable, the edge closes a cycle.
      out.push(diag(FUNGI_EXPLAIN_008, "Dependency edge introduces a cycle.", "output"));
      return { ok: false, diagnostics: Object.freeze(out) };
    }
    reachable.add(edge.to);
    edges.push(edge);
  }
  return {
    ok: true,
    value: Object.freeze({
      schema: EXPLAIN_DEPENDENCY_TREE_SCHEMA,
      root,
      edges: Object.freeze(edges),
    }),
  };
}

/**
 * Explain a closed dependency tree as dependency-label traces.
 * Never throws. On refuse returns empty traces + diagnostics.
 */
export function explainDependencyTree(value: unknown): ExplainResult {
  const read = readExplainDependencyTree(value);
  if (!read.ok) {
    return createExplainResult([], [], [], [], read.diagnostics);
  }
  const traces: ExplainTrace[] = [];
  // Root identity step (dependency from synthetic subject to root).
  traces.push(
    Object.freeze({
      step: 0,
      label: "dependency" as const,
      input: "tree.root",
      output: read.value.root,
      diagnostics: Object.freeze([]),
    }),
  );
  for (let i = 0; i < read.value.edges.length; i += 1) {
    const edge = read.value.edges[i]!;
    traces.push(
      Object.freeze({
        step: i + 1,
        label: "dependency" as const,
        input: edge.from,
        output: edge.to,
        diagnostics: Object.freeze([]),
      }),
    );
  }
  if (traces.length > MAX_TRACES) {
    return createExplainResult(
      [],
      [],
      [],
      [],
      [diag(FUNGI_EXPLAIN_004, "Trace count exceeds the closed upper bound.", "traces")],
    );
  }
  return createExplainResult(traces, [], [], [], []);
}
