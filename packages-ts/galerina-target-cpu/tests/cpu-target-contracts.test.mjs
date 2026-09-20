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
      "FUNGI-CPU-002",
    );
  });

  it("refuses non-finite and fractional capability numbers", () => {
    assert.deepEqual(
      validateCpuFeatureProbe({
        source: "manual",
        capability: { ...capability, logicalCores: Number.NaN },
      }).map((diagnostic) => diagnostic.code),
      ["FUNGI-CPU-001"],
    );
    assert.deepEqual(
      validateCpuFeatureProbe({
        source: "manual",
        capability: { ...capability, logicalCores: 1.5 },
      }).map((diagnostic) => diagnostic.code),
      ["FUNGI-CPU-001"],
    );
  });

  it("does not treat unknown memory as satisfying a declared plan limit", () => {
    const report = selectCpuTargetPlan(
      { ...capability, memoryBytes: undefined },
      [{
        workload: "scalar",
        requiredFeatures: [],
        threading: { maxThreads: 1, pinThreads: false, allowBackgroundThreads: false },
        memoryLimitBytes: 1,
      }],
    );
    assert.equal(report.selectedPlan, undefined);
    assert.equal(report.diagnostics[0]?.code, "FUNGI-CPU-004");
  });

  it("refuses non-positive threading and memory limits", () => {
    const report = selectCpuTargetPlan(capability, [{
      workload: "scalar",
      requiredFeatures: [],
      threading: { maxThreads: 0, pinThreads: false, allowBackgroundThreads: false },
      memoryLimitBytes: 0,
    }]);
    assert.equal(report.selectedPlan, undefined);
    assert.equal(report.diagnostics[0]?.code, "FUNGI-CPU-001");
    assert.equal(report.diagnostics[1]?.code, "FUNGI-CPU-001");
  });

  it("refuses sparse SIMD evidence and returns an immutable capability snapshot", () => {
    const sparseSimd = [];
    sparseSimd.length = 1;
    const refused = selectCpuTargetPlan(
      { ...capability, simd: sparseSimd },
      [{
        workload: "scalar",
        requiredFeatures: [],
        threading: { maxThreads: 1, pinThreads: false, allowBackgroundThreads: false },
      }],
    );
    assert.equal(refused.diagnostics[0]?.code, "FUNGI-CPU-001");

    const mutableCapability = { ...capability, simd: [...capability.simd] };
    const report = selectCpuTargetPlan(mutableCapability, [{
      workload: "scalar",
      requiredFeatures: [],
      threading: { maxThreads: 1, pinThreads: false, allowBackgroundThreads: false },
    }]);
    mutableCapability.simd.push("neon");
    assert.deepEqual(report.capability?.simd, ["avx2"]);
    assert.throws(() => report.capability?.simd.push("neon"), TypeError);
  });

  it("refuses transparent proxies through exported capability helpers", () => {
    const proxiedCapability = new Proxy(capability, {});
    assert.equal(supportsCpuFeatures(proxiedCapability, ["avx2"]), false);
    assert.equal(canUseLowBitCpuPath(proxiedCapability), false);
    assert.equal(
      selectCpuTargetPlan(proxiedCapability, []).diagnostics[0]?.code,
      "FUNGI-CPU-001",
    );
  });

  it("does not retain semantically invalid capability or plan snapshots", () => {
    const invalidCapability = selectCpuTargetPlan(
      { ...capability, logicalCores: 0 },
      [{
        workload: "invalid-workload",
        requiredFeatures: [],
        threading: { maxThreads: 1, pinThreads: false, allowBackgroundThreads: false },
      }],
    );
    assert.equal(invalidCapability.capability, undefined);
    assert.deepEqual(invalidCapability.plans, []);
    assert.equal(invalidCapability.selectedPlan, undefined);
  });

  it("does not retain entries from a proxy-backed plan container", () => {
    const plans = [{
      workload: "scalar",
      requiredFeatures: [],
      threading: { maxThreads: 1, pinThreads: false, allowBackgroundThreads: false },
    }];
    const report = selectCpuTargetPlan(capability, new Proxy(plans, {}));
    assert.equal(report.diagnostics[0]?.code, "FUNGI-CPU-001");
    assert.deepEqual(report.plans, []);
    assert.equal(report.selectedPlan, undefined);
  });
});
