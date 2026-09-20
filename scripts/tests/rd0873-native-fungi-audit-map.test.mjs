import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const BASE_HEAD = "8b6c9b87fb2e7a96df3308ce6473c8f58d12859b";
const AGENTS_HEAD = "c68276eb54cefb0a37260b60225734841603093d";
const EMPTY_DIGEST = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const manifestPath = join(repositoryRoot, "governance", "rd0873-native-fungi-audit-map.json");
const policyPath = join(repositoryRoot, "tools", "bounded-tool-batch-policy.json");
const agentsRoot = process.env.AGENTS_ROOT;
const gitPath = process.env.RD0873_GIT_PATH;

if (typeof agentsRoot !== "string" || agentsRoot.length === 0) {
  throw new Error("REFUSED: AGENTS_ROOT is required");
}
if (basename(resolve(agentsRoot)).toLocaleLowerCase("en-US") !== "agents") {
  throw new Error("REFUSED: AGENTS_ROOT does not identify the canonical AGENTS owner");
}
if (typeof gitPath !== "string" || !isAbsolute(gitPath)) {
  throw new Error("REFUSED: RD0873_GIT_PATH must be explicit and absolute");
}

const auditMap = await import(pathToFileURL(join(agentsRoot, "tools", "audit-map.mjs")).href);
const batch = await import(pathToFileURL(join(agentsRoot, "tools", "bounded-tool-batch.mjs")).href);
const manifest = auditMap.parseManifestText(readFileSync(manifestPath, "utf8"));
const policy = batch.validatePolicy(batch.parsePolicyText(readFileSync(policyPath, "utf8")));

function ownerGit(...args) {
  return execFileSync(gitPath, ["-c", `safe.directory=${resolve(agentsRoot)}`, "-C", agentsRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 1_048_576,
    timeout: 30_000,
    windowsHide: true,
  }).trim();
}

function approve(value) {
  value.approval = {
    status: "APPROVED",
    planDigest: null,
    authority: "authority://galerina/rd-0873-native-fungi-audit",
    evidence: "receipt://galerina/rd-0873-native-fungi-audit-approval.json",
  };
  value.approval.planDigest = auditMap.planDigest(value);
  return value;
}

function refusalCode(callback) {
  try { callback(); }
  catch (error) { return error?.code ?? error?.message; }
  return null;
}

function parseToolReceipt(toolPath) {
  const output = execFileSync(process.execPath, [join(repositoryRoot, ...toolPath.split("/"))], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 1_048_576,
    timeout: 120_000,
    windowsHide: true,
  });
  return JSON.parse(output);
}

function semanticRows(receipt) {
  return receipt.tasks.map((task) => ({
    id: task.id,
    ordinal: task.ordinal,
    lane: task.lane,
    outcome: task.outcome,
    reasonCode: task.reasonCode,
    exitCode: task.exitCode,
    stdoutBytes: task.stdoutBytes,
    stderrBytes: task.stderrBytes,
    stdoutDigest: task.stdoutDigest,
    stderrDigest: task.stderrDigest,
  }));
}

test("canonical AGENTS owner is exact committed and exports both controllers", () => {
  assert.equal(ownerGit("rev-parse", "HEAD"), AGENTS_HEAD);
  assert.equal(ownerGit("diff", "--name-only", "HEAD", "--", "tools/audit-map.mjs", "tools/bounded-tool-batch.mjs"), "");
  assert.equal(typeof auditMap.auditManifest, "function");
  assert.equal(typeof batch.runCli, "function");
});

