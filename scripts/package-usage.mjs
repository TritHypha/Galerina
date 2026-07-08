#!/usr/bin/env node
// =============================================================================
// package-usage.mjs — workspace package USAGE / reverse-dependency graph.
// =============================================================================
// Answers the question the per-package Hardened Border can't: "who depends on
// package X, and which packages are LEAVES (nothing depends on them)?"
//
// Edges are collected three ways, by decreasing strength:
//   • declared — an `@galerina/*` entry in a package.json dependencies/devDeps
//   • import   — a `from "@galerina/*"` / require in that package's src/tests
//   • string   — a bare "@galerina/*" literal (dynamic/registry/test-fixture ref)
// A package is "used" if something DECLARES or IMPORTS it. A string-only ref
// (e.g. a bridge loaded by name, or a test fixture) is reported but is weaker.
//
// USAGE
//   node scripts/package-usage.mjs <name|dir>   # who uses X + what X uses + string refs
//   node scripts/package-usage.mjs --unused     # leaf packages, classified by likely intent
//   node scripts/package-usage.mjs --json        # machine-readable full graph
//   node scripts/package-usage.mjs               # summary + build/package-usage/PACKAGE-USAGE.md
// =============================================================================

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_ROOTS = ["packages-galerina", "packages"].map(p => join(ROOT, p)).filter(existsSync);
const REF_RE = /@galerina\/[a-z0-9._-]+/gi;
const CODE_EXT = new Set([".ts", ".mts", ".cts", ".mjs", ".cjs", ".js"]);

// ── discover packages: name ↔ dir ──
const pkgs = new Map();        // name -> { name, dir, rel, bin, fungi, deps:Set }
for (const rootDir of PKG_ROOTS) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(rootDir, entry.name);
    const pjPath = join(dir, "package.json");
    if (!existsSync(pjPath)) continue;
    let pj; try { pj = JSON.parse(readFileSync(pjPath, "utf8")); } catch { continue; }
    if (!pj.name) continue;
    const deps = new Set(Object.keys({ ...(pj.dependencies || {}), ...(pj.devDependencies || {}) })
      .filter(d => d.startsWith("@galerina/")));
    pkgs.set(pj.name, {
      name: pj.name, dir, rel: relative(ROOT, dir).replace(/\\/g, "/"),
      bin: !!pj.bin, fungi: existsSync(join(dir, "package.fungi.json")), deps,
    });
  }
}
const byName = (n) => pkgs.get(n);
const nameOfDir = (d) => [...pkgs.values()].find(p => p.dir === d || p.rel === d || p.name === d);

// ── walk a package's own code for import + string refs ──
function scanFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === ".graph") continue;
    const f = join(dir, e.name);
    if (e.isDirectory()) scanFiles(f, out);
    else if (CODE_EXT.has(f.slice(f.lastIndexOf(".")))) out.push(f);
  }
  return out;
}

// edges: to -> [ {from, kind, file} ]
const inbound = new Map();     // pkgName -> array of edges pointing AT it
for (const p of pkgs.values()) inbound.set(p.name, []);
function addEdge(fromName, toName, kind, file) {
  if (fromName === toName || !pkgs.has(toName)) return;
  inbound.get(toName).push({ from: fromName, kind, file: file ? relative(ROOT, file).replace(/\\/g, "/") : "package.json" });
}

