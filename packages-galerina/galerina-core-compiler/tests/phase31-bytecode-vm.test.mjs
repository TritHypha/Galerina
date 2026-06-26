/**
 * Phase 31 — Bytecode VM correctness tests
 *
 * Verifies the bytecode compiler + VM produce identical results to the
 * tree-walker for pure integer flows, and that unsupported flows return null
 * (signalling fallback to the tree-walker).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, tryRunBytecode, compileToBytecode, runBytecode,
  clearBytecodeCache, Op,
} from "../dist/index.js";

function run(src, flow, args) {
  clearBytecodeCache();
  const prog = parseProgram(src, "test.spore");
  return tryRunBytecode(prog.ast, prog.flows, flow, args);
}

describe("Phase 31: bytecode VM arithmetic", () => {
  it("add(2,3) = 5", () => {
    assert.equal(run("pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }", "add", [2,3]), 5);
  });
  it("sub(10,3) = 7", () => {
    assert.equal(run("pure flow sub(a: Int, b: Int) -> Int contract { effects {} } { return a - b }", "sub", [10,3]), 7);
  });
  it("mul(6,7) = 42", () => {
    assert.equal(run("pure flow mul(a: Int, b: Int) -> Int contract { effects {} } { return a * b }", "mul", [6,7]), 42);
  });
  it("div(20,4) = 5", () => {
    assert.equal(run("pure flow div(a: Int, b: Int) -> Int contract { effects {} } { return a / b }", "div", [20,4]), 5);
  });
  it("mod(17,5) = 2", () => {
    assert.equal(run("pure flow md(a: Int, b: Int) -> Int contract { effects {} } { return a % b }", "md", [17,5]), 2);
  });
  it("nested (a+b)*c", () => {
    assert.equal(run("pure flow f(a: Int, b: Int, c: Int) -> Int contract { effects {} } { return (a + b) * c }", "f", [2,3,4]), 20);
  });
  // Owner decision 2026-06-18 (Fork A=TRAP / Fork B=bytecode-conforms): the bytecode VM must TRAP
  // on divide/modulo-by-zero and integer overflow — never the old silent `0`/wrap (a capability-gate
  // exploit vector). Byte-identical to the tree-walker's runtimeError (i32-arith.ts is the source).
  it("div by zero TRAPS (no silent 0)", () => {
    assert.throws(() => run("pure flow d(a: Int, b: Int) -> Int contract { effects {} } { return a / b }", "d", [5,0]), /DivisionByZero/);
  });
  it("mod by zero TRAPS", () => {
    assert.throws(() => run("pure flow m(a: Int, b: Int) -> Int contract { effects {} } { return a % b }", "m", [5,0]), /DivisionByZero/);
  });
  it("integer overflow TRAPS (no silent wrap)", () => {
    assert.throws(() => run("pure flow o(a: Int, b: Int) -> Int contract { effects {} } { return a + b }", "o", [2147483647, 1]), /IntegerOverflow/);
  });
});

describe("Phase 31: bytecode VM control flow", () => {
  it("max via if/else — true branch", () => {
    const src = "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }";
    assert.equal(run(src, "max", [9,4]), 9);
  });
  it("max via if/else — false branch", () => {
    const src = "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }";
    assert.equal(run(src, "max", [3,7]), 7);
  });
  it("else-if chain", () => {
    const src = ["pure flow grade(x: Int) -> Int contract { effects {} }",
      "{ if x >= 90 { return 1 } else if x >= 80 { return 2 } else { return 3 } }"].join("\n");
    assert.equal(run(src, "grade", [95]), 1);
    assert.equal(run(src, "grade", [85]), 2);
    assert.equal(run(src, "grade", [50]), 3);
  });
  it("while loop sumTo(100) = 5050", () => {
    const src = ["pure flow sumTo(n: Int) -> Int contract { effects {} }",
      "{ mut t: Int = 0  mut i: Int = 1  while i <= n { t = t + i  i = i + 1 } return t }"].join("\n");
    assert.equal(run(src, "sumTo", [100]), 5050);
  });
  it("while loop sumTo(0) = 0 (no iterations)", () => {
    const src = ["pure flow sumTo(n: Int) -> Int contract { effects {} }",
      "{ mut t: Int = 0  mut i: Int = 1  while i <= n { t = t + i  i = i + 1 } return t }"].join("\n");
    assert.equal(run(src, "sumTo", [0]), 0);
  });
  it("unary negation", () => {
    assert.equal(run("pure flow neg(x: Int) -> Int contract { effects {} } { return 0 - x }", "neg", [5]), -5);
  });
});

describe("Phase 31: matches tree-walker (cross-check)", () => {
  it("compiled bytecode has expected structure", () => {
    clearBytecodeCache();
    const prog = parseProgram("pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }", "test.spore");
    const bc = compileToBytecode(prog.ast, "add");
    assert.ok(bc !== null, "should compile");
    assert.equal(bc.paramNames.length, 2);
    assert.equal(bc.localCount, 2);
    // Direct VM run
    assert.equal(runBytecode(bc, [10, 20]), 30);
  });

  it("Op enum has expected opcodes", () => {
    assert.equal(Op.LOAD_CONST, 1);
    assert.equal(Op.ADD, 10);
    assert.equal(Op.RETURN, 60);
  });
});

describe("Phase 31: fallback for unsupported flows", () => {
  it("non-pure flow returns null", () => {
    const src = "secure flow s(x: Int) -> Int contract { effects { audit.write } } { return x }";
    assert.equal(run(src, "s", [1]), null);
  });
  it("float literal returns null (fallback)", () => {
    const src = "pure flow f() -> Int contract { effects {} } { return 3.14 }";
    assert.equal(run(src, "f", []), null);
  });
  it("string operations return null (fallback)", () => {
    const src = "pure flow f(s: String) -> String contract { effects {} } { return s }";
    assert.equal(run(src, "f", [0]), null);
  });
});
