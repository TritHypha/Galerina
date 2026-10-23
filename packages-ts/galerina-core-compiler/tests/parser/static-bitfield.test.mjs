// =============================================================================
// Parser — static compile-time constants + bitfield governance registers
//
// Tests for `static NAME = EXPR` (task #86) and
// `bitfield NAME { field: bitPos, ... }` (task #87) declarations.
//
// Covers:
//   - staticDecl AST node shape (kind, value, children)
//   - bitfieldDecl AST node shape (kind, value, children with "field:pos" format)
//   - FUNGI-STATIC-001: non-constant initializer (function call in static)
//   - FUNGI-STATIC-002: duplicate static name redeclaration
//   - FUNGI-BF-001: duplicate bit position within a bitfield
//   - FUNGI-BF-002: bit position out of range (0-31)
//   - Runtime: static constant folding in interpreter
//   - Runtime: bitfield bitmask generation (V_DPM.field = 1 << bitPos)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  verifyGovernance,
  checkProgram,
  buildWATFromCheckedProgram,
  renderWAT,
  executeFlow,
  assembleWAT,
  admitAndInstantiate,
  createHostRuntime,
  generateRunnerKeypair,
  signWasm,
  getInternedStrings,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source) {
  return parseProgram(source, "test.fungi");
}

