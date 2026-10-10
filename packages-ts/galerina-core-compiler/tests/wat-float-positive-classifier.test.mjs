import assert from "node:assert/strict";
import { test } from "node:test";
import * as L from "../dist/index.js";

const aliases = [
  { receiver: "Float", type: "Float" },
  { receiver: "Float64", type: "Float64" },
  { receiver: "Double", type: "Double" },
];

const values = [
  { name: "positive fraction", value: 0.5, expected: true },
  { name: "smallest positive subnormal", value: Number.MIN_VALUE, expected: true },
  { name: "largest finite", value: Number.MAX_VALUE, expected: true },
  { name: "positive infinity", value: Number.POSITIVE_INFINITY, expected: true },
  { name: "positive zero", value: 0, expected: false },
  { name: "negative zero", value: -0, expected: false },
  { name: "negative finite", value: -0.5, expected: false },
  { name: "negative infinity", value: Number.NEGATIVE_INFINITY, expected: false },
  { name: "NaN", value: Number.NaN, expected: false },
];

const tagged = (value) => ({ __tag: "float", value });

test("Float/Float64/Double.isPositive preserve the raw f64 greater-than-zero truth table", async (t) => {
  const flows = aliases.map(({ receiver, type }) => `
pure flow classify${receiver}(value: ${type}) -> Bool
contract { intent { "Classify raw binary-float ingress without releasing the input." } }
{ return ${receiver}.isPositive(value) }
`).join("\n");
  const program = L.parseProgram(flows, "float-positive-classifier.fungi");
  assert.deepEqual(program.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
  assert.deepEqual(L.checkTypes(program.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);

  for (const { receiver } of aliases) {
    for (const entry of values) {
      await t.test(`interpreter ${receiver} ${entry.name}`, async () => {
        const result = await L.executeFlow(
          `classify${receiver}`,
          new Map([["value", tagged(entry.value)]]),
          program.ast,
          program.flows,
        );
        assert.equal(result.value?.__tag, "bool");
        assert.equal(result.value.value, entry.expected);
      });
    }
  }

  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true));
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const { instance } = await WebAssembly.instantiate(assembled.wasm, L.createHostRuntime().imports);

  for (const { receiver } of aliases) {
    for (const entry of values) {
      await t.test(`WASM ${receiver} ${entry.name}`, () => {
        assert.equal(instance.exports[`classify${receiver}`](entry.value), entry.expected ? 1 : 0);
      });
    }
  }
});

test("isPositive has Bool inference and rejects unsupported static calls", () => {
  for (const { receiver, type } of aliases) {
    const inferred = L.parseProgram(`
pure flow wrongReturn(value: ${type}) -> String
contract { intent { "Prove the classifier result infers as Bool." } }
{ return ${receiver}.isPositive(value) }
`, `float-positive-${receiver}-inference.fungi`);
    assert.ok(L.checkTypes(inferred.ast).diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-008"));
  }

  const invalidCases = [
    ["missing argument", "Float64.isPositive()", "FUNGI-TYPE-007"],
    ["extra argument", "Float64.isPositive(value, value)", "FUNGI-TYPE-007"],
    ["String argument", "Float64.isPositive(text)", "FUNGI-TYPE-005"],
    ["Bool argument", "Float64.isPositive(flag)", "FUNGI-TYPE-005"],
    ["Decimal argument", "Float64.isPositive(decimal)", "FUNGI-TYPE-005"],
    ["Int argument", "Float64.isPositive(count)", "FUNGI-TYPE-005"],
    ["unsupported receiver", "Decimal.isPositive(decimal)", "FUNGI-TYPE-005"],
    ["unsupported numeric instance", "value.isPositive()", "FUNGI-TYPE-005"],
    ["uninferred argument", "Float64.isPositive(mystery)", "FUNGI-TYPE-005"],
  ];
  for (const [name, expression, code] of invalidCases) {
    const program = L.parseProgram(`
pure flow invalid(value: Float64, text: String, flag: Bool, decimal: Decimal, count: Int) -> Bool
contract { intent { "Reject a malformed positive classifier call." } }
{ return ${expression} }
`, `float-positive-${name.replaceAll(" ", "-")}.fungi`);
    assert.ok(L.checkTypes(program.ast).diagnostics.some((diagnostic) => diagnostic.code === code), name);
  }

  const unrelatedMethod = L.parseProgram(`
record Widget { enabled: Bool }
pure flow libraryCall(widget: Widget) -> Bool
contract { intent { "Do not reserve unrelated library method names." } }
{ return widget.isPositive() }
`, "unrelated-is-positive-method.fungi");
  assert.equal(
    L.checkTypes(unrelatedMethod.ast).diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-005"),
    false,
  );
});

function assertDetachedHostError(result, original, originalDescriptors, accessorReads) {
  assert.notStrictEqual(result.value, original, "host error must be detached");
  assert.equal(accessorReads, 0, "caller accessors must not be read");
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(result.value),
    Object.getOwnPropertyDescriptors({ __tag: "runtimeError", message: "Host-supplied runtime error" }),
    "host error must contain only inert generic data",
  );
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(original),
    originalDescriptors,
    "caller input must remain unchanged",
  );
}

