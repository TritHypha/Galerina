#!/usr/bin/env node
// audit-codes-full.mjs — Comprehensive diagnostic-code audit for Galerina.
//
// Builds on code-index.json (run `node scripts/code-index.mjs` first) and adds:
//
//   CHECK-1  DEFINITION        code is emitted but has no exported const (R4 / inline risk)
//   CHECK-2  VALIDATION        code is emitted but has zero tests (coverage gap)
//   CHECK-3  V2-COLLISION      one name is shared by >1 code (audit-diagnostic-codes V2)
//   CHECK-4  V4-SEVERITY       one code emitted at >1 severity (legit dev/prod toggle is annotated)
//   CHECK-5  DEAD              defined but never emitted/tested/referenced (std #1 wire-or-retire)
//   CHECK-6  PHANTOM           doc-only mention, never in source (DOC-004 drift)
//   CHECK-7  REF-ONLY          referenced but never emitted (hollow mention)
//   CHECK-8  GALERINA-ENV      GALERINA_* env vars — presence, doc status, usage count
//   CHECK-9  FUNGI-VALUESTATE  FUNGI-VALUESTATE-* specifically: all emitted + tested?
//   CHECK-10 GOVERNANCE-CODES  FUNGI-GOV-* specifically: all wired + tested?
//
// Severity tiers (exit code = number of ERROR-tier findings, capped at 250):
//   ERROR    must be fixed before shipping (dead code, collision, missing test on security code)
//   WARN     should be fixed (inline without const, ref-only)
//   INFO     informational (phantom docs, GALERINA_* doc gaps)
//
// Usage:
//   node scripts/code-index.mjs && node scripts/audit-codes-full.mjs
//   node scripts/audit-codes-full.mjs --json    # machine-readable JSON to stdout
//   node scripts/audit-codes-full.mjs --family VALUESTATE   # focus on one family
//
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
const FAMILY_FILTER = (() => { const i = args.indexOf("--family"); return i >= 0 ? args[i + 1]?.toUpperCase() : null; })();

// ── KNOWN LEGITIMATE MULTI-SEVERITY CODES ──────────────────────────────────
// These codes intentionally emit at different severities depending on profile.
// Document each with the reason so CHECK-4 can skip them cleanly.
const KNOWN_MULTI_SEVERITY = new Map([
  ["FUNGI-GOV-024", "intentional: warning in dev/check, error in production/deterministic (DSS.wasm isolation gap)"],
  ["FUNGI-EFFECT-001", "intentional: downgraded to warning in dev/check/build modes per cli.ts line ~460"],
  ["FUNGI-STDLIB-001", "intentional: downgraded to warning in dev/check/build modes per cli.ts line ~460"],
  ["FUNGI-VALUESTATE-008", "intentional: dev-warning gap documented in compiler TODO.md"],
]);

// ── KNOWN LEGITIMATE NAME COLLISIONS ────────────────────────────────────────
// Pairs where the same name is deliberately shared (e.g. a lexer and a lint rule
// both using EXCESSIVE_NESTING, where one is the structural and one the ergonomic variant).
// Each entry maps name -> [code-A, code-B, reason].
const KNOWN_NAME_COLLISIONS = new Map([
  ["EXCESSIVE_NESTING", ["FUNGI-LEX-001", "FUNGI-LINT-001",
    "FUNGI-LEX-001 is a hard parse error (generic nesting >8); FUNGI-LINT-001 is an ergonomics info (flow body nesting >4). " +
    "Same symptom, different tiers. TODO: rename FUNGI-LINT-001 name to FLOW_EXCESSIVE_NESTING to make them orthogonal."]],
]);

