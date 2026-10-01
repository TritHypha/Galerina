// =============================================================================
// Phase 24 — Real WAT instruction bodies replacing "unreachable" stubs
//
// Tests:
//   24A. emitWATBody emits (local.get $p0) for pure flows with params
//   24A. emitWATBody emits (i32.const 0) for pure flows with no params
//   24A. emitWATBody emits unreachable for capabilityCall steps (both spellings)
//   24A. validateParam and capabilityCall steps: validateParam is a no-op
//   24B. buildWATModule refuses guessed identity/default for no-AST pure flows
//   24C. no-AST GIR pipeline: parseProgram → checkEffects → emitGIR → buildWATModuleFromGIR refuses
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  emitGIR,
  buildWATModule,
  buildWATModuleFromGIR,
  renderWAT,
  emitWATBody,
  STDLIB_CAPABILITY_MAP,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// 24A — emitWATBody: real WAT instructions from PassiveExecutionPlan patterns
// ---------------------------------------------------------------------------

describe("Phase 24A: emitWATBody produces real WAT instructions", () => {
  it("refuses (local.get $p0) identity for a pure flow with params and a return step", () => {
    const plan = { steps: [{ kind: "return" }] };
    assertBodyRefusal(() => emitWATBody(plan, 1), "emitWATBody");
  });

  it("refuses (local.get $p0) identity for multiple params", () => {
    const plan = { steps: [{ kind: "return" }] };
    assertBodyRefusal(() => emitWATBody(plan, 3), "emitWATBody");
  });

  it("refuses (i32.const 0) default for a pure flow with no params and a return step", () => {
    const plan = { steps: [{ kind: "return" }] };
    assertBodyRefusal(() => emitWATBody(plan, 0), "emitWATBody");
  });

  it("refuses (i32.const 0) default for response step with no params", () => {
    const plan = { steps: [{ kind: "response" }] };
    assertBodyRefusal(() => emitWATBody(plan, 0), "emitWATBody");
  });

  it("refuses local.get identity for response step with params", () => {
    const plan = { steps: [{ kind: "response" }] };
    assertBodyRefusal(() => emitWATBody(plan, 2), "emitWATBody");
  });

  it("validateParam + return still refuses guessed identity (J-R4 public helper)", () => {
    const plan = { steps: [{ kind: "validateParam" }, { kind: "return" }] };
    assertBodyRefusal(() => emitWATBody(plan, 1), "emitWATBody");
  });

  it("validate_param + return still refuses guessed identity (J-R4 public helper)", () => {
    const plan = { steps: [{ kind: "validate_param" }, { kind: "return" }] };
    assertBodyRefusal(() => emitWATBody(plan, 1), "emitWATBody");
  });

  it("emits unreachable for capabilityCall steps (camelCase)", () => {
    const plan = { steps: [{ kind: "capabilityCall" }, { kind: "return" }] };
    const body = emitWATBody(plan, 1);
    assert.ok(
      body.includes("unreachable"),
      `Expected unreachable for capabilityCall, got: ${body}`,
    );
  });

  it("emits unreachable for capability_call steps (snake_case)", () => {
    const plan = { steps: [{ kind: "capability_call" }, { kind: "return" }] };
    const body = emitWATBody(plan, 1);
    assert.ok(
      body.includes("unreachable"),
      `Expected unreachable for capability_call, got: ${body}`,
    );
  });

  it("emits unreachable when no return step exists", () => {
    const plan = { steps: [{ kind: "validateParam" }] };
    const body = emitWATBody(plan, 1);
    assert.ok(
      body.includes("unreachable"),
      `Expected unreachable for plan with no return, got: ${body}`,
    );
  });
});

function assertBodyRefusal(fn, flowName) {
  assert.throws(fn, (err) => {
    const msg = String(err && err.message ? err.message : err);
    assert.ok(msg.includes("FUNGI-WAT-BODY-001"), `expected FUNGI-WAT-BODY-001, got: ${msg}`);
    assert.ok(msg.includes(`pure flow '${flowName}'`), `expected named flow '${flowName}', got: ${msg}`);
    assert.ok(
      !msg.includes("(local.get $p0)") || msg.includes("refuses"),
      "refusal must not succeed with a guessed identity body",
    );
    return true;
  });
}