test("isPositive rejects malformed values without coercion and detaches caller-owned errors at entry", async () => {
  const program = L.parseProgram(`
pure flow classify(value: Float64) -> Bool
contract { intent { "Reject malformed runtime values before numeric classification." } }
{ return Float64.isPositive(value) }
`, "float-positive-runtime-boundary.fungi");
  assert.deepEqual(program.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);

  for (const [name, value] of [
    ["wrong tag", { __tag: "string", value: "1" }],
    ["forged float payload", { __tag: "float", value: "1" }],
    ["forged integer payload", { __tag: "int", value: "1" }],
  ]) {
    const result = await L.executeFlow("classify", new Map([["value", value]]), program.ast, program.flows);
    assert.equal(result.value?.__tag, "runtimeError", name);
    assert.equal(result.value.message, "InvalidFloatClassifierInput", name);
  }

  const upstream = { __tag: "runtimeError", message: "UpstreamClassifierFailure" };
  const originalDescriptors = Object.getOwnPropertyDescriptors(upstream);
  const args = new Map([["value", upstream]]);
  const propagated = await L.executeFlow("classify", args, program.ast, program.flows);
  assertDetachedHostError(propagated, upstream, originalDescriptors, 0);
  assert.strictEqual(args.get("value"), upstream, "caller argument map must remain unchanged");

  for (const accessorTag of [false, true]) {
    let reads = 0;
    const hostile = {
      get message() { reads += 1; throw new Error("CallerMessageGetterExecuted"); },
    };
    Object.defineProperty(hostile, "__tag", accessorTag
      ? { enumerable: true, get() { reads += 1; throw new Error("CallerTagGetterExecuted"); } }
      : { enumerable: true, value: "runtimeError" });
    const before = Object.getOwnPropertyDescriptors(hostile);
    const hostileArgs = new Map([["value", hostile]]);
    const result = await L.executeFlow("classify", hostileArgs, program.ast, program.flows);
    assertDetachedHostError(result, hostile, before, reads);
    assert.strictEqual(hostileArgs.get("value"), hostile);
  }

  const valid = tagged(0.5);
  const validBefore = Object.getOwnPropertyDescriptors(valid);
  const positive = await L.executeFlow("classify", new Map([["value", valid]]), program.ast, program.flows);
  assert.deepEqual(positive.value, { __tag: "bool", value: true });
  assert.deepEqual(Object.getOwnPropertyDescriptors(valid), validBefore);
});

test("host-error admission oracle rejects identity leakage and caller accessor use", () => {
  // Synthetic result controls test this oracle, not production fault injection.
  const original = { __tag: "runtimeError", message: "Host-supplied runtime error" };
  const before = Object.getOwnPropertyDescriptors(original);
  const detached = { value: { ...original } };
  assertDetachedHostError(detached, original, before, 0);
  assert.throws(
    () => assertDetachedHostError({ value: original }, original, before, 0),
    (error) => error.code === "ERR_ASSERTION" && error.operator === "notStrictEqual"
      && error.message.includes("host error must be detached"),
  );

  let reads = 0;
  const hostile = {
    __tag: "runtimeError",
    get message() { reads += 1; return "Host-supplied runtime error"; },
  };
  const hostileBefore = Object.getOwnPropertyDescriptors(hostile);
  assertDetachedHostError(detached, hostile, hostileBefore, reads);
  const accessorUsingResult = { value: { __tag: "runtimeError", message: hostile.message } };
  assert.throws(
    () => assertDetachedHostError(accessorUsingResult, hostile, hostileBefore, reads),
    (error) => error.code === "ERR_ASSERTION" && error.actual === 1 && error.expected === 0
      && error.message.includes("caller accessors must not be read"),
  );
});

