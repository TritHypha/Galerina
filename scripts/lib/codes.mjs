// scripts/lib/codes.mjs — the ONE shared diagnostic-code regex + helpers.
//
// Review wn8v30euh found THREE divergent hand-rolled regexes (code-index.mjs, audit-coverage.mjs,
// audit-diagnostic-codes.mjs) that mis-parsed real codes: the trailing-letter suffix was truncated
// (FUNGI-PROFILE-005B → 005, so a shipped code VANISHED and merged into another), multi-segment codes
// were dropped (FUNGI-GOV-3VL-001, FUNGI-CRYPTO-PQ-001, FUNGI-SYNTAX-LEGACY-003), and doc ranges
// (FUNGI-ACCESS-001-002) were captured as phantom single codes. Import from here; never hand-roll again.
//
//   FUNGI: family (one or more alpha/num segments) then a final -<digits> with an OPTIONAL trailing letter.
//   GATE:  the `.gate` v3 frontend surface (round-one G1). Same shape as FUNGI so the
//          index/registry/collision tools see it without special-casing — a new code
//          family must be visible to the detectors that police it, or the catalogue
//          reports a namespace it cannot see.
//   ERR: ERR_ then segments; must END on a non-underscore char (rejects ERR_AI_ wildcard prefixes).
export const CODE_SRC = "(?:FUNGI|GATE)-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]+[A-Z]?|ERR_[A-Z0-9_]*[A-Z0-9]";

/** Bare MB-NN literals in ACK'd .fungi. Canonical form is FUNGI-MB-NN. Do not match inside FUNGI-MB-NN. */
export const MB_ALIAS_SRC = "(?<![A-Z0-9-])MB-[0-9]{2}(?![0-9A-Z-])";

/** Anchored, non-global — test whether a whole token IS a code. */
export const CODE_TEST = new RegExp(`^(?:${CODE_SRC})$`);

// A doc RANGE expression like `FUNGI-ACCESS-001-002` (two trailing numeric segments) is not a single code.
const RANGE = /-[0-9]+-[0-9]+$/;

/** Extract the real codes mentioned in `text`, de-duped in order, dropping doc-range tokens. */
export function extractMbAliases(text) {
  const re = new RegExp(MB_ALIAS_SRC, "g");
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(re)) {
    const alias = m[0];
    const nn = alias.slice(3);
    const mbFamilyPrefix = "FUNGI-" + "MB-" + nn;
    if (!seen.has(alias)) {
      seen.add(alias);
      out.push({ alias, canonical: mbFamilyPrefix });
    }
  }
  return out;
}

export function extractCodes(text) {
  const re = new RegExp(`(${CODE_SRC})`, "g"); // fresh regex each call — no shared lastIndex hazard
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(re)) {
    const c = m[1];
    if (RANGE.test(c)) continue;            // skip NNN-NNN ranges (the individual codes index at their real sites)
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  for (const row of extractMbAliases(text)) {
    if (!seen.has(row.canonical)) { seen.add(row.canonical); out.push(row.canonical); }
  }
  return out;
}

export const familyOf = (c) => (c.startsWith("ERR_") ? "ERR_*" : (c.match(/^(?:FUNGI|GATE)-([A-Z0-9]+)-/)?.[1] ?? "?"));
export const nsOf = (c) => (c.startsWith("ERR_") ? "ERR" : c.startsWith("GATE-") ? "GATE" : "FUNGI");
