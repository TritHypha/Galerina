// =============================================================================
// Phase 22B / 23A/B — GPU, NPU, and APU Plan Tests
//
// Tests for:
//   Phase 22B: buildWebGPUPlan, buildNPUPlan
//   Phase 23A/B: buildAPUSharedMemoryPlan
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWebGPUPlan,
  buildNPUPlan,
  buildAPUSharedMemoryPlan,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Phase 22B — WebGPU Compute Plan
// ---------------------------------------------------------------------------

describe("buildWebGPUPlan: schema and structure", () => {
  it("returns a plan with schemaVersion spore.gpu.v1", () => {
    const plan = buildWebGPUPlan("scoreFlow", []);
    assert.equal(plan.schemaVersion, "spore.gpu.v1");
    assert.equal(plan.flowName, "scoreFlow");
  });

  it("creates bind groups from tensor list", () => {
    const plan = buildWebGPUPlan("inferFlow", [
      { name: "input",  elementType: "Float32" },
      { name: "output", elementType: "Float32" },
    ]);
    assert.equal(plan.bindGroups.length, 2);
    assert.equal(plan.bindGroups[0].binding, 0);
    assert.equal(plan.bindGroups[0].name, "input");
    assert.equal(plan.bindGroups[0].type, "storage");
    assert.equal(plan.bindGroups[1].binding, 1);
    assert.equal(plan.bindGroups[1].name, "output");
  });

  it("workgroupSize is a 3-tuple of positive numbers", () => {
    const plan = buildWebGPUPlan("flow", []);
    assert.equal(plan.workgroupSize.length, 3);
    assert.ok(plan.workgroupSize[0] > 0);
    assert.ok(plan.workgroupSize[1] > 0);
    assert.ok(plan.workgroupSize[2] > 0);
  });

  it("shaderSource contains WGSL compute shader markers", () => {
    const plan = buildWebGPUPlan("computeKernel", [{ name: "data", elementType: "Float32" }]);
    assert.ok(plan.shaderSource.includes("@compute"), "Must contain @compute decorator");
    assert.ok(plan.shaderSource.includes("@workgroup_size"), "Must contain @workgroup_size");
  });
});

// ---------------------------------------------------------------------------
// Phase 22B — NPU Kernel Plan
// ---------------------------------------------------------------------------

describe("buildNPUPlan: schema and structure", () => {
  it("returns a plan with schemaVersion spore.npu.v1", () => {
    const plan = buildNPUPlan("inferFlow", []);
    assert.equal(plan.schemaVersion, "spore.npu.v1");
    assert.equal(plan.flowName, "inferFlow");
  });

  it("filters out non-NPU-compatible tensors", () => {
    const plan = buildNPUPlan("flow", [
      { name: "input",   elementType: "Float32", shape: "[1, 768]", npuCompatible: true },
      { name: "weights", elementType: "Float32", shape: "[768, 512]", npuCompatible: true },
      { name: "debug",   elementType: "String",  shape: "[1]",    npuCompatible: false },
    ]);
    // Should only include the 2 NPU-compatible tensors
    const totalShapes = plan.inputShapes.length + plan.outputShapes.length;
    assert.equal(totalShapes, 2, "Must only include NPU-compatible tensors");
  });

  it("detects quantized plan when any tensor uses Int8", () => {
    const plan = buildNPUPlan("quantFlow", [
      { name: "quantized", elementType: "Int8", shape: "[256]", npuCompatible: true },
    ]);
    assert.equal(plan.quantized, true);
  });

  it("non-quantized plan has quantized: false", () => {
    const plan = buildNPUPlan("floatFlow", [
      { name: "embedding", elementType: "Float32", shape: "[768]", npuCompatible: true },
    ]);
    assert.equal(plan.quantized, false);
  });
});

// ---------------------------------------------------------------------------
// Phase 23A/B — APU Shared Memory Plan
// ---------------------------------------------------------------------------

describe("buildAPUSharedMemoryPlan: schema and structure", () => {
  it("returns a plan with schemaVersion spore.apu.v1", () => {
    const plan = buildAPUSharedMemoryPlan("flow", []);
    assert.equal(plan.schemaVersion, "spore.apu.v1");
  });

  it("includes only APU-eligible tensors as shared buffers", () => {
    const plan = buildAPUSharedMemoryPlan("runInference", [
      {
        name: "embedding",
        elementType: "Float32",
        shape: "[768]",
        apuSharedMemoryCandidate: true,
        quantized: false,
      },
      {
        name: "mask",
        elementType: "Int8",
        shape: "[32, 32]",
        apuSharedMemoryCandidate: false,
        quantized: true,
      },
    ]);
    assert.equal(plan.sharedBuffers.length, 1, "Only APU-eligible tensors included");
    assert.equal(plan.sharedBuffers[0].name, "embedding");
  });

  it("quantized tensors use readonly access and zeroOnReturn: true", () => {
    const plan = buildAPUSharedMemoryPlan("quantFlow", [
      {
        name: "weights",
        elementType: "Int8",
        shape: "[512, 256]",
        apuSharedMemoryCandidate: true,
        quantized: true,
      },
    ]);
    assert.equal(plan.sharedBuffers.length, 1);
    assert.equal(plan.sharedBuffers[0].accessPattern, "readonly");
    assert.equal(plan.sharedBuffers[0].zeroOnReturn, true);
  });

  it("non-quantized tensors use readwrite and zeroOnReturn: false", () => {
    const plan = buildAPUSharedMemoryPlan("floatFlow", [
      {
        name: "activations",
        elementType: "Float32",
        shape: "[1024]",
        apuSharedMemoryCandidate: true,
        quantized: false,
      },
    ]);
    assert.equal(plan.sharedBuffers[0].accessPattern, "readwrite");
    assert.equal(plan.sharedBuffers[0].zeroOnReturn, false);
  });

  it("parses shape string into number array for shared buffers", () => {
    const plan = buildAPUSharedMemoryPlan("multiDim", [
      {
        name: "matrix",
        elementType: "Float32",
        shape: "[32, 64]",
        apuSharedMemoryCandidate: true,
        quantized: false,
      },
    ]);
    assert.deepEqual(plan.sharedBuffers[0].shape, [32, 64]);
  });
});
