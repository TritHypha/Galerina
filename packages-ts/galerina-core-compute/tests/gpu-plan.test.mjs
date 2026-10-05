import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPUTE_EFFECTS,
  COMPUTE_RUNTIME_CAPABILITIES,
  FUNGI_COMPUTE_CODE_LIST,
  GPU_RUNTIME_ARCHITECTURE_STAGES,
  GPU_VENDOR_ADAPTERS,
  V1_ACTIVE_COMPUTE_CAPABILITIES,
  V1_ACTIVE_COMPUTE_EFFECTS,
  assertComputeEffectsAdmissible,
  buildGpuPlan,
  createGpuPlanReport,
  estimateGpuSuitability,
  isGpuVendorAdapterAdmitted,
  validateComputeEffectNames,
  validateComputeRuntimeCapabilityClaim,
  validateComputeWorkload,
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

describe("compute effects model", () => {
  it("names the five TODO effects and freezes the list", () => {
    assert.deepEqual([...COMPUTE_EFFECTS], [
      "accelerator",
      "optical_io",
      "distributed_compute",
      "high_memory",
      "parallel_compute",
    ]);
    assert.ok(Object.isFrozen(COMPUTE_EFFECTS));
    assert.deepEqual([...V1_ACTIVE_COMPUTE_EFFECTS], ["high_memory", "parallel_compute"]);
  });

  it("validates closed names fail-closed and refuses duplicates", () => {
    assert.deepEqual(validateComputeEffectNames(["high_memory", "parallel_compute"]), []);
    assert.ok(validateComputeEffectNames(["net.fetch"]).some((d) => d.code === "Galerina_COMPUTE_EFFECT_UNKNOWN"));
    assert.ok(validateComputeEffectNames(["high_memory", "high_memory"]).some((d) => d.code === "Galerina_COMPUTE_EFFECT_DUPLICATE"));
    assert.equal(validateComputeEffectNames("x")[0].code, "Galerina_COMPUTE_EFFECTS_INVALID");
  });

  it("refuses non-v1-active effects for admission under the freeze", () => {
    const d = assertComputeEffectsAdmissible(["accelerator", "high_memory"]);
    assert.equal(d.length, 1);
    assert.equal(d[0].code, "Galerina_COMPUTE_EFFECT_NOT_ADMITTED");
    assert.deepEqual(assertComputeEffectsAdmissible(["high_memory"]), []);
  });
});

describe("compute runtime capabilities model", () => {
  it("names the five TODO capabilities; only ComputeRuntime may be available", () => {
    assert.deepEqual([...COMPUTE_RUNTIME_CAPABILITIES], [
      "ComputeRuntime",
      "GpuRuntime",
      "AcceleratorRuntime",
      "OpticalTransport",
      "DistributedScheduler",
    ]);
    assert.deepEqual([...V1_ACTIVE_COMPUTE_CAPABILITIES], ["ComputeRuntime"]);
    assert.deepEqual(
      validateComputeRuntimeCapabilityClaim({ name: "ComputeRuntime", availability: "available" }),
      [],
    );
    assert.ok(
      validateComputeRuntimeCapabilityClaim({ name: "GpuRuntime", availability: "available" }).some(
        (d) => d.code === "Galerina_COMPUTE_CAPABILITY_V1_FREEZE",
      ),
    );
    assert.deepEqual(
      validateComputeRuntimeCapabilityClaim({ name: "GpuRuntime", availability: "planning_only" }),
      [],
    );
  });

  it("refuses unknown fields without echoing them", () => {
    const marker = "do-not-echo-cap-77";
    const d = validateComputeRuntimeCapabilityClaim({
      name: "ComputeRuntime",
      availability: "available",
      [marker]: true,
    });
    assert.ok(d.some((x) => x.code === "Galerina_COMPUTE_CAPABILITY_FIELD_UNKNOWN"));
    assert.ok(!JSON.stringify(d).includes(marker));
  });
});

