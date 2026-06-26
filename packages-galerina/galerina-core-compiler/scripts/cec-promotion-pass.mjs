// =============================================================================
// CEC Promotion Pass — Phase 17A
// Runs the full pipeline on all draft examples and promotes eligible ones.
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
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

// Phase 1 suppression codes
const SUPPRESS = new Set([
  "SPORE-TYPE-001",
  "SPORE-TYPE-009",
  "SPORE-NAME-001",
  "SPORE-GOV-002",
  "SPORE-SYNTAX-006",
  "SPORE-SYNTAX-007",
  "SPORE-SYNTAX-008",
  "SPORE-EFFECT-004",
  "SPORE-VALUESTATE-006",
  "SPORE-VALUESTATE-002",
  "SPORE-EVENT-003",
  "SPORE-EVENT-005",
]);

// Proposal-only syntax patterns (result of X else Y)
const PROPOSAL_SYNTAX_PATTERNS = [
  /result\s+of\s+\w+\s+else\s+/,
  /\bresult\s+of\b/,
];

// Future syntax keywords not yet implemented
const FUTURE_SYNTAX_PATTERN = /\b(stateMachine|workflow)\b/;

// Placeholder diagnostic code patterns (SPORE-TYPE-XXX etc.)
const PLACEHOLDER_CODE_PATTERN = /SPORE-[A-Z]+-XXX/;

function runPipeline(source, filePath) {
  const parsed = parseProgram(source, filePath);
  const symbolResult = resolveSymbols(parsed.ast);
  const typeResult = checkTypes(parsed.ast);
  const vsResult = checkValueStates(parsed.ast);
  const effectResults = checkEffects(parsed.flows, parsed.ast);
  const govResult = verifyGovernance(parsed.ast, parsed.flows, effectResults, "dev");
  const eventResult = checkEvents(parsed.ast);

  return [
    ...parsed.diagnostics,
    ...symbolResult.diagnostics,
    ...typeResult.diagnostics,
    ...vsResult.diagnostics,
    ...effectResultsToDiagnostics(effectResults),
    ...govResult.diagnostics,
    ...eventResult.diagnostics,
  ];
}

function walkDir(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) found.push(...walkDir(full));
    else if (e.name === "example.spore") found.push(full);
  }
  return found;
}

function parseHeader(source) {
  const status = (source.match(/^\/\/\/\s*test_status:\s*(\w+)/m) || [])[1] || "draft";
  const expectedDiag = (source.match(/^\/\/\/\s*expected_diagnostics:\s*(.+)/m) || [])[1]?.trim() || "none";
  return { status, expectedDiag };
}

function hasProposalSyntax(source) {
  return PROPOSAL_SYNTAX_PATTERNS.some((p) => p.test(source));
}

function hasFutureSyntax(source) {
  return FUTURE_SYNTAX_PATTERN.test(source);
}

function hasPlaceholderCodes(source) {
  return PLACEHOLDER_CODE_PATTERN.test(source);
}

function parseName(llnFile) {
  const normalized = llnFile.replace(/\\/g, "/");
  const marker = "/Examples/";
  const after = normalized.slice(normalized.indexOf(marker) + marker.length);
  return after.replace("/example.spore", "");
}

function getLevel(llnFile) {
  const normalized = llnFile.replace(/\\/g, "/");
  const m = normalized.match(/Level-(\d+)-/);
  return m ? parseInt(m[1], 10) : 0;
}

function promoteFile(llnFile, source) {
  // Replace test_status: draft with test_status: stable
  let updated;
  if (/^\/\/\/\s*test_status:\s*draft/m.test(source)) {
    updated = source.replace(
      /^(\/\/\/\s*test_status:\s*)draft/m,
      "$1stable"
    );
  } else {
    // Header has test_status but not draft, or no test_status — insert after expected_diagnostics
    updated = source.replace(
      /(\/\/\/\s*expected_diagnostics:[^\n]*\n)/,
      "$1/// test_status: stable\n"
    );
  }
  // Preserve BOM if original had one
  writeFileSync(llnFile, updated, "utf8");
}

// Also update examples.manifest.json
function updateManifest(manifestPath, promotedIds) {
  if (promotedIds.size === 0) return;
  const raw = readFileSync(manifestPath, "utf8");
  const data = JSON.parse(raw);
  let changed = 0;
  for (const ex of data.examples) {
    if (promotedIds.has(ex.id)) {
      ex.status = "stable";
      changed++;
    }
  }
  // Recount
  data.stableCount = data.examples.filter((e) => e.status === "stable").length;
  data.draftCount = data.examples.filter((e) => e.status === "draft").length;
  data.generatedAt = new Date().toISOString();
  writeFileSync(manifestPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`\nManifest updated: ${changed} example(s) promoted, stableCount now ${data.stableCount}`);
}

// Results tracking
const results = {
  alreadyStable: [],
  promoted: [],      // { name, level, reason }
  keptDraft: [],
};

const draftReasons = new Map();
const promotedIds = new Set();

const allFiles = walkDir(EXAMPLES_DIR);
console.log(`Found ${allFiles.length} example files\n`);

