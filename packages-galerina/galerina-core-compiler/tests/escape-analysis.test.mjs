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
  collectRecordFieldTypes,
  collectRecordLiterals,
  windowIsArenaSafe,
} from "../dist/index.js";

const FLOW_KINDS = new Set([
  "pureFlowDecl",
  "flowDecl",
  "secureFlowDecl",
  "guardedFlowDecl",
  "governedFlowDecl",
]);

/** Parse a .fungi source; return { ast, body } for the flow named `flowName` (default "f").
 *  (Sources may declare helper flows too, e.g. NEG-2's `g` — so select by name, not first-found.) */
function parseOf(source, flowName = "f") {
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
  return { ast, body };
}

const bodyOf = (source, flowName = "f") => parseOf(source, flowName).body;

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

// ── the WINDOW gate — the SUFFICIENT half (R&D #128 finding, 2026-07-17) ──────
// recordEscapes is NECESSARY but field-type-blind and only sees let/mut-BOUND records,
// so an ANONYMOUS nested literal slips through. These assert the window gate closes
// that hole BY CONSTRUCTION (default-OFF), not by benchmark luck.
describe("escape-analysis — windowIsArenaSafe (the sufficient half, fail-closed)", () => {
  const CASE_A =
    `@version 1\nrecord Inner { a: Int }\nrecord Box { item: Inner }\n` +
    `pure flow f() -> Inner {\n  let b = Box { item: Inner { a: 1 } }\n  return b.item\n}`;

  it("field types are read from the record decls (recordDecl → paramDecl 'name: Type')", () => {
    const { ast } = parseOf(CASE_A);
    const ft = collectRecordFieldTypes(ast);
    assert.equal(ft.get("Inner")?.get("a"), "Int", "Inner.a is Int");
    assert.equal(ft.get("Box")?.get("item"), "Inner", "Box.item is a RECORD type");
  });

  it("collectRecordLiterals sees the ANONYMOUS nested literal that collectRecordAllocSites misses", () => {
    const { body } = parseOf(CASE_A);
    assert.deepEqual(collectRecordAllocSites(body), ["b"], "only the NAMED record is an alloc site");
    assert.equal(collectRecordLiterals(body).length, 2, "but there are TWO literals — Box AND the anonymous Inner");
  });

  it("R&D #128 CASE A: recordEscapes says b is flow-local, yet the window gate REFUSES it (the hole is closed)", () => {
    const { ast, body } = parseOf(CASE_A);
    // The per-record predicate alone is NOT sufficient — this is exactly the hole:
    assert.equal(recordEscapes("b", body), false, "b really is flow-local by the per-record contract");
    // …but b.item hands out the anonymous Inner's pointer, so the WINDOW must not be reclaimed:
    assert.equal(
      windowIsArenaSafe(body, collectRecordFieldTypes(ast)), false,
      "Box.item is record-typed → window NOT arena-safe → no per-iteration reset → no #128",
    );
  });

  it("the rewritten record-allocation shape (scalar-only fields, in a loop) IS arena-safe", () => {
    const { ast, body } = parseOf(
      `@version 1\nrecord Rec { v: Int }\npure flow f() -> Int {\n  mut total: Int = 0\n  mut i: Int = 0\n` +
        `  while i < 10 {\n    let r = Rec { v: i }\n    total = total + r.v\n    i = i + 1\n  }\n  return total\n}`,
    );
    assert.equal(windowIsArenaSafe(body, collectRecordFieldTypes(ast)), true,
      "all-scalar record in an intra-flow loop → reclaimable → alloc-count==N reachable");
  });

  it("a non-proven-scalar field type (String) closes the gate (fail-closed, not guessed)", () => {
    const { ast, body } = parseOf(
      `@version 1\nrecord S { s: String }\npure flow f() -> Int {\n  let r = S { s: "x" }\n  return 1\n}`,
    );
    assert.equal(windowIsArenaSafe(body, collectRecordFieldTypes(ast)), false,
      "String is a handle/pointer, not a proven-scalar slot → gate closed");
  });

  it("an unknown/unresolvable record type closes the gate (DEFAULT-OFF)", () => {
    const { body } = parseOf(`@version 1\nrecord Rec { v: Int }\npure flow f() -> Int {\n  let r = Rec { v: 1 }\n  return r.v\n}`);
    assert.equal(windowIsArenaSafe(body, new Map()), false,
      "no field-type info → cannot PROVE clean → gate closed");
  });

  it("a window with no record literals is vacuously safe (nothing to reclaim unsafely)", () => {
    const { ast, body } = parseOf(`@version 1\npure flow f() -> Int {\n  let x: Int = 1\n  return x\n}`);
    assert.equal(windowIsArenaSafe(body, collectRecordFieldTypes(ast)), true);
  });
});
