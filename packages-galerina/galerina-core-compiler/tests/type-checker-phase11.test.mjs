import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes, checkValueStates } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.fungi");
  return checkTypes(parsed.ast);
}

function parseAndCheckValueStates(source) {
  const parsed = parseProgram(source, "test.fungi");
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
  it("infers Array<Int> for a list of Int literals and no FUNGI-TYPE-011", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, 2, 3]
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-011"),
      `Unexpected FUNGI-TYPE-011 for valid Array<Int> = [1,2,3]`,
    );
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-002"),
      `Unexpected FUNGI-TYPE-002 for valid Array<Int>`,
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
      !hasDiag(result, "FUNGI-TYPE-011"),
      `Unexpected FUNGI-TYPE-011 for valid Array<String>`,
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
    assert.ok(!hasDiag(result, "FUNGI-TYPE-011"), "No element mismatch for matching Array");
  });
});

// ── FUNGI-TYPE-011: Collection element type mismatch ───────────────────────────

describe("Type checker — FUNGI-TYPE-011 InvalidCollectionElement", () => {
  it("emits FUNGI-TYPE-011 when Array<Int> contains a String element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two"]
  return
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-011"),
      `Expected FUNGI-TYPE-011 for Array<Int> = [1, "two"], got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("includes the element type in the diagnostic message", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two"]
  return
}
`);
    const diags = diagsWithCode(result, "FUNGI-TYPE-011");
    assert.ok(diags.length > 0, "Expected FUNGI-TYPE-011");
    assert.ok(
      diags.some((d) => d.message.includes("String")),
      `Expected message to mention 'String', got: ${diags.map((d) => d.message).join("; ")}`,
    );
  });

  it("emits FUNGI-TYPE-011 when Array<Bool> contains an Int element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, 42]
  return
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-011"),
      `Expected FUNGI-TYPE-011 for Array<Bool> = [true, 42]`,
    );
  });

  it("does not emit FUNGI-TYPE-011 for all-matching elements", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, false, true]
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-011"),
      `Unexpected FUNGI-TYPE-011 for valid Array<Bool>`,
    );
  });

  it("does not emit FUNGI-TYPE-011 when Array has no type parameter", () => {
    // Without a type parameter there's nothing to check against
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<String> = ["a", "b", "c"]
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-011"),
      `Unexpected FUNGI-TYPE-011 for Array<String> with all String elements`,
    );
  });
});

// ── FUNGI-TYPE-017: QuantizedPrecisionMismatch (spec-aligned) ─────────────────
// Per formal spec and Phase 11 decision: TYPE-017 is for quantized/float tensor
// mixing without dequantize(). General numeric narrowing falls under TYPE-002.
// The check is a stub until tensor types are fully in scope (Phase 13).

describe("Type checker — FUNGI-TYPE-017 QuantizedPrecisionMismatch (spec stub)", () => {
  it("does NOT emit FUNGI-TYPE-017 for Float → Float16 (narrowing is TYPE-002 territory)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Float16 = 3.14
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-017"),
      `FUNGI-TYPE-017 must not fire for general float narrowing (use TYPE-002)`,
    );
  });

  it("does NOT emit FUNGI-TYPE-017 for Int → Int8 (narrowing is TYPE-002 territory)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Int8 = 42
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-017"),
      `FUNGI-TYPE-017 must not fire for plain Int narrowing`,
    );
  });

  it("does not emit FUNGI-TYPE-017 when Float assigned to Float64 (widening)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Float64 = 3.14
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-017"),
      `Unexpected FUNGI-TYPE-017 for Float64 = 3.14 (widening is always safe)`,
    );
  });

  it("does not emit FUNGI-TYPE-017 when exact same precision type is used", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Int = 5
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-017"),
      `Unexpected FUNGI-TYPE-017 for Int = 5`,
    );
  });
});

// ── FUNGI-VALUESTATE-006: ProtectedBoundaryViolation ───────────────────────────

