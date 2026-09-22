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

  it("exports nested records and arrays of admitted types", () => {
    const source = `record Address {
  city: String
}
record ChargeRequest {
  amount: Int
  address: Address
  tags: Array<String>
  nested: Array<Address>
}
`;
    const result = exportContractSchemasFromSource(source, "nested.fungi");
    assert.equal(result.ok, true);
    assert.deepEqual(result.export.types.Address, {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    });
    assert.deepEqual(result.export.types.ChargeRequest, {
      type: "object",
      properties: {
        amount: { type: "integer" },
        address: { $ref: "#/types/Address" },
        tags: { type: "array", items: { type: "string" } },
        nested: { type: "array", items: { $ref: "#/types/Address" } },
      },
      required: ["amount", "address", "tags", "nested"],
    });
  });

  it("refuses Option, Result, unknown nested names, and arrays of Decimal", () => {
    const option = exportContractSchemasFromSource(`record Wrap { value: Option<Int> }\n`, "opt.fungi");
    assert.equal(option.ok, false);
    assert.ok(option.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));

    const resultTy = exportContractSchemasFromSource(`record Wrap { value: Result<Int, String> }\n`, "res.fungi");
    assert.equal(resultTy.ok, false);
    assert.ok(resultTy.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));

    const unknown = exportContractSchemasFromSource(`record Wrap { address: Address }\n`, "unk.fungi");
    assert.equal(unknown.ok, false);
    assert.ok(unknown.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));

    const arrayDecimal = exportContractSchemasFromSource(`record Wrap { values: Array<Decimal> }\n`, "arr.fungi");
    assert.equal(arrayDecimal.ok, false);
    assert.ok(arrayDecimal.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));
  });

  it("preserves __proto__ field and record names as own keys", () => {
    const fieldSource = `record Root { __proto__: String }\n`;
    const field = exportContractSchemasFromSource(fieldSource, "proto-field.fungi");
    assert.equal(field.ok, true);
    assert.equal(Object.hasOwn(field.export.types, "Root"), true);
    assert.equal(Object.hasOwn(field.export.types.Root.properties, "__proto__"), true);
    assert.deepEqual(field.export.types.Root.required, ["__proto__"]);
    assert.deepEqual(field.export.types.Root.properties["__proto__"], { type: "string" });
    const fieldJson = JSON.parse(JSON.stringify(field.export));
    assert.equal(Object.hasOwn(fieldJson.types.Root.properties, "__proto__"), true);
    assert.equal(fieldJson.types.Root.properties["__proto__"].type, "string");

    const recordSource = `record __proto__ { value: Int }
record Root { nested: __proto__ }
`;
    const named = exportContractSchemasFromSource(recordSource, "proto-record.fungi");
    assert.equal(named.ok, true);
    assert.equal(Object.hasOwn(named.export.types, "__proto__"), true);
    assert.equal(Object.hasOwn(named.export.types, "Root"), true);
    assert.deepEqual(named.export.types.Root.properties.nested, { $ref: "#/types/__proto__" });
    assert.deepEqual(named.export.types["__proto__"].properties.value, { type: "integer" });
    const namedJson = JSON.parse(JSON.stringify(named.export));
    assert.equal(Object.hasOwn(namedJson.types, "__proto__"), true);
    assert.equal(namedJson.types.Root.properties.nested.$ref, "#/types/__proto__");
    assert.equal(namedJson.types["__proto__"].properties.value.type, "integer");
  });

  it("ordinary field names remain own enumerable properties", () => {
    const result = exportContractSchemasFromSource(`record Root { value: String }\n`, "ordinary.fungi");
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(result.export.types.Root.properties, "value"), true);
    assert.deepEqual(result.export.types.Root.required, ["value"]);
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
