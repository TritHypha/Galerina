#!/usr/bin/env node
// =============================================================================
// audit-effect-canonicality.mjs — single-source-of-truth gate for effect names
// =============================================================================
// THE ISSUE THIS PREVENTS (owner ask, 2026-07-01):
//   The "canonical effect" vocabulary was defined in MULTIPLE places that had
//   DRIFTED apart, so an effect name accepted by one part of the compiler was
//   rejected by another, and the KB docs / .graph SPEC documented effect
//   families (db.*, storage.*, ledger.*, secret.access, ai.call) that the
//   effect-checker REJECTS. An AI (or human) authoring from the docs then wrote
//   governed code that does not compile — a plausible-but-non-compiling failure
//   that a skim and a naive grader both miss.
//
// This audit designates `effect-checker.ts::CANONICAL_EFFECTS` as the ONE source
// of truth and asserts every OTHER effect table + doc agrees with it:
//   C1  type-registry.ts EFFECT_NAME_TO_FLAG keys      ⊆ canonical (∪ aliases)
//   C2  effect-checker.ts EFFECT_REGISTRY targets      ⊆ canonical
//   C3  effect-checker.ts EFFECT_NAME_ALIASES targets  ⊆ canonical
//   C4  SECURE_REQUIRED_EFFECTS / PURE_FORBIDDEN_EFFECTS⊆ canonical
//   C5  KB master registry effect families             ⊆ canonical (∪ aliases)
//   C6  .graph SPEC EBNF effect_fam families            ⊆ canonical families
//
// Exit 0 iff every table + doc is consistent with the source of truth.
// Usage:  node scripts/audit-effect-canonicality.mjs [--json]
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// --root <dir> overrides the repo root (used by the fixture tests); default = repo.
const rootIdx = process.argv.indexOf("--root");
const ROOT = rootIdx !== -1 ? process.argv[rootIdx + 1] : join(HERE, "..");
const EFFECT_CHECKER = join(ROOT, "packages-galerina/galerina-core-compiler/src/effect-checker.ts");
const TYPE_REGISTRY = join(ROOT, "packages-galerina/galerina-core-compiler/src/type-registry.ts");
// Commit 2 extension — the additional tables the SoT must also govern (effect <-> capability <-> Stage-B):
const CAP_TYPES = join(ROOT, "packages-galerina/galerina-core-compiler/src/capability-types.ts");
const GIR_EMITTER = join(ROOT, "packages-galerina/galerina-core-compiler/src/gir-emitter.ts");
const STAGE_B = join(ROOT, "packages-galerina/galerina-core-compiler/src/self-hosted/effect-checker.fungi");
// The KB lives OUTSIDE the repo (IP separation); resolve via env, default sibling.
const KB_DIR = process.env.GALERINA_KB_DIR || join(ROOT, "../ZTF-Knowledge-Bases");
const KB_REGISTRY = join(KB_DIR, "galerina-rules-master-registry.md");
// The .graph SPEC lives in the design workspace (not this repo); optional.
const GRAPH_SPEC = process.env.GALERINA_GRAPH_SPEC ||
  join(ROOT, "../ZT-Galerina-GRAPH-ASCII/SPEC-graph-language.md");

// ── source extractors (regex over the TS source — the same robust approach the
//    other audit-*.mjs use; no cross-package import / build dependency) ────────

/** Slice a named `const X = new Set([ ... ])` / `new Map([ ... ])` / `= { ... }`
 *  block from its declaration to the balanced closing bracket. */
