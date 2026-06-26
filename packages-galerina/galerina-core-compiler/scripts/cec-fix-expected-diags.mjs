#!/usr/bin/env node
// Fix expected.diagnostics.txt files that have:
// 1. BOM prefix (U+FEFF)
// 2. Trailing colon after SPORE code: "SPORE-TYPE-009: ..." → "SPORE-TYPE-009\n..."

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
    else if (e.name === "expected.diagnostics.txt") found.push(full);
  }
  return found;
}

const files = walkDir(EXAMPLES_DIR);
let fixed = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // Remove BOM
  let content = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

  // Check if first non-comment line starts with SPORE-XXX-NNN:
  const lines = content.split("\n");
  let changed = raw.charCodeAt(0) === 0xFEFF; // BOM removal already changes it

  const fixed_lines = lines.map((line, i) => {
    // Match SPORE-CODE: description → extract just SPORE-CODE
    const m = line.match(/^(SPORE-[A-Z]+-\d+):(.*)$/);
    if (m) {
      changed = true;
      const code = m[1];
      const desc = m[2].trim();
      // Keep description as a comment line if there is one
      return desc ? `${code}\n// ${desc}` : code;
    }
    return line;
  });

  if (changed) {
    const newContent = fixed_lines.join("\n");
    writeFileSync(file, newContent, "utf8");
    const name = file.replace(/\\/g, "/").split("/Examples/")[1];
    console.log(`Fixed: ${name}`);
    fixed++;
  }
}

console.log(`\nFixed ${fixed} files.`);
