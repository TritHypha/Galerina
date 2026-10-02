import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { SemanticGraphBuilder, effectsOf } = await import("../dist/semantic/SemanticGraph.js");

function node(id) {
  return { id, kind: "flow", name: id };
}

describe("semantic effectsOf", () => {
  it("positive: returns declaresEffect labels for the flow", () => {
    const graph = new SemanticGraphBuilder()
      .addNode(node("flow"))
      .addEdge({ from: "flow", to: "fs", kind: "declaresEffect", label: "fs.read" })
      .addEdge({ from: "flow", to: "net", kind: "declaresEffect", label: "net.http" })
      .addEdge({ from: "flow", to: "fs", kind: "calls" })
      .build();
    assert.deepEqual([...effectsOf(graph, "flow")].sort(), ["fs.read", "net.http"]);
  });

  it("hostile: unused-kind outbound edges are not effects", () => {
    const b = new SemanticGraphBuilder().addNode(node("flow"));
    const n = 400;
    for (let i = 0; i < n; i++) {
      b.addEdge({ from: "flow", to: `x${i}`, kind: "calls" });
    }
    b.addEdge({ from: "flow", to: "secret", kind: "declaresEffect", label: "secret.read" });
    const started = Date.now();
    const hits = effectsOf(b.build(), "flow");
    assert.ok(Date.now() - started < 200);
    assert.deepEqual(hits, ["secret.read"]);
  });
});
