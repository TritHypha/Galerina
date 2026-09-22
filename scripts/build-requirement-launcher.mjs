#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRATE = join(ROOT, "scripts", "native", "requirement-launcher");
const OUTPUT = join(ROOT, "build", "rd0858-requirement-launcher");
const TARGET = join(OUTPUT, "target");
const CARGO_BINARY = join(TARGET, "release", "galerina-requirement-launcher.exe");
const BINARY = join(OUTPUT, "galerina-requirement-launcher.exe");
const WORKER_TARGET = join(OUTPUT, "worker-target");
const WORKER_CARGO_BINARY = join(
  WORKER_TARGET,
  "release",
  "galerina-requirement-launcher.exe",
);
const WORKER_BINARY = join(OUTPUT, "galerina-requirement-worker-launcher.exe");
const BAD_READY_TARGET = join(OUTPUT, "bad-ready-target");
const BAD_READY_CARGO_BINARY = join(
  BAD_READY_TARGET,
  "release",
  "galerina-requirement-launcher.exe",
);
const BAD_READY_BINARY = join(OUTPUT, "galerina-bad-ready-launcher.exe");
const RECEIPT = join(OUTPUT, "build-receipt.json");
const REGISTRY = join(OUTPUT, "test-registry.json");
const WORKER_REGISTRY = join(OUTPUT, "worker-registry.json");
const BAD_READY_REGISTRY = join(OUTPUT, "bad-ready-registry.json");
const WORKER = join(OUTPUT, "sentinel-worker.mjs");
const BAD_READY_WORKER = join(OUTPUT, "bad-ready-worker.mjs");
const PROTOCOL_COPY = join(OUTPUT, "requirement-process-protocol.js");
const REQUIREMENT_WORKER = join(
  ROOT,
  "packages-ts",
  "galerina-core-compiler",
  "dist",
  "requirement-process-worker.js",
);
const REQUIREMENT_PROTOCOL = join(
  ROOT,
  "packages-ts",
  "galerina-core-compiler",
  "dist",
  "requirement-process-protocol.js",
);
const CHECKED_ARTIFACT_GENERATOR = join(
  ROOT,
  "scripts",
  "generate-rd0858-scalar-oracle-artifact.mjs",
);
const CHECKED_ARTIFACT = join(
  ROOT,
  "packages",
  "fungi",
  "products",
  "galerina",
  "rd0858-unit4-scalar-oracle",
  "scalar-oracle.checked.json",
);
const WARDEN_BUILD = join(ROOT, "scripts", "build-process-warden.mjs");
const INPUTS = [
  join(CRATE, "Cargo.toml"),
  join(CRATE, "Cargo.lock"),
  join(CRATE, "src", "protocol.rs"),
  join(CRATE, "src", "identity.rs"),
  join(CRATE, "src", "windows.rs"),
  join(CRATE, "src", "main.rs"),
  join(
    ROOT,
    "packages-ts",
    "galerina-core-compiler",
    "src",
    "requirement-process-worker.ts",
  ),
  join(
    ROOT,
    "packages-ts",
    "galerina-core-compiler",
    "src",
    "requirement-process-protocol.ts",
  ),
  REQUIREMENT_WORKER,
  REQUIREMENT_PROTOCOL,
  CHECKED_ARTIFACT_GENERATOR,
  CHECKED_ARTIFACT,
];

const SENTINEL_SOURCE = `import { spawn } from "node:child_process";
const mode = process.argv[2] || "sentinel";
if (mode === "timeout") {
  setInterval(() => {}, 1000);
} else if (mode === "extra-child") {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 200)"], { stdio: "ignore" });
  child.once("error", () => process.exit(87));
  child.once("spawn", () => setTimeout(() => process.exit(88), 50));
  setTimeout(() => process.exit(89), 500);
} else {
  process.exit(86);
}
`;

