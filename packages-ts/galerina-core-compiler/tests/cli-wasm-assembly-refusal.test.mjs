import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

function assertNoPassAnnouncement(output) {
  assert.doesNotMatch(output, /\bPASS:/u,
    "a refusing CLI must not announce PASS, even if its eventual exit status is nonzero");
}

test("CLI refusal output guard catches an ordinary PASS announcement", () => {
  assert.throws(
    () => assertNoPassAnnouncement("PASS: Build succeeded\n"),
    /must not announce PASS/u,
  );
});

const cli = resolve(import.meta.dirname, "..", "dist", "cli.js");

function runBuild(dir, { wabtLoader } = {}) {
  const loader = wabtLoader === undefined ? undefined : new URL(wabtLoader, import.meta.url);
  const nodeArgs = loader === undefined
    ? [cli, "build", "--target=wasm-standalone", dir]
    : ["--no-warnings", "--experimental-loader", loader.href, cli, "build", "--target=wasm-standalone", dir];
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: dir,
    encoding: "utf8",
    timeout: 10000,
  });
  return { result, wasmPath: join(dir, "build", "wasm", "output.wasm") };
}

function runCheck(target) {
  return spawnSync(process.execPath, [cli, "check", target], {
    encoding: "utf8",
    timeout: 10000,
  });
}

function runWatchWithRegistrationFailure(target) {
  const hookPath = join(dirname(target), "watch-registration-failure-hook.mjs");
  writeFileSync(hookPath, `import fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
const target = process.env.GALERINA_TEST_WATCH_TARGET;
const marker = process.env.GALERINA_TEST_WATCH_MARKER;
const ordinaryRequire = createRequire(import.meta.url);
globalThis.require = (specifier) => specifier === "fs" ? fs : ordinaryRequire(specifier);
const originalWatch = fs.watch;
fs.watch = function(file, ...args) {
  if (file === target) {
    fs.writeFileSync(marker, "watch registration hook fired");
    throw new Error("injected recursive watch registration failure");
  }
  return Reflect.apply(originalWatch, this, [file, ...args]);
};
syncBuiltinESMExports();
`);
  const markerPath = join(dirname(target), "watch-registration-hook-fired");
  return spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "check", "--watch", target], {
    cwd: dirname(target),
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, GALERINA_TEST_WATCH_TARGET: target, GALERINA_TEST_WATCH_MARKER: markerPath },
  });
}

function runCheckWithSourceReplacement(target, sourcePath, replacementKind = "regular") {
  const markerPath = join(target, "source-replacement-hook-fired");
  const hookPath = join(target, "source-replacement-hook.mjs");
  const replacementSource = `@version 1
pure flow replacement() -> Bool
contract { intent { "replacement source must not be consumed after validation" } effects {} }
{ return 100 < 101 }
route GET "/replacement" { flow replacement }
`;
  const hookSource = `import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

const targetPath = resolve(process.env.GALERINA_TEST_SOURCE_PATH);
const markerPath = resolve(process.env.GALERINA_TEST_SOURCE_REPLACEMENT_MARKER);
const replacementKind = process.env.GALERINA_TEST_SOURCE_REPLACEMENT_KIND;
const replacement = ${JSON.stringify(replacementSource)};
let replaced = false;
const originalOpenSync = fs.openSync;
fs.openSync = function(file, ...args) {
  if (!replaced && typeof file === "string" && resolve(file) === targetPath) {
    replaced = true;
    fs.renameSync(targetPath, targetPath + ".displaced");
    if (replacementKind === "fifo") execFileSync("mkfifo", [targetPath]);
    else fs.writeFileSync(targetPath, replacement);
    fs.writeFileSync(markerPath, "replacement installed");
  }
  return Reflect.apply(originalOpenSync, this, [file, ...args]);
};
syncBuiltinESMExports();
`;
  writeFileSync(hookPath, hookSource);
  return spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "check", target], {
    cwd: target,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      GALERINA_TEST_SOURCE_PATH: sourcePath,
      GALERINA_TEST_SOURCE_REPLACEMENT_MARKER: markerPath,
      GALERINA_TEST_SOURCE_REPLACEMENT_KIND: replacementKind,
    },
  });
}

function runBuildWithPartialWriteFailure(dir, failOnWrite) {
  const outputDir = join(dir, "build", "wasm");
  const hookPath = join(dir, "partial-output-write-hook.mjs");
  writeFileSync(hookPath, `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, resolve } from "node:path";

const outputDir = resolve(process.env.GALERINA_TEST_OUTPUT_DIR);
const failOnWrite = Number(process.env.GALERINA_TEST_FAIL_ON_WRITE);
let outputWrites = 0;
const outputDescriptors = new Set();
const originalOpenSync = fs.openSync;
fs.openSync = function(file, flags, mode) {
  const fd = Reflect.apply(originalOpenSync, this, arguments);
  if (typeof file === "string" && dirname(resolve(file)) === outputDir) outputDescriptors.add(fd);
  return fd;
};
const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = function(file, data, options) {
  if (outputDescriptors.has(file)) {
    outputWrites += 1;
    if (outputWrites === failOnWrite) {
      const bytes = typeof data === "string"
        ? Buffer.from(data, typeof options === "object" ? options.encoding ?? "utf8" : "utf8")
        : Buffer.from(data);
      const prefix = bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2)));
      fs.writeSync(file, prefix);
      const error = new Error("injected partial output write");
      error.code = "ENOSPC";
      throw error;
    }
  }
  return Reflect.apply(originalWriteFileSync, this, arguments);
};
syncBuiltinESMExports();
`);
  return spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
    cwd: dir,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      GALERINA_TEST_OUTPUT_DIR: outputDir,
      GALERINA_TEST_FAIL_ON_WRITE: String(failOnWrite),
    },
  });
}