test("isPositive runtime dispatch enforces exact arity while preserving an upstream error", async () => {
  const context = {
    recordEffect() {},
    resolveIdentifier() { return undefined; },
    async callFlow() { return { __tag: "void" }; },
    async applyFn() { return { __tag: "void" }; },
  };
  const missing = await L.callStdlib("Float64.isPositive", undefined, [], context);
  assert.equal(missing?.__tag, "runtimeError");
  assert.equal(missing.message, "InvalidFloatClassifierArgumentCount");

  const extra = await L.callStdlib(
    "Float64.isPositive",
    undefined,
    [tagged(1), tagged(2)],
    context,
  );
  assert.equal(extra?.__tag, "runtimeError");
  assert.equal(extra.message, "InvalidFloatClassifierArgumentCount");

  const upstream = { __tag: "runtimeError", message: "UpstreamClassifierFailure" };
  const propagated = await L.callStdlib(
    "Float64.isPositive",
    undefined,
    [upstream, tagged(2)],
    context,
  );
  assert.strictEqual(propagated, upstream);
});

test("binary-float classifier namespaces cannot be shadowed by parameters or locals", async (t) => {
  for (const { receiver, type } of aliases) {
    for (const bindingKind of ["parameter", "local"]) {
      await t.test(`${receiver} ${bindingKind} shadow`, async () => {
        const parameters = bindingKind === "parameter"
          ? `${receiver}: String, value: ${type}`
          : `value: ${type}`;
        const local = bindingKind === "local" ? `let ${receiver}: String = "shadow"\n` : "";
        const source = `
pure flow shadow(${parameters}) -> Bool
contract { intent { "Reject a lexical binding that masks a binary-float classifier namespace." } }
{ ${local}return ${receiver}.isPositive(value) }
`;
        const program = L.parseProgram(source, `float-positive-${receiver}-${bindingKind}-shadow.fungi`);
        assert.deepEqual(program.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
        const typeErrors = L.checkTypes(program.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
        assert.equal(typeErrors.some((diagnostic) =>
          diagnostic.code === "FUNGI-TYPE-005" && diagnostic.message.includes("shadowed by a lexical binding")), true);

        const interpreterArgs = bindingKind === "parameter"
          ? new Map([[receiver, { __tag: "string", value: "shadow" }], ["value", tagged(1)]])
          : new Map([["value", tagged(1)]]);
        const interpreted = await L.executeFlow("shadow", interpreterArgs, program.ast, program.flows);
        assert.equal(interpreted.value?.__tag, "runtimeError");

        // Deliberately bypass the type-check result: the low-level emitter must still refuse.
        const effects = L.checkEffects(program.flows, program.ast);
        const { gir } = L.emitGIR(program.ast, program.flows, effects);
        const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true));
        assert.match(wat, /isPositive namespace shadowed/);
        const assembled = await L.assembleWAT(wat);
        assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
        const { instance } = await WebAssembly.instantiate(assembled.wasm, L.createHostRuntime().imports);
        assert.throws(
          () => bindingKind === "parameter" ? instance.exports.shadow(0, 1) : instance.exports.shadow(1),
          WebAssembly.RuntimeError,
        );
      });
    }
  }
});

const unsupportedJoinMessage = "FUNGI-WAT-METHOD-001: method 'join' is not lowered to WASM. WAT emission refuses rather than emit an (unreachable) stub or an undefined callee (fail-closed).";

