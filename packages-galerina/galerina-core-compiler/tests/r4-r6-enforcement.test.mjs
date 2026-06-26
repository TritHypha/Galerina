// =============================================================================
// R4+R6 complete: full enforcement
//
// R4: request_time limits, network_requests limits (hard deny), governed access
// R6: RuntimeManifest fast-path, fallback, requiresAudit enforcement
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeFlow,
  parseProgram,
  createCapabilityHost,
  createContractEnforcer,
  SPORE_VOID,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePureFlow(flowName = "doWork", body = "return 42") {
  const source = `pure flow ${flowName}() -> Int { ${body} }`;
  return parseProgram(source, "test.spore").ast;
}

function makeManifest(overrides = {}) {
  return {
    schemaVersion: "lln.runtime.manifest.v1",
    flow: "doWork",
    qualifier: "pure",
    requiresAudit: false,
    deniesRemote: false,
    allowedEffects: [],
    requiredContext: [],
    computeTarget: "cpu",
    governanceFlagsMask: 7,
    proofObligations: [],
    policyPurposes: [],
    verified: true,
    arenaLimitMb: undefined,
    ...overrides,
  };
}

const DUMMY_ENFORCER = createContractEnforcer(undefined, "testFlow");

const DUMMY_CONTEXT = {
  flowName: "testFlow",
  startedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Test 1: request_time 0.001s triggers SPORE-RUNTIME-006
// ---------------------------------------------------------------------------

describe("R4+R6 complete: full enforcement", () => {

  it("1. Flow with very short request_time limit reports SPORE-RUNTIME-006", async () => {
    // Use the correct parser format: contract block declared outside flow body.
    // A 0ms limit guarantees the diagnostic fires since any execution takes > 0ms.
    const source = `
pure flow zeroTimeout() -> Int
contract {
  limits {
    request_time 0ms
  }
}
{
  return 99
}
`;
    const parsed = parseProgram(source, "test.spore");

    // Delay 5ms so we definitely exceed the 0ms limit (even under load)
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await executeFlow("zeroTimeout", new Map(), parsed.ast, parsed.flows);
    const has006 = result.diagnostics.some((d) => d.code === "SPORE-RUNTIME-006");
    assert.ok(has006, `Expected SPORE-RUNTIME-006 in diagnostics; got: ${JSON.stringify(result.diagnostics)}`);
  });

  // -------------------------------------------------------------------------
  // Test 2: network_requests: 0 limit + network call gets denied
  // -------------------------------------------------------------------------

  it("2. CapabilityHost with networkCallLimit 0 denies network call with SPORE-RUNTIME-006", async () => {
    const host = createCapabilityHost({
      declaredEffects: new Set(["network.outbound"]),
      enforcer: DUMMY_ENFORCER,
      networkCallLimit: 0,
    });

    const call = {
      capabilityId: "host.network.outbound",
      effect: "network.outbound",
      args: [{ __tag: "string", value: "https://example.com/api" }],
      context: DUMMY_CONTEXT,
    };

    let implCalled = false;
    const result = await host.execute(call, async (_args) => {
      implCalled = true;
      return SPORE_VOID;
    });

    // The host should deny this call because networkCallLimit is 0 and we
    // increment to 1 before checking (1 > 0 → denied)
    assert.equal(result.value.__tag, "err", "Expected err value when network limit exceeded");
    assert.equal(implCalled, false, "impl should NOT be called when rate limit exceeded");
    const reason = result.value.error?.value ?? "";
    assert.ok(
      reason.includes("SPORE-RUNTIME-006"),
      `Expected SPORE-RUNTIME-006 in denial reason; got: "${reason}"`,
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: executeFlow with verified manifest uses manifest.allowedEffects
  // -------------------------------------------------------------------------

  it("3. executeFlow with verified manifest pre-seeds allowedEffects into effectsObserved", async () => {
    const ast = makePureFlow("doWork", "return 1");
    const manifest = makeManifest({
      allowedEffects: ["database.read", "network.outbound"],
    });

    const result = await executeFlow(
      "doWork",
      new Map(),
      ast,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      manifest,
    );

    assert.ok(
      result.effectsObserved.includes("database.read"),
      `Expected 'database.read' in effectsObserved; got [${result.effectsObserved.join(", ")}]`,
    );
    assert.ok(
      result.effectsObserved.includes("network.outbound"),
      `Expected 'network.outbound' in effectsObserved; got [${result.effectsObserved.join(", ")}]`,
    );
    // Manifest metadata should appear in audit record
    assert.equal(result.audit.manifestVerified, true, "audit.manifestVerified should be true");
    assert.equal(result.audit.manifestFlow, "doWork", "audit.manifestFlow should match manifest.flow");
    assert.equal(result.audit.manifestGovernanceFlagsMask, 7, "audit.manifestGovernanceFlagsMask should match");
  });

  // -------------------------------------------------------------------------
  // Test 4: executeFlow with manifest.verified = false falls back to contract checking
  // -------------------------------------------------------------------------

  it("4. executeFlow with manifest.verified = false does NOT pre-seed effectsObserved", async () => {
    const ast = makePureFlow("doWork", "return 2");
    const manifest = makeManifest({
      verified: false,
      allowedEffects: ["database.read"],
    });

    const result = await executeFlow(
      "doWork",
      new Map(),
      ast,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      manifest,
    );

    // With verified=false, the allowedEffects should NOT be pre-seeded
    assert.ok(
      !result.effectsObserved.includes("database.read"),
      `Expected 'database.read' NOT in effectsObserved when manifest.verified=false; got [${result.effectsObserved.join(", ")}]`,
    );
    // Audit record should NOT have manifest fields when not verified
    assert.equal(result.audit.manifestVerified, undefined, "audit.manifestVerified should be absent for unverified manifest");
  });

  // -------------------------------------------------------------------------
  // Test 5: manifest.requiresAudit = true triggers audit requirement diagnostic
  // -------------------------------------------------------------------------

  it("5. manifest.requiresAudit = true triggers SPORE-RUNTIME-007 when AuditLog.write not called", async () => {
    const ast = makePureFlow("doWork", "return 3");
    const manifest = makeManifest({
      requiresAudit: true,
    });

    const result = await executeFlow(
      "doWork",
      new Map(),
      ast,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      manifest,
    );

    const has007 = result.diagnostics.some((d) => d.code === "SPORE-RUNTIME-007");
    assert.ok(
      has007,
      `Expected SPORE-RUNTIME-007 diagnostic when requiresAudit=true and AuditLog.write not called; got: ${JSON.stringify(result.diagnostics)}`,
    );
  });

});
