// consensusTritN + ConfidenceVerdict (notes/62 §1/§3 net-new). consensusTritN generalises consensusTrit
// to N votes (sign-of-sum, tie→INDETERMINATE); collapseConfidence fail-safe-collapses a probability
// vector to a Verdict, authorising ALLOW only on a confident strict-argmax allow (No-Coercion preserved).
import { test } from "node:test";
import assert from "node:assert/strict";
import { consensusTritN, collapseConfidence, consensusTrit, Verdict } from "../dist/index.js";

const TRITS = [-1, 0, 1];

test("consensusTritN: no-divergence oracle — equals the 3-input consensusTrit over all 27 triples", () => {
  for (const a of TRITS) for (const b of TRITS) for (const c of TRITS) {
    assert.equal(consensusTritN([a, b, c]), consensusTrit(a, b, c), `triple ${a},${b},${c}`);
  }
});

test("consensusTritN: sign-of-sum; a tie and the empty set are INDETERMINATE (fail-closed)", () => {
  assert.equal(consensusTritN([1, 1, -1, 1, -1]), Verdict.ALLOW);   // sum +1
  assert.equal(consensusTritN([-1, -1, 1]), Verdict.DENY);          // sum -1
  assert.equal(consensusTritN([1, -1]), Verdict.INDETERMINATE);     // tie
  assert.equal(consensusTritN([0, 0, 0]), Verdict.INDETERMINATE);   // all unknown
  assert.equal(consensusTritN([]), Verdict.INDETERMINATE);          // empty → deny-by-default
});

test("consensusTritN: a non-trit vote is fail-closed (throws)", () => {
  assert.throws(() => consensusTritN([1, 2, -1]), /non-trit/);
});

test("collapseConfidence: ALLOW only on a confident strict-argmax allow", () => {
  assert.equal(collapseConfidence({ pDeny: 0.1, pUnknown: 0.2, pAllow: 0.7 }), Verdict.ALLOW);
  assert.equal(collapseConfidence({ pDeny: 0.7, pUnknown: 0.2, pAllow: 0.1 }), Verdict.DENY);
});

test("collapseConfidence: ambiguous / low-confidence allow → INDETERMINATE (No-Coercion, cannot lift)", () => {
  assert.equal(collapseConfidence({ pDeny: 0.0, pUnknown: 0.6, pAllow: 0.4 }), Verdict.INDETERMINATE); // below 0.5
  assert.equal(collapseConfidence({ pDeny: 0.33, pUnknown: 0.34, pAllow: 0.33 }), Verdict.INDETERMINATE); // unknown-dominant, no confident allow/deny
  assert.equal(collapseConfidence({ pDeny: 0.0, pUnknown: 0.5, pAllow: 0.5 }), Verdict.INDETERMINATE); // tie at 0.5, not strict-argmax
  // a deny-leaning vector is DENY (not INDETERMINATE) — both deny at the boundary, fail-safe either way.
  assert.equal(collapseConfidence({ pDeny: 0.34, pUnknown: 0.33, pAllow: 0.33 }), Verdict.DENY);
});

test("collapseConfidence: garbage / non-normalised vectors fail safe to INDETERMINATE", () => {
  assert.equal(collapseConfidence({ pDeny: NaN, pUnknown: 0, pAllow: 1 }), Verdict.INDETERMINATE);
  assert.equal(collapseConfidence({ pDeny: -0.1, pUnknown: 0.2, pAllow: 0.9 }), Verdict.INDETERMINATE); // out of range
  assert.equal(collapseConfidence({ pDeny: 0.5, pUnknown: 0.5, pAllow: 0.9 }), Verdict.INDETERMINATE); // Σ ≠ 1
});

test("collapseConfidence: an arbitrarily-confident allow never beats normalisation/argmax checks (fail-safe)", () => {
  // Even pAllow=1 is rejected if the vector is not a valid probability vector — no operand can manufacture ALLOW.
  assert.equal(collapseConfidence({ pDeny: 1, pUnknown: 1, pAllow: 1 }), Verdict.INDETERMINATE);
});
