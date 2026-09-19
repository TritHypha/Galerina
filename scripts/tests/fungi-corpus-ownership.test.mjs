// fungi-corpus-ownership.test.mjs — regression contract for explicit negative
// fixture ownership and the zero-growth implicit failure baseline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveCorpusShards } from "../lib/fungi-corpus-shards.mjs";

const AUDIT = resolve("scripts/audit-fungi-corpus-check.mjs");

test("fungi corpus audit proves all fail-closed ownership branches", () => {
  const result = spawnSync(process.execPath, [AUDIT, "--self-test"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  for (const proof of [
    "implicit baseline growth is refused",
    "orphan diagnostic sidecar is refused",
    "stale exact diagnostic ownership is refused",
    "positive source diagnostics are refused",
  ]) {
    assert.match(output, new RegExp(proof));
  }
});

test("phase-close consumes the exact Corpus Audit v2 command and focused execution suite", () => {
  const manifest = JSON.parse(readFileSync(resolve("governance/phase-close-commands.json"), "utf8"));
  const corpus = manifest.entries.find(({ id }) => id === "fungi:corpus-check");
  assert.deepEqual(corpus.execution.command, [
    "node",
    "scripts/audit-fungi-corpus-check.mjs",
    "--corpus-v2",
    "--profile",
    "PROJECT",
    "--shard-count",
    "2",
    "--concurrency",
    "2",
    "--max-files",
    "1360",
    "--max-bytes",
    "67108864",
    "--timeout-ms",
    "540000",
    "--max-output-bytes",
    "67108864",
  ]);
  assert.equal(corpus.timeoutMs, 600000);
  const tooling = manifest.entries.find(({ id }) => id === "tests:tooling");
  const focused = "scripts/tests/fungi-corpus-shard-execution.test.mjs";
  assert.ok(tooling.execution.command.includes(focused));
  assert.ok(tooling.subjects.values.includes(focused));
  assert.equal(tooling.subjects.expectedCount, tooling.subjects.values.length);
});

test("phase-close PROJECT shard capacity covers the exact tracked ownership boundary", (t) => {
  const manifest = JSON.parse(readFileSync(resolve("governance/phase-close-commands.json"), "utf8"));
  const corpus = manifest.entries.find(({ id }) => id === "fungi:corpus-check");
  const command = corpus.execution.command;
  const option = (name) => Number(command[command.indexOf(name) + 1]);
  const tracked = spawnSync("git", ["ls-files", "-z", "--", "*.fungi"], {
    cwd: resolve("."),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  });
  assert.equal(tracked.status, 0, tracked.stderr || String(tracked.error));
  assert.ok(tracked.stdout.endsWith("\0"), "tracked inventory must be nonempty and NUL-terminated");
  const paths = tracked.stdout.slice(0, -1).split("\0")
    .filter((path) => path.endsWith(".fungi")
      && !path.startsWith("docs/examples/") && !path.startsWith("build/"))
    .sort();
  assert.ok(paths.length > 0, "PROJECT capacity must not pass on an empty inventory");
  assert.equal(new Set(paths).size, paths.length, "tracked ownership must be unique");
  const placeholderDigest = `sha256:${"0".repeat(64)}`;
  const request = {
    schema: "galerina.fungi-corpus-request.v2",
    profile: "PROJECT",
    productId: "galerina",
    repositoryHead: "0".repeat(40),
    repositoryTree: "0".repeat(40),
    compilerDigest: placeholderDigest,
    fileSetDigest: placeholderDigest,
    shardCount: option("--shard-count"),
    files: paths.map((path) => ({
      path,
      digest: placeholderDigest,
      expectationDigest: placeholderDigest,
      mode: "strict",
    })),
  };
  const limits = {
    maxFiles: option("--max-files"),
    maxBytes: option("--max-bytes"),
    timeoutMs: option("--timeout-ms"),
    maxOutputBytes: option("--max-output-bytes"),
  };
  const result = deriveCorpusShards(request, limits);
  assert.equal(result.kind, "accepted",
    `${paths.length} admitted PROJECT files need at least ${Math.ceil(paths.length / request.shardCount)} files per shard; `
    + `registered ${request.shardCount} x ${limits.maxFiles}: ${result.code ?? result.kind}`);
  assert.deepEqual(result.value.flatMap((shard) => shard.files.map(({ path }) => path)), paths);
  assert.ok(result.value.every((shard) => shard.files.length <= limits.maxFiles));
  assert.ok(option("--concurrency") >= 1 && option("--concurrency") <= 4);
  assert.ok(Math.ceil(result.value.length / option("--concurrency")) * limits.timeoutMs < corpus.timeoutMs,
    "registered outer timeout must allow every shard wave to reach its own deadline");
  t.diagnostic(`${paths.length} admitted PROJECT files; shard sizes ${result.value.map((shard) => shard.files.length).join(", ")}; `
    + `bounded capacity ${request.shardCount * limits.maxFiles}`);
});
