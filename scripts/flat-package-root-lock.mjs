#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFlatPackageRootLock,
  parseStrictJsonObject,
  verifyFlatPackageRootLock,
} from "./lib/flat-package-root-lock.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";
import { collectCanonicalPackageFiles } from "./lib/flat-package-root-lock-collector.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/flat-package-root-lock.mjs --check|--write [--json]\n  select exactly one of --check or --write\n  --help, -h  print this usage and exit 0 without reading or writing");

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

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    refuse(`${label} is not valid UTF-8`);
  }
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
  const records = [];
  for (const { directory, files: readFiles } of collectCanonicalPackageFiles(repoRoot)) {
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
