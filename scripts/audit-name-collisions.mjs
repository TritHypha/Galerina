#!/usr/bin/env node
// audit-name-collisions.mjs — stop confusingly-similar names from recurring (RD-0124).
//
// Born from the graph-project / project-graph tangle: two packages whose names are reordered-token
// near-anagrams (`@galerina/devtools-graph-project` vs `@galerina/devtools-project-graph`) — identical
// token-multiset {devtools, graph, project}, trivially confused, and one had silently become a stray
// nested clone. This lint makes that class of name collision a hard, machine-checked error.
//
// THE INVARIANTS:
//   (1) NO REORDERED-TOKEN DUPLICATE — no two package names may share the same token-multiset (the
//       '-'/'@'/'/'-split tokens, order-independent). This is the exact graph-project/project-graph bug.
//   (2) NO TYPO-TWIN — no two package names within Levenshtein distance 1 (one char add/del/swap).
//   (3) REGISTRY COVERAGE — every collision must be either ABSENT or explicitly allowlisted in
//       governance/name-registry.json `knownCollisions` (documented + with a decided resolution). A
//       known-but-undocumented collision is a violation; a new collision is a violation.
//
// Package names are read LIVE from packages-galerina/*/package.json (source of truth). The registry holds
// POLICY (the allowlist of known collisions + any extra names to also guard via otherGuardedNames).
//
// Exit code = violation count (0 = clean). Run from repo root.
//   node scripts/audit-name-collisions.mjs             → scan live package names + registry
//   node scripts/audit-name-collisions.mjs --self-test → prove the detectors fire
import { readdirSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = "packages-galerina";
const REGISTRY = "governance/name-registry.json";

// ── pure detectors (also exercised by --self-test) ───────────────────────────────────────────────
/** Order-independent key for a name: split on - / @, drop empties, sort, join. */
export function tokenKey(name) {
  return name.split(/[/@-]/).filter(Boolean).sort().join("·");
}

/** Levenshtein distance (early-exit at >1 since that's all we need). */
export function lev1(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return 2; // can't be <=1
  // count edits with a single-diff walk
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return 2;
    if (la > lb) i++;          // deletion from a
    else if (lb > la) j++;     // insertion into a
    else { i++; j++; }         // substitution
  }
  if (i < la || j < lb) edits++; // trailing char
  return edits;
}

/** Groups of names sharing a token-multiset (size>1 = reordered-token collision). */
export function findTokenCollisions(names) {
  const groups = new Map();
  for (const n of names) {
    const k = tokenKey(n);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Pairs of names within Levenshtein 1 (typo-twins) that are NOT already a token collision. */
export function findTypoTwins(names) {
  const out = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (tokenKey(names[i]) === tokenKey(names[j])) continue; // counted as a token collision already
      if (lev1(names[i], names[j]) <= 1) out.push([names[i], names[j]]);
    }
  }
  return out;
}

/** A collision group (array of names) matches a registry allowlist entry iff same name-set. */
export function isAllowlisted(group, knownCollisions) {
  const key = [...group].sort().join("|");
  return knownCollisions.some((kc) => [...(kc.names ?? [])].sort().join("|") === key);
}

// ── load live package names ──────────────────────────────────────────────────────────────────────
function livePackageNames(root = PKG_ROOT) {
  const names = [];
  let dirs;
  try { dirs = readdirSync(root); } catch { return names; }
  for (const d of dirs) {
    const pj = join(root, d, "package.json");
    if (!existsSync(pj)) continue;
    try { const n = JSON.parse(readFileSync(pj, "utf8")).name; if (typeof n === "string") names.push(n); } catch { /* skip unparseable */ }
  }
  return names;
}

// ── self-test: prove the detectors fire (a neutered audit is itself a fail-open) ──────────────────
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes("--self-test")) {
  const reorder = findTokenCollisions(["@x/devtools-graph-project", "@x/devtools-project-graph", "@x/core"]).length === 1;
  const noReorderFalsePos = findTokenCollisions(["@x/a-b", "@x/c-d"]).length === 0;
  const typo = findTypoTwins(["@x/core-vector", "@x/core-vectors"]).length === 1;
  const typoNoFalsePos = findTypoTwins(["@x/core", "@x/devtools"]).length === 0;
  const allow = isAllowlisted(["@x/devtools-graph-project", "@x/devtools-project-graph"], [{ names: ["@x/devtools-project-graph", "@x/devtools-graph-project"] }]) === true;
  const notAllow = isAllowlisted(["@x/a", "@x/b"], [{ names: ["@x/c", "@x/d"] }]) === false;
  const levOk = lev1("abc", "abc") === 0 && lev1("abc", "abd") === 1 && lev1("abc", "abdc") === 1 && lev1("abc", "axyz") === 2;
  const ok = reorder && noReorderFalsePos && typo && typoNoFalsePos && allow && notAllow && levOk;
  console.log(`[self-test] reorder-collision: ${reorder} | no-false-pos: ${noReorderFalsePos} | typo-twin: ${typo}/${typoNoFalsePos} | allowlist: ${allow}/${notAllow} | lev1: ${levOk}`);
  console.log(ok ? "[self-test] PASS — name-collision detectors fire (reordered-token + typo-twin + allowlist)" : "[self-test] FAIL");
  process.exit(ok ? 0 : 1);
}

// ── scan ───────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let known = [];
  if (existsSync(REGISTRY)) {
    try {
      const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
      known = reg.knownCollisions ?? [];
      for (const e of reg.otherGuardedNames?.entries ?? []) { /* extra names join the live set below */ }
    } catch (e) {
      console.error(`[name-collisions] could not parse ${REGISTRY}: ${e.message} — fail-closed`);
      console.log("VIOLATIONS: 1");
      process.exit(1);
    }
  }
  const extra = (() => { try { return JSON.parse(readFileSync(REGISTRY, "utf8")).otherGuardedNames?.entries ?? []; } catch { return []; } })();
  const names = [...livePackageNames(), ...extra];

  const violations = [];
  const knownReported = [];
  for (const group of findTokenCollisions(names)) {
    if (isAllowlisted(group, known)) { knownReported.push(group.join("  ⟷  ")); continue; }
    violations.push(`reordered-token collision (same token-multiset): ${group.join("  ⟷  ")} — rename one, or allowlist with a resolution in ${REGISTRY}`);
  }
  for (const [a, b] of findTypoTwins(names)) {
    if (isAllowlisted([a, b], known)) { knownReported.push(`${a} ~ ${b}`); continue; }
    violations.push(`typo-twin (Levenshtein 1): ${a}  ~  ${b} — confirm both are intended; allowlist if so`);
  }

  console.log(`name-collisions: checked ${names.length} name(s) (${livePackageNames().length} live packages + ${extra.length} registry extras)`);
  for (const k of knownReported) console.log(`  • known/allowlisted (resolution pending): ${k}`);
  for (const v of violations) console.log(`  ✖ ${v}`);
  console.log(violations.length === 0 ? "name-collisions: no unresolved name collisions." : `name-collisions: ${violations.length} unresolved collision(s).`);
  console.log(`VIOLATIONS: ${violations.length}`);
  console.log(`TOTAL: ${violations.length} name-collision violation(s)`);
  process.exit(violations.length);
}
