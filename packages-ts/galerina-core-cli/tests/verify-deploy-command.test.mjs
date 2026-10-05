import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  BUILD_MANIFEST_SLICE_SCHEMA,
  FUNGI_CLI_VDEPLOY_001,
  FUNGI_CLI_VDEPLOY_002,
  FUNGI_CLI_VDEPLOY_004,
  FUNGI_CLI_VDEPLOY_005,
  FUNGI_VDEPLOY_003,
  RUNNING_VERSION_RECEIPT_SCHEMA,
  VERIFY_DEPLOY_REPORT_FILE,
  parseVerifyDeployArgs,
  runCli,
  runVerifyDeployCommand,
} from "../dist/index.js";

const HASH_A = "sha256:" + "a".repeat(64);
const HASH_B = "sha256:" + "b".repeat(64);

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "gal-vdeploy-"));
  const receiptPath = join(root, "receipt.json");
  const manifestPath = join(root, "manifest.json");
  await writeFile(
    receiptPath,
    JSON.stringify({
      schema: RUNNING_VERSION_RECEIPT_SCHEMA,
      versionId: "demo.v1",
      buildHash: HASH_A,
      target: "node",
    }),
    "utf8",
  );
  await writeFile(
    manifestPath,
    JSON.stringify({
      schema: BUILD_MANIFEST_SLICE_SCHEMA,
      buildHash: HASH_A,
      target: "node",
    }),
    "utf8",
  );
  return run({ root, receiptPath, manifestPath });
}

describe("verify-deploy command", () => {
  it("parseVerifyDeployArgs admits closed flags and refuses live probes", () => {
    const ok = parseVerifyDeployArgs([
      "--receipt", "r.json",
      "--manifest", "m.json",
      "--json",
      "--strict",
    ]);
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.options.receiptPath, "r.json");
    assert.equal(ok.options.json, true);

    const live = parseVerifyDeployArgs(["--receipt", "r.json", "--manifest", "m.json", "--pid", "1"]);
    assert.equal(live.ok, false);
    if (!live.ok) assert.equal(live.result.error?.code, FUNGI_CLI_VDEPLOY_004);

    const missing = parseVerifyDeployArgs(["--json"]);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.result.error?.code, FUNGI_CLI_VDEPLOY_002);

    const equals = parseVerifyDeployArgs(["--receipt=r.json", "--manifest", "m.json"]);
    assert.equal(equals.ok, false);
    if (!equals.ok) assert.equal(equals.result.error?.code, FUNGI_CLI_VDEPLOY_001);
  });

  it("runVerifyDeployCommand matches closed files and writes exclusive report", async () => {
    await withFixture(async ({ root, receiptPath, manifestPath }) => {
      const reportDir = join(root, "out");
      await mkdir(reportDir);
      const result = await runVerifyDeployCommand({
        cwd: root,
        env: "development",
        args: [
          "--receipt", receiptPath,
          "--manifest", manifestPath,
          "--report", reportDir,
        ],
      });
      assert.equal(result.ok, true);
      assert.equal(result.code, 0);
      const report = JSON.parse(await readFile(join(reportDir, VERIFY_DEPLOY_REPORT_FILE), "utf8"));
      assert.equal(report.success, true);
      assert.equal(report.matched, true);
      assert.equal(report.receiptVersionId, "demo.v1");
      assert.ok(Array.isArray(report.limitations));

      const again = await runVerifyDeployCommand({
        cwd: root,
        env: "development",
        args: [
          "--receipt", receiptPath,
          "--manifest", manifestPath,
          "--report", reportDir,
        ],
      });
      assert.equal(again.ok, false);
      assert.equal(again.error?.code, FUNGI_CLI_VDEPLOY_005);
    });
  });

  it("runCli routes galerina verify deploy and reports hash mismatch", async () => {
    await withFixture(async ({ root, receiptPath, manifestPath }) => {
      await writeFile(
        manifestPath,
        JSON.stringify({
          schema: BUILD_MANIFEST_SLICE_SCHEMA,
          buildHash: HASH_B,
          target: "node",
        }),
        "utf8",
      );
      const result = await runCli(
        ["verify", "deploy", "--receipt", receiptPath, "--manifest", manifestPath, "--json"],
        root,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 4);
      assert.match(result.message, new RegExp(FUNGI_VDEPLOY_003));
    });
  });
});
