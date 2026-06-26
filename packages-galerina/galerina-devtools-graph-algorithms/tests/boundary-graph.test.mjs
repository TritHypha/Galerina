import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { buildBoundaryGraph, getBoundaryCrossings, getUnauthorisedCrossings } =
  await import("../dist/graphs/boundary-graph.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCallGraph(pairs) {
  const map = new Map();
  for (const [caller, callees] of pairs) {
    map.set(caller, new Set(callees));
  }
  return map;
}

// ─── buildBoundaryGraph ───────────────────────────────────────────────────────

describe("buildBoundaryGraph — node creation", () => {
  it("creates one node per flow", () => {
    const flows = [
      { name: "login", qualifier: "api", declaredEffects: ["http.request"] },
      { name: "hashPw", qualifier: "secure", declaredEffects: ["crypto"] },
    ];
    const graph = buildBoundaryGraph(flows, makeCallGraph([]));

    assert.equal(graph.nodeCount, 2);
    assert.ok(graph.hasNode("login"));
    assert.ok(graph.hasNode("hashPw"));
  });

  it("maps qualifier to correct BoundaryKind and BoundaryTrustLevel", () => {
    const flows = [
      { name: "entry", qualifier: "api", declaredEffects: [] },
      { name: "guard", qualifier: "secure", declaredEffects: [] },
      { name: "worker", qualifier: "internal", declaredEffects: [] },
    ];
    const graph = buildBoundaryGraph(flows, makeCallGraph([]));

    assert.equal(graph.node("entry")?.data.kind, "api");
    assert.equal(graph.node("entry")?.data.trustLevel, "validated");

    assert.equal(graph.node("guard")?.data.kind, "secure");
    assert.equal(graph.node("guard")?.data.trustLevel, "privileged");

    assert.equal(graph.node("worker")?.data.kind, "internal");
    assert.equal(graph.node("worker")?.data.trustLevel, "internal");
  });

  it("adds stub nodes for callees not listed in flows", () => {
    const flows = [
      { name: "caller", qualifier: "api", declaredEffects: [] },
    ];
    const cg = makeCallGraph([["caller", ["unknownCallee"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    assert.ok(graph.hasNode("unknownCallee"));
    // Stub node defaults to internal kind
    assert.equal(graph.node("unknownCallee")?.data.kind, "internal");
  });
});

describe("buildBoundaryGraph — edge creation", () => {
  it("creates edges for every call-graph entry", () => {
    const flows = [
      { name: "handler", qualifier: "api", declaredEffects: ["http.request"] },
      { name: "store", qualifier: "internal", declaredEffects: ["db.write"] },
    ];
    const cg = makeCallGraph([["handler", ["store"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    assert.equal(graph.edgeCount, 1);
    const edges = graph.outEdges("handler");
    assert.equal(edges.length, 1);
    assert.equal(edges[0].to, "store");
  });

  it("records effectsTransferred as intersection of caller and callee effects", () => {
    const flows = [
      { name: "a", qualifier: "internal", declaredEffects: ["db.read", "http.request"] },
      { name: "b", qualifier: "internal", declaredEffects: ["db.read", "crypto"] },
    ];
    const cg = makeCallGraph([["a", ["b"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    const edge = graph.outEdges("a")[0];
    assert.deepEqual(edge.data.effectsTransferred, ["db.read"]);
  });

  it("marks crossing as allowed when secure caller calls internal callee", () => {
    const flows = [
      { name: "secureFlow", qualifier: "secure", declaredEffects: ["crypto"] },
      { name: "helper", qualifier: "internal", declaredEffects: [] },
    ];
    const cg = makeCallGraph([["secureFlow", ["helper"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    const edge = graph.outEdges("secureFlow")[0];
    assert.equal(edge.data.crossingAllowed, true);
    assert.equal(edge.data.requiresAuth, true);
  });

  it("marks crossing as NOT allowed when secure caller calls untrusted callee", () => {
    const flows = [
      { name: "secureFlow", qualifier: "secure", declaredEffects: [] },
      { name: "publicHandler", qualifier: "public", declaredEffects: [] },
    ];
    const cg = makeCallGraph([["secureFlow", ["publicHandler"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    const edge = graph.outEdges("secureFlow")[0];
    assert.equal(edge.data.crossingAllowed, false);
  });
});

// ─── getBoundaryCrossings ─────────────────────────────────────────────────────

describe("getBoundaryCrossings", () => {
  it("returns all crossings with their allowed flag", () => {
    const flows = [
      { name: "apiFlow", qualifier: "api", declaredEffects: [] },
      { name: "internalFlow", qualifier: "internal", declaredEffects: [] },
      { name: "secureFlow", qualifier: "secure", declaredEffects: [] },
      { name: "pubFlow", qualifier: "public", declaredEffects: [] },
    ];
    const cg = makeCallGraph([
      ["apiFlow", ["internalFlow"]],
      ["secureFlow", ["pubFlow"]],
    ]);
    const graph = buildBoundaryGraph(flows, cg);
    const crossings = getBoundaryCrossings(graph);

    assert.equal(crossings.length, 2);

    const apiToInternal = crossings.find(
      (c) => c.from === "apiFlow" && c.to === "internalFlow",
    );
    assert.ok(apiToInternal);
    assert.equal(apiToInternal.allowed, true);

    const secureToPub = crossings.find(
      (c) => c.from === "secureFlow" && c.to === "pubFlow",
    );
    assert.ok(secureToPub);
    assert.equal(secureToPub.allowed, false);
  });

  it("returns empty array when there are no edges", () => {
    const flows = [
      { name: "solo", qualifier: "internal", declaredEffects: [] },
    ];
    const graph = buildBoundaryGraph(flows, makeCallGraph([]));
    assert.deepEqual(getBoundaryCrossings(graph), []);
  });
});

// ─── getUnauthorisedCrossings ─────────────────────────────────────────────────

describe("getUnauthorisedCrossings", () => {
  it("returns only crossings where crossingAllowed is false", () => {
    const flows = [
      { name: "secureA", qualifier: "secure", declaredEffects: [] },
      { name: "internalB", qualifier: "internal", declaredEffects: [] },
      { name: "publicC", qualifier: "public", declaredEffects: [] },
    ];
    // secureA→internalB is allowed; secureA→publicC is NOT allowed
    const cg = makeCallGraph([["secureA", ["internalB", "publicC"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    const unauthorised = getUnauthorisedCrossings(graph);

    assert.equal(unauthorised.length, 1);
    assert.equal(unauthorised[0].from, "secureA");
    assert.equal(unauthorised[0].to, "publicC");
  });

  it("returns empty array when all crossings are allowed", () => {
    const flows = [
      { name: "internalX", qualifier: "internal", declaredEffects: [] },
      { name: "internalY", qualifier: "internal", declaredEffects: [] },
    ];
    const cg = makeCallGraph([["internalX", ["internalY"]]]);
    const graph = buildBoundaryGraph(flows, cg);

    assert.deepEqual(getUnauthorisedCrossings(graph), []);
  });

  it("returns empty array when graph has no edges", () => {
    const flows = [{ name: "a", qualifier: "secure", declaredEffects: [] }];
    const graph = buildBoundaryGraph(flows, makeCallGraph([]));
    assert.deepEqual(getUnauthorisedCrossings(graph), []);
  });
});
