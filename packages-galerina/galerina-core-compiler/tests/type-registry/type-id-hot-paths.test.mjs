// =============================================================================
// R5: TypeId hot path — isBuiltInType helper and binary expr inference tests
//
// Tests for Phase R5:
//   R5A: isBuiltInType helper via resolveTypeId
//   R5B/R5C: type inference on binary expressions (Int + Int → no SPORE-TYPE-002)
//   R5 complete: TypeId migration — all four R5 acceptance tests
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TypeId, resolveTypeId } from "../../dist/index.js";
import { parseProgram, checkTypes } from "../../dist/index.js";
import { SoANodeArena } from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mirrors the isBuiltInType helper in type-checker.ts for test verification. */
function isBuiltInType(typeName) {
  return resolveTypeId(typeName) !== TypeId.Unknown;
}

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkTypes(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

// ---------------------------------------------------------------------------
// R5: TypeId hot path
// ---------------------------------------------------------------------------

describe("R5: TypeId hot path", () => {
  // Test 1: isBuiltInType("Int") → true
  it('isBuiltInType("Int") returns true', () => {
    assert.ok(
      isBuiltInType("Int"),
      'resolveTypeId("Int") should not return TypeId.Unknown — Int is a built-in type',
    );
    assert.notEqual(resolveTypeId("Int"), TypeId.Unknown);
    assert.equal(resolveTypeId("Int"), TypeId.Int);
  });

  // Test 2: resolveTypeId("protected Email") returns TypeId.Unknown (Email not in TypeId registry)
  it('resolveTypeId("protected Email") returns TypeId.Unknown', () => {
    // Email is in BUILT_IN_TYPES (the string Set) but NOT in the TypeId registry.
    // The TypeId registry covers core numeric/text/collection types.
    // "protected Email" after stripping the qualifier becomes "Email",
    // which is not in TYPE_NAME_TO_ID → returns TypeId.Unknown.
    const result = resolveTypeId("protected Email");
    assert.equal(
      result,
      TypeId.Unknown,
      `resolveTypeId("protected Email") should be TypeId.Unknown (${TypeId.Unknown}), got ${result}`,
    );
  });

  // Test 3: type check on Int + Int binary expr → no SPORE-TYPE-002 error
  it("Int + Int binary expression produces no SPORE-TYPE-002 error", () => {
    const result = parseAndCheck(`
flow addInts(a: Int, b: Int) -> Int {
  let sum: Int = a + b
  return sum
}
`);
    const type002Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-002");
    assert.equal(
      type002Diags.length,
      0,
      `Int + Int should not produce SPORE-TYPE-002 errors. Got: ${type002Diags.map((d) => d.message).join("; ")}`,
    );
    // Also confirm no SPORE-TYPE-004 (invalid binary operation)
    const type004Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-004");
    assert.equal(
      type004Diags.length,
      0,
      `Int + Int should not produce SPORE-TYPE-004 errors. Got: ${type004Diags.map((d) => d.message).join("; ")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// R5 complete: TypeId migration — four acceptance tests
// ---------------------------------------------------------------------------

describe("R5 complete: TypeId migration", () => {
  // R5 Test 1: isBuiltInType("Void") → true
  // Void is in the TypeId registry (TypeId.Void = 1), so resolveTypeId("Void")
  // returns a non-Unknown value and isBuiltInType("Void") must be true.
  it('isBuiltInType("Void") returns true', () => {
    assert.ok(
      isBuiltInType("Void"),
      '"Void" must be recognised as a built-in type via the TypeId registry',
    );
    assert.notEqual(resolveTypeId("Void"), TypeId.Unknown);
    assert.equal(resolveTypeId("Void"), TypeId.Void);
  });

  // R5 Test 2: type checker does not fire SPORE-TYPE-001 for locally declared type aliases.
  // collectDeclarations() (Pass 1) adds typeDecl/recordDecl/enumDecl names to userDefinedTypes
  // before the validation walk (Pass 2), so locally declared types must never produce SPORE-TYPE-001.
  it("type checker does not fire SPORE-TYPE-001 for locally declared type aliases", () => {
    const result = parseAndCheck(`
type PatientError {
  code: String
  message: String
}

type GetPatientResult = Result<String, PatientError>

flow lookupPatient(id: String) -> GetPatientResult {
  return Ok("patient-data")
}
`);
    const type001Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-001");
    assert.equal(
      type001Diags.length,
      0,
      `Locally declared type aliases must not fire SPORE-TYPE-001. Got: ${type001Diags.map((d) => d.message).join("; ")}`,
    );
  });

  // R5 Test 3: record literal { x: 1 } does not fire spurious type errors.
  // A record literal bound without an explicit type annotation infers "Record" internally.
  // No SPORE-TYPE-001 (Record is not validated as a type ref when unannotated) and
  // no SPORE-TYPE-002 (no declared type to mismatch against) must be produced.
  it("record literal bound without annotation does not fire spurious type errors", () => {
    const result = parseAndCheck(`
flow makePoint() -> String {
  let p = { x: 1, y: 2 }
  return "ok"
}
`);
    const type001Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-001");
    const type002Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-002");
    assert.equal(
      type001Diags.length,
      0,
      `Record literal must not fire SPORE-TYPE-001. Got: ${type001Diags.map((d) => d.message).join("; ")}`,
    );
    assert.equal(
      type002Diags.length,
      0,
      `Record literal must not fire SPORE-TYPE-002. Got: ${type002Diags.map((d) => d.message).join("; ")}`,
    );
  });

  // R5 Test 4: Int + Int binary expression does not fire SPORE-TYPE-002.
  // Two Int operands added together must produce Int; isAssignmentCompatible("Int", "Int")
  // must return true and no type-mismatch diagnostic must be emitted.
  it('"Int" + "Int" binary expression does not fire SPORE-TYPE-002', () => {
    const result = parseAndCheck(`
pure flow addTwo(a: Int, b: Int) -> Int {
  let result: Int = a + b
  return result
}
`);
    const type002Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-002");
    assert.equal(
      type002Diags.length,
      0,
      `Int + Int must not fire SPORE-TYPE-002. Got: ${type002Diags.map((d) => d.message).join("; ")}`,
    );
    // Also verify no SPORE-TYPE-004 on the binary expression
    const type004Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-004");
    assert.equal(
      type004Diags.length,
      0,
      `Int + Int must not fire SPORE-TYPE-004. Got: ${type004Diags.map((d) => d.message).join("; ")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// SoA NodeArena: flat typed arrays
// ---------------------------------------------------------------------------

describe("SoA NodeArena: flat typed arrays", () => {
  // Test 1: allocate() returns sequential IDs
  it("allocate() returns sequential IDs starting from 0", () => {
    const arena = new SoANodeArena();
    const id0 = arena.allocate();
    const id1 = arena.allocate();
    const id2 = arena.allocate();
    assert.equal(id0, 0, "First allocation must be 0");
    assert.equal(id1, 1, "Second allocation must be 1");
    assert.equal(id2, 2, "Third allocation must be 2");
    assert.equal(arena.size, 3, "Size must equal allocation count");
  });

  // Test 2: scanByKind finds nodes of given kind in O(n)
  it("scanByKind finds nodes of given kind", () => {
    const arena = new SoANodeArena();
    const a = arena.allocate();
    const b = arena.allocate();
    const c = arena.allocate();
    const d = arena.allocate();
    arena.kinds[a] = 10;
    arena.kinds[b] = 20;
    arena.kinds[c] = 10;
    arena.kinds[d] = 30;
    const found10 = arena.scanByKind(10);
    const found20 = arena.scanByKind(20);
    const found99 = arena.scanByKind(99);
    assert.deepEqual(found10, [a, c], "scanByKind(10) must return nodes a and c");
    assert.deepEqual(found20, [b],    "scanByKind(20) must return node b");
    assert.deepEqual(found99, [],     "scanByKind(99) must return empty array");
  });

  // Test 3: scanByEffectFlag finds nodes with effect bits set
  it("scanByEffectFlag finds nodes with effect bits set", () => {
    const arena = new SoANodeArena();
    const a = arena.allocate();
    const b = arena.allocate();
    const c = arena.allocate();
    // EffectFlags.DatabaseRead is 1, EffectFlags.AuditWrite is 8
    arena.effectMasks[a] = 0b0001; // DatabaseRead
    arena.effectMasks[b] = 0b1000; // AuditWrite
    arena.effectMasks[c] = 0b1001; // Both
    const dbRead  = arena.scanByEffectFlag(0b0001);
    const audit   = arena.scanByEffectFlag(0b1000);
    const network = arena.scanByEffectFlag(0b0100);
    assert.deepEqual(dbRead,  [a, c], "DatabaseRead flag must match nodes a and c");
    assert.deepEqual(audit,   [b, c], "AuditWrite flag must match nodes b and c");
    assert.deepEqual(network, [],     "Network flag must match no nodes");
  });
});
