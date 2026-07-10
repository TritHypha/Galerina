import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_DATA_REPORT_KINDS,
  createDataReportEnvelope,
  deriveDataReportStatus,
  validateDataReportEnvelope,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const errorDiag = {
  code: "Galerina_DATA_PIPELINE_TIMEOUT_REQUIRED",
  severity: "error",
  message: "timeout missing",
};
const warningDiag = {
  code: "Galerina_DATA_JSON_ARCHIVE_REDACTION_UNDECLARED",
  severity: "warning",
  message: "no redaction declared",
};

const cleanEnvelope = {
  kind: "app.pipeline-report.json",
  producer: "@galerina/data-pipeline",
  generatedAt: "2026-07-10T12:00:00Z",
  status: "success",
  diagnostics: [],
  counts: { processed: 100, failed: 0 },
};

describe("status vocabulary — derived, not asserted", () => {
  it("derives failed from any error diagnostic", () => {
    assert.equal(deriveDataReportStatus([warningDiag, errorDiag]), "failed");
  });

  it("derives partial from warnings only", () => {
    assert.equal(deriveDataReportStatus([warningDiag]), "partial");
  });

  it("derives success from an empty diagnostic list", () => {
    assert.equal(deriveDataReportStatus([]), "success");
  });
});

describe("validateDataReportEnvelope — the family invariant", () => {
  it("accepts a clean success envelope", () => {
    assert.deepEqual(codes(validateDataReportEnvelope(cleanEnvelope)), []);
  });

  it("REJECTS a report claiming success with error diagnostics present", () => {
    const diags = validateDataReportEnvelope({
      ...cleanEnvelope,
      status: "success",
      diagnostics: [errorDiag],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_REPORTS_STATUS_CONTRADICTION"]);
    assert.equal(diags[0].severity, "error");
  });

  it("accepts failed-with-errors and partial-with-warnings", () => {
    assert.deepEqual(
      codes(validateDataReportEnvelope({
        ...cleanEnvelope,
        status: "failed",
        diagnostics: [errorDiag],
      })),
      [],
    );
    assert.deepEqual(
      codes(validateDataReportEnvelope({
        ...cleanEnvelope,
        status: "partial",
        diagnostics: [warningDiag],
      })),
      [],
    );
  });

  it("warns on an unexplained failure claim", () => {
    const diags = validateDataReportEnvelope({ ...cleanEnvelope, status: "failed" });
    assert.deepEqual(codes(diags), ["Galerina_DATA_REPORTS_FAILURE_UNEXPLAINED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects an unknown kind, status and severity", () => {
    const diags = validateDataReportEnvelope({
      ...cleanEnvelope,
      kind: "app.mystery-report.json",
      status: "mostly_fine",
      diagnostics: [{ code: "X", severity: "info", message: "m" }],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_KIND_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_STATUS_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_SEVERITY_UNKNOWN"));
  });

  it("rejects blank producers, bad timestamps, empty carried codes and bad counts", () => {
    const diags = validateDataReportEnvelope({
      ...cleanEnvelope,
      producer: " ",
      generatedAt: "not-a-date",
      diagnostics: [{ code: "", severity: "warning", message: "m" }],
      counts: { processed: -1 },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_PRODUCER_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_TIMESTAMP_INVALID"));
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_DIAGNOSTIC_CODE_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_REPORTS_COUNT_INVALID"));
  });
});

describe("createDataReportEnvelope — the builder cannot lie", () => {
  it("derives failed status when errors are carried", () => {
    const envelope = createDataReportEnvelope({
      kind: "app.archive-integrity-report.json",
      producer: "@galerina/data-archive",
      diagnostics: [errorDiag],
      counts: { verified: 3, failed: 1 },
    });
    assert.equal(envelope.status, "failed");
    assert.deepEqual(codes(validateDataReportEnvelope(envelope)), []);
  });

  it("derives success for a clean run and validates round-trip", () => {
    const envelope = createDataReportEnvelope({
      kind: "app.search-index-report.json",
      producer: "@galerina/data-search",
    });
    assert.equal(envelope.status, "success");
    assert.deepEqual(envelope.counts, {});
    assert.deepEqual(codes(validateDataReportEnvelope(envelope)), []);
  });

  it("covers every kind named in the README", () => {
    assert.equal(KNOWN_DATA_REPORT_KINDS.length, 8);
    for (const kind of KNOWN_DATA_REPORT_KINDS) {
      const envelope = createDataReportEnvelope({ kind, producer: "@galerina/data" });
      assert.deepEqual(codes(validateDataReportEnvelope(envelope)), [], kind);
    }
  });
});
