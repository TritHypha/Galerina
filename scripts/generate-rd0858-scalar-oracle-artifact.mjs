import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileFunction } from "node:vm";

export const SCALAR_ORACLE_SOURCE_RELATIVE = "packages/fungi/products/galerina/rd0858-unit4-scalar-oracle/scalar-oracle.fungi";
export const SCALAR_ORACLE_ARTIFACT_RELATIVE = "packages/fungi/products/galerina/rd0858-unit4-scalar-oracle/scalar-oracle.checked.json";

const GENERATOR_RELATIVE = "scripts/generate-rd0858-scalar-oracle-artifact.mjs";
const COMPILER_PACKAGE_RELATIVE = "packages-ts/galerina-core-compiler";
const GRAPH_PACKAGE_RELATIVE = "packages-ts/galerina-devtools-graph-algorithms";
const SUBSTRATE_PACKAGE_RELATIVE = "packages-ts/galerina-substrate-math";
const PACKAGE_LOCK_RELATIVE = "package-lock.json";
const SOURCE_MAX_BYTES = 65_536;
const CHILD_MAX_BYTES = 1_048_576;
const CHILD_TIMEOUT_MS = 130_000;
const TOOLCHAIN_MAX_FILES = 4_096;
const TOOLCHAIN_MAX_BYTES = 268_435_456;
const TOOLCHAIN_MAX_FILE_BYTES = 134_217_728;
const TOOLCHAIN_MAX_DEPTH = 16;
const RUNTIME_MAX_FILES = 4_096;
const RUNTIME_MAX_BYTES = 67_108_864;
const RUNTIME_MAX_DEPTH = 32;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, ...SCALAR_ORACLE_SOURCE_RELATIVE.split("/"));
const artifactPath = join(root, ...SCALAR_ORACLE_ARTIFACT_RELATIVE.split("/"));
const generatorPath = join(root, ...GENERATOR_RELATIVE.split("/"));
const packageJsonPath = join(root, COMPILER_PACKAGE_RELATIVE, "package.json");
const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const nativeRequire = createRequire(import.meta.url);
const admittedCompilerCache = new WeakMap();

export const SCALAR_COMPILER_SOURCE_LOCATORS = Object.freeze([
  "bounded-cache.ts",
  "capability-types.ts",
  "checked-flow-artifact.ts",
  "core-syntax-safety.ts",
  "effect-checker.ts",
  "flow-name.ts",
  "generic-argument-kinds.ts",
  "governance-verifier.ts",
  "hardening-residency.ts",
  "i64-arith.ts",
  "invariant-discharge.ts",
  "lexer.ts",
  "module-registry.ts",
  "naming-policy-checker.ts",
  "numeric-lowering.ts",
  "observability-inference.ts",
  "package-type-registry.ts",
  "parser.ts",
  "proof-graph.ts",
  "rd0858-scalar-compiler-entry.ts",
  "requirement-diagnostics.ts",
  "requirement-terminality.ts",
  "requirement-validator-authority.ts",
  "resilience-inference.ts",
  "runtime/canonicalHash.ts",
  "runtime/limitPolicy.ts",
  "source-escape-checker.ts",
  "stdlib-registry.ts",
  "substrate-inference.ts",
  "substrate-math.ts",
  "symbol-resolver.ts",
  "taint-checker.ts",
  "type-checker.ts",
  "type-registry.ts",
  "u64-arith.ts",
  "unit-registry.generated.ts",
  "value-state-checker.ts",
  "globals.d.ts",
  "node-crypto-shim.d.ts",
  "node-fs-shim.d.ts",
  "node-path-shim.d.ts",
]);

const SCALAR_ENTRY_LOCATOR = "core/rd0858-scalar-compiler-entry.js";
const OWNERSHIP_MARKER = ".rd0858-scalar-owned.json";

const CHECKER_PATHS = Object.freeze([
  "packages-ts/galerina-core-compiler/src/parser.ts",
  "packages-ts/galerina-core-compiler/src/symbol-resolver.ts",
  "packages-ts/galerina-core-compiler/src/type-checker.ts",
  "packages-ts/galerina-core-compiler/src/value-state-checker.ts",
  "packages-ts/galerina-core-compiler/src/effect-checker.ts",
  "packages-ts/galerina-core-compiler/src/governance-verifier.ts",
  "packages-ts/galerina-core-compiler/src/source-escape-checker.ts",
  "packages-ts/galerina-core-compiler/src/naming-policy-checker.ts",
  "packages-ts/galerina-core-compiler/src/taint-checker.ts",
  "packages-ts/galerina-core-compiler/src/checked-flow-artifact.ts",
]);

const SCALAR_ORACLE_SOURCE_TEXT = `@version 1
pure flow scalarOracle(subject: Verdict) -> String
contract { effects {} }
{
  check(subject) {
    deny: { return "deny" }
    ambig: { return "ambig" }
    if: { return "allow" }
  }
}
`;

class ScalarArtifactRefusal extends Error {
  constructor(code, detail = "") {
    super(`RD0858_SCALAR_ARTIFACT_${code}: refused${detail === "" ? "" : ` (${detail})`}`);
    this.name = "ScalarArtifactRefusal";
    this.code = code;
  }
}

function refuse(code, detail = "") {
  throw new ScalarArtifactRefusal(code, detail);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stableRead(path, maxBytes, code) {
  let before;
  let bytes;
  let after;
  try {
    before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1n || before.size > BigInt(maxBytes)) {
      refuse(`${code}_FILE`);
    }
    bytes = readFileSync(path);
    after = lstatSync(path, { bigint: true });
  } catch (error) {
    if (error instanceof ScalarArtifactRefusal) throw error;
    refuse(`${code}_READ`);
  }
  for (const field of ["dev", "ino", "size", "mtimeNs"]) {
    if (before[field] !== after[field]) refuse(`${code}_DRIFT`);
  }
  if (BigInt(bytes.byteLength) !== before.size) refuse(`${code}_LENGTH`);
  return bytes;
}

function git(args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding,
    maxBuffer: CHILD_MAX_BYTES * 16,
    timeout: CHILD_TIMEOUT_MS,
  });
  if (result.status !== 0 || result.error !== undefined) {
    refuse("GIT", `${args.join(" ")}: ${String(result.stderr ?? result.error ?? "unknown")}`);
  }
  return result.stdout;
}

export function requireHeadMatchesWorktree(paths) {
  const result = spawnSync("git", ["-C", root, "diff", "--quiet", "HEAD", "--", ...paths], {
    encoding: "utf8",
    timeout: CHILD_TIMEOUT_MS,
  });
  if (result.status === 1) refuse("INPUT_NOT_HEAD");
  if (result.status !== 0 || result.error !== undefined) refuse("TOOLCHAIN_DIFF");
}

function headEntries(pathspec) {
  const output = git(["ls-tree", "-r", "-z", "HEAD", "--", pathspec], "buffer");
  const fields = output.toString("utf8").split("\0").filter(Boolean);
  const entries = fields.map((field) => {
    const match = /^(\d+) blob ([0-9a-f]+)\t(.+)$/u.exec(field);
    if (match === null) refuse("HEAD_RECORD");
    return Object.freeze({ mode: match[1], blob: match[2], path: match[3] });
  });
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return Object.freeze(entries);
}

function compilerExecutableLocatorsFromHead() {
  const sourcePrefix = `${COMPILER_PACKAGE_RELATIVE}/src/`;
  const locators = headEntries(`${COMPILER_PACKAGE_RELATIVE}/src`)
    .filter((entry) => entry.path.endsWith(".ts") && !entry.path.endsWith(".d.ts"))
    .map((entry) => `${entry.path.slice(sourcePrefix.length, -3)}.js`);
  locators.push("hallmark-non-authorities.json");
  locators.sort();
  if (locators.length < 2 || new Set(locators).size !== locators.length) {
    refuse("COMPILER_BUILD_MANIFEST");
  }
  return Object.freeze(locators);
}

