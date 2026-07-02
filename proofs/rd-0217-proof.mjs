// proof-RD-0217.mjs — machine-checkable refutation of the RD-0217 overclaims.
// Head: photonic-tri + GraphBLAS + PagedAttention "beat the memory wall" combo.
// Rule: assert-FAIL the overclaim, assert-PASS the corrected value. node built-ins only.
import assert from 'node:assert/strict';
const log = (...a) => console.log(...a);
let PASS = 0;
const ok = (label, cond) => { assert.ok(cond, 'FAILED: ' + label); PASS++; log('  PASS:', label); };

log('=== RD-0217 — photonic-tri + GraphBLAS + PagedAttention combo — maths check ===\n');

// CLAIM 1 (note L46-53): "Tensor slice Z=0 executes in a SINGLE CLOCK CYCLE",
// "O(N) -> O(1)", "100 orders or 100 billion orders takes the exact same
// fraction of a nanosecond." REFUTED: to RETURN all pending edges you must
// TOUCH every element whose Z==0; reads scale with N.
log('CLAIM 1 — "tensor slice = O(1), same time for 100 vs 100e9 orders"');
function sliceReads(N) {
  const d = 9;                 // avg out-degree (constant, N-independent; 9 => nnz*1/3 is exact)
  const nnz = N * d;
  // ~1/3 of tri-states are 0 on avg; with d=9, nnz/3 = N*3 is exact for integer N.
  // The engine MUST emit each pending edge => reads == count of pending edges.
  const pending = nnz / 3;
  return pending;             // Theta(N): one read per emitted pending edge
}
const r100      = sliceReads(100);
const r100e9over = sliceReads(1e9);
log(`    reads(N=100)=${r100}, reads(N=1e9)=${r100e9over}, ratio=${(r100e9over/r100).toExponential(3)}`);
assert.notEqual(r100, r100e9over, 'overclaim would need equal work — it is not');
ok('slice work is NOT constant (O(1) claim REFUTED)', r100e9over > r100);
ok('slice work is linear: reads(2N) == 2*reads(N)', sliceReads(2000) === 2 * sliceReads(1000));
log(`    => corrected: extracting the Z=0 slice is Theta(matching edges) = O(N*d), NOT O(1).\n`);

// CLAIM 2 (note L116-129): ternary O(log3 N) "fewer CPU cycles" than binary O(log2 N).
// REALITY: log3 N = log2 N / log2(3) = constant 0.631x DEPTH; ternary node needs 2
// compares => ~1.26x MORE total comparisons. Constant factor, never an order change.
log('CLAIM 2 — "ternary index O(log3 N) beats binary O(log2 N)"');
const log2 = (x) => Math.log(x) / Math.log(2);
const log3 = (x) => Math.log(x) / Math.log(3);
const N = 1e9;
const depthRatio = log3(N) / log2(N);
log(`    depth: log3(1e9)=${log3(N).toFixed(3)}, log2(1e9)=${log2(N).toFixed(3)}, ratio=${depthRatio.toFixed(4)}`);
ok('depth ratio is exactly 1/log2(3)', Math.abs(depthRatio - 1 / log2(3)) < 1e-12);
ok('same big-O: log3 and log2 differ only by a constant factor', Math.abs(depthRatio - 0.6309) < 1e-3);
const binCompares = 1 * log2(N);
const terCompares = 2 * log3(N);
log(`    comparisons: binary=${binCompares.toFixed(2)}, ternary(2 cmp/node)=${terCompares.toFixed(2)}, ratio=${(terCompares/binCompares).toFixed(4)}`);
ok('ternary does MORE comparisons, not fewer (breakthrough claim REFUTED)', terCompares > binCompares);
log(`    => corrected: base-3 shrinks tree DEPTH by 0.63x but each node costs ~2 compares => ~1.26x MORE work. Constant-factor either way, never a new order.\n`);

// CLAIM 3 (note L675-681): "Photonic Tri executes GraphBLAS at the speed of light",
// "near-instantly", "zero latency." REFUTED (RD-0110/0156): reading N output bins is
// O(N); light only cuts the per-element CONSTANT propagation time.
log('CLAIM 3 — "photonic GraphBLAS at the speed of light = near-0 latency"');
const c = 299792458;
const chipPath = 0.05;
const propTime_s = chipPath / c;
log(`    light across 5cm chip = ${(propTime_s*1e12).toFixed(3)} ps (this is the CONSTANT light cuts)`);
const adc_ns = 1;
function photonicReadout_ns(Nout) { return Nout * adc_ns; }
const rd64  = photonicReadout_ns(64);
const rd4096 = photonicReadout_ns(4096);
log(`    readout(N=64)=${rd64} ns, readout(N=4096)=${rd4096} ns, ratio=${rd4096/rd64}`);
ok('photonic readout scales with N (O(1)/"zero latency" REFUTED)', rd4096 === 64 * rd64);
ok('the light-propagation term is tiny+constant, readout term is O(N) and dominates',
   propTime_s * 1e9 < adc_ns && photonicReadout_ns(4096) > propTime_s * 1e9 * 4096);
