/**
 * authorization.ts — the scope AUTHORIZATION factor (request-time RBAC).
 *
 * The App Kernel's `AuthPolicy` already declares `scopes: readonly string[]` — the
 * authorization surface a route expects — but the kernel does not itself check
 * granted-vs-required scopes today. This factor is the standalone home for that
 * check, the way Spring-security separates authentication from `@PreAuthorize`
 * authorization. It is ADDITIVE: it does not move any existing kernel behaviour.
 *
 * `scopeVerdict(required, granted)` is a pure K3 factor:
 *   - every required scope is present in `granted` → `+1` ALLOW
 *   - some required scope is absent                → `−1` DENY (a missing required
 *                                                     scope is a definite refusal)
 *   - `required` is empty                          → `0` INDETERMINATE
 *
 * Why empty-required is INDETERMINATE (deny-by-default): an empty conjunction would
 * be a vacuous ALLOW, which is the one thing a fail-closed gate must not emit. This
 * mirrors `allOf([])` in the K3 algebra. If a route genuinely has NO scope
 * requirement, omit this factor from the composition rather than passing `[]`.
 *
 * Scopes are matched EXACTLY (case-sensitive, no wildcard/prefix expansion) — no
 * implicit broadening of authority. `granted` is assumed to come from an identity
 * the channel/identity factor (channel.ts) has already established trust in;
 * authorization presupposes authentication.
 *
 * Returns a VERDICT, never a decision — compose it with the other factors and hand
 * the result to the kernel.
 */

import { Verdict } from "../../logicn-tower-citizen/dist/index.js";

/**
 * Conjunctive scope check as a K3 verdict: ALLOW iff every `required` scope is in
 * `granted`; DENY on any missing required scope; INDETERMINATE for an empty
 * requirement (deny-by-default — see module note).
 */
export function scopeVerdict(
  required: readonly string[],
  granted: readonly string[],
): Verdict {
  if (required.length === 0) return Verdict.INDETERMINATE; // no positive authz evidence
  const have = new Set(granted);
  for (const need of required) {
    if (!have.has(need)) return Verdict.DENY; // a missing required scope is a hard refusal
  }
  return Verdict.ALLOW;
}
