// PostgreSQL adapter boundary contracts.
//
// This package is the contract for a future PostgreSQL adapter — no driver,
// no SQL execution, no network code lives here. It mirrors the
// galerina-data-db boundary vocabulary BY NAME: the three non-negotiables
// (parameterised-only access, raw-SQL denial, mandatory response mapping)
// are literal `true` in the type and re-checked at runtime, and the adapter
// must name the typed data-family contracts it consumes (model, query,
// response) as reference strings — vocabulary, never imports. Credentials
// travel only as external references: an inline password or a
// credential-bearing connection string is unrepresentable in the type and
// rejected at plan time when smuggled in by an untyped caller.

export type PostgresDiagnosticSeverity = "warning" | "error";

export interface PostgresDiagnostic {
  readonly code: string;
  readonly severity: PostgresDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The three non-negotiables, mirrored from the galerina-data-db boundary.
// Their type is the literal `true`: relaxing one is not configuration, it
// is a different (and rejected) contract.
export interface PostgresAdapterRequirements {
  readonly parameterisedOnly: true;
  readonly rawSqlDenied: true;
  readonly responseMappingRequired: true;
}

// The adapter must consume the typed data-family contracts. Refs are names
// into sibling packages (e.g. "@galerina/data-model#User"); each package
// stands alone at its boundary, so these are strings, never imports.
export interface PostgresContractRefs {
  readonly modelContractRef: string;
  readonly queryContractRef: string;
  readonly responseContractRef: string;
}

// Credentials never travel inline. The only representable credential is an
// external reference resolved by a secrets holder at runtime.
export interface PostgresCredentialRef {
  readonly kind: "external_ref";
  readonly ref: string;
}

// PostgreSQL parameterisation uses dollar-numbered placeholders ($1, $2, …)
// and nothing else; any other style is a different dialect's contract.
export type PostgresPlaceholderStyle = "dollar_numbered";

export type PostgresSslMode = "disable" | "require" | "verify-ca" | "verify-full";

export interface PostgresConnectionContract {
  readonly host: string;
  readonly port?: number;
  readonly database: string;
  readonly sslMode: PostgresSslMode;
  readonly credential: PostgresCredentialRef;
}

export interface PostgresAdapterDeclaration {
  readonly adapter: string;
  readonly provider: "postgres";
  readonly requirements: PostgresAdapterRequirements;
  readonly contractRefs: PostgresContractRefs;
  readonly placeholderStyle: PostgresPlaceholderStyle;
  readonly connection: PostgresConnectionContract;
  // Every statement runs under a bound; an unbounded statement is unsafe.
  readonly statementTimeoutMs: number;
}

export type PostgresAdapterCheck =
  | "declaration"
  | "nonNegotiables"
  | "typedContracts"
  | "parameterisation"
  | "connection"
  | "tls"
  | "statementTimeout"
  | "credentials";

export type PostgresAdapterCheckOutcome = "pass" | "fail";

export type PostgresAdapterReportStatus = "success" | "partial" | "failed";

export interface PostgresAdapterReport {
  readonly adapter: string;
  readonly provider: "postgres";
  readonly status: PostgresAdapterReportStatus;
  readonly checks: Readonly<Record<PostgresAdapterCheck, PostgresAdapterCheckOutcome>>;
  readonly diagnostics: readonly PostgresDiagnostic[];
  readonly warnings: readonly string[];
}

export const KNOWN_POSTGRES_PLACEHOLDER_STYLES: readonly PostgresPlaceholderStyle[] = [
  "dollar_numbered",
];

export const KNOWN_POSTGRES_SSL_MODES: readonly PostgresSslMode[] = [
  "disable",
  "require",
  "verify-ca",
  "verify-full",
];

export const POSTGRES_ADAPTER_CHECKS: readonly PostgresAdapterCheck[] = [
  "declaration",
  "nonNegotiables",
  "typedContracts",
  "parameterisation",
  "connection",
  "tls",
  "statementTimeout",
  "credentials",
];

const KNOWN_PLACEHOLDER_STYLES: ReadonlySet<string> = new Set(
  KNOWN_POSTGRES_PLACEHOLDER_STYLES,
);

const KNOWN_SSL_MODES: ReadonlySet<string> = new Set(KNOWN_POSTGRES_SSL_MODES);

// Valid TLS modes that do not verify the server identity end-to-end.
const WEAK_SSL_MODES: ReadonlySet<string> = new Set(["require", "verify-ca"]);

const LOCALHOST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

// "scheme://user:password@host" — a connection string carrying credentials.
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^/@\s]+:[^@\s]+@/;

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<PostgresAdapterCheck, readonly string[]>> = {
  declaration: [
    "Galerina_DB_POSTGRES_ADAPTER_NAME_REQUIRED",
    "Galerina_DB_POSTGRES_PROVIDER_MISMATCH",
  ],
  nonNegotiables: [
    "Galerina_DB_POSTGRES_PARAMETERISED_ONLY_REQUIRED",
    "Galerina_DB_POSTGRES_RAW_SQL_DENIAL_REQUIRED",
    "Galerina_DB_POSTGRES_RESPONSE_MAPPING_REQUIRED",
  ],
  typedContracts: [
    "Galerina_DB_POSTGRES_MODEL_CONTRACT_REF_REQUIRED",
    "Galerina_DB_POSTGRES_QUERY_CONTRACT_REF_REQUIRED",
    "Galerina_DB_POSTGRES_RESPONSE_CONTRACT_REF_REQUIRED",
  ],
  parameterisation: ["Galerina_DB_POSTGRES_PLACEHOLDER_STYLE_INVALID"],
  connection: [
    "Galerina_DB_POSTGRES_HOST_REQUIRED",
    "Galerina_DB_POSTGRES_DATABASE_REQUIRED",
    "Galerina_DB_POSTGRES_PORT_INVALID",
  ],
  tls: [
    "Galerina_DB_POSTGRES_SSL_MODE_UNKNOWN",
    "Galerina_DB_POSTGRES_TLS_REQUIRED",
  ],
  statementTimeout: ["Galerina_DB_POSTGRES_STATEMENT_TIMEOUT_REQUIRED"],
  credentials: [
    "Galerina_DB_POSTGRES_CREDENTIAL_KIND_INVALID",
    "Galerina_DB_POSTGRES_CREDENTIAL_REF_REQUIRED",
    "Galerina_DB_POSTGRES_INLINE_CREDENTIALS_FORBIDDEN",
  ],
};

