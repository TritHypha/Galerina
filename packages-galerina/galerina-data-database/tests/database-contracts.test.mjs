import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDatabaseExportReport,
  createDatabaseRestoreReport,
  validateDatabaseChecksum,
  validateDatabaseExport,
  validateDatabaseSnapshot,
  validateTableExport,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const checksum = { algorithm: "sha256", digestHex: "f".repeat(64) };

const snapshot = {
  snapshotId: "snap-2026-07-10",
  createdAt: "2026-07-10T00:00:00Z",
  schema: { version: "42" },
  checksum,
};

const usersTable = {
  table: "users",
  rowCount: 100,
  checksum,
  containsPersonalData: true,
  redactionPolicyRef: "pii-default",
  classificationRef: "users-classification",
};

const goodExport = {
  exportName: "nightly",
  snapshot,
  tables: [usersTable],
  restoreValidationRef: "restore-check-1",
};

describe("validateDatabaseChecksum — known algorithms only", () => {
  it("accepts a known algorithm with a right-sized digest", () => {
    assert.deepEqual(codes(validateDatabaseChecksum(checksum)), []);
  });

  it("rejects md5 and other unknown algorithms", () => {
    for (const algorithm of ["md5", "sha1", "adler32"]) {
      assert.deepEqual(
        codes(validateDatabaseChecksum({ algorithm, digestHex: "f".repeat(64) })),
        ["Galerina_DATA_DATABASE_CHECKSUM_ALGORITHM_UNKNOWN"],
      );
    }
  });

  it("rejects malformed digests", () => {
    assert.deepEqual(
      codes(validateDatabaseChecksum({ algorithm: "sha512", digestHex: "f".repeat(64) })),
      ["Galerina_DATA_DATABASE_DIGEST_INVALID"],
    );
  });
});

describe("validateDatabaseSnapshot — id, timestamp, schema version, checksum", () => {
  it("accepts a complete snapshot", () => {
    assert.deepEqual(codes(validateDatabaseSnapshot(snapshot)), []);
  });

  it("requires a schema version for restore validation", () => {
    const diags = validateDatabaseSnapshot({ ...snapshot, schema: { version: " " } });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DATABASE_SCHEMA_VERSION_REQUIRED"]);
  });

  it("rejects a blank id and an unparseable timestamp", () => {
    const diags = validateDatabaseSnapshot({ ...snapshot, snapshotId: "", createdAt: "recently" });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_DATABASE_SNAPSHOT_ID_REQUIRED",
      "Galerina_DATA_DATABASE_TIMESTAMP_INVALID",
    ]);
  });
});

