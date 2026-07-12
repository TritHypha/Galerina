// SQLite adapter boundary contracts.
//
// This package is the contract for a future SQLite adapter — no driver, no
// SQL execution lives here. It mirrors the galerina-data-db boundary
// vocabulary BY NAME: the three non-negotiables (parameterised-only access,
// raw-SQL denial, mandatory response mapping) are literal `true` in the type
// and re-checked at runtime, and the adapter must name the typed data-family
// contracts it consumes (model, query, response) as reference strings —
// vocabulary, never imports.
//
// SQLite is not a network database, so this contract has NO host, port or
// TLS field at all: a network setting is unrepresentable, not merely
// discouraged. The database file is a relative path inside the application
// tree (the galerina-data-archive path rule): absolute paths, drive letters
// and ".." traversal are rejected. The only representable credential is an
// optional external reference to an encryption key — an inline key or a
// credential-bearing connection string fails closed at plan time.

export type SqliteDiagnosticSeverity = "warning" | "error";

export interface SqliteDiagnostic {
  readonly code: string;
  readonly severity: SqliteDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The three non-negotiables, mirrored from the galerina-data-db boundary.
// Their type is the literal `true`: relaxing one is not configuration, it
// is a different (and rejected) contract.
export interface SqliteAdapterRequirements {
  readonly parameterisedOnly: true;
  readonly rawSqlDenied: true;
  readonly responseMappingRequired: true;
}

// The adapter must consume the typed data-family contracts. Refs are names
// into sibling packages (e.g. "@galerina/data-model#User"); each package
// stands alone at its boundary, so these are strings, never imports.
export interface SqliteContractRefs {
  readonly modelContractRef: string;
  readonly queryContractRef: string;
  readonly responseContractRef: string;
}

// Credentials never travel inline. The only representable credential is an
// external reference resolved by a secrets holder at runtime.
export interface SqliteCredentialRef {
  readonly kind: "external_ref";
  readonly ref: string;
}

// SQLite parameterisation uses ? or :name placeholders; nothing else.
export type SqlitePlaceholderStyle = "question_mark" | "named_colon";

// Journal modes from the known set. "off" is deliberately unrepresentable:
// a database without a rollback journal has no atomicity to fail back to.
export type SqliteJournalMode = "wal" | "delete" | "truncate" | "persist" | "memory";

export interface SqliteAdapterDeclaration {
  readonly adapter: string;
  readonly provider: "sqlite";
  readonly requirements: SqliteAdapterRequirements;
  readonly contractRefs: SqliteContractRefs;
  readonly placeholderStyle: SqlitePlaceholderStyle;
  // Relative path inside the application tree — never absolute, never
  // drive-lettered, never traversing upward.
  readonly databaseFile: string;
  readonly journalMode: SqliteJournalMode;
  // Optional key for encrypted databases; always an external reference.
  readonly encryptionKeyRef?: SqliteCredentialRef;
}

export type SqliteAdapterCheck =
  | "declaration"
  | "nonNegotiables"
  | "typedContracts"
  | "parameterisation"
  | "databasePath"
  | "journalMode"
  | "credentials";

export type SqliteAdapterCheckOutcome = "pass" | "fail";

export type SqliteAdapterReportStatus = "success" | "partial" | "failed";

export interface SqliteAdapterReport {
  readonly adapter: string;
  readonly provider: "sqlite";
  readonly status: SqliteAdapterReportStatus;
  readonly checks: Readonly<Record<SqliteAdapterCheck, SqliteAdapterCheckOutcome>>;
  readonly diagnostics: readonly SqliteDiagnostic[];
  readonly warnings: readonly string[];
}

export const KNOWN_SQLITE_PLACEHOLDER_STYLES: readonly SqlitePlaceholderStyle[] = [
  "question_mark",
  "named_colon",
];

export const KNOWN_SQLITE_JOURNAL_MODES: readonly SqliteJournalMode[] = [
  "wal",
  "delete",
  "truncate",
  "persist",
  "memory",
];

export const SQLITE_ADAPTER_CHECKS: readonly SqliteAdapterCheck[] = [
  "declaration",
  "nonNegotiables",
  "typedContracts",
  "parameterisation",
  "databasePath",
  "journalMode",
  "credentials",
];

const KNOWN_PLACEHOLDER_STYLES: ReadonlySet<string> = new Set(
  KNOWN_SQLITE_PLACEHOLDER_STYLES,
);

const KNOWN_JOURNAL_MODES: ReadonlySet<string> = new Set(KNOWN_SQLITE_JOURNAL_MODES);

// "scheme://user:password@host" — a connection string carrying credentials.
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^/@\s]+:[^@\s]+@/;

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<SqliteAdapterCheck, readonly string[]>> = {
  declaration: [
    "Galerina_DB_SQLITE_ADAPTER_NAME_REQUIRED",
    "Galerina_DB_SQLITE_PROVIDER_MISMATCH",
  ],
  nonNegotiables: [
    "Galerina_DB_SQLITE_PARAMETERISED_ONLY_REQUIRED",
    "Galerina_DB_SQLITE_RAW_SQL_DENIAL_REQUIRED",
    "Galerina_DB_SQLITE_RESPONSE_MAPPING_REQUIRED",
  ],
  typedContracts: [
    "Galerina_DB_SQLITE_MODEL_CONTRACT_REF_REQUIRED",
    "Galerina_DB_SQLITE_QUERY_CONTRACT_REF_REQUIRED",
    "Galerina_DB_SQLITE_RESPONSE_CONTRACT_REF_REQUIRED",
  ],
  parameterisation: ["Galerina_DB_SQLITE_PLACEHOLDER_STYLE_INVALID"],
  databasePath: [
    "Galerina_DB_SQLITE_DATABASE_PATH_REQUIRED",
    "Galerina_DB_SQLITE_DATABASE_PATH_UNSAFE",
  ],
  journalMode: ["Galerina_DB_SQLITE_JOURNAL_MODE_UNKNOWN"],
  credentials: [
    "Galerina_DB_SQLITE_CREDENTIAL_KIND_INVALID",
    "Galerina_DB_SQLITE_CREDENTIAL_REF_REQUIRED",
    "Galerina_DB_SQLITE_INLINE_CREDENTIALS_FORBIDDEN",
  ],
};