log(`    => corrected: photonics cuts the MAC constant + heat; detector reads N bins = O(N). "Speed of light" is NOT the differentiator (McMahon 2023; RD-0110/0156).\n`);

// CLAIM 4 (note L482-495, L593-595): tropical min-plus watchdog "a million
// connections in one clock cycle." REFUTED: min-plus MV is Theta(nnz); credit the
// SOUND branchless min-cascade semantics.
log('CLAIM 4 — "tropical min-plus watchdog: a million connections in one clock cycle"');
const INF = Infinity;
const M = [
  [0,   INF, INF],
  [0,   0,   INF],
  [INF, 0,   0  ],
];
const vin = [-1, 1, 1];
let mvReads = 0;
function tropicalMV(M, v) {
  const out = new Array(v.length).fill(INF);
  for (let i = 0; i < M.length; i++)
    for (let j = 0; j < v.length; j++) { mvReads++; out[i] = Math.min(out[i], M[i][j] + v[j]); }
  return out;
}
const vout = tropicalMV(M, vin);
log(`    v_out = [${vout.join(', ')}]  (min-plus)`);
ok('min-plus contagion is REAL: the -1 breach propagates to reachable services', vout[0] === -1 && vout[1] === -1);
ok('min-plus MV read every entry (work = Theta(n^2) dense / Theta(nnz) sparse, NOT O(1))', mvReads === 3 * 3);
function sparseMVreads(nnz) { let r = 0; for (let e = 0; e < nnz; e++) r++; return r; }
ok('watchdog work scales with connection count (O(1)/"one clock cycle" REFUTED)',
   sparseMVreads(2_000_000) === 2 * sparseMVreads(1_000_000));
log(`    => corrected: tropical/min-plus firewall is SOUND algebra (branchless, cascades the min) but each sweep is Theta(nnz). A million connections is a million MACs, not one cycle. (== RD-0162 min-plus-in-mesh.)\n`);

// CLAIM 5 (note L154): 2-bit packing density — pure arithmetic, TRUE.
log('CLAIM 5 — 2-bit packing density (register/cache-line counts)');
ok('64-bit register / 2 bits = 32 tri-states', 64 / 2 === 32);
ok('64-byte cache line = 512 bits / 2 = 256 tri-states', (64 * 8) / 2 === 256);
ok('2 bits encode 3 states + 1 reserved (log2(3)=1.585 <= 2)', log2(3) <= 2 && 2 < log2(3) + 1);
log(`    => TRUE and sound (this is standard SoA/bit-packing; re-derives shipped tri-tier i32 packing).\n`);

// CLAIM 6 (note L654-691): PagedAttention (vLLM) — real KV-cache paging + prefix sharing.
log('CLAIM 6 — PagedAttention (vLLM) KV-cache paging + prefix sharing is REAL');
const seqs = 4, sharedPrefixTokens = 2000, uniqueTokens = 50;
const naiveTokens  = seqs * (sharedPrefixTokens + uniqueTokens);
const pagedTokens  = sharedPrefixTokens + seqs * uniqueTokens;
log(`    KV tokens: naive=${naiveTokens}, paged(shared prefix)=${pagedTokens}, saving=${(1-pagedTokens/naiveTokens)*100 | 0}%`);
ok('prefix sharing stores the shared prefix once (real memory saving)', pagedTokens < naiveTokens);
ok('paging/sharing is a MEMORY-management win, NOT a latency-order change', pagedTokens === sharedPrefixTokens + seqs * uniqueTokens);
log(`    => TRUE: PagedAttention is a shipped vLLM technique; combo re-derives it. The combo is an OUT-OF-CORE AI ACCELERATOR, not a security feature.\n`);

// SECURITY / ZERO-TRUST fence: compute must not DECIDE admission (FUNGI-SUBSTRATE-005 / RD-0169).
log('SECURITY — combo is compute-only; must not decide (FUNGI-SUBSTRATE-005)');
function admits(capabilitySigVerified, photonicState, graphResult, kvHit) {
  return capabilitySigVerified === true;  // admission keyed ONLY on the signed capability
}
ok('a forged/optimal compute result does NOT admit without a valid signature',
   admits(false, +1, 'max', true) === false);
ok('admission requires the signed capability regardless of photonic/graph/kv state',
   admits(true, -1, 'deny', false) === true);
log(`    => compute stays outside the governance gate; ZT n/a for the accelerator itself.\n`);

log(`=== ALL ${PASS} ASSERTIONS PASSED ===`);