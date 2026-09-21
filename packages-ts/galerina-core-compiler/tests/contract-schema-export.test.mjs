import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  CONTRACT_TYPES_SCHEMA,
  exportContractSchemasFromSource,
} from "../dist/index.js";

describe("exportContractSchemasFromSource — C17", () => {
  it("exports record fields as a versioned source-backed schema", () => {
    const source = `record ChargeRequest {
  amount: Int
}
`;
    const result = exportContractSchemasFromSource(source, "charge.fungi");
    assert.equal(result.ok, true);
    assert.equal(result.export.schemaVersion, CONTRACT_TYPES_SCHEMA);
    assert.equal(
      result.export.sourceIdentity,
      `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
    );
    assert.deepEqual(result.export.types.ChargeRequest, {
      type: "object",
      properties: { amount: { type: "integer" } },
      required: ["amount"],
    });
  });

  it("refuses Decimal, empty records, and duplicate names", () => {
    const decimal = exportContractSchemasFromSource(`record Price { value: Decimal }\n`, "price.fungi");
    assert.equal(decimal.ok, false);
    assert.ok(decimal.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));

    const empty = exportContractSchemasFromSource(`record Empty {}\n`, "empty.fungi");
    assert.equal(empty.ok, false);
    assert.ok(empty.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-004"));

    const duplicate = exportContractSchemasFromSource(
      `record A { x: Int }\nrecord A { y: String }\n`,
      "dup.fungi",
    );
    assert.equal(duplicate.ok, false);
    assert.ok(duplicate.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-002"));
  });
});
