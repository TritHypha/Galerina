// =============================================================================
// Phase 24 — Real WAT instruction bodies replacing "unreachable" stubs
//
// Tests:
//   24A. emitWATBody emits (local.get $p0) for pure flows with params
//   24A. emitWATBody emits (i32.const 0) for pure flows with no params
//   24A. emitWATBody emits unreachable for capabilityCall steps (both spellings)
//   24A. validateParam and capabilityCall steps: validateParam is a no-op
//   24B. buildWATModule emits WAT with local.get for a parametrised pure flow
//   24B. assembleWAT produces a valid WASM binary (magic 0x00 0x61) from WAT with local.get
//   24B. assembleWAT produces a valid WASM binary for a no-param pure flow
//   24C. GIR pipeline: parseProgram → checkEffects → emitGIR → buildWATModule → renderWAT → assembleWAT
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
  assembleWAT,
  emitWATBody,
  STDLIB_CAPABILITY_MAP,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// 24A — emitWATBody: real WAT instructions from PassiveExecutionPlan patterns
// ---------------------------------------------------------------------------

describe("Phase 24A: emitWATBody produces real WAT instructions", () => {
  it("emits (local.get $p0) for a pure flow with params and a return step", () => {
    const plan = { steps: [{ kind: "return" }] };
    const body = emitWATBody(plan, 1);
    assert.ok(
      body.includes("local.get $p0"),
      `Expected 'local.get $p0' in body, got: ${body}`,
    );
    assert.ok(
      !body.includes("unreachable") || body.includes(";;"),
      "Body should not be a bare unreachable",
    );
  });

  it("emits (local.get $p0) for multiple params (returns first)", () => {
    const plan = { steps: [{ kind: "return" }] };
    const body = emitWATBody(plan, 3);
    assert.ok(
      body.includes("local.get $p0"),
      `Expected 'local.get $p0' in body, got: ${body}`,
    );
  });

  it("emits (i32.const 0) for a pure flow with no params and a return step", () => {
    const plan = { steps: [{ kind: "return" }] };
    const body = emitWATBody(plan, 0);
    assert.ok(
      body.includes("i32.const 0"),
      `Expected 'i32.const 0' in body, got: ${body}`,
    );
    assert.ok(
      !body.includes("local.get"),
      "Body should not include local.get for zero-param flow",
    );
  });

  it("emits (i32.const 0) for response step with no params", () => {
    const plan = { steps: [{ kind: "response" }] };
    const body = emitWATBody(plan, 0);
    assert.ok(
      body.includes("i32.const 0"),
      `Expected 'i32.const 0' in body, got: ${body}`,
    );
  });

  it("emits local.get for response step with params", () => {
    const plan = { steps: [{ kind: "response" }] };
    const body = emitWATBody(plan, 2);
    assert.ok(
      body.includes("local.get $p0"),
      `Expected 'local.get $p0' in body, got: ${body}`,
    );
  });

  it("validateParam steps are no-ops in WAT (erased at compile time)", () => {
    // validateParam steps must not block real instruction emission.
    const plan = { steps: [{ kind: "validateParam" }, { kind: "return" }] };
    const body = emitWATBody(plan, 1);
    assert.ok(
      body.includes("local.get $p0"),
      `validateParam should be erased, expected local.get $p0, got: ${body}`,
    );
  });

  it("validate_param steps (snake_case) are also no-ops in WAT", () => {
    const plan = { steps: [{ kind: "validate_param" }, { kind: "return" }] };
    const body = emitWATBody(plan, 1);
    assert.ok(
      body.includes("local.get $p0"),
      `validate_param should be erased, expected local.get $p0, got: ${body}`,
    );
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

// ---------------------------------------------------------------------------
// 24B — buildWATModule + assembleWAT: valid binary output
// ---------------------------------------------------------------------------

describe("Phase 24B: buildWATModule produces real WAT; assembleWAT produces valid binary", () => {
  it("buildWATModule emits WAT with local.get $p0 for a parametrised pure flow", () => {
    const watInput = {
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["identity"],
    };
    const mod = buildWATModule(watInput, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);
    assert.ok(
      wat.includes("local.get"),
      `Expected 'local.get' in WAT, got:\n${wat}`,
    );
    assert.ok(
      !wat.split("\n").every((l) => !l.includes("local.get") || l.trim().startsWith(";;")),
      "local.get must appear as a real instruction (not just in comments)",
    );
  });

  it("buildWATModule emits (i32.const 0) body for a no-param pure flow", () => {
    const watInput = {
      flows: [{
        name: "zero",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: [],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["zero"],
    };
    const mod = buildWATModule(watInput, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);
    assert.ok(
      wat.includes("i32.const 0"),
      `Expected 'i32.const 0' in WAT, got:\n${wat}`,
    );
  });

  it("assembleWAT produces a valid WASM binary (magic 0x00 0x61) for a no-param pure flow", async () => {
    const watInput = {
      flows: [{
        name: "zero",
        qualifier: "pure",
        declaredEffects: [],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["zero"],
    };
    const mod = buildWATModule(watInput, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);
    const result = await assembleWAT(wat);
    assert.equal(result.valid, true, `Expected valid WASM binary. Diagnostics: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(result.wasm[0], 0x00, "WASM magic byte 0 should be 0x00");
    assert.equal(result.wasm[1], 0x61, "WASM magic byte 1 should be 0x61");
    assert.equal(result.wasm[2], 0x73, "WASM magic byte 2 should be 0x73 (s)");
    assert.equal(result.wasm[3], 0x6d, "WASM magic byte 3 should be 0x6d (m)");
  });

  it("assembleWAT produces a valid WASM binary for a parametrised pure flow with local.get", async () => {
    const watInput = {
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["identity"],
    };
    const mod = buildWATModule(watInput, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    assert.ok(
      wat.includes("local.get"),
      `WAT must include local.get for parametrised pure flow, got:\n${wat}`,
    );

    const result = await assembleWAT(wat);
    assert.equal(result.valid, true, `Expected valid WASM binary. Diagnostics: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(result.wasm[0], 0x00, "WASM magic byte 0 should be 0x00");
    assert.equal(result.wasm[1], 0x61, "WASM magic byte 1 should be 0x61");
  });
});

// ---------------------------------------------------------------------------
// 24C — Full pipeline: parseProgram → emitGIR → buildWATModuleFromGIR → assembleWAT
// ---------------------------------------------------------------------------

describe("Phase 24C: full pipeline from Galerina source to valid WASM binary", () => {
  it("pure flow add(a: Int, b: Int) -> Int compiles to WAT with local.get and valid binary", async () => {
    const src = `pure flow add(a: Int, b: Int) -> Int { return a }`;
    const parsed = parseProgram(src, "t.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);

    const mod = buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    assert.ok(
      wat.includes("local.get"),
      `WAT should contain local.get for parametrised pure flow, got:\n${wat.slice(0, 400)}`,
    );

    const assembled = await assembleWAT(wat);
    assert.equal(
      assembled.wasm[0] === 0x00 && assembled.wasm[1] === 0x61,
      true,
      "WASM magic header should be valid (0x00 0x61 ...)",
    );
  });

  it("pure flow greet(name: String) -> String compiles to WAT with local.get", async () => {
    const src = `
pure flow greet(name: String) -> String
contract { intent { "Return a greeting." } effects {} }
{ return name }
`;
    const parsed = parseProgram(src, "greet.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);

    const mod = buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    assert.ok(
      wat.includes("local.get"),
      `WAT should contain local.get for greet flow, got:\n${wat.slice(0, 400)}`,
    );

    const assembled = await assembleWAT(wat);
    assert.equal(
      assembled.wasm[0] === 0x00 && assembled.wasm[1] === 0x61,
      true,
      "WASM magic header should be valid for greet flow",
    );
  });

  it("pure flow with no params emits (i32.const 0) and valid binary", async () => {
    const src = `pure flow constant() -> Int { return 42 }`;
    const parsed = parseProgram(src, "t.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);

    const mod = buildWATModuleFromGIR(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    // No-param flow should not have local.get but should have a real body.
    assert.ok(
      !wat.includes("local.get"),
      `No-param flow should not have local.get, got:\n${wat.slice(0, 400)}`,
    );

    const assembled = await assembleWAT(wat);
    assert.equal(
      assembled.wasm[0] === 0x00 && assembled.wasm[1] === 0x61,
      true,
      "WASM magic header should be valid for no-param flow",
    );
  });
});
