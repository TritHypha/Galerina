/**
 * JOB 0011 (parts b+c) — the full|auto|lean governance-mode resolver.
 * The security property under test: a flow can resolve to `lean` ONLY when it is provably
 * EffectFree AND taint-clean. Lowering governance can never flip Deny→Allow or launder taint.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGovernanceMode } from "../../dist/governance-mode.js";

test("default (no project, no flow request) → full", () => {
  const r = resolveGovernanceMode({ effectFree: true, taintClean: true });
  assert.equal(r.tier, "full");
  assert.equal(r.effectiveMode, "full");
});

test("auto + EffectFree + taint-clean → lean", () => {
  const r = resolveGovernanceMode({ projectDefault: "auto", effectFree: true, taintClean: true });
  assert.equal(r.tier, "lean");
});

test("auto + has-effect → full (an effect forces full)", () => {
  const r = resolveGovernanceMode({ projectDefault: "auto", effectFree: false, taintClean: true });
  assert.equal(r.tier, "full");
});

test("auto + EffectFree but TAINTED → full (taint can never go lean)", () => {
  const r = resolveGovernanceMode({ projectDefault: "auto", effectFree: true, taintClean: false });
  assert.equal(r.tier, "full");
});

test("project full + flow requests lean → rejected (opt-down past ceiling), stays full", () => {
  const r = resolveGovernanceMode({ projectDefault: "full", flowRequest: "lean", effectFree: true, taintClean: true });
  assert.equal(r.tier, "full");
  assert.equal(r.optDownRejected, true);
  assert.ok(r.diagnostics.some((d) => d.includes("SPORE-CONFIG-GOV-001")));
});

test("project auto + flow opts UP to full → full, no rejection", () => {
  const r = resolveGovernanceMode({ projectDefault: "auto", flowRequest: "full", effectFree: true, taintClean: true });
  assert.equal(r.tier, "full");
  assert.equal(r.optDownRejected, false);
});

test("project lean + flow lean + EffectFree+clean → lean", () => {
  const r = resolveGovernanceMode({ projectDefault: "lean", flowRequest: "lean", effectFree: true, taintClean: true });
  assert.equal(r.tier, "lean");
});

test("explicit lean but has-effect → safety override to full (SPORE-CONFIG-GOV-002)", () => {
  const r = resolveGovernanceMode({ projectDefault: "lean", flowRequest: "lean", effectFree: false, taintClean: true });
  assert.equal(r.tier, "full");
  assert.ok(r.diagnostics.some((d) => d.includes("SPORE-CONFIG-GOV-002")));
});

test("MONOTONE-SAFETY INVARIANT: tier==='lean' ⟹ EffectFree ∧ taint-clean (all combinations)", () => {
  const modes = ["full", "auto", "lean", undefined];
  for (const projectDefault of modes) {
    for (const flowRequest of modes) {
      for (const effectFree of [true, false]) {
        for (const taintClean of [true, false]) {
          const r = resolveGovernanceMode({ projectDefault, flowRequest, effectFree, taintClean });
          if (r.tier === "lean") {
            assert.ok(effectFree && taintClean,
              `lean leaked for effectFree=${effectFree} taintClean=${taintClean} project=${projectDefault} flow=${flowRequest}`);
          }
        }
      }
    }
  }
});
