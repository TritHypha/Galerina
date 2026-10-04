#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifySlideReferenceEvidence } from "./lib/assurance-fabric/slide-reference-evidence.mjs";
import { generatedOutputMatches } from "./lib/provenance.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/verify-slide-reference-evidence.mjs [--root <dir>] [--slide-root <dir>] [--check|--write]\n  --help, -h  print this usage and exit 0 without reading or writing");

function parseArgs(argv) {
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const configuredSlideRoot = process.env.GALERINA_SLIDE_DIR;
  if (
    configuredSlideRoot !== undefined
    && (configuredSlideRoot.trim() === "" || !isAbsolute(configuredSlideRoot))
  ) {
    throw new Error("GALERINA_SLIDE_DIR requires an absolute path");
  }
  let root = defaultRoot;
  let slideRoot = configuredSlideRoot === undefined
    ? resolve(defaultRoot, "..", "SLIDE")
    : resolve(configuredSlideRoot);
  let mode = "print";
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root" || arg === "--slide-root") {
      if (seen.has(arg) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error(`${arg} requires exactly one path`);
      }
      seen.add(arg);
      const value = resolve(argv[index += 1]);
      if (arg === "--root") root = value;
      else slideRoot = value;
      continue;
    }
    if (arg === "--write" || arg === "--check") {
      if (mode !== "print") throw new Error("select exactly one output mode");
      mode = arg.slice(2);
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  return { root, slideRoot, mode };
}

const options = parseArgs(process.argv.slice(2));
const result = verifySlideReferenceEvidence(options.root, options.slideRoot);
if (result.kind === "refused") {
  console.error(`${result.code}: ${result.detail}`);
  process.exit(2);
}
const outDir = join(options.root, "build", "slide-reference");
const reportPath = join(outDir, "reference.json");
const provenancePath = join(outDir, "provenance.json");
const reportBytes = `${JSON.stringify(result.value.report, undefined, 2)}\n`;
const provenanceBytes = `${JSON.stringify(result.value.provenance, undefined, 2)}\n`;

if (options.mode === "check") {
  const expected = [[reportPath, reportBytes], [provenancePath, provenanceBytes]];
  const stale = expected.filter(([path, bytes]) => (
    !existsSync(path) || !generatedOutputMatches(path, readFileSync(path, "utf8"), bytes)
  ));
  if (stale.length > 0) {
    console.error("SLIDE reference evidence is missing or stale; no files written.");
    process.exit(1);
  }
  console.log("SLIDE reference evidence is exact and current at its pinned Git object.");
  process.exit(0);
}

if (options.mode === "write") {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, reportBytes);
  writeFileSync(provenancePath, provenanceBytes);
  console.log("wrote pinned SLIDE reference evidence and provenance");
  process.exit(0);
}

console.log(reportBytes.trimEnd());
