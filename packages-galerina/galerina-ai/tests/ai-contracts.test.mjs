import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAiInferenceReport,
  defineAiModelRegistry,
  defineAiSafetyPolicy,
  findAiModel,
  selectAiInferenceTarget,
  validateAiInferenceRequest,
} from "../dist/index.js";

const model = {
  name: "LocalLowBitAssistant",
  format: "gguf",
  source: "local-file",
  capabilities: [
    {
      task: "summarisation",
      maxContextTokens: 2048,
      maxOutputTokens: 256,
      supportsStreaming: true,
      supportedTargets: ["low_bit_ai", "cpu.generic"],
    },
  ],
  memoryEstimate: {
    modelBytes: 3_000_000_000,
    contextBytes: 512_000_000,
    workingBytes: 256_000_000,
    totalBytes: 3_768_000_000,
  },
  safetyPolicy: defineAiSafetyPolicy(),
};

describe("galerina-ai contracts", () => {
  it("registers and finds approved models", () => {
    const registry = defineAiModelRegistry([
      { id: "local.lowbit", descriptor: model, approved: true, tags: ["local"] },
    ]);

    assert.equal(findAiModel(registry, "local.lowbit")?.approved, true);
    assert.equal(findAiModel(registry, "missing"), undefined);
  });

  it("selects low_bit_ai when GPU is unavailable for the model", () => {
    const request = {
      model,
      prompt: { input: "Summarise this text." },
      task: "summarisation",
      targetPreference: ["gpu", "low_bit_ai", "cpu.generic"],
      options: {
        maxOutputTokens: 128,
        contextTokens: 1024,
        timeoutMs: 30_000,
        stream: false,
      },
    };

    const selection = selectAiInferenceTarget(request);
    const report = createAiInferenceReport(request);

    assert.equal(selection.selectedTarget, "low_bit_ai");
    assert.equal(selection.fallbackUsed, true);
    assert.equal(report.selectedTarget, "low_bit_ai");
    assert.equal(report.diagnostics.length, 0);
  });

  it("rejects unsafe prompt logging policy", () => {
    const request = {
      model: {
        ...model,
        safetyPolicy: defineAiSafetyPolicy({
          logPrompts: true,
          redactSecretsFromPrompts: false,
        }),
      },
      prompt: { input: "Hello" },
      task: "summarisation",
      targetPreference: ["low_bit_ai"],
      options: {
        maxOutputTokens: 128,
        contextTokens: 1024,
        timeoutMs: 30_000,
        stream: false,
      },
    };

    assert.equal(
      validateAiInferenceRequest(request)[0]?.code,
      "Galerina_AI_PROMPT_LOGGING_REQUIRES_REDACTION",
    );
  });

  it("denies network targets for required on-device NPU inference", () => {
    const request = {
      model,
      prompt: { input: "Embed this text." },
      task: "summarisation",
      targetPreference: ["npu", "remote"],
      requireOnDevice: true,
      allowNetwork: false,
      allowSilentFallback: false,
      options: {
        maxOutputTokens: 128,
        contextTokens: 1024,
        timeoutMs: 30_000,
        stream: false,
      },
    };

    assert.equal(
      validateAiInferenceRequest(request).some(
        (diagnostic) => diagnostic.code === "Galerina_AI_REMOTE_TARGET_DENIED",
      ),
      true,
    );
  });
});
