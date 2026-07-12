import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateGpuKernelPlan, createGpuTargetReport } from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const capabilities = [
  { name: "A100", backend: "cuda", features: ["fp16"] },
  { name: "sim", backend: "plan-only", features: [] },
];

describe("validateGpuKernelPlan — fail-closed against unavailable backends", () => {
  it("accepts a plan targeting an advertised backend", () => {
    const diags = validateGpuKernelPlan(
      { flow: "matmul", backend: "cuda", operations: ["gemm"] },
      capabilities,
    );
    assert.deepEqual(codes(diags), []);
  });

  it("rejects a plan whose backend no capability provides", () => {
    const diags = validateGpuKernelPlan(
      { flow: "matmul", backend: "rocm", operations: ["gemm"] },
      capabilities,
    );
    assert.deepEqual(codes(diags), ["Galerina_GPU_PLAN_BACKEND_UNAVAILABLE"]);
  });

  it("rejects an unknown backend", () => {
    const diags = validateGpuKernelPlan(
      { flow: "matmul", backend: "metal", operations: ["gemm"] },
      capabilities,
    );
    assert.ok(codes(diags).includes("Galerina_GPU_PLAN_BACKEND_INVALID"));
  });

  it("requires a flow and at least one operation", () => {
    const diags = validateGpuKernelPlan({ flow: " ", backend: "cuda", operations: [] }, capabilities);
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_GPU_PLAN_FLOW_REQUIRED",
      "Galerina_GPU_PLAN_NO_OPERATIONS",
    ]);
  });
});

describe("createGpuTargetReport", () => {
  it("collects diagnostics across all plans", () => {
    const { report, diagnostics } = createGpuTargetReport({
      capabilities,
      plans: [
        { flow: "a", backend: "cuda", operations: ["gemm"] },
        { flow: "b", backend: "vulkan", operations: ["blur"] },
      ],
    });
    assert.equal(report.plans.length, 2);
    assert.ok(diagnostics.some((d) => d.code === "Galerina_GPU_PLAN_BACKEND_UNAVAILABLE"));
  });
});
