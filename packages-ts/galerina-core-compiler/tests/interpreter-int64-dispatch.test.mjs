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
import { checkTypes, executeFlow, executeFlowSync, parseProgram, resolveSymbols, tryPureFlowSync } from "../dist/index.js";
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

  it("refuses an accessor-backed host tag in the synchronous flow entry", () => {
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

    assert.equal(result?.__tag, "runtimeError", "sync entry must refuse uninspectable host values");
    assert.notStrictEqual(result, hostValue);
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
