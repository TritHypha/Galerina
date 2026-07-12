import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isResponseSafeClassification,
  listResponseSafeFields,
  validateDataModel,
  validateModelField,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const userModel = {
  name: "User",
  storage: { kind: "table", name: "users" },
  fields: [
    { name: "id", type: "uuid", classification: "public", nullable: false },
    { name: "email", type: "string", classification: "pii", nullable: false },
    {
      name: "password",
      type: "string",
      classification: "secret",
      nullable: false,
      secretStorage: "hashed",
    },
    { name: "loginCount", type: "integer", classification: "internal", nullable: false },
  ],
  keys: [
    { kind: "primary", fields: ["id"] },
    { kind: "unique", fields: ["email"] },
  ],
  permissions: [{ role: "admin", actions: ["read", "create", "update", "delete"] }],
};

describe("validateModelField — every field is classified, secrets are never plaintext", () => {
  it("accepts a classified field", () => {
    assert.deepEqual(
      codes(validateModelField({ name: "id", type: "uuid", classification: "public", nullable: false })),
      [],
    );
  });

  it("errors on an unclassified field", () => {
    const diags = validateModelField({ name: "x", type: "string", classification: "unknown", nullable: true });
    assert.deepEqual(codes(diags), ["Galerina_DATA_MODEL_FIELD_UNCLASSIFIED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("errors on a secret field with no storage mode (implicit plaintext)", () => {
    const diags = validateModelField({
      name: "apiKey",
      type: "string",
      classification: "secret",
      nullable: false,
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_MODEL_SECRET_PLAINTEXT"]);
  });

  it("errors on a secret field with an unrecognised storage mode", () => {
    const diags = validateModelField({
      name: "apiKey",
      type: "string",
      classification: "secret",
      nullable: false,
      secretStorage: "plaintext",
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_MODEL_SECRET_PLAINTEXT"]);
  });

  it("accepts each safe secret storage mode", () => {
    for (const secretStorage of ["hashed", "encrypted", "external_ref"]) {
      const diags = validateModelField({
        name: "apiKey",
        type: "string",
        classification: "secret",
        nullable: false,
        secretStorage,
      });
      assert.deepEqual(codes(diags), [], secretStorage);
    }
  });

  it("rejects unknown field types", () => {
    const diags = validateModelField({ name: "x", type: "money", classification: "public", nullable: false });
    assert.deepEqual(codes(diags), ["Galerina_DATA_MODEL_FIELD_TYPE_UNKNOWN"]);
  });
});

describe("validateDataModel — structural, key and permission checks", () => {
  it("accepts a fully-classified model with one primary key", () => {
    assert.deepEqual(codes(validateDataModel(userModel)), []);
  });

  it("requires a primary key", () => {
    const diags = validateDataModel({
      ...userModel,
      keys: [{ kind: "unique", fields: ["email"] }],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_MODEL_PRIMARY_KEY_REQUIRED"]);
  });

  it("rejects two primary keys", () => {
    const diags = validateDataModel({
      ...userModel,
      keys: [
        { kind: "primary", fields: ["id"] },
        { kind: "primary", fields: ["email"] },
      ],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_MODEL_PRIMARY_KEY_DUPLICATE"]);
  });

  it("rejects keys over undeclared fields and empty key field lists", () => {
    const diags = validateDataModel({
      ...userModel,
      keys: [
        { kind: "primary", fields: ["ghost"] },
        { kind: "unique", fields: [] },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_KEY_FIELD_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_KEY_FIELDS_REQUIRED"));
  });

  it("rejects an unknown storage kind and a missing storage name", () => {
    const diags = validateDataModel({
      ...userModel,
      storage: { kind: "graph", name: " " },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_STORAGE_KIND_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_STORAGE_NAME_REQUIRED"));
  });

  it("rejects a model with no fields and surfaces duplicates", () => {
    const empty = validateDataModel({ ...userModel, fields: [], keys: [{ kind: "primary", fields: [] }] });
    assert.ok(codes(empty).includes("Galerina_DATA_MODEL_FIELDS_REQUIRED"));

    const dup = validateDataModel({
      ...userModel,
      fields: [...userModel.fields, { name: "id", type: "uuid", classification: "public", nullable: false }],
    });
    assert.ok(codes(dup).includes("Galerina_DATA_MODEL_FIELD_DUPLICATE"));
  });

  it("propagates the unclassified-field error from field validation", () => {
    const diags = validateDataModel({
      ...userModel,
      fields: [
        ...userModel.fields,
        { name: "notes", type: "string", classification: "", nullable: true },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_FIELD_UNCLASSIFIED"));
  });

  it("rejects unknown permission actions and empty roles", () => {
    const diags = validateDataModel({
      ...userModel,
      permissions: [{ role: "", actions: ["read", "drop_table"] }],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_PERMISSION_ROLE_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_PERMISSION_ACTION_UNKNOWN"));
  });

  it("rejects blank archive/retention refs only when present", () => {
    const diags = validateDataModel({ ...userModel, archiveRef: " ", retentionRef: "" });
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_ARCHIVE_REF_INVALID"));
    assert.ok(codes(diags).includes("Galerina_DATA_MODEL_RETENTION_REF_INVALID"));
    assert.deepEqual(
      codes(validateDataModel({ ...userModel, archiveRef: "app.users-archive" })),
      [],
    );
  });
});

describe("response safety — storage models are not API responses", () => {
  it("only public is response-safe by default", () => {
    assert.equal(isResponseSafeClassification("public"), true);
    for (const classification of ["internal", "pii", "secret"]) {
      assert.equal(isResponseSafeClassification(classification), false, classification);
    }
  });

  it("listResponseSafeFields exposes only public fields", () => {
    assert.deepEqual(listResponseSafeFields(userModel), ["id"]);
  });
});
