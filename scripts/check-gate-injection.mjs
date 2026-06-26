#!/usr/bin/env node
/**
 * check-gate-injection — guards against the "admission gate DEFINED but not INJECTED"
 * fail-open class.
 *
 * Origin: the 2026-06-24 app-fusion revocation gap. The fuse-loader's Gate 2b revocation
 * check only fires `if (opts.revocationCheck !== undefined)`, so a HOST that calls
 * fusePackage() without passing a revocationCheck silently admits even a REVOKED signing
 * key — a fail-open that no happy-path test catches (the valid package still admits). This
 * is negative-space: something that SHOULD happen but doesn't.
 *
 * This lint scans every caller of the admission-border entry points (fusePackage /
 * fusePackages / buildImportClosure) and FAILS if a NON-TEST caller admits packages
 * without wiring the revocation gate. Test files are reported informationally (they may
 * fuse without the gate for unit coverage). The border DEFINITION (fuse-loader) is skipped.
 *
 * Run:  node scripts/check-gate-injection.mjs   (exit 1 on any unguarded caller)
 * Wire into the #149 CI gate alongside the secret scan.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCAN_DIRS = ["packages-galerina", "scripts"]; // recursive
const SCAN_TOPLEVEL = true;                         // top-level *.mjs/*.js (galerina.mjs)

const ADMIT_CALLS = ["fusePackage(", "fusePackages(", "buildImportClosure("];
const GATE = "revocationCheck";
const DEFINITION_SUFFIXES = ["fuse-loader.ts", "fuse-loader.js"];

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", "build", ".graph"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|mjs|cjs|js)$/.test(e.name) && !e.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

const isTest = (p) => /[\\/]tests?[\\/]|\.test\.|\.spec\./.test(p);
// Skip the border DEFINITION (fuse-loader) and this lint itself (it names the call sites).
const isDefinition = (p) => DEFINITION_SUFFIXES.some((d) => p.endsWith(d)) || p.endsWith("check-gate-injection.mjs");
const toRel = (f) => relative(REPO, f).split(sep).join("/");

/** Pure classifier (also exercised by --self-test): "none" | "skip" | "guarded" | "test" | "offender". */
export function classifyCaller(path, src) {
  if (!ADMIT_CALLS.some((c) => src.includes(c))) return "none";
  if (isDefinition(path)) return "skip";
  if (src.includes(GATE)) return "guarded";
  return isTest(path) ? "test" : "offender";
}

// --self-test: prove the detector fires (a neutered gate-injection lint is itself a fail-open).
if (process.argv.includes("--self-test")) {
  const t = [
    ["src/host.ts", "fusePackage(pkg)", "offender"],                         // non-test caller, no gate -> FAIL
    ["src/host.ts", "fusePackage(pkg, { revocationCheck })", "guarded"],      // gate injected -> ok
    ["tests/fuse.test.mjs", "fusePackage(pkg)", "test"],                      // test caller -> informational
    ["packages/x/src/fuse-loader.ts", "fusePackage(pkg)", "skip"],            // the border definition -> skipped
    ["src/unrelated.ts", "doStuff()", "none"],                               // no admit call -> none
  ];
  let ok = true;
  for (const [p, s, want] of t) { const got = classifyCaller(p, s); if (got !== want) { ok = false; console.log(`  ✗ ${p} expected ${want} got ${got}`); } }
  console.log(ok ? "[self-test] PASS — gate-injection detector classifies offender/guarded/test/skip correctly" : "[self-test] FAIL");
  process.exit(ok ? 0 : 1);
}

const files = [];
for (const d of SCAN_DIRS) walk(join(REPO, d), files);
if (SCAN_TOPLEVEL) {
  for (const e of readdirSync(REPO, { withFileTypes: true })) {
    if (e.isFile() && /\.(mjs|cjs|js)$/.test(e.name)) files.push(join(REPO, e.name));
  }
}

const guarded = [];
const testCallers = [];
const offenders = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const cat = classifyCaller(f, src);
  if (cat === "none" || cat === "skip") continue;
  const rel = toRel(f);
  if (cat === "guarded") guarded.push(rel);
  else if (cat === "test") testCallers.push(rel);
  else offenders.push(rel);
}

console.log("gate-injection lint — admission-border callers must inject the revocation gate\n");
if (guarded.length) {
  console.log(`  guarded (inject ${GATE}):`);
  guarded.forEach((f) => console.log("    [ok] " + f));
}
if (testCallers.length) {
  console.log(`\n  test callers (informational — may fuse without the gate for coverage):`);
  testCallers.forEach((f) => console.log("    [..] " + f));
}
if (offenders.length) {
  console.log(`\n  UNGUARDED non-test callers (admit packages WITHOUT a revocation gate — fail-open):`);
  offenders.forEach((f) => console.log("    [FAIL] " + f));
  console.log(`\nFAIL: ${offenders.length} caller(s) fuse without injecting ${GATE}.`);
  console.log(`Each must pass revocationCheck — see galerina.mjs (fuse command) or the`);
  console.log(`framework-example-app host (fuseGreeting -> loadRevocationGate).`);
  process.exit(1);
}
console.log(`\nOK: every non-test admission-border caller injects ${GATE}.`);
