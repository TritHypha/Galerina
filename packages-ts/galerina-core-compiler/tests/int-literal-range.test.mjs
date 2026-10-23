// =============================================================================
// FUNGI-TYPE-024 — i32 literal-range warning (RD-0277 §4)
//
// Galerina `Int` lowers to WASM i32. A decimal integer literal outside the i32
// range wraps SILENTLY in lowering (2654435761 -> -1640531535). The runtime
// overflow trap is the fail-closed backstop for COMPUTED overflow, but a
// constant that cannot be represented was silent — this surfaces it.
//
// WARNING (not error): a bare integer literal is also accepted in Float context
// (return 5 in a -> Float flow type-checks), so an error would false-reject a
// legitimate 2654435761-as-Float. Hex/bin/oct (Byte) and decimals (Float) are
// different lanes and skipped.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  admitAndInstantiate,
  assembleWAT,
  buildWATModuleFromGIR,
  checkEffects,
  checkTypes,
  createHostRuntime,
  emitGIR,
  executeFlow,
  executeFlowSync,
  generateRunnerKeypair,
  parseProgram,
  renderWAT,
  resolveSymbols,
  signWasm,
} from "../dist/index.js";

function ty024(ret, expr) {
  const p = parseProgram(
    `@version 1\npure flow f() -> ${ret}\ncontract { effects {} }\n{ return ${expr} }`,
    "t.fungi",
  );
  return checkTypes(p.ast).diagnostics.filter((d) => d.code === "FUNGI-TYPE-024");
}

describe("FUNGI-TYPE-024 i32 literal-range (RD-0277 §4)", () => {
  it("warns on the RD-0277 constant 2654435761 (> i32 max) used as Int", () => {
    const d = ty024("Int", "2654435761");
    assert.equal(d.length, 1, "a > i32 literal must be surfaced, not silent");
    assert.equal(d[0].severity, "warning");
  });

  it("warns on any decimal literal above i32 max", () => {
    assert.equal(ty024("Int", "3000000000")[0]?.severity, "warning");
    assert.equal(ty024("Int", "9999999999")[0]?.severity, "warning");
  });

  it("warns on an underscore-separated decimal literal above i32 max", () => {
    assert.equal(ty024("Int", "2_147_483_648")[0]?.severity, "warning");
  });

  it("rejects a dotless exponent Float in an Int return context", () => {
    const parsed = parseProgram(
      "@version 1\npure flow f() -> Int contract { effects {} } { return 1e2 }",
      "dotless-exponent-int-context.fungi",
    );
    const checked = checkTypes(parsed.ast);
    assert.ok(checked.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      `1e2 evaluates as Float and must not be accepted as Int: ${JSON.stringify(checked.diagnostics)}`);
  });

  it("does NOT warn at the i32 max boundary (2147483647)", () => {
    assert.equal(ty024("Int", "2147483647").length, 0);
  });

  it("does NOT warn on small in-range literals", () => {
    assert.equal(ty024("Int", "100").length, 0);
    assert.equal(ty024("Int", "65535").length, 0);
  });

  it("does NOT warn on a Float literal (different lane)", () => {
    assert.equal(ty024("Float", "2654435761.0").length, 0);
  });

  it("does NOT warn on hex/Byte literals (different lane)", () => {
    assert.equal(ty024("Byte", "0xFFFFFFFF").length, 0);
    assert.equal(ty024("Byte", "0XFFFFFFFF").length, 0);
  });

  it("is a WARNING, not an error — Float coercion is legal and the runtime trap is the hard backstop", () => {
    const d = ty024("Int", "2654435761");
    assert.equal(d[0].severity, "warning");
    assert.notEqual(d[0].severity, "error");
  });
});

