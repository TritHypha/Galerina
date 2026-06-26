/**
 * Phase 27 — WASM Execution: Galerina source → WAT → binary WASM → WebAssembly.instantiate
 *
 * This is the milestone test. For the first time, Galerina code executes inside
 * a real WebAssembly virtual machine rather than the JavaScript tree-walker.
 *
 * Pipeline tested:
 *   parseProgram() → checkEffects() → emitGIR() → buildWATModuleFromGIR(exportAllPure=true)
 *   → renderWAT() → assembleWAT() [wabt] → WebAssembly.instantiate() → result
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT, assembleWAT, executeWASMFlow,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helper: full pipeline compile + execute
// ---------------------------------------------------------------------------

async function compileAndRunWASM(src, flowName, args) {
  const prog = parseProgram(src, "test.spore");
  const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse: " + errs.map(d => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  const watModule = buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true);
  const wat = renderWAT(watModule);
  return executeWASMFlow(wat, flowName, args);
}

// ---------------------------------------------------------------------------
// Phase 27: basic arithmetic in WASM
// ---------------------------------------------------------------------------

describe("Phase 27: arithmetic flows in WASM", () => {
  it("add(2, 3) = 5 in WASM", async () => {
    const r = await compileAndRunWASM(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "add", [2, 3]
    );
    assert.equal(r.result, 5, `add(2,3) = ${r.result}`);
    assert.equal(r.error, undefined);
  });

  it("mul(6, 7) = 42 in WASM", async () => {
    const r = await compileAndRunWASM(
      "pure flow mul(a: Int, b: Int) -> Int contract { effects {} } { return a * b }",
      "mul", [6, 7]
    );
    assert.equal(r.result, 42);
    assert.equal(r.error, undefined);
  });

  it("sub(100, 58) = 42 in WASM", async () => {
    const r = await compileAndRunWASM(
      "pure flow sub(a: Int, b: Int) -> Int contract { effects {} } { return a - b }",
      "sub", [100, 58]
    );
    assert.equal(r.result, 42);
  });

  it("constant fortytwo() = 42 in WASM", async () => {
    const r = await compileAndRunWASM(
      "pure flow fortytwo() -> Int contract { effects {} } { return 42 }",
      "fortytwo", []
    );
    assert.equal(r.result, 42);
  });

  it("identity(99) = 99 in WASM", async () => {
    const r = await compileAndRunWASM(
      "pure flow identity(x: Int) -> Int contract { effects {} } { return x }",
      "identity", [99]
    );
    assert.equal(r.result, 99);
  });
});

// ---------------------------------------------------------------------------
// Phase 27: control flow in WASM
// ---------------------------------------------------------------------------

describe("Phase 27: control flow in WASM", () => {
  it("max(5, 3) = 5 via if/else in WASM", async () => {
    const src = "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }";
    const r1 = await compileAndRunWASM(src, "max", [5, 3]);
    const r2 = await compileAndRunWASM(src, "max", [2, 9]);
    assert.equal(r1.result, 5);
    assert.equal(r2.result, 9);
  });

  it("abs(x) via if/else in WASM", async () => {
    const src = "pure flow absVal(x: Int) -> Int contract { effects {} } { if x < 0 { return 0 - x } else { return x } }";
    const r1 = await compileAndRunWASM(src, "absVal", [-7]);
    const r2 = await compileAndRunWASM(src, "absVal", [7]);
    assert.equal(r1.result, 7);
    assert.equal(r2.result, 7);
  });

  it("sumTo(10) = 55 via while loop in WASM", async () => {
    const src = [
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n");
    const r = await compileAndRunWASM(src, "sumTo", [10]);
    assert.equal(r.result, 55);
    assert.equal(r.error, undefined);
  });

  it("sumTo(100) = 5050 via while loop in WASM", async () => {
    const src = [
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n");
    const r = await compileAndRunWASM(src, "sumTo", [100]);
    assert.equal(r.result, 5050);
  });

  it("let binding: product(4, 5) = 20 in WASM", async () => {
    const src = [
      "pure flow product(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ let result = a * b",
      "  return result }",
    ].join("\n");
    const r = await compileAndRunWASM(src, "product", [4, 5]);
    assert.equal(r.result, 20);
  });
});

// ---------------------------------------------------------------------------
// Phase 27: WASM binary properties
// ---------------------------------------------------------------------------

describe("Phase 27: WASM binary is valid spec-compliant binary", () => {
  it("binary has WASM magic bytes 0x00 0x61 0x73 0x6d", async () => {
    const prog = parseProgram(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "test.spore"
    );
    const fx = checkEffects(prog.flows, prog.ast);
    const { gir } = emitGIR(prog.ast, prog.flows, fx);
    const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
    const result = await assembleWAT(wat);
    assert.ok(result.valid, "binary must be valid");
    assert.equal(result.wasm[0], 0x00);
    assert.equal(result.wasm[1], 0x61);
    assert.equal(result.wasm[2], 0x73);
    assert.equal(result.wasm[3], 0x6d);
  });

  it("binary size is small (pure numeric flow)", async () => {
    const r = await compileAndRunWASM(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "add", [1, 1]
    );
    assert.ok(r.binaryBytes < 200, `binary should be < 200 bytes, got ${r.binaryBytes}`);
  });

  it("executeWASMFlow returns execMs (measured execution time)", async () => {
    const r = await compileAndRunWASM(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "add", [2, 3]
    );
    assert.ok(r.execMs >= 0, "execMs must be non-negative");
    assert.equal(r.result, 5);
  });
});

// ---------------------------------------------------------------------------
// Phase 27: arithmetic boundary correctness
// ---------------------------------------------------------------------------

describe("Phase 27: arithmetic boundary cases", () => {
  it("add(0, 0) = 0", async () => {
    const r = await compileAndRunWASM(
      "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
      "add", [0, 0]
    );
    assert.equal(r.result, 0);
  });

  it("sumTo(1) = 1", async () => {
    const src = [
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n { let result = result + i let i = i + 1 }",
      "  return result }",
    ].join("\n");
    const r = await compileAndRunWASM(src, "sumTo", [1]);
    assert.equal(r.result, 1);
  });

  it("max(7, 7) = 7 (equal values)", async () => {
    const r = await compileAndRunWASM(
      "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }",
      "max", [7, 7]
    );
    assert.equal(r.result, 7);
  });
});
