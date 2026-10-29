// K3-ZY: post-merge runner with an injected step runner.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runPostMergeCheck } from "../../../scripts/k3-post-merge-check.mjs";

describe("K3-ZY post-merge check injected runner", () => {
  it("ZY-G1 all steps status 0 is GREEN", () => {
    const report = runPostMergeCheck({
      slideRoot: "C:\\injected-slide",
      runStep(step) {
        return { id: step.id, status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(report.verdict, "GREEN");
    assert.equal(report.ok, true);
    assert.equal(report.failingStep, null);
    assert.equal(report.steps.length, 5);
  });

  it("ZY-G2 first non-zero step is RED with that failingStep", () => {
    const report = runPostMergeCheck({
      slideRoot: "C:\\injected-slide",
      runStep(step) {
        return {
          id: step.id,
          status: step.id === "lock" ? 1 : 0,
          stdout: "",
          stderr: "injected",
        };
      },
    });
    assert.equal(report.verdict, "RED");
    assert.equal(report.ok, false);
    assert.equal(report.failingStep, "lock");
  });

  it("ZY-G3 missing slide-root is RED", () => {
    const report = runPostMergeCheck({
      runStep() {
        throw new Error("must not run");
      },
    });
    assert.equal(report.verdict, "RED");
    assert.equal(report.failingStep, "slide-root");
  });
});
