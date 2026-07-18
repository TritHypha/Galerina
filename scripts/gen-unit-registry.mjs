// =============================================================================
// gen-unit-registry.mjs — RD-0349 I1: generate the runtime unit table from the
// PINNED ISO 4217 snapshot. One-way. Never hand-edited.
// =============================================================================
// This closes the I1 rung. The owner-gated snapshot landed 2026-07-16 (KB
// data/iso-4217/, vendored here so Galerina builds standalone — no sibling-repo
// path). Before this, `MONEY_UNIT_TAGS` was a SEVEN-ENTRY HAND-TYPED LIST and
// stdlib.ts said so: "When I1's owner-gated pinned ISO snapshot lands, ONLY this
// table grows (full active set, per-currency minorUnits incl. JPY→0)".
//
// The four laws this obeys (data/iso-4217/PROVENANCE.md §"U-LAW-4"):
//   1. ONE-WAY GENERATION — the table is generated from this snapshot, never by
//      hand, never from another source. The snapshot SHA-256 goes in the header.
//   2. DRIFT GATE — `--check` regenerates and diffs; RED means someone hand-edited
//      the table or swapped the snapshot. Both are findings, not noise.
//   3. SNAPSHOT UPDATES ARE OWNER CEREMONIES — a new ISO publication is a new dated
//      file + a pin bump here + the old file retained. Never overwrite in place.
//   4. RESERVED/TEST CODES ARE EXPLICIT — every exclusion below states its reason.
//      Nothing is silently included because it happened to be in the XML.
//
// NO XML DEPENDENCY BY DESIGN. NODE_FLOOR (audit-node-dependencies.mjs) is
// fail-closed: an npm install outside the declared floor fails CI permanently, and
// an XML parser is not on it. That is affordable here precisely BECAUSE the input is
// hash-pinned: the bytes cannot drift without tripping law 1 first, and the
// structural assertions below fail closed on any parse surprise.
//
// Usage: node scripts/gen-unit-registry.mjs [--check] [--self-test]
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = join(ROOT, "data", "iso-4217", "list-one-2026-07-16.xml");
const OUT = join(ROOT, "packages-galerina", "galerina-core-compiler", "src", "unit-registry.generated.ts");
// #124 — the self-hosted type-checker twin validates Money<CCY> IN-LANGUAGE (FUNGI-TYPE-032). Its
// isKnownCurrency body is generated ONE-WAY from the SAME snapshot as MONEY_UNIT_TAGS and injected between
// these markers, so the twin's currency set can never drift from the TS side (R&D STOPPER-1 option (a)).
const TWIN = join(ROOT, "packages-galerina", "galerina-core-compiler", "src", "self-hosted", "type-checker.fungi");
const TWIN_MARK_OPEN = "  // <generated:currency-set>";
const TWIN_MARK_CLOSE = "  // </generated:currency-set>";

// ── the pin (law 1 + law 3). A snapshot swap trips this before a single byte is parsed.
const SNAPSHOT_PIN = "838dfb991648cf36df939edd5fe3811737962b75a32252847d239cedd1e291c9";
const SNAPSHOT_NAME = "list-one-2026-07-16.xml";
// Structural expectation — the snapshot's own PROVENANCE.md records 280 <CcyNtry>.
// If a parse ever yields another count, the parser is wrong or the file is not the
// pinned one: fail, never emit a half-parsed table.
const EXPECT_ENTRIES = 280;

