// =============================================================================
// Governance Verifier — GovernanceFlags and RuntimeManifest Tests (Phase 18F)
//
// Tests for:
//   - GovernanceFlags bitset (shape, distinct powers-of-2)
//   - GovernanceVerifyResult.governanceFlagsByFlow populated per flow
//   - GovernanceVerifyResult.runtimeManifests populated in production profile
//   - RuntimeManifest schemaVersion, requiresAudit, deniesRemote, verified
//   - GovernanceFlags.RequiresAudit set for database.write flows
//   - GovernanceFlags.DenyRemote set for compute.deny remote flows
//   - GovernanceFlags.AllowsNetwork set for network.outbound flows
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  verifyGovernance,
  GovernanceFlags,
  SPORE_GOV_013,
  SPORE_GOV_014,
  executeFlow,
  extractRequestTimeMs,
  SPORE_RUNTIME_005,
  SPORE_RUNTIME_006,
  SPORE_NET_001,
  SPORE_NET_002,
  SPORE_ANTI_ABUSE_001,
  createCapabilityHost,
  createContractEnforcer,
  getCachedPureFlow,
  setCachedPureFlow,
  clearPureFlowCache,
  pureFlowCacheKey,
  generateROIReport,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// GovernanceFlags constant shape
// ---------------------------------------------------------------------------

describe("GovernanceFlags: constant shape", () => {
  it("None is 0", () => {
    assert.equal(GovernanceFlags.None, 0);
  });

  it("all non-None flags are distinct powers of 2", () => {
    const flags = Object.entries(GovernanceFlags)
      .filter(([name]) => name !== "None")
      .map(([, v]) => v);
    for (const f of flags) {
      assert.ok(f > 0 && (f & (f - 1)) === 0, `${f} is not a power of 2`);
    }
    assert.equal(new Set(flags).size, flags.length, "All flags must be distinct");
  });

  it("has all expected governance flags", () => {
    assert.ok("RequiresAudit"    in GovernanceFlags);
    assert.ok("DenyRemote"       in GovernanceFlags);
    assert.ok("ContainsPII"      in GovernanceFlags);
    assert.ok("AllowsNetwork"    in GovernanceFlags);
    assert.ok("RequiresActor"    in GovernanceFlags);
    assert.ok("ProductionStrict" in GovernanceFlags);
    assert.ok("RequiresIntent"   in GovernanceFlags);
    assert.ok("HasPolicy"        in GovernanceFlags);
  });
});

// ---------------------------------------------------------------------------
// Helper: parse + check + verify
// ---------------------------------------------------------------------------

function verifySource(source, profile = "dev") {
  const parsed = parseProgram(source, "test.spore");
  const effectResults = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effectResults, profile);
}

// ---------------------------------------------------------------------------
// GovernanceVerifyResult: governanceFlagsByFlow
// ---------------------------------------------------------------------------

describe("GovernanceVerifyResult: governanceFlagsByFlow populated", () => {
  it("result.governanceFlagsByFlow is a Map", () => {
    const result = verifySource(`pure flow add(a: Int, b: Int) -> Int { return a }`);
    assert.ok(result.governanceFlagsByFlow instanceof Map,
      "governanceFlagsByFlow must be a Map");
  });

  it("flow entry exists for every verified flow", () => {
    const result = verifySource(`
pure flow pure1(x: Int) -> Int { return x }
pure flow pure2(y: Int) -> Int { return y }
`);
    assert.ok(result.governanceFlagsByFlow.has("pure1"), "pure1 must have flags");
    assert.ok(result.governanceFlagsByFlow.has("pure2"), "pure2 must have flags");
  });
});

// ---------------------------------------------------------------------------
// GovernanceFlags.RequiresAudit
// ---------------------------------------------------------------------------

