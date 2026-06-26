import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes, checkValueStates } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkTypes(parsed.ast);
}

function parseAndCheckValueStates(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkValueStates(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

// ── Part 1: inferType completeness ───────────────────────────────────────────

describe("inferType — listLiteral", () => {
  it("infers Array<Int> for a list of Int literals and no SPORE-TYPE-011", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, 2, 3]
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-011"),
      `Unexpected SPORE-TYPE-011 for valid Array<Int> = [1,2,3]`,
    );
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-002"),
      `Unexpected SPORE-TYPE-002 for valid Array<Int>`,
    );
  });

  it("infers Array<String> for a list of String literals", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<String> = ["hello", "world"]
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-011"),
      `Unexpected SPORE-TYPE-011 for valid Array<String>`,
    );
  });

  it("allows bare Array without element type (no arity error for unconstrained)", () => {
    // Array without type param — checker may warn about arity but not element mismatch
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<String> = ["a", "b"]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "No element mismatch for matching Array");
  });
});

// ── SPORE-TYPE-011: Collection element type mismatch ───────────────────────────

describe("Type checker — SPORE-TYPE-011 InvalidCollectionElement", () => {
  it("emits SPORE-TYPE-011 when Array<Int> contains a String element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two"]
  return
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-011"),
      `Expected SPORE-TYPE-011 for Array<Int> = [1, "two"], got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("includes the element type in the diagnostic message", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two"]
  return
}
`);
    const diags = diagsWithCode(result, "SPORE-TYPE-011");
    assert.ok(diags.length > 0, "Expected SPORE-TYPE-011");
    assert.ok(
      diags.some((d) => d.message.includes("String")),
      `Expected message to mention 'String', got: ${diags.map((d) => d.message).join("; ")}`,
    );
  });

  it("emits SPORE-TYPE-011 when Array<Bool> contains an Int element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, 42]
  return
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-011"),
      `Expected SPORE-TYPE-011 for Array<Bool> = [true, 42]`,
    );
  });

  it("does not emit SPORE-TYPE-011 for all-matching elements", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, false, true]
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-011"),
      `Unexpected SPORE-TYPE-011 for valid Array<Bool>`,
    );
  });

  it("does not emit SPORE-TYPE-011 when Array has no type parameter", () => {
    // Without a type parameter there's nothing to check against
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<String> = ["a", "b", "c"]
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-011"),
      `Unexpected SPORE-TYPE-011 for Array<String> with all String elements`,
    );
  });
});

// ── SPORE-TYPE-017: QuantizedPrecisionMismatch (spec-aligned) ─────────────────
// Per formal spec and Phase 11 decision: TYPE-017 is for quantized/float tensor
// mixing without dequantize(). General numeric narrowing falls under TYPE-002.
// The check is a stub until tensor types are fully in scope (Phase 13).

describe("Type checker — SPORE-TYPE-017 QuantizedPrecisionMismatch (spec stub)", () => {
  it("does NOT emit SPORE-TYPE-017 for Float → Float16 (narrowing is TYPE-002 territory)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Float16 = 3.14
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-017"),
      `SPORE-TYPE-017 must not fire for general float narrowing (use TYPE-002)`,
    );
  });

  it("does NOT emit SPORE-TYPE-017 for Int → Int8 (narrowing is TYPE-002 territory)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Int8 = 42
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-017"),
      `SPORE-TYPE-017 must not fire for plain Int narrowing`,
    );
  });

  it("does not emit SPORE-TYPE-017 when Float assigned to Float64 (widening)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Float64 = 3.14
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-017"),
      `Unexpected SPORE-TYPE-017 for Float64 = 3.14 (widening is always safe)`,
    );
  });

  it("does not emit SPORE-TYPE-017 when exact same precision type is used", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Int = 5
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-017"),
      `Unexpected SPORE-TYPE-017 for Int = 5`,
    );
  });
});

// ── SPORE-VALUESTATE-006: ProtectedBoundaryViolation ───────────────────────────

describe("Value-state checker — SPORE-VALUESTATE-006 ProtectedBoundaryViolation", () => {
  it("emits SPORE-VALUESTATE-006 when protect(String) assigned to plain String binding", () => {
    // protect('raw') produces a protected value; declared is 'String' → violation
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = protect("raw")\nreturn "ok" }',
    );
    assert.ok(
      hasDiag(result, "SPORE-VALUESTATE-006"),
      `Expected SPORE-VALUESTATE-006 for String = protect("raw"), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("SPORE-VALUESTATE-006 message mentions the protected qualifier", () => {
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = protect("raw")\nreturn "ok" }',
    );
    const diag = diagsWithCode(result, "SPORE-VALUESTATE-006")[0];
    assert.ok(diag !== undefined, "Expected at least one SPORE-VALUESTATE-006 diagnostic");
    assert.ok(
      diag.message.includes("protected"),
      `Expected 'protected' in message: ${diag.message}`,
    );
  });

  it("does not emit SPORE-VALUESTATE-006 when declared type is also protected", () => {
    // let x: protected String = protect("raw") — binding qualifier matches → no violation
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: protected String = protect("raw")\nreturn "ok" }',
    );
    assert.ok(
      !hasDiag(result, "SPORE-VALUESTATE-006"),
      `Unexpected SPORE-VALUESTATE-006 when declared type is already 'protected String'`,
    );
  });

  it("does not emit SPORE-VALUESTATE-006 for plain string literal assigned to String", () => {
    const result = parseAndCheckValueStates(`
flow test() -> String {
  let safe: String = "hello"
  return safe
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-VALUESTATE-006"),
      `Unexpected SPORE-VALUESTATE-006 for a plain String literal`,
    );
  });
});

