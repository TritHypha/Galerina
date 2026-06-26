/**
 * compiled-policy.ts — the numeric policy table (the "pre-pay" governance compile).
 *
 * An `ai {}` contract is rich, string-shaped, object-shaped config. Probing those
 * fields on every inference call is the "runtime interrogation" tax: an
 * `Array.includes` over the allow-list (O(n)), repeated object-field reads, and —
 * worst of all — re-deriving the *constant* certified-mode preconditions on every
 * single call.
 *
 * `compilePolicy()` pays that proof ONCE, at engine construction, producing a
 * `CompiledPolicy`:
 *   - a packed i32 `flags` word — each bit is a precomputed predicate, so the hot
 *     path tests a bit (`flags & POL_HAS_ALLOWLIST`) instead of probing a field;
 *   - a `Set` for allow-list membership — O(1) `has()` instead of O(n) `includes()`;
 *   - the certified structural precondition trap, computed once (it is invariant for
 *     the engine's lifetime — it cannot depend on the request).
 *
 * The hot path then reduces to: one bit test + one Set.has + two integer compares.
 * This is the runtime form of "governance expensive before execution, almost free
 * during execution".
 */

import type { AiGovernance } from "./hybrid-engine.js";

// ── Packed i32 policy flags — the numeric policy table ────────────────────────
export const POL_HAS_ALLOWLIST    = 0b00001;
export const POL_DENY_HOST_NATIVE = 0b00010;
export const POL_HAS_CALL_BUDGET  = 0b00100;
export const POL_HAS_TOKEN_BUDGET = 0b01000;
export const POL_HAS_COST_CEILING = 0b10000;

export interface PolicyTrap {
  readonly code: string;
  readonly details: Record<string, unknown>;
}

export interface CompiledPolicy {
  /** Packed predicate bits (POL_*). The hot path reads these, not the AiGovernance object. */
  readonly flags: number;
  /** Allow-listed model ids — O(1) membership. Empty when no allow-list is in force. */
  readonly approvedModels: ReadonlySet<string>;
  /** Per-engine call budget, or -1 when unbounded. */
  readonly maxModelCalls: number;
  /** Per-call output-token ceiling, or -1 when unbounded. */
  readonly maxNewTokens: number;
  /**
   * Certified-mode structural precondition trap, computed ONCE. Constant for the
   * engine's lifetime (it cannot depend on a request), so the hot path returns it
   * directly instead of re-deriving the four certified checks every call.
   * null when certified preconditions are satisfied, or when not certified.
   */
  readonly certifiedTrap: PolicyTrap | null;
}

/**
 * Compile an `ai {}` governance object into the numeric policy table. Called once
 * per engine. Preserves the exact trap codes and precedence of the interpreted path.
 */
export function compilePolicy(gov: AiGovernance, certified: boolean): CompiledPolicy {
  const approvedModels = new Set(gov.approvedModels ?? []);

  let flags = 0;
  if (approvedModels.size > 0)               flags |= POL_HAS_ALLOWLIST;
  if (gov.denyHostNativeFallback)            flags |= POL_DENY_HOST_NATIVE;
  if (gov.maxModelCalls !== undefined)       flags |= POL_HAS_CALL_BUDGET;
  if (gov.maxNewTokens !== undefined)        flags |= POL_HAS_TOKEN_BUDGET;
  if (gov.maxTokenCost !== undefined)        flags |= POL_HAS_COST_CEILING;

  // Certified structural preconditions — invariant, so resolve them once. Order and
  // codes mirror the previous per-call certified block exactly.
  let certifiedTrap: PolicyTrap | null = null;
  if (certified) {
    if (approvedModels.size === 0) {
      certifiedTrap = { code: "ERR_CERTIFIED_NO_ALLOWLIST", details: { reason: "certified mode requires a non-empty approved_models allow-list" } };
    } else if (gov.maxNewTokens === undefined) {
      certifiedTrap = { code: "ERR_CERTIFIED_NO_TOKEN_BUDGET", details: { reason: "certified mode requires ai{ max_tokens }" } };
    } else if (gov.maxTokenCost === undefined) {
      certifiedTrap = { code: "ERR_CERTIFIED_NO_COST_CEILING", details: { reason: "certified mode requires ai{ max_token_cost }" } };
    } else if (!gov.denyHostNativeFallback) {
      certifiedTrap = { code: "ERR_CERTIFIED_HOST_NATIVE_OPEN", details: { reason: "certified mode forbids host-native fallback" } };
    }
  }

  return {
    flags,
    approvedModels,
    maxModelCalls: gov.maxModelCalls ?? -1,
    maxNewTokens: gov.maxNewTokens ?? -1,
    certifiedTrap,
  };
}