describe("validateTableExport — redaction and classification hooks", () => {
  it("accepts a PII table with a redaction hook", () => {
    assert.deepEqual(codes(validateTableExport(usersTable)), []);
  });

  it("ERRORS on a PII table with no redaction hook", () => {
    const { redactionPolicyRef, ...noHook } = usersTable;
    const diags = validateTableExport(noHook);
    assert.deepEqual(codes(diags), ["Galerina_DATA_DATABASE_REDACTION_HOOK_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("warns when no classification reference is declared", () => {
    const { classificationRef, ...unclassified } = usersTable;
    const diags = validateTableExport(unclassified);
    assert.deepEqual(codes(diags), ["Galerina_DATA_DATABASE_CLASSIFICATION_UNDECLARED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects a negative row count and a blank table name", () => {
    const diags = validateTableExport({ ...usersTable, table: "", rowCount: -5 });
    assert.ok(codes(diags).includes("Galerina_DATA_DATABASE_TABLE_NAME_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_DATABASE_ROW_COUNT_INVALID"));
  });
});

describe("validateDatabaseExport — named, deduplicated, hook-checked", () => {
  it("accepts a complete export", () => {
    assert.deepEqual(codes(validateDatabaseExport(goodExport)), []);
  });

  it("warns on an empty export and rejects duplicate tables", () => {
    assert.deepEqual(codes(validateDatabaseExport({ ...goodExport, tables: [] })), [
      "Galerina_DATA_DATABASE_EXPORT_EMPTY",
    ]);
    const dup = validateDatabaseExport({ ...goodExport, tables: [usersTable, usersTable] });
    assert.ok(codes(dup).includes("Galerina_DATA_DATABASE_TABLE_DUPLICATE"));
  });

  it("rejects a blank restoreValidationRef when present", () => {
    const diags = validateDatabaseExport({ ...goodExport, restoreValidationRef: " " });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DATABASE_REF_INVALID"]);
  });
});

describe("createDatabaseExportReport — counts plus derived verification", () => {
  it("derives verified when every table checksum verified", () => {
    const report = createDatabaseExportReport({
      export: goodExport,
      checksumVerifiedCount: 1,
      checksumFailedCount: 0,
    });
    assert.equal(report.verification, "verified");
    assert.equal(report.tableCount, 1);
    assert.equal(report.totalRowCount, 100);
    assert.deepEqual(report.diagnostics, []);
  });

  it("derives failed on any checksum failure", () => {
    const report = createDatabaseExportReport({
      export: goodExport,
      checksumVerifiedCount: 0,
      checksumFailedCount: 1,
    });
    assert.equal(report.verification, "failed");
  });

  it("derives not_verified with a warning when checksums were skipped", () => {
    const report = createDatabaseExportReport({
      export: goodExport,
      checksumVerifiedCount: 0,
      checksumFailedCount: 0,
    });
    assert.equal(report.verification, "not_verified");
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_DATABASE_UNVERIFIED"));
  });

  it("rejects verification counts that exceed the table count", () => {
    const report = createDatabaseExportReport({
      export: goodExport,
      checksumVerifiedCount: 2,
      checksumFailedCount: 1,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_DATABASE_COUNTS_INCONSISTENT"));
  });
});

describe("createDatabaseRestoreReport — schema, rows and checksums must all agree", () => {
  const cleanRestore = {
    exportName: "nightly",
    tableCount: 2,
    verifiedTableCount: 2,
    failedTableCount: 0,
    expectedRowCount: 150,
    restoredRowCount: 150,
    schemaVersionMatched: true,
  };

  it("derives verified for a fully-checked restore", () => {
    const report = createDatabaseRestoreReport(cleanRestore);
    assert.equal(report.verification, "verified");
    assert.deepEqual(report.diagnostics, []);
  });

  it("derives failed and errors on a schema version mismatch", () => {
    const report = createDatabaseRestoreReport({ ...cleanRestore, schemaVersionMatched: false });
    assert.equal(report.verification, "failed");
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_DATABASE_SCHEMA_VERSION_MISMATCH"));
  });

  it("derives failed and errors on a row count mismatch", () => {
    const report = createDatabaseRestoreReport({ ...cleanRestore, restoredRowCount: 149 });
    assert.equal(report.verification, "failed");
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_DATABASE_ROW_COUNT_MISMATCH"));
  });

  it("derives not_verified with a warning when tables were skipped", () => {
    const report = createDatabaseRestoreReport({ ...cleanRestore, verifiedTableCount: 1 });
    assert.equal(report.verification, "not_verified");
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_DATABASE_UNVERIFIED"));
  });

  it("rejects invalid and inconsistent counts", () => {
    const bad = createDatabaseRestoreReport({ ...cleanRestore, tableCount: -1 });
    assert.ok(codes(bad.diagnostics).includes("Galerina_DATA_DATABASE_COUNT_INVALID"));

    const inconsistent = createDatabaseRestoreReport({
      ...cleanRestore,
      verifiedTableCount: 2,
      failedTableCount: 1,
    });
    assert.ok(codes(inconsistent.diagnostics).includes("Galerina_DATA_DATABASE_COUNTS_INCONSISTENT"));
  });
});
