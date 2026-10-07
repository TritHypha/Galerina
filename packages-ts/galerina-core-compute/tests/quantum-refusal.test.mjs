import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPUTE_QUANTUM_TARGET_REFUSED,
  COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE,
  QUANTUM_TARGET_TOKEN,
  RUNTIME_TARGETS,
  buildCompatibilityReport,
  buildGpuPlan,
  buildOpticalPlan,
  createComputeOffloadReport,
  isQuantumTargetToken,
  isRuntimeTarget,
  quantumTargetRefusalDiagnostic,
  selectComputeTarget,
  validateComputeEffectNames,
  validateComputePlan,
  validateComputeRuntimeCapabilityClaim,
  validateComputeWorkload,
  validateTarget,
} from "../dist/index.js";

const workload = (over = {}) => ({
  id: "w1",
  kind: "scalar",
  dataShape: {
    rank: 1,
    dimensions: [8],
    elementType: "f32",
    byteSize: 32,
    sensitive: false,
    streamable: false,
  },
  deployment: { environment: "test", onDevice: true, networkAllowed: false },
  operationCount: 10,
  memoryMb: 16,
  deterministic: true,
  effects: [],
  requiredCapabilities: [],
  preferredTargets: ["cpu"],
  fallbackTargets: ["cpu"],
  ...over,
});

const cpuProfile = (over = {}) => ({
  target: "cpu",
  supportedEffects: [],
  forbiddenEffects: [],
  requiredCapabilities: [],
  memoryLimitMb: 512,
  allowsSensitiveData: false,
  ...over,
});

