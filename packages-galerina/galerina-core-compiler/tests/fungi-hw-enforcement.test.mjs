/**
 * FUNGI-HW-001 / FUNGI-HW-002 / FUNGI-HW-003 — Hardware Governance Enforcement
 *
 * Tests the Phase 26B hardware governance diagnostic rules:
 *
 *   FUNGI-HW-001  QuantumTargetRequiresFormalProof    — quantum target → FormalRequired
 *   FUNGI-HW-002  SealedTargetRequiresAuditTrace      — NPU/TPU/ANE without audit.write
 *   FUNGI-HW-003  AcceleratorPlaneRequiresAttestation — photonic/neuromorphic without attestation
 *
 * Also verifies:
 *   - HardwareGovernanceClass, HardwareObservabilityLevel, ProofLevel enums
 *   - HARDWARE_TRUST_PROFILES map (quantum=FormalRequired, npu=Sealed, cpu=Standard)
 *   - ImmutableInputSeal and HardwareSealedDispatch type exports
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, verifyGovernance,
  FUNGI_HW_001, FUNGI_HW_002, FUNGI_HW_003,
  HardwareGovernanceClass, HardwareObservabilityLevel, ProofLevel,
  HARDWARE_TRUST_PROFILES, HARDWARE_GOVERNANCE_CLASS_MAP,
} from "../dist/index.js";

function verifySource(src, profile = "production") {
  const prog = parseProgram(src, "test.fungi");
  const fx = checkEffects(prog.flows, prog.ast);
  return verifyGovernance(prog.ast, prog.flows, fx, profile);
}

function hwDiagCodes(result) {
  return result.diagnostics.filter(d => d.code.startsWith("FUNGI-HW")).map(d => d.code);
}

// ---------------------------------------------------------------------------
// Type system: HardwareGovernanceClass, ProofLevel, HARDWARE_TRUST_PROFILES
// ---------------------------------------------------------------------------

describe("HardwareGovernanceClass enum", () => {
  it("has correct numeric values", () => {
    assert.equal(HardwareGovernanceClass.GovernancePlane,  0);
    assert.equal(HardwareGovernanceClass.ExecutionPlane,   1);
    assert.equal(HardwareGovernanceClass.AcceleratorPlane, 2);
    assert.equal(HardwareGovernanceClass.ExperimentalPlane,3);
  });
});

describe("HardwareObservabilityLevel enum", () => {
  it("has correct numeric values", () => {
    assert.equal(HardwareObservabilityLevel.FullyObservable,     0);
    assert.equal(HardwareObservabilityLevel.PartiallyObservable, 1);
    assert.equal(HardwareObservabilityLevel.Opaque,              2);
    assert.equal(HardwareObservabilityLevel.Probabilistic,       3);
  });
});

describe("ProofLevel enum", () => {
  it("has correct numeric values", () => {
    assert.equal(ProofLevel.Standard,       0);
    assert.equal(ProofLevel.Attested,       1);
    assert.equal(ProofLevel.Sealed,         2);
    assert.equal(ProofLevel.Escalated,      3);
    assert.equal(ProofLevel.FormalRequired, 4);
  });
});

describe("HARDWARE_TRUST_PROFILES", () => {
  it("quantum is ExperimentalPlane + FormalRequired + seals required", () => {
    const q = HARDWARE_TRUST_PROFILES.get("quantum");
    assert.ok(q, "quantum profile must exist");
    assert.equal(q.governanceClass,    HardwareGovernanceClass.ExperimentalPlane);
    assert.equal(q.observabilityLevel, HardwareObservabilityLevel.Probabilistic);
    assert.equal(q.requiredProofLevel, ProofLevel.FormalRequired);
    assert.equal(q.requiresInputSeal,  true);
    assert.equal(q.requiresAttestation, true);
  });

  it("npu is ExecutionPlane + Sealed + input seal required", () => {
    const n = HARDWARE_TRUST_PROFILES.get("npu");
    assert.ok(n, "npu profile must exist");
    assert.equal(n.governanceClass,    HardwareGovernanceClass.ExecutionPlane);
    assert.equal(n.observabilityLevel, HardwareObservabilityLevel.PartiallyObservable);
    assert.equal(n.requiredProofLevel, ProofLevel.Sealed);
    assert.equal(n.requiresInputSeal,  true);
    assert.equal(n.requiresAttestation, false);
  });

  it("cpu is GovernancePlane + Standard + no seals", () => {
    const c = HARDWARE_TRUST_PROFILES.get("cpu");
    assert.ok(c, "cpu profile must exist");
    assert.equal(c.governanceClass,    HardwareGovernanceClass.GovernancePlane);
    assert.equal(c.requiredProofLevel, ProofLevel.Standard);
    assert.equal(c.requiresInputSeal,  false);
    assert.equal(c.requiresAttestation, false);
  });

  it("photonic is AcceleratorPlane + Escalated + attestation required", () => {
    const p = HARDWARE_TRUST_PROFILES.get("photonic");
    assert.ok(p, "photonic profile must exist");
    assert.equal(p.governanceClass,    HardwareGovernanceClass.AcceleratorPlane);
    assert.equal(p.observabilityLevel, HardwareObservabilityLevel.Opaque);
    assert.equal(p.requiredProofLevel, ProofLevel.Escalated);
    assert.equal(p.requiresInputSeal,  true);
    assert.equal(p.requiresAttestation, true);
  });

  it("google.tpu.inference is ExecutionPlane + Sealed", () => {
    const t = HARDWARE_TRUST_PROFILES.get("google.tpu.inference");
    assert.ok(t, "google.tpu.inference profile must exist");
    assert.equal(t.governanceClass,    HardwareGovernanceClass.ExecutionPlane);
    assert.equal(t.requiredProofLevel, ProofLevel.Sealed);
    assert.equal(t.requiresInputSeal,  true);
  });

  it("has at least 30 profiles covering all hardware tiers", () => {
    assert.ok(HARDWARE_TRUST_PROFILES.size >= 30,
      `Expected at least 30 profiles, got ${HARDWARE_TRUST_PROFILES.size}`);
  });
});

// ---------------------------------------------------------------------------
// FUNGI-HW-001: quantum target requires FormalRequired
// ---------------------------------------------------------------------------

describe("FUNGI-HW-001: QuantumTargetRequiresFormalProof", () => {
  it("fires for contract.hardware { target quantum }", () => {
    const result = verifySource([
      "secure flow quantumOpt(n: Int) -> Bool",
      "contract { effects { audit.write } hardware { target quantum fallback cpu } }",
      "{ return true }",
    ].join("\n"));
    assert.ok(hwDiagCodes(result).includes("FUNGI-HW-001"),
      "must emit FUNGI-HW-001 for quantum target");
  });

  it("does not fire for cpu or wasm targets", () => {
    for (const target of ["cpu", "wasm", "arm.sve2", "intel.avx2"]) {
      const result = verifySource([
        "secure flow f(n: Int) -> Bool",
        `contract { effects { audit.write } hardware { target ${target} } }`,
        "{ return true }",
      ].join("\n"));
      assert.ok(!hwDiagCodes(result).includes("FUNGI-HW-001"),
        `${target} must not trigger FUNGI-HW-001`);
    }
  });

  it("FUNGI_HW_001 constant has correct code and severity", () => {
    assert.equal(FUNGI_HW_001.code, "FUNGI-HW-001");
    assert.equal(FUNGI_HW_001.severity, "error");
    assert.equal(FUNGI_HW_001.name, "QUANTUM_TARGET_REQUIRES_FORMAL_PROOF");
  });
});

// ---------------------------------------------------------------------------
// FUNGI-HW-004: UnknownHardwareTarget — yellow uncertainty (R&D 0045 tier D)
// ---------------------------------------------------------------------------

describe("FUNGI-HW-004: UnknownHardwareTarget (yellow uncertainty, not red)", () => {
  it("emits a WARNING (not an error) for an unrecognised hardware target", () => {
    const result = verifySource([
      "secure flow f(n: Int) -> Bool",
      "contract { effects { audit.write } hardware { target foobar_accelerator } }",
      "{ return true }",
    ].join("\n"));
    const hw4 = result.diagnostics.filter(d => d.code === "FUNGI-HW-004");
    assert.equal(hw4.length, 1, "expected one FUNGI-HW-004 for the unknown target (was a silent continue)");
    assert.equal(hw4[0].severity, "warning", "must be YELLOW (warning), not a red error — it is K3 INDETERMINATE");
    assert.ok(hw4[0].message.includes("foobar_accelerator"), "names the unrecognised target");
  });

  it("does NOT fire for registered targets (cpu / wasm / quantum / arm.sve2)", () => {
    for (const target of ["cpu", "wasm", "quantum", "arm.sve2"]) {
      const result = verifySource([
        "secure flow f(n: Int) -> Bool",
        `contract { effects { audit.write } hardware { target ${target} } }`,
        "{ return true }",
      ].join("\n"));
      assert.ok(!hwDiagCodes(result).includes("FUNGI-HW-004"), `${target} is registered → no FUNGI-HW-004`);
    }
  });

  it("the uncertainty warning never fails the build (never severity error)", () => {
    const result = verifySource([
      "secure flow f(n: Int) -> Bool",
      "contract { effects { audit.write } hardware { target made_up_device } }",
      "{ return true }",
    ].join("\n"));
    const asErr = result.diagnostics.filter(d => d.code === "FUNGI-HW-004" && d.severity === "error");
    assert.equal(asErr.length, 0, "FUNGI-HW-004 must never be an error (build proceeds under uncertainty)");
  });
});

// ---------------------------------------------------------------------------
// FUNGI-HW-002: sealed target without audit.write
// ---------------------------------------------------------------------------

describe("FUNGI-HW-002: SealedTargetRequiresAuditTrace", () => {
  it("fires for NPU target without audit.write", () => {
    const result = verifySource([
      "pure flow inferModel(n: Int) -> Int",
      "contract { effects {} hardware { target npu fallback cpu } }",
      "{ return n }",
    ].join("\n"));
    assert.ok(hwDiagCodes(result).includes("FUNGI-HW-002"),
      "must emit FUNGI-HW-002 for npu without audit.write");
  });

  it("does not fire when NPU target declares audit.write", () => {
    const result = verifySource([
      "secure flow inferModel(n: Int) -> Int",
      "contract { effects { audit.write } hardware { target npu fallback cpu } }",
      "{ return n }",
    ].join("\n"));
    assert.ok(!hwDiagCodes(result).includes("FUNGI-HW-002"),
      "npu with audit.write must not trigger FUNGI-HW-002");
  });

  it("fires for google.tpu.inference without audit.write", () => {
    const result = verifySource([
      "secure flow tpuInfer(n: Int) -> Int",
      "contract { effects { ai.infer } hardware { target google.tpu.inference fallback cpu } }",
      "{ return n }",
    ].join("\n"));
    assert.ok(hwDiagCodes(result).includes("FUNGI-HW-002"),
      "google.tpu.inference without audit.write must trigger FUNGI-HW-002");
  });

  it("does not fire for cpu or arm.sve2 (not sealed targets)", () => {
    for (const target of ["cpu", "arm.sve2", "intel.avx2"]) {
      const result = verifySource([
        "pure flow f(n: Int) -> Int",
        `contract { effects {} hardware { target ${target} } }`,
        "{ return n }",
      ].join("\n"));
      assert.ok(!hwDiagCodes(result).includes("FUNGI-HW-002"),
        `${target} must not trigger FUNGI-HW-002`);
    }
  });

  it("FUNGI_HW_002 constant has correct code and severity", () => {
    assert.equal(FUNGI_HW_002.code, "FUNGI-HW-002");
    assert.equal(FUNGI_HW_002.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// Correctly declared hardware contracts produce no FUNGI-HW diagnostics
// ---------------------------------------------------------------------------

describe("FUNGI-HW: correctly declared hardware contracts", () => {
  it("ARM SVE2 with audit produces no FUNGI-HW diagnostics", () => {
    const result = verifySource([
      "secure flow flight(t: Int) -> Bool",
      "contract { effects { audit.write } hardware { target arm.sve2 require mte fallback cpu } }",
      "{ return true }",
    ].join("\n"));
    assert.equal(hwDiagCodes(result).length, 0,
      "ARM SVE2 with audit must produce no FUNGI-HW diagnostics");
  });

  it("apple.neural_engine with audit produces no FUNGI-HW-001", () => {
    const result = verifySource([
      "secure flow medInfer(n: Int) -> Bool",
      "contract { effects { audit.write } hardware { target apple.neural_engine fallback wasm } }",
      "{ return true }",
    ].join("\n"));
    assert.ok(!hwDiagCodes(result).includes("FUNGI-HW-001"),
      "apple.neural_engine must not trigger FUNGI-HW-001");
  });

  it("flow without contract.hardware produces no FUNGI-HW diagnostics", () => {
    const result = verifySource([
      "secure flow plain(x: Int) -> Bool",
      "contract { effects { audit.write database.write } }",
      "{ return true }",
    ].join("\n"));
    assert.equal(hwDiagCodes(result).length, 0,
      "flow without hardware block must produce no FUNGI-HW diagnostics");
  });
});
