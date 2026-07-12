#!/usr/bin/env node
// audit-kernel-floor.mjs — enforce the App-Kernel host-floor boundary (ADR:
// docs/architecture/kernel-fungi-floor-resolution-2026-07-10.md).
//
// The kernel's governance decision-logic is destined for .fungi; its host floor
// (cryptographic verify, filesystem reads, WASM instantiation) is a DECLARED,
// minimal TCB shim confined to ONE seam file. This gate makes that boundary
// fail-closed: any kernel source OTHER than the declared seam that reaches for a
// host primitive is a violation. The floor can then only SHRINK, never sprawl —
// so "governed surface → .fungi" stays a reachable, honest target instead of an
// unbounded pile of host code.
//
// Zero-dep (node:fs/path only), never throws, exit 1 only on a violation.
//   node scripts/audit-kernel-floor.mjs           # enforce (table + verdict)
//   node scripts/audit-kernel-floor.mjs --json     # machine-readable
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KERNEL_SRC = join(ROOT, "packages-galerina", "galerina-framework-app-kernel", "src");
const AS_JSON = process.argv.includes("--json");

// The ONE file permitted to hold the host floor — the declared TCB seam.
const DECLARED_SEAM = "fuse-loader.ts";

// Host-primitive markers = the floor. A match OUTSIDE the seam is a boundary breach.
const FLOOR = [
  ["crypto", /\bnode:crypto\b|@noble\//],
  ["host-io", /\bnode:fs\b|\bnode:net\b|\bnode:child_process\b|\bnode:os\b|\bprocess\.(env|argv|cwd|platform|exit)\b/],
  ["wasm-host", /\bWebAssembly\.(instantiate|compile)\b/],
];

// The declared floor manifest — the primitive surface the seam is allowed to use.
// Auditing the seam against this makes the floor size N explicit and reviewable.
const MANIFEST = [
  "createHash", "createPublicKey", "verify",          // NodeCrypto (3)
  "readFileSync", "existsSync", "readdirSync",         // NodeFs (3)
  "join", "basename",                                  // NodePath (2)
  "WebAssembly.instantiate",                           // WASM host (1)
];

const listTs = (dir) => {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
  } catch {
    return [];
  }
};

// Strip line-comments/block-comment bodies so a doc-comment mentioning a primitive
// (e.g. fuse-loader's own header) is never counted as a call site.
const stripComments = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");

const files = listTs(KERNEL_SRC);
const rows = [];
const violations = [];
let seamFound = false;

for (const f of files) {
  const isSeam = f === DECLARED_SEAM;
  if (isSeam) seamFound = true;
  const code = stripComments(readFileSync(join(KERNEL_SRC, f), "utf8"));
  const hits = FLOOR.filter(([, re]) => re.test(code)).map(([name]) => name);
  rows.push({ file: f, floor: hits, seam: isSeam });
  if (hits.length > 0 && !isSeam) {
    violations.push({ file: f, floor: hits });
  }
}

// The seam's actual primitive surface, for the manifest report (informational).
let seamSurface = [];
if (seamFound) {
  const seamCode = stripComments(readFileSync(join(KERNEL_SRC, DECLARED_SEAM), "utf8"));
  seamSurface = MANIFEST.filter((p) => seamCode.includes(p));
}

const governed = rows.filter((r) => !r.seam && r.floor.length === 0).map((r) => r.file);

if (AS_JSON) {
  console.log(JSON.stringify({ declaredSeam: DECLARED_SEAM, seamFound, violations, governedFiles: governed, seamSurface, floorSize: seamSurface.length }, null, 2));
  process.exit(violations.length > 0 || !seamFound ? 1 : 0);
}

const L = (s, n) => String(s).padEnd(n);
console.log("  App-Kernel host-floor boundary (ADR kernel-fungi-floor-resolution)");
console.log(`  declared seam: ${DECLARED_SEAM}${seamFound ? "" : "  ⚠ NOT FOUND"}`);
console.log("");
console.log(`  ${L("file", 22)} ${L("floor", 26)} role`);
for (const r of rows) {
  const role = r.seam ? "SEAM (floor allowed)" : r.floor.length ? "⚠ BOUNDARY BREACH" : "governed (floor-free)";
  console.log(`  ${L(r.file, 22)} ${L(r.floor.length ? r.floor.join(",") : "—", 26)} ${role}`);
}
console.log("");
console.log(`  floor manifest (seam surface): ${seamSurface.length} primitives — ${seamSurface.join(", ")}`);
console.log(`  governed (floor-free) files  : ${governed.length}/${rows.length - 1} non-seam files`);
if (violations.length > 0) {
  console.log("");
  console.log(`  ❌ ${violations.length} boundary breach(es): a non-seam kernel file reaches a host primitive.`);
  for (const v of violations) console.log(`     ${v.file}  [${v.floor.join(",")}]  → move the host call into ${DECLARED_SEAM}, hand the .fungi logic its OUTPUT`);
  process.exit(1);
}
if (!seamFound) {
  console.log(`  ❌ declared seam ${DECLARED_SEAM} not found — the floor boundary is undefined.`);
  process.exit(1);
}
console.log("  ✅ kernel-floor: the host floor is confined to the declared seam (floor can only shrink).");
process.exit(0);
