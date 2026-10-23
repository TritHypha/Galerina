// =============================================================================
// Interpreter Int64 dispatch — numeric big-rock increment 2a.
//
// The tree-walker now carries an `int64` (bigint) value tag and routes int64 arithmetic through the
// checked i64-arith layer (exact above 2^53, traps on overflow/div-0). These keys are ADDITIVE — they
// are unreachable while scalar Int64 is rejected by FUNGI-NUMERIC-001, so zero regression today; they
// become live when Int64 is lifted from the gate. Tested directly via the exported BINARY_DISPATCH +
// dispatchKey (mirrors dispatch-completeness.test.mjs) so we prove the arithmetic without the gate.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BINARY_DISPATCH, dispatchKey } from "../dist/interpreter.js";
import { checkTypes, clearPureFlowCache, executeFlow, executeFlowSync, parseProgram, resolveSymbols, tryPureFlowSync } from "../dist/index.js";
import { I64_MAX, I64_MIN } from "../dist/i64-arith.js";

const i64 = (v) => ({ __tag: "int64", value: v });
const int = (v) => ({ __tag: "int", value: v });
const run = (a, op, b) => {
  const fn = BINARY_DISPATCH.get(dispatchKey(a.__tag, op, b.__tag));
  assert.ok(fn !== undefined, `no dispatch entry for ${a.__tag} ${op} ${b.__tag}`);
  return fn(a, b);
};

