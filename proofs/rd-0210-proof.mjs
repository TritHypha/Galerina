// proof-RD-0210.mjs
// HEAD RD-0210 — Signed Laplacian index (-1 = repulsion; spectral clustering)
// Claims under test (from notes/77-mesh-r-d-06.md):
//   (A) L_bar = D_bar - A   with tri-state A and D_bar = diag of ABSOLUTE degrees.  [SOUND MATH — verify it]
//   (B) -1 acts as a repulsive force -> smallest signed-Laplacian eigenvector separates clusters. [SOUND MATH — verify it]
//   (C) "instantly shatter the dataset into clusters using a single eigenvector calculation" == O(1),
//       "zero-traversal clustering", cost "mathematically disconnected from the size of the database". [OVERCLAIM — refute it]
//
// Method: build a signed graph with two internally-attractive (+1) communities joined by
// repulsive (-1) edges. Compute the signed Laplacian, verify the definitional identity,
// verify it is symmetric positive-semidefinite, and use its smallest-eigenvalue eigenvector
// to actually recover the clusters. Then INSTRUMENT the eigensolver: count the floating-point
// operations the power/deflation iteration performs as N grows, and fit the growth order.
// If clustering were O(1) ("single eigenvector = one op, size-independent"), the op-count
// would be flat. Assert it is NOT flat: it grows super-linearly (>= ~N^2 for this dense
// symmetric solve), refuting the O(1)/"zero-traversal"/"disconnected from size" claim.
//
// node built-ins only.

import assert from 'node:assert';

// ---------- tiny dense linear algebra (instrumented) ----------
let FLOPS = 0;                       // global multiply-add counter
const mul = (a, b) => { FLOPS++; return a * b; };
const madd = (acc, a, b) => { FLOPS++; return acc + a * b; };

function matVec(M, v) {              // O(n^2)
  const n = M.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s = madd(s, M[i][j], v[j]);
    out[i] = s;
  }
  return out;
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s = madd(s, a[i], b[i]); return s; };
const norm = (a) => Math.sqrt(dot(a, a));
function scale(a, k) { return a.map(x => mul(x, k)); }
function sub(a, b) { return a.map((x, i) => x - b[i]); }

// Power iteration on (shift*I - L) to get the SMALLEST eigenpairs of L, with deflation.
function smallestEigenvectors(L, k, shift, iters = 200) {
  const n = L.length;
  const B = L.map((row, i) => row.map((x, j) => (i === j ? shift : 0) - x));
  const found = [];
  for (let e = 0; e < k; e++) {
    let v = new Array(n).fill(0).map(() => Math.random() - 0.5);
    for (let it = 0; it < iters; it++) {
      for (const f of found) { const c = dot(v, f); v = sub(v, scale(f, c)); }
      let w = matVec(B, v);
      const nw = norm(w);
      if (nw < 1e-12) break;
      v = scale(w, 1 / nw);
    }
    for (const f of found) { const c = dot(v, f); v = sub(v, scale(f, c)); }
    const nv = norm(v); v = scale(v, 1 / nv);
    found.push(v);
  }
  return found;
}

// ---------- build a signed 2-community graph ----------
function buildSignedGraph(n) {
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const half = n >> 1;
  const comm = (i) => (i < half ? 0 : 1);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = comm(i) === comm(j) ? +1 : -1;
      A[i][j] = w; A[j][i] = w;
    }
  }
  return { A, comm };
}

// Signed Laplacian:  L_bar = D_bar - A, D_bar = diag( sum_j |A_ij| ).  (claim A)
function signedLaplacian(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let dabs = 0;
    for (let j = 0; j < n; j++) { dabs += Math.abs(A[i][j]); L[i][j] = -A[i][j]; }
    L[i][i] = dabs - A[i][i];
  }
  return L;
}

