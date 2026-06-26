import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We test from dist/ (compiled output)
const { GraphBuilder } = await import("../dist/core/builder.js");

describe("GraphBuilder – addNode / addEdge", () => {
  it("adds nodes and reports correct nodeCount", () => {
    const g = new GraphBuilder()
      .addNode("a", { label: "A" })
      .addNode("b", { label: "B" })
      .build();
    assert.equal(g.nodeCount, 2);
  });

  it("adds edges and reports correct edgeCount", () => {
    const g = new GraphBuilder()
      .addNode("a", {})
      .addNode("b", {})
      .addEdge("a", "b", { weight: 1 })
      .build();
    assert.equal(g.edgeCount, 1);
  });

  it("duplicate node id replaces data", () => {
    const g = new GraphBuilder()
      .addNode("x", { v: 1 })
      .addNode("x", { v: 2 })
      .build();
    assert.equal(g.nodeCount, 1);
    assert.deepEqual(g.node("x")?.data, { v: 2 });
  });

  it("node() returns undefined for unknown id", () => {
    const g = new GraphBuilder().addNode("a", {}).build();
    assert.equal(g.node("missing"), undefined);
  });

  it("hasNode() is true for existing node", () => {
    const g = new GraphBuilder().addNode("x", {}).build();
    assert.equal(g.hasNode("x"), true);
  });

  it("hasNode() is false for missing node", () => {
    const g = new GraphBuilder().addNode("x", {}).build();
    assert.equal(g.hasNode("y"), false);
  });

  it("outEdges returns edges from a node", () => {
    const g = new GraphBuilder()
      .addNode("a", {})
      .addNode("b", {})
      .addNode("c", {})
      .addEdge("a", "b", { w: 1 })
      .addEdge("a", "c", { w: 2 })
      .build();
    assert.equal(g.outEdges("a").length, 2);
    assert.equal(g.outEdges("b").length, 0);
  });

  it("inEdges returns edges into a node", () => {
    const g = new GraphBuilder()
      .addNode("a", {})
      .addNode("b", {})
      .addNode("c", {})
      .addEdge("a", "c", {})
      .addEdge("b", "c", {})
      .build();
    assert.equal(g.inEdges("c").length, 2);
    assert.equal(g.inEdges("a").length, 0);
  });

  it("build() returns an immutable snapshot – further builder mutations don't affect it", () => {
    const builder = new GraphBuilder().addNode("a", {}).addNode("b", {});
    const g = builder.build();
    builder.addNode("c", {});
    assert.equal(g.nodeCount, 2);
  });

  it("nodes() returns all nodes", () => {
    const g = new GraphBuilder()
      .addNode("a", { v: 1 })
      .addNode("b", { v: 2 })
      .build();
    const ids = g.nodes().map((n) => n.id).sort();
    assert.deepEqual(ids, ["a", "b"]);
  });

  it("edges() returns all edges", () => {
    const g = new GraphBuilder()
      .addNode("a", {})
      .addNode("b", {})
      .addEdge("a", "b", { x: 42 })
      .build();
    assert.equal(g.edges().length, 1);
    assert.equal(g.edges()[0].from, "a");
    assert.equal(g.edges()[0].to, "b");
  });
});

describe("toJSON / fromJSON roundtrip", () => {
  it("serialises and deserialises faithfully", () => {
    const original = new GraphBuilder()
      .addNode("x", { name: "X" })
      .addNode("y", { name: "Y" })
      .addEdge("x", "y", { label: "edge" })
      .build();

    const json = original.toJSON();
    assert.equal(json.schemaVersion, "spore.graph.v1");

    const restored = GraphBuilder.fromJSON(json);
    assert.equal(restored.nodeCount, original.nodeCount);
    assert.equal(restored.edgeCount, original.edgeCount);
    assert.deepEqual(restored.node("x")?.data, { name: "X" });
    assert.deepEqual(restored.edges()[0].data, { label: "edge" });
  });
});
