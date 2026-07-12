import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_OPENSEARCH_OPERATION_KINDS,
  OPENSEARCH_ADAPTER_CHECKS,
  createOpenSearchAdapterReport,
  deriveOpenSearchAdapterStatus,
  validateOpenSearchAdapterDeclaration,
  validateOpenSearchAdapterRequirements,
  validateOpenSearchConnection,
  validateOpenSearchContractRefs,
  validateOpenSearchCredentialRef,
  validateOpenSearchIndexOperation,
  validateOpenSearchQuery,
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

const credential = { kind: "external_ref", ref: "secrets://galerina/opensearch/app-role" };

const goodConnection = {
  endpoint: "https://search.internal.example:9200",
  credential,
};

const goodDeclaration = {
  adapter: "app-opensearch",
  provider: "opensearch",
  requirements,
  contractRefs,
  connection: goodConnection,
};

const goodOperation = {
  index: "users",
  kind: "index",
  searchIndexPolicyRef: "@galerina/data-search#users-index-policy",
};

const goodQuery = {
  index: "users",
  limit: 25,
  searchIndexPolicyRef: "@galerina/data-search#users-index-policy",
};

describe("validateOpenSearchAdapterDeclaration — the complete contract", () => {
  it("accepts a fully-declared adapter", () => {
    assert.deepEqual(codes(validateOpenSearchAdapterDeclaration(goodDeclaration)), []);
  });

  it("requires an adapter name and the opensearch provider literal", () => {
    const diags = validateOpenSearchAdapterDeclaration({
      ...goodDeclaration,
      adapter: " ",
      provider: "elasticsearch",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_OPENSEARCH_ADAPTER_NAME_REQUIRED",
      "Galerina_DB_OPENSEARCH_PROVIDER_MISMATCH",
    ]);
  });
});

