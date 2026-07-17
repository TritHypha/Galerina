#!/usr/bin/env node
// build-core-chain.mjs — build a package plus its transitive `file:` dependency closure in
// topological order (leaves first). Encodes the monorepo build order ONCE, as a tool, so a
// fresh checkout / CI can regenerate the gitignored dist/ that the build-dependent gates need
// (galerina.mjs build imports galerina-core-compiler/dist). Without this, the build-dependent
// script tests error with "Cannot find module .../dist/index.js" in CI — the "passes locally,
// red in CI" class (they pass on a dev box only because dist already exists there).
//
// Zero-trust: fail-CLOSED. Any install or build failure aborts the whole chain (non-zero exit) —
// a half-built chain must never masquerade as ready. Deterministic order via post-order DFS over
// the `dependencies` file: graph (a cycle is a hard error, not a silent skip).
//
// Usage:  node scripts/build-core-chain.mjs [<package-dir-name> ...]
//   default target: galerina-core-compiler  (the chain the CG-4 / signed-fixture gates need)
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages-galerina");
const IS_WIN = process.platform === "win32";

/**
 * DERIVE the packages whose dist/ the gate suite actually needs, by reading the gates.
 *
 * Why derived and not hand-listed: this tool builds ONE root's `file:` closure — historically
 * galerina-core-compiler, i.e. the CLI's closure. But the gate suite's subjects are a DIFFERENT set.
 * `audit-package-border` imports galerina-devtools-package-graph/dist — a DEVTOOL, not a CLI
 * dependency, therefore outside the closure — so it failed in CI even after the chain built (R&D
 * verified: VIOLATIONS 5 → 1, the red moved lanes instead of clearing). The lane's surface was
 * narrower than the gate suite's subjects: the same surface/capability mismatch as the meta-gate
 * itself, one level up.
 *
 * A hand-listed second root would fix today and rot tomorrow — the NEXT devtools-backed gate
 * reintroduces it silently, which is precisely the drift this tool exists to encode away. So the
 * roots are READ OUT OF THE GATES: any `packages-galerina/<pkg>/dist` a gate references makes <pkg>
 * a root. A new devtools-backed gate is then covered the day it lands, with no list to update.
 *
 * Fail-open note: if the scan finds nothing (a refactor changes how gates reference dist), we still
 * build the compiler default rather than silently building nothing.
 */
