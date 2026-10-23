// =============================================================================
// Binding Checker Tests — Phase 11A.2
//
// Tests for FUNGI-BINDING-005: immutable binding reassignment enforcement.
//
// Covers:
//   - let binding reassignment → FUNGI-BINDING-005
//   - mut binding reassignment → no error
//   - flow parameter reassignment → FUNGI-BINDING-005
//   - readonly decl reassignment → FUNGI-BINDING-005
//   - assignStmt parsing → no FUNGI-PARSE-001
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes, checkProgram } from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.fungi");
  const typeResult = checkTypes(parsed.ast);
  return {
    parseDiags: parsed.diagnostics,
    typeDiags: typeResult.diagnostics,
    allDiags: [...parsed.diagnostics, ...typeResult.diagnostics],
  };
}

function hasDiag(diags, code) {
  return diags.some((d) => d.code === code);
}

// ── Assignment statement parsing ──────────────────────────────────────────────

describe("Binding checker — assignStmt parsing", () => {
  it("parses mut reassignment without FUNGI-PARSE-001", () => {
    const { parseDiags } = parseAndCheck(`
pure flow test() -> Int {
  mut count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      !hasDiag(parseDiags, "FUNGI-PARSE-001"),
      `Should not emit FUNGI-PARSE-001 for mut reassignment, got: ${parseDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("parses let reassignment without FUNGI-PARSE-001", () => {
    const { parseDiags } = parseAndCheck(`
pure flow test() -> Int {
  let count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      !hasDiag(parseDiags, "FUNGI-PARSE-001"),
      `Should not emit FUNGI-PARSE-001 for let reassignment, got: ${parseDiags.map((d) => d.code).join(", ")}`,
    );
  });
});

// ── FUNGI-BINDING-005: Immutable binding reassignment ───────────────────────────

describe("Binding checker — FUNGI-BINDING-005 let reassignment", () => {
  it("emits FUNGI-BINDING-005 for let reassignment", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test() -> Int {
  let count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-BINDING-005"),
      `Expected FUNGI-BINDING-005 for let reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("does NOT emit FUNGI-BINDING-005 for mut reassignment", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test() -> Int {
  mut count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      !hasDiag(typeDiags, "FUNGI-BINDING-005"),
      `Should not emit FUNGI-BINDING-005 for mut reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("rejects an incompatible record value assigned to a mut binding", () => {
    const { typeDiags } = parseAndCheck(`
record Row { name: String }
record Wrong { prefix: Int name: String }
pure flow test(good: Row, bad: Wrong) -> String {
  mut value: Row = good
  value = bad
  return value.name
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Expected incompatible mut assignment to be rejected, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("rejects an erased Auto value assigned to a concrete mutable record binding", () => {
    const { typeDiags } = parseAndCheck(`
record Row { other: String }
pure flow test(good: Row, unknown: Auto) -> String {
  mut value: Row = good
  value = unknown
  return value.other
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Expected erased Auto assignment to be rejected, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("refuses an erased Auto reassignment through the checked-program entry point", () => {
    const checked = checkProgram(`@version 1
record Row { other: String }
pure flow test(good: Row, unknown: Auto) -> String {
  mut value: Row = good
  value = unknown
  return value.other
}
`, "binding-auto-reassignment.fungi");
    assert.ok(
      hasDiag(checked.diagnostics, "FUNGI-TYPE-002"),
      `The checked-program entry point must preserve the type refusal, got: ${checked.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("refuses erased collection initialization through the checked-program entry point", () => {
    const checked = checkProgram(`@version 1
record Row { other: String }
pure flow test(unknown: Array<Auto>) -> Int {
  let rows: Array<Row> = unknown
  return 0
}
`, "binding-auto-array-initializer.fungi");
    assert.equal(checked.ok, false,
      "Array<Auto> must not acquire a concrete Row layout from an immutable annotation");
    assert.ok(hasDiag(checked.diagnostics, "FUNGI-TYPE-002"),
      `Expected the concrete array-layout assignment to be refused, got: ${checked.diagnostics.map((d) => d.code).join(", ")}`);
  });

  it("refuses nested erased array payloads at binding and call boundaries", () => {
    const checked = checkProgram(`@version 1
record Row { other: String }
type UnknownRows = Array<Array<Auto>>
pure flow consume(rows: Array<Array<Row>>) -> Int { return 0 }
pure flow test(unknown: UnknownRows) -> Int {
  let rows: Array<Array<Row>> = unknown
  return consume(unknown)
}
`, "binding-nested-auto-array-boundary.fungi");
    assert.equal(checked.ok, false,
      "nested Array<Auto> payloads must not establish concrete nested row layouts");
    assert.ok(checked.diagnostics.some((d) => d.code === "FUNGI-TYPE-002") &&
      checked.diagnostics.some((d) => d.code === "FUNGI-TYPE-005"),
      `Expected initializer and call-boundary refusals, got: ${checked.diagnostics.map((d) => d.code).join(", ")}`);
  });

  it("refuses bare Auto initialization of a concrete mutable array", () => {
    const checked = checkProgram(`@version 1
record Row { other: String }
pure flow test(unknown: Auto) -> Int {
  mut rows: Array<Row> = unknown
  return rows.length()
}
`, "binding-auto-array-bare-initializer.fungi");
    assert.equal(checked.ok, false,
      "bare Auto must not establish a concrete mutable array payload layout");
    assert.ok(hasDiag(checked.diagnostics, "FUNGI-TYPE-002"),
      `Expected the concrete array-layout assignment to be refused, got: ${checked.diagnostics.map((d) => d.code).join(", ")}`);
  });

  it("rejects an erased Auto initializer for a concrete mutable record binding", () => {
    const { typeDiags } = parseAndCheck(`
record Row { other: String }
pure flow test(unknown: Auto) -> String {
  mut value: Row = unknown
  return value.other
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Expected erased Auto initializer to be rejected, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("rejects an erased array reassigned to a concrete mutable array binding", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test(unknown: Array<Auto>) -> Int {
  mut rows: Array<Int> = Array.empty()
  rows = unknown
  return rows.length()
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Expected erased array payload reassignment to be rejected, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("keeps a typed self-append binding update valid", () => {
    const concrete = checkProgram(`@version 1
record Row { other: String }
pure flow test(seed: Row) -> Int {
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  return rows.length()
    }
`, "binding-typed-self-append.fungi");
    assert.equal(concrete.ok, true,
      `A value of the declared element type may be appended to its own array, got: ${(concrete.diagnostics ?? []).map((d) => d.code).join(", ")}`);
  });

  it("accepts reassignment through the same concrete mutable type alias", () => {
    const { parseDiags, typeDiags } = parseAndCheck(`
type Rows = Array<Int>
pure flow test(seed: Rows) -> Int {
  mut rows: Rows = seed
  rows = seed
  return rows.length()
}
`);
    assert.equal(parseDiags.filter((d) => d.severity === "error").length, 0,
      `Expected alias fixture to parse, got: ${parseDiags.map((d) => d.code).join(", ")}`);
    assert.ok(
      !hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Same-alias assignment should remain compatible, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("resolves aliases nested inside mutable generic assignment types", () => {
    const { parseDiags, typeDiags } = parseAndCheck(`
type Count = Int
pure flow test(seed: Array<Int>) -> Int {
  mut values: Array<Count> = seed
  values = seed
  return values.length()
}
`);
    assert.equal(parseDiags.filter((d) => d.severity === "error").length, 0,
      `Expected nested alias fixture to parse, got: ${parseDiags.map((d) => d.code).join(", ")}`);
    assert.ok(
      !hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Equivalent generic payload aliases should remain compatible, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("resolves aliases through multiple nested generic levels", () => {
    const { parseDiags, typeDiags } = parseAndCheck(`
type Count = Int
pure flow test(seed: Array<Array<Int>>) -> Int {
  mut values: Array<Array<Count>> = seed
  values = seed
  return values.length()
}
`);
    assert.equal(parseDiags.filter((d) => d.severity === "error").length, 0,
      `Expected deeply nested alias fixture to parse, got: ${parseDiags.map((d) => d.code).join(", ")}`);
    assert.ok(
      !hasDiag(typeDiags, "FUNGI-TYPE-002"),
      `Equivalent deeply nested payload aliases should remain compatible, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("fails closed for cyclic aliases used as mutable binding types", () => {
    const { parseDiags, typeDiags } = parseAndCheck(`
type First = Second
type Second = First
pure flow test() -> Int {
  mut value: First = 1
  value = 2
  return value
}
`);
    assert.equal(parseDiags.filter((d) => d.severity === "error").length, 0,
      `Expected cyclic alias fixture to parse, got: ${parseDiags.map((d) => d.code).join(", ")}`);
    assert.ok(
      typeDiags.length > 0,
      "A cyclic alias must not normalize into an apparently valid concrete mutable type",
    );
  });

  it("does not erase a spurious type argument from a non-generic alias", () => {
    const { parseDiags, typeDiags } = parseAndCheck(`
type Count = Int
pure flow test(seed: Array<Int>) -> Int {
  mut values: Array<Count<Int>> = seed
  values = seed
  return values.length()
}
`);
    assert.equal(parseDiags.filter((d) => d.severity === "error").length, 0,
      `Expected malformed alias application to reach type validation, got: ${parseDiags.map((d) => d.code).join(", ")}`);
    assert.ok(
      typeDiags.length > 0,
      "A non-generic alias with type arguments must remain invalid, not normalize to Int",
    );
  });

  it("rejects a non-generic alias used with type arguments", () => {
    const checked = checkProgram(`@version 1
type Rows = Array<Int>
pure flow test(value: Rows<String>) -> Int { return 0 }
`, "binding-nongeneric-alias-application.fungi");
    assert.equal(checked.ok, false,
      "A non-generic alias application must not be admitted as a new generic type constructor");
    assert.ok(checked.diagnostics.length > 0,
      "The invalid alias application must have an explicit diagnostic");
  });

  it("emits FUNGI-BINDING-005 for let reassignment in a guarded flow", () => {
    const { typeDiags } = parseAndCheck(`
guarded flow accumulate(items: Array<Int>) -> Int {
  let total: Int = 0
  total = 42
  return total
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-BINDING-005"),
      `Expected FUNGI-BINDING-005 for let reassignment in guarded flow, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits FUNGI-BINDING-005 for let reassignment in a secure flow", () => {
    const { typeDiags } = parseAndCheck(`
secure flow process(input: String) -> String {
  let result: String = "initial"
  result = "overwritten"
  return result
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-BINDING-005"),
      `Expected FUNGI-BINDING-005 for let reassignment in secure flow, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });
});

// ── FUNGI-BINDING-005: Parameter reassignment ───────────────────────────────────

describe("Binding checker — FUNGI-BINDING-005 parameter reassignment", () => {
  it("emits FUNGI-BINDING-005 for flow parameter reassignment", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test(x: Int) -> Int {
  x = 5
  return x
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-BINDING-005"),
      `Expected FUNGI-BINDING-005 for parameter reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits FUNGI-BINDING-005 for multiple parameter reassignment attempts", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test(x: Int, y: String) -> Int {
  x = 10
  y = "mutated"
  return x
}
`);
    const binding005Diags = typeDiags.filter((d) => d.code === "FUNGI-BINDING-005");
    assert.equal(
      binding005Diags.length,
      2,
      `Expected 2 FUNGI-BINDING-005 diagnostics, got: ${binding005Diags.length}`,
    );
  });

  it("emits FUNGI-BINDING-005 for readonly declaration reassignment", () => {
    const { typeDiags } = parseAndCheck(`
guarded flow test() -> Int {
  readonly x: Int = 42
  x = 10
  return x
}
`);
    assert.ok(
      hasDiag(typeDiags, "FUNGI-BINDING-005"),
      `Expected FUNGI-BINDING-005 for readonly decl reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });
});

// ── FUNGI-BINDING-005: includes correct message and suggested fix ───────────────

describe("Binding checker — FUNGI-BINDING-005 diagnostic shape", () => {
  it("FUNGI-BINDING-005 has correct code, name, and severity", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test() -> Int {
  let n: Int = 1
  n = 2
  return n
}
`);
    const diag = typeDiags.find((d) => d.code === "FUNGI-BINDING-005");
    assert.ok(diag !== undefined, "Expected FUNGI-BINDING-005 diagnostic");
    assert.equal(diag.code, "FUNGI-BINDING-005");
    assert.equal(diag.name, "IMMUTABLE_BINDING_REASSIGNED");
    assert.equal(diag.severity, "error");
    assert.ok(
      diag.message.includes("'n'"),
      `Expected message to mention binding name 'n', got: ${diag.message}`,
    );
    assert.ok(
      diag.suggestedFix !== undefined && diag.suggestedFix.includes("mut"),
      `Expected suggestedFix to mention 'mut', got: ${diag.suggestedFix}`,
    );
  });
});

// ── Regression: mut declarations allow multiple reassignments ─────────────────

describe("Binding checker — mut allows reassignment", () => {
  it("allows multiple reassignments of a mut binding", () => {
    const { allDiags } = parseAndCheck(`
guarded flow countdown() -> Int {
  mut n: Int = 10
  n = 9
  n = 8
  n = 7
  return n
}
`);
    const binding005 = allDiags.filter((d) => d.code === "FUNGI-BINDING-005");
    assert.equal(
      binding005.length,
      0,
      `mut binding should allow reassignment, got: ${binding005.map((d) => d.message).join("; ")}`,
    );
  });

  it("correctly distinguishes let and mut in the same flow", () => {
    const { typeDiags } = parseAndCheck(`
guarded flow mixed() -> Int {
  let immutable: Int = 1
  mut mutable: Int = 2
  mutable = 3
  immutable = 4
  return mutable
}
`);
    const binding005 = typeDiags.filter((d) => d.code === "FUNGI-BINDING-005");
    assert.equal(
      binding005.length,
      1,
      `Expected exactly 1 FUNGI-BINDING-005 (for 'immutable'), got: ${binding005.length}`,
    );
    assert.ok(
      binding005[0].message.includes("'immutable'"),
      `Expected message to name the immutable binding, got: ${binding005[0].message}`,
    );
  });
});
