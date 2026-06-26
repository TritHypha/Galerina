import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCpuKernelReport,
  requiresLowBitKernel,
  validateCpuKernelNativeAbi,
  validateCpuKernelPlan,
} from "../dist/index.js";

const plan = {
  name: "lowbit-i2s-gemv",
  operation: "gemv",
  inputType: "i2_s",
  outputType: "f32",
  requiredFeatures: ["threaded", "tiled", "cache-aware", "simd"],
  tile: { rows: 16, columns: 32, depth: 64 },
  threads: 8,
};

describe("galerina-cpu-kernels contracts", () => {
  it("identifies and validates low-bit kernel plans", () => {
    assert.equal(requiresLowBitKernel(plan), true);
    assert.deepEqual(validateCpuKernelPlan(plan), []);
  });

  it("creates benchmark-ready kernel reports", () => {
    const report = createCpuKernelReport([plan], [
      {
        planName: "lowbit-i2s-gemv",
        tokensPerSecond: 42,
        memoryBytesPerSecond: 1_000_000_000,
      },
    ]);

    assert.equal(report.plans.length, 1);
    assert.equal(report.benchmarks[0]?.planName, "lowbit-i2s-gemv");
  });

  it("validates native ABI metadata", () => {
    assert.deepEqual(
      validateCpuKernelNativeAbi({
        symbolName: "Galerina_cpu_lowbit_i2s_gemv",
        callingConvention: "c",
        inputs: ["i2_s", "f32"],
        output: "f32",
        alignmentBytes: 32,
      }),
      [],
    );
  });
});