function sliceBlock(src, declName) {
  const start = src.indexOf(declName);
  if (start === -1) return null;
  // Slice from the ASSIGNMENT (`=`), so a type annotation like
  // `: Readonly<Record<string, readonly string[]>> =` (note the `string[]`) does
  // not mislead us into opening on the wrong bracket.
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

/** all double-quoted dotted/plain effect-ish tokens in a block */
function quoted(block) {
  if (!block) return [];
  return [...block.matchAll(/"([a-zA-Z][\w.]*)"/g)].map((m) => m[1]);
}

/** first-of-pair keys in a `new Map([ ["k", V], ... ])` block */
function mapKeys(block) {
  if (!block) return [];
  return [...block.matchAll(/\[\s*"([^"]+)"\s*,/g)].map((m) => m[1]);
}

/** object-literal keys + their array-of-string values: `"k": ["a","b"]` */
function objectEntries(block) {
  if (!block) return [];
  const out = [];
  for (const m of block.matchAll(/"([^"]+)"\s*:\s*\[([^\]]*)\]/g)) {
    const vals = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    out.push([m[1], vals]);
  }
  return out;
}

const fam = (e) => e.split(".")[0];

// ── read the source of truth ─────────────────────────────────────────────────
const ecSrc = readFileSync(EFFECT_CHECKER, "utf8");
const trSrc = readFileSync(TYPE_REGISTRY, "utf8");

const CANONICAL = new Set(quoted(sliceBlock(ecSrc, "CANONICAL_EFFECTS = new Set")));
const ALIASES = new Map(
  [...(sliceBlock(ecSrc, "EFFECT_NAME_ALIASES") || "").matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)]
    .map((m) => [m[1], m[2]])
);
const BROAD_ALIASES = new Set(quoted(sliceBlock(ecSrc, "BROAD_EFFECT_ALIASES")));
// Deny-only names (2026-07-02): recognised but NEVER grantable (FUNGI-EFFECT-006).
const DENY_ONLY = new Set(quoted(sliceBlock(ecSrc, "DENY_ONLY_EFFECTS")));
const SECURE_REQ = new Set(quoted(sliceBlock(ecSrc, "SECURE_REQUIRED_EFFECTS = new Set")));
const PURE_FORBIDDEN = new Set(quoted(sliceBlock(ecSrc, "PURE_FORBIDDEN_EFFECTS = new Set")));
const REGISTRY = objectEntries(sliceBlock(ecSrc, "EFFECT_REGISTRY"));
const FLAG_NAMES = mapKeys(sliceBlock(trSrc, "EFFECT_NAME_TO_FLAG"));

