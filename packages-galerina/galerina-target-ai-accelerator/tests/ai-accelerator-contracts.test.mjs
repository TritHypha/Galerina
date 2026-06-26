import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  GENERIC_ONNX_NPU_PROFILE,
  createAiAcceleratorTargetReport,
  selectAiAcceleratorTarget,
  validateAiAcceleratorModel,
} from "../dist/index.js";

const model = {
  name: "RoomObjectDetector",
  path: "./models/room-detect.onnx",
  format: "onnx",
  precision: "INT8",
  requiredOperators: ["Conv", "Relu"],
  inputTensors: [
    { name: "image", elementType: "Float32", shape: [1, 3, 224, 224] },
  ],
  outputTensors: [
    { name: "objects", elementType: "Float32", shape: [1, 1000] },
  ],
  dynamicShapes: false,
};

describe("galerina-target-ai-accelerator NPU contracts", () => {
  it("keeps NPU as a passive ONNX-capable accelerator profile", () => {
    assert.equal(GENERIC_ONNX_NPU_PROFILE.kind, "npu");
    assert.equal(GENERIC_ONNX_NPU_PROFILE.passiveProfile, true);
    assert.equal(GENERIC_ONNX_NPU_PROFILE.frameworks.includes("onnx-runtime"), true);
  });

  it("selects compatible NPU capability for ONNX inference", () => {
    const selection = selectAiAcceleratorTarget({
      model,
      adapter: "onnxruntime",
      preference: {
        prefer: "npu",
        fallback: ["gpu", "cpu"],
        requireOnDevice: true,
        allowNetwork: false,
        allowSilentFallback: false,
        reportFallback: true,
      },
      capabilities: [
        {
          name: "Local NPU",
          kind: "npu",
          supportedPrecisions: ["INT8", "FP16"],
          supportedModelFormats: ["onnx"],
          supportedOperators: ["Conv", "Relu", "MatMul"],
          supportsOnDeviceOnly: true,
          supportsDynamicShapes: false,
          features: ["execution-provider"],
        },
      ],
    });

    assert.equal(selection.selectedTarget, "npu");
    assert.equal(selection.fallbackUsed, false);
    assert.equal(selection.safe, true);
  });

  it("reports explicit fallback when NPU cannot run the model", () => {
    const selection = selectAiAcceleratorTarget({
      model: { ...model, requiredOperators: ["Conv", "NonMaxSuppression"] },
      preference: {
        prefer: "npu",
        fallback: ["gpu", "cpu"],
        requireOnDevice: true,
        allowNetwork: false,
        allowSilentFallback: false,
        reportFallback: true,
      },
      capabilities: [
        {
          name: "Local NPU",
          kind: "npu",
          supportedPrecisions: ["INT8", "FP16"],
          supportedModelFormats: ["onnx"],
          supportedOperators: ["Conv", "Relu"],
          supportsOnDeviceOnly: true,
          supportsDynamicShapes: false,
          features: ["execution-provider"],
        },
      ],
    });
    const report = createAiAcceleratorTargetReport({
      capabilities: [],
      selections: [selection],
    });

    assert.equal(selection.selectedTarget, "gpu");
    assert.equal(selection.fallbackUsed, true);
    assert.equal(selection.fallbackDeclared, true);
    assert.equal(selection.safe, true);
    assert.equal(report.targetSelections[0]?.selectedTarget, "gpu");
  });

  it("validates external ONNX model profiles", () => {
    assert.equal(
      validateAiAcceleratorModel({ ...model, path: "./models/model.bin" })[0]
        ?.code,
      "Galerina_AI_ACCELERATOR_ONNX_EXTENSION_REQUIRED",
    );
  });

  it("loads the NPU target selection example", async () => {
    const example = JSON.parse(
      await readFile(
        new URL("../examples/npu-target-selection.json", import.meta.url),
        "utf8",
      ),
    );
    const selection = selectAiAcceleratorTarget(example);

    assert.equal(selection.selectedTarget, "npu");
    assert.equal(selection.safe, true);
  });
});
