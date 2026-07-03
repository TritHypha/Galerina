// =============================================================================================
// RD-0234c BUG B (check + parse layer) — the previously-inert limit kinds now parse into LimitConfig
// and have throwing enforcer methods. Drives the REAL limits:block + decl: AST via parseProgram
// (NOT synthetic nodes), so it exercises the shape the shipped corpus actually produces.
// OWASP API4:2023 / CWE-770 (Unrestricted Resource Consumption).
// =============================================================================================
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, createContractEnforcer } from "../dist/index.js";
import { parseLimitConfig } from "../dist/runtime/limitPolicy.js";

// Recursively find the single contractDecl node (parseLimitConfig / createContractEnforcer consume it).
function findContractDecl(node) {
  if (node.kind === "contractDecl") return node;
  for (const c of node.children ?? []) {
    const r = findContractDecl(c);
    if (r !== undefined) return r;
  }
  return undefined;
}

// Build a flow declaring `limitsLine`, parse it, return its contractDecl node (real limits:block+decl:).
function contractOf(limitsLine) {
  const src =
`secure flow op(readonly request: Request) -> Result<Summary, String>
contract {
  intent { "x" }
  effects { database.read }
  limits {
    ${limitsLine}
  }
}
{
  return Ok({ id: request.params.id })
}`;
  const prog = parseProgram(src, "test.fungi");
  const errs = prog.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "unexpected parse errors: " + errs.map((d) => `${d.code} ${d.message}`).join("; "));
  const c = findContractDecl(prog.ast);
  assert.ok(c !== undefined, "contractDecl node must exist");
  return c;
}

const throwsLimit = (fn) =>
  assert.throws(fn, (e) => e instanceof RangeError && e.message.includes("FUNGI-LIMIT"));

describe("RD-0234c BUG B: parseLimitConfig fills the new kinds from the real AST", () => {
  it("max results 50 -> maxResults 50", () => {
    assert.equal(parseLimitConfig(contractOf("max results 50")).maxResults, 50);
  });
  it("max query length 200 characters -> maxQueryLengthChars 200", () => {
    assert.equal(parseLimitConfig(contractOf("max query length 200 characters")).maxQueryLengthChars, 200);
  });
  it("max amount 1000000 -> maxAmount 1000000", () => {
    assert.equal(parseLimitConfig(contractOf("max amount 1000000")).maxAmount, 1000000);
  });
  it("concurrent_tasks 4 -> maxConcurrentTasks 4", () => {
    assert.equal(parseLimitConfig(contractOf("concurrent_tasks 4")).maxConcurrentTasks, 4);
  });
  it("rate 500 per minute per actor -> {count:500, periodMs:60000, scope:actor}", () => {
    assert.deepEqual(parseLimitConfig(contractOf("rate 500 per minute per actor")).rate,
      { count: 500, periodMs: 60000, scope: "actor" });
  });
  it("rate with no explicit scope defaults to per-actor", () => {
    assert.equal(parseLimitConfig(contractOf("rate 10 per second")).rate.scope, "actor");
  });
});

describe("RD-0234c BUG B: enforcer methods throw [FUNGI-LIMIT] on exceed, pass within (boundary N/N+1)", () => {
  it("checkResultCount: 50 passes, 51 throws", () => {
    const e = createContractEnforcer(contractOf("max results 50"), "op");
    assert.doesNotThrow(() => e.checkResultCount(50));
    throwsLimit(() => e.checkResultCount(51));
  });
  it("checkQueryLength: 200 passes, 201 throws", () => {
    const e = createContractEnforcer(contractOf("max query length 200 characters"), "op");
    assert.doesNotThrow(() => e.checkQueryLength(200));
    throwsLimit(() => e.checkQueryLength(201));
  });
  it("checkAmount: 1000000 passes, 1000001 throws", () => {
    const e = createContractEnforcer(contractOf("max amount 1000000"), "op");
    assert.doesNotThrow(() => e.checkAmount(1000000));
    throwsLimit(() => e.checkAmount(1000001));
  });
  it("checkConcurrentTasks: 4 passes, 5 throws", () => {
    const e = createContractEnforcer(contractOf("concurrent_tasks 4"), "op");
    assert.doesNotThrow(() => e.checkConcurrentTasks(4));
    throwsLimit(() => e.checkConcurrentTasks(5));
  });
  it("checkRate: 500 passes, 501 throws", () => {
    const e = createContractEnforcer(contractOf("rate 500 per minute per actor"), "op");
    assert.doesNotThrow(() => e.checkRate(500));
    throwsLimit(() => e.checkRate(501));
  });
  it("a limit that is NOT declared is a no-op (checkAmount when only max results is set)", () => {
    const e = createContractEnforcer(contractOf("max results 50"), "op");
    assert.doesNotThrow(() => e.checkAmount(999999999));
  });
});
