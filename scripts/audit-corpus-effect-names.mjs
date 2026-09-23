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
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_FUNGI_FILES = 8192;
const MAX_WALK_DEPTH = 32;

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

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".galerina", ".graph"]);

function walkFungi(dir, acc, errors, depth = 0) {
  if (depth > MAX_WALK_DEPTH) {
    errors.push({ path: dir, reason: "walk depth exceeded" });
    return acc;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    errors.push({ path: dir, reason: err instanceof Error ? err.message : String(err) });
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkFungi(p, acc, errors, depth + 1);
    } else if (e.name.endsWith(".fungi") && (e.isFile() || e.isSymbolicLink())) {
      if (acc.length >= MAX_FUNGI_FILES) {
        errors.push({ path: p, reason: "fungi file ceiling exceeded" });
        return acc;
      }
      acc.push(p);
    }
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

export function auditCorpusEffectNames(root) {
  if (typeof root !== "string" || root.length === 0) {
    return { ok: false, reason: "corpus root is missing", files: 0, canonical: 0, findings: [] };
  }
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch {
    return { ok: false, reason: `corpus root is absent or unreadable: ${root}`, files: 0, canonical: 0, findings: [] };
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return { ok: false, reason: "corpus root is not a regular directory", files: 0, canonical: 0, findings: [] };
  }

  const effectChecker = join(root, "packages-ts/galerina-core-compiler/src/effect-checker.ts");
  let checkerSrc;
  try {
    checkerSrc = readFileSync(effectChecker, "utf8");
  } catch {
    return { ok: false, reason: "could not read effect-checker.ts — refusing to audit against an absent vocabulary", files: 0, canonical: 0, findings: [] };
  }
  const CANONICAL = new Set(quoted(sliceBlock(checkerSrc, "const CANONICAL_EFFECTS")));
  const ALIASES = new Set(mapKeys(sliceBlock(checkerSrc, "const EFFECT_NAME_ALIASES")));
  const BROAD = new Set(quoted(sliceBlock(checkerSrc, "const BROAD_EFFECT_ALIASES")));
  const DENY_ONLY = new Set(quoted(sliceBlock(checkerSrc, "const DENY_ONLY_EFFECTS")));
  if (CANONICAL.size === 0) {
    return { ok: false, reason: "could not extract CANONICAL_EFFECTS from effect-checker.ts — refusing to audit against an empty vocabulary (fail-closed).", files: 0, canonical: 0, findings: [] };
  }

  const walkErrors = [];
  const files = walkFungi(root, [], walkErrors);
  const findings = [];
  for (const err of walkErrors) {
    findings.push({
      file: relative(root, err.path).replace(/\\/g, "/") || err.path,
      name: "",
      class: "unreadable",
      blocking: true,
      reportOnly: false,
      reason: err.reason,
    });
  }
  for (const f of files) {
    const rel = relative(root, f).replace(/\\/g, "/");
    if (rel.includes("/self-hosted/")) continue;
    const inTests = /(^|\/)tests?\//.test(rel);
    let src;
    try {
      const st = lstatSync(f);
      if (st.isSymbolicLink() || !st.isFile()) {
        throw new Error("corpus file is not a regular file");
      }
      src = readFileSync(f, "utf8");
    } catch (err) {
      findings.push({
        file: rel,
        name: "",
        class: "unreadable",
        blocking: true,
        reportOnly: false,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const name of declaredEffectNames(src)) {
      if (CANONICAL.has(name) && !DENY_ONLY.has(name)) continue;
      let cls, blocking;
      if (DENY_ONLY.has(name)) {
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

  if (files.length === 0 && !findings.some((x) => x.class === "unreadable")) {
    findings.push({
      file: ".",
      name: "",
      class: "empty-corpus",
      blocking: true,
      reportOnly: false,
      reason: "absent corpus input is not a clean sweep",
    });
  }

  const blocking = findings.filter((x) => x.blocking);
  return {
    ok: blocking.length === 0,
    files: files.length,
    canonical: CANONICAL.size,
    aliases: ALIASES.size,
    denyOnly: DENY_ONLY.size,
    findings,
    blocking,
    demos: findings.filter((x) => x.class === "deny-only-demonstration"),
    warns: findings.filter((x) => !x.blocking && !x.reportOnly && x.class !== "deny-only-demonstration"),
    testOnly: findings.filter((x) => x.reportOnly),
  };
}

function isDirectRun() {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(argv1);
}

function reportAndExit(root, wantJson) {
  const result = auditCorpusEffectNames(root);
  if (wantJson) {
    console.log(JSON.stringify({
      files: result.files,
      canonical: result.canonical,
      findings: result.findings,
      reason: result.reason,
    }, null, 2));
  } else {
    console.log(`=== corpus effect-name audit (SoT: effect-checker.ts CANONICAL_EFFECTS) ===`);
    if (result.reason && result.files === 0 && result.canonical === 0) {
      console.error(`❌ ${result.reason}`);
    } else {
      console.log(`   .fungi files: ${result.files} | canonical: ${result.canonical} | aliases: ${result.aliases} | deny-only: ${result.denyOnly}`);
      for (const x of result.blocking) {
        if (x.class === "unreadable" || x.class === "empty-corpus") {
          console.log(`   ❌ [${x.class}] ${x.file}: ${x.reason ?? "unread or absent corpus input"}`);
        } else {
          console.log(`   ❌ [${x.class}] ${x.file}: effects { ${x.name} } — production compile rejects this name`);
        }
      }
      for (const x of result.demos) console.log(`   ✅ [${x.class}] ${x.file}: effects { ${x.name} } — deliberate deny demonstration (declares expected FUNGI-EFFECT-006), not a corpus defect`);
      for (const x of result.warns) console.log(`   ⚠️  [${x.class}] ${x.file}: effects { ${x.name} } — accepted with a nudge; prefer the canonical name`);
      if (result.testOnly.length > 0) console.log(`   ℹ️  ${result.testOnly.length} non-canonical name(s) under tests/ (negative fixtures — report-only)`);
    }
  }
  if (!result.ok) {
    if (!wantJson && result.blocking.length > 0) {
      console.log(`\n=== ${result.blocking.length} blocking corpus finding(s) — unread, absent, or non-production names ===`);
    }
    process.exit(1);
  }
  if (!wantJson) console.log(`   ✅ teaching corpus declares only production-compilable effect names`);
  process.exit(0);
}

if (isDirectRun()) {
  const rootIdx = process.argv.indexOf("--root");
  const ROOT = rootIdx !== -1 ? process.argv[rootIdx + 1] : join(HERE, "..");
  const wantJson = process.argv.includes("--json");
  reportAndExit(ROOT, wantJson);
}
