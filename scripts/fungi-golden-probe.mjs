#!/usr/bin/env node
// fungi-golden-probe.mjs — derive fail-closed checker/runtime evidence for the
// minimal executable Fungi Golden Pack; never grants release authority.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/fungi-golden-probe.mjs --check|--write\n  select exactly one mode\n  --help, -h  print this usage and exit 0 without reading or writing");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, sortJson(value[key])]),
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function validateCaseDefinition(definition, availableSourceNames) {
  if (!isPlainObject(definition)) throw new Error("case definition must be an object");
  if (definition.schema !== "galerina.fungi-golden-cases.v1") {
    throw new Error("unsupported Golden Pack case schema");
  }
  if (!Array.isArray(definition.examples) || definition.examples.length === 0) {
    throw new Error("Golden Pack requires at least one example");
  }

  const ids = new Set();
  const sources = new Set();
  for (const [index, example] of definition.examples.entries()) {
    if (!isPlainObject(example)) throw new Error(`example ${index} must be an object`);
    requireNonEmptyString(example.id, `example ${index} id`);
    requireNonEmptyString(example.source, `example ${index} source`);
    if (ids.has(example.id)) throw new Error(`duplicate example id: ${example.id}`);
    if (sources.has(example.source)) throw new Error(`duplicate example source: ${example.source}`);
    ids.add(example.id);
    sources.add(example.source);

    if (example.checker !== "STRICT_ZERO_DIAGNOSTICS") {
      throw new Error(`${example.id} has unsupported checker expectation`);
    }
    if (!isPlainObject(example.execution)) {
      throw new Error(`${example.id} execution must be an object`);
    }
    if (example.execution.status === "EXECUTED") {
      if (!new Set(["RAW_CLI", "GOVERNED_CLI"]).has(example.execution.surface)) {
        throw new Error(`${example.id} has unsupported execution surface`);
      }
      requireNonEmptyString(example.execution.flow, `${example.id} execution flow`);
      if (!Array.isArray(example.execution.vectors) || example.execution.vectors.length === 0) {
        throw new Error(`${example.id} requires at least one execution vector`);
      }
      for (const [vectorIndex, vector] of example.execution.vectors.entries()) {
        if (!isPlainObject(vector) || !Array.isArray(vector.arguments)) {
          throw new Error(`${example.id} vector ${vectorIndex} arguments must be an array`);
        }
        if (!vector.arguments.every((argument) => typeof argument === "string")) {
          throw new Error(`${example.id} vector ${vectorIndex} arguments must be strings`);
        }
        const expectedExitCode = vector.expectedExitCode ?? 0;
        if (!Number.isSafeInteger(expectedExitCode) || expectedExitCode < 0) {
          throw new Error(`${example.id} vector ${vectorIndex} expectedExitCode is invalid`);
        }
        const successExpectation = typeof vector.expectedStdout === "string";
        const refusalExpectation = typeof vector.expectedOutputIncludes === "string";
        if (successExpectation === refusalExpectation) {
          throw new Error(
            `${example.id} vector ${vectorIndex} requires exactly one output expectation`,
          );
        }
        if (successExpectation) {
          requireNonEmptyString(
            vector.expectedStdout,
            `${example.id} vector ${vectorIndex} expectedStdout`,
          );
          if (expectedExitCode !== 0) {
            throw new Error(`${example.id} successful vector must expect exit code 0`);
          }
        } else {
          requireNonEmptyString(
            vector.expectedOutputIncludes,
            `${example.id} vector ${vectorIndex} expectedOutputIncludes`,
          );
          if (expectedExitCode === 0) {
            throw new Error(`${example.id} refusal vector must expect a non-zero exit code`);
          }
        }
      }
    } else if (example.execution.status === "NOT_EXECUTED") {
      requireNonEmptyString(example.execution.reason, `${example.id} NOT_EXECUTED reason`);
      if ("vectors" in example.execution || "surface" in example.execution) {
        throw new Error(`${example.id} NOT_EXECUTED must not claim vectors or a surface`);
      }
    } else {
      throw new Error(`${example.id} has unknown execution status`);
    }
  }

  const available = [...availableSourceNames].sort();
  const declared = [...sources].sort();
  if (JSON.stringify(available) !== JSON.stringify(declared)) {
    throw new Error(
      `Golden Pack source set mismatch: declared=${declared.join(",")} available=${available.join(",")}`,
    );
  }
  return definition;
}

export async function listGoldenSources(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".fungi"))
    .map((entry) => entry.name)
    .sort();
}

