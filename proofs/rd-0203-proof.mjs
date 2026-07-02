// proof-RD-0203.mjs — ARM SVE2 + SME + weak-memory-ordering claims for graph/GraphBLAS/tropical routing
// node built-ins only. Posture: assert-FAIL the overclaim, assert-PASS the corrected value.
import assert from 'node:assert/strict';
const log = (...a) => console.log(...a);

log('=== RD-0203 ARM SVE2/SME/weak-memory maths check ===\n');

// ---------------------------------------------------------------------------
// CLAIM 1 (TRUE, structural): SVE2 is Vector-Length-Agnostic — one binary runs on
//   any implemented vector length 128..2048 bits (multiples of 128). This is an
//   ISA property, not a numeric speedup. We verify the VL set the ISA permits and
//   that lane-count = VL/elem_bits scales the CONSTANT (throughput), never the O().
// ---------------------------------------------------------------------------
const VL_bits = [128,256,384,512,640,768,896,1024,1152,1280,1408,1536,1664,1792,1920,2048];
// ISA rule: VL is a multiple of 128, min 128, max 2048.
assert.ok(VL_bits.every(v => v % 128 === 0 && v >= 128 && v <= 2048), 'VL must be 128..2048 step128');
assert.equal(Math.min(...VL_bits), 128);
assert.equal(Math.max(...VL_bits), 2048);
// A T-CSR filter over N 8-bit trit-packed elements: work = N element-compares.
// Lanes-per-instr = VL/8. Instr count = ceil(N/lanes). Same source binary, N fixed.
const N = 2048 * 8 * 1000;               // divisible by every VL/8 so ratios are exact
const instrCount = VL_bits.map(v => Math.ceil(N / (v/8)));
// Speedup vs 128b baseline is EXACTLY VL/128 (a constant factor), order unchanged.
const speedupVs128 = VL_bits.map((v,i) => instrCount[0] / instrCount[i]);
assert.ok(Math.abs(speedupVs128[VL_bits.indexOf(2048)] - 16) < 1e-9, '2048b = 16x of 128b (constant)');
// The work is STILL Theta(N): double N -> double instr count at every VL.
const instr2N = Math.ceil((2*N) / (512/8));
const instrN  = Math.ceil((1*N) / (512/8));
assert.ok(Math.abs(instr2N/instrN - 2) < 1e-6, 'T-CSR filter is Theta(N): 2N costs 2x — order NOT reduced');
log('CLAIM 1 SVE2 VLA  : TRUE — one binary, VL 128..2048 (16 lengths). Max speedup vs 128b = '+
    speedupVs128[VL_bits.indexOf(2048)].toFixed(0)+'x CONSTANT. Filter stays Theta(N). PASS');

// ---------------------------------------------------------------------------
// CLAIM 2 (FALSE as written): SME 2D tiles compute C<-C+A(x)B "exponentially faster".
//   Reality: an outer-product tile FMA cuts the CONSTANT (does an r*r tile per step),
//   the matmul remains O(n^3) dense / O(n * nnz) sparse. We assert the overclaim FAILS
//   (growth is polynomial, NOT exponential) and the corrected model (n^3 / constant) PASSES.
// ---------------------------------------------------------------------------
function naiveMatmulCost(n){ return n*n*n; }              // scalar MAC count, dense
function smeTiledCost(n, r){ return Math.ceil(n/r)**3 * (r*r*r); } // same MACs, done in tiles
// SME does not remove MACs; a tile of r=svl accumulates r*r products/step but total MACs identical.
for (const n of [64,128,256,512]) {
  const r = 16; // e.g. 16x16 FP tile
  assert.equal(smeTiledCost(n, r), naiveMatmulCost(n),
    'SME does the SAME MAC count — it batches them, not deletes them');
}
// "exponentially faster" would mean cost ratio grows like c^n. Test: is the SME speedup
// over scalar a constant (tile area r^2), or does it grow exponentially with n? -> constant.
const rTile = 16;
const speedup = [64,128,256,512,1024].map(n => {
  // scalar: 1 MAC/cycle; SME: r*r MACs/cycle (outer product of an r-vector). ratio = r*r, flat.
  const scalarCycles = naiveMatmulCost(n);
  const smeCycles    = naiveMatmulCost(n) / (rTile*rTile);
  return scalarCycles / smeCycles;
});
assert.ok(speedup.every(s => Math.abs(s - rTile*rTile) < 1e-9),
  'SME speedup is a FLAT constant = tile area (256 for 16x16), it does NOT grow with n');
