/**
 * gate-cache.ts — GateCache: memoize the COMPILED governance evaluator, NEVER the
 * decision (#194).
 *
 * `compilePolicy()` (compiled-policy.ts, #140) pays the governance "compile" once:
 * it turns a rich, string-shaped `ai {}` object into a `CompiledPolicy` — a packed
 * flag word, a membership Set, integer budgets, and the certified-mode structural
 * trap resolved once. That compile is pure: the SAME `ai {}` input + the SAME
 * `certified` posture always yields the SAME policy table. So recompiling it for an
 * identical policy is wasted work.
 *
 * GateCache memoizes that compile keyed by a STABLE hash of the policy input. A
 * second `compilePolicyCached()` for the same input is a HIT: it returns the *same*
 * cached `CompiledPolicy` object instead of rebuilding it.
 *
 * What this cache MUST NEVER do — and structurally cannot do — is cache a DECISION.
 * A `CompiledPolicy` is an evaluator: a table of preconditions. The allow/deny
 * verdict for a given inference request is NOT stored here; it is recomputed fresh
 * from the request inputs on every evaluation against the (cached) table. Caching
 * decisions would be silent semantic drift — an old "allow" surviving a budget that
 * has since been exhausted, or a request-shaped verdict reused for a different
 * request. The cache holds the *rules*, never the *ruling*.
 *
 * Deny-by-default is preserved: a cache HIT changes nothing about enforcement. The
 * returned table is identical to a fresh compile, so the hot path still tests every
 * predicate against the live request.
 */

import { createHash } from "node:crypto";
import { compilePolicy, type CompiledPolicy } from "./compiled-policy.js";
import type { AiGovernance } from "./hybrid-engine.js";

/**
 * Canonical, stable serialization of the policy INPUT (the `ai {}` governance object
 * plus the certified posture). Field order is fixed and the allow-list is sorted, so
 * two structurally-equal policies — regardless of key insertion order or allow-list
 * ordering — produce the same key. This is the identity of a *policy*, never of a
 * request or a decision.
 */
function canonicalPolicyInput(gov: AiGovernance, certified: boolean): string {
  // Sort the allow-list so ["a","b"] and ["b","a"] are the same policy. (Membership
  // is a Set in the compiled form, so order is not semantically meaningful.)
  const approved = gov.approvedModels ? [...gov.approvedModels].sort() : null;
  // Fixed key order; `undefined` budgets serialize to null so "absent" is stable.
  const shape = {
    approvedModels: approved,
    maxModelCalls: gov.maxModelCalls ?? null,
    maxNewTokens: gov.maxNewTokens ?? null,
    maxTokenCost: gov.maxTokenCost ?? null,
    denyHostNativeFallback: gov.denyHostNativeFallback ?? false,
    certified,
  };
  return JSON.stringify(shape);
}

/** The stable cache key: a hash of the canonical policy input. */
export function policyCacheKey(gov: AiGovernance, certified: boolean): string {
  return createHash("sha256").update(canonicalPolicyInput(gov, certified), "utf8").digest("hex");
}

export interface GateCacheStats {
  /** Number of compiles served from the cache (same policy seen before). */
  readonly hits: number;
  /** Number of compiles that had to run `compilePolicy()` (first sight of a policy). */
  readonly misses: number;
  /** Distinct compiled policies currently held. */
  readonly size: number;
}

/**
 * GateCache — a memo table for COMPILED governance evaluators.
 *
 * Stores `CompiledPolicy` objects (the evaluator / policy table) keyed by a stable
 * hash of the `ai {}` policy input. It NEVER stores an allow/deny decision: there is
 * no API surface here that takes a request or returns a verdict. The cache hands back
 * the rules; the caller evaluates the request against them every time.
 */
export class GateCache {
  /** key (policy-input hash) → the compiled evaluator. Values are policy tables, not decisions. */
  private readonly table = new Map<string, CompiledPolicy>();
  private hits = 0;
  private misses = 0;

  /**
   * Return the compiled evaluator for this policy input, building it once. The SAME
   * input returns the SAME cached `CompiledPolicy` object (a HIT). Pure compile only —
   * no request is consulted and no decision is produced or stored.
   */
  compile(gov: AiGovernance, certified: boolean): CompiledPolicy {
    const key = policyCacheKey(gov, certified);
    const cached = this.table.get(key);
    if (cached !== undefined) {
      this.hits++;
      return cached; // HIT: same evaluator object — recompile avoided.
    }
    // MISS: pay the proof once, then memoize the COMPILED table (never a verdict).
    const compiled = compilePolicy(gov, certified);
    this.table.set(key, compiled);
    this.misses++;
    return compiled;
  }

  /** True iff a compiled evaluator for this exact policy input is already held. */
  has(gov: AiGovernance, certified: boolean): boolean {
    return this.table.has(policyCacheKey(gov, certified));
  }

  /** Drop all cached evaluators. The next compile of any policy is a MISS. */
  clear(): void {
    this.table.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /** Hit/miss/size counters — lets callers and tests prove a recompile was avoided. */
  stats(): GateCacheStats {
    return { hits: this.hits, misses: this.misses, size: this.table.size };
  }
}

/**
 * Process-wide default GateCache. A `CompiledPolicy` is immutable and identified by
 * its input hash, so sharing one table across engines is safe — and it is purely a
 * table of rules, so nothing request- or decision-shaped leaks between callers.
 */
export const defaultGateCache = new GateCache();

/**
 * Convenience wrapper over {@link defaultGateCache}: memoized `compilePolicy`. A
 * drop-in for `compilePolicy(gov, certified)` that returns the cached evaluator on a
 * repeat input. The DECISION is never cached — only the compiled policy table is.
 */
export function compilePolicyCached(gov: AiGovernance, certified: boolean): CompiledPolicy {
  return defaultGateCache.compile(gov, certified);
}