describe("radix integer literals across interpreter and WASM", () => {
  it("preserves the sign for hexadecimal, binary, and octal source literals", async () => {
    for (const [literal, expected] of [["-0x10", -16], ["-0b10", -2], ["-0o10", -8], ["-0x80000000", -2147483648]]) {
      const parsed = parseProgram(
        `@version 1\npure flow f() -> Int contract { effects {} } { return ${literal} }`,
        "negative-radix-int.fungi",
      );
      assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, `${literal} must parse`);
      resolveSymbols(parsed.ast);
      checkTypes(parsed.ast);
      const result = await executeFlow("f", new Map(), parsed.ast);
      assert.deepEqual(result.value, { __tag: "int", value: expected }, `${literal} must retain its exact signed value`);
    }
  });

  it("agrees across sync, checked-walker, and assembled-WASM paths with radix arithmetic and signed boundaries", async () => {
    const cases = [
      ["hexPositive", "0x10", 16],
      ["hexNegative", "-0x10", -16],
      ["hexLettersPositive", "0xDEAD", 57005],
      ["hexLettersNegative", "-0xDEAD", -57005],
      ["hexIntMin", "-0x80000000", -2147483648],
      ["binaryPositive", "0b10", 2],
      ["binaryNegative", "-0b10", -2],
      ["binaryFoldedAdd", "0b10 + 0b1", 3],
      ["octalPositive", "0o10", 8],
      ["octalNegative", "-0o10", -8],
      ["hexNegativeWrappedMin", "-0x180000000", -2147483648],
    ];
    const source = `@version 1\n${cases.map(([name, literal]) =>
      `pure flow ${name}() -> Byte contract { effects {} } { return ${literal} }`).join("\n")}`;
    const parsed = parseProgram(source, "signed-radix-all-tiers.fungi");
    assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "all radix cases must parse");
    resolveSymbols(parsed.ast);
    const checked = checkTypes(parsed.ast);
    assert.equal(checked.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
      `all radix cases must pass type checking: ${JSON.stringify(checked.diagnostics)}`);

    for (const [name, , expected] of cases) {
      const syncResult = executeFlowSync(name, new Map(), parsed.ast, parsed.flows);
      assert.deepEqual(syncResult, { __tag: "int", value: expected }, `${name} sync result`);
      const walkerResult = await executeFlow(name, new Map(), parsed.ast, parsed.flows);
      assert.deepEqual(walkerResult.value, { __tag: "int", value: expected }, `${name} checked-walker result`);
    }

    const effects = checkEffects(parsed.flows, parsed.ast);
    const { gir } = emitGIR(parsed.ast, parsed.flows, effects);
    const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "signed-radix", parsed.ast, true));
    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `generated module must assemble: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host: createHostRuntime(),
    });
    for (const [name, , expected] of cases) {
      assert.equal(instance.exports[name](), expected, `${name} assembled-WASM result`);
    }
  });
});

it("static radix arithmetic agrees across sync, checked-walker, and assembled-WASM execution", async () => {
  const source = [
    "static N = 0b10 + 0b1",
    "pure flow readN() -> Int contract { effects {} } { return N }",
  ].join("\n");
  const parsed = parseProgram(source, "static-radix-arithmetic.fungi");
  assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
    `static arithmetic parses: ${JSON.stringify(parsed.diagnostics)}`);
  resolveSymbols(parsed.ast);
  const checked = checkTypes(parsed.ast);
  assert.equal(checked.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
    `static arithmetic type-checks: ${JSON.stringify(checked.diagnostics)}`);

  assert.equal(executeFlowSync("readN", new Map(), parsed.ast, parsed.flows), null,
    "the sync tier must decline a static reference it cannot evaluate");
  const walker = await executeFlow("readN", new Map(), parsed.ast, parsed.flows);
  assert.deepEqual(walker.value, { __tag: "int", value: 3 }, "checked walker static result");

  const effects = checkEffects(parsed.flows, parsed.ast);
  const { gir } = emitGIR(parsed.ast, parsed.flows, effects);
  const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "static-radix", parsed.ast, true));
  const assembled = await assembleWAT(wat);
  assert.ok(assembled.valid, `generated module assembles: ${JSON.stringify(assembled.diagnostics)}`);
  const keypair = generateRunnerKeypair();
  const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
    host: createHostRuntime(),
  });
  assert.equal(instance.exports.readN(), 3, "assembled-WASM static result");
});

it("static unary integer literals agree across checked-walker and assembled WASM", async () => {
  const cases = [
    { declarations: ["static N = -1"], expected: -1 },
    { declarations: ["static N = -2147483648"], expected: -2147483648 },
    { declarations: ["static BASE = 1", "static N = -BASE"], expected: -1 },
  ];
  for (const [index, testCase] of cases.entries()) {
    const source = [
      ...testCase.declarations,
      "pure flow readN() -> Int contract { effects {} } { return N }",
    ].join("\n");
    const parsed = parseProgram(source, `static-unary-integer-${index}.fungi`);
    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
      `static unary literal parses: ${JSON.stringify(parsed.diagnostics)}`);
    resolveSymbols(parsed.ast);
    const checked = checkTypes(parsed.ast);
    assert.equal(checked.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
      `static unary literal type-checks: ${JSON.stringify(checked.diagnostics)}`);

    const walker = await executeFlow("readN", new Map(), parsed.ast, parsed.flows);
    assert.deepEqual(walker.value, { __tag: "int", value: testCase.expected },
      `checked walker static result for case ${index}`);

    const effects = checkEffects(parsed.flows, parsed.ast);
    const { gir } = emitGIR(parsed.ast, parsed.flows, effects);
    const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, `static-unary-${index}`, parsed.ast, true));
    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `generated module assembles: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host: createHostRuntime(),
    });
    assert.equal(instance.exports.readN(), testCase.expected, `assembled-WASM static result for case ${index}`);
  }
});