async function runSourceFlow(src, flowName, args = new Map(), runtimeOptions = undefined) {
  const parsed = parseProgram(src, "wide-call-argument.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast); // Direct runtime controls: not all fixtures pass frontend admission.
  return executeFlow(flowName, args, parsed.ast, undefined, undefined, undefined, runtimeOptions);
}

describe("interpreter 64-bit literals passed across flow calls", () => {
  it("preserves an exact Int64 literal above 2^53 at the callee parameter", async () => {
    const result = await runSourceFlow(`
      pure flow identity(value: Int64) -> Int64 contract { effects {} } { return value }
      pure flow caller() -> Int64 contract { effects {} } { return identity(9007199254740993) }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "int64", value: 9007199254740993n });
  });

  it("preserves an exact UInt64 literal above 2^53 at the callee parameter", async () => {
    const result = await runSourceFlow(`
      pure flow identity(value: UInt64) -> UInt64 contract { effects {} } { return value }
      pure flow caller() -> UInt64 contract { effects {} } { return identity(9007199254740993) }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "uint64", value: 9007199254740993n });
  });

  it("preserves a negative Int64 literal at the callee parameter", async () => {
    const result = await runSourceFlow(`
      pure flow identity(value: Int64) -> Int64 contract { effects {} } { return value }
      pure flow caller() -> Int64 contract { effects {} } { return identity(-9223372036854775808) }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "int64", value: -9223372036854775808n });
  });

  it("preserves UInt64::MAX at the callee parameter", async () => {
    const result = await runSourceFlow(`
      pure flow identity(value: UInt64) -> UInt64 contract { effects {} } { return value }
      pure flow caller() -> UInt64 contract { effects {} } { return identity(18446744073709551615) }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "uint64", value: 18446744073709551615n });
  });

  it("does not discard a nested flow postcondition failure when its binding is unused", async () => {
    const source = `
      flow bad() -> UInt64
      contract { invariant { ensure result > 5 } }
      { return 1 }
      flow caller() -> UInt64 {
        let ignored = bad()
        return 7
      }
    `;
    const parsed = parseProgram(source, "nested-postcondition-refusal.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "fixture must parse");
    resolveSymbols(parsed.ast);
    const typeDiagnostics = checkTypes(parsed.ast).diagnostics;
    assert.equal(typeDiagnostics.filter((d) => d.severity === "error").length, 0, "fixture must typecheck");

    const refused = await executeFlow("caller", new Map(), parsed.ast);
    assert.equal(refused.value.__tag, "runtimeError", "nested postcondition refusal must fail the caller");
    assert.equal(refused.audit.result, "error", "caller must not report success after the nested refusal");

    const validParsed = parseProgram(source.replace("return 1", "return 6"), "nested-postcondition-valid.fungi");
    resolveSymbols(validParsed.ast);
    assert.equal(checkTypes(validParsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0, "valid control must typecheck");
    const valid = await executeFlow("caller", new Map(), validParsed.ast);
    assert.deepEqual(valid.value, { __tag: "uint64", value: 7n }, "valid nested result must preserve caller behavior");
    assert.equal(valid.audit.result, "ok");
  });

  it("does not discard a malformed nested UInt64 argument refusal when its binding is unused", async () => {
    const source = `
      flow id(x: UInt64) -> UInt64 { return x }
      flow caller(xs: Array<UInt64>) -> Int {
        let ignored = id(xs.first().unwrapOr(0))
        return 7
      }
    `;
    const parsed = parseProgram(source, "nested-malformed-wide-refusal.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "fixture must parse");
    resolveSymbols(parsed.ast);
    assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0, "fixture must typecheck");

    const direct = await executeFlow("id", new Map([[
      "x", { __tag: "uint64", value: "bad" },
    ]]), parsed.ast);
    assert.equal(direct.value.__tag, "runtimeError", `direct callee boundary must refuse: ${JSON.stringify(direct)}`);

    const refused = await executeFlow("caller", new Map([[
      "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
    ]]), parsed.ast);
    assert.equal(refused.value.__tag, "runtimeError", `nested wide-boundary refusal must fail the caller: ${JSON.stringify(refused)}`);
    assert.equal(refused.audit.result, "error", "caller must not report success after the nested refusal");

    const valid = await executeFlow("caller", new Map([[
      "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
    ]]), parsed.ast);
    assert.deepEqual(valid.value, { __tag: "int", value: 7 }, "valid nested argument must preserve caller behavior");
    assert.equal(valid.audit.result, "ok");
  });

  it("fails closed when a negative literal is passed to a UInt64 parameter", async () => {
    const result = await runSourceFlow(`
      pure flow identity(value: UInt64) -> UInt64 contract { effects {} } { return value }
      pure flow caller() -> UInt64 contract { effects {} } { return identity(-1) }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("fails closed when a UInt64 alias is passed a negative value", async () => {
    const result = await runSourceFlow(`
      type Count = UInt64
      flow ignores(value: Count) -> Int { return 7 }
      flow caller() -> Int { return ignores(-1) }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("preserves exact wide values through a bounded chain of aliases", async () => {
    const result = await runSourceFlow(`
      type WideCount = UInt64
      type Count = WideCount
      flow identity(value: Count) -> Count { return value }
      flow caller() -> Count { return identity(9007199254740993) }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "uint64", value: 9007199254740993n });
  });

  it("refuses invalid host-supplied values for wide aliases at flow entry", async () => {
    const result = await runSourceFlow(`
      type Count = UInt64
      flow ignores(value: Count) -> Int { return 7 }
    `, "ignores", new Map([["value", int(-1)]]));
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("defers pure wide-alias calls from the sync fast path to checked runtime admission", async () => {
    const result = await runSourceFlow(`
      type Count = UInt64
      pure flow ignores(value: Count) -> Int contract { effects {} } { return 7 }
      pure flow caller() -> Int contract { effects {} } { return ignores(-1) }
    `, "caller", new Map(), { pureFastPath: true });
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("declines direct sync execution when a flow uses a wide integer alias", () => {
    const parsed = parseProgram(`
      type Count = UInt64
      pure flow identity(value: Count) -> Count contract { effects {} } { return value }
    `, "wide-alias-sync.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const result = tryPureFlowSync(parsed.ast, parsed.flows, "identity", new Map([["value", int(-1)]]));
    assert.equal(result, null, "sync fast path must defer wide-alias admission to the checked interpreter");
  });

  it("refuses a cyclic numeric alias used only as a flow return type", async () => {
    const result = await runSourceFlow(`
      type First = Second
      type Second = First
      flow invalid() -> First { return 7 }
    `, "invalid");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("refuses an invalid numeric alias at a local binding before continuing", async () => {
    const result = await runSourceFlow(`
      type First = Second
      type Second = First
      flow caller() -> Int {
        let ignored: First = 7
        return 9
      }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("refuses a negative value assigned to a UInt64 alias before continuing", async () => {
    const result = await runSourceFlow(`
      type Count = UInt64
      flow caller() -> Int {
        mut value: Count = 0
        value = -1
        return 9
      }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("preserves an exact Int64 value assigned through an alias", async () => {
    const result = await runSourceFlow(`
      type ExactCount = Int64
      flow caller() -> ExactCount {
        mut value: ExactCount = 0
        value = 9007199254740993
        return value
      }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "int64", value: 9007199254740993n });
  });

  it("direct runtime rejects a type declaration that conflicts with the UInt64 builtin", async () => {
    const parsed = parseProgram(`
      type UInt64 = Int64
      type UInt64 = String
      flow ignores(value: UInt64) -> Int { return 7 }
    `, "wide-builtin-alias-conflict.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast); // Deliberately a direct-runtime probe, not a front-end pass claim.
    const result = await executeFlow("ignores", new Map([["value", { __tag: "uint64", value: 1n }]]), parsed.ast);
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("direct runtime rejects a type declaration that conflicts with the Int64 builtin", async () => {
    const parsed = parseProgram(`
      type Int64 = UInt64
      type Int64 = String
      flow ignores(value: Int64) -> Int { return 7 }
    `, "wide-builtin-alias-conflict.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast); // Deliberately a direct-runtime probe, not a front-end pass claim.
    const result = await executeFlow("ignores", new Map([["value", { __tag: "int64", value: 1n }]]), parsed.ast);
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("direct runtime rejects a single alias declaration that shadows the UInt64 builtin", async () => {
    const parsed = parseProgram(`
      type UInt64 = Int64
      flow ignores(value: UInt64) -> Int { return 7 }
    `, "wide-builtin-alias-shadow.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast); // Deliberately a direct-runtime probe, not a front-end pass claim.
    const result = await executeFlow("ignores", new Map([["value", { __tag: "uint64", value: 1n }]]), parsed.ast);
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("does not let a callee ignore a negative UInt64 argument failure", async () => {
    const result = await runSourceFlow(`
      flow ignores(value: UInt64) -> Int { return 7 }
      pure flow caller() -> Int contract { effects {} } { return ignores(-1) }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("does not let a callee ignore a UInt64 overflow argument failure", async () => {
    const result = await runSourceFlow(`
      pure flow ignores(value: UInt64) -> Int contract { effects {} } { return 7 }
      pure flow caller() -> Int contract { effects {} } { return ignores(18446744073709551616) }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("does not let a callee ignore an Int64 overflow argument failure", async () => {
    const result = await runSourceFlow(`
      pure flow ignores(value: Int64) -> Int contract { effects {} } { return 7 }
      pure flow caller() -> Int contract { effects {} } { return ignores(9223372036854775808) }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
  });

  it("uses a local function's Int64 return context inside a non-wide flow", async () => {
    const result = await runSourceFlow(`
      pure flow caller() -> Bool contract { effects {} } {
        fn wide() -> Int64 { return 9007199254740993 }
        return wide() == 9007199254740992
      }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "bool", value: false });
  });

  it("evaluates every local-function argument before binding shadowing parameters", async () => {
    const result = await runSourceFlow(`
      pure flow caller() -> Int contract { effects {} } {
        let x: Int = 42
        fn pick(x: Int, y: Int) -> Int { return y }
        return pick(1, x)
      }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "int", value: 42 });
  });

  it("fails closed when a local higher-order callback receives a negative UInt64", async () => {
    const result = await runSourceFlow(`
      pure flow caller(values: Array<UInt64>) -> Array<Int> contract { effects {} } {
        fn ignores(value: UInt64) -> Int { return 7 }
        return values.map(ignores)
      }
    `, "caller", new Map([["values", { __tag: "list", items: [{ __tag: "int", value: -1 }] }]]));
    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /IntegerOverflow/);
  });

  it("fails closed when a top-level higher-order flow receives a forged negative UInt64 element", async () => {
    const result = await runSourceFlow(`
      flow IgnoreWide(value: UInt64) -> Int { return 7 }
      pure flow caller(values: Array<UInt64>) -> Array<Int> contract { effects {} } {
        return values.map(IgnoreWide)
      }
    `, "caller", new Map([["values", { __tag: "list", items: [{ __tag: "int", value: -1 }] }]]));
    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /IntegerOverflow/);
  });

  it("fails closed when an untyped host supplies a negative Int for a UInt64 flow parameter", async () => {
    const result = await runSourceFlow(`
      pure flow ignores(value: UInt64) -> Int contract { effects {} } { return 7 }
    `, "ignores", new Map([["value", { __tag: "int", value: -1 }]]));
    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /IntegerOverflow/);
  });

  it("refuses out-of-i32 host Int values before sync or pure-fast-path execution", async () => {
    const parsed = parseProgram(`
      pure flow identity(value: Int) -> Int contract { effects {} } { return value }
    `, "host-int-i32-boundary.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const args = new Map([["value", int(2147483648)]]);

    assert.equal(executeFlowSync("identity", args, parsed.ast, parsed.flows), null,
      "the sync entry must decline malformed Int inputs so the checked walker can reject them");
    const optimized = await executeFlow("identity", args, parsed.ast, parsed.flows,
      undefined, undefined, { pureFastPath: true });
    assert.equal(optimized.value.__tag, "runtimeError",
      "the opt-in bytecode/sync/cache path must not wrap an out-of-i32 host Int");
    assert.match(optimized.value.message, /signed i32 value/);
    assert.equal(optimized.executionTier, "tree");
  });

  it("refuses out-of-i32 host Int values on the execution-graph route too", async () => {
    const parsed = parseProgram(`
      pure flow identity(value: Int) -> Int contract { effects {} } { return value }
    `, "host-int-i32-egraph-boundary.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);

    const valid = await executeFlow("identity", new Map([["value", int(2147483647)]]), parsed.ast,
      undefined, undefined, undefined, { egraphFastPath: true });
    assert.deepEqual(valid.value, int(2147483647), "the signed i32 maximum remains admitted");
    assert.equal(valid.executionTier, "egraph", "positive control proves the graph route was exercised");

    for (const options of [
      { egraphFastPath: true },
      { pureFastPath: true, egraphFastPath: true },
    ]) {
      const refused = await executeFlow("identity", new Map([["value", int(2147483648)]]), parsed.ast,
        undefined, undefined, undefined, options);
      assert.equal(refused.value.__tag, "runtimeError", "every selected execution route must enforce Int admission");
      assert.match(refused.value.message, /signed i32 value/);
      assert.notEqual(refused.executionTier, "egraph");
    }
  });

  it("does not admit an invalid host UInt64 through the execution-graph route", async () => {
    const parsed = parseProgram(`
      pure flow identity(value: UInt64) -> UInt64 contract { effects {} } { return value }
    `, "host-uint64-egraph-boundary.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);

    for (const options of [
      { egraphFastPath: true },
      { pureFastPath: true, egraphFastPath: true },
    ]) {
      const result = await executeFlow("identity", new Map([["value", { __tag: "uint64", value: -1n }]]),
        parsed.ast, undefined, undefined, undefined, options);

      assert.equal(result.value.__tag, "runtimeError", "invalid UInt64 must be refused before an unchecked graph return");
      assert.equal(result.audit.result, "error");
      assert.notEqual(result.executionTier, "egraph", "unchecked graph execution must not bypass wide-value admission");
    }
  });

  it("does not admit an invalid aliased UInt64 through the execution-graph route", async () => {
    const parsed = parseProgram(`
      type Count = UInt64
      pure flow identity(value: Count) -> Count contract { effects {} } { return value }
    `, "host-uint64-alias-egraph-boundary.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);

    const result = await executeFlow("identity", new Map([["value", { __tag: "uint64", value: -1n }]]),
      parsed.ast, undefined, undefined, undefined, { pureFastPath: true, egraphFastPath: true });

    assert.equal(result.value.__tag, "runtimeError", "invalid alias payload must be refused before an unchecked graph return");
    assert.equal(result.audit.result, "error");
    assert.notEqual(result.executionTier, "egraph");
  });

  it("falls back to checked execution for an exact valid UInt64 when the graph tier is requested", async () => {
    const parsed = parseProgram(`
      pure flow identity(value: UInt64) -> UInt64 contract { effects {} } { return value }
    `, "host-uint64-egraph-fallback.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);

    const result = await executeFlow("identity", new Map([["value", { __tag: "uint64", value: 18446744073709551615n }]]),
      parsed.ast, undefined, undefined, undefined, { egraphFastPath: true });

    assert.deepEqual(result.value, { __tag: "uint64", value: 18446744073709551615n });
    assert.equal(result.audit.result, "ok");
    assert.equal(result.executionTier, "tree", "wide values must use the checked tree tier until graph admission is implemented");
  });

  it("does not let a cached pure-flow result bypass wide-integer admission", async () => {
    clearPureFlowCache();
    const parsed = parseProgram(`
      pure flow identity(value: Int64) -> Int64 contract { effects {} } { return value }
    `, "wide-cache-admission.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const args = new Map([["value", i64(9007199254740993n)]]);
    const options = { pureFastPath: true, egraphFastPath: true };

    const first = await executeFlow("identity", args, parsed.ast, undefined, undefined, undefined, options);
    const second = await executeFlow("identity", args, parsed.ast, undefined, undefined, undefined, options);

    assert.deepEqual(first.value, i64(9007199254740993n));
    assert.deepEqual(second.value, i64(9007199254740993n));
    assert.equal(first.executionTier, "tree");
    assert.equal(second.executionTier, "tree", "a cache hit must not bypass checked wide-value admission");
  });

  it("refuses a host runtimeError argument before an Int flow can ignore it", async () => {
    const parsed = parseProgram(`
      pure flow ignores(value: Int) -> Int contract { effects {} } { return 7 }
    `, "host-int-runtime-error-boundary.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "parse must succeed");
    resolveSymbols(parsed.ast);
    checkTypes(parsed.ast);
    const args = new Map([["value", { __tag: "runtimeError", message: "upstream failure" }]]);
    for (const options of [
      undefined,
      { pureFastPath: true },
      { egraphFastPath: true },
      { pureFastPath: true, egraphFastPath: true },
    ]) {
      const result = await executeFlow("ignores", args, parsed.ast, undefined, undefined, undefined, options);
      assert.equal(result.value.__tag, "runtimeError", "an error-valued host argument is not a valid Int input");
      assert.equal(result.audit.result, "error", "the refusal must be visible in execution evidence");
      assert.equal(result.value.message, "Host-supplied runtime error",
        "host-owned error text stays redacted while still refusing the typed Int parameter");
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-RUNTIME-003"),
        "the typed-entry refusal must retain its runtime diagnostic");
      assert.doesNotMatch(JSON.stringify(result.diagnostics), /upstream failure/,
        "diagnostics must not disclose host-owned error text");
      assert.doesNotMatch(JSON.stringify(result.audit), /upstream failure/,
        "audit output must not disclose host-owned error text");
    }
  });

  for (const [type, tag] of [["Int64", "int64"], ["UInt64", "uint64"]]) {
    for (const [label, payload] of [
      ["NaN", NaN],
      ["fraction", 0.5],
      ["string", "0"],
      ["undefined", undefined],
      ["Symbol", Symbol("malformed")],
    ]) {
      it(`rejects ${label} in a host-supplied ${type} payload`, async () => {
        const result = await runSourceFlow(`
          pure flow ignores(value: ${type}) -> Int contract { effects {} } { return 7 }
        `, "ignores", new Map([["value", { __tag: tag, value: payload }]]));
        assert.equal(result.value.__tag, "runtimeError", `${type} ${label} payload must refuse`);
      });
    }

    it(`refuses an accessor-backed ${type} payload without invoking the accessor`, async () => {
      let reads = 0;
      const changingPayload = { __tag: tag };
      Object.defineProperty(changingPayload, "value", {
        get() {
          reads += 1;
          return reads <= 2 ? 0n : -1n;
        },
      });
      const result = await runSourceFlow(`
        pure flow identity(value: ${type}) -> ${type} contract { effects {} } { return value }
      `, "identity", new Map([["value", changingPayload]]));
      assert.equal(result.value.__tag, "runtimeError");
      assert.equal(reads, 0, "untrusted payload accessors must not execute during admission");
    });

    it(`turns a throwing ${type} payload accessor into a runtime refusal`, async () => {
      let reads = 0;
      const throwingPayload = { __tag: tag };
      Object.defineProperty(throwingPayload, "value", {
        get() {
          reads += 1;
          throw new Error("host payload accessor failed");
        },
      });
      const result = await runSourceFlow(`
        pure flow ignores(value: ${type}) -> Int contract { effects {} } { return 7 }
      `, "ignores", new Map([["value", throwingPayload]]));
      assert.equal(result.value.__tag, "runtimeError");
      assert.equal(reads, 0, "a hostile accessor must not escape the admission boundary");
    });
  }

  it("preserves the declared Int64 return context in local higher-order callbacks", async () => {
    const result = await runSourceFlow(`
      pure flow caller() -> Array<Int64> contract { effects {} } {
        fn wide(value: Int) -> Int64 { return 9007199254740993 }
        let values: Array<Int> = [0]
        return values.map(wide)
      }
    `, "caller");
    assert.deepEqual(result.value, {
      __tag: "list",
      items: [{ __tag: "int64", value: 9007199254740993n }],
    });
  });

  it("preserves an exact flow-produced Int64 through an array higher-order callback", async () => {
    const result = await runSourceFlow(`
      pure flow wide() -> Int64 contract { effects {} } {
        return 9007199254740993
      }
      flow IgnoreWide(value: Int64) -> Int64 { return value }
      pure flow caller() -> Array<Int64> contract { effects {} } {
        let values: Array<Int64> = [wide()]
        return values.map(IgnoreWide)
      }
    `, "caller");
    assert.deepEqual(result.value, {
      __tag: "list",
      items: [{ __tag: "int64", value: 9007199254740993n }],
    });
  });

  it("keeps Int64 arithmetic exact inside an array higher-order callback", async () => {
    const result = await runSourceFlow(`
      pure flow wide() -> Int64 contract { effects {} } {
        return 9007199254740993
      }
      flow AddTwo(value: Int64) -> Int64 { return value + 2 }
      pure flow caller() -> Array<Int64> contract { effects {} } {
        let values: Array<Int64> = [wide()]
        return values.map(AddTwo)
      }
    `, "caller");
    assert.deepEqual(result.value, {
      __tag: "list",
      items: [{ __tag: "int64", value: 9007199254740995n }],
    });
  });

  it("restores the caller's Int64 return context after a nested flow call", async () => {
    const result = await runSourceFlow(`
      pure flow narrow() -> Int contract { effects {} } { return 1 }
      pure flow wide() -> Int64 contract { effects {} } {
        let ignored: Int = narrow()
        return 9007199254740993
      }
      pure flow caller() -> Int64 contract { effects {} } { return wide() }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "int64", value: 9007199254740993n });
  });

  it("does not retain or read an accessor-backed host runtime error during wide argument admission", async () => {
    let messageReads = 0;
    const hostError = { __tag: "runtimeError" };
    Object.defineProperty(hostError, "message", {
      get() {
        messageReads += 1;
        throw new Error("untrusted runtime error accessor ran");
      },
    });
    const result = await runSourceFlow(`
      pure flow ignores(value: Int64) -> Int contract { effects {} } { return 7 }
    `, "ignores", new Map([["value", hostError]]));

    assert.equal(result.value.__tag, "runtimeError");
    assert.notStrictEqual(result.value, hostError, "host-owned objects must not escape as canonical runtime errors");
    assert.equal(typeof result.value.message, "string", "the refusal value must have an inert message");
    assert.equal(messageReads, 0, "admission must not execute a host accessor");
  });

  it("evaluates a side-effecting flow-call argument exactly once", async () => {
    const result = await runSourceFlow(`
      flow consume(value: Int) -> Int { return 7 }
      flow caller() -> Int {
        mut count: Int = 0
        fn tick() -> Int {
          count = count + 1
          return count
        }
        let ignored: Int = consume(tick())
        return count
      }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "int", value: 1 });
  });

  it("refuses an invalid wide argument before evaluating later flow arguments", async () => {
    const output = [];
    const result = await runSourceFlow(`
      flow ignore(value: UInt64, later: Void) -> Int { return 7 }
      flow caller() -> Int {
        return ignore(-1, println("later argument"))
      }
    `, "caller", new Map(), { outputSink: (line) => output.push(line) });
    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /IntegerOverflow/);
    assert.deepEqual(output, [], "later arguments must not execute after an earlier admission failure");
  });

  it("dispatches a same-named user flow using the same signature used for argument evaluation", async () => {
    const result = await runSourceFlow(`
      pure flow constantTimeEquals(a: UInt64, b: UInt64) -> Bool contract { effects {} } { return false }
      pure flow caller() -> Bool contract { effects {} } { return constantTimeEquals(1, 1) }
    `, "caller");
    assert.deepEqual(result.value, { __tag: "bool", value: false });
  });

  it("does not send failed user-flow wide-argument conversions to a same-named builtin", async () => {
    const result = await runSourceFlow(`
      pure flow constantTimeEquals(a: UInt64, b: UInt64) -> Bool contract { effects {} } { return false }
      pure flow caller() -> Bool contract { effects {} } { return constantTimeEquals(-1, -2) }
    `, "caller");
    assert.equal(result.value.__tag, "runtimeError");
    assert.match(result.value.message, /IntegerOverflow/);
  });

  it("does not inspect host-supplied runtime-error tag or message accessors before wide-value refusal", async () => {
    let tagReads = 0;
    let messageReads = 0;
    const hostError = {};
    Object.defineProperty(hostError, "__tag", {
      get() {
        tagReads += 1;
        throw new Error("untrusted runtime error tag accessor ran");
      },
    });
    Object.defineProperty(hostError, "message", {
      get() {
        messageReads += 1;
        throw new Error("untrusted nested runtime-error accessor ran");
      },
    });
    const result = await runSourceFlow(`
      flow ignores(value: UInt64) -> Int { return 7 }
      flow caller(values: Array<UInt64>) -> Int {
        return ignores(values.first().unwrapOr(0))
      }
    `, "caller", new Map([[
      "values",
      { __tag: "list", items: [hostError] },
    ]]));

    assert.equal(result.value.__tag, "runtimeError");
    assert.equal(tagReads, 0, "host-owned tag accessors must not execute during trap classification");
    assert.equal(messageReads, 0, "host-owned error accessors must not execute during trap classification");
  });

  for (const [kind, declaration, call] of [
    ["local function", "fn ignores(value: UInt64) -> Int { return 7 }", "ignores(values.first().unwrapOr(0))"],
    ["nested flow", "flow ignores(value: UInt64) -> Int { return 7 }", "ignores(values.first().unwrapOr(0))"],
  ]) {
    it(`does not inspect an accessor-backed UInt64 before ${kind} argument admission`, async () => {
      let tagReads = 0;
      const hostile = { value: 0n };
      Object.defineProperty(hostile, "__tag", {
        get() {
          tagReads += 1;
          throw new Error("untrusted numeric tag accessor ran");
        },
      });
      const source = kind === "local function"
        ? `flow caller(values: Array<UInt64>) -> Int {
             ${declaration}
             return ${call}
           }`
        : `${declaration}
           flow caller(values: Array<UInt64>) -> Int {
             return ${call}
           }`;
      const result = await runSourceFlow(source, "caller", new Map([["values", { __tag: "list", items: [hostile] }]]));

      assert.equal(result.value.__tag, "runtimeError");
      assert.equal(tagReads, 0, "untrusted numeric tag accessors must not run before argument admission");
    });
  }

  it("snapshots a host runtimeError before it reaches higher-order result construction", async () => {
    let messageReads = 0;
    const hostError = { __tag: "runtimeError" };
    Object.defineProperty(hostError, "message", {
      get() {
        messageReads += 1;
        throw new Error("untrusted runtime-error message accessor ran");
      },
    });
    const result = await runSourceFlow(`
      flow identity(value: Int) -> Int { return value }
    `, "identity", new Map([["value", hostError]]));

    assert.equal(result.value.__tag, "runtimeError");
    assert.notStrictEqual(result.value, hostError, "host-owned error objects must not escape as interpreter errors");
    assert.equal(result.value.message, "Host-supplied runtime error");
    assert.equal(messageReads, 0, "result construction must not invoke a host-owned error accessor");
  });

  it("does not report a proxied host runtimeError as successful execution", async () => {
    const hostError = new Proxy({ __tag: "runtimeError", message: "bad" }, {});
    const result = await runSourceFlow(`
      flow identity(value: Int) -> Int { return value }
    `, "identity", new Map([["value", hostError]]));

    assert.equal(result.audit.result, "error", "uninspectable host values must not receive an ok audit");
    assert.equal(result.value.__tag, "runtimeError");
    assert.notStrictEqual(result.value, hostError, "a host proxy must not escape as the interpreter result");
  });

  it("does not invoke a nested host runtimeError message accessor during result construction", async () => {
    let messageReads = 0;
    const hostError = { __tag: "runtimeError" };
    Object.defineProperty(hostError, "message", {
      get() {
        messageReads += 1;
        throw new Error("untrusted nested runtime-error accessor ran");
      },
    });
    const result = await runSourceFlow(`
      flow identity(values: Array<Int>) -> Int {
        return values.first().unwrapOr(0)
      }
    `, "identity", new Map([["values", { __tag: "list", items: [hostError] }]]));

    assert.equal(result.audit.result, "error");
    assert.equal(result.value.__tag, "runtimeError");
    assert.notStrictEqual(result.value, hostError);
    assert.equal(messageReads, 0, "result construction must use only an own data message");
  });

  it("does not invoke a nested host __tag accessor while returning a collection element", async () => {
    let tagReads = 0;
    const hostile = {};
    Object.defineProperty(hostile, "__tag", {
      get() {
        tagReads += 1;
        throw new Error("untrusted nested tag accessor ran");
      },
    });
    const result = await runSourceFlow(`
      flow expose(values: Array<Int>) -> Int {
        return values.first().unwrapOr(0)
      }
    `, "expose", new Map([["values", { __tag: "list", items: [hostile] }]]));

    assert.equal(result.audit.result, "error");
    assert.equal(result.value.__tag, "runtimeError");
    assert.equal(tagReads, 0, "host-owned nested tag accessors must never execute during result handling");
  });

  it("refuses a malformed numeric payload returned from a host-owned collection", async () => {
    const result = await runSourceFlow(`
      flow expose(values: Array<Float32>) -> Float32 {
        return values.first().unwrapOr(0)
      }
    `, "expose", new Map([["values", { __tag: "list", items: [{ __tag: "float", value: "not-a-number" }] }]]));

    assert.equal(result.value.__tag, "runtimeError", "a forged numeric tag with a non-number payload must not escape");
    assert.equal(result.audit.result, "error", "malformed numeric return must not be recorded as successful execution");
  });

  it("does not widen an out-of-i32 host Int from a collection into Int64", async () => {
    for (const [type, payload] of [
      ["Int64", -2147483649],
      ["Int64", 2147483648],
      ["UInt64", -1],
      ["UInt64", 2147483648],
    ]) {
      const result = await runSourceFlow(`
        flow expose(values: Array<${type}>) -> ${type} {
          return values.first().unwrapOr(0)
        }
      `, "expose", new Map([[
        "values", { __tag: "list", items: [{ __tag: "int", value: payload }] },
      ]]));

      assert.equal(result.value.__tag, "runtimeError", `out-of-i32 host Int must not widen into ${type}`);
      assert.equal(result.audit.result, "error");
    }
  });

  it("widens only valid i32 boundary values when returning Int64 or UInt64", async () => {
    for (const [type, payload, expected] of [
      ["Int64", -2147483648, i64(-2147483648n)],
      ["Int64", 2147483647, i64(2147483647n)],
      ["UInt64", 0, { __tag: "uint64", value: 0n }],
      ["UInt64", 2147483647, { __tag: "uint64", value: 2147483647n }],
    ]) {
      const result = await runSourceFlow(`
        flow expose(values: Array<${type}>) -> ${type} {
          return values.first().unwrapOr(0)
        }
      `, "expose", new Map([[
        "values", { __tag: "list", items: [{ __tag: "int", value: payload }] },
      ]]));

      assert.deepEqual(result.value, expected, `${type} must widen an in-range i32 exactly`);
      assert.equal(result.audit.result, "ok");
    }
  });

  it("validates the declared numeric return shape before recording success", async () => {
    let payloadReads = 0;
    const accessorPayload = { __tag: "float" };
    Object.defineProperty(accessorPayload, "value", {
      get() {
        payloadReads += 1;
        return 1.5;
      },
    });
    for (const [type, payload] of [
      ["Float32", { value: 1 }],
      ["Float32", { __tag: "forged-float", value: 1 }],
      ["Float32", { __tag: "float" }],
      ["Float32", accessorPayload],
      ["Float16", { __tag: "float", value: Number.NaN }],
      ["Float16", { __tag: "float", value: Number.POSITIVE_INFINITY }],
      ["Float16", { __tag: "float", value: 65520 }],
      ["Float64", { __tag: "float", value: Number.NaN }],
      ["Float64", { __tag: "float", value: Number.NEGATIVE_INFINITY }],
      ["Int", { __tag: "int", value: "not-an-integer" }],
      ["Int64", { __tag: "int64", value: "not-an-integer" }],
      ["UInt64", { __tag: "uint64", value: -1n }],
    ]) {
      const result = await runSourceFlow(`
        flow expose(values: Array<${type}>) -> ${type} {
          return values.first().unwrapOr(0)
        }
      `, "expose", new Map([["values", { __tag: "list", items: [payload] }]]));

      assert.equal(result.value.__tag, "runtimeError", `${type} malformed return must be refused`);
      assert.equal(result.audit.result, "error", `${type} malformed return must not receive an ok audit`);
    }
    assert.equal(payloadReads, 0, "numeric return validation must not invoke a host-owned payload accessor");
  });

  it("does not invoke a nested host payload accessor while admitting an optimized pure flow", async () => {
    let payloadReads = 0;
    const hostile = { __tag: "float" };
    Object.defineProperty(hostile, "value", {
      get() {
        payloadReads += 1;
        return 1.5;
      },
    });
    const result = await runSourceFlow(`
      pure flow expose(values: Array<Float32>) -> Float32 contract { effects {} } {
        return values.first().unwrapOr(0)
      }
    `, "expose", new Map([["values", { __tag: "list", items: [hostile] }]]), { pureFastPath: true });

    assert.equal(payloadReads, 0, "cache admission must not execute host-owned nested accessors");
    assert.equal(result.value.__tag, "runtimeError", "uninspectable host numeric values must reach checked refusal");
    assert.equal(result.audit.result, "error");
  });

  it("returns detached normalized values for valid numeric host collection results", async () => {
    for (const [type, tag, payload, expected] of [
      ["Int", "int", 7, { __tag: "int", value: 7 }],
      ["Float32", "float", 1.5, { __tag: "float", value: 1.5, width: 32 }],
      ["Float64", "float", 1.25, { __tag: "float", value: 1.25 }],
      ["Int64", "int64", 9007199254740993n, { __tag: "int64", value: 9007199254740993n }],
      ["UInt64", "uint64", 18446744073709551615n, { __tag: "uint64", value: 18446744073709551615n }],
    ]) {
      const hostValue = { __tag: tag, value: payload };
      const result = await runSourceFlow(`
        flow expose(values: Array<${type}>) -> ${type} {
          return values.first().unwrapOr(0)
        }
      `, "expose", new Map([["values", { __tag: "list", items: [hostValue] }]]));

      assert.deepEqual(result.value, expected, `${type} result must preserve its admitted numeric value`);
      assert.notStrictEqual(result.value, hostValue, `${type} output must be detached from host-owned storage`);
      assert.equal(result.audit.result, "ok");
    }
  });

  it("declines sync execution for an accessor-backed host tag without invoking it", () => {
    let tagReads = 0;
    const hostValue = {};
    Object.defineProperty(hostValue, "__tag", {
      get() {
        tagReads += 1;
        throw new Error("untrusted tag accessor ran");
      },
    });
    const source = parseProgram(`
      pure flow identity(value: Int) -> Int contract { effects {} } { return value }
    `, "host-tag-accessor.fungi");
    assert.equal(source.diagnostics.filter((d) => d.severity === "error").length, 0);
    resolveSymbols(source.ast);
    checkTypes(source.ast);

    const result = executeFlowSync("identity", new Map([["value", hostValue]]), source.ast, source.flows);

    assert.equal(result, null, "the sync tier must decline so the checked async interpreter can refuse it");
    assert.equal(tagReads, 0, "refusal must not execute a host-owned tag accessor");
  });
});

describe("runtime wide aliases retain lexical declaration ownership", () => {
  it('preserves the existing empty-record argument convention for parameterless calls', async () => {
    const result = await runSourceFlow('flow value() -> Int { return 42 }', 'value', {});
    assert.deepEqual(result.value, int(42));
  });
  it('an empty argument record cannot admit a missing wide parameter', async () => {
    const result = await runSourceFlow('flow value(x: UInt64) -> UInt64 { return x }', 'value', {});
    assert.equal(result.value.__tag, 'runtimeError');
    assert.equal(result.audit.result, 'error');
  });
  it('governed-secure local aliases do not contaminate a module alias', async () => {
    const source = `type Count = Int64
flow outside() -> Count { return -1 }
governed floor_3 secure flow inside() -> Count contract { intent "alias scope" effects {} types {
 type Count = UInt64
} } { return 9007199254740993 }`;
    assert.deepEqual((await runSourceFlow(source, 'outside')).value, i64(-1n));
    assert.deepEqual((await runSourceFlow(source, 'inside')).value,
      {__tag:'uint64',value:9007199254740993n});
  });
  it('restores the caller flow identity after a nested call', async () => {
    const result = await runSourceFlow(`flow leaf() -> Int { return 1 }
flow caller() -> Int64 {
 let retained: protected Int = 42
 let ignored: Int = leaf()
 let again = retained
 return 9007199254740993
}`,'caller');
    assert.deepEqual(result.value, i64(9007199254740993n));
    assert.deepEqual(result.diagnostics.filter(d => d.code === 'FUNGI-RUNTIME-005'), []);
  });
  it('still reports actual cross-flow access while the callee is active', async () => {
    // Deliberately bypasses unresolved-name frontend refusal to probe runtime context.
    const result = await runSourceFlow(`flow leaf() -> Int { return retained }
flow caller() -> Int64 {
 let retained: protected Int = 42
 let ignored = leaf()
 return 9007199254740993
}`,'caller');
    assert.deepEqual(result.value, i64(9007199254740993n));
    assert.ok(result.diagnostics.some(d => d.code === 'FUNGI-RUNTIME-005'
      && d.message.includes("accessed from 'leaf'")));
  });
  const parse = source => {
    const p = parseProgram(source, 'lexical-wide-alias.fungi');
    assert.deepEqual(p.diagnostics.filter(d => d.severity === 'error'), []);
    return p;
  };
  const checked = source => {
    const p = parse(source);
    assert.deepEqual(resolveSymbols(p.ast).diagnostics.filter(d => d.severity === 'error'), []);
    assert.deepEqual(checkTypes(p.ast).diagnostics.filter(d => d.severity === 'error'), []);
    return p;
  };
  for (const order of ['module-first', 'local-first']) {
    it(`parsed module/local shadow isolation, ${order}`, async () => {
      const outside = 'flow outside() -> Count { return -1 }';
      const inside = `flow inside() -> Count contract { types {
        type Count = UInt64
      } } { return 9007199254740993 }`;
      const p = checked(`type Count = Int64\n${order === 'module-first' ? outside+'\n'+inside : inside+'\n'+outside}`);
      assert.deepEqual((await executeFlow('outside', new Map(), p.ast)).value, i64(-1n));
      assert.deepEqual((await executeFlow('inside', new Map(), p.ast)).value,
        { __tag: 'uint64', value: 9007199254740993n });
    });
  }
  it('a module alias chain resolves at its declaration, not through a local shadow', async () => {
    const p = checked(`type Count = Int64
type Signed = Count
flow inside() -> Signed contract { types {
 type Count = UInt64
} } { return -1 }`);
    assert.deepEqual((await executeFlow('inside', new Map(), p.ast)).value, i64(-1n));
  });
  it('callee parameter ownership differs from the caller local alias', async () => {
    const p = parse(`type Count = Int64
flow acceptCount(x: Count) -> Count { return x }
flow caller() -> Int contract { types {
 type Count = UInt64
} } { let ignored: Int64 = acceptCount(-1)
 return 7 }`);
    // Known frontend alias-call typing is not assumed admitted by this probe.
    assert.deepEqual((await executeFlow('caller', new Map(), p.ast)).value, int(7));
  });
  for (const literal of ['9007199254740993', '-1']) {
    it(`local callback inherits its defining flow alias; literal=${literal}`, async () => {
      const p = parse(`type Count = Int64
flow caller() -> Count contract { types {
 type Count = UInt64
} } {
 fn identity(x: Count) -> Count { return x }
 return identity(${literal})
}`);
      const result = await executeFlow('caller', new Map(), p.ast);
      if (literal === '-1') assert.equal(result.value.__tag, 'runtimeError');
      else assert.deepEqual(result.value, { __tag: 'uint64', value: 9007199254740993n });
    });
  }
  for (const second of ['Int64', 'UInt64']) {
    it(`same-scope alias duplicates refuse even when targets ${second === 'Int64' ? 'agree' : 'differ'}`, async () => {
      const p = parse(`flow bad() -> Count contract { types {
 type Count = Int64
 type Count = ${second}
} } { return 7 }`);
      assert.equal((await executeFlow('bad', new Map(), p.ast)).value.__tag, 'runtimeError');
    });
  }
  it('a local alias cycle refuses locally without contaminating the module twin', async () => {
    const p = parse(`type Count = Int64
flow outside() -> Count { return -1 }
flow bad() -> Count contract { types {
 type Count = Loop
 type Loop = Count
} } { return 7 }`);
    assert.equal((await executeFlow('bad', new Map(), p.ast)).value.__tag, 'runtimeError');
    assert.deepEqual((await executeFlow('outside', new Map(), p.ast)).value, i64(-1n));
  });
  it('a local narrow alias remains eligible for sync despite an unrelated module wide alias', () => {
    const p = checked(`type Count = UInt64
pure flow narrow(x: Count) -> Count contract { effects {} types {
 type Count = Int
} } { return x }`);
    assert.deepEqual(tryPureFlowSync(p.ast, p.flows, 'narrow', new Map([['x', int(42)]])), int(42));
  });
  for (const kind of ['flow', 'fn']) {
    it(`invalid earlier aliased ${kind} argument prevents later side effects`, async () => {
      const output = [];
      const target = `${kind} ignore(value: Count, later: Void) -> Int { return 7 }`;
      const source = `type Count = UInt64\n${kind === 'flow' ? target : ''}
flow caller() -> Int { ${kind === 'fn' ? target : ''}
 return ignore(-1, println("must not execute")) }`;
      const result = await runSourceFlow(source, 'caller', new Map(), {outputSink: line => output.push(line)});
      assert.equal(result.value.__tag, 'runtimeError');
      assert.deepEqual(output, []);
    });
  }
  for (const [type,tag,values] of [
    ['Int64','int64',[-9223372036854775808n,9007199254740993n,9223372036854775807n]],
    ['UInt64','uint64',[0n,9007199254740993n,18446744073709551615n]],
  ]) {
    it(`legitimate ${type} host values are exact detached snapshots`, async () => {
      for (const value of values) {
        const original = {__tag:tag,value};
        const result = await runSourceFlow(`flow identity(x: ${type}) -> ${type} { return x }`, 'identity', new Map([['x',original]]));
        assert.deepEqual(result.value,{__tag:tag,value});
        assert.notStrictEqual(result.value,original);
        original.value = 17n;
        assert.equal(result.value.value,value);
      }
    });
  }
});

describe("wide expression admission completes before later argument effects", () => {
  // These are direct runtime defenses, not frontend-admitted programs. In particular,
  // the comparison argument is rejected by checkTypes; the bare resolver rejects println.
  for (const [base, tag] of [["Int64", "int64"], ["UInt64", "uint64"]]) {
    for (const aliased of [false, true]) {
      const type = aliased ? "Wide" : base;
      const alias = aliased ? `type Wide = ${base}` : "";
      for (const local of [false, true]) {
        const callee = `${local ? "fn" : "flow"} ignore(value: ${type}, later: Void) -> Int { return 7 }`;
        for (const [name, expression, message, outputBeforeRefusal] of [
          ["comparison", "1 < 2", `cannot represent bool as ${base}`, []],
          ["string", '"not an integer"', `cannot represent string as ${base}`, []],
          ["Bool call", "booleanValue()", `cannot represent bool as ${base}`, ["first"]],
          ["generic runtime error", "badValue()", `Invalid ${base} argument`, ["first"]],
          ["checked trap", "1 / 0", "DivisionByZero", []],
        ]) {
          it(`${base} ${aliased ? "alias" : "builtin"} ${local ? "fn" : "flow"}: ${name} refuses before later argument`, async () => {
            const parsed = parseProgram(`
              ${alias}
              ${local ? "" : callee}
              flow caller() -> Int {
                ${local ? callee : ""}
                fn booleanValue() -> Bool { println("first") return true }
                fn badValue() -> Int { println("first") return "x" - "y" }
                return ignore(${expression}, println("later"))
              }
            `, "wide-expression-order.fungi");
            assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
            const names = resolveSymbols(parsed.ast);
            const types = checkTypes(parsed.ast);
            assert.ok(names.diagnostics.some(d => d.code === "FUNGI-NAME-001" && d.message.includes("println")));
            if (name === "comparison") {
              assert.ok(types.diagnostics.some(d => d.code === "FUNGI-TYPE-005" && d.message.includes("Bool")),
                "comparison fixture must remain explicitly frontend-rejected");
            }
            const output = [];
            const result = await executeFlow("caller", new Map(), parsed.ast, undefined, undefined, undefined,
              { outputSink: line => output.push(line) });
            assert.deepEqual(output, outputBeforeRefusal, "no later argument or repeated first evaluation");
            assert.deepEqual(result.value, { __tag: "runtimeError", message });
          });
        }

        it(`${base} ${aliased ? "alias" : "builtin"} ${local ? "fn" : "flow"}: exact arithmetic evaluates each argument once`, async () => {
          const output = [];
          const identity = `${local ? "fn" : "flow"} identity(value: ${type}, later: Void) -> ${type} { return value }`;
          const result = await runSourceFlow(`
            ${alias}
            ${local ? "" : identity}
            flow caller() -> ${base} {
              ${local ? identity : ""}
              fn tick() -> Int { println("first") return 1 }
              return identity(tick() + 9007199254740992, println("later"))
            }
          `, "caller", new Map(), { outputSink: line => output.push(line) });
          assert.deepEqual(output, ["first", "later"]);
          assert.deepEqual(result.value, { __tag: tag, value: 9007199254740993n });
        });
      }
    }

    for (const kind of ["flow", "fn", "callback"]) {
      for (const invalid of [true, false]) {
        it(`${base} ${kind} return admits only a wide result; comparison=${invalid}`, async () => {
          const expression = invalid ? "1 < 2" : "9007199254740992 + 1";
          const producer = `${kind === "flow" ? "flow" : "fn"} produce(value: Int) -> ${base} {
            println("producer") return ${expression}
          }`;
          const output = [];
          const result = await runSourceFlow(`
            ${kind === "flow" ? producer : ""}
            flow caller(values: Array<Int>) -> ${kind === "callback" ? `Array<${base}>` : base} {
              ${kind === "flow" ? "" : producer}
              return ${kind === "callback" ? "values.map(produce)" : "produce(1)"}
            }
          `, "caller", new Map([["values", { __tag: "list", items: [int(1)] }]]),
          { outputSink: line => output.push(line) });
          assert.deepEqual(output, ["producer"]);
          const expected = { __tag: tag, value: 9007199254740993n };
          // A direct wide caller re-admits the returned runtimeError and deliberately
          // replaces its non-trap message. The list callback exposes the first refusal.
          assert.deepEqual(result.value, invalid
            ? { __tag: "runtimeError", message: kind === "callback"
              ? `cannot represent bool as ${base}` : `Invalid ${base} argument` }
            : kind === "callback" ? { __tag: "list", items: [expected] } : expected);
        });
      }
    }

    it(`${base} callee alias belongs to its declaration despite the caller's opposite alias`, async () => {
      const output = [];
      const value = base === "Int64" ? "-9007199254740993" : "18446744073709551615";
      const result = await runSourceFlow(`
        type Wide = ${base}
        flow identity(value: Wide, later: Void) -> Wide { return value }
        flow caller() -> ${base} contract { types {
          type Wide = ${base === "Int64" ? "UInt64" : "Int64"}
        } } { return identity(${value}, println("later"))
        }
      `, "caller", new Map(), { outputSink: line => output.push(line) });
      assert.deepEqual(output, ["later"]);
      assert.deepEqual(result.value, { __tag: tag, value: BigInt(value) });
    });
  }
});

describe("interpreter int64 dispatch: exact arithmetic above 2^53", () => {
  it("int64 + int64 is exact past the JS-number precision wall", () => {
    assert.deepEqual(run(i64(9007199254740993n), "+", i64(2n)), { __tag: "int64", value: 9007199254740995n });
  });
  it("int64 * int64 stays exact (a JS number would round)", () => {
    assert.deepEqual(run(i64(3037000499n), "*", i64(3037000499n)), { __tag: "int64", value: 9223372030926249001n });
  });
});

describe("interpreter int64 dispatch: traps fail closed (Fork A = TRAP)", () => {
  it("overflow → runtimeError, not a silent wrap", () => {
    assert.equal(run(i64(I64_MAX), "+", i64(1n)).__tag, "runtimeError");
    assert.equal(run(i64(I64_MIN), "-", i64(1n)).__tag, "runtimeError");
  });
  it("divide / modulo by zero → runtimeError", () => {
    assert.equal(run(i64(5n), "/", i64(0n)).__tag, "runtimeError");
    assert.equal(run(i64(5n), "%", i64(0n)).__tag, "runtimeError");
  });
  it("INT64_MIN / -1 → runtimeError (the one signed-div overflow)", () => {
    assert.equal(run(i64(I64_MIN), "/", i64(-1n)).__tag, "runtimeError");
  });
});

describe("interpreter int64 dispatch: comparisons + mixed Int/Int64 promotion", () => {
  it("int64 comparisons yield bools", () => {
    assert.deepEqual(run(i64(5n), "<", i64(10n)), { __tag: "bool", value: true });
    assert.deepEqual(run(i64(10n), "==", i64(10n)), { __tag: "bool", value: true });
    assert.deepEqual(run(i64(10n), "!=", i64(11n)), { __tag: "bool", value: true });
  });
  it("mixed Int + Int64 promotes the i32 operand → Int64 result (both directions)", () => {
    assert.deepEqual(run(int(5), "+", i64(10n)), { __tag: "int64", value: 15n });
    assert.deepEqual(run(i64(10n), "+", int(5)), { __tag: "int64", value: 15n });
    assert.deepEqual(run(i64(9007199254740993n), "+", int(2)), { __tag: "int64", value: 9007199254740995n });
  });
  it("mixed Int + Int64 comparison promotes correctly", () => {
    assert.deepEqual(run(int(5), "<", i64(10n)), { __tag: "bool", value: true });
    assert.deepEqual(run(i64(10n), ">", int(5)), { __tag: "bool", value: true });
  });
});
