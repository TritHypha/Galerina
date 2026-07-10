import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyResponseMapping,
  createResponseReport,
  validateResponseFlow,
  validateResponseMapping,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const modelFields = [
  { name: "id", classification: "public" },
  { name: "displayName", classification: "public" },
  { name: "email", classification: "pii" },
  { name: "passwordHash", classification: "secret" },
  { name: "apiToken", classification: "credential" },
  { name: "loginCount", classification: "internal" },
];

const safeMapping = {
  model: "User",
  response: "UserResponse",
  allowlist: [
    { from: "id", to: "id" },
    { from: "displayName", to: "name" },
  ],
};

describe("validateResponseMapping — allowlist-based, secrets unrepresentable", () => {
  it("accepts a mapping of public fields", () => {
    assert.deepEqual(codes(validateResponseMapping(safeMapping, modelFields)), []);
  });

  it("errors when a secret field is mapped", () => {
    const diags = validateResponseMapping(
      { ...safeMapping, allowlist: [...safeMapping.allowlist, { from: "passwordHash", to: "hash" }] },
      modelFields,
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_SENSITIVE_FIELD_EXPOSED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("errors when a credential field is mapped", () => {
    const diags = validateResponseMapping(
      { ...safeMapping, allowlist: [{ from: "apiToken", to: "token" }] },
      modelFields,
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_SENSITIVE_FIELD_EXPOSED"]);
  });

  it("warns (not errors) when a pii field is mapped", () => {
    const diags = validateResponseMapping(
      { ...safeMapping, allowlist: [{ from: "email", to: "email" }] },
      modelFields,
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_PII_FIELD_EXPOSED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("errors when mapping an undeclared (unclassified) field", () => {
    const diags = validateResponseMapping(
      { ...safeMapping, allowlist: [{ from: "ghost", to: "ghost" }] },
      modelFields,
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_SOURCE_FIELD_UNKNOWN"]);
  });

  it("errors on a field with an unknown classification", () => {
    const diags = validateResponseMapping(
      { ...safeMapping, allowlist: [{ from: "blob", to: "blob" }] },
      [...modelFields, { name: "blob", classification: "mystery" }],
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_FIELD_UNCLASSIFIED"]);
  });

  it("warns on an empty allowlist: valid but returns nothing", () => {
    const diags = validateResponseMapping({ ...safeMapping, allowlist: [] }, modelFields);
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_ALLOWLIST_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects duplicate response targets and empty names", () => {
    const diags = validateResponseMapping(
      {
        ...safeMapping,
        allowlist: [
          { from: "id", to: "id" },
          { from: "displayName", to: "id" },
          { from: "", to: "x" },
        ],
      },
      modelFields,
    );
    assert.ok(codes(diags).includes("Galerina_DATA_RESPONSE_MAPPING_DUPLICATE"));
    assert.ok(codes(diags).includes("Galerina_DATA_RESPONSE_MAPPING_FIELD_REQUIRED"));
  });
});

describe("validateResponseFlow — raw model returns are denied", () => {
  it("errors when an endpoint declares no mapping", () => {
    const diags = validateResponseFlow(
      { endpoint: "GET /users", model: "User" },
      modelFields,
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_RAW_MODEL_RETURN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("accepts an endpoint with a safe mapping", () => {
    const diags = validateResponseFlow(
      { endpoint: "GET /users", model: "User", mapping: safeMapping },
      modelFields,
    );
    assert.deepEqual(codes(diags), []);
  });

  it("propagates mapping errors through the flow", () => {
    const diags = validateResponseFlow(
      {
        endpoint: "GET /users",
        model: "User",
        mapping: { ...safeMapping, allowlist: [{ from: "passwordHash", to: "hash" }] },
      },
      modelFields,
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_RESPONSE_SENSITIVE_FIELD_EXPOSED"]);
  });
});

describe("applyResponseMapping — fields outside the allowlist are dropped", () => {
  const record = {
    id: "u-1",
    displayName: "Phill",
    email: "x@example.test",
    passwordHash: "hh",
    loginCount: 9,
  };

  it("projects only allowlisted fields, renaming as declared", () => {
    const { response, droppedFields } = applyResponseMapping(safeMapping, record);
    assert.deepEqual(response, { id: "u-1", name: "Phill" });
    assert.deepEqual(droppedFields.sort(), ["email", "loginCount", "passwordHash"]);
  });

  it("never invents fields the record does not have", () => {
    const { response } = applyResponseMapping(safeMapping, { id: "u-2" });
    assert.deepEqual(response, { id: "u-2" });
    assert.equal(Object.prototype.hasOwnProperty.call(response, "name"), false);
  });

  it("does not read inherited properties from the record", () => {
    const proto = { displayName: "inherited" };
    const record2 = Object.assign(Object.create(proto), { id: "u-3" });
    const { response } = applyResponseMapping(safeMapping, record2);
    assert.deepEqual(response, { id: "u-3" });
  });
});

describe("createResponseReport — api and archive response reports", () => {
  it("builds a clean api report", () => {
    const report = createResponseReport({
      kind: "api",
      mapping: safeMapping,
      modelFields,
      mappedFieldCount: 2,
      droppedFieldCount: 3,
    });
    assert.equal(report.kind, "api");
    assert.equal(report.response, "UserResponse");
    assert.deepEqual(report.diagnostics, []);
  });

  it("rejects an unknown report kind and bad counts", () => {
    const report = createResponseReport({
      kind: "csv",
      mapping: safeMapping,
      modelFields,
      mappedFieldCount: -1,
      droppedFieldCount: 0.5,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_RESPONSE_REPORT_KIND_UNKNOWN"));
    assert.equal(
      codes(report.diagnostics).filter((c) => c === "Galerina_DATA_RESPONSE_COUNT_INVALID").length,
      2,
    );
  });

  it("carries sensitive-exposure errors into archive reports too", () => {
    const report = createResponseReport({
      kind: "archive",
      mapping: { ...safeMapping, allowlist: [{ from: "apiToken", to: "token" }] },
      modelFields,
      mappedFieldCount: 1,
      droppedFieldCount: 4,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_RESPONSE_SENSITIVE_FIELD_EXPOSED"));
  });
});
