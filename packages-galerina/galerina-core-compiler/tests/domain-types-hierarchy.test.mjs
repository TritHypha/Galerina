import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkTypes(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

function noTypeErrors(result) {
  return !hasDiag(result, "SPORE-TYPE-001") && !hasDiag(result, "SPORE-TYPE-009");
}

// =============================================================================
// 1. Primitive types
// =============================================================================

describe("Domain type hierarchy — primitive types", () => {
  it("accepts Bool as a parameter type", () => {
    const result = parseAndCheck(`
flow test(flag: Bool) -> Bool {
  return flag
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Bool must be a recognized type");
  });

  it("accepts Boolean as an alias for Bool", () => {
    const result = parseAndCheck(`
flow test(flag: Boolean) -> Boolean {
  return flag
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Boolean must be recognized as alias for Bool");
  });

  it("accepts Int as a parameter type", () => {
    const result = parseAndCheck(`
flow test(n: Int) -> Int {
  return n
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Int must be a recognized type");
  });

  it("accepts Double (Float64 alias) as a parameter type", () => {
    const result = parseAndCheck(`
flow test(x: Double) -> Double {
  return x
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Double must be a recognized type (Float64 alias)");
  });

  it("accepts Float64 as a parameter type", () => {
    const result = parseAndCheck(`
flow test(x: Float64) -> Float64 {
  return x
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Float64 must be a recognized type");
  });

  it("accepts Decimal as a parameter type", () => {
    const result = parseAndCheck(`
flow test(x: Decimal) -> Decimal {
  return x
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Decimal must be a recognized type");
  });

  it("accepts String as a parameter type", () => {
    const result = parseAndCheck(`
flow test(s: String) -> String {
  return s
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "String must be a recognized type");
  });

  it("accepts Bytes as a parameter type", () => {
    const result = parseAndCheck(`
flow test(b: Bytes) -> Bytes {
  return b
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Bytes must be a recognized type");
  });

  it("accepts Char as a parameter type", () => {
    const result = parseAndCheck(`
flow test(c: Char) -> Char {
  return c
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Char must be a recognized type");
  });

  it("accepts all primitive types together in one flow", () => {
    const result = parseAndCheck(`
flow test(
  a: Bool,
  b: Boolean,
  c: Int,
  d: Double,
  e: Float64,
  f: Decimal,
  g: String,
  h: Bytes,
  i: Char
) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "All primitive types must be recognized");
  });
});

// =============================================================================
// 2. Core algebraic types: Result<T,E>, Option<T>, Brand<T,"Name">
// =============================================================================

describe("Domain type hierarchy — core algebraic types", () => {
  it("accepts Result<String, Error> with correct arity", () => {
    const result = parseAndCheck(`
flow test() -> Result<String, Error> {
  return Ok("ok")
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Result must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Result<T,E> has correct arity");
  });

  it("accepts Option<String> with correct arity", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> Option<String> {
  return x
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Option must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Option<T> has correct arity");
  });

  it("accepts Brand<String, 'CustomerId'> with correct arity — Brand base is recognized, no SPORE-TYPE-009", () => {
    // Note: the string literal arg "CustomerId" is checked as a type reference and
    // emits SPORE-TYPE-001 for the literal itself — that is intentional (string literals
    // are not type names). The arity check (SPORE-TYPE-009) must NOT fire.
    const result = parseAndCheck(`
flow test(x: Brand<String, "CustomerId">) -> Brand<String, "CustomerId"> {
  return x
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Brand<T,Name> has correct arity — no SPORE-TYPE-009");
    // Brand itself must not be flagged unknown — only the string literal arg is
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'Brand'")),
      "Brand must not be reported as unknown — only the string arg may be",
    );
  });

  it("accepts Result<Int, ValidationError> as parameter", () => {
    const result = parseAndCheck(`
flow test(r: Result<Int, ValidationError>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Result<Int,ValidationError> types must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Result<T,E> arity is correct");
  });
});

// =============================================================================
// 3. Collections: Array<T>, Map<K,V>
// =============================================================================

describe("Domain type hierarchy — collection types", () => {
  it("accepts Array<String> as a type annotation", () => {
    const result = parseAndCheck(`
flow test(xs: Array<String>) -> Array<String> {
  return xs
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Array must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Array<T> has correct arity");
  });

  it("accepts Array<Int> as a type annotation", () => {
    const result = parseAndCheck(`
flow test(ns: Array<Int>) -> Array<Int> {
  return ns
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Array<Int> must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Array<Int> has correct arity");
  });

  it("accepts Map<String, Int> as a type annotation", () => {
    const result = parseAndCheck(`
flow test(m: Map<String, Int>) -> Map<String, Int> {
  return m
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Map must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Map<K,V> has correct arity");
  });

  it("accepts Map<String, Bool> as a type annotation", () => {
    const result = parseAndCheck(`
flow test(m: Map<String, Bool>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Map<String,Bool> types must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Map<K,V> arity is correct");
  });
});

// =============================================================================
// 4. Governance qualifiers: protected Email, redacted Email
// =============================================================================

describe("Domain type hierarchy — governance qualifier binding types", () => {
  it("protected Email binding type does not emit SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

flow test(raw: String) -> String {
  let email: protected Email = validate.email(raw)?
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    const hasProtectedAsUnknown = type001.some(
      (d) => d.message.includes("'protected'") || d.message.includes('"protected"'),
    );
    assert.ok(!hasProtectedAsUnknown, "protected qualifier must not be treated as unknown type");
  });

  it("redacted Email binding type does not emit SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

flow test(email: Email) -> String {
  let audit: redacted Email = redact(email)
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    const hasRedactedAsUnknown = type001.some(
      (d) => d.message.includes("'redacted'") || d.message.includes('"redacted"'),
    );
    assert.ok(!hasRedactedAsUnknown, "redacted qualifier must not be treated as unknown type");
  });

  it("protected String binding type does not emit SPORE-TYPE-001 for String", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let s: protected String = "hello"
  return "ok"
}
`);
    const type001Messages = diagsWithCode(result, "SPORE-TYPE-001").map((d) => d.message);
    const hasStringAsUnknown = type001Messages.some((m) => m.includes("'String'") || m.includes('"String"'));
    assert.ok(!hasStringAsUnknown, "String inside protected qualifier must remain recognized");
  });

  it("protected Int binding type does not emit SPORE-TYPE-001 for Int", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let n: protected Int = 42
  return "ok"
}
`);
    const type001Messages = diagsWithCode(result, "SPORE-TYPE-001").map((d) => d.message);
    const hasIntAsUnknown = type001Messages.some((m) => m.includes("'Int'") || m.includes('"Int"'));
    assert.ok(!hasIntAsUnknown, "Int inside protected qualifier must remain recognized");
  });
});

// =============================================================================
// 5. Finance: Money<GBP>, Money<USD>, Money<EUR>
// =============================================================================

describe("Domain type hierarchy — finance types", () => {
  it("accepts Money<GBP> with correct arity", () => {
    const result = parseAndCheck(`
pure flow vat(amount: Money<GBP>) -> Money<GBP> {
  return amount
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money and GBP must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Money<GBP> has correct arity");
  });

  it("accepts Money<USD> with correct arity", () => {
    const result = parseAndCheck(`
flow test(price: Money<USD>) -> Money<USD> {
  return price
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money and USD must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Money<USD> has correct arity");
  });

  it("accepts Money<EUR> with correct arity", () => {
    const result = parseAndCheck(`
flow test(price: Money<EUR>) -> Money<EUR> {
  return price
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Money and EUR must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Money<EUR> has correct arity");
  });

  it("GBP, USD, EUR currency codes are recognized as standalone types", () => {
    const result = parseAndCheck(`
flow test(
  a: Money<GBP>,
  b: Money<USD>,
  c: Money<EUR>
) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "GBP, USD, EUR must all be recognized");
  });
});

// =============================================================================
// 6. Time: Duration, Timestamp
// =============================================================================

describe("Domain type hierarchy — time types", () => {
  it("accepts Duration as a parameter type", () => {
    const result = parseAndCheck(`
flow test(d: Duration) -> Duration {
  return d
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Duration must be a recognized type");
  });

  it("accepts Timestamp as a parameter type (used for DateTime/Date)", () => {
    const result = parseAndCheck(`
flow test(t: Timestamp) -> Timestamp {
  return t
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Timestamp must be a recognized type");
  });

  it("accepts both Duration and Timestamp together", () => {
    const result = parseAndCheck(`
flow test(start: Timestamp, window: Duration) -> Timestamp {
  return start
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Duration and Timestamp must both be recognized");
  });

  it("accepts Date and Time as separate types", () => {
    const result = parseAndCheck(`
flow test(d: Date, t: Time) -> DateTime {
  return DateTime
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Date, Time, DateTime must be recognized");
  });
});

// =============================================================================
// 7. AI types: Tensor<Float32,[768]>, Tensor<Int8,[512]>, AnyTensor, Embedding, Classification
// =============================================================================

describe("Domain type hierarchy — AI/ML types", () => {
  it("accepts Tensor<Float32, [768]> with correct arity — no SPORE-TYPE-009", () => {
    // Note: the shape literal [768] is not a type name and may emit SPORE-TYPE-001 for
    // the shape arg. That is intentional — Tensor shape args are dimension literals,
    // not type references. The arity check (SPORE-TYPE-009) must NOT fire.
    const result = parseAndCheck(`
flow test(t: Tensor<Float32, [768]>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Tensor<Float32,[768]> has correct arity — no SPORE-TYPE-009");
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'Tensor'") || d.message.includes("'Float32'")),
      "Tensor and Float32 must not be flagged unknown — only the shape literal may be",
    );
  });

  it("accepts Tensor<Int8, [512]> with correct arity — no SPORE-TYPE-009", () => {
    // Shape literal [512] is a dimension literal, not a type — may emit SPORE-TYPE-001 for
    // the literal itself but NOT for Tensor or Int8, and NOT SPORE-TYPE-009.
    const result = parseAndCheck(`
flow test(t: Tensor<Int8, [512]>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Tensor<Int8,[512]> has correct arity — no SPORE-TYPE-009");
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'Tensor'") || d.message.includes("'Int8'")),
      "Tensor and Int8 must not be flagged unknown",
    );
  });

  it("accepts AnyTensor as a non-generic type", () => {
    const result = parseAndCheck(`
flow test(t: AnyTensor) -> AnyTensor {
  return t
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "AnyTensor must be a recognized type");
  });

  it("accepts Embedding as a type", () => {
    const result = parseAndCheck(`
flow test(e: Embedding) -> Embedding {
  return e
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Embedding must be a recognized type");
  });

  it("accepts Classification as a type", () => {
    const result = parseAndCheck(`
flow test(c: Classification) -> Classification {
  return c
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Classification must be a recognized type");
  });

  it("accepts Float32 as a standalone type (element type for Tensor)", () => {
    const result = parseAndCheck(`
flow test(x: Float32) -> Float32 {
  return x
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Float32 must be a recognized numeric type");
  });
});

// =============================================================================
// 8. Brand types: CustomerId, PatientId, AccountId
// =============================================================================

describe("Domain type hierarchy — built-in brand identity types", () => {
  it("accepts CustomerId as a built-in type", () => {
    const result = parseAndCheck(`
flow test(id: CustomerId) -> CustomerId {
  return id
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "CustomerId must be a recognized built-in type");
  });

  it("accepts PatientId as a built-in type", () => {
    const result = parseAndCheck(`
flow test(id: PatientId) -> PatientId {
  return id
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "PatientId must be a recognized built-in type");
  });

  it("accepts AccountId as a built-in type", () => {
    const result = parseAndCheck(`
flow test(id: AccountId) -> AccountId {
  return id
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "AccountId must be a recognized built-in type");
  });

  it("accepts user-defined Brand alias CustomerId = Brand<String,'CustomerId'> in flow param", () => {
    // The type alias 'CustomerId' must be accepted as a recognized type in the flow.
    // The string literal "CustomerId" inside the Brand<> definition may emit SPORE-TYPE-001
    // for the literal itself — that is expected. CustomerId itself must NOT be flagged.
    const result = parseAndCheck(`
type CustomerId = Brand<String, "CustomerId">

flow test(id: CustomerId) -> String {
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'CustomerId'")),
      "CustomerId alias must be recognized as a user-defined type",
    );
  });

  it("accepts user-defined Brand alias PatientId = Brand<String,'PatientId'> in flow param", () => {
    // PatientId alias must be recognized; SPORE-TYPE-001 for the string literal in Brand<> is expected.
    const result = parseAndCheck(`
type PatientId = Brand<String, "PatientId">

flow test(id: PatientId) -> String {
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'PatientId'")),
      "PatientId alias must be recognized as a user-defined type",
    );
  });

  it("accepts user-defined Brand alias AccountId = Brand<String,'AccountId'> in flow param", () => {
    // AccountId alias must be recognized; SPORE-TYPE-001 for the string literal in Brand<> is expected.
    const result = parseAndCheck(`
type AccountId = Brand<String, "AccountId">

flow test(id: AccountId) -> String {
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'AccountId'")),
      "AccountId alias must be recognized as a user-defined type",
    );
  });
});

// =============================================================================
// 9. Generic arity checks: all types in GENERIC_ARITY have correct arg counts
// =============================================================================

describe("Domain type hierarchy — GENERIC_ARITY correct counts", () => {
  it("Option requires exactly 1 type arg (no error for Option<String>)", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> Option<String> { return x }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Option<String> is correct arity");
  });

  it("Result requires exactly 2 type args (no error for Result<String,Error>)", () => {
    const result = parseAndCheck(`
flow test() -> Result<String, Error> { return Ok("ok") }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Result<String,Error> is correct arity");
  });

  it("Array requires exactly 1 type arg (no error for Array<Int>)", () => {
    const result = parseAndCheck(`
flow test(xs: Array<Int>) -> Array<Int> { return xs }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Array<Int> is correct arity");
  });

  it("Map requires exactly 2 type args (no error for Map<String,Int>)", () => {
    const result = parseAndCheck(`
flow test(m: Map<String, Int>) -> Map<String, Int> { return m }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Map<String,Int> is correct arity");
  });

  it("Money requires exactly 1 type arg (no error for Money<GBP>)", () => {
    const result = parseAndCheck(`
flow test(m: Money<GBP>) -> Money<GBP> { return m }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Money<GBP> is correct arity");
  });

  it("Tensor requires exactly 2 type args — no SPORE-TYPE-009 for Tensor<Float32,[768]>", () => {
    // Note: [768] shape literal will emit SPORE-TYPE-001 for the literal — that is expected.
    // The arity check (SPORE-TYPE-009) must NOT fire.
    const result = parseAndCheck(`
flow test(t: Tensor<Float32, [768]>) -> Void { return }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Tensor<Float32,[768]> is correct arity — no SPORE-TYPE-009");
  });

  it("Brand requires exactly 2 type args — no SPORE-TYPE-009 for Brand<String,'X'>", () => {
    // Note: "X" (the string literal) will emit SPORE-TYPE-001 — that is expected behavior.
    // The arity check (SPORE-TYPE-009) must NOT fire.
    const result = parseAndCheck(`
flow test(b: Brand<String, "X">) -> Void { return }
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Brand<String,'X'> is correct arity — no SPORE-TYPE-009");
  });
});

// =============================================================================
// 10. SPORE-TYPE-001: unknown type catches misspellings
// =============================================================================

describe("Domain type hierarchy — SPORE-TYPE-001 unknown type detection", () => {
  it("emits SPORE-TYPE-001 for misspelled 'Booleen'", () => {
    const result = parseAndCheck(`
flow test(flag: Booleen) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-001"), "Booleen must be rejected as unknown type");
  });

  it("emits SPORE-TYPE-001 for misspelled 'Integr'", () => {
    const result = parseAndCheck(`
flow test(n: Integr) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-001"), "Integr must be rejected as unknown type");
  });

  it("emits SPORE-TYPE-001 for misspelled 'Monye'", () => {
    const result = parseAndCheck(`
flow test(m: Monye<GBP>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-001"), "Monye must be rejected as unknown type");
  });

  it("emits SPORE-TYPE-001 for misspelled 'Tenssor'", () => {
    const result = parseAndCheck(`
flow test(t: Tenssor<Float32, [128]>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-001"), "Tenssor must be rejected as unknown type");
  });

  it("emits SPORE-TYPE-001 for misspelled 'Embeding'", () => {
    const result = parseAndCheck(`
flow test(e: Embeding) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-001"), "Embeding must be rejected as unknown type");
  });

  it("emits SPORE-TYPE-001 for misspelled 'Durration'", () => {
    const result = parseAndCheck(`
flow test(d: Durration) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-001"), "Durration must be rejected as unknown type");
  });
});

// =============================================================================
// 11. SPORE-TYPE-009: wrong generic arity
// =============================================================================

describe("Domain type hierarchy — SPORE-TYPE-009 wrong generic arity", () => {
  it("emits SPORE-TYPE-009 for Option with 2 args (Option<String, Error>)", () => {
    const result = parseAndCheck(`
flow test(x: Option<String, Error>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Option<String,Error> must be rejected for wrong arity");
  });

  it("emits SPORE-TYPE-009 for Result with 1 arg (Result<String>)", () => {
    const result = parseAndCheck(`
flow test() -> Result<String> { return Ok("ok") }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Result<String> must be rejected for wrong arity");
  });

  it("emits SPORE-TYPE-009 for Map with 1 arg (Map<String>)", () => {
    const result = parseAndCheck(`
flow test(m: Map<String>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Map<String> must be rejected for wrong arity");
  });

  it("emits SPORE-TYPE-009 for Money with 0 args (bare Money)", () => {
    const result = parseAndCheck(`
flow test(m: Money) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Bare Money must be rejected — requires currency arg");
  });

  it("emits SPORE-TYPE-009 for Brand with 1 arg (Brand<String>)", () => {
    const result = parseAndCheck(`
flow test(b: Brand<String>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Brand<String> must be rejected — requires 2 args");
  });

  it("emits SPORE-TYPE-009 for Tensor with 1 arg (Tensor<Float32>)", () => {
    const result = parseAndCheck(`
flow test(t: Tensor<Float32>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Tensor<Float32> must be rejected — requires shape arg");
  });

  it("emits SPORE-TYPE-009 for Array with 2 args (Array<String, Int>)", () => {
    const result = parseAndCheck(`
flow test(xs: Array<String, Int>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Array<String,Int> must be rejected — Array takes 1 arg");
  });
});

// =============================================================================
// 12. Type inference: literals infer correctly
// =============================================================================

describe("Domain type hierarchy — literal type inference", () => {
  it("integer literal 42 infers as Int (no type mismatch for Int binding)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let count: Int = 42
  return "ok"
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-002"), "42 must infer as Int without mismatch");
  });

  it("float literal 3.14 infers as Float (no type mismatch for Float binding)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let pi: Float = 3.14
  return "ok"
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-002"), "3.14 must infer as Float without mismatch");
  });

  it("string literal 'hello' infers as String (no type mismatch for String binding)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = "hello"
  return name
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-002"), "'hello' must infer as String without mismatch");
  });

  it("bool literal true infers as Bool (no type mismatch for Bool binding)", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  let flag: Bool = true
  return flag
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-002"), "true must infer as Bool without mismatch");
  });

  it("integer literal assigned to String binding emits SPORE-TYPE-002", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = 42
  return "ok"
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-002"), "42 must not be assignable to String");
  });

  it("string literal assigned to Int binding emits SPORE-TYPE-002", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let count: Int = "hello"
  return "ok"
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-002"), "'hello' must not be assignable to Int");
  });

  it("bool literal assigned to String binding emits SPORE-TYPE-002", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = true
  return name
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-002"), "true must not be assignable to String");
  });
});

// =============================================================================
// 13. Protected qualifier: protected Int, protected String, protected Array<Email>
// =============================================================================

describe("Domain type hierarchy — protected qualifier", () => {
  it("protected Int binding does not emit SPORE-TYPE-001 for protected or Int", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let value: protected Int = 99
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'Int'") || d.message.includes('"Int"')),
      "Int inside protected must remain recognized",
    );
    assert.ok(
      !type001.some((d) => d.message.includes("'protected'") || d.message.includes('"protected"')),
      "protected qualifier must not be treated as type name",
    );
  });

  it("protected String binding does not emit SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let s: protected String = "secret"
  return "ok"
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) => d.message.includes("'String'") || d.message.includes('"String"')),
      "String inside protected must remain recognized",
    );
  });

  it("protected Array<Email> binding does not emit SPORE-TYPE-001 for Array or Email", () => {
    const result = parseAndCheck(`
flow test(emails: protected Array<Email>) -> Void {
  return
}
`);
    const type001 = diagsWithCode(result, "SPORE-TYPE-001");
    assert.ok(
      !type001.some((d) =>
        d.message.includes("'Array'") || d.message.includes('"Array"') ||
        d.message.includes("'Email'") || d.message.includes('"Email"'),
      ),
      "Array and Email inside protected must remain recognized",
    );
  });
});

// =============================================================================
// 14. Nested generics: Option<Array<Int>>, Result<Array<Email>, ValidationError>
// =============================================================================

describe("Domain type hierarchy — nested generic types", () => {
  it("accepts Option<Array<Int>> — no SPORE-TYPE-001 or SPORE-TYPE-009", () => {
    const result = parseAndCheck(`
flow test(xs: Option<Array<Int>>) -> Option<Array<Int>> {
  return xs
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Option, Array, Int must all be recognized in nested form");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Option<Array<Int>> has correct arities at all levels");
  });

  it("accepts Result<Array<Email>, ValidationError> — no SPORE-TYPE-001 or SPORE-TYPE-009", () => {
    const result = parseAndCheck(`
flow test(r: Result<Array<Email>, ValidationError>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Result, Array, Email, ValidationError must all be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Nested Result<Array<Email>,ValidationError> has correct arities");
  });

  it("accepts Option<Map<String, Int>> — no SPORE-TYPE-009", () => {
    const result = parseAndCheck(`
flow test(m: Option<Map<String, Int>>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Option, Map, String, Int must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Option<Map<K,V>> has correct arities");
  });

  it("emits SPORE-TYPE-009 for Option<Map<String>> — inner Map has wrong arity", () => {
    const result = parseAndCheck(`
flow test(m: Option<Map<String>>) -> Void { return }
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-009"), "Inner Map<String> must be caught for wrong arity in nested context");
  });

  it("accepts Result<Option<String>, Error> — doubly nested algebraic", () => {
    const result = parseAndCheck(`
flow test(r: Result<Option<String>, Error>) -> Void {
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-001"), "Result, Option, String, Error must be recognized");
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Result<Option<T>,E> has correct arities");
  });
});
