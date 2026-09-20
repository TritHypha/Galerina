#!/usr/bin/env node
// Complete, build-current package test runner for the Galerina workspace.
// Unknown, missing, empty, signalled, timed-out, or uncountable results refuse.

"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  acquireSuiteLease,
  admitInheritedSuiteLease,
} = require("./lib/suite-run-lease.cjs");
const {
  npmTestInvocation,
  parsePackageConcurrency,
  parseTestConcurrency,
} = require("./lib/test-runner-policy.cjs");
const { runOwnedProcess } = require("./lib/owned-process-tree.cjs");

const DEFAULT_ROOT = path.join(__dirname, "..");
const CORE = Object.freeze([
  "galerina-devtools-graph-algorithms",
  "galerina-core-economics",
  "galerina-core-compiler",
  "galerina-core-security",
]);
const RUN_FIRST = new Set(["galerina-core-compiler"]);
const RUN_LAST = new Set(["galerina-devtools-graph-project"]);
const TIMEOUT_MS = 600_000;
const MAX_DIAGNOSTIC_LINES = 32;
const MAX_DIAGNOSTIC_LINE_LENGTH = 1024;
const MAX_FALLBACK_PLAN_STEPS = 128;
const MAX_FALLBACK_PLAN_DEPTH = 16;

function refuseToolchain(detail) {
  return Object.assign(new Error(detail), { code: "TEST-TOOLCHAIN-REFUSED" });
}

function normalizeToolchainError(error) {
  if (error?.code === "TEST-TOOLCHAIN-REFUSED") return error;
  return refuseToolchain(error instanceof Error ? error.message : String(error));
}

function readJsonFile(absolutePath, locator) {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw refuseToolchain(`${locator} is missing or malformed: ${error.message}`);
  }
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ""
    && !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative);
}

function usesBareTypeScriptCompiler(scripts) {
  return Object.values(scripts || {}).some((script) =>
    typeof script === "string"
    && script.split(/&&|\|\||;/u).some((segment) => /^\s*tsc(?:\s|$)/u.test(segment)));
}

function packageNeedsTypeScriptFallback(record) {
  const localCompiler = path.join(
    record.absolutePath,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  if (fs.existsSync(localCompiler)) return false;
  const manifest = readJsonFile(
    path.join(record.absolutePath, "package.json"),
    `${record.path}/package.json`,
  );
  return usesBareTypeScriptCompiler(manifest.scripts);
}

function lockedTypeScriptVersion(packageDirectory, locator) {
  const lock = readJsonFile(
    path.join(packageDirectory, "package-lock.json"),
    `${locator}/package-lock.json`,
  );
  const version = lock.packages?.["node_modules/typescript"]?.version;
  if (typeof version !== "string" || version.length === 0) {
    throw refuseToolchain(
      `${locator}/package-lock.json does not bind node_modules/typescript.version.`,
    );
  }
  return version;
}

function packageTreeDigest(packageDirectory) {
  const realPackageDirectory = fs.realpathSync(packageDirectory);
  const hash = createHash("sha256");
  const visit = (current, prefix) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw refuseToolchain(`The canonical TypeScript package contains a linked entry: ${relative}.`);
      }
      let realEntry;
      try {
        realEntry = fs.realpathSync(absolute);
      } catch (error) {
        throw refuseToolchain(`The canonical TypeScript package entry is unavailable: ${relative}: ${error.message}`);
      }
      if (!isContained(realPackageDirectory, realEntry)) {
        throw refuseToolchain(`The canonical TypeScript package entry escaped its root: ${relative}.`);
      }
      if (entry.isDirectory()) {
        hash.update(`D\0${relative}\0`);
        visit(realEntry, relative);
      } else if (entry.isFile()) {
        const bytes = fs.readFileSync(realEntry);
        hash.update(`F\0${relative}\0${bytes.length}\0`);
        hash.update(bytes);
      } else {
        throw refuseToolchain(`The canonical TypeScript package contains an unsupported entry: ${relative}.`);
      }
    }
  };
  visit(realPackageDirectory, "");
  return `sha256:${hash.digest("hex")}`;
}

function lockedTypeScriptTreeDigest(root, version) {
  const locator = "scripts/toolchain-integrity.json";
  const lock = readJsonFile(path.join(root, locator), locator);
  if (lock === null || typeof lock !== "object" || Array.isArray(lock)
      || Object.keys(lock).sort().join("\0") !== ["packages", "schema"].sort().join("\0")
      || lock.schema !== "galerina-toolchain-integrity.v1"
      || !Array.isArray(lock.packages)
      || lock.packages.length !== 1) {
    throw refuseToolchain(`${locator} has an unsupported closed shape.`);
  }
  const record = lock.packages[0];
  if (record === null || typeof record !== "object" || Array.isArray(record)
      || Object.keys(record).sort().join("\0") !== ["name", "treeDigest", "version"].sort().join("\0")
      || record.name !== "typescript"
      || record.version !== version
      || !/^sha256:[0-9a-f]{64}$/u.test(record.treeDigest)) {
    throw refuseToolchain(`${locator} does not bind the admitted TypeScript package identity.`);
  }
  return record.treeDigest;
}

