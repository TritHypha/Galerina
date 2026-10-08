import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";
import {
  parsePlanArgs,
  runPlanCommand,
  FUNGI_CLI_PLAN_001,
  FUNGI_CLI_PLAN_002,
  FUNGI_CLI_PLAN_003,
  FUNGI_CLI_PLAN_004,
  FUNGI_CLI_PLAN_005,
  PLAN_EXIT_OK,
  PLAN_EXIT_USAGE,
  PLAN_EXIT_VALIDATION,
} from "../dist/plan/plan-command.js";
import { COMPUTE_PLAN_REPORT_FILE } from "../dist/plan/plan-reporter.js";

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-pcmd-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

const workspace = {
  effects: ["fs.read", "net.fetch"],
  capabilities: ["cap.read"],
  estimatedMemoryMb: 256,
  parallelism: 4,
};

describe("parsePlanArgs", () => {
  it("requires workspace and refuses unknown / equals / positionals / live-probe HOLD flags", () => {
    assert.equal(parsePlanArgs([]).ok, false);
    assert.equal(parsePlanArgs([]).result.error.code, FUNGI_CLI_PLAN_002);
    assert.equal(parsePlanArgs(["--nope"]).result.error.code, FUNGI_CLI_PLAN_001);
    assert.equal(parsePlanArgs(["pos"]).result.error.code, FUNGI_CLI_PLAN_001);
    assert.equal(parsePlanArgs(["--workspace=x"]).result.error.code, FUNGI_CLI_PLAN_001);
    assert.equal(parsePlanArgs(["--runtime"]).result.error.code, FUNGI_CLI_PLAN_004);
    assert.equal(parsePlanArgs(["--energy"]).result.error.code, FUNGI_CLI_PLAN_004);
    assert.equal(parsePlanArgs(["--graph"]).result.error.code, FUNGI_CLI_PLAN_004);
    const ok = parsePlanArgs([
      "--workspace",
      "w.json",
      "--json",
      "--target",
      "node",
      "--memory",
      "128",
      "--parallelism",
      "2",
      "--compatibility",
    ]);
    assert.equal(ok.ok, true);
    assert.equal(ok.options.workspacePath, "w.json");
    assert.equal(ok.options.json, true);
    assert.equal(ok.options.requestedTarget, "node");
    assert.equal(ok.options.memoryOverride, 128);
    assert.equal(ok.options.parallelismOverride, 2);
    assert.equal(ok.options.compatibilityOnly, true);
  });
});

describe("runPlanCommand / galerina plan", () => {
  it("estimates a closed workspace and can write compute-plan.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "w.json"), JSON.stringify(workspace));
      const result = await runCli(
        ["plan", "--workspace", "w.json", "--report", "out", "--json"],
        dir,
      );
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, PLAN_EXIT_OK);
      assert.ok(existsSync(join(dir, "out", COMPUTE_PLAN_REPORT_FILE)));
      const report = JSON.parse(readFileSync(join(dir, "out", COMPUTE_PLAN_REPORT_FILE), "utf8"));
      assert.equal(report.schema, "galerina.compute-plan/v1");
      assert.equal(report.success, true);
      assert.equal(report.target, "node");
      assert.equal(report.estimatedMemoryMb, 256);
      assert.equal(report.parallelism, 4);
      assert.notEqual(report.gpu, null);
      assert.equal(report.gpu.recommendedTarget, "node");
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("applies declared --memory/--parallelism overrides without live probes", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "w.json"), JSON.stringify(workspace));
      const result = await runCli(
        ["plan", "--workspace", "w.json", "--memory", "64", "--parallelism", "1", "--json"],
        dir,
      );
      assert.equal(result.ok, true, result.message);
      const report = JSON.parse(result.details.find((d) => d.includes('"schema"')));
      assert.equal(report.estimatedMemoryMb, 64);
      assert.equal(report.parallelism, 1);
    });
  });

  it("supports --compatibility facet-only", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "w.json"), JSON.stringify(workspace));
      const result = await runCli(
        ["plan", "--workspace", "w.json", "--compatibility", "--json"],
        dir,
      );
      assert.equal(result.ok, true, result.message);
      const report = JSON.parse(result.details.find((d) => d.includes('"schema"')));
      assert.equal(report.gpu, null);
      assert.equal(report.optical, null);
      assert.equal(report.wasm, null);
      assert.notEqual(report.compatibility, null);
    });
  });

  it("returns exit 4 on shape validation without echoing keys", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "w.json"), JSON.stringify({ ...workspace, extra: true }));
      const result = await runCli(["plan", "--workspace", "w.json"], dir);
      assert.equal(result.ok, false);
      assert.equal(result.code, PLAN_EXIT_VALIDATION);
      assert.equal(JSON.stringify(result).includes("extra"), false);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("refuses missing workspace file without echoing path", async () => {
    await withTemp(async (dir) => {
      const result = await runCli(["plan", "--workspace", "missing.json"], dir);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, FUNGI_CLI_PLAN_003);
      assert.equal(JSON.stringify(result).includes("missing.json"), false);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("refuses overwrite of existing compute-plan.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "w.json"), JSON.stringify(workspace));
      writeFileSync(join(dir, "out", COMPUTE_PLAN_REPORT_FILE), "{}\n");
      const result = await runCli(["plan", "--workspace", "w.json", "--report", "out"], dir);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, FUNGI_CLI_PLAN_005);
      assert.equal(result.code, PLAN_EXIT_USAGE);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("runPlanCommand refuses live-probe flags before IO", async () => {
    const result = await runPlanCommand({
      cwd: process.cwd(),
      env: "test",
      args: Object.freeze(["--workspace", "w.json", "--energy"]),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, FUNGI_CLI_PLAN_004);
  });
});
