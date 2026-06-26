// =============================================================================
// CEC Integration Tests — Canonical Example Corpus
//
// Finds all example.spore files under docs/Examples/, compiles each through the
// full Galerina compiler pipeline, and compares actual diagnostics to the
// expected.diagnostics.txt companion file.
//
// Stability tiers (read from /// test_status: header in .spore files):
//
//   stable  → fully asserted: diagnostic mismatch is a test failure
//   draft   → compile-only: a crash is a test failure, mismatch is not
//   (none)  → defaults to draft
//
// To mark an example stable, add `/// test_status: stable` to its .spore header.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

// ── Path resolution ───────────────────────────────────────────────────────────
// tests/ → galerina-core-compiler/ → packages-galerina/ → LO/docs/Examples
const __dir = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dir, "../../../docs/Examples");

// ── Phase 1 suppression ───────────────────────────────────────────────────────
// These diagnostic codes are suppressed when asserting stable examples.
// They represent known gaps from domain imports, legacy syntax, or intro-level
// examples that deliberately use top-level bindings for pedagogical clarity.
const SUPPRESS = new Set([
  "SPORE-TYPE-001",        // unknown type — domain types from imports
  "SPORE-TYPE-009",        // generic arity — legacy Tensor<T> examples
  "SPORE-NAME-001",        // undeclared name — stdlib from imports
  "SPORE-GOV-002",         // missing audit — examples focused on other concepts
  "SPORE-GOV-007",         // authority block missing reason
  "SPORE-SYNTAX-003",      // future-reserved keyword
  "SPORE-SYNTAX-006",      // top-level let — intro examples
  "SPORE-SYNTAX-007",      // top-level mut — intro examples
  "SPORE-SYNTAX-008",      // top-level binding variant
  "SPORE-VALUESTATE-006",  // ProtectedBoundaryViolation — Wave 2 false positives being resolved
  "SPORE-VALUESTATE-002",  // UnsafeConditionalUpgrade — Wave 2 implementation may need tuning
  "SPORE-EVENT-003",       // ContractEmitsUndeclaredEvent — Wave 1 new diagnostic, needs tuning
  "SPORE-EVENT-005",       // EventEmittedNotInContract — Wave 1 new diagnostic, needs tuning
  "SPORE-EFFECT-004",      // NonCanonicalEffectName — Wave 2 added pii.write alias; examples updated separately
  "SPORE-STDLIB-001",      // StdlibEffectNotDeclared — Phase 18H new diagnostic; CEC examples updated separately
  "SPORE-STDLIB-002",      // UnknownEffectfulStdlibCall — #153 fail-closed sibling of -001; CEC examples use unregistered effectful methods pedagogically
]);

// ── Pipeline ──────────────────────────────────────────────────────────────────
function runPipeline(source, filePath) {
  const parsed = parseProgram(source, filePath);
  const symbolResult = resolveSymbols(parsed.ast);
  const typeResult = checkTypes(parsed.ast);
  const valueStateResult = checkValueStates(parsed.ast);
  // checkEffects(flows, ast) — returns readonly EffectCheckResult[]
  const effectResults = checkEffects(parsed.flows, parsed.ast);
  // verifyGovernance(ast, flows, effectResults, profile)
  // Use "dev" profile — examples may omit intent/governance for pedagogical focus.
  // "production" emits SPORE-GOV-010 as error for secure flows without intent,
  // which would cause false failures in many well-formed examples.
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

// Filter diagnostics through Phase 1 suppression for stable example assertions
function filteredDiags(diags) {
  return diags.filter((d) => !SUPPRESS.has(d.code));
}

// ── Discovery ─────────────────────────────────────────────────────────────────
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

// ── Header parser ─────────────────────────────────────────────────────────────

/**
 * Read test_status from the /// header of a .spore file.
 * Returns "stable" | "draft" (default: "draft").
 */
function parseTestStatus(source) {
  const match = source.match(/^\/\/\/\s*test_status:\s*(\w+)/m);
  return match ? match[1] : "draft";
}

function loadExamples() {
  if (!existsSync(EXAMPLES_DIR)) return [];
  return walkDir(EXAMPLES_DIR).map((llnFile) => {
    // Strip UTF-8 BOM if present (Windows sometimes adds it)
    const raw = readFileSync(llnFile, "utf8");
    const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;

    const diagFile = llnFile.replace(/example\.spore$/, "expected.diagnostics.txt");
    let rawExpected = "none";
    try { rawExpected = readFileSync(diagFile, "utf8").trim(); } catch { /* not present */ }

    // Parse expected: "none" | list of SPORE-* codes
    const lines = rawExpected.split("\n").map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));
    const expectNone = lines.length === 0 || lines[0].toLowerCase() === "none";
    const expectedCodes = expectNone ? []
      : lines.filter((l) => /^SPORE-[A-Z]+-\d+/.test(l)).map((l) => l.split(/\s/)[0]);

    // Human-readable name: "Level-1-Basics/001-pure-flow"
    const normalized = llnFile.replace(/\\/g, "/");
    const marker = "/Examples/";
    const afterExamples = normalized.slice(normalized.indexOf(marker) + marker.length);
    const name = afterExamples.replace("/example.spore", "");

    // Read test_status header: "stable" | "draft"
    const testStatus = parseTestStatus(source);

    return { name, file: llnFile, source, expectNone, expectedCodes, testStatus };
  });
}

const ALL = loadExamples();
const STABLE_EXAMPLES = ALL.filter((e) => e.testStatus === "stable");
const DRAFT_EXAMPLES  = ALL.filter((e) => e.testStatus !== "stable");

// ── Stable examples: fully asserted ──────────────────────────────────────────
describe("CEC integration — stable examples", () => {
  if (STABLE_EXAMPLES.length === 0) {
    it("(no stable examples found — add `/// test_status: stable` to an example.spore)", () => {
      // infrastructure is wired, just no stable examples yet
    });
  }

  for (const ex of STABLE_EXAMPLES) {
    it(ex.name, () => {
      const allDiags = runPipeline(ex.source, ex.file);

      if (ex.expectNone) {
        // Apply Phase 1 suppression for "expected none" examples: suppress
        // known-benign noise codes so intro-level examples still pass.
        const diags = filteredDiags(allDiags);
        const errors = diags.filter((d) => d.severity === "error");
        assert.equal(
          errors.length,
          0,
          `${ex.name}: expected no errors, got: ${errors.map((d) => d.code).join(", ")}`,
        );
      } else {
        // For examples that expect specific codes, use all diagnostics (no
        // suppression) so the expected error codes remain visible.
        for (const expectedCode of ex.expectedCodes) {
          const found = allDiags.some((d) => d.code === expectedCode);
          assert.ok(
            found,
            `${ex.name}: expected diagnostic ${expectedCode}, got: ${allDiags.map((d) => d.code).join(", ")}`,
          );
        }
      }
    });
  }
});

// ── Draft examples: compile-only ─────────────────────────────────────────────
describe("CEC integration — draft examples (compile-only)", () => {
  for (const ex of DRAFT_EXAMPLES) {
    it(`${ex.name} (compile-only)`, () => {
      assert.doesNotThrow(
        () => runPipeline(ex.source, ex.file),
        `${ex.name}: pipeline threw unexpectedly`,
      );
    });
  }
});