test("approved exact-base DAG is closed bounded and ordered", () => {
  assert.deepEqual(auditMap.auditManifest(manifest, { requireApproved: true }), []);
  assert.equal(manifest.subject.locator, `git://galerina/${BASE_HEAD}`);
  assert.equal(policy.defaultConcurrency, 2);
  assert.equal(policy.maximumConcurrency, 4);
  assert.deepEqual(manifest.audits.map(({ id, dependsOn }) => ({ id, dependsOn })), [
    { id: "corpus-packages-fungi", dependsOn: [] },
    { id: "corpus-self-hosted", dependsOn: [] },
    { id: "static-snippets", dependsOn: ["corpus-packages-fungi", "corpus-self-hosted"] },
    { id: "generated-state", dependsOn: ["static-snippets"] },
    { id: "final-check", dependsOn: ["generated-state"] },
  ]);
  assert.equal(manifest.audits.every((audit) => Number.isSafeInteger(audit.timeoutMs) && audit.timeoutMs > 0), true);
  assert.equal(manifest.audits.every((audit) => Number.isSafeInteger(audit.maxOutputBytes) && audit.maxOutputBytes > 0), true);
  assert.deepEqual(manifest.audits.map((audit) => audit.exit), Array.from({ length: 5 }, () => ({
    pass: [0], finding: [1], refused: [2],
  })));
});

test("policy admits only the five real read-only entry points in prescribed lanes", () => {
  assert.deepEqual(policy.tools.map(({ path, lane, temporaryState, argumentMode }) => ({
    path, lane, temporaryState, argumentMode,
  })), [
    { path: "tools/rd0873-corpus-packages-fungi.mjs", lane: "parallel-read", temporaryState: "none", argumentMode: "none" },
    { path: "tools/rd0873-corpus-self-hosted.mjs", lane: "parallel-read", temporaryState: "none", argumentMode: "none" },
    { path: "tools/rd0873-static-snippets.mjs", lane: "snapshot-read", temporaryState: "none", argumentMode: "none" },
    { path: "tools/rd0873-generated-state.mjs", lane: "exclusive", temporaryState: "none", argumentMode: "none" },
    { path: "tools/rd0873-final-check.mjs", lane: "exclusive", temporaryState: "none", argumentMode: "none" },
  ]);
  const admission = batch.admitBatch(manifest, policy, { repoRoot: repositoryRoot });
  assert.equal(admission.concurrency, 2);
  assert.deepEqual(admission.tasks.map(({ id, lane }) => ({ id, lane })), [
    { id: "corpus-packages-fungi", lane: "parallel-read" },
    { id: "corpus-self-hosted", lane: "parallel-read" },
    { id: "static-snippets", lane: "snapshot-read" },
    { id: "generated-state", lane: "exclusive" },
    { id: "final-check", lane: "exclusive" },
  ]);
});

test("each local entry point emits one bounded non-authorizing receipt", () => {
  for (const tool of policy.tools) {
    const receipt = parseToolReceipt(tool.path);
    assert.equal(receipt.schema, "rd0873-read-only-audit.v1", tool.path);
    assert.equal(receipt.authorizing, false, tool.path);
    assert.equal(receipt.verdict, "PASS", tool.path);
    assert.match(receipt.digest, /^[0-9a-f]{64}$/u, tool.path);
    assert.equal(Number.isSafeInteger(receipt.files) && receipt.files > 0, true, tool.path);
    assert.equal(Object.hasOwn(receipt, "elapsedMs"), false, tool.path);
  }
});

