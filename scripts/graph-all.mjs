#!/usr/bin/env node
// graph-all.mjs — run EVERY Galerina graph-related dev tool in one shot. THIS is "run graph".
//
// "run graph" / the `graph` command historically ran ONLY the project graph. There are in fact
// SIX distinct graph tools; this runs them all so "the graphs" stay current together, and it is the
// SINGLE SOURCE OF TRUTH for what "run graph" means — run-phase-close §5 delegates its whole graph
// phase to this script, so the on-demand command and the Stop cadence can never drift apart again:
//   1. PROJECT graph       -> build/graph/          (the project knowledge graph; the `graph` CLI)
//   2. GRAPH INTEGRITY     -> validates the graph (1) just generated (RD-0121: generate-then-VALIDATE
//                             — dangling edges / cycles / corruption fail-closed; skips cleanly when
//                             the generated artifact is absent, e.g. a build-free checkout)
//   3. KB graph            -> build/kb-graph/        (doc cross-refs; the orphan/broken-link signal the
//                             stray-docs audit reads — must be fresh for that audit)
//   4. PACKAGE graph       -> per-package .graph/ + the Hardened Border `--check` across EVERY package
//                             (catches a new external dependency / border drift — a security gate)
//   5. MEMORY graph        -> .claude memory health   (dangling [[links]] / orphans / dupes)
//   6. DEV-TOOL index/graph-> build/dev-tool-index/   (packages + dev tools: coverage + gaps)
//
// Pure INDEXES (code-index, code-registry, kb-index) are a DIFFERENT family — token-saver indexes the
// audits read, not graphs — and stay in run-phase-close's own §5a step, NOT here.
//
// Informational: ALWAYS exits 0 (like run-phase-close). Drift/violation counts are REPORTED, not fatal
// — committing the regenerated build/graph + .graph/ evidence is what makes drift diff-visible; the
// ENFORCING graph-integrity + Hardened-Border gates live in lint-conventions / CI.
//   node scripts/graph-all.mjs           run all six graph tools
//   node scripts/graph-all.mjs --quiet   summary only
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const quiet = process.argv.includes("--quiet");
const node = process.execPath;
const run = (args) => spawnSync(node, args, { encoding: "utf8" });
const log = (s) => { if (!quiet) console.log(s); };
const first = (out, re, dflt = "?") => ((out ?? "").match(re) ?? [])[1] ?? dflt;

// 1. project graph
log("── 1/6 project graph (build/graph/) ──");
const g1 = run(["packages-galerina/galerina-core-cli/dist/index.js", "graph", "--out", "build/graph"]);
const nodes = first(g1.stdout, /Nodes:\s*(\d+)/);
const edges = first(g1.stdout, /Edges:\s*(\d+)/);
log(`   project graph: ${nodes} nodes / ${edges} edges (exit ${g1.status})`);

// 2. graph integrity — validate what (1) just generated (RD-0121: generate then VALIDATE)
log("── 2/6 graph integrity (validate build/graph/) ──");
const g2 = run(["scripts/audit-graph-integrity.mjs"]);
// Reads the child's `SKIPPED:` token, not its prose. This line used to be
//     /nothing to validate|not present/.test(g2.stdout)
// — a regex over an ENGLISH LOG STRING, because the child's skip and its ran-and-clean were otherwise
// identical (both `VIOLATIONS: 0`, both exit 0). That made a sentence into a protocol: reword the child's
// log — a tidy-up, a typo fix — and this silently starts reporting a skip as "0 violation(s)". Nothing in
// either file said the string was load-bearing. The child now emits a distinct SKIPPED line + exit 3.
const skipped = /^SKIPPED:\s*(.+)$/m.exec(g2.stdout ?? "");
const integrity = skipped ? `SKIPPED — ${skipped[1].trim()}` : `${first(g2.stdout, /TOTAL:\s*(\d+)/)} violation(s)`;
log(`   graph integrity: ${integrity} (exit ${g2.status})`);

// 3. kb graph
log("── 3/6 kb graph (build/kb-graph/) ──");
// --all writes json+dot+report to the CLI's hardcoded build/kb-graph/. The CLI writes NOTHING
// without an output flag (cli.ts: `if (!doJson && !doDot && !doReport) return`), so the prior
// "--out build/kb-graph" (an unrecognised arg) printed the summary but silently regenerated NO
// artifacts — leaving kb-report.md + the stray-docs audit's input stale for days.
const g3 = run(["packages-galerina/galerina-devtools-kb-graph/dist/cli.js", "--all"]);
const orphans = first(g3.stdout, /Orphans:\s*(\d+)/);
const broken = first(g3.stdout, /Stale:\s*(\d+)/);
log(`   kb graph: ${orphans} orphans / ${broken} broken links (exit ${g3.status})`);

// 4. package graph — Hardened Border --check across every package
log("── 4/6 package graph — Hardened Border --check (all packages) ──");
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

// 5. memory graph — .claude memory health
log("── 5/6 memory graph (.claude memory health) ──");
const g5 = run(["scripts/memory-graph.mjs"]);
const memory = first(g5.stdout, /HEALTH:\s*(.+)/).trim();
log(`   memory graph: ${memory} (exit ${g5.status})`);

// 6. dev-tool index/graph — packages + dev tools coverage
log("── 6/6 dev-tool index/graph (build/dev-tool-index/) ──");
const g6 = run(["scripts/dev-tool-index.mjs"]);
const devtools = first(g6.stdout, /dev-tool-index:\s*(.+?)(?:\s+→|\s+->|\n|$)/).trim();
log(`   dev-tool index: ${devtools} (exit ${g6.status})`);

console.log(`graph-all: project ${nodes}n/${edges}e · integrity ${integrity} · kb ${orphans} orphans/${broken} broken · border ${pass} pass/${fail} drift${fail ? " [" + drifted.join(",") + "]" : ""} · memory ${memory} · dev-tools ${devtools}`);
process.exit(0); // informational — never fatal
