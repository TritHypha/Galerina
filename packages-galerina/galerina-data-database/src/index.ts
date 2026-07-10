// Database export, snapshot, schema-version, row-count/checksum and restore
// validation contracts. Not an ORM, migration tool or database engine.
//
// Integrity rules: every export names a checksum algorithm from a known set
// (broken hashes are not in it), a table export that contains personal data
// must declare its redaction hook before it may leave the database, and the
// export/restore reports carry counts plus a verification status that is
// DERIVED from those counts — never asserted by the caller.

export type DatabaseChecksumAlgorithm = "sha256" | "sha384" | "sha512" | "blake3";

export interface DatabaseChecksum {
  readonly algorithm: DatabaseChecksumAlgorithm;
  readonly digestHex: string;
}

export interface SchemaVersionMetadata {
  readonly version: string;
  readonly migrationId?: string;
}

export interface DatabaseSnapshotMetadata {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly schema: SchemaVersionMetadata;
  readonly checksum: DatabaseChecksum;
}

export interface TableExportContract {
  readonly table: string;
  readonly rowCount: number;
  readonly checksum: DatabaseChecksum;
  readonly containsPersonalData: boolean;
  readonly redactionPolicyRef?: string;
  readonly classificationRef?: string;
}

export interface DatabaseExportContract {
  readonly exportName: string;
  readonly snapshot: DatabaseSnapshotMetadata;
  readonly tables: readonly TableExportContract[];
  readonly restoreValidationRef?: string;
}

export type DatabaseVerificationStatus = "verified" | "failed" | "not_verified";

export interface DatabaseExportReport {
  readonly exportName: string;
  readonly tableCount: number;
  readonly totalRowCount: number;
  readonly checksumVerifiedCount: number;
  readonly checksumFailedCount: number;
  readonly verification: DatabaseVerificationStatus;
  readonly diagnostics: readonly DatabaseDiagnostic[];
  readonly warnings: readonly string[];
}

export interface DatabaseRestoreValidationReport {
  readonly exportName: string;
  readonly tableCount: number;
  readonly verifiedTableCount: number;
  readonly failedTableCount: number;
  readonly expectedRowCount: number;
  readonly restoredRowCount: number;
  readonly schemaVersionMatched: boolean;
  readonly verification: DatabaseVerificationStatus;
  readonly diagnostics: readonly DatabaseDiagnostic[];
  readonly warnings: readonly string[];
}

export type DatabaseDiagnosticSeverity = "warning" | "error";

export interface DatabaseDiagnostic {
  readonly code: string;
  readonly severity: DatabaseDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// md5/sha1 deliberately absent: integrity claims need collision resistance.
const DIGEST_HEX_LENGTH: Readonly<Record<DatabaseChecksumAlgorithm, number>> = {
  sha256: 64,
  sha384: 96,
  sha512: 128,
  blake3: 64,
};

const HEX_PATTERN = /^[0-9a-f]+$/;

function databaseDiagnostic(
  code: string,
  severity: DatabaseDiagnosticSeverity,
  message: string,
  path?: string,
): DatabaseDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateDatabaseChecksum(
  checksum: DatabaseChecksum,
  path = "checksum",
): readonly DatabaseDiagnostic[] {
  const diagnostics: DatabaseDiagnostic[] = [];

  const expectedLength = (DIGEST_HEX_LENGTH as Record<string, number | undefined>)[
    checksum.algorithm
  ];
  if (expectedLength === undefined) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_CHECKSUM_ALGORITHM_UNKNOWN",
      "error",
      `Checksum algorithm "${String(checksum.algorithm)}" is not in the known set.`,
      `${path}.algorithm`,
    ));
    return diagnostics;
  }

  const digest = checksum.digestHex.toLowerCase();
  if (digest.length !== expectedLength || !HEX_PATTERN.test(digest)) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_DIGEST_INVALID",
      "error",
      `Checksum digest must be ${expectedLength} lowercase hex characters for ${checksum.algorithm}.`,
      `${path}.digestHex`,
    ));
  }

  return diagnostics;
}

export function validateDatabaseSnapshot(
  snapshot: DatabaseSnapshotMetadata,
  path = "snapshot",
): readonly DatabaseDiagnostic[] {
  const diagnostics: DatabaseDiagnostic[] = [];

  if (snapshot.snapshotId.trim().length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_SNAPSHOT_ID_REQUIRED",
      "error",
      "Database snapshot requires a snapshot id.",
      `${path}.snapshotId`,
    ));
  }

  if (Number.isNaN(Date.parse(snapshot.createdAt))) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_TIMESTAMP_INVALID",
      "error",
      "Database snapshot createdAt must be a parseable timestamp.",
      `${path}.createdAt`,
    ));
  }

  // A snapshot without a schema version cannot be restore-validated: there
  // is nothing to compare the target schema against.
  if (snapshot.schema.version.trim().length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_SCHEMA_VERSION_REQUIRED",
      "error",
      "Database snapshot requires a schema version.",
      `${path}.schema.version`,
    ));
  }

  diagnostics.push(...validateDatabaseChecksum(snapshot.checksum, `${path}.checksum`));

  return diagnostics;
}

