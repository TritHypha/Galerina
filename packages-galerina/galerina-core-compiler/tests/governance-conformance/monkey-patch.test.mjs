// =============================================================================
// Governance Conformance — Monkey-Patch Checker
//
// Proves FUNGI-SEC-020 (RUNTIME_MUTATION_PROHIBITED) and
// FUNGI-SEC-021 (PROTOTYPE_MUTATION_PROHIBITED) fire for banned patterns and
// do NOT fire for clean Galerina source.
//
// Canonical boundary (user decision):
//   FUNGI-SOURCE-ESCAPE-001  eval(), Function(), dynamic execution
//   FUNGI-SEC-020            Runtime.patch(), capabilities.override(), etc.
//   FUNGI-SEC-021            String.prototype.trim = ...
//   FUNGI-BACKEND-001        (future) emitted JS references globalThis etc.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkMonkeyPatching,
  checkMonkeyPatchingSource,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.fungi");
  const astResult = checkMonkeyPatching(parsed.ast);
  const textResult = checkMonkeyPatchingSource(source, "test.fungi");
  return {
    ast: astResult.diagnostics,
    text: textResult.diagnostics,
    all: [...astResult.diagnostics, ...textResult.diagnostics],
  };
}

function codesOf(diags) {
  return diags.map((d) => d.code);
}

// ---------------------------------------------------------------------------
// FUNGI-SEC-020: RUNTIME_MUTATION_PROHIBITED — fires
// ---------------------------------------------------------------------------

describe("FUNGI-SEC-020: Runtime.patch fires", () => {
  it("Runtime.patch call → FUNGI-SEC-020", () => {
    const source = `
flow patchRuntime() -> Void {
  Runtime.patch("Database.find", fakeFind)
}
`;
    const { all } = parseAndCheck(source);
    assert.ok(
      all.some((d) => d.code === "FUNGI-SEC-020"),
      `Expected FUNGI-SEC-020, got: ${JSON.stringify(codesOf(all))}`,
    );
  });
});

describe("FUNGI-SEC-020: capabilities.override fires", () => {
  it("capabilities.override call → FUNGI-SEC-020", () => {
    const source = `
flow badCapability() -> Void {
  capabilities.override("network.outbound", fakeNetwork)
}
`;
    const { all } = parseAndCheck(source);
    assert.ok(
      all.some((d) => d.code === "FUNGI-SEC-020"),
      `Expected FUNGI-SEC-020, got: ${JSON.stringify(codesOf(all))}`,
    );
  });
});

describe("FUNGI-SEC-020: Runtime.mock fires", () => {
  it("Runtime.mock call → FUNGI-SEC-020", () => {
    const source = `
flow mockRuntime() -> Void {
  Runtime.mock("Audit.log", noop)
}
`;
    const { all } = parseAndCheck(source);
    assert.ok(
      all.some((d) => d.code === "FUNGI-SEC-020"),
      `Expected FUNGI-SEC-020, got: ${JSON.stringify(codesOf(all))}`,
    );
  });
});