describe("GPU planning metadata and plan", () => {
  it("registers FUNGI-COMPUTE-001 through 007", () => {
    assert.deepEqual([...FUNGI_COMPUTE_CODE_LIST], [
      "FUNGI-COMPUTE-001",
      "FUNGI-COMPUTE-002",
      "FUNGI-COMPUTE-003",
      "FUNGI-COMPUTE-004",
      "FUNGI-COMPUTE-005",
      "FUNGI-COMPUTE-006",
      "FUNGI-COMPUTE-007",
    ]);
  });

  it("documents the five architecture stages and four vendor adapters; none admitted", () => {
    assert.deepEqual([...GPU_RUNTIME_ARCHITECTURE_STAGES], [
      "compute_planner",
      "gpu_scheduler",
      "buffer_manager",
      "kernel_adapter",
      "gpu_backend",
    ]);
    assert.deepEqual([...GPU_VENDOR_ADAPTERS], ["cuda", "rocm", "metal", "vulkan"]);
    for (const a of GPU_VENDOR_ADAPTERS) assert.equal(isGpuVendorAdapterAdmitted(a), false);
  });

  it("never estimates high or medium under the v1 freeze", () => {
    assert.equal(estimateGpuSuitability(workload()), "unsuitable");
    assert.equal(
      estimateGpuSuitability(
        workload({
          kind: "ai_inference",
          operationCount: 50_000,
          memoryMb: 2048,
          preferredTargets: ["gpu"],
          effects: ["accelerator"],
        }),
      ),
      "low",
    );
    assert.equal(estimateGpuSuitability(workload({ kind: "nope" })), "unknown");
  });

  it("buildGpuPlan always recommends cpu and emits FUNGI-COMPUTE-001", () => {
    const plan = buildGpuPlan(
      workload({
        kind: "tensor",
        operationCount: 20_000,
        memoryMb: 1024,
        preferredTargets: ["gpu"],
        effects: ["parallel_compute"],
      }),
    );
    assert.equal(plan.schemaVersion, "galerina.compute.gpu-plan.v0.2");
    assert.equal(plan.suitability, "low");
    assert.equal(plan.recommendedTarget, "cpu");
    assert.equal(plan.fallback.target, "cpu");
    assert.ok(plan.reasons.includes("gpu_not_admitted"));
    assert.ok(plan.diagnostics.some((d) => d.code === "FUNGI-COMPUTE-001"));
    assert.ok(plan.diagnostics.some((d) => d.code === "FUNGI-COMPUTE-005"));
    assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.diagnostics));
  });

  it("flags sensitive data and invalid workloads fail-closed", () => {
    const sens = buildGpuPlan(
      workload({
        kind: "matrix",
        dataShape: {
          rank: 2,
          dimensions: [64, 64],
          elementType: "f32",
          byteSize: 16384,
          sensitive: true,
          streamable: false,
        },
        preferredTargets: ["gpu"],
      }),
    );
    assert.ok(sens.reasons.includes("sensitive_data"));
    assert.ok(sens.diagnostics.some((d) => d.code === "FUNGI-COMPUTE-004"));

    const bad = buildGpuPlan(workload({ preferredTargets: ["cuda"] }));
    assert.equal(bad.suitability, "unknown");
    assert.ok(bad.diagnostics.some((d) => d.code === "FUNGI-COMPUTE-002"));
    assert.ok(validateComputeWorkload(workload({ preferredTargets: ["cuda"] })).length > 0);
  });

  it("createGpuPlanReport is advisory-only and carries fungi codes without free text", () => {
    const plan = buildGpuPlan(workload({ kind: "image", memoryMb: 64 }));
    const report = createGpuPlanReport(plan);
    assert.equal(report.schemaVersion, "galerina.compute.gpu-plan-report.v1");
    assert.equal(report.advisoryOnly, true);
    assert.equal(report.recommendedTarget, "cpu");
    assert.ok(report.fungiCodes.includes("FUNGI-COMPUTE-001"));
    assert.ok(Object.isFrozen(report));
  });
});