function readHeadBlob(relativePath) {
  const bytes = git(["show", `HEAD:${relativePath}`], "buffer");
  if (!(bytes instanceof Buffer)) refuse("HEAD_BLOB");
  return bytes;
}

function closedChildEnv(extra = {}) {
  const admitted = {};
  for (const name of ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (typeof process.env[name] === "string") admitted[name] = process.env[name];
  }
  return Object.freeze({ ...admitted, ...extra, NODE_OPTIONS: "", NODE_PATH: "" });
}

function assertContainedRegularRoot(directory, code) {
  let stat;
  let canonical;
  try {
    stat = lstatSync(directory, { bigint: true });
    canonical = realpathSync.native(directory);
  } catch {
    refuse(`${code}_ROOT`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) refuse(`${code}_REPARSE`);
  return canonical;
}

function writeExclusive(path, bytes) {
  let descriptor;
  try {
    mkdirSync(dirname(path), { recursive: true });
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    closeSync(descriptor);
    descriptor = undefined;
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    refuse("TEMP_WRITE");
  }
}

function materializeHeadFiles(destination, packageRelative, locators) {
  let total = 0;
  const files = {};
  for (const locator of locators) {
    if (typeof locator !== "string" || locator.length < 1 || locator.length > 1_024
      || locator.includes("\\") || locator.includes("\0")
      || locator.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
      refuse("HEAD_LOCATOR");
    }
    const bytes = readHeadBlob(`${packageRelative}/src/${locator}`);
    total += bytes.byteLength;
    if (bytes.byteLength < 1 || bytes.byteLength > CHILD_MAX_BYTES * 4 || total > CHILD_MAX_BYTES * 32) {
      refuse("HEAD_SOURCE_BOUND");
    }
    const path = join(destination, "src", ...locator.split("/"));
    writeExclusive(path, bytes);
    files[path] = Buffer.from(bytes);
  }
  return Object.freeze(files);
}

function allHeadTypeScriptLocators(packageRelative) {
  const prefix = `${packageRelative}/src/`;
  const locators = headEntries(`${packageRelative}/src`)
    .filter((entry) => entry.mode === "100644" && entry.path.endsWith(".ts"))
    .map((entry) => entry.path.slice(prefix.length));
  if (locators.length < 1 || new Set(locators).size !== locators.length) refuse("HEAD_SOURCE_MANIFEST");
  return Object.freeze(locators);
}

export function digestBuildToolchainClosure(nodeExecutablePath, typeScriptRoot) {
  const hash = createHash("sha256");
  hash.update("galerina.scalar-build-toolchain.v1\0", "utf8");
  let nodeStat;
  try {
    nodeStat = lstatSync(nodeExecutablePath, { bigint: true });
  } catch {
    refuse("TOOLCHAIN_NODE");
  }
  if (!nodeStat.isFile() || nodeStat.isSymbolicLink()
    || nodeStat.size < 1n || nodeStat.size > BigInt(TOOLCHAIN_MAX_FILE_BYTES)) {
    refuse("TOOLCHAIN_NODE");
  }
  const nodeBytes = stableRead(nodeExecutablePath, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_NODE");
  hash.update(`node-executable\0${nodeBytes.byteLength}\0`, "utf8");
  hash.update(nodeBytes);

  const canonicalRoot = assertContainedRegularRoot(typeScriptRoot, "TOOLCHAIN");
  const rootPrefix = canonicalRoot.endsWith(sep) ? canonicalRoot : `${canonicalRoot}${sep}`;
  let files = 0;
  let bytesTotal = nodeBytes.byteLength;
  const required = new Set(["bin/tsc", "lib/tsc.js"]);
  const visit = (directory, depth) => {
    if (depth > TOOLCHAIN_MAX_DEPTH) refuse("TOOLCHAIN_DEPTH");
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      refuse("TOOLCHAIN_READ");
    }
    for (const name of entries) {
      const path = join(directory, name);
      let stat;
      let canonicalPath;
      try {
        stat = lstatSync(path, { bigint: true });
        canonicalPath = realpathSync.native(path);
      } catch {
        refuse("TOOLCHAIN_READ");
      }
      if (stat.isSymbolicLink()) refuse("TOOLCHAIN_REPARSE");
      if (canonicalPath !== canonicalRoot && !canonicalPath.startsWith(rootPrefix)) {
        refuse("TOOLCHAIN_CONTAINMENT");
      }
      if (stat.isDirectory()) {
        visit(path, depth + 1);
        continue;
      }
      if (!stat.isFile() || stat.size < 1n || stat.size > BigInt(TOOLCHAIN_MAX_FILE_BYTES)) {
        refuse("TOOLCHAIN_FILE");
      }
      files += 1;
      bytesTotal += Number(stat.size);
      if (files > TOOLCHAIN_MAX_FILES || bytesTotal > TOOLCHAIN_MAX_BYTES) {
        refuse("TOOLCHAIN_BOUND");
      }
      const locator = relative(typeScriptRoot, path).replaceAll("\\", "/");
      if (locator.startsWith("../") || locator.includes("\0") || locator.length > 1_024) {
        refuse("TOOLCHAIN_LOCATOR");
      }
      const fileBytes = stableRead(path, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_FILE");
      hash.update(`${locator}\0${fileBytes.byteLength}\0`, "utf8");
      hash.update(fileBytes);
      required.delete(locator);
    }
  };
  for (const locator of ["bin", "lib"]) {
    const directory = join(typeScriptRoot, locator);
    let stat;
    try {
      stat = lstatSync(directory, { bigint: true });
    } catch {
      refuse("TOOLCHAIN_MANIFEST");
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) refuse("TOOLCHAIN_REPARSE");
    visit(directory, 1);
  }
  if (required.size !== 0 || files < 2) refuse("TOOLCHAIN_MANIFEST");
  return `sha256:${hash.digest("hex")}`;
}

export function requireBuildToolchainClosure(nodeExecutablePath, typeScriptRoot, expectedDigest) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedDigest)
    || digestBuildToolchainClosure(nodeExecutablePath, typeScriptRoot) !== expectedDigest) {
    refuse("TOOLCHAIN_DRIFT");
  }
}

function requireNodeExecutableIdentity(nodeExecutablePath, expectedDigest) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedDigest)
    || sha256(stableRead(nodeExecutablePath, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_NODE")) !== expectedDigest) {
    refuse("TOOLCHAIN_NODE_DRIFT");
  }
}

function boundedUtf8(bytes, maxBytes, code) {
  if (!(bytes instanceof Buffer) || bytes.byteLength < 1 || bytes.byteLength > maxBytes) refuse(code);
  try {
    return textDecoder.decode(bytes);
  } catch {
    refuse(code);
  }
}

