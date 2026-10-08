import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as C from "../dist/rd0855-replanning-contracts.js";

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const codes = (d) => d.diagnostics.map((x) => x.code).sort();

const task = (over = {}) => ({
  taskId: "task-1",
  snapshotDigest: digest("a"),
  ...over,
});

const plan = (over = {}) => ({
  taskId: "task-1",
  snapshotDigest: digest("a"),
  tier: "k3-trit",
  tritWidth: 1,
  reentry: "none",
  ...over,
});

describe("RD-0855 sealed snapshot across replanning", () => {
  it("binds an alternative plan to the same immutable snapshot digest", () => {
    const d = C.bindAlternativePlan(task(), plan());
    assert.equal(d.status, "BOUND");
    assert.equal(d.snapshotDigest, digest("a"));
    assert.equal(d.selectedTier, "k3-trit");
    assert.equal(d.authorityReleased, false);
    assert.equal(d.slideAdmission, "not-evaluated");
    assert.equal(d.vokDecision, "not-evaluated");
    assert.equal(d.k3ParityEvidence, "UNPROVEN");
    assert.equal(d.schema, C.RD0855_REPLAN_SCHEMA);
  });

  it("refuses a changed snapshot as a new task, not an alternative", () => {
    const d = C.bindAlternativePlan(task(), plan({ snapshotDigest: digest("b") }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "new-task-not-alternative");
    assert.ok(codes(d).includes("Galerina_COMPILER_REPLAN_NEW_TASK_NOT_ALTERNATIVE"));
    assert.equal(d.selectedTier, "");
  });

  it("refuses source, AST, WAT, runtime and TypeScript re-entry after the snapshot is sealed", () => {
    for (const reentry of ["source", "ast", "wat", "runtime", "typescript"]) {
      const d = C.bindAlternativePlan(task(), plan({ reentry }));
      assert.equal(d.status, "REFUSED", reentry);
      assert.equal(d.keptRefusal, reentry);
      assert.equal(d.diagnostics.length, 1, reentry);
    }
  });

  it("never binds unresolved binary step 3", () => {
    const d = C.bindAlternativePlan(task(), plan({ tier: "binary-same-semantics" }));
    assert.equal(d.status, "REFUSED");
    assert.equal(d.keptRefusal, "binary_step_unresolved");
    assert.ok(codes(d).includes("Galerina_COMPILER_REPLAN_BINARY_STEP_UNRESOLVED"));
  });

  it("refuses unregistered 8 and 16 trit-width profiles", () => {
    for (const tritWidth of [8, 16]) {
      const d = C.bindAlternativePlan(task(), plan({ tritWidth }));
      assert.equal(d.status, "REFUSED", String(tritWidth));
      assert.ok(codes(d).includes("Galerina_COMPILER_REPLAN_WIDTH_UNREGISTERED"), String(tritWidth));
    }
    assert.deepEqual(C.ADMITTED_TRIT_WIDTHS_V1, [1, 32, 64, 256]);
    assert.deepEqual(C.FALLBACK_TIER_ORDER, ["requested-width", "k3-trit", "binary-same-semantics"]);
  });

  it("binds admitted requested-width 32 as the same sealed snapshot", () => {
    const d = C.bindAlternativePlan(task(), plan({ tier: "requested-width", tritWidth: 32 }));
    assert.equal(d.status, "BOUND");
    assert.equal(d.selectedTier, "requested-width");
  });
});

describe("RD-0855 K3 collapse and two-bit carrier", () => {
  it("decodes a two-bit carrier and refuses the unused fourth code", () => {
    assert.deepEqual(C.decodeTwoBitCarrier(0), { ok: true, trit: "false" });
    assert.deepEqual(C.decodeTwoBitCarrier(1), { ok: true, trit: "true" });
    assert.deepEqual(C.decodeTwoBitCarrier(2), { ok: true, trit: "unknown" });
    const bad = C.decodeTwoBitCarrier(3);
    assert.equal(bad.ok, false);
    assert.ok(codes(bad).includes("Galerina_COMPILER_REPLAN_ILLEGAL_CARRIER"));
    assert.equal(C.decodeTwoBitCarrier(4).ok, false);
  });

  it("keeps Kleene NOT of UNKNOWN as UNKNOWN, then final collapse denies", () => {
    assert.equal(C.k3Not("unknown"), "unknown");
    assert.equal(C.k3Not("true"), "false");
    assert.equal(C.k3Not("false"), "true");
    const d = C.k3NotThenFinalCollapse("unknown");
    assert.equal(d.status, "DENY");
    assert.equal(d.allowed, false);
    assert.equal(d.diagnostic, "unknown");
  });

  it("maps only exact ALLOW to true at a permission boundary", () => {
    assert.equal(C.collapseUnknownAtFinalBoundary("true", "final").allowed, true);
    assert.equal(C.collapseUnknownAtFinalBoundary("true", "final").status, "ALLOW");
    assert.equal(C.collapseUnknownAtFinalBoundary("false", "final").allowed, false);
    const u = C.collapseUnknownAtFinalBoundary("unknown", "intermediate");
    assert.equal(u.allowed, false);
    assert.equal(u.diagnostic, "unknown");
    assert.equal(u.status, "DENY");
  });

  it("refuses early UNKNOWN collapse then binary NOT", () => {
    const d = C.collapseThenBinaryNot("unknown");
    assert.equal(d.status, "REFUSED");
    assert.ok(codes(d).includes("Galerina_COMPILER_REPLAN_UNKNOWN_EARLY_COLLAPSE"));
    assert.equal(C.k3NotThenFinalCollapse("unknown").allowed, false);
  });
});