export function validateTableExport(
  table: TableExportContract,
  path = "table",
): readonly DatabaseDiagnostic[] {
  const diagnostics: DatabaseDiagnostic[] = [];

  if (table.table.trim().length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_TABLE_NAME_REQUIRED",
      "error",
      "Table export requires a table name.",
      `${path}.table`,
    ));
  }

  if (!isNonNegativeSafeInteger(table.rowCount)) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_ROW_COUNT_INVALID",
      "error",
      "Table export rowCount must be a non-negative integer.",
      `${path}.rowCount`,
    ));
  }

  diagnostics.push(...validateDatabaseChecksum(table.checksum, `${path}.checksum`));

  // Redaction hook: personal data may not leave the database without a
  // declared redaction policy. Error, not warning — this is the boundary
  // where an unredacted export becomes a breach.
  if (
    table.containsPersonalData &&
    (table.redactionPolicyRef === undefined || table.redactionPolicyRef.trim().length === 0)
  ) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_REDACTION_HOOK_REQUIRED",
      "error",
      `Table "${table.table}" contains personal data but declares no redaction policy reference.`,
      `${path}.redactionPolicyRef`,
    ));
  }

  if (
    table.redactionPolicyRef !== undefined &&
    table.redactionPolicyRef.trim().length === 0 &&
    !table.containsPersonalData
  ) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_REF_INVALID",
      "error",
      "Table redactionPolicyRef, when set, must be non-empty.",
      `${path}.redactionPolicyRef`,
    ));
  }

  // Classification hook: absent classification is visible, not fatal — the
  // export may be of non-sensitive operational data, but a reviewer must be
  // able to see that nobody classified it.
  if (table.classificationRef === undefined) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_CLASSIFICATION_UNDECLARED",
      "warning",
      `Table "${table.table}" declares no classification reference.`,
      `${path}.classificationRef`,
    ));
  } else if (table.classificationRef.trim().length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_REF_INVALID",
      "error",
      "Table classificationRef, when set, must be non-empty.",
      `${path}.classificationRef`,
    ));
  }

  return diagnostics;
}

export function validateDatabaseExport(
  contract: DatabaseExportContract,
): readonly DatabaseDiagnostic[] {
  const diagnostics: DatabaseDiagnostic[] = [];

  if (contract.exportName.trim().length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_EXPORT_NAME_REQUIRED",
      "error",
      "Database export requires a name.",
      "exportName",
    ));
  }

  diagnostics.push(...validateDatabaseSnapshot(contract.snapshot));

  if (contract.tables.length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_EXPORT_EMPTY",
      "warning",
      "Database export contains no tables; the export is valid but empty.",
      "tables",
    ));
  }

  const seen = new Set<string>();
  contract.tables.forEach((table, index) => {
    diagnostics.push(...validateTableExport(table, `tables.${index}`));
    if (seen.has(table.table)) {
      diagnostics.push(databaseDiagnostic(
        "Galerina_DATA_DATABASE_TABLE_DUPLICATE",
        "error",
        `Table "${table.table}" appears more than once in the export.`,
        `tables.${index}.table`,
      ));
    }
    seen.add(table.table);
  });

  if (
    contract.restoreValidationRef !== undefined &&
    contract.restoreValidationRef.trim().length === 0
  ) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_REF_INVALID",
      "error",
      "Export restoreValidationRef, when set, must be non-empty.",
      "restoreValidationRef",
    ));
  }

  return diagnostics;
}

function validateCount(
  value: number,
  path: string,
  diagnostics: DatabaseDiagnostic[],
): boolean {
  if (!isNonNegativeSafeInteger(value)) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_COUNT_INVALID",
      "error",
      `Report ${path} must be a non-negative integer.`,
      path,
    ));
    return false;
  }
  return true;
}