// Commit 2 extension — additional governed tables (read defensively; absent = skipped).
const capSrc = existsSync(CAP_TYPES) ? readFileSync(CAP_TYPES, "utf8") : "";
const girSrc = existsSync(GIR_EMITTER) ? readFileSync(GIR_EMITTER, "utf8") : "";
const stageBSrc = existsSync(STAGE_B) ? readFileSync(STAGE_B, "utf8") : "";
// V_DPM capability vocabulary: SystemCapabilityType enum values + CAPABILITY_BIT_POSITION string keys.
const CAP_NAMES = [
  ...[...(sliceBlock(capSrc, "enum SystemCapabilityType") || "").matchAll(/=\s*"([^"]+)"/g)].map((m) => m[1]),
  ...[...(sliceBlock(capSrc, "CAPABILITY_BIT_POSITION") || "").matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]),
];
// gir-emitter EFFECT_TO_CAPABILITY keys (effect side; host.* values are host names, not effects).
const GIR_KEYS = [...(sliceBlock(girSrc, "EFFECT_TO_CAPABILITY") || "").matchAll(/\[\s*"([^"]+)"\s*,/g)].map((m) => m[1]);
// Stage-B self-hosted knownEffects() return array.
const stageBMatch = stageBSrc.match(/knownEffects[\s\S]*?return\s*(\[[\s\S]*?\])/);
const STAGEB_EFFECTS = stageBMatch ? [...stageBMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
// Capability-only names legitimately NOT canonical effects: wildcard roots (banned by FUNGI-CAP-001 but known).
const CAP_ONLY = new Set(["network.*", "storage.*", "database.*"]);

// canonical families (first segment) — for doc-level family checks
const CANON_FAMILIES = new Set([...CANONICAL].map(fam));
// a name is "known" if it is canonical, a registered alias, or a broad alias
const isKnown = (e) => CANONICAL.has(e) || ALIASES.has(e) || BROAD_ALIASES.has(e);

// ── the consistency checks ───────────────────────────────────────────────────
const findings = [];
const add = (check, detail, items) => findings.push({ check, detail, items });

if (CANONICAL.size === 0) add("BOOTSTRAP", "could not parse CANONICAL_EFFECTS — extractor/source mismatch", []);

// C1 — bitmask recognises names the checker does not
{
  const bad = FLAG_NAMES.filter((n) => !isKnown(n));
  if (bad.length) add("C1 bitmask⊄canonical",
    "type-registry EFFECT_NAME_TO_FLAG maps effect names the effect-checker neither canonicalises nor aliases (a name the bitmask accepts but the checker REJECTS)", bad);
}
// C2 — EFFECT_REGISTRY targets must be canonical
{
  const bad = [];
  for (const [op, targets] of REGISTRY) for (const t of targets) if (!CANONICAL.has(t)) bad.push(`${op} → ${t}`);
  if (bad.length) add("C2 registry⊄canonical",
    "EFFECT_REGISTRY maps operations to effect targets that are not in CANONICAL_EFFECTS", [...new Set(bad)]);
}
// C3 — alias targets must be canonical
{
  const bad = [...ALIASES.entries()].filter(([, v]) => !CANONICAL.has(v)).map(([k, v]) => `${k} → ${v}`);
  if (bad.length) add("C3 alias⊄canonical", "EFFECT_NAME_ALIASES points at non-canonical targets", bad);
}
// C4 — secure-required / pure-forbidden must name a governed effect (canonical OR
//      a registered alias that resolves to one — an alias in a tier set is fine).
{
  const bad = [...SECURE_REQ, ...PURE_FORBIDDEN].filter((e) => !isKnown(e));
  if (bad.length) add("C4 tier-set⊄known",
    "SECURE_REQUIRED_EFFECTS / PURE_FORBIDDEN_EFFECTS reference names that are neither canonical nor a known alias", [...new Set(bad)]);
}
// C5 — KB master registry effect families ⊆ canonical (∪ alias)
if (existsSync(KB_REGISTRY)) {
  const kb = readFileSync(KB_REGISTRY, "utf8");
  const noncanon = new Set();
  for (const m of kb.matchAll(/\b([a-z]+)\.([a-z]+)\b/g)) {
    const e = `${m[1]}.${m[2]}`;
    // only judge tokens that LOOK like effects (family in a known effect-ish namespace or a non-canonical family)
    if (/^(db|storage|ledger|shell|net|file|kv|sql|state|secret|ai|database|network|filesystem|audit|cache|crypto|payment|email)$/.test(m[1])
        && !isKnown(e) && !CANON_FAMILIES.has(m[1])) noncanon.add(e);
    else if (isKnown(e) === false && /^(db|storage|ledger|shell)$/.test(m[1])) noncanon.add(e);
  }
  if (noncanon.size) add("C5 KB-registry-drift",
    `KB master registry documents effect names the compiler REJECTS (an AI trusting the docs writes non-compiling .fungi) — ${KB_REGISTRY}`, [...noncanon].sort());
} else if (rootIdx === -1 && !process.argv.includes("--json")) {
  // absence ≠ drift — note it (non-finding) only when scanning the real repo interactively
  console.warn(`   (note: KB registry not found — set GALERINA_KB_DIR to include the C5 doc check)`);
}
// C6 — .graph SPEC EBNF effect_fam families ⊆ canonical families
if (existsSync(GRAPH_SPEC)) {
  const spec = readFileSync(GRAPH_SPEC, "utf8");
  const m = spec.match(/effect_fam\s*=\s*([^;]+);/);
  if (m) {
    const fams = [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    const bad = fams.filter((f) => !CANON_FAMILIES.has(f));
    if (bad.length) add("C6 SPEC-EBNF-drift",
      `.graph SPEC effect_fam production lists families with no canonical effect — ${GRAPH_SPEC}`, bad);
  }
} // SPEC is optional (design workspace) — silent if absent

// C7 — capability-types V_DPM vocabulary must be a known effect (∪ wildcard roots). After the Commit-2
//      rename the effect and capability layers share names; this catches any future re-drift.
{
  const bad = [...new Set(CAP_NAMES)].filter((c) => !isKnown(c) && !CAP_ONLY.has(c));
  if (bad.length) add("C7 capability⊄canonical",
    "capability-types.ts (SystemCapabilityType / CAPABILITY_BIT_POSITION) names a capability that is not a canonical effect, alias, broad-alias, or wildcard root", bad);
}
// C8 — gir-emitter EFFECT_TO_CAPABILITY keys must be canonical effects (host.* values are not checked).
{
  const bad = GIR_KEYS.filter((k) => !isKnown(k));
  if (bad.length) add("C8 gir-emitter⊄canonical",
    "gir-emitter.ts EFFECT_TO_CAPABILITY maps a non-canonical effect key to a host capability", bad);
}
// C9 — Stage-B self-hosted knownEffects() should agree with Stage-A canonical (∪ alias ∪ deny-only:
//      a deny-only name is recognised vocabulary, just never grantable). Self-hosted is
//      WIP, so this is INFORMATIONAL (never blocks) — it records the divergence (record-everything).
{
  const bad = STAGEB_EFFECTS.filter((e) => !isKnown(e) && !DENY_ONLY.has(e));
  if (bad.length) add("C9 stageB-drift",
    `Stage-B self-hosted/effect-checker.fungi knownEffects() lists effects Stage-A does not canonicalise — ${STAGE_B}`, bad);
}
// C10 — a DENY-ONLY name must not appear in ANY grantable table (canonical set, alias map,
//       EffectFlags bitmask, gir-emitter capability map, V_DPM capability vocabulary). If one
//       does, the vocabulary itself is fail-open: the "never grantable" name has a grant path.
//       BLOCKING (internal).
{
  const grantable = new Set([...CANONICAL, ...ALIASES.keys(), ...FLAG_NAMES, ...GIR_KEYS, ...CAP_NAMES]);
  const bad = [...DENY_ONLY].filter((e) => grantable.has(e));
  if (bad.length) add("C10 deny-only-grantable",
    "a DENY_ONLY_EFFECTS name appears in a grantable table — the deny-only fence is fail-open", bad);
}

// ── severity ─────────────────────────────────────────────────────────────────
// INTERNAL invariants (C1–C4): the compiler's own effect tables must agree — these
//   are hard errors and gate CI by default.
// DOC drift (C5–C6): the KB registry / .graph SPEC name effects the compiler rejects
//   — real, but resolved by the family work (Commit 2). Reported; blocks only under --strict.
const STRICT = process.argv.includes("--strict");
const sevOf = (f) => (/^(C[1-4]|C7|C8|C10|BOOTSTRAP)\b/.test(f.check) ? "internal" : /^C9\b/.test(f.check) ? "stageb" : "docs");
const internal = findings.filter((f) => sevOf(f) === "internal");
const docs = findings.filter((f) => sevOf(f) === "docs");
const stageb = findings.filter((f) => sevOf(f) === "stageb");   // Stage-B WIP — informational, never blocks
const blocking = STRICT ? [...internal, ...docs] : internal;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    canonicalCount: CANONICAL.size, aliasCount: ALIASES.size, strict: STRICT,
    internal, docs, stageb, blockingCount: blocking.length,
  }, null, 2));
  process.exit(blocking.length ? 1 : 0);
}

