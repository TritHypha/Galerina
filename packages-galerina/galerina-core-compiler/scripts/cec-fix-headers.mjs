#!/usr/bin/env node
// Fix example files that have duplicate test_status headers.
// Replaces 'test_status: draft' with 'test_status: stable' and removes extra stable lines.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dir, "../../../docs/Examples");

function walkDir(dir) {
  const found = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) found.push(...walkDir(full));
    else if (e.name === "example.spore") found.push(full);
  }
  return found;
}

const files = walkDir(EXAMPLES_DIR);
let fixed = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

  // Check for duplicate test_status
  const matches = [...source.matchAll(/^\/\/\/\s*test_status:\s*\w+/gm)];
  if (matches.length <= 1) continue;

  // Remove all test_status lines, then add one 'stable' after last header
  let cleaned = source.replace(/^\/\/\/\s*test_status:\s*\w+\n?/gm, "");

  // Add back exactly one stable header after the last /// header line
  const lines = cleaned.split("\n");
  let lastHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("///")) {
      lastHeaderIdx = i;
    } else if (lastHeaderIdx >= 0 && lines[i].trim() !== "") {
      break;
    }
  }

  if (lastHeaderIdx >= 0) {
    lines.splice(lastHeaderIdx + 1, 0, "/// test_status: stable");
  } else {
    lines.unshift("/// test_status: stable");
  }

  const newSource = lines.join("\n");
  writeFileSync(file, newSource, "utf8");
  console.log(`Fixed: ${file.replace(/\\/g, "/").split("/Examples/")[1]}`);
  fixed++;
}

console.log(`\nFixed ${fixed} files.`);
