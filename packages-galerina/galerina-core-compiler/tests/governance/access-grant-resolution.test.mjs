// =============================================================================
// FUNGI-ACCESS-001 — A20 resolve-authority-or-deny (2026-07-08)
//
// An `access { grant X }` authority reference must RESOLVE against the
// canonical vocabularies (ADMISSION_CAPABILITIES ∪ CANONICAL_EFFECTS,
// alias-aware). Before this hardening the check (a) skipped ANY dotted name —
// `grant totally.fake.capability` was admitted silently — and (b) only warned.
// Name-based authority that fails open by absence (audit H5 / LN-048 / A20).
//
// Now: unknown ⇒ ERROR under production/deterministic, warning under dev.
// Anti-vacuous (A27): canonical names, aliases, and effect names stay silent.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkEffects, verifyGovernance } from "../../dist/index.js";

function verify(source, profile) {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}

const flowWithGrant = (grant, effect = "database.write") => `
secure flow writeRecord(data: String) -> Void
contract {
  intent { "Write a record." }
  effects { ${effect} }
  access {
    grant ${grant}
  }
}
{
  return
}
`;

const acc001 = (r) => r.diagnostics.filter((d) => d.code === "FUNGI-ACCESS-001");

describe("FUNGI-ACCESS-001 resolve-or-deny (A20)", () => {
  it("a made-up DOTTED grant is an ERROR in production (the old dotted-name bypass)", () => {
    const r = verify(flowWithGrant("totally.fake.capability"), "production");
    const d = acc001(r);
    assert.equal(d.length, 1, "invented dotted capability must be unresolvable");
    assert.equal(d[0].severity, "error");
  });

  it("a made-up dotted grant is an ERROR under deterministic too", () => {
    const d = acc001(verify(flowWithGrant("payments.mega.bypass"), "deterministic"));
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
  });

  it("an undotted unknown grant is an ERROR in production", () => {
    const d = acc001(verify(flowWithGrant("banana"), "production"));
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
  });

  it("dev profile keeps authoring workable: unknown grant is a WARNING (GOV-004 house pattern)", () => {
    const d = acc001(verify(flowWithGrant("totally.fake.capability"), "dev"));
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "warning");
  });

  it("a canonical capability grant stays silent (anti-vacuous)", () => {
    const d = acc001(verify(flowWithGrant("database.write"), "production"));
    assert.equal(d.length, 0);
  });

  it("an ALIAS spelling resolves (db.write → database.write) — alias-aware, not spelling-fragile", () => {
    const d = acc001(verify(flowWithGrant("db.write"), "production"));
    assert.equal(d.length, 0);
  });

  it("a canonical EFFECT name (no V_DPM bit) resolves via CANONICAL_EFFECTS", () => {
    const d = acc001(verify(flowWithGrant("email.send", "email.send"), "production"));
    assert.equal(d.length, 0, "canonical effect names are valid authority vocabulary");
  });
});
