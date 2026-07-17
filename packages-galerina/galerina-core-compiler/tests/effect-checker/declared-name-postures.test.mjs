// =============================================================================
// Effect Checker — declared-name postures (2026-07-02 reconciliation)
//
// Locks the owner-decided "harden after proof" dispositions:
//   - eval.execute is DENY-ONLY: FUNGI-EFFECT-006 error (recognised, never
//     grantable) — NOT the generic UNKNOWN_EFFECT
//   - ai.infer is a one-way deprecation alias of ai.inference: FUNGI-EFFECT-004
//     NON_CANONICAL_EFFECT with the canonical suggestion
//   - telemetry.read is canonical AND mask-visible (EffectFlags.TelemetryRead —
//     CG-2: no canonical name may be mask-invisible)
//   - pii.write is a non-broad alias → FUNGI-EFFECT-009 NON_CANONICAL_EFFECT (error) suggesting
//     database.write. (The "#20 split" moved the alias arm off 004 → 009; still an ERROR, so the
//     accept surface is not widened — the Wave-2 "error > warning" intent holds, only the number
//     changed. Prose corrected 2026-07-17 to match the 009 assertion below; R&D-flagged stale-004.)
//   - a truly unknown name still gets FUNGI-EFFECT-004 UNKNOWN_EFFECT (error)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  effectsToFlags,
  effectsSubset,
  EffectFlags,
  FUNGI_EFFECT_006,
} from "../../dist/index.js";

function diagnosticsFor(effectName) {
  const src = `secure flow f(x: Int) -> Int contract { effects { ${effectName} } } { return x }`;
  const p = parseProgram(src, "postures.fungi");
  const results = checkEffects(p.flows, p.ast);
  return results.flatMap(r => r.diagnostics ?? []);
}

describe("declared-name postures — deny-only", () => {
  it("eval.execute → FUNGI-EFFECT-006 error (deny-only), not UNKNOWN_EFFECT", () => {
    const diags = diagnosticsFor("eval.execute");
    const d6 = diags.find(d => d.code === "FUNGI-EFFECT-006");
    assert.ok(d6, "FUNGI-EFFECT-006 must fire");
    assert.equal(d6.severity, "error");
    assert.equal(d6.name, "DENY_ONLY_EFFECT");
    assert.ok(!diags.some(d => d.code === "FUNGI-EFFECT-004"),
      "deny-only must not double-report as unknown/non-canonical");
  });

  it("FUNGI_EFFECT_006 registry constant is exported with the right shape", () => {
    assert.equal(FUNGI_EFFECT_006.code, "FUNGI-EFFECT-006");
    assert.equal(FUNGI_EFFECT_006.severity, "error");
    assert.equal(FUNGI_EFFECT_006.name, "DENY_ONLY_EFFECT");
  });

  it("eval.execute (deny-only) sets the fail-closed sentinel, never bit 0 — never satisfiable", () => {
    // BK-1 (2026-07-03): eval.execute → 0 was itself a fail-open — `[eval.execute] ⊆ []` returned true, i.e.
    // a deny-only requirement read as authority-free. It now sets the UnmappedEffect sentinel so the subset
    // check fails CLOSED: a requirement for a deny-only (or any unmapped) effect is never satisfiable.
    const flags = effectsToFlags(["eval.execute"]);
    assert.equal(flags, EffectFlags.UnmappedEffect, "deny-only / unmapped → sentinel (fail-closed), not bit 0");
    assert.equal(effectsSubset(flags, effectsToFlags([])), false, "eval.execute ⊄ [] — never grantable");
  });

  it("memory.spill → FUNGI-EFFECT-006 error (deny-only, H-6), not UNKNOWN_EFFECT", () => {
    // RD-0358 / RD-0360 Q2: a hardened value crossing its `hardening { residency }` ceiling is a
    // RECOGNISED name that can never be granted — declaring it is inadmissible, not under-declared.
    // This is the EXPLICIT-declaration door; FUNGI-HARDEN-005/007 close the IMPLICIT-spill door.
    const diags = diagnosticsFor("memory.spill");
    const d6 = diags.find(d => d.code === "FUNGI-EFFECT-006");
    assert.ok(d6, "FUNGI-EFFECT-006 must fire for memory.spill");
    assert.equal(d6.severity, "error");
    assert.equal(d6.name, "DENY_ONLY_EFFECT");
    assert.ok(!diags.some(d => d.code === "FUNGI-EFFECT-004"),
      "memory.spill is deny-only, not unknown/non-canonical — no double-report");
  });

  it("memory.spill (deny-only) → UnmappedEffect sentinel, never satisfiable (fail-closed)", () => {
    // The C10 fence at the type level: a declared spill requirement can never be a subset of any
    // granted authority, so no grant ever makes a hardened spill admissible.
    const flags = effectsToFlags(["memory.spill"]);
    assert.equal(flags, EffectFlags.UnmappedEffect, "deny-only → sentinel (fail-closed), not bit 0");
    assert.equal(effectsSubset(flags, effectsToFlags([])), false, "memory.spill ⊄ [] — never grantable");
  });
});

describe("declared-name postures — aliases and canonical", () => {
  it("ai.infer → FUNGI-EFFECT-009 NON_CANONICAL_EFFECT suggesting ai.inference", () => {
    const diags = diagnosticsFor("ai.infer");
    const d = diags.find(x => x.code === "FUNGI-EFFECT-009");
    assert.ok(d, "alias must be flagged non-canonical");
    assert.equal(d.name, "NON_CANONICAL_EFFECT");
    assert.equal(d.suggestedCode, "ai.inference");
  });

  it("telemetry.read is canonical: no name diagnostics", () => {
    const diags = diagnosticsFor("telemetry.read");
    assert.ok(!diags.some(d => d.code === "FUNGI-EFFECT-009" || d.code === "FUNGI-EFFECT-005" || d.code === "FUNGI-EFFECT-006"),
      `expected no name diagnostics, got: ${diags.map(d => d.code).join(",")}`);
  });

  it("telemetry.read is mask-VISIBLE (CG-2: canonical names must map to a flag bit)", () => {
    assert.notEqual(effectsToFlags(["telemetry.read"]), 0, "telemetry.read must have an EffectFlags bit");
  });

  it("pii.write → FUNGI-EFFECT-009 error suggesting database.write (pinned Wave-2 semantic; #20 split — the alias arm moved off -004)", () => {
    const diags = diagnosticsFor("pii.write");
    const d = diags.find(x => x.code === "FUNGI-EFFECT-009");
    assert.ok(d, "pii.write must hard-error (error > warning; no silent widening)");
    assert.equal(d.severity, "error");
    assert.equal(d.suggestedCode, "database.write");
  });

  it("a truly unknown name still errors as UNKNOWN_EFFECT", () => {
    const diags = diagnosticsFor("totally.fake.effect");
    const d = diags.find(x => x.code === "FUNGI-EFFECT-004");
    assert.ok(d, "unknown names must still be rejected");
    assert.equal(d.name, "UNKNOWN_EFFECT");
    assert.equal(d.severity, "error");
  });
});
