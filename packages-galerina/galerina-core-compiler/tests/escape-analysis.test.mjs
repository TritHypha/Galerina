// =============================================================================
// escape-analysis.test.mjs — the accepted gate for the #96 §a / RD-0446 / #128
// flow-local record escape analysis (increment 1: the pure predicate).
// =============================================================================
// NON-VACUOUS by construction: NEG-1..3 assert recordEscapes === true (the cases
// that keep #128 shut — a mis-classified escaping record would dangle), POS-1
// asserts === false (proves the pass is not "everything escapes", which would be
// safe but make the whole bump-arena dead). The GUARD asserts the redundant
// emit-time guard fires on an escaping record and passes a flow-local one.
//
// Tests the PREDICATE VALUE (recordEscapes true/false) — NOT emit behaviour —
// because increment 1 makes no emitter change (see escape-analysis.ts header +
// the 2026-07-17 grounding: the record-literal site already heap-bumps; the
// arena-vs-host-reset FORK is increment 2). Parses real .fungi via parseProgram
// so the analysis runs over the real AST node shapes, not hand-built nodes.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  recordEscapes,
  computeAliases,
  collectRecordAllocSites,
  assertFlowLocal,
} from "../dist/index.js";

const FLOW_KINDS = new Set([
  "pureFlowDecl",
  "flowDecl",
  "secureFlowDecl",
  "guardedFlowDecl",
  "governedFlowDecl",
]);

/** Parse a .fungi source and return the body block of the flow named `flowName` (default "f").
 *  (Sources may declare helper flows too, e.g. NEG-2's `g` — so select by name, not first-found.) */
function bodyOf(source, flowName = "f") {
  const { ast, diagnostics } = parseProgram(source, "escape-test.fungi");
  const errs = (diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `unexpected parse errors: ${errs.map((e) => e.message).join(" | ")}`);
  let flow;
  const walk = (n) => {
    if (!n || flow) return;
    if (FLOW_KINDS.has(n.kind) && n.value === flowName) { flow = n; return; }
    (n.children ?? []).forEach(walk);
  };
  walk(ast);
  assert.ok(flow, `no flow named '${flowName}' found in source`);
  const body = (flow.children ?? []).find((c) => c.kind === "block");
  assert.ok(body, "flow has no block body");
  return body;
}

describe("escape-analysis — recordEscapes (RD-0446 §a / #128, fail-closed)", () => {
  it("NEG-1: a returned record ESCAPES (return r)", () => {
    const body = bodyOf(`@version 1\nrecord Rec { a }\npure flow f() -> Rec {\n  let r = Rec { a: 1 }\n  return r\n}`);
    assert.equal(collectRecordAllocSites(body).includes("r"), true, "r is a record alloc site");
    assert.equal(recordEscapes("r", body), true, "r escapes via return");
  });

  it("NEG-2: a record passed to another flow ESCAPES (g(r))", () => {
    const body = bodyOf(
      `@version 1\nrecord Rec { a }\npure flow g(x: Rec) -> Int { return 0 }\n` +
        `pure flow f() -> Int {\n  let r = Rec { a: 1 }\n  let y = g(r)\n  return y\n}`,
    );
    assert.equal(recordEscapes("r", body), true, "r escapes via a cross-flow call argument");
  });

  it("NEG-3: a record embedded in a returned record ESCAPES (Outer { inner: r })", () => {
    const body = bodyOf(
      `@version 1\nrecord Inner { a }\nrecord Outer { inner }\n` +
        `pure flow f() -> Outer {\n  let r = Inner { a: 1 }\n  let w = Outer { inner: r }\n  return w\n}`,
    );
    assert.equal(recordEscapes("r", body), true, "r escapes embedded in the returned record w");
  });

  it("POS-1: a flow-local record (only a scalar field read) does NOT escape", () => {
    const body = bodyOf(`@version 1\nrecord Rec { v }\npure flow f() -> Int {\n  let r = Rec { v: 1 }\n  let x = r.v\n  return x\n}`);
    assert.equal(collectRecordAllocSites(body).includes("r"), true, "r is a record alloc site");
    assert.equal(recordEscapes("r", body), false, "r is flow-local — only a scalar field read leaves, not r");
  });

  it("aliasing: a returned ALIAS of r escapes (let s = r; return s)", () => {
    const body = bodyOf(`@version 1\nrecord Rec { a }\npure flow f() -> Rec {\n  let r = Rec { a: 1 }\n  let s = r\n  return s\n}`);
    assert.equal(computeAliases("r", body).has("s"), true, "s is tracked as an alias of r");
    assert.equal(recordEscapes("r", body), true, "r escapes via its alias s");
  });

  it("GUARD: assertFlowLocal THROWS on an escaping record, passes a flow-local one (non-vacuous)", () => {
    const escBody = bodyOf(`@version 1\nrecord Rec { a }\npure flow f() -> Rec {\n  let r = Rec { a: 1 }\n  return r\n}`);
    assert.throws(() => assertFlowLocal("r", escBody), /escapes its flow/, "guard fires on an escaping record");
    const localBody = bodyOf(`@version 1\nrecord Rec { v }\npure flow f() -> Int {\n  let r = Rec { v: 1 }\n  let x = r.v\n  return x\n}`);
    assert.doesNotThrow(() => assertFlowLocal("r", localBody), "guard passes a flow-local record");
  });
});