describe("FUNGI-SEC-020: Capabilities.replace fires", () => {
  it("Capabilities.replace call → FUNGI-SEC-020", () => {
    const source = `
flow replaceCapability() -> Void {
  Capabilities.replace("database.write", noopWrite)
}
`;
    const { all } = parseAndCheck(source);
    assert.ok(
      all.some((d) => d.code === "FUNGI-SEC-020"),
      `Expected FUNGI-SEC-020, got: ${JSON.stringify(codesOf(all))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// FUNGI-SEC-020: does NOT fire for clean source
// ---------------------------------------------------------------------------

describe("FUNGI-SEC-020: clean source is clear", () => {
  it("normal adapter use → no FUNGI-SEC-020", () => {
    const source = `
flow createAdapter(impl: DatabaseAdapter) -> DatabaseAdapter {
  return impl
}
`;
    const { all } = parseAndCheck(source);
    const sec020 = all.filter((d) => d.code === "FUNGI-SEC-020");
    assert.equal(sec020.length, 0, `Unexpected FUNGI-SEC-020: ${JSON.stringify(sec020)}`);
  });

  it("read from runtime (not mutation) → no FUNGI-SEC-020", () => {
    const source = `
flow queryRuntime() -> String {
  let version = Runtime.version()
  return version
}
`;
    const { all } = parseAndCheck(source);
    const sec020 = all.filter((d) => d.code === "FUNGI-SEC-020");
    assert.equal(sec020.length, 0, `Unexpected FUNGI-SEC-020: ${JSON.stringify(sec020)}`);
  });
});

// ---------------------------------------------------------------------------
// FUNGI-SEC-021: PROTOTYPE_MUTATION_PROHIBITED — text-level fires
// ---------------------------------------------------------------------------

describe("FUNGI-SEC-021: String.prototype.trim mutation fires", () => {
  it("String.prototype.trim = customTrim → FUNGI-SEC-021", () => {
    const source = `
flow badProto() -> Void {
  String.prototype.trim = customTrim
}
`;
    const { text } = parseAndCheck(source);
    assert.ok(
      text.some((d) => d.code === "FUNGI-SEC-021"),
      `Expected FUNGI-SEC-021, got: ${JSON.stringify(codesOf(text))}`,
    );
  });
});

describe("FUNGI-SEC-021: Array.prototype.push mutation fires", () => {
  it("Array.prototype.push = badPush → FUNGI-SEC-021", () => {
    const source = `
flow corruptArray() -> Void {
  Array.prototype.push = badPush
}
`;
    const { text } = parseAndCheck(source);
    assert.ok(
      text.some((d) => d.code === "FUNGI-SEC-021"),
      `Expected FUNGI-SEC-021, got: ${JSON.stringify(codesOf(text))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// FUNGI-SEC-021: does NOT fire for clean source
// ---------------------------------------------------------------------------

describe("FUNGI-SEC-021: .prototype access for read → no FUNGI-SEC-021", () => {
  it("reading from prototype chain (not assignment) → no FUNGI-SEC-021", () => {
    // Note: reading .prototype is unusual Galerina but not a mutation
    const source = `
// comment mentioning String.prototype.trim.call without assignment
flow doWork(s: String) -> String {
  return s
}
`;
    const { text } = parseAndCheck(source);
    const sec021 = text.filter((d) => d.code === "FUNGI-SEC-021");
    assert.equal(sec021.length, 0, `Unexpected FUNGI-SEC-021: ${JSON.stringify(sec021)}`);
  });
});

// ---------------------------------------------------------------------------
// Diagnostic shape conformance
// ---------------------------------------------------------------------------

describe("MonkeyPatchDiagnostic shape conformance", () => {
  it("FUNGI-SEC-020 diagnostic has required fields", () => {
    const source = `
flow p() -> Void { Runtime.patch("x", y) }
`;
    const { all } = parseAndCheck(source);
    const d = all.find((x) => x.code === "FUNGI-SEC-020");
    assert.ok(d !== undefined, "Expected at least one FUNGI-SEC-020");
    assert.equal(typeof d.code, "string");
    assert.equal(typeof d.name, "string");
    assert.equal(typeof d.severity, "string");
    assert.equal(typeof d.message, "string");
    assert.ok(d.suggestedFix !== undefined, "suggestedFix must be present");
    assert.ok(d.why !== undefined, "why must be present");
  });

  it("FUNGI-SEC-021 diagnostic has required fields", () => {
    const source = `String.prototype.x = bad`;
    const result = checkMonkeyPatchingSource(source, "test.fungi");
    const d = result.diagnostics.find((x) => x.code === "FUNGI-SEC-021");
    assert.ok(d !== undefined, "Expected at least one FUNGI-SEC-021");
    assert.equal(typeof d.code, "string");
    assert.equal(d.severity, "error");
    assert.ok(d.suggestedFix !== undefined, "suggestedFix must be present");
    assert.ok(d.why !== undefined, "why must be present");
  });
});

// ---------------------------------------------------------------------------
// Boundary: eval() remains FUNGI-SOURCE-ESCAPE-001, not FUNGI-SEC-020/021
// ---------------------------------------------------------------------------

describe("Boundary: eval() does NOT produce FUNGI-SEC-020 or FUNGI-SEC-021", () => {
  it("eval(source) fires FUNGI-SOURCE-ESCAPE-001 only (not monkey-patch codes)", () => {
    // The monkey-patch checker must not misflag eval as SEC-020/021.
    // eval is covered by source-escape-checker, not this checker.
    const source = `
flow bad() -> Void {
  eval(source)
}
`;
    const { all } = parseAndCheck(source);
    const sec020 = all.filter((d) => d.code === "FUNGI-SEC-020");
    const sec021 = all.filter((d) => d.code === "FUNGI-SEC-021");
    assert.equal(sec020.length, 0, "eval() must not trigger FUNGI-SEC-020");
    assert.equal(sec021.length, 0, "eval() must not trigger FUNGI-SEC-021");
  });
});
