import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runNode } from "../dist/index.js";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MISSING_CWD = "C:\\definitely-not-existing-galerina-cwd-20260920";

test("invalid cwd is a spawn error, not a timeout", () => {
  const result = runNode(["-e", "process.exit(0)"], MISSING_CWD);

  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, false);
  assert.equal(result.failureKind, "spawn-error");
  assert.equal(result.errorCode, "ENOENT");
});

test("deadline expiry is classified as a timeout", () => {
  const result = runNode(["-e", "setTimeout(() => {}, 1000)"], PACKAGE_ROOT, { timeoutMs: 20 });

  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, true);
  assert.equal(result.failureKind, "timeout");
  assert.equal(result.errorCode, "ETIMEDOUT");
});

test("capture-buffer exhaustion is classified as an output-limit failure", () => {
  const result = runNode(
    ["-e", "process.stdout.write(\"x\".repeat(4096))"],
    PACKAGE_ROOT,
    { outputLimitBytes: 64 },
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, false);
  assert.equal(result.failureKind, "output-limit");
  assert.equal(result.errorCode, "ENOBUFS");
});

test("captured output is delivered once, after canonical stream assembly", () => {
  const callbacks = [];
  const result = runNode(
    ["-e", "process.stdout.write(\"out\"); process.stderr.write(\"err\")"],
    PACKAGE_ROOT,
    { onOutput: (chunk) => callbacks.push(chunk) },
  );

  assert.equal(result.failureKind, "none");
  assert.equal(result.output, "out\nerr");
  assert.deepEqual(callbacks, [result.output]);
});

test("child execution removes the parent node:test context marker", () => {
  const result = runNode(
    ["-e", "process.stdout.write(process.env.NODE_TEST_CONTEXT === undefined ? \"unset\" : \"present\")"],
    PACKAGE_ROOT,
  );

  assert.equal(result.failureKind, "none");
  assert.equal(result.stdout, "unset");
});

test("signal termination is distinct from timeout on signal-capable hosts", { skip: process.platform === "win32" }, () => {
  const result = runNode(["-e", "process.kill(process.pid, \"SIGTERM\")"], PACKAGE_ROOT);

  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, false);
  assert.equal(result.failureKind, "signal");
  assert.equal(result.signal, "SIGTERM");
});