function assertShadowDiagnostic(errors, receiver, inferredType) {
  const shadows = errors.filter(diagnostic => diagnostic.code === "FUNGI-TYPE-005"
    && diagnostic.message.includes("shadowed by a lexical binding"));
  assert.deepEqual(shadows.map(({ code, name, severity, message }) => ({ code, name, severity, message })), [{
    code: "FUNGI-TYPE-005", name: "INVALID_CALL_ARG_TYPE", severity: "error",
    message: `Classifier namespace '${receiver}' is shadowed by a lexical binding of type '${inferredType}'.`,
  }]);
}

test("checker-unknown classifier shadows retain exact unsupported-join WAT refusal", async (t) => {
  for (const { receiver, type } of aliases) {
    await t.test(`${receiver} unknown-inference local shadow`, async () => {
      const program = L.parseProgram(`
pure flow shadow(value: ${type}) -> Bool
contract { intent { "Reject a classifier namespace shadow even when its binding type is not inferred." } }
{
  let ${receiver} = "shadow".split(",").join("")
  return ${receiver}.isPositive(value)
}
`, `float-positive-${receiver}-unknown-local-shadow.fungi`);
      assert.deepEqual(program.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
      const typeErrors = L.checkTypes(program.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      assert.equal(typeErrors.some((diagnostic) =>
        diagnostic.code === "FUNGI-TYPE-005" && diagnostic.message.includes("shadowed by a lexical binding")), true);

      assertShadowDiagnostic(typeErrors, receiver, "unknown");

      const effects = L.checkEffects(program.flows, program.ast);
      const { gir } = L.emitGIR(program.ast, program.flows, effects);
      // join refuses during initializer lowering, before the emitter records
      // the binding. This is join refusal, NOT emitter namespace-shadow proof.
      assert.throws(() => L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true), {
        name: "Error", message: unsupportedJoinMessage,
      });
    });
  }
});

test("checker-unknown bindings stay flow-local even though join prevents WAT generation", async () => {
  const program = L.parseProgram(`
pure flow shadowed(value: Float64) -> Bool
contract { intent { "Keep the unknown binding inside this flow." } }
{
  let Float64 = "shadow".split(",").join("")
  return Float64.isPositive(value)
}

pure flow unshadowed(value: Float64) -> Bool
contract { intent { "Recover the builtin namespace in the next flow." } }
{ return Float64.isPositive(value) }
`, "float-positive-unknown-shadow-scope-control.fungi");
  assert.deepEqual(program.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
  const shadowErrors = L.checkTypes(program.ast).diagnostics.filter((diagnostic) =>
    diagnostic.code === "FUNGI-TYPE-005" && diagnostic.message.includes("shadowed by a lexical binding"));
  assert.equal(shadowErrors.length, 1);
  assertShadowDiagnostic(shadowErrors, "Float64", "unknown");

  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  assert.throws(() => L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true), {
    name: "Error", message: unsupportedJoinMessage,
  });
});

async function instantiateClassifierWat(wat) {
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const { instance } = await WebAssembly.instantiate(assembled.wasm, L.createHostRuntime().imports);
  return instance;
}

function replaceSingleWatSite(wat, site, replacement) {
  assert.equal(wat.split(site).length - 1, 1, "mutation must bind one exact WAT site");
  return wat.replace(site, replacement);
}

function assertShadowTrap(instance) {
  assert.throws(() => instance.exports.shadowed(1), WebAssembly.RuntimeError, "shadowed namespace must trap");
}

function assertLaterClassifier(instance) {
  assert.equal(instance.exports.unshadowed(1), 1, "later positive input must classify true");
  assert.equal(instance.exports.unshadowed(-1), 0, "later negative input must classify false");
}

test("emitter-unknown (checker Bool) shadows trap and later flow executes in the same Wasm instance", async (t) => {
  for (const { receiver, type } of aliases) {
    await t.test(`${receiver} supported initializer and discriminating mutations`, async () => {
      // A DIFFERENT alias avoids shadowing the initializer at the checker.
      // inferExprType in the emitter has no isPositive case; checker inference
      // explicitly knows Bool. This rejected source exercises low-level defense.
      const initializer = receiver === "Float64" ? "Double" : "Float64";
      const program = L.parseProgram(`
pure flow shadowed(value: ${type}) -> Bool
contract { intent { "Refuse a lexical classifier shadow." } }
{
  let ${receiver} = ${initializer}.isPositive(value)
  return ${receiver}.isPositive(value)
}
pure flow unshadowed(value: ${type}) -> Bool
contract { intent { "Keep the later builtin classifier available." } }
{ return ${receiver}.isPositive(value) }
`, `float-positive-${receiver}-emitter-unknown.fungi`);
      assert.deepEqual(program.diagnostics.filter(d => d.severity === "error"), []);
      const errors = L.checkTypes(program.ast).diagnostics.filter(d => d.severity === "error");
      assertShadowDiagnostic(errors, receiver, "Bool");
      assert.deepEqual(errors.filter(d => d.code !== "FUNGI-TYPE-005").map(({ code, message }) => ({ code, message })), [{
        code: "FUNGI-PIPELINE-001", message: "Unknown method 'isPositive' on receiver type 'Bool'.",
      }]);
      assert.equal(errors.length, 2);

      const { gir } = L.emitGIR(program.ast, program.flows, L.checkEffects(program.flows, program.ast));
      const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true));
      const instance = await instantiateClassifierWat(wat);
      assertShadowTrap(instance);
      assertLaterClassifier(instance);

      // Remove only the generated rejection expression. Assembly must succeed;
      // the same trap oracle must fail because the shadow now returns a value.
      const shadowSite = "(unreachable) (; isPositive namespace shadowed by lexical binding — fail closed (emitter cannot lower) ;)";
      const admitted = await instantiateClassifierWat(replaceSingleWatSite(wat, shadowSite,
        "(call $fungi_is_positive_f64 (local.get $p0))"));
      assert.equal(admitted.exports.shadowed(1), 1);
      assertLaterClassifier(admitted);
      assert.throws(() => assertShadowTrap(admitted), error =>
        error instanceof assert.AssertionError && error.code === "ERR_ASSERTION" && error.operator === "throws");

      // Bind the later function, not the initializer's same-spelled call.
      const laterSite = "(func $unshadowed (param $p0 f64) (result i32)\n    (call $fungi_is_positive_f64 (local.get $p0))\n  )";
      for (const constant of [0, 1]) {
        const broken = await instantiateClassifierWat(replaceSingleWatSite(wat, laterSite,
          `(func $unshadowed (param $p0 f64) (result i32)\n    (i32.const ${constant})\n  )`));
        assertShadowTrap(broken);
        assert.equal(broken.exports.unshadowed(1), constant);
        assert.equal(broken.exports.unshadowed(-1), constant);
        assert.throws(() => assertLaterClassifier(broken), error =>
          error instanceof assert.AssertionError && error.code === "ERR_ASSERTION"
          && error.operator === "strictEqual" && error.actual === constant && error.expected === 1 - constant);
      }
    });
  }
});

