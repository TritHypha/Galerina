/**
 * Type-level gate for the RD-0510 arith-Trit brand (S0 second half). This is NOT runtime code — the function
 * is never called; it exists so `tsc` FAILS the build if the mutual non-assignability between `Verdict` (the
 * `-1|0|1` governance union) and `Trit` (a branded number, the arithmetic face) ever breaks. Each
 * `@ts-expect-error` asserts a rejection: if the brand weakened so the marked line stopped erroring, the
 * directive becomes "unused" and tsc errors. Feeding a Verdict to an arithmetic gate, or a Trit to a K3
 * governance op, is authority-laundering (verify-governance-algebra SUITE 3/5) — both are forbidden here.
 */
import { Verdict, vAnd } from "./three-valued-governance.js";
import { asTrit, sumTrit, type Trit } from "./tpl-simulator.js";

export function __tritBrandTypeGate(): void {
  const v: Verdict = Verdict.ALLOW;
  const t: Trit = asTrit(1);

  // ── Verdict may NOT enter the arithmetic face ──
  // @ts-expect-error a governance Verdict is not a Trit — feeding it to an arith gate would launder authority.
  sumTrit(v, v);

  // ── Trit may NOT enter the K3 governance face ──
  // @ts-expect-error an arithmetic Trit is not a Verdict — feeding it to a governance op would launder authority.
  vAnd(t, t);

  // ── the sanctioned faces DO type-check (no directive → these MUST stay legal, or the brand is over-strict) ──
  sumTrit(t, t);
  vAnd(v, v);
}
