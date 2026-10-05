import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";
import {
  parseExplainArgs,
  runExplainCommand,
  FUNGI_CLI_EXPLAIN_001,
  FUNGI_CLI_EXPLAIN_002,
  FUNGI_CLI_EXPLAIN_003,
  FUNGI_CLI_EXPLAIN_004,
  FUNGI_CLI_EXPLAIN_005,
  EXPLAIN_EXIT_OK,
  EXPLAIN_EXIT_USAGE,
  EXPLAIN_EXIT_VALIDATION,
} from "../dist/explain/explain-command.js";
import { EXPLAIN_REPORT_FILE } from "../dist/explain/explain-reporter.js";
import { DEPLOYMENT_DENIAL_SCHEMA } from "../dist/explain/explain-denial.js";

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-ecmd-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

const manifest = {
  effects: ["fs.read", "net.fetch"],
  capabilities: ["cap.read"],
  boundaries: ["boundary.fs"],
  imports: ["pkg.core"],
};

const denial = {
  schema: DEPLOYMENT_DENIAL_SCHEMA,
  status: "denied",
  reasonCode: "effect",
  subject: "net.fetch",
  profile: "production",
  module: "app.debug.client",
};

describe("parseExplainArgs", () => {
  it("requires manifest and/or denial and refuses unknown / equals / positionals / not-admitted", () => {
    assert.equal(parseExplainArgs([]).ok, false);
    assert.equal(parseExplainArgs([]).result.error.code, FUNGI_CLI_EXPLAIN_002);
    assert.equal(parseExplainArgs(["--nope"]).result.error.code, FUNGI_CLI_EXPLAIN_001);
    assert.equal(parseExplainArgs(["pos"]).result.error.code, FUNGI_CLI_EXPLAIN_001);
    assert.equal(parseExplainArgs(["--manifest=x"]).result.error.code, FUNGI_CLI_EXPLAIN_001);
    assert.equal(parseExplainArgs(["--tree"]).result.error.code, FUNGI_CLI_EXPLAIN_004);
    assert.equal(parseExplainArgs(["--runtime"]).result.error.code, FUNGI_CLI_EXPLAIN_004);
    assert.equal(parseExplainArgs(["--policy"]).result.error.code, FUNGI_CLI_EXPLAIN_004);
    assert.equal(parseExplainArgs(["--audit"]).result.error.code, FUNGI_CLI_EXPLAIN_004);
    const ok = parseExplainArgs(["--manifest", "m.json", "--json", "--trace", "--effects"]);
    assert.equal(ok.ok, true);
    assert.equal(ok.options.manifestPath, "m.json");
    assert.equal(ok.options.json, true);
    assert.equal(ok.options.trace, true);
    assert.equal(ok.options.effectsOnly, true);
  });
});

describe("runExplainCommand / galerina explain", () => {
  it("explains a closed manifest and can write explain-report.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "m.json"), JSON.stringify(manifest));
      const result = await runCli(
        ["explain", "--manifest", "m.json", "--report", "out", "--json", "--trace"],
        dir,
      );
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, EXPLAIN_EXIT_OK);
      assert.ok(existsSync(join(dir, "out", EXPLAIN_REPORT_FILE)));
      const report = JSON.parse(readFileSync(join(dir, "out", EXPLAIN_REPORT_FILE), "utf8"));
      assert.equal(report.success, true);
      assert.equal(report.traces.length, 5);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("explains denial reasoning without echoing free-form paths", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "d.json"), JSON.stringify(denial));
      const result = await runCli(["explain", "--denial", "d.json", "--json"], dir);
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, EXPLAIN_EXIT_OK);
      const blob = result.details.join("\n");
      assert.ok(blob.includes('"label": "denial"'));
      assert.ok(blob.includes("net.fetch"));
      assert.equal(blob.includes("app/debug"), false);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("supports --effects facet only", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "m.json"), JSON.stringify(manifest));
      const result = await runCli(["explain", "--manifest", "m.json", "--effects", "--json"], dir);
      assert.equal(result.ok, true, result.message);
      const report = JSON.parse(result.details.find((d) => d.includes('"schema"')));
      assert.ok(report.traces.every((t) => t.label === "effect"));
      assert.equal(report.traces.length, 2);
    });
  });

  it("returns exit 4 on shape validation without echoing keys", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "m.json"), JSON.stringify({ ...manifest, extra: true }));
      const result = await runCli(["explain", "--manifest", "m.json"], dir);
      assert.equal(result.ok, false);
      assert.equal(result.code, EXPLAIN_EXIT_VALIDATION);
      assert.equal(JSON.stringify(result).includes("extra"), false);
    });
  });

  it("refuses unreadable input without echoing the path", async () => {
    await withTemp(async (dir) => {
      const result = await runCli(["explain", "--manifest", "missing.json"], dir);
      assert.equal(result.ok, false);
      assert.equal(result.code, EXPLAIN_EXIT_USAGE);
      assert.equal(result.error.code, FUNGI_CLI_EXPLAIN_003);
      assert.equal(JSON.stringify(result).includes("missing.json"), false);
      assert.equal(JSON.stringify(result).includes(dir), false);
      void runExplainCommand;
      void FUNGI_CLI_EXPLAIN_005;
    });
  });

  it("refuses report overwrite without echoing paths", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "m.json"), JSON.stringify(manifest));
      writeFileSync(join(dir, "out", EXPLAIN_REPORT_FILE), "{}");
      const result = await runCli(["explain", "--manifest", "m.json", "--report", "out"], dir);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, FUNGI_CLI_EXPLAIN_005);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });
});