for (const p of pkgs.values()) {
  // declared deps (strong)
  for (const d of p.deps) addEdge(p.name, d, "declared", null);
  // code refs (import vs string)
  for (const file of scanFiles(p.dir)) {
    let src; try { src = readFileSync(file, "utf8"); } catch { continue; }
    for (const line of src.split(/\r?\n/)) {
      const hits = line.match(REF_RE);
      if (!hits) continue;
      const isImport = /\b(import|export|require)\b/.test(line) && /(from|require)\s*\(?["']/.test(line);
      for (const h of new Set(hits)) addEdge(p.name, h, isImport ? "import" : "string", file);
    }
  }
}

// dedupe edges per (from,to,kind)
for (const [to, edges] of inbound) {
  const seen = new Set();
  inbound.set(to, edges.filter(e => { const k = `${e.from}|${e.kind}`; if (seen.has(k)) return false; seen.add(k); return true; }));
}

const strongDeps = (name) => inbound.get(name).filter(e => e.kind === "declared" || e.kind === "import");
const stringRefs = (name) => inbound.get(name).filter(e => e.kind === "string");

function hasTests(dir) {
  try { return readdirSync(join(dir, "tests")).some(f => /\.test\.(mjs|cjs|js|ts)$/.test(f)); }
  catch { return false; }
}
// A "leaf" (no internal consumer) is NOT the same as dead. Most Galerina packages are
// standalone building-block libraries consumed by END-USER apps, not by each other — so a
// tested leaf is LIVE. Only an untested leaf with no consumer and no entrypoint role is a
// genuine review candidate. Ordered most- to least-explanatory.
function classifyLeaf(p) {
  if (p.bin) return "entrypoint (has bin/CLI)";
  if (/(-cli|framework-app|framework-example-app|example-app)$/.test(p.name)) return "app/entrypoint";
  if (p.name.includes("devtools-")) return "dev tool (invoked by scripts/hooks)";
  if (p.fungi) return "governed fusable (dynamically loaded — package.fungi.json)";
  if (hasTests(p.dir)) return "standalone library (tested; consumed by end-user apps, not internal)";
  return "POSSIBLY UNUSED — review (no consumer, no tests, no entrypoint role)";
}

// ── CLI ──
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const unused = args.includes("--unused");
const target = args.find(a => !a.startsWith("--"));

if (target) {
  const p = byName(target) || nameOfDir(target) || nameOfDir(target.replace(/^.*[\\/]/, "")) ||
            [...pkgs.values()].find(x => x.name.endsWith(target) || x.rel.endsWith(target));
  if (!p) { console.error(`package not found: ${target}`); process.exit(1); }
  const strong = strongDeps(p.name), refs = stringRefs(p.name);
  if (asJson) { console.log(JSON.stringify({ package: p.name, dependents: strong, stringRefs: refs, dependsOn: [...p.deps] }, null, 2)); process.exit(0); }
  console.log(`\n📦 ${p.name}   (${p.rel})`);
  console.log(`   depends on : ${[...p.deps].join(", ") || "(none — leaf-in)"}`);
  console.log(`\n   USED BY (declared/import): ${strong.length}`);
  for (const e of strong) console.log(`     ← ${e.from}   [${e.kind}]  ${e.file}`);
  console.log(`\n   referenced by NAME only (dynamic/test/registry — not a dependency): ${refs.length}`);
  for (const e of refs) console.log(`     ⋯ ${e.from}   ${e.file}`);
  if (strong.length === 0) console.log(`\n   ⚠️  LEAF: no package depends on or imports ${p.name} — ${classifyLeaf(p)}`);
  process.exit(0);
}

// summary / --unused / --json
const leaves = [...pkgs.values()].filter(p => strongDeps(p.name).length === 0)
  .map(p => ({ ...p, refs: stringRefs(p.name).length, why: classifyLeaf(p) }));
const topUsed = [...pkgs.values()].map(p => ({ name: p.name, n: strongDeps(p.name).length }))
  .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 10);

if (asJson) {
  const graph = {};
  for (const p of pkgs.values()) graph[p.name] = { rel: p.rel, dependsOn: [...p.deps], usedBy: strongDeps(p.name), refs: stringRefs(p.name) };
  console.log(JSON.stringify({ packages: pkgs.size, leaves: leaves.map(l => ({ name: l.name, refs: l.refs, why: l.why })), graph }, null, 2));
  process.exit(0);
}

const outDir = join(ROOT, "build", "package-usage");
mkdirSync(outDir, { recursive: true });
let md = `# Package usage / reverse-dependency graph\n\n${pkgs.size} packages · ${leaves.length} leaf package(s)\n\n## Leaf packages (nothing declares/imports them)\n\n| package | string-only refs | likely intent |\n|---|---|---|\n`;
for (const l of leaves.sort((a, b) => (a.why > b.why ? 1 : -1))) md += `| ${l.name} | ${l.refs} | ${l.why} |\n`;
md += `\n## Most-depended-on\n\n| package | dependents |\n|---|---|\n`;
for (const t of topUsed) md += `| ${t.name} | ${t.n} |\n`;
writeFileSync(join(outDir, "PACKAGE-USAGE.md"), md);

console.log(`package-usage: ${pkgs.size} packages · ${leaves.length} leaf(s) → build/package-usage/PACKAGE-USAGE.md`);
const review = leaves.filter(l => l.why.startsWith("POSSIBLY"));
console.log(`  leaves by intent: ${leaves.length - review.length} likely-intentional (entrypoints/devtools/fusable/apps), ${review.length} POSSIBLY-UNUSED`);
for (const l of review) console.log(`    ⚠️  ${l.name}  (${l.refs} name-only ref${l.refs === 1 ? "" : "s"})`);
console.log(`  query one:  node scripts/package-usage.mjs <name>`);
