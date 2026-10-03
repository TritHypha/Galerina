/**
 * narrow-float.ts — PROVISIONAL (E5, Grok Bot 2026-10-02, open to Codex's revision): the ONE rounding
 * definition for the sized float types Float32 (IEEE-754 binary32) and Float16 (binary16), shared by the
 * tree-walker and the WASM emitter so the two tiers cannot drift.
 *
 * Semantics (question-03 option B): a Float32 value is always a binary32 value and a Float16 value is always
 * a binary16 value. Rounding is round-to-nearest, ties-to-even — exactly `Math.fround` / a `Float32Array`
 * store for Float32 and `Math.f16round` / a `Float16Array` store for Float16 (the main-branch Float32Array
 * sites: lowering-plan.ts Float32 → Float32Array, scripts/audit-arithmetic-conformance.mjs f32 pins). WASM
 * carries the value in an f64 lane and rounds with `f32.demote_f64` (binary32, the same rounding as
 * Math.fround) or the `$fungi_round_f16` helper (the same algorithm as `softF16Round` below).
 *
 * Mixing rule (no implicit narrowing between variables):
 *   narrow ⊕ same narrow    → that width          narrow ⊕ literal → the narrow width (the literal is rounded)
 *   Float16 ⊕ Float32       → Float32 (widening)  narrow ⊕ Float/Float64/Int variable → Float (f64, no rounding)
 * A declared Float32/Float16 binding, parameter or return rounds its value on entry (assignment narrows).
 * Rounding to ±Inf (overflow) is the existing non-finite trap (FUNGI-FLOAT-NAN-001), never a silent Inf.
 */

export type NarrowFloatWidth = 16 | 32;

/** 16 / 32 for a Float16 / Float32 base type, otherwise undefined. */
export function narrowFloatWidthOf(base: string | undefined): NarrowFloatWidth | undefined {
  if (base === "Float32") return 32;
  if (base === "Float16") return 16;
  return undefined;
}

/** The Galerina base type name for a narrow width. */
export function narrowFloatTypeName(width: NarrowFloatWidth): "Float32" | "Float16" {
  return width === 32 ? "Float32" : "Float16";
}

const TWO_POW_M14 = 2 ** -14; // smallest normal binary16
const TWO_POW_M24 = 2 ** -24; // binary16 subnormal quantum
const F16_MAX = 65504;

/**
 * Software binary16 rounding (round-to-nearest, ties-to-even) of a finite or non-finite number. Bit-identical
 * to `Math.f16round`; used when the host lacks it, and mirrored instruction-for-instruction by the WASM
 * `$fungi_round_f16` helper. A magnitude that rounds above 65504 becomes ±Infinity (as f16round does).
 */
export function softF16Round(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const a = Math.abs(x);
  let q: number;
  if (a < TWO_POW_M14) {
    q = TWO_POW_M24;
  } else {
    const e = Math.floor(Math.log2(a));
    // Math.log2 can be off by one near powers of two; correct it exactly.
    const exp = 2 ** e > a ? e - 1 : 2 ** (e + 1) <= a ? e + 1 : e;
    q = 2 ** (exp - 10);
  }
  const scaled = a / q;
  const fl = Math.floor(scaled);
  const diff = scaled - fl;
  const n = diff > 0.5 ? fl + 1 : diff < 0.5 ? fl : (fl % 2 === 0 ? fl : fl + 1);
  const r = n * q;
  const signed = r > F16_MAX ? Infinity : r;
  return x < 0 ? -signed : signed;
}

const hostF16Round: ((x: number) => number) | undefined =
  typeof (Math as unknown as { f16round?: unknown }).f16round === "function"
    ? (Math as unknown as { f16round: (x: number) => number }).f16round
    : undefined;

/** Round `x` to the nearest value of the given width (ties-to-even). May return ±Infinity on overflow. */
export function roundToNarrowFloat(x: number, width: NarrowFloatWidth): number {
  if (width === 32) return Math.fround(x);
  return hostF16Round !== undefined ? hostF16Round(x) : softF16Round(x);
}
