// subspace.ts — pre-spawn memory governor. Pure TS, fail-closed on overflow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { binomial, subspaceDim, stateVectorBytes } from "../dist/subspace.js";

test("binomial: exact known values + symmetry", () => {
  assert.equal(binomial(4, 2), 6);
  assert.equal(binomial(26, 13), 10400600);
  assert.equal(binomial(5, 0), 1);
  assert.equal(binomial(5, 5), 1);
  assert.equal(binomial(0, 0), 1);
  assert.equal(binomial(20, 3), 1140);
  assert.equal(binomial(20, 17), 1140, "C(n,k) == C(n,n-k)");
});

test("binomial: out-of-range → 0, non-integer/negative → NaN", () => {
  assert.equal(binomial(5, 6), 0, "k > n");
  assert.equal(binomial(5, -1), 0, "k < 0");
  assert.ok(Number.isNaN(binomial(4.5, 2)), "non-integer n");
  assert.ok(Number.isNaN(binomial(4, 2.5)), "non-integer k");
  assert.ok(Number.isNaN(binomial(-1, 0)), "negative n");
});

test("binomial: FAIL-CLOSED — un-representable result → Infinity (never a wrapped number)", () => {
  assert.equal(binomial(2000, 1000), Infinity);
  assert.equal(binomial(60, 30), Infinity, "C(60,30) ≈ 1.18e17 > MAX_SAFE");
  // Just below the danger zone stays exact:
  assert.ok(Number.isFinite(binomial(50, 3)), "C(50,3)=19600 is fine");
});

test("subspaceDim: C(norb,nA)·C(norb,nB), fail-closed on overflow", () => {
  assert.equal(subspaceDim(4, [2, 2]), 36);          // 6 · 6
  assert.equal(subspaceDim(26, [13, 13]), 10400600 * 10400600);
  assert.ok(subspaceDim(26, [13, 13]) <= Number.MAX_SAFE_INTEGER);
  assert.equal(subspaceDim(60, [30, 30]), Infinity, "either factor overflows → Infinity");
  assert.equal(subspaceDim(4, [5, 0]), 0, "nA > norb → factor 0");
});

test("stateVectorBytes: 16 bytes/amplitude, fail-closed", () => {
  assert.equal(stateVectorBytes(4, [2, 2]), 16 * 36);   // 576
  assert.equal(stateVectorBytes(60, [30, 30]), Infinity);
  // The design's 2 GiB example: a subspace of ~2^27 amplitudes ⇒ ~2 GiB state vector.
  const twoGiBish = stateVectorBytes(28, [14, 14]); // big but representable as a check it's finite or Infinity, never garbage
  assert.ok(twoGiBish === Infinity || (Number.isFinite(twoGiBish) && twoGiBish > 0));
});
