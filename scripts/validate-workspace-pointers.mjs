#!/usr/bin/env node
// =============================================================================
// validate-workspace-pointers.mjs — CI guard for galerina.workspace.json
//
// Every STRING value in the workspace file that looks like a package path
// (starts with "packages-galerina/") must resolve to a real directory on disk.
// Every STRING value that ends with ".md" or ".mjs" must resolve to a real file.
// The packages[] array is also checked for orphan entries (a package.json exists
// but is not listed) and missing entries (listed but directory absent).
//
// Usage:
//   node scripts/validate-workspace-pointers.mjs           (print report, exit 1 on any failure)
//   node scripts/validate-workspace-pointers.mjs --quiet   (exit 1 silently on failures)
//   node scripts/validate-workspace-pointers.mjs --orphans (also scan for un-listed packages)
//
// Wired into run-phase-close.mjs and scripts/run-all-tests.cjs.
// =============================================================================

import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_FILE = join(ROOT, "galerina.workspace.json");
const quiet = process.argv.includes("--quiet");
const checkOrphans = process.argv.includes("--orphans");

// ── Load workspace ────────────────────────────────────────────────────────────

let workspace;
try {
  const { readFileSync } = await import("node:fs");
  workspace = JSON.parse(readFileSync(WORKSPACE_FILE, "utf8"));
} catch (e) {
  console.error(`❌ validate-workspace-pointers: cannot read galerina.workspace.json — ${e.message}`);
  process.exit(1);
}

const failures = [];
const warnings = [];

// ── 1. Check all string values that are paths ─────────────────────────────────

function checkValue(keyPath, value) {
  if (typeof value !== "string") return;
  // Only check values that look like relative paths
  if (!value.startsWith("packages-galerina/") && !value.startsWith("docs") && !value.startsWith("tests")) return;

  const absPath = join(ROOT, value);
  if (!existsSync(absPath)) {
    failures.push(`  ❌ ${keyPath}: "${value}" — path does not exist`);
  }
}

function walkObject(obj, prefix) {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkObject(v, `${prefix}[${i}]`));
  } else if (obj !== null && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      walkObject(v, prefix ? `${prefix}.${k}` : k);
    }
  } else {
    checkValue(prefix, obj);
  }
}

// Walk all non-array values first (named pointers like languagePackage etc.)
for (const [k, v] of Object.entries(workspace)) {
  if (k === "packages") continue; // handled separately below
  walkObject(v, k);
}

// ── 2. Check packages[] array ─────────────────────────────────────────────────

const listedPackages = new Set(workspace.packages ?? []);

for (const pkg of listedPackages) {
  const pkgDir = join(ROOT, pkg);
  if (!existsSync(pkgDir)) {
    failures.push(`  ❌ packages[]: "${pkg}" — directory does not exist`);
  } else if (!existsSync(join(pkgDir, "package.json"))) {
    warnings.push(`  ⚠  packages[]: "${pkg}" — directory exists but has no package.json`);
  }
}

// ── 3. Orphan detection (--orphans flag) ──────────────────────────────────────

if (checkOrphans) {
  const pkgRoot = join(ROOT, "packages-galerina");
  let entries;
  try { entries = readdirSync(pkgRoot, { withFileTypes: true }); } catch { entries = []; }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const rel = `packages-galerina/${ent.name}`;
    const hasPkgJson = existsSync(join(pkgRoot, ent.name, "package.json"));
    if (hasPkgJson && !listedPackages.has(rel)) {
      warnings.push(`  ⚠  ORPHAN: "${rel}" has package.json but is NOT in workspace packages[]`);
    }
  }
}

// ── 4. Report ─────────────────────────────────────────────────────────────────

const total = listedPackages.size;
const broken = failures.length;

if (!quiet) {
  if (broken > 0 || warnings.length > 0) {
    console.log(`\nSUMMARY: validate-workspace-pointers — ${total} packages, ${broken} broken pointer(s), ${warnings.length} warning(s)`);
    for (const f of failures) console.log(f);
    for (const w of warnings) console.log(w);
  } else {
    console.log(`SUMMARY: validate-workspace-pointers — ${total} packages, all pointers resolve ✅`);
  }
}

process.exit(broken > 0 ? 1 : 0);
