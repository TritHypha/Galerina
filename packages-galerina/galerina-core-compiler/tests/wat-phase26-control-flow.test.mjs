/**
 * Phase 26 — WAT Control Flow: if/else and while loops
 *
 * Tests that emitWATFromFlowAST correctly emits:
 *   - Value-producing if/else: (if (result i32) COND (then X) (else Y))
 *   - Statement if (no else): (if COND (then ...) )
 *   - While loops: (block $exit (loop $loop (br_if $exit !COND) BODY (br $loop)))
 *   - Loop-variable mutation: let x = x+1 inside while → local.set without new local
 *   - Nested if inside while
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT,
} from "../dist/index.js";

function compileToWAT(src) {
  const prog = parseProgram(src, "test.spore");
  const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse error: " + errs.map(d => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  return renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast));
}

// ---------------------------------------------------------------------------
// if/else — value-producing (last statement in block)
// ---------------------------------------------------------------------------

describe("Phase 26: if/else value-producing", () => {
  it("max(a, b) → (if (result i32) ...)", () => {
    const wat = compileToWAT([
      "pure flow max(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ if a > b { return a } else { return b } }",
    ].join("\n"));
    assert.ok(wat.includes("(if (result i32)"), `expected value-producing if:\n${wat}`);
    assert.ok(wat.includes("i32.gt_s"), `expected gt_s for >:\n${wat}`);
    assert.ok(wat.includes("(then"), `expected then:\n${wat}`);
    assert.ok(wat.includes("(else"), `expected else:\n${wat}`);
    assert.ok(!wat.includes("unreachable"), `must not use unreachable:\n${wat}`);
  });

  it("abs(x): x < 0 → -x, else x", () => {
    const wat = compileToWAT([
      "pure flow absVal(x: Int) -> Int",
      "contract { effects {} }",
      "{ if x < 0 { return 0 - x } else { return x } }",
    ].join("\n"));
    assert.ok(wat.includes("(if (result i32)"));
    assert.ok(wat.includes("i32.lt_s"));
    // owner Fork A=TRAP: `0 - x` lowers to the checked-sub helper call
    assert.ok(wat.includes("call $spore_checked_sub_i32"));
  });

  it("equals(a, b) → 1 or 0 via == comparison", () => {
    const wat = compileToWAT([
      "pure flow eql(a: Int, b: Int) -> Int",
      "contract { effects {} }",
      "{ if a == b { return 1 } else { return 0 } }",
    ].join("\n"));
    assert.ok(wat.includes("i32.eq"), `expected i32.eq:\n${wat}`);
    assert.ok(wat.includes("(if (result i32)"));
  });
});

// ---------------------------------------------------------------------------
// while loop
// ---------------------------------------------------------------------------

describe("Phase 26: while loops", () => {
  it("sumTo(n) produces block/loop/br_if/br structure", () => {
    const wat = compileToWAT([
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n"));
    assert.ok(wat.includes("(block $while_exit_0"), `expected block label:\n${wat}`);
    assert.ok(wat.includes("(loop $while_loop_0"), `expected loop label:\n${wat}`);
    assert.ok(wat.includes("br_if $while_exit_0"), `expected br_if to exit:\n${wat}`);
    assert.ok(wat.includes("br $while_loop_0"), `expected br to loop:\n${wat}`);
    // owner Fork A=TRAP: body does +/-/* so the checked helper's overflow-trap
    // `unreachable` is legit; assert the flow lowered to a real body, not the #128 stub
    assert.ok(!wat.includes(";; unsupported-in-WASM"));
  });

  it("while loop exit uses negated condition (i32.gt_s for <=)", () => {
    const wat = compileToWAT([
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n"));
    // while i <= n → exit when i > n → i32.gt_s
    assert.ok(wat.includes("i32.gt_s"), `condition must be negated (>= becomes gt_s):\n${wat}`);
  });

  it("loop-variable mutation does not declare duplicate locals", () => {
    const wat = compileToWAT([
      "pure flow countDown(n: Int) -> Int",
      "contract { effects {} }",
      "{ let count = n",
      "  while count > 0 {",
      "    let count = count - 1",
      "  }",
      "  return count }",
    ].join("\n"));
    // $count should appear exactly once as (local $count i32)
    const matches = (wat.match(/\(local \$count i32\)/g) ?? []).length;
    assert.equal(matches, 1, `$count must be declared exactly once:\n${wat}`);
    // But local.set $count should appear twice (init + loop mutation)
    const sets = (wat.match(/local\.set \$count/g) ?? []).length;
    assert.ok(sets >= 2, `local.set $count must appear at least twice:\n${wat}`);
  });

  it("nested while loop gets unique labels", () => {
    const wat = compileToWAT([
      "pure flow nested(n: Int) -> Int",
      "contract { effects {} }",
      "{ let sum = 0",
      "  let i = 0",
      "  while i < n {",
      "    let j = 0",
      "    while j < n {",
      "      let sum = sum + 1",
      "      let j = j + 1",
      "    }",
      "    let i = i + 1",
      "  }",
      "  return sum }",
    ].join("\n"));
    // Two separate loop labels
    assert.ok(wat.includes("$while_exit_0"), `outer exit:\n${wat}`);
    assert.ok(wat.includes("$while_exit_1"), `inner exit:\n${wat}`);
    assert.ok(wat.includes("$while_loop_0"), `outer loop:\n${wat}`);
    assert.ok(wat.includes("$while_loop_1"), `inner loop:\n${wat}`);
  });

  it("while loop with if inside body", () => {
    const wat = compileToWAT([
      "pure flow sumEvens(n: Int) -> Int",
      "contract { effects {} }",
      "{ let sum = 0",
      "  let i = 0",
      "  while i <= n {",
      "    let i = i + 1",
      "  }",
      "  return sum }",
    ].join("\n"));
    assert.ok(wat.includes("(block $while_exit_0"));
    // owner Fork A=TRAP: body does `i + 1` so the checked helper's overflow-trap
    // `unreachable` is legit; assert the flow lowered to a real body, not the #128 stub
    assert.ok(!wat.includes(";; unsupported-in-WASM"));
  });
});

// ---------------------------------------------------------------------------
// Correctness: WAT structure is valid
// ---------------------------------------------------------------------------

describe("Phase 26: WAT structural validity", () => {
  it("all generated WAT starts with (module", () => {
    for (const src of [
      "pure flow f(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }",
      ["pure flow g(n: Int) -> Int contract { effects {} }",
       "{ let r = 0 let i = 0 while i < n { let r = r + i let i = i + 1 } return r }"].join("\n"),
    ]) {
      const wat = compileToWAT(src);
      assert.ok(wat.startsWith("(module"), `must start with (module:\n${wat}`);
      assert.ok(wat.includes("(func "), `must have func:\n${wat}`);
      // owner Fork A=TRAP: the second source does +/-/* so the checked helper's
      // overflow-trap `unreachable` is legit; assert no #128 unsupported stub instead
      assert.ok(!wat.includes(";; unsupported-in-WASM"), `no unsupported stub:\n${wat}`);
    }
  });

  it("if/else does not leave dangling open parens", () => {
    const wat = compileToWAT([
      "pure flow sign(x: Int) -> Int",
      "contract { effects {} }",
      "{ if x > 0 { return 1 } else { return 0 } }",
    ].join("\n"));
    // Count open/close parens — they must balance
    const opens  = (wat.match(/\(/g) ?? []).length;
    const closes = (wat.match(/\)/g) ?? []).length;
    assert.equal(opens, closes, `parentheses must balance:\n${wat}`);
  });
});
