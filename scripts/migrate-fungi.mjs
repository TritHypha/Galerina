#!/usr/bin/env node
// =============================================================================
// migrate-fungi.mjs — the 2026-07-08 syntax-update codemod (Phase 3, T3.1).
// =============================================================================
// docs/SYNTAX_UPDATE_PLAN.md W6. NEVER hand-edit 409 files — this codemod is the
// single migration instrument, and scripts run it; humans review the diff.
//
// Modes (compose; DRY-RUN by default, `--apply` writes):
//   --stamp   prepend `@version 1` to every .fungi lacking a valid header (W4).
//             Preserves a leading UTF-8 BOM and the file's own EOL convention.
//   --ops     rewrite legacy `&&` → `and`, `||` → `or` (token-guided via the
//             real lexer offsets — NEVER regex; strings/comments untouched).
//   --gate-stamp  Q1 (owner LOCKED 2026-07-08): replace the retired `#gate <v>`
//             first line of every .gate with `@version 1.0.0` (one version
//             story across .fungi+.gate; gate-parser rejects `#gate` now).
//   --check   report only (same as running with neither mode and no --apply).
//
// Scope control: skips node_modules/.git/dist/build/.graph. Test corpora are
// INCLUDED (they are real source too); negative fixtures that must keep old
// forms can be excluded with an explicit `// migrate-fungi: keep` first-line
// marker (checked AFTER the version header).
//
//   node scripts/migrate-fungi.mjs --stamp            # dry-run: list files to stamp
//   node scripts/migrate-fungi.mjs --stamp --apply    # write headers
//   node scripts/migrate-fungi.mjs --ops --apply      # migrate &&/|| (lexer-guided)
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Reuse the fungi-scan corpus walker + header grammar (single source of truth).
const scanPkg = join(ROOT, "packages-galerina", "galerina-devtools-fungi-scan", "dist", "index.js");
const { discoverCorpus, readVersionHeader } = await import(
  new URL(`file:///${scanPkg.replace(/\\/g, "/")}`).href
);
// SIGNED-PACKAGE GUARD (learned 2026-07-08, caught by audit-signed-fixture-drift):
// a REAL-SIGNED fusable package's source is FROZEN (CG-7 — the .lmanifest binds the
// source hash; any edit is the annotation→re-fuse→unsigned cascade's first domino).
// The codemod must NEVER touch files under a signed package; they migrate only at
// the offline re-sign ceremony.
const { findFusablePackages } = await import(
  new URL(`file:///${join(ROOT, "scripts", "lib", "signed-lmanifest.mjs").replace(/\\/g, "/")}`).href
);
// FROZEN = real-signed AND the manifest is GIT-TRACKED (a committed ceremony fixture,
// e.g. greeting). A real-shaped but UNTRACKED manifest is local dev output that gets
// rebuilt + dev-signed on every test run (e.g. api-protocol-rest) — its source is
// migratable like any other file.
const { execFileSync } = await import("node:child_process");
const isTracked = (p) => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", p], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};
const SIGNED_DIRS = findFusablePackages([join(ROOT, "packages-galerina"), join(ROOT, "packages")])
  .filter((p) => p.signed && isTracked(p.manifestPath))
  .map((p) => p.dir.replace(/\\/g, "/") + "/");
const isSignedFrozen = (abs) => {
  const norm = abs.replace(/\\/g, "/");
  return SIGNED_DIRS.some((d) => norm.startsWith(d));
};
// The real lexer — for --ops token offsets (regex misses x&&y and quoted forms).
const compilerPkg = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");
const { lex } = await import(new URL(`file:///${compilerPkg.replace(/\\/g, "/")}`).href);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DO_STAMP = args.includes("--stamp");
const DO_OPS = args.includes("--ops");
const DO_GATE = args.includes("--gate-stamp");
const BOM = "﻿";

if (!DO_STAMP && !DO_OPS && !DO_GATE && !args.includes("--check")) {
  console.log("migrate-fungi: pick a mode: --stamp | --ops | --gate-stamp | --check   (dry-run unless --apply)");
  process.exit(2);
}

const { fungi, gate } = discoverCorpus(ROOT);
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

const eolOf = (s) => (s.includes("\r\n") ? "\r\n" : "\n");
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const hasKeepMarker = (body) => /^\/\/\s*migrate-fungi:\s*keep\b/.test(stripBom(body).split(/\r?\n/, 2).find((l) => !l.startsWith("@version")) ?? "");

