import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createJsonArchiveReport,
  validateJsonDecodePlan,
  validateJsonExtractionPlan,
  validateJsonMemoryPolicy,
  validateJsonRedactionPolicy,
  validateJsonSchemaContract,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const boundedMemory = {
  maxDepth: 64,
  maxDocumentBytes: 16 * 1024 * 1024,
  maxStringBytes: 1024 * 1024,
};

const goodPlan = { name: "events", mode: "json_lines", memory: boundedMemory };

describe("validateJsonMemoryPolicy — unbounded parse is unsafe (fail-closed)", () => {
  it("accepts fully-bounded limits", () => {
    assert.deepEqual(codes(validateJsonMemoryPolicy(boundedMemory)), []);
  });

  it("rejects missing depth and document bounds", () => {
    const diags = validateJsonMemoryPolicy({ maxDepth: 0, maxDocumentBytes: -1 });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_JSON_DEPTH_LIMIT_REQUIRED",
      "Galerina_DATA_JSON_DOCUMENT_LIMIT_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });

  it("rejects non-integer and NaN bounds", () => {
    const diags = validateJsonMemoryPolicy({ maxDepth: 1.5, maxDocumentBytes: Number.NaN });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_JSON_DEPTH_LIMIT_REQUIRED",
      "Galerina_DATA_JSON_DOCUMENT_LIMIT_REQUIRED",
    ]);
  });

  it("rejects maxStringBytes only when present and invalid", () => {
    assert.deepEqual(
      codes(validateJsonMemoryPolicy({ maxDepth: 8, maxDocumentBytes: 1024, maxStringBytes: 0 })),
      ["Galerina_DATA_JSON_STRING_LIMIT_INVALID"],
    );
    assert.deepEqual(
      codes(validateJsonMemoryPolicy({ maxDepth: 8, maxDocumentBytes: 1024 })),
      [],
    );
  });
});

describe("validateJsonDecodePlan — unknown mode never falls back", () => {
  it("accepts a bounded plan with a known mode", () => {
    assert.deepEqual(codes(validateJsonDecodePlan(goodPlan)), []);
  });

  it("rejects an unknown decode mode", () => {
    const diags = validateJsonDecodePlan({ ...goodPlan, mode: "yaml" });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_DECODE_MODE_UNKNOWN"]);
  });

  it("requires a plan name and propagates memory diagnostics", () => {
    const diags = validateJsonDecodePlan({
      name: "  ",
      mode: "stream",
      memory: { maxDepth: 0, maxDocumentBytes: 1024 },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_JSON_PLAN_NAME_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_JSON_DEPTH_LIMIT_REQUIRED"));
  });
});

describe("validateJsonSchemaContract — unknown kinds never pass silently", () => {
  const goodSchema = {
    name: "Event",
    root: "object",
    fields: [
      { name: "id", kind: "string", required: true },
      { name: "count", kind: "integer", required: false },
    ],
  };

  it("accepts a schema with known kinds", () => {
    assert.deepEqual(codes(validateJsonSchemaContract(goodSchema)), []);
  });

  it("rejects an unknown root kind", () => {
    const diags = validateJsonSchemaContract({ ...goodSchema, root: "tuple" });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_SCHEMA_KIND_UNKNOWN"]);
  });

  it("rejects an unknown field kind", () => {
    const diags = validateJsonSchemaContract({
      ...goodSchema,
      fields: [{ name: "blob", kind: "binary", required: true }],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_SCHEMA_KIND_UNKNOWN"]);
    assert.equal(diags[0].path, "fields.0.kind");
  });

  it("rejects duplicate and unnamed fields", () => {
    const diags = validateJsonSchemaContract({
      ...goodSchema,
      fields: [
        { name: "id", kind: "string", required: true },
        { name: "id", kind: "string", required: true },
        { name: " ", kind: "string", required: true },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_JSON_SCHEMA_FIELD_DUPLICATE"));
    assert.ok(codes(diags).includes("Galerina_DATA_JSON_SCHEMA_FIELD_NAME_REQUIRED"));
  });
});

describe("validateJsonExtractionPlan — partial means partial", () => {
  it("accepts pointer-scoped extraction", () => {
    const diags = validateJsonExtractionPlan({
      source: "events.jsonl",
      pointers: ["/payload/id", "/payload/kind"],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects an empty pointer list", () => {
    const diags = validateJsonExtractionPlan({ source: "events.jsonl", pointers: [] });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_EXTRACTION_POINTERS_REQUIRED"]);
  });

  it("rejects the whole-document pointer and malformed pointers", () => {
    const diags = validateJsonExtractionPlan({
      source: "events.jsonl",
      pointers: ["", "payload/id"],
    });
    assert.deepEqual(codes(diags), [
      "Galerina_DATA_JSON_POINTER_INVALID",
      "Galerina_DATA_JSON_POINTER_INVALID",
    ]);
  });

  it("requires a source", () => {
    const diags = validateJsonExtractionPlan({ source: "", pointers: ["/a"] });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_EXTRACTION_SOURCE_REQUIRED"]);
  });
});

describe("validateJsonRedactionPolicy — a PII claim with no fields is not silent", () => {
  it("accepts a policy that lists its fields", () => {
    const diags = validateJsonRedactionPolicy({
      name: "pii",
      containsPersonalData: true,
      redactFields: ["email", "phone"],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("warns when personal data is claimed but no fields are listed", () => {
    const diags = validateJsonRedactionPolicy({
      name: "pii",
      containsPersonalData: true,
      redactFields: [],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_REDACTION_FIELDS_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("does not warn when no personal data is claimed", () => {
    const diags = validateJsonRedactionPolicy({
      name: "public",
      containsPersonalData: false,
      redactFields: [],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects empty redaction field names", () => {
    const diags = validateJsonRedactionPolicy({
      name: "pii",
      containsPersonalData: true,
      redactFields: ["  "],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_JSON_REDACTION_FIELD_NAME_REQUIRED"]);
  });
});

describe("createJsonArchiveReport — archives carry their own diagnostics", () => {
  it("builds a clean report when redaction is declared", () => {
    const report = createJsonArchiveReport({
      archive: "app.events",
      plan: goodPlan,
      redaction: { name: "pii", containsPersonalData: true, redactFields: ["email"] },
      documentCount: 10,
      redactedFieldCount: 10,
    });
    assert.equal(report.archive, "app.events");
    assert.equal(report.mode, "json_lines");
    assert.equal(report.redactionDeclared, true);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
  });

  it("warns when no redaction policy is declared", () => {
    const report = createJsonArchiveReport({
      archive: "app.events",
      plan: goodPlan,
      documentCount: 1,
      redactedFieldCount: 0,
    });
    assert.equal(report.redactionDeclared, false);
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_DATA_JSON_ARCHIVE_REDACTION_UNDECLARED",
    ]);
    assert.equal(report.warnings.length, 1);
  });

  it("rejects negative or non-integer counts and a missing archive name", () => {
    const report = createJsonArchiveReport({
      archive: " ",
      plan: goodPlan,
      redaction: { name: "pii", containsPersonalData: false, redactFields: [] },
      documentCount: -1,
      redactedFieldCount: 0.5,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_JSON_ARCHIVE_NAME_REQUIRED"));
    assert.equal(
      codes(report.diagnostics).filter((c) => c === "Galerina_DATA_JSON_COUNT_INVALID").length,
      2,
    );
  });
});
