import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { SemanticGraphBuilder, callers } = await import("../dist/semantic/SemanticGraph.js");

function node(id) {
  return { id, kind: "flow", name: id };
}

describe("semantic callers", () => {
  it("positive: returns nodes with calls edges into the target", () => {
    const graph = new SemanticGraphBuilder()
      .addNode(node("a"))
      .addNode(node("b"))
      .addNode(node("c"))
      .addEdge({ from: "a", to: "b", kind: "calls" })
      .addEdge({ from: "c", to: "b", kind: "calls" })
      .addEdge({ from: "a", to: "b", kind: "usesType" })
      .build();
    assert.deepEqual(callers(graph, "b").map((n) => n.id).sort(), ["a", "c"]);
  });

  it("hostile: unused-kind edges into the target are not callers", () => {
    const b = new SemanticGraphBuilder().addNode(node("target"));
    const n = 400;
    for (let i = 0; i < n; i++) {
      b.addNode(node(`x${i}`));
      b.addEdge({ from: `x${i}`, to: "target", kind: "usesType" });
    }
    b.addNode(node("only"));
    b.addEdge({ from: "only", to: "target", kind: "calls" });
    const started = Date.now();
    const hits = callers(b.build(), "target");
    assert.ok(Date.now() - started < 200);
    assert.deepEqual(hits.map((n) => n.id), ["only"]);
  });
});