function parseAndVerify(source) {
  const parsed = parse(source);
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function findTopLevelNode(ast, kind, name) {
  for (const child of ast.children ?? []) {
    if (child.kind === kind && (name === undefined || child.value === name)) {
      return child;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// staticDecl AST shape
// ---------------------------------------------------------------------------

describe("static declaration: AST node shape", () => {
  it("static MAX_NODES = 100 parses as staticDecl with correct value and number child", () => {
    const { ast, diagnostics } = parse(`static MAX_NODES = 100`);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Expected 0 errors, got: ${errors.map((e) => e.message).join(", ")}`,
    );

    const staticNode = findTopLevelNode(ast, "staticDecl", "MAX_NODES");
    assert.ok(staticNode !== undefined, "staticDecl node must exist for MAX_NODES");
    assert.equal(staticNode.kind, "staticDecl", "Node kind must be staticDecl");
    assert.equal(staticNode.value, "MAX_NODES", "Node value must be MAX_NODES");

    // Child should be the number literal 100
    assert.ok(
      (staticNode.children ?? []).length >= 1,
      "staticDecl must have at least one child (the value expression)",
    );
    const valueChild = staticNode.children[0];
    assert.equal(
      valueChild.kind,
      "numberLiteral",
      "The value child must be a numberLiteral",
    );
    assert.equal(valueChild.value, "100", "The number literal must have value '100'");
  });

  it("static string constant parses without errors", () => {
    const { diagnostics } = parse(`static DEFAULT_LABEL = "unclassified"`);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Expected 0 errors for static string constant, got: ${errors.map((e) => e.message).join(", ")}`,
    );
  });

  it("multiple static declarations are all present in AST", () => {
    const { ast, diagnostics } = parse(`
static MIN_VAL = 0
static MAX_VAL = 255
static STEP = 16
`);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const statics = (ast.children ?? []).filter((c) => c.kind === "staticDecl");
    assert.equal(statics.length, 3, "Expected 3 staticDecl nodes");
    const names = statics.map((s) => s.value);
    assert.ok(names.includes("MIN_VAL"), "MIN_VAL must be present");
    assert.ok(names.includes("MAX_VAL"), "MAX_VAL must be present");
    assert.ok(names.includes("STEP"), "STEP must be present");
  });
});

// ---------------------------------------------------------------------------
// bitfieldDecl AST shape
// ---------------------------------------------------------------------------

describe("bitfield declaration: AST node shape", () => {
  it("bitfield V_DPM { network: 0, storage: 1 } parses as bitfieldDecl with 2 children", () => {
    const { ast, diagnostics } = parse(`
bitfield V_DPM {
  network: 0,
  storage: 1
}
`);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Expected 0 errors, got: ${errors.map((e) => e.message).join(", ")}`,
    );

    const bfNode = findTopLevelNode(ast, "bitfieldDecl", "V_DPM");
    assert.ok(bfNode !== undefined, "bitfieldDecl node must exist for V_DPM");
    assert.equal(bfNode.kind, "bitfieldDecl", "Node kind must be bitfieldDecl");
    assert.equal(bfNode.value, "V_DPM", "Node value must be V_DPM");

    // Children encode "field:pos" pairs
    const children = bfNode.children ?? [];
    assert.equal(children.length, 2, "Expected 2 field children");
    const childValues = children.map((c) => c.value);
    assert.ok(
      childValues.some((v) => v?.includes("network") && v?.includes("0")),
      `Expected a child with 'network:0', got: ${childValues.join(", ")}`,
    );
    assert.ok(
      childValues.some((v) => v?.includes("storage") && v?.includes("1")),
      `Expected a child with 'storage:1', got: ${childValues.join(", ")}`,
    );
  });

  it("bitfield with multiple fields parses all entries", () => {
    const { ast, diagnostics } = parse(`
bitfield FLAGS {
  read: 0,
  write: 1,
  exec: 2,
  admin: 3
}
`);
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const bfNode = findTopLevelNode(ast, "bitfieldDecl", "FLAGS");
    assert.ok(bfNode !== undefined, "bitfieldDecl must exist for FLAGS");
    assert.equal((bfNode.children ?? []).length, 4, "Expected 4 field children");
  });
});

// ---------------------------------------------------------------------------
// FUNGI-STATIC-001: compile-time constant initializer
// ---------------------------------------------------------------------------

describe("FUNGI-STATIC-001: static initializer must be a compile-time constant", () => {
  it("rejects a function call as an error rather than a warning", () => {
    const result = parseAndVerify("static VALUE = identity(1)");
    const diagnostic = result.diagnostics.find((item) => item.code === "FUNGI-STATIC-001");
    assert.equal(diagnostic?.severity, "error");
  });

  it("rejects unresolved and forward static identifiers", () => {
    for (const source of [
      "static VALUE = MISSING",
      "static FIRST = LATER\nstatic LATER = 1",
    ]) {
      const result = parseAndVerify(source);
      assert.ok(
        result.diagnostics.some((item) => item.code === "FUNGI-STATIC-001" && item.severity === "error"),
        `Expected FUNGI-STATIC-001 error for ${source}`,
      );
    }
  });

  it("rejects an unsupported array initializer", () => {
    const result = parseAndVerify("static VALUE = [1]");
    assert.ok(
      result.diagnostics.some((item) => item.code === "FUNGI-STATIC-001" && item.severity === "error"),
    );
  });

  it("rejects constant-looking arithmetic outside the static evaluator's supported types", () => {
    for (const source of [
      'static VALUE = "a" + "b"',
      "static VALUE = 1.0 + 2.0",
    ]) {
      const result = parseAndVerify(source);
      assert.ok(
        result.diagnostics.some((item) => item.code === "FUNGI-STATIC-001" && item.severity === "error"),
        `Expected FUNGI-STATIC-001 error for ${source}`,
      );
    }
  });

  it("accepts a literal and a reference to an earlier static", () => {
    const result = parseAndVerify("static BASE = 1\nstatic VALUE = BASE + 2");
    assert.equal(
      result.diagnostics.some((item) => item.code === "FUNGI-STATIC-001"),
      false,
    );
  });

  it("accepts supported boolean constant negation", () => {
    const result = parseAndVerify("static FLAG = !false");
    assert.equal(
      result.diagnostics.some((item) => item.code === "FUNGI-STATIC-001"),
      false,
    );
  });

  it("blocks the checked-program path for a non-constant initializer", () => {
    const checked = checkProgram(`@version 1
pure flow identity(value: Int) -> Int { return value }
static VALUE = identity(1)
pure flow read() -> Int { return VALUE }
`, "static-checked-program.fungi");
    assert.equal(checked.ok, false);
    assert.ok(checked.diagnostics.some((item) => item.code === "FUNGI-STATIC-001"));
  });

  it("rejects an invalid nested static even when no flow references it", () => {
    const checked = checkProgram(`@version 1
pure flow read() -> Int {
  static BAD = 1 / 0
  return 7
}
`, "static-nested-invalid-unused.fungi");
    assert.equal(checked.ok, false);
    assert.ok(!checked.ok && checked.diagnostics.some((item) => item.code === "FUNGI-STATIC-001"));
  });

  it("rejects duplicate nested statics across flows because the emitted table is module-wide", () => {
    const checked = checkProgram(`@version 1
pure flow first() -> Int {
  static SHARED = 1
  return SHARED
}
pure flow second() -> Int {
  static SHARED = 2
  return SHARED
}
`, "static-nested-duplicate.fungi");
    assert.equal(checked.ok, false);
    assert.ok(!checked.ok && checked.diagnostics.some((item) => item.code === "FUNGI-STATIC-002"));
  });

  it("refuses static arithmetic that cannot produce a checked compile-time value", () => {
    for (const expression of [
      "1 / 0",
      "1 % 0",
      "2147483647 + 1",
      "-(-2147483648)",
      "-2147483648 / -1",
    ]) {
      for (const use of ["", "\npure flow read() -> Int { return VALUE }"]) {
        const checked = checkProgram(
          `@version 1\nstatic VALUE = ${expression}${use}\n`,
          "static-checked-arithmetic.fungi",
        );
        assert.equal(checked.ok, false, `Expected checked-program refusal for ${expression}${use ? " when used" : " even when unused"}`);
        assert.ok(
          !checked.ok && checked.diagnostics.some((item) => item.code === "FUNGI-STATIC-001"),
          `Expected FUNGI-STATIC-001 for ${expression}`,
        );
      }
    }
  });

  it("refuses a non-finite float static before checked-program creation", () => {
    const checked = checkProgram(`@version 1
static RATE = 1e400
pure flow read() -> Float64 { return RATE }
`, "static-nonfinite.fungi");
    assert.equal(checked.ok, false);
    assert.ok(!checked.ok && checked.diagnostics.some((item) => item.code === "FUNGI-STATIC-001"));
  });

  it("keeps valid checked static arithmetic admitted", () => {
    const checked = checkProgram(`@version 1
static VALUE = 6 / 2
pure flow read() -> Int { return VALUE }
`, "static-checked-arithmetic-valid.fungi");
    assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.diagnostics));
  });

  it("lowers checked boolean, float, and string statics with matching assembled-WASM values", async () => {
    const checked = checkProgram(`@version 1
static FLAG = !false
static FLAG_COPY = FLAG
static RATE = 1.5
static LABEL = "safe"
pure flow readFlag() -> Bool { return FLAG_COPY }
pure flow readRate() -> Float64 { return RATE }
pure flow readLabel() -> String { return LABEL }
`, "static-scalar-wat.fungi");
    assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.diagnostics));
    if (!checked.ok) return;

    const wat = renderWAT(buildWATFromCheckedProgram(checked.program, undefined, "wasm-standalone", true));
    assert.doesNotMatch(wat, /unresolved: (?:FLAG_COPY|RATE|LABEL)/u);
    assert.match(wat, /\(i32\.eqz \(i32\.const 0\)\)/u, "boolean unary constant must lower to its value");
    assert.match(wat, /\(f64\.const 1\.5\)/u, "float static must lower as f64 rather than an unresolved i32 placeholder");

    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `typed static module must assemble: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const host = createHostRuntime();
    for (const entry of getInternedStrings()) host.seedString(entry.handle, entry.value);
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host,
    });
    assert.equal(instance.exports.readFlag(), 1);
    assert.equal(instance.exports.readRate(), 1.5);
    assert.equal(host.readString(instance.exports.readLabel()), "safe");
  });

  it("lowers a checked static declared inside a flow body", async () => {
    const checked = checkProgram(`@version 1
pure flow readLocal() -> Int {
  static LOCAL_VALUE = 7
  return LOCAL_VALUE
}
`, "static-flow-local.fungi");
    assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.diagnostics));
    if (!checked.ok) return;

    const parsed = parse(`@version 1
pure flow readLocal() -> Int {
  static LOCAL_VALUE = 7
  return LOCAL_VALUE
}
`);
    const interpreted = await executeFlow("readLocal", new Map(), parsed.ast, parsed.flows);
    assert.deepEqual(interpreted.value, { __tag: "int", value: 7 }, "interpreter and WAT must share nested static semantics");

    const wat = renderWAT(buildWATFromCheckedProgram(checked.program, undefined, "wasm-standalone", true));
    assert.doesNotMatch(wat, /unresolved: LOCAL_VALUE/u);
    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `flow-body static module must assemble: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host: createHostRuntime(),
    });
    assert.equal(instance.exports.readLocal(), 7);
  });

  it("binds a static alias before flow parameters can shadow its source name", async () => {
    const checked = checkProgram(`@version 1
static FLAG = true
static COPY = FLAG
pure flow read(FLAG: Bool) -> Bool { return COPY }
`, "static-alias-shadow.fungi");
    assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.diagnostics));
    if (!checked.ok) return;

    const interpreted = await executeFlow(
      "read",
      new Map([["FLAG", { __tag: "bool", value: false }]]),
      checked.program.ast,
      checked.program.flows,
    );
    assert.deepEqual(interpreted.value, { __tag: "bool", value: true });

    const wat = renderWAT(buildWATFromCheckedProgram(checked.program, undefined, "wasm-standalone", true));
    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `shadowed static alias module must assemble: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host: createHostRuntime(),
    });
    assert.equal(instance.exports.read(0), 1, "WASM must use the declaration-bound static rather than the caller's FLAG argument");
  });

  it("retains a static alias type when a flow parameter shadows its source name", async () => {
    const checked = checkProgram(`@version 1
static RATE = 1.5
static NEG = -RATE
pure flow read(RATE: Int) -> Float64 { return NEG }
`, "static-alias-float-shadow.fungi");
    assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.diagnostics));
    if (!checked.ok) return;

    const interpreted = await executeFlow(
      "read",
      new Map([["RATE", { __tag: "int", value: 7 }]]),
      checked.program.ast,
      checked.program.flows,
    );
    assert.deepEqual(interpreted.value, { __tag: "float", value: -1.5 });

    const wat = renderWAT(buildWATFromCheckedProgram(checked.program, undefined, "wasm-standalone", true));
    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `shadowed Float static alias must assemble: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host: createHostRuntime(),
    });
    assert.equal(instance.exports.read(7), -1.5);
  });

  it("uses interpreter-defined module-static precedence over a same-named flow parameter", async () => {
    const checked = checkProgram(`@version 1