function runBuildWithPublicationFailure(dir, outputLeaf, failurePoint) {
  const outputDir = join(dir, "build", "wasm");
  const hookPath = join(dir, "publication-failure-hook.mjs");
  writeFileSync(hookPath, `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, resolve } from "node:path";

const outputDir = resolve(process.env.GALERINA_TEST_OUTPUT_DIR);
const outputLeaf = process.env.GALERINA_TEST_OUTPUT_LEAF;
const failurePoint = process.env.GALERINA_TEST_PUBLICATION_FAILURE;
const markerPath = process.env.GALERINA_TEST_PUBLICATION_MARKER;
const temporaryDescriptors = new Set();
const outputDescriptors = new Map();
let injected = false;
let linkReturned = false;
const originalOpenSync = fs.openSync;
fs.openSync = function(file, ...args) {
  const descriptor = Reflect.apply(originalOpenSync, this, [file, ...args]);
  if (typeof file === "string" && resolve(dirname(file)) === outputDir
    && basename(file).startsWith("." + outputLeaf + ".tmp-")) {
    outputDescriptors.set(descriptor, resolve(file));
  }
  if (failurePoint === "after-temp-create" && typeof file === "string"
    && resolve(dirname(file)) === outputDir && basename(file).startsWith("." + outputLeaf + ".tmp-")) {
    temporaryDescriptors.add(descriptor);
  }
  return descriptor;
};
const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = function(file, ...args) {
  const result = Reflect.apply(originalWriteFileSync, this, [file, ...args]);
  if (!injected && failurePoint === "same-size-mutation" && outputDescriptors.has(file)) {
    const mutationDescriptor = fs.openSync(outputDescriptors.get(file), "r+");
    try {
      const stats = fs.fstatSync(mutationDescriptor);
      if (stats.size < 1) throw new Error("mutation control requires non-empty output");
      const mutated = Buffer.alloc(stats.size);
      const bytesRead = fs.readSync(mutationDescriptor, mutated, 0, mutated.length, 0);
      if (bytesRead !== mutated.length) throw new Error("mutation control could not read the full temporary output");
      mutated[mutated.length - 1] ^= 1;
      fs.writeSync(mutationDescriptor, mutated, 0, mutated.length, 0);
      const after = fs.fstatSync(mutationDescriptor);
      injected = true;
      fs.writeFileSync(markerPath, JSON.stringify({
        phase: "before-readback",
        devBefore: stats.dev,
        inoBefore: stats.ino,
        sizeBefore: stats.size,
        devAfter: after.dev,
        inoAfter: after.ino,
        sizeAfter: after.size,
      }));
    } finally {
      fs.closeSync(mutationDescriptor);
    }
  }
  return result;
};
const originalFstatSync = fs.fstatSync;
fs.fstatSync = function(descriptor, ...args) {
  if (!injected && failurePoint === "after-temp-create" && temporaryDescriptors.has(descriptor)) {
    injected = true;
    const error = new Error("injected fstat failure after temporary creation");
    error.code = "EIO";
    throw error;
  }
  return Reflect.apply(originalFstatSync, this, [descriptor, ...args]);
};
const originalLinkSync = fs.linkSync;
fs.linkSync = function(source, destination, ...args) {
  if (!injected && failurePoint === "same-size-mutation-at-link"
    && typeof destination === "string" && basename(destination) === outputLeaf) {
    const mutationDescriptor = fs.openSync(resolve(source), "r+");
    try {
      const before = fs.fstatSync(mutationDescriptor);
      if (before.size < 1) throw new Error("link-boundary mutation control requires non-empty output");
      const mutated = Buffer.alloc(before.size);
      const bytesRead = fs.readSync(mutationDescriptor, mutated, 0, mutated.length, 0);
      if (bytesRead !== mutated.length) throw new Error("link-boundary mutation control could not read the full temporary output");
      mutated[mutated.length - 1] ^= 1;
      fs.writeSync(mutationDescriptor, mutated, 0, mutated.length, 0);
      const after = fs.fstatSync(mutationDescriptor);
      injected = true;
      fs.writeFileSync(markerPath, JSON.stringify({
        phase: "at-link-boundary",
        temporaryPath: resolve(source),
        devBefore: before.dev,
        inoBefore: before.ino,
        sizeBefore: before.size,
        devAfter: after.dev,
        inoAfter: after.ino,
        sizeAfter: after.size,
      }));
    } finally {
      fs.closeSync(mutationDescriptor);
    }
  }
  const result = Reflect.apply(originalLinkSync, this, [source, destination, ...args]);
  if (failurePoint === "after-link" && typeof destination === "string" && basename(destination) === outputLeaf) {
    linkReturned = true;
  }
  return result;
};
const originalLstatSync = fs.lstatSync;
fs.lstatSync = function(file, ...args) {
  if (!injected && failurePoint === "after-link" && linkReturned && typeof file === "string"
    && resolve(file) === resolve(outputDir, outputLeaf)) {
    injected = true;
    const error = new Error("injected post-link lstat failure");
    error.code = "EIO";
    throw error;
  }
  return Reflect.apply(originalLstatSync, this, [file, ...args]);
};
syncBuiltinESMExports();
`);
  return spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
    cwd: dir,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      GALERINA_TEST_OUTPUT_DIR: outputDir,
      GALERINA_TEST_OUTPUT_LEAF: outputLeaf,
      GALERINA_TEST_PUBLICATION_FAILURE: failurePoint,
      GALERINA_TEST_PUBLICATION_MARKER: join(dir, "publication-mutation-fired"),
    },
  });
}

function runBuildWithTemporaryLeafSubstitution(dir, boundary = "before-link") {
  const outputDir = join(dir, "build", "wasm");
  const hookPath = join(dir, "temporary-leaf-substitution-hook.mjs");
  writeFileSync(hookPath, `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, resolve } from "node:path";

const outputDir = resolve(process.env.GALERINA_TEST_OUTPUT_DIR);
const boundary = process.env.GALERINA_TEST_SUBSTITUTION_BOUNDARY;
const sentinel = "attacker-selected temporary bytes";
const originalLinkSync = fs.linkSync;
let substituted = false;
fs.linkSync = function(source, destination) {
  if (boundary === "before-link" && !substituted && typeof source === "string" && typeof destination === "string"
    && resolve(dirname(source)) === outputDir && basename(destination) === "output.wat") {
    substituted = true;
    fs.renameSync(source, source + ".displaced");
    fs.writeFileSync(source, sentinel);
  }
  return Reflect.apply(originalLinkSync, this, arguments);
};
syncBuiltinESMExports();
`);
  return spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
    cwd: dir,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, GALERINA_TEST_OUTPUT_DIR: outputDir, GALERINA_TEST_SUBSTITUTION_BOUNDARY: boundary },
  });
}

function runBuildWithOutputDirectoryReplacement(dir, replaceAfterValidation) {
  const outputDir = join(dir, "build", "wasm");
  const hookPath = join(dir, "output-directory-replacement-hook.mjs");
writeFileSync(hookPath, `import fs from "node:fs";
import { join, resolve } from "node:path";

const outputDir = resolve(process.env.GALERINA_TEST_OUTPUT_DIR);
const shouldReplace = process.env.GALERINA_TEST_REPLACE_OUTPUT_DIRECTORY === "1";
let replaced = false;
const originalChdir = process.chdir;
process.chdir = function(directory) {
  const resolved = resolve(directory);
  if (shouldReplace && !replaced && resolved === outputDir) {
    replaced = true;
    const displaced = outputDir + ".displaced";
    fs.renameSync(outputDir, displaced);
    fs.mkdirSync(outputDir);
    fs.writeFileSync(join(outputDir, "output.wat"), "replacement WAT sentinel");
    fs.writeFileSync(join(outputDir, "output.wasm"), "replacement WASM sentinel");
  }
  return originalChdir.call(process, directory);
};
`);
  return spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
    cwd: dir,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      GALERINA_TEST_OUTPUT_DIR: outputDir,
      GALERINA_TEST_REPLACE_OUTPUT_DIRECTORY: replaceAfterValidation ? "1" : "0",
    },
  });
}

function runBuildWithOutputDirectoryValidationFailure(dir) {
  const outputDir = join(dir, "build", "wasm");
  const hookPath = join(dir, "output-directory-validation-failure-hook.mjs");
  const failureMarker = join(dir, "output-directory-validation-failure-hook-fired");
  writeFileSync(hookPath, `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
let createdOutputDirectory = false;
let failed = false;
const marker = process.env.GALERINA_TEST_FAILURE_MARKER;
const originalMkdirSync = fs.mkdirSync;
fs.mkdirSync = function(path, ...args) {
  const result = Reflect.apply(originalMkdirSync, this, [path, ...args]);
  if (path === "wasm") createdOutputDirectory = true;
  return result;
};
const originalRealpathSync = fs.realpathSync;
fs.realpathSync = function(path, ...args) {
  if (!failed && createdOutputDirectory) {
    failed = true;
    fs.writeFileSync(marker, "injected");
    const error = new Error("injected output-directory validation failure for " + String(path));
    error.code = "EIO";
    throw error;
  }
  return Reflect.apply(originalRealpathSync, this, [path, ...args]);
};
syncBuiltinESMExports();
`);
  return {
    failureMarker,
    result: spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, GALERINA_TEST_OUTPUT_DIR: outputDir, GALERINA_TEST_FAILURE_MARKER: failureMarker },
    }),
  };
}