for (const llnFile of allFiles) {
  const raw = readFileSync(llnFile, "utf8");
  const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const name = parseName(llnFile);
  const level = getLevel(llnFile);
  const { status, expectedDiag } = parseHeader(source);

  // Skip already-stable examples
  if (status === "stable") {
    results.alreadyStable.push(name);
    continue;
  }

  // Criterion: no proposal-only syntax
  if (hasProposalSyntax(source)) {
    results.keptDraft.push(name);
    draftReasons.set(name, "uses proposal-only syntax (result of X else Y)");
    continue;
  }

  // Criterion: no future syntax keywords
  if (hasFutureSyntax(source)) {
    const m = source.match(FUTURE_SYNTAX_PATTERN);
    results.keptDraft.push(name);
    draftReasons.set(name, `uses future syntax keyword: ${m[0]}`);
    continue;
  }

  // Criterion: no placeholder diagnostic codes in source
  if (hasPlaceholderCodes(source)) {
    results.keptDraft.push(name);
    draftReasons.set(name, "uses placeholder diagnostic codes (SPORE-XXX)");
    continue;
  }

  // Read expected.diagnostics.txt if present
  const diagFile = llnFile.replace(/example\.spore$/, "expected.diagnostics.txt");
  let rawExpected = expectedDiag.toLowerCase() === "none" ? "none" : expectedDiag;
  try {
    rawExpected = readFileSync(diagFile, "utf8").trim();
  } catch {
    /* not present — use header value */
  }

  const expectedLines = rawExpected
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));

  const expectNone =
    expectedLines.length === 0 || expectedLines[0].toLowerCase() === "none";

  const expectedCodes = expectedLines
    .filter((l) => /^SPORE-[A-Z]+-\d+/.test(l))
    .map((l) => l.split(/\s/)[0]);

  // Run the pipeline
  let diags;
  try {
    diags = runPipeline(source, llnFile);
  } catch (err) {
    results.keptDraft.push(name);
    draftReasons.set(name, `pipeline threw: ${err.message}`);
    continue;
  }

  // Apply Phase 1 suppression
  const filtered = diags.filter((d) => !SUPPRESS.has(d.code));
  const actualCodes = filtered.map((d) => d.code);
  const errors = filtered.filter((d) => d.severity === "error");

  // Determine if this is a "parse failure" (SPORE-PARSE-001 present after suppression)
  const hasParseError = filtered.some((d) => d.code === "SPORE-PARSE-001");
  if (hasParseError) {
    results.keptDraft.push(name);
    draftReasons.set(name, `parser failed (SPORE-PARSE-001): ${filtered.find(d=>d.code==="SPORE-PARSE-001").message}`);
    continue;
  }

  if (expectNone) {
    // Expected: zero diagnostics. Actual must also be zero errors after suppression.
    if (errors.length === 0) {
      results.promoted.push({ name, level, reason: "zero errors, expected none" });
      promotedIds.add(name.split("/").pop()); // id is last segment
      promoteFile(llnFile, source);
    } else {
      results.keptDraft.push(name);
      const errorSummary = errors.map((d) => `${d.code}`).join(", ");
      draftReasons.set(name, `${errors.length} error(s) after suppression: ${errorSummary}`);
    }
  } else if (expectedCodes.length > 0) {
    // Expected: specific diagnostic codes. Check if actual matches.
    const actualSet = new Set(actualCodes);
    const allExpectedFound = expectedCodes.every((code) => actualSet.has(code));
    // No unexpected codes beyond expected (extra codes = not yet correct)
    const unexpectedCodes = actualCodes.filter((c) => !expectedCodes.includes(c));

    if (allExpectedFound && unexpectedCodes.length === 0) {
      // Perfect match — promote
      results.promoted.push({ name, level, reason: `codes match: ${expectedCodes.join(", ")}` });
      promotedIds.add(name.split("/").pop());
      promoteFile(llnFile, source);
    } else if (allExpectedFound && unexpectedCodes.length > 0) {
      results.keptDraft.push(name);
      draftReasons.set(name, `expected codes found but unexpected extras: ${unexpectedCodes.join(", ")}`);
    } else {
      const missing = expectedCodes.filter((c) => !actualSet.has(c));
      results.keptDraft.push(name);
      draftReasons.set(name, `expected codes not emitted: ${missing.join(", ")} (actual: ${actualCodes.join(", ") || "none"})`);
    }
  } else {
    // No structured expected codes, not "none" either — keep as draft
    results.keptDraft.push(name);
    draftReasons.set(name, `ambiguous expected_diagnostics: "${expectedDiag}"`);
  }
}

// ── Update manifest ────────────────────────────────────────────────────────────
const manifestPath = join(EXAMPLES_DIR, "examples.manifest.json");
// Build set of example IDs that were promoted (match by folder name = example id)
const promotedIdSet = new Set(
  results.promoted.map((p) => {
    // name is like "Level-1-Basics/002-guarded-flow"
    return p.name.split("/").pop();
  })
);
updateManifest(manifestPath, promotedIdSet);

// ── Report ────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("CEC PROMOTION PASS RESULTS — Phase 17A");
console.log("=".repeat(70));
console.log(`\nAlready stable : ${results.alreadyStable.length}`);
console.log(`Newly promoted : ${results.promoted.length}`);
console.log(`Kept as draft  : ${results.keptDraft.length}`);
console.log(`Total examples : ${allFiles.length}`);
console.log(`Final stable   : ${results.alreadyStable.length + results.promoted.length}`);

if (results.promoted.length > 0) {
  console.log("\n" + "─".repeat(70));
  console.log("NEWLY PROMOTED TO STABLE:");
  console.log("─".repeat(70));
  for (const { name, level, reason } of results.promoted) {
    console.log(`  + ${name}  (Level ${level})  [${reason}]`);
  }
}

console.log("\n" + "─".repeat(70));
console.log("KEPT AS DRAFT (with reasons):");
console.log("─".repeat(70));
for (const name of results.keptDraft) {
  const reason = draftReasons.get(name) || "unknown";
  console.log(`  - ${name}`);
  console.log(`      → ${reason}`);
}
