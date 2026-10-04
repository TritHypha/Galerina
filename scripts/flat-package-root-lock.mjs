#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildFlatPackageRootLock,
  parseStrictJsonObject,
  verifyFlatPackageRootLock,
} from "./lib/flat-package-root-lock.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/flat-package-root-lock.mjs --check|--write [--json]\n  select exactly one of --check or --write\n  --help, -h  print this usage and exit 0 without reading or writing");

const MAX_TRACKED_FILE_BYTES = 16 * 1024 * 1024;
const PACKAGE_ROOT_NAME = "packages-ts";
const OUTPUT_RELATIVE = "governance/flat-package-root-lock.json";
const DEPENDENCY_SECTIONS = [
  ["dependencies", "runtime"],
  ["optionalDependencies", "optional"],
  ["peerDependencies", "peer"],
  ["devDependencies", "development"],
];

function refuse(message) {
  throw new Error(`REFUSED: ${message}`);
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

function isContained(parent, child) {
  const prefix = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(prefix);
}

function sameStat(before, after) {
  return before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

function stableRegularFile(path, ownerRoot, label) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) refuse(`${label} is not a regular non-symlink file`);
  if (before.size > MAX_TRACKED_FILE_BYTES) refuse(`${label} exceeds the bounded file size`);
  const real = realpathSync(path);
  if (!isContained(ownerRoot, real)) refuse(`${label} escapes its direct package peer`);
  const first = readFileSync(path);
  const after = lstatSync(path);
  if (!sameStat(before, after) || realpathSync(path) !== real) refuse(`${label} changed while it was read`);
  const second = readFileSync(path);
  const finalStat = lstatSync(path);
  if (!sameStat(after, finalStat) || !first.equals(second)) refuse(`${label} was unstable across verification`);
  return first;
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    refuse(`${label} is not valid UTF-8`);
  }
}

