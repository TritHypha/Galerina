/**
 * Phase 31 — Bytecode VM sub-flow call fallback (regression)
 *
 * Regression guard for a latent correctness bug: the bytecode compiler's
 * `callExpr` case emitted an `Op.CALL` opcode the VM never implemented, so it
 * fell through to `default: return 0`. Under the `pureFastPath` deployment fast
 * path, ANY pure flow that called another pure flow silently returned 0, and
 * self-recursive pure flows overflowed the compiler stack with RangeError.
 *
 * The fix makes `callExpr` throw `BytecodeUnsupported`, so `compileToBytecode`
 * returns null and `executeFlow` falls back to the sync tree-walker, which
 * executes sub-flow calls correctly (executionTier === "sync").
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, executeFlow, clearPureFlowCache, clearBytecodeCache,
} from "../dist/index.js";

describe("Phase 31: pure-flow-calls-pure-flow under pureFastPath", () => {
  it("main() calling leaf(10) returns 21, not 0", async () => {
    clearPureFlowCache();
    clearBytecodeCache();
    const src = [
      "pure flow leaf(x: Int) -> Int contract { effects {} } { return x * 2 + 1 }",
      "pure flow main() -> Int contract { effects {} } { return leaf(10) }",
    ].join("\n");
    const parsed = parseProgram(src, "call-fallback.spore");
    const result = await executeFlow(
      "main", new Map(), parsed.ast, parsed.flows, undefined, undefined,
      { pureFastPath: true },
    );
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 21, "sub-flow call must return 21, not 0");
    // Documents that the bytecode tier correctly declined and fell back.
    assert.equal(result.executionTier, "sync");
  });

  it("self-recursive fib(10) returns 55 without throwing", async () => {
    clearPureFlowCache();
    clearBytecodeCache();
    const src = [
      "pure flow fib(n: Int) -> Int contract { effects {} }",
      "{ if n < 2 { return n } else { return fib(n - 1) + fib(n - 2) } }",
    ].join("\n");
    const parsed = parseProgram(src, "fib-fallback.spore");
    const result = await executeFlow(
      "fib", new Map([["n", { __tag: "int", value: 10 }]]),
      parsed.ast, parsed.flows, undefined, undefined,
      { pureFastPath: true },
    );
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 55, "fib(10) must be 55");
    assert.equal(result.executionTier, "sync");
  });
});
