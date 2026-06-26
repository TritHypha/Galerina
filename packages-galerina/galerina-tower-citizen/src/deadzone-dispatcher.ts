/**
 * deadzone-dispatcher.ts — executes the author-declared `on_indeterminate` K3 dead-zone policy.
 *
 * A substrate reading that discretizes to the K3-0 INDETERMINATE dead zone (a voted result of 0 — phase
 * drift / lane failure into the ambiguous band) is governed by the flow's declared
 * `substrate { on_indeterminate: trap | revote:N | fallback_digital }` policy. The compiler PARSES that
 * policy (substrate-inference.ts) but, until now, NOTHING executed it at the runtime read path — the
 * INDETERMINATE simply propagated (collapsing to deny via vAnd, which is fail-safe, but the author's
 * declared disposition — re-vote harder, or take the exact digital value — was silently IGNORED). This
 * module executes the declared policy, fail-closed: an unresolved dead zone always TRAPS, never a guessed
 * value. (Owner-approved build 2026-06-25; the parsed-but-dead policy is now enforced at runtime.)
 */

import type { Reading } from "./substrate-model.js"; // type-only import — erased at runtime, no cycle

/** Author-declared disposition for a K3-0 INDETERMINATE substrate reading (mirrors the compiler union). */
export type OnIndeterminate =
  | { readonly kind: "trap" }
  | { readonly kind: "revote"; readonly n: number }
  | { readonly kind: "fallback_digital" };

/** The default disposition when a substrate block omits `on_indeterminate`: trap (fail-closed). */
export const DEFAULT_ON_INDETERMINATE: OnIndeterminate = { kind: "trap" };

/** Thrown when a dead-zone reading cannot be resolved to a definite trit under the declared policy. */
export class SubstrateDeadZoneTrap extends Error {
  readonly code = "SPORE-SUBSTRATE-DEADZONE" as const;
  constructor(message: string) {
    super(`[SPORE-SUBSTRATE-DEADZONE]: ${message}`);
    this.name = "SubstrateDeadZoneTrap";
  }
}

/**
 * Execute the declared `on_indeterminate` policy for a reading that landed in the K3-0 dead zone.
 *  - `trap`             → throw {@link SubstrateDeadZoneTrap} (fail-closed — the result cannot be committed).
 *  - `revote:N`         → re-vote at redundancy N via the injected `revote` callback; if it STILL lands in
 *                         the dead zone, TRAP (never a guessed value). N must be an odd integer ≥ 1.
 *  - `fallback_digital` → take the exact DIGITAL value (the ideal trit, computed noiselessly). This is the
 *                         trusted exact path; it returns the REAL value, so it cannot manufacture an ALLOW
 *                         (No-Coercion preserved — a fallback never lifts a verdict, it delivers the truth).
 * `revote(n)` re-reads/re-votes the same op at redundancy n (supplied by the lane, which owns the read).
 */
export function dispatchDeadZone(
  policy: OnIndeterminate,
  idealTrit: -1 | 0 | 1,
  revote: (n: number) => Reading,
): Reading {
  switch (policy.kind) {
    case "trap":
      throw new SubstrateDeadZoneTrap("substrate reading is INDETERMINATE (K3-0) and on_indeterminate=trap");
    case "revote": {
      if (!Number.isInteger(policy.n) || policy.n < 1 || policy.n % 2 === 0) {
        throw new SubstrateDeadZoneTrap(`on_indeterminate=revote:${policy.n} requires an odd integer N ≥ 1`);
      }
      const r = revote(policy.n);
      if (r.value === 0) {
        throw new SubstrateDeadZoneTrap(`re-vote at N=${policy.n} STILL INDETERMINATE — failing closed (no guessed value)`);
      }
      return r;
    }
    case "fallback_digital":
      // The digital lane computes the exact ideal trit with no noise. Deterministic, fail-safe.
      return { value: idealTrit, indeterminate: false, noiseMargin: 1 };
  }
}
