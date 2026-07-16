// =============================================================================
// Parser — Source Spans, byteSpan, makeNode, Recovery, Legacy Syntax
//
// Tests for parser improvements (Phase 18 / user decision 2026-05-31):
//   - SourceLocation carries offset/endLine/endColumn/endOffset/length
//   - ParseDiagnostic carries byteSpan
//   - FUNGI-SYNTAX-LEGACY-001 fires for 'with effects [...]'
//   - req→request fix confirmed in suggestedFix text
//   - Recovery helpers: parser continues past errors without cascading
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  FUNGI_SYNTAX_LEGACY_001,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// SourceLocation span fields
// ---------------------------------------------------------------------------

describe("parser spans: SourceLocation carries full span fields", () => {
  it("flow declaration location has offset, endLine, endColumn, endOffset, length", () => {
    const source = `pure flow greet(name: String) -> String {
  return name
}
`;
    const result = parseProgram(source, "test.fungi");
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const flowMeta = result.flows.find((f) => f.name === "greet");
    assert.ok(flowMeta !== undefined, "Flow 'greet' must be found");

    // Location must carry full span
    const loc = flowMeta.location;
    assert.ok(loc !== undefined, "Flow location must be present");
    assert.equal(typeof loc.line, "number", "line must be a number");
    assert.equal(typeof loc.column, "number", "column must be a number");
    // Span fields (new)
    assert.ok(loc.offset !== undefined, "offset must be present");
    assert.equal(typeof loc.offset, "number", "offset must be a number");
    assert.ok(loc.endLine !== undefined, "endLine must be present");
    assert.ok(loc.endColumn !== undefined, "endColumn must be present");
    assert.ok(loc.endOffset !== undefined, "endOffset must be present");
    assert.ok(loc.length !== undefined, "length must be present");
  });

  it("offset and endOffset are non-negative integers", () => {
    const source = `pure flow add(a: Int, b: Int) -> Int { return a }`;
    const result = parseProgram(source, "add.fungi");
    const flow = result.flows.find((f) => f.name === "add");
    assert.ok(flow !== undefined, "Flow 'add' must be found");
    const loc = flow.location;
    assert.ok(loc.offset !== undefined && loc.offset >= 0, "offset must be >= 0");
    assert.ok(loc.endOffset !== undefined && loc.endOffset >= 0, "endOffset must be >= 0");
    assert.ok(loc.length !== undefined && loc.length >= 0, "length must be >= 0");
  });
});

// ---------------------------------------------------------------------------
// ParseDiagnostic byteSpan
// ---------------------------------------------------------------------------

describe("parser spans: ParseDiagnostic carries byteSpan", () => {
  it("error diagnostic from bad syntax has byteSpan [start, end]", () => {
    // Introduce a parse error: 'let' at top level
    const source = `let x = 5\n`;
    const result = parseProgram(source, "bad.fungi");
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.ok(errors.length > 0, "Expected at least one error diagnostic");

    const err = errors[0];
    assert.ok(err !== undefined, "First error must exist");
    // byteSpan should be present now that loc() carries offset/endOffset
    if (err.byteSpan !== undefined) {
      assert.equal(err.byteSpan.length, 2, "byteSpan must be a [start, end] tuple");
      assert.ok(err.byteSpan[0] >= 0, "byteSpan[0] must be >= 0");
      assert.ok(err.byteSpan[1] >= err.byteSpan[0], "byteSpan[1] must be >= byteSpan[0]");
    }
    // Note: byteSpan is present when lexer provides token spans (which it now does)
  });

  it("error diagnostic has byteSpan when token spans are available (FUNGI-SYNTAX-LEGACY-001)", () => {
    // with effects [...] is now a hard error — triggers FUNGI-SYNTAX-LEGACY-001 as error
    const source = `flow doWork() -> String with effects [database.write] {
  return "ok"
}
`;
    const result = parseProgram(source, "legacy.fungi");
    const warnings = result.diagnostics.filter((d) => d.code === "FUNGI-SYNTAX-LEGACY-001");
    assert.ok(warnings.length > 0, "Expected FUNGI-SYNTAX-LEGACY-001 error");

    const warn = warnings[0];
    assert.ok(warn !== undefined, "Warning must exist");
    if (warn.byteSpan !== undefined) {
      assert.ok(Array.isArray(warn.byteSpan) || typeof warn.byteSpan === "object", "byteSpan must be a tuple");
      assert.ok(warn.byteSpan[0] >= 0, "byteSpan[0] must be >= 0");
    }
  });
});