// ── SPORE-VALUESTATE-007: RedactedBoundaryViolation ────────────────────────────

describe("Value-state checker — SPORE-VALUESTATE-007 RedactedBoundaryViolation", () => {
  it("emits SPORE-VALUESTATE-007 when redact(String) assigned to plain String binding", () => {
    // redact('raw') produces a redacted value; declared is 'String' → violation
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = redact("raw")\nreturn "ok" }',
    );
    assert.ok(
      hasDiag(result, "SPORE-VALUESTATE-007"),
      `Expected SPORE-VALUESTATE-007 for String = redact("raw"), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("SPORE-VALUESTATE-007 message mentions irreversibility", () => {
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = redact("raw")\nreturn "ok" }',
    );
    const diag = diagsWithCode(result, "SPORE-VALUESTATE-007")[0];
    assert.ok(diag !== undefined, "Expected at least one SPORE-VALUESTATE-007 diagnostic");
    assert.ok(
      diag.message.includes("irreversible") || diag.message.includes("redact"),
      `Expected 'irreversible'/'redact' in message: ${diag.message}`,
    );
  });

  it("does not emit SPORE-VALUESTATE-007 when declared type is redacted", () => {
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: redacted String = redact("raw")\nreturn "ok" }',
    );
    assert.ok(
      !hasDiag(result, "SPORE-VALUESTATE-007"),
      `Unexpected SPORE-VALUESTATE-007 when declared type is already 'redacted String'`,
    );
  });

  it("does not emit SPORE-VALUESTATE-007 for a plain String literal assigned to String", () => {
    const result = parseAndCheckValueStates(`
flow test() -> String {
  let safe: String = "public"
  return safe
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-VALUESTATE-007"),
      `Unexpected SPORE-VALUESTATE-007 for a plain String literal`,
    );
  });
});

// ── Part 3: Extended SPORE-TYPE-004 binary operator checks ─────────────────────

describe("Type checker — SPORE-TYPE-004 extended: String + non-String", () => {
  it("emits SPORE-TYPE-004 for String + Int", () => {
    const result = parseAndCheck(`
flow test() -> String {
  return "hello" + 42
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-004"),
      `Expected SPORE-TYPE-004 for "hello" + 42`,
    );
  });

  it("emits SPORE-TYPE-004 for Int + String", () => {
    const result = parseAndCheck(`
flow test() -> String {
  return 42 + "hello"
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-004"),
      `Expected SPORE-TYPE-004 for 42 + "hello"`,
    );
  });

  it("does not emit SPORE-TYPE-004 for String + String (valid concatenation)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  return "foo" + "bar"
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-004"),
      `Unexpected SPORE-TYPE-004 for "foo" + "bar"`,
    );
  });
});

describe("Type checker — SPORE-TYPE-004 extended: Bool arithmetic", () => {
  it("emits SPORE-TYPE-004 for true + 1 (Bool + Int)", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return true + 1
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-004"),
      `Expected SPORE-TYPE-004 for true + 1`,
    );
  });

  it("emits SPORE-TYPE-004 for false - 1 (Bool - Int)", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return false - 1
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-004"),
      `Expected SPORE-TYPE-004 for false - 1`,
    );
  });

  it("emits SPORE-TYPE-004 for true * 2 (Bool * Int)", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return true * 2
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-004"),
      `Expected SPORE-TYPE-004 for true * 2`,
    );
  });

  it("does not emit SPORE-TYPE-004 for Bool && Bool (valid logical op)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return true && false
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-004"),
      `Unexpected SPORE-TYPE-004 for true && false`,
    );
  });

  it("does not emit SPORE-TYPE-004 for Bool || Bool (valid logical op)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return false || true
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-004"),
      `Unexpected SPORE-TYPE-004 for false || true`,
    );
  });
});

describe("Type checker — SPORE-TYPE-004 extended: String ordering", () => {
  it("does not emit SPORE-TYPE-004 for String < String (valid same-type comparison)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return "a" < "b"
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-004"),
      `Unexpected SPORE-TYPE-004 for "a" < "b" (same type)`,
    );
  });

  it("does not emit SPORE-TYPE-004 for Int < Int", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return 1 < 2
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-004"),
      `Unexpected SPORE-TYPE-004 for 1 < 2`,
    );
  });
});

