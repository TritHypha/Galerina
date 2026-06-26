#!/usr/bin/env node
// CEC Promotion Audit Script
// Runs the full pipeline on every example.spore and reports promotion candidates.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
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

// Standard suppression (same as cec-integration.test.mjs)
const SUPPRESS = new Set([
  "SPORE-TYPE-001",   // unknown type — domain types from imports
  "SPORE-TYPE-009",   // generic arity — legacy Tensor<T>
  "SPORE-NAME-001",   // undeclared name — stdlib from imports
  "SPORE-GOV-002",    // missing audit — examples focused on other concepts
  "SPORE-SYNTAX-003", // future-reserved keyword — remote.execution in deny blocks
  "SPORE-SYNTAX-006", // top-level let — intro examples use top-level bindings
  "SPORE-SYNTAX-007", // top-level mut — intro examples use top-level bindings
  "SPORE-SYNTAX-008", // top-level binding variant
]);

// Suppression WITHOUT SPORE-TYPE-001 (for audit purposes)
const SUPPRESS_NO_TYPE001 = new Set([...SUPPRESS].filter(c => c !== "SPORE-TYPE-001"));

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

function parseTestStatus(source) {
  const match = source.match(/^\/\/\/\s*test_status:\s*(\w+)/m);
  return match ? match[1] : "draft";
}

function loadExamples() {
  if (!existsSync(EXAMPLES_DIR)) { console.error("EXAMPLES_DIR not found:", EXAMPLES_DIR); return []; }
  return walkDir(EXAMPLES_DIR).map((llnFile) => {
    const raw = readFileSync(llnFile, "utf8");
    const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

    const diagFile = llnFile.replace(/example\.spore$/, "expected.diagnostics.txt");
    let rawExpected = "none";
    try { rawExpected = readFileSync(diagFile, "utf8").trim(); } catch {}

    const lines = rawExpected.split("\n").map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));
    const expectNone = lines.length === 0 || lines[0].toLowerCase() === "none";
    const expectedCodes = expectNone ? []
      : lines.filter((l) => /^SPORE-[A-Z]+-\d+/.test(l)).map((l) => l.split(/\s/)[0]);

    // Check for placeholder codes (SPORE-XXX-NNN patterns that aren't real codes)
    const hasPlaceholderCodes = expectedCodes.some(c => /SPORE-[A-Z]+-\d+/.test(c) && c.includes("XXX"));

    // Check for "result of X else Y" readable type syntax
    const hasReadableTypeSyntax = /result of \w+ else \w+/.test(source);

    // Check for future syntax proposals (from Proposed-Readable-Logic-Forms)
    const isProposedSyntax = llnFile.replace(/\\/g, "/").includes("Proposed-Readable-Logic-Forms");

    // Check if it's level 8/9
    const normalized = llnFile.replace(/\\/g, "/");
    const isLevel89 = normalized.includes("Level-8") || normalized.includes("Level-9");

    const marker = "/Examples/";
    const afterExamples = normalized.slice(normalized.indexOf(marker) + marker.length);
    const name = afterExamples.replace("/example.spore", "");

    const testStatus = parseTestStatus(source);

    return {
      name,
      file: llnFile,
      source,
      expectNone,
      expectedCodes,
      hasPlaceholderCodes,
      hasReadableTypeSyntax,
      isProposedSyntax,
      isLevel89,
      testStatus,
    };
  });
}

const ALL = loadExamples();
console.log(`Total examples: ${ALL.length}`);
console.log(`Currently stable: ${ALL.filter(e => e.testStatus === "stable").length}`);
console.log(`Currently draft: ${ALL.filter(e => e.testStatus !== "stable").length}`);
console.log("");

const promotionCandidates = [];
const results = [];

