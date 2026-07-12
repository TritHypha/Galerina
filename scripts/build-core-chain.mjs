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
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages-galerina");
const IS_WIN = process.platform === "win32";

const targets = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const roots = targets.length ? targets : ["galerina-core-compiler"];

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
