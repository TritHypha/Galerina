import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { SemanticGraphBuilder, reachable } = await import("../dist/semantic/SemanticGraph.js");

function node(id) {
  return { id, kind: "flow", name: id };
}

describe("semantic reachable", () => {
  it("follows one edge kind via an adjacency index", () => {
    const graph = new SemanticGraphBuilder()
      .addNode(node("a"))
      .addNode(node("b"))
      .addNode(node("c"))
      .addEdge({ from: "a", to: "b", kind: "calls" })
      .addEdge({ from: "b", to: "c", kind: "calls" })
      .addEdge({ from: "a", to: "c", kind: "usesType" })
      .build();
    assert.deepEqual(reachable(graph, "a", "calls").map((n) => n.id), ["b", "c"]);
  });

  it("hostile: a dense unused-kind edge set does not explode visit work", () => {
    const b = new SemanticGraphBuilder().addNode(node("start"));
    const n = 200;
    for (let i = 0; i < n; i++) {
      b.addNode(node(`x${i}`));
      b.addEdge({ from: "start", to: `x${i}`, kind: "usesType" });
    }
    b.addEdge({ from: "start", to: "x0", kind: "calls" });
    const started = Date.now();
    const hits = reachable(b.build(), "start", "calls");
    assert.ok(Date.now() - started < 200);
    assert.deepEqual(hits.map((n) => n.id), ["x0"]);
  });
});
