// Repo hygiene guard: a literal NUL byte (0x00) in a source file makes git AND ripgrep/grep treat the
// whole file as BINARY — so it is silently skipped by every text search and shows no line-diff. For a
// security-critical file (e.g. the P9 WASM admission gate) that means audits invisibly miss it. The fix
// is always to use the `\0` escape, which is byte-identical at runtime but keeps the source as text.
// This test fails on any NEW source file that introduces NUL bytes, so the class can't recur.
//
// Found 2026-06-21: wasm-runtime.ts had literal NULs (fixed); kernel.ts + inference manifest.ts still did.
// FIXED 2026-07-02 (owner-approved): all three now use the `\0` escape (byte-identical at runtime,
// but the source stays plain UTF-8 text and greppable). The allowlist is now EMPTY — the invariant is
// absolute: no source file, framework or otherwise, may contain a raw NUL byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
// docs/ + .md added 2026-07-02: a raw NUL was (accidentally) introduced into docs/TODO.md while WRITING
// about this very fix — markdown is as grep-load-bearing as source here (TODO/gates/KB cross-refs), so the
// same audit-evasion class applies. Coverage now: source dirs + docs, source exts + .md.
const SCAN_DIRS = ["packages-galerina", "governance", "scripts", "docs"];
const EXTS = new Set([".ts", ".mjs", ".js", ".cjs", ".fungi", ".md"]);
const SKIP = new Set(["node_modules", "dist", "build", ".git"]);

// No parked NUL bytes remain (all fixed to `\0` on 2026-07-02). Empty = zero-tolerance.
const ALLOWLIST = new Set([]);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) yield* walk(join(dir, e.name)); }
    else { const dot = e.name.lastIndexOf("."); if (dot >= 0 && EXTS.has(e.name.slice(dot))) yield join(dir, e.name); }
  }
}

test("no NEW source file contains a literal NUL byte (binary-flagged files are invisible to grep/git)", () => {
  const offenders = [];
  let scanned = 0;
  for (const d of SCAN_DIRS) {
    for (const file of walk(join(REPO_ROOT, d))) {
      scanned++;
      if (readFileSync(file).includes(0)) {
        const rel = file.slice(REPO_ROOT.length + 1);
        if (!ALLOWLIST.has(rel)) offenders.push(rel.split(sep).join("/"));
      }
    }
  }
  // Guard against a silently-vacuous pass (broken REPO_ROOT / walk): we must have scanned the real tree.
  assert.ok(scanned > 200, `expected to scan the source tree but only saw ${scanned} files — REPO_ROOT/walk likely broken`);
  for (const e of readdirSync(REPO_ROOT, { withFileTypes: true })) {
    if (e.isFile() && (e.name.endsWith(".mjs") || e.name.endsWith(".md")) &&
        readFileSync(join(REPO_ROOT, e.name)).includes(0) && !ALLOWLIST.has(e.name)) {
      offenders.push(e.name);
    }
  }
  assert.deepEqual(offenders, [],
    `source file(s) with NUL bytes — use the \\0 escape so git/grep keep them as text: ${offenders.join(", ")}`);
});
