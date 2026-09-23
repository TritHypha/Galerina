#!/usr/bin/env node
// Apply /// test_status: stable headers to all promotion candidates.
// Reads from cec-promote-list.json.

import { lstatSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dir, "../../../docs/Examples");
const listFile = join(__dir, "cec-promote-list.json");

export function admitPromoteCandidate(name) {
  return typeof name === "string"
    && name.length > 0
    && !name.includes("\0")
    && !name.split(/[\\/]/).some((part) => part === "" || part === "." || part === "..")
    && !isAbsolute(name)
    && !/^[A-Za-z]:/.test(name);
}

function isDirectRun() {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(argv1);
}

if (!isDirectRun()) {
  // imported for admitPromoteCandidate
} else if (!existsSync(listFile)) {
  console.error("Run cec-audit.mjs first to generate the promotion list.");
  process.exit(1);
} else {

const { candidates } = JSON.parse(readFileSync(listFile, "utf8"));
console.log(`Promoting ${candidates.length} examples to stable...\n`);

let promoted = 0;
let alreadyStable = 0;
let notFound = 0;

for (const name of candidates) {
  if (!admitPromoteCandidate(name)) {
    console.log(`  REFUSED: ${name}`);
    notFound++;
    continue;
  }
  const candidateDir = join(EXAMPLES_DIR, name);
  try {
    if (lstatSync(candidateDir).isSymbolicLink()) {
      console.log(`  REFUSED: ${name}`);
      notFound++;
      continue;
    }
  } catch {
    console.log(`  NOT FOUND: ${name}`);
    notFound++;
    continue;
  }
  const fungiFile = join(EXAMPLES_DIR, name, "example.fungi");
  const fromExamples = relative(resolve(EXAMPLES_DIR), resolve(fungiFile));
  if (fromExamples.startsWith("..") || isAbsolute(fromExamples)) {
    console.log(`  REFUSED: ${name}`);
    notFound++;
    continue;
  }
  if (!existsSync(fungiFile) || lstatSync(fungiFile).isSymbolicLink()) {
    console.log(`  NOT FOUND: ${name}`);
    notFound++;
    continue;
  }

  const raw = readFileSync(fungiFile, "utf8");
  const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

  if (/^\/\/\/\s*test_status:\s*stable/m.test(source)) {
    console.log(`  SKIP (already stable): ${name}`);
    alreadyStable++;
    continue;
  }

  let newSource;

  // If there's a test_status: draft (or other value), replace it.
  if (/^\/\/\/\s*test_status:\s*\w+/m.test(source)) {
    newSource = source.replace(
      /^(\/\/\/\s*test_status:\s*)\w+/m,
      "$1stable"
    );
  } else {
    // Insert /// test_status: stable after the last /// header line
    const lines = source.split("\n");
    let lastHeaderIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("///")) {
        lastHeaderIdx = i;
      } else if (lastHeaderIdx >= 0 && lines[i].trim() !== "") {
        break;
      }
    }

    if (lastHeaderIdx < 0) {
      newSource = "/// test_status: stable\n" + source;
    } else {
      const lines2 = source.split("\n");
      lines2.splice(lastHeaderIdx + 1, 0, "/// test_status: stable");
      newSource = lines2.join("\n");
    }
  }

  writeFileSync(fungiFile, newSource, "utf8");

  console.log(`  PROMOTED: ${name}`);
  promoted++;
}

console.log(`\nDone. Promoted: ${promoted}, Already stable: ${alreadyStable}, Not found: ${notFound}`);
console.log(`Total stable now: ${96 + promoted} (was 96)`);
}