export function admitTypeScriptCompiler(nodeExecutablePath, typeScriptRoot) {
  const closureDigest = digestBuildToolchainClosure(nodeExecutablePath, typeScriptRoot);
  const nodeBytes = stableRead(nodeExecutablePath, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_NODE");
  const compilerPath = join(typeScriptRoot, "lib", "typescript.js");
  const compilerBytes = stableRead(compilerPath, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_COMPILER");
  const libraries = {};
  let libraryBytes = 0;
  let libraryFiles = 0;
  let entries;
  try {
    entries = readdirSync(join(typeScriptRoot, "lib")).sort();
  } catch {
    refuse("TOOLCHAIN_LIBRARY_READ");
  }
  for (const name of entries) {
    if (!/^lib(?:\.[a-z0-9-]+)*\.d\.ts$/u.test(name)) continue;
    const path = join(typeScriptRoot, "lib", name);
    const bytes = stableRead(path, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_LIBRARY");
    libraryFiles += 1;
    libraryBytes += bytes.byteLength;
    if (libraryFiles > TOOLCHAIN_MAX_FILES || libraryBytes > TOOLCHAIN_MAX_BYTES) {
      refuse("TOOLCHAIN_LIBRARY_BOUND");
    }
    libraries[name] = boundedUtf8(bytes, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_LIBRARY_UTF8");
  }
  if (libraries["lib.es2022.full.d.ts"] === undefined || libraryFiles < 2) {
    refuse("TOOLCHAIN_LIBRARY_MANIFEST");
  }
  requireBuildToolchainClosure(nodeExecutablePath, typeScriptRoot, closureDigest);
  return Object.freeze({
    schema: "rd0858.admitted-typescript.v1",
    closureDigest,
    nodeDigest: sha256(nodeBytes),
    compilerDigest: sha256(compilerBytes),
    compilerSource: boundedUtf8(compilerBytes, TOOLCHAIN_MAX_FILE_BYTES, "TOOLCHAIN_COMPILER_UTF8"),
    libraries: Object.freeze(libraries),
  });
}

function loadAdmittedTypeScript(admitted) {
  const cached = admittedCompilerCache.get(admitted);
  if (cached !== undefined) return cached;
  if (admitted?.schema !== "rd0858.admitted-typescript.v1"
    || !/^sha256:[0-9a-f]{64}$/u.test(admitted.nodeDigest)
    || !/^sha256:[0-9a-f]{64}$/u.test(admitted.compilerDigest)
    || typeof admitted.compilerSource !== "string"
    || sha256(Buffer.from(admitted.compilerSource, "utf8")) !== admitted.compilerDigest) {
    refuse("TOOLCHAIN_ADMISSION");
  }
  const module = { exports: {} };
  const restrictedRequire = (specifier) => {
    if (specifier === "source-map-support") return Object.freeze({ install() {} });
    if (!["crypto", "fs", "inspector", "os", "path", "perf_hooks"].includes(specifier)) {
      refuse("TOOLCHAIN_COMPILER_IMPORT");
    }
    return nativeRequire(`node:${specifier}`);
  };
  let factory;
  try {
    factory = compileFunction(
      admitted.compilerSource,
      ["require", "module", "exports", "__filename", "__dirname"],
      { filename: "rd0858-admitted-typescript.js" },
    );
    factory(restrictedRequire, module, module.exports, "rd0858-admitted-typescript.js", "/rd0858");
  } catch (error) {
    if (error instanceof ScalarArtifactRefusal) throw error;
    refuse("TOOLCHAIN_COMPILER_EVAL");
  }
  const compiler = module.exports;
  if (compiler === null || typeof compiler !== "object"
    || typeof compiler.createProgram !== "function"
    || typeof compiler.convertCompilerOptionsFromJson !== "function"
    || typeof compiler.createSourceFile !== "function"
    || typeof compiler.resolveModuleName !== "function") {
    refuse("TOOLCHAIN_COMPILER_API");
  }
  admittedCompilerCache.set(admitted, compiler);
  return compiler;
}

function canonicalVirtualPath(path) {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function normalizedIdentityValue(value, identityRoot, libraryRoot) {
  if (Array.isArray(value)) return value.map((entry) => normalizedIdentityValue(entry, identityRoot, libraryRoot));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      normalizedIdentityValue(value[key], identityRoot, libraryRoot),
    ]));
  }
  if (typeof value !== "string") return value;
  const absolute = resolve(value);
  const rootRelative = relative(identityRoot, absolute).replaceAll("\\", "/");
  if (rootRelative !== "" && !rootRelative.startsWith("../") && !rootRelative.includes(":/")) {
    return `$ROOT/${rootRelative}`;
  }
  const libraryRelative = relative(libraryRoot, absolute).replaceAll("\\", "/");
  if (libraryRelative !== "" && !libraryRelative.startsWith("../") && !libraryRelative.includes(":/")) {
    return `$TYPESCRIPT/${libraryRelative}`;
  }
  return value;
}

export function compileAdmittedTypeScriptProject(admitted, project) {
  if (project === null || typeof project !== "object" || Array.isArray(project)
    || typeof project.currentDirectory !== "string" || typeof project.identityRoot !== "string"
    || !Array.isArray(project.rootNames) || project.rootNames.length < 1
    || project.rootNames.length > TOOLCHAIN_MAX_FILES
    || project.files === null || typeof project.files !== "object" || Array.isArray(project.files)
    || project.options === null || typeof project.options !== "object" || Array.isArray(project.options)) {
    refuse("COMPILER_PROJECT");
  }
  const compiler = loadAdmittedTypeScript(admitted);
  const identityRoot = resolve(project.identityRoot);
  const currentDirectory = resolve(project.currentDirectory);
  const libraryRoot = join(identityRoot, ".rd0858-typescript-lib");
  const files = new Map();
  const labels = new Map();
  let totalBytes = 0;
  const admitFile = (path, bytes, label) => {
    const absolute = resolve(path);
    const key = canonicalVirtualPath(absolute);
    if (files.has(key) || typeof label !== "string" || label.length < 1 || label.length > 2_048) {
      refuse("COMPILER_PROJECT_ALIAS");
    }
    const buffer = Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(String(bytes), "utf8");
    totalBytes += buffer.byteLength;
    if (buffer.byteLength < 1 || buffer.byteLength > TOOLCHAIN_MAX_FILE_BYTES
      || files.size >= TOOLCHAIN_MAX_FILES || totalBytes > TOOLCHAIN_MAX_BYTES) {
      refuse("COMPILER_PROJECT_BOUND");
    }
    files.set(key, Object.freeze({ absolute, text: boundedUtf8(buffer, TOOLCHAIN_MAX_FILE_BYTES, "COMPILER_PROJECT_UTF8") }));
    labels.set(key, label);
  };
  for (const [path, bytes] of Object.entries(project.files)) {
    const locator = relative(identityRoot, resolve(path)).replaceAll("\\", "/");
    if (locator === "" || locator.startsWith("../") || locator.includes(":/") || locator.includes("\0")) {
      refuse("COMPILER_PROJECT_CONTAINMENT");
    }
    admitFile(path, bytes, `project/${locator}`);
  }
  for (const [name, text] of Object.entries(admitted.libraries ?? {})) {
    if (!/^lib(?:\.[a-z0-9-]+)*\.d\.ts$/u.test(name) || typeof text !== "string") {
      refuse("TOOLCHAIN_LIBRARY_MANIFEST");
    }
    admitFile(join(libraryRoot, name), text, `typescript/lib/${name}`);
  }
  const rootNames = project.rootNames.map((path) => resolve(path));
  if (rootNames.some((path) => !files.has(canonicalVirtualPath(path)))) refuse("COMPILER_PROJECT_ROOT");
  const converted = compiler.convertCompilerOptionsFromJson(project.options, currentDirectory);
  if (!converted || !converted.options || (converted.errors?.length ?? 0) !== 0) refuse("COMPILER_OPTIONS");
  const options = converted.options;
  const consumed = new Set();
  const outputs = {};
  const outputFiles = {};
  const readVirtual = (path) => {
    const key = canonicalVirtualPath(path);
    const entry = files.get(key);
    if (entry === undefined) return undefined;
    consumed.add(key);
    return entry.text;
  };
  const directoryExists = (directory) => {
    const prefix = `${canonicalVirtualPath(directory)}${sep}`;
    return [...files.keys()].some((key) => key.startsWith(prefix));
  };
  const host = {
    createSourceFile: (fileName, sourceText, languageVersion) => compiler.createSourceFile(
      fileName,
      sourceText,
      languageVersion,
      true,
    ),
    directoryExists,
    fileExists: (path) => files.has(canonicalVirtualPath(path)),
    getCanonicalFileName: (path) => process.platform === "win32" ? path.toLowerCase() : path,
    getCurrentDirectory: () => currentDirectory,
    getDefaultLibFileName: (compilerOptions) => join(libraryRoot, compiler.getDefaultLibFileName(compilerOptions)),
    getDirectories: (directory) => {
      const prefix = `${canonicalVirtualPath(directory)}${sep}`;
      return [...new Set([...files.values()].flatMap((entry) => {
        const candidate = canonicalVirtualPath(entry.absolute);
        if (!candidate.startsWith(prefix)) return [];
        const remainder = candidate.slice(prefix.length);
        const boundary = remainder.indexOf(sep);
        return boundary < 0 ? [] : [remainder.slice(0, boundary)];
      }))].sort();
    },
    getNewLine: () => "\n",
    getSourceFile: (fileName, languageVersion) => {
      const text = readVirtual(fileName);
      return text === undefined ? undefined : compiler.createSourceFile(fileName, text, languageVersion, true);
    },
    readFile: readVirtual,
    realpath: (path) => resolve(path),
    resolveModuleNames: (moduleNames, containingFile) => moduleNames.map((moduleName) => compiler.resolveModuleName(
      moduleName,
      containingFile,
      options,
      host,
    ).resolvedModule),
    useCaseSensitiveFileNames: () => process.platform !== "win32",
    writeFile: (path, text) => {
      const absolute = resolve(path);
      const locator = relative(identityRoot, absolute).replaceAll("\\", "/");
      if (locator === "" || locator.startsWith("../") || locator.includes(":/") || outputs[locator] !== undefined) {
        refuse("COMPILER_OUTPUT_CONTAINMENT");
      }
      const bytes = Buffer.from(text, "utf8");
      totalBytes += bytes.byteLength;
      if (bytes.byteLength < 1 || bytes.byteLength > TOOLCHAIN_MAX_FILE_BYTES
        || Object.keys(outputs).length >= TOOLCHAIN_MAX_FILES || totalBytes > TOOLCHAIN_MAX_BYTES) {
        refuse("COMPILER_OUTPUT_BOUND");
      }
      outputs[locator] = text;
      outputFiles[absolute] = text;
    },
  };
  let program;
  let emitResult;
  try {
    program = compiler.createProgram({ rootNames, options, host });
    const diagnostics = compiler.getPreEmitDiagnostics(program);
    if (diagnostics.some((diagnostic) => diagnostic.category === compiler.DiagnosticCategory.Error)) {
      refuse("COMPILER_BUILD_DIAGNOSTIC");
    }
    emitResult = program.emit();
  } catch (error) {
    if (error instanceof ScalarArtifactRefusal) throw error;
    refuse("COMPILER_BUILD");
  }
  if (emitResult.emitSkipped
    || emitResult.diagnostics.some((diagnostic) => diagnostic.category === compiler.DiagnosticCategory.Error)
    || Object.keys(outputs).length < 1) {
    refuse("COMPILER_BUILD_EMIT");
  }
  const hash = createHash("sha256");
  hash.update("galerina.typescript-compilation-input.v1\0", "utf8");
  hash.update(`${admitted.nodeDigest}\n${admitted.compilerDigest}\n`, "utf8");
  for (const key of [...consumed].sort()) {
    const entry = files.get(key);
    hash.update(`${labels.get(key)}\0${Buffer.byteLength(entry.text, "utf8")}\0`, "utf8");
    hash.update(entry.text, "utf8");
  }
  const normalizedOptions = normalizedIdentityValue(project.options, identityRoot, libraryRoot);
  hash.update(`${JSON.stringify(normalizedOptions)}\n`, "utf8");
  if (project.writeOutputs === true) {
    for (const path of Object.keys(outputFiles).sort()) writeExclusive(path, Buffer.from(outputFiles[path], "utf8"));
  }
  return Object.freeze({
    inputDigest: `sha256:${hash.digest("hex")}`,
    outputs: Object.freeze(outputs),
    outputFiles: Object.freeze(outputFiles),
  });
}

function runTypeScriptBuild(project, toolchain) {
  return compileAdmittedTypeScriptProject(toolchain.compiler, Object.freeze({
    ...project,
    writeOutputs: true,
  }));
}

function runtimeExecutableLocators(runtimeRoot) {
  const locators = [];
  const canonicalRoot = assertContainedRegularRoot(runtimeRoot, "COMPILER_BUILD");
  const rootPrefix = canonicalRoot.endsWith(sep) ? canonicalRoot : `${canonicalRoot}${sep}`;
  let files = 0;
  let bytes = 0;
  const visit = (directory, depth) => {
    if (depth > RUNTIME_MAX_DEPTH) refuse("COMPILER_BUILD_DEPTH");
    let entries;
    try {
      entries = readdirSync(directory).sort();
    } catch {
      refuse("COMPILER_BUILD_READ");
    }
    for (const name of entries) {
      const path = join(directory, name);
      let stat;
      let canonicalPath;
      try {
        stat = lstatSync(path, { bigint: true });
        canonicalPath = realpathSync.native(path);
      } catch {
        refuse("COMPILER_BUILD_READ");
      }
      if (stat.isSymbolicLink()) refuse("COMPILER_BUILD_SYMLINK");
      if (canonicalPath !== canonicalRoot && !canonicalPath.startsWith(rootPrefix)) {
        refuse("COMPILER_BUILD_CONTAINMENT");
      }
      if (stat.isDirectory()) {
        visit(path, depth + 1);
        continue;
      }
      if (!stat.isFile() || stat.size < 1n) refuse("COMPILER_BUILD_FILE");
      files += 1;
      bytes += Number(stat.size);
      if (files > RUNTIME_MAX_FILES || bytes > RUNTIME_MAX_BYTES) refuse("COMPILER_BUILD_BOUND");
      if (![".js", ".mjs", ".json", ".ts"].includes(extname(name))) {
        refuse("COMPILER_BUILD_EXTENSION");
      }
      if ([".js", ".mjs", ".json"].includes(extname(name))) {
        locators.push(relative(runtimeRoot, path).replaceAll("\\", "/"));
      }
    }
  };
  visit(runtimeRoot, 0);
  locators.sort();
  if (locators.length < 3 || new Set(locators).size !== locators.length) {
    refuse("COMPILER_BUILD_MANIFEST");
  }
  return Object.freeze(locators);
}

export function cleanupOwnedTemporary(directory, token) {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/u.test(token)) refuse("TEMP_TOKEN");
  const expectedParent = realpathSync.native(tmpdir());
  const canonical = assertContainedRegularRoot(directory, "TEMP_CLEANUP");
  const parentPrefix = expectedParent.endsWith(sep) ? expectedParent : `${expectedParent}${sep}`;
  if (!canonical.startsWith(parentPrefix) || !basename(canonical).startsWith("rd0858-scalar-build-")) {
    refuse("TEMP_CLEANUP_SCOPE");
  }
  let marker;
  try {
    marker = JSON.parse(textDecoder.decode(stableRead(join(directory, OWNERSHIP_MARKER), 256, "TEMP_MARKER")));
  } catch (error) {
    if (error instanceof ScalarArtifactRefusal) throw error;
    refuse("TEMP_MARKER");
  }
  if (marker?.schema !== "rd0858.scalar-temp-owner.v1" || marker.token !== token) {
    refuse("TEMP_OWNERSHIP");
  }
  rmSync(directory, { recursive: true, force: false });
}

