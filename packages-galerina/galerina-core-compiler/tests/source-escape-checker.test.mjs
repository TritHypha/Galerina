// =============================================================================
// Tests for source-escape-checker — SPORE-SOURCE-ESCAPE-001
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkSourceEscapes,
  SPORE_SOURCE_ESCAPE_001,
} from "../dist/index.js";

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkSourceEscapes(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

// ---------------------------------------------------------------------------
// eval() in a flow body triggers SPORE-SOURCE-ESCAPE-001
// ---------------------------------------------------------------------------

describe("Source escape checker — eval() detection", () => {
  it("triggers SPORE-SOURCE-ESCAPE-001 when eval() is called in a flow body", () => {
    const source = `
flow dangerousFlow(code: String) -> String {
  let result = eval(code)
  return result
}
`;
    const result = parseAndCheck(source);
    assert.ok(
      hasDiag(result, "SPORE-SOURCE-ESCAPE-001"),
      `Expected SPORE-SOURCE-ESCAPE-001 for eval(), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("the eval() diagnostic has severity 'error'", () => {
    const source = `
flow dangerousFlow(code: String) -> String {
  let result = eval(code)
  return result
}
`;
    const result = parseAndCheck(source);
    const diag = result.diagnostics.find((d) => d.code === "SPORE-SOURCE-ESCAPE-001");
    assert.ok(diag !== undefined, "Expected at least one SPORE-SOURCE-ESCAPE-001 diagnostic");
    assert.equal(diag.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// DynamicCode.load(...) triggers SPORE-SOURCE-ESCAPE-001
// ---------------------------------------------------------------------------

describe("Source escape checker — DynamicCode.load() detection", () => {
  it("triggers SPORE-SOURCE-ESCAPE-001 when DynamicCode.load() is called", () => {
    const source = `
flow loadDynamic(path: String) -> String {
  let module = DynamicCode.load(path)
  return module
}
`;
    const result = parseAndCheck(source);
    assert.ok(
      hasDiag(result, "SPORE-SOURCE-ESCAPE-001"),
      `Expected SPORE-SOURCE-ESCAPE-001 for DynamicCode.load(), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("the DynamicCode.load() diagnostic has severity 'error'", () => {
    const source = `
flow loadDynamic(path: String) -> String {
  let module = DynamicCode.load(path)
  return module
}
`;
    const result = parseAndCheck(source);
    const diag = result.diagnostics.find((d) => d.code === "SPORE-SOURCE-ESCAPE-001");
    assert.ok(diag !== undefined, "Expected at least one SPORE-SOURCE-ESCAPE-001 diagnostic");
    assert.equal(diag.severity, "error");
  });
});

// ---------------------------------------------------------------------------
// Normal flow without eval has no SPORE-SOURCE-ESCAPE-001
// ---------------------------------------------------------------------------

describe("Source escape checker — clean flow produces no escape diagnostics", () => {
  it("does not trigger SPORE-SOURCE-ESCAPE-001 for a normal flow with no eval-like calls", () => {
    const source = `
pure flow add(a: Int, b: Int) -> Int {
  let sum = a + b
  return sum
}
`;
    const result = parseAndCheck(source);
    assert.ok(
      !hasDiag(result, "SPORE-SOURCE-ESCAPE-001"),
      `Expected no SPORE-SOURCE-ESCAPE-001, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("does not trigger SPORE-SOURCE-ESCAPE-001 for a flow using log and validate", () => {
    const source = `
flow processInput(raw: String) -> String {
  let clean = validate.text(raw)
  return clean
}
`;
    const result = parseAndCheck(source);
    assert.ok(
      !hasDiag(result, "SPORE-SOURCE-ESCAPE-001"),
      `Expected no SPORE-SOURCE-ESCAPE-001, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// SPORE_SOURCE_ESCAPE_001 constant has correct code and severity
// ---------------------------------------------------------------------------

describe("SPORE_SOURCE_ESCAPE_001 constant", () => {
  it("has code 'SPORE-SOURCE-ESCAPE-001'", () => {
    assert.equal(SPORE_SOURCE_ESCAPE_001.code, "SPORE-SOURCE-ESCAPE-001");
  });

  it("has severity 'error'", () => {
    assert.equal(SPORE_SOURCE_ESCAPE_001.severity, "error");
  });

  it("has name 'SourceLevelEvalEscape'", () => {
    assert.equal(SPORE_SOURCE_ESCAPE_001.name, "SourceLevelEvalEscape");
  });

  it("has a non-empty message", () => {
    assert.ok(SPORE_SOURCE_ESCAPE_001.message.length > 0);
  });

  it("has a non-empty suggestedFix", () => {
    assert.ok(SPORE_SOURCE_ESCAPE_001.suggestedFix.length > 0);
  });

  it("has a non-empty why field", () => {
    assert.ok(SPORE_SOURCE_ESCAPE_001.why.length > 0);
  });
});
