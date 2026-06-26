import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLowBitAiInferencePlan,
  createLowBitAiInferenceReport,
  validateLowBitAiBackendAdapter,
  validateLowBitAiInferencePlan,
  validateLowBitAiModel,
} from "../dist/index.js";

const model = {
  name: "BitNet-b1.58-2B-4T",
  path: "./models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf",
  format: "gguf",
  weightFormat: "ternary_b1_58",
  quantization: "i2_s",
  embeddingQuantization: "q6_k",
  parameterCount: "2B",
  maxContextTokens: 2048,
  maxOutputTokens: 256,
  memoryEstimateBytes: 4_294_967_296,
};

const limits = {
  threads: 8,
  timeoutMs: 30_000,
  maxPromptTokens: 1024,
  maxOutputTokens: 256,
  memoryLimitBytes: 4_294_967_296,
};

describe("galerina-ai-lowbit contracts", () => {
  it("validates a low-bit model and report with BitNet selected as backend", () => {
    const plan = createLowBitAiInferencePlan(model, limits, {
      target: "low_bit_ai",
      backend: "bitnet",
      device: "cpu",
      runtime: "external-process",
      kernelFamily: "i2_s",
      fallbackReason: "GPU unavailable",
    });

    assert.equal(validateLowBitAiModel(model).valid, true);
    assert.deepEqual(validateLowBitAiInferencePlan(plan), []);
    assert.equal(createLowBitAiInferenceReport(plan).target, "low_bit_ai");
    assert.equal(createLowBitAiInferenceReport(plan).backend, "bitnet");
  });

  it("rejects non-GGUF paths for GGUF models", () => {
    assert.equal(
      validateLowBitAiModel({ ...model, path: "./model.bin" }).diagnostics[0]
        ?.code,
      "Galerina_LOWBIT_AI_GGUF_EXTENSION_REQUIRED",
    );
  });

  it("checks backend adapter compatibility", () => {
    const plan = createLowBitAiInferencePlan(model, limits, {
      backend: "bitnet",
      device: "cpu",
      runtime: "external-process",
      kernelFamily: "i2_s",
    });
    const adapter = {
      id: "bitnet",
      name: "bitnet.cpp",
      runtime: "external-process",
      device: "cpu",
      supportedWeightFormats: ["ternary_b1_58"],
      supportedQuantizations: ["i2_s"],
      supportedEmbeddingQuantizations: ["q6_k"],
      supportedKernelFamilies: ["i2_s", "auto"],
    };

    assert.deepEqual(validateLowBitAiBackendAdapter(adapter, plan), []);
  });
});
