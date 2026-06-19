// =============================================================================
// Flow dependency analysis — //lln:USES / //lln: USEDBY / //lln: IMPACT (R&D 0045)
//
// Per-flow observed call graph from the AST: USES (upstream callees), USEDBY (direct callers /
// "dependants"), IMPACT (transitive downstream blast-radius; 0 = safe to delete). Feeds the
// generated `//lln:` comment vocabulary.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseProgram, analyzeFlowDependencies, renderDependencyComments } from "../dist/index.js";

function deps(src) {
  const p = parseProgram(src, "deps.lln");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  return analyzeFlowDependencies(p.ast);
}

const CHAIN = `
pure flow leaf(x: Int) -> Int { return x }
pure flow mid(x: Int) -> Int { return leaf(x) }
pure flow top(x: Int) -> Int { return mid(x) }
`;

describe("flow dependency analysis — USES / USEDBY / IMPACT", () => {
  it("USES = the upstream flows THIS flow calls", () => {
    const d = deps(CHAIN);
    assert.deepEqual(d.get("top").uses, ["mid"]);
    assert.deepEqual(d.get("mid").uses, ["leaf"]);
    assert.deepEqual(d.get("leaf").uses, []);
  });

  it("USEDBY = the direct callers (dependants)", () => {
    const d = deps(CHAIN);
    assert.deepEqual(d.get("leaf").usedBy, ["mid"]);
    assert.deepEqual(d.get("mid").usedBy, ["top"]);
    assert.deepEqual(d.get("top").usedBy, []);
  });

  it("IMPACT = transitive downstream; 0 means safe to delete", () => {
    const d = deps(CHAIN);
    assert.equal(d.get("leaf").impact, 2, "leaf is reached transitively by mid + top");
    assert.equal(d.get("mid").impact, 1, "mid is reached by top");
    assert.equal(d.get("top").impact, 0, "nothing depends on top → safe to delete");
  });

  it("recursion (a self-call) is NOT a USES/USEDBY edge", () => {
    const d = deps(`pure flow fib(n: Int) -> Int { return fib(n) }`);
    assert.deepEqual(d.get("fib").uses, []);
    assert.deepEqual(d.get("fib").usedBy, []);
    assert.equal(d.get("fib").impact, 0);
  });

  it("a diamond aggregates transitive impact, cycle-safe", () => {
    // a→b→d ; c→d ; nothing calls a or c
    const d = deps(`
pure flow d(x: Int) -> Int { return x }
pure flow b(x: Int) -> Int { return d(x) }
pure flow c(x: Int) -> Int { return d(x) }
pure flow a(x: Int) -> Int { return b(x) }
`);
    assert.deepEqual(d.get("d").usedBy, ["b", "c"]);
    assert.equal(d.get("d").impact, 3, "d reached by b, c, and a (via b)");
    assert.equal(d.get("a").impact, 0);
    assert.equal(d.get("c").impact, 0);
  });

  it("stdlib / method calls are not flow dependencies", () => {
    // `x + 1` and any non-flow name must not appear as a USES edge.
    const d = deps(`pure flow solo(x: Int) -> Int { return x + 1 }`);
    assert.deepEqual(d.get("solo").uses, []);
    assert.deepEqual(d.get("solo").usedBy, []);
  });
});

describe("renderDependencyComments — the canonical //lln: lines", () => {
  it("renders //lln: USES, //lln: USEDBY and //lln: IMPACT in the canonical form", () => {
    const d = deps(CHAIN);
    assert.deepEqual(renderDependencyComments(d.get("mid")), [
      "//lln: USES: (1) leaf",
      "//lln: USEDBY: (1) top",
      "//lln: IMPACT: (1)",
    ]);
  });

  it("omits empty USES/USEDBY and flags safe-to-delete at IMPACT 0", () => {
    const d = deps(CHAIN);
    assert.deepEqual(renderDependencyComments(d.get("top")), [
      "//lln: USES: (1) mid",
      "//lln: IMPACT: (0) — safe to delete",
    ]);
    assert.deepEqual(renderDependencyComments(d.get("leaf")), [
      "//lln: USEDBY: (1) mid",
      "//lln: IMPACT: (2)",
    ]);
  });
});
