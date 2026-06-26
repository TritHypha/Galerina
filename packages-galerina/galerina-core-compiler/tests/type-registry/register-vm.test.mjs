// =============================================================================
// Phase 23C — Register VM Bytecode Tests
//
// Tests for:
//   emitBytecode stub
//   RegisterBytecodeModule schema version
//   RegisterInstruction shape
//   RegisterFunction isPure detection
//   entryPoints computation
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emitBytecode,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// emitBytecode: module schema
// ---------------------------------------------------------------------------

describe("emitBytecode: module schema and structure", () => {
  it("returns a module with schemaVersion spore.bytecode.v1", () => {
    const mod = emitBytecode([]);
    assert.equal(mod.schemaVersion, "spore.bytecode.v1");
    assert.ok(Array.isArray(mod.functions), "functions must be an array");
    assert.ok(Array.isArray(mod.entryPoints), "entryPoints must be an array");
  });

  it("produces one RegisterFunction per GIR flow", () => {
    const mod = emitBytecode([
      { name: "computeScore", qualifier: "pure",    effects: { declared: [] } },
      { name: "fetchUser",    qualifier: "guarded",  effects: { declared: ["database.read"] } },
    ]);
    assert.equal(mod.functions.length, 2);
    assert.equal(mod.functions[0].name, "computeScore");
    assert.equal(mod.functions[1].name, "fetchUser");
  });

  it("marks pure flows with isPure: true", () => {
    const mod = emitBytecode([
      { name: "pureOp",  qualifier: "pure", effects: { declared: [] } },
      { name: "impureOp", qualifier: "flow", effects: { declared: ["database.write"] } },
    ]);
    const pureFunc = mod.functions.find((f) => f.name === "pureOp");
    const impureFunc = mod.functions.find((f) => f.name === "impureOp");
    assert.equal(pureFunc?.isPure, true,  "pure flow must have isPure: true");
    assert.equal(impureFunc?.isPure, false, "effectful flow must have isPure: false");
  });

  it("stub functions contain exactly one UNREACHABLE instruction", () => {
    const mod = emitBytecode([
      { name: "stubFlow", qualifier: "flow", effects: { declared: [] } },
    ]);
    const fn = mod.functions[0];
    assert.equal(fn.instructions.length, 1);
    assert.equal(fn.instructions[0].op, "UNREACHABLE");
  });

  it("emitBytecode with empty input returns empty functions and entryPoints", () => {
    const mod = emitBytecode([]);
    assert.equal(mod.functions.length, 0);
    assert.equal(mod.entryPoints.length, 0);
  });
});