const STRICT_LOADER_SOURCE = `
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
const configBytes = readFileSync(process.env.RD0858_LOADER_CONFIG);
const configDigest = "sha256:" + createHash("sha256").update(configBytes).digest("hex");
if (configDigest !== process.env.RD0858_LOADER_CONFIG_DIGEST) {
  throw new Error("RD0858_SCALAR_ARTIFACT_COMPILER_MODULE_CONFIG: refused");
}
const config = JSON.parse(configBytes.toString("utf8"));
const files = new Map(Object.entries(config.files));
const builtinParents = new Map(Object.entries(config.builtinParents));
function deny(code) { throw new Error("RD0858_SCALAR_ARTIFACT_COMPILER_MODULE_" + code + ": refused"); }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("node:")) {
    const parents = builtinParents.get(specifier);
    if (!Array.isArray(parents) || !parents.includes(context.parentURL)) deny("UNEXPECTED");
    return nextResolve(specifier, context);
  }
  const result = await nextResolve(specifier, context);
  if (!files.has(result.url)) deny("RESOLUTION");
  return result;
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.startsWith("file:")) return result;
  const expected = files.get(url);
  if (expected === undefined || result.source === null || result.source === undefined) deny("UNEXPECTED");
  const source = typeof result.source === "string"
    ? Buffer.from(result.source, "utf8")
    : result.source instanceof ArrayBuffer
      ? Buffer.from(result.source)
      : ArrayBuffer.isView(result.source)
        ? Buffer.from(result.source.buffer, result.source.byteOffset, result.source.byteLength)
        : deny("BYTES");
  const digest = "sha256:" + createHash("sha256").update(source).digest("hex");
  if (digest !== expected) deny("BYTES");
  appendFileSync(config.trace, JSON.stringify({ url, digest }) + "\\n", "utf8");
  return { ...result, source };
}
`;

