// =============================================================================
// Type Checker Tensor Diagnostics Tests
//
// Tests for SPORE-TYPE-016, SPORE-TYPE-017, SPORE-TYPE-030 enforcement
// and KNOWN_DOMAIN_TYPES suppression of SPORE-TYPE-001.
//
// Tests:
//   1. Tensor<Float32,[768]> assigned from Tensor<Int8,[768]> → SPORE-TYPE-030
//   2. Tensor<Float32,[768]> assigned from Tensor<Float32,[512]> → SPORE-TYPE-016
//   3. Tensor<Float32,[768]> assigned from Tensor<Float32,[768]> → no error
//   4. PatientId (from KNOWN_DOMAIN_TYPES) does not emit SPORE-TYPE-001
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../../dist/index.js";

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkTypes(parsed.ast);
}

function diagCodes(result) {
  return result.diagnostics.map((d) => d.code);
}

// ---------------------------------------------------------------------------
// Test 1: Tensor<Float32,[768]> assigned from Tensor<Int8,[768]> → SPORE-TYPE-030
// ---------------------------------------------------------------------------

describe("SPORE-TYPE-030: Tensor element type mismatch", () => {
  it("Tensor<Float32,[768]> assigned from Tensor<Int8,[768]> emits SPORE-TYPE-030", () => {
    const result = parseAndCheck(`
flow testTensorElementMismatch(quantized: Tensor<Int8, [768]>) -> String {
  let embedding: Tensor<Float32, [768]> = quantized
  return "done"
}
`);
    const codes = diagCodes(result);
    assert.ok(
      codes.includes("SPORE-TYPE-030"),
      `Expected SPORE-TYPE-030 (TensorElementTypeMismatch) but got: [${codes.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: Tensor<Float32,[768]> assigned from Tensor<Float32,[512]> → SPORE-TYPE-016
// ---------------------------------------------------------------------------

describe("SPORE-TYPE-016: Tensor shape mismatch", () => {
  it("Tensor<Float32,[768]> assigned from Tensor<Float32,[512]> emits SPORE-TYPE-016", () => {
    const result = parseAndCheck(`
flow testTensorShapeMismatch(small: Tensor<Float32, [512]>) -> String {
  let embedding: Tensor<Float32, [768]> = small
  return "done"
}
`);
    const codes = diagCodes(result);
    assert.ok(
      codes.includes("SPORE-TYPE-016"),
      `Expected SPORE-TYPE-016 (TensorShapeMismatch) but got: [${codes.join(", ")}]`,
    );
    // SPORE-TYPE-030 must NOT fire (same element type)
    assert.ok(
      !codes.includes("SPORE-TYPE-030"),
      `SPORE-TYPE-030 must not fire when element types match. Got: [${codes.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: Tensor<Float32,[768]> assigned from Tensor<Float32,[768]> → no error
// ---------------------------------------------------------------------------

describe("Tensor assignment: compatible types produce no error", () => {
  it("Tensor<Float32,[768]> assigned from Tensor<Float32,[768]> produces no tensor error", () => {
    const result = parseAndCheck(`
flow testTensorCompatible(input: Tensor<Float32, [768]>) -> String {
  let embedding: Tensor<Float32, [768]> = input
  return "done"
}
`);
    const codes = diagCodes(result);
    assert.ok(
      !codes.includes("SPORE-TYPE-016"),
      `SPORE-TYPE-016 must not fire for compatible tensor shapes. Got: [${codes.join(", ")}]`,
    );
    assert.ok(
      !codes.includes("SPORE-TYPE-030"),
      `SPORE-TYPE-030 must not fire for compatible tensor element types. Got: [${codes.join(", ")}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 4: PatientId (from KNOWN_DOMAIN_TYPES) does not emit SPORE-TYPE-001
// ---------------------------------------------------------------------------

describe("KNOWN_DOMAIN_TYPES: known domain types suppress SPORE-TYPE-001", () => {
  it("PatientId used as a type annotation does not emit SPORE-TYPE-001", () => {
    const result = parseAndCheck(`
flow lookupPatient(id: PatientId) -> String {
  return "patient"
}
`);
    const type001Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-001");
    assert.equal(
      type001Diags.length,
      0,
      `PatientId is a KNOWN_DOMAIN_TYPE and must not emit SPORE-TYPE-001. Got: ${type001Diags.map((d) => d.message).join("; ")}`,
    );
  });
});
