import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createVectorReport,
  defineVectorType,
  validateMatrixType,
  validateTensorType,
  validateVectorOperation,
} from "../dist/index.js";

describe("galerina-core-vector contracts", () => {
  it("defines vector types with positive lane counts", () => {
    assert.deepEqual(defineVectorType("Float32", 4), {
      elementType: "Float32",
      dimension: { lanes: 4 },
    });
    assert.throws(() => defineVectorType("Float32", 0), /lane count/);
  });

  it("validates matrix and tensor shapes", () => {
    assert.equal(
      validateMatrixType({
        elementType: "Float32",
        shape: { rows: 0, columns: 4 },
      })[0]?.code,
      "Galerina_MATRIX_ROWS_INVALID",
    );
    assert.equal(
      validateTensorType({
        elementType: "Float32",
        shape: { dimensions: [1, 0, 3] },
      })[0]?.code,
      "Galerina_TENSOR_DIMENSION_INVALID",
    );
  });

  it("rejects vector operation shape mismatches", () => {
    const diagnostics = validateVectorOperation({
      name: "add",
      inputs: [defineVectorType("Float32", 4), defineVectorType("Float32", 8)],
      output: defineVectorType("Float32", 4),
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_VECTOR_OPERATION_SHAPE_MISMATCH",
      ),
      true,
    );
  });

  it("creates vector reports", () => {
    const report = createVectorReport({
      operations: [
        {
          name: "add",
          inputs: [defineVectorType("Float32", 4)],
          output: defineVectorType("Float32", 4),
        },
      ],
    });

    assert.equal(report.operations.length, 1);
    assert.equal(report.diagnostics.length, 0);
  });

  it("loads the Float32 vector operation example", async () => {
    const operation = JSON.parse(
      await readFile(
        new URL("../examples/float32-vector-operation.json", import.meta.url),
        "utf8",
      ),
    );
    const report = createVectorReport({ operations: [operation] });

    assert.equal(report.diagnostics.length, 0);
    assert.equal(report.operations[0]?.output.dimension.lanes, 768);
  });
});