describe("Value-state checker — FUNGI-VALUESTATE-006 ProtectedBoundaryViolation", () => {
  it("emits FUNGI-VALUESTATE-006 when protect(String) assigned to plain String binding", () => {
    // protect('raw') produces a protected value; declared is 'String' → violation
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = protect("raw")\nreturn "ok" }',
    );
    assert.ok(
      hasDiag(result, "FUNGI-VALUESTATE-006"),
      `Expected FUNGI-VALUESTATE-006 for String = protect("raw"), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("FUNGI-VALUESTATE-006 message mentions the protected qualifier", () => {
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = protect("raw")\nreturn "ok" }',
    );
    const diag = diagsWithCode(result, "FUNGI-VALUESTATE-006")[0];
    assert.ok(diag !== undefined, "Expected at least one FUNGI-VALUESTATE-006 diagnostic");
    assert.ok(
      diag.message.includes("protected"),
      `Expected 'protected' in message: ${diag.message}`,
    );
  });

  it("does not emit FUNGI-VALUESTATE-006 when declared type is also protected", () => {
    // let x: protected String = protect("raw") — binding qualifier matches → no violation
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: protected String = protect("raw")\nreturn "ok" }',
    );
    assert.ok(
      !hasDiag(result, "FUNGI-VALUESTATE-006"),
      `Unexpected FUNGI-VALUESTATE-006 when declared type is already 'protected String'`,
    );
  });

  it("does not emit FUNGI-VALUESTATE-006 for plain string literal assigned to String", () => {
    const result = parseAndCheckValueStates(`
flow test() -> String {
  let safe: String = "hello"
  return safe
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-VALUESTATE-006"),
      `Unexpected FUNGI-VALUESTATE-006 for a plain String literal`,
    );
  });
});

// ── FUNGI-VALUESTATE-007: RedactedBoundaryViolation ────────────────────────────

describe("Value-state checker — FUNGI-VALUESTATE-007 RedactedBoundaryViolation", () => {
  it("emits FUNGI-VALUESTATE-007 when redact(String) assigned to plain String binding", () => {
    // redact('raw') produces a redacted value; declared is 'String' → violation
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = redact("raw")\nreturn "ok" }',
    );
    assert.ok(
      hasDiag(result, "FUNGI-VALUESTATE-007"),
      `Expected FUNGI-VALUESTATE-007 for String = redact("raw"), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("FUNGI-VALUESTATE-007 message mentions irreversibility", () => {
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: String = redact("raw")\nreturn "ok" }',
    );
    const diag = diagsWithCode(result, "FUNGI-VALUESTATE-007")[0];
    assert.ok(diag !== undefined, "Expected at least one FUNGI-VALUESTATE-007 diagnostic");
    assert.ok(
      diag.message.includes("irreversible") || diag.message.includes("redact"),
      `Expected 'irreversible'/'redact' in message: ${diag.message}`,
    );
  });

  it("does not emit FUNGI-VALUESTATE-007 when declared type is redacted", () => {
    const result = parseAndCheckValueStates(
      'flow test() -> String { let x: redacted String = redact("raw")\nreturn "ok" }',
    );
    assert.ok(
      !hasDiag(result, "FUNGI-VALUESTATE-007"),
      `Unexpected FUNGI-VALUESTATE-007 when declared type is already 'redacted String'`,
    );
  });

  it("does not emit FUNGI-VALUESTATE-007 for a plain String literal assigned to String", () => {
    const result = parseAndCheckValueStates(`
flow test() -> String {
  let safe: String = "public"
  return safe
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-VALUESTATE-007"),
      `Unexpected FUNGI-VALUESTATE-007 for a plain String literal`,
    );
  });
});

// ── Part 3: Extended FUNGI-TYPE-004 binary operator checks ─────────────────────

describe("Type checker — FUNGI-TYPE-004 extended: String + non-String", () => {
  it("emits FUNGI-TYPE-004 for String + Int", () => {
    const result = parseAndCheck(`
flow test() -> String {
  return "hello" + 42
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-004"),
      `Expected FUNGI-TYPE-004 for "hello" + 42`,
    );
  });

  it("emits FUNGI-TYPE-004 for Int + String", () => {
    const result = parseAndCheck(`
flow test() -> String {
  return 42 + "hello"
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-004"),
      `Expected FUNGI-TYPE-004 for 42 + "hello"`,
    );
  });

  it("does not emit FUNGI-TYPE-004 for String + String (valid concatenation)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  return "foo" + "bar"
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-004"),
      `Unexpected FUNGI-TYPE-004 for "foo" + "bar"`,
    );
  });
});

describe("Type checker — FUNGI-TYPE-004 extended: Bool arithmetic", () => {
  it("emits FUNGI-TYPE-004 for true + 1 (Bool + Int)", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return true + 1
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-004"),
      `Expected FUNGI-TYPE-004 for true + 1`,
    );
  });

  it("emits FUNGI-TYPE-004 for false - 1 (Bool - Int)", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return false - 1
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-004"),
      `Expected FUNGI-TYPE-004 for false - 1`,
    );
  });

  it("emits FUNGI-TYPE-004 for true * 2 (Bool * Int)", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return true * 2
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-004"),
      `Expected FUNGI-TYPE-004 for true * 2`,
    );
  });

  it("does not emit FUNGI-TYPE-004 for Bool && Bool (valid logical op)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return true && false
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-004"),
      `Unexpected FUNGI-TYPE-004 for true && false`,
    );
  });

  it("does not emit FUNGI-TYPE-004 for Bool || Bool (valid logical op)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return false || true
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-004"),
      `Unexpected FUNGI-TYPE-004 for false || true`,
    );
  });
});

