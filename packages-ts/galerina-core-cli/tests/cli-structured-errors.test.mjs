import assert from "node:assert/strict";
import { test } from "node:test";

import { runCli, commands, FUNGI_CLI_001, FUNGI_CLI_002, FUNGI_CLI_003 } from "../dist/index.js";

test("unknown commands get a structured error that never echoes the raw name", async () => {
  const hostile = "rm -rf / AKIAIOSFODNN7EXAMPLE";
  const result = await runCli([hostile], process.cwd());
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.error.code, FUNGI_CLI_001);
  assert.ok(result.message.startsWith(`${FUNGI_CLI_001}: `));
  assert.ok(!JSON.stringify(result).includes("AKIA"), "raw input must not be echoed");
  assert.match(result.error.suggestedFix, /help/);
});

test("a throwing command becomes FUNGI-CLI-002 with no internal detail", async () => {
  const benchmark = commands.find((c) => c.name === "benchmark");
  const original = benchmark.run;
  benchmark.run = async () => { throw new Error("secret internal path C:/Users/x/token"); };
  try {
    const result = await runCli(["benchmark"], process.cwd());
    assert.equal(result.ok, false);
    assert.equal(result.error.code, FUNGI_CLI_002);
    assert.ok(!JSON.stringify(result).includes("secret internal"));
  } finally {
    benchmark.run = original;
  }
});

test("a failing command without its own error gets FUNGI-CLI-003 and keeps its exit code", async () => {
  const result = await runCli(["benchmark"], process.cwd());
  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.equal(result.error.code, FUNGI_CLI_003);
  assert.match(result.message, /not implemented/);
});

test("a failure reported with exit code 0 is never treated as success", async () => {
  const benchmark = commands.find((c) => c.name === "benchmark");
  const original = benchmark.run;
  benchmark.run = async () => ({ ok: false, code: 0, message: "bad" });
  try {
    const result = await runCli(["benchmark"], process.cwd());
    assert.equal(result.code, 1);
    assert.equal(result.error.code, FUNGI_CLI_003);
  } finally {
    benchmark.run = original;
  }
});

test("environment errors keep their own structured error", async () => {
  const result = await runCli(["benchmark", "--env", "prodution"], process.cwd());
  assert.equal(result.error.code, "FUNGI-CLI-ENV-001");
});
