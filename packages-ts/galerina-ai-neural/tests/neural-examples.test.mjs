import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createNeuralReport, isSameTensorShape, validateNeuralModel } from "../dist/index.js";

const EXAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const readExample = (name) => JSON.parse(readFileSync(join(EXAMPLE_DIR, name), "utf8"));

describe("checked-in neural examples", () => {
  it("validates the model example", () => {
    const model = readExample("model.example.json");
    assert.deepEqual(validateNeuralModel(model), []);
    assert.equal(isSameTensorShape(model.layers[0].output, model.outputs[0]), true);
  });

  it("the report example is exactly what createNeuralReport produces for the model example", () => {
    assert.deepEqual(createNeuralReport({ model: readExample("model.example.json") }), readExample("report.example.json"));
  });

  it("keeps the examples load-bearing: a bad dimension is reported", () => {
    const model = readExample("model.example.json");
    const bad = { ...model, inputs: [{ elementType: "Float32", shape: { dimensions: [1, 0, 224, 224] } }] };
    const report = createNeuralReport({ model: bad });
    assert.deepEqual(report.diagnostics.map((d) => d.code), ["Galerina_NEURAL_TENSOR_DIMENSION_INVALID"]);
  });
});