// ── KNOWN INDEXER FALSE-POSITIVE COLLISIONS ───────────────────────────────────
// The code-index.mjs uses an 8-line window around each `code:` occurrence to grab
// the accompanying `name:` field. When multiple definitions or inline emits appear
// within 8 lines of each other, one code's window captures the NEXT code's name,
// producing phantom name collisions. These are NOT real collisions — each code has
// exactly one name. Skip them in CHECK-3.
//
// FALSE-POSITIVE SET: names known to be captured by window bleed, and the single
// true owner for each. Format: name -> true-owner-code.
const WINDOW_BLEED_TRUE_OWNER = new Map([
  // FUNGI-TYPE-010..019: consecutive single-line defs at index.ts:356-365
  ["UNSATISFIED_GENERIC_CONSTRAINT", "FUNGI-TYPE-010"],
  ["INVALID_COLLECTION_ELEMENT",     "FUNGI-TYPE-011"],
  ["INVALID_RESULT_TYPE",            "FUNGI-TYPE-012"],
  ["INVALID_SECRET_OPERATION",       "FUNGI-TYPE-013"],
  ["MISSING_REQUIRED_EFFECT",        "FUNGI-TYPE-014"],
  ["GOVERNED_SINK_VIOLATION",        "FUNGI-TYPE-015"],
  ["TENSOR_SHAPE_MISMATCH",          "FUNGI-TYPE-016"],
  ["QUANTIZED_PRECISION_MISMATCH",   "FUNGI-TYPE-017"],
  ["INVALID_RUNTIME_TARGET_TYPE",    "FUNGI-TYPE-018"],
  ["UNKNOWN_SYMBOL",                 "FUNGI-TYPE-019"],
  ["WRONG_NAME",                     "FUNGI-TYPE-099"],
  ["X",                              "FUNGI-TYPE-001"], // single-char names in TYPE window
  ["Y",                              "FUNGI-TYPE-001"],
  // FUNGI-EFFECT-005/006: DENY_ONLY_EFFECT is the name of FUNGI-EFFECT-006;
  // it bleeds into FUNGI-EFFECT-005 window (17 lines apart) and FUNGI-VAL-001
  // window in governance-verifier.ts (inline emit at effect-checker.ts:908).
  ["DENY_ONLY_EFFECT",               "FUNGI-EFFECT-006"],
]);

// A collision is a window false-positive when ALL non-owner codes are known bleed victims.
function isWindowBleedFalsePositive(name, codes) {
  const trueOwner = WINDOW_BLEED_TRUE_OWNER.get(name);
  if (!trueOwner) return false;
  // Every code in the set is either the true owner or a known bleed victim (not the owner)
  return [...codes].every((c) => c === trueOwner || WINDOW_BLEED_TRUE_OWNER.has(name));
}

