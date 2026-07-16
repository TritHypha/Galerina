// =============================================================================
// Type Registry — TypeId, EffectFlags, ComputeCompatibilityFlags Tests (Phase 18D)
//
// Tests for:
//   - TypeId numeric identifiers (distinct, non-negative, resolveTypeId)
//   - EffectFlags bitset (distinct powers-of-2, effectsToFlags, effectsSubset)
//   - ComputeCompatibilityFlags bitset (distinct powers-of-2)
//   - parseTensorType, tensorElementTypesCompatible, tensorDimensionCountsCompatible
//   - FUNGI-TYPE-030 and FUNGI-TYPE-031 constant shapes
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TypeId,
  EffectFlags,
  ComputeCompatibilityFlags,
  effectsToFlags,
  effectsSubset,
  resolveTypeId,
  parseTensorType,
  tensorElementTypesCompatible,
  tensorDimensionCountsCompatible,
  FUNGI_TYPE_030,
  FUNGI_TYPE_031,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// TypeId shape
// ---------------------------------------------------------------------------

describe("TypeId: constant shape", () => {
  it("Unknown is 0", () => {
    assert.equal(TypeId.Unknown, 0);
  });

  it("all values are non-negative integers", () => {
    for (const [name, id] of Object.entries(TypeId)) {
      assert.ok(typeof id === "number" && id >= 0 && Number.isInteger(id),
        `TypeId.${name} must be a non-negative integer, got ${id}`);
    }
  });

  it("all values are distinct", () => {
    const values = Object.values(TypeId);
    assert.equal(new Set(values).size, values.length, "All TypeId values must be distinct");
  });

  it("common types have expected IDs", () => {
    assert.equal(TypeId.Int, 5);
    assert.equal(TypeId.String, 19);
    assert.equal(TypeId.Bool, 3);
    assert.equal(TypeId.Float32, 15);
    assert.equal(TypeId.Tensor, 36);
    assert.equal(TypeId.Result, 35);
  });

  it("Tensor, Float32, Int, String are all present", () => {
    assert.ok("Tensor" in TypeId, "Tensor must be in TypeId");
    assert.ok("Float32" in TypeId, "Float32 must be in TypeId");
    assert.ok("Int" in TypeId, "Int must be in TypeId");
    assert.ok("String" in TypeId, "String must be in TypeId");
    assert.ok("SecureString" in TypeId, "SecureString must be in TypeId");
  });
});

describe("resolveTypeId: type name to ID", () => {
  it("plain type names", () => {
    assert.equal(resolveTypeId("Int"), TypeId.Int);
    assert.equal(resolveTypeId("String"), TypeId.String);
    assert.equal(resolveTypeId("Float32"), TypeId.Float32);
    assert.equal(resolveTypeId("Tensor"), TypeId.Tensor);
  });

  it("strips qualifiers before resolving", () => {
    assert.equal(resolveTypeId("protected Email"), TypeId.Unknown, "Email → Unknown (not built-in)");
    assert.equal(resolveTypeId("protected String"), TypeId.String, "protected String → String TypeId");
    assert.equal(resolveTypeId("redacted Int"), TypeId.Int, "redacted Int → Int TypeId");
    assert.equal(resolveTypeId("unsafe String"), TypeId.String, "unsafe String → String TypeId");
  });

  it("strips generic args before resolving", () => {
    assert.equal(resolveTypeId("Array<Int>"), TypeId.Array);
    assert.equal(resolveTypeId("Tensor<Float32, [768]>"), TypeId.Tensor);
    assert.equal(resolveTypeId("Result<String, Error>"), TypeId.Result);
  });

  it("unknown type returns TypeId.Unknown", () => {
    assert.equal(resolveTypeId("CompletelyMadeUp"), TypeId.Unknown);
    assert.equal(resolveTypeId(""), TypeId.Unknown);
  });
});

// ---------------------------------------------------------------------------
// EffectFlags shape
// ---------------------------------------------------------------------------

describe("EffectFlags: constant shape", () => {
  it("None is 0", () => {
    assert.equal(EffectFlags.None, 0);
  });

  it("all non-None flags are distinct powers of 2", () => {
    const flags = Object.entries(EffectFlags)
      .filter(([name]) => name !== "None")
      .map(([, v]) => v);
    for (const f of flags) {
      assert.ok(f > 0 && (f & (f - 1)) === 0, `${f} is not a power of 2`);
    }
    assert.equal(new Set(flags).size, flags.length, "All flags must be distinct");
  });

  it("has expected common effects", () => {
    assert.ok("DatabaseRead"    in EffectFlags);
    assert.ok("DatabaseWrite"   in EffectFlags);
    assert.ok("NetworkOutbound" in EffectFlags);
    assert.ok("AuditWrite"      in EffectFlags);
    assert.ok("AiInference"     in EffectFlags);
  });
});

