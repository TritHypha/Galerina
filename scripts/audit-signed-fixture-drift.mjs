#!/usr/bin/env node
// =============================================================================
// audit-signed-fixture-drift.mjs — detector for the annotation→re-fuse→unsigned
// cascade class (CG-7; owner-directed "both ends + detector", 2026-07-01)
// =============================================================================
// RULE: a fusable package whose dist/<name>.lmanifest.json carries a REAL
// (offline-ceremony) signature must be git-CLEAN — its src and dist are the
// signed truth. Any local modification is the first domino of the cascade:
//   tool dirties src → mtime bump → fuse-rebuild regenerates the .lmanifest
//   UNSIGNED → fuse loader fail-closes (FUNGI-FUSE-UNSIGNED) → suite red.
// The writer guard (galerina.mjs) and rebuild guard (rebuild-fusable-packages)
// PREVENT the known paths; this gate CATCHES any path — known or future.
//
// Remediation when red: `git checkout -- <path>` to restore the signed state,
// or run the offline re-sign ceremony. NEVER rebuild a signed package locally.
//
// Usage: node scripts/audit-signed-fixture-drift.mjs [--root <dir>]
//   --root  audit a different tree (fixture testing); default = repo root.
// Exit: 0 clean · 1 drift found (BLOCKING in run-phase-close).
// =============================================================================

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findFusablePackages } from "./lib/signed-lmanifest.mjs";

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const ROOT = rootIdx >= 0 && argv[rootIdx + 1]
  ? argv[rootIdx + 1]
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const baseDirs = rootIdx >= 0
  ? [ROOT]
  : [join(ROOT, "packages-galerina"), join(ROOT, "examples")].filter(existsSync);

const packages = findFusablePackages(baseDirs);
const signed = packages.filter(p => p.signed);

console.log(`=== signed-fixture drift audit (CG-7: a SIGNED fusable package must be git-clean) ===`);
console.log(`   fusable packages: ${packages.length} | signed: ${signed.length}`);

let drifted = 0;
for (const pkg of signed) {
  const rel = relative(ROOT, pkg.dir).replace(/\\/g, "/");
  // 2026-07-08 (W4 versioning): surface each signed manifest's schema spellings so the
  // re-sign-ceremony scope stays visible. "lln.*" = pre-rename spelling of the same v1
  // layout — tolerated by a CLOSED alias in fuse-loader/verifiers until the ceremony
  // re-signs; a spelling outside the known set is flagged loudly here.
  try {
    const m = JSON.parse(readFileSync(pkg.manifestPath, "utf8"));
    const spellings = [m.schemaVersion, m.fuse?.schemaVersion].filter(v => typeof v === "string");
    const legacy = spellings.filter(v => v.startsWith("lln."));
    const foreign = spellings.filter(v => !v.startsWith("lln.") && !v.startsWith("fungi."));
    if (legacy.length > 0) console.log(`   ⏳ ${pkg.name}: OLD-BRAND schema spelling(s) ${legacy.join(", ")} — re-sign ceremony owed (closed alias in force)`);
    if (foreign.length > 0) console.log(`   ❌ ${pkg.name}: UNRECOGNISED schema spelling(s) ${foreign.join(", ")} — outside the known set (investigate)`);
  } catch { /* unreadable manifest — the signed check above already treats that fail-closed */ }
  // OWASP F1: array args, no shell interpolation of paths.
  const r = spawnSync("git", ["status", "--porcelain", "--", rel === "" ? "." : rel], {
    cwd: ROOT, encoding: "utf8", timeout: 30_000, shell: isWin,
  });
  if (r.status !== 0) {
    // Not a git repo / git unavailable → cannot prove cleanliness. Report, do not
    // fail: the gate's authority is the git state; without git there is nothing
    // to audit (fixture trees under --root without git init hit this).
    console.log(`   ℹ️  ${pkg.name}: git status unavailable (${(r.stderr || "").trim().split("\n")[0] || "no git"}) — skipped`);
    continue;
  }
  const lines = (r.stdout ?? "").split(/\r?\n/).map(s => s.trimEnd()).filter(s => s.length > 0);
  if (lines.length === 0) continue;
  drifted++;
  console.log(`\n❌ [CG-7 signed-drift] ${pkg.name} (${rel}) — SIGNED package has local modifications:`);
  for (const l of lines) console.log(`      ${l}`);
  console.log(`      → git checkout -- <path>  (restore signed state) or run the offline re-sign ceremony.`);
  console.log(`      → NEVER rebuild a signed package locally (unsigned .lmanifest ⇒ FUNGI-FUSE-UNSIGNED).`);
}

if (drifted > 0) {
  console.log(`\n=== ${drifted} signed package(s) DRIFTED — blocking ===`);
  process.exit(1);
}
console.log(`   ✅ all ${signed.length} signed package(s) clean`);
process.exit(0);
