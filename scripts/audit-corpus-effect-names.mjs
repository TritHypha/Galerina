#!/usr/bin/env node
// =============================================================================
// audit-corpus-effect-names.mjs — the CORPUS half of the effect-vocabulary SoT
// =============================================================================
// audit-effect-canonicality.mjs proves the compiler's TABLES + docs agree with
// CANONICAL_EFFECTS. This audit proves the CODE CORPUS does: every effect name
// DECLARED in a .fungi `effects { … }` block must be a name a PRODUCTION compile
// accepts. The gap this closes (found 2026-07-02): nothing production-compiles
// the examples, so an example can teach a name production rejects
// (plausible-but-non-compiling — the exact failure class CG-6 exists for).
//
// Classification mirrors effect-checker.ts validateDeclaredEffectNames:
//   canonical            → OK
//   broad alias          → WARN  (FUNGI-EFFECT-005 is a warning; production passes)
//   non-broad alias      → BLOCK (FUNGI-EFFECT-004 error at production)
//   deny-only            → BLOCK (never grantable, any profile)
//   unknown              → BLOCK (FUNGI-EFFECT-004 error at production)
//
// Scope: BLOCKING for the teaching corpus (examples/, docs/, packages-*/src);
// report-only under tests/ (negative fixtures legitimately use bad names).
//
// Usage: node scripts/audit-corpus-effect-names.mjs [--root <dir>] [--json]
// Exit 0 = corpus clean · 1 = blocking finding in the teaching corpus.
// =============================================================================
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const rootIdx = process.argv.indexOf("--root");
const ROOT = rootIdx !== -1 ? process.argv[rootIdx + 1] : join(HERE, "..");
const wantJson = process.argv.includes("--json");
const EFFECT_CHECKER = join(ROOT, "packages-galerina/galerina-core-compiler/src/effect-checker.ts");

// ── table extraction (same regex-over-source approach as audit-effect-canonicality) ──
function sliceBlock(src, declName) {
  const start = src.indexOf(declName);
  if (start === -1) return null;
  const eq = src.indexOf("=", start);
  const from = eq === -1 ? start : eq;
  const bi = src.indexOf("[", from), ci = src.indexOf("{", from);
  const openIdx = bi === -1 ? ci : ci === -1 ? bi : Math.min(bi, ci);
  if (openIdx === -1) return null;
  const openCh = src[openIdx], closeCh = openCh === "[" ? "]" : "}";
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return null;
}
const quoted = (block) => block ? [...block.matchAll(/"([a-zA-Z][\w.]*)"/g)].map((m) => m[1]) : [];
const mapKeys = (block) => block ? [...block.matchAll(/\[\s*"([^"]+)"\s*,/g)].map((m) => m[1]) : [];

const checkerSrc = readFileSync(EFFECT_CHECKER, "utf8");
const CANONICAL = new Set(quoted(sliceBlock(checkerSrc, "const CANONICAL_EFFECTS")));
const ALIASES = new Set(mapKeys(sliceBlock(checkerSrc, "const EFFECT_NAME_ALIASES")));
const BROAD = new Set(quoted(sliceBlock(checkerSrc, "const BROAD_EFFECT_ALIASES")));
// DENY_ONLY_EFFECTS is optional (added 2026-07-02); absent table → empty set.
const DENY_ONLY = new Set(quoted(sliceBlock(checkerSrc, "const DENY_ONLY_EFFECTS")));
if (CANONICAL.size === 0) {
  console.error("❌ could not extract CANONICAL_EFFECTS from effect-checker.ts — refusing to audit against an empty vocabulary (fail-closed).");
  process.exit(1);
}

// ── corpus walk ────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".galerina", ".graph"]);
function walkFungi(dir, acc) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walkFungi(p, acc); }
    else if (e.isFile() && e.name.endsWith(".fungi")) acc.push(p);
  }
  return acc;
}

/** Extract every name inside every `effects { … }` block (comment lines stripped). */
function declaredEffectNames(src) {
  const names = [];
  const re = /\beffects\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 1, i = re.lastIndex, start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const body = src.slice(start, i - 1).replace(/\/\/[^\n]*/g, "").replace(/;;[^\n]*/g, "");
    for (const t of body.matchAll(/[a-zA-Z_]\w*(?:\.\w+)+|\b[a-zA-Z_]\w*\b/g)) {
      // `allow` / `deny` / `grant` are effects-block KEYWORDS (e.g.
      // `effects { allow database.write }`), not effect names.
      if (t[0] === "allow" || t[0] === "deny" || t[0] === "grant") continue;
      names.push(t[0]);
    }
  }
  return names;
}

