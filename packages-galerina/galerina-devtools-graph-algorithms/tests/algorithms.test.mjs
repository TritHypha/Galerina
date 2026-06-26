import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { GraphBuilder } = await import("../dist/core/builder.js");
const { bfsPath, bfsReachable } = await import("../dist/algorithms/bfs.js");
const { detectCycle, dfsVisit } = await import("../dist/algorithms/dfs.js");
const { topoSort } = await import("../dist/algorithms/topo.js");
const { canReach, allReachable } = await import("../dist/algorithms/reach.js");

// Helper: build a simple directed graph from an edge list
function buildGraph(nodeIds, edges) {
  const b = new GraphBuilder();
  for (const id of nodeIds) b.addNode(id, { id });
  for (const [f, t] of edges) b.addEdge(f, t, {});
  return b.build();
}

// ─── BFS ───────────────────────────────────────────────────────────────────

describe("bfsPath", () => {
  it("finds the shortest path in a simple graph", () => {
    const g = buildGraph(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["c", "d"]]);
    assert.deepEqual(bfsPath(g, "a", "d"), ["a", "b", "c", "d"]);
  });

  it("returns a single-node path when from === to", () => {
    const g = buildGraph(["a"], []);
    assert.deepEqual(bfsPath(g, "a", "a"), ["a"]);
  });

  it("returns null for unreachable target", () => {
    const g = buildGraph(["a", "b"], []);
    assert.equal(bfsPath(g, "a", "b"), null);
  });

  it("returns null when source node does not exist", () => {
    const g = buildGraph(["a"], []);
    assert.equal(bfsPath(g, "z", "a"), null);
  });

  it("prefers shorter path over longer alternative", () => {
    // a→b→c and a→c; shortest a→c is length 2
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c"]]);
    const path = bfsPath(g, "a", "c");
    assert.deepEqual(path, ["a", "c"]);
  });
});

describe("bfsReachable", () => {
  it("returns all reachable nodes including start", () => {
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    const reach = bfsReachable(g, "a");
    assert.deepEqual([...reach].sort(), ["a", "b", "c"]);
  });

  it("returns empty set for nonexistent node", () => {
    const g = buildGraph(["a"], []);
    assert.equal(bfsReachable(g, "z").size, 0);
  });
});

// ─── DFS ───────────────────────────────────────────────────────────────────

describe("dfsVisit", () => {
  it("visits all reachable nodes in post-order", () => {
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    const visited = [];
    dfsVisit(g, "a", (node) => visited.push(node.id));
    // post-order: c before b before a
    assert.deepEqual(visited, ["c", "b", "a"]);
  });

  it("does nothing for nonexistent start", () => {
    const g = buildGraph(["a"], []);
    const visited = [];
    dfsVisit(g, "z", (node) => visited.push(node.id));
    assert.equal(visited.length, 0);
  });
});

describe("detectCycle", () => {
  it("returns hasCycle false for a DAG", () => {
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    const result = detectCycle(g);
    assert.equal(result.hasCycle, false);
    assert.equal(result.cycle, undefined);
  });

  it("returns hasCycle true for a self-loop", () => {
    const g = buildGraph(["a"], [["a", "a"]]);
    const result = detectCycle(g);
    assert.equal(result.hasCycle, true);
    assert.ok(Array.isArray(result.cycle));
  });

  it("returns hasCycle true for a 3-node cycle and provides cycle array", () => {
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
    const result = detectCycle(g);
    assert.equal(result.hasCycle, true);
    assert.ok(result.cycle && result.cycle.length >= 2);
  });

  it("returns hasCycle false for an empty graph", () => {
    const g = buildGraph([], []);
    assert.equal(detectCycle(g).hasCycle, false);
  });
});

// ─── TOPO ──────────────────────────────────────────────────────────────────

describe("topoSort", () => {
  it("returns a valid topological order for a DAG", () => {
    const g = buildGraph(["a", "b", "c", "d"], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    const { order, cycle } = topoSort(g);
    assert.equal(cycle, undefined);
    assert.equal(order.length, 4);
    // a must come before b, c; b and c before d
    const pos = (id) => order.indexOf(id);
    assert.ok(pos("a") < pos("b"));
    assert.ok(pos("a") < pos("c"));
    assert.ok(pos("b") < pos("d"));
    assert.ok(pos("c") < pos("d"));
  });

  it("returns cycle info for a cyclic graph", () => {
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
    const { cycle } = topoSort(g);
    assert.ok(Array.isArray(cycle) && cycle.length > 0);
  });

  it("handles a single-node graph", () => {
    const g = buildGraph(["solo"], []);
    const { order, cycle } = topoSort(g);
    assert.equal(cycle, undefined);
    assert.deepEqual(order, ["solo"]);
  });
});

// ─── REACH ─────────────────────────────────────────────────────────────────

describe("canReach", () => {
  it("returns true when target is reachable", () => {
    const g = buildGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    assert.equal(canReach(g, "a", "c"), true);
  });

  it("returns false when target is unreachable", () => {
    const g = buildGraph(["a", "b"], []);
    assert.equal(canReach(g, "a", "b"), false);
  });

  it("returns true when from === to and node exists", () => {
    const g = buildGraph(["x"], []);
    assert.equal(canReach(g, "x", "x"), true);
  });

  it("returns false for nonexistent nodes", () => {
    const g = buildGraph(["a"], []);
    assert.equal(canReach(g, "z", "a"), false);
  });
});

describe("allReachable", () => {
  it("returns all reachable nodes from start", () => {
    const g = buildGraph(["a", "b", "c", "d"], [["a", "b"], ["b", "c"]]);
    const r = allReachable(g, "a");
    assert.ok(r.has("a"));
    assert.ok(r.has("b"));
    assert.ok(r.has("c"));
    assert.ok(!r.has("d")); // not connected
  });
});