// ── pure helpers (self-tested) ───────────────────────────────────────────────

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Extract <CcyNtry> blocks. Tolerates attributes and arbitrary inner whitespace. */
export function parseEntries(xml) {
  const out = [];
  const blocks = xml.match(/<CcyNtry>[\s\S]*?<\/CcyNtry>/g) ?? [];
  for (const block of blocks) {
    const pick = (name) => {
      const m = block.match(new RegExp(`<${name}(\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
      return m ? { attrs: m[1] ?? "", text: m[2].trim() } : null;
    };
    const ccy = pick("Ccy");
    const nm = pick("CcyNm");
    const mnr = pick("CcyMnrUnts");
    out.push({
      code: ccy?.text ?? "",
      name: nm?.text ?? "",
      isFund: /IsFund\s*=\s*"true"/i.test(nm?.attrs ?? ""),
      minorUnitsRaw: mnr?.text ?? "",
    });
  }
  return out;
}

// ── the exclusion policy (law 4). Each rule names WHY, and the reasons are not
//    interchangeable — they are three different kinds of "not a currency".
export const EXCLUSION_REASONS = {
  NO_CODE: "country row with no ISO code (e.g. a territory with no currency of its own)",
  FUND: "IsFund — a fund/valuation vehicle (BOV, CLF, CHE…), not a currency anyone holds",
  NO_MINOR_UNIT:
    "minor units are 'N.A.' — metals (XAU/XAG/XPT/XPD), units of account (XDR/XBA…), " +
    "test (XTS) and no-currency (XXX). EXCLUDED because the decimal scale is NOT derivable " +
    "from the snapshot: admitting them would mean INVENTING a scale, and a wrong scale is a " +
    "silent money-arithmetic bug. Metals are wanted eventually (RD-0349 says fiat+metals+crypto) " +
    "but they need their own sourced scale policy — that is a separate rung, not a guess here.",
};

/** Classify one entry. Returns { keep, reason }. Deny-by-default: keep only on a proven-clean row. */
export function classify(entry) {
  if (!entry.code) return { keep: false, reason: "NO_CODE" };
  if (entry.isFund) return { keep: false, reason: "FUND" };
  if (!/^\d+$/.test(entry.minorUnitsRaw)) return { keep: false, reason: "NO_MINOR_UNIT" };
  return { keep: true, reason: null };
}

/**
 * Fold country rows into a per-code table. ISO List One is a COUNTRY→currency mapping, so
 * codes repeat (EUR appears ~35 times). Any disagreement on minor units between two rows of
 * the SAME code is a contradiction in the source — surfaced, never silently resolved by
 * last-write-wins.
 */
export function buildTable(entries) {
  const kept = new Map();
  const excluded = new Map();
  const conflicts = [];
  for (const e of entries) {
    const { keep, reason } = classify(e);
    if (!keep) {
      if (e.code) excluded.set(e.code, reason);
      continue;
    }
    const minor = Number(e.minorUnitsRaw);
    const prior = kept.get(e.code);
    if (prior !== undefined && prior !== minor) {
      conflicts.push(`${e.code}: minor units disagree across country rows (${prior} vs ${minor})`);
      continue;
    }
    kept.set(e.code, minor);
  }
  const codes = [...kept.keys()].sort();
  return { codes, minorUnits: kept, excluded, conflicts };
}

/** Render the generated TS. Deterministic: sorted codes, fixed layout — so --check diffs are real. */
export function renderTable(table, pin, snapshotName) {
  const rows = table.codes.map((c) => `  ["${c}", ${table.minorUnits.get(c)}],`).join("\n");
  const excludedCounts = {};
  for (const r of table.excluded.values()) excludedCounts[r] = (excludedCounts[r] ?? 0) + 1;
  const excludedSummary = Object.entries(excludedCounts)
    .sort()
    .map(([r, n]) => `//   ${r} ×${n} — ${EXCLUSION_REASONS[r]}`)
    .join("\n");
  return `// @generated by scripts/gen-unit-registry.mjs — DO NOT EDIT BY HAND.
//
// RD-0349 I1 — the runtime unit table, generated ONE-WAY from the pinned ISO 4217 snapshot.
// Hand-editing this file is a finding: \`node scripts/gen-unit-registry.mjs --check\` will go RED.
// To change it, change the SNAPSHOT (an owner ceremony — see data/iso-4217/PROVENANCE.md).
//
// Source:   data/iso-4217/${snapshotName}
// SHA-256:  ${pin}
// Kept:     ${table.codes.length} currencies (numeric minor units, non-fund)
// Excluded, by explicit policy (never silently — PROVENANCE.md law 4):
${excludedSummary}

/** Currency codes admitted by \`Money.of\` — exact-codepoint UPPERCASE. */
export const MONEY_UNIT_TAGS: readonly string[] = [
${table.codes.map((c) => `  "${c}",`).join("\n")}
];

/** ISO 4217 minor units (decimal places) per code. JPY→0, most→2, some→3/4. */
export const MONEY_MINOR_UNITS: ReadonlyMap<string, number> = new Map([
${rows}
]);

/** The snapshot this table was generated from — provenance for the drift gate. */
export const UNIT_REGISTRY_PROVENANCE = {
  snapshot: "${snapshotName}",
  sha256: "${pin}",
} as const;
`;
}

/** The self-hosted twin's isKnownCurrency body — one `if` per code, same in-language idiom as isKnownType.
 *  Deterministic (sorted codes, fixed layout) so the twin's currency-set region diffs cleanly under --check. */
export function renderFungiCurrencySet(codes) {
  return codes.map((c) => `  if t == "${c}" { return true }`).join("\n");
}

/** Replace the body between the <generated:currency-set> markers in type-checker.fungi with `region`.
 *  Marker-delimited so the generator owns exactly that span and nothing else in the hand-authored twin. */
export function injectFungiRegion(twinSrc, region) {
  const openAt = twinSrc.indexOf(TWIN_MARK_OPEN);
  const closeAt = twinSrc.indexOf(TWIN_MARK_CLOSE);
  if (openAt < 0 || closeAt < 0 || closeAt < openAt) {
    throw new Error(`type-checker.fungi: currency-set markers missing/malformed (open@${openAt}, close@${closeAt}) — cannot inject.`);
  }
  return twinSrc.slice(0, openAt + TWIN_MARK_OPEN.length) + "\n" + region + "\n" + twinSrc.slice(closeAt);
}

/** Extract the current between-markers region from the twin (for --check), normalized to \n. */
export function extractFungiRegion(twinSrc) {
  const openAt = twinSrc.indexOf(TWIN_MARK_OPEN);
  const closeAt = twinSrc.indexOf(TWIN_MARK_CLOSE);
  if (openAt < 0 || closeAt < 0 || closeAt < openAt) return null;
  return twinSrc.slice(openAt + TWIN_MARK_OPEN.length, closeAt).replace(/\r\n/g, "\n").replace(/^\n|\n$/g, "");
}

// ── generation ───────────────────────────────────────────────────────────────

function generate() {
  const buf = readFileSync(SNAPSHOT);
  const actual = sha256(buf);
  if (actual !== SNAPSHOT_PIN) {
    // Law 1/3: fail closed. A changed snapshot is an owner ceremony, never a silent regen.
    console.error(`❌ snapshot SHA-256 MISMATCH — refusing to generate.\n   expected ${SNAPSHOT_PIN}\n   actual   ${actual}\n   A snapshot change is an OWNER CEREMONY (PROVENANCE.md law 3): add a new dated file, bump the pin here, retain the old.`);
    process.exit(1);
  }
  const entries = parseEntries(buf.toString("utf8"));
  if (entries.length !== EXPECT_ENTRIES) {
    console.error(`❌ parsed ${entries.length} <CcyNtry> entries, expected ${EXPECT_ENTRIES} — parser or file is wrong. Refusing to emit a half-parsed table.`);
    process.exit(1);
  }
  const table = buildTable(entries);
  if (table.conflicts.length) {
    console.error(`❌ contradictory minor units in the snapshot — refusing to guess:\n   ${table.conflicts.join("\n   ")}`);
    process.exit(1);
  }
  if (table.codes.length === 0) {
    console.error("❌ empty table — refusing to emit (a currency-less Money is the G2 fail-open).");
    process.exit(1);
  }
  return { table, text: renderTable(table, SNAPSHOT_PIN, SNAPSHOT_NAME) };
}

// ── self-test ────────────────────────────────────────────────────────────────

function selfTest() {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };

  const XML = `<x><CcyNtry><CtryNm>A</CtryNm><CcyNm>Alpha</CcyNm><Ccy>AAA</Ccy><CcyNbr>1</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
<CcyNtry><CtryNm>B</CtryNm><CcyNm IsFund="true">Fundy</CcyNm><Ccy>BBB</Ccy><CcyNbr>2</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
<CcyNtry><CtryNm>C</CtryNm><CcyNm>Golden</CcyNm><Ccy>XAU</Ccy><CcyNbr>959</CcyNbr><CcyMnrUnts>N.A.</CcyMnrUnts></CcyNtry>
<CcyNtry><CtryNm>D</CtryNm><CcyNm>Nothing</CcyNm></CcyNtry>
<CcyNtry><CtryNm>E</CtryNm><CcyNm>Alpha</CcyNm><Ccy>AAA</Ccy><CcyNbr>1</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry></x>`;

  const e = parseEntries(XML);
  ok(e.length === 5, "parseEntries finds every <CcyNtry>");
  ok(e[1].isFund === true && e[0].isFund === false, "IsFund attribute is read (not the tag text)");

  const t = buildTable(e);
  ok(t.codes.length === 1 && t.codes[0] === "AAA", "only the clean code survives — fund/metal/no-code all excluded");
  ok(t.minorUnits.get("AAA") === 2, "minor units captured");
  ok(t.excluded.get("BBB") === "FUND", "fund excluded FOR the fund reason");
  ok(t.excluded.get("XAU") === "NO_MINOR_UNIT", "N.A. metal excluded — scale not derivable, not invented");
  ok(t.conflicts.length === 0, "duplicate country rows for one code agree → no conflict");

  // Non-vacuous the OTHER way: a genuine contradiction must be REPORTED, not last-write-wins.
  const bad = parseEntries(XML.replace("<CcyNbr>1</CcyNbr><CcyMnrUnts>2</CcyMnrUnts></CcyNtry></x>", "<CcyNbr>1</CcyNbr><CcyMnrUnts>3</CcyMnrUnts></CcyNtry></x>"));
  ok(buildTable(bad).conflicts.length === 1, "a minor-unit CONTRADICTION is surfaced, never silently resolved");

  // The gate must be able to fail: a changed table text must differ.
  const r1 = renderTable(t, "pin", "s.xml");
  const t2 = buildTable(parseEntries(XML.replace("<CcyMnrUnts>2</CcyMnrUnts></CcyNtry>\n<CcyNtry><CtryNm>B</CtryNm>", "<CcyMnrUnts>4</CcyMnrUnts></CcyNtry>\n<CcyNtry><CtryNm>B</CtryNm>")));
  ok(r1 !== renderTable(t2, "pin", "s.xml"), "renderTable output CHANGES when the data changes (drift gate is non-vacuous)");
  ok(r1 === renderTable(buildTable(parseEntries(XML)), "pin", "s.xml"), "renderTable is DETERMINISTIC (same input → byte-identical)");

  console.log(`\n${fail === 0 ? "✅" : "❌"} gen-unit-registry self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) selfTest();

const { table, text } = generate();
const fungiRegion = renderFungiCurrencySet(table.codes); // #124 — the twin's in-language currency set

if (argv.includes("--check")) {
  // Law 2: the drift gate. Regenerate-and-diff — BOTH the TS table AND the twin's currency-set region.
  let current = "";
  try { current = readFileSync(OUT, "utf8"); } catch {
    console.error(`❌ ${OUT} is MISSING — run: node scripts/gen-unit-registry.mjs`);
    process.exit(1);
  }
  if (current.replace(/\r\n/g, "\n") !== text.replace(/\r\n/g, "\n")) {
    console.error("❌ UNIT REGISTRY DRIFT — the generated table does not match the pinned snapshot.\n" +
      "   Someone hand-edited the table or swapped the snapshot. Both are findings.\n" +
      "   Regenerate with: node scripts/gen-unit-registry.mjs");
    process.exit(1);
  }
  // #124: the self-hosted twin's currency set is generated from the SAME snapshot — it must not drift either.
  let twinSrc = "";
  try { twinSrc = readFileSync(TWIN, "utf8"); } catch {
    console.error(`❌ ${TWIN} is MISSING — cannot check the twin currency set.`);
    process.exit(1);
  }
  const twinNow = extractFungiRegion(twinSrc);
  if (twinNow === null) {
    console.error("❌ type-checker.fungi: <generated:currency-set> markers missing — cannot check the twin currency set.");
    process.exit(1);
  }
  if (twinNow !== fungiRegion) {
    console.error("❌ TWIN CURRENCY-SET DRIFT — type-checker.fungi's isKnownCurrency set does not match the pinned snapshot.\n" +
      "   The self-hosted twin's currency validation has drifted from MONEY_UNIT_TAGS (a false-differential risk).\n" +
      "   Regenerate with: node scripts/gen-unit-registry.mjs");
    process.exit(1);
  }
  console.log(`✅ unit registry + twin currency-set in sync with ${SNAPSHOT_NAME} (${table.codes.length} currencies, pin ${SNAPSHOT_PIN.slice(0, 12)}…)`);
  process.exit(0);
}

writeFileSync(OUT, text);
// #124: inject the same currency set into the self-hosted twin (isKnownCurrency), so it validates Money<CCY>
// in-language from the ONE source of truth. Marker-delimited — only the between-markers span is rewritten.
let twinSrc = "";
try { twinSrc = readFileSync(TWIN, "utf8"); } catch {
  console.error(`❌ ${TWIN} is MISSING — cannot inject the twin currency set.`);
  process.exit(1);
}
writeFileSync(TWIN, injectFungiRegion(twinSrc, fungiRegion));
const byReason = {};
for (const r of table.excluded.values()) byReason[r] = (byReason[r] ?? 0) + 1;
console.log(`✅ unit registry generated — ${table.codes.length} currencies from ${SNAPSHOT_NAME}`);
console.log(`   twin currency-set injected into type-checker.fungi (isKnownCurrency, ${table.codes.length} codes)`);
console.log(`   excluded: ${Object.entries(byReason).map(([r, n]) => `${r} ×${n}`).join(" · ")}`);
