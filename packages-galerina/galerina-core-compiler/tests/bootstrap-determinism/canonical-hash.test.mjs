// =============================================================================
// Bootstrap Determinism — Canonical Hash (subdirectory suite)
//
// Extends the flat bootstrap-determinism.test.mjs with additional scenarios:
//   - Nested objects with many keys (insertion-order independence)
//   - Array element ordering stability
//   - Cross-compilation pipeline determinism (lex → parse → GIR hash)
//   - EFFECT_REGISTRY cross-call key-order independence
//   - PassiveExecutionPlan full object hash stability
//
// These tests prove that the canonical hashing foundation is solid enough
// to support future Stage B self-host verification:
//   "compile the same source twice → same GIR hash"
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalHash,
  hashSource,
  hashGIR,
  hashPassivePlan,
  EFFECT_REGISTRY,
  parseProgram,
  buildSemanticGraph,
  buildExecutionPlan,
  buildExecutionGraph,
  storeGraph,
  getOrLoadGraph,
  executionGraphCacheKey,
  getGraphCacheStats,
} from "../../dist/index.js";

// ExecOp.BINOP = 3 (const enum inlined at compile time)
const EXEC_OP_BINOP       = 3;
const EXEC_OP_RETURN      = 8;
const EXEC_OP_RETURN_VOID = 9;

// ---------------------------------------------------------------------------
// Nested object key-order independence
// ---------------------------------------------------------------------------

describe("canonical-hash: nested object key-order independence", () => {
  it("deeply nested object with different key insertion order → same hash", () => {
    const obj1 = {
      contract: {
        effects: { declared: ["database.write"], observed: [] },
        limits: { maxBodyMb: 5, maxRetries: 3 },
        privacy: { level: "redacted" },
      },
      name: "createUser",
      qualifier: "flow",
    };
    const obj2 = {
      name: "createUser",
      qualifier: "flow",
      contract: {
        privacy: { level: "redacted" },
        limits: { maxRetries: 3, maxBodyMb: 5 },
        effects: { observed: [], declared: ["database.write"] },
      },
    };
    const h1 = canonicalHash(obj1);
    const h2 = canonicalHash(obj2);
    assert.equal(h1, h2, "Deep key reordering must not affect canonical hash");
  });
});

// ---------------------------------------------------------------------------
// Array element stability
//
// canonicalHash sorts array elements for determinism (so effects lists hash
// the same regardless of declaration order — they are semantically unordered sets).
// Different content must still produce different hashes.
// ---------------------------------------------------------------------------

describe("canonical-hash: array element stability", () => {
  it("[a, b] hashed twice → same hash", () => {
    const h1 = canonicalHash({ effects: ["database.write", "network.outbound"] });
    const h2 = canonicalHash({ effects: ["database.write", "network.outbound"] });
    assert.equal(h1, h2, "Same array twice must produce the same hash");
  });

  it("[a, b] and [b, a] → same hash (canonicalHash normalises set-like arrays)", () => {
    // canonicalHash sorts array elements for canonical stability.
    // Effects like ["database.write", "network.outbound"] are semantically unordered.
    const h1 = canonicalHash({ effects: ["database.write", "network.outbound"] });
    const h2 = canonicalHash({ effects: ["network.outbound", "database.write"] });
    assert.equal(h1, h2, "canonicalHash must normalise array element order for determinism");
  });

  it("arrays with different content → different hashes", () => {
    const h1 = canonicalHash({ effects: ["database.write"] });
    const h2 = canonicalHash({ effects: ["network.outbound"] });
    assert.notEqual(h1, h2, "Different array content must produce different hashes");
  });
});

// ---------------------------------------------------------------------------
// EFFECT_REGISTRY full cross-call independence
// ---------------------------------------------------------------------------

describe("canonical-hash: EFFECT_REGISTRY cross-call determinism", () => {
  it("canonicalHash(EFFECT_REGISTRY) interleaved with other calls → same result", () => {
    const h1 = canonicalHash(EFFECT_REGISTRY);
    // Interleave with unrelated hash calls to prove no shared mutable state
    canonicalHash({ noise: Math.PI });
    canonicalHash({ noise: "abc" });
    const h2 = canonicalHash(EFFECT_REGISTRY);
    assert.equal(h1, h2, "EFFECT_REGISTRY hash must be stable across interleaved calls");
  });

  it("hashSource called between two EFFECT_REGISTRY hashes → no interference", () => {
    const h1 = canonicalHash(EFFECT_REGISTRY);
    hashSource("some source text that should not affect state");
    const h2 = canonicalHash(EFFECT_REGISTRY);
    assert.equal(h1, h2, "hashSource must not affect canonicalHash state");
  });
});

// ---------------------------------------------------------------------------
// Cross-compilation determinism (pipeline-level)
//
// This is the foundation of Stage B self-hosting verification:
//   compile same source twice → same GIR → same GIR hash
// ---------------------------------------------------------------------------