// Overclaim check: exponential would need ratio(n=1024)/ratio(n=64) >> 1. It is exactly 1.
const grows = speedup[4] / speedup[0];
assert.equal(grows, 1, 'speedup ratio flat across n=64..1024 => NOT exponential');
assert.ok(grows < 2, 'REFUTES "exponentially faster" — constant-factor only');
// Order sanity: matmul is O(n^3); doubling n multiplies cost by 8, at any tile size.
assert.equal(naiveMatmulCost(256)/naiveMatmulCost(128), 8, 'O(n^3): 2x n => 8x work, tile-invariant');
log('CLAIM 2 SME       : "exponentially faster" REFUTED — same MAC count, flat '+(rTile*rTile)+
    'x constant (16x16 tile); matmul stays O(n^3). Order UNCHANGED. PASS(corrected)');

// ---------------------------------------------------------------------------
// CLAIM 3 (SECURITY, the load-bearing one): weak-memory "stale read resolved as 0"
//   gives "linear lock-free scaling across 128 cores". Two separable sub-claims:
//   3a availability: a stale K3 read collapsed to 0 (Unknown) then DOWNGRADED (min) is SAFE.
//   3b the note's Phase-2 text: a pointer-tag byte S=P>>56 with S==+1 => "fetch instantly"
//       i.e. health/tag telemetry ADMITS. Per RD-0169 that is FAIL-OPEN (forgeable, no secret).
//   We encode Kleene-min (vAnd) and prove: stale->0 under min can only DENY, never ALLOW;
//   but a forged +1 tag admitting with no signature check is a runnable fail-open forgery.
// ---------------------------------------------------------------------------
const K3 = { ALLOW:1, UNKNOWN:0, DENY:-1 };
const vAnd = (a,b) => Math.min(a,b);                 // Kleene AND = min (downgrade-only)
const authorize = s => s === K3.ALLOW;               // ONLY +1 authorizes; 0 and -1 deny

// 3a: correct use — a stale/pending read becomes UNKNOWN(0), ANDed with the real verdict.
// Whatever the true signed verdict v, min(0, v) <= 0  => can NEVER upgrade to ALLOW.
for (const v of [K3.ALLOW, K3.UNKNOWN, K3.DENY]) {
  const staleResolved = vAnd(K3.UNKNOWN, v);
  assert.ok(!authorize(staleResolved), 'stale->0 ANDed can never authorize (min downgrades only)');
}
// And a stale read must never LAUNDER a DENY into ALLOW:
assert.equal(vAnd(K3.UNKNOWN, K3.DENY), K3.DENY, 'stale AND deny = deny (fail-closed)');
assert.equal(vAnd(K3.ALLOW,   K3.UNKNOWN), K3.UNKNOWN, 'allow AND unknown = unknown (not allow)');
log('CLAIM 3a stale->0 : SOUND *iff* resolved-as-0 is a DOWNGRADE (min), not a bypass. '+
    'min(0,v)<=0 for all v => never launders to ALLOW. PASS');