describe("the three non-negotiables — literal true, re-checked at runtime", () => {
  it("accepts the required literal-true requirements", () => {
    assert.deepEqual(codes(validateOpenSearchAdapterRequirements(requirements)), []);
  });

  it("fails closed when an untyped caller relaxes any of them", () => {
    const diags = validateOpenSearchAdapterRequirements({
      parameterisedOnly: false,
      rawSqlDenied: false,
      responseMappingRequired: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_OPENSEARCH_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DB_OPENSEARCH_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DB_OPENSEARCH_RESPONSE_MAPPING_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("typed contract refs — the adapter must consume the data family", () => {
  it("requires all three contract references to be non-empty", () => {
    const diags = validateOpenSearchContractRefs({
      modelContractRef: "",
      queryContractRef: " ",
      responseContractRef: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_OPENSEARCH_MODEL_CONTRACT_REF_REQUIRED",
      "Galerina_DB_OPENSEARCH_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_DB_OPENSEARCH_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("endpoint — TLS required off-localhost, no userinfo, no odd schemes", () => {
  it("accepts an https endpoint", () => {
    assert.deepEqual(codes(validateOpenSearchConnection(goodConnection)), []);
  });

  it("errors on plain http for a non-localhost endpoint", () => {
    const diags = validateOpenSearchConnection({
      ...goodConnection,
      endpoint: "http://search.internal.example:9200",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_TLS_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("allows plain http only for localhost endpoints", () => {
    for (const endpoint of [
      "http://localhost:9200",
      "http://127.0.0.1:9200",
      "http://[::1]:9200",
    ]) {
      const diags = validateOpenSearchConnection({ ...goodConnection, endpoint });
      assert.deepEqual(codes(diags), [], endpoint);
    }
  });

  it("rejects unknown endpoint schemes instead of defaulting them", () => {
    const diags = validateOpenSearchConnection({
      ...goodConnection,
      endpoint: "ftp://search.internal.example",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_ENDPOINT_SCHEME_INVALID"]);
  });

  it("requires a non-empty endpoint", () => {
    const diags = validateOpenSearchConnection({ ...goodConnection, endpoint: " " });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_ENDPOINT_REQUIRED"]);
  });

  it("REJECTS userinfo in the endpoint — a credential-bearing connection string", () => {
    const diags = validateOpenSearchConnection({
      ...goodConnection,
      endpoint: "https://app:hunter2@search.internal.example:9200",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_INLINE_CREDENTIALS_FORBIDDEN"]);
    assert.equal(diags[0].severity, "error");
  });
});

describe("credentials — external references only, never inline", () => {
  it("accepts an external reference", () => {
    assert.deepEqual(codes(validateOpenSearchCredentialRef(credential)), []);
  });

  it("rejects a non-external_ref kind and an empty ref", () => {
    const diags = validateOpenSearchCredentialRef({ kind: "basic_auth", ref: " " });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_OPENSEARCH_CREDENTIAL_KIND_INVALID",
      "Galerina_DB_OPENSEARCH_CREDENTIAL_REF_REQUIRED",
    ]);
  });

  it("REJECTS a credential-bearing connection string in the ref", () => {
    const diags = validateOpenSearchCredentialRef({
      kind: "external_ref",
      ref: "https://app:hunter2@search.example.com",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_INLINE_CREDENTIALS_FORBIDDEN"]);
  });
});

describe("index operations — must carry the data-search PII-allowlist policy", () => {
  it("accepts every known operation kind with a policy ref", () => {
    for (const kind of KNOWN_OPENSEARCH_OPERATION_KINDS) {
      const diags = validateOpenSearchIndexOperation({ ...goodOperation, kind });
      assert.deepEqual(codes(diags), [], kind);
    }
  });

  it("REJECTS an operation without a searchIndexPolicyRef", () => {
    const diags = validateOpenSearchIndexOperation({
      ...goodOperation,
      searchIndexPolicyRef: " ",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_SEARCH_INDEX_POLICY_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("rejects an unknown operation kind and a missing index name", () => {
    const diags = validateOpenSearchIndexOperation({
      ...goodOperation,
      index: " ",
      kind: "reindex",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_OPENSEARCH_INDEX_NAME_REQUIRED",
      "Galerina_DB_OPENSEARCH_OPERATION_KIND_UNKNOWN",
    ]);
  });
});

describe("queries — bounded limits, policy-scoped (the data-search rule)", () => {
  it("accepts a bounded, policy-scoped query", () => {
    assert.deepEqual(codes(validateOpenSearchQuery(goodQuery)), []);
  });

  it("REQUIRES a positive integer limit", () => {
    for (const limit of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const diags = validateOpenSearchQuery({ ...goodQuery, limit });
      assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_QUERY_LIMIT_REQUIRED"], String(limit));
      assert.equal(diags[0].severity, "error");
    }
  });

  it("REJECTS a query without a searchIndexPolicyRef", () => {
    const diags = validateOpenSearchQuery({ ...goodQuery, searchIndexPolicyRef: "" });
    assert.deepEqual(codes(diags), ["Galerina_DB_OPENSEARCH_SEARCH_INDEX_POLICY_REQUIRED"]);
  });
});

describe("createOpenSearchAdapterReport — status and checks derived, never asserted", () => {
  it("reports success with counts and all-pass checks for a clean adapter", () => {
    const report = createOpenSearchAdapterReport({
      declaration: goodDeclaration,
      indexOperations: [goodOperation],
      queries: [goodQuery],
    });
    assert.equal(report.adapter, "app-opensearch");
    assert.equal(report.provider, "opensearch");
    assert.equal(report.status, "success");
    assert.equal(report.indexOperationCount, 1);
    assert.equal(report.queryCount, 1);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(OPENSEARCH_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives failed status and per-check outcomes from the diagnostics", () => {
    const report = createOpenSearchAdapterReport({
      declaration: {
        ...goodDeclaration,
        connection: { ...goodConnection, endpoint: "http://search.internal.example:9200" },
      },
      indexOperations: [{ ...goodOperation, searchIndexPolicyRef: "" }],
      queries: [{ ...goodQuery, limit: 0 }],
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_DB_OPENSEARCH_QUERY_LIMIT_REQUIRED",
      "Galerina_DB_OPENSEARCH_SEARCH_INDEX_POLICY_REQUIRED",
      "Galerina_DB_OPENSEARCH_TLS_REQUIRED",
    ]);
    assert.equal(report.checks.tls, "fail");
    assert.equal(report.checks.searchIndexPolicy, "fail");
    assert.equal(report.checks.queryBounds, "fail");
    assert.equal(report.checks.credentials, "pass");
    assert.equal(report.checks.typedContracts, "pass");
  });

  it("reports without operations or queries still validate the declaration", () => {
    const report = createOpenSearchAdapterReport({ declaration: goodDeclaration });
    assert.equal(report.status, "success");
    assert.equal(report.indexOperationCount, 0);
    assert.equal(report.queryCount, 0);
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveOpenSearchAdapterStatus([]), "success");
    assert.equal(
      deriveOpenSearchAdapterStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveOpenSearchAdapterStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});

describe("known-set vocabulary", () => {
  it("declares the three index operation kinds", () => {
    assert.deepEqual(KNOWN_OPENSEARCH_OPERATION_KINDS, ["index", "update", "delete"]);
  });
});