describe("canonical-hash: cross-compilation pipeline determinism", () => {
  const FIXED_SOURCE = `
pure flow calculateScore(base: Int, multiplier: Int) -> Int
contract {
  intent { "Calculate a weighted score for ranking." }
  effects {}
}
{
  return base * multiplier
}
`;

  it("compile same source twice → same parse diagnostic count", () => {
    const p1 = parseProgram(FIXED_SOURCE, "score.spore");
    const p2 = parseProgram(FIXED_SOURCE, "score.spore");
    assert.equal(
      p1.diagnostics.filter((d) => d.severity === "error").length,
      p2.diagnostics.filter((d) => d.severity === "error").length,
      "Error count must be identical across two parses of the same source",
    );
  });

  it("compile same source twice → same semantic graph node/edge count", () => {
    const p1 = parseProgram(FIXED_SOURCE, "score.spore");
    const p2 = parseProgram(FIXED_SOURCE, "score.spore");
    const g1 = buildSemanticGraph(p1.ast, p1.flows);
    const g2 = buildSemanticGraph(p2.ast, p2.flows);
    assert.equal(g1.nodes.length, g2.nodes.length, "Node count must be stable");
    assert.equal(g1.edges.length, g2.edges.length, "Edge count must be stable");
  });

  it("compile same source twice → same planHash for each flow", () => {
    const p1 = parseProgram(FIXED_SOURCE, "score.spore");
    const p2 = parseProgram(FIXED_SOURCE, "score.spore");
    const errors1 = p1.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors1.length, 0, `Parse errors: ${errors1.map((e) => e.message).join(", ")}`);

    const meta1 = p1.flows.find((f) => f.name === "calculateScore");
    const meta2 = p2.flows.find((f) => f.name === "calculateScore");
    assert.ok(meta1 !== undefined, "Flow must be found in parse 1");
    assert.ok(meta2 !== undefined, "Flow must be found in parse 2");

    const plan1 = buildExecutionPlan(p1.ast, meta1);
    const plan2 = buildExecutionPlan(p2.ast, meta2);
    assert.equal(
      plan1.planHash,
      plan2.planHash,
      "planHash must be identical for the same flow compiled twice",
    );
  });
});

// ---------------------------------------------------------------------------
// hashPassivePlan stability
// ---------------------------------------------------------------------------

describe("canonical-hash: hashPassivePlan stability", () => {
  it("hashPassivePlan called twice on the same plan object → same hash", () => {
    const plan = {
      schemaVersion: "spore.execution.plan.v1",
      flowName: "testFlow",
      qualifier: "pure",
      planHash: "",
      steps: [
        { kind: "validateParam", paramName: "x", expectedType: "Int" },
        { kind: "return", value: "x" },
      ],
    };
    const h1 = hashPassivePlan(plan);
    const h2 = hashPassivePlan(plan);
    assert.equal(h1, h2, "hashPassivePlan must be idempotent");
    assert.ok(h1.startsWith("sha256:"), "hashPassivePlan must return sha256: prefixed string");
  });

  it("same plan with different key order → same hashPassivePlan", () => {
    const planA = {
      schemaVersion: "spore.execution.plan.v1",
      flowName: "testFlow",
      qualifier: "pure",
      steps: [{ kind: "return", value: "x" }],
    };
    const planB = {
      steps: [{ kind: "return", value: "x" }],
      qualifier: "pure",
      flowName: "testFlow",
      schemaVersion: "spore.execution.plan.v1",
    };
    const h1 = hashPassivePlan(planA);
    const h2 = hashPassivePlan(planB);
    assert.equal(h1, h2, "hashPassivePlan must be key-order independent");
  });
});

// ---------------------------------------------------------------------------
// GIR hash stability
// ---------------------------------------------------------------------------

describe("canonical-hash: hashGIR stability with realistic payload", () => {
  it("hashGIR with realistic multi-flow GIR → stable across two calls", () => {
    const gir = {
      schemaVersion: "lln.gir.v1",
      generatedAt: "2024-01-01T00:00:00.000Z",
      flows: [
        {
          name: "createUser",
          qualifier: "flow",
          effects: { declared: ["database.write"], observed: ["database.write"], status: "compliant" },
          contract: { intent: "Create a new user account.", privacy: { level: "protected" } },
        },
        {
          name: "getUser",
          qualifier: "pure flow",
          effects: { declared: [], observed: [], status: "compliant" },
          contract: { intent: "Retrieve user by ID." },
        },
      ],
    };
    const h1 = hashGIR(gir);
    const h2 = hashGIR(gir);
    assert.equal(h1, h2, "hashGIR must produce the same hash for the same GIR");
  });

  it("GIR with different flow order → different hash (flow arrays are ordered)", () => {
    const girA = {
      schemaVersion: "lln.gir.v1",
      flows: [{ name: "a", qualifier: "pure flow" }, { name: "b", qualifier: "flow" }],
    };
    const girB = {
      schemaVersion: "lln.gir.v1",
      flows: [{ name: "b", qualifier: "flow" }, { name: "a", qualifier: "pure flow" }],
    };
    const h1 = hashGIR(girA);
    const h2 = hashGIR(girB);
    assert.notEqual(h1, h2, "Flow order matters in GIR — different order → different hash");
  });
});