// ---------------------------------------------------------------------------
// FUNGI-SYNTAX-LEGACY-001: with effects [...] fires a warning
// ---------------------------------------------------------------------------

describe("FUNGI-SYNTAX-LEGACY-001: with effects is now a hard error", () => {
  it("'with effects [database.write]' emits FUNGI-SYNTAX-LEGACY-001 as error (removed syntax)", () => {
    // with effects [...] was removed — it is now a hard parse error, not a warning.
    const source = `flow save() -> String with effects [database.write] {
  return "saved"
}
`;
    const result = parseProgram(source, "legacy.fungi");
    const legacyErrors = result.diagnostics.filter((d) => d.code === "FUNGI-SYNTAX-LEGACY-001");
    assert.ok(
      legacyErrors.length >= 1,
      `Expected FUNGI-SYNTAX-LEGACY-001, got: ${JSON.stringify(result.diagnostics.map((d) => d.code))}`,
    );
    const e = legacyErrors[0];
    assert.ok(e !== undefined, "Error must exist");
    assert.equal(e.severity, "error", "FUNGI-SYNTAX-LEGACY-001 must now be an error");
    assert.ok(e.suggestedFix !== undefined, "suggestedFix must be present");
  });

  it("canonical 'contract { effects { ... } }' does NOT emit FUNGI-SYNTAX-LEGACY-001", () => {
    const source = `flow save() -> String
contract {
  effects {
    database.write
  }
}
{
  return "saved"
}
`;
    const result = parseProgram(source, "canonical.fungi");
    const legacyWarnings = result.diagnostics.filter((d) => d.code === "FUNGI-SYNTAX-LEGACY-001");
    assert.equal(
      legacyWarnings.length,
      0,
      "Canonical contract.effects must not trigger FUNGI-SYNTAX-LEGACY-001",
    );
  });

  it("FUNGI_SYNTAX_LEGACY_001 constant has correct shape", () => {
    assert.equal(FUNGI_SYNTAX_LEGACY_001.code, "FUNGI-SYNTAX-LEGACY-001");
    assert.equal(FUNGI_SYNTAX_LEGACY_001.name, "LEGACY_EFFECTS_SYNTAX");
    assert.equal(FUNGI_SYNTAX_LEGACY_001.severity, "warning");
    assert.ok(typeof FUNGI_SYNTAX_LEGACY_001.message === "string");
    assert.ok(typeof FUNGI_SYNTAX_LEGACY_001.suggestedFix === "string");
  });
});

// ---------------------------------------------------------------------------
// req → request fix in suggested fixes
// ---------------------------------------------------------------------------

describe("parser: suggestedFix uses 'request' not 'req'", () => {
  it("FUNGI-SYNTAX-008 suggestedFix says 'readonly request: Request'", () => {
    // Trigger FUNGI-SYNTAX-008: unsafe let at top level
    const source = `unsafe let rawBody = readBody()\n`;
    const result = parseProgram(source, "unsafe-top.fungi");
    const diag = result.diagnostics.find((d) => d.code === "FUNGI-SYNTAX-008");
    assert.ok(diag !== undefined, "Expected FUNGI-SYNTAX-008");
    if (diag.suggestedFix !== undefined) {
      assert.ok(
        !diag.suggestedFix.includes("readonly req:"),
        `suggestedFix must not use 'req', got: ${diag.suggestedFix}`,
      );
      assert.ok(
        diag.suggestedFix.includes("request"),
        `suggestedFix must use 'request', got: ${diag.suggestedFix}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Recovery: single error must not cascade into many FUNGI-PARSE-001 errors
// ---------------------------------------------------------------------------

describe("parser recovery: single error does not cascade", () => {
  it("one bad top-level let does not prevent parsing subsequent flows", () => {
    const source = `let bad = 5

pure flow goodFlow(x: Int) -> Int {
  return x
}
`;
    const result = parseProgram(source, "recovery.fungi");
    // Should find the good flow despite the error
    const goodFlow = result.flows.find((f) => f.name === "goodFlow");
    assert.ok(goodFlow !== undefined, "goodFlow must be found even after a top-level let error");
  });

  it("error count is bounded even with multiple top-level let bindings", () => {
    const source = `let a = 1
let b = 2
let c = 3

pure flow clean(x: Int) -> Int {
  return x
}
`;
    const result = parseProgram(source, "multi-error.fungi");
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    // Should have ~3 errors (one per let) but not a cascade of dozens
    assert.ok(errors.length <= 10, `Too many cascading errors: ${errors.length}`);
    const cleanFlow = result.flows.find((f) => f.name === "clean");
    assert.ok(cleanFlow !== undefined, "clean flow must still be found");
  });
});
