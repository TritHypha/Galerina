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

// These tests stub the `routes` command's run function and restore it afterwards.
// (They used the `benchmark` placeholder until it was removed from core-cli.)
async function withStubbedRun(name, run, fn) {
  const command = commands.find((c) => c.name === name);
  assert.ok(command, `${name} must be a registered command`);
  const original = command.run;
  command.run = run;
  try {
    await fn();
  } finally {
    command.run = original;
  }
}

test("a throwing command becomes FUNGI-CLI-002 with no internal detail", async () => {
  await withStubbedRun("routes", async () => { throw new Error("secret internal path <home>/x/token"); }, async () => {
    const result = await runCli(["routes"], process.cwd());
    assert.equal(result.ok, false);
    assert.equal(result.error.code, FUNGI_CLI_002);
    assert.ok(!JSON.stringify(result).includes("secret internal"));
  });
});

test("a failing command without its own error gets FUNGI-CLI-003 and keeps its exit code", async () => {
  await withStubbedRun("routes", async () => ({ ok: false, code: 2, message: "routes stub is not implemented" }), async () => {
    const result = await runCli(["routes"], process.cwd());
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.equal(result.error.code, FUNGI_CLI_003);
    assert.match(result.message, /not implemented/);
  });
});

test("a failure reported with exit code 0 is never treated as success", async () => {
  await withStubbedRun("routes", async () => ({ ok: false, code: 0, message: "bad" }), async () => {
    const result = await runCli(["routes"], process.cwd());
    assert.equal(result.code, 1);
    assert.equal(result.error.code, FUNGI_CLI_003);
  });
});

test("environment errors keep their own structured error", async () => {
  const result = await runCli(["routes", "--env", "prodution"], process.cwd());
  assert.equal(result.error.code, "FUNGI-CLI-ENV-001");
});