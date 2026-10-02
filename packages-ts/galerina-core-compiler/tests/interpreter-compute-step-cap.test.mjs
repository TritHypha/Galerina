// =============================================================================
// Global compute-step cap (maxSteps) — RD-0110 #3 net-new.
//
// The interpreter already bounds EACH loop (maxIterations, 100k) and recursion DEPTH (maxCallDepth,
// 2000). But NESTED bounded loops — each loop under the per-loop cap, multiplying to a huge total
// (e.g. 100k × 100k = 10^10) — had NO total-compute bound: a runaway-compute fail-OPEN. maxSteps adds a
// deterministic GLOBAL budget (per Interpreter instance) that traps fail-closed. Default 1e9 (no
// legitimate flow reaches it). The sync fast-path defers to the async tree-walker at the same threshold.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeFlow, parseProgram, callStdlib, MAX_UNMETERED_ARRAY_RANGE } from "../dist/index.js";

// Two NESTED loops, each only `n` iterations — far below the 100k per-loop maxIterations cap. The total
// work (n²) is what a global budget must bound; the per-loop cap never fires here.
const NESTED = `pure flow nested(n: Int) -> Int contract { effects {} } {
  mut total: Int = 0
  mut i: Int = 0
  while i < n {
    mut j: Int = 0
    while j < n { total = total + 1  j = j + 1 }
    i = i + 1
  }
  return total
}`;

const run = (maxSteps, n = 20) => {
  const p = parseProgram(NESTED, "nested.fungi");
  return executeFlow("nested", new Map([["n", { __tag: "int", value: n }]]), p.ast, p.flows,
    undefined, undefined, { maxSteps }, undefined, undefined);
};

describe("interpreter global compute-step cap (maxSteps)", () => {
  it("a flow under the budget computes the correct value (no false trap)", async () => {
    const r = await run(10_000_000);
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 400, "20×20 nested increments = 400");
  });

  it("nested bounded loops exceeding the GLOBAL budget TRAP fail-closed (each loop is under maxIterations)", async () => {
    const r = await run(200);
    assert.equal(r.value.__tag, "runtimeError", "runaway TOTAL compute must fail closed, not hang");
    assert.match(r.value.message ?? "", /Compute budget exceeded \(200 steps\)/);
  });

  it("the trap is deterministic — the same low budget traps identically on a re-run", async () => {
    const a = await run(200);
    const b = await run(200);
    assert.equal(a.value.message, b.value.message, "step-count cap is deterministic, not wall-clock");
  });
});

// The budget is a SHARED object across the whole call tree (not per-Interpreter-instance), so a deep
// recursion whose TOTAL compute exceeds maxSteps traps — closing the "maxCallDepth × maxSteps ≈ hours"
// liveness gap. And the liveness trap propagates cleanly through arithmetic (it crosses the nested
// flow's runFlow catch as a runtimeError value; isCheckedTrap must recognize it, else `1 + rec()` would
// mask it as "operator not supported").
describe("interpreter global compute-step cap: SHARED across the call tree + clean propagation", () => {
  const REC = `pure flow rec(n: Int) -> Int contract { effects {} } {
  if n <= 0 { return 0 }
  return 1 + rec(n - 1)
}`;
  const runRec = (maxSteps, n = 50) => {
    const p = parseProgram(REC, "rec.fungi");
    return executeFlow("rec", new Map([["n", { __tag: "int", value: n }]]), p.ast, p.flows,
      undefined, undefined, { maxSteps }, undefined, undefined);
  };

  it("a deep recursion whose TOTAL compute exceeds the shared budget traps (per-instance would not)", async () => {
    const r = await runRec(80);
    assert.equal(r.value.__tag, "runtimeError", "shared call-tree budget must trap, not run for hours");
    assert.match(r.value.message ?? "", /Compute budget exceeded/);
  });

  it("the same recursion under a generous budget computes correctly (shared budget not over-charged)", async () => {
    const r = await runRec(100_000);
    assert.equal(r.value.value, 50);
  });

  it("the liveness trap surfaces as the BUDGET trap through arithmetic, NOT 'operator not supported'", async () => {
    const r = await runRec(80);
    assert.doesNotMatch(r.value.message ?? "", /not supported/);
  });
});

describe("Array.range charges Interpreter stepBudget", () => {
  const SRC = `pure flow span() -> Int contract { effects {} } {
  let xs = Array.range(0, 100)
  return xs.length()
}`;
  const runSpan = (maxSteps) => {
    const p = parseProgram(SRC, "span.fungi");
    return executeFlow("span", new Map(), p.ast, p.flows, undefined, undefined, { maxSteps }, undefined, undefined);
  };

  it("positive: a short range under the budget returns its length", async () => {
    const r = await runSpan(10_000);
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 100);
  });

  it("hostile: cardinality above maxSteps traps instead of allocating the list", async () => {
    const r = await runSpan(20);
    assert.equal(r.value.__tag, "runtimeError");
    assert.match(r.value.message ?? "", /Compute budget exceeded \(20 steps\)/);
  });

  it("empty range does not debit the budget as a false trap", async () => {
    const empty = `pure flow none() -> Int contract { effects {} } {
  let xs = Array.range(3, 3)
  return xs.length()
}`;
    const p = parseProgram(empty, "none.fungi");
    const r = await executeFlow("none", new Map(), p.ast, p.flows, undefined, undefined, { maxSteps: 50 }, undefined, undefined);
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 0);
  });
});

describe("direct callStdlib Array.range meters without double-charging", () => {
  const ctx = {
    recordEffect: () => {},
    resolveIdentifier: () => undefined,
    callFlow: async () => ({ __tag: "void" }),
    applyFn: async (_fn, arg) => arg,
  };
  const n = (v) => ({ __tag: "int", value: v });

  it("positive: a short unmetered range still allocates", async () => {
    const r = await callStdlib("Array.range", undefined, [n(0), n(5)], ctx);
    assert.equal(r.__tag, "list");
    assert.equal(r.items.length, 5);
  });

  it("hostile: unmetered range above MAX_UNMETERED_ARRAY_RANGE refuses before allocate", async () => {
    await assert.rejects(
      () => callStdlib("Array.range", undefined, [n(0), n(MAX_UNMETERED_ARRAY_RANGE + 1)], ctx),
      /unmetered cardinality exceeds the host bound/,
    );
  });

  it("chargeSteps is the only debit: one call for count, no unmetered refuse", async () => {
    let charged = 0;
    const metered = {
      ...ctx,
      chargeSteps: (k) => {
        charged += 1;
        assert.equal(k, 100);
      },
    };
    const r = await callStdlib("Array.range", undefined, [n(0), n(100)], metered);
    assert.equal(r.__tag, "list");
    assert.equal(r.items.length, 100);
    assert.equal(charged, 1);
  });
});