// ---------- (A) verify the definitional identity L = D_bar - A ----------
{
  const { A } = buildSignedGraph(8);
  const L = signedLaplacian(A);
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let dabs = 0; for (let j = 0; j < n; j++) dabs += Math.abs(A[i][j]);
    for (let j = 0; j < n; j++) {
      const expect = (i === j ? dabs : 0) - A[i][j];
      assert.strictEqual(L[i][j], expect, `L=D_bar-A must hold at (${i},${j})`);
    }
    for (let j = 0; j < n; j++) assert.strictEqual(L[i][j], L[j][i], 'L must be symmetric');
  }
  for (let t = 0; t < 50; t++) {
    const x = Array.from({ length: n }, () => Math.random() - 0.5);
    const Lx = matVec(L, x);
    const q = dot(x, Lx);
    assert.ok(q >= -1e-9, `signed Laplacian must be PSD, got x^T L x = ${q}`);
  }
  console.log('[A] L_bar = D_bar - A holds exactly; L is symmetric PSD  -> SOUND MATH CONFIRMED');
}

// ---------- (B) verify signed-Laplacian spectral clustering recovers the two clusters ----------
{
  const n = 40;
  const { A, comm } = buildSignedGraph(n);
  const L = signedLaplacian(A);
  let shift = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.abs(L[i][j]); shift = Math.max(shift, s); }
  const vecs = smallestEigenvectors(L, 2, shift);
  const clusterVec = vecs[0];
  let agree = 0;
  const s0 = Math.sign(clusterVec[0]);
  for (let i = 0; i < n; i++) {
    const pred = (Math.sign(clusterVec[i]) === s0) ? 0 : 1;
    if (pred === comm(i)) agree++;
  }
  const acc = Math.max(agree, n - agree) / n;
  assert.ok(acc >= 0.95, `signed-Laplacian eigenvector should split the graph into its 2 communities, got acc=${acc}`);
  console.log(`[B] signed-Laplacian smallest eigenvector recovers clusters at ${(acc*100).toFixed(0)}% accuracy -> "-1 repels into clusters" CONFIRMED`);
}

// ---------- (C) REFUTE "O(1) / zero-traversal / disconnected from database size" ----------
{
  const sizes = [16, 32, 64, 128, 256];
  const results = [];
  for (const n of sizes) {
    const { A } = buildSignedGraph(n);
    const L = signedLaplacian(A);
    let shift = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.abs(L[i][j]); shift = Math.max(shift, s); }
    FLOPS = 0;
    smallestEigenvectors(L, 2, shift, 30);
    results.push({ n, flops: FLOPS });
  }
  console.log('\n[C] eigensolver cost vs database size N (single Fiedler calc, fixed iterations):');
  for (const r of results) console.log(`    N=${String(r.n).padStart(4)}   FLOPs=${r.flops}`);

  const first = results[0], last = results[results.length - 1];
  const nRatio = last.n / first.n;
  const workRatio = last.flops / first.flops;
  assert.ok(workRatio > 2, `O(1) claim REFUTED: work must grow with N (workRatio=${workRatio.toFixed(1)} for ${nRatio}x nodes)`);

  const xs = results.map(r => Math.log(r.n));
  const ys = results.map(r => Math.log(r.flops));
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const p = num / den;
  console.log(`\n    empirical order:  FLOPs ~ N^${p.toFixed(2)}  (matVec is O(N^2)/iter; full eigensolve to convergence is O(N^3) dense / O(nnz*iters) iterative)`);
  assert.ok(p > 1.5, `single-eigenvector clustering is at least O(N^2) per iteration, NOT O(1) — got N^${p.toFixed(2)}`);
  assert.ok(p < 2.5, `per-iteration cost is ~O(N^2) as expected (dense matVec) — got N^${p.toFixed(2)}`);

  console.log('\n[C] VERDICT: "instant / single eigenvector = O(1) / zero-traversal / disconnected from size" is REFUTED.');
  console.log('    Real cost: dense eigensolve O(N^3); iterative (Lanczos/power) O(nnz * iters).');
  console.log('    Constant-factor benefit at best (SIMD/two-bit-pack); the ORDER is unchanged. Matches RD-0157/0166.');
}

console.log('\nALL ASSERTIONS PASSED');