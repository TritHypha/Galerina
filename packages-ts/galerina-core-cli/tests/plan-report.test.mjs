import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { estimateTarget } from "../dist/plan/plan-contracts.js";
import {
  createComputePlanReport,
  renderComputePlanReport,
  writeComputePlanReport,
  COMPUTE_PLAN_REPORT_FILE,
  COMPUTE_PLAN_REPORT_SCHEMA,
} from "../dist/plan/plan-reporter.js";

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-prep-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

const workspace = {
  effects: ["fs.read"],
  capabilities: ["cap.read"],
  estimatedMemoryMb: 128,
  parallelism: 2,
};

const options = {
  includeGpu: true,
  includeOptical: true,
  includeWasm: true,
  includeCompatibility: true,
  requestedTarget: null,
};

describe("createComputePlanReport / writeComputePlanReport", () => {
  it("builds a frozen report with withheld diagnostic messages and exclusive create", async () => {
    const plan = estimateTarget(workspace, options);
    const report = createComputePlanReport(plan);
    assert.equal(report.schema, COMPUTE_PLAN_REPORT_SCHEMA);
    assert.equal(report.success, true);
    assert.equal(report.target, "node");
    assert.ok(Object.isFrozen(report));
    assert.ok(report.limitations.length >= 1);
    const text = renderComputePlanReport(report);
    assert.ok(text.endsWith("\n"));

    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      const written = await writeComputePlanReport(plan, join(dir, "out"));
      assert.equal(written.report.success, true);
      assert.ok(existsSync(join(dir, "out", COMPUTE_PLAN_REPORT_FILE)));
      const disk = JSON.parse(readFileSync(join(dir, "out", COMPUTE_PLAN_REPORT_FILE), "utf8"));
      assert.equal(disk.schema, COMPUTE_PLAN_REPORT_SCHEMA);
      await assert.rejects(() => writeComputePlanReport(plan, join(dir, "out")));
    });
  });

  it("withholds diagnostic messages and never throws on hostile plan getters", () => {
    const hostile = {
      get target() {
        throw new Error("boom-target");
      },
      get diagnostics() {
        throw new Error("boom-diag");
      },
      get gpu() {
        throw new Error("boom-gpu");
      },
      get optical() {
        return null;
      },
      get wasm() {
        return null;
      },
      get compatibility() {
        return null;
      },
      get estimatedMemoryMb() {
        return Number.NaN;
      },
      get parallelism() {
        return Number.POSITIVE_INFINITY;
      },
    };
    const report = createComputePlanReport(/** @type {any} */ (hostile));
    assert.equal(report.success, true); // diagnostics list empty via catch -> []
    assert.equal(report.estimatedMemoryMb, 0);
    assert.equal(report.parallelism, 0);
    assert.equal(report.target, "node");
  });

  it("rejects malformed generatedAt", () => {
    const plan = estimateTarget(workspace, options);
    assert.throws(() => createComputePlanReport(plan, { generatedAt: "not-a-date" }), RangeError);
  });
});
