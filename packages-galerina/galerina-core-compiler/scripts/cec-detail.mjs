#!/usr/bin/env node
// Detailed diagnostic output for specific examples

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseProgram,
  resolveSymbols,
  checkTypes,
  checkValueStates,
  checkEffects,
  effectResultsToDiagnostics,
  verifyGovernance,
  checkEvents,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dir, "../../../docs/Examples");

function runPipeline(source, filePath) {
  const parsed = parseProgram(source, filePath);
  const symbolResult = resolveSymbols(parsed.ast);
  const typeResult = checkTypes(parsed.ast);
  const valueStateResult = checkValueStates(parsed.ast);
  const effectResults = checkEffects(parsed.flows, parsed.ast);
  const govResult = verifyGovernance(parsed.ast, parsed.flows, effectResults, "dev");
  const eventResult = checkEvents(parsed.ast);

  return [
    ...parsed.diagnostics,
    ...symbolResult.diagnostics,
    ...typeResult.diagnostics,
    ...valueStateResult.diagnostics,
    ...effectResultsToDiagnostics(effectResults),
    ...govResult.diagnostics,
    ...eventResult.diagnostics,
  ];
}

const targets = process.argv.slice(2);

for (const name of targets) {
  const llnFile = join(EXAMPLES_DIR, name, "example.spore");
  if (!existsSync(llnFile)) {
    console.log(`NOT FOUND: ${llnFile}`);
    continue;
  }
  const raw = readFileSync(llnFile, "utf8");
  const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  console.log(`\n=== ${name} ===`);
  console.log("Source:\n" + source);

  let diags;
  try {
    diags = runPipeline(source, llnFile);
  } catch (err) {
    console.log(`CRASH: ${err.message}`);
    continue;
  }
  if (diags.length === 0) {
    console.log("No diagnostics.");
  } else {
    for (const d of diags) {
      console.log(`  [${d.code}] ${d.message} @ line ${d.location?.line ?? "?"}`);
    }
  }
}