function sqliteDiagnostic(
  code: string,
  severity: SqliteDiagnosticSeverity,
  message: string,
  path?: string,
): SqliteDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// Untyped callers can hand us an inline secret where the type says
// external reference; the contract re-checks and fails closed.
export function validateSqliteCredentialRef(
  credential: SqliteCredentialRef,
  path = "encryptionKeyRef",
): readonly SqliteDiagnostic[] {
  const diagnostics: SqliteDiagnostic[] = [];

  if ((credential.kind as string) !== "external_ref") {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_CREDENTIAL_KIND_INVALID",
      "error",
      `Credential kind "${String(credential.kind)}" is not "external_ref"; inline credentials are unrepresentable.`,
      `${path}.kind`,
    ));
  }

  if (credential.ref.trim().length === 0) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_CREDENTIAL_REF_REQUIRED",
      "error",
      "Credential reference must be a non-empty external reference.",
      `${path}.ref`,
    ));
  } else if (CONNECTION_STRING_CREDENTIALS.test(credential.ref)) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Credential reference contains an inline user:password connection string; credentials never travel inline.",
      `${path}.ref`,
    ));
  }

  return diagnostics;
}

// The archive path rule applied to the database file: relative, no drive
// letters, no upward traversal — the adapter may never be pointed outside
// the application tree.
export function validateSqliteDatabaseFile(
  databaseFile: string,
  path = "databaseFile",
): readonly SqliteDiagnostic[] {
  const diagnostics: SqliteDiagnostic[] = [];

  if (databaseFile.trim().length === 0) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_DATABASE_PATH_REQUIRED",
      "error",
      "SQLite adapter requires a database file path.",
      path,
    ));
    return diagnostics;
  }

  if (CONNECTION_STRING_CREDENTIALS.test(databaseFile)) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Database file path contains an inline user:password connection string; credentials never travel inline.",
      path,
    ));
  }

  const traversal = databaseFile
    .split(/[\\/]/)
    .some((segment) => segment === "..");
  if (
    databaseFile.startsWith("/") ||
    databaseFile.startsWith("\\") ||
    /^[A-Za-z]:/.test(databaseFile) ||
    traversal
  ) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_DATABASE_PATH_UNSAFE",
      "error",
      `Database file path "${databaseFile}" must be relative, without drive letters or upward traversal.`,
      path,
    ));
  }

  return diagnostics;
}