export async function atomicPublishJson(outputPath, produceValue) {
  const suffix = randomBytes(8).toString("hex");
  const temporary = join(dirname(outputPath), `.${basename(outputPath)}.${suffix}.tmp`);
  try {
    const value = await produceValue();
    await writeFile(temporary, canonicalJson(value), { encoding: "utf8", flag: "wx" });
    await rename(temporary, outputPath);
    return value;
  } finally {
    await rm(temporary, { force: true });
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function assertFileSha256(path, expectedSha256) {
  const observed = sha256(await readFile(path));
  if (observed !== expectedSha256) {
    throw new Error(`${basename(path)} changed during Golden Pack probe`);
  }
}

function relativePath(root, path) {
  const value = relative(root, path).split(sep).join("/");
  if (value === "" || value === ".." || value.startsWith("../")) {
    throw new Error(`path is outside repository: ${path}`);
  }
  return value;
}

async function regularFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`runtime closure contains symlink: ${path}`);
    if (entry.isDirectory()) files.push(...(await regularFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function digestFiles(repositoryRoot, paths) {
  const hash = createHash("sha256");
  for (const path of [...paths].sort((left, right) => left.localeCompare(right, "en"))) {
    const repoPath = relativePath(repositoryRoot, path);
    const bytes = await readFile(path);
    hash.update(Buffer.from(`${repoPath.length}:${repoPath}:${bytes.length}:`, "utf8"));
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

async function runtimeClosureFiles(repositoryRoot) {
  const compilerDist = join(
    repositoryRoot,
    "packages-ts",
    "galerina-core-compiler",
    "dist",
  );
  const files = [join(repositoryRoot, "galerina.mjs")];
  files.push(...(await regularFiles(compilerDist)));
  const governance = join(repositoryRoot, "governance");
  for (const path of await regularFiles(governance)) {
    if (/\.(?:js|mjs|json)$/u.test(path)) files.push(path);
  }
  if (files.length < 2) throw new Error("Galerina runtime closure is empty");
  return files;
}

function runNode(repositoryRoot, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 60_000,
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status === null) throw new Error(`child process ended without an exit code: ${args.join(" ")}`);
  return Object.freeze({
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
}

function exactOutputLine(stdout, expected) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .includes(expected);
}

async function readDefinition(goldenDirectory) {
  const path = join(goldenDirectory, "cases.json");
  const bytes = await readFile(path);
  let definition;
  try {
    definition = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Golden Pack cases.json is malformed: ${error.message}`);
  }
  return Object.freeze({ definition, bytes, path });
}

export async function buildGoldenManifest({ repositoryRoot }) {
  const root = resolve(repositoryRoot);
  const goldenDirectory = join(root, "docs", "examples", "golden");
  const definitionEntry = await readDefinition(goldenDirectory);
  const definitionSha256 = sha256(definitionEntry.bytes);
  const availableSources = await listGoldenSources(goldenDirectory);
  const definition = validateCaseDefinition(definitionEntry.definition, availableSources);
  const probePath = fileURLToPath(import.meta.url);
  const probeRunnerSha256 = sha256(await readFile(probePath));
  const closure = await runtimeClosureFiles(root);
  const runtimeClosureSha256 = await digestFiles(root, closure);
  const evidence = [];
  const sourceSnapshots = [];
  let executedExamples = 0;
  let executionVectors = 0;
  let notExecutedExamples = 0;

  for (const example of definition.examples) {
    const sourcePath = join(goldenDirectory, example.source);
    const sourceBytes = await readFile(sourcePath);
    const sourceDigest = sha256(sourceBytes);
    const sourceSha256 = `sha256:${sourceDigest}`;
    sourceSnapshots.push(Object.freeze({ path: sourcePath, sha256: sourceDigest }));
    const checked = runNode(root, [
      "galerina.mjs",
      "check",
      relativePath(root, sourcePath),
      "--strict-types",
      "--strict-governance",
    ]);
    const checkerOutput = `${checked.stdout}${checked.stderr}`;
    assert.equal(checked.exitCode, 0, `${example.id} checker refused:\n${checkerOutput}`);
    assert.match(
      checkerOutput,
      /0 errors, 0 governance warnings/u,
      `${example.id} did not produce a strict zero-diagnostic result`,
    );

    let execution;
    if (example.execution.status === "NOT_EXECUTED") {
      notExecutedExamples += 1;
      execution = Object.freeze({
        status: "NOT_EXECUTED",
        reason: example.execution.reason,
      });
    } else {
      executedExamples += 1;
      const vectors = [];
      for (const vector of example.execution.vectors) {
        const args = [
          "galerina.mjs",
          "run",
          relativePath(root, sourcePath),
          "--invoke",
          example.execution.flow,
          ...vector.arguments,
        ];
        if (example.execution.surface === "GOVERNED_CLI") args.push("--governed");
        const observed = runNode(root, args);
        const expectedExitCode = vector.expectedExitCode ?? 0;
        assert.equal(
          observed.exitCode,
          expectedExitCode,
          `${example.id} returned unexpected exit code:\n${observed.stdout}${observed.stderr}`,
        );
        if (typeof vector.expectedStdout === "string") {
          assert.equal(
            exactOutputLine(observed.stdout, vector.expectedStdout),
            true,
            `${example.id} did not emit exact output line ${JSON.stringify(vector.expectedStdout)}`,
          );
        } else {
          assert.match(
            `${observed.stdout}${observed.stderr}`,
            new RegExp(vector.expectedOutputIncludes.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
            `${example.id} refusal output did not contain the expected token`,
          );
        }
        executionVectors += 1;
        vectors.push(Object.freeze({
          arguments: Object.freeze([...vector.arguments]),
          expectedExitCode,
          observedExitCode: observed.exitCode,
          ...(typeof vector.expectedStdout === "string"
            ? {
                expectedStdout: vector.expectedStdout,
                observedStdout: vector.expectedStdout,
              }
            : {
                expectedOutputIncludes: vector.expectedOutputIncludes,
                observedOutputIncludes: vector.expectedOutputIncludes,
              }),
        }));
      }
      execution = Object.freeze({
        status: "EXECUTED",
        surface: example.execution.surface,
        flow: example.execution.flow,
        vectors: Object.freeze(vectors),
      });
    }

    evidence.push(Object.freeze({
      id: example.id,
      source: relativePath(root, sourcePath),
      sourceSha256,
      checker: Object.freeze({
        status: "CHECKER_PROVEN",
        diagnostics: "0 errors, 0 governance warnings",
      }),
      execution,
    }));
  }

  for (const snapshot of sourceSnapshots) {
    await assertFileSha256(snapshot.path, snapshot.sha256);
  }
  await assertFileSha256(definitionEntry.path, definitionSha256);
  await assertFileSha256(probePath, probeRunnerSha256);
  const finalRuntimeClosureSha256 = await digestFiles(root, closure);
  assert.equal(
    finalRuntimeClosureSha256,
    runtimeClosureSha256,
    "Galerina runtime closure changed during Golden Pack probe",
  );
  return Object.freeze({
    schema: "galerina.fungi-golden-manifest.v1",
    status: "PROBE_DERIVED_REFERENCE_ONLY",
    exhaustiveLanguageManifest: false,
    inputs: Object.freeze({
      caseDefinition: relativePath(root, definitionEntry.path),
      caseDefinitionSha256: `sha256:${definitionSha256}`,
      probeRunner: relativePath(root, probePath),
      probeRunnerSha256: `sha256:${probeRunnerSha256}`,
    }),
    toolchain: Object.freeze({
      runtimeClosureSha256,
      runtimeClosureFileCount: closure.length,
    }),
    summary: Object.freeze({
      checked: evidence.length,
      executedExamples,
      executionVectors,
      notExecutedExamples,
    }),
    examples: Object.freeze(evidence),
    authority: Object.freeze({
      packageConversionAuthorized: false,
      retirementAuthorized: false,
      releaseAuthorized: false,
      productionAuthorityReleased: false,
    }),
  });
}

export async function runGoldenProbeCli(args = process.argv.slice(2)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = join(repositoryRoot, "build", "fungi-capabilities", "golden-manifest.json");
  if (args.length !== 1 || !new Set(["--check", "--write"]).has(args[0])) {
    throw new Error("usage: node scripts/fungi-golden-probe.mjs --check|--write");
  }
  const manifest = await buildGoldenManifest({ repositoryRoot });
  const expected = canonicalJson(manifest);
  if (args[0] === "--write") {
    await mkdir(dirname(output), { recursive: true });
    await atomicPublishJson(output, async () => manifest);
    process.stdout.write(
      `FUNGI GOLDEN: wrote ${manifest.summary.checked} checked examples and ${manifest.summary.executionVectors} execution vectors\n`,
    );
    return;
  }
  let current;
  try {
    current = await readFile(output, "utf8");
  } catch (error) {
    throw new Error(`Golden Pack manifest is missing or unreadable: ${error.message}`);
  }
  assert.equal(current, expected, "Golden Pack manifest is stale; run audit:fungi-golden:update");
  process.stdout.write(
    `FUNGI GOLDEN: current; ${manifest.summary.checked}/${manifest.summary.checked} checked; ${manifest.summary.executionVectors}/${manifest.summary.executionVectors} execution vectors\n`,
  );
}

const entryPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryPath === import.meta.url) {
  runGoldenProbeCli().catch((error) => {
    process.stderr.write(`REFUSED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
