import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const COMPILER = "packages-ts/galerina-core-compiler";
export const COMPILER_BUILD_EVIDENCE_SCHEMA = "fungi.compiler.build-evidence.v1";
export const CONSUMED_COMPILER_OUTPUTS = Object.freeze([
  "dist/index.js",
  "dist/governance-mode.js",
]);
const FROZEN_TSCONFIG_INCLUDE = Object.freeze(["src/**/*.ts"]);
const EVIDENCE_KEYS = Object.freeze([
  "schema",
  "algorithm",
  "package",
  "inputs",
  "config",
  "toolchain",
  "outputs",
  "inputDigest",
  "outputDigest",
]);
const ENTRY_KEYS = Object.freeze(["path", "bytes", "digest"]);
const MAX_EVIDENCE_FILES = 4096;
const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;

class DuplicateJsonKeyError extends Error {
  constructor(key) {
    super(`duplicate JSON object key: ${JSON.stringify(key)}`);
    this.name = "DuplicateJsonKeyError";
  }
}

function posixPath(value) {
  return value.replace(/\\/g, "/");
}

function locatorEscapes(locator) {
  const normalized = posixPath(locator);
  if (locator.includes("\0") || locator.includes("\\")) return true;
  if (/^[a-zA-Z]:/.test(locator) || normalized.startsWith("/") || normalized.startsWith("//")) {
    return true;
  }
  const parts = normalized.split("/");
  return parts.includes("..") || parts.includes("") || parts.some((part) => part === ".");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lengthPrefixedDigest(label, entries) {
  const hash = createHash("sha256");
  hash.update(COMPILER_BUILD_EVIDENCE_SCHEMA);
  hash.update("\0");
  hash.update(label);
  hash.update("\0");
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.path, "utf8");
    const digestBytes = Buffer.from(entry.digest, "utf8");
    const header = Buffer.alloc(8);
    header.writeUInt32BE(pathBytes.length, 0);
    header.writeUInt32BE(digestBytes.length, 4);
    hash.update(header);
    hash.update(pathBytes);
    hash.update(digestBytes);
  }
  return hash.digest("hex");
}

export function assertNoDuplicateJsonKeys(json) {
  let index = 0;

  const failSyntax = () => {
    throw new SyntaxError("invalid JSON");
  };

  const skipWhitespace = () => {
    while (index < json.length && /[\u0009\u000a\u000d\u0020]/.test(json[index] ?? "")) {
      index += 1;
    }
  };

  const readString = () => {
    const start = index;
    if (json[index] !== '"') failSyntax();
    index += 1;
    while (index < json.length) {
      const char = json[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === '"') {
        index += 1;
        const decoded = JSON.parse(json.slice(start, index));
        if (typeof decoded !== "string") failSyntax();
        return decoded;
      }
      if (char !== undefined && char < " ") failSyntax();
      index += 1;
    }
    return failSyntax();
  };

  const readPrimitive = () => {
    const start = index;
    while (
      index < json.length &&
      !/[\u0009\u000a\u000d\u0020,\]}]/.test(json[index] ?? "")
    ) {
      index += 1;
    }
    if (index === start) failSyntax();
  };

  const readValue = () => {
    skipWhitespace();
    const char = json[index];
    if (char === "{") {
      readObject();
      return;
    }
    if (char === "[") {
      readArray();
      return;
    }
    if (char === '"') {
      readString();
      return;
    }
    readPrimitive();
  };

  const readObject = () => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (json[index] === "}") {
      index += 1;
      return;
    }
    while (index < json.length) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) throw new DuplicateJsonKeyError(key);
      keys.add(key);
      skipWhitespace();
      if (json[index] !== ":") failSyntax();
      index += 1;
      readValue();
      skipWhitespace();
      if (json[index] === "}") {
        index += 1;
        return;
      }
      if (json[index] !== ",") failSyntax();
      index += 1;
    }
    failSyntax();
  };

  const readArray = () => {
    index += 1;
    skipWhitespace();
    if (json[index] === "]") {
      index += 1;
      return;
    }
    while (index < json.length) {
      readValue();
      skipWhitespace();
      if (json[index] === "]") {
        index += 1;
        return;
      }
      if (json[index] !== ",") failSyntax();
      index += 1;
    }
    failSyntax();
  };

  readValue();
  skipWhitespace();
  if (index !== json.length) failSyntax();
}

function gitPaths(root, compiler, args) {
  const result = spawnSync(
    "git",
    ["-C", root, ...args, "-z", "--", `${compiler}/src`, `${compiler}/tests`],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(`cannot enumerate compiler inputs: ${result.stderr || result.error?.message || "git failed"}`);
  }
  return result.stdout.split("\0").filter(Boolean).sort();
}

