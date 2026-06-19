// =============================================================================
// Flow dependency analysis — //lln:USES / //lln: USEDBY / //lln: IMPACT (R&D 0045)
//
// Per-flow observed call graph from the AST: USES (upstream callees), USEDBY (direct callers /
// "dependants"), IMPACT (transitive downstream blast-radius; 0 = safe to delete). Feeds the
// generated `//lln:` comment vocabulary.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram,
  analyzeFlowDependencies,
  analyzeProgramFlowDependencies,
  renderDependencyComments,
} from "../dist/index.js";

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

describe("analyzeProgramFlowDependencies — cross-file (whole-app) analysis", () => {
  function program(fileMap) {
    const files = Object.entries(fileMap).map(([file, src]) => {
      const p = parseProgram(src, file);
      const errs = p.diagnostics.filter((d) => d.severity === "error");
      assert.equal(errs.length, 0, `${file}: ` + errs.map((e) => e.message).join("; "));
      return { file, ast: p.ast };
    });
    return analyzeProgramFlowDependencies(files);
  }

  it("counts a caller in ANOTHER file as USEDBY (the cross-file fix)", () => {
    // leaf lives in lib.lln and is called only from app.lln. A per-file analysis would say
    // leaf.usedBy = [] → "safe to delete" (a fail-OPEN lie). Cross-file must see the caller.
    const { deps } = program({
      "lib.lln": `pure flow leaf(x: Int) -> Int { return x }`,
      "app.lln": `pure flow main(x: Int) -> Int { return leaf(x) }`,
    });
    assert.deepEqual(deps.get("leaf").usedBy, ["main"], "caller in app.lln is seen");
    assert.equal(deps.get("leaf").impact, 1, "leaf is NOT safe to delete (impact > 0)");
    assert.equal(deps.get("main").impact, 0, "nothing calls main → safe to delete");
  });

  it("attributes each flow to its declaring file", () => {
    const { fileByFlow } = program({
      "lib.lln": `pure flow leaf(x: Int) -> Int { return x }`,
      "app.lln": `pure flow main(x: Int) -> Int { return leaf(x) }`,
    });
    assert.equal(fileByFlow.get("leaf"), "lib.lln");
    assert.equal(fileByFlow.get("main"), "app.lln");
  });

  it("a duplicate flow name across files UNIONS callers (fail-safe — never a false safe-to-delete)", () => {
    // `helper` declared in two files; each is called by a different caller. The union must show
    // BOTH callers, so impact can only be over-counted, never under-counted.
    const { deps } = program({
      "a.lln": `pure flow helper(x: Int) -> Int { return x }\npure flow callA(x: Int) -> Int { return helper(x) }`,
      "b.lln": `pure flow helper(x: Int) -> Int { return x }\npure flow callB(x: Int) -> Int { return helper(x) }`,
    });
    assert.deepEqual(deps.get("helper").usedBy, ["callA", "callB"], "both callers unioned");
    assert.ok(deps.get("helper").impact >= 1, "shared name is never mislabelled safe-to-delete");
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
