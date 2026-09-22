/**
 * trit-gates.ts — K3 / balanced-trit number primitives.
 *
 * Shared by the governance Verdict face and the TPL Trit face. Kept in its own
 * module so `tower.governance.v1` / cli-check can load K3 without evaluating
 * TPLSimulator, photonic, or hybrid inference.
 */

export class SecurityTrap extends Error {
  constructor(message: string) {
    super(`[SECURITY_TRAP]: ${message}`);
    this.name = "SecurityTrap";
  }
}

export function assertTrit(v: number): void {
  if (v !== -1 && v !== 0 && v !== 1) {
    throw new SecurityTrap(`Value outside ternary set: ${v} (expected -1, 0, or 1)`);
  }
}

/** Negation (NOT): +1 ↔ -1, 0 ↦ 0. */
export function negTrit(a: number): number {
  assertTrit(a);
  return a === 0 ? 0 : -a;
}

/** Balanced-ternary AND (min): the more-cautious input wins. */
export function minTrit(a: number, b: number): number {
  assertTrit(a);
  assertTrit(b);
  return a < b ? a : b;
}

/** Balanced-ternary OR (max): the more-permissive input wins. */
export function maxTrit(a: number, b: number): number {
  assertTrit(a);
  assertTrit(b);
  return a > b ? a : b;
}

/** Internal arithmetic vote shared by the branded TPL face and substrate readings. */
export function consensusTritValue(a: number, b: number, c: number): -1 | 0 | 1 {
  assertTrit(a); assertTrit(b); assertTrit(c);
  const s = a + b + c;
  return s > 0 ? 1 : s < 0 ? -1 : 0;
}
