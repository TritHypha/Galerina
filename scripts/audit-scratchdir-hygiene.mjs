#!/usr/bin/env node
// =============================================================================
// audit-scratchdir-hygiene.mjs — dev-tool detector for the test scratch-dir LEAK CLASS.
// =============================================================================
// Origin (error -> tooling rule): several test files build a per-run scratch dir as
// `build/<prefix>-${process.pid}-<n>` but never clean it. On PID reuse across
// `node --test` runs a fresh run inherits a prior run's contents (miscount -> flaky,
// code-change-free gate failure) and the dirs accumulate without bound (thousands
// observed). A hand-maintained list MISSED instances (found 2 extra on the first
// systematic scan), so this detector enforces the class instead of a list.
//
// A file is a CANDIDATE if it constructs a `build/...${process.pid}...` directory
// (contiguous literal, or a `build` SCRATCH_ROOT + a ${process.pid}-bearing prefix).
// A candidate is CLEAN only if it also calls `rmSync(` (the cleanup primitive) AND its
// load/after() SWEEP is scoped to OWN pid. A candidate that has rmSync but no sweep/after
// is a WARNING (partial). A candidate whose SWEEP PREFIX is BROAD — it enumerates and
// rmSync's every `<prefix>-*` dir, not just this process's `<prefix>-${process.pid}-*` —
// is a FAILURE (broad): a broad load/after sweep deletes a CONCURRENT sibling process's
// LIVE dir mid-run (ENOENT flake), the 50-year-mistake broad match that is "safe" only
// because a human verified no sibling uses the prefix. Correlation-ID generators
// (`PREFIX-${process.pid}-${Math.random()}`, no `build/`) are NOT candidates: in-memory
// strings, no disk.
//
// Usage:  node scripts/audit-scratchdir-hygiene.mjs [--json]
// Exit:   0 = every candidate is clean; 1 = >=1 candidate leaks (no rmSync) OR sweeps broad;
//         3 = usage/error.
// =============================================================================
"use strict";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PKGS = join(ROOT, "packages-galerina");
const asJson = process.argv.includes("--json");

// ── walk packages-galerina/*/tests/**/*.mjs ──────────────────────────────────
function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
      walk(p, out);
    } else if (e.name.endsWith(".mjs")) {
      out.push(p);
    }
  }
  return out;
}
function testFiles() {
  const out = [];
  let pkgs;
  try { pkgs = readdirSync(PKGS, { withFileTypes: true }); } catch { return out; }
  for (const pkg of pkgs) {
    if (!pkg.isDirectory()) continue;
    const tdir = join(PKGS, pkg.name, "tests");
    try { if (statSync(tdir).isDirectory()) walk(tdir, out); } catch { /* no tests dir */ }
  }
  return out;
}

