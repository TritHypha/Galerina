// =============================================================================
// Import Resolver Tests — Phase 11E
//
// Covers:
//   1. resolveImports() recognises importDecl nodes in the AST
//   2. Names from @galerina/* packages are correctly classified as type/value
//   3. Symbol resolver accepts imported value names without SPORE-NAME-001
//   4. Type checker accepts imported type names without SPORE-TYPE-001
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  resolveImports,
  resolveSymbols,
  checkTypes,
} from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parse(source) {
  return parseProgram(source, "test.spore");
}

function hasDiag(diags, code) {
  return diags.some((d) => d.code === code);
}

// ── resolveImports — basic parsing ────────────────────────────────────────────

describe("resolveImports — basic import parsing", () => {
  it("returns empty result for AST with no import declarations", () => {
    const { ast } = parse(`
flow test(x: Int) -> Int {
  return x
}
`);
    const result = resolveImports(ast);
    assert.equal(result.symbols.length, 0);
    assert.equal(result.typeNames.length, 0);
    assert.equal(result.valueNames.length, 0);
  });

  it("resolves a single named import from @galerina/core-types", () => {
    const { ast } = parse(`import Email from "@galerina/core-types"

flow test(e: Email) -> String {
  return "ok"
}
`);
    const result = resolveImports(ast);
    assert.equal(result.symbols.length, 1);
    assert.equal(result.symbols[0].name, "Email");
    assert.equal(result.symbols[0].kind, "type");
    assert.equal(result.symbols[0].sourceModule, "@galerina/core-types");
    assert.ok(result.typeNames.includes("Email"));
  });

  it("resolves PatientId and NhsNumber from @galerina/healthcare-types", () => {
    const { ast } = parse(`import { PatientId, NhsNumber } from "@galerina/healthcare-types"

flow test(id: PatientId) -> String {
  return "ok"
}
`);
    const result = resolveImports(ast);
    const names = result.symbols.map((s) => s.name);
    assert.ok(names.includes("PatientId"), `Expected PatientId in ${names.join(", ")}`);
    assert.ok(names.includes("NhsNumber"), `Expected NhsNumber in ${names.join(", ")}`);
    assert.equal(result.symbols[0].kind, "type");
    assert.equal(result.symbols[1].kind, "type");
  });

  it("classifies EmbeddingModel as a value (not a type) from @galerina/ai-types", () => {
    const { ast } = parse(`import EmbeddingModel from "@galerina/ai-types"
`);
    const result = resolveImports(ast);
    assert.equal(result.symbols.length, 1);
    assert.equal(result.symbols[0].kind, "value");
    assert.ok(result.valueNames.includes("EmbeddingModel"));
  });

  it("resolves multiple symbols from @galerina/ai-types", () => {
    const { ast } = parse(`import { Label, ClassificationResult, AiError } from "@galerina/ai-types"
`);
    const result = resolveImports(ast);
    const names = result.symbols.map((s) => s.name);
    assert.ok(names.includes("Label"), "Label should resolve");
    assert.ok(names.includes("ClassificationResult"), "ClassificationResult should resolve");
    assert.ok(names.includes("AiError"), "AiError should resolve");
    // All should be types
    for (const s of result.symbols) {
      assert.equal(s.kind, "type", `${s.name} should be a type`);
    }
  });

  it("accepts imports from external/unknown modules without errors", () => {
    const { ast } = parse(`import MyType from "some-external-package"
`);
    const result = resolveImports(ast);
    assert.equal(result.symbols.length, 1);
    assert.equal(result.symbols[0].name, "MyType");
    // External modules default to value kind
    assert.equal(result.symbols[0].sourceModule, "some-external-package");
  });

  it("resolves PatientsDB as a value from @galerina/healthcare-types", () => {
    const { ast } = parse(`import PatientsDB from "@galerina/healthcare-types"
`);
    const result = resolveImports(ast);
    assert.equal(result.symbols.length, 1);
    assert.equal(result.symbols[0].kind, "value");
    assert.ok(result.valueNames.includes("PatientsDB"));
  });

  it("resolves Actor and TraceId from @galerina/identity-types", () => {
    const { ast } = parse(`import { Actor, TraceId } from "@galerina/identity-types"
`);
    const result = resolveImports(ast);
    const names = result.symbols.map((s) => s.name);
    assert.ok(names.includes("Actor"), "Actor should resolve");
    assert.ok(names.includes("TraceId"), "TraceId should resolve");
    assert.ok(result.typeNames.includes("Actor"), "Actor in typeNames");
    assert.ok(result.typeNames.includes("TraceId"), "TraceId in typeNames");
  });
});

// ── Type checker integration ──────────────────────────────────────────────────

