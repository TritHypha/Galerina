// =============================================================================
// Phase R6 + R7B — RuntimeManifest drives execution & Stage B report
//
// R6: RuntimeManifest fast-path — when manifest.verified === true,
//     executeFlow uses manifest.allowedEffects as the pre-approved list.
//
// R7B: StageBReport — generateStageBReport correctly classifies milestones.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeFlow,
  parseProgram,
  verifyRuntimeManifestHash,
  generateStageBReport,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePureFlowAst(flowName = "add") {
  const source = `pure flow ${flowName}(a: Int, b: Int) -> Int { return a }`;
  return parseProgram(source, "test.spore").ast;
}

function makeManifest(overrides = {}) {
  return {
    schemaVersion: "lln.runtime.manifest.v1",
    flow: "add",
    qualifier: "pure",
    requiresAudit: false,
    deniesRemote: true,
    allowedEffects: ["database.read"],
    requiredContext: [],
    computeTarget: "cpu",
    governanceFlagsMask: 1,
    proofObligations: [],
    policyPurposes: [],
    verified: true,
    arenaLimitMb: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// describe("R6: RuntimeManifest drives execution")
// ---------------------------------------------------------------------------

describe("R6: RuntimeManifest drives execution", () => {

  it("R6A: executeFlow with verified manifest pre-seeds allowedEffects into effectsObserved", async () => {
    const ast = makePureFlowAst("add");
    const manifest = makeManifest({ allowedEffects: ["database.read", "audit.write"] });
    const args = new Map([
      ["a", { __tag: "int", value: 3 }],
      ["b", { __tag: "int", value: 4 }],
    ]);

    const result = await executeFlow(
      "add",
      args,
      ast,
      undefined,  // knownFlows
      undefined,  // enforcer
      undefined,  // capabilityHost
      undefined,  // runtimeOptions
      undefined,  // executionPlans
      manifest,   // manifest — R6A fast-path
    );

    // The manifest's allowedEffects must appear in the observed effects
    assert.ok(
      result.effectsObserved.includes("database.read"),
      `Expected 'database.read' in effectsObserved; got: [${result.effectsObserved.join(", ")}]`,
    );
    assert.ok(
      result.effectsObserved.includes("audit.write"),
      `Expected 'audit.write' in effectsObserved; got: [${result.effectsObserved.join(", ")}]`,
    );
  });

  it("R6B: verifyRuntimeManifestHash returns true for verified manifest with flags > 0", () => {
    const manifest = makeManifest({ verified: true, governanceFlagsMask: 3 });
    const result = verifyRuntimeManifestHash(manifest, "sha256:abc123");
    assert.equal(result, true, "Should return true for verified manifest with governanceFlagsMask > 0");
  });

  it("R6B: verifyRuntimeManifestHash returns false for unverified manifest", () => {
    const manifest = makeManifest({ verified: false, governanceFlagsMask: 3 });
    const result = verifyRuntimeManifestHash(manifest, "sha256:abc123");
    assert.equal(result, false, "Should return false when manifest.verified is false");
  });

  it("R6B: verifyRuntimeManifestHash returns false when governanceFlagsMask is 0", () => {
    const manifest = makeManifest({ verified: true, governanceFlagsMask: 0 });
    const result = verifyRuntimeManifestHash(manifest, "sha256:abc123");
    assert.equal(result, false, "Should return false when governanceFlagsMask is 0");
  });

  it("R6A: executeFlow without manifest does not pre-seed effectsObserved", async () => {
    const ast = makePureFlowAst("add");
    const args = new Map([
      ["a", { __tag: "int", value: 1 }],
      ["b", { __tag: "int", value: 2 }],
    ]);

    const result = await executeFlow("add", args, ast);

    // Without a manifest, database.read should NOT be in effectsObserved
    assert.ok(
      !result.effectsObserved.includes("database.read"),
      `Expected 'database.read' NOT in effectsObserved; got: [${result.effectsObserved.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// describe("R7B: Stage B report")
// ---------------------------------------------------------------------------

describe("R7B: Stage B report", () => {

  it("generateStageBReport: all 4 milestones listed when no input provided", () => {
    const report = generateStageBReport([]);
    assert.equal(report.milestones.length, 4, "Should list all 4 Stage B milestones");
    const files = report.milestones.map((m) => m.file);
    assert.ok(files.includes("lexer.spore"), "Should include lexer.spore");
    assert.ok(files.includes("parser.spore"), "Should include parser.spore");
    assert.ok(files.includes("type-checker.spore"), "Should include type-checker.spore");
    assert.ok(files.includes("compiler.capabilities.spore"), "Should include compiler.capabilities.spore");
  });

  it("generateStageBReport: milestone with 0 errors has parityStatus 'complete'", () => {
    const report = generateStageBReport([
      { name: "lexer", file: "lexer.spore", errors: 0 },
    ]);
    const lexer = report.milestones.find((m) => m.file === "lexer.spore");
    assert.ok(lexer !== undefined, "lexer.spore milestone should exist");
    assert.equal(lexer.parityStatus, "complete", "0 errors → parityStatus 'complete'");
    assert.equal(lexer.parseErrors, 0, "parseErrors should be 0");
  });

  it("generateStageBReport: milestone with errors has parityStatus 'pending' or 'partial'", () => {
    const report = generateStageBReport([
      { name: "parser", file: "parser.spore", errors: 10 },
    ]);
    const parser = report.milestones.find((m) => m.file === "parser.spore");
    assert.ok(parser !== undefined, "parser.spore milestone should exist");
    assert.equal(parser.parityStatus, "pending", "10 errors → parityStatus 'pending'");
  });

  it("generateStageBReport: overallStatus 'complete' when all milestones have 0 errors", () => {
    const report = generateStageBReport([
      { name: "lexer",                file: "lexer.spore",                  errors: 0 },
      { name: "parser",               file: "parser.spore",                 errors: 0 },
      { name: "type-checker",         file: "type-checker.spore",           errors: 0 },
      { name: "compiler.capabilities",file: "compiler.capabilities.spore",  errors: 0 },
    ]);
    assert.equal(report.overallStatus, "complete", "All 0 errors → overallStatus 'complete'");
  });

  it("generateStageBReport: overallStatus 'pending' when no milestones parsed", () => {
    const report = generateStageBReport([]);
    assert.equal(report.overallStatus, "pending", "No parsed milestones → overallStatus 'pending'");
  });
});