function runBuildWithOutputDirectoryIdentityCaptureFailure(dir) {
  const outputDir = join(dir, "build", "wasm");
  const hookPath = join(dir, "output-directory-identity-failure-hook.mjs");
  const failureMarker = join(dir, "output-directory-identity-failure-hook-fired");
  writeFileSync(hookPath, `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

const marker = process.env.GALERINA_TEST_FAILURE_MARKER;
let failed = false;
const originalLstatSync = fs.lstatSync;
fs.lstatSync = function(path, ...args) {
  const observedPath = String(path);
  if (!failed && (observedPath === "wasm" || observedPath.endsWith("/wasm") || observedPath.endsWith("\\\\wasm"))) {
    failed = true;
    fs.writeFileSync(marker, "injected");
    const error = new Error("injected identity-capture failure for " + String(path));
    error.code = "EIO";
    throw error;
  }
  return Reflect.apply(originalLstatSync, this, [path, ...args]);
};
syncBuiltinESMExports();
`);
  return {
    failureMarker,
    result: spawnSync(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, GALERINA_TEST_OUTPUT_DIR: outputDir, GALERINA_TEST_FAILURE_MARKER: failureMarker },
    }),
  };
}

function withBuildDirectory(run) {
  const dir = mkdtempSync(join(tmpdir(), "fungi-assembly-refusal-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("standalone build rolls back a newly created output directory when validation throws", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "A validation failure after directory creation must roll back that directory." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const { failureMarker, result } = runBuildWithOutputDirectoryValidationFailure(dir);
    assert.equal(result.error, undefined, `process error: ${result.error}`);
    assert.equal(existsSync(failureMarker), true, "the injected validation failure must occur after directory creation");
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /injected output-directory validation failure/u,
      "successful rollback must preserve the original validation error");
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.equal(existsSync(join(dir, "build")), true, "the pre-existing parent must remain");
    assert.equal(existsSync(join(dir, "build", "wasm")), false,
      `the empty directory created by this invocation should be rolled back after validation fails:\n${result.stderr}\n${result.stdout}`);
  });
});

test("standalone build reports and preserves a created output directory when identity capture fails", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Do not delete an output directory whose identity capture failed." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const { failureMarker, result } = runBuildWithOutputDirectoryIdentityCaptureFailure(dir);
    const outputDir = join(dir, "build", "wasm");
    assert.equal(result.error, undefined, `process error: ${result.error}`);
    assert.equal(existsSync(failureMarker), true,
      `the injected post-mkdir lstat failure must occur (status=${result.status}, signal=${result.signal}):\n${result.stderr}\n${result.stdout}`);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assertNoPassAnnouncement(result.stdout);
    assert.equal(existsSync(outputDir), true, "the unverified directory must be preserved rather than deleted by name");
    assert.match(result.stderr, /identity could not be verified/i,
      `refusal must explain why the created directory was preserved:\n${result.stderr}`);
    assert.match(result.stderr, /injected identity-capture failure/i,
      `the original setup failure must remain visible alongside the rollback refusal:\n${result.stderr}`);
    assert.match(result.stderr, /preserving .*build[\\/]wasm/i,
      `refusal must identify the last-known allocation:\n${result.stderr}`);
  });
});

test("standalone WASM pair rolls back when publication parent is renamed away without replacement", {
  skip: process.platform !== "linux",
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), "fungi-output-parent-absent-race-"));
  let externalDir;
  try {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "A renamed-away output parent must not leave a partially published pair." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);
    const run = await runBuildAtFilesystemBoundary({
      dir,
      operation: "linkSync",
      outputName: "output.wasm",
      replaceParent: "absent",
    });
    externalDir = run.externalDir;
    assert.equal(run.replacementBlocked, false, "Linux should permit the controlled rename-only race");
    assert.equal(run.result.code, 1, `${run.stderr}\n${run.stdout}`);
    assert.doesNotMatch(run.stdout, /\bPASS:/);
    assert.deepEqual(
      ["output.wat", "output.wasm"].map((name) => existsSync(join(run.displacedDir, name))),
      [false, false],
      `refused publication must roll back both leaves from the relocated directory:\n${run.stderr}\n${run.stdout}`,
    );
    assert.equal(readFileSync(run.externalNeighbor, "utf8"), run.neighborSentinel);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (externalDir) rmSync(externalDir, { recursive: true, force: true });
  }
});

test("assembler rejection fails the CLI without claiming PASS or a WASM artifact", () => {
  const source = `@version 1
pure flow probe() -> Bool
contract { intent { "Assembly refusal regression." } effects {} }
{ return 0b10 < 0b11 }
route GET "/probe" { flow probe }
`;
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), source);
    const { result, wasmPath } = runBuild(dir, { wabtLoader: "./helpers/deny-wabt-loader.mjs" });
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.match(result.stderr, /wabt not available|minimal encoder/i,
      "controlled no-WABT run must exercise the fallback refusal path");
    assert.match(result.stdout + result.stderr, /assembler/i, "fixture must reach the assembler refusal");
    assert.equal(result.status, 1, "assembler refusal must be a failed build");
    assert.doesNotMatch(result.stdout, /\bPASS:/, "refused build must not announce PASS");
    assert.equal(existsSync(wasmPath), false, "refused build must not leave an output.wasm");
  });
});

test("assemblable decimal control still produces a WASM artifact and exits successfully", () => {
  const source = `@version 1
pure flow probe() -> Bool
contract { intent { "Assembly acceptance control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`;
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), source);
    const { result, wasmPath } = runBuild(dir);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 0, `control build failed:\n${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), true, "control must emit output.wasm");
  });
});

test("resolved assembler rejection fails the CLI and does not leave stale WASM", () => {
  const source = `@version 1
