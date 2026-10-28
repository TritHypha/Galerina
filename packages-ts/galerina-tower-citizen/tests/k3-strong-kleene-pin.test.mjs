// K3 STRONG KLEENE truth-table pin (test-only). Decision: Phillip 2026-10-28 ~17:00 GMT, confirmed by the
// external security review. Order DENY < UNKNOWN < ALLOW; AND = min, OR = max, NOT swaps ALLOW/DENY and
// keeps UNKNOWN. Gates refuse UNKNOWN; a recorded DENY cannot become ALLOW in the same request.
// Refs: XACML deny-overrides, CWE-636. Wire encoding unchanged (ALLOW 0x01, DENY 0xFF, UNKNOWN 0x80).
// Runs the test-only fixture tests/fixtures/k3-strong-kleene.test-only.fungi through the Fungi
// interpreter. The shipped effective-verdict.fungi / verdict-or.fungi are strong Kleene too (pinned by their
// conversion tests); the frozen TS vAnd/vOr remain infectious-UNKNOWN as a known-divergent reference
// (see docs/architecture/k3-lattice-decisions-2026-10-28.md 3.0).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import "./prebuild-k3-strong-kleene-pin.mjs";
import { executeFlow, parseProgram } from "../../galerina-core-compiler/dist/index.js";
import { nativeImages } from "./fixtures/k3-fungi-marshal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "fixtures", "k3-strong-kleene.test-only.fungi");
const D = "DENY", U = "UNKNOWN", A = "ALLOW";
const ALL = Object.freeze([D, U, A]);
const RANK = Object.freeze({ DENY: 0, UNKNOWN: 1, ALLOW: 2 });

const AND = Object.freeze([
  [D, D, D], [D, U, D], [D, A, D],
  [U, D, D], [U, U, U], [U, A, U],
  [A, D, D], [A, U, U], [A, A, A],
]);
const OR = Object.freeze([
  [D, D, D], [D, U, U], [D, A, A],
  [U, D, U], [U, U, U], [U, A, A],
  [A, D, A], [A, U, A], [A, A, A],
]);
const NOT = Object.freeze([[D, A], [U, U], [A, D]]);

let program;
function compile() {
  if (program) return program;
  const p = parseProgram(readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, ""), "k3-strong-kleene.test-only.fungi");
  assert.deepEqual((p.diagnostics ?? []).filter((d) => d.severity === "error"), []);
  program = p;
  return p;
}
async function img() {
  const i = await nativeImages();
  return { DENY: i.deny, UNKNOWN: i.unknown, ALLOW: i.allow };
}
async function run(flow, args) {
  const p = compile();
  const i = await img();
  const params = { skNot: ["a"], skGate: ["a"], skAnd: ["a", "b"], skOr: ["a", "b"], skRequest: ["first", "second", "third"] }[flow];
  const r = await executeFlow(flow, new Map(params.map((n, k) => [n, i[args[k]]])), p.ast, p.flows);
  for (const name of ALL) if (JSON.stringify(r.value) === JSON.stringify(i[name])) return name;
  throw new Error(`not a native Verdict from ${flow}`);
}

describe("K3 strong Kleene pin (test-only .fungi)", () => {
  it("AND = minimum: all 9 cases (DENY AND UNKNOWN = DENY)", async () => {
    for (const [a, b, e] of AND) assert.equal(await run("skAnd", [a, b]), e, `${a} AND ${b}`);
    assert.equal(AND.length, 9);
  });
  it("OR = maximum: all 9 cases (ALLOW OR UNKNOWN = ALLOW)", async () => {
    for (const [a, b, e] of OR) assert.equal(await run("skOr", [a, b]), e, `${a} OR ${b}`);
    assert.equal(OR.length, 9);
  });
  it("NOT: all 3 cases (NOT UNKNOWN = UNKNOWN)", async () => {
    for (const [a, e] of NOT) assert.equal(await run("skNot", [a]), e, `NOT ${a}`);
  });
  it("tables are exactly min / max over DENY < UNKNOWN < ALLOW", () => {
    for (const [a, b, e] of AND) assert.equal(RANK[e], Math.min(RANK[a], RANK[b]));
    for (const [a, b, e] of OR) assert.equal(RANK[e], Math.max(RANK[a], RANK[b]));
    for (const [a, e] of NOT) assert.equal(RANK[e], 2 - RANK[a]);
  });
  it("gate refuses UNKNOWN and DENY; only ALLOW passes", async () => {
    assert.equal(await run("skGate", [A]), A);
    assert.equal(await run("skGate", [U]), D);
    assert.equal(await run("skGate", [D]), D);
  });
  it("a recorded DENY is sticky within one request (all 27 triples)", async () => {
    for (const x of ALL) for (const y of ALL) for (const z of ALL) {
      const got = await run("skRequest", [x, y, z]);
      const hasDeny = [x, y, z].includes(D);
      const allAllow = x === A && y === A && z === A;
      if (hasDeny) assert.equal(got, D, `DENY sticky: ${x},${y},${z}`);
      assert.equal(got === A, allAllow, `only all-ALLOW admits: ${x},${y},${z}`);
    }
  });
  it("monotone: refining an UNKNOWN never changes a definite result and never lifts a DENY", async () => {
    for (const op of ["skAnd", "skOr"]) for (const a of ALL) for (const b of ALL) {
      const before = await run(op, [a, b]);
      const refinements = [];
      for (const ra of a === U ? [D, A] : [a]) for (const rb of b === U ? [D, A] : [b]) refinements.push([ra, rb]);
      for (const [ra, rb] of refinements) {
        const after = await run(op, [ra, rb]);
        if (before !== U) assert.equal(after, before, `${op}(${a},${b}) -> (${ra},${rb})`);
        if (op === "skAnd" && (a === D || b === D)) assert.equal(after, D, `DENY never lifted: ${a},${b}`);
        if (op === "skAnd" && (a === U || b === U)) assert.notEqual(before, A, "UNKNOWN never ALLOW under AND");
      }
    }
  });
});