test("unsafe Myco graph index Git dist shell missing bounds cycles and unlisted tools refuse", () => {
  const mutations = [
    ["Myco refresh", (value) => { value.audits[0].argv = ["node", "tools/myco-refresh.mjs"]; }, "TOOL_NOT_ADMITTED"],
    ["graph writer", (value) => { value.audits[0].argv = ["node", "tools/graph-write.mjs"]; }, "TOOL_NOT_ADMITTED"],
    ["index writer", (value) => { value.audits[0].argv = ["node", "tools/index-write.mjs"]; }, "TOOL_NOT_ADMITTED"],
    ["Git", (value) => { value.audits[0].argv = ["git", "status"]; }, "EXECUTABLE_REFUSED"],
    ["shared dist writer", (value) => { value.audits[0].argv = ["node", "tools/build-dist.mjs"]; }, "TOOL_NOT_ADMITTED"],
    ["shell string", (value) => { value.audits[0].argv = ["node", "tools/rd0873-corpus-packages-fungi.mjs && git status"]; }, "SCRIPT_PATH_REFUSED"],
    ["missing timeout", (value) => { delete value.audits[0].timeoutMs; }, "MANIFEST_REFUSED"],
    ["missing output bound", (value) => { delete value.audits[0].maxOutputBytes; }, "MANIFEST_REFUSED"],
    ["cycle", (value) => { value.audits[0].dependsOn = ["final-check"]; }, "MANIFEST_REFUSED"],
    ["unlisted tool", (value) => { value.audits[0].argv = ["node", "tools/unknown.mjs"]; }, "TOOL_NOT_ADMITTED"],
  ];
  for (const [label, mutate, expected] of mutations) {
    const value = structuredClone(manifest);
    mutate(value);
    approve(value);
    assert.equal(refusalCode(() => batch.admitBatch(value, policy, { repoRoot: repositoryRoot })), expected, label);
  }
});

test("audited base HEAD is exact and any different current snapshot refuses", async () => {
  const admission = batch.admitBatch(manifest, policy, { repoRoot: repositoryRoot });
  let launches = 0;
  const execution = await batch.executeBatch(admission, {
    captureSnapshot: async () => ({
      schema: "bounded-tool-git-snapshot.v1",
      head: "f".repeat(40),
      clean: true,
      statusBytes: 0,
      statusDigest: EMPTY_DIGEST,
    }),
    runTask: async () => {
      launches += 1;
      return {
        kind: "EXITED", exitCode: 0, durationMs: 0, stdoutBytes: 0, stderrBytes: 0,
        stdoutDigest: EMPTY_DIGEST, stderrDigest: EMPTY_DIGEST,
      };
    },
  });
  assert.equal(execution.integrity, "REFUSED");
  assert.equal(execution.integrityReason, "HEAD_MISMATCH");
  assert.equal(launches, 0);
});

test("canonical normal and sequential CLI runs preserve ordered outcomes and output digests", async () => {
  const stableSnapshot = Object.freeze({
    schema: "bounded-tool-git-snapshot.v1",
    head: BASE_HEAD,
    clean: true,
    statusBytes: 0,
    statusDigest: EMPTY_DIGEST,
  });
  const run = async (sequential) => {
    const stdout = [];
    const stderr = [];
    const argv = ["run", manifestPath, "--format", "json", ...(sequential ? ["--sequential"] : [])];
    const exit = await batch.runCli(argv, {
      repoRoot: repositoryRoot,
      // This test verifies CLI ordering and receipt algebra; do not launch the
      // real corpus audit entries from a unit test.
      skipSelfTest: true,
      captureSnapshot: async () => stableSnapshot,
      runTask: async () => ({
        kind: "EXITED",
        exitCode: 0,
        durationMs: 0,
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutDigest: EMPTY_DIGEST,
        stderrDigest: EMPTY_DIGEST,
      }),
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    });
    assert.equal(exit, 0);
    assert.deepEqual(stderr, []);
    return JSON.parse(stdout.at(-1));
  };
  const normal = await run(false);
  const sequential = await run(true);
  assert.equal(normal.mode, "parallel");
  assert.equal(normal.concurrency, 2);
  assert.equal(sequential.mode, "sequential");
  assert.equal(sequential.concurrency, 1);
  assert.equal(normal.authorizing, false);
  assert.equal(sequential.authorizing, false);
  assert.deepEqual(normal.taskCounts, { total: 5, pass: 5, finding: 0, refused: 0, skipped: 0 });
  assert.deepEqual(sequential.taskCounts, normal.taskCounts);
  assert.deepEqual(semanticRows(normal), semanticRows(sequential));
});
