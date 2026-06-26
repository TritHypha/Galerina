/**
 * Phase 32 — Governance Diff tests
 *
 * Verifies diffGovernance detects added/removed/changed flows and correctly
 * flags authority widening (added effects, escalated qualifier).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseProgram, diffGovernance, renderGovernanceDiff } from "../dist/index.js";

function diff(beforeSrc, afterSrc) {
  const before = parseProgram(beforeSrc, "before.spore");
  const after = parseProgram(afterSrc, "after.spore");
  return diffGovernance(before.flows, after.flows);
}

describe("Phase 32: governance diff — added flows", () => {
  it("detects an added flow", () => {
    const d = diff(
      "pure flow a(x: Int) -> Int contract { effects {} } { return x }",
      ["pure flow a(x: Int) -> Int contract { effects {} } { return x }",
       "secure flow b(x: Int) -> Int contract { effects { database.write } } { return x }"].join("\n"),
    );
    assert.equal(d.added.length, 1);
    assert.equal(d.added[0].name, "b");
    assert.ok(d.added[0].widensAuthority, "secure flow with effects widens authority");
  });

  it("a pure added flow with no effects does not widen authority", () => {
    const d = diff(
      "pure flow a(x: Int) -> Int contract { effects {} } { return x }",
      ["pure flow a(x: Int) -> Int contract { effects {} } { return x }",
       "pure flow b(x: Int) -> Int contract { effects {} } { return x }"].join("\n"),
    );
    assert.equal(d.added.length, 1);
    assert.ok(!d.added[0].widensAuthority, "pure no-effect flow does not widen");
  });
});

describe("Phase 32: governance diff — removed flows", () => {
  it("detects a removed flow and never flags it as widening", () => {
    const d = diff(
      ["secure flow a(x: Int) -> Int contract { effects { database.write } } { return x }",
       "secure flow b(x: Int) -> Int contract { effects { audit.write } } { return x }"].join("\n"),
      "secure flow a(x: Int) -> Int contract { effects { database.write } } { return x }",
    );
    assert.equal(d.removed.length, 1);
    assert.equal(d.removed[0].name, "b");
    assert.ok(!d.removed[0].widensAuthority, "removal never widens authority");
  });
});

describe("Phase 32: governance diff — changed flows", () => {
  it("detects added effect (authority widening)", () => {
    const d = diff(
      "secure flow o(x: Int) -> Int contract { effects { database.write } } { return x }",
      "secure flow o(x: Int) -> Int contract { effects { database.write payment.charge } } { return x }",
    );
    assert.equal(d.changed.length, 1);
    assert.deepEqual(d.changed[0].effectsAdded, ["payment.charge"]);
    assert.ok(d.changed[0].widensAuthority);
    assert.ok(d.widensAuthority, "overall diff widens authority");
  });

  it("detects removed effect (does not widen)", () => {
    const d = diff(
      "secure flow o(x: Int) -> Int contract { effects { database.write payment.charge } } { return x }",
      "secure flow o(x: Int) -> Int contract { effects { database.write } } { return x }",
    );
    assert.equal(d.changed.length, 1);
    assert.deepEqual(d.changed[0].effectsRemoved, ["payment.charge"]);
    assert.ok(!d.changed[0].widensAuthority, "removing an effect narrows, does not widen");
  });

  it("no governance change → no delta", () => {
    const src = "secure flow o(x: Int) -> Int contract { effects { database.write } } { return x }";
    const d = diff(src, src);
    assert.equal(d.changed.length, 0);
    assert.equal(d.added.length, 0);
    assert.equal(d.removed.length, 0);
    assert.ok(!d.widensAuthority);
  });
});

describe("Phase 32: diff output + schema", () => {
  it("schemaVersion is lln.govdiff.v1", () => {
    const d = diff("pure flow a() -> Int contract { effects {} } { return 1 }",
                   "pure flow a() -> Int contract { effects {} } { return 1 }");
    assert.equal(d.schemaVersion, "lln.govdiff.v1");
  });

  it("renderGovernanceDiff produces readable text with warning flag", () => {
    const d = diff(
      "secure flow o(x: Int) -> Int contract { effects { database.write } } { return x }",
      "secure flow o(x: Int) -> Int contract { effects { database.write payment.charge } } { return x }",
    );
    const text = renderGovernanceDiff(d);
    assert.ok(text.includes("WIDENS AUTHORITY"), "must flag authority widening");
    assert.ok(text.includes("+payment.charge"), "must show the added effect");
  });

  it("summary reflects counts", () => {
    const d = diff(
      "secure flow a(x: Int) -> Int contract { effects { database.write } } { return x }",
      ["secure flow a(x: Int) -> Int contract { effects { database.write audit.write } } { return x }",
       "secure flow b(x: Int) -> Int contract { effects {} } { return x }"].join("\n"),
    );
    assert.ok(d.summary.includes("added"));
    assert.ok(d.summary.includes("changed"));
  });
});