// ── classify one file ────────────────────────────────────────────────────────
// Contiguous form:  `build/full-flight-${process.pid}-${++counter}`
const RE_CONTIGUOUS = /`build\/[^`]*\$\{\s*process\.pid\s*\}/;
// Split form: a "build" scratch root var (SCRATCH_ROOT = "build") composed with
// ${process.pid} anywhere — catches `${SCRATCH_ROOT}/${PREFIX}${process.pid}-…`.
const RE_BUILD_ROOT = /=\s*["'`]build["'`]/;
const RE_PID_ANY = /\$\{\s*process\.pid\s*\}/;
const RE_RMSYNC = /\brmSync\s*\(/;
const RE_SWEEP = /\breaddirSync\s*\(/;         // the sweep enumerates the dir
const RE_AFTER = /\bafter\s*\(/;               // node:test after() cleanup hook

// Resolve `const/let/var NAME = <rhs>;` (first definition) → the raw rhs text (for sweep-prefix scoping).
function resolveConst(src, name) {
  const m = src.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*([^;\\n]+)`));
  return m ? m[1] : null;
}

// A candidate's load/after SWEEP is BROAD (races concurrent siblings) if its `startsWith()` prefix does
// NOT contain process.pid: `readdir(...).startsWith(PREFIX)` + rmSync then deletes another live PID's
// dir. Own-PID scoping (`<prefix>-${process.pid}-`) is the fix. Returns true iff a dir-sweep prefix
// lacking process.pid is found — the sub-class the plain rmSync+after check missed.
function sweepIsBroad(src) {
  const re = /\.startsWith\s*\(\s*([A-Za-z_$][\w$]*|["'`][^"'`]*["'`])\s*\)/g;
  for (const m of src.matchAll(re)) {
    const tok = m[1];
    const rhs = /^["'`]/.test(tok) ? tok : resolveConst(src, tok);
    if (rhs == null) continue;
    // Only inspect prefixes that look like a scratch-dir sweep (not unrelated startsWith checks).
    if (!/SCRATCH|PREFIX|test-|it-|cert|flight|tmp/i.test(rhs)) continue;
    if (!/process\.pid/.test(rhs)) return true; // dir-sweep prefix without pid → broad
  }
  return false;
}

function classify(file) {
  const src = readFileSync(file, "utf8");
  const contiguous = RE_CONTIGUOUS.test(src);
  const split = RE_BUILD_ROOT.test(src) && RE_PID_ANY.test(src);
  if (!contiguous && !split) return null; // not a build/ scratch-dir factory
  const hasRmSync = RE_RMSYNC.test(src);
  const hasSweep = RE_SWEEP.test(src) && RE_AFTER.test(src);
  const broadSweep = hasSweep && sweepIsBroad(src);
  return { hasRmSync, hasSweep, broadSweep };
}

// ── run ──────────────────────────────────────────────────────────────────────
const leaks = [];   // candidate with NO rmSync — a real leak (fails the gate)
const broad = [];   // rmSync + after, but a NON-own-PID sweep prefix — races concurrent siblings (fails)
const partial = []; // has rmSync but no load/after sweep — partial hygiene (warn)
const clean = [];

for (const file of testFiles()) {
  const c = classify(file);
  if (!c) continue;
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (!c.hasRmSync) leaks.push(rel);
  else if (c.broadSweep) broad.push(rel);
  else if (!c.hasSweep) partial.push(rel);
  else clean.push(rel);
}

if (asJson) {
  process.stdout.write(JSON.stringify({ leaks, broad, partial, clean }, null, 2) + "\n");
} else {
  const total = leaks.length + broad.length + partial.length + clean.length;
  process.stdout.write(`scratch-dir hygiene: ${total} build/<prefix>-\${pid} factory file(s) scanned\n`);
  process.stdout.write(`  ✅ clean (rmSync + own-pid sweep + after): ${clean.length}\n`);
  for (const f of clean) process.stdout.write(`       ${f}\n`);
  if (partial.length) {
    process.stdout.write(`  ⚠️  partial (rmSync but no load/after sweep — dirs can still leak): ${partial.length}\n`);
    for (const f of partial) process.stdout.write(`       ${f}\n`);
  }
  if (broad.length) {
    process.stdout.write(`  ❌ BROAD SWEEP (rmSync + after, but the sweep prefix lacks process.pid — deletes a concurrent sibling's LIVE dir): ${broad.length}\n`);
    for (const f of broad) process.stdout.write(`       ${f}\n`);
    process.stdout.write(`\n  Fix: scope the sweep prefix to OWN pid — startsWith(\`<prefix>-\${process.pid}-\`), not the bare prefix.\n`);
  }
  if (leaks.length) {
    process.stdout.write(`  ❌ LEAK (creates build/…\${process.pid} dirs, no rmSync cleanup): ${leaks.length}\n`);
    for (const f of leaks) process.stdout.write(`       ${f}\n`);
    process.stdout.write(`\n  Fix: sweep OWN-PID dirs (build/<prefix>-\${process.pid}-*) at load + via node:test after(),\n`);
    process.stdout.write(`       and rmSync the target inside the dir factory. Template: galerina-tower-citizen\n`);
    process.stdout.write(`       tests/sentinel-egress-time.test.mjs (commit f107301) — scope to own pid (parallel-safe).\n`);
  }
}

process.exit(leaks.length || broad.length ? 1 : 0);
