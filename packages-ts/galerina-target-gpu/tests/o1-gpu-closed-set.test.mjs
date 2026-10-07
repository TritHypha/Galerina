import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GPU_BACKENDS,
  GPU_DIAGNOSTIC_CODES,
  createGpuTargetReport,
  validateGpuKernelPlan,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const capabilities = Object.freeze([
  Object.freeze({ name: "A100", backend: "cuda", features: Object.freeze(["fp16"]) }),
  Object.freeze({ name: "sim", backend: "plan-only", features: Object.freeze([]) }),
]);

describe("O1 closed set: GPU backends and legacy diagnostics stay plan-only", () => {
  it("freezes five backends; plan-only is admitted and metal is absent", () => {
    assert.equal(Object.isFrozen(GPU_BACKENDS), true);
    assert.deepEqual([...GPU_BACKENDS], ["cuda", "rocm", "webgpu", "vulkan", "plan-only"]);
    assert.equal(GPU_BACKENDS.includes("metal"), false);
    assert.equal(GPU_BACKENDS.includes("opencl"), false);
  });

  it("freezes the five existing Galerina_GPU_* codes; FUNGI-GPU is not minted", () => {
    assert.equal(Object.isFrozen(GPU_DIAGNOSTIC_CODES), true);
    assert.deepEqual([...GPU_DIAGNOSTIC_CODES], [
      "Galerina_GPU_INPUT_REFUSED",
      "Galerina_GPU_PLAN_FLOW_REQUIRED",
      "Galerina_GPU_PLAN_BACKEND_INVALID",
      "Galerina_GPU_PLAN_BACKEND_UNAVAILABLE",
      "Galerina_GPU_PLAN_NO_OPERATIONS",
    ]);
    const src = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.equal(src.includes("FUNGI-GPU"), false);
    assert.equal(src.includes("authorityReleased"), false);
    assert.equal(src.includes("galerina-core-compute"), false);
  });

  it("refuses an unknown kernel backend with Galerina_GPU_PLAN_BACKEND_INVALID", () => {
    const diags = validateGpuKernelPlan(
      { flow: "matmul", backend: "metal", operations: ["gemm"] },
      capabilities,
    );
    assert.ok(diags.some((d) => d.code === "Galerina_GPU_PLAN_BACKEND_INVALID" && d.path === "plan.backend"));
  });

  it("refuses a surplus precision field on a capability (no precision vocabulary yet)", () => {
    const { diagnostics, report } = createGpuTargetReport({
      capabilities: [{ name: "A100", backend: "cuda", features: ["fp16"], precision: "FP16" }],
      plans: [],
    });
    assert.equal(report.capabilities.length, 0);
    assert.ok(diagnostics.some((d) => d.code === "Galerina_GPU_INPUT_REFUSED"));
  });

  it("does not release GPU authority: unavailable backend stays refused", () => {
    const diags = validateGpuKernelPlan(
      { flow: "matmul", backend: "vulkan", operations: ["gemm"] },
      capabilities,
    );
    assert.ok(diags.some((d) => d.code === "Galerina_GPU_PLAN_BACKEND_UNAVAILABLE"));
    const planOnly = validateGpuKernelPlan(
      { flow: "plan", backend: "plan-only", operations: ["describe"] },
      capabilities,
    );
    assert.deepEqual(planOnly.map((d) => d.code), []);
  });
});
