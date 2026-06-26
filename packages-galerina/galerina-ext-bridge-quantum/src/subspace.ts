// subspace.ts — the pre-spawn memory governor for the governed ffsim bridge.
//
// PURE TypeScript, zero deps, no ffsim needed. This is the gate that runs BEFORE we
// trust (or even spawn) the out-of-process worker — the precise, honest replacement for
// note 33's hand-wavy "discard non-affinity states". ffsim restricts the state vector to
// the fixed-particle, fixed-spin subspace; its size is an exact binomial product, and the
// implied `complex128` memory is the real resource ceiling (design §6).
//
// FAIL-CLOSED: any value that cannot be represented exactly as a JS safe integer is
// returned as `Infinity` — so the limit gate treats an un-representable (astronomically
// large) subspace as "too large" and rejects the job, never as a wrapped/garbage number.

/** Largest exact integer in IEEE-754 double (2^53 − 1). */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * Exact binomial coefficient C(n, k) via the multiplicative form, using the smaller of
 * k / (n−k) for fewer iterations. Returns:
 *   • 0   when k is out of [0, n]
 *   • NaN when n or k is not a non-negative integer
 *   • Infinity when the result would exceed MAX_SAFE (fail-closed "too large")
 * The transient product is overflow-guarded so precision is never silently lost.
 */
export function binomial(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) return NaN;
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);     // C(n,k) = C(n,n-k)
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    const mult = n - kk + i;
    // Guard the transient product BEFORE it can lose precision → fail-closed.
    if (result > MAX_SAFE / mult) return Infinity;
    result = (result * mult) / i;    // integer-valued at every step (C(n, i) is integer)
  }
  const rounded = Math.round(result); // tidy any float drift from the divisions
  return rounded > MAX_SAFE ? Infinity : rounded;
}

/**
 * ffsim's fixed-particle FCI subspace dimension:
 *   dim = C(norb, nAlpha) · C(norb, nBeta)
 * `Infinity` if either factor or the product exceeds MAX_SAFE (fail-closed).
 */
export function subspaceDim(norb: number, nelec: readonly [number, number]): number {
  const a = binomial(norb, nelec[0]);
  const b = binomial(norb, nelec[1]);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  if (b !== 0 && a > MAX_SAFE / b) return Infinity;
  return a * b;
}

/**
 * Peak state-vector bytes: `complex128` is 16 bytes per amplitude, so 16 · dim.
 * (Trotter / evolution need an additional working-set multiplier K — applied by the
 * caller's `max_memory` ceiling, not here.) `Infinity` on overflow (fail-closed).
 */
export function stateVectorBytes(norb: number, nelec: readonly [number, number]): number {
  const dim = subspaceDim(norb, nelec);
  if (Number.isNaN(dim)) return NaN;
  if (!Number.isFinite(dim) || dim > MAX_SAFE / 16) return Infinity;
  return 16 * dim;
}