function postgresDiagnostic(
  code: string,
  severity: PostgresDiagnosticSeverity,
  message: string,
  path?: string,
): PostgresDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isLocalhostHost(host: string): boolean {
  return LOCALHOST_HOSTS.has(host.trim().toLowerCase());
}

// Untyped callers can hand us an inline secret where the type says
// external reference; the contract re-checks and fails closed.
export function validatePostgresCredentialRef(
  credential: PostgresCredentialRef,
  path = "credential",
): readonly PostgresDiagnostic[] {
  const diagnostics: PostgresDiagnostic[] = [];

  if ((credential.kind as string) !== "external_ref") {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_CREDENTIAL_KIND_INVALID",
      "error",
      `Credential kind "${String(credential.kind)}" is not "external_ref"; inline credentials are unrepresentable.`,
      `${path}.kind`,
    ));
  }

  if (credential.ref.trim().length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_CREDENTIAL_REF_REQUIRED",
      "error",
      "Credential reference must be a non-empty external reference.",
      `${path}.ref`,
    ));
  } else if (CONNECTION_STRING_CREDENTIALS.test(credential.ref)) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Credential reference contains an inline user:password connection string; credentials never travel inline.",
      `${path}.ref`,
    ));
  }

  return diagnostics;
}

export function validatePostgresConnection(
  connection: PostgresConnectionContract,
  path = "connection",
): readonly PostgresDiagnostic[] {
  const diagnostics: PostgresDiagnostic[] = [];

  const host = connection.host.trim();
  if (host.length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_HOST_REQUIRED",
      "error",
      "PostgreSQL connection requires a host.",
      `${path}.host`,
    ));
  } else if (host.includes("@") || CONNECTION_STRING_CREDENTIALS.test(host)) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      `Host "${host}" carries userinfo; hosts are bare hostnames and credentials travel only as external references.`,
      `${path}.host`,
    ));
  }

  if (connection.database.trim().length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_DATABASE_REQUIRED",
      "error",
      "PostgreSQL connection requires a database name.",
      `${path}.database`,
    ));
  }

  if (
    connection.port !== undefined &&
    (!isPositiveSafeInteger(connection.port) || connection.port > 65535)
  ) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_PORT_INVALID",
      "error",
      "PostgreSQL port, when set, must be an integer between 1 and 65535.",
      `${path}.port`,
    ));
  }

  if (!KNOWN_SSL_MODES.has(connection.sslMode)) {
    // Unknown members are rejected, never defaulted to something weaker.
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_SSL_MODE_UNKNOWN",
      "error",
      `sslMode "${String(connection.sslMode)}" is not a known mode (disable/require/verify-ca/verify-full).`,
      `${path}.sslMode`,
    ));
  } else if (!isLocalhostHost(connection.host)) {
    // An empty host is treated as non-localhost: fail closed.
    if (connection.sslMode === "disable") {
      diagnostics.push(postgresDiagnostic(
        "Galerina_DB_POSTGRES_TLS_REQUIRED",
        "error",
        "TLS is required for any non-localhost host; sslMode \"disable\" is only acceptable for localhost.",
        `${path}.sslMode`,
      ));
    } else if (WEAK_SSL_MODES.has(connection.sslMode)) {
      diagnostics.push(postgresDiagnostic(
        "Galerina_DB_POSTGRES_VERIFY_FULL_RECOMMENDED",
        "warning",
        `sslMode "${connection.sslMode}" does not fully verify the server identity; "verify-full" is recommended for non-localhost hosts.`,
        `${path}.sslMode`,
      ));
    }
  }

  diagnostics.push(
    ...validatePostgresCredentialRef(connection.credential, `${path}.credential`),
  );

  return diagnostics;
}