describe("quantum target token is outside v1 vocabulary", () => {
  it("is not a RuntimeTarget and isQuantumTargetToken matches only the closed token", () => {
    assert.equal(QUANTUM_TARGET_TOKEN, "quantum");
    assert.equal(isRuntimeTarget(QUANTUM_TARGET_TOKEN), false);
    assert.equal(RUNTIME_TARGETS.includes(QUANTUM_TARGET_TOKEN), false);
    assert.equal(isQuantumTargetToken("quantum"), true);
    assert.equal(isQuantumTargetToken("Quantum"), false);
    assert.equal(isQuantumTargetToken("cpu"), false);
  });

  it("refusal diagnostic is frozen and deterministic", () => {
    const a = quantumTargetRefusalDiagnostic("preferredTarget");
    const b = quantumTargetRefusalDiagnostic("preferredTarget");
    assert.equal(Object.isFrozen(a), true);
    assert.equal(a.code, COMPUTE_QUANTUM_TARGET_REFUSED);
    assert.equal(a.message, COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

describe("validators refuse quantum", () => {
  it("validateComputeWorkload refuses preferred and fallback quantum tokens", () => {
    const preferred = validateComputeWorkload(workload({ preferredTargets: ["quantum"] }));
    assert.ok(preferred.some((d) => d.code === COMPUTE_QUANTUM_TARGET_REFUSED && d.path === "preferredTargets.0"));
    const fallback = validateComputeWorkload(workload({ fallbackTargets: ["quantum"] }));
    assert.ok(fallback.some((d) => d.code === COMPUTE_QUANTUM_TARGET_REFUSED && d.path === "fallbackTargets.0"));
  });

  it("validateComputePlan refuses preferred and fallback quantum tokens", () => {
    const diagnostics = validateComputePlan({
      name: "q",
      workload: "general",
      preferredTarget: "quantum",
      fallbackTargets: ["quantum", "cpu.generic"],
      requiredCapabilities: [],
      reportTargetSelection: true,
    });
    assert.ok(diagnostics.some((d) => d.code === COMPUTE_QUANTUM_TARGET_REFUSED && d.path === "preferredTarget"));
    assert.ok(diagnostics.some((d) => d.code === COMPUTE_QUANTUM_TARGET_REFUSED && d.path === "fallbackTargets.0"));
  });

  it("effect and capability validators refuse the quantum token", () => {
    const effects = validateComputeEffectNames(["quantum"]);
    assert.equal(effects[0]?.code, COMPUTE_QUANTUM_TARGET_REFUSED);
    const claim = validateComputeRuntimeCapabilityClaim({ name: "quantum", availability: "available" });
    assert.ok(claim.some((d) => d.code === COMPUTE_QUANTUM_TARGET_REFUSED && d.path === "capability.name"));
  });

  it("validateTarget never admits a quantum profile", () => {
    const result = validateTarget(workload({ fallbackTargets: ["cpu"] }), cpuProfile({ target: "quantum" }));
    assert.equal(result.level, "incompatible");
    assert.equal(result.blockers[0]?.diagnosticCode, COMPUTE_QUANTUM_TARGET_REFUSED);
    assert.deepEqual(result.fallback, { target: "cpu", reason: COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE });
  });
});

describe("selectors never pick quantum", () => {
  it("selectComputeTarget skips an available quantum capability", () => {
    const selection = selectComputeTarget(
      {
        workload: "general",
        prefer: ["quantum", "cpu.generic"],
        fallbackRequired: true,
        report: true,
      },
      [
        { target: "quantum", features: [], available: true },
        { target: "cpu.generic", features: ["scalar"], available: true },
      ],
    );
    assert.equal(selection.selectedTarget, "cpu.generic");
    assert.notEqual(selection.selectedTarget, QUANTUM_TARGET_TOKEN);
    assert.equal(selection.satisfied, true);
  });

  it("selectComputeTarget does not use quantum as the plan-only remainder", () => {
    const selection = selectComputeTarget(
      {
        workload: "general",
        prefer: ["quantum"],
        fallbackRequired: true,
        report: true,
      },
      [{ target: "quantum", features: [], available: true }],
    );
    assert.equal(selection.selectedTarget, "cpu.generic");
    assert.equal(selection.satisfied, false);
    const again = selectComputeTarget(
      {
        workload: "general",
        prefer: ["quantum"],
        fallbackRequired: true,
        report: true,
      },
      [{ target: "quantum", features: [], available: true }],
    );
    assert.equal(JSON.stringify(selection), JSON.stringify(again));
  });

  it("offload report does not select quantum even when claimed available", () => {
    const report = createComputeOffloadReport(
      {
        flow: "q",
        workload: "general",
        verifyWithCpuReference: true,
        report: true,
        stages: [
          {
            name: "stage",
            target: "quantum",
            fallbackTarget: "cpu.generic",
            operations: ["noop"],
            dataMovement: [],
          },
        ],
      },
      [
        { target: "quantum", features: [], available: true },
        { target: "cpu.generic", features: ["scalar"], available: true },
      ],
    );
    assert.equal(report.selections[0]?.selectedTarget, "cpu.generic");
    assert.ok(report.diagnostics.some((d) => d.code === COMPUTE_QUANTUM_TARGET_REFUSED));
  });

  it("compatibility report never recommends quantum", () => {
    const report = buildCompatibilityReport(
      workload({ preferredTargets: ["cpu"], fallbackTargets: ["cpu"] }),
      [cpuProfile({ target: "quantum" }), cpuProfile()],
    );
    assert.notEqual(report.recommendedTarget, QUANTUM_TARGET_TOKEN);
    assert.equal(report.recommendedTarget, "cpu");
  });

  it("gpu and optical planners recommend cpu, never quantum", () => {
    const gpu = buildGpuPlan(workload());
    assert.equal(gpu.recommendedTarget, "cpu");
    assert.notEqual(gpu.recommendedTarget, QUANTUM_TARGET_TOKEN);
    const optical = buildOpticalPlan(workload());
    assert.notEqual(optical.fallback?.target, QUANTUM_TARGET_TOKEN);
    assert.notEqual(optical.recommendedMode, QUANTUM_TARGET_TOKEN);
  });
});

describe("package exports have no quantum execution surface", () => {
  it("only refusal helpers mention quantum", async () => {
    const compute = await import("../dist/index.js");
    const allowed = new Set([
      "QUANTUM_TARGET_TOKEN",
      "isQuantumTargetToken",
      "quantumTargetRefusalDiagnostic",
      "COMPUTE_QUANTUM_TARGET_REFUSED",
      "COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE",
    ]);
    for (const key of Object.getOwnPropertyNames(compute)) {
      if (/quantum/i.test(key)) assert.equal(allowed.has(key), true, key);
      assert.equal(/quantum/i.test(key) && /(execut|runtime|planner|estimator|admit)/i.test(key), false, key);
    }
    assert.equal("executeQuantum" in compute, false);
    assert.equal("buildQuantumPlan" in compute, false);
    assert.equal("estimateQuantum" in compute, false);
  });
});