static FLAG = true
pure flow read(FLAG: Bool) -> Bool { return FLAG }
`, "static-name-shadow.fungi");
    assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.diagnostics));
    if (!checked.ok) return;

    const interpreted = await executeFlow(
      "read",
      new Map([["FLAG", { __tag: "bool", value: false }]]),
      checked.program.ast,
      checked.program.flows,
    );
    assert.deepEqual(interpreted.value, { __tag: "bool", value: true });

    const wat = renderWAT(buildWATFromCheckedProgram(checked.program, undefined, "wasm-standalone", true));
    const assembled = await assembleWAT(wat);
    assert.ok(assembled.valid, `static name shadow module must assemble: ${JSON.stringify(assembled.diagnostics)}`);
    const keypair = generateRunnerKeypair();
    const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
    const { instance } = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
      host: createHostRuntime(),
    });
    assert.equal(instance.exports.read(0), 1);
  });
});

// ---------------------------------------------------------------------------
// FUNGI-STATIC-002: duplicate static name
// ---------------------------------------------------------------------------

describe("FUNGI-STATIC-002: duplicate static name redeclaration", () => {
  it("static X = 1 then static X = 2 emits FUNGI-STATIC-002", () => {
    const source = `
static X = 1
static X = 2
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "FUNGI-STATIC-002"),
      `Expected FUNGI-STATIC-002 for duplicate static name X, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
    const diag = result.diagnostics.find((d) => d.code === "FUNGI-STATIC-002");
    assert.ok(
      diag?.message.includes("X"),
      `FUNGI-STATIC-002 message must mention the name 'X', got: ${diag?.message}`,
    );
  });

  it("two static declarations with distinct names — no FUNGI-STATIC-002", () => {
    const source = `
