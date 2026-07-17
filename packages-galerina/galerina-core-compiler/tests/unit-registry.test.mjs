// =============================================================================
// unit-registry.test.mjs — the accepted gate for RD-0349 I1: the runtime unit
// table is GENERATED from the pinned ISO 4217 snapshot, not hand-typed.
// =============================================================================
// NON-VACUOUS in both directions. The old table was a 7-entry hand-typed list
// (["GBP","USD","EUR","JPY","CHF","CAD","AUD"]) and stdlib.ts promised: "When
// I1's owner-gated pinned ISO snapshot lands, ONLY this table grows (full active
// set, per-currency minorUnits incl. JPY→0) — no call-site changes." These tests
// pin BOTH halves of that promise:
//
//   GREW      — the admitted set is now the full ISO active fiat set (a code that
//               was rejected before, e.g. AFN, is admitted now). Without this the
//               generator could emit the same 7 and look "green" while doing nothing.
//   STILL DENIES — XXX/XTS (reserved), funds, and metals stay OUT. `Money.of` is
//               deny-by-default (G2); a generator that swept in everything present
//               in the XML would silently re-open the any-string fail-open.
//   ONLY the table — the 7 originals all survive, so no call site regresses.
//
// The metals exclusion is deliberate and is NOT a gap in this table: ISO gives
// XAU/XAG/XPT/XPD no minor units, so admitting them would mean INVENTING a decimal
// scale — and a wrong scale is a silent money-arithmetic bug. Metals need their own
// sourced scale policy (a separate rung), which is why they are absent here.
// =============================================================================

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MONEY_UNIT_TAGS, MONEY_MINOR_UNITS } from "../dist/stdlib.js";
import { UNIT_REGISTRY_PROVENANCE } from "../dist/unit-registry.generated.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ORIGINAL_SEVEN = ["GBP", "USD", "EUR", "JPY", "CHF", "CAD", "AUD"];

test("the table GREW beyond the 7 hand-typed tags (generator is not a no-op)", () => {
  assert.ok(MONEY_UNIT_TAGS.length > ORIGINAL_SEVEN.length,
    `expected the full ISO active set, got ${MONEY_UNIT_TAGS.length}`);
  // A code that the hand-typed table REJECTED and the snapshot admits.
  assert.ok(MONEY_UNIT_TAGS.includes("AFN"), "AFN (a plain active fiat code) must now be admitted");
  assert.ok(MONEY_UNIT_TAGS.includes("INR") && MONEY_UNIT_TAGS.includes("ZAR"));
});

test("ONLY the table grew — every one of the original 7 survives (no call-site regression)", () => {
  for (const c of ORIGINAL_SEVEN) {
    assert.ok(MONEY_UNIT_TAGS.includes(c), `${c} was admitted before I1 and must still be`);
  }
});

test("deny-by-default holds: reserved / test / fund / metal codes stay OUT", () => {
  // Each of these is a DIFFERENT kind of "not a currency" — see the generator's
  // EXCLUSION_REASONS. A generator that admitted the whole XML would fail here.
  assert.ok(!MONEY_UNIT_TAGS.includes("XXX"), "XXX = 'no currency involved' — admitting it re-opens the unnamed-unit bug");
  assert.ok(!MONEY_UNIT_TAGS.includes("XTS"), "XTS = reserved for testing — a test code in live money is a bug");
  assert.ok(!MONEY_UNIT_TAGS.includes("BOV"), "BOV = IsFund — a valuation vehicle, not a holdable currency");
  assert.ok(!MONEY_UNIT_TAGS.includes("XAU"), "XAU = gold — no ISO minor unit, so its scale would have to be invented");
  assert.ok(!MONEY_UNIT_TAGS.includes("XDR"), "XDR = unit of account, not a currency");
});

test("per-currency minor units are real ISO values, incl. the promised JPY→0", () => {
  assert.equal(MONEY_MINOR_UNITS.get("JPY"), 0, "JPY is the zero-decimal case the old comment named");
  assert.equal(MONEY_MINOR_UNITS.get("CLP"), 0);
  assert.equal(MONEY_MINOR_UNITS.get("GBP"), 2);
  assert.equal(MONEY_MINOR_UNITS.get("BHD"), 3, "BHD is a 3-decimal currency — proves it is not a blanket 2");
  // Every admitted tag must carry a scale: a code without one would round wrong.
  for (const t of MONEY_UNIT_TAGS) {
    assert.equal(typeof MONEY_MINOR_UNITS.get(t), "number", `${t} has no minor units`);
  }
});

test("the table carries its provenance (the snapshot SHA-256 it was generated from)", () => {
  assert.match(UNIT_REGISTRY_PROVENANCE.sha256, /^[0-9a-f]{64}$/);
  assert.equal(UNIT_REGISTRY_PROVENANCE.snapshot, "list-one-2026-07-16.xml");
  // The header must actually say DO NOT EDIT — the file is a build output, not source.
  const src = readFileSync(join(REPO, "packages-galerina", "galerina-core-compiler", "src", "unit-registry.generated.ts"), "utf8");
  assert.ok(src.includes("@generated"), "generated file must be marked @generated");
  assert.ok(src.includes(UNIT_REGISTRY_PROVENANCE.sha256), "the snapshot pin must be recorded in the header");
});

test("DRIFT GATE is green — the committed table matches a fresh regeneration", () => {
  // This is the law-2 gate: RED means someone hand-edited the table or swapped the
  // snapshot. Running it here means the suite catches it, not just a manual step.
  execFileSync("node", [join(REPO, "scripts", "gen-unit-registry.mjs"), "--check"], { stdio: "pipe" });
});

test("the generator's own self-test passes (the gate can fail)", () => {
  execFileSync("node", [join(REPO, "scripts", "gen-unit-registry.mjs"), "--self-test"], { stdio: "pipe" });
});