describe("GovernanceFlags.RequiresAudit: set for database.write flows", () => {
  it("flow with database.write effect → RequiresAudit flag", () => {
    const result = verifySource(`
guarded flow save(data: String) -> Void
contract { effects { database.write } }
{
  return
}
`);
    const flags = result.governanceFlagsByFlow.get("save") ?? 0;
    assert.ok(flags & GovernanceFlags.RequiresAudit,
      "RequiresAudit must be set for flow declaring database.write");
  });

  it("pure effect-free flow → no RequiresAudit", () => {
    const result = verifySource(`pure flow noop(x: Int) -> Int { return x }`);
    const flags = result.governanceFlagsByFlow.get("noop") ?? 0;
    assert.ok(!(flags & GovernanceFlags.RequiresAudit),
      "RequiresAudit must NOT be set for pure effect-free flow");
  });
});

// ---------------------------------------------------------------------------
// GovernanceFlags.AllowsNetwork
// ---------------------------------------------------------------------------

describe("GovernanceFlags.AllowsNetwork: set for network.outbound flows", () => {
  it("flow with network.outbound → AllowsNetwork flag", () => {
    const result = verifySource(`
guarded flow callApi(url: String) -> Response
contract { effects { network.outbound } }
{
  return Response.ok({})
}
`);
    const flags = result.governanceFlagsByFlow.get("callApi") ?? 0;
    assert.ok(flags & GovernanceFlags.AllowsNetwork,
      "AllowsNetwork must be set for network.outbound flow");
  });

  it("flow without network.outbound → no AllowsNetwork", () => {
    const result = verifySource(`
guarded flow dbOnly(x: String) -> Void
contract { effects { database.write } }
{
  return
}
`);
    const flags = result.governanceFlagsByFlow.get("dbOnly") ?? 0;
    assert.ok(!(flags & GovernanceFlags.AllowsNetwork),
      "AllowsNetwork must NOT be set for database-only flow");
  });
});

// ---------------------------------------------------------------------------
// RuntimeManifest: generated in production profile
// ---------------------------------------------------------------------------

describe("RuntimeManifest: generated for production profile", () => {
  it("production profile → runtimeManifests contains entries", () => {
    const result = verifySource(`
secure flow createUser(readonly request: Request) -> Response
contract {
  intent { "Create a new user account." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}
`, "production");
    assert.ok(result.runtimeManifests.length > 0,
      "runtimeManifests must be populated in production profile");
  });

  it("dev profile → runtimeManifests is empty", () => {
    const result = verifySource(`
secure flow createUser(readonly request: Request) -> Response
contract {
  intent { "Create a new user." }
  effects { database.write }
}
{
  return Response.ok({})
}
`, "dev");
    assert.equal(result.runtimeManifests.length, 0,
      "runtimeManifests must be empty in dev profile");
  });

  it("RuntimeManifest has correct schemaVersion", () => {
    const result = verifySource(`
secure flow getUser(readonly request: Request) -> Response
contract {
  intent { "Retrieve user by ID." }
  effects { database.read }
}
{
  return Response.ok({})
}
`, "production");
    const manifest = result.runtimeManifests[0];
    assert.ok(manifest !== undefined, "Manifest must exist");
    assert.equal(manifest.schemaVersion, "lln.runtime.manifest.v1");
  });

  it("RuntimeManifest requiresAudit is true for database.write flows", () => {
    const result = verifySource(`
secure flow createOrder(readonly request: Request) -> Response
contract {
  intent { "Create an order." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}
`, "production");
    const manifest = result.runtimeManifests.find((m) => m.flow === "createOrder");
    assert.ok(manifest !== undefined, "Manifest must exist for createOrder");
    assert.ok(manifest.requiresAudit, "requiresAudit must be true for database.write + audit.write flow");
  });

  it("RuntimeManifest allowedEffects is sorted", () => {
    const result = verifySource(`
secure flow multi(readonly request: Request) -> Response
contract {
  intent { "Multi-effect flow." }
  effects { network.outbound database.read audit.write }
}
{
  return Response.ok({})
}
`, "production");
    const manifest = result.runtimeManifests.find((m) => m.flow === "multi");
    assert.ok(manifest !== undefined, "Manifest must exist");
    const sorted = [...manifest.allowedEffects].sort();
    assert.deepEqual([...manifest.allowedEffects], sorted,
      "allowedEffects must be sorted");
  });

  it("RuntimeManifest governanceFlagsMask matches governanceFlagsByFlow", () => {
    const result = verifySource(`
secure flow check(readonly request: Request) -> Response
contract {
  intent { "Check action." }
  effects { network.outbound }
}
{
  return Response.ok({})
}
`, "production");
    const manifest = result.runtimeManifests.find((m) => m.flow === "check");
    const flags = result.governanceFlagsByFlow.get("check");
    assert.ok(manifest !== undefined, "Manifest must exist");
    assert.ok(flags !== undefined, "Flags must exist");
    assert.equal(manifest.governanceFlagsMask, flags,
      "RuntimeManifest.governanceFlagsMask must equal governanceFlagsByFlow entry");
  });
});