static A = 10
static B = 20
`;
    const result = parseAndVerify(source);
    assert.ok(
      !hasDiag(result, "FUNGI-STATIC-002"),
      `Expected no FUNGI-STATIC-002 for distinct names A and B`,
    );
  });
});

// ---------------------------------------------------------------------------
// FUNGI-BF-001: duplicate bit position in bitfield
// ---------------------------------------------------------------------------

describe("FUNGI-BF-001: duplicate bit position in bitfield", () => {
  it("bitfield with two fields mapping to bit 0 emits FUNGI-BF-001", () => {
    const source = `
bitfield X {
  a: 0,
  b: 0
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "FUNGI-BF-001"),
      `Expected FUNGI-BF-001 for duplicate bit position 0, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
    const diag = result.diagnostics.find((d) => d.code === "FUNGI-BF-001");
    assert.ok(
      diag?.message.includes("0") || diag?.message.includes("X"),
      `FUNGI-BF-001 message should mention the duplicate bit or register, got: ${diag?.message}`,
    );
  });

  it("bitfield with all unique bit positions — no FUNGI-BF-001", () => {
    const source = `
bitfield Y {
  first: 0,
  second: 1,
  third: 2
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      !hasDiag(result, "FUNGI-BF-001"),
      `Expected no FUNGI-BF-001 for unique bit positions`,
    );
  });
});

// ---------------------------------------------------------------------------
// FUNGI-BF-002: bit position out of range (0-31)
// ---------------------------------------------------------------------------

