import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const CLI = resolve(ROOT, "packages-ts", "galerina-test", "dist", "cli.js");

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("CLI refuses a flag token as --root data with JSON and exit 2", () => {
  const result = runCli(["unit", "--root", "--timeout", "100", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report, {
    kind: "argument-error",
    ok: false,
    exitCode: 2,
    durationMs: 0,
    detail: "--root requires a directory",
  });
});

test("CLI refuses a flag token as --timeout data with JSON and exit 2", () => {
  const result = runCli(["unit", "--timeout", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report, {
    kind: "argument-error",
    ok: false,
    exitCode: 2,
    durationMs: 0,
    detail: "--timeout requires a positive integer number of ms",
  });
});

test("CLI keeps human argument errors on stderr with exit 2", () => {
  const result = runCli(["unit", "--root", "-workspace"]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /galerina-test: --root requires a directory/);
});

test("CLI emits a JSON failure payload for a dispatch error with exit 1", () => {
  const result = runCli(["unit", "--json", "--root", resolve(ROOT, "does-not-exist")]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.kind, "unit");
  assert.equal(report.ok, false);
  assert.equal(report.exitCode, 1);
  assert.equal(report.durationMs, 0);
  assert.match(report.detail, /workspace|target|not found/i);
});