const BAD_READY_SOURCE = `import { writeFileSync } from "node:fs";
import { join } from "node:path";
const body = Buffer.from('{"bootstrapControlDigest":"${"0".repeat(64)}","nonce":"${"0".repeat(32)}","runtimeDigest":"${"0".repeat(64)}","schemaVersion":2,"workerDigest":"${"0".repeat(64)}"}', "utf8");
const prefix = Buffer.alloc(8);
prefix.writeBigUInt64BE(BigInt(body.length));
process.stdout.write(Buffer.concat([prefix, body]));
process.stdin.once("data", () => {
  writeFileSync(join(process.cwd(), "build", "rd0858-requirement-launcher", "bad-ready-request-received.txt"), "received", "utf8");
  process.exit(91);
});
setTimeout(() => process.exit(92), 5_000);
`;

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function packageGraphDigest(workerDigest, protocolDigest) {
  return createHash("sha256")
    .update("galerina.requirement-worker-package.v1\0")
    .update(workerDigest)
    .update("\0")
    .update(protocolDigest)
    .digest("hex");
}

function admitOutputDir(dir, code) {
  const fromRoot = relative(ROOT, dir);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`${code}_OUTSIDE_ROOT`);
  }
  mkdirSync(dir, { recursive: true });
  if (lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) {
    throw new Error(`${code}_LINKED`);
  }
  const resolved = realpathSync.native(dir);
  const root = realpathSync.native(ROOT);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel) || !rel.replace(/\\/g, "/").startsWith("build/")) {
    throw new Error(`${code}_ESCAPED`);
  }
  return resolved;
}

function refuseLinkedPath(path, code) {
  let current = path;
  for (;;) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`${code}_LINKED`);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
    if (relative(ROOT, current) === "" || relative(ROOT, current).startsWith("..")) break;
  }
}

function writeOutputFile(path, content, code) {
  refuseLinkedPath(path, code);
  writeFileSync(path, content);
}

function copyOutputFile(from, to, code) {
  refuseLinkedPath(to, code);
  copyFileSync(from, to);
}

function regularFile(path, code) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) {
    throw new Error(code);
  }
  const resolved = realpathSync.native(path);
  const root = `${realpathSync.native(ROOT)}\\`;
  if (!resolved.toLowerCase().startsWith(root.toLowerCase())) {
    throw new Error(`${code}_OUTSIDE_ROOT`);
  }
  return resolved;
}

function externalRegularFile(path, code) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) {
    throw new Error(code);
  }
  return realpathSync.native(path);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fileRecord(path, code, requireRoot) {
  const resolved = requireRoot ? regularFile(path, code) : externalRegularFile(path, code);
  const stat = statSync(resolved, { bigint: true });
  if (stat.nlink !== 1n) fail(`${code}_LINK_COUNT`);
  return Object.freeze({
    path: resolved,
    digest: digest(resolved),
    volumeSerial: BigInt.asUintN(32, stat.dev).toString(10),
    fileIndex: BigInt.asUintN(64, stat.ino).toString(10),
    byteLength: stat.size.toString(10),
  });
}

function snapshotInputs() {
  return Object.fromEntries(INPUTS.map((path) => [relative(ROOT, path).replaceAll("\\", "/"), digest(regularFile(path, "REQUIREMENT_LAUNCHER_INPUT_REFUSED"))]));
}

function fail(code, detail = "") {
  if (detail) process.stderr.write(detail);
  console.error(code);
  process.exit(1);
}

