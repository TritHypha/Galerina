import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";
import {
  parseBuildArgs,
  runBuildCommand,
  FUNGI_CLI_BUILD_001,
  FUNGI_CLI_BUILD_002,
  FUNGI_CLI_BUILD_004,
  FUNGI_CLI_BUILD_005,
  BUILD_EXIT_USAGE,
  BUILD_EXIT_VALIDATION,
} from "../dist/build/build-command.js";
import { BUILD_REPORT_FILE } from "../dist/build/build-reporter.js";
import { FUNGI_BUILD_005 } from "../dist/build/build-contracts.js";

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-bcmd-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

describe("parseBuildArgs", () => {
  it("requires workspace/target/out and refuses unknown / equals / positionals / --audit", () => {
    assert.equal(parseBuildArgs([]).ok, false);
    assert.equal(parseBuildArgs([]).result.error.code, FUNGI_CLI_BUILD_002);
    assert.equal(parseBuildArgs(["--nope"]).result.error.code, FUNGI_CLI_BUILD_001);
    assert.equal(parseBuildArgs(["pos"]).result.error.code, FUNGI_CLI_BUILD_001);
    assert.equal(parseBuildArgs(["--workspace=x"]).result.error.code, FUNGI_CLI_BUILD_001);
    assert.equal(parseBuildArgs(["--audit"]).result.error.code, FUNGI_CLI_BUILD_004);
    const ok = parseBuildArgs([
      "--workspace",
      "apps/demo",
      "--target",
      "node",
      "--out",
      "dist",
      "--strict",
      "--profile",
      "ci.strict",
      "--json",
    ]);
    assert.equal(ok.ok, true);
    assert.equal(ok.options.workspace, "apps/demo");
    assert.equal(ok.options.target, "node");
    assert.equal(ok.options.outDir, "dist");
    assert.equal(ok.options.strict, true);
    assert.equal(ok.options.profile, "ci.strict");
    assert.equal(ok.options.json, true);
  });
});

describe("runBuildCommand / galerina build", () => {
  it("refuses pipeline-not-admitted and can write build-report.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      const result = await runCli(
        [
          "build",
          "--workspace",
          "apps/demo",
          "--target",
          "node",
          "--out",
          "dist",
          "--report",
          "out",
          "--json",
        ],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, BUILD_EXIT_VALIDATION);
      assert.ok(existsSync(join(dir, "out", BUILD_REPORT_FILE)));
      const report = JSON.parse(readFileSync(join(dir, "out", BUILD_REPORT_FILE), "utf8"));
      assert.equal(report.schema, "galerina.build-report/v1");
      assert.equal(report.success, false);
      assert.equal(report.diagnostics[0].code, FUNGI_BUILD_005);
      assert.equal(report.diagnostics[0].message, "diagnostic message withheld");
      assert.ok(report.limitations.length >= 1);
      assert.equal(JSON.stringify(result).includes(dir), false);
      assert.equal(JSON.stringify(result).includes("apps/demo"), false);
    });
  });

  it("refuses bad path tokens via contracts without echoing", async () => {
    await withTemp(async (dir) => {
      const result = await runCli(
        ["build", "--workspace", "../escape", "--target", "node", "--out", "dist"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, BUILD_EXIT_VALIDATION);
      assert.equal(JSON.stringify(result).includes("../escape"), false);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("refuses overwrite of existing build-report.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "out", BUILD_REPORT_FILE), "{}\n");
      const result = await runCli(
        ["build", "--workspace", "apps/demo", "--target", "node", "--out", "dist", "--report", "out"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.error.code, FUNGI_CLI_BUILD_005);
      assert.equal(result.code, BUILD_EXIT_USAGE);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("runBuildCommand refuses --audit before any work", async () => {
    const result = await runBuildCommand({
      cwd: process.cwd(),
      env: "test",
      args: Object.freeze([
        "--workspace",
        "apps/demo",
        "--target",
        "node",
        "--out",
        "dist",
        "--audit",
      ]),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, FUNGI_CLI_BUILD_004);
  });

  it("emits json report details without writing when --json alone", async () => {
    await withTemp(async (dir) => {
      const result = await runCli(
        ["build", "--workspace", "apps/demo", "--target", "wasm", "--out", "out", "--json"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, BUILD_EXIT_VALIDATION);
      const report = JSON.parse(result.details.find((d) => d.includes('"schema"')));
      assert.equal(report.schema, "galerina.build-report/v1");
      assert.equal(report.success, false);
      assert.equal(report.diagnostics[0].code, FUNGI_BUILD_005);
      assert.equal(existsSync(join(dir, BUILD_REPORT_FILE)), false);
    });
  });
});
