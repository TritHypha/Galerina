// fungi-corpus-ownership.test.mjs — regression contract for explicit negative
// fixture ownership and the zero-growth implicit failure baseline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { deriveCorpusShards } from "../lib/fungi-corpus-shards.mjs";
import { validateAssuranceManifest } from "../lib/assurance-fabric/manifest.mjs";

const AUDIT = resolve("scripts/audit-fungi-corpus-check.mjs");
const WORKSET_FILES = Object.freeze([
  "packages-ts/galerina-core-compiler/src/self-hosted/bound.fungi",
  "packages-ts/galerina-core-compiler/src/self-hosted/i32-max.fungi",
]);

function corpusV2Args(profile, files = []) {
  return [
    "--corpus-v2",
    "--profile",
    profile,
    ...files.flatMap((file) => ["--file", file]),
    "--shard-count",
    "1",
    "--concurrency",
    "1",
    "--max-files",
    "2",
    "--max-bytes",
    "1048576",
    "--timeout-ms",
    "30000",
    "--max-output-bytes",
    "1048576",
  ];
}

function runCorpusV2(args) {
  return spawnSync(process.execPath, [AUDIT, ...args], {
    encoding: "utf8",
    timeout: 90_000,
    windowsHide: true,
  });
}

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

test("fungi corpus audit accepts the complete bounded Myco JSON response", () => {
  const result = spawnSync(process.execPath, [AUDIT, "--self-test"], {
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(output, /myco degraded:/u);
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
    "1368",
    "--max-bytes",
    "67108864",
    "--timeout-ms",
    "3420000",
    "--max-output-bytes",
    "67108864",
  ]);
  assert.equal(corpus.timeoutMs, 3480000);
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
  // Match buildLocalCorpusRequest's tracked PROJECT boundary: the example
  // diagnostics owner and generated build tree own these two excluded prefixes.
  const paths = tracked.stdout.slice(0, -1).split("\0")
    .filter((path) => path.endsWith(".fungi")
      && !path.startsWith("docs/examples/") && !path.startsWith("build/"))
    .sort();
  assert.ok(paths.length > 0, "PROJECT capacity must not pass on an empty inventory");
  assert.equal(new Set(paths).size, paths.length, "tracked ownership must be unique");
  const limits = {
    maxFiles: option("--max-files"),
    maxBytes: option("--max-bytes"),
    timeoutMs: option("--timeout-ms"),
    maxOutputBytes: option("--max-output-bytes"),
  };
  // This pathname-only capacity probe never reads source/compiler bodies or
  // executes a checker. Placeholder identities are not PROJECT audit evidence.
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

test("phase-close PROJECT runtime budget covers measured throughput for every admitted file and shard wave", (t) => {
  const manifest = JSON.parse(readFileSync(resolve("governance/phase-close-commands.json"), "utf8"));
  const corpus = manifest.entries.find(({ id }) => id === "fungi:corpus-check");
  const admitted = validateAssuranceManifest({ schemaVersion: manifest.schemaVersion, entries: [corpus] }, resolve("."));
  assert.equal(admitted.kind, "accepted", admitted.detail ?? admitted.code);
  const command = corpus.execution.command;
  const option = (name) => Number(command[command.indexOf(name) + 1]);
  // At HEAD 764f60c72920d06b2f3d37deb1fff75e0f601ae0 the two 540-second
  // shards completed 261 and 263 files. Round the slower observed per-file
  // cost up to a half second: 2,500 ms, within the manifest's one-hour ceiling.
  // This is a total-runtime allocation,
  // not a new per-file deadline or a claim that future files finish on time.
  const observedMsPerFile = Math.max(540_000 / 261, 540_000 / 263);
  const allocatedMsPerFile = Math.ceil(observedMsPerFile / 500) * 500;
  const maxFiles = option("--max-files");
  const shardCount = option("--shard-count");
  const concurrency = option("--concurrency");
  const shardTimeoutMs = option("--timeout-ms");
  for (const value of [maxFiles, shardCount, concurrency, shardTimeoutMs, corpus.timeoutMs]) {
    assert.ok(Number.isSafeInteger(value) && value > 0, "runtime inputs must remain finite positive integers");
  }
  assert.ok(concurrency <= 4, "runtime repair must retain the existing process ceiling");
  assert.equal(shardTimeoutMs, maxFiles * allocatedMsPerFile,
    `each admitted file requires ${allocatedMsPerFile} ms of the shard's total runtime allocation`);
  const shardWaves = Math.ceil(shardCount / concurrency);
  assert.equal(corpus.timeoutMs, shardWaves * shardTimeoutMs + 60_000,
    "outer deadline must cover every shard wave plus the existing 60-second finalization allowance");
  t.diagnostic(`${maxFiles} files x ${allocatedMsPerFile} ms = ${shardTimeoutMs} ms per shard; `
    + `${shardWaves} wave(s) + 60000 ms finalization = ${corpus.timeoutMs} ms outer`);
});

test("the production CLI executes an exact two-file protected WORKSET", { timeout: 120_000 }, () => {
  const result = runCorpusV2(corpusV2Args("WORKSET", WORKSET_FILES));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^FUNGI_CORPUS_V2 /u);
  const run = JSON.parse(lines[0].slice("FUNGI_CORPUS_V2 ".length));
  assert.equal(run.aggregate.status, "PASS");
  assert.deepEqual(
    run.receipts.flatMap((receipt) => receipt.completed.map(({ path }) => path)),
    WORKSET_FILES,
  );
  assert.doesNotMatch(JSON.stringify(run), /@version|pure flow|SECRET_DIAGNOSTIC_BODY/u);
});

test("the WORKSET file selector is closed, ordered, unique, tracked and profile-bound", { timeout: 120_000 }, async (t) => {
  const first = WORKSET_FILES[0];
  const second = WORKSET_FILES[1];
  const cases = [
    ["unsorted", [second, first], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["duplicate", [first, first], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["case alias", [first.toUpperCase(), first], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["untracked", ["tests/not-tracked.fungi"], "WORKSET", "CORPUS_V2_LOCAL_IDENTITY_REFUSED"],
    ["non-fungi", ["README.md"], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["traversal", ["../outside.fungi"], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["absolute", ["C:/outside.fungi"], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["backslash", [String.raw`tests\\outside.fungi`], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["control", ["tests/\u0001outside.fungi"], "WORKSET", "CORPUS_V2_ARGUMENTS_REFUSED"],
    ["project selector", [first], "PROJECT", "CORPUS_V2_ARGUMENTS_REFUSED"],
  ];
  for (const [name, files, profile, code] of cases) {
    await t.test(name, () => {
      const result = runCorpusV2(corpusV2Args(profile, files));
      assert.equal(result.status, 2, result.stderr || result.stdout);
      assert.match(result.stderr, new RegExp(code));
      assert.doesNotMatch(result.stdout, /^FUNGI_CORPUS_V2 /mu);
    });
  }
  await t.test("unknown flag", () => {
    const args = corpusV2Args("WORKSET", []);
    args.push("--unknown", "1");
    const result = runCorpusV2(args);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /CORPUS_V2_ARGUMENTS_REFUSED/u);
    assert.doesNotMatch(result.stdout, /^FUNGI_CORPUS_V2 /mu);
  });
});

test("the resume selector is unique, exact-case, confined and paired with a fresh distinct output", { timeout: 120_000 }, async (t) => {
  const resumePath = "build/fungi-corpus-check/evidence/prior.json";
  const outputPath = "build/fungi-corpus-check/evidence/next.json";
  const base = corpusV2Args("WORKSET", WORKSET_FILES);
  const cases = [
    ["missing output", [...base, "--resume-evidence", resumePath]],
    ["same output", [...base, "--resume-evidence", resumePath, "--evidence-output", resumePath]],
    ["duplicate", [...base, "--resume-evidence", resumePath, "--resume-evidence", resumePath, "--evidence-output", outputPath]],
    ["case-shadowed flag", [...base, "--Resume-Evidence", resumePath, "--evidence-output", outputPath]],
    ["absolute", [...base, "--resume-evidence", resolve(resumePath), "--evidence-output", outputPath]],
    ["traversal", [...base, "--resume-evidence", "build/fungi-corpus-check/evidence/../prior.json", "--evidence-output", outputPath]],
    ["backslash", [...base, "--resume-evidence", String.raw`build\fungi-corpus-check\evidence\prior.json`, "--evidence-output", outputPath]],
    ["case alias", [...base, "--resume-evidence", "build/FUNGI-corpus-check/evidence/prior.json", "--evidence-output", outputPath]],
  ];
  for (const [name, args] of cases) {
    await t.test(name, () => {
      const result = runCorpusV2(args);
      assert.equal(result.status, 2, result.stderr || result.stdout);
      assert.match(result.stderr, /CORPUS_V2_ARGUMENTS_REFUSED/u);
      assert.doesNotMatch(result.stdout, /^FUNGI_CORPUS_V2 /mu);
    });
  }
  await t.test("absent exact evidence", () => {
    // Exercise a missing receipt in a valid directory on a fresh checkout too.
    mkdirSync(resolve("build/fungi-corpus-check/evidence"), { recursive: true });
    assert.equal(existsSync(resolve(resumePath)), false);
    assert.equal(existsSync(resolve(outputPath)), false);
    const result = runCorpusV2([
      ...base,
      "--resume-evidence",
      resumePath,
      "--evidence-output",
      outputPath,
    ]);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /CORPUS_RESUME_TARGET_REFUSED/u);
    assert.doesNotMatch(result.stdout, /^FUNGI_CORPUS_V2 /mu);
    assert.equal(existsSync(resolve(outputPath)), false);
  });
});

test("the production CLI resumes one exact evidence envelope into a fresh receipt", { timeout: 180_000 }, () => {
  const token = String(process.pid);
  const firstPath = `build/fungi-corpus-check/evidence/resume-cli-${token}-first.json`;
  const secondPath = `build/fungi-corpus-check/evidence/resume-cli-${token}-second.json`;
  const absolutePaths = [resolve(firstPath), resolve(secondPath)];
  for (const path of absolutePaths) if (existsSync(path)) unlinkSync(path);
  try {
    const first = runCorpusV2([...corpusV2Args("WORKSET", WORKSET_FILES), "--evidence-output", firstPath]);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const resumed = runCorpusV2([
      ...corpusV2Args("WORKSET", WORKSET_FILES),
      "--resume-evidence",
      firstPath,
      "--evidence-output",
      secondPath,
    ]);
    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    const firstRun = JSON.parse(first.stdout.trim().slice("FUNGI_CORPUS_V2 ".length));
    const resumedRun = JSON.parse(resumed.stdout.trim().slice("FUNGI_CORPUS_V2 ".length));
    assert.deepEqual(resumedRun.receipts, firstRun.receipts);
    assert.equal(existsSync(resolve(secondPath)), true);
  } finally {
    for (const path of absolutePaths) if (existsSync(path)) unlinkSync(path);
  }
});