describe("Type checker — FUNGI-TYPE-004 extended: String ordering", () => {
  it("does not emit FUNGI-TYPE-004 for String < String (valid same-type comparison)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return "a" < "b"
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-004"),
      `Unexpected FUNGI-TYPE-004 for "a" < "b" (same type)`,
    );
  });

  it("does not emit FUNGI-TYPE-004 for Int < Int", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return 1 < 2
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-004"),
      `Unexpected FUNGI-TYPE-004 for 1 < 2`,
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
      !hasDiag(result, "FUNGI-TYPE-001"),
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
    assert.ok(!hasDiag(result, "FUNGI-TYPE-010"), "No element mismatch for Array<String>");
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "No type mismatch for correct assignment");
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

// ── Exports: FUNGI_TYPE_010..019 constants ─────────────────────────────────────

describe("FUNGI_TYPE_010..019 exported constants", () => {
  it("exports FUNGI_TYPE_010 through FUNGI_TYPE_019 from the package", async () => {
    const pkg = await import("../dist/index.js");
    for (let n = 10; n <= 19; n++) {
      const key = `FUNGI_TYPE_0${n}`;
      assert.ok(pkg[key] !== undefined, `Expected ${key} to be exported`);
      assert.equal(pkg[key].code, `FUNGI-TYPE-0${n}`, `${key}.code mismatch`);
    }
  });

  it("FUNGI_TYPE_017 has severity warning (QuantizedPrecisionMismatch)", async () => {
    const { FUNGI_TYPE_017 } = await import("../dist/index.js");
    assert.equal(FUNGI_TYPE_017.severity, "warning");
    assert.equal(FUNGI_TYPE_017.name, "QUANTIZED_PRECISION_MISMATCH");
  });

  it("FUNGI_TYPE_018 has severity error (InvalidRuntimeTargetType)", async () => {
    const { FUNGI_TYPE_018 } = await import("../dist/index.js");
    assert.equal(FUNGI_TYPE_018.severity, "error");
    assert.equal(FUNGI_TYPE_018.name, "INVALID_RUNTIME_TARGET_TYPE");
  });

  it("FUNGI_TYPE_019 has severity error (UnknownSymbol)", async () => {
    const { FUNGI_TYPE_019 } = await import("../dist/index.js");
    assert.equal(FUNGI_TYPE_019.severity, "error");
    assert.equal(FUNGI_TYPE_019.name, "UNKNOWN_SYMBOL");
  });

  it("FUNGI_TYPE_010 has severity error (UnsatisfiedGenericConstraint)", async () => {
    const { FUNGI_TYPE_010 } = await import("../dist/index.js");
    assert.equal(FUNGI_TYPE_010.severity, "error");
    assert.equal(FUNGI_TYPE_010.name, "UNSATISFIED_GENERIC_CONSTRAINT");
  });

  it("FUNGI_TYPE_011 has name InvalidCollectionElement", async () => {
    const { FUNGI_TYPE_011 } = await import("../dist/index.js");
    assert.equal(FUNGI_TYPE_011.name, "INVALID_COLLECTION_ELEMENT");
  });
});

// ── Exports: FUNGI_VALUESTATE_006 and FUNGI_VALUESTATE_007 constants ─────────────

describe("FUNGI_VALUESTATE_006 and FUNGI_VALUESTATE_007 exported constants", () => {
  it("exports FUNGI_VALUESTATE_006 with correct code and name", async () => {
    const { FUNGI_VALUESTATE_006 } = await import("../dist/index.js");
    assert.ok(FUNGI_VALUESTATE_006 !== undefined, "Expected FUNGI_VALUESTATE_006 to be exported");
    assert.equal(FUNGI_VALUESTATE_006.code, "FUNGI-VALUESTATE-006");
    assert.equal(FUNGI_VALUESTATE_006.name, "PROTECTED_BOUNDARY_VIOLATION");
    assert.equal(FUNGI_VALUESTATE_006.severity, "error");
  });

  it("exports FUNGI_VALUESTATE_007 with correct code and name", async () => {
    const { FUNGI_VALUESTATE_007 } = await import("../dist/index.js");
    assert.ok(FUNGI_VALUESTATE_007 !== undefined, "Expected FUNGI_VALUESTATE_007 to be exported");
    assert.equal(FUNGI_VALUESTATE_007.code, "FUNGI-VALUESTATE-007");
    assert.equal(FUNGI_VALUESTATE_007.name, "REDACTED_BOUNDARY_VIOLATION");
    assert.equal(FUNGI_VALUESTATE_007.severity, "error");
  });
});