function walkTsFiles(absDir, relPrefix, acc) {
  if (acc.length > MAX_EVIDENCE_FILES) {
    throw new Error("refusing compiler build evidence: too many compile-affecting source files");
  }
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const rel = posixPath(`${relPrefix}/${entry.name}`);
    if (locatorEscapes(rel)) {
      throw new Error(`refusing compiler build evidence with escaping path: ${rel}`);
    }
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(abs, rel, acc);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      acc.push(rel);
    }
  }
}

function readBoundedFile(root, relativePath) {
  if (locatorEscapes(relativePath)) {
    throw new Error(`refusing compiler build evidence with escaping path: ${relativePath}`);
  }
  const bytes = readFileSync(join(root, relativePath));
  if (bytes.length > MAX_EVIDENCE_FILE_BYTES) {
    throw new Error(`refusing compiler build evidence: ${relativePath} exceeds the byte bound`);
  }
  return bytes;
}

function fileRecord(root, relativePath) {
  const bytes = readBoundedFile(root, relativePath);
  return {
    path: relativePath,
    bytes: bytes.length,
    digest: sha256Bytes(bytes),
  };
}

function readTsconfigInclude(root, compiler) {
  const tsconfigPath = `${compiler}/tsconfig.json`;
  const raw = readBoundedFile(root, tsconfigPath).toString("utf8");
  assertNoDuplicateJsonKeys(raw);
  const parsed = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Array.isArray(parsed.include) ||
    JSON.stringify(parsed.include) !== JSON.stringify(FROZEN_TSCONFIG_INCLUDE)
  ) {
    throw new Error("refusing compiler build evidence: tsconfig include is not the frozen src/**/*.ts set");
  }
  return {
    tsconfigPath,
    digest: sha256Bytes(Buffer.from(raw, "utf8")),
    include: [...FROZEN_TSCONFIG_INCLUDE],
  };
}

function readTypescriptPin(root, compiler) {
  const raw = readBoundedFile(root, `${compiler}/package.json`).toString("utf8");
  assertNoDuplicateJsonKeys(raw);
  const parsed = JSON.parse(raw);
  const pin = parsed?.devDependencies?.typescript;
  if (typeof pin !== "string" || pin.trim().length === 0) {
    throw new Error("refusing compiler build evidence: package.json does not pin typescript");
  }
  return pin;
}

function createInputRecords(root, compiler) {
  const trackedInputs = gitPaths(root, compiler, ["ls-files"]);
  if (trackedInputs.length === 0) {
    throw new Error("refusing empty compiler build evidence: no tracked src/tests inputs");
  }
  if (trackedInputs.some((path) => locatorEscapes(path) || !path.startsWith(`${compiler}/`))) {
    throw new Error("refusing compiler build evidence with an escaping tracked path");
  }
  const untrackedInputs = gitPaths(root, compiler, ["ls-files", "--others", "--exclude-standard"]);
  if (untrackedInputs.length > 0) {
    throw new Error(`refusing compiler build evidence with untracked inputs: ${untrackedInputs.join(", ")}`);
  }

  const diskSrc = [];
  walkTsFiles(join(root, compiler, "src"), `${compiler}/src`, diskSrc);
  diskSrc.sort();
  const trackedSrc = trackedInputs.filter((path) => path.startsWith(`${compiler}/src/`) && path.endsWith(".ts"));
  if (JSON.stringify(diskSrc) !== JSON.stringify(trackedSrc)) {
    const extra = diskSrc.filter((path) => !trackedSrc.includes(path));
    throw new Error(
      `refusing compiler build evidence with compile-affecting source absent from tracked inputs: ${extra.join(", ") || "src set mismatch"}`,
    );
  }

  return trackedInputs.map((path) => fileRecord(root, path));
}

function createOutputRecords(root, compiler) {
  return CONSUMED_COMPILER_OUTPUTS.map((relative) => fileRecord(root, `${compiler}/${relative}`));
}

export function createBuildEvidence(root = ROOT, compiler = COMPILER) {
  const inputs = createInputRecords(root, compiler);
  const config = readTsconfigInclude(root, compiler);
  const typescript = readTypescriptPin(root, compiler);
  const outputs = createOutputRecords(root, compiler);
  const toolchain = {
    node: process.version,
    typescript,
  };
  return {
    schema: COMPILER_BUILD_EVIDENCE_SCHEMA,
    algorithm: "sha256",
    package: compiler,
    inputs,
    config,
    toolchain,
    outputs,
    inputDigest: lengthPrefixedDigest("inputs", inputs),
    outputDigest: lengthPrefixedDigest("outputs", outputs),
  };
}

