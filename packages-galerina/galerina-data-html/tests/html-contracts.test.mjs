import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createHtmlProcessingReport,
  validateHtmlExtractionPlan,
  validateHtmlParsePlan,
  validateHtmlRenderPlan,
  validateHtmlSanitizePolicy,
  validateHtmlSearchDocumentPlan,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const safePolicy = {
  name: "article",
  allowedTags: ["p", "a", "em", "strong"],
  allowedAttributes: ["href", "title"],
};

describe("validateHtmlParsePlan — bounded parse only", () => {
  it("accepts a bounded plan", () => {
    const diags = validateHtmlParsePlan({
      name: "page",
      mode: "document",
      maxInputBytes: 2 * 1024 * 1024,
      maxNodeCount: 50_000,
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects a missing byte bound and unknown mode", () => {
    const diags = validateHtmlParsePlan({ name: "page", mode: "quirks", maxInputBytes: 0 });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_HTML_INPUT_LIMIT_REQUIRED",
      "Galerina_DATA_HTML_PARSE_MODE_UNKNOWN",
    ]);
  });

  it("rejects an invalid optional node bound", () => {
    const diags = validateHtmlParsePlan({
      name: "page",
      mode: "fragment",
      maxInputBytes: 1024,
      maxNodeCount: -1,
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_HTML_NODE_LIMIT_INVALID"]);
  });
});

describe("validateHtmlSanitizePolicy — deny-by-default allowlist", () => {
  it("accepts a safe allowlist", () => {
    assert.deepEqual(codes(validateHtmlSanitizePolicy(safePolicy)), []);
  });

  it("warns (not errors) on an empty allowlist: valid but renders nothing", () => {
    const diags = validateHtmlSanitizePolicy({
      name: "blank",
      allowedTags: [],
      allowedAttributes: [],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_HTML_ALLOWLIST_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects script in the tag allowlist", () => {
    const diags = validateHtmlSanitizePolicy({
      ...safePolicy,
      allowedTags: ["p", "Script"],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_HTML_UNSAFE_TAG_FORBIDDEN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("rejects other executable tags (iframe, object, embed, base)", () => {
    const diags = validateHtmlSanitizePolicy({
      ...safePolicy,
      allowedTags: ["iframe", "object", "embed", "base"],
    });
    assert.equal(
      codes(diags).filter((c) => c === "Galerina_DATA_HTML_UNSAFE_TAG_FORBIDDEN").length,
      4,
    );
  });

  it("rejects event-handler attributes in the allowlist", () => {
    const diags = validateHtmlSanitizePolicy({
      ...safePolicy,
      allowedAttributes: ["href", "onclick", "ONLOAD"],
    });
    assert.equal(
      codes(diags).filter((c) => c === "Galerina_DATA_HTML_EVENT_HANDLER_FORBIDDEN").length,
      2,
    );
  });

  it("rejects empty tag and attribute names", () => {
    const diags = validateHtmlSanitizePolicy({
      name: "x",
      allowedTags: [" "],
      allowedAttributes: [""],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_HTML_TAG_NAME_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_HTML_ATTRIBUTE_NAME_REQUIRED"));
  });
});

describe("validateHtmlRenderPlan — safe render carries its sanitize policy", () => {
  it("accepts a named plan with a safe policy", () => {
    const diags = validateHtmlRenderPlan({ name: "article-view", sanitize: safePolicy });
    assert.deepEqual(codes(diags), []);
  });

  it("propagates sanitize policy errors", () => {
    const diags = validateHtmlRenderPlan({
      name: "article-view",
      sanitize: { ...safePolicy, allowedTags: ["script"] },
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_HTML_UNSAFE_TAG_FORBIDDEN"]);
  });
});

describe("validateHtmlExtractionPlan — known targets only", () => {
  it("accepts links/text/metadata extraction", () => {
    const diags = validateHtmlExtractionPlan({
      source: "page.html",
      targets: ["links", "text", "metadata"],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects an empty target list and unknown targets", () => {
    assert.deepEqual(codes(validateHtmlExtractionPlan({ source: "p", targets: [] })), [
      "Galerina_DATA_HTML_EXTRACTION_TARGETS_REQUIRED",
    ]);
    assert.deepEqual(
      codes(validateHtmlExtractionPlan({ source: "p", targets: ["scripts"] })),
      ["Galerina_DATA_HTML_EXTRACTION_TARGET_UNKNOWN"],
    );
  });
});

describe("validateHtmlSearchDocumentPlan — addressable and non-empty", () => {
  it("accepts an id plus fields", () => {
    const diags = validateHtmlSearchDocumentPlan({
      documentId: "doc-1",
      source: "page.html",
      fields: [{ name: "body", from: "text" }],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects a missing id and empty field list", () => {
    const diags = validateHtmlSearchDocumentPlan({
      documentId: " ",
      source: "page.html",
      fields: [],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_HTML_SEARCH_DOCUMENT_ID_REQUIRED",
      "Galerina_DATA_HTML_SEARCH_FIELDS_REQUIRED",
    ]);
  });

  it("rejects an unknown field source", () => {
    const diags = validateHtmlSearchDocumentPlan({
      documentId: "doc-1",
      source: "page.html",
      fields: [{ name: "body", from: "raw_html" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_HTML_SEARCH_FIELD_SOURCE_UNKNOWN"]);
  });
});

describe("createHtmlProcessingReport — unsafe content is removed or escaped, never kept", () => {
  it("builds a clean report and totals the findings", () => {
    const report = createHtmlProcessingReport({
      source: "page.html",
      policy: safePolicy,
      unsafeFindings: [
        { kind: "element", name: "script", action: "removed", count: 2 },
        { kind: "attribute", name: "onclick", action: "escaped", count: 3 },
      ],
    });
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.unsafeTotal, 5);
    assert.equal(report.policy, "article");
  });

  it("rejects a finding whose action is not a safe disposition", () => {
    const report = createHtmlProcessingReport({
      source: "page.html",
      policy: safePolicy,
      unsafeFindings: [{ kind: "element", name: "script", action: "kept", count: 1 }],
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_HTML_UNSAFE_ACTION_INVALID"));
  });

  it("rejects unknown finding kinds and bad counts, and requires a source", () => {
    const report = createHtmlProcessingReport({
      source: "",
      policy: safePolicy,
      unsafeFindings: [{ kind: "comment", name: "x", action: "removed", count: -1 }],
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_HTML_SOURCE_REQUIRED"));
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_HTML_UNSAFE_KIND_UNKNOWN"));
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_HTML_COUNT_INVALID"));
  });

  it("carries the empty-allowlist warning through to report warnings", () => {
    const report = createHtmlProcessingReport({
      source: "page.html",
      policy: { name: "blank", allowedTags: [], allowedAttributes: [] },
    });
    assert.deepEqual(codes(report.diagnostics), ["Galerina_DATA_HTML_ALLOWLIST_EMPTY"]);
    assert.equal(report.warnings.length, 1);
  });
});
