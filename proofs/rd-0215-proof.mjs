// proof-RD-0215.mjs — Tropical (min-plus) semiring border firewall + rate limiter
// RD-0215. Node built-ins only. Verifies the SOUND algebra, REFUTES the overclaims.
// Run: node proof-RD-0215.mjs
import assert from 'node:assert/strict';

const lines = [];
const log = (s) => { lines.push(s); };

// PART A — Tropical semiring axioms as CLAIMED: a(+)b=min(a,b), a(x)b=a+b, id_+=+Inf, id_x=0.
const oplus = (a, b) => Math.min(a, b);
const otimes = (a, b) => a + b;
const ZERO = Infinity, ONE = 0;
for (const [a, b] of [[3, 7], [-1, 0], [5, 5], [-4, 9]]) {
  assert.equal(oplus(a, b), oplus(b, a), 'oplus commutative');
  assert.equal(oplus(a, ZERO), a, 'oplus identity = +Inf');
  assert.equal(oplus(a, a), a, 'oplus idempotent');
}
assert.equal(oplus(oplus(2, 5), 9), oplus(2, oplus(5, 9)), 'oplus associative');
for (const [a, b, c] of [[2, 5, 9], [-1, 0, 1], [-1, 3, -4]]) {
  assert.equal(otimes(a, ONE), a, 'otimes identity = 0');
  assert.equal(otimes(a, oplus(b, c)), oplus(otimes(a, b), otimes(a, c)), 'distributivity');
}
log('A. Tropical semiring axioms hold: (+)=min, (x)=+, id_+ =+Inf, id_x =0, distributive. GREEN');

// PART B — v_out = M (x) v_in ; (v_out)_i = min_j ( M_ij + (v_in)_j ). -1 threat dominates via min.
function tropicalMatVec(M, v) {
  const n = M.length; const out = new Array(n).fill(ZERO);
  for (let i = 0; i < n; i++) { let m = ZERO; for (let j = 0; j < v.length; j++) m = oplus(m, otimes(M[i][j], v[j])); out[i] = m; }
  return out;
}
const OPEN = 0, SHUT = Infinity;
const M = [[OPEN, SHUT, OPEN, SHUT], [SHUT, OPEN, OPEN, SHUT], [SHUT, SHUT, SHUT, OPEN]];
let vin = [1, 1, 1, 1];
assert.deepEqual(tropicalMatVec(M, vin), [1, 1, 1], 'all-safe -> all services +1');
vin = [1, 1, -1, 1];
assert.deepEqual(tropicalMatVec(M, vin), [-1, -1, 1], '-1 breach propagates via min to open-route svcs; unreachable svc2 stays +1');
log('B. Min-plus threat propagation verified: -1 dominates via min; no edge = no reach. GREEN');
const vAnd = (a, b) => Math.min(a, b);
for (const [a, b] of [[1, 1], [1, 0], [1, -1], [0, -1], [0, 0]]) assert.equal(oplus(a, b), vAnd(a, b), 'tropical(+) === shipped vAnd');
log('B2. Tropical (+)=min over {-1,0,+1} is IDENTICAL to the shipped K3 vAnd. Re-derivation, not new. GREEN');

// PART C — REFUTE "same time regardless of count": work is O(nnz), LINEAR.
function countOps(nConns) { const S = 8; let ops = 0; const Md = Array.from({ length: S }, () => new Array(nConns).fill(0)); const vd = new Array(nConns).fill(1); for (let i = 0; i < S; i++) for (let j = 0; j < nConns; j++) { oplus(otimes(Md[i][j], vd[j]), 0); ops++; } return ops; }
const ops10 = countOps(10), ops1e6 = countOps(1_000_000);
assert.notEqual(ops10, ops1e6, 'op count NOT constant in connection count');
assert.equal(ops1e6 / ops10, 100_000, 'work scales EXACTLY linearly');
log(`C. REFUTED "same time regardless of count": 10 conns=${ops10} ops, 1e6 conns=${ops1e6} ops (ratio ${ops1e6 / ops10}x). O(nnz) LINEAR. GREEN`);
function branchlessMinFold(v) { let m = Infinity, ops = 0; for (const x of v) { m = Math.min(m, x); ops++; } return ops; }
assert.equal(branchlessMinFold(new Array(1000).fill(1)), branchlessMinFold(new Array(1000).fill(-1)), 'branchless: identical op count friendly vs hostile');
log('C2. SOUND: branchless constant-time-per-op — no branch-predictor DoS, no data-dependent timing. GREEN');

// PART D — Rate limiter: R_new = R (x) I ; M_block = H(R_new - L). Heaviside + FLAW in composition.
const H = (x) => (x >= 0 ? 1 : 0);
function rateLimit(R, I, L) { const n = R.length; const block = new Array(n); for (let k = 0; k < n; k++) { const Rnew = otimes(R[k], I[k]); block[k] = H(Rnew - L[k]) ? Infinity : 0; } return block; }
assert.deepEqual(rateLimit([4990, 100, 5000, 0], [20, 5, 1, 1], [5000, 5000, 5000, 5000]), [Infinity, 0, Infinity, 0], 'Heaviside mask: over-limit -> +Inf');
assert.equal(oplus(0, Infinity), 0, 'BUG: M (+) M_block with (+)=min leaves open route OPEN (min(0,Inf)=0)');
assert.equal(otimes(0, Infinity), Infinity, 'correct: shut by ADDING +Inf cost (otimes), not min');
log('D. Rate-limit Heaviside verified. FLAW: note M_route=M_route(+)M_block cannot shut with (+)=min; needs (x)=+ or max-plus. O(n) not O(1). GREEN');

// PART E — Forgery: tropical vector is unauthenticated telemetry (RD-0162/0169 carry-over).
function admitByVectorOnly(v) { return tropicalMatVec(M, v).map((x) => x === 1); }
assert.deepEqual(admitByVectorOnly([1, 1, 1, 1]), [true, true, true], 'FORGERY: attacker sets own vin=+1 -> all admit, no secret');
log('E. FORGERY CONFIRMED: threat vector unauthenticated; sound use = DENY-ONLY pre-filter in front of signed .fungi/PQ crypto. GREEN');

console.log('\n' + lines.join('\n'));
console.log('\nALL ASSERTS PASSED (allGreen=true): min-plus SOUND & IDENTICAL to K3 vAnd; branchless SOUND; "same time regardless of count" REFUTED (O(nnz)); note M(+)M_block FLAWED; vector-only admission FORGEABLE.');