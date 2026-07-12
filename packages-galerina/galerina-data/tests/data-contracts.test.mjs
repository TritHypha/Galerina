import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DATA_FAMILY_PACKAGES,
  createDataFamilyReportIndex,
  validateArchiveIntegrityRef,
  validateDataBoundaryDeclaration,
  validateDataFamilyReportEntry,
  validateDataMemoryLimits,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const entryFor = (producer, overrides = {}) => ({
  kind: "app.data-processing-report.json",
  producer,
  status: "success",
  errorCount: 0,
  warningCount: 0,
  ...overrides,
});

const fullCoverage = DATA_FAMILY_PACKAGES.map((producer) => entryFor(producer));

describe("family vocabulary — the coordinated package list", () => {
  it("names exactly the seven packages from the README", () => {
    assert.deepEqual([...DATA_FAMILY_PACKAGES].sort(), [
      "@galerina/data-archive",
      "@galerina/data-database",
      "@galerina/data-html",
      "@galerina/data-json",
      "@galerina/data-pipeline",
      "@galerina/data-reports",
      "@galerina/data-search",
    ]);
  });
});

describe("validateDataMemoryLimits — family-wide bounded processing", () => {
  it("accepts positive bounds", () => {
    assert.deepEqual(
      codes(validateDataMemoryLimits({
        maxDocumentBytes: 16 * 1024 * 1024,
        maxBufferBytes: 4 * 1024 * 1024,
        maxConcurrentStreams: 8,
      })),
      [],
    );
  });

  it("rejects missing or non-positive bounds", () => {
    const diags = validateDataMemoryLimits({
      maxDocumentBytes: 0,
      maxBufferBytes: -1,
      maxConcurrentStreams: Number.NaN,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_MEMORY_LIMIT_REQUIRED",
      "Galerina_DATA_MEMORY_LIMIT_REQUIRED",
      "Galerina_DATA_STREAM_LIMIT_REQUIRED",
    ]);
  });
});

describe("validateDataBoundaryDeclaration — boundaries fail closed, owned in-family", () => {
  const goodBoundary = {
    boundary: "sanitize",
    ownerPackage: "@galerina/data-html",
    failClosed: true,
  };

  it("accepts a known boundary owned by a family package", () => {
    assert.deepEqual(codes(validateDataBoundaryDeclaration(goodBoundary)), []);
  });

  it("rejects an unknown boundary and an out-of-family owner", () => {
    const diags = validateDataBoundaryDeclaration({
      boundary: "scrape",
      ownerPackage: "@somebody/else",
      failClosed: true,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_BOUNDARY_UNKNOWN",
      "Galerina_DATA_OWNER_UNKNOWN",
    ]);
  });

  it("fails closed when an untyped caller passes failClosed: false", () => {
    const diags = validateDataBoundaryDeclaration({ ...goodBoundary, failClosed: false });
    assert.deepEqual(codes(diags), ["Galerina_DATA_FAIL_CLOSED_REQUIRED"]);
  });
});

describe("validateArchiveIntegrityRef — pinned kind, known algorithm", () => {
  const goodRef = {
    archive: "app.backup",
    checksumAlgorithm: "sha256",
    reportKind: "app.archive-integrity-report.json",
  };

  it("accepts a well-formed reference", () => {
    assert.deepEqual(codes(validateArchiveIntegrityRef(goodRef)), []);
  });

  it("rejects unknown algorithms and the wrong report kind", () => {
    const diags = validateArchiveIntegrityRef({
      archive: "",
      checksumAlgorithm: "md5",
      reportKind: "app.archive-report.json",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_ARCHIVE_NAME_REQUIRED",
      "Galerina_DATA_ARCHIVE_REPORT_KIND_INVALID",
      "Galerina_DATA_CHECKSUM_ALGORITHM_UNKNOWN",
    ]);
  });
});