// ── reviewed allowlist (CG-3 style: muting is visible + reasoned, never silent) ──
// The aerospace showcase invents DOMAIN effect names with no canonical family yet
// (mission.*, orbit.*, propulsion.*, navigation.*, flight_control.*). Whether custom
// domain namespaces become a governed extension mechanism is an OWNER-GATED design
// question (new canonical families = authority-vocabulary expansion) — tracked in the
// session TODO as "domain-effect namespace R&D". Until decided, these exact
// (file, name) pairs are WARN-level; ANY new invented name anywhere still BLOCKS.
// Adding an entry here requires owner review.
const ASPIRATIONAL_ALLOWLIST = new Map([
  ["examples/aerospace/planSatelliteManeuver.fungi", new Set(["mission.read", "orbit.compute", "propulsion.plan"])],
  ["examples/aerospace/processFlightTelemetry.fungi", new Set(["navigation.compute", "flight_control.propose"])],
  ["examples/aerospace/updateFlightPath.fungi", new Set(["navigation.compute", "flight_control.propose"])],
]);

const files = walkFungi(ROOT, []);
const findings = []; // {file, name, class, blocking}
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  // Stage-B self-hosted compiler source manipulates effect syntax AS DATA
  // (parser fixtures like `effects { e1 e2 }` inside parser.fungi) — compiler
  // internals, not teaching corpus. Skip entirely.
  if (rel.includes("/self-hosted/")) continue;
  const inTests = /(^|\/)tests?\//.test(rel);
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  for (const name of declaredEffectNames(src)) {
    if (CANONICAL.has(name) && !DENY_ONLY.has(name)) continue;
    let cls, blocking;
    if (DENY_ONLY.has(name)) {
      // Deny-only names are normally BLOCK (never grantable, any profile). EXCEPTION: a
      // NEGATIVE example that deliberately declares one to TEACH the deny — and says so
      // in-file via `/// expected_diagnostics: … FUNGI-EFFECT-006` — is legitimate (the
      // curriculum analogue of the report-only negative fixtures under tests/; e.g.
      // example 182, RD-0358 H-6 / RD-0360 Q2). Fail-closed: ONLY an explicit
      // expected-deny header exempts it; any other deny-only declaration still BLOCKS.
      const declaresDeny = /\/\/\/\s*expected_diagnostics:[^\n]*\bFUNGI-EFFECT-006\b/.test(src);
      cls = declaresDeny ? "deny-only-demonstration" : "deny-only";
      blocking = !declaresDeny;
    }
    else if (BROAD.has(name)) { cls = "broad-alias"; blocking = false; }
    else if (ALIASES.has(name)) { cls = "alias"; blocking = true; }
    else if (ASPIRATIONAL_ALLOWLIST.get(rel)?.has(name)) { cls = "allowlisted-aspirational"; blocking = false; }
    else { cls = "unknown"; blocking = true; }
    findings.push({ file: rel, name, class: cls, blocking: blocking && !inTests, reportOnly: inTests });
  }
}

const blocking = findings.filter((x) => x.blocking);
const demos = findings.filter((x) => x.class === "deny-only-demonstration");
const warns = findings.filter((x) => !x.blocking && !x.reportOnly && x.class !== "deny-only-demonstration");
const testOnly = findings.filter((x) => x.reportOnly);

if (wantJson) {
  console.log(JSON.stringify({ files: files.length, canonical: CANONICAL.size, findings }, null, 2));
} else {
  console.log(`=== corpus effect-name audit (SoT: effect-checker.ts CANONICAL_EFFECTS) ===`);
  console.log(`   .fungi files: ${files.length} | canonical: ${CANONICAL.size} | aliases: ${ALIASES.size} | deny-only: ${DENY_ONLY.size}`);
  for (const x of blocking) console.log(`   ❌ [${x.class}] ${x.file}: effects { ${x.name} } — production compile rejects this name`);
  for (const x of demos) console.log(`   ✅ [${x.class}] ${x.file}: effects { ${x.name} } — deliberate deny demonstration (declares expected FUNGI-EFFECT-006), not a corpus defect`);
  for (const x of warns) console.log(`   ⚠️  [${x.class}] ${x.file}: effects { ${x.name} } — accepted with a nudge; prefer the canonical name`);
  if (testOnly.length > 0) console.log(`   ℹ️  ${testOnly.length} non-canonical name(s) under tests/ (negative fixtures — report-only)`);
}

if (blocking.length > 0) {
  if (!wantJson) console.log(`\n=== ${blocking.length} blocking corpus finding(s) — the corpus teaches names production rejects ===`);
  process.exit(1);
}
if (!wantJson) console.log(`   ✅ teaching corpus declares only production-compilable effect names`);
process.exit(0);