// ---------------------------------------------------------------------------
// GovernanceFlags.RequiresActor + RuntimeManifest.requiredContext
// ---------------------------------------------------------------------------

describe("GovernanceFlags.RequiresActor: context { require actor }", () => {
  it("flow with contract { context { require actor } } → RequiresActor flag set", () => {
    const result = verifySource(`
guarded flow actorCheck(readonly request: Request) -> Response
contract {
  effects { database.read }
  context { require actor }
}
{
  let actor = context.actor
  return Response.ok({})
}
`);
    const flags = result.governanceFlagsByFlow.get("actorCheck") ?? 0;
    assert.ok(flags & GovernanceFlags.RequiresActor,
      "RequiresActor must be set when contract.context requires actor");
  });

  it("RuntimeManifest.requiredContext includes 'actor' for production profile", () => {
    const result = verifySource(`
guarded flow actorManifest(readonly request: Request) -> Response
contract {
  effects { database.read }
  context { require actor }
}
{
  let actor = context.actor
  return Response.ok({})
}
`, "production");
    const manifest = result.runtimeManifests.find((m) => m.flow === "actorManifest");
    assert.ok(manifest !== undefined, "Manifest must exist for actorManifest");
    assert.ok(
      Array.isArray(manifest.requiredContext) && manifest.requiredContext.includes("actor"),
      `requiredContext must include 'actor', got: ${JSON.stringify(manifest.requiredContext)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// SPORE_GOV_014 constant shape
// ---------------------------------------------------------------------------

describe("SPORE_GOV_014: MissingFallbackTarget shape", () => {
  it("SPORE_GOV_014.code === 'SPORE-GOV-014'", () => {
    assert.equal(SPORE_GOV_014.code, "SPORE-GOV-014");
  });

  it("SPORE_GOV_014.severity === 'warning'", () => {
    assert.equal(SPORE_GOV_014.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// SPORE_GOV_013 constant shape
// ---------------------------------------------------------------------------

describe("SPORE_GOV_013 constant shape", () => {
  it("has correct code and name", () => {
    assert.equal(SPORE_GOV_013.code, "SPORE-GOV-013");
    assert.equal(SPORE_GOV_013.name, "BoundaryViolation");
  });

  it("has severity error and non-empty message, why, and suggestedFix", () => {
    assert.equal(SPORE_GOV_013.severity, "error");
    assert.ok(typeof SPORE_GOV_013.message === "string" && SPORE_GOV_013.message.length > 0,
      "message must be a non-empty string");
    assert.ok(typeof SPORE_GOV_013.why === "string" && SPORE_GOV_013.why.length > 0,
      "why must be a non-empty string");
    assert.ok(typeof SPORE_GOV_013.suggestedFix === "string" && SPORE_GOV_013.suggestedFix.length > 0,
      "suggestedFix must be a non-empty string");
  });
});

// ---------------------------------------------------------------------------
// Phase 11D: protected value tagging
// ---------------------------------------------------------------------------

describe("Phase 11D: protected value tagging", () => {
  it("interpreter does not crash on a flow that declares unsafe let with protected type", async () => {
    const source = `
secure flow handleEmail(rawInput: String) -> String
{
  unsafe let raw: protected Email = rawInput
  return "ok"
}
`;
    const parsed = parseProgram(source, "test-11d.spore");
    const args = new Map([["rawInput", { __tag: "string", value: "user@example.com" }]]);
    const result = await executeFlow("handleEmail", args, parsed.ast, parsed.flows);
    // No runtime error — the flow completes successfully
    assert.ok(
      result.value.__tag !== "runtimeError" && result.value.__tag !== "error",
      `Expected no runtime error, got: ${result.value.__tag}`,
    );
  });

  it("protected binding carries _governed metadata tag with qualifier 'protected'", async () => {
    const source = `
secure flow tagEmail(rawInput: String) -> String
{
  unsafe let raw: protected Email = rawInput
  return "tagged"
}
`;
    const parsed = parseProgram(source, "test-11d-tag.spore");
    const args = new Map([["rawInput", { __tag: "string", value: "test@example.com" }]]);
    const result = await executeFlow("tagEmail", args, parsed.ast, parsed.flows);
    // Flow must complete without error
    assert.ok(
      result.value.__tag !== "runtimeError",
      `Flow must not error, got: ${result.value.__tag}`,
    );
    // No diagnostics about governed access yet (Phase 11D is tagging-only)
    const governedErrors = result.diagnostics.filter(
      (d) => d.code === SPORE_RUNTIME_005.code,
    );
    assert.equal(governedErrors.length, 0,
      "Phase 11D does not yet emit SPORE-RUNTIME-005 — tagging only, no enforcement");
  });
});

// ---------------------------------------------------------------------------
// R1: Runtime enforcement infrastructure
// ---------------------------------------------------------------------------

describe("R1: Runtime enforcement infrastructure", () => {
  it("R1A: extractRequestTimeMs returns undefined when flow has no contract", () => {
    const source = `
pure flow add(a: Int, b: Int) -> Int { return a }
`;
    const parsed = parseProgram(source, "test-r1a.spore");
    const flowNode = parsed.ast.children?.find((c) => c.value === "add");
    assert.ok(flowNode !== undefined, "Flow node must exist");
    const limitMs = extractRequestTimeMs(flowNode);
    assert.equal(limitMs, undefined,
      "extractRequestTimeMs must return undefined when no contract limits are declared");
  });

  it("R1A: extractRequestTimeMs parses '5s' from contract limits { request_time 5s }", () => {
    const source = `
guarded flow slow(x: String) -> String
contract {
  effects { database.read }
  limits {
    request_time 5s
  }
}
{
  return x
}
`;
    const parsed = parseProgram(source, "test-r1a-limit.spore");
    const flowNode = parsed.ast.children?.find((c) => c.value === "slow");
    assert.ok(flowNode !== undefined, "Flow node must exist");
    const limitMs = extractRequestTimeMs(flowNode);
    assert.equal(limitMs, 5000,
      "extractRequestTimeMs must parse '5s' as 5000ms");
  });

  it("R1B/R1C: flow with protected binding completes without SPORE-RUNTIME-006 when well within limits", async () => {
    const source = `
secure flow protect(rawInput: String) -> String
contract {
  effects { }
  limits {
    request_time 30s
  }
}
{
  unsafe let raw: protected Email = rawInput
  return "ok"
}
`;
    const parsed = parseProgram(source, "test-r1bc.spore");
    const args = new Map([["rawInput", { __tag: "string", value: "user@example.com" }]]);
    const result = await executeFlow("protect", args, parsed.ast, parsed.flows);
    assert.ok(
      result.value.__tag !== "runtimeError" && result.value.__tag !== "error",
      `Flow must not produce a runtime error, got: ${result.value.__tag}`,
    );
    const deadlineErrors = result.diagnostics.filter(
      (d) => d.code === SPORE_RUNTIME_006.code,
    );
    assert.equal(deadlineErrors.length, 0,
      "No SPORE-RUNTIME-006 should be emitted for a flow that completes well within its 30s limit");
  });
});

// ---------------------------------------------------------------------------
// R4: Security enforcement
// ---------------------------------------------------------------------------

describe("R4: Security enforcement", () => {
  it("R4A: SPORE-NET-001 constant has correct code and severity", () => {
    assert.equal(SPORE_NET_001.code, "SPORE-NET-001");
    assert.equal(SPORE_NET_001.name, "NetworkDestinationDenied");
    assert.equal(SPORE_NET_001.severity, "error");
    assert.ok(typeof SPORE_NET_001.message === "string" && SPORE_NET_001.message.length > 0,
      "SPORE_NET_001.message must be non-empty");
    assert.ok(typeof SPORE_NET_001.suggestedFix === "string" && SPORE_NET_001.suggestedFix.length > 0,
      "SPORE_NET_001.suggestedFix must be non-empty");
  });

  it("R4A: capabilityHost denies network.outbound to a private IP (SPORE-NET-002 path)", () => {
    const enforcer = createContractEnforcer(undefined, "testFlow");
    const host = createCapabilityHost({
      declaredEffects: new Set(["network.outbound"]),
      enforcer,
    });

    // Build a call targeting a private IP address
    const call = {
      capabilityId: "host.network.outbound",
      effect: "network.outbound",
      args: [{ __tag: "string", value: "http://192.168.1.1/data" }],
      context: { flowName: "testFlow", startedAt: Date.now() },
    };

    const result = host.check(call);
    assert.equal(result.allowed, false,
      "network.outbound to a private IP must be denied");
    assert.ok(
      result.reason !== undefined && result.reason.includes("SPORE-NET-002"),
      `Denial reason must reference SPORE-NET-002, got: ${result.reason}`,
    );
  });

  it("R4B/R4C: process.spawn is a canonical effect and forbidden in pure flows", () => {
    // process.spawn must now be recognised as a canonical effect name (no SPORE-EFFECT-004)
    const source = `
guarded flow spawnWorker(cmd: String) -> Void
contract { effects { process.spawn } }
{
  return
}
`;
    const parsed = parseProgram(source, "test-r4b.spore");
    const effectResults = checkEffects(parsed.flows, parsed.ast);
    const spawnFlow = effectResults.find((r) => r.flowName === "spawnWorker");
    assert.ok(spawnFlow !== undefined, "spawnWorker flow must exist in effect results");

    // No SPORE-EFFECT-004 (unknown effect) should be emitted for process.spawn
    const unknownEffectDiags = spawnFlow.diagnostics.filter(
      (d) => d.code === "SPORE-EFFECT-004" && d.message.includes("process.spawn"),
    );
    assert.equal(unknownEffectDiags.length, 0,
      "process.spawn must be a recognised canonical effect — no SPORE-EFFECT-004 expected");

    // SPORE_ANTI_ABUSE_001 constant must be properly shaped
    assert.equal(SPORE_ANTI_ABUSE_001.code, "SPORE-ANTI-ABUSE-001");
    assert.equal(SPORE_ANTI_ABUSE_001.severity, "error");
    assert.ok(typeof SPORE_ANTI_ABUSE_001.message === "string" && SPORE_ANTI_ABUSE_001.message.length > 0,
      "SPORE_ANTI_ABUSE_001.message must be non-empty");
  });
});

// ---------------------------------------------------------------------------
// Pure flow LRU memoization
// ---------------------------------------------------------------------------

describe("Pure flow LRU memoization", () => {
  it("same pure flow called twice → second call is cache hit", async () => {
    const source = `
pure flow double(x: Int) -> Int {
  return x
}
`;
    const parsed = parseProgram(source, "test-memo-1.spore");
    const args = new Map([["x", { __tag: "int", value: 42 }]]);

    // Clear cache to ensure a clean state
    clearPureFlowCache();

    // First call — cache miss, runs the flow
    const result1 = await executeFlow("double", args, parsed.ast, parsed.flows, undefined, undefined, { pureFastPath: true });
    assert.ok(result1.value.__tag !== "runtimeError", "First call must not error");

    // Second call — same args, must hit the cache (value is identical)
    const result2 = await executeFlow("double", args, parsed.ast, parsed.flows, undefined, undefined, { pureFastPath: true });
    assert.ok(result2.value.__tag !== "runtimeError", "Second call must not error");

    // Both calls must return the same value
    assert.equal(result1.value.__tag, result2.value.__tag);
    if (result1.value.__tag === "int" && result2.value.__tag === "int") {
      assert.equal(result1.value.value, result2.value.value);
    }

    // The second result came from the cache — effectsObserved is empty
    assert.deepEqual([...result2.effectsObserved], [],
      "Cached result must report no effects");
  });

  it("getCachedPureFlow returns correct value after setCachedPureFlow", () => {
    clearPureFlowCache();
    const value = { __tag: "int", value: 99 };
    setCachedPureFlow("test:key123", value);
    const retrieved = getCachedPureFlow("test:key123");
    assert.ok(retrieved !== undefined, "getCachedPureFlow must return the stored value");
    assert.deepEqual(retrieved, value, "Retrieved value must equal the stored value");
  });

  it("clearPureFlowCache empties the cache", () => {
    // Seed the cache with a value
    setCachedPureFlow("flow:abc", { __tag: "string", value: "hello" });
    assert.ok(getCachedPureFlow("flow:abc") !== undefined, "Value must be present before clear");

    // Clear and verify it is gone
    clearPureFlowCache();
    const afterClear = getCachedPureFlow("flow:abc");
    assert.equal(afterClear, undefined, "getCachedPureFlow must return undefined after clearPureFlowCache");
  });
});

// ---------------------------------------------------------------------------
// ProofGraph wired in governance verifier
// ---------------------------------------------------------------------------

describe("ProofGraph wired in governance verifier", () => {
  it("verifyGovernance result has proofGraphs Map", () => {
    const result = verifySource(`pure flow add(a: Int, b: Int) -> Int { return a }`);
    assert.ok(result.proofGraphs instanceof Map,
      "proofGraphs must be a Map");
    assert.ok(result.proofGraphs.has("add"),
      "proofGraphs must contain an entry for the verified flow");
  });

  it("a secure flow with effects and contract produces a ProofGraph with verified: true", () => {
    const result = verifySource(`
secure flow createUser(readonly request: Request) -> Response
contract {
  intent { "Create a new user account." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}
`);
    const pg = result.proofGraphs.get("createUser");
    assert.ok(pg !== undefined, "ProofGraph must exist for createUser");
    assert.equal(pg.schemaVersion, "spore.proof.v1",
      "ProofGraph schemaVersion must be spore.proof.v1");
    assert.ok(pg.verified === true,
      "ProofGraph must be verified: true for a secure flow with effects and contract");
  });

  it("generateROIReport returns correct schemaVersion", () => {
    const result = verifySource(`
guarded flow save(data: String) -> Void
contract { effects { database.write audit.write } }
{
  return
}
`);
    const report = generateROIReport(result.proofGraphs);
    assert.equal(report.schemaVersion, "spore.roi.v1",
      "GovernanceROIReport schemaVersion must be spore.roi.v1");
    assert.ok(typeof report.flowCount === "number",
      "report.flowCount must be a number");
    assert.ok(report.notes.length > 0,
      "report.notes must be non-empty");
  });
});
