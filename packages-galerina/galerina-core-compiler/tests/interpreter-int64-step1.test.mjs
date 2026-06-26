// =============================================================================
// Faithful Int64 — interpreter Step 1 (literal coercion + fast-tier fail-closed bail).
//
// Runs whole Int64 flows through the interpreter via executeFlow (which bypasses the SPORE-NUMERIC-001
// gate — that gate is a SEPARATE pass — so the faithful tree-walker machinery can be exercised before
// the gate is lifted). The exactness assertions above 2^53 are the proof the FAST tiers (bytecode VM,
// sync fast-path) correctly BAILED to the faithful tree-walker: had bytecode/sync run, the value would
// have been truncated to i32 / rounded by a JS number.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeFlow, parseProgram } from "../dist/index.js";
import { logicNValuesEqual } from "../dist/stdlib.js";

const run = (source, flowName, args = new Map()) => {
  const p = parseProgram(source, "int64-step1.spore");
  return executeFlow(flowName, args, p.ast, p.flows, undefined, undefined, {}, undefined, undefined);
};

const F = (body, sig = "() -> Int64") => `pure flow f${sig} contract { effects {} } {\n${body}\n}`;

describe("Int64 Step 1: literal origination is faithful (no parseInt round)", () => {
  it("a declared-Int64 literal init keeps every bit above 2^53", async () => {
    // Number(9007199254740993) === 9007199254740992 (low bit lost); the int64 path must NOT lose it.
    const r = await run(F("  let x: Int64 = 9007199254740993\n  return x"), "f");
    assert.equal(r.value.__tag, "int64");
    assert.equal(r.value.value, 9007199254740993n);
  });

  it("I64_MAX and I64_MIN round-trip exactly (sign-descended literal)", async () => {
    const max = await run(F("  let x: Int64 = 9223372036854775807\n  return x"), "f");
    assert.equal(max.value.value, 9223372036854775807n);
    const min = await run(F("  let x: Int64 = -9223372036854775808\n  return x"), "f");
    assert.equal(min.value.value, -9223372036854775808n);
  });

  it("an out-of-i64-range literal init fails CLOSED (not a silent wrap)", async () => {
    const r = await run(F("  let x: Int64 = 9223372036854775808\n  return x"), "f"); // 2^63, one past max
    assert.equal(r.value.__tag, "runtimeError");
  });
});

describe("Int64 Step 1: arithmetic + accumulation stay exact and trap on overflow", () => {
  it("a loop accumulator past 2^32 is exact (init coerced, arithmetic via the int64 dispatch)", async () => {
    const r = await run(F(
      "  mut total: Int64 = 0\n  mut i: Int = 0\n  while i < 3 { total = total + 3000000000  i = i + 1 }\n  return total"),
      "f");
    assert.equal(r.value.__tag, "int64");
    assert.equal(r.value.value, 9000000000n); // 3 × 3e9 — overflows i32, proves the bytecode/sync tiers bailed
  });

  it("Int64 overflow TRAPS fail-closed (Fork A), not wrap", async () => {
    const r = await run(F("  let a: Int64 = 9223372036854775807\n  let b: Int64 = a + 1\n  return b"), "f");
    assert.equal(r.value.__tag, "runtimeError");
  });

  it("unary negation of a large int64 is exact, and -I64_MIN traps (1e)", async () => {
    const neg = await run(F("  let a: Int64 = 5000000000\n  let b: Int64 = -a\n  return b"), "f");
    assert.equal(neg.value.value, -5000000000n);
    const trap = await run(F("  let a: Int64 = -9223372036854775808\n  let b: Int64 = -a\n  return b"), "f");
    assert.equal(trap.value.__tag, "runtimeError"); // -I64_MIN overflows i64
  });
});

describe("Int64 Step 1: fast-tier fail-closed bail (R1)", () => {
  it("an int-param flow with an INTERNAL Int64 binding computes faithfully (bytecode/sync bailed to the walker)", async () => {
    // The bytecode VM would accept the int param + compile the internal `let big: Int64` to a truncating
    // i32 STORE_LOCAL. flowDeclaresUnlowerable64 makes it bail → the faithful walker runs → exact.
    const r = await run(
      "pure flow f(n: Int) -> Int64 contract { effects {} } { let big: Int64 = 5000000000  return big + n }",
      "f", new Map([["n", { __tag: "int", value: 7 }]]));
    assert.equal(r.value.__tag, "int64");
    assert.equal(r.value.value, 5000000007n); // > i32 — would be truncated had a fast tier run
  });
});

describe("Int64 Step 1: equality consumption (1g)", () => {
  it("logicNValuesEqual compares int64 by value (exact above 2^53)", () => {
    const a = { __tag: "int64", value: 9007199254740993n };
    const b = { __tag: "int64", value: 9007199254740993n };
    const c = { __tag: "int64", value: 9007199254740992n };
    assert.equal(logicNValuesEqual(a, b), true);
    assert.equal(logicNValuesEqual(a, c), false);
  });

  it("int and int64 are NOT equal (distinct tags — same-tag-only policy)", () => {
    assert.equal(logicNValuesEqual({ __tag: "int", value: 5 }, { __tag: "int64", value: 5n }), false);
  });
});