// ---------------------------------------------------------------------------
// 24B — buildWATModule no-AST identity/default is a compile-time refusal
// ---------------------------------------------------------------------------

describe("Phase 24B: buildWATModule refuses guessed identity/default without AST", () => {
  it("buildWATModule refuses local.get $p0 for a no-AST parametrised pure flow", () => {
    const watInput = {
      schemaVersion: "fungi.gir.v1",
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["identity"],
    };
    assertBodyRefusal(() => buildWATModule(watInput, STDLIB_CAPABILITY_MAP), "identity");
  });

  it("buildWATModule refuses (i32.const 0) body for a no-AST no-param pure flow", () => {
    const watInput = {
      schemaVersion: "fungi.gir.v1",
      flows: [{
        name: "zero",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: [],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["zero"],
    };
    assertBodyRefusal(() => buildWATModule(watInput, STDLIB_CAPABILITY_MAP), "zero");
  });

  it("buildWATModule refuses guessed identity when only paramTypes are supplied (no AST, no plan)", () => {
    const watInput = {
      schemaVersion: "fungi.gir.v1",
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
      }],
      entryPoints: ["identity"],
    };
    assertBodyRefusal(() => buildWATModule(watInput, STDLIB_CAPABILITY_MAP), "identity");
  });

  it("assembleWAT is not reached for a no-AST no-param pure flow (compile-time refusal)", () => {
    const watInput = {
      schemaVersion: "fungi.gir.v1",
      flows: [{
        name: "zero",
        qualifier: "pure",
        declaredEffects: [],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["zero"],
    };
    assertBodyRefusal(() => buildWATModule(watInput, STDLIB_CAPABILITY_MAP), "zero");
  });

  it("assembleWAT is not reached for a no-AST parametrised pure flow (compile-time refusal)", () => {
    const watInput = {
      schemaVersion: "fungi.gir.v1",
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["identity"],
    };
    assertBodyRefusal(() => buildWATModule(watInput, STDLIB_CAPABILITY_MAP), "identity");
  });
});

// ---------------------------------------------------------------------------
// 24C — Full pipeline: parseProgram → emitGIR → buildWATModuleFromGIR → assembleWAT
// ---------------------------------------------------------------------------

describe("Phase 24C: no-AST FromGIR pipeline refuses guessed identity/default", () => {
  it("pure flow add without AST refuses FUNGI-WAT-BODY-001 rather than guessed local.get", () => {
    const src = `pure flow add(a: Int, b: Int) -> Int { return a }`;
    const parsed = parseProgram(src, "t.fungi");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    assertBodyRefusal(() => buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP), "add");
  });

  it("pure flow greet without AST refuses FUNGI-WAT-BODY-001 rather than guessed local.get", () => {
    const src = `
pure flow greet(name: String) -> String
contract { intent { "Return a greeting." } effects {} }
{ return name }
`;
    const parsed = parseProgram(src, "greet.fungi");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    assertBodyRefusal(() => buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP), "greet");
  });

  it("pure flow with no params and no executionPlan keeps walker unreachable (not guessed i32.const 0)", () => {
    const src = `pure flow constant() -> Int { return 42 }`;
    const parsed = parseProgram(src, "t.fungi");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    assert.equal(gir.gir.flows[0]?.executionPlan, undefined);
    const wat = renderWAT(buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP));
    assert.ok(wat.includes("unreachable"), wat.slice(0, 400));
    assert.ok(!wat.includes("i32.const 0"), "must not guess a default i32.const 0 body");
    assert.ok(!wat.includes("local.get"), wat.slice(0, 400));
  });

  it("same no-param flow with AST lowers the real body instead of identity/default", () => {
    const src = `pure flow constant() -> Int { return 42 }`;
    const parsed = parseProgram(src, "t.fungi");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const wat = renderWAT(buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP, "wasm-standalone", parsed.ast));
    assert.ok(wat.includes("i32.const 42"), wat.slice(0, 400));
    assert.ok(!wat.includes("unreachable") || wat.includes(";;"), wat.slice(0, 400));
  });
});