export function validateSqliteAdapterRequirements(
  requirements: SqliteAdapterRequirements,
  path = "requirements",
): readonly SqliteDiagnostic[] {
  const diagnostics: SqliteDiagnostic[] = [];

  if ((requirements.parameterisedOnly as boolean) !== true) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_PARAMETERISED_ONLY_REQUIRED",
      "error",
      "The SQLite adapter requires parameterised-only access; this is not configurable.",
      `${path}.parameterisedOnly`,
    ));
  }

  if ((requirements.rawSqlDenied as boolean) !== true) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "The SQLite adapter denies raw SQL; this is not configurable.",
      `${path}.rawSqlDenied`,
    ));
  }

  if ((requirements.responseMappingRequired as boolean) !== true) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_RESPONSE_MAPPING_REQUIRED",
      "error",
      "The SQLite adapter requires model-to-response mapping; this is not configurable.",
      `${path}.responseMappingRequired`,
    ));
  }

  return diagnostics;
}

// "Must consume typed contracts" made checkable: an adapter that names no
// model/query/response contract is bypassing the typed data family.
export function validateSqliteContractRefs(
  contractRefs: SqliteContractRefs,
  path = "contractRefs",
): readonly SqliteDiagnostic[] {
  const diagnostics: SqliteDiagnostic[] = [];

  if (contractRefs.modelContractRef.trim().length === 0) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_MODEL_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-model contract reference.",
      `${path}.modelContractRef`,
    ));
  }

  if (contractRefs.queryContractRef.trim().length === 0) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_QUERY_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-query contract reference.",
      `${path}.queryContractRef`,
    ));
  }

  if (contractRefs.responseContractRef.trim().length === 0) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_RESPONSE_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-response contract reference.",
      `${path}.responseContractRef`,
    ));
  }

  return diagnostics;
}

export function validateSqliteAdapterDeclaration(
  declaration: SqliteAdapterDeclaration,
): readonly SqliteDiagnostic[] {
  const diagnostics: SqliteDiagnostic[] = [];

  if (declaration.adapter.trim().length === 0) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_ADAPTER_NAME_REQUIRED",
      "error",
      "Adapter declaration requires a name.",
      "adapter",
    ));
  }

  if ((declaration.provider as string) !== "sqlite") {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_PROVIDER_MISMATCH",
      "error",
      `Adapter provider "${String(declaration.provider)}" is not "sqlite".`,
      "provider",
    ));
  }

  diagnostics.push(...validateSqliteAdapterRequirements(declaration.requirements));
  diagnostics.push(...validateSqliteContractRefs(declaration.contractRefs));

  if (!KNOWN_PLACEHOLDER_STYLES.has(declaration.placeholderStyle)) {
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_PLACEHOLDER_STYLE_INVALID",
      "error",
      `Placeholder style "${String(declaration.placeholderStyle)}" is not "question_mark" or "named_colon"; SQLite parameterisation uses ? or :name placeholders only.`,
      "placeholderStyle",
    ));
  }

  diagnostics.push(...validateSqliteDatabaseFile(declaration.databaseFile));

  if (!KNOWN_JOURNAL_MODES.has(declaration.journalMode)) {
    // Unknown members are rejected, never defaulted; "off" is not a member.
    diagnostics.push(sqliteDiagnostic(
      "Galerina_DB_SQLITE_JOURNAL_MODE_UNKNOWN",
      "error",
      `Journal mode "${String(declaration.journalMode)}" is not in the known set (wal/delete/truncate/persist/memory).`,
      "journalMode",
    ));
  }

  if (declaration.encryptionKeyRef !== undefined) {
    diagnostics.push(...validateSqliteCredentialRef(declaration.encryptionKeyRef));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveSqliteAdapterStatus(
  diagnostics: readonly SqliteDiagnostic[],
): SqliteAdapterReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createSqliteAdapterReport(input: {
  readonly declaration: SqliteAdapterDeclaration;
}): SqliteAdapterReport {
  const diagnostics = [...validateSqliteAdapterDeclaration(input.declaration)];

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<SqliteAdapterCheck, SqliteAdapterCheckOutcome>;
  for (const check of SQLITE_ADAPTER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    adapter: input.declaration.adapter,
    provider: "sqlite",
    status: deriveSqliteAdapterStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