function prepareTypeScriptFallback(root, selection) {
  const required = selection.filter(packageNeedsTypeScriptFallback);
  if (required.length === 0) return null;

  const absoluteRoot = fs.realpathSync(root);
  const compilerDirectory = path.join(
    absoluteRoot,
    "packages-ts",
    "galerina-core-compiler",
  );
  const installedDirectory = path.join(compilerDirectory, "node_modules", "typescript");
  const compilerPath = path.join(installedDirectory, "bin", "tsc");
  let realInstalledDirectory;
  let realCompilerPath;
  try {
    realInstalledDirectory = fs.realpathSync(installedDirectory);
    realCompilerPath = fs.realpathSync(compilerPath);
  } catch (error) {
    throw refuseToolchain(
      `packages-ts/galerina-core-compiler/node_modules/typescript is unavailable: ${error.message}`,
    );
  }
  if (!isContained(absoluteRoot, realInstalledDirectory)
      || !isContained(realInstalledDirectory, realCompilerPath)
      || !fs.statSync(realCompilerPath).isFile()) {
    throw refuseToolchain("The canonical TypeScript launcher escaped its admitted package root.");
  }

  const installedManifest = readJsonFile(
    path.join(realInstalledDirectory, "package.json"),
    "packages-ts/galerina-core-compiler/node_modules/typescript/package.json",
  );
  const canonicalVersion = lockedTypeScriptVersion(
    compilerDirectory,
    "packages-ts/galerina-core-compiler",
  );
  if (installedManifest.name !== "typescript"
      || installedManifest.version !== canonicalVersion) {
    throw refuseToolchain(
      "The installed canonical TypeScript identity does not match the core-compiler lockfile.",
    );
  }
  const expectedTreeDigest = lockedTypeScriptTreeDigest(absoluteRoot, canonicalVersion);
  const verifyCanonicalTree = () => {
    let observedTreeDigest;
    try {
      observedTreeDigest = packageTreeDigest(realInstalledDirectory);
    } catch (error) {
      throw normalizeToolchainError(error);
    }
    if (observedTreeDigest !== expectedTreeDigest) {
      throw refuseToolchain(
        `The installed canonical TypeScript bytes do not match the repository toolchain lock (${observedTreeDigest} != ${expectedTreeDigest}).`,
      );
    }
  };
  verifyCanonicalTree();
  for (const record of required) {
    const lockedVersion = lockedTypeScriptVersion(record.absolutePath, record.path);
    if (lockedVersion !== canonicalVersion) {
      throw refuseToolchain(
        `${record.path}/package-lock.json binds TypeScript ${lockedVersion}, not ${canonicalVersion}.`,
      );
    }
  }

  const packageSubjects = new Set(required.map((record) => record.subject));
  return Object.freeze({
    version: canonicalVersion,
    treeDigest: expectedTreeDigest,
    packages: Object.freeze([...packageSubjects]),
    compilerPath: realCompilerPath,
    compilerDirectory: realInstalledDirectory,
    requires(subject) {
      return packageSubjects.has(subject);
    },
    verifyCanonical: verifyCanonicalTree,
  });
}