export function buildStrictLoaderInvocation(source) {
  if (typeof source !== "string" || source.length < 1 || source.length > SOURCE_MAX_BYTES) {
    refuse("COMPILER_MODULE_LOADER");
  }
  const bytes = Buffer.from(source, "utf8");
  if (bytes.byteLength < 1 || bytes.byteLength > SOURCE_MAX_BYTES) {
    refuse("COMPILER_MODULE_LOADER");
  }
  return Object.freeze({
    digest: sha256(bytes),
    url: `data:text/javascript;base64,${bytes.toString("base64")}`,
  });
}

const SCALAR_RUNNER_SOURCE = `
import { readFileSync } from "node:fs";
const request = JSON.parse(readFileSync(0, "utf8"));
const compiler = await import(process.env.RD0858_SCALAR_ENTRY_URL);
let result;
if (request.mode === "candidate") {
  const built = compiler.buildRd0858ScalarArtifact(request.source, request.identity);
  result = { artifact: built.artifact, bytes: Buffer.from(built.bytes).toString("base64") };
} else if (request.mode === "verify") {
  result = compiler.verifyRd0858ScalarArtifact(
    request.source,
    Buffer.from(request.bytes, "base64"),
    request.identity,
  );
} else {
  throw new Error("RD0858_SCALAR_ARTIFACT_COMPILER_MODULE_REQUEST: refused");
}
process.stdout.write(JSON.stringify(result) + "\\n");
`;

export function digestCompilerPackageIdentityEntries(entries, compilerExecutableGraphDigest) {
  if (!Array.isArray(entries) || !/^sha256:[0-9a-f]{64}$/u.test(compilerExecutableGraphDigest)) {
    refuse("PACKAGE_GRAPH_INPUT");
  }
  const generatedGraphReports = new Set([
    `${COMPILER_PACKAGE_RELATIVE}/.graph/BOUNDARY.md`,
    `${COMPILER_PACKAGE_RELATIVE}/.graph/package-graph.json`,
  ]);
  const admitted = entries.filter((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || !/^100\d{3}$/u.test(entry.mode) || !/^[0-9a-f]{40,64}$/u.test(entry.blob)
      || typeof entry.path !== "string"
      || !entry.path.startsWith(`${COMPILER_PACKAGE_RELATIVE}/`)
      || entry.path.includes("\\") || entry.path.includes("\0")) {
      refuse("PACKAGE_GRAPH_ENTRY");
    }
    return !generatedGraphReports.has(entry.path);
  });
  if (admitted.length < 1) refuse("PACKAGE_GRAPH_HEAD");
  const hash = createHash("sha256");
  hash.update("galerina.compiler-package-identity.v4\0", "utf8");
  for (const entry of admitted) {
    hash.update(`${entry.mode} ${entry.blob}\t${entry.path}\n`, "utf8");
  }
  hash.update(`${compilerExecutableGraphDigest}\n`, "utf8");
  return `sha256:${hash.digest("hex")}`;
}

function computePackageGraphDigest(compilerExecutableGraphDigest) {
  return digestCompilerPackageIdentityEntries(
    headEntries(COMPILER_PACKAGE_RELATIVE),
    compilerExecutableGraphDigest,
  );
}