function firstWhereResult(executable, code) {
  const probe = spawnSync("where.exe", [executable], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
  const candidate = probe.status === 0
    ? probe.stdout.trim().split(/\r?\n/, 1)[0]
    : "";
  if (!candidate || !existsSync(candidate) || !statSync(candidate).isFile()) {
    fail(code);
  }
  return candidate;
}

if (process.platform !== "win32" || process.arch !== "x64") {
  fail("REQUIREMENT_LAUNCHER_PLATFORM_REFUSED");
}
if (process.argv.length !== 2) {
  fail("REQUIREMENT_LAUNCHER_ARGUMENT_REFUSED");
}

const artifactCheck = spawnSync(
  process.execPath,
  [CHECKED_ARTIFACT_GENERATOR, "--check"],
  {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 130_000,
    maxBuffer: 1024 * 1024,
  },
);
if (artifactCheck.error || artifactCheck.status !== 0 || artifactCheck.signal !== null) {
  fail(
    "REQUIREMENT_CHECKED_ARTIFACT_FIXED_POINT_REFUSED",
    `${artifactCheck.stdout || ""}${artifactCheck.stderr || ""}`,
  );
}

let before;
try {
  before = snapshotInputs();
} catch (error) {
  fail(error.message || "REQUIREMENT_LAUNCHER_INPUT_REFUSED");
}

const cargoCandidate = firstWhereResult("cargo.exe", "REQUIREMENT_LAUNCHER_CARGO_REFUSED");
// Preserve the rustup proxy path as cargo.exe. Resolving or rejecting its
// reparse point changes proxy dispatch and prevents Cargo from starting.
const cargo = cargoCandidate;
const rustc = firstWhereResult("rustc.exe", "REQUIREMENT_LAUNCHER_RUSTC_REFUSED");
const git = firstWhereResult("git.exe", "REQUIREMENT_LAUNCHER_GIT_REFUSED");
const runtime = externalRegularFile(process.execPath, "REQUIREMENT_LAUNCHER_RUNTIME_REFUSED");
const requirementWorker = regularFile(
  REQUIREMENT_WORKER,
  "REQUIREMENT_PROCESS_WORKER_BUILD_REFUSED",
);
const requirementProtocol = regularFile(
  REQUIREMENT_PROTOCOL,
  "REQUIREMENT_PROCESS_PROTOCOL_BUILD_REFUSED",
);
const checkedArtifact = regularFile(
  CHECKED_ARTIFACT,
  "REQUIREMENT_CHECKED_ARTIFACT_BUILD_REFUSED",
);
let checkedArtifactIdentity;
try {
  const artifact = JSON.parse(readFileSync(checkedArtifact, "utf8"));
  checkedArtifactIdentity = Object.freeze({
    artifactSchema: artifact.schema,
    compilerPackageGraphDigest: artifact.compilerPackageGraphDigest,
    flowLocator: artifact.flowLocator,
    flowName: artifact.flowName,
    packageId: artifact.packageId,
    productId: artifact.productId,
    runtimeProfile: artifact.runtimeProfile,
  });
} catch {
  fail("REQUIREMENT_CHECKED_ARTIFACT_IDENTITY_REFUSED");
}
if (JSON.stringify(checkedArtifactIdentity) !== JSON.stringify({
  artifactSchema: "galerina.rd0858.checked-flow.v1",
  compilerPackageGraphDigest: checkedArtifactIdentity.compilerPackageGraphDigest,
  flowLocator: "rd0858/unit4/scalar-oracle",
  flowName: "scalarOracle",
  packageId: "rd0858-unit4-scalar-oracle",
  productId: "galerina",
  runtimeProfile: "scalar-1",
}) || !/^sha256:[0-9a-f]{64}$/u.test(checkedArtifactIdentity.compilerPackageGraphDigest)) {
  fail("REQUIREMENT_CHECKED_ARTIFACT_IDENTITY_REFUSED");
}

admitOutputDir(OUTPUT, "REQUIREMENT_LAUNCHER_OUTPUT");
writeOutputFile(WORKER, SENTINEL_SOURCE, "REQUIREMENT_LAUNCHER_OUTPUT");
writeOutputFile(BAD_READY_WORKER, BAD_READY_SOURCE, "REQUIREMENT_LAUNCHER_OUTPUT");
copyOutputFile(requirementProtocol, PROTOCOL_COPY, "REQUIREMENT_LAUNCHER_OUTPUT");
const runtimeDigest = digest(runtime);
const workerDigest = digest(WORKER);
const requirementWorkerDigest = digest(requirementWorker);
const requirementProtocolDigest = digest(requirementProtocol);
const badReadyWorkerDigest = digest(BAD_READY_WORKER);
const checkedArtifactDigest = digest(checkedArtifact);

const warden = spawnSync(process.execPath, [WARDEN_BUILD], {
  cwd: ROOT,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
  timeout: 180_000,
  maxBuffer: 16 * 1024 * 1024,
});
if (warden.error || warden.status !== 0 || warden.signal !== null) {
  fail("REQUIREMENT_LAUNCHER_WARDEN_BUILD_REFUSED", `${warden.stdout || ""}${warden.stderr || ""}`);
}

const require = createRequire(import.meta.url);
const { runOwnedProcess } = require("./lib/owned-process-tree.cjs");

async function ownedText(command, args, code) {
  const result = await runOwnedProcess({
    command,
    args,
    cwd: ROOT,
    env: process.env,
    timeoutMs: 30_000,
    cleanupGraceMs: 5_000,
    maxOutputBytes: 1024 * 1024,
    windowsHide: true,
  });
  if (result.spawnError || result.timedOut || result.outputLimitExceeded || result.status !== 0 || result.signal !== null) {
    fail(code, `${result.stdout || ""}${result.stderr || ""}`);
  }
  return result.stdout.trim();
}

const rustcVersion = await ownedText(rustc, ["--version"], "REQUIREMENT_LAUNCHER_RUSTC_VERSION_REFUSED");
const gitHead = await ownedText(git, ["rev-parse", "HEAD"], "REQUIREMENT_LAUNCHER_GIT_HEAD_REFUSED");
if (!/^rustc \S+/.test(rustcVersion) || !/^[0-9a-f]{40}$/.test(gitHead)) {
  fail("REQUIREMENT_LAUNCHER_BUILD_IDENTITY_REFUSED");
}

const command = ["cargo", "build", "--release", "--locked"];
async function buildPinnedLauncher(
  target,
  cargoBinary,
  outputBinary,
  admittedWorkerDigest,
  admittedProtocolDigest,
  code,
) {
  admitOutputDir(target, code);
  const build = await runOwnedProcess({
    command: cargo,
    args: command.slice(1),
    cwd: CRATE,
    env: {
      ...process.env,
      CARGO_INCREMENTAL: "0",
      CARGO_TARGET_DIR: target,
      RUSTC: rustc,
      RUSTC_WRAPPER: "",
      RUSTFLAGS: "--cfg test_contract",
      GALERINA_TEST_RUNTIME_DIGEST: runtimeDigest,
      GALERINA_TEST_WORKER_DIGEST: admittedWorkerDigest,
      GALERINA_TEST_PROTOCOL_DIGEST: admittedProtocolDigest,
      GALERINA_TEST_ARTIFACT_DIGEST: checkedArtifactDigest,
    },
    timeoutMs: 120_000,
    cleanupGraceMs: 5_000,
    maxOutputBytes: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (build.spawnError || build.timedOut || build.outputLimitExceeded || build.status !== 0 || build.signal !== null) {
    fail(code, `${build.stdout || ""}${build.stderr || ""}`);
  }
  if (!existsSync(cargoBinary) || !statSync(cargoBinary).isFile()) {
    fail(`${code}_BINARY_MISSING`);
  }
  copyOutputFile(cargoBinary, outputBinary, `${code}_PUBLISH`);
}

await buildPinnedLauncher(
  TARGET,
  CARGO_BINARY,
  BINARY,
  workerDigest,
  requirementProtocolDigest,
  "REQUIREMENT_LAUNCHER_BUILD_REFUSED",
);
await buildPinnedLauncher(
  WORKER_TARGET,
  WORKER_CARGO_BINARY,
  WORKER_BINARY,
  requirementWorkerDigest,
  requirementProtocolDigest,
  "REQUIREMENT_WORKER_LAUNCHER_BUILD_REFUSED",
);
await buildPinnedLauncher(
  BAD_READY_TARGET,
  BAD_READY_CARGO_BINARY,
  BAD_READY_BINARY,
  badReadyWorkerDigest,
  requirementProtocolDigest,
  "REQUIREMENT_BAD_READY_LAUNCHER_BUILD_REFUSED",
);

let after;
try {
  after = snapshotInputs();
} catch (error) {
  fail(error.message || "REQUIREMENT_LAUNCHER_INPUT_REFUSED");
}
if (JSON.stringify(after) !== JSON.stringify(before)) {
  fail("REQUIREMENT_LAUNCHER_INPUT_DRIFT");
}

let binary;
let workerBinary;
let badReadyBinary;
try {
  binary = regularFile(BINARY, "REQUIREMENT_LAUNCHER_BINARY_MISSING");
  workerBinary = regularFile(WORKER_BINARY, "REQUIREMENT_WORKER_LAUNCHER_BINARY_MISSING");
  badReadyBinary = regularFile(BAD_READY_BINARY, "REQUIREMENT_BAD_READY_LAUNCHER_BINARY_MISSING");
} catch (error) {
  fail(error.message || "REQUIREMENT_LAUNCHER_BINARY_MISSING");
}
const binarySha256 = digest(binary);
const workerLauncherBinarySha256 = digest(workerBinary);
const badReadyLauncherBinarySha256 = digest(badReadyBinary);
const environment = Object.freeze({
  COMSPEC: process.env.COMSPEC || join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe"),
  SystemRoot: process.env.SystemRoot || "C:\\Windows",
  TEMP: process.env.TEMP || join(process.env.SystemRoot || "C:\\Windows", "Temp"),
  TMP: process.env.TMP || process.env.TEMP || join(process.env.SystemRoot || "C:\\Windows", "Temp"),
  WINDIR: process.env.WINDIR || process.env.SystemRoot || "C:\\Windows",
});
const packageRoot = realpathSync.native(ROOT);
const registry = Object.freeze({
  schemaVersion: 1,
  checkedArtifact: fileRecord(checkedArtifact, "REQUIREMENT_CHECKED_ARTIFACT", true),
  checkedArtifactSchema: checkedArtifactIdentity.artifactSchema,
  checkedCompilerPackageGraphDigest: checkedArtifactIdentity.compilerPackageGraphDigest,
  checkedFlowLocator: checkedArtifactIdentity.flowLocator,
  checkedFlowName: checkedArtifactIdentity.flowName,
  checkedPackageId: checkedArtifactIdentity.packageId,
  checkedProductId: checkedArtifactIdentity.productId,
  checkedRuntimeProfile: checkedArtifactIdentity.runtimeProfile,
  launcher: fileRecord(binary, "REQUIREMENT_LAUNCHER_BINARY", true),
  runtime: fileRecord(runtime, "REQUIREMENT_LAUNCHER_RUNTIME", false),
  worker: fileRecord(WORKER, "REQUIREMENT_LAUNCHER_WORKER", true),
  protocol: fileRecord(PROTOCOL_COPY, "REQUIREMENT_PROCESS_PROTOCOL", true),
  packageRoot,
  packageRootDigest: packageGraphDigest(workerDigest, requirementProtocolDigest),
  scalarProfileDigest: createHash("sha256").update("scalar-1").digest("hex"),
  timeoutMs: 1_500,
  environment,
});
writeOutputFile(REGISTRY, canonicalJson(registry), "REQUIREMENT_LAUNCHER_OUTPUT");
const registrySha256 = digest(REGISTRY);
const workerRegistry = Object.freeze({
  schemaVersion: 1,
  checkedArtifact: fileRecord(checkedArtifact, "REQUIREMENT_CHECKED_ARTIFACT", true),
  checkedArtifactSchema: checkedArtifactIdentity.artifactSchema,
  checkedCompilerPackageGraphDigest: checkedArtifactIdentity.compilerPackageGraphDigest,
  checkedFlowLocator: checkedArtifactIdentity.flowLocator,
  checkedFlowName: checkedArtifactIdentity.flowName,
  checkedPackageId: checkedArtifactIdentity.packageId,
  checkedProductId: checkedArtifactIdentity.productId,
  checkedRuntimeProfile: checkedArtifactIdentity.runtimeProfile,
  launcher: fileRecord(workerBinary, "REQUIREMENT_WORKER_LAUNCHER_BINARY", true),
  runtime: fileRecord(runtime, "REQUIREMENT_LAUNCHER_RUNTIME", false),
  worker: fileRecord(requirementWorker, "REQUIREMENT_PROCESS_WORKER", true),
  protocol: fileRecord(requirementProtocol, "REQUIREMENT_PROCESS_PROTOCOL", true),
  packageRoot,
  packageRootDigest: packageGraphDigest(requirementWorkerDigest, requirementProtocolDigest),
  scalarProfileDigest: createHash("sha256").update("scalar-1").digest("hex"),
  timeoutMs: 1_500,
  environment,
});
writeOutputFile(WORKER_REGISTRY, canonicalJson(workerRegistry), "REQUIREMENT_LAUNCHER_OUTPUT");
const workerRegistrySha256 = digest(WORKER_REGISTRY);
const badReadyRegistry = Object.freeze({
  ...workerRegistry,
  launcher: fileRecord(badReadyBinary, "REQUIREMENT_BAD_READY_LAUNCHER_BINARY", true),
  worker: fileRecord(BAD_READY_WORKER, "REQUIREMENT_BAD_READY_WORKER", true),
  protocol: fileRecord(PROTOCOL_COPY, "REQUIREMENT_PROCESS_PROTOCOL", true),
  packageRootDigest: packageGraphDigest(badReadyWorkerDigest, requirementProtocolDigest),
  timeoutMs: 1_500,
});
writeOutputFile(BAD_READY_REGISTRY, canonicalJson(badReadyRegistry), "REQUIREMENT_LAUNCHER_OUTPUT");
const badReadyRegistrySha256 = digest(BAD_READY_REGISTRY);
const receipt = Object.freeze({
  schemaVersion: 1,
  verdict: "BUILT_NON_AUTHORIZING",
  platform: process.platform,
  arch: process.arch,
  gitHead,
  rustcVersion,
  command,
  compileCfg: ["test_contract"],
  compilePins: {
    runtimeDigest,
    workerDigest,
    requirementWorkerDigest,
    requirementProtocolDigest,
    badReadyWorkerDigest,
    checkedArtifactDigest,
  },
  checkedArtifactIdentity,
  cargoExecutable: basename(cargo),
  cargoSha256: digest(cargo),
  inputs: before,
  binarySha256,
  workerLauncherBinarySha256,
  badReadyLauncherBinarySha256,
  registrySha256,
  workerRegistrySha256,
  badReadyRegistrySha256,
  registryFile: basename(REGISTRY),
  workerRegistryFile: basename(WORKER_REGISTRY),
  badReadyRegistryFile: basename(BAD_READY_REGISTRY),
  workerFile: basename(WORKER),
  badReadyWorkerFile: basename(BAD_READY_WORKER),
});
admitOutputDir(dirname(RECEIPT), "REQUIREMENT_LAUNCHER_OUTPUT");
writeOutputFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, "REQUIREMENT_LAUNCHER_OUTPUT");
console.log(JSON.stringify({
  schema: "galerina.requirement-launcher-build.v1",
  verdict: receipt.verdict,
  binarySha256,
}));
