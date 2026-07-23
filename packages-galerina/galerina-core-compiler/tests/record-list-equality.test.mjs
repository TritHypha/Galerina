// =============================================================================
// Composite structural equality — record/list `==` fail-open regression pin
// =============================================================================
// Bridge 0096: `dispatchKey` mapped every non-scalar tag to the catch-all id 0, so `record==record`
// and `list==list` collided into the `verdict==verdict` BINARY_DISPATCH entry — a WILDCARD that
// compared the (absent) `.value` field: undefined === undefined → two DIFFERENT records/lists compared
// EQUAL. That is a fail-OPEN in any .fungi that gates on record/list equality (a governance check that
// "the submitted record matches the expected record" would pass for ANY record).
//
// Fix (2026-07-23): record→9 / list→10 in dispatchKey pulls them out of the wildcard; they fall through
// to the structural galerinaValuesEqual fallback (records = same keys + recursively-equal values; lists
// = same length + elementwise-equal). verdict/unresolved/enum stay at id 0 DELIBERATELY — the R3
// self-hosted twins depend on that shared wildcard matching their WASM twin (bridge 0097).
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram } from "../dist/parser.js";
import { executeFlow, BINARY_DISPATCH, dispatchKey } from "../dist/interpreter.js";

async function runBool(body) {
  const src = `pure flow qq() -> Bool {\n${body}\n}`;
  const pr = parseProgram(src);
  assert.equal((pr.errors ?? []).length, 0, `probe must parse clean: ${JSON.stringify(pr.errors?.[0] ?? null)}`);
  const r = await executeFlow("qq", new Map(), pr.ast, pr.flows);
  const v = r?.value;
  assert.equal(v?.__tag, "bool", `flow must return a Bool, got ${JSON.stringify(v)}`);
  return v.value;
}

describe("record equality is STRUCTURAL, not a dispatch-wildcard true (bridge 0096 fail-open)", () => {
  it("identical records are equal", async () => {
    assert.equal(await runBool("  let a = { x: 1 }\n  let b = { x: 1 }\n  return a == b"), true);
  });
  it("★ records with a different VALUE are NOT equal (the fixed fail-open)", async () => {
    assert.equal(await runBool("  let a = { x: 1 }\n  let b = { x: 2 }\n  return a == b"), false);
  });
  it("records with a different KEY are NOT equal", async () => {
    assert.equal(await runBool("  let a = { x: 1 }\n  let b = { y: 1 }\n  return a == b"), false);
  });
  it("!= is the dual (different records are !=)", async () => {
    assert.equal(await runBool("  let a = { x: 1 }\n  let b = { x: 2 }\n  return a != b"), true);
  });
  it("nested records compare recursively", async () => {
    assert.equal(await runBool("  let a = { p: { x: 1 } }\n  let b = { p: { x: 2 } }\n  return a == b"), false);
    assert.equal(await runBool("  let a = { p: { x: 1 } }\n  let b = { p: { x: 1 } }\n  return a == b"), true);
  });
});

describe("list equality is STRUCTURAL, not a dispatch-wildcard true", () => {
  it("identical lists are equal", async () => {
    assert.equal(await runBool("  let a = [1, 2]\n  let b = [1, 2]\n  return a == b"), true);
  });
  it("★ lists differing in an element are NOT equal (the fixed fail-open)", async () => {
    assert.equal(await runBool("  let a = [1, 2]\n  let b = [1, 3]\n  return a == b"), false);
  });
  it("lists of different length are NOT equal", async () => {
    assert.equal(await runBool("  let a = [1, 2]\n  let b = [1]\n  return a == b"), false);
  });
});

describe("anti-regression: the verdict/scalar wildcard neighbours are UNTOUCHED", () => {
  it("record and list carry DISTINCT dispatch ids (9, 10) — out of the wildcard 0", () => {
    // The whole fix hinges on record/list NOT sharing the id-0 wildcard with verdict.
    assert.notEqual(dispatchKey("record", "==", "record"), dispatchKey("verdict", "==", "verdict"));
    assert.notEqual(dispatchKey("list", "==", "list"), dispatchKey("verdict", "==", "verdict"));
    // And there is deliberately NO dispatch entry for record/list == (they fall through to the
    // structural fallback), whereas verdict== keeps its real entry.
    assert.equal(BINARY_DISPATCH.has(dispatchKey("record", "==", "record")), false);
    assert.equal(BINARY_DISPATCH.has(dispatchKey("list", "==", "list")), false);
    assert.equal(BINARY_DISPATCH.has(dispatchKey("verdict", "==", "verdict")), true);
  });
  it("verdict == verdict still compares by lattice value (unchanged)", async () => {
    assert.equal(await runBool("  return Verdict.Allow == Verdict.Allow"), true);
    assert.equal(await runBool("  return Verdict.Allow == Verdict.Deny"), false);
  });
});