function computeCheckerSetDigest() {
  const hash = createHash("sha256");
  hash.update("galerina.strict-checks.v1\0", "utf8");
  for (const relativePath of CHECKER_PATHS) {
    const bytes = readHeadBlob(relativePath);
    hash.update(`${relativePath}\0${bytes.byteLength}\0`, "utf8");
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

function compilerVersion() {
  const parsed = JSON.parse(textDecoder.decode(readHeadBlob(`${COMPILER_PACKAGE_RELATIVE}/package.json`)));
  if (parsed?.name !== "@galerina/core-compiler" || typeof parsed.version !== "string") {
    refuse("PACKAGE_IDENTITY");
  }
  return parsed.version;
}

export function inspectScalarOracleSource(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > SOURCE_MAX_BYTES) {
    refuse("SOURCE_BOUND");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) refuse("SOURCE_BOM");
  for (const byte of bytes) if (byte === 0x0d) refuse("SOURCE_CR");
  let source;
  try {
    source = textDecoder.decode(bytes);
  } catch {
    refuse("SOURCE_UTF8");
  }
  if (source.normalize("NFC") !== source) refuse("SOURCE_NFC");
  if (source !== SCALAR_ORACLE_SOURCE_TEXT) refuse("SOURCE_CANONICAL");
  return Object.freeze({ source, sourceDigest: sha256(bytes) });
}


function assertExactScalarAst(ast) {
  const children = ast.children ?? [];
  const block = children.find((node) => node.kind === "block");
  const check = block?.children?.[0];
  if (check?.kind !== "checkExpr" || check.children?.length !== 4
    || check.children[0]?.kind !== "identifier" || check.children[0]?.value !== "subject") {
    refuse("CHECKED_AST_SHAPE");
  }
  const expected = [["deny", '"deny"'], ["ambig", '"ambig"'], ["if", '"allow"']];
  for (let index = 0; index < expected.length; index += 1) {
    const arm = check.children[index + 1];
    const literal = arm?.children?.[0]?.children?.[0]?.children?.[0];
    if (arm?.kind !== "checkArm" || arm.value !== expected[index][0]
      || literal?.kind !== "stringLiteral" || literal.value !== expected[index][1]) {
      refuse("CHECKED_AST_TERMINAL");
    }
  }
}

function currentIdentity(sourceDigest, compilerExecutableGraphDigest) {
  return Object.freeze({
    sourceDigest,
    compilerPackageGraphDigest: computePackageGraphDigest(compilerExecutableGraphDigest),
    checkerSetDigest: computeCheckerSetDigest(),
    generatorSourceDigest: sha256(readHeadBlob(GENERATOR_RELATIVE)),
    compilerExecutableGraphDigest,
  });
}

export function digestCompilerExecutableClosure(directory, admittedLocators) {
  const files = [];
  let rootStat;
  let canonicalRoot;
  try {
    rootStat = lstatSync(directory, { bigint: true });
    canonicalRoot = realpathSync.native(directory);
  } catch {
    refuse("COMPILER_BUILD_ROOT");
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    refuse("COMPILER_BUILD_REPARSE");
  }
  const rootPrefix = canonicalRoot.endsWith(sep) ? canonicalRoot : `${canonicalRoot}${sep}`;
  if (admittedLocators === undefined) {
    const visit = (current) => {
      for (const name of readdirSync(current).sort()) {
        const path = join(current, name);
        const stat = lstatSync(path, { bigint: true });
        if (stat.isSymbolicLink()) refuse("COMPILER_BUILD_SYMLINK");
        if (stat.isDirectory()) {
          visit(path);
        } else if (
          stat.isFile() &&
          name !== "build-evidence.json" &&
          [".js", ".json", ".wasm", ".fungi"].includes(extname(name))
        ) {
          files.push(path);
        }
      }
    };
    visit(directory);
  } else {
    if (!Array.isArray(admittedLocators) || admittedLocators.length < 1
      || admittedLocators.length > 4_096 || new Set(admittedLocators).size !== admittedLocators.length) {
      refuse("COMPILER_BUILD_MANIFEST");
    }
    const orderedLocators = [...admittedLocators].sort((left, right) => {
      const leftSegments = left.split("/");
      const rightSegments = right.split("/");
      const length = Math.min(leftSegments.length, rightSegments.length);
      for (let index = 0; index < length; index += 1) {
        if (leftSegments[index] < rightSegments[index]) return -1;
        if (leftSegments[index] > rightSegments[index]) return 1;
      }
      return leftSegments.length - rightSegments.length;
    });
    for (const locator of orderedLocators) {
      if (typeof locator !== "string" || locator.length < 1 || locator.length > 1_024
        || locator.startsWith("/") || /^[A-Za-z]:/u.test(locator)
        || locator.includes("\\") || locator.includes("\0")
        || locator.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
        || ![".js", ".mjs", ".json", ".wasm", ".fungi"].includes(extname(locator))
        || locator === "build-evidence.json") {
        refuse("COMPILER_BUILD_MANIFEST");
      }
      let path = directory;
      const segments = locator.split("/");
      for (let index = 0; index < segments.length; index += 1) {
        path = join(path, segments[index]);
        let stat;
        let canonicalPath;
        try {
          const siblings = readdirSync(dirname(path));
          const exactMatches = siblings.filter((name) => name === segments[index]);
          const foldedMatches = siblings.filter((name) => name.toUpperCase() === segments[index].toUpperCase());
          if (foldedMatches.length === 0) refuse("COMPILER_BUILD_MISSING");
          if (exactMatches.length !== 1 || foldedMatches.length !== 1) {
            refuse("COMPILER_BUILD_CASE");
          }
          stat = lstatSync(path, { bigint: true });
          canonicalPath = realpathSync.native(path);
        } catch (error) {
          if (error instanceof ScalarArtifactRefusal) throw error;
          refuse("COMPILER_BUILD_MISSING");
        }
        if (stat.isSymbolicLink()) refuse("COMPILER_BUILD_SYMLINK");
        if (canonicalPath !== canonicalRoot && !canonicalPath.startsWith(rootPrefix)) {
          refuse("COMPILER_BUILD_CONTAINMENT");
        }
        if (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
          refuse("COMPILER_BUILD_MANIFEST");
        }
      }
      files.push(path);
    }
  }
  if (files.length < 1) refuse("COMPILER_BUILD_EMPTY");
  const hash = createHash("sha256");
  hash.update("galerina.compiler-executable-graph.v2\0", "utf8");
  for (const path of files) {
    const locator = relative(directory, path).replaceAll("\\", "/");
    const bytes = stableRead(path, CHILD_MAX_BYTES * 16, "COMPILER_BUILD");
    hash.update(`${locator}\0${bytes.byteLength}\0`, "utf8");
    hash.update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function requireCompilerExecutableClosure(directory, admittedLocators, expectedDigest) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(expectedDigest)
    || digestCompilerExecutableClosure(directory, admittedLocators) !== expectedDigest) {
    refuse("COMPILER_BUILD_DRIFT");
  }
}

export function validateConsumedModuleTrace(entries, expectedHashes) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 4_096
    || expectedHashes === null || typeof expectedHashes !== "object" || Array.isArray(expectedHashes)) {
    refuse("COMPILER_MODULE_TRACE");
  }
  const compareUrl = ([left], [right]) => left < right ? -1 : left > right ? 1 : 0;
  const expected = Object.entries(expectedHashes).sort(compareUrl);
  if (expected.length < 1 || expected.length > 4_096 || entries.length !== expected.length) {
    refuse("COMPILER_MODULE_TRACE");
  }
  const seen = new Set();
  const actual = entries.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.url !== "string" || !entry.url.startsWith("file:")
      || !/^sha256:[0-9a-f]{64}$/u.test(entry.digest) || seen.has(entry.url)) {
      refuse("COMPILER_MODULE_TRACE");
    }
    seen.add(entry.url);
    return [entry.url, entry.digest];
  }).sort(compareUrl);
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index]?.[0] !== expected[index]?.[0]) refuse("COMPILER_MODULE_TRACE");
    if (actual[index]?.[1] !== expected[index]?.[1]) refuse("COMPILER_MODULE_BYTES");
  }
  return Object.freeze(actual.map(([url, digest]) => Object.freeze({ url, digest })));
}

function digestCompilerExecutionIdentity(runtimeDigest, toolchainDigest, buildInputsDigest, loaderDigest) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(runtimeDigest)
    || !/^sha256:[0-9a-f]{64}$/u.test(toolchainDigest)
    || !/^sha256:[0-9a-f]{64}$/u.test(buildInputsDigest)
    || !/^sha256:[0-9a-f]{64}$/u.test(loaderDigest)) {
    refuse("COMPILER_EXECUTION_IDENTITY");
  }
  const hash = createHash("sha256");
  hash.update("galerina.compiler-execution-identity.v4\0", "utf8");
  hash.update(`${runtimeDigest}\n${toolchainDigest}\n${buildInputsDigest}\n${loaderDigest}\n`, "utf8");
  return `sha256:${hash.digest("hex")}`;
}

