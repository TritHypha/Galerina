/**
 * governance-mode.ts — the `full | auto | lean` governance ladder resolver (JOB 0011, parts b+c).
 *
 * This is the PURE decision core of the graduated-governance feature: given a flow's
 * effect/taint facts plus the project default and the flow's requested mode, it resolves the
 * runtime governance tier. It performs NO execution and grants NO authority — it only LABELS a
 * flow `full` or `lean`. Nothing acts on the label yet; the parser token (a), the
 * `governanceMode` manifest field (d), and the AOT-`lean`-to-WASM router (e) are separate,
 * later wiring (e is gated behind the fidelity differential harness).
 *
 * MONOTONE-SAFETY (the security invariant, proved by construction):
 *   resolveGovernanceMode(...).tier === "lean"  ⟹  (effectFree ∧ taintClean)
 * `lean` is *erasure of enforcement that was compiler-proved unnecessary*, never a relaxation
 * of an enforcement that exists. A flow with any declared/inferred effect, or any
 * secret/PII/embedding taint reaching a sink, can NEVER resolve to `lean` — it is forced to
 * `full`. So lowering governance can never flip Deny→Allow or launder taint past a floor:
 * `lean ⊆ EffectFree ∧ taint-clean`, and the floors are defined on effects/taint, so the
 * intersection of "nothing to enforce" with "the floors" is empty.
 *
 * Design: docs/Knowledge-Bases/galerina-governance-mode-ladder.md (R&D job 0011).
 */

export type GovernanceMode = "full" | "auto" | "lean";
/** The two runtime tiers `auto` ever resolves to — never a partial-credit middle tier. */
export type RuntimeGovernanceTier = "full" | "lean";

/** Total strictness order: full > auto > lean. */
const STRICTNESS: Record<GovernanceMode, number> = { full: 2, auto: 1, lean: 0 };

export interface GovernanceModeInputs {
  /** Project-level ceiling (`ProjectConfig.governance`). Default `full` (secure pole). */
  projectDefault?: GovernanceMode;
  /** Per-flow `contract { governance: ... }`, if declared. Undefined → inherit the project. */
  flowRequest?: GovernanceMode;
  /** EffectCheckerFlags.EffectFree: no declared AND no inferred effects. */
  effectFree: boolean;
  /** No secret/PII/embedding taint reaches any sink (value-state checker). */
  taintClean: boolean;
}

export interface GovernanceModeResolution {
  /** The runtime tier actually applied. `lean` only when EffectFree ∧ taint-clean. */
  tier: RuntimeGovernanceTier;
  /** The mode after stricter-wins precedence (before eligibility resolution). */
  effectiveMode: GovernanceMode;
  reason: string;
  /** True if the flow requested a laxer mode than the project ceiling (rejected). */
  optDownRejected: boolean;
  diagnostics: string[];
}

/**
 * Resolve the effective runtime governance tier for one flow.
 * Default project mode is `full`; an undeclared flow inherits the project default.
 */
export function resolveGovernanceMode(input: GovernanceModeInputs): GovernanceModeResolution {
  const projectDefault: GovernanceMode = input.projectDefault ?? "full";
  const flowRequest: GovernanceMode = input.flowRequest ?? projectDefault;
  const diagnostics: string[] = [];

  // (c) Precedence — stricter wins. A flow may opt UP (stricter than the project) but may
  // never opt DOWN past the project ceiling; a laxer request is rejected and the ceiling holds.
  let optDownRejected = false;
  let effectiveMode: GovernanceMode = flowRequest;
  if (STRICTNESS[flowRequest] < STRICTNESS[projectDefault]) {
    optDownRejected = true;
    effectiveMode = projectDefault;
    diagnostics.push(
      `SPORE-CONFIG-GOV-001: flow requested governance:${flowRequest} but the project ceiling is ${projectDefault}; opt-down past the ceiling is rejected — using ${projectDefault}.`
    );
  }

  // (b) Resolve to a runtime tier. `lean` is reachable ONLY for an EffectFree ∧ taint-clean flow.
  const leanEligible = input.effectFree === true && input.taintClean === true;
  let tier: RuntimeGovernanceTier;
  let reason: string;

  if (effectiveMode === "full") {
    tier = "full";
    reason = "full: every gate, audit, capability check, and hard floor runs (default/forced).";
  } else if (effectiveMode === "auto") {
    if (leanEligible) {
      tier = "lean";
      reason = "auto → lean: flow is EffectFree and taint-clean — there is nothing to enforce.";
    } else {
      tier = "full";
      reason = "auto → full: flow has a declared/inferred effect or taint-to-sink.";
    }
  } else {
    // effectiveMode === "lean" (only reachable when the project ceiling is itself `lean`)
    if (leanEligible) {
      tier = "lean";
      reason = "lean: flow is EffectFree and taint-clean — there is nothing to enforce.";
    } else {
      tier = "full";
      reason = "lean requested but flow is not EffectFree/taint-clean — safety override to full.";
      diagnostics.push(
        `SPORE-CONFIG-GOV-002: flow requested governance:lean but has a declared/inferred effect or taint-to-sink; forced to full (lean cannot relax a gate that exists).`
      );
    }
  }

  return { tier, effectiveMode, reason, optDownRejected, diagnostics };
}
