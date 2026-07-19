#!/usr/bin/env node
/**
 * audit-auto-erasure-ratchet.mjs — the shrink-only ratchet on `Auto` type erasure (P9 / #100).
 *
 * WHY THIS EXISTS. The `Auto`-in-generic ruling (2026-07-19) permits `Auto` to act as a WILDCARD in
 * argument position so the generic-assignability fix can land without reddening the self-hosted stages
 * at once. That ruling was made EXPLICITLY CONDITIONAL on the accompanying ratchet being an ENFORCING
 * GATE rather than a documented number — "without that it is merely the permissive option". This is
 * that gate. Permissiveness granted AND bounded: the erasure may shrink, never grow.
 *
 * WHAT `Auto` COSTS. `Array<Auto>` erases the element type, so reading a RECORD FIELD off an element
 * obtained via `.get()` has no known field offset at lowering and the emitter falls through to
 * `unreachable` — that is #100, P9's blocker. The stages take `Array<Auto>` per their own headers "to
 * avoid generic syntax constraints in Stage B param declarations": the workaround IS the bug. Every
 * count below is therefore debt with a known repayment (concretize the element type end-to-end), and
 * `scripts/p9-100-site-mapper.mjs` turns each site into a proposed concrete type with evidence.
 *
 * ★ MEASURED 2026-07-19, AND IT DID NOT MATCH THE RECORDED FIGURE. The number carried in the
 * coordination trail was "3,419 occurrences across 78 .fungi files in packages-galerina". A direct
 * count finds 263 in SIX files (271 in ten repo-wide) — off by ~13x in both dimensions. The measured
 * distribution is coherent in a way the recorded one is not: the erasure sits almost entirely in the
 * five self-hosted stages, which is exactly where #100 traps. Since the blast radius was the stated
 * reason for choosing the permissive option over the strictly-correct one, the ruling deserves a
 * re-read against the real number. This gate reports what it measures and nothing else.
 *
 * DISCIPLINES:
 *   1. PER-FILE shrink-only, not just the total — a total-only ratchet lets one file grow while
 *      another shrinks, which is how debt migrates instead of retiring.
 *   2. NO SILENT EXEMPTIONS. The `Auto` teaching examples (069-auto-inference, 070-auto-invalid) are
 *      baselined like everything else rather than pattern-excluded; an exemption list nobody reads is
 *      a dumping ground. A new file carrying `Auto` FAILS until it is deliberately baselined.
 *   3. Comments and string literals are blanked before counting — `Auto` in prose is not an erasure.
 *   4. SURFACE ASSERTED, not assumed: named anchor files must be in the scan, and zero .fungi files is
 *      a FAILURE, not a clean run. (A detector that scans the wrong set reports a confident zero.)
 *   5. A DECREASE is reported as progress and never fails — but it does leave the baseline STALE, and
 *      the gate says so, because a ratchet that is never re-tightened stops ratcheting.
 *
 * RUN:  node scripts/audit-auto-erasure-ratchet.mjs [--self-test] [--json] [--update-baseline]
 * EXIT: 0 clean · 1 an INCREASE, a NEW file, a broken surface, or a self-test failure
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GALERINA_ROOT || join(HERE, "..");
const BASELINE = join(ROOT, "packages-galerina/galerina-core-compiler/tests/fixtures/auto-erasure-baseline.json");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

/** The self-hosted compiler stages — the P9 debt proper, reported as its own subtotal. */
const STAGE_DIR = "packages-galerina/galerina-core-compiler/src/self-hosted/";

/** If these leave the scan, the surface broke — fail rather than report a smaller number. */
const SURFACE_ANCHORS = [
  `${STAGE_DIR}type-checker.fungi`,
  `${STAGE_DIR}effect-checker.fungi`,
  `${STAGE_DIR}governance-verifier.fungi`,
];

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (e.endsWith(".fungi")) acc.push(p);
  }
  return acc;
}

const rel = (abs) => relative(ROOT, abs).replace(/\\/g, "/");

/**
 * Blank string literals and comments so prose never counts as erasure. Blanking (not deleting)
 * preserves offsets, which keeps any future line-reporting honest.
 */
export function blankNonCode(src) {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {                       // line comment (covers /// docs)
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      out += "\n";
    } else if (c === "/" && src[i + 1] === "*") {                 // block comment
      out += "  "; i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i++;
    } else if (c === '"') {                                       // string literal
      out += " "; i++;
      while (i < src.length && src[i] !== '"') { if (src[i] === "\\") { out += " "; i++; } out += src[i] === "\n" ? "\n" : " "; i++; }
      out += " ";
    } else out += c;
  }
  return out;
}

export const countAuto = (src) => (blankNonCode(src).match(/\bAuto\b/g) ?? []).length;

