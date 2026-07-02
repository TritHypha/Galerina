#!/usr/bin/env node
// proof-RD-0209.mjs
// HEAD RD-0209 — 3D tri-state topological tensor index; Z-axis = tri-state.
// CLAIM under test (source note 77-mesh-r-d-06.md, lines 45-53):
//   "tensor slice T[i,j,0] extracts all pending in a single clock cycle, O(1),
//    disconnected from DB size. 100 orders or 100 billion orders — same time."
// POSTURE: DON'T TRUST, CHECK + PROVE OWN MATHS. Node built-ins only.
// Asserts the REAL cost model: FAILS the O(1) overclaim, PASSES the corrected
// model: READ slice = O(#entries in slice); BUILD/MAINTAIN = O(N). Tri-state-
// as-index-dimension is a sound LAYOUT (constant factor), never an order change.
// Confirms RD-0157 (sparse O(E), SIMD modest constant) & RD-0036/0156/0166
// (O(1)/"single clock cycle" for matrix/tensor work REFUTED).

import assert from 'node:assert';

const K = { NEG: 0, ZERO: 1, POS: 2 }; // z-axis slots for -1, 0, +1

function buildTensor(N, pendingFraction, seed = 1) {
  let rng = seed >>> 0;
  const rand = () => ((rng = (1103515245 * rng + 12345) >>> 0) / 4294967296);
  const d = 8;
  const edges = new Map();
  const plane = { [K.NEG]: [], [K.ZERO]: [], [K.POS]: [] };
  let writes = 0;
  for (let i = 0; i < N; i++) {
    for (let e = 0; e < d; e++) {
      const j = (rand() * N) | 0;
      const r = rand();
      const k = r < pendingFraction ? K.ZERO : (r < pendingFraction + (1 - pendingFraction) / 2 ? K.POS : K.NEG);
      const key = i * N + j;
      if (!edges.has(key)) { edges.set(key, k); plane[k].push(key); writes += 2; }
    }
  }
  return { N, edges, plane, writes };
}

function readSlice(T, k) {
  const out = []; let touches = 0;
  for (const key of T.plane[k]) { out.push(key); touches++; }
  return { count: out.length, touches };
}

const sizes = [1000, 10000, 100000];
const pending = 1 / 3;
const builds = sizes.map((N) => ({ N, ...buildTensor(N, pending) }));

// TEST 1 — BUILD/MAINTAIN is O(N), NOT O(1).
for (let i = 1; i < builds.length; i++) {
  const ratioW = builds[i].writes / builds[i - 1].writes;
  assert.ok(ratioW > 5, `BUILD is O(N): writes x${ratioW.toFixed(2)} for a 10x N jump (NOT O(1))`);
}
assert.strictEqual(builds[2].writes <= builds[0].writes * 1.5, false, 'BUILD/MAINTAIN is NOT O(1)');

// TEST 2 — READ slice is O(#entries in slice), NOT one clock cycle.
const reads = builds.map((T) => ({ N: T.N, ...readSlice(T, K.ZERO) }));
for (let i = 1; i < reads.length; i++) {
  const ratioTouch = reads[i].touches / reads[i - 1].touches;
  assert.ok(ratioTouch > 5, `READ slice is O(#slice): touches x${ratioTouch.toFixed(2)} (NOT O(1))`);
}
for (const r of reads) { assert.ok(r.touches === r.count && r.touches > 1, 'reading pending set is not one clock cycle'); }
const biggestSliceTouches = reads[reads.length - 1].touches;
assert.ok(biggestSliceTouches > 100000, `largest slice = ${biggestSliceTouches} touches, not 1`);

// TEST 3 — z-axis layout buys a CONSTANT factor only (< 4x here).
function readSlice_flat(T, k) { let touches = 0, count = 0; for (const [, kk] of T.edges) { touches++; if (kk === k) count++; } return { count, touches }; }
const Tbig = builds[2];
const partitioned = readSlice(Tbig, K.ZERO);
const flat = readSlice_flat(Tbig, K.ZERO);
const speedup = flat.touches / partitioned.touches;
assert.ok(speedup > 1 && speedup < 4, `z-partition speedup is a bounded CONSTANT (${speedup.toFixed(2)}x, < 4), not an order change`);
assert.ok(flat.touches > partitioned.count && partitioned.touches === partitioned.count, 'both remain linear; tensor only removes the other-plane scan');

// TEST 4 — Simplicial: C(3,3)=1 face (tidy), enumeration ~C(N,3)~N^3/6 (super-linear).
function choose(n, r) { let num = 1, den = 1; for (let x = 0; x < r; x++) { num *= (n - x); den *= (x + 1); } return num / den; }
assert.strictEqual(choose(3, 3), 1, 'one 2-simplex covers the 3 fixed vertices');
assert.strictEqual(choose(100, 3), 161700, 'C(100,3)=161700 candidate 2-simplices');
assert.ok(choose(1000, 3) / choose(100, 3) > 100, 'simplex enumeration super-linear (~N^3), not O(1)');

// TEST 5 — ternary tree depth x0.6309 (constant); total comparisons NOT reduced.
const log3over2 = Math.log(2) / Math.log(3);
assert.ok(Math.abs(log3over2 - 0.6309) < 0.001, `log3 depth ${log3over2.toFixed(4)}x log2 (constant)`);
const cmpRatio = 2 * log3over2;
assert.ok(cmpRatio > 1, `ternary total comparisons ~${cmpRatio.toFixed(3)}x (>1: no free lunch)`);

console.log('=== RD-0209 PROOF: 3D tri-state tensor index / O(1) slice ===');
console.log(`T1 build writes: N=1e3 ${builds[0].writes} -> N=1e5 ${builds[2].writes} (O(N), not O(1))`);
console.log(`T2 pending slice touches: N=1e5 = ${biggestSliceTouches} (O(#slice), not 1)`);
console.log(`T3 z-partition vs flat scan speedup = ${speedup.toFixed(2)}x (bounded constant < 4)`);
console.log(`T4 2-simplex face = 1; all 2-simplices ~ C(N,3) ~ N^3/6 (super-linear)`);
console.log(`T5 ternary depth x${log3over2.toFixed(4)}; total comparisons x${cmpRatio.toFixed(3)} (>1)`);
console.log('VERDICT: O(1)/single-clock-cycle REFUTED. READ=O(#slice), BUILD=O(N).');
console.log('Tri-state-as-Z-axis = sound LAYOUT (constant factor). Re-derives RD-0157/0036/0166.');
console.log('ALL ASSERTIONS PASSED (overclaim asserted-FALSE, corrected model asserted-TRUE).');
