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
    assert.equal(selection.safe, false);
    assert.equal(selection.diagnostics.some((diagnostic) => diagnostic.code === "Galerina_AI_ACCELERATOR_FALLBACK_CAPABILITY_REQUIRED"), true);
    assert.equal(report.targetSelections[0]?.selectedTarget, "gpu");
  });

  it("detaches and freezes report collections", () => {
    const capability = {
      name: "Local NPU",
      kind: "npu",
      supportedPrecisions: ["INT8"],
      supportedModelFormats: ["onnx"],
      supportedOperators: ["Conv"],
      supportsOnDeviceOnly: true,
      supportsDynamicShapes: false,
      features: ["execution-provider"],
    };
    const plan = {
      flow: "room-detection",
      model: "RoomObjectDetector",
      accelerator: "ai_accelerator",
      operations: ["Conv"],
      fallback: "reject",
    };
    const selection = selectAiAcceleratorTarget({
      model,
      adapter: "onnxruntime",
      preference: {
        prefer: "npu",
        fallback: ["gpu"],
        requireOnDevice: true,
        allowNetwork: false,
        allowSilentFallback: false,
        reportFallback: true,
      },
      capabilities: [capability],
    });
    const report = createAiAcceleratorTargetReport({ capabilities: [capability], plans: [plan], selections: [selection] });

    capability.features.push("caller-mutation");
    plan.operations.push("caller-mutation");
    selection.reasons.push("caller-mutation");

    assert.equal(report.capabilities[0].features.includes("caller-mutation"), false);
    assert.equal(report.plans[0].operations.includes("caller-mutation"), false);
    assert.equal(report.targetSelections[0].reasons.includes("caller-mutation"), false);
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.capabilities[0].features), true);
    assert.equal(Object.isFrozen(report.targetSelections[0].diagnostics), true);
  });

  it("derives warnings from the same diagnostic snapshot as the report", () => {
    const snapshotDiagnostics = [
      { code: "SNAPSHOT_WARNING", severity: "warning", message: "snapshot A" },
    ];
    const callerDiagnostics = [
      { code: "CALLER_WARNING", severity: "warning", message: "caller B" },
    ];
    let diagnosticReads = 0;
    const selection = {
      selectedTarget: "npu",
      requestedTarget: "npu",
      adapter: "onnxruntime",
      fallbackUsed: false,
      fallbackDeclared: false,
      safe: true,
      reasons: [],
      get diagnostics() {
        diagnosticReads += 1;
        return diagnosticReads <= 2 ? snapshotDiagnostics : callerDiagnostics;
      },
    };

    const report = createAiAcceleratorTargetReport({
      capabilities: [],
      selections: [selection],
    });

    assert.deepEqual(report.targetSelections[0]?.diagnostics, snapshotDiagnostics);
    assert.deepEqual(report.warnings, ["snapshot A"]);
    assert.equal(diagnosticReads, 2);
  });

  it("validates external ONNX model profiles", () => {
    assert.equal(
      validateAiAcceleratorModel({ ...model, path: "./models/model.bin" })[0]
        ?.code,
      "Galerina_AI_ACCELERATOR_ONNX_EXTENSION_REQUIRED",
    );
  });

  it("refuses malformed nested records, hostile collections, and absent evidence", () => {
    const malformed = selectAiAcceleratorTarget({
      model: { ...model, precision: "ROGUE" },
      preference: {
        prefer: "npu",
        fallback: ["gpu"],
        requireOnDevice: true,
        allowNetwork: false,
        allowSilentFallback: false,
        reportFallback: true,
      },
      capabilities: [],
    });
    assert.equal(malformed.selectedTarget, "reject");
    assert.equal(malformed.safe, false);
    const proxy = new Proxy({ ...model }, {});
    assert.equal(validateAiAcceleratorModel(proxy)[0]?.severity, "error");
    const absentEvidence = selectAiAcceleratorTarget({
      model,
      preference: {
        prefer: "npu",
        fallback: ["gpu"],
        requireOnDevice: true,
        allowNetwork: false,
        allowSilentFallback: false,
        reportFallback: true,
      },
      capabilities: [{
        name: "Unbound NPU",
        kind: "npu",
        supportedPrecisions: ["INT8"],
        features: [],
      }],
    });
    assert.equal(absentEvidence.selectedTarget, "gpu");
    assert.equal(absentEvidence.safe, false);
    assert.equal(absentEvidence.diagnostics.some((diagnostic) => diagnostic.code === "Galerina_AI_ACCELERATOR_FALLBACK_CAPABILITY_REQUIRED"), true);
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
