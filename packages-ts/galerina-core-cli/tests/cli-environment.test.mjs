import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFileSync } from "node:fs";

import {
  parseEnvironment,
  runCli,
  FUNGI_CLI_ENV_001,
  FUNGI_CLI_ENV_002,
  FUNGI_CLI_ENV_003,
  FUNGI_CLI_ENV_DIAGNOSTICS,
} from "../dist/cli.js";

describe("Galerina CLI --env resolution (fail-closed)", () => {
  it("defaults to development only when --env is absent", () => {
    assert.deepEqual(parseEnvironment(["check"]), { ok: true, env: "development" });
    assert.deepEqual(parseEnvironment([]), { ok: true, env: "development" });
  });

  it("accepts every known environment in both flag forms", () => {
    for (const env of ["development", "test", "staging", "production"]) {
      assert.deepEqual(parseEnvironment(["check", "--env", env]), { ok: true, env });
      assert.deepEqual(parseEnvironment(["check", `--env=${env}`]), { ok: true, env });
    }
  });

  it("refuses a typo instead of running as development", () => {
    for (const bad of ["prodution", "Production", "prod", " production", "production\n", "__proto__", "constructor"]) {
      const result = parseEnvironment(["check", "--env", bad]);
      assert.equal(result.ok, false, `expected refusal for ${JSON.stringify(bad)}`);
      assert.equal(result.error.code, FUNGI_CLI_ENV_001.code);
      assert.match(result.error.suggestedFix, /--env <development\|test\|staging\|production>/);
    }
    assert.equal(parseEnvironment(["check", "--env=prodution"]).error.code, FUNGI_CLI_ENV_001.code);
    const hostile = parseEnvironment(["check", "--env", "prodution\u001b[31m<script>"]);
    assert.ok(!JSON.stringify(hostile.error).includes("prodution"), "CliError must not echo raw input");
  });

  it("refuses --env without a value", () => {
    assert.equal(parseEnvironment(["check", "--env"]).error.code, FUNGI_CLI_ENV_002.code);
    assert.equal(parseEnvironment(["check", "--env", "--json"]).error.code, FUNGI_CLI_ENV_002.code);
    assert.equal(parseEnvironment(["check", "--env="]).error.code, FUNGI_CLI_ENV_002.code);
  });

  it("refuses a repeated --env, even when both values are valid", () => {
    assert.equal(parseEnvironment(["check", "--env", "test", "--env", "production"]).error.code, FUNGI_CLI_ENV_003.code);
    assert.equal(parseEnvironment(["check", "--env=test", "--env", "test"]).error.code, FUNGI_CLI_ENV_003.code);
  });

  it("returns frozen results", () => {
    const refused = parseEnvironment(["check", "--env", "nope"]);
    assert.ok(Object.isFrozen(refused) && Object.isFrozen(refused.error));
  });

  it("runCli refuses before any command runs and returns a structured CliError", async () => {
    const result = await runCli(["benchmark", "--env", "prodution"], process.cwd());
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.error.code, FUNGI_CLI_ENV_001.code);
    assert.ok(result.message.startsWith(`${FUNGI_CLI_ENV_001.code}: `));
    assert.deepEqual(result.details, [`Fix: ${result.error.suggestedFix}`]);
  });

  it("runCli still runs the command when --env is valid or absent", async () => {
    const withEnv = await runCli(["benchmark", "--env", "production"], process.cwd());
    const withoutEnv = await runCli(["benchmark"], process.cwd());
    assert.equal(withEnv.error, undefined);
    assert.equal(withoutEnv.error, undefined);
    assert.match(withEnv.message, /benchmark/i);
  });
});

describe("FUNGI-CLI-ENV-* diagnostic constants (2026-10-02 diag-constants)", () => {
  const pinned = [
    [FUNGI_CLI_ENV_001, "FUNGI-CLI-ENV-001", "ENVIRONMENT_UNKNOWN"],
    [FUNGI_CLI_ENV_002, "FUNGI-CLI-ENV-002", "ENVIRONMENT_VALUE_MISSING"],
    [FUNGI_CLI_ENV_003, "FUNGI-CLI-ENV-003", "ENVIRONMENT_REPEATED"],
  ];

  it("each constant has the full { code, name, severity, message, suggestedFix } shape with literal pins", () => {
    for (const [diag, code, name] of pinned) {
      assert.deepEqual(Object.keys(diag).sort(), ["code", "message", "name", "severity", "suggestedFix"]);
      assert.equal(diag.code, code);
      assert.equal(diag.name, name);
      assert.equal(diag.severity, "error");
      assert.ok(typeof diag.message === "string" && diag.message.length > 0);
      assert.ok(typeof diag.suggestedFix === "string" && diag.suggestedFix.length > 0);
    }
  });

  it("FUNGI_CLI_ENV_DIAGNOSTICS lists exactly the three constants, with unique codes and names", () => {
    assert.ok(Object.isFrozen(FUNGI_CLI_ENV_DIAGNOSTICS));
    assert.deepEqual([...FUNGI_CLI_ENV_DIAGNOSTICS], [FUNGI_CLI_ENV_001, FUNGI_CLI_ENV_002, FUNGI_CLI_ENV_003]);
    assert.equal(new Set(FUNGI_CLI_ENV_DIAGNOSTICS.map((d) => d.code)).size, 3);
    assert.equal(new Set(FUNGI_CLI_ENV_DIAGNOSTICS.map((d) => d.name)).size, 3);
  });

  it("every refusal carries the constant's code, message (as safeMessage) and suggestedFix", () => {
    const cases = [
      [["check", "--env", "prodution"], FUNGI_CLI_ENV_001],
      [["check", "--env"], FUNGI_CLI_ENV_002],
      [["check", "--env", "test", "--env", "test"], FUNGI_CLI_ENV_003],
    ];
    for (const [args, diag] of cases) {
      const result = parseEnvironment(args);
      assert.equal(result.ok, false);
      assert.deepEqual({ ...result.error }, { code: diag.code, safeMessage: diag.message, suggestedFix: diag.suggestedFix });
    }
  });

  it("negative: a valid or absent --env emits none of the CLI-ENV codes", () => {
    for (const args of [["check"], ["check", "--env", "production"], ["check", "--env=test"]]) {
      const result = parseEnvironment(args);
      assert.equal(result.ok, true);
      assert.equal("error" in result, false);
    }
  });

  it("the code literals appear only in the constant definitions in src/cli.ts", () => {
    const src = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
    for (const [, code] of pinned) {
      assert.equal(src.split(`"${code}"`).length - 1, 1, `${code} must be defined exactly once`);
    }
  });
});
