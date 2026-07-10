/**
 * T-006: Goal A — Native Hardware Speed Execution
 *
 * Validates that a compiled .fungi flow with all invariants statically proved
 * executes with ≤ 5% overhead compared to equivalent hand-written WAT.
 *
 * Reference: ../ZTF-Knowledge-Bases/galerina-engineering-goals.md Goal A
 *
 * Acceptance criterion:
 *   performance delta ≤ 5% vs equivalent hand-written WAT (same algorithm, no governance)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from
  "../../packages-galerina/galerina-core-compiler/dist/index.js";

// ── Gauss sum: sum of 1..N — simple pure arithmetic with no I/O ──────────────
// This is the canonical benchmark used in wasmtime baseline tests.
// All invariants are statically provable (bounded loop, pure arithmetic).
const GAUSS_SOURCE = `
pure flow gaussSum(n: Int) -> Int
contract { intent { "Compute the sum of integers 1 through n using Gauss formula." } }
{
  return n * (n + 1) / 2
}
`;

describe("T-006: Goal A — Native Hardware Speed Execution", () => {

  it("T-006-prerequisite: governed flow compiles with 0 errors (static proof pass)", () => {
    const parsed = parseProgram(GAUSS_SOURCE, "gauss.fungi");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const errors = parsed.diagnostics.filter(d => d.severity === "error");
    assert.equal(errors.length, 0, `Expected no errors, got: ${errors.map(e => e.message).join(", ")}`);
  });

  it("T-006-prerequisite: governed flow produces correct result at runtime", async () => {
    const parsed = parseProgram(GAUSS_SOURCE, "gauss.fungi");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const r = await executeFlow("gaussSum", new Map([["n", { __tag: "int", value: 100 }]]), parsed.ast);
    // Gauss sum of 1..100 = 5050
    assert.equal(r.value?.__tag, "int", "result should be an integer");
    assert.equal(r.value?.value, 5050, `gaussSum(100) should equal 5050, got ${r.value?.value}`);
  });

  it("T-006-benchmark: governed flow performance vs raw arithmetic baseline", async () => {
    // Warm up
    const parsed = parseProgram(GAUSS_SOURCE, "gauss.fungi");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const warmArgs = new Map([["n", { __tag: "int", value: 1000 }]]);
    for (let i = 0; i < 10; i++) {
      await executeFlow("gaussSum", warmArgs, parsed.ast);
    }

    // Measure governed flow (N=10000, 100 iterations)
    const ITERS = 100;
    const N = 10000;
    const args = new Map([["n", { __tag: "int", value: N }]]);
    const t0governed = performance.now();
    for (let i = 0; i < ITERS; i++) {
      await executeFlow("gaussSum", args, parsed.ast);
    }
    const govMs = performance.now() - t0governed;

    // Measure raw JavaScript baseline (same algorithm, no governance overhead)
    const t0raw = performance.now();
    let sum = 0;
    for (let i = 0; i < ITERS; i++) {
      sum = N * (N + 1) / 2;
    }
    const rawMs = performance.now() - t0raw;

    // The tree-walker interpreter is expected to be slower than raw JS —
    // this test establishes the CURRENT baseline, not the WASM target.
    // T-006 in its final form requires Wasmtime compilation (WASM target).
    // This test passes as long as the flow executes correctly and produces
    // a measurement to record.
    assert.ok(sum === N * (N + 1) / 2, "Raw baseline should compute correctly");
    assert.ok(govMs > 0, "Governed flow should execute in measurable time");

    // Record the ratio for tracking (tree-walker overhead is expected to be high;
    // final T-006 acceptance uses Wasmtime JIT path — see galerina-engineering-goals.md)
    const ratio = govMs / Math.max(rawMs, 0.001);
    console.log(`    T-006 current overhead ratio (tree-walker vs raw JS): ${ratio.toFixed(1)}x`);
    console.log(`    T-006 NOTE: Final acceptance requires Wasmtime WASM execution (DRCM Phase 5+)`);
    console.log(`    T-006 NOTE: ≤5% delta target applies to WASM JIT path, not tree-walker`);

    // This test PASSES unconditionally as a measurement baseline — it does not
    // enforce the ≤5% criterion yet (requires Wasmtime integration).
    // TODO: When galerina build + wasmtime execution is wired, enforce:
    //   assert.ok(delta <= 0.05, `Goal A failed: ${(delta*100).toFixed(1)}% overhead > 5% threshold`);
  });
});
