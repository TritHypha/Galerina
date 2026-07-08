// =============================================================================
// compose.ts — the ONLY sound way to use the deny-only pre-filter.
//
// The pre-filter can add a fast Deny, but an ALLOW must ALWAYS come from the real
// keyed gate. `admit` makes that composition first-class so it cannot be misused:
// there is no code path where a `Maybe` alone grants access.
//
//   admitted = (prefilter != Deny) AND realKeyedGate()
//
// A false `Maybe` merely wastes one real crypto check (safe); it can never
// manufacture an allow. Selling the pre-filter as authentication is a fail-open
// landmine — this module exists so callers never have to write that AND by hand.
// =============================================================================

import { Verdict, prefilter } from "./prefilter.js";

/** A real keyed gate: the downstream unforgeable check (ML-DSA / Ed25519 / HMAC / …). */
export type RealKeyedGate = () => boolean | Promise<boolean>;

/**
 * Admit a subject iff the cheap pre-filter did not Deny AND the real keyed gate passes.
 * The pre-filter runs first (cheap reject); the real gate is the ONLY thing that can grant.
 * Returns `false` on any pre-filter Deny without ever invoking the (expensive) real gate.
 */
export async function admit(
  subjectPacked: Uint8Array,
  maskPacked: Uint8Array,
  lenTrits: number,
  realKeyedGate: RealKeyedGate,
): Promise<boolean> {
  // Cheap deny first. A Maybe NEVER grants — it only permits the real gate to run.
  if (prefilter(subjectPacked, maskPacked, lenTrits) === Verdict.Deny) return false;
  return (await realKeyedGate()) === true;
}

/** Synchronous variant of {@link admit} for a synchronous real gate. */
export function admitSync(
  subjectPacked: Uint8Array,
  maskPacked: Uint8Array,
  lenTrits: number,
  realKeyedGate: () => boolean,
): boolean {
  if (prefilter(subjectPacked, maskPacked, lenTrits) === Verdict.Deny) return false;
  return realKeyedGate() === true;
}
