// Replicate exactly what cec-integration.test.mjs does for 003-secure-flow
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseProgram, resolveSymbols, checkTypes, checkValueStates,
  checkEffects, effectResultsToDiagnostics, verifyGovernance, checkEvents,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dir, "../../../docs/Examples");

const SUPPRESS = new Set([
  "SPORE-TYPE-001",
  "SPORE-TYPE-009",
  "SPORE-NAME-001",
  "SPORE-GOV-002",
  "SPORE-SYNTAX-006",
  "SPORE-SYNTAX-007",
  "SPORE-SYNTAX-008",
]);

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

function filteredDiags(diags) {
  return diags.filter((d) => !SUPPRESS.has(d.code));
}

const llnFile = join(EXAMPLES_DIR, "Level-1-Basics/003-secure-flow/example.spore");
const raw = readFileSync(llnFile, "utf8");
const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

const allDiags = runPipeline(source, llnFile);
console.log("All diags:");
allDiags.forEach(d => console.log(`  code=${d.code} severity=${d.severity} suppressed=${SUPPRESS.has(d.code)}`));

const diags = filteredDiags(allDiags);
console.log("\nFiltered diags:");
diags.forEach(d => console.log(`  code=${d.code} severity=${d.severity}`));

const errors = diags.filter(d => d.severity === "error");
console.log("\nErrors:", errors.length);
console.log("Would pass:", errors.length === 0);