console.log(`\n=== effect-canonicality audit (SoT: effect-checker.ts CANONICAL_EFFECTS)${STRICT ? " [--strict]" : ""} ===`);
console.log(`   canonical effects: ${CANONICAL.size} | aliases: ${ALIASES.size} | broad-aliases: ${BROAD_ALIASES.size} | families: ${CANON_FAMILIES.size}`);
const printGroup = (label, group) => {
  if (group.length === 0) return;
  console.log(`\n   ${label}:`);
  for (const f of group) {
    console.log(`   [${f.check}] ${f.detail}`);
    for (const it of f.items) console.log(`        • ${it}`);
  }
};
if (internal.length === 0) console.log(`   ✅ internal effect tables are single-source consistent`);
printGroup("❌ INTERNAL (blocking)", internal);
printGroup(`${STRICT ? "❌" : "⚠️ "} DOC DRIFT (${STRICT ? "blocking under --strict" : "pending — not blocking"})`, docs);
printGroup("ℹ️  STAGE-B DRIFT (self-hosted WIP — informational, never blocks)", stageb);
console.log(`\n=== ${internal.length} internal + ${docs.length} doc + ${stageb.length} stage-b finding(s); ${blocking.length} blocking ===`);
process.exit(blocking.length ? 1 : 0);