for (const ex of ALL) {
  let diags;
  let crashed = false;
  try {
    diags = runPipeline(ex.source, ex.file);
  } catch (err) {
    crashed = true;
    diags = [];
    results.push({ name: ex.name, status: "CRASH", error: err.message, testStatus: ex.testStatus });
    continue;
  }

  // Standard filtered (with SPORE-TYPE-001 suppressed)
  const filteredStd = diags.filter(d => !SUPPRESS.has(d.code));
  const errorsStd = filteredStd.filter(d => d.severity === "error");

  // Filtered without SPORE-TYPE-001 suppression
  const filteredNoType001 = diags.filter(d => !SUPPRESS_NO_TYPE001.has(d.code));
  const errorsNoType001 = filteredNoType001.filter(d => d.severity === "error");

  const allCodes = diags.map(d => d.code);
  const errorCodes = errorsStd.map(d => d.code);

  let promotable = false;
  let reason = "";
  let assertionMode = "";

  if (ex.testStatus === "stable") {
    results.push({
      name: ex.name,
      status: "ALREADY_STABLE",
      errorCount: errorsStd.length,
      allCodes,
      testStatus: ex.testStatus,
    });
    continue;
  }

  // Skip proposed syntax examples
  if (ex.isProposedSyntax) {
    results.push({ name: ex.name, status: "SKIP_PROPOSED", testStatus: ex.testStatus });
    continue;
  }

  // Skip examples with "result of X else Y" readable type syntax
  if (ex.hasReadableTypeSyntax) {
    results.push({ name: ex.name, status: "SKIP_READABLE_SYNTAX", testStatus: ex.testStatus });
    continue;
  }

  if (ex.expectNone) {
    // Standard suppression path: errors === 0
    if (errorsStd.length === 0) {
      promotable = true;
      assertionMode = "expect-none";
      reason = errorsNoType001.length > 0
        ? `passes with std suppression (${errorsNoType001.map(d=>d.code).join(",")} only from TYPE-001)`
        : "passes cleanly (no errors even without TYPE-001 suppression)";
    } else {
      reason = `has ${errorsStd.length} error(s): ${errorCodes.join(", ")}`;
    }
  } else {
    // Specific expected codes — check all fire
    const allFire = ex.expectedCodes.every(code => allCodes.includes(code));
    const hasPlaceholders = ex.expectedCodes.some(c => c.includes("XXX"));

    if (hasPlaceholders) {
      reason = `has placeholder codes: ${ex.expectedCodes.filter(c => c.includes("XXX")).join(", ")}`;
    } else if (allFire) {
      promotable = true;
      assertionMode = "expected-codes";
      reason = `all expected codes fire: ${ex.expectedCodes.join(", ")}`;
    } else {
      const missing = ex.expectedCodes.filter(code => !allCodes.includes(code));
      reason = `missing expected codes: ${missing.join(", ")} (got: ${allCodes.join(", ")})`;
    }
  }

  results.push({
    name: ex.name,
    status: promotable ? "PROMOTE" : "SKIP",
    reason,
    assertionMode,
    errorCount: errorsStd.length,
    allCodes,
    testStatus: ex.testStatus,
    isLevel89: ex.isLevel89,
  });

  if (promotable) {
    promotionCandidates.push({ ...ex, assertionMode, reason });
  }
}

// Summary
console.log("=== AUDIT RESULTS ===\n");

const crashes = results.filter(r => r.status === "CRASH");
const promote = results.filter(r => r.status === "PROMOTE");
const skip = results.filter(r => r.status === "SKIP");
const skipProposed = results.filter(r => r.status === "SKIP_PROPOSED");
const skipReadable = results.filter(r => r.status === "SKIP_READABLE_SYNTAX");
const alreadyStable = results.filter(r => r.status === "ALREADY_STABLE");

console.log(`Already stable: ${alreadyStable.length}`);
console.log(`Promotion candidates: ${promote.length}`);
console.log(`Cannot promote (errors): ${skip.length}`);
console.log(`Skipped (proposed syntax): ${skipProposed.length}`);
console.log(`Skipped (readable syntax): ${skipReadable.length}`);
console.log(`Crashes: ${crashes.length}`);
console.log("");

if (crashes.length > 0) {
  console.log("=== CRASHES ===");
  for (const r of crashes) {
    console.log(`  ${r.name}: ${r.error}`);
  }
  console.log("");
}

if (promote.length > 0) {
  console.log("=== PROMOTION CANDIDATES ===");
  for (const r of promote) {
    const l89 = r.isLevel89 ? " [L8/9]" : "";
    console.log(`  [${r.assertionMode}]${l89} ${r.name}`);
    console.log(`    reason: ${r.reason}`);
  }
  console.log("");
}

if (skip.length > 0) {
  console.log("=== CANNOT PROMOTE (still have errors) ===");
  for (const r of skip) {
    console.log(`  ${r.name}: ${r.reason}`);
  }
  console.log("");
}

// Write list of files to promote
const promoteFiles = promote.map(r => r.name);
writeFileSync(
  join(__dir, "cec-promote-list.json"),
  JSON.stringify({ candidates: promoteFiles, count: promoteFiles.length }, null, 2)
);
console.log(`\nPromotion list written to scripts/cec-promote-list.json`);
console.log(`\nRun cec-do-promote.mjs to apply /// test_status: stable headers.`);