function measure() {
  const files = walk(ROOT);
  const counts = {};
  for (const abs of files) {
    let src;
    try { src = readFileSync(abs, "utf8"); } catch { continue; }
    const n = countAuto(src);
    if (n > 0) counts[rel(abs)] = n;
  }
  return { counts, scanned: files.length };
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return null;
  try { return JSON.parse(readFileSync(BASELINE, "utf8")); } catch { return null; }
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────────
const FIXTURES = [
  { name: "counts a bare Array<Auto> param", src: `flow f(xs: Array<Auto>) -> Int { }`, expect: 1 },
  { name: "counts every occurrence on one line", src: `let a: Array<Auto> = b as Array<Auto>`, expect: 2 },
  { name: "Auto in a // comment is prose, not erasure", src: `// TODO: drop Array<Auto> here\nflow f() {}`, expect: 0 },
  { name: "Auto in a /// doc header is prose", src: `/// concept: Auto inference\nflow f() {}`, expect: 0 },
  { name: "Auto in a block comment is prose", src: `/* Array<Auto> explained */\nflow f() {}`, expect: 0 },
  { name: "Auto inside a string literal is not erasure", src: `let s: String = "Array<Auto>"`, expect: 0 },
  { name: "Automatic / AutoScale do not match (word boundary)", src: `let Automatic = 1\nlet x: AutoScale = 2`, expect: 0 },
  { name: "code after a comment still counts", src: `// Array<Auto>\nflow f(xs: Array<Auto>) {}`, expect: 1 },
];

function selfTest() {
  let pass = 0, fail = 0;
  for (const f of FIXTURES) {
    const got = countAuto(f.src);
    if (got === f.expect) { pass++; console.log(`  ok   ${f.name}`); }
    else { fail++; console.log(`  FAIL ${f.name} — expected ${f.expect}, got ${got}`); }
  }
  // The assertion a fixture can never make: is the real surface still there?
  const { counts, scanned } = measure();
  if (scanned > 0) { pass++; console.log(`  ok   surface non-empty (${scanned} .fungi files scanned)`); }
  else { fail++; console.log(`  FAIL surface EMPTY — 0 .fungi files found`); }
  for (const a of SURFACE_ANCHORS) {
    if (counts[a] !== undefined) { pass++; console.log(`  ok   anchor carries Auto and is in scope: ${a}`); }
    else { fail++; console.log(`  FAIL anchor MISSING from the measurement: ${a}`); }
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

const { counts, scanned } = measure();
if (scanned === 0) {
  console.error(`[auto-erasure-ratchet] ZERO .fungi files found — the scan is broken, not the code. Refusing to report clean.`);
  process.exit(1);
}
for (const a of SURFACE_ANCHORS) {
  if (counts[a] === undefined) {
    console.error(`[auto-erasure-ratchet] SURFACE BROKEN: anchor '${a}' carries no measurable Auto — refusing to report clean.`);
    process.exit(1);
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
const stageTotal = Object.entries(counts).filter(([f]) => f.startsWith(STAGE_DIR)).reduce((a, [, n]) => a + n, 0);

if (argv.includes("--update-baseline")) {
  writeFileSync(BASELINE, `${JSON.stringify({
    note: "Shrink-only ratchet on Auto type erasure (P9/#100). Counts may DECREASE freely; any increase or new file is a deliberate act that must be re-baselined with a reason. See scripts/audit-auto-erasure-ratchet.mjs.",
    generated_by: "scripts/audit-auto-erasure-ratchet.mjs --update-baseline",
    total, stage_total: stageTotal, files: counts,
  }, null, 2)}\n`, "utf8");
  console.log(`baseline written: ${total} occurrences across ${Object.keys(counts).length} files (stages: ${stageTotal})`);
  process.exit(0);
}

const base = loadBaseline();
if (base === null) {
  console.error(`[auto-erasure-ratchet] no baseline at ${rel(BASELINE)} — run --update-baseline once to set the ratchet.`);
  process.exit(1);
}

const grown = [], added = [], shrunk = [], cleared = [];
for (const [f, n] of Object.entries(counts)) {
  const was = base.files[f];
  if (was === undefined) added.push([f, n]);
  else if (n > was) grown.push([f, was, n]);
  else if (n < was) shrunk.push([f, was, n]);
}
for (const f of Object.keys(base.files)) if (counts[f] === undefined) cleared.push(f);

if (argv.includes("--json")) {
  console.log(JSON.stringify({ total, stageTotal, counts, grown, added, shrunk, cleared, baselineTotal: base.total }, null, 2));
  process.exit(grown.length || added.length ? 1 : 0);
}

console.log(`\naudit-auto-erasure-ratchet — Auto type erasure (P9/#100), shrink-only`);
console.log(`  ${scanned} .fungi scanned · ${total} occurrences in ${Object.keys(counts).length} files · ${stageTotal} in the self-hosted stages`);
console.log(`  baseline: ${base.total} total (${base.stage_total} stages) → delta ${total - base.total >= 0 ? "+" : ""}${total - base.total}`);
for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  const was = base.files[f];
  const tag = was === undefined ? "  ← NEW (not baselined)" : n < was ? `  ← was ${was}, retiring` : n > was ? `  ← was ${was}, GREW` : "";
  console.log(`    ${String(n).padStart(4)}  ${f}${tag}`);
}
if (shrunk.length || cleared.length) {
  console.log(`\n  progress: ${shrunk.length} file(s) reduced, ${cleared.length} fully cleared — re-tighten with --update-baseline`);
  for (const [f, was, n] of shrunk) console.log(`    ${f}: ${was} → ${n}`);
  for (const f of cleared) console.log(`    ${f}: CLEARED`);
}
const violations = grown.length + added.length;
// Explicit summary for run-phase-close — these are DEBT sites, not passing tests.
console.log(`SUMMARY: ${total} Auto erasure site(s), ${stageTotal} in stages · ${violations} violation(s)`);
console.log(`\nVIOLATIONS: ${violations}`);
if (violations > 0) {
  for (const [f, was, n] of grown) console.log(`  x ${f} GREW ${was} → ${n}`);
  for (const [f, n] of added) console.log(`  x ${f} is NEW with ${n} occurrence(s)`);
  console.log(`\nThe Auto wildcard was granted on condition that the erasure only shrinks. To add erasure`);
  console.log(`deliberately, re-baseline with --update-baseline and record why. p9-100-site-mapper.mjs`);
  console.log(`proposes the concrete element type for each site.`);
}
process.exit(violations > 0 ? 1 : 0);
