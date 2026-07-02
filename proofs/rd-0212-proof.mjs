// proof-RD-0212.mjs — Ternary space partitioning O(log3 N) vs binary B-tree O(log2 N)
// Claim (77-mesh-r-d-06.md L116-129): splitting geometry into thirds gives O(log3 N)
// depth, so "a Tri-index mathematically requires FEWER CPU cycles to hit the bottom of
// the tree than a binary index on a billion nodes."
//
// THE CLASSIC FALLACY. Depth is shallower by 1/log2(3) ~= 0.63x. But each ternary node
// needs ~2 comparisons (is x < lo? is x < hi? -> 3 branches) vs 1 comparison per binary
// node. Total comparisons = comparisons/node * depth. We compute the REAL comparison
// count for N=1e9 both ways and ASSERT ternary >= binary (i.e. MORE work, refuting).
//
// Node built-ins only.
import assert from 'node:assert/strict';

const log2 = (x) => Math.log(x) / Math.log(2);
const log3 = (x) => Math.log(x) / Math.log(3);
const LOG2_3 = log2(3); // ~1.5849625

const results = [];
const log = (s) => { results.push(s); console.log(s); };

log('=== RD-0212: ternary index O(log3 N) vs binary O(log2 N) — comparison count ===');
log('');

// --- Part 1: the depth claim is TRUE in isolation ---
// A perfectly balanced b-ary tree over N leaves has depth ceil(log_b N).
const N = 1e9; // "a billion nodes"
const depthBinary = log2(N);
const depthTernary = log3(N);
log(`N = ${N.toExponential(0)} (a billion)`);
log(`depth binary   = log2(N)  = ${depthBinary.toFixed(4)}`);
log(`depth ternary  = log3(N)  = ${depthTernary.toFixed(4)}`);
log(`depth ratio ternary/binary = ${(depthTernary/depthBinary).toFixed(6)}  (= 1/log2(3))`);
// The note's ONLY true sub-claim: ternary tree is shallower.
assert.ok(depthTernary < depthBinary, 'ternary depth should be shallower');
assert.ok(Math.abs(depthTernary/depthBinary - 1/LOG2_3) < 1e-9, 'ratio == 1/log2(3)');
log(`OK: ternary tree IS shallower by factor 1/log2(3) = ${(1/LOG2_3).toFixed(6)} (~0.6309x). [the only true part]`);
log('');

// --- Part 2: cost per node. Binary = 1 compare/level. Ternary 3-way = 2 compares/level ---
// To pick one of 3 children you must locate x among 2 split keys: that is a 3-way branch,
// which needs 2 comparisons in the worst case (compare to low key, then to high key).
// (A binary search on k sorted split keys per node needs ceil(log2(k+1)) compares; for a
// standard ternary node k=2 splits -> ceil(log2(3)) = 2 compares. Same answer.)
const cmpPerNodeBinary = 1;
const cmpPerNodeTernary = 2;

const totalCmpBinary  = cmpPerNodeBinary  * depthBinary;   // 1 * log2(N)
const totalCmpTernary = cmpPerNodeTernary * depthTernary;  // 2 * log3(N)

log('Comparisons to reach the bottom (compares/node * depth):');
log(`  binary  = ${cmpPerNodeBinary} * log2(N)  = ${totalCmpBinary.toFixed(4)} comparisons`);
log(`  ternary = ${cmpPerNodeTernary} * log3(N)  = ${totalCmpTernary.toFixed(4)} comparisons`);

// Closed form: 2*log3(N) = 2/log2(3) * log2(N) = (2/1.585)*log2(N) ~= 1.2619 * log2(N)
const overheadFactor = cmpPerNodeTernary / LOG2_3; // 2 / log2(3)
log(`  closed form: 2*log3(N) = (2/log2(3)) * log2(N) = ${overheadFactor.toFixed(6)} * log2(N)`);
log(`  => ternary does ${((overheadFactor-1)*100).toFixed(2)}% MORE comparison work than binary.`);
log('');

// THE REFUTATION: assert ternary comparisons >= binary comparisons (it is MORE work).
assert.ok(totalCmpTernary > totalCmpBinary,
  'REFUTED CLAIM would need ternary < binary; real result is ternary > binary');
assert.ok(Math.abs(overheadFactor - 2/LOG2_3) < 1e-9);
assert.ok(overheadFactor > 1.26 && overheadFactor < 1.27, 'overhead factor ~= 1.2619');
log(`ASSERTION PASSED: ternary comparisons (${totalCmpTernary.toFixed(2)}) > binary (${totalCmpBinary.toFixed(2)}).`);
log(`  The overclaim "fewer CPU cycles" is FALSE: ternary = ${overheadFactor.toFixed(4)}x binary comparisons.`);
log('');

// --- Part 3: this generalizes — b-ary search minimizes comparisons at b=2 (or e) ---
// comparisons(b) ~= (b-1) * log_b(N) = (b-1)/ln(b) * ln(N).  Minimize g(b)=(b-1)/ln(b).
// (Using the "linear scan of b-1 split keys per node" model, the classic textbook result.)
log('General b-ary search comparison cost g(b) = (b-1)/ln(b), normalized to binary g(2):');
function g(b) { return (b - 1) / Math.log(b); }
const gb = {};
for (const b of [2,3,4,8,16]) { gb[b] = g(b); }
for (const b of [2,3,4,8,16]) {
  log(`  b=${String(b).padStart(2)}  g(b)=${gb[b].toFixed(4)}  ratio_to_binary=${(gb[b]/gb[2]).toFixed(4)}`);
}
// Under the (b-1)-compares/node linear-scan model, binary (b=2) is the minimum over integers.
assert.ok(gb[2] <= gb[3], 'binary should be <= ternary under linear-scan model');
assert.ok(gb[2] <= gb[4] && gb[2] <= gb[8] && gb[2] <= gb[16]);
log('  => under (b-1)-compares/node, binary b=2 is the MINIMUM: increasing arity ADDS comparisons.');
log('');

// Note: even under the *binary-search-within-node* model (ceil(log2(b)) compares/node),
// total = ceil(log2(b))*log_b(N) = ceil(log2(b))/log2(b) * log2(N) >= log2(N), with equality
// ONLY when b is a power of 2. b=3 gives ceil(log2 3)=2, /log2(3)=1.585 -> 1.2619x. Same 1.26x.
const ternaryBinsearchModel = Math.ceil(log2(3)) / log2(3);
log(`Cross-check (binary-search-within-node model): ternary cost = ceil(log2 3)/log2(3) = ${ternaryBinsearchModel.toFixed(4)}x binary. Same 1.26x penalty.`);
assert.ok(Math.abs(ternaryBinsearchModel - overheadFactor) < 1e-9, 'both models agree: 1.2619x');
log('');

// --- Summary ---
log('=== SUMMARY ===');
log(`TRUE:  ternary tree depth is 0.6309x binary (shallower). [note got this right]`);
log(`FALSE: "fewer CPU cycles to hit the bottom". Real comparison count = ${overheadFactor.toFixed(4)}x binary.`);
log(`VERDICT: shallower tree, MORE total comparisons. The depth win is CANCELLED and reversed`);
log(`         by the per-node cost. This is the textbook b-ary search fallacy. REFUTED.`);
log('ALL ASSERTIONS PASSED (green).');