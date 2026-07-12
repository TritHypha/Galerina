import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIRESTORE_ADAPTER_CHECKS,
  KNOWN_FIRESTORE_INDEX_FIELD_ORDERS,
  KNOWN_FIRESTORE_PATH_KINDS,
  createFirestoreAdapterReport,
  deriveFirestoreAdapterStatus,
  validateFirestoreAdapterDeclaration,
  validateFirestoreAdapterRequirements,
  validateFirestoreCompositeIndex,
  validateFirestoreContractRefs,
  validateFirestoreCredentialRef,
  validateFirestorePath,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const requirements = {
  parameterisedOnly: true,
  rawSqlDenied: true,
  responseMappingRequired: true,
};

const contractRefs = {
  modelContractRef: "@galerina/data-model#User",
  queryContractRef: "@galerina/data-query#FindUser",
  responseContractRef: "@galerina/data-response#UserResponse",
};

const credential = {
  kind: "external_ref",
  ref: "secrets://galerina/firestore/service-account",
};

const goodIndex = {
  collection: "users",
  fields: [
    { name: "createdAt", order: "descending" },
    { name: "status", order: "ascending" },
  ],
};

const goodDeclaration = {
  adapter: "app-firestore",
  provider: "firestore",
  requirements,
  contractRefs,
  projectId: "galerina-app",
  credential,
  securityRulesRef: "rules/firestore.rules",
  compositeIndexes: [goodIndex],
};

describe("validateFirestoreAdapterDeclaration — the complete contract", () => {
  it("accepts a fully-declared adapter", () => {
    assert.deepEqual(codes(validateFirestoreAdapterDeclaration(goodDeclaration)), []);
  });

  it("requires an adapter name, the firestore provider literal and a project id", () => {
    const diags = validateFirestoreAdapterDeclaration({
      ...goodDeclaration,
      adapter: " ",
      provider: "opensearch",
      projectId: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_FIRESTORE_ADAPTER_NAME_REQUIRED",
      "Galerina_DB_FIRESTORE_PROJECT_ID_REQUIRED",
      "Galerina_DB_FIRESTORE_PROVIDER_MISMATCH",
    ]);
  });

  it("REQUIRES a security rules reference — no rules, no adapter", () => {
    const diags = validateFirestoreAdapterDeclaration({
      ...goodDeclaration,
      securityRulesRef: " ",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_FIRESTORE_SECURITY_RULES_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });
});

describe("the three non-negotiables — literal true, re-checked at runtime", () => {
  it("accepts the required literal-true requirements", () => {
    assert.deepEqual(codes(validateFirestoreAdapterRequirements(requirements)), []);
  });

  it("fails closed when an untyped caller relaxes any of them", () => {
    const diags = validateFirestoreAdapterRequirements({
      parameterisedOnly: false,
      rawSqlDenied: false,
      responseMappingRequired: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_FIRESTORE_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DB_FIRESTORE_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DB_FIRESTORE_RESPONSE_MAPPING_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("typed contract refs — the adapter must consume the data family", () => {
  it("requires all three contract references to be non-empty", () => {
    const diags = validateFirestoreContractRefs({
      modelContractRef: "",
      queryContractRef: " ",
      responseContractRef: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_FIRESTORE_MODEL_CONTRACT_REF_REQUIRED",
      "Galerina_DB_FIRESTORE_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_DB_FIRESTORE_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("paths — relative segments with declared collection/document parity", () => {
  it("accepts collection paths with an odd number of segments", () => {
    for (const path of ["users", "users/alice/orders"]) {
      assert.deepEqual(codes(validateFirestorePath({ kind: "collection", path })), [], path);
    }
  });

  it("accepts document paths with an even number of segments", () => {
    for (const path of ["users/alice", "users/alice/orders/o-1"]) {
      assert.deepEqual(codes(validateFirestorePath({ kind: "document", path })), [], path);
    }
  });

  it("REJECTS a declared kind that contradicts segment parity", () => {
    const collection = validateFirestorePath({ kind: "collection", path: "users/alice" });
    assert.deepEqual(codes(collection), ["Galerina_DB_FIRESTORE_PATH_KIND_MISMATCH"]);
    const document = validateFirestorePath({ kind: "document", path: "users" });
    assert.deepEqual(codes(document), ["Galerina_DB_FIRESTORE_PATH_KIND_MISMATCH"]);
  });

  it("rejects an unknown path kind instead of inferring parity", () => {
    const diags = validateFirestorePath({ kind: "bucket", path: "users" });
    assert.deepEqual(codes(diags), ["Galerina_DB_FIRESTORE_PATH_KIND_UNKNOWN"]);
  });

  it("rejects empty segments — no double or trailing slashes", () => {
    for (const path of ["users//alice", "users/"]) {
      const diags = validateFirestorePath({ kind: "collection", path });
      assert.deepEqual(codes(diags), ["Galerina_DB_FIRESTORE_PATH_SEGMENT_EMPTY"], path);
    }
  });

  it("rejects traversal segments and non-relative paths", () => {
    const traversal = validateFirestorePath({ kind: "collection", path: "users/../admin" });
    assert.deepEqual(codes(traversal), ["Galerina_DB_FIRESTORE_PATH_SEGMENT_INVALID"]);
    const absolute = validateFirestorePath({ kind: "collection", path: "/users" });
    assert.deepEqual(codes(absolute), ["Galerina_DB_FIRESTORE_PATH_NOT_RELATIVE"]);
  });

  it("requires a non-empty path", () => {
    const diags = validateFirestorePath({ kind: "document", path: " " });
    assert.deepEqual(codes(diags), ["Galerina_DB_FIRESTORE_PATH_REQUIRED"]);
  });
});

describe("composite indexes — must name their fields", () => {
  it("accepts a two-field named index", () => {
    assert.deepEqual(codes(validateFirestoreCompositeIndex(goodIndex)), []);
  });

  it("REJECTS an index with fewer than two fields", () => {
    const diags = validateFirestoreCompositeIndex({
      collection: "users",
      fields: [{ name: "createdAt", order: "descending" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_FIRESTORE_INDEX_FIELDS_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("rejects unnamed fields, duplicate fields and unknown orders", () => {
    const diags = validateFirestoreCompositeIndex({
      collection: " ",
      fields: [
        { name: " ", order: "ascending" },
        { name: "status", order: "sideways" },
        { name: "status", order: "ascending" },
      ],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_FIRESTORE_INDEX_COLLECTION_REQUIRED",
      "Galerina_DB_FIRESTORE_INDEX_FIELD_DUPLICATE",
      "Galerina_DB_FIRESTORE_INDEX_FIELD_NAME_REQUIRED",
      "Galerina_DB_FIRESTORE_INDEX_FIELD_ORDER_UNKNOWN",
    ]);
  });

  it("propagates index diagnostics through the declaration validator", () => {
    const diags = validateFirestoreAdapterDeclaration({
      ...goodDeclaration,
      compositeIndexes: [{ collection: "users", fields: [] }],
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_FIRESTORE_INDEX_FIELDS_REQUIRED"]);
  });
});

describe("credentials — external references only, never inline", () => {
  it("accepts an external reference", () => {
    assert.deepEqual(codes(validateFirestoreCredentialRef(credential)), []);
  });

  it("rejects a non-external_ref kind and an empty ref", () => {
    const diags = validateFirestoreCredentialRef({ kind: "inline", ref: " " });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_FIRESTORE_CREDENTIAL_KIND_INVALID",
      "Galerina_DB_FIRESTORE_CREDENTIAL_REF_REQUIRED",
    ]);
  });

  it("REJECTS a credential-bearing connection string in the ref or project id", () => {
    const refDiags = validateFirestoreCredentialRef({
      kind: "external_ref",
      ref: "https://app:hunter2@firestore.example.com/project",
    });
    assert.deepEqual(codes(refDiags), ["Galerina_DB_FIRESTORE_INLINE_CREDENTIALS_FORBIDDEN"]);

    const projectDiags = validateFirestoreAdapterDeclaration({
      ...goodDeclaration,
      projectId: "https://app:hunter2@example.com/galerina-app",
    });
    assert.deepEqual(codes(projectDiags), ["Galerina_DB_FIRESTORE_INLINE_CREDENTIALS_FORBIDDEN"]);
  });
});

describe("createFirestoreAdapterReport — status and checks derived, never asserted", () => {
  const goodPaths = [
    { kind: "collection", path: "users" },
    { kind: "document", path: "users/alice" },
    { kind: "document", path: "users/alice/orders/o-1" },
  ];

  it("reports success, path counts and all-pass checks for a clean adapter", () => {
    const report = createFirestoreAdapterReport({
      declaration: goodDeclaration,
      paths: goodPaths,
    });
    assert.equal(report.adapter, "app-firestore");
    assert.equal(report.provider, "firestore");
    assert.equal(report.status, "success");
    assert.equal(report.collectionPathCount, 1);
    assert.equal(report.documentPathCount, 2);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(FIRESTORE_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives failed status and per-check outcomes from the diagnostics", () => {
    const report = createFirestoreAdapterReport({
      declaration: { ...goodDeclaration, securityRulesRef: "" },
      paths: [{ kind: "collection", path: "users/alice" }],
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_DB_FIRESTORE_PATH_KIND_MISMATCH",
      "Galerina_DB_FIRESTORE_SECURITY_RULES_REQUIRED",
    ]);
    assert.equal(report.checks.securityRules, "fail");
    assert.equal(report.checks.paths, "fail");
    assert.equal(report.checks.credentials, "pass");
    assert.equal(report.checks.indexes, "pass");
  });

  it("never counts an unknown path kind", () => {
    const report = createFirestoreAdapterReport({
      declaration: goodDeclaration,
      paths: [{ kind: "bucket", path: "users" }],
    });
    assert.equal(report.collectionPathCount, 0);
    assert.equal(report.documentPathCount, 0);
    assert.deepEqual(codes(report.diagnostics), ["Galerina_DB_FIRESTORE_PATH_KIND_UNKNOWN"]);
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveFirestoreAdapterStatus([]), "success");
    assert.equal(
      deriveFirestoreAdapterStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveFirestoreAdapterStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});

describe("known-set vocabulary", () => {
  it("declares the two path kinds", () => {
    assert.deepEqual(KNOWN_FIRESTORE_PATH_KINDS, ["collection", "document"]);
  });

  it("declares the three index field orders", () => {
    assert.deepEqual(KNOWN_FIRESTORE_INDEX_FIELD_ORDERS, [
      "ascending",
      "descending",
      "array_contains",
    ]);
  });
});
