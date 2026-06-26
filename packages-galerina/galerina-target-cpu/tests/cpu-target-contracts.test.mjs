import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canUseLowBitCpuPath,
  selectCpuTargetPlan,
  supportsCpuFeatures,
  validateCpuFeatureProbe,
} from "../dist/index.js";

const capability = {
  architecture: "x86_64",
  logicalCores: 8,
  simd: ["avx2"],
  memoryBytes: 8_589_934_592,
  supportsNativeBinary: true,
  supportsLowBitKernels: true,
};

describe("galerina-target-cpu contracts", () => {
  it("detects low-bit CPU path support", () => {
    assert.equal(supportsCpuFeatures(capability, ["avx2"]), true);
    assert.equal(canUseLowBitCpuPath(capability), true);
  });

  it("selects a compatible low-bit CPU fallback plan", () => {
    const report = selectCpuTargetPlan(capability, [
      {
        workload: "low-bit-ai",
        requiredFeatures: ["avx2"],
        threading: {
          maxThreads: 8,
          pinThreads: false,
          allowBackgroundThreads: false,
        },
        memoryLimitBytes: 4_294_967_296,
        fallbackOf: "gpu",
      },
    ]);

    assert.equal(report.selectedPlan?.workload, "low-bit-ai");
    assert.equal(report.fallbackUsed, true);
    assert.equal(report.diagnostics.length, 0);
  });

  it("validates CPU feature probes", () => {
    assert.equal(
      validateCpuFeatureProbe({
        source: "manual",
        capability: { ...capability, logicalCores: 0 },
      })[0]?.code,
      "Galerina_CPU_LOGICAL_CORES_REQUIRED",
    );
  });
});
