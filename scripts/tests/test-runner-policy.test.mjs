import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAssuranceManifest } from "../lib/assurance-fabric/manifest.mjs";

const require = createRequire(import.meta.url);
const scriptsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  npmTestInvocation,
  parsePackageConcurrency,
  parseTestConcurrency,
} = require("../lib/test-runner-policy.cjs");

test("test concurrency accepts only the closed range one through four", () => {
  assert.equal(parseTestConcurrency(undefined), 2);
  assert.equal(parseTestConcurrency("1"), 1);
  assert.equal(parseTestConcurrency("4"), 4);

  for (const value of ["0", "5", "-1", "1.5", "x", "", null]) {
    assert.throws(
      () => parseTestConcurrency(value),
      (error) => error.code === "TEST-CONCURRENCY-INVALID",
    );
  }
});

test("package concurrency accepts only the closed range one through two", () => {
  assert.equal(parsePackageConcurrency(undefined), 2);
  assert.equal(parsePackageConcurrency("1"), 1);
  assert.equal(parsePackageConcurrency(2), 2);
  for (const value of ["0", "3", "-1", "1.5", "x", "", null]) {
    assert.throws(
      () => parsePackageConcurrency(value),
      (error) => error.code === "PACKAGE-CONCURRENCY-INVALID",
    );
  }
});

test("a standard Windows node test receives the bounded npm argument", () => {
  assert.deepEqual(npmTestInvocation({
    platform: "win32",
    commandShell: "C:\\Windows\\System32\\cmd.exe",
    testScript: "npm run build && node --test tests/*.test.mjs",
    concurrency: 3,
  }), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: [
      "/d",
      "/s",
      "/c",
      "npm.cmd",
      "test",
      "--",
      "--test-concurrency=3",
    ],
    boundedNodeTest: true,
  });
});

test("a standard POSIX node test receives the bounded npm argument", () => {
  assert.deepEqual(npmTestInvocation({
    platform: "linux",
    testScript: "node --test test/*.test.mjs",
    concurrency: 2,
  }), {
    command: "npm",
    args: ["test", "--", "--test-concurrency=2"],
    boundedNodeTest: true,
  });
});

test("the core compiler package test scripts remain under the bounded Node test policy", () => {
  const repositoryRoot = join(scriptsRoot, "..");
  const packageManifest = JSON.parse(readFileSync(
    join(repositoryRoot, "packages-ts", "galerina-core-compiler", "package.json"),
    "utf8",
  ));

  for (const name of [
    "test",
    "test:checked-flow-artifact",
    "test:requirement-process-protocol",
    "test:requirement-process-adapter",
  ]) {
    const invocation = npmTestInvocation({
      platform: "linux",
      testScript: packageManifest.scripts[name],
      concurrency: 2,
    });
    assert.equal(invocation.boundedNodeTest, true, `${name} must be recognized as a governed Node test`);
    assert.ok(invocation.args.includes("--test-concurrency=2"), `${name} must receive the bounded worker count`);
  }
});

test("a custom package runner receives no Node-only argument", () => {
  assert.deepEqual(npmTestInvocation({
    platform: "win32",
    commandShell: "cmd.exe",
    testScript: "node scripts/run-tests.mjs",
    concurrency: 4,
  }), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd", "test"],
    boundedNodeTest: false,
  });
});

test("phase-close bounds its repository-wide tooling test workers", () => {
  const repositoryRoot = join(scriptsRoot, "..");
  const raw = JSON.parse(readFileSync(
    join(repositoryRoot, "governance", "phase-close-commands.json"),
    "utf8",
  ));
  const admitted = validateAssuranceManifest(raw, repositoryRoot);
  assert.equal(admitted.kind, "accepted");
  const entry = admitted.value.entries.find((candidate) => candidate.id === "tests:tooling");
  assert.ok(entry);
  assert.deepEqual(
    entry.execution.command.slice(0, 3),
    ["node", "--test", "--test-concurrency=1"],
    "the governed Node tooling suite must not inherit the host CPU count as its worker ceiling",
  );
});

test("phase-close serialises package and test workers for the core and exhaustive estates", () => {
  const repositoryRoot = join(scriptsRoot, "..");
  const raw = JSON.parse(readFileSync(
    join(repositoryRoot, "governance", "phase-close-commands.json"),
    "utf8",
  ));
  const admitted = validateAssuranceManifest(raw, repositoryRoot);
  assert.equal(admitted.kind, "accepted");

  for (const id of ["tests:core", "tests:all-packages"]) {
    const entry = admitted.value.entries.find((candidate) => candidate.id === id);
    assert.ok(entry, `${id} must remain governed`);
    assert.deepEqual(
      entry.execution.command.slice(-4),
      ["--package-concurrency", "1", "--test-concurrency", "1"],
      `${id} must remain single-package and single-test-worker on the bounded host profile`,
    );
  }
});