// Export report: row counts + checksum verification counts, with derived
// verification status.
export function createDatabaseExportReport(input: {
  readonly export: DatabaseExportContract;
  readonly checksumVerifiedCount: number;
  readonly checksumFailedCount: number;
}): DatabaseExportReport {
  const diagnostics: DatabaseDiagnostic[] = [...validateDatabaseExport(input.export)];

  const tableCount = input.export.tables.length;
  const totalRowCount = input.export.tables.reduce(
    (sum, table) =>
      sum + (isNonNegativeSafeInteger(table.rowCount) ? table.rowCount : 0),
    0,
  );

  const countsValid =
    validateCount(input.checksumVerifiedCount, "checksumVerifiedCount", diagnostics) &&
    validateCount(input.checksumFailedCount, "checksumFailedCount", diagnostics);

  let verification: DatabaseVerificationStatus = "not_verified";
  if (countsValid) {
    if (input.checksumVerifiedCount + input.checksumFailedCount > tableCount) {
      diagnostics.push(databaseDiagnostic(
        "Galerina_DATA_DATABASE_COUNTS_INCONSISTENT",
        "error",
        "checksumVerifiedCount + checksumFailedCount exceeds the table count.",
        "checksumVerifiedCount",
      ));
    } else if (input.checksumFailedCount > 0) {
      verification = "failed";
    } else if (tableCount > 0 && input.checksumVerifiedCount === tableCount) {
      verification = "verified";
    } else {
      verification = "not_verified";
      if (tableCount > 0) {
        diagnostics.push(databaseDiagnostic(
          "Galerina_DATA_DATABASE_UNVERIFIED",
          "warning",
          `${tableCount - input.checksumVerifiedCount} of ${tableCount} table checksums were not verified.`,
          "checksumVerifiedCount",
        ));
      }
    }
  }

  return {
    exportName: input.export.exportName,
    tableCount,
    totalRowCount,
    checksumVerifiedCount: input.checksumVerifiedCount,
    checksumFailedCount: input.checksumFailedCount,
    verification,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

// Restore validation report: schema version and row counts must line up and
// every table checksum must verify before the restore may claim "verified".
export function createDatabaseRestoreReport(input: {
  readonly exportName: string;
  readonly tableCount: number;
  readonly verifiedTableCount: number;
  readonly failedTableCount: number;
  readonly expectedRowCount: number;
  readonly restoredRowCount: number;
  readonly schemaVersionMatched: boolean;
}): DatabaseRestoreValidationReport {
  const diagnostics: DatabaseDiagnostic[] = [];

  if (input.exportName.trim().length === 0) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_EXPORT_NAME_REQUIRED",
      "error",
      "Database restore report requires an export name.",
      "exportName",
    ));
  }

  const countsValid =
    validateCount(input.tableCount, "tableCount", diagnostics) &&
    validateCount(input.verifiedTableCount, "verifiedTableCount", diagnostics) &&
    validateCount(input.failedTableCount, "failedTableCount", diagnostics) &&
    validateCount(input.expectedRowCount, "expectedRowCount", diagnostics) &&
    validateCount(input.restoredRowCount, "restoredRowCount", diagnostics);

  // Restoring into a different schema version silently reshapes data.
  if (!input.schemaVersionMatched) {
    diagnostics.push(databaseDiagnostic(
      "Galerina_DATA_DATABASE_SCHEMA_VERSION_MISMATCH",
      "error",
      "Restore target schema version does not match the snapshot schema version.",
      "schemaVersionMatched",
    ));
  }

  let verification: DatabaseVerificationStatus = "not_verified";
  if (countsValid) {
    if (input.verifiedTableCount + input.failedTableCount > input.tableCount) {
      diagnostics.push(databaseDiagnostic(
        "Galerina_DATA_DATABASE_COUNTS_INCONSISTENT",
        "error",
        "verifiedTableCount + failedTableCount exceeds tableCount.",
        "tableCount",
      ));
    } else {
      if (input.expectedRowCount !== input.restoredRowCount) {
        diagnostics.push(databaseDiagnostic(
          "Galerina_DATA_DATABASE_ROW_COUNT_MISMATCH",
          "error",
          `Restored ${input.restoredRowCount} rows but the export recorded ${input.expectedRowCount}.`,
          "restoredRowCount",
        ));
      }

      const anyFailure =
        input.failedTableCount > 0 ||
        !input.schemaVersionMatched ||
        input.expectedRowCount !== input.restoredRowCount;

      if (anyFailure) {
        verification = "failed";
      } else if (input.tableCount > 0 && input.verifiedTableCount === input.tableCount) {
        verification = "verified";
      } else {
        verification = "not_verified";
        if (input.tableCount > 0) {
          diagnostics.push(databaseDiagnostic(
            "Galerina_DATA_DATABASE_UNVERIFIED",
            "warning",
            `${input.tableCount - input.verifiedTableCount} of ${input.tableCount} restored tables were not verified.`,
            "verifiedTableCount",
          ));
        }
      }
    }
  }

  return {
    exportName: input.exportName,
    tableCount: input.tableCount,
    verifiedTableCount: input.verifiedTableCount,
    failedTableCount: input.failedTableCount,
    expectedRowCount: input.expectedRowCount,
    restoredRowCount: input.restoredRowCount,
    schemaVersionMatched: input.schemaVersionMatched,
    verification,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
