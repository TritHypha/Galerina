import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createComputeOffloadReport,
  createComputeReport,
  selectPreferredComputeTarget,
  selectComputeTarget,
  validateComputePlan,
} from "../dist/index.js";

const capabilities = [
  { target: "gpu", features: ["fp16"], available: false },
  {
    target: "low_bit_ai",
    features: ["i2_s", "avx2"],
    available: true,
    memoryBytes: 8_589_934_592,
  },
  { target: "cpu.generic", features: ["scalar"], available: true },
];

describe("galerina-core-compute contracts", () => {
  it("selects low_bit_ai when GPU is unavailable", () => {
    const selection = selectComputeTarget(
      {
        workload: "ai-inference",
        prefer: ["gpu", "low_bit_ai", "cpu.generic"],
        fallbackRequired: true,
        report: true,
      },
      capabilities,
    );

    assert.equal(selection.selectedTarget, "low_bit_ai");
    assert.equal(selection.fallback, true);
    assert.equal(selection.satisfied, true);
  });

  it("validates compute plan budgets", () => {
    assert.equal(
      validateComputePlan({
        name: "bad-budget",
        workload: "matrix",
        preferredTarget: "gpu",
        fallbackTargets: ["cpu.generic"],
        budget: { memoryBytes: 0 },
        requiredCapabilities: [],
        reportTargetSelection: true,
      })[0]?.code,
      "Galerina_COMPUTE_MEMORY_BUDGET_INVALID",
    );
  });

  it("creates offload reports with data movement totals", () => {
    const report = createComputeOffloadReport(
      {
        flow: "summariseText",
        workload: "ai-inference",
        verifyWithCpuReference: true,
        report: true,
        stages: [
          {
            name: "generate-summary",
            target: "gpu",
            fallbackTarget: "low_bit_ai",
            operations: ["tokenize", "ai.infer"],
            dataMovement: [
              {
                from: "host",
                to: "target",
                bytes: 4096,
                reason: "Prompt tokens",
              },
              {
                from: "target",
                to: "host",
                bytes: 2048,
                reason: "Generated tokens",
              },
            ],
            budget: {
              memoryBytes: 4_294_967_296,
              timeoutMs: 30_000,
              maxTokens: 256,
            },
          },
        ],
      },
      capabilities,
    );

    assert.equal(report.selections[0]?.selectedTarget, "low_bit_ai");
    assert.equal(report.fallbackUsed, true);
    assert.equal(report.totalDataMovementBytes, 6144);
    assert.equal(report.diagnostics.length, 0);
  });

  it("creates aggregate compute reports", () => {
    const report = createComputeReport({
      plans: [
        {
          name: "summariseText",
          workload: "ai-inference",
          preferredTarget: "gpu",
          fallbackTargets: ["low_bit_ai", "cpu.generic"],
          requiredCapabilities: ["text-generation"],
          reportTargetSelection: true,
        },
      ],
      capabilities,
    });

    assert.equal(report.plans.length, 1);
    assert.equal(report.diagnostics.length, 0);
  });

  it("selects explicit NPU fallback without silent fallback", () => {
    const selection = selectPreferredComputeTarget(
      {
        prefer: "npu",
        fallback: ["gpu", "cpu.generic"],
        allowSilentFallback: false,
        requireOnDevice: true,
        allowNetwork: false,
        reportFallback: true,
      },
      [
        { target: "npu", features: ["onnx"], available: false },
        { target: "gpu", features: ["onnx"], available: true },
        { target: "cpu.generic", features: ["onnx"], available: true },
      ],
    );

    assert.equal(selection.selectedTarget, "gpu");
    assert.equal(selection.fallback, true);
    assert.match(selection.warnings.join("\n"), /silent fallback is not allowed/);
  });
});