describe("FUNGI-BF-002: bit position out of range (0-31)", () => {
  it("bitfield with field at bit 32 emits FUNGI-BF-002", () => {
    const source = `
bitfield Z {
  overflow: 32
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "FUNGI-BF-002"),
      `Expected FUNGI-BF-002 for bit position 32, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
    const diag = result.diagnostics.find((d) => d.code === "FUNGI-BF-002");
    assert.ok(
      diag?.message.includes("32") || diag?.message.includes("range"),
      `FUNGI-BF-002 message should mention position 32 or range, got: ${diag?.message}`,
    );
  });

  it("bitfield with fields at positions 0 and 31 — no FUNGI-BF-002", () => {
    const source = `
bitfield FULL {
  lowest: 0,
  highest: 31
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      !hasDiag(result, "FUNGI-BF-002"),
      `Expected no FUNGI-BF-002 for positions 0 and 31 (valid range)`,
    );
  });
});

// ---------------------------------------------------------------------------
// Runtime: static constant folding
// ---------------------------------------------------------------------------

describe("static constant folding in interpreter", () => {
  it("flow returning a static constant resolves the constant's value", async () => {
    const source = `
static LIMIT = 42

pure flow getLimit() -> Int
contract { effects {} }
{
  return LIMIT
}
`;
    const parsed = parse(source);
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const result = await executeFlow("getLimit", new Map(), parsed.ast, parsed.flows);
    assert.ok(
      result.value.__tag !== "runtimeError",
      `Expected no runtime error, got: ${result.value.__tag}`,
    );
    assert.equal(result.value.__tag, "int", "Return value must be an integer");
    assert.equal(result.value.value, 42, "Static constant LIMIT must fold to 42");
  });

  it("flow using a static constant in arithmetic returns correct result", async () => {
    const source = `
static OFFSET = 10

pure flow addOffset(n: Int) -> Int
contract { effects {} }
{
  return n + OFFSET
}
`;
    const parsed = parse(source);
    const args = new Map([["n", { __tag: "int", value: 5 }]]);
    const result = await executeFlow("addOffset", args, parsed.ast, parsed.flows);
    assert.ok(
      result.value.__tag !== "runtimeError",
      `Expected no runtime error, got: ${result.value.__tag}`,
    );
    assert.equal(result.value.value, 15, "5 + OFFSET(10) must equal 15");
  });
});

// ---------------------------------------------------------------------------
// Runtime: bitfield bitmask generation
// ---------------------------------------------------------------------------

describe("bitfield bitmask generation in interpreter", () => {
  it("V_DPM.network returns 1 << 0 = 1 for field at bit 0", async () => {
    const source = `
bitfield V_DPM {
  network: 0,
  storage: 1
}

pure flow getNetworkBit() -> Int
contract { effects {} }
{
  return V_DPM.network
}
`;
    const parsed = parse(source);
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const result = await executeFlow("getNetworkBit", new Map(), parsed.ast, parsed.flows);
    assert.ok(
      result.value.__tag !== "runtimeError",
      `Expected no runtime error, got: ${JSON.stringify(result.value)}`,
    );
    assert.equal(result.value.__tag, "int", "Bitfield access must return int");
    assert.equal(result.value.value, 1, "V_DPM.network (bit 0) must equal 1 << 0 = 1");
  });

  it("V_DPM.storage returns 1 << 1 = 2 for field at bit 1", async () => {
    const source = `
bitfield V_DPM {
  network: 0,
  storage: 1
}

pure flow getStorageBit() -> Int
contract { effects {} }
{
  return V_DPM.storage
}
`;
    const parsed = parse(source);
    const result = await executeFlow("getStorageBit", new Map(), parsed.ast, parsed.flows);
    assert.ok(
      result.value.__tag !== "runtimeError",
      `Expected no runtime error, got: ${JSON.stringify(result.value)}`,
    );
    assert.equal(result.value.value, 2, "V_DPM.storage (bit 1) must equal 1 << 1 = 2");
  });

  it("bitfield at bit 4 returns 1 << 4 = 16", async () => {
    const source = `
bitfield CAPS {
  admin: 4
}

pure flow getAdminMask() -> Int
contract { effects {} }
{
  return CAPS.admin
}
`;
    const parsed = parse(source);
    const result = await executeFlow("getAdminMask", new Map(), parsed.ast, parsed.flows);
    assert.ok(
      result.value.__tag !== "runtimeError",
      `Expected no runtime error, got: ${JSON.stringify(result.value)}`,
    );
    assert.equal(result.value.value, 16, "CAPS.admin (bit 4) must equal 1 << 4 = 16");
  });
});
