#!/usr/bin/env node
// graph-all.mjs — run ALL THREE Galerina graph generators in one shot (RD-0124 follow-up).
//
// "run graph" / the `graph` command historically ran ONLY the project graph. There are in fact three
// distinct graph generators, and the per-package Hardened Border + the KB cross-reference graph were
// never in the regular cadence. This runs all three so "the graphs" stay current together:
//   1. PROJECT graph  -> build/graph/      (the project knowledge graph; node cli graph)
//   2. KB graph       -> build/kb-graph/   (doc cross-refs; the orphan/broken-link signal the
//                                           stray-docs audit reads — must be fresh for that audit)
//   3. PACKAGE graph  -> per-package .graph/ + the Hardened Border `--check` across EVERY package
//                        (catches a new external dependency / border drift — a security gate)
//
// Informational: ALWAYS exits 0 (like run-phase-close). The Hardened-Border drift count is REPORTED,
// not fatal — committing the regenerated .graph/ evidence is what makes the drift diff-visible.
//   node scripts/graph-all.mjs           run all three
//   node scripts/graph-all.mjs --quiet   summary only
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const quiet = process.argv.includes("--quiet");
const node = process.execPath;
const run = (args) => spawnSync(node, args, { encoding: "utf8" });
const log = (s) => { if (!quiet) console.log(s); };

// 1. project graph
log("── 1/3 project graph (build/graph/) ──");
const g1 = run(["packages-galerina/galerina-core-cli/dist/index.js", "graph", "--out", "build/graph"]);
const nodes = (g1.stdout.match(/Nodes:\s*(\d+)/) ?? [])[1] ?? "?";
const edges = (g1.stdout.match(/Edges:\s*(\d+)/) ?? [])[1] ?? "?";
log(`   project graph: ${nodes} nodes / ${edges} edges (exit ${g1.status})`);

// 2. kb graph
log("── 2/3 kb graph (build/kb-graph/) ──");
const g2 = run(["packages-galerina/galerina-devtools-kb-graph/dist/cli.js", "--out", "build/kb-graph"]);
const orphans = (g2.stdout.match(/Orphans:\s*(\d+)/) ?? [])[1] ?? "?";
const broken = (g2.stdout.match(/Stale:\s*(\d+)/) ?? [])[1] ?? "?";
log(`   kb graph: ${orphans} orphans / ${broken} broken links (exit ${g2.status})`);

// 3. package graph — Hardened Border --check across every package
log("── 3/3 package graph — Hardened Border --check (all packages) ──");
let pass = 0, fail = 0;
const drifted = [];
const root = "packages-galerina";
for (const name of readdirSync(root)) {
  const pkg = join(root, name);
  if (!existsSync(join(pkg, "package.json"))) continue;
  const r = run(["packages-galerina/galerina-devtools-package-graph/dist/cli.js", "--scope", pkg, "--check"]);
  if (r.status === 0) pass++;
  else { fail++; drifted.push(name); }
}
log(`   Hardened Border: ${pass} PASS / ${fail} FAIL${fail ? " (border drift): " + drifted.join(", ") : ""}`);

console.log(`graph-all: project ${nodes}n/${edges}e · kb ${orphans} orphans/${broken} broken · border ${pass} pass/${fail} drift${fail ? " [" + drifted.join(",") + "]" : ""}`);
process.exit(0); // informational — never fatal