export async function buildFreshHeadCompiler() {
  const governedPaths = [
    SCALAR_ORACLE_SOURCE_RELATIVE,
    SCALAR_ORACLE_ARTIFACT_RELATIVE,
    GENERATOR_RELATIVE,
    COMPILER_PACKAGE_RELATIVE,
    GRAPH_PACKAGE_RELATIVE,
    SUBSTRATE_PACKAGE_RELATIVE,
    PACKAGE_LOCK_RELATIVE,
  ];
  requireHeadMatchesWorktree(governedPaths);
  const headBefore = String(git(["rev-parse", "HEAD"])).trim();
  const typeScriptRoot = join(
    root,
    COMPILER_PACKAGE_RELATIVE,
    "node_modules",
    "typescript",
  );
  const admittedCompiler = admitTypeScriptCompiler(process.execPath, typeScriptRoot);
  const toolchain = Object.freeze({
    compiler: admittedCompiler,
    digest: admittedCompiler.closureDigest,
  });
  const token = randomBytes(16).toString("hex");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "rd0858-scalar-build-"));
  const stageRoot = join(temporaryRoot, "stage");
  const runtimeRoot = join(temporaryRoot, "runtime");
  const compilerStage = join(stageRoot, "compiler");
  const graphStage = join(stageRoot, "graph");
  const substrateStage = join(stageRoot, "substrate");
  try {
    assertContainedRegularRoot(temporaryRoot, "TEMP");
    writeExclusive(join(temporaryRoot, OWNERSHIP_MARKER), Buffer.from(JSON.stringify({
      schema: "rd0858.scalar-temp-owner.v1",
      token,
    }), "utf8"));
    const compilerFiles = { ...materializeHeadFiles(
      compilerStage,
      COMPILER_PACKAGE_RELATIVE,
      SCALAR_COMPILER_SOURCE_LOCATORS,
    ) };
    const graphFiles = { ...materializeHeadFiles(
      graphStage,
      GRAPH_PACKAGE_RELATIVE,
      allHeadTypeScriptLocators(GRAPH_PACKAGE_RELATIVE),
    ) };
    const substrateFiles = { ...materializeHeadFiles(
      substrateStage,
      SUBSTRATE_PACKAGE_RELATIVE,
      allHeadTypeScriptLocators(SUBSTRATE_PACKAGE_RELATIVE),
    ) };

    const modulePackageBytes = Buffer.from('{"type":"module"}\n', "utf8");
    for (const [files, path] of [
      [graphFiles, join(graphStage, "package.json")],
      [substrateFiles, join(substrateStage, "package.json")],
      [compilerFiles, join(compilerStage, "package.json")],
    ]) {
      writeExclusive(path, modulePackageBytes);
      files[path] = Buffer.from(modulePackageBytes);
    }
    const externalShimPath = join(compilerStage, "src", "rd0858-external-shim.d.ts");
    const externalShimBytes = Buffer.from(
      'declare module "@noble/post-quantum/ml-dsa.js" { export const ml_dsa65: any; }\n',
      "utf8",
    );
    writeExclusive(externalShimPath, externalShimBytes);
    compilerFiles[externalShimPath] = Buffer.from(externalShimBytes);

    const graphOut = join(runtimeRoot, "node_modules", "@galerina", "devtools-graph-algorithms");
    const substrateOut = join(runtimeRoot, "node_modules", "@galerina", "substrate-math");
    const compilerOut = join(runtimeRoot, "core");
    const commonOptions = {
      target: "ES2022",
      strict: true,
      skipLibCheck: true,
      declaration: true,
      declarationMap: false,
      sourceMap: false,
    };
    const graphBuild = runTypeScriptBuild({
      currentDirectory: graphStage,
      identityRoot: temporaryRoot,
      rootNames: Object.keys(graphFiles).filter((path) => path.endsWith(".ts")),
      files: graphFiles,
      options: {
        ...commonOptions,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        rootDir: join(graphStage, "src"),
        outDir: graphOut,
      },
    }, toolchain);
    const graphTypeOnlyOutput = join(graphOut, "core", "types.js");
    if (textDecoder.decode(stableRead(graphTypeOnlyOutput, 64, "COMPILER_BUILD")) !== "export {};\n") {
      refuse("COMPILER_BUILD_TYPE_ONLY");
    }
    unlinkSync(graphTypeOnlyOutput);
    writeExclusive(join(graphOut, "package.json"), Buffer.from(JSON.stringify({
      name: "@galerina/devtools-graph-algorithms",
      type: "module",
      main: "index.js",
      types: "index.d.ts",
    }), "utf8"));

    const substrateBuild = runTypeScriptBuild({
      currentDirectory: substrateStage,
      identityRoot: temporaryRoot,
      rootNames: Object.keys(substrateFiles).filter((path) => path.endsWith(".ts")),
      files: substrateFiles,
      options: {
        ...commonOptions,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        rootDir: join(substrateStage, "src"),
        outDir: substrateOut,
      },
    }, toolchain);
    writeExclusive(join(substrateOut, "package.json"), Buffer.from(JSON.stringify({
      name: "@galerina/substrate-math",
      type: "module",
      main: "index.js",
      types: "index.d.ts",
      exports: "./index.js",
    }), "utf8"));

    for (const [path, text] of Object.entries({
      ...graphBuild.outputFiles,
      ...substrateBuild.outputFiles,
    })) {
      if (path.endsWith(".d.ts")) compilerFiles[path] = text;
    }
    const compilerBuild = runTypeScriptBuild({
      currentDirectory: compilerStage,
      identityRoot: temporaryRoot,
      rootNames: Object.keys(compilerFiles).filter((path) => path.endsWith(".ts")),
      files: compilerFiles,
      options: {
        ...commonOptions,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        rootDir: join(compilerStage, "src"),
        outDir: compilerOut,
        baseUrl: compilerStage,
        paths: {
          "@galerina/devtools-graph-algorithms": [join(graphOut, "index.d.ts")],
          "@galerina/substrate-math": [join(substrateOut, "index.d.ts")],
        },
      },
    }, toolchain);

    const buildInputHash = createHash("sha256");
    buildInputHash.update("galerina.scalar-typescript-build-inputs.v1\0", "utf8");
    for (const build of [graphBuild, substrateBuild, compilerBuild]) {
      buildInputHash.update(`${build.inputDigest}\n`, "utf8");
    }
    const buildInputsDigest = `sha256:${buildInputHash.digest("hex")}`;

    writeExclusive(join(runtimeRoot, "scalar-runner.mjs"), Buffer.from(SCALAR_RUNNER_SOURCE, "utf8"));
    const executableLocators = runtimeExecutableLocators(runtimeRoot);
    const runtimeExecutableGraphDigest = digestCompilerExecutableClosure(runtimeRoot, executableLocators);
    const strictLoader = buildStrictLoaderInvocation(STRICT_LOADER_SOURCE);
    const compilerExecutableGraphDigest = digestCompilerExecutionIdentity(
      runtimeExecutableGraphDigest,
      toolchain.digest,
      buildInputsDigest,
      strictLoader.digest,
    );
    const executableUrls = executableLocators
      .filter((locator) => locator.endsWith(".js") || locator.endsWith(".mjs"))
      .map((locator) => pathToFileURL(join(runtimeRoot, ...locator.split("/"))).href)
      .sort();
    const executableHashes = Object.freeze(Object.fromEntries(executableUrls.map((url) => {
      const path = fileURLToPath(url);
      return [url, sha256(stableRead(path, CHILD_MAX_BYTES * 16, "COMPILER_MODULE"))];
    })));
    const entryUrl = pathToFileURL(join(runtimeRoot, ...SCALAR_ENTRY_LOCATOR.split("/"))).href;
    if (!executableUrls.includes(entryUrl)) refuse("COMPILER_MODULE_ENTRY");
    const runnerUrl = pathToFileURL(join(runtimeRoot, "scalar-runner.mjs")).href;
    const cryptoParents = [
      "core/checked-flow-artifact.js",
      "core/proof-graph.js",
      "core/requirement-validator-authority.js",
      "core/runtime/canonicalHash.js",
    ].map((locator) => pathToFileURL(join(runtimeRoot, ...locator.split("/"))).href).sort();
    const fsParents = [
      "scalar-runner.mjs",
      "core/module-registry.js",
    ].map((locator) => pathToFileURL(join(runtimeRoot, ...locator.split("/"))).href).sort();
    const pathParents = [
      "core/module-registry.js",
    ].map((locator) => pathToFileURL(join(runtimeRoot, ...locator.split("/"))).href).sort();
    requireHeadMatchesWorktree(governedPaths);
    if (String(git(["rev-parse", "HEAD"])).trim() !== headBefore) refuse("HEAD_DRIFT");

    const execute = (request) => {
      const invocation = randomBytes(16).toString("hex");
      const tracePath = join(temporaryRoot, `trace-${invocation}.txt`);
      const configPath = join(temporaryRoot, `loader-${invocation}.json`);
      writeExclusive(tracePath, Buffer.from("", "utf8"));
      const configBytes = Buffer.from(JSON.stringify({
        files: executableHashes,
        builtinParents: {
          "node:crypto": cryptoParents,
          "node:fs": fsParents,
          "node:path": pathParents,
        },
        trace: tracePath,
      }), "utf8");
      writeExclusive(configPath, configBytes);
      let result;
      let trace = [];
      try {
        requireNodeExecutableIdentity(process.execPath, toolchain.compiler.nodeDigest);
        requireCompilerExecutableClosure(runtimeRoot, executableLocators, runtimeExecutableGraphDigest);
        result = spawnSync(
          process.execPath,
          ["--experimental-loader", strictLoader.url,
            join(runtimeRoot, "scalar-runner.mjs")],
          {
            cwd: temporaryRoot,
            encoding: "utf8",
            input: JSON.stringify(request),
            env: closedChildEnv({
              RD0858_LOADER_CONFIG: configPath,
              RD0858_LOADER_CONFIG_DIGEST: sha256(configBytes),
              RD0858_SCALAR_ENTRY_URL: entryUrl,
            }),
            maxBuffer: CHILD_MAX_BYTES,
            timeout: CHILD_TIMEOUT_MS,
          },
        );
        requireNodeExecutableIdentity(process.execPath, toolchain.compiler.nodeDigest);
        requireCompilerExecutableClosure(runtimeRoot, executableLocators, runtimeExecutableGraphDigest);
        const traceBytes = stableRead(tracePath, CHILD_MAX_BYTES, "COMPILER_MODULE_TRACE");
        trace = textDecoder.decode(traceBytes).split("\n").filter(Boolean).map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            refuse("COMPILER_MODULE_TRACE");
          }
        });
      } finally {
        unlinkSync(tracePath);
        unlinkSync(configPath);
      }
      if (result.status !== 0 || result.error !== undefined) refuse("COMPILER_MODULE_CHILD");
      validateConsumedModuleTrace(trace, executableHashes);
      let parsed;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        refuse("COMPILER_MODULE_FRAME");
      }
      return parsed;
    };
    return Object.freeze({
      compilerExecutableGraphDigest,
      execute,
      dispose: () => cleanupOwnedTemporary(temporaryRoot, token),
    });
  } catch (error) {
    try {
      cleanupOwnedTemporary(temporaryRoot, token);
    } catch {
      // Preserve unowned or structurally changed residue for owner adjudication.
    }
    throw error;
  }
}

