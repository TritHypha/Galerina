/**
 * Optimization B — tryWhileFastPath runs simple Int counted loops; ineligible
 * loops stay on the async tree-walker. Overflow and iteration caps still trap.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createContractEnforcer, parseProgram, resolveSymbols, checkTypes, executeFlow, tryWhileFastPath } from "../dist/index.js";

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

  it("hostile: an eligible fast-path loop honors the real deadline enforcer and fails closed", async (t) => {
    const source = `pure flow spin() -> Int contract { effects {} } {
  mut i = 0
  while i < 100000 {
    i = i + 1
  }
  return i
}`;
    const parsed = parseProgram(source, "deadline-fast.fungi");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const loop = findWhile(parsed.ast);
    assert.ok(loop);
    const eligibilityProbe = new Map([["i", { __tag: "int", value: 0 }]]);
    assert.equal(tryWhileFastPath(loop.children[0], loop.children[1], eligibilityProbe), true);

    const now = Date.now();
    const enforcer = createContractEnforcer(undefined, "spin", { deadlineMs: now + 2 });
    let clockTicks = 0;
    t.mock.method(Date, "now", () => now + clockTicks++);

    const result = await executeFlow("spin", new Map(), parsed.ast, parsed.flows, enforcer);

    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /FUNGI-TIMEOUT/);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.message.includes("FUNGI-TIMEOUT")));
    assert.equal(result.audit.result, "error");
  });
});
