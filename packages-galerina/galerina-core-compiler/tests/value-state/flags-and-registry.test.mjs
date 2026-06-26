// =============================================================================
// Value-State Checker — Flags and Registry Tests (Phase 18C)
//
// Tests for:
//   - ValueStateFlags bitset (constant shape, distinct powers-of-2, combinable)
//   - SINK_REQUIREMENTS structured registry (correct entries, SinkRequirement shape)
//   - getSinkRequirement() (exact + pattern matching)
//   - SPORE_GATE_001 constant shape
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ValueStateFlags,
  SINK_REQUIREMENTS,
  getSinkRequirement,
  SPORE_GATE_001,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// ValueStateFlags shape and values
// ---------------------------------------------------------------------------

describe("ValueStateFlags: constant shape", () => {
  it("has all 8 expected flags", () => {
    assert.ok("None"      in ValueStateFlags);
    assert.ok("Unsafe"    in ValueStateFlags);
    assert.ok("Safe"      in ValueStateFlags);
    assert.ok("Validated" in ValueStateFlags);
    assert.ok("Tainted"   in ValueStateFlags);
    assert.ok("Protected" in ValueStateFlags);
    assert.ok("Redacted"  in ValueStateFlags);
    assert.ok("Secret"    in ValueStateFlags);
    assert.ok("ReadOnly"  in ValueStateFlags);
  });

  it("None is 0", () => {
    assert.equal(ValueStateFlags.None, 0);
  });

  it("all non-None flags are distinct powers of 2", () => {
    const flags = [
      ValueStateFlags.Unsafe, ValueStateFlags.Safe, ValueStateFlags.Validated,
      ValueStateFlags.Tainted, ValueStateFlags.Protected, ValueStateFlags.Redacted,
      ValueStateFlags.Secret, ValueStateFlags.ReadOnly,
    ];
    for (const f of flags) {
      assert.ok(f > 0 && (f & (f - 1)) === 0, `${f} is not a power of 2`);
    }
    assert.equal(new Set(flags).size, flags.length, "All flags must be distinct");
  });
});

describe("ValueStateFlags: bitwise operations", () => {
  it("Unsafe | Safe can be combined and tested separately", () => {
    const combined = ValueStateFlags.Unsafe | ValueStateFlags.Safe;
    assert.ok(combined & ValueStateFlags.Unsafe, "Has Unsafe");
    assert.ok(combined & ValueStateFlags.Safe, "Has Safe");
    assert.ok(!(combined & ValueStateFlags.Tainted), "Does not have Tainted");
  });

  it("safe-check pattern: Unsafe without Safe → needs gate", () => {
    const unsafeOnly = ValueStateFlags.Unsafe;
    const needsGate = (unsafeOnly & ValueStateFlags.Unsafe) && !(unsafeOnly & ValueStateFlags.Safe);
    assert.ok(needsGate, "Unsafe without Safe requires gate");
  });

  it("safe-check pattern: Unsafe | Safe → gate applied", () => {
    const afterGate = ValueStateFlags.Unsafe | ValueStateFlags.Safe | ValueStateFlags.Validated;
    const needsGate = (afterGate & ValueStateFlags.Unsafe) && !(afterGate & ValueStateFlags.Safe);
    assert.ok(!needsGate, "After gate: does not need gate");
  });

  it("Protected | Redacted can coexist (data can be both internally-safe and audit-logged)", () => {
    const both = ValueStateFlags.Protected | ValueStateFlags.Redacted;
    assert.ok(both & ValueStateFlags.Protected);
    assert.ok(both & ValueStateFlags.Redacted);
  });

  it("APU candidate pattern: ReadOnly | Safe | Validated", () => {
    const apuCandidate = ValueStateFlags.ReadOnly | ValueStateFlags.Safe | ValueStateFlags.Validated;
    const isAPUCandidate = !!(apuCandidate & ValueStateFlags.ReadOnly) &&
                           !!(apuCandidate & ValueStateFlags.Safe);
    assert.ok(isAPUCandidate, "ReadOnly + Safe = APU candidate");
  });
});

// ---------------------------------------------------------------------------
// SINK_REQUIREMENTS registry
// ---------------------------------------------------------------------------