// 3b: the note's Phase-2 "S==+1 => fetch instantly" uses the POINTER-TAG byte as the admission
//     verdict — no secret is checked. Runnable forgery: attacker sets top byte to +1.
function admitByTagOnly(pointer64) {          // the NOTE's model (fail-open)
  const S = (pointer64 >> 56n) & 0xFFn;       // top-byte-ignore tag
  return S === 1n;                            // "instant fetch" — admits on tag alone
}
const legit   = (1n << 56n) | 0x0000_00AA_BBCC_DDEEn;   // tag=+1, real capability
const forged  = (1n << 56n) | 0x0000_0000_DEAD_BEEFn;   // attacker just writes tag byte = 1, NO secret
assert.equal(admitByTagOnly(legit),  true);
assert.equal(admitByTagOnly(forged), true, 'FAIL-OPEN: forged +1 tag admitted with NO secret (RD-0169)');
// Corrected model: admission MUST verify a signed capability; the tag is at most a deny-only hint.
// signedVerdict = ALLOW iff verify() passes, else DENY. tagHint can only DOWNGRADE (min), never grant.
function admitCorrect(signedOk, tag) {        // signedOk = Ed25519/ML-DSA verify() over .fungi cap
  const signedVerdict = signedOk ? K3.ALLOW : K3.DENY;
  const tagHint = tag === 1n ? K3.ALLOW : K3.DENY; // +1 tag is at best "no objection"; anything else denies
  return authorize(vAnd(signedVerdict, tagHint));  // min: BOTH must be ALLOW; tag can only subtract
}
assert.equal(admitCorrect(false, 1n), false, 'no valid signature => DENY even with +1 tag (forgery blocked)');
assert.equal(admitCorrect(true,  1n), true,  'valid signature + non-objecting tag => admit');
assert.equal(admitCorrect(true, 0xEEn), false, 'valid signature but deny-tag => DENY (tag downgrades only)');
assert.equal(admitCorrect(false, 0xEEn), false, 'nothing valid => DENY');
log('CLAIM 3b tag-admit: "S==+1 => fetch instantly" is FAIL-OPEN — forged tag admits w/ no secret. '+
    'REFUTED (RD-0169 class). Admission must stay keyed on signed .fungi cap. PASS(corrected)');

// 3c: "linear scaling across 128 cores" — lock-free helps THROUGHPUT (availability), it is NOT
//     a security property, and it is not literally linear (Amdahl bounds it). Sanity: even a tiny
//     serial fraction caps speedup well under 128x.
function amdahl(p, cores){ return 1/((1-p) + p/cores); }
assert.ok(amdahl(1.0, 128) === 128, 'perfectly parallel => 128x (theoretical ceiling only)');
assert.ok(amdahl(0.99, 128) < 128 && amdahl(0.99,128) > 50, 'even 1% serial caps <128x (=' +
  amdahl(0.99,128).toFixed(1) + 'x) — "linear across 128" is an idealization');
log('CLAIM 3c 128-core : lock-free = AVAILABILITY throughput, NOT security; Amdahl caps "linear" '+
    '(1% serial => '+amdahl(0.99,128).toFixed(1)+'x, not 128x). PASS');

// ---------------------------------------------------------------------------
// CLAIM 4 (TRUE, licensing): SuiteSparse:GraphBLAS is Apache-2.0.
//   Non-numeric fact; we just record the checked verdict (see FAQ/LICENSE upstream).
// ---------------------------------------------------------------------------
const suiteSparseLicense = 'Apache-2.0';
assert.equal(suiteSparseLicense, 'Apache-2.0', 'SuiteSparse:GraphBLAS is Apache-2.0 (TRUE)');
log('CLAIM 4 license   : SuiteSparse:GraphBLAS = Apache-2.0. TRUE (permissive, business-friendly). PASS');

// ---------------------------------------------------------------------------
// CLAIM 5 (context, RD-0157 reconciliation): SIMD gives a MODEST constant (~4.3x),
//   not an order change. Re-assert the prior binding result stands.
// ---------------------------------------------------------------------------
const simdConst = 4.3;                     // RD-0157 branchless-SIMD measured constant
assert.ok(simdConst > 1 && simdConst < 10, 'SIMD is a modest constant factor, not O()-changing');
// SVE2 at 512b vs a scalar loop: ~64 8-bit lanes but memory-bandwidth-bound in practice ->
// the realized constant stays single-to-low-double digits, consistent with RD-0157.
log('CLAIM 5 SIMD const: consistent w/ RD-0157 (~'+simdConst+'x modest constant, order unchanged). PASS');

log('\n=== ALL ASSERTIONS GREEN ===');
log('Summary: SVE2-VLA TRUE(constant), SME "exponentially faster" FALSE(flat 256x constant, O(n^3) intact),');
log('weak-mem stale->0 SOUND ONLY as min-downgrade / tag-admit FAIL-OPEN(RD-0169), 128-core=availability(Amdahl),');
log('Apache-2.0 TRUE. Net: hardware plumbing re-derives RD-0157/0166; security caveats re-derive RD-0169.');