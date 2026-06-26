// =============================================================================
// Binding Checker Tests — Phase 11A.2
//
// Tests for SPORE-BINDING-005: immutable binding reassignment enforcement.
//
// Covers:
//   - let binding reassignment → SPORE-BINDING-005
//   - mut binding reassignment → no error
//   - flow parameter reassignment → SPORE-BINDING-005
//   - readonly decl reassignment → SPORE-BINDING-005
//   - assignStmt parsing → no SPORE-PARSE-001
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
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
  it("parses mut reassignment without SPORE-PARSE-001", () => {
    const { parseDiags } = parseAndCheck(`
pure flow test() -> Int {
  mut count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      !hasDiag(parseDiags, "SPORE-PARSE-001"),
      `Should not emit SPORE-PARSE-001 for mut reassignment, got: ${parseDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("parses let reassignment without SPORE-PARSE-001", () => {
    const { parseDiags } = parseAndCheck(`
pure flow test() -> Int {
  let count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      !hasDiag(parseDiags, "SPORE-PARSE-001"),
      `Should not emit SPORE-PARSE-001 for let reassignment, got: ${parseDiags.map((d) => d.code).join(", ")}`,
    );
  });
});

// ── SPORE-BINDING-005: Immutable binding reassignment ───────────────────────────

describe("Binding checker — SPORE-BINDING-005 let reassignment", () => {
  it("emits SPORE-BINDING-005 for let reassignment", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test() -> Int {
  let count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      hasDiag(typeDiags, "SPORE-BINDING-005"),
      `Expected SPORE-BINDING-005 for let reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("does NOT emit SPORE-BINDING-005 for mut reassignment", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test() -> Int {
  mut count: Int = 0
  count = 5
  return count
}
`);
    assert.ok(
      !hasDiag(typeDiags, "SPORE-BINDING-005"),
      `Should not emit SPORE-BINDING-005 for mut reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits SPORE-BINDING-005 for let reassignment in a guarded flow", () => {
    const { typeDiags } = parseAndCheck(`
guarded flow accumulate(items: Array<Int>) -> Int {
  let total: Int = 0
  total = 42
  return total
}
`);
    assert.ok(
      hasDiag(typeDiags, "SPORE-BINDING-005"),
      `Expected SPORE-BINDING-005 for let reassignment in guarded flow, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits SPORE-BINDING-005 for let reassignment in a secure flow", () => {
    const { typeDiags } = parseAndCheck(`
secure flow process(input: String) -> String {
  let result: String = "initial"
  result = "overwritten"
  return result
}
`);
    assert.ok(
      hasDiag(typeDiags, "SPORE-BINDING-005"),
      `Expected SPORE-BINDING-005 for let reassignment in secure flow, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });
});

// ── SPORE-BINDING-005: Parameter reassignment ───────────────────────────────────

describe("Binding checker — SPORE-BINDING-005 parameter reassignment", () => {
  it("emits SPORE-BINDING-005 for flow parameter reassignment", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test(x: Int) -> Int {
  x = 5
  return x
}
`);
    assert.ok(
      hasDiag(typeDiags, "SPORE-BINDING-005"),
      `Expected SPORE-BINDING-005 for parameter reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits SPORE-BINDING-005 for multiple parameter reassignment attempts", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test(x: Int, y: String) -> Int {
  x = 10
  y = "mutated"
  return x
}
`);
    const binding005Diags = typeDiags.filter((d) => d.code === "SPORE-BINDING-005");
    assert.equal(
      binding005Diags.length,
      2,
      `Expected 2 SPORE-BINDING-005 diagnostics, got: ${binding005Diags.length}`,
    );
  });

  it("emits SPORE-BINDING-005 for readonly declaration reassignment", () => {
    const { typeDiags } = parseAndCheck(`
guarded flow test() -> Int {
  readonly x: Int = 42
  x = 10
  return x
}
`);
    assert.ok(
      hasDiag(typeDiags, "SPORE-BINDING-005"),
      `Expected SPORE-BINDING-005 for readonly decl reassignment, got: ${typeDiags.map((d) => d.code).join(", ")}`,
    );
  });
});

// ── SPORE-BINDING-005: includes correct message and suggested fix ───────────────

describe("Binding checker — SPORE-BINDING-005 diagnostic shape", () => {
  it("SPORE-BINDING-005 has correct code, name, and severity", () => {
    const { typeDiags } = parseAndCheck(`
pure flow test() -> Int {
  let n: Int = 1
  n = 2
  return n
}
`);
    const diag = typeDiags.find((d) => d.code === "SPORE-BINDING-005");
    assert.ok(diag !== undefined, "Expected SPORE-BINDING-005 diagnostic");
    assert.equal(diag.code, "SPORE-BINDING-005");
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
    const binding005 = allDiags.filter((d) => d.code === "SPORE-BINDING-005");
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
    const binding005 = typeDiags.filter((d) => d.code === "SPORE-BINDING-005");
    assert.equal(
      binding005.length,
      1,
      `Expected exactly 1 SPORE-BINDING-005 (for 'immutable'), got: ${binding005.length}`,
    );
    assert.ok(
      binding005[0].message.includes("'immutable'"),
      `Expected message to name the immutable binding, got: ${binding005[0].message}`,
    );
  });
});