export function validatePostgresAdapterRequirements(
  requirements: PostgresAdapterRequirements,
  path = "requirements",
): readonly PostgresDiagnostic[] {
  const diagnostics: PostgresDiagnostic[] = [];

  if ((requirements.parameterisedOnly as boolean) !== true) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_PARAMETERISED_ONLY_REQUIRED",
      "error",
      "The PostgreSQL adapter requires parameterised-only access; this is not configurable.",
      `${path}.parameterisedOnly`,
    ));
  }

  if ((requirements.rawSqlDenied as boolean) !== true) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "The PostgreSQL adapter denies raw SQL; this is not configurable.",
      `${path}.rawSqlDenied`,
    ));
  }

  if ((requirements.responseMappingRequired as boolean) !== true) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_RESPONSE_MAPPING_REQUIRED",
      "error",
      "The PostgreSQL adapter requires model-to-response mapping; this is not configurable.",
      `${path}.responseMappingRequired`,
    ));
  }

  return diagnostics;
}

// "Must consume typed contracts" made checkable: an adapter that names no
// model/query/response contract is bypassing the typed data family.
export function validatePostgresContractRefs(
  contractRefs: PostgresContractRefs,
  path = "contractRefs",
): readonly PostgresDiagnostic[] {
  const diagnostics: PostgresDiagnostic[] = [];

  if (contractRefs.modelContractRef.trim().length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_MODEL_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-model contract reference.",
      `${path}.modelContractRef`,
    ));
  }

  if (contractRefs.queryContractRef.trim().length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_QUERY_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-query contract reference.",
      `${path}.queryContractRef`,
    ));
  }

  if (contractRefs.responseContractRef.trim().length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_RESPONSE_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-response contract reference.",
      `${path}.responseContractRef`,
    ));
  }

  return diagnostics;
}

export function validatePostgresAdapterDeclaration(
  declaration: PostgresAdapterDeclaration,
): readonly PostgresDiagnostic[] {
  const diagnostics: PostgresDiagnostic[] = [];

  if (declaration.adapter.trim().length === 0) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_ADAPTER_NAME_REQUIRED",
      "error",
      "Adapter declaration requires a name.",
      "adapter",
    ));
  }

  if ((declaration.provider as string) !== "postgres") {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_PROVIDER_MISMATCH",
      "error",
      `Adapter provider "${String(declaration.provider)}" is not "postgres".`,
      "provider",
    ));
  }

  diagnostics.push(...validatePostgresAdapterRequirements(declaration.requirements));
  diagnostics.push(...validatePostgresContractRefs(declaration.contractRefs));

  if (!KNOWN_PLACEHOLDER_STYLES.has(declaration.placeholderStyle)) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_PLACEHOLDER_STYLE_INVALID",
      "error",
      `Placeholder style "${String(declaration.placeholderStyle)}" is not "dollar_numbered"; PostgreSQL parameterisation uses $1-style placeholders only.`,
      "placeholderStyle",
    ));
  }

  diagnostics.push(...validatePostgresConnection(declaration.connection));

  if (!isPositiveSafeInteger(declaration.statementTimeoutMs)) {
    diagnostics.push(postgresDiagnostic(
      "Galerina_DB_POSTGRES_STATEMENT_TIMEOUT_REQUIRED",
      "error",
      "statementTimeoutMs must be a positive integer; an unbounded statement is unsafe.",
      "statementTimeoutMs",
    ));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function derivePostgresAdapterStatus(
  diagnostics: readonly PostgresDiagnostic[],
): PostgresAdapterReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createPostgresAdapterReport(input: {
  readonly declaration: PostgresAdapterDeclaration;
}): PostgresAdapterReport {
  const diagnostics = [...validatePostgresAdapterDeclaration(input.declaration)];

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<PostgresAdapterCheck, PostgresAdapterCheckOutcome>;
  for (const check of POSTGRES_ADAPTER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    adapter: input.declaration.adapter,
    provider: "postgres",
    status: derivePostgresAdapterStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
