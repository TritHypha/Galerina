#!/usr/bin/env node
// ts-retirement-graph.mjs — graph 7/7: the LIVE `.ts` retirement meter (owner-directed 2026-07-16:
// "build a dev tool as part of the % to track .ts using graph").
//
// WHY: "why does *.ts still exist?" must be answerable with a NUMBER per retirement path, not prose.
// Every tracked `.ts` under packages-galerina/*/src retires through exactly one of three events:
//   1. #143 R4 flip     — it has a `.fungi` TWIN beside it (same package, same stem); the flip deletes
//                          the .ts decider once its twin is authoritative (today: 27 differential / 0
//                          authoritative — nothing flipped yet, by design).
//   2. bootstrap fixpoint — it IS the compiler (galerina-core-compiler): the .fungi stages are compiled
//                          BY this .ts, so it retires last (post-v1, self-hosting Stages 3-6).
//   3. the #38 migration — everything else: the 49-package codemod program (owner-gated re-sign).
// This tool derives those buckets from the tree and writes build/ts-retirement/ so component-health's
// % audit reads the numbers LIVE (tool = source; no hand-typed count to drift — the version.json rule).
//
// FIND: myco (the graph finder) ∪ `git ls-files` (the tracked-corpus source of truth), with finder-drift
// reporting — the audit-fungi-corpus-check pattern, verified there (dotted queries under-match; token
// query + extension filter is the reliable shape).
//
//   node scripts/ts-retirement-graph.mjs              # regenerate build/ts-retirement/ + summary line
//   node scripts/ts-retirement-graph.mjs --self-test  # finder coverage + a known twin pair + sum check
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { findCorpus, findTracked } from "./lib/find-files.mjs"; // THE shared graph∪git finder (owner rule: no per-tool globs)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "ts-retirement");

// The bounded-TCB FLOOR (census handover §2): these stay .ts/native forever by ruling — crypto
// primitives, host seams, pure-algorithm devtools. A floor .ts is not "unfinished"; it is the TCB.
const FLOOR_PACKAGES = new Set(["galerina-substrate-math", "galerina-devtools-graph-algorithms", "galerina-core-security"]);

export function buildRetirementGraph() {
  const scope = /^packages-galerina\/[^/]+\/src\//;
  const { files: ts, finder, finderDrift } = findCorpus(".ts", ["packages-galerina/*/src/**/*.ts"], scope);
  const fungi = findTracked("packages-galerina/*/src/**/*.fungi").filter((p) => scope.test(p));
  const pkgOf = (p) => p.split("/")[1];
  const stem = (p) => basename(p).replace(/\.(ts|fungi)$/, "");
  // twin key = package + stem: secret-gate.fungi twins secret-gate.ts IN THE SAME PACKAGE.
  const twinKeys = new Set(fungi.map((f) => `${pkgOf(f)}::${stem(f)}`));

  const perPackage = {}; const twinnedPairs = [];
  let twinned = 0, compilerCore = 0, floor = 0, program = 0;
  for (const f of ts) {
    const pkg = pkgOf(f);
    const pp = (perPackage[pkg] ??= { ts: 0, twinned: 0, fungi: 0 });
    pp.ts++;
    if (twinKeys.has(`${pkg}::${stem(f)}`)) { twinned++; pp.twinned++; twinnedPairs.push(f); }
    else if (pkg === "galerina-core-compiler") compilerCore++;
    else if (FLOOR_PACKAGES.has(pkg)) floor++;
    else program++;
  }
  for (const f of fungi) (perPackage[pkgOf(f)] ??= { ts: 0, twinned: 0, fungi: 0 }).fungi++;
  return {
    generated: "ts-retirement-graph",
    totals: { ts: ts.length, twinned, compilerCore, floor, program, fungiInSrc: fungi.length, packages: Object.keys(perPackage).length, finderDrift, authoritativeFlips: 0 },
    retirementPaths: {
      twinned: "→ #143 R4 authority flips (twin proven differential — authority: .ts, R4 pending, 0 flipped)",
      compilerCore: "→ bootstrap fixpoint (the .fungi stages are compiled BY this .ts — retires last, post-v1)",
      floor: "→ NEVER (bounded-TCB floor by ruling: crypto primitives, host seams, pure-algorithm devtools)",
      program: "→ the #38 migration codemod program (owner-gated re-sign ceremony)",
    },
    perPackage, twinnedPairs,
  };
}

if (process.argv.includes("--self-test")) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const g = buildRetirementGraph();
  ok(g.totals.ts > 300, `corpus found: ${g.totals.ts} tracked .ts in package src trees`);
  ok(g.totals.finderDrift <= 0 || g.totals.finderDrift === -1, g.totals.finderDrift === -1
    ? "myco unavailable — git index alone (degraded but complete for tracked)"
    : `graph finder covers the tracked corpus (drift=${g.totals.finderDrift})`);
  ok(g.twinnedPairs.includes("packages-galerina/galerina-framework-app-kernel/src/secret-gate.ts"), "known twin pair detected: secret-gate.ts ↔ secret-gate.fungi");
  ok(g.totals.twinned + g.totals.compilerCore + g.totals.floor + g.totals.program === g.totals.ts, "buckets partition the corpus exactly (twinned + compiler-core + floor + program == total)");
  console.log(process.exitCode ? "  ts-retirement self-test FAILED" : "  ts-retirement self-test: finder + twin-match + partition verified ✅");
  process.exit(process.exitCode ?? 0);
}

const g = buildRetirementGraph();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "ts-retirement.json"), JSON.stringify(g, null, 2));
const t = g.totals;
const md = [
  `# .ts retirement graph (${t.ts} tracked .ts in package src)`,
  ``,
  `Regenerate: \`node scripts/ts-retirement-graph.mjs\` (graph-all 7/7). The % audit reads these numbers LIVE.`,
  ``,
  `| Retirement path | Count | Deletes via |`,
  `|---|--:|---|`,
  `| Twinned (.fungi beside it) | ${t.twinned} | ${g.retirementPaths.twinned} |`,
  `| Compiler core | ${t.compilerCore} | ${g.retirementPaths.compilerCore} |`,
  `| Bounded-TCB floor | ${t.floor} | ${g.retirementPaths.floor} |`,
  `| Migration program | ${t.program} | ${g.retirementPaths.program} |`,
  ``,
  `\`.fungi\` in src trees: ${t.fungiInSrc} across ${t.packages} packages · finder drift: ${t.finderDrift === -1 ? "n/a (myco unavailable)" : t.finderDrift}`,
  ``,
  `## Twinned .ts (the #143 flip queue)`,
  ...g.twinnedPairs.map((p) => `- ${p}`),
  ``,
].join("\n");
writeFileSync(join(OUT, "TS-RETIREMENT.md"), md);
console.log(`ts-retirement: ${t.ts} .ts · ${t.twinned} twinned (→#143, 0 flipped) · ${t.compilerCore} compiler-core (fixpoint) · ${t.floor} floor (stays) · ${t.program} migration (#38) · ${t.fungiInSrc} .fungi in src`);
