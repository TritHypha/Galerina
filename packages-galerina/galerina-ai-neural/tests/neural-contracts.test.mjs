import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNeuralReport,
  isSameTensorShape,
  validateNeuralModel,
} from "../dist/index.js";

const imageTensor = {
  elementType: "Float32",
  shape: { dimensions: [1, 3, 224, 224] },
};

describe("galerina-ai-neural contracts", () => {
  it("validates static tensor shapes for NPU planning", () => {
    const diagnostics = validateNeuralModel({
      name: "ImageClassifier",
      task: "classification",
      inputs: [imageTensor],
      outputs: [{ elementType: "Float32", shape: { dimensions: [1, 1000] } }],
      layers: [],
    });

    assert.equal(diagnostics.length, 0);
  });

  it("rejects invalid tensor dimensions", () => {
    const diagnostics = validateNeuralModel({
      name: "BadModel",
      task: "classification",
      inputs: [{ elementType: "Float32", shape: { dimensions: [1, 0, 224] } }],
      outputs: [],
      layers: [],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_NEURAL_TENSOR_DIMENSION_INVALID",
      ),
      true,
    );
  });

  it("compares tensor shape compatibility", () => {
    assert.equal(isSameTensorShape(imageTensor, imageTensor), true);
    assert.equal(
      isSameTensorShape(imageTensor, {
        elementType: "Float32",
        shape: { dimensions: [1, 224, 224, 3] },
      }),
      false,
    );
  });

  it("creates neural reports", () => {
    const report = createNeuralReport({
      model: {
        name: "ImageClassifier",
        task: "classification",
        inputs: [imageTensor],
        outputs: [{ elementType: "Float32", shape: { dimensions: [1, 1000] } }],
        layers: [],
      },
    });

    assert.equal(report.model, "ImageClassifier");
    assert.equal(report.diagnostics.length, 0);
  });
});