// ---------------------------------------------------------------------------
// Null / undefined / empty values
// ---------------------------------------------------------------------------

describe("canonical-hash: null and undefined stability", () => {
  it("canonicalHash(null) called twice → same hash", () => {
    const h1 = canonicalHash(null);
    const h2 = canonicalHash(null);
    assert.equal(h1, h2, "null must hash deterministically");
  });

  it("canonicalHash({}) called twice → same hash", () => {
    const h1 = canonicalHash({});
    const h2 = canonicalHash({});
    assert.equal(h1, h2, "empty object must hash deterministically");
  });

  it("canonicalHash([]) called twice → same hash", () => {
    const h1 = canonicalHash([]);
    const h2 = canonicalHash([]);
    assert.equal(h1, h2, "empty array must hash deterministically");
  });
});

// ---------------------------------------------------------------------------
// ExecutionGraph: build and cache
// ---------------------------------------------------------------------------

describe("ExecutionGraph: build and cache", () => {
  // Build a minimal pureFlowDecl AST node for "add(a, b) { return a + b }"
  function makeAddFlowNode() {
    return {
      kind: "pureFlowDecl",
      value: "add",
      children: [
        { kind: "paramDecl", value: "a: Int", children: [] },
        { kind: "paramDecl", value: "b: Int", children: [] },
        {
          kind: "block",
          value: undefined,
          children: [
            {
              kind: "returnStmt",
              value: undefined,
              children: [
                {
                  kind: "binaryExpr",
                  value: "+",
                  children: [
                    { kind: "identifier", value: "a", children: [] },
                    { kind: "identifier", value: "b", children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it("buildExecutionGraph for 'pure flow add' produces nodes with BINOP", () => {
    const flowNode = makeAddFlowNode();
    const graph = buildExecutionGraph(flowNode, "add", "pure", [], true);

    assert.equal(graph.flowName, "add", "flowName must match");
    assert.equal(graph.isPure, true, "isPure must be true");
    assert.ok(graph.nodes.length > 0, "must have at least one node");

    // There must be at least one BINOP node (op === EXEC_OP_BINOP === 3)
    const hasBinop = graph.nodes.some((n) => n.op === EXEC_OP_BINOP);
    assert.ok(hasBinop, `Expected a BINOP node (op=${EXEC_OP_BINOP}) in: ${JSON.stringify(graph.nodes.map(n => n.op))}`);

    // Must have a RETURN or RETURN_VOID at the end
    const lastOp = graph.nodes[graph.nodes.length - 1]?.op;
    const hasReturn = lastOp === EXEC_OP_RETURN || lastOp === EXEC_OP_RETURN_VOID;
    assert.ok(hasReturn, `Last node must be RETURN/RETURN_VOID, got op=${lastOp}`);
  });

  it("storeGraph + getOrLoadGraph returns same graph", () => {
    const flowNode = makeAddFlowNode();
    const graph = buildExecutionGraph(flowNode, "addCacheTest", "pure", [], true);
    const key = executionGraphCacheKey("addCacheTest", "testhash1");

    storeGraph(key, graph);
    const loaded = getOrLoadGraph(key);

    assert.ok(loaded !== null, "getOrLoadGraph must return a graph after storeGraph");
    assert.equal(loaded.flowName, graph.flowName, "flowName must round-trip");
    assert.equal(loaded.slotCount, graph.slotCount, "slotCount must round-trip");
    assert.equal(loaded.nodes.length, graph.nodes.length, "nodes.length must round-trip");
    assert.equal(loaded.isPure, graph.isPure, "isPure must round-trip");
  });

  it("executionGraphCacheKey is deterministic", () => {
    const k1 = executionGraphCacheKey("myFlow", "abc123");
    const k2 = executionGraphCacheKey("myFlow", "abc123");
    assert.equal(k1, k2, "Same inputs must produce same cache key");
    assert.ok(k1.includes("myFlow"), "Cache key must contain flowName");
    assert.ok(k1.includes("abc123"), "Cache key must contain sourceHash");

    const k3 = executionGraphCacheKey("otherFlow", "abc123");
    assert.notEqual(k1, k3, "Different flowName must produce different cache key");
  });

  it("memory cache stats shows correct entry count", () => {
    const before = getGraphCacheStats();
    const flowNode = makeAddFlowNode();
    const graph = buildExecutionGraph(flowNode, "statsTestFlow", "pure", [], true);
    const key = executionGraphCacheKey("statsTestFlow", "statshash99");
    storeGraph(key, graph);
    const after = getGraphCacheStats();

    assert.ok(
      after.memoryEntries >= before.memoryEntries + 1,
      `memoryEntries must increase after storeGraph (before=${before.memoryEntries}, after=${after.memoryEntries})`,
    );
  });
});