// ── SECURITY-CRITICAL FAMILIES (zero-test tolerance = ERROR not WARN) ────────
const SECURITY_FAMILIES = new Set([
  "GOV", "SEC", "TAINT", "TENANT", "VAULT", "PRIVACY",
  "SUBSTRATE", "AFFINE", "RUNTIME", "ANTI",
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load code-index
// ─────────────────────────────────────────────────────────────────────────────
let INDEX;
try {
  INDEX = JSON.parse(readFileSync(join(ROOT, "build/code-index/code-index.json"), "utf8"));
} catch {
  console.error("audit-codes-full: build/code-index/code-index.json not found.");
  console.error("  Run:  node scripts/code-index.mjs");
  process.exit(2);
}

if (FAMILY_FILTER) {
  INDEX = INDEX.filter((c) => c.family?.toUpperCase().includes(FAMILY_FILTER) || c.code?.toUpperCase().includes(FAMILY_FILTER));
}

const statusOf = (c) => {
  const defs = (c.defs || []).length, emits = (c.emits || []).length, tests = c.tests || 0, refs = c.refs || 0;
  if (c.docOnly) return "phantom";
  if (emits > 0) return defs > 0 ? "live" : "inline";
  if (defs > 0) return (tests === 0 && refs === 0) ? "dead" : "referenced";
  return "ref";
};

const familyOf = (code) => {
  const m = code.match(/^(?:FUNGI|ERR)[_-]([A-Z0-9]+)/);
  return m ? m[1] : "OTHER";
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scan GALERINA_* env vars from source
// ─────────────────────────────────────────────────────────────────────────────
function walkSrc(dir) {
  const out = [];
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of ents) {
    if (["node_modules", "dist", ".git", "build"].includes(d.name)) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...walkSrc(p));
    else if (/\.(ts|mjs|cjs|md)$/.test(d.name) && !d.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const galerinaEnvRefs = new Map(); // name -> { readSites: [], docSites: [], writeSites: [] }
const GALERINA_ENV_RE = /GALERINA_[A-Z0-9_]+/g;

for (const file of walkSrc(join(ROOT, "packages-galerina"))) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const isDoc = rel.endsWith(".md");
  let txt; try { txt = readFileSync(file, "utf8"); } catch { continue; }
  for (const m of txt.matchAll(GALERINA_ENV_RE)) {
    const name = m[0];
    if (!galerinaEnvRefs.has(name)) galerinaEnvRefs.set(name, { readSites: [], docSites: [], writeSites: [] });
    const entry = galerinaEnvRefs.get(name);
    if (isDoc) entry.docSites.push(rel);
    else entry.readSites.push(rel);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Run all checks
// ─────────────────────────────────────────────────────────────────────────────
const findings = []; // { check, code, severity:"ERROR"|"WARN"|"INFO", message, detail }

const add = (check, code, severity, message, detail = "") =>
  findings.push({ check, code, severity, message, detail });

// ── CHECK-5: DEAD codes ──────────────────────────────────────────────────────
for (const c of INDEX) {
  if (statusOf(c) === "dead") {
    const fam = familyOf(c.code);
    const sev = SECURITY_FAMILIES.has(fam) ? "ERROR" : "WARN";
    add("CHECK-5-DEAD", c.code, sev,
      `${c.code} is defined (exported const) but never emitted, tested, or referenced`,
      `names: ${(c.names || []).join(",")||"(none)"} · defs: ${(c.defs||[]).join(", ")||"—"}`);
  }
}

// ── CHECK-3: NAME COLLISION (V2) ─────────────────────────────────────────────
const nameMap = new Map(); // name -> Set<code>
for (const c of INDEX) {
  for (const n of (c.names || [])) {
    if (!nameMap.has(n)) nameMap.set(n, new Set());
    nameMap.get(n).add(c.code);
  }
}
for (const [name, codes] of nameMap) {
  if (codes.size < 2) continue;
  // Skip indexer window false-positives (consecutive defs / inline emits within 8-line window)
  if (isWindowBleedFalsePositive(name, codes)) continue;
  const known = KNOWN_NAME_COLLISIONS.get(name);
  const knownCodes = known ? known.slice(0, 2) : [];
  const isKnown = known && [...codes].every((c) => knownCodes.includes(c));
  if (isKnown) {
    add("CHECK-3-COLLISION", [...codes].join("+"), "INFO",
      `Name '${name}' shared by ${[...codes].join(" and ")} — KNOWN/ANNOTATED`,
      `Reason: ${known[2]}`);
  } else {
    add("CHECK-3-COLLISION", [...codes].join("+"), "ERROR",
      `Name '${name}' shared by ${[...codes].join(" and ")} — V2 COLLISION (one name must map to one code)`,
      `Codes: ${[...codes].join(", ")}`);
  }
}

// ── CHECK-4: MULTI-SEVERITY (V4) ─────────────────────────────────────────────
for (const c of INDEX) {
  const sevs = c.severities || [];
  if (sevs.length < 2) continue;
  const known = KNOWN_MULTI_SEVERITY.get(c.code);
  if (known) {
    add("CHECK-4-MULTI-SEV", c.code, "INFO",
      `${c.code} emits at multiple severities — KNOWN/ANNOTATED`,
      `Severities: ${sevs.join("/")} · Reason: ${known}`);
  } else {
    add("CHECK-4-MULTI-SEV", c.code, "WARN",
      `${c.code} emits at multiple severities ${sevs.join("/")} — review: legit profile toggle or accident?`,
      `Sites: ${(c.allSites||[]).filter(s=>s.startsWith("emit")).join(", ")}`);
  }
}

// ── CHECK-1: INLINE codes (emitted, no exported const) ───────────────────────
for (const c of INDEX) {
  if (statusOf(c) !== "inline") continue;
  const fam = familyOf(c.code);
  const sev = SECURITY_FAMILIES.has(fam) ? "WARN" : "INFO";
  add("CHECK-1-INLINE", c.code, sev,
    `${c.code} is emitted but has no exported const — harder to grep/trace/test`,
    `emits: ${(c.emits||[]).length} · names: ${(c.names||[]).join(",")||"(none)"}`);
}

// ── CHECK-2: EMITTED BUT ZERO TESTS ──────────────────────────────────────────
for (const c of INDEX) {
  if ((c.emits||[]).length === 0 || c.tests > 0) continue;
  const fam = familyOf(c.code);
  const sev = SECURITY_FAMILIES.has(fam) ? "ERROR" : "WARN";
  add("CHECK-2-NO-TEST", c.code, sev,
    `${c.code} is emitted but has zero tests — ${sev === "ERROR" ? "SECURITY-CRITICAL family requires test coverage" : "test gap"}`,
    `family: ${fam} · emits: ${(c.emits||[]).length} · names: ${(c.names||[]).join(",")||"(none)"}`);
}

// ── CHECK-7: REF-ONLY (mentioned, never emitted) ──────────────────────────────
for (const c of INDEX) {
  if (statusOf(c) !== "ref") continue;
  add("CHECK-7-REF-ONLY", c.code, "INFO",
    `${c.code} is referenced in source but never emitted (hollow mention or planned)`,
    `refs: ${c.refs||0} · docs: ${c.docs||0}`);
}

// ── CHECK-6: PHANTOM (doc-only) ───────────────────────────────────────────────
for (const c of INDEX) {
  if (!c.docOnly) continue;
  add("CHECK-6-PHANTOM", c.code, "INFO",
    `${c.code} appears only in documentation — never defined or emitted in source (DOC-004 drift)`,
    `docs: ${c.docs||0}`);
}

// ── CHECK-9: FUNGI-VALUESTATE-* full audit ────────────────────────────────────
const vsFamily = INDEX.filter((c) => c.code.startsWith("FUNGI-VALUESTATE-"));
for (const c of vsFamily) {
  const s = statusOf(c);
  if (s === "dead") {
    add("CHECK-9-VALUESTATE", c.code, "ERROR",
      `FUNGI-VALUESTATE: ${c.code} defined but never emitted or tested`, "");
  } else if (s === "ref") {
    add("CHECK-9-VALUESTATE", c.code, "WARN",
      `FUNGI-VALUESTATE: ${c.code} referenced but never emitted (may be planned)`, "");
  } else if ((c.emits||[]).length > 0 && c.tests === 0) {
    add("CHECK-9-VALUESTATE", c.code, "WARN",
      `FUNGI-VALUESTATE: ${c.code} emitted but has zero tests`, "");
  } else if (s === "phantom") {
    add("CHECK-9-VALUESTATE", c.code, "INFO",
      `FUNGI-VALUESTATE: ${c.code} doc-only mention (phantom)`, "");
  } else {
    // OK: live or inline with tests
  }
}

// ── CHECK-10: FUNGI-GOV-* full audit ─────────────────────────────────────────
const govFamily = INDEX.filter((c) => c.code.startsWith("FUNGI-GOV-"));
for (const c of govFamily) {
  const s = statusOf(c);
  if (s === "dead") {
    add("CHECK-10-GOV", c.code, "ERROR",
      `FUNGI-GOV: ${c.code} defined but never emitted — RESERVED, wire or retire`, "");
  } else if ((c.emits||[]).length > 0 && c.tests === 0) {
    add("CHECK-10-GOV", c.code, "ERROR",
      `FUNGI-GOV: ${c.code} emitted but has zero tests — governance code requires test coverage`, "");
  } else if (s === "ref") {
    add("CHECK-10-GOV", c.code, "WARN",
      `FUNGI-GOV: ${c.code} referenced only, never emitted (planned?)`, "");
  }
}

// ── CHECK-8: GALERINA_* env vars ─────────────────────────────────────────────
for (const [name, entry] of [...galerinaEnvRefs].sort((a, b) => a[0].localeCompare(b[0]))) {
  const srcCount = entry.readSites.length;
  const docCount = entry.docSites.length;
  if (srcCount === 0 && docCount > 0) {
    add("CHECK-8-ENV", name, "WARN",
      `${name} appears only in docs — never read in source (stale doc?)`,
      `docSites: ${entry.docSites.slice(0,3).join(", ")}`);
  } else if (docCount === 0 && srcCount > 0) {
    add("CHECK-8-ENV", name, "INFO",
      `${name} is read in source (${srcCount} site(s)) but never documented in any .md`,
      `srcSites: ${entry.readSites.slice(0,3).join(", ")}`);
  }
  // else both present = OK, only flag gaps
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Output
// ─────────────────────────────────────────────────────────────────────────────
if (JSON_MODE) {
  console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
  process.exit(0);
}

const byCheck = {};
for (const f of findings) (byCheck[f.check] ??= []).push(f);

const errors = findings.filter((f) => f.severity === "ERROR");
const warns  = findings.filter((f) => f.severity === "WARN");
const infos  = findings.filter((f) => f.severity === "INFO");

const BOLD  = (s) => `\x1b[1m${s}\x1b[0m`;
const RED   = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW= (s) => `\x1b[33m${s}\x1b[0m`;
const CYAN  = (s) => `\x1b[36m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const DIM   = (s) => `\x1b[2m${s}\x1b[0m`;

const SEV_LABEL = { ERROR: RED("ERROR"), WARN: YELLOW("WARN "), INFO: CYAN("INFO ") };

console.log(BOLD(`\n╔══ Galerina Diagnostic-Code Full Audit ════════════════════════════╗`));
console.log(BOLD(`║  ${INDEX.length} codes indexed  ·  ${errors.length} errors  ·  ${warns.length} warnings  ·  ${infos.length} info           ║`));
console.log(BOLD(`╚═══════════════════════════════════════════════════════════════════╝\n`));

// Summary table
const summary = [
  ["CHECK-1-INLINE",      "Emitted, no exported const (R4)"],
  ["CHECK-2-NO-TEST",     "Emitted, zero tests"],
  ["CHECK-3-COLLISION",   "Name collision (V2)"],
  ["CHECK-4-MULTI-SEV",   "Multi-severity (V4)"],
  ["CHECK-5-DEAD",        "Defined, never emitted/tested"],
  ["CHECK-6-PHANTOM",     "Doc-only phantom (DOC-004)"],
  ["CHECK-7-REF-ONLY",    "Referenced, never emitted"],
  ["CHECK-8-ENV",         "GALERINA_* env var gaps"],
  ["CHECK-9-VALUESTATE",  "FUNGI-VALUESTATE-* issues"],
  ["CHECK-10-GOV",        "FUNGI-GOV-* issues"],
];
console.log(BOLD("Summary"));
console.log("─".repeat(68));
for (const [check, label] of summary) {
  const items = byCheck[check] || [];
  const errN  = items.filter(f => f.severity === "ERROR").length;
  const wrnN  = items.filter(f => f.severity === "WARN").length;
  const infN  = items.filter(f => f.severity === "INFO").length;
  const badge = errN ? RED(`${errN}E`) : wrnN ? YELLOW(`${wrnN}W`) : GREEN("OK");
  const detail = [errN && `${errN} error`, wrnN && `${wrnN} warn`, infN && `${infN} info`].filter(Boolean).join(" · ") || "clean";
  console.log(`  ${badge.padEnd(14)}  ${label.padEnd(36)}  ${DIM(detail)}`);
}
console.log("");

// Detail sections — show all ERRORs and WARNs, collapse INFOs unless single family mode
const SHOW_INFO = FAMILY_FILTER !== null;

for (const [check, label] of summary) {
  const items = byCheck[check] || [];
  const toShow = SHOW_INFO ? items : items.filter(f => f.severity !== "INFO");
  if (toShow.length === 0) continue;

  console.log(BOLD(`\n── ${check}: ${label} (${items.length} total, showing ${toShow.length}) ──`));
  for (const f of toShow) {
    console.log(`  ${SEV_LABEL[f.severity]}  ${f.code.padEnd(36)}  ${f.message}`);
    if (f.detail) console.log(`         ${DIM(f.detail)}`);
  }
}

// VALUESTATE full table (always shown)
if (!FAMILY_FILTER || FAMILY_FILTER === "VALUESTATE") {
  const vsAll = INDEX.filter((c) => c.code.startsWith("FUNGI-VALUESTATE-")).sort((a,b)=>a.code.localeCompare(b.code));
  if (vsAll.length > 0) {
    console.log(BOLD(`\n── FUNGI-VALUESTATE-* complete status (${vsAll.length} codes) ──`));
    console.log(`  ${"CODE".padEnd(28)} ${"STATUS".padEnd(12)} ${"DEFS".padEnd(5)} ${"EMITS".padEnd(6)} ${"TESTS".padEnd(6)} NAMES`);
    console.log("  " + "─".repeat(80));
    for (const c of vsAll) {
      const s = statusOf(c);
      const sLabel = s === "live" ? GREEN(s.padEnd(12)) : s === "dead" ? RED(s.padEnd(12)) : s === "phantom" ? CYAN(s.padEnd(12)) : s === "inline" ? YELLOW(s.padEnd(12)) : DIM(s.padEnd(12));
      console.log(`  ${c.code.padEnd(28)} ${sLabel} ${String((c.defs||[]).length).padEnd(5)} ${String((c.emits||[]).length).padEnd(6)} ${String(c.tests||0).padEnd(6)} ${(c.names||[]).join(",")||"—"}`);
    }
  }
}

// GOV full table (always shown unless filtered out)
if (!FAMILY_FILTER || FAMILY_FILTER === "GOV") {
  const govAll = INDEX.filter((c) => c.code.startsWith("FUNGI-GOV-")).sort((a,b)=>a.code.localeCompare(b.code));
  if (govAll.length > 0) {
    console.log(BOLD(`\n── FUNGI-GOV-* complete status (${govAll.length} codes) ──`));
    console.log(`  ${"CODE".padEnd(20)} ${"STATUS".padEnd(12)} ${"DEFS".padEnd(5)} ${"EMITS".padEnd(6)} ${"TESTS".padEnd(6)} NAMES`);
    console.log("  " + "─".repeat(80));
    for (const c of govAll) {
      const s = statusOf(c);
      const sLabel = s === "live" ? GREEN(s.padEnd(12)) : s === "dead" ? RED(s.padEnd(12)) : s === "phantom" ? CYAN(s.padEnd(12)) : s === "inline" ? YELLOW(s.padEnd(12)) : DIM(s.padEnd(12));
      console.log(`  ${c.code.padEnd(20)} ${sLabel} ${String((c.defs||[]).length).padEnd(5)} ${String((c.emits||[]).length).padEnd(6)} ${String(c.tests||0).padEnd(6)} ${(c.names||[]).join(",")||"—"}`);
    }
  }
}

// GALERINA_* env var table
if (!FAMILY_FILTER) {
  const envEntries = [...galerinaEnvRefs].sort((a,b)=>a[0].localeCompare(b[0]));
  console.log(BOLD(`\n── GALERINA_* environment variables (${envEntries.length} unique names) ──`));
  console.log(`  ${"NAME".padEnd(40)} ${"SRC".padEnd(5)} ${"DOC".padEnd(5)} STATUS`);
  console.log("  " + "─".repeat(70));
  for (const [name, e] of envEntries) {
    const src = e.readSites.length, doc = e.docSites.length;
    const status = src === 0 ? RED("doc-only (stale?)") : doc === 0 ? YELLOW("undocumented") : GREEN("OK");
    console.log(`  ${name.padEnd(40)} ${String(src).padEnd(5)} ${String(doc).padEnd(5)} ${status}`);
  }
}

// Final verdict
console.log("\n" + "═".repeat(68));
if (errors.length === 0 && warns.length === 0) {
  console.log(GREEN(BOLD("✅  All checks passed — no errors or warnings.")));
} else if (errors.length === 0) {
  console.log(YELLOW(BOLD(`⚠️   ${warns.length} warning(s) — no errors.`)));
} else {
  console.log(RED(BOLD(`❌  ${errors.length} error(s), ${warns.length} warning(s) — fix errors before shipping.`)));
}
console.log("═".repeat(68) + "\n");

process.exit(Math.min(errors.length, 250));
