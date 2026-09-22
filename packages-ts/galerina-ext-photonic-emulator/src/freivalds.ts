// freivalds.ts — verify-cheap, never re-execute.
//
// The photonic re-verify hook. Two checks, both ported from D1 (E5) / the spec §4 step 6:
//   1. freivaldsVerify  — for an n×n GEMM offloaded to the PPU, Freivalds' randomized
//      O(k·n²) probe catches an out-of-tolerance product with P ≥ 1 − 2⁻ᵏ, WITHOUT
//      re-running the O(n³) op. (D1/E5: 100% catch at k=20, 4.3× cheaper at n=256.)
//   2. toleranceCheck   — for a scalar voted T-MAC, the cheap O(n) exact recompute +
//      a tolerance bound on the residual. Re-checking a scalar T-MAC is itself O(n),
//      so the bound check IS the cheap verify.
//
// On failure the caller DENIES and falls back to the digital path — it does NOT re-run
// the op on photonics to "try again". Re-check is asymptotically cheaper than the
// offloaded op, so verification never holds the software back.

/** Matrix–vector product (Float64). */
function matvec(M: ReadonlyArray<Float64Array>, v: Float64Array, n: number): Float64Array {
  const o = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i]![j]! * v[j]!; o[i] = s; }
  return o;
}

/**
 * Freivalds' algorithm: is C == A·B ? Runs k random 0/1 probe vectors; returns false
 * the instant a probe disagrees beyond `tol`. P(false-accept of a wrong C) ≤ 2⁻ᵏ.
 * O(k·n²), never the O(n³) product. `rng` returns a uniform in [0,1).
 */
export function freivaldsVerify(
  A: ReadonlyArray<Float64Array>, B: ReadonlyArray<Float64Array>, C: ReadonlyArray<Float64Array>,
  n: number, k: number, tol: number, rng: () => number,
): boolean {
  const MAX_N = 4_096;
  const MAX_K = 64;
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_N) return false;
  if (!Number.isSafeInteger(k) || k < 1 || k > MAX_K) return false;
  if (!Number.isFinite(tol) || tol < 0) return false;
  if (typeof rng !== "function") return false;
  if (!isSquare(A, n) || !isSquare(B, n) || !isSquare(C, n)) return false;
  for (let t = 0; t < k; t++) {
    const r = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const bit = rng();
      if (!Number.isFinite(bit)) return false;
      r[i] = bit < 0.5 ? 0 : 1;
    }
    const Br = matvec(B, r, n), ABr = matvec(A, Br, n), Cr = matvec(C, r, n);
    for (let i = 0; i < n; i++) {
      const left = ABr[i]!;
      const right = Cr[i]!;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (Math.abs(left - right) > tol) return false;
    }
  }
  return true;
}

function isSquare(M: ReadonlyArray<Float64Array>, n: number): boolean {
  if (M.length !== n) return false;
  for (let i = 0; i < n; i++) {
    const row = M[i];
    if (!(row instanceof Float64Array) || row.length !== n) return false;
    for (let j = 0; j < n; j++) if (!Number.isFinite(row[j]!)) return false;
  }
  return true;
}

/** Cost of the Freivalds verify vs the op it guards (output-row form, O(k·n²) vs O(n³)). */
export function freivaldsVerifyCost(n: number, k: number): number { return 3 * k * n * n; }

/**
 * Scalar tolerance bound check for a voted T-MAC: is the photonic result within
 * `tol`·span of the exact digital value? span defaults to the signal dynamic range.
 * This is the cheap (O(n) exact recompute is done by the caller) re-verify for a single MAC.
 */
export function toleranceCheck(photonic: number, exact: number, tol: number, span: number): boolean {
  if (!Number.isFinite(photonic) || !Number.isFinite(exact)) return false; // fail-closed on NaN/Inf
  return Math.abs(photonic - exact) <= tol * Math.max(1, span);
}