it("unresolved static identifiers refuse in the checked walker instead of becoming zero", async () => {
  const source = [
    "static N = MISSING_STATIC",
    "pure flow readN() -> Int contract { effects {} } { return N }",
  ].join("\n");
  const parsed = parseProgram(source, "unresolved-static.fungi");
  assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
    `source parses: ${JSON.stringify(parsed.diagnostics)}`);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
    "this regression pins runtime behavior while static-name checking remains permissive");

  const walker = await executeFlow("readN", new Map(), parsed.ast, parsed.flows);
  assert.equal(walker.value.__tag, "runtimeError", "an unresolved compile-time constant must not yield an Int zero");

  const effects = checkEffects(parsed.flows, parsed.ast);
  const { gir } = emitGIR(parsed.ast, parsed.flows, effects);
  const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "unresolved-static", parsed.ast, true));
  const assembled = await assembleWAT(wat);
  assert.ok(assembled.valid, `generated module assembles: ${JSON.stringify(assembled.diagnostics)}`);
  const keypair = generateRunnerKeypair();
  const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
    host: createHostRuntime(),
  });
  assert.throws(() => instance.exports.readN(), WebAssembly.RuntimeError,
    "WASM must refuse the unresolved static use rather than return zero");
});

it("unsupported static initializer AST kinds refuse instead of becoming zero", async () => {
  for (const expression of ["identity(1)", "[1]"]) {
    const source = [
      `static N = ${expression}`,
      "pure flow readN() -> Int contract { effects {} } { return N }",
    ].join("\n");
    const parsed = parseProgram(source, `unsupported-static-${expression}.fungi`);
    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
      `source parses for ${expression}: ${JSON.stringify(parsed.diagnostics)}`);
    resolveSymbols(parsed.ast);
    assert.equal(checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0,
      `source type-checks for ${expression}`);
    const walker = await executeFlow("readN", new Map(), parsed.ast, parsed.flows);
    assert.equal(walker.value.__tag, "runtimeError", `${expression} cannot silently become integer zero`);
  }
});
