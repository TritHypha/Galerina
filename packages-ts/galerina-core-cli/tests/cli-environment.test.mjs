import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseEnvironment, runCli, FUNGI_CLI_ENV_001, FUNGI_CLI_ENV_002, FUNGI_CLI_ENV_003 } from "../dist/cli.js";

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
      assert.equal(result.error.code, FUNGI_CLI_ENV_001);
      assert.match(result.error.suggestedFix, /--env <development\|test\|staging\|production>/);
    }
    assert.equal(parseEnvironment(["check", "--env=prodution"]).error.code, FUNGI_CLI_ENV_001);
    const hostile = parseEnvironment(["check", "--env", "prodution\u001b[31m<script>"]);
    assert.ok(!JSON.stringify(hostile.error).includes("prodution"), "CliError must not echo raw input");
  });

  it("refuses --env without a value", () => {
    assert.equal(parseEnvironment(["check", "--env"]).error.code, FUNGI_CLI_ENV_002);
    assert.equal(parseEnvironment(["check", "--env", "--json"]).error.code, FUNGI_CLI_ENV_002);
    assert.equal(parseEnvironment(["check", "--env="]).error.code, FUNGI_CLI_ENV_002);
  });

  it("refuses a repeated --env, even when both values are valid", () => {
    assert.equal(parseEnvironment(["check", "--env", "test", "--env", "production"]).error.code, FUNGI_CLI_ENV_003);
    assert.equal(parseEnvironment(["check", "--env=test", "--env", "test"]).error.code, FUNGI_CLI_ENV_003);
  });

  it("returns frozen results", () => {
    const refused = parseEnvironment(["check", "--env", "nope"]);
    assert.ok(Object.isFrozen(refused) && Object.isFrozen(refused.error));
  });

  it("runCli refuses before any command runs and returns a structured CliError", async () => {
    const result = await runCli(["benchmark", "--env", "prodution"], process.cwd());
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.error.code, FUNGI_CLI_ENV_001);
    assert.ok(result.message.startsWith(`${FUNGI_CLI_ENV_001}: `));
    assert.deepEqual(result.details, [`Fix: ${result.error.suggestedFix}`]);
  });

  it("runCli still runs the command when --env is valid or absent", async () => {
    const withEnv = await runCli(["benchmark", "--env", "production"], process.cwd());
    const withoutEnv = await runCli(["benchmark"], process.cwd());
    // benchmark is not implemented, so it now carries FUNGI-CLI-003 (structured CLI errors), never an ENV error.
    assert.equal(withEnv.error.code, "FUNGI-CLI-003");
    assert.equal(withoutEnv.error.code, "FUNGI-CLI-003");
    assert.match(withEnv.message, /benchmark/i);
  });
});