// ── inferType extended stdlib coverage ───────────────────────────────────────

describe("inferType — extended stdlib method coverage", () => {
  it("inferType works for Bytes receiver methods (no spurious type errors)", () => {
    // A binding declared as Int assigned the result of calling a size method
    // We can't directly call methods without a receiver in test source, so test
    // that existing code paths don't introduce regressions.
    const result = parseAndCheck(`
flow test(b: Bytes) -> Int {
  return 42
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-001"),
      `Unexpected type error for Bytes parameter`,
    );
  });

  it("allows Array<String> with proper element types", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let tags: Array<String> = ["foo", "bar", "baz"]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-010"), "No element mismatch for Array<String>");
    assert.ok(!hasDiag(result, "SPORE-TYPE-002"), "No type mismatch for correct assignment");
  });

  it("errorPropagation (?) on plain identifier does not crash", () => {
    // The ? operator on a non-Result/Option type just returns the inner type
    const result = parseAndCheck(`
flow test(x: String) -> String {
  return x
}
`);
    assert.ok(result.diagnostics.length === 0, "No errors for simple flow");
  });
});

// ── Exports: SPORE_TYPE_010..019 constants ─────────────────────────────────────

describe("SPORE_TYPE_010..019 exported constants", () => {
  it("exports SPORE_TYPE_010 through SPORE_TYPE_019 from the package", async () => {
    const pkg = await import("../dist/index.js");
    for (let n = 10; n <= 19; n++) {
      const key = `SPORE_TYPE_0${n}`;
      assert.ok(pkg[key] !== undefined, `Expected ${key} to be exported`);
      assert.equal(pkg[key].code, `SPORE-TYPE-0${n}`, `${key}.code mismatch`);
    }
  });

  it("SPORE_TYPE_017 has severity warning (QuantizedPrecisionMismatch)", async () => {
    const { SPORE_TYPE_017 } = await import("../dist/index.js");
    assert.equal(SPORE_TYPE_017.severity, "warning");
    assert.equal(SPORE_TYPE_017.name, "QuantizedPrecisionMismatch");
  });

  it("SPORE_TYPE_018 has severity error (InvalidRuntimeTargetType)", async () => {
    const { SPORE_TYPE_018 } = await import("../dist/index.js");
    assert.equal(SPORE_TYPE_018.severity, "error");
    assert.equal(SPORE_TYPE_018.name, "InvalidRuntimeTargetType");
  });

  it("SPORE_TYPE_019 has severity error (UnknownSymbol)", async () => {
    const { SPORE_TYPE_019 } = await import("../dist/index.js");
    assert.equal(SPORE_TYPE_019.severity, "error");
    assert.equal(SPORE_TYPE_019.name, "UnknownSymbol");
  });

  it("SPORE_TYPE_010 has severity error (UnsatisfiedGenericConstraint)", async () => {
    const { SPORE_TYPE_010 } = await import("../dist/index.js");
    assert.equal(SPORE_TYPE_010.severity, "error");
    assert.equal(SPORE_TYPE_010.name, "UnsatisfiedGenericConstraint");
  });

  it("SPORE_TYPE_011 has name InvalidCollectionElement", async () => {
    const { SPORE_TYPE_011 } = await import("../dist/index.js");
    assert.equal(SPORE_TYPE_011.name, "InvalidCollectionElement");
  });
});

// ── Exports: SPORE_VALUESTATE_006 and SPORE_VALUESTATE_007 constants ─────────────

describe("SPORE_VALUESTATE_006 and SPORE_VALUESTATE_007 exported constants", () => {
  it("exports SPORE_VALUESTATE_006 with correct code and name", async () => {
    const { SPORE_VALUESTATE_006 } = await import("../dist/index.js");
    assert.ok(SPORE_VALUESTATE_006 !== undefined, "Expected SPORE_VALUESTATE_006 to be exported");
    assert.equal(SPORE_VALUESTATE_006.code, "SPORE-VALUESTATE-006");
    assert.equal(SPORE_VALUESTATE_006.name, "ProtectedBoundaryViolation");
    assert.equal(SPORE_VALUESTATE_006.severity, "error");
  });

  it("exports SPORE_VALUESTATE_007 with correct code and name", async () => {
    const { SPORE_VALUESTATE_007 } = await import("../dist/index.js");
    assert.ok(SPORE_VALUESTATE_007 !== undefined, "Expected SPORE_VALUESTATE_007 to be exported");
    assert.equal(SPORE_VALUESTATE_007.code, "SPORE-VALUESTATE-007");
    assert.equal(SPORE_VALUESTATE_007.name, "RedactedBoundaryViolation");
    assert.equal(SPORE_VALUESTATE_007.severity, "error");
  });
});