export async function buildScalarOracleArtifactCandidate() {
  const sourceBytes = stableRead(sourcePath, SOURCE_MAX_BYTES, "SOURCE");
  const inspected = inspectScalarOracleSource(sourceBytes);
  const isolated = await buildFreshHeadCompiler();
  try {
    const identity = currentIdentity(inspected.sourceDigest, isolated.compilerExecutableGraphDigest);
    const result = isolated.execute({
      mode: "candidate",
      source: inspected.source,
      identity: { ...identity, compilerVersion: compilerVersion() },
    });
    if (result?.artifact === null || typeof result?.artifact !== "object"
      || typeof result?.bytes !== "string") refuse("COMPILER_MODULE_FRAME");
    const bytes = Buffer.from(result.bytes, "base64");
    if (bytes.toString("base64") !== result.bytes) refuse("COMPILER_MODULE_FRAME");
    assertExactScalarAst(result.artifact.checkedAst);
    return Object.freeze({ artifact: Object.freeze(result.artifact), bytes, identity });
  } finally {
    isolated.dispose();
  }
}

export async function verifyScalarOraclePair(sourceBytes, artifactBytes, identity) {
  const inspected = inspectScalarOracleSource(sourceBytes);
  const isolated = await buildFreshHeadCompiler();
  try {
    const current = currentIdentity(inspected.sourceDigest, isolated.compilerExecutableGraphDigest);
    for (const field of ["sourceDigest", "compilerPackageGraphDigest", "checkerSetDigest",
      "generatorSourceDigest", "compilerExecutableGraphDigest"]) {
      if (identity?.[field] !== current[field]) refuse(`PAIR_${field.toUpperCase()}`);
    }
    const result = isolated.execute({
      mode: "verify",
      source: inspected.source,
      bytes: Buffer.from(artifactBytes).toString("base64"),
      identity: { ...current, compilerVersion: compilerVersion() },
    });
    if (typeof result?.artifactDigest !== "string" || result.sourceDigest !== inspected.sourceDigest) {
      refuse("COMPILER_MODULE_FRAME");
    }
    return Object.freeze(result);
  } finally {
    isolated.dispose();
  }
}

function isolatedCandidate() {
  const token = randomBytes(16).toString("hex");
  const result = spawnSync(process.execPath, [generatorPath, "--internal-candidate"], {
    cwd: root,
    encoding: "utf8",
    env: closedChildEnv({ GALERINA_SCALAR_GENERATOR_INTERNAL: token }),
    maxBuffer: CHILD_MAX_BYTES,
    timeout: CHILD_TIMEOUT_MS,
  });
  if (result.status !== 0 || result.error !== undefined) {
    refuse("CHILD", `${String(result.stderr ?? result.error ?? "unknown")}`.slice(0, 512));
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    refuse("CHILD_FRAME");
  }
  if (parsed?.token !== token || typeof parsed.bytes !== "string" || parsed.identity === null
    || typeof parsed.identity !== "object" || Array.isArray(parsed.identity)) refuse("CHILD_IDENTITY");
  const bytes = Buffer.from(parsed.bytes, "base64");
  if (bytes.toString("base64") !== parsed.bytes) refuse("CHILD_BASE64");
  return Object.freeze({ bytes, identity: Object.freeze({ ...parsed.identity }) });
}

function isolatedPair() {
  const first = isolatedCandidate();
  const second = isolatedCandidate();
  if (!first.bytes.equals(second.bytes)
    || JSON.stringify(first.identity) !== JSON.stringify(second.identity)) refuse("NON_DETERMINISTIC");
  return first;
}

function writeArtifactAtomic(bytes) {
  const temp = `${artifactPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let fd;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, bytes);
    closeSync(fd);
    fd = undefined;
    const reread = stableRead(temp, 262_144, "TEMP");
    if (!Buffer.from(reread).equals(Buffer.from(bytes))) refuse("TEMP_MISMATCH");
    renameSync(temp, artifactPath);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temp)) unlinkSync(temp);
    if (error instanceof ScalarArtifactRefusal) throw error;
    refuse("WRITE", error instanceof Error ? error.message : String(error));
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length !== 1) refuse("ARGUMENT_LOCATOR");
  const mode = args[0];
  if (mode === "--internal-candidate") {
    const token = process.env.GALERINA_SCALAR_GENERATOR_INTERNAL;
    if (typeof token !== "string" || !/^[0-9a-f]{32}$/u.test(token)) refuse("INTERNAL_TOKEN");
    const candidate = await buildScalarOracleArtifactCandidate();
    process.stdout.write(`${JSON.stringify({
      token,
      bytes: Buffer.from(candidate.bytes).toString("base64"),
      identity: candidate.identity,
    })}\n`);
    return;
  }
  if (mode !== "--check" && mode !== "--write" && mode !== "--self-test") refuse("MODE_ARGUMENT");
  const candidate = isolatedPair();
  const sourceBytes = stableRead(sourcePath, SOURCE_MAX_BYTES, "SOURCE");
  await verifyScalarOraclePair(sourceBytes, candidate.bytes, candidate.identity);
  if (mode === "--self-test") {
    process.stdout.write("RD0858_SCALAR_ARTIFACT_SELF_TEST PASS\n");
    return;
  }
  if (mode === "--write") {
    if (!existsSync(artifactPath)
      || !Buffer.from(stableRead(artifactPath, 262_144, "ARTIFACT")).equals(candidate.bytes)) {
      writeArtifactAtomic(candidate.bytes);
    }
    process.stdout.write("RD0858_SCALAR_ARTIFACT_WRITE PASS\n");
    return;
  }
  const committed = stableRead(artifactPath, 262_144, "ARTIFACT");
  await verifyScalarOraclePair(sourceBytes, committed, candidate.identity);
  if (!Buffer.from(committed).equals(candidate.bytes)) refuse("FIXED_POINT");
  process.stdout.write("RD0858_SCALAR_ARTIFACT_FIXED_POINT PASS byte-identical\n");
}

if (process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
