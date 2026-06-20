// R&D 0007 — the "routePrecision lane axis": a declared substrate `tolerance` lets a NON-sensitive
// op opt into the low-bit ternary lane, FAIL-SAFE — it never relaxes the high-sensitivity fp16 floor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { routePrecision, LOOSE_TOLERANCE } from "../dist/index.js";

// A non-air-gapped tier-3 CPU path (no FP4 hw) so a moderate op lands on the fp8 default.
const CPU = { governanceTier: 3, fp4HardwareAvailable: false, airGapped: false };

test("0007: a LOOSE tolerance routes a non-sensitive op (attention 0.6) fp8 → ternary", () => {
  const base = routePrecision("attention", CPU);
  assert.equal(base.precision, "fp8", "without tolerance, attention defaults to fp8");
  const relaxed = routePrecision("attention", { ...CPU, tolerance: 0.01 });
  assert.equal(relaxed.precision, "ternary", "a loose tolerance opts the tolerant op into the ternary lane");
  assert.match(relaxed.reason, /ternary lane/);
});

test("0007: the threshold is LOOSE_TOLERANCE — a tight tolerance does NOT relax", () => {
  assert.equal(routePrecision("attention", { ...CPU, tolerance: 1e-9 }).precision, "fp8", "default-tight tolerance → no relaxation");
  // Just below threshold stays fp8; at/above threshold relaxes.
  assert.equal(routePrecision("attention", { ...CPU, tolerance: LOOSE_TOLERANCE / 10 }).precision, "fp8");
  assert.equal(routePrecision("attention", { ...CPU, tolerance: LOOSE_TOLERANCE }).precision, "ternary");
});

test("0007 FAIL-SAFE: a loose tolerance NEVER overrides the high-sensitivity fp16 floor", () => {
  // normalization (0.9) is the floor — must stay fp16 regardless of declared tolerance.
  assert.equal(routePrecision("normalization", { ...CPU, tolerance: 0.5 }).precision, "fp16");
  assert.equal(routePrecision("output_head", { ...CPU, tolerance: 0.5 }).precision, "fp8",
    "output_head (0.8 ≥ 0.7) is too sensitive to relax — stays fp8");
});

test("0007: tolerance is opt-in — absent leaves routing byte-identical to before", () => {
  for (const op of ["embedding", "attention", "feedforward", "normalization", "output_head", "kv_cache"]) {
    const a = routePrecision(op, CPU);
    const b = routePrecision(op, { ...CPU, tolerance: undefined });
    assert.equal(a.precision, b.precision, `op ${op}: undefined tolerance must not change routing`);
  }
});

test("0007: tolerance never RAISES precision (monotone — only relaxes a tolerant op down)", () => {
  // embedding (0.2) already routes to ternary on this path; a loose tolerance can't make it less precise than ternary.
  const base = routePrecision("embedding", CPU);
  const tol = routePrecision("embedding", { ...CPU, tolerance: 0.5 });
  assert.equal(base.precision, "ternary");
  assert.equal(tol.precision, "ternary", "already-low op stays ternary (no raise, no double-step)");
});