test("isPositive evaluates guarded arithmetic once and preserves non-finite operand failures", async (t) => {
  const program = L.parseProgram(`
pure flow expression(a: Float64, b: Float64) -> Bool
contract { intent { "Preserve guarded arithmetic before positive classification." } }
{ return Float64.isPositive(a / b) }
`, "float-positive-expression.fungi");
  assert.deepEqual(program.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);

  for (const [name, a, b] of [["zero divided by zero", 0, 0], ["one divided by zero", 1, 0]]) {
    await t.test(`interpreter ${name}`, async () => {
      const result = await L.executeFlow(
        "expression",
        new Map([["a", tagged(a)], ["b", tagged(b)]]),
        program.ast,
        program.flows,
      );
      assert.equal(result.value?.__tag, "runtimeError");
      assert.equal(result.value.message, "NonFiniteFloat");
    });
  }

  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true));
  assert.equal((wat.match(/call \$fungi_is_positive_f64/g) ?? []).length, 1, "classifier receives one emitted argument expression");
  assert.equal((wat.match(/\(f64\.div/g) ?? []).length, 1, "classifier argument arithmetic is emitted once");
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const { instance } = await WebAssembly.instantiate(assembled.wasm, L.createHostRuntime().imports);
  for (const [name, a, b] of [["zero divided by zero", 0, 0], ["one divided by zero", 1, 0]]) {
    await t.test(`WASM ${name}`, () => assert.throws(() => instance.exports.expression(a, b), WebAssembly.RuntimeError));
  }
});