let stamped = 0;
let opsFiles = 0;
let opsCount = 0;
let kept = 0;
let signedFrozen = 0;

for (const abs of fungi) {
  if (isSignedFrozen(abs)) {
    signedFrozen++;
    console.log(`  ⛔ signed-frozen (CG-7 — migrate at the re-sign ceremony only): ${rel(abs)}`);
    continue;
  }
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch (err) {
    console.error(`  ! unreadable (finding, not skipped): ${rel(abs)} — ${err.message}`);
    continue;
  }
  const bom = src.charCodeAt(0) === 0xfeff ? BOM : "";
  const body = stripBom(src);
  const eol = eolOf(body);
  let next = body;
  const why = [];

  if (hasKeepMarker(body)) {
    kept++;
    continue;
  }

  // ── --stamp: ensure a valid `@version 1` first line ──
  if (DO_STAMP) {
    const header = readVersionHeader(body, "fungi");
    if (!header.present) {
      next = `@version 1${eol}${next}`;
      why.push("stamp @version 1");
    } else if (!header.valid) {
      console.error(`  ! MALFORMED header left for review (never auto-rewritten): ${rel(abs)} — ${JSON.stringify(header.raw)}`);
    }
  }

  // ── --ops: && → and, || → or (token-guided, right-to-left so offsets hold) ──
  if (DO_OPS) {
    const headerLen = next.startsWith("@version") ? next.indexOf(eol) + eol.length : 0;
    const lexBody = next.slice(headerLen);
    const { tokens } = lex(lexBody, rel(abs));
    const hits = tokens.filter((t) => t.value === "&&" || t.value === "||");
    if (hits.length > 0) {
      let out = lexBody;
      for (const t of [...hits].reverse()) {
        const replacement = t.value === "&&" ? "and" : "or";
        out = out.slice(0, t.start) + replacement + out.slice(t.end);
      }
      next = next.slice(0, headerLen) + out;
      opsFiles++;
      opsCount += hits.length;
      why.push(`${hits.length}x &&/|| → and/or`);
    }
  }

  if (next !== body) {
    if (why.some((w) => w.startsWith("stamp"))) stamped++;
    console.log(`  ${APPLY ? "✍" : "·"} ${rel(abs)} — ${why.join(" · ")}`);
    if (APPLY) writeFileSync(abs, bom + next, "utf8");
  }
}

// ── --gate-stamp: retire `#gate <v>` → `@version 1.0.0` on every .gate (Q1) ──
let gateStamped = 0;
if (DO_GATE) {
  for (const abs of gate) {
    if (isSignedFrozen(abs)) {
      signedFrozen++;
      console.log(`  ⛔ signed-frozen .gate (ceremony only): ${rel(abs)}`);
      continue;
    }
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch (err) {
      console.error(`  ! unreadable (finding, not skipped): ${rel(abs)} — ${err.message}`);
      continue;
    }
    const bom = src.charCodeAt(0) === 0xfeff ? BOM : "";
    const body = stripBom(src);
    const eol = eolOf(body);
    let next = body;
    if (/^#gate\b[^\n]*/.test(body)) {
      next = body.replace(/^#gate\b[^\n]*/, "@version 1.0.0");
    } else if (!body.startsWith("@version")) {
      next = `@version 1.0.0${eol}${body}`;
    }
    if (next !== body) {
      gateStamped++;
      console.log(`  ${APPLY ? "✍" : "·"} ${rel(abs)} — #gate → @version 1.0.0`);
      if (APPLY) writeFileSync(abs, bom + next, "utf8");
    }
  }
}

console.log(
  `migrate-fungi${APPLY ? " (APPLIED)" : " (dry-run)"}: ${fungi.length} .fungi scanned · ` +
  `${stamped} to stamp · ${opsFiles} files / ${opsCount} ops to migrate · ${kept} keep-marked · ` +
  `${signedFrozen} signed-frozen (ceremony-owed)` +
  (DO_GATE ? ` · ${gateStamped}/${gate.length} .gate → @version 1.0.0` : ""),
);
if (!APPLY && (stamped > 0 || opsFiles > 0)) {
  console.log("  re-run with --apply to write. Verify after with: node packages-galerina/galerina-devtools-fungi-scan/dist/cli.js");
}