describe("effectsToFlags: effect name arrays to bitset", () => {
  it("empty array → EffectFlags.None", () => {
    assert.equal(effectsToFlags([]), EffectFlags.None);
  });

  it("database.write → DatabaseWrite bit", () => {
    const flags = effectsToFlags(["database.write"]);
    assert.ok(flags & EffectFlags.DatabaseWrite, "DatabaseWrite must be set");
    assert.ok(!(flags & EffectFlags.DatabaseRead), "DatabaseRead must NOT be set");
  });

  it("multiple effects combine correctly", () => {
    const flags = effectsToFlags(["database.write", "audit.write", "network.outbound"]);
    assert.ok(flags & EffectFlags.DatabaseWrite);
    assert.ok(flags & EffectFlags.AuditWrite);
    assert.ok(flags & EffectFlags.NetworkOutbound);
    assert.ok(!(flags & EffectFlags.DatabaseRead));
    assert.ok(!(flags & EffectFlags.AiInference));
  });

  it("ai.remoteInference maps to AiInference flag", () => {
    const flags = effectsToFlags(["ai.remoteInference"]);
    assert.ok(flags & EffectFlags.AiInference, "ai.remoteInference must set AiInference");
  });

  it("unknown effects set the fail-closed UnmappedEffect sentinel (BK-1), never bit 0", () => {
    const flags = effectsToFlags(["completely.unknown.effect"]);
    // BK-1 (2026-07-03): an unmapped effect must NOT silently skip to bit 0 (= "no authority required",
    // a latent privilege-escalation fail-open). It sets the UnmappedEffect sentinel so a subset check
    // fails CLOSED; per-effect precision is the authoritative string-name check's job.
    assert.equal(flags, EffectFlags.UnmappedEffect, "unmapped effect sets the sentinel (fail-closed)");
    assert.notEqual(flags, EffectFlags.None, "must never be bit 0 / authority-free");
  });
});

describe("effectsSubset: required ⊆ declared", () => {
  it("empty required ⊆ anything → true", () => {
    assert.ok(effectsSubset(EffectFlags.None, EffectFlags.DatabaseWrite));
    assert.ok(effectsSubset(EffectFlags.None, EffectFlags.None));
  });

  it("declared ⊇ required → true", () => {
    const declared = effectsToFlags(["database.write", "audit.write"]);
    const required = effectsToFlags(["database.write"]);
    assert.ok(effectsSubset(required, declared), "database.write ⊆ {database.write, audit.write}");
  });

  it("required not in declared → false", () => {
    const declared  = effectsToFlags(["audit.write"]);
    const required  = effectsToFlags(["database.write"]);
    assert.ok(!effectsSubset(required, declared), "database.write ⊄ {audit.write}");
  });

  it("exact match → true", () => {
    const effects = effectsToFlags(["database.write", "audit.write"]);
    assert.ok(effectsSubset(effects, effects), "exact match is a valid subset");
  });
});

// ---------------------------------------------------------------------------
// ComputeCompatibilityFlags shape
// ---------------------------------------------------------------------------

describe("ComputeCompatibilityFlags: constant shape", () => {
  it("None is 0", () => {
    assert.equal(ComputeCompatibilityFlags.None, 0);
  });

  it("all non-None flags are distinct powers of 2", () => {
    const flags = Object.entries(ComputeCompatibilityFlags)
      .filter(([name]) => name !== "None")
      .map(([, v]) => v);
    for (const f of flags) {
      assert.ok(f > 0 && (f & (f - 1)) === 0, `${f} is not a power of 2`);
    }
    assert.equal(new Set(flags).size, flags.length, "All flags must be distinct");
  });

  it("has expected compute flags", () => {
    assert.ok("TensorCompilable" in ComputeCompatibilityFlags);
    assert.ok("PureMath"         in ComputeCompatibilityFlags);
    assert.ok("FixedShape"       in ComputeCompatibilityFlags);
    assert.ok("NoDynamicBranch"  in ComputeCompatibilityFlags);
    assert.ok("ReadonlyInputs"   in ComputeCompatibilityFlags);
    assert.ok("SIMDCompatible"   in ComputeCompatibilityFlags);
  });

  it("NPU-ready pattern: TensorCompilable | FixedShape | NoDynamicBranch", () => {
    const npuReady = ComputeCompatibilityFlags.TensorCompilable |
                     ComputeCompatibilityFlags.FixedShape |
                     ComputeCompatibilityFlags.NoDynamicBranch;
    assert.ok(npuReady & ComputeCompatibilityFlags.TensorCompilable);
    assert.ok(npuReady & ComputeCompatibilityFlags.FixedShape);
    assert.ok(npuReady & ComputeCompatibilityFlags.NoDynamicBranch);
    assert.ok(!(npuReady & ComputeCompatibilityFlags.PureMath));
  });
});