describe("SINK_REQUIREMENTS: registry shape", () => {
  it("is a Map", () => {
    assert.ok(SINK_REQUIREMENTS instanceof Map, "SINK_REQUIREMENTS must be a Map");
  });

  it("contains at least 8 entries", () => {
    assert.ok(SINK_REQUIREMENTS.size >= 8, `Expected >= 8 entries, got ${SINK_REQUIREMENTS.size}`);
  });

  it("AuditLog.write requires 'redacted'", () => {
    const req = SINK_REQUIREMENTS.get("AuditLog.write");
    assert.ok(req !== undefined, "AuditLog.write must be in registry");
    assert.equal(req.requiredState, "redacted");
    assert.ok(typeof req.policyNote === "string", "policyNote must be a string");
    assert.equal(req.match, "exact");
  });

  it("database.write requires 'validated'", () => {
    const req = SINK_REQUIREMENTS.get("database.write");
    assert.ok(req !== undefined, "database.write must be in registry");
    assert.equal(req.requiredState, "validated");
  });

  it("shell.exec requires 'validated' (injection prevention)", () => {
    const req = SINK_REQUIREMENTS.get("shell.exec");
    assert.ok(req !== undefined, "shell.exec must be in registry");
    assert.equal(req.requiredState, "validated");
    assert.ok(req.policyNote.toLowerCase().includes("inject"), "Policy note must mention injection");
  });

  it("every entry has requiredState, policyNote, and match fields", () => {
    for (const [name, req] of SINK_REQUIREMENTS) {
      assert.ok(typeof req.requiredState === "string", `${name}: requiredState must be string`);
      assert.ok(typeof req.policyNote === "string", `${name}: policyNote must be string`);
      assert.ok(req.match === "exact" || req.match === "pattern", `${name}: match must be 'exact' or 'pattern'`);
    }
  });
});

// ---------------------------------------------------------------------------
// getSinkRequirement — exact + pattern matching
// ---------------------------------------------------------------------------

describe("getSinkRequirement: exact matching", () => {
  it("AuditLog.write → exact match, requiredState redacted", () => {
    const req = getSinkRequirement("AuditLog.write");
    assert.ok(req !== undefined, "AuditLog.write must be found");
    assert.equal(req.requiredState, "redacted");
    assert.equal(req.match, "exact");
  });

  it("log.write → exact match", () => {
    const req = getSinkRequirement("log.write");
    assert.ok(req !== undefined, "log.write must be found");
    assert.equal(req.requiredState, "redacted");
  });

  it("ai.remoteInference → exact match", () => {
    const req = getSinkRequirement("ai.remoteInference");
    assert.ok(req !== undefined, "ai.remoteInference must be found");
    assert.equal(req.requiredState, "validated");
  });

  it("unknown name → undefined", () => {
    const req = getSinkRequirement("SomethingRandom.noop");
    assert.equal(req, undefined, "Unknown sink must return undefined");
  });
});

describe("getSinkRequirement: pattern matching", () => {
  it("CustomerDB.insert → pattern match, validated", () => {
    const req = getSinkRequirement("CustomerDB.insert");
    assert.ok(req !== undefined, "CustomerDB.insert must match pattern");
    assert.equal(req.requiredState, "validated");
    assert.equal(req.match, "pattern");
  });

  it("OrderDB.write → pattern match", () => {
    const req = getSinkRequirement("OrderDB.write");
    assert.ok(req !== undefined, "OrderDB.write must match pattern");
    assert.equal(req.requiredState, "validated");
  });

  it("https.post → pattern match", () => {
    const req = getSinkRequirement("https.post");
    assert.ok(req !== undefined, "https.post must match pattern");
    assert.equal(req.requiredState, "validated");
  });

  it("StripePayment.charge → pattern match", () => {
    const req = getSinkRequirement("StripePayment.charge");
    assert.ok(req !== undefined, "StripePayment.charge must match pattern");
    assert.equal(req.requiredState, "validated");
  });

  it("fs.writeFile → pattern match", () => {
    const req = getSinkRequirement("fs.writeFile");
    assert.ok(req !== undefined, "fs.writeFile must match pattern");
    assert.equal(req.requiredState, "safe");
  });
});

// ---------------------------------------------------------------------------
// SPORE_GATE_001 constant
// ---------------------------------------------------------------------------

describe("SPORE_GATE_001: constant shape", () => {
  it("has correct code and name", () => {
    assert.equal(SPORE_GATE_001.code, "SPORE-GATE-001");
    assert.equal(SPORE_GATE_001.name, "GateAnnotationRequired");
    assert.equal(SPORE_GATE_001.severity, "error");
  });

  it("has why and suggestedFix", () => {
    assert.ok(typeof SPORE_GATE_001.why === "string");
    assert.ok(typeof SPORE_GATE_001.suggestedFix === "string");
    assert.ok(SPORE_GATE_001.suggestedFix.includes("?"), "suggestedFix must include ? operator");
  });

  it("suggestedFix uses canonical 'safe mut' form", () => {
    assert.ok(SPORE_GATE_001.suggestedFix.includes("safe mut"), "Must use 'safe mut' form");
  });
});