function trackedFiles(repoRoot) {
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${repoRoot}`, "-C", repoRoot, "ls-files", "-z", "--", PACKAGE_ROOT_NAME],
    { encoding: "buffer", windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) refuse("Git-tracked package inventory could not be derived");
  const paths = result.stdout.toString("utf8").split("\0").filter(Boolean).map(slash).sort();
  const folded = new Set();
  for (const path of paths) {
    const key = path.toLocaleLowerCase("en-US");
    if (folded.has(key)) refuse(`tracked path has a case-fold collision: ${path}`);
    folded.add(key);
  }
  return paths;
}

function dependencyMap(manifest, section, scope, owner) {
  const value = manifest[section];
  if (value === undefined) return [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    refuse(`${owner} ${section} must be an object`);
  }
  return Object.entries(value).map(([identity, specifier]) => {
    if (typeof specifier !== "string" || specifier.length === 0) {
      refuse(`${owner} ${section} contains an invalid specifier for ${identity}`);
    }
    return { identity, scope, specifier };
  });
}

function contentDigest(files) {
  const hash = createHash("sha256").update("galerina.flat-package.content.v1\0", "utf8");
  for (const file of files) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(pathBytes.length);
    const dataLength = Buffer.alloc(8);
    dataLength.writeBigUInt64BE(BigInt(file.bytes.length));
    hash.update(pathLength).update(pathBytes).update(dataLength).update(file.bytes);
  }
  return hash.digest("hex");
}

export function collectFlatPackageRecords(repoRoot) {
  const canonicalRepo = realpathSync(repoRoot);
  const packageRoot = join(canonicalRepo, PACKAGE_ROOT_NAME);
  const canonicalPackageRoot = realpathSync(packageRoot);
  if (resolve(canonicalPackageRoot) !== resolve(packageRoot)) refuse("package root is redirected");

  const tracked = trackedFiles(canonicalRepo);
  const records = [];
  const directories = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();

  for (const directory of directories) {
    const packageDirectory = join(packageRoot, directory);
    const packageLstat = lstatSync(packageDirectory);
    if (packageLstat.isSymbolicLink()) refuse(`${directory} is a symlinked direct package peer`);
    const canonicalDirectory = realpathSync(packageDirectory);
    if (!isContained(canonicalPackageRoot, canonicalDirectory)) refuse(`${directory} escapes the package root`);
    const manifestPath = join(packageDirectory, "package.json");
    if (!existsSync(manifestPath)) refuse(`${directory} has no package.json identity`);

    const prefix = `${PACKAGE_ROOT_NAME}/${directory}/`;
    const packageFiles = tracked.filter((path) => path.startsWith(prefix));
    if (!packageFiles.includes(`${prefix}package.json`)) refuse(`${directory}/package.json is not Git-tracked`);
    const readFiles = packageFiles.map((trackedPath) => {
      const absolute = join(canonicalRepo, ...trackedPath.split("/"));
      const localPath = slash(relative(packageDirectory, absolute));
      if (localPath.startsWith("../") || localPath === "..") refuse(`${trackedPath} escapes its package peer`);
      return {
        path: localPath,
        bytes: stableRegularFile(absolute, canonicalDirectory, trackedPath),
      };
    }).sort((a, b) => a.path.localeCompare(b.path));

    const packageJson = readFiles.find((entry) => entry.path === "package.json");
    const manifest = parseStrictJsonObject(decodeUtf8(packageJson.bytes, `${directory}/package.json`), `${directory}/package.json`);
    if (typeof manifest.name !== "string" || manifest.name.length === 0) refuse(`${directory} package identity is missing`);
    if (typeof manifest.version !== "string" || manifest.version.length === 0) refuse(`${directory} package version is missing`);

    const manifestDigests = readFiles
      .filter((entry) => entry.path === "package.json" || entry.path === "package.fungi.json")
      .map((entry) => {
        parseStrictJsonObject(decodeUtf8(entry.bytes, `${directory}/${entry.path}`), `${directory}/${entry.path}`);
        return { path: entry.path, digest: createHash("sha256").update(entry.bytes).digest("hex") };
      });
    const dependencies = DEPENDENCY_SECTIONS.flatMap(([section, scope]) =>
      dependencyMap(manifest, section, scope, manifest.name));
    records.push({
      identity: manifest.name,
      version: manifest.version,
      directory,
      contentDigest: contentDigest(readFiles),
      manifestDigests,
      dependencies,
    });
  }
  return records;
}

function outputText(lock) {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

export function deriveCurrentFlatPackageRootLock(repoRoot) {
  return buildFlatPackageRootLock(collectFlatPackageRecords(repoRoot));
}

function main() {
  const args = new Set(process.argv.slice(2));
  const known = new Set(["--write", "--check", "--json"]);
  for (const argument of args) if (!known.has(argument)) refuse(`unknown argument ${argument}`);
  if (args.has("--write") === args.has("--check")) refuse("select exactly one of --write or --check");
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const lock = deriveCurrentFlatPackageRootLock(repoRoot);
  verifyFlatPackageRootLock(lock);
  const outputPath = join(repoRoot, ...OUTPUT_RELATIVE.split("/"));
  const expected = outputText(lock);
  if (args.has("--write")) {
    writeFileSync(outputPath, expected, { encoding: "utf8" });
  } else {
    if (!existsSync(outputPath)) refuse(`${OUTPUT_RELATIVE} is missing`);
    const actual = readFileSync(outputPath, "utf8");
    parseStrictJsonObject(actual, OUTPUT_RELATIVE);
    if (actual !== expected) refuse(`${OUTPUT_RELATIVE} is stale or non-canonical`);
  }
  const facts = {
    schema: lock.schema,
    verdict: "REFERENCE_LOCK_VERIFIED",
    authorityReleased: false,
    packages: lock.packages.length,
    internalEdges: lock.packages.reduce(
      (count, entry) => count + entry.dependencies.filter((dependency) => lock.packages.some((peer) => peer.identity === dependency.identity)).length,
      0,
    ),
    externalBootstrapEdges: lock.externalBootstrapDependencies.length,
    developmentVersionDrift: lock.developmentVersionDrift.length,
    rootDigest: lock.rootDigest,
  };
  process.stdout.write(`${JSON.stringify(facts)}\n`);
}

const isMain = process.argv[1] !== undefined
  && resolve(realpathSync(process.argv[1])) === resolve(realpathSync(fileURLToPath(import.meta.url)));
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