// ---------------------------------------------------------------------------
// Tensor type parsing
// ---------------------------------------------------------------------------

describe("parseTensorType: valid Tensor<> types", () => {
  it("Tensor<Float32, [768]> → elementType='Float32', dimensions=[768]", () => {
    const t = parseTensorType("Tensor<Float32, [768]>");
    assert.ok(t.valid, "Must be valid");
    assert.equal(t.elementType, "Float32");
    assert.deepEqual(t.dimensions, [768]);
  });

  it("Tensor<Float32, [Batch, 768]> → dimensions=[dynamic, 768]", () => {
    const t = parseTensorType("Tensor<Float32, [Batch, 768]>");
    assert.ok(t.valid);
    assert.equal(t.elementType, "Float32");
    assert.equal(t.dimensions.length, 2);
    assert.equal(t.dimensions[0], "dynamic");
    assert.equal(t.dimensions[1], 768);
  });

  it("Tensor<Int8, [32, 32]> → dimensions=[32, 32]", () => {
    const t = parseTensorType("Tensor<Int8, [32, 32]>");
    assert.ok(t.valid);
    assert.equal(t.elementType, "Int8");
    assert.deepEqual(t.dimensions, [32, 32]);
  });

  it("non-Tensor type → valid=false", () => {
    assert.ok(!parseTensorType("String").valid);
    assert.ok(!parseTensorType("Array<Float32>").valid);
    assert.ok(!parseTensorType("Float32").valid);
  });

  it("malformed Tensor<> → valid=false", () => {
    assert.ok(!parseTensorType("Tensor<Float32>").valid, "Missing shape part");
    assert.ok(!parseTensorType("Tensor<>").valid, "Empty generics");
  });
});

describe("tensorElementTypesCompatible", () => {
  it("same element type → compatible", () => {
    assert.ok(tensorElementTypesCompatible("Float32", "Float32"));
    assert.ok(tensorElementTypesCompatible("Int8", "Int8"));
  });

  it("different element types → incompatible → FUNGI-TYPE-030", () => {
    assert.ok(!tensorElementTypesCompatible("Float32", "Int8"),
      "Float32 ≠ Int8 → incompatible");
    assert.ok(!tensorElementTypesCompatible("Float64", "Float32"),
      "Float64 ≠ Float32 → incompatible");
  });
});

describe("tensorDimensionCountsCompatible", () => {
  it("same rank → compatible", () => {
    assert.ok(tensorDimensionCountsCompatible([768], [768]));
    assert.ok(tensorDimensionCountsCompatible(["dynamic", 768], [32, 768]));
  });

  it("different rank → incompatible → FUNGI-TYPE-031", () => {
    assert.ok(!tensorDimensionCountsCompatible([768], ["dynamic", 768]),
      "Rank 1 ≠ Rank 2 → incompatible");
    assert.ok(!tensorDimensionCountsCompatible([32, 32], [32]),
      "Rank 2 ≠ Rank 1 → incompatible");
  });
});

// ---------------------------------------------------------------------------
// FUNGI-TYPE-030 and FUNGI-TYPE-031 constant shapes
// ---------------------------------------------------------------------------

describe("FUNGI_TYPE_030 and FUNGI_TYPE_031: constant shapes", () => {
  it("FUNGI_TYPE_030 (TensorElementTypeMismatch) has correct shape", () => {
    assert.equal(FUNGI_TYPE_030.code, "FUNGI-TYPE-030");
    assert.equal(FUNGI_TYPE_030.name, "TENSOR_ELEMENT_TYPE_MISMATCH");
    assert.equal(FUNGI_TYPE_030.severity, "error");
    assert.ok(typeof FUNGI_TYPE_030.why === "string");
    assert.ok(FUNGI_TYPE_030.suggestedFix.toLowerCase().includes("dequantize") ||
              FUNGI_TYPE_030.suggestedFix.toLowerCase().includes("quantize"),
      "suggestedFix must mention quantize/dequantize");
  });

  it("FUNGI_TYPE_031 (TensorDimensionMismatch) has correct shape", () => {
    assert.equal(FUNGI_TYPE_031.code, "FUNGI-TYPE-031");
    assert.equal(FUNGI_TYPE_031.name, "TENSOR_DIMENSION_MISMATCH");
    assert.equal(FUNGI_TYPE_031.severity, "error");
    assert.ok(typeof FUNGI_TYPE_031.why === "string");
    assert.ok(FUNGI_TYPE_031.suggestedFix.toLowerCase().includes("squeeze") ||
              FUNGI_TYPE_031.suggestedFix.toLowerCase().includes("unsqueeze"),
      "suggestedFix must mention squeeze/unsqueeze");
  });
});
