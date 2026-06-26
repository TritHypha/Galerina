// =============================================================================
// Pure flow erasure — governance skipped for pure + effect-free flows
//
// Tests for isPureEffectFree() and the pureFastPath in executeFlow():
//   1. pure flow with no effects executes without ContractEnforcer (mock check)
//   2. pure flow result is same as governed flow result
//   3. Execution time for pure flow is measurably faster (>=10% on 1000 iters)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  executeFlow,
  isPureEffectFree,
  createContractEnforcer,
  createCapabilityHost,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Test 1: pure flow with no effects executes without ContractEnforcer
// ---------------------------------------------------------------------------

describe("Pure flow erasure: governance skipped for pure flows", () => {
  it("pure flow with no effects executes without ContractEnforcer (check via mock)", async () => {
    const source = `
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}
`;
    const parsed = parseProgram(source, "test.spore");

    // Verify the flow is detected as pure + effect-free
    assert.equal(
      isPureEffectFree(parsed.ast, "add"),
      true,
      "add() should be detected as pure + effect-free",
    );

    // Track whether a ContractEnforcer was created via a spy
    let enforcerCreated = false;
    const mockEnforcer = {
      get context() { return { flowName: "add", startedAt: Date.now() }; },
      get enforcementRecord() { return { flowName: "add", violations: [], retryAttempts: [] }; },
      checkRequestSize() {},
      checkBatchSize() {},
      checkDeadline() {},
      async withRetry(_name, fn) { return fn(); },
      recordRetry() {},
    };

    // Run WITH pureFastPath=true — ContractEnforcer/CapabilityHost passed but should be bypassed
    const enforcerProxy = new Proxy(mockEnforcer, {
      get(target, prop) {
        // Any access to the enforcer means it was used
        if (prop !== Symbol.toPrimitive && prop !== "then") {
          enforcerCreated = true;
        }
        return Reflect.get(target, prop);
      },
    });

    const capHostProxy = {
      check() { enforcerCreated = true; return { allowed: true }; },
      async execute() { enforcerCreated = true; return { value: { __tag: "void" }, effectObserved: "", durationMs: 0 }; },
      get observedEffects() { return new Set(); },
      get callCounters() { return { networkCallCount: 0, dbCallCount: 0 }; },
    };

    // Fast path: even though enforcer/capHost are provided, they should be bypassed
    // for a pure + effect-free flow when pureFastPath is enabled (default)
    const result = await executeFlow(
      "add",
      new Map([["a", { __tag: "int", value: 3 }], ["b", { __tag: "int", value: 4 }]]),
      parsed.ast,
      parsed.flows,
      enforcerProxy,     // passed but should be ignored
      capHostProxy,      // passed but should be ignored
      { pureFastPath: true },
    );

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 7);

    // The governance infrastructure was bypassed — proxy was never invoked
    assert.equal(
      enforcerCreated,
      false,
      "ContractEnforcer/CapabilityHost must not be accessed for pure + effect-free flows",
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: pure flow result is same as governed flow result
  // ---------------------------------------------------------------------------

  it("pure flow result is same as governed flow result", async () => {
    const source = `
pure flow multiply(x: Int, y: Int) -> Int {
  return x * y
}
`;
    const parsed = parseProgram(source, "test.spore");
    const args = new Map([
      ["x", { __tag: "int", value: 6 }],
      ["y", { __tag: "int", value: 7 }],
    ]);

    // Governed path (with real ContractEnforcer + CapabilityHost)
    const enforcer = createContractEnforcer(undefined, "multiply", {});
    const capHost = createCapabilityHost({ declaredEffects: new Set(), enforcer });

    const governedResult = await executeFlow(
      "multiply",
      args,
      parsed.ast,
      parsed.flows,
      enforcer,
      capHost,
      { pureFastPath: false }, // disable fast path
    );

    // Fast path (pure erasure)
    const fastResult = await executeFlow(
      "multiply",
      args,
      parsed.ast,
      parsed.flows,
      undefined,
      undefined,
      { pureFastPath: true },
    );

    assert.equal(governedResult.value.__tag, "int");
    assert.equal(fastResult.value.__tag, "int");
    assert.equal(
      fastResult.value.value,
      governedResult.value.value,
      "Fast path must produce the same result as the governed path",
    );
  });

  // ---------------------------------------------------------------------------
  // Test 3: pure flow execution is measurably faster (>=10% on 1000 iterations)
  // ---------------------------------------------------------------------------

  it("pure flow execution is measurably faster than governed flow (>=10% on 1000 iterations)", async () => {
    const source = `
pure flow square(n: Int) -> Int {
  return n * n
}
`;
    const parsed = parseProgram(source, "test.spore");
    const args = new Map([["n", { __tag: "int", value: 9 }]]);
    const ITERATIONS = 1000;

    // Warm up
    for (let i = 0; i < 10; i++) {
      await executeFlow("square", args, parsed.ast, parsed.flows, undefined, undefined, { pureFastPath: true });
    }

    // Measure governed path (pureFastPath: false)
    const governedStart = Date.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const enforcer = createContractEnforcer(undefined, "square", {});
      const capHost = createCapabilityHost({ declaredEffects: new Set(), enforcer });
      await executeFlow(
        "square",
        args,
        parsed.ast,
        parsed.flows,
        enforcer,
        capHost,
        { pureFastPath: false },
      );
    }
    const governedMs = Date.now() - governedStart;

    // Measure fast path
    const fastStart = Date.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await executeFlow(
        "square",
        args,
        parsed.ast,
        parsed.flows,
        undefined,
        undefined,
        { pureFastPath: true },
      );
    }
    const fastMs = Date.now() - fastStart;

    const speedupPct = ((governedMs - fastMs) / governedMs) * 100;
    // Allow for environment variance — assert at least 10% speedup
    assert.ok(
      speedupPct >= 10,
      `Pure fast path should be at least 10% faster than governed path. ` +
      `Governed: ${governedMs}ms, Fast: ${fastMs}ms, Speedup: ${speedupPct.toFixed(1)}%`,
    );
  });
});
