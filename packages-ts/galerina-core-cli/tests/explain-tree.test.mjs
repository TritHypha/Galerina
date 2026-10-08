import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXPLAIN_DEPENDENCY_TREE_SCHEMA,
  FUNGI_EXPLAIN_007,
  FUNGI_EXPLAIN_008,
  readExplainDependencyTree,
  explainDependencyTree,
} from "../dist/explain/explain-tree.js";

const validTree = {
  schema: EXPLAIN_DEPENDENCY_TREE_SCHEMA,
  root: "app.main",
  edges: [
    { from: "app.main", to: "lib.core" },
    { from: "lib.core", to: "lib.util" },
  ],
};

describe("readExplainDependencyTree / explainDependencyTree", () => {
  it("explains a closed tree as dependency traces", () => {
    const result = explainDependencyTree(validTree);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.traces.length, 3);
    assert.equal(result.traces[0].label, "dependency");
    assert.equal(result.traces[0].input, "tree.root");
    assert.equal(result.traces[0].output, "app.main");
    assert.equal(result.traces[1].input, "app.main");
    assert.equal(result.traces[1].output, "lib.core");
    assert.equal(result.traces[2].output, "lib.util");
  });

  it("refuses hostile shapes, unknown keys, cycles, unreachable from, and self-loops without echo", () => {
    const badSchema = readExplainDependencyTree({ ...validTree, schema: "nope" });
    assert.equal(badSchema.ok, false);
    assert.equal(badSchema.diagnostics[0].code, FUNGI_EXPLAIN_007);
    assert.equal(JSON.stringify(badSchema.diagnostics).includes("nope"), false);

    const unknown = readExplainDependencyTree({ ...validTree, extra: true });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.diagnostics[0].code, FUNGI_EXPLAIN_007);

    const cycle = readExplainDependencyTree({
      schema: EXPLAIN_DEPENDENCY_TREE_SCHEMA,
      root: "a",
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    });
    assert.equal(cycle.ok, false);
    assert.equal(cycle.diagnostics[0].code, FUNGI_EXPLAIN_008);

    const unreachable = readExplainDependencyTree({
      schema: EXPLAIN_DEPENDENCY_TREE_SCHEMA,
      root: "a",
      edges: [{ from: "z", to: "b" }],
    });
    assert.equal(unreachable.ok, false);
    assert.equal(unreachable.diagnostics[0].code, FUNGI_EXPLAIN_008);
    assert.equal(JSON.stringify(unreachable.diagnostics).includes("z"), false);

    const loop = readExplainDependencyTree({
      schema: EXPLAIN_DEPENDENCY_TREE_SCHEMA,
      root: "a",
      edges: [{ from: "a", to: "a" }],
    });
    assert.equal(loop.ok, false);
    assert.equal(loop.diagnostics[0].code, FUNGI_EXPLAIN_008);

    const accessor = {};
    Object.defineProperty(accessor, "schema", {
      get() {
        throw new Error("boom");
      },
      enumerable: true,
    });
    const hostile = explainDependencyTree(accessor);
    assert.ok(hostile.diagnostics.length > 0);
    assert.equal(hostile.traces.length, 0);
  });

  it("never throws on flipping proxies", () => {
    let flips = 0;
    const proxy = new Proxy(
      { schema: EXPLAIN_DEPENDENCY_TREE_SCHEMA, root: "a", edges: [] },
      {
        get(t, p, r) {
          flips += 1;
          if (flips > 3 && p === "edges") return [{ from: "a", to: "!!" }];
          return Reflect.get(t, p, r);
        },
        ownKeys(t) {
          return Reflect.ownKeys(t);
        },
        getOwnPropertyDescriptor(t, p) {
          return Reflect.getOwnPropertyDescriptor(t, p);
        },
      },
    );
    assert.doesNotThrow(() => explainDependencyTree(proxy));
  });
});