pure flow probe() -> Bool
contract { intent { "A resolved assembler rejection must fail closed." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`;
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), source);
    const wasmDir = join(dir, "build", "wasm");
    mkdirSync(wasmDir, { recursive: true });
    const staleWasm = join(wasmDir, "output.wasm");
    writeFileSync(staleWasm, "stale WASM must be removed before rebuild");

    const { result } = runBuild(dir, { wabtLoader: "./helpers/reject-wabt-loader.mjs" });
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.match(result.stderr, /controlled WABT rejection/i,
      "the resolved WABT test provider must reject the candidate");
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.equal(existsSync(staleWasm), false, "refusal must not leave a stale runnable WASM");
  });
});

test("a partial WAT write failure leaves no canonical partial output or temporary sibling", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Partial WAT publication refusal control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const result = runBuildWithPartialWriteFailure(dir, 1);
    const outputDir = join(dir, "build", "wasm");
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /ENOSPC|partial output write/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.deepEqual(readdirSync(outputDir), [], "failed WAT publication must leave no canonical or temporary output");
  });
});

test("a partial WASM write failure leaves no canonical partial binary or temporary sibling", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Partial WASM publication refusal control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const result = runBuildWithPartialWriteFailure(dir, 2);
    const outputDir = join(dir, "build", "wasm");
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /ENOSPC|partial output write/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.deepEqual(readdirSync(outputDir), ["output.wat"], "only the complete WAT may remain after WASM publication fails");
    assert.match(readFileSync(join(outputDir, "output.wat"), "utf8"), /\(module\b/, "the earlier WAT must be complete");
  });
});

for (const outputLeaf of ["output.wat", "output.wasm"]) {
  test(`temporary creation failure reports its unverified residue for ${outputLeaf}`, () => {
    withBuildDirectory((dir) => {
      writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "A temporary file without a verified identity must not be silently lost." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

      const result = runBuildWithPublicationFailure(dir, outputLeaf, "after-temp-create");
      const outputDir = join(dir, "build", "wasm");
      assert.equal(result.error, undefined, `child process error: ${result.error}`);
      assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
      assert.match(result.stderr, /temporary.*may remain|temporary.*identity could not be verified/i);
      assertNoPassAnnouncement(result.stdout);
      assert.equal(existsSync(join(outputDir, "output.wat")), outputLeaf === "output.wasm",
        "only the earlier, complete WAT may exist when WASM temporary creation fails");
      assert.equal(existsSync(join(outputDir, "output.wasm")), false,
        "a temporary-creation failure must not leave a canonical WASM artifact");
      const residue = readdirSync(outputDir).filter((name) => name.startsWith(`.${outputLeaf}.tmp-`));
      assert.equal(residue.length, 1, "the unverified temporary entry is retained and reported, not blindly removed");
    });
  });

  test(`post-link verification failure removes the just-published canonical leaf for ${outputLeaf}`, () => {
    withBuildDirectory((dir) => {
      writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "A failure after hard-link publication must disclose the output state." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

      const result = runBuildWithPublicationFailure(dir, outputLeaf, "after-link");
      const outputDir = join(dir, "build", "wasm");
      assert.equal(result.error, undefined, `child process error: ${result.error}`);
      assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
      assert.match(result.stderr, /injected post-link lstat failure/i);
      assertNoPassAnnouncement(result.stdout);
      assert.equal(existsSync(join(outputDir, outputLeaf)), false,
        "a failed publication must remove the canonical hard link when its identity is still provable from the temporary inode");
    });
  });
}

test("same-size mutation of the temporary WASM is refused before canonical publication", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Temporary WASM bytes must match the compiler output before publication." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const result = runBuildWithPublicationFailure(dir, "output.wasm", "same-size-mutation");
    const outputDir = join(dir, "build", "wasm");
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(existsSync(join(dir, "publication-mutation-fired")), true,
      `the same-inode mutation control must execute (status=${result.status}):\n${result.stderr}\n${result.stdout}`);
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /temporary.*changed|contents.*changed|bytes.*changed/i);
    assertNoPassAnnouncement(result.stdout);
    assert.equal(existsSync(join(outputDir, "output.wasm")), false,
      "mutated temporary bytes must not be published at the canonical WASM path");
  });
});

test("same-size mutation after byte verification is refused at the link boundary", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Publication must not accept changed bytes after verification." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const result = runBuildWithPublicationFailure(dir, "output.wasm", "same-size-mutation-at-link");
    const outputDir = join(dir, "build", "wasm");
    const markerPath = join(dir, "publication-mutation-fired");
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(existsSync(markerPath), true,
      `the link-boundary mutation control must execute (status=${result.status}):\n${result.stderr}\n${result.stdout}`);
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(marker.phase, "at-link-boundary");
    assert.deepEqual(
      [marker.devAfter, marker.inoAfter, marker.sizeAfter],
      [marker.devBefore, marker.inoBefore, marker.sizeBefore],
      "the controlled mutation must preserve device, inode and length",
    );
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /temporary.*changed|contents.*changed|bytes.*changed|publication.*changed/i);
    assertNoPassAnnouncement(result.stdout);
    assert.equal(existsSync(join(outputDir, "output.wasm")), false,
      "same-size changed bytes must not reach the canonical WASM path");
    assert.equal(existsSync(marker.temporaryPath), false,
      "refusal must remove the owned temporary leaf after verifying the canonical output is absent");
  });
});

test("temporary-leaf substitution before hard-link publication leaves no substituted canonical output", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Temporary leaf substitution refusal control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    const result = runBuildWithTemporaryLeafSubstitution(dir);
    const outputDir = join(dir, "build", "wasm");
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /temporary output changed|identity changed/i);
    assertNoPassAnnouncement(result.stdout);
    assert.equal(existsSync(join(outputDir, "output.wat")), false,
      "refusal must not leave the substituted temporary bytes at the canonical output path");
    const substitutedTemps = readdirSync(outputDir).filter((name) =>
      name.startsWith(".output.wat.tmp-") && !name.endsWith(".displaced"));
    assert.equal(substitutedTemps.length, 1, "the unrelated substituted temp entry must be preserved");
    assert.equal(readFileSync(join(outputDir, substitutedTemps[0]), "utf8"), "attacker-selected temporary bytes");
  });
});

test("same-path real output-directory replacement is refused without deleting its sentinels", () => {
  for (const replaceAfterValidation of [false, true]) {
    withBuildDirectory((dir) => {
      writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Same-path output directory replacement control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

      const result = runBuildWithOutputDirectoryReplacement(dir, replaceAfterValidation);
      const outputDir = join(dir, "build", "wasm");
      assert.equal(result.error, undefined, `child process error: ${result.error}`);
      if (!replaceAfterValidation) {
        assert.equal(result.status, 0, `same-tool positive control failed:\n${result.stderr}\n${result.stdout}`);
        assert.match(result.stdout, /\bPASS:/);
        const wasm = readFileSync(join(outputDir, "output.wasm"));
        assert.equal(WebAssembly.validate(wasm), true, "positive control must publish a valid WASM artifact");
      } else {
        assert.equal(result.status, 1, `replacement must refuse:\n${result.stderr}\n${result.stdout}`);
        assert.doesNotMatch(result.stdout, /\bPASS:/);
        assert.deepEqual(readdirSync(outputDir).sort(), ["output.wasm", "output.wat"]);
        assert.equal(readFileSync(join(outputDir, "output.wat"), "utf8"), "replacement WAT sentinel");
        assert.equal(readFileSync(join(outputDir, "output.wasm"), "utf8"), "replacement WASM sentinel");
      }
    });
  }
});

test("frontend refusal invalidates previously successful standalone outputs", () => {
  const goodSource = `@version 1
pure flow probe() -> Bool
contract { intent { "Stale artifact positive control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`;
  const badSource = `@version 1
pure flow probe() -> Bool
contract { intent { "Frontend refusal stale artifact control." } effects {} }
{ return missingReviewIdentifier }
route GET "/probe" { flow probe }
`;

  withBuildDirectory((dir) => {
    const sourcePath = join(dir, "probe.fungi");
    writeFileSync(sourcePath, goodSource);
    const first = runBuild(dir);
    assert.equal(first.result.error, undefined, `positive process error: ${first.result.error}`);
    assert.equal(first.result.status, 0, `positive build failed:\n${first.result.stderr}\n${first.result.stdout}`);
    assert.equal(existsSync(first.wasmPath), true, "positive must create the artifact before refusal");

    writeFileSync(sourcePath, badSource);
    const second = runBuild(dir);
    assert.equal(second.result.error, undefined, `refusal process error: ${second.result.error}`);
    assert.equal(second.result.status, 1, "frontend refusal must fail the standalone build");
    assert.match(second.result.stdout + second.result.stderr, /FUNGI-NAME-001/);
    assert.equal(existsSync(second.wasmPath), false, "frontend refusal must not leave prior output in the canonical path");
    assert.equal(existsSync(join(dir, "build", "wasm", "output.wat")), false, "frontend refusal must not leave stale WAT at the canonical path");
  });
});

test("empty standalone input refuses and removes a prior artifact", () => {
  withBuildDirectory((dir) => {
    const wasmPath = join(dir, "build", "wasm", "output.wasm");
    const watPath = join(dir, "build", "wasm", "output.wat");
    mkdirSync(join(dir, "build", "wasm"), { recursive: true });
    writeFileSync(wasmPath, "prior standalone output");
    writeFileSync(watPath, "prior standalone text output");

    const { result } = runBuild(dir);
    assert.equal(result.error, undefined, `process error: ${result.error}`);
    assert.equal(result.status, 1, "empty standalone input must not report successful build status");
    assert.match(result.stderr, /requires at least one \.fungi source/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), false, "empty input must not retain old standalone output");
    assert.equal(existsSync(watPath), false, "empty input must not retain stale WAT output");
  });
});

test("standalone entry selection excludes visible schema files reached through hidden wrappers", () => {
  withBuildDirectory((dir) => {
    const hiddenDeps = join(dir, "deps", ".hidden");
    mkdirSync(hiddenDeps, { recursive: true });
    writeFileSync(join(dir, "deps", "types.fungi"), "@version 1\ntype UserId = String\n");
    writeFileSync(join(hiddenDeps, "wrapper.fungi"), `@version 1
import "../types.fungi"
type WrapperId = UserId
`);
    writeFileSync(join(dir, "main.fungi"), `@version 1
import "./deps/.hidden/wrapper.fungi"
pure flow echo(value: WrapperId) -> WrapperId
contract { intent { "A visible schema file imported through a hidden wrapper is not an entry." } effects {} }
{ return value }
route GET "/main" { flow echo }
`);

    const { result, wasmPath } = runBuild(dir);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 0, `schema dependency must not be counted as another entry: ${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), true, "schema dependency control should emit the standalone artifact");
  });
});

test("standalone discovery refuses a FIFO named as a Fungi source", { skip: process.platform !== "linux" }, () => {
  withBuildDirectory((dir) => {
    const source = join(dir, "ignored.fungi");
    writeFileSync(join(dir, "main.fungi"), `@version 1
pure flow mainProbe() -> Bool
contract { intent { "A regular source remains alongside the FIFO control." } effects {} }
{ return 10 < 11 }
route GET "/main" { flow mainProbe }
`);
    execFileSync("mkfifo", [source]);

    const { result, wasmPath } = runBuild(dir);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, "source-shaped special files must refuse instead of disappearing from the scan");
    assert.match(result.stderr, /unsupported filesystem object|special file|source discovery/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), false, "special-file refusal must not publish output");
  });
});

for (const redirectedParent of ["build", "wasm"]) {
  test(`standalone cleanup refuses a ${redirectedParent} directory link without touching its target`, () => {
    const externalRoot = mkdtempSync(join(tmpdir(), "fungi-external-output-target-"));
    const targetRoot = mkdtempSync(join(tmpdir(), "fungi-linked-output-target-"));
    try {
      const externalWasmDir = redirectedParent === "build"
        ? join(externalRoot, "wasm")
        : externalRoot;
      mkdirSync(externalWasmDir, { recursive: true });
      const externalArtifact = join(externalWasmDir, "output.wasm");
      const externalNeighbor = join(externalWasmDir, "keep.txt");
      writeFileSync(externalArtifact, "outside artifact sentinel");
      writeFileSync(externalNeighbor, "outside neighbor sentinel");

      const buildDir = join(targetRoot, "build");
      mkdirSync(buildDir, { recursive: true });
      const linkPath = redirectedParent === "build" ? buildDir : join(buildDir, "wasm");
      if (redirectedParent === "build") rmSync(buildDir, { recursive: true, force: true });
      symlinkSync(externalRoot, linkPath, process.platform === "win32" ? "junction" : "dir");

      const { result } = runBuild(targetRoot);
      assert.equal(result.error, undefined, `process error: ${result.error}`);
      assert.equal(result.status, 1, "unsafe output-directory links must refuse");
      assert.equal(readFileSync(externalArtifact, "utf8"), "outside artifact sentinel");
      assert.equal(readFileSync(externalNeighbor, "utf8"), "outside neighbor sentinel");
      assert.match(result.stderr, /link|reparse|physical target/i);
      assert.doesNotMatch(result.stdout, /\bPASS:/);
    } finally {
      rmSync(targetRoot, { recursive: true, force: true });
      rmSync(externalRoot, { recursive: true, force: true });
    }
  });
}

test("standalone multi-file input refuses instead of emitting only the first module", () => {
  const inputs = [
    [
      ["a.fungi", `@version 1\npure flow alpha() -> Bool\ncontract { intent { "First module." } effects {} }\n{ return 10 < 11 }\nroute GET "/alpha" { flow alpha }\n`],
      ["b.fungi", `@version 1\npure flow beta() -> Bool\ncontract { intent { "Second module." } effects {} }\n{ return 10 > 11 }\nroute GET "/beta" { flow beta }\n`],
    ],
    [
      ["a.fungi", `@version 1\npure flow alpha() -> Bool\ncontract { intent { "First module." } effects {} }\n{ return 10 < 11 }\nroute GET "/alpha" { flow alpha }\n`],
      ["b.fungi", `@version 1\npure flow beta() -> Bool\ncontract { intent { "Unassemblable second module." } effects {} }\n{ return 0b10 < 0b11 }\nroute GET "/beta" { flow beta }\n`],
    ],
  ];

  for (const [caseIndex, files] of inputs.entries()) {
    withBuildDirectory((dir) => {
      for (const [name, source] of files) writeFileSync(join(dir, name), source);
      const { result, wasmPath } = runBuild(dir);
      assert.equal(result.error, undefined, `case ${caseIndex + 1} process error: ${result.error}`);
      assert.equal(result.status, 1, `case ${caseIndex + 1} must reject unlinked multi-file input`);
      assert.match(result.stdout + result.stderr, /multiple|multi[- ]file|link/i);
      assert.doesNotMatch(result.stdout, /\bPASS:/);
      assert.equal(existsSync(wasmPath), false, "refusal must not publish a partial module as the build result");
    });
  }
});

test("standalone build refuses imported executable declarations until linking includes them", () => {
  withBuildDirectory((dir) => {
    writeFileSync(join(dir, "library.fungi"), `@version 1
pure flow importedProbe() -> Bool
contract { intent { "Imported executable must not disappear from standalone output." } effects {} }
{ return 10 < 11 }
route GET "/imported" { flow importedProbe }
`);
    writeFileSync(join(dir, "main.fungi"), `@version 1
import "./library.fungi"
pure flow mainProbe() -> Bool
contract { intent { "Standalone entry control." } effects {} }
{ return 10 > 11 }
route GET "/main" { flow mainProbe }
`);

    const { result, wasmPath } = runBuild(dir);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, "an import graph with executable code must fail closed before linking exists");
    assert.match(result.stdout + result.stderr, /imported executable|linking/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), false, "refusal must not publish an incomplete standalone module");
  });
});

test("standalone build refuses executable declarations in a hidden transitive import", () => {
  withBuildDirectory((dir) => {
    const depsDir = join(dir, ".deps");
    mkdirSync(depsDir);
    writeFileSync(join(depsDir, "executable.fungi"), `@version 1
pure flow importedProbe() -> Bool
contract { intent { "Nested imported executable must not disappear from standalone output." } effects {} }
{ return 10 < 11 }
route GET "/imported" { flow importedProbe }
`);
    writeFileSync(join(depsDir, "wrapper.fungi"), `@version 1
import "./executable.fungi"
type WrapperId = String
`);
    writeFileSync(join(dir, "main.fungi"), `@version 1
import "./.deps/wrapper.fungi"
pure flow mainProbe() -> Bool
contract { intent { "Standalone entry control." } effects {} }
{ return 10 > 11 }
route GET "/main" { flow mainProbe }
`);

    const { result, wasmPath } = runBuild(dir);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, "a transitive executable import must fail closed before linking exists");
    assert.match(result.stdout + result.stderr, /imported executable|linking/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), false, "refusal must not publish an incomplete standalone module");
  });
});

test("standalone build accepts a hidden transitive schema-only import chain", () => {
  withBuildDirectory((dir) => {
    const depsDir = join(dir, ".deps");
    mkdirSync(depsDir);
    writeFileSync(join(depsDir, "types.fungi"), "@version 1\ntype LeafId = String\n");
    writeFileSync(join(depsDir, "wrapper.fungi"), `@version 1
import "./types.fungi"
type WrapperId = String
`);
    writeFileSync(join(dir, "main.fungi"), `@version 1
import "./.deps/wrapper.fungi"
pure flow echo(value: WrapperId) -> WrapperId
contract { intent { "Nested schema-only import control." } effects {} }
{ return value }
route GET "/main" { flow echo }
`);

    const { result, wasmPath } = runBuild(dir);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 0, `nested schema-only chain should remain admitted: ${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /\bPASS:/);
    assert.equal(existsSync(wasmPath), true, "schema-only import control must still emit the standalone artifact");
  });
});

test("standalone refusal clears a safe stale WASM when the WAT output is an unsafe link", () => {
  withBuildDirectory((dir) => {
    const sourcePath = join(dir, "probe.fungi");
    const outputDir = join(dir, "build", "wasm");
    const watPath = join(outputDir, "output.wat");
    const wasmPath = join(outputDir, "output.wasm");
    const externalSentinel = join(tmpdir(), `fungi-stale-wat-${process.pid}-${Date.now()}.txt`);
    const sentinel = "unsafe output link target must remain untouched";
    writeFileSync(sourcePath, `@version 1
pure flow probe() -> Bool
contract { intent { "Stale companion invalidation control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

    try {
      const first = runBuild(dir);
      assert.equal(first.result.status, 0, first.result.output);
      assert.equal(existsSync(wasmPath), true, "positive control must create a stale companion first");
      writeFileSync(externalSentinel, sentinel);
      rmSync(watPath);
      symlinkSync(externalSentinel, watPath);

      const refused = runBuild(dir);
      assert.equal(refused.result.status, 1, "unsafe WAT leaf must refuse rebuild");
      assert.doesNotMatch(refused.result.stdout, /\bPASS:/);
      assert.equal(existsSync(wasmPath), false, "safe stale WASM must not survive a refused rebuild");
      assert.equal(readFileSync(externalSentinel, "utf8"), sentinel, "unsafe WAT target must remain untouched");
    } finally {
      rmSync(externalSentinel, { force: true });
    }
  });
});

test("standalone discovery refuses source-file and source-directory symlinks instead of skipping them", () => {
  for (const linkKind of ["file", "directory"]) {
    withBuildDirectory((dir) => {
      const externalRoot = mkdtempSync(join(tmpdir(), "fungi-linked-source-"));
      try {
        const externalSource = join(externalRoot, "hidden.fungi");
        writeFileSync(externalSource, `@version 1
pure flow hiddenProbe() -> Bool
contract { intent { "A symlink must not conceal a source from standalone discovery." } effects {} }
{ return 10 < 11 }
route GET "/hidden" { flow hiddenProbe }
`);
        const linkPath = join(dir, linkKind === "file" ? "hidden.fungi" : "hidden-source-dir");
        symlinkSync(
          linkKind === "file" ? externalSource : externalRoot,
          linkPath,
          linkKind === "file" ? "file" : process.platform === "win32" ? "junction" : "dir",
        );
        writeFileSync(join(dir, "main.fungi"), `@version 1
pure flow mainProbe() -> Bool
contract { intent { "A regular entry exists so skipped symlink input could falsely pass." } effects {} }
{ return 10 > 11 }
route GET "/main" { flow mainProbe }
`);

        const { result, wasmPath } = runBuild(dir);
        assert.equal(result.error, undefined, `child process error: ${result.error}`);
        assert.equal(result.status, 1, `${linkKind} source link must not be silently omitted`);
        assert.match(result.stdout + result.stderr, /symbolic link|symlink|source discovery/i);
        assert.doesNotMatch(result.stdout, /\bPASS:/);
        assert.equal(existsSync(wasmPath), false, "source discovery refusal must not publish a partial module");
      } finally {
        rmSync(externalRoot, { recursive: true, force: true });
      }
    });
  }
});

test("check refuses a source root that cannot be enumerated", () => {
  withBuildDirectory((dir) => {
    const notDirectory = join(dir, "not-a-directory");
    writeFileSync(notDirectory, "ordinary file, not a project tree");
    const result = runCheck(notDirectory);

    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.notEqual(result.status, 0, "unreadable source roots must not produce a successful check");
    assert.match(result.stdout + result.stderr, /source discovery could not enumerate/i);
    assert.doesNotMatch(result.stdout, /\bPASS:/);
  });
});

test("watch reports source discovery refusal after recursive watch registration fails", () => {
  withBuildDirectory((dir) => {
    const invalidRoot = join(dir, "not-a-directory");
    writeFileSync(invalidRoot, "ordinary file, not a project tree");
    const result = runWatchWithRegistrationFailure(invalidRoot);

    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(join(dir, "watch-registration-hook-fired")), true,
      "the fixture must force recursive registration into the fallback path");
    assert.match(result.stderr, /CLI failed:.*source discovery could not enumerate/is);
    assert.doesNotMatch(result.stderr, /uncaught exception|at runWatch/u);
    assert.doesNotMatch(result.stdout, /Watching .* files individually|\bPASS:/u);
  });
});

test("check refuses a regular source substituted between discovery and descriptor intake", () => {
  withBuildDirectory((dir) => {
    const sourcePath = join(dir, "probe.fungi");
    const original = `@version 1
pure flow original() -> Bool
contract { intent { "the discovered source identity must be retained through intake" } effects {} }
{ return 10 < 11 }
route GET "/original" { flow original }
`;
    writeFileSync(sourcePath, original);

    const result = runCheckWithSourceReplacement(dir, sourcePath);
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.equal(existsSync(join(dir, "source-replacement-hook-fired")), true,
      "the race fixture must replace the path at the descriptor-open boundary");
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout + result.stderr, /changed|identity|refused|cannot read/i);
    assertNoPassAnnouncement(result.stdout);
    assert.match(readFileSync(sourcePath, "utf8"), /replacement source must not be consumed/,
      "the replacement remains in place but must not be compiled");
  });
});

test("check refuses a source changed to a FIFO at descriptor intake without blocking", {
  skip: process.platform !== "linux",
}, () => {
  withBuildDirectory((dir) => {
    const sourcePath = join(dir, "probe.fungi");
    writeFileSync(sourcePath, `@version 1
pure flow original() -> Bool
contract { intent { "a raced FIFO must not block compiler intake" } effects {} }
{ return 10 < 11 }
route GET "/original" { flow original }
`);

    const result = runCheckWithSourceReplacement(dir, sourcePath, "fifo");
    assert.equal(result.error, undefined, `FIFO intake must refuse without hanging: ${result.error}`);
    assert.equal(existsSync(join(dir, "source-replacement-hook-fired")), true,
      "the race fixture must replace the path at the descriptor-open boundary");
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout + result.stderr, /regular|identity|refused|cannot read/i);
    assertNoPassAnnouncement(result.stdout);
  });
});

function isExpectedWindowsReplacementBlock(platform, operation, errorCode) {
  if (platform !== "win32") return false;
  if (operation === "rename") return ["EBUSY", "EPERM", "EACCES"].includes(errorCode);
  if (operation === "junction") return ["EPERM", "EACCES"].includes(errorCode);
  return false;
}

async function runBuildAtFilesystemBoundary({ dir, operation, outputName, replaceParent, injectedReplacementErrorCode }) {
  const outputDir = join(dir, "build", "wasm");
  const raceDirectory = operation === "mkdirSync" ? dirname(outputDir) : outputDir;
  const displacedDir = `${raceDirectory}-before-race`;
  const externalDir = mkdtempSync(join(tmpdir(), "fungi-output-parent-external-"));
  const externalNeighbor = join(externalDir, "outside-neighbor.txt");
  const readyPath = join(dir, "publisher-ready");
  const releasePath = join(dir, "publisher-release");
  const hookPath = join(dir, "pause-at-output-boundary.mjs");
  const neighborSentinel = "external neighbor sentinel must survive parent replacement";
  const watSentinel = "external stale WAT sentinel";
  const wasmSentinel = "external stale WASM sentinel";
  const externallySeededOutputs = operation === "rmSync";
  if (externallySeededOutputs) {
    writeFileSync(join(externalDir, "output.wat"), watSentinel);
    writeFileSync(join(externalDir, "output.wasm"), wasmSentinel);
  }
  writeFileSync(externalNeighbor, neighborSentinel);
  writeFileSync(hookPath, `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

const targetPath = resolve(process.env.GALERINA_RACE_TARGET);
const operation = process.env.GALERINA_RACE_OPERATION;
const readyPath = process.env.GALERINA_RACE_READY;
const releasePath = process.env.GALERINA_RACE_RELEASE;
let paused = false;
const waiter = new Int32Array(new SharedArrayBuffer(4));
const realOperation = fs[operation];
fs[operation] = function(file, ...args) {
  const observedPath = operation === "linkSync" ? args[0] : file;
  if (!paused && typeof observedPath === "string" && resolve(observedPath) === targetPath) {
    paused = true;
    fs.writeFileSync(readyPath, "ready", "utf8");
    while (!fs.existsSync(releasePath)) Atomics.wait(waiter, 0, 0, 10);
  }
  return realOperation.call(fs, file, ...args);
};
syncBuiltinESMExports();
`);

  let child;
  let exitResult;
  let stdout = "";
  let stderr = "";
  let replacementBlocked = false;
  let replacementBlockedCode;
  let replacementBlockedOperation;
  let closeTimer;
  let handedOff = false;
  let resolveClose;
  const closed = new Promise((resolveClosePromise) => { resolveClose = resolveClosePromise; });
  try {
    child = spawn(process.execPath, ["--import", pathToFileURL(hookPath).href, cli, "build", "--target=wasm-standalone", dir], {
      cwd: dir,
      env: {
        ...process.env,
        GALERINA_RACE_TARGET: operation === "mkdirSync" ? outputDir : join(outputDir, outputName),
        GALERINA_RACE_OPERATION: operation,
        GALERINA_RACE_READY: readyPath,
        GALERINA_RACE_RELEASE: releasePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("close", (code, signal) => {
      exitResult = { code, signal };
      resolveClose(exitResult);
    });

    const readyDeadline = Date.now() + 10000;
    while (!existsSync(readyPath) && exitResult === undefined && Date.now() < readyDeadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    assert.equal(existsSync(readyPath), true, `compiler did not reach ${operation}:${outputName}; exit=${JSON.stringify(exitResult)}\n${stderr}\n${stdout}`);

    if (replaceParent) {
      let displaced = false;
      let replacementOperation = "rename";
      try {
        if (injectedReplacementErrorCode) {
          const injectedError = new Error("injected replacement setup failure");
          injectedError.code = injectedReplacementErrorCode;
          throw injectedError;
        }
        renameSync(raceDirectory, displacedDir);
        displaced = true;
        if (replaceParent !== "absent") {
          replacementOperation = "junction";
          symlinkSync(externalDir, raceDirectory, process.platform === "win32" ? "junction" : "dir");
        }
      } catch (error) {
        if (displaced) {
          try {
            renameSync(displacedDir, raceDirectory);
          } catch (restoreError) {
            throw new Error(`could not restore output directory after blocked race setup: ${restoreError}`);
          }
        }
        const errorCode = error && typeof error === "object" ? error.code : undefined;
        if (!isExpectedWindowsReplacementBlock(process.platform, replacementOperation, errorCode)) throw error;
        replacementBlocked = true;
        replacementBlockedCode = errorCode;
        replacementBlockedOperation = replacementOperation;
      }
    }
    writeFileSync(releasePath, "release");
    const result = await Promise.race([
      closed,
      new Promise((_, reject) => {
        closeTimer = setTimeout(() => reject(new Error("compiler did not exit after publication release")), 10000);
        closeTimer.unref();
      }),
    ]);

    const completed = {
      result,
      stdout,
      stderr,
      outputDir,
      displacedDir,
      externalDir,
      replacementBlocked,
      replacementBlockedCode,
      replacementBlockedOperation,
      externalNeighbor,
      neighborSentinel,
      externalSentinels: externallySeededOutputs ? { watSentinel, wasmSentinel } : undefined,
    };
    handedOff = true;
    return completed;
  } finally {
    clearTimeout(closeTimer);
    if (child && exitResult === undefined) {
      writeFileSync(releasePath, "release");
      child.kill();
      await Promise.race([closed, new Promise((resolveDelay) => setTimeout(resolveDelay, 2000))]);
    }
    if (!handedOff) rmSync(externalDir, { recursive: true, force: true });
  }
}

test("race harness propagates unexpected replacement setup failures", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fungi-output-parent-setup-failure-"));
  let run;
  try {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Unexpected race setup failures must remain visible." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);
    await assert.rejects(
      async () => {
        run = await runBuildAtFilesystemBoundary({
          dir,
          operation: "linkSync",
          outputName: "output.wasm",
          replaceParent: true,
          injectedReplacementErrorCode: "EIO",
        });
      },
      (error) => error?.code === "EIO",
      "an unrelated setup failure must not be converted into an OS-blocked race control",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (run?.externalDir) rmSync(run.externalDir, { recursive: true, force: true });
  }
});

test("Windows reports its known busy-directory denial as an explicit race skip", {
  skip: process.platform !== "win32",
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), "fungi-output-parent-windows-denial-"));
  let run;
  try {
    writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Windows directory-handle denial must be visible as a skipped attack control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);
    run = await runBuildAtFilesystemBoundary({
      dir,
      operation: "linkSync",
      outputName: "output.wasm",
      replaceParent: true,
      injectedReplacementErrorCode: "EBUSY",
    });
    assert.equal(run.replacementBlocked, true);
    assert.equal(run.replacementBlockedOperation, "rename");
    assert.equal(run.replacementBlockedCode, "EBUSY");
    assert.equal(run.result.code, 0, `${run.stderr}\n${run.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (run?.externalDir) rmSync(run.externalDir, { recursive: true, force: true });
  }
});

for (const scenario of [
  { name: "output directory creation", operation: "mkdirSync", outputName: "wasm" },
  { name: "startup cleanup", operation: "rmSync", outputName: "output.wat" },
  { name: "WAT publication", operation: "linkSync", outputName: "output.wat" },
  { name: "WASM publication", operation: "linkSync", outputName: "output.wasm" },
]) {
  test(`same-tool positive control and redirected parent race during ${scenario.name}`, async (t) => {
    for (const replaceParent of [false, true]) {
      const dir = mkdtempSync(join(tmpdir(), "fungi-output-parent-race-"));
      const outputDir = join(dir, "build", "wasm");
      let externalDir;
      try {
        writeFileSync(join(dir, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Parent replacement race control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);
        if (scenario.operation === "rmSync") {
          mkdirSync(outputDir, { recursive: true });
          writeFileSync(join(outputDir, "output.wat"), "prior WAT");
          writeFileSync(join(outputDir, "output.wasm"), "prior WASM");
        }

        const run = await runBuildAtFilesystemBoundary({ ...scenario, dir, replaceParent });
        externalDir = run.externalDir;
        assert.equal(readFileSync(run.externalNeighbor, "utf8"), run.neighborSentinel, "external neighbor must remain byte-identical");
        if (process.platform === "linux") {
          assert.equal(run.replacementBlocked, false, "Linux positive control must actually replace the parent for every race scenario");
        }
        if (replaceParent && run.replacementBlocked) {
          assert.equal(process.platform, "win32", "only the explicitly recognized Windows junction restriction may skip the attack control");
          const expectedCodes = run.replacementBlockedOperation === "rename"
            ? ["EBUSY", "EPERM", "EACCES"]
            : run.replacementBlockedOperation === "junction"
              ? ["EPERM", "EACCES"]
              : [];
          assert.ok(expectedCodes.includes(run.replacementBlockedCode),
            `unexpected Windows ${run.replacementBlockedOperation} denial code: ${run.replacementBlockedCode}`);
          if (run.externalSentinels) {
            const preserved = ["output.wat", "output.wasm"].map((name) =>
              createHash("sha256").update(readFileSync(join(run.externalDir, name))).digest("hex"));
            const expected = [run.externalSentinels.watSentinel, run.externalSentinels.wasmSentinel]
              .map((value) => createHash("sha256").update(value).digest("hex"));
            assert.deepEqual(preserved, expected, "a race the OS blocks must leave external sentinels unchanged");
          }
          t.diagnostic(`attack control skipped: Windows denied controlled ${run.replacementBlockedOperation} with ${run.replacementBlockedCode}`);
          t.skip(`Windows denied controlled ${run.replacementBlockedOperation} with ${run.replacementBlockedCode}`);
          return;
        }
        if (!replaceParent) {
          assert.equal(run.result.code, 0, `same-instrumentation control must build normally:\n${run.stderr}\n${run.stdout}`);
          assert.match(run.stdout, /\bPASS:/);
          const wat = readFileSync(join(outputDir, "output.wat"), "utf8");
          assert.match(wat, /\(module\b/, "positive control must publish WAT at the canonical path");
          const wasm = readFileSync(join(outputDir, "output.wasm"));
          assert.deepEqual([...wasm.subarray(0, 4)], [0, 0x61, 0x73, 0x6d], "positive control must publish a WebAssembly binary");
          assert.equal(WebAssembly.validate(wasm), true, "positive control's WASM must validate");
        } else {
          const externalArtifactDir = scenario.operation === "mkdirSync"
            ? join(run.externalDir, "wasm")
            : run.externalDir;
           if (scenario.operation === "mkdirSync") {
            assert.equal(existsSync(externalArtifactDir), false,
              "output-directory creation must not follow a raced parent link");
            assert.equal(existsSync(join(run.displacedDir, "wasm")), false,
              `refused output-directory creation must not leave a directory in the relocated build directory; exit=${run.result.code}\n${run.stderr}\n${run.stdout}`);
           }
          if (run.externalSentinels) {
            const observedSentinels = ["output.wat", "output.wasm"].map((name) => {
              const path = join(externalArtifactDir, name);
              return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
            });
            const expectedSentinels = [run.externalSentinels.watSentinel, run.externalSentinels.wasmSentinel].map((value) => createHash("sha256").update(value).digest("hex"));
            assert.deepEqual(observedSentinels, expectedSentinels, `cleanup must preserve both external output sentinels; exit=${run.result.code}\n${run.stderr}\n${run.stdout}`);
          } else {
            assert.deepEqual(
              [existsSync(join(externalArtifactDir, "output.wat")), existsSync(join(externalArtifactDir, "output.wasm"))],
              [false, false],
              `unsafe ${scenario.name} must not create artifacts outside the project; exit=${run.result.code}\n${run.stderr}\n${run.stdout}`,
            );
          }
          assert.equal(run.result.code, 1, `replaced output parent during ${scenario.name} must refuse; signal=${run.result.signal}\n${run.stderr}\n${run.stdout}`);
           assert.doesNotMatch(run.stdout, /\bPASS:/, `unsafe ${scenario.name} must not report PASS`);
           if (scenario.operation === "linkSync") {
            assert.deepEqual(
              ["output.wat", "output.wasm"].map((name) => existsSync(join(run.displacedDir, name))),
              [false, false],
              `refused ${scenario.name} must not leave either output in the relocated directory`,
            );
          }
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
        if (externalDir) rmSync(externalDir, { recursive: true, force: true });
      }
    }
  });
}

for (const outputName of ["output.wat", "output.wasm"]) {
  for (const leafLink of ["symlink", "hardlink"]) {
    test(`standalone build refuses an existing ${outputName} ${leafLink} without overwriting its target`, () => {
      const externalRoot = mkdtempSync(join(tmpdir(), "fungi-external-output-leaf-"));
      const targetRoot = mkdtempSync(join(tmpdir(), "fungi-linked-output-leaf-"));
    try {
      const externalSentinel = join(externalRoot, "sentinel.wat");
      const outputDir = join(targetRoot, "build", "wasm");
      const outputPath = join(outputDir, outputName);
      const wasmPath = join(outputDir, "output.wasm");
      const sentinel = "external WAT sentinel must survive";
      writeFileSync(externalSentinel, sentinel);
      mkdirSync(outputDir, { recursive: true });
      if (leafLink === "symlink") symlinkSync(externalSentinel, outputPath, "file");
      else linkSync(externalSentinel, outputPath);
      writeFileSync(join(targetRoot, "probe.fungi"), `@version 1
pure flow probe() -> Bool
contract { intent { "Output-leaf link control." } effects {} }
{ return 10 < 11 }
route GET "/probe" { flow probe }
`);

      const { result } = runBuild(targetRoot);
      assert.equal(result.error, undefined, `process error: ${result.error}`);
      assert.equal(result.status, 1, "a linked output leaf must be refused");
      assert.match(result.stderr, new RegExp(`${outputName.replace(".", "\\.")}|link|hard[- ]link`, "i"));
      assert.doesNotMatch(result.stdout, /\bPASS:/);
      assert.equal(readFileSync(externalSentinel, "utf8"), sentinel, "the external hardlink/symlink target must remain byte-identical");
      if (outputName === "output.wat") {
        assert.equal(existsSync(wasmPath), false, "refusal must not produce output.wasm");
      } else {
        assert.equal(existsSync(wasmPath), true, "refusal must leave the pre-existing linked leaf untouched");
        assert.equal(readFileSync(wasmPath, "utf8"), sentinel, "the pre-existing linked leaf must not be replaced");
      }
    } finally {
      rmSync(targetRoot, { recursive: true, force: true });
      rmSync(externalRoot, { recursive: true, force: true });
    }
    });
  }
}