export function writeBuildEvidence(
  root = ROOT,
  compiler = COMPILER,
  output = join(root, compiler, "dist", "build-evidence.json"),
) {
  const evidence = createBuildEvidence(root, compiler);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function isEntryList(value) {
  return Array.isArray(value) && value.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const keys = Object.keys(entry).sort();
    return JSON.stringify(keys) === JSON.stringify([...ENTRY_KEYS].sort()) &&
      typeof entry.path === "string" &&
      Number.isSafeInteger(entry.bytes) &&
      entry.bytes >= 0 &&
      typeof entry.digest === "string" &&
      SHA256_HEX.test(entry.digest);
  });
}

export function verifyBuildEvidence(root, compiler, rawJson) {
  try {
    assertNoDuplicateJsonKeys(rawJson);
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError) {
      return { ok: false, reason: `fidelity build evidence contains ${error.message}` };
    }
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }

  let evidence;
  try {
    evidence = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }

  const keys = Object.keys(evidence).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...EVIDENCE_KEYS].sort())) {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }
  if (evidence.schema !== COMPILER_BUILD_EVIDENCE_SCHEMA || evidence.algorithm !== "sha256") {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }
  if (evidence.package !== compiler) {
    return { ok: false, reason: "fidelity build evidence package mismatch (build the compiler first)" };
  }
  if (!isEntryList(evidence.inputs) || !isEntryList(evidence.outputs)) {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }
  if (
    typeof evidence.config !== "object" ||
    evidence.config === null ||
    Array.isArray(evidence.config) ||
    evidence.config.tsconfigPath !== `${compiler}/tsconfig.json` ||
    typeof evidence.config.digest !== "string" ||
    !SHA256_HEX.test(evidence.config.digest) ||
    JSON.stringify(evidence.config.include) !== JSON.stringify(FROZEN_TSCONFIG_INCLUDE)
  ) {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }
  if (
    typeof evidence.toolchain !== "object" ||
    evidence.toolchain === null ||
    Array.isArray(evidence.toolchain) ||
    evidence.toolchain.node !== process.version ||
    typeof evidence.toolchain.typescript !== "string"
  ) {
    return { ok: false, reason: "fidelity build evidence toolchain mismatch (build the compiler first)" };
  }
  if (
    typeof evidence.inputDigest !== "string" ||
    !SHA256_HEX.test(evidence.inputDigest) ||
    typeof evidence.outputDigest !== "string" ||
    !SHA256_HEX.test(evidence.outputDigest)
  ) {
    return { ok: false, reason: "fidelity build evidence is malformed (build the compiler first)" };
  }

  try {
    const expected = createBuildEvidence(root, compiler);
    if (JSON.stringify(expected.inputs) !== JSON.stringify(evidence.inputs)) {
      return { ok: false, reason: "fidelity build evidence input set mismatch (build the compiler first)" };
    }
    if (JSON.stringify(expected.outputs) !== JSON.stringify(evidence.outputs)) {
      return { ok: false, reason: "fidelity build evidence output digest mismatch (build the compiler first)" };
    }
    if (expected.inputDigest !== evidence.inputDigest || expected.config.digest !== evidence.config.digest) {
      return { ok: false, reason: "fidelity build evidence digest mismatch (build the compiler first)" };
    }
    if (expected.outputDigest !== evidence.outputDigest) {
      return { ok: false, reason: "fidelity build evidence output digest mismatch (build the compiler first)" };
    }
    if (expected.toolchain.typescript !== evidence.toolchain.typescript) {
      return { ok: false, reason: "fidelity build evidence toolchain mismatch (build the compiler first)" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("untracked inputs")) {
      return { ok: false, reason: `fidelity found untracked compiler inputs; freshness cannot be proven: ${message.split(": ").slice(1).join(": ")}` };
    }
    if (message.includes("compile-affecting source")) {
      return { ok: false, reason: `fidelity found compile-affecting source absent from tracked inputs; freshness cannot be proven` };
    }
    if (message.includes("cannot enumerate")) {
      return { ok: false, reason: "fidelity freshness cannot be proven from tracked compiler inputs (build the compiler first)" };
    }
    if (message.includes("no tracked")) {
      return { ok: false, reason: "fidelity freshness cannot be proven: no tracked compiler source/test inputs (build the compiler first)" };
    }
    return { ok: false, reason: "fidelity build evidence cannot be recomputed from every tracked input" };
  }

  return { ok: true, evidence };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const output = join(ROOT, COMPILER, "dist", "build-evidence.json");
    const evidence = writeBuildEvidence(ROOT, COMPILER, output);
    process.stdout.write(`compiler build evidence: ${evidence.inputs.length} inputs -> ${output}\n`);
  } catch (error) {
    process.stderr.write(`compiler build evidence refused: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