describe("validateDataFamilyReportEntry — status must agree with the counts", () => {
  it("accepts an honest success entry", () => {
    assert.deepEqual(codes(validateDataFamilyReportEntry(entryFor("@galerina/data-json"))), []);
  });

  it("REJECTS success claimed over a non-zero error count", () => {
    const diags = validateDataFamilyReportEntry(
      entryFor("@galerina/data-json", { status: "success", errorCount: 2 }),
    );
    assert.deepEqual(codes(diags), ["Galerina_DATA_STATUS_CONTRADICTION"]);
    assert.equal(diags[0].severity, "error");
  });

  it("warns on unexplained failure and unknown producers", () => {
    const diags = validateDataFamilyReportEntry(
      entryFor("@vendor/foreign", { status: "failed", errorCount: 0 }),
    );
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_FAILURE_UNEXPLAINED",
      "Galerina_DATA_PRODUCER_UNKNOWN",
    ]);
    assert.ok(diags.every((d) => d.severity === "warning"));
  });

  it("rejects malformed kinds, unknown statuses and bad counts", () => {
    const diags = validateDataFamilyReportEntry({
      kind: "report.txt",
      producer: "@galerina/data-json",
      status: "greenish",
      errorCount: -1,
      warningCount: 0.5,
    });
    assert.ok(codes(diags).includes("Galerina_DATA_REPORT_KIND_INVALID"));
    assert.ok(codes(diags).includes("Galerina_DATA_REPORT_STATUS_UNKNOWN"));
    assert.equal(
      codes(diags).filter((c) => c === "Galerina_DATA_REPORT_COUNT_INVALID").length,
      2,
    );
  });
});

describe("createDataFamilyReportIndex — the family-wide aggregator", () => {
  it("reports success only on a full, clean sweep", () => {
    const index = createDataFamilyReportIndex({
      entries: fullCoverage,
      generatedAt: "2026-07-10T12:00:00Z",
    });
    assert.equal(index.overallStatus, "success");
    assert.deepEqual(index.missingProducers, []);
    assert.deepEqual(index.diagnostics, []);
  });

  it("caps the family at partial when a package reported nothing", () => {
    const index = createDataFamilyReportIndex({
      entries: fullCoverage.slice(1),
      generatedAt: "2026-07-10T12:00:00Z",
    });
    assert.equal(index.overallStatus, "partial");
    assert.deepEqual(index.missingProducers, ["@galerina/data-html"]);
    assert.ok(codes(index.diagnostics).includes("Galerina_DATA_REPORT_COVERAGE_GAP"));
  });

  it("fails the family on any failed entry", () => {
    const entries = [
      ...fullCoverage.slice(1),
      entryFor("@galerina/data-html", { status: "failed", errorCount: 3 }),
    ];
    const index = createDataFamilyReportIndex({
      entries,
      generatedAt: "2026-07-10T12:00:00Z",
    });
    assert.equal(index.overallStatus, "failed");
  });

  it("fails the family when any entry is itself contradictory", () => {
    const entries = [
      ...fullCoverage.slice(1),
      entryFor("@galerina/data-html", { status: "success", errorCount: 1 }),
    ];
    const index = createDataFamilyReportIndex({
      entries,
      generatedAt: "2026-07-10T12:00:00Z",
    });
    assert.equal(index.overallStatus, "failed");
    assert.ok(codes(index.diagnostics).includes("Galerina_DATA_STATUS_CONTRADICTION"));
  });

  it("rejects duplicate producer+kind entries", () => {
    const index = createDataFamilyReportIndex({
      entries: [...fullCoverage, entryFor("@galerina/data-json")],
      generatedAt: "2026-07-10T12:00:00Z",
    });
    assert.ok(codes(index.diagnostics).includes("Galerina_DATA_REPORT_DUPLICATE"));
    assert.equal(index.overallStatus, "failed");
  });

  it("derives partial from partial entries even at full coverage", () => {
    const entries = [
      ...fullCoverage.slice(1),
      entryFor("@galerina/data-html", { status: "partial", warningCount: 2 }),
    ];
    const index = createDataFamilyReportIndex({
      entries,
      generatedAt: "2026-07-10T12:00:00Z",
    });
    assert.equal(index.overallStatus, "partial");
    assert.deepEqual(index.missingProducers, []);
  });
});