function closedCommandTokens(segment, scriptName) {
  if (segment.length === 0
      || /[\0\r\n|;<>^`$%!'"(){}\[\]\\]/u.test(segment)) {
    throw refuseToolchain(`Package script ${scriptName} is outside the closed fallback command grammar.`);
  }
  const tokens = segment.trim().split(/\s+/u);
  if (tokens.some((token) => token.length === 0 || token.length > 512)) {
    throw refuseToolchain(`Package script ${scriptName} contains an invalid fallback token.`);
  }
  return tokens;
}

function compileFallbackTestPlan(directory) {
  const manifest = readJsonFile(
    path.join(directory, "package.json"),
    `${directory}/package.json`,
  );
  const scripts = manifest?.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    throw refuseToolchain("A fallback package must declare a closed scripts object.");
  }
  const plan = [];
  const active = new Set();

  const appendScript = (scriptName, includeLifecycle, depth) => {
    if (depth > MAX_FALLBACK_PLAN_DEPTH || active.has(scriptName)) {
      throw refuseToolchain(`Package script recursion is not admitted: ${scriptName}.`);
    }
    const script = scripts[scriptName];
    if (typeof script !== "string" || script.trim().length === 0) {
      throw refuseToolchain(`Package script is missing or empty: ${scriptName}.`);
    }
    active.add(scriptName);
    try {
      if (includeLifecycle && typeof scripts[`pre${scriptName}`] === "string") {
        appendScript(`pre${scriptName}`, false, depth + 1);
      }
      if (/\|\||(^|[^&])&([^&]|$)/u.test(script)) {
        throw refuseToolchain(`Package script ${scriptName} uses an unadmitted control operator.`);
      }
      for (const rawSegment of script.split("&&")) {
        const tokens = closedCommandTokens(rawSegment.trim(), scriptName);
        if (tokens[0] === "npm"
            && tokens.length === 3
            && tokens[1] === "run"
            && /^[A-Za-z0-9:_-]+$/u.test(tokens[2])) {
          appendScript(tokens[2], true, depth + 1);
        } else if (tokens[0] === "node" && tokens.length >= 2) {
          plan.push(Object.freeze({ kind: "node", args: Object.freeze(tokens.slice(1)) }));
        } else if (tokens[0] === "tsc") {
          plan.push(Object.freeze({ kind: "tsc", args: Object.freeze(tokens.slice(1)) }));
        } else {
          throw refuseToolchain(
            `Package script ${scriptName} invokes an unadmitted fallback command: ${tokens[0]}.`,
          );
        }
        if (plan.length > MAX_FALLBACK_PLAN_STEPS) {
          throw refuseToolchain("The fallback package execution plan exceeds its step bound.");
        }
      }
      if (includeLifecycle && typeof scripts[`post${scriptName}`] === "string") {
        appendScript(`post${scriptName}`, false, depth + 1);
      }
    } finally {
      active.delete(scriptName);
    }
  };

  appendScript("test", true, 0);
  if (plan.length === 0 || !plan.some((step) => step.kind === "tsc")) {
    throw refuseToolchain("The fallback package plan does not contain an authenticated compiler step.");
  }
  if (plan.filter((step) => step.kind === "node" && step.args[0] === "--test").length !== 1) {
    throw refuseToolchain("The fallback package plan must contain exactly one bounded node:test step.");
  }
  return Object.freeze(plan);
}

function failureEvidence(child, output) {
  const diagnosticLines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /not ok|Error:|fail \d/iu.test(line))
    .slice(0, MAX_DIAGNOSTIC_LINES)
    .map((line) => line.slice(0, MAX_DIAGNOSTIC_LINE_LENGTH));
  return Object.freeze({
    schemaVersion: 1,
    exitCode: typeof child.status === "number" ? child.status : null,
    signal: child.signal ?? null,
    outputBytes: Buffer.byteLength(output, "utf8"),
    outputSha256: createHash("sha256").update(output, "utf8").digest("hex"),
    diagnosticLines,
  });
}

function parseArguments(argv) {
  const options = {
    root: DEFAULT_ROOT,
    json: false,
    list: false,
    core: false,
    bail: false,
    emitCounts: false,
    testConcurrency: parseTestConcurrency(undefined),
    packageConcurrency: parsePackageConcurrency(undefined),
    named: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--root requires a workspace path");
      }
      options.root = path.resolve(value);
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--list") {
      options.list = true;
    } else if (argument === "--core") {
      options.core = true;
    } else if (argument === "--bail") {
      options.bail = true;
    } else if (argument === "--emit-counts") {
      options.emitCounts = true;
    } else if (argument === "--test-concurrency") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--test-concurrency requires an integer from one through four");
      }
      options.testConcurrency = parseTestConcurrency(value);
      index += 1;
    } else if (argument === "--package-concurrency") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--package-concurrency requires one or two");
      }
      options.packageConcurrency = parsePackageConcurrency(value);
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.named.push(argument);
    }
  }
  if (options.core && options.named.length > 0) {
    throw new Error("--core cannot be combined with named packages");
  }
  return options;
}

function parseCounts(output) {
  if (typeof output !== "string" || Buffer.byteLength(output, "utf8") > 64 * 1024 * 1024) {
    return { tests: null, pass: null, fail: null };
  }
  function value(label) {
    const matches = [...output.matchAll(
      new RegExp(`^\\s*(?:#|\\u2139)\\s*${label}\\s+([0-9]{1,16})\\s*$`, "gmu"),
    )];
    if (matches.length !== 1) return null;
    const raw = matches[0]?.[1];
    if (raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return {
    tests: value("tests"),
    pass: value("pass"),
    fail: value("fail"),
  };
}

function cleanChildEnvironment() {
  const childEnv = { ...process.env };
  // A runner invoked by node:test must start a new top-level test process.
  // Inheriting this marker makes Node treat the package suite as recursive
  // and silently skip every file.
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.GALERINA_SUITE_LEASE_NONCE;
  delete childEnv.GALERINA_SUITE_LEASE_ROOT_ID;
  delete childEnv.GALERINA_SUITE_LEASE_OWNER_PID;
  delete childEnv.GALERINA_SUITE_LEASE_MEDIATOR_PID;
  return childEnv;
}

function cleanFallbackEnvironment() {
  const childEnv = cleanChildEnvironment();
  for (const key of Object.keys(childEnv)) {
    if (key.toUpperCase() === "NODE_OPTIONS" || key.toUpperCase() === "NODE_PATH") {
      delete childEnv[key];
    }
  }
  return childEnv;
}

function admitFallbackPlatform(platform) {
  if (platform !== "win32") {
    throw refuseToolchain(
      "The authenticated TypeScript fallback requires the admitted Windows process warden before any lifecycle step can run.",
    );
  }
  return true;
}

function parseJUnitCounts(output) {
  if (typeof output !== "string" || Buffer.byteLength(output, "utf8") > 64 * 1024 * 1024) {
    return { tests: null, pass: null, fail: null };
  }
  const normalized = output.replace(/\r\n/gu, "\n");
  const trailer = normalized.match(
    /\n\t<!-- tests (\d+) -->\n\t<!-- suites (\d+) -->\n\t<!-- pass (\d+) -->\n\t<!-- fail (\d+) -->\n\t<!-- cancelled (\d+) -->\n\t<!-- skipped (\d+) -->\n\t<!-- todo (\d+) -->\n\t<!-- duration_ms (?:\d+(?:\.\d+)?|\.\d+) -->\n<\/testsuites>\n?$/u,
  );
  if (trailer === null
      || !normalized.startsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<testsuites>\n")) {
    return { tests: null, pass: null, fail: null };
  }
  const values = trailer.slice(1, 8).map((value) => Number(value));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return { tests: null, pass: null, fail: null };
  }
  const [tests, , pass, fail, cancelled, skipped, todo] = values;
  if (pass + fail + cancelled + skipped + todo !== tests) {
    return { tests: null, pass: null, fail: null };
  }
  return { tests, pass, fail };
}

function ownedProcessError(owned) {
  if (owned.spawnError !== null) {
    return Object.assign(new Error(owned.spawnError.message), {
      code: owned.spawnError.code,
    });
  }
  if (owned.outputLimitExceeded) {
    return Object.assign(new Error("Owned process exceeded its bounded output limit."), {
      code: "OWNED-PROCESS-OUTPUT-LIMIT",
    });
  }
  if (owned.timedOut) {
    return Object.assign(
      new Error(owned.cleanupDetail),
      { code: owned.cleanupAcknowledged ? "ETIMEDOUT" : "OWNED-PROCESS-TREE-CLEANUP-REFUSED" },
    );
  }
  if (owned.cleanupAttempted && !owned.cleanupAcknowledged) {
    return Object.assign(new Error(owned.cleanupDetail), {
      code: "OWNED-PROCESS-TREE-CLEANUP-REFUSED",
    });
  }
  return null;
}

async function runNpmTest(directory, testScript, testConcurrency) {
  const common = {
    cwd: directory,
    env: cleanChildEnvironment(),
    timeoutMs: TIMEOUT_MS,
    maxOutputBytes: 64 * 1024 * 1024,
    windowsHide: true,
  };
  const invocation = npmTestInvocation({
    platform: process.platform,
    commandShell: process.env.ComSpec,
    testScript,
    concurrency: testConcurrency,
  });
  const owned = await runOwnedProcess({
    command: invocation.command,
    args: invocation.args,
    ...common,
  });
  const error = ownedProcessError(owned);
  return {
    child: {
      status: owned.status,
      signal: owned.signal,
      stdout: owned.stdout,
      stderr: owned.stderr,
      ...(error ? { error } : {}),
      owned,
    },
    boundedNodeTest: invocation.boundedNodeTest,
    countOutput: `${owned.stdout || ""}\n${owned.stderr || ""}`,
  };
}

async function runFallbackTestPlan(record, testConcurrency, typeScriptFallback) {
  admitFallbackPlatform(process.platform);
  const plan = compileFallbackTestPlan(record.absolutePath);
  const started = Date.now();
  let stdout = "";
  let stderr = "";
  let boundedNodeTest = false;
  let countOutput = "";
  let lastOwned = null;
  let error = null;

  for (const step of plan) {
    const elapsed = Date.now() - started;
    const remaining = TIMEOUT_MS - elapsed;
    if (remaining < 1) {
      error = Object.assign(new Error("The closed fallback plan exceeded its deadline."), {
        code: "ETIMEDOUT",
      });
      break;
    }
    const nodeTest = step.kind === "node" && step.args[0] === "--test";
    const args = [...step.args];
    if (nodeTest) {
      if (args.some((argument) => argument === "--test-concurrency"
          || argument.startsWith("--test-concurrency=")
          || argument === "--test-reporter"
          || argument.startsWith("--test-reporter=")
          || argument === "--test-reporter-destination"
          || argument.startsWith("--test-reporter-destination="))) {
        throw refuseToolchain(
          "A fallback package cannot override the governed node:test concurrency or reporter.",
        );
      }
      args.splice(
        1,
        0,
        `--test-concurrency=${testConcurrency}`,
        "--test-reporter=junit",
      );
    }
    boundedNodeTest ||= nodeTest;

    let command = process.execPath;
    let protectedReadTree = null;
    if (step.kind === "tsc") {
      typeScriptFallback.verifyCanonical();
      args.unshift(typeScriptFallback.compilerPath);
      protectedReadTree = typeScriptFallback.compilerDirectory;
    }
    const owned = await runOwnedProcess({
      command,
      args,
      cwd: record.absolutePath,
      env: cleanFallbackEnvironment(),
      timeoutMs: remaining,
      maxOutputBytes: 64 * 1024 * 1024,
      windowsHide: true,
      protectedReadTree,
    });
    lastOwned = owned;
    stdout += owned.stdout || "";
    stderr += owned.stderr || "";
    if (nodeTest) countOutput = owned.stdout || "";
    if (Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8")
        > 64 * 1024 * 1024) {
      error = Object.assign(new Error("Fallback plan output exceeded its bounded limit."), {
        code: "OWNED-PROCESS-OUTPUT-LIMIT",
      });
      break;
    }
    if (step.kind === "tsc") typeScriptFallback.verifyCanonical();
    error = ownedProcessError(owned);
    if (error !== null || owned.status !== 0 || owned.signal !== null) break;
  }

  return {
    child: {
      status: error === null ? (lastOwned?.status ?? null) : lastOwned?.status ?? null,
      signal: lastOwned?.signal ?? null,
      stdout,
      stderr,
      ...(error ? { error } : {}),
      owned: lastOwned,
    },
    boundedNodeTest,
    countOutput,
    counts: parseJUnitCounts(countOutput),
  };
}

function failureFor(child, counts) {
  if (child.error?.code === "ETIMEDOUT") {
    return ["TEST-TIMEOUT", `Package test exceeded ${TIMEOUT_MS}ms.`];
  }
  if (child.error?.code === "OWNED-PROCESS-TREE-CLEANUP-REFUSED") {
    return ["TEST-TREE-CLEANUP-REFUSED", child.error.message];
  }
  if (child.error) {
    return ["TEST-SPAWN-ERROR", child.error.message];
  }
  if (child.signal) {
    return ["TEST-SIGNALLED", `Package test ended by signal ${child.signal}.`];
  }
  if (child.status === null) {
    return ["TEST-STATUS-UNKNOWN", "Package test returned no numeric exit status."];
  }
  if (child.status !== 0) {
    return ["TEST-CHILD-FAILED", `Package test exited ${child.status}.`];
  }
  if (counts.tests === null || counts.pass === null || counts.fail === null) {
    return [
      "TEST-SUMMARY-UNPARSEABLE",
      "Exit zero did not include tests/pass/fail counters.",
    ];
  }
  if (counts.tests === 0) {
    return ["TEST-SUMMARY-EMPTY", "A zero-test suite is not evidence."];
  }
  if (counts.fail !== 0
      || counts.pass !== counts.tests) {
    return [
      "TEST-SUMMARY-MISMATCH",
      `Expected tests=pass and fail=0; observed ${counts.tests}/${counts.pass}/${counts.fail}.`,
    ];
  }
  return null;
}

function toolchainRefusalResult(record, started, error, cleanupAttempted) {
  const output = `Error: ${error.message}\n`;
  return {
    package: record.subject,
    status: "fail",
    exitCode: 1,
    tests: null,
    pass: null,
    fail: null,
    built: false,
    boundedNodeTest: false,
    processControl: {
      ownedTree: false,
      cleanupAttempted,
    },
    durationMs: Date.now() - started,
    failureCode: error.code || "TEST-TOOLCHAIN-REFUSED",
    detail: error.message,
    failureEvidence: failureEvidence({ status: null, signal: null }, output),
    _output: output,
  };
}

async function runPackage(record, testConcurrency, typeScriptFallback) {
  const started = Date.now();
  process.stderr.write(
    `[run-all-tests] START ${record.subject} (test-file ceiling ${testConcurrency})\n`,
  );
  let invocation = null;
  let toolchainError = null;
  try {
    invocation = typeScriptFallback?.requires(record.subject) === true
      ? await runFallbackTestPlan(record, testConcurrency, typeScriptFallback)
      : await runNpmTest(record.absolutePath, record.testScript, testConcurrency);
  } catch (error) {
    toolchainError = normalizeToolchainError(error);
  }
  if (invocation === null) {
    const result = toolchainRefusalResult(
      record,
      started,
      toolchainError || refuseToolchain("TypeScript fallback execution was not admitted."),
      false,
    );
    process.stderr.write(
      `[run-all-tests] END ${record.subject} (${result.status}, ${(result.durationMs / 1000).toFixed(1)}s)\n`,
    );
    return result;
  }
  const child = invocation.child;
  const durationMs = Date.now() - started;
  const output = `${child.stdout || ""}\n${child.stderr || ""}`;
  const counts = invocation.counts ?? parseCounts(invocation.countOutput ?? output);
  const failure = toolchainError === null
    ? failureFor(child, counts)
    : [toolchainError.code || "TEST-TOOLCHAIN-REFUSED", toolchainError.message];
  const result = {
    package: record.subject,
    status: failure === null ? "pass" : "fail",
    exitCode: typeof child.status === "number" ? child.status : 1,
    tests: counts.tests,
    pass: counts.pass,
    fail: counts.fail,
    built: child.error === undefined && child.status !== null,
    boundedNodeTest: invocation.boundedNodeTest,
    processControl: {
      ownedTree: child.owned !== null && child.owned.spawnError === null,
      cleanupAttempted: child.owned?.cleanupAttempted === true,
    },
    durationMs,
    ...(failure === null
      ? {}
      : {
        failureCode: failure[0],
        detail: failure[1],
        failureEvidence: failureEvidence(child, output),
      }),
    _output: output,
  };
  process.stderr.write(
    `[run-all-tests] END ${record.subject} (${result.status}, ${(durationMs / 1000).toFixed(1)}s)\n`,
  );
  return result;
}

async function runPackageGroup(records, options) {
  if (records.length === 0) return [];
  const results = new Array(records.length);
  let nextIndex = 0;
  let refusedNewWork = false;
  const usesTypeScriptFallback = records.some((record) =>
    options.typeScriptFallback?.requires(record.subject) === true);
  const workerCount = usesTypeScriptFallback
    ? 1
    : Math.min(options.packageConcurrency, records.length);

  async function worker() {
    while (true) {
      if (refusedNewWork) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= records.length) return;
      const result = await runPackage(
        records[index],
        options.testConcurrency,
        options.typeScriptFallback,
      );
      results[index] = result;
      if (options.bail && result.status === "fail") refusedNewWork = true;
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.filter((result) => result !== undefined);
}

function testScriptEscapesPackage(record) {
  return /(?:^|[\s"'])\.\.[\\/]/.test(record.testScript);
}

function stablePackageRecords(inventory, policy, options) {
  const exceptions = new Set(Object.keys(policy.packageNoTest || {}));
  const runnable = inventory.packages.filter((record) =>
    record.registered
    && record.exists
    && record.packageJsonError === null
    && record.testScript !== null
    && !exceptions.has(record.subject));
  const byName = new Map();
  for (const record of runnable) {
    byName.set(record.subject, record);
    byName.set(path.basename(record.path), record);
  }

  let selected;
  if (options.named.length > 0) {
    selected = options.named.map((name) => {
      const record = byName.get(name);
      if (!record) throw new Error(`Unknown or non-runnable package: ${name}`);
      return record;
    });
  } else if (options.core) {
    selected = CORE.map((name) => {
      const record = byName.get(name);
      if (!record) throw new Error(`Core package is missing or non-runnable: ${name}`);
      return record;
    });
  } else {
    selected = runnable;
  }

  const unique = [...new Map(
    selected.map((record) => [record.subject, record]),
  ).values()];
  return unique.sort((left, right) => {
    const leftLast = RUN_LAST.has(left.subject);
    const rightLast = RUN_LAST.has(right.subject);
    if (leftLast !== rightLast) return leftLast ? 1 : -1;
    return left.subject.localeCompare(right.subject);
  });
}

function packageContractViolations(violations) {
  return violations.filter((item) =>
    item.code.startsWith("TOOLING-PACKAGE")
    || item.code.startsWith("TOOLING-WORKSPACE")
    || item.code === "TOOLING-POLICY-MALFORMED"
    || item.code === "TOOLING-POLICY-MISSING");
}

function writeCanonicalCounts(root, results) {
  const versionPath = path.join(root, "version.json");
  if (!fs.existsSync(versionPath)) return {
    ok: false,
    detail: `version.json is missing: ${versionPath}`,
  };
  let current;
  try {
    current = JSON.parse(fs.readFileSync(versionPath, "utf8"));
  } catch (error) {
    return { ok: false, detail: `version.json is malformed: ${error.message}` };
  }
  const perPackage = {};
  for (const result of [...results].sort((a, b) =>
    a.package.localeCompare(b.package))) {
    perPackage[result.package] = result.tests;
  }
  const total = results.reduce((sum, result) => sum + result.tests, 0);
  const today = new Date().toISOString().slice(0, 10);
  const next = {
    ...current,
    testCount: total,
    packageCount: results.length,
    packageCountNote:
      `Derived from the complete governed package inventory: `
      + `${results.length}/${results.length} test-bearing packages passed `
      + `their declared build-current test chains; see testCountByPackage.`,
    testCountByPackage: perPackage,
    testCountNote:
      `${today} auto-generated by scripts/run-all-tests.cjs --emit-counts: `
      + `${results.length}/${results.length} packages, `
      + `${total.toLocaleString("en-US")} tests, 0 fail`
      + (typeof perPackage["galerina-core-compiler"] === "number"
        ? ` (compiler ${perPackage["galerina-core-compiler"].toLocaleString("en-US")}).`
        : "."),
  };
  fs.writeFileSync(versionPath, `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true, path: versionPath };
}

function publicResult(result) {
  const { _output, ...visible } = result;
  return visible;
}

function humanReport(report, results) {
  process.stdout.write(
    `Galerina root test runner — ${report.scope}: `
    + `${report.totals.selected} package(s)\n\n`,
  );
  for (const result of results) {
    if (result.status === "pass") {
      process.stdout.write(
        `✅ ${result.package}: ${result.tests} tests `
        + `(${(result.durationMs / 1000).toFixed(1)}s)\n`,
      );
    } else {
      process.stdout.write(
        `❌ ${result.package}: ${result.failureCode} — ${result.detail}\n`,
      );
      for (const line of result._output
        .split(/\r?\n/)
        .filter((candidate) => /not ok|Error:|fail \d/i.test(candidate))
        .slice(0, 8)) {
        process.stdout.write(`   ${line.trim()}\n`);
      }
    }
  }
  process.stdout.write(
    `\n${report.totals.passed}/${report.totals.executed} packages passed`
    + ` · ${report.totals.tests} tests total\n`,
  );
}

async function main() {
  const suiteStarted = Date.now();
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`run-all-tests: ${error.message}\n`);
    process.exit(3);
  }

  let suiteLease;
  try {
    const hasInheritedLease =
      Object.hasOwn(process.env, "GALERINA_SUITE_LEASE_NONCE")
      || Object.hasOwn(process.env, "GALERINA_SUITE_LEASE_ROOT_ID");
    suiteLease = hasInheritedLease
      ? admitInheritedSuiteLease({
        root: options.root,
        expectedCommandClass: "phase-close",
      })
      : acquireSuiteLease({ root: options.root, commandClass: "all-tests" });
  } catch (error) {
    const report = {
      tool: "run-all-tests",
      schemaVersion: 1,
      ok: false,
      root: options.root,
      violations: [{
        code: error.code || "SUITE-LEASE-REFUSED",
        detail: error.message,
      }],
      results: [],
    };
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stderr.write(`run-all-tests: ${report.violations[0].code} — ${error.message}\n`);
    process.exit(1);
  }
  if (!suiteLease.inherited) {
    process.once("exit", () => { suiteLease.release(); });
  }

  const inventoryModule = await import(pathToFileURL(
    path.join(__dirname, "lib", "tooling-inventory.mjs"),
  ).href);
  let inventory;
  let policy;
  let contractViolations;
  try {
    inventory = inventoryModule.discoverTooling(options.root);
    policy = inventoryModule.loadToolingPolicy(options.root);
    contractViolations = packageContractViolations(
      inventoryModule.validateToolingContract(inventory, policy),
    );
  } catch (error) {
    const report = {
      tool: "run-all-tests",
      schemaVersion: 1,
      ok: false,
      root: options.root,
      violations: [{
        code: error.code || "TEST-INVENTORY-ERROR",
        detail: error.message,
      }],
      results: [],
    };
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stderr.write(`run-all-tests: ${error.message}\n`);
    process.exit(1);
  }

  if (contractViolations.length > 0) {
    const report = {
      tool: "run-all-tests",
      schemaVersion: 1,
      ok: false,
      root: options.root,
      violations: contractViolations,
      results: [],
    };
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      for (const item of contractViolations) {
        process.stderr.write(`${item.code} ${item.subject}: ${item.detail}\n`);
      }
    }
    process.exit(1);
  }

  let selection;
  try {
    selection = stablePackageRecords(inventory, policy, options);
  } catch (error) {
    process.stderr.write(`run-all-tests: ${error.message}\n`);
    process.exit(3);
  }

  if (options.list) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify({
        tool: "run-all-tests",
        schemaVersion: 1,
        root: options.root,
        controls: {
          testConcurrency: options.testConcurrency,
          packageConcurrency: options.packageConcurrency,
          processIsolation: "process",
        },
        packages: selection.map((record) => record.subject),
      }, null, 2)}\n`);
    } else {
      process.stdout.write(`Test-bearing packages (${selection.length}):\n`);
      for (const record of selection) {
        process.stdout.write(`  ${record.subject}\n`);
      }
    }
    process.exit(0);
  }

  let typeScriptFallback;
  try {
    typeScriptFallback = prepareTypeScriptFallback(options.root, selection);
  } catch (error) {
    const report = {
      tool: "run-all-tests",
      schemaVersion: 1,
      ok: false,
      root: options.root,
      violations: [{
        code: error.code || "TEST-TOOLCHAIN-REFUSED",
        detail: error.message,
      }],
      results: [],
    };
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stderr.write(`${report.violations[0].code}: ${error.message}\n`);
    process.exit(1);
  }

  const runFirstRecords = selection.filter((record) => RUN_FIRST.has(record.subject));
  const serialRecords = selection.filter((record) =>
    !RUN_FIRST.has(record.subject)
    && !RUN_LAST.has(record.subject)
    && testScriptEscapesPackage(record));
  const parallelRecords = selection.filter((record) =>
    !RUN_FIRST.has(record.subject)
    && !RUN_LAST.has(record.subject)
    && !testScriptEscapesPackage(record));
  const runLastRecords = selection.filter((record) => RUN_LAST.has(record.subject));
  const executed = [];
  const isolatedGroups = [runFirstRecords, parallelRecords, serialRecords, runLastRecords];
  for (const group of isolatedGroups) {
    if (options.bail && executed.some((result) => result.status === "fail")) break;
    executed.push(...await runPackageGroup(group, {
      ...options,
      typeScriptFallback,
      packageConcurrency: group === parallelRecords ? options.packageConcurrency : 1,
    }));
  }
  const resultByPackage = new Map(executed.map((result) => [result.package, result]));
  const results = selection
    .map((record) => resultByPackage.get(record.subject))
    .filter((result) => result !== undefined);
  const visibleResults = results.map(publicResult);
  const passed = results.filter((result) => result.status === "pass").length;
  const failed = results.length - passed;
  const totalTests = results.reduce(
    (sum, result) => sum + (result.status === "pass" ? result.tests : 0),
    0,
  );
  const complete = failed === 0
    && results.length === selection.length;
  const scope = options.named.length > 0
    ? "named"
    : options.core
      ? "core"
      : "all";
  let countWrite = null;
  if (options.emitCounts) {
    if (scope !== "all" || !complete) {
      countWrite = {
        ok: false,
        detail: "Canonical counts require a complete successful full run.",
      };
    } else {
      countWrite = writeCanonicalCounts(options.root, visibleResults);
    }
  }
  const ok = complete && (countWrite === null || countWrite.ok);
  const report = {
    tool: "run-all-tests",
    schemaVersion: 1,
    ok,
    root: options.root,
    scope,
    durationMs: Date.now() - suiteStarted,
    controls: {
      testConcurrency: options.testConcurrency,
      packageConcurrency: options.packageConcurrency,
      processIsolation: "process",
      ...(typeScriptFallback === null ? {} : {
        typescriptFallback: {
          used: true,
          version: typeScriptFallback.version,
          treeDigest: typeScriptFallback.treeDigest,
          packages: typeScriptFallback.packages,
        },
      }),
    },
    totals: {
      selected: selection.length,
      executed: results.length,
      passed,
      failed,
      tests: totalTests,
    },
    results: visibleResults,
    ...(countWrite === null ? {} : { countWrite }),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    humanReport(report, results);
    if (countWrite && !countWrite.ok) {
      process.stderr.write(`--emit-counts refused: ${countWrite.detail}\n`);
    }
  }
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`run-all-tests: ${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = Object.freeze({
  admitFallbackPlatform,
  parseCounts,
});