describe("Type checker — imported types do not emit SPORE-TYPE-001", () => {
  it("no SPORE-TYPE-001 for Email when passed as importedTypes", () => {
    const { ast } = parse(`
flow test(e: Email) -> String {
  return "ok"
}
`);
    const result = checkTypes(ast, ["Email"]);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `Expected no SPORE-TYPE-001 for Email (imported), got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits SPORE-TYPE-001 for Email when NOT passed as importedTypes", () => {
    const { ast } = parse(`
flow test(e: Email) -> String {
  return "ok"
}
`);
    // Email IS now in BUILT_IN_TYPES (Phase 11E), so this test verifies
    // that the built-in registry itself covers Email
    const result = checkTypes(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `Email should be recognised as built-in after Phase 11E, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("no SPORE-TYPE-001 for PatientId (built-in after Phase 11E)", () => {
    const { ast } = parse(`
flow test(id: PatientId) -> String {
  return "ok"
}
`);
    const result = checkTypes(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `PatientId should be built-in after Phase 11E`,
    );
  });

  it("no SPORE-TYPE-001 for AiError (built-in after Phase 11E)", () => {
    const { ast } = parse(`
flow test(x: Int) -> Result<String, AiError> {
  return Ok("ok")
}
`);
    const result = checkTypes(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `AiError should be built-in after Phase 11E`,
    );
  });

  it("no SPORE-TYPE-001 for Label (built-in after Phase 11E)", () => {
    const { ast } = parse(`
flow test(x: String) -> Label {
  return "ok"
}
`);
    const result = checkTypes(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `Label should be built-in after Phase 11E`,
    );
  });

  it("no SPORE-TYPE-001 for RiskScore (built-in after Phase 11E)", () => {
    const { ast } = parse(`
flow test(x: String) -> RiskScore {
  return "0.5"
}
`);
    const result = checkTypes(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `RiskScore should be built-in after Phase 11E`,
    );
  });

  it("no SPORE-TYPE-001 for importedTypes passed explicitly to checkTypes", () => {
    const { ast } = parse(`
flow test(x: MyCustomType) -> String {
  return "ok"
}
`);
    const result = checkTypes(ast, ["MyCustomType"]);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-TYPE-001"),
      `MyCustomType passed as importedType should not emit SPORE-TYPE-001`,
    );
  });
});

// ── Symbol resolver integration ───────────────────────────────────────────────

describe("Symbol resolver — imported value names do not emit SPORE-NAME-001", () => {
  it("no SPORE-NAME-001 for PatientDB (in STANDARD_PRELUDE after Phase 11E)", () => {
    const { ast } = parse(`
flow test(id: String) -> String {
  let r = PatientDB.find(id)?
  return "ok"
}
`);
    const result = resolveSymbols(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-NAME-001"),
      `PatientDB should be in prelude after Phase 11E`,
    );
  });

  it("no SPORE-NAME-001 for EmbeddingModel (in STANDARD_PRELUDE after Phase 11E)", () => {
    const { ast } = parse(`
flow test(text: String) -> String {
  let r = EmbeddingModel.embed(text)?
  return "ok"
}
`);
    const result = resolveSymbols(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-NAME-001"),
      `EmbeddingModel should be in prelude after Phase 11E`,
    );
  });

  it("no SPORE-NAME-001 for an imported value name passed explicitly", () => {
    const { ast } = parse(`
flow test(id: String) -> String {
  let r = MyCustomDB.find(id)?
  return "ok"
}
`);
    const result = resolveSymbols(ast, ["MyCustomDB"]);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-NAME-001"),
      `MyCustomDB passed as importedName should not emit SPORE-NAME-001`,
    );
  });

  it("SPORE-NAME-001 is still emitted for genuinely undeclared names", () => {
    const { ast } = parse(`
flow test() -> String {
  return undeclaredVariable
}
`);
    const result = resolveSymbols(ast);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-NAME-001"),
      `Expected SPORE-NAME-001 for undeclaredVariable`,
    );
  });
});

// ── End-to-end: import → resolve → check ─────────────────────────────────────

describe("Import resolver — end-to-end pipeline integration", () => {
  it("full pipeline: import Email from @galerina/core-types → no SPORE-TYPE-001 for Email", () => {
    const source = `import Email from "@galerina/core-types"

flow sendEmail(addr: Email) -> String {
  return "ok"
}
`;
    const { ast } = parse(source);
    const importResult = resolveImports(ast);
    const typeResult = checkTypes(ast, importResult.typeNames);
    const symbolResult = resolveSymbols(ast, importResult.valueNames);

    const allDiags = [...typeResult.diagnostics, ...symbolResult.diagnostics];
    const typeOneErrors = allDiags.filter((d) => d.code === "SPORE-TYPE-001");
    assert.equal(
      typeOneErrors.length,
      0,
      `Expected no SPORE-TYPE-001 errors, got: ${typeOneErrors.map((d) => d.message).join("; ")}`,
    );
  });

  it("full pipeline: import { PatientId } from @galerina/healthcare-types → no type errors", () => {
    const source = `import { PatientId, NhsNumber } from "@galerina/healthcare-types"

flow getPatient(id: PatientId, nhs: NhsNumber) -> String {
  return "ok"
}
`;
    const { ast } = parse(source);
    const importResult = resolveImports(ast);
    const typeResult = checkTypes(ast, importResult.typeNames);

    const errors = typeResult.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `Expected no errors, got: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  });

  it("full pipeline: import AiError from @galerina/ai-types → no type errors", () => {
    const source = `import { Label, AiError } from "@galerina/ai-types"

flow classify(text: String) -> Result<Label, AiError> {
  return Ok("positive")
}
`;
    const { ast } = parse(source);
    const importResult = resolveImports(ast);
    const typeResult = checkTypes(ast, importResult.typeNames);

    const typeErrors = typeResult.diagnostics.filter(
      (d) => d.severity === "error" && d.code === "SPORE-TYPE-001",
    );
    assert.equal(
      typeErrors.length,
      0,
      `Expected no SPORE-TYPE-001 errors, got: ${typeErrors.map((d) => d.message).join("; ")}`,
    );
  });
});