export function deriveGateSubjects(scriptsDir, readdir, readfile) {
  const roots = new Set();
  for (const f of readdir(scriptsDir)) {
    if (!/^(audit|lint)-.*\.mjs$/.test(f)) continue;
    const src = readfile(join(scriptsDir, f));
    // TWO forms, both live in-tree. A single-pattern scan misses one of them — I shipped exactly that
    // mistake and the derivation silently returned only the compiler:
    //   (a) LITERAL   import … from "../packages-galerina/<pkg>/dist/index.js"
    //   (b) JOIN-FORM join(ROOT, "packages-galerina", "<pkg>", "dist")   ← audit-package-border:38
    // In (b) the path never exists as one string, so a `packages-galerina/…/dist` regex cannot see it.
    for (const m of src.matchAll(/packages-galerina\/([a-z0-9-]+)\/dist/g)) roots.add(m[1]);
    for (const m of src.matchAll(/["']packages-galerina["']\s*,\s*["']([a-z0-9-]+)["']/g)) roots.add(m[1]);
  }
  return [...roots].sort();
}

// ── self-test: prove the derivation SEES BOTH REFERENCE FORMS. A scan that silently returns a short
//    list is worse than no scan — it looks derived while hand-listing by omission. Fixture-driven, no
//    filesystem: injected readdir/readfile (a DI seam, no monkeypatching).
function selfTest() {
  const FIX = {
    "audit-literal.mjs": 'import { x } from "../packages-galerina/galerina-core-compiler/dist/index.js";',
    "audit-joinform.mjs": 'const DIST = join(ROOT, "packages-galerina", "galerina-devtools-package-graph", "dist");',
    "audit-none.mjs": "// a pure-source gate — reads git-tracked files only, needs no build",
    "helper-not-a-gate.mjs": 'join(ROOT, "packages-galerina", "galerina-should-be-ignored", "dist")',
  };
  const got = deriveGateSubjects("/x", () => Object.keys(FIX), (p) => FIX[basename(p)]);
  const checks = [
    ["LITERAL form is seen (…/packages-galerina/<pkg>/dist/…)", got.includes("galerina-core-compiler")],
    ["JOIN form is seen (join(ROOT,'packages-galerina','<pkg>','dist')) — the one that broke CI", got.includes("galerina-devtools-package-graph")],
    ["a gate needing no build contributes nothing", !got.includes("audit-none")],
    ["non-gate files are NOT scanned (surface is audit-*/lint-* only)", !got.includes("galerina-should-be-ignored")],
    ["result is deterministic + sorted", got.join() === [...got].sort().join()],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  console.log(`  derived from fixture: ${got.join(", ") || "(none)"}`);
  if (!ok) { console.error("  ❌ build-core-chain self-test FAILED — the gate-subject derivation is blind to a real form"); process.exit(1); }
  console.log("  build-core-chain self-test: gate-subject derivation sees both reference forms ✅");
  process.exit(0);
}
if (process.argv.includes("--self-test")) selfTest();

const argv = process.argv.slice(2);
const targets = argv.filter((a) => !a.startsWith("-"));
let roots;
if (targets.length) {
  roots = targets;
} else if (argv.includes("--gate-subjects")) {
  // The lane that runs the gate suite asks for the UNION the gates actually need.
  const derived = deriveGateSubjects(
    join(ROOT, "scripts"),
    (d) => readdirSync(d),
    (p) => readFileSync(p, "utf8"),
  ).filter((r) => existsSync(join(PKG_DIR, r, "package.json")));
  roots = derived.length ? derived : ["galerina-core-compiler"];
  console.log(`  gate-subject roots DERIVED from the gates (not hand-listed): ${roots.join(", ")}`);
} else {
  roots = ["galerina-core-compiler"];
}

function pkgJson(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

// Walk the `dependencies` file: graph from the roots (runtime closure — what must exist to RUN).
const nodes = new Map(); // absDir -> { name, fileDeps: absDir[], hasBuild }
function visit(absDir) {
  if (nodes.has(absDir)) return;
  if (!existsSync(join(absDir, "package.json"))) {
    console.error(`  ✗ not a package (no package.json): ${absDir}`);
    process.exit(1);
  }
  const pj = pkgJson(absDir);
  const fileDeps = [];
  for (const [, spec] of Object.entries(pj.dependencies || {})) {
    if (typeof spec === "string" && spec.startsWith("file:")) {
      fileDeps.push(resolve(absDir, spec.slice("file:".length)));
    }
  }
  nodes.set(absDir, { name: pj.name || basename(absDir), fileDeps, hasBuild: !!(pj.scripts && pj.scripts.build) });
  for (const d of fileDeps) visit(d);
}
for (const r of roots) {
  const abs = join(PKG_DIR, r);
  if (!existsSync(abs)) { console.error(`  ✗ target package not found: ${r}`); process.exit(1); }
  visit(abs);
}

// Topological order (leaves first) via post-order DFS; detect cycles.
const order = [];
const temp = new Set();
const done = new Set();
function toposort(absDir) {
  if (done.has(absDir)) return;
  if (temp.has(absDir)) { console.error(`  ✗ dependency cycle through ${nodes.get(absDir).name}`); process.exit(1); }
  temp.add(absDir);
  for (const d of nodes.get(absDir).fileDeps) toposort(d);
  temp.delete(absDir);
  done.add(absDir);
  order.push(absDir);
}
for (const r of roots) toposort(join(PKG_DIR, r));

console.log(`  build-core-chain: ${order.length} package(s), leaves first:`);
for (const a of order) console.log(`    - ${nodes.get(a).name}`);

function run(cmd, args, cwd) {
  // shell:true on Windows so `npm` resolves to npm.cmd; plain exec on CI (linux).
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: IS_WIN });
}

for (const absDir of order) {
  const info = nodes.get(absDir);
  console.log(`\n  ── ${info.name} ──`);
  run("npm", ["install", "--no-audit", "--no-fund"], absDir);
  if (info.hasBuild) run("npm", ["run", "build"], absDir);
  else console.log("    (no build script — install only)");
}
console.log(`\n  ✅ build-core-chain complete (${order.length} package(s) built/installed).`);
