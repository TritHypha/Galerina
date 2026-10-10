/**
 * Optimization B — tryWhileFastPath runs simple Int counted loops; ineligible
 * loops stay on the async tree-walker. Overflow and iteration caps still trap.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, resolveSymbols, checkTypes, executeFlow, tryWhileFastPath } from "../dist/index.js";
import { createContractEnforcer } from "../dist/runtime/contractEnforcer.js";

async function parseAndRun(source, flowName, runtimeOptions) {
  const parsed = parseProgram(source, "while-fast.fungi");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return executeFlow(flowName, new Map(), parsed.ast, parsed.flows, undefined, undefined, runtimeOptions);
}

function findWhile(node) {
  if (node.kind === "whileStmt") return node;
  for (const child of node.children ?? []) {
    const found = findWhile(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("tryWhileFastPath", () => {
  for (const [label, clockAfterTwoIterations, expires] of [
    ["before the deadline", 99, false],
    ["exactly at the deadline", 100, false],
    ["past the deadline", 101, true],
  ]) {
    it(`uses the real deadline policy ${label} during fast-loop execution`, (t) => {
      const parsed = parseProgram(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 10 { i = i + 1 }
  return i
}`, "real-deadline-policy.fungi");
      assert.equal(parsed.diagnostics.length, 0);
      const w = findWhile(parsed.ast);
      assert.ok(w);
      const scope = new Map([["i", { __tag: "int", value: 0 }]]);
      // Time advances with actual loop progress, not unrelated Date.now calls.
      // Removing the loop's check or disabling the real policy must lose refusal.
      t.mock.method(Date, "now", () => scope.get("i").value < 2 ? 90 : clockAfterTwoIterations);
      const enforcer = createContractEnforcer(undefined, "count", { deadlineMs: 100 });
      assert.doesNotThrow(() => enforcer.checkDeadline());
      const run = () => tryWhileFastPath(w.children[0], w.children[1], scope,
        undefined, 100, () => enforcer.checkDeadline());
      if (expires) {
        assert.throws(run, /\[FUNGI-TIMEOUT\]/);
        assert.equal(scope.get("i").value, 2);
      } else {
        assert.equal(run(), true);
        assert.equal(scope.get("i").value, 10);
      }
    });
  }

  for (const expires of [false, true]) {
    it(`executeFlow records ${expires ? "a real mid-loop timeout" : "successful real-policy completion"}`, async (t) => {
      const parsed = parseProgram(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 10 { i = i + 1 }
  return i
}`, "real-deadline-execution.fungi");
      assert.equal(parsed.diagnostics.length, 0);
      resolveSymbols(parsed.ast);
      checkTypes(parsed.ast);
      let now = 90;
      t.mock.method(Date, "now", () => now);
      const base = createContractEnforcer(undefined, "count", { deadlineMs: 100 });
      let checks = 0;
      const enforcer = { ...base, checkDeadline() {
        // The entry check succeeds; the real policy decides at later loop checks.
        if (++checks === 4 && expires) now = 101;
        base.checkDeadline();
      } };
      const result = await executeFlow("count", new Map(), parsed.ast, parsed.flows, enforcer);
      if (expires) {
        assert.equal(checks, 4);
        assert.equal(result.value.__tag, "runtimeError");
        assert.match(result.value.message, /FUNGI-TIMEOUT/);
        assert.ok(result.diagnostics.some(diagnostic => diagnostic.message.includes("FUNGI-TIMEOUT")));
        assert.equal(result.audit.result, "error");
      } else {
        assert.ok(checks > 4);
        assert.equal(result.value.__tag, "int");
        assert.equal(result.value.value, 10);
        assert.equal(result.diagnostics.some(diagnostic => diagnostic.message.includes("FUNGI-TIMEOUT")), false);
        assert.notEqual(result.audit.result, "error");
      }
    });
  }

  it("executeFlow propagates a deadline refusal after entry into the fast loop", async () => {
    const parsed = parseProgram(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 10 { i = i + 1 }
  return i
}`, "deadline-wiring.fungi");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const base = createContractEnforcer(undefined, "count");
    let checks = 0;
    const enforcer = { ...base, checkDeadline() {
      base.checkDeadline();
      if (++checks === 4) throw new Error("controlled mid-loop deadline refusal");
    } };
    const result = await executeFlow("count", new Map(), parsed.ast, parsed.flows, enforcer);
    assert.equal(checks, 4);
    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /controlled mid-loop deadline refusal/);
  });

  it("checks the deadline before each condition, including loop exit", () => {
    const parsed = parseProgram(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 10 { i = i + 1 }
  return i
}`, "deadline.fungi");
    const w = findWhile(parsed.ast);
    assert.ok(w);
    const scope = new Map([["i", { __tag: "int", value: 0 }]]);
    let checks = 0;
    assert.equal(tryWhileFastPath(w.children[0], w.children[1], scope,
      undefined, 100, () => { checks++; }), true);
    assert.equal(scope.get("i").value, 10);
    assert.equal(checks, 11);
  });

  it("propagates a deadline refusal before the next iteration executes", () => {
    const parsed = parseProgram(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 10 { i = i + 1 }
  return i
}`, "deadline-refusal.fungi");
    const w = findWhile(parsed.ast);
    assert.ok(w);
    const scope = new Map([["i", { __tag: "int", value: 0 }]]);
    const expired = new Error("controlled deadline expired");
    let checks = 0;
    assert.throws(() => tryWhileFastPath(w.children[0], w.children[1], scope,
      undefined, 100, () => { if (++checks === 3) throw expired; }),
      (error) => error === expired);
    assert.equal(checks, 3);
    assert.equal(scope.get("i").value, 2);
  });

  it("positive: counted Int loop reaches the bound", async () => {
    const r = await parseAndRun(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 10 {
    i = i + 1
  }
  return i
}`, "count");
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 10);
  });

  it("positive: tryWhileFastPath reports eligible and mutates the map", () => {
    const parsed = parseProgram(`pure flow count() -> Int contract { effects {} } {
  mut i = 0
  while i < 3 {
    i = i + 1
  }
  return i
}`, "elig.fungi");
    const w = findWhile(parsed.ast);
    assert.ok(w);
    const scope = new Map([["i", { __tag: "int", value: 0 }]]);
    assert.equal(tryWhileFastPath(w.children[0], w.children[1], scope), true);
    assert.equal(scope.get("i").value, 3);
  });

  it("hostile: a call in the body is ineligible and still executes on the walker", async () => {
    const r = await parseAndRun(`pure flow mix() -> Int contract { effects {} } {
  mut i = 0
  mut n = 0
  while i < 4 {
    i = i + 1
    n = n + i
  }
  return n
}`, "mix");
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 10);
    const parsed = parseProgram(`pure flow call() -> Int contract { effects {} } {
  mut i = 0
  while i < 3 {
    i = i + 1
    log.info("x")
  }
  return i
}`, "call.fungi");
    const w = findWhile(parsed.ast);
    const scope = new Map([["i", { __tag: "int", value: 0 }]]);
    assert.equal(tryWhileFastPath(w.children[0], w.children[1], scope), false);
    assert.equal(scope.get("i").value, 0);
  });

  it("hostile: iteration cap traps instead of falling through", () => {
    const parsed = parseProgram(`pure flow inf() -> Int contract { effects {} } {
  mut i = 0
  while i < 1000 {
    i = i + 0
  }
  return i
}`, "inf.fungi");
    const w = findWhile(parsed.ast);
    const scope = new Map([["i", { __tag: "int", value: 0 }]]);
    assert.throws(() => tryWhileFastPath(w.children[0], w.children[1], scope, undefined, 8), /maximum iteration count/);
  });
});
