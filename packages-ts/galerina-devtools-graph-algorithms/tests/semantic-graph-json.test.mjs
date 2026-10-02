import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  SemanticGraphBuilder,
  graphToJSON,
  graphFromJSON,
  MAX_SEMANTIC_GRAPH_JSON_BYTES,
  MAX_SEMANTIC_GRAPH_JSON_DEPTH,
  MAX_SEMANTIC_GRAPH_NODES,
} = await import("../dist/semantic/SemanticGraph.js");

describe("semantic graphFromJSON admission", () => {
  it("positive: round-trips a small graph", () => {
    const graph = new SemanticGraphBuilder()
      .addNode({ id: "a", kind: "flow", name: "a" })
      .addEdge({ from: "a", to: "a", kind: "calls" })
      .build();
    const again = graphFromJSON(graphToJSON(graph));
    assert.equal(again.schemaVersion, "1.0");
    assert.equal(again.nodes.length, 1);
    assert.equal(again.edges.length, 1);
    assert.equal(again.nodes[0].id, "a");
  });

  it("hostile: oversize JSON is refused before parse", () => {
    const huge = "x".repeat(MAX_SEMANTIC_GRAPH_JSON_BYTES + 1);
    assert.throws(() => graphFromJSON(huge), /host byte bound/);
  });

  it("hostile: node count above the cap is refused", () => {
    const nodes = Array.from({ length: MAX_SEMANTIC_GRAPH_NODES + 1 }, (_, i) => ({
      id: `n${i}`,
      kind: "flow",
      name: `n${i}`,
    }));
    const json = JSON.stringify({ schemaVersion: "1.0", generatedAt: "t", nodes, edges: [] });
    assert.ok(json.length < MAX_SEMANTIC_GRAPH_JSON_BYTES);
    assert.throws(() => graphFromJSON(json), /node count exceeds the host bound/);
  });

  it("hostile: nesting above the depth cap is refused", () => {
    let nested = 1;
    for (let i = 0; i < MAX_SEMANTIC_GRAPH_JSON_DEPTH + 2; i++) nested = [nested];
    const json = JSON.stringify({
      schemaVersion: "1.0",
      generatedAt: "t",
      nodes: [],
      edges: [],
      bomb: nested,
    });
    assert.throws(() => graphFromJSON(json), /host depth bound/);
  });
});
