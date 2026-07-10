import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSearchIndexReport,
  validateSearchDocument,
  validateSearchIndexInput,
  validateSearchIndexPolicy,
  validateSearchQuery,
  validateSearchRanking,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const goodDocument = {
  id: "doc-1",
  fields: [
    { name: "title", kind: "text", searchable: true },
    { name: "created", kind: "date", searchable: false },
  ],
};

const safePolicy = {
  name: "articles",
  fieldAllowlist: ["title", "created"],
  piiFields: ["email"],
};

describe("validateSearchDocument — id plus at least one searchable field", () => {
  it("accepts a well-formed document", () => {
    assert.deepEqual(codes(validateSearchDocument(goodDocument)), []);
  });

  it("requires an id", () => {
    const diags = validateSearchDocument({ ...goodDocument, id: "  " });
    assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_DOCUMENT_ID_REQUIRED"]);
  });

  it("rejects a document with no fields", () => {
    const diags = validateSearchDocument({ id: "doc-1", fields: [] });
    assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_FIELDS_REQUIRED"]);
  });

  it("rejects a document with fields but none searchable", () => {
    const diags = validateSearchDocument({
      id: "doc-1",
      fields: [{ name: "created", kind: "date", searchable: false }],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_SEARCHABLE_FIELD_REQUIRED"]);
  });

  it("rejects duplicate names and unknown kinds", () => {
    const diags = validateSearchDocument({
      id: "doc-1",
      fields: [
        { name: "title", kind: "text", searchable: true },
        { name: "title", kind: "vector", searchable: true },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_SEARCH_FIELD_DUPLICATE"));
    assert.ok(codes(diags).includes("Galerina_DATA_SEARCH_FIELD_KIND_UNKNOWN"));
  });
});

describe("validateSearchIndexPolicy — PII never enters the index", () => {
  it("accepts a disjoint allowlist and PII set", () => {
    assert.deepEqual(codes(validateSearchIndexPolicy(safePolicy)), []);
  });

  it("errors when a declared PII field is allowlisted", () => {
    const diags = validateSearchIndexPolicy({
      ...safePolicy,
      fieldAllowlist: ["title", "email"],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_PII_FIELD_INDEXED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("warns on an empty allowlist: valid but indexes nothing", () => {
    const diags = validateSearchIndexPolicy({ ...safePolicy, fieldAllowlist: [] });
    assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_ALLOWLIST_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });
});

describe("validateSearchIndexInput — deny-by-default consequences are visible", () => {
  it("accepts a document whose searchable fields are allowlisted", () => {
    const diags = validateSearchIndexInput({
      index: "articles",
      document: goodDocument,
      policy: safePolicy,
    });
    assert.deepEqual(codes(diags), []);
  });

  it("warns when no searchable field survives the allowlist", () => {
    const diags = validateSearchIndexInput({
      index: "articles",
      document: goodDocument,
      policy: { ...safePolicy, fieldAllowlist: ["created"] },
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_NO_INDEXABLE_FIELDS"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("requires an index name", () => {
    const diags = validateSearchIndexInput({
      index: "",
      document: goodDocument,
      policy: safePolicy,
    });
    assert.ok(codes(diags).includes("Galerina_DATA_SEARCH_INDEX_NAME_REQUIRED"));
  });
});

describe("validateSearchQuery — bounded limit is mandatory", () => {
  const goodQuery = {
    index: "articles",
    text: "mushrooms",
    filters: [{ field: "created", operator: "gte" }],
    limit: 25,
    offset: 0,
  };

  it("accepts a bounded query", () => {
    assert.deepEqual(codes(validateSearchQuery(goodQuery)), []);
  });

  it("rejects a missing, zero, negative or fractional limit", () => {
    for (const limit of [0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const diags = validateSearchQuery({ ...goodQuery, limit });
      assert.deepEqual(codes(diags), ["Galerina_DATA_SEARCH_QUERY_LIMIT_REQUIRED"]);
    }
  });

  it("rejects a negative offset only when present", () => {
    assert.deepEqual(codes(validateSearchQuery({ ...goodQuery, offset: -1 })), [
      "Galerina_DATA_SEARCH_QUERY_OFFSET_INVALID",
    ]);
    const { offset, ...noOffset } = goodQuery;
    assert.deepEqual(codes(validateSearchQuery(noOffset)), []);
  });

  it("rejects unknown filter operators and empty filter fields", () => {
    const diags = validateSearchQuery({
      ...goodQuery,
      filters: [{ field: " ", operator: "regex" }],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_SEARCH_FILTER_FIELD_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_SEARCH_FILTER_OPERATOR_UNKNOWN"));
  });
});

describe("validateSearchRanking — declared strategies only", () => {
  it("accepts relevance without boosts", () => {
    assert.deepEqual(codes(validateSearchRanking({ strategy: "relevance" })), []);
  });

  it("rejects an unknown strategy", () => {
    assert.deepEqual(codes(validateSearchRanking({ strategy: "ml_magic" })), [
      "Galerina_DATA_SEARCH_RANKING_STRATEGY_UNKNOWN",
    ]);
  });

  it("requires boosts for field_boost and validates them", () => {
    assert.deepEqual(codes(validateSearchRanking({ strategy: "field_boost" })), [
      "Galerina_DATA_SEARCH_BOOSTS_REQUIRED",
    ]);
    assert.deepEqual(
      codes(validateSearchRanking({
        strategy: "field_boost",
        boosts: [{ field: "title", factor: 0 }],
      })),
      ["Galerina_DATA_SEARCH_BOOST_INVALID"],
    );
    assert.deepEqual(
      codes(validateSearchRanking({
        strategy: "field_boost",
        boosts: [{ field: "title", factor: 2 }],
      })),
      [],
    );
  });
});

describe("createSearchIndexReport — counts and policy travel with the report", () => {
  it("builds a clean report", () => {
    const report = createSearchIndexReport({
      index: "articles",
      policy: safePolicy,
      documentCount: 12,
      skippedFieldCount: 3,
    });
    assert.equal(report.index, "articles");
    assert.equal(report.policy, "articles");
    assert.deepEqual(report.diagnostics, []);
  });

  it("rejects invalid counts and carries policy errors", () => {
    const report = createSearchIndexReport({
      index: "articles",
      policy: { ...safePolicy, fieldAllowlist: ["email"] },
      documentCount: -1,
      skippedFieldCount: 0.5,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_SEARCH_PII_FIELD_INDEXED"));
    assert.equal(
      codes(report.diagnostics).filter((c) => c === "Galerina_DATA_SEARCH_COUNT_INVALID").length,
      2,
    );
  });
});
