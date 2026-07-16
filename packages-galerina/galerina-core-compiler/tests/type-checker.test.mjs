import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.fungi");
  return checkTypes(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

// ── FUNGI-TYPE-001: Unknown type ────────────────────────────────────────────────

describe("Type checker — FUNGI-TYPE-001 unknown type", () => {
  it("emits FUNGI-TYPE-001 for a misspelled built-in type in a parameter", () => {
    const result = parseAndCheck(`
flow test(name: Strng) -> String {
  return name
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-001"),
      `Expected FUNGI-TYPE-001 for 'Strng', got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits FUNGI-TYPE-001 for an unknown return type", () => {
    const result = parseAndCheck(`
flow test(x: Int) -> Integerr {
  return x
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-001"),
      `Expected FUNGI-TYPE-001 for 'Integerr'`,
    );
  });

  it("emits FUNGI-TYPE-001 for unknown type in let binding annotation", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: Numbr = 42
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-001"),
      `Expected FUNGI-TYPE-001 for 'Numbr'`,
    );
  });

  it("does not emit FUNGI-TYPE-001 for all built-in scalar types", () => {
    const result = parseAndCheck(`
flow test(
  a: Bool,
  b: Int,
  c: String,
  d: Float,
  e: Bytes,
  f: Timestamp,
  g: Duration
) -> Void {
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-001"),
      `Unexpected FUNGI-TYPE-001 for built-in scalar types`,
    );
  });

  it("does not emit FUNGI-TYPE-001 for all built-in error types", () => {
    const result = parseAndCheck(`
flow test(e: ApiError) -> Result<String, ValidationError> {
  return Ok("ok")
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-001"),
      `Unexpected FUNGI-TYPE-001 for ApiError / ValidationError`,
    );
  });

  it("does not emit FUNGI-TYPE-001 for a user-defined type", () => {
    const result = parseAndCheck(`
type Order {
  id: String
}

flow test(order: Order) -> String {
  return order.id
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-001"),
      `Unexpected FUNGI-TYPE-001 for user-defined type 'Order'`,
    );
  });

  it("does not emit FUNGI-TYPE-001 for a user-defined enum", () => {
    const result = parseAndCheck(`
enum Status {
  Active
  Inactive
}

flow test(s: Status) -> Bool {
  return true
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-001"),
      `Unexpected FUNGI-TYPE-001 for user-defined enum 'Status'`,
    );
  });

  it("includes a fuzzy suggestion when the type name is close to a known type", () => {
    const result = parseAndCheck(`
flow test(x: Strng) -> String {
  return x
}
`);
    const diags = diagsWithCode(result, "FUNGI-TYPE-001");
    assert.ok(diags.length > 0, `Expected FUNGI-TYPE-001 for 'Strng'`);
    // Suggestion should mention String
    const hasSuggestion = diags.some(
      (d) => d.suggestedFix !== undefined && d.suggestedFix.includes("String"),
    );
    assert.ok(hasSuggestion, `Expected fuzzy suggestion mentioning 'String'`);
  });
});

// ── FUNGI-TYPE-009: Generic arity mismatch ──────────────────────────────────────

describe("Type checker — FUNGI-TYPE-009 generic arity", () => {
  it("emits FUNGI-TYPE-009 for Option with two type args", () => {
    const result = parseAndCheck(`
flow test(x: Option<String, Error>) -> Option<String, Error> {
  return x
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-009"),
      `Expected FUNGI-TYPE-009 for Option<String, Error>`,
    );
  });

  it("emits FUNGI-TYPE-009 for Map with only one type arg", () => {
    const result = parseAndCheck(`
flow test(m: Map<String>) -> Map<String> {
  return m
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-009"),
      `Expected FUNGI-TYPE-009 for Map<String>`,
    );
  });

  it("emits FUNGI-TYPE-009 for Result with one type arg", () => {
    const result = parseAndCheck(`
flow test() -> Result<String> {
  return Ok("ok")
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-009"),
      `Expected FUNGI-TYPE-009 for Result<String>`,
    );
  });

  it("does not emit FUNGI-TYPE-009 for Option with correct arity", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> Option<String> {
  return x
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-009"),
      `Unexpected FUNGI-TYPE-009 for Option<String>`,
    );
  });

  it("does not emit FUNGI-TYPE-009 for Result<T, E> with correct arity", () => {
    const result = parseAndCheck(`
flow test() -> Result<String, Error> {
  return Ok("ok")
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-009"),
      `Unexpected FUNGI-TYPE-009 for Result<String, Error>`,
    );
  });

  it("does not emit FUNGI-TYPE-009 for Map<K, V> with correct arity", () => {
    const result = parseAndCheck(`
flow test(m: Map<String, Int>) -> Map<String, Int> {
  return m
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-009"),
      `Unexpected FUNGI-TYPE-009 for Map<String, Int>`,
    );
  });

  it("does not emit FUNGI-TYPE-009 for Array<T> with correct arity", () => {
    const result = parseAndCheck(`
flow test(arr: Array<String>) -> Array<String> {
  return arr
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-009"),
      `Unexpected FUNGI-TYPE-009 for Array<String>`,
    );
  });

  it("does not emit FUNGI-TYPE-009 for Money<GBP> with correct arity", () => {
    const result = parseAndCheck(`
pure flow vat(amount: Money<GBP>) -> Money<GBP> {
  return amount
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-009"),
      `Unexpected FUNGI-TYPE-009 for Money<GBP>`,
    );
  });

  it("also checks type args recursively", () => {
    // Option<Map<String>> — Map has wrong arity (1 arg instead of 2)
    const result = parseAndCheck(`
flow test(x: Option<Map<String>>) -> Option<Map<String>> {
  return x
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-009"),
      `Expected FUNGI-TYPE-009 for nested Map<String>`,
    );
  });
});

// ── All built-in generic types with correct arity ─────────────────────────────

describe("Type checker — built-in generic types valid arity", () => {
  it("accepts all generic types with correct arity", () => {
    const result = parseAndCheck(`
flow test(
  a: Option<String>,
  b: Result<String, Error>,
  c: Array<Int>,
  d: Set<String>,
  e: Map<String, Int>,
  f: Channel<String>,
  g: Money<GBP>
) -> Void {
  return
}
`);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Unexpected type errors: ${errors.map((d) => `${d.code}: ${d.message}`).join("\n")}`,
    );
  });
});

// ── Type checker on the full Galerina type catalogue ────────────────────────────

describe("Type checker — full built-in type catalogue", () => {
  it("accepts all numeric types as parameter annotations", () => {
    const result = parseAndCheck(`
flow test(
  a: Int8,
  b: Int16,
  c: Int32,
  d: Int64,
  e: UInt8,
  f: UInt16,
  g: UInt32,
  h: UInt64,
  i: Float16,
  j: Float32,
  k: Float64,
  l: Decimal
) -> Void {
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-001"),
      `Unexpected FUNGI-TYPE-001 for numeric types`,
    );
  });

  it("accepts all JSON types as parameter annotations", () => {
    const result = parseAndCheck(`
flow test(
  a: Json,
  b: JsonNull,
  c: JsonBool,
  d: JsonNumber,
  e: JsonString,
  f: JsonArray,
  g: JsonObject
) -> Void {
  return
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-001"),
      `Unexpected FUNGI-TYPE-001 for JSON types`,
    );
  });
});

// ── FUNGI-TYPE-025: null / undefined rejection ──────────────────────────────────

describe("Type checker — FUNGI-TYPE-025 null/undefined", () => {
  it("emits FUNGI-TYPE-025 for null literal in expression", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: String = null
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-025"), "Expected FUNGI-TYPE-025 for null");
  });

  it("emits FUNGI-TYPE-025 for undefined literal in expression", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: String = undefined
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-025"), "Expected FUNGI-TYPE-025 for undefined");
  });

  it("does not emit FUNGI-TYPE-025 for None (valid Galerina absence value)", () => {
    const result = parseAndCheck(`
flow test() -> Option<String> {
  return None
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-025"), "Unexpected FUNGI-TYPE-025 for None");
  });
});

// ── FUNGI-TYPE-020: shadowed binding ───────────────────────────────────────────

describe("Type checker — FUNGI-TYPE-020 shadowed binding", () => {
  it("emits FUNGI-TYPE-020 warning when inner binding shadows outer", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = "outer"
  if true {
    let name: String = "inner"
    return name
  }
  return name
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-020"), "Expected FUNGI-TYPE-020 for shadowed binding");
    const diags = diagsWithCode(result, "FUNGI-TYPE-020");
    assert.ok(diags.every((d) => d.severity === "warning"), "FUNGI-TYPE-020 must be a warning");
  });

  it("does not emit FUNGI-TYPE-020 for first declaration (no shadow)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = "only"
  return name
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-020"), "Unexpected FUNGI-TYPE-020 for non-shadowing binding");
  });
});

// ── FUNGI-NAME-002: duplicate name in same scope ────────────────────────────────

describe("Type checker — FUNGI-NAME-002 duplicate name", () => {
  it("emits FUNGI-NAME-002 when same name declared twice in same scope", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: String = "first"
  let x: String = "second"
  return x
}
`);
    assert.ok(hasDiag(result, "FUNGI-NAME-002"), "Expected FUNGI-NAME-002 for duplicate binding");
  });

  it("does not emit FUNGI-NAME-002 for same name in different scopes", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: String = "outer"
  if true {
    let x: String = "inner"
    return x
  }
  return x
}
`);
    assert.ok(!hasDiag(result, "FUNGI-NAME-002"), "Unexpected FUNGI-NAME-002 — different scopes should not be duplicate");
  });
});

// ── FUNGI-TYPE-023: mandatory wildcard arm (supersedes FUNGI-TYPE-021) ────────────
// Every match must end with a `_ =>` (or `else =>`) catch-all — fail-closed,
// deny-by-default. This is required even when all variants are explicitly
// covered (user directive, task #174).

describe("Type checker — FUNGI-TYPE-023 mandatory wildcard arm", () => {
  it("emits FUNGI-TYPE-023 when Option match has no wildcard", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> String {
  match x {
    Some(v) => v
  }
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-023"), "Expected FUNGI-TYPE-023 for Option match without _");
  });

  it("emits FUNGI-TYPE-023 when Result match has no wildcard", () => {
    const result = parseAndCheck(`
flow test(x: Result<String, Error>) -> String {
  match x {
    Ok(v) => v
  }
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-023"), "Expected FUNGI-TYPE-023 for Result match without _");
  });

  it("emits FUNGI-TYPE-023 when enum match has no wildcard", () => {
    const result = parseAndCheck(`
enum Status {
  Active
  Suspended
  Deleted
}

flow test(s: Status) -> String {
  match s {
    Active => "active"
    Suspended => "suspended"
  }
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-023"), "Expected FUNGI-TYPE-023 for enum match without _");
  });

  it("emits FUNGI-TYPE-023 even when all variants are present (wildcard is mandatory)", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> String {
  match x {
    Some(v) => v
    None => "default"
  }
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-023"), "Wildcard mandatory even when Some+None both present");
  });

  it("does not emit FUNGI-TYPE-023 when wildcard _ arm is present", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> String {
  match x {
    Some(v) => v
    _ => "default"
  }
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-023"), "Unexpected FUNGI-TYPE-023 when _ wildcard present");
  });

  it("does not emit FUNGI-TYPE-023 when else arm is present", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> String {
  match x {
    Some(v) => v
    else => "default"
  }
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-023"), "else arm counts as the wildcard catch-all");
  });
});

// ── FUNGI-TYPE-022: unreachable pattern ────────────────────────────────────────

describe("Type checker — FUNGI-TYPE-022 unreachable pattern", () => {
  it("emits FUNGI-TYPE-022 when arm follows wildcard _", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> String {
  match x {
    _ => "default"
    None => "none"
  }
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-022"), "Expected FUNGI-TYPE-022 for arm after wildcard");
  });

  it("does not emit FUNGI-TYPE-022 when wildcard is last arm", () => {
    const result = parseAndCheck(`
flow test(x: Option<String>) -> String {
  match x {
    Some(v) => v
    _ => "default"
  }
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-022"), "Unexpected FUNGI-TYPE-022 when wildcard is last");
  });
});

describe("Type checker — FUNGI-TYPE-025 null/undefined", () => {
  it("emits FUNGI-TYPE-025 for null literal in expression", () => {
    const result = parseAndCheck(`
flow test() -> Option<String> {
  return null
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-025"), "Expected FUNGI-TYPE-025 for null");
  });

  it("emits FUNGI-TYPE-025 for undefined literal in expression", () => {
    const result = parseAndCheck(`
flow test() -> Option<String> {
  return undefined
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-025"), "Expected FUNGI-TYPE-025 for undefined");
  });

  it("does not emit FUNGI-TYPE-025 for None", () => {
    const result = parseAndCheck(`
flow test() -> Option<String> {
  return None
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-025"), "None is a valid Galerina absence value");
  });
});

describe("Type checker — FUNGI-TYPE-020 shadowed binding", () => {
  it("emits FUNGI-TYPE-020 warning when inner binding shadows outer", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  let total: Int = 1
  if true {
    let total: Int = 2
  }
  return total
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-020"), "Expected FUNGI-TYPE-020 for inner shadow");
  });

  it("does not emit FUNGI-TYPE-020 for same-scope redeclaration", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  let total: Int = 1
  let total: Int = 2
  return total
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-020"), "Same-scope duplicates belong to FUNGI-NAME-002");
  });

  it("FUNGI-TYPE-020 has severity warning", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  let total: Int = 1
  if true {
    let total: Int = 2
  }
  return total
}
`);
    const diag = diagsWithCode(result, "FUNGI-TYPE-020")[0];
    assert.equal(diag?.severity, "warning");
  });
});

// (FUNGI-TYPE-023 mandatory-wildcard coverage is consolidated into the suite above;
//  the former duplicate FUNGI-TYPE-021 non-exhaustive-match block was removed when
//  variant-exhaustiveness was superseded by the mandatory wildcard rule, task #174.)

describe("Type checker — prefix qualifier not FUNGI-TYPE-001", () => {
  it("let email: protected Email does not emit FUNGI-TYPE-001 for protected", () => {
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

flow test(raw: String) -> String {
  let email: protected Email = validate.email(raw)?
  return "ok"
}
`);
    const messages = diagsWithCode(result, "FUNGI-TYPE-001").map((d) => d.message).join("\n");
    assert.ok(!messages.includes("'protected'"), `Unexpected protected UnknownType: ${messages}`);
  });

  it("let audit: redacted Email does not emit FUNGI-TYPE-001 for redacted", () => {
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

flow test(email: Email) -> String {
  let audit: redacted Email = redact(email)
  return "ok"
}
`);
    const messages = diagsWithCode(result, "FUNGI-TYPE-001").map((d) => d.message).join("\n");
    assert.ok(!messages.includes("'redacted'"), `Unexpected redacted UnknownType: ${messages}`);
  });
});

// ── FUNGI-TYPE-002: TypeMismatch (Phase 8A literal inference) ──────────────────

describe("Type checker — FUNGI-TYPE-002 type mismatch", () => {
  it("emits FUNGI-TYPE-002 when string literal assigned to Int binding", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let count: Int = "hello"
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-002"), "Expected FUNGI-TYPE-002 for String assigned to Int");
  });

  it("emits FUNGI-TYPE-002 when bool literal assigned to String binding", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = true
  return name
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-002"), "Expected FUNGI-TYPE-002 for Bool assigned to String");
  });

  it("does not emit FUNGI-TYPE-002 for correct Int assignment", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let count: Int = 42
  return "ok"
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Unexpected FUNGI-TYPE-002 for correct Int = 42");
  });

  it("does not emit FUNGI-TYPE-002 for correct String assignment", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = "Alice"
  return name
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Unexpected FUNGI-TYPE-002 for correct String = 'Alice'");
  });

  it("does not emit FUNGI-TYPE-002 for Auto inference", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: Auto = 42
  return "ok"
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Unexpected FUNGI-TYPE-002 for Auto binding");
  });

  it("does not emit FUNGI-TYPE-002 when assigning Int literal to sized int type (widening)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let n: Int32 = 5
  return "ok"
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Unexpected FUNGI-TYPE-002 for Int → Int32 widening");
  });
});

// ── FUNGI-TYPE-004: InvalidBinaryOperation (Phase 8A) ─────────────────────────

describe("Type checker — FUNGI-TYPE-004 binary operation", () => {
  it("emits FUNGI-TYPE-004 when String + Int is used", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: String = "a" + 42
  return x
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for String + Int");
  });

  it("does not emit FUNGI-TYPE-004 for String + String", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: String = "foo" + "bar"
  return x
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for String + String");
  });

  it("does not emit FUNGI-TYPE-004 for Int + Int", () => {
    const result = parseAndCheck(`
flow test() -> Int {
  return 3 + 4
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-004"), "Unexpected FUNGI-TYPE-004 for Int + Int");
  });

  it("emits FUNGI-TYPE-004 for Bool used with &&  but left operand is String literal", () => {
    const result = parseAndCheck(`
flow test() -> Bool {
  return "hello" && true
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for String && Bool");
  });
});

// ── FUNGI-TYPE-007: InvalidArgumentCount (Phase 8A) ───────────────────────────

describe("Type checker — FUNGI-TYPE-007 argument count", () => {
  it("emits FUNGI-TYPE-007 when flow called with too many arguments", () => {
    const result = parseAndCheck(`
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}

flow test() -> Int {
  return add(1, 2, 3)
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-007"), "Expected FUNGI-TYPE-007 for extra argument");
  });

  it("emits FUNGI-TYPE-007 when flow called with too few arguments", () => {
    const result = parseAndCheck(`
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}

flow test() -> Int {
  return add(1)
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-007"), "Expected FUNGI-TYPE-007 for missing argument");
  });

  it("does not emit FUNGI-TYPE-007 when correct number of arguments given", () => {
    const result = parseAndCheck(`
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}

flow test() -> Int {
  return add(1, 2)
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-007"), "Unexpected FUNGI-TYPE-007 for correct argument count");
  });
});

// ── FUNGI-TYPE-005: InvalidCallArgType (Phase 8A) ──────────────────────────────

describe("Type checker — FUNGI-TYPE-005 call argument type", () => {
  it("emits FUNGI-TYPE-005 when String literal passed where Int expected", () => {
    const result = parseAndCheck(`
pure flow double(n: Int) -> Int {
  return n + n
}

flow test() -> Int {
  return double("hello")
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-005"), "Expected FUNGI-TYPE-005 for String passed to Int param");
  });

  it("does not emit FUNGI-TYPE-005 when correct type is passed", () => {
    const result = parseAndCheck(`
pure flow double(n: Int) -> Int {
  return n + n
}

flow test() -> Int {
  return double(5)
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-005"), "Unexpected FUNGI-TYPE-005 for correct argument type");
  });
});

// ── FUNGI-TYPE-008: InvalidReturnType (Phase 8A) ───────────────────────────────

describe("Type checker — FUNGI-TYPE-008 invalid return type", () => {
  it("emits FUNGI-TYPE-008 when String returned from Int flow", () => {
    const result = parseAndCheck(`
pure flow getCount() -> Int {
  return "hello"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-008"), "Expected FUNGI-TYPE-008 for String returned from Int flow");
  });

  it("does not emit FUNGI-TYPE-008 when correct type returned", () => {
    const result = parseAndCheck(`
pure flow getCount() -> Int {
  return 42
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-008"), "Unexpected FUNGI-TYPE-008 for correct return type");
  });

  it("does not emit FUNGI-TYPE-008 when Ok() returned from Result flow", () => {
    const result = parseAndCheck(`
flow test() -> Result<String, Error> {
  return Ok("hello")
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-008"), "Unexpected FUNGI-TYPE-008 for Ok() in Result flow");
  });
});

// ── Phase 8B: Money<C> cross-currency enforcement ────────────────────────────

describe("Type checker — Money cross-currency (Phase 8B)", () => {
  it("does not emit FUNGI-TYPE-004 for same-currency Money addition", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let price: Money<GBP> = Money.gbp("100.00")
  let vat: Money<GBP> = Money.gbp("20.00")
  let total: Money<GBP> = price + vat
  return "ok"
}
`);
    const moneyDiags = diagsWithCode(result, "FUNGI-TYPE-004").filter(
      (d) => d.message.includes("Money") && d.message.includes("currency")
    );
    assert.equal(moneyDiags.length, 0, "Unexpected cross-currency error for same-currency addition");
  });

  it("emits FUNGI-TYPE-004 for cross-currency Money addition", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let gbp: Money<GBP> = Money.gbp("100.00")
  let usd: Money<USD> = Money.usd("120.00")
  let wrong: Money<GBP> = gbp + usd
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-004"), "Expected FUNGI-TYPE-004 for Money<GBP> + Money<USD>");
    const diag = diagsWithCode(result, "FUNGI-TYPE-004").find((d) => d.message.includes("currency"));
    assert.ok(diag !== undefined, "Expected currency-related error message");
  });

  it("emits FUNGI-TYPE-004 for Money * Money (dimensionally invalid)", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let price: Money<GBP> = Money.gbp("100.00")
  let vat: Money<GBP> = Money.gbp("20.00")
  let wrong = price * vat
  return "ok"
}
`);
    const moneyMulDiag = diagsWithCode(result, "FUNGI-TYPE-004").find(
      (d) => d.message.includes("Money") && d.message.includes("*")
    );
    assert.ok(moneyMulDiag !== undefined, "Expected FUNGI-TYPE-004 for Money * Money");
  });
});

// ── Phase 9A-2: FUNGI-TYPE-003 Branded type enforcement ────────────────────────

describe("Type checker — FUNGI-TYPE-003 branded type enforcement (Phase 9A-2)", () => {
  it("emits FUNGI-TYPE-003 when unsafe let assigns to a branded type", () => {
    const result = parseAndCheck(`
type CustomerId = Brand<String, "CustomerId">

secure flow createOrder(readonly request: Request) -> String
contract { effects { database.write } }
{
  unsafe let id: CustomerId = request.body.id
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-003"),
      `Expected FUNGI-TYPE-003 for unsafe let id: CustomerId = ..., got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits FUNGI-TYPE-003 when a string literal is directly assigned to a branded type", () => {
    const result = parseAndCheck(`
type OrderRef = Brand<String, "OrderRef">

flow test() -> String {
  let ref: OrderRef = "ORD-001"
  return "ok"
}
`);
    assert.ok(
      hasDiag(result, "FUNGI-TYPE-003"),
      `Expected FUNGI-TYPE-003 for let ref: OrderRef = "ORD-001"`,
    );
  });

  it("does NOT emit FUNGI-TYPE-003 for a plain let binding with string type", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let name: String = "Alice"
  return name
}
`);
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-003"),
      "Should NOT emit FUNGI-TYPE-003 for let name: String = 'Alice'",
    );
  });

  it("does NOT emit FUNGI-TYPE-003 when a type is declared but not a Brand alias", () => {
    const result = parseAndCheck(`
type UserId = String

flow test() -> String {
  let id: UserId = "abc"
  return "ok"
}
`);
    // UserId is NOT a Brand<...> alias, so FUNGI-TYPE-003 must not fire
    assert.ok(
      !hasDiag(result, "FUNGI-TYPE-003"),
      "FUNGI-TYPE-003 must not fire for non-Brand type aliases",
    );
  });

  it("emits FUNGI-TYPE-003 for two different branded types in the same flow", () => {
    const result = parseAndCheck(`
type CustomerId = Brand<String, "CustomerId">
type Email = Brand<String, "Email">

secure flow test(readonly request: Request) -> String
contract { effects { database.write } }
{
  unsafe let id: CustomerId = request.body.id
  unsafe let email: Email = request.body.email
  return "ok"
}
`);
    const brandedErrors = diagsWithCode(result, "FUNGI-TYPE-003");
    assert.equal(brandedErrors.length, 2, `Expected 2 FUNGI-TYPE-003 errors, got ${brandedErrors.length}`);
  });

  it("FUNGI-TYPE-003 diagnostic includes a suggestedCode with validate gate", () => {
    const result = parseAndCheck(`
type CustomerId = Brand<String, "CustomerId">

secure flow test(readonly request: Request) -> String
contract { effects { database.write } }
{
  unsafe let id: CustomerId = request.body.id
  return "ok"
}
`);
    const diag = diagsWithCode(result, "FUNGI-TYPE-003")[0];
    assert.ok(diag !== undefined, "Expected FUNGI-TYPE-003 diagnostic");
    assert.ok(
      diag.suggestedCode !== undefined && diag.suggestedCode.includes("validate"),
      `Expected suggestedCode to contain 'validate', got: ${diag.suggestedCode}`,
    );
  });
});

// ── Phase 8B: Auto type inference propagation ─────────────────────────────────

describe("Type checker — Auto inference + binding type propagation (Phase 8B)", () => {
  it("Auto binding infers from integer literal without error", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: Auto = 42
  return "ok"
}
`);
    assert.ok(!hasDiag(result, "FUNGI-TYPE-001"), "Auto should not emit UnknownType");
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"), "Auto should not emit TypeMismatch");
  });

  it("inferred binding type used in subsequent assignment check", () => {
    const result = parseAndCheck(`
flow test() -> String {
  let x: Int = 5
  let y: String = x
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-002"), "Expected FUNGI-TYPE-002: Int binding assigned to String");
  });
});

// ── Phase 11A.3: inferType member access ──────────────────────────────────────

describe("Type checker — Phase 11A.3 member access inference", () => {
  it("infers String for request.body field access", () => {
    // request.body.email should be inferred as String, enabling FUNGI-TYPE-003 to fire
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

secure flow test(readonly request: Request) -> String
contract { effects { database.write } }
{
  unsafe let rawEmail: String = request.body.email
  let email: Email = rawEmail
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-003"),
      `Expected FUNGI-TYPE-003 for Email = rawEmail where rawEmail inferred as String from request.body`);
  });

  it("FUNGI-TYPE-003 fires when string literal directly assigned to branded type", () => {
    const result = parseAndCheck(`
type CustomerId = Brand<String, "CustomerId">
flow test() -> String {
  let id: CustomerId = "raw-id-value"
  return "ok"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-003"),
      "Expected FUNGI-TYPE-003 for string literal assigned to branded type");
  });

  it("inferType handles chained member access", () => {
    // This should not crash and should not emit spurious errors
    const result = parseAndCheck(`
flow test(readonly request: Request) -> String {
  let x: String = request.body.email
  return x
}
`);
    // No FUNGI-TYPE-002 since both sides infer as String
    assert.ok(!hasDiag(result, "FUNGI-TYPE-002"),
      "Should not emit type mismatch for String = request.body.email");
  });
});

// ── FUNGI-TYPE-026: deferred type check surfaced for `Auto`-declared param/return ──
// Regression: isAssignmentCompatible() treats an `Auto`-declared target as universally
// compatible, which previously SILENTLY muted the return-type (008) and arg-type (005)
// checks. The deferral is now surfaced as a visible `warning` (FUNGI-TYPE-026).
describe("Type checker — FUNGI-TYPE-026 Auto deferral is visible (not muted)", () => {
  it("emits a warning when a return type is declared Auto", () => {
    const result = parseAndCheck(`
pure flow f() -> Auto {
  return "anything"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-026"),
      `Expected FUNGI-TYPE-026 advisory for Auto return, got: ${result.diagnostics.map((d) => d.code).join(", ")}`);
    const d = diagsWithCode(result, "FUNGI-TYPE-026")[0];
    assert.equal(d.severity, "warning", "deferral must be a warning, not an error");
  });

  it("emits a warning when an Auto-declared parameter is called with a concrete arg", () => {
    const result = parseAndCheck(`
pure flow callee(x: Auto) -> Int { return 0 }
pure flow caller() -> Int {
  let r: Int = callee(true)
  return 0
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-026"),
      `Expected FUNGI-TYPE-026 advisory for Auto param, got: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  });

  it("does NOT downgrade a concrete return mismatch — still a hard error", () => {
    const result = parseAndCheck(`
pure flow f() -> Int {
  return "nope"
}
`);
    assert.ok(hasDiag(result, "FUNGI-TYPE-008") || hasDiag(result, "FUNGI-TYPE-002"),
      "concrete mismatch must still hard-error");
    assert.ok(!hasDiag(result, "FUNGI-TYPE-026"),
      "concrete types must not emit the Auto deferral advisory");
  });
});
