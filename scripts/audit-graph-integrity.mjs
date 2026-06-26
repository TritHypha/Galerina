#!/usr/bin/env node
// audit-graph-integrity.mjs — structural validation of the project graph (R&D 0121).
//
// `galerina graph` GENERATES build/graph/*.json + reports but runs NO validation — so "no cycles
// flagged" means "not checked", not "proven absent" (RD-0121). This audit is the missing check. It is
// VALIDATE-IF-PRESENT: the graph JSON is a ~3MB GENERATED artifact (gitignored; the CLI dist is not
// committed), so it is absent in a build-free checkout — there the audit skips cleanly (run it after
// `galerina graph`, locally / pre-commit / a build-full job). When a graph IS present it validates
// fail-closed (a present-but-corrupt graph is a hard violation). The --self-test runs build-free in CI
// to guarantee the detectors are never silently neutered. Checks:
//
//   (1) NO DANGLING EDGE — every edge.from / edge.to references an existing node id. A reference to a
//       non-existent node is a structural corruption (a malformed-but-emittable graph the renderer
//       would write without complaint).
//   (2) NO DUPLICATE NODE ID — node ids are unique (a collision silently merges two entities).
//   (3) THE depends_on SUBGRAPH IS A DAG — no circular PACKAGE dependency (a cycle is a real
//       build/governance hazard; reported with the offending path).
//
// Exit code = total violation count (0 = clean). Run from repo root.
//   node scripts/audit-graph-integrity.mjs            → validate the committed graph
//   node scripts/audit-graph-integrity.mjs --self-test → prove the detectors fire on synthetic corruption
//
// Note: validates the COMMITTED graph; a regenerate-and-diff staleness gate (needs a build) is a
// separate richer follow-up (RD-0121).

import { readFileSync, existsSync } from "node:fs";

const GRAPH = "build/graph/galerina-devtools-project-graph.json";

// ── pure detectors (also exercised by --self-test) ───────────────────────────────────────────────
export function findDanglingEdges(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const bad = [];
  for (const e of edges) {
    if (!ids.has(e.from)) bad.push(`dangling edge.from '${e.from}' (→ '${e.to}', kind ${e.kind ?? e.type})`);
    if (!ids.has(e.to)) bad.push(`dangling edge.to '${e.to}' (from '${e.from}', kind ${e.kind ?? e.type})`);
  }
  return bad;
}

export function findDuplicateNodeIds(nodes) {
  const seen = new Set(), dup = [];
  for (const n of nodes) {
    if (seen.has(n.id)) dup.push(n.id);
    else seen.add(n.id);
  }
  return dup;
}

/** Return a cycle path (array of node ids) in the given edge-kind subgraph, or null if it is a DAG. */
export function findDependencyCycle(edges, kind = "depends_on") {
  const adj = new Map();
  for (const e of edges) {
    if ((e.kind ?? e.type) !== kind) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];
  function dfs(u) {
    color.set(u, GRAY); stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) return [...stack.slice(stack.indexOf(v)), v]; // back-edge → cycle
      if (c === WHITE) { const r = dfs(v); if (r) return r; }
    }
    color.set(u, BLACK); stack.pop(); return null;
  }
  for (const u of adj.keys()) {
    if ((color.get(u) ?? WHITE) === WHITE) { const r = dfs(u); if (r) return r; }
  }
  return null;
}

/** Nodes whose declared sourcePath does NOT exist on disk (stale graph / dangling source reference). */
export function findStaleSourcePaths(nodes, exists) {
  const bad = [];
  for (const n of nodes) {
    if (typeof n.sourcePath === "string" && n.sourcePath.length > 0 && !exists(n.sourcePath)) {
      bad.push(`node '${n.id}' → sourcePath '${n.sourcePath}' does not exist (stale graph / dangling source)`);
    }
  }
  return bad;
}

// ── self-test: prove the detectors actually fire (a neutered audit is itself a fail-open) ─────────
if (process.argv.includes("--self-test")) {
  const nodes = [{ id: "a" }, { id: "b" }, { id: "b" }]; // b duplicated
  const edges = [
    { from: "a", to: "ghost", kind: "provides" }, // dangling
    { from: "a", to: "b", kind: "depends_on" },
    { from: "b", to: "a", kind: "depends_on" },    // a→b→a cycle
  ];
  const dangling = findDanglingEdges(nodes, edges).length > 0;
  const dups = findDuplicateNodeIds(nodes).length > 0;
  const cycle = findDependencyCycle(edges) !== null;
  const cleanCycle = findDependencyCycle([{ from: "a", to: "b", kind: "depends_on" }]) === null;
  const stale = findStaleSourcePaths([{ id: "x", sourcePath: "no/such/file.md" }], () => false).length > 0;
  const ok = dangling && dups && cycle && cleanCycle && stale;
  console.log(`[self-test] dangling: ${dangling} | dup-id: ${dups} | cycle: ${cycle} | DAG-clean: ${cleanCycle} | stale-path: ${stale}`);
  console.log(ok ? "[self-test] PASS — all graph-integrity detectors fire" : "[self-test] FAIL");
  process.exit(ok ? 0 : 1);
}

// ── validate the committed graph ───────────────────────────────────────────────────────────────
if (!existsSync(GRAPH)) {
  // The graph JSON is a ~3MB GENERATED artifact (gitignored; the CLI dist is not committed) so it is
  // absent in a build-free checkout. Absence means "no graph to validate here", NOT "the graph is
  // corrupt" — so this validate-IF-PRESENT audit SKIPS cleanly. It is NOT fail-open: a PRESENT graph
  // is always validated fail-closed (below); only the nothing-to-validate case skips. Run it after
  // `galerina graph` (locally / pre-commit / a build-full CI), where it has a graph to check.
  console.log(`[graph-integrity] ${GRAPH} not present (generated artifact) — nothing to validate; run \`galerina graph\` first.`);
  console.log("VIOLATIONS: 0");
  console.log("TOTAL: 0 graph-integrity violation(s) (skipped — no generated graph present)");
  process.exit(0);
}
let graph;
try { graph = JSON.parse(readFileSync(GRAPH, "utf8")); }
catch (e) { console.error(`[graph-integrity] could not parse ${GRAPH}: ${e.message} — fail-closed`); console.log("VIOLATIONS: 1"); process.exit(1); }

const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const edges = Array.isArray(graph.edges) ? graph.edges : [];

const violations = [];
for (const d of findDanglingEdges(nodes, edges)) violations.push(d);
for (const id of findDuplicateNodeIds(nodes)) violations.push(`duplicate node id '${id}'`);
for (const s of findStaleSourcePaths(nodes, existsSync)) violations.push(s);
const cycle = findDependencyCycle(edges);
if (cycle) violations.push(`CIRCULAR package dependency: ${cycle.join(" → ")}`);

console.log(`graph-integrity: ${nodes.length} nodes, ${edges.length} edges (${edges.filter((e) => (e.kind ?? e.type) === "depends_on").length} depends_on)`);
for (const v of violations) console.log(`  ✖ ${v}`);
console.log(violations.length === 0 ? "graph-integrity: structurally valid (no dangling edge / dup id / dependency cycle)." : `graph-integrity: ${violations.length} structural violation(s).`);
console.log(`VIOLATIONS: ${violations.length}`);
console.log(`TOTAL: ${violations.length} graph-integrity violation(s)`);
process.exit(violations.length);
