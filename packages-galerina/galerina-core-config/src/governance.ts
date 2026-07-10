/**
 * Project-level governance mode — `full | auto | lean` (JOB 0011, part a, config layer).
 *
 * This is the project *ceiling* a developer sets once (`ProjectConfig.governance`). The default
 * is `full` — the secure pole: every gate, audit, capability check, and hard floor runs. `auto`
 * lets the compiler right-size per flow (it resolves each flow to exactly `full` or `lean`, never
 * a partial middle tier); `lean` is only ever reachable for a flow the compiler PROVES is
 * EffectFree ∧ taint-clean.
 *
 * IMPORTANT — this module only LABELS the project ceiling; it grants no authority and runs no
 * code. The per-flow resolution (stricter-wins precedence + the monotone-safety guarantee
 * `tier==='lean' ⟹ effectFree ∧ taintClean`) lives in the compiler's `governance-mode.ts`
 * `resolveGovernanceMode()`, which takes this value as its `projectDefault` input. The execution
 * consumer — the AOT-`lean`→WASM router — stays unwired behind the fidelity differential harness.
 *
 * Fail-closed: an invalid or unknown value resolves to `full` (the strictest mode), never to a
 * laxer one. A missing value defaults to `full` silently.
 *
 * Design: ../ZTF-Knowledge-Bases/galerina-governance-mode-ladder.md.
 */

export const GOVERNANCE_MODES = ["full", "auto", "lean"] as const;
export type GovernanceMode = (typeof GOVERNANCE_MODES)[number];

/** Default project governance ceiling — the secure pole. */
export const DEFAULT_GOVERNANCE_MODE: GovernanceMode = "full";

export function isGovernanceMode(value: unknown): value is GovernanceMode {
  return value === "full" || value === "auto" || value === "lean";
}

export interface ResolvedProjectGovernance {
  /** The raw requested value, if any. */
  readonly requested: unknown;
  /** The resolved project ceiling. Always one of the three modes. */
  readonly mode: GovernanceMode;
  /** True when a missing or invalid value forced the `full` default (fail-closed). */
  readonly defaulted: boolean;
  /** True specifically when an *invalid* (present but unrecognised) value was rejected. */
  readonly invalid: boolean;
  readonly rationale: string;
}

/**
 * Resolve the project governance ceiling from a raw config value.
 *
 * - missing/undefined → `full` (defaulted, not flagged invalid)
 * - a valid mode      → that mode
 * - anything else     → `full` (fail-closed; flagged invalid so the caller can emit a diagnostic)
 */
export function resolveProjectGovernance(requested: unknown): ResolvedProjectGovernance {
  if (requested === undefined || requested === null) {
    return {
      requested,
      mode: DEFAULT_GOVERNANCE_MODE,
      defaulted: true,
      invalid: false,
      rationale: "governance not set; defaulting to 'full' (every gate runs).",
    };
  }
  if (isGovernanceMode(requested)) {
    return {
      requested,
      mode: requested,
      defaulted: false,
      invalid: false,
      rationale:
        requested === "full"
          ? "governance 'full' — every gate, audit, capability check, and hard floor runs."
          : requested === "auto"
            ? "governance 'auto' — compiler right-sizes each flow to full or lean (never partial)."
            : "governance 'lean' — flows proved EffectFree ∧ taint-clean skip runtime governance.",
    };
  }
  return {
    requested,
    mode: DEFAULT_GOVERNANCE_MODE,
    defaulted: true,
    invalid: true,
    rationale: `invalid governance "${String(requested)}" — forcing 'full' (fail-closed).`,
  };
}
