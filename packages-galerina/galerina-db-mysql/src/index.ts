// MySQL adapter boundary contracts.
//
// This package is the contract for a future MySQL adapter — no driver, no
// SQL execution, no network code lives here. It mirrors the galerina-data-db
// boundary vocabulary BY NAME: the three non-negotiables (parameterised-only
// access, raw-SQL denial, mandatory response mapping) are literal `true` in
// the type and re-checked at runtime, and the adapter must name the typed
// data-family contracts it consumes (model, query, response) as reference
// strings — vocabulary, never imports. Credentials travel only as external
// references: an inline password or a credential-bearing connection string
// is unrepresentable in the type and rejected at plan time when smuggled in
// by an untyped caller.

export type MysqlDiagnosticSeverity = "warning" | "error";

export interface MysqlDiagnostic {
  readonly code: string;
  readonly severity: MysqlDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The three non-negotiables, mirrored from the galerina-data-db boundary.
// Their type is the literal `true`: relaxing one is not configuration, it
// is a different (and rejected) contract.
export interface MysqlAdapterRequirements {
  readonly parameterisedOnly: true;
  readonly rawSqlDenied: true;
  readonly responseMappingRequired: true;
}

// The adapter must consume the typed data-family contracts. Refs are names
// into sibling packages (e.g. "@galerina/data-model#User"); each package
// stands alone at its boundary, so these are strings, never imports.
export interface MysqlContractRefs {
  readonly modelContractRef: string;
  readonly queryContractRef: string;
  readonly responseContractRef: string;
}

// Credentials never travel inline. The only representable credential is an
// external reference resolved by a secrets holder at runtime.
export interface MysqlCredentialRef {
  readonly kind: "external_ref";
  readonly ref: string;
}

// MySQL parameterisation uses question-mark placeholders (?) and nothing
// else; any other style is a different dialect's contract.
export type MysqlPlaceholderStyle = "question_mark";

// TLS vocabulary mirrors MySQL's ssl-mode names. "preferred" is deliberately
// unrepresentable: opportunistic TLS can silently downgrade to plaintext.
export type MysqlTlsMode = "disabled" | "required" | "verify_ca" | "verify_identity";

export interface MysqlConnectionContract {
  readonly host: string;
  readonly port?: number;
  readonly database: string;
  readonly tlsMode: MysqlTlsMode;
  readonly credential: MysqlCredentialRef;
}

export interface MysqlAdapterDeclaration {
  readonly adapter: string;
  readonly provider: "mysql";
  readonly requirements: MysqlAdapterRequirements;
  readonly contractRefs: MysqlContractRefs;
  readonly placeholderStyle: MysqlPlaceholderStyle;
  readonly connection: MysqlConnectionContract;
  // Every statement runs under a bound; an unbounded statement is unsafe.
  readonly statementTimeoutMs: number;
}

export type MysqlAdapterCheck =
  | "declaration"
  | "nonNegotiables"
  | "typedContracts"
  | "parameterisation"
  | "connection"
  | "tls"
  | "statementTimeout"
  | "credentials";

export type MysqlAdapterCheckOutcome = "pass" | "fail";

export type MysqlAdapterReportStatus = "success" | "partial" | "failed";

export interface MysqlAdapterReport {
  readonly adapter: string;
  readonly provider: "mysql";
  readonly status: MysqlAdapterReportStatus;
  readonly checks: Readonly<Record<MysqlAdapterCheck, MysqlAdapterCheckOutcome>>;
  readonly diagnostics: readonly MysqlDiagnostic[];
  readonly warnings: readonly string[];
}

export const KNOWN_MYSQL_PLACEHOLDER_STYLES: readonly MysqlPlaceholderStyle[] = [
  "question_mark",
];

export const KNOWN_MYSQL_TLS_MODES: readonly MysqlTlsMode[] = [
  "disabled",
  "required",
  "verify_ca",
  "verify_identity",
];

export const MYSQL_ADAPTER_CHECKS: readonly MysqlAdapterCheck[] = [
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
  KNOWN_MYSQL_PLACEHOLDER_STYLES,
);

const KNOWN_TLS_MODES: ReadonlySet<string> = new Set(KNOWN_MYSQL_TLS_MODES);

// Valid TLS modes that do not verify the server identity end-to-end.
const WEAK_TLS_MODES: ReadonlySet<string> = new Set(["required", "verify_ca"]);

const LOCALHOST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

// "scheme://user:password@host" — a connection string carrying credentials.
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^/@\s]+:[^@\s]+@/;

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<MysqlAdapterCheck, readonly string[]>> = {
  declaration: [
    "Galerina_DB_MYSQL_ADAPTER_NAME_REQUIRED",
    "Galerina_DB_MYSQL_PROVIDER_MISMATCH",
  ],
  nonNegotiables: [
    "Galerina_DB_MYSQL_PARAMETERISED_ONLY_REQUIRED",
    "Galerina_DB_MYSQL_RAW_SQL_DENIAL_REQUIRED",
    "Galerina_DB_MYSQL_RESPONSE_MAPPING_REQUIRED",
  ],
  typedContracts: [
    "Galerina_DB_MYSQL_MODEL_CONTRACT_REF_REQUIRED",
    "Galerina_DB_MYSQL_QUERY_CONTRACT_REF_REQUIRED",
    "Galerina_DB_MYSQL_RESPONSE_CONTRACT_REF_REQUIRED",
  ],
  parameterisation: ["Galerina_DB_MYSQL_PLACEHOLDER_STYLE_INVALID"],
  connection: [
    "Galerina_DB_MYSQL_HOST_REQUIRED",
    "Galerina_DB_MYSQL_DATABASE_REQUIRED",
    "Galerina_DB_MYSQL_PORT_INVALID",
  ],
  tls: [
    "Galerina_DB_MYSQL_TLS_MODE_UNKNOWN",
    "Galerina_DB_MYSQL_TLS_REQUIRED",
  ],
  statementTimeout: ["Galerina_DB_MYSQL_STATEMENT_TIMEOUT_REQUIRED"],
  credentials: [
    "Galerina_DB_MYSQL_CREDENTIAL_KIND_INVALID",
    "Galerina_DB_MYSQL_CREDENTIAL_REF_REQUIRED",
    "Galerina_DB_MYSQL_INLINE_CREDENTIALS_FORBIDDEN",
  ],
};

function mysqlDiagnostic(
  code: string,
  severity: MysqlDiagnosticSeverity,
  message: string,
  path?: string,
): MysqlDiagnostic {
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
export function validateMysqlCredentialRef(
  credential: MysqlCredentialRef,
  path = "credential",
): readonly MysqlDiagnostic[] {
  const diagnostics: MysqlDiagnostic[] = [];

  if ((credential.kind as string) !== "external_ref") {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_CREDENTIAL_KIND_INVALID",
      "error",
      `Credential kind "${String(credential.kind)}" is not "external_ref"; inline credentials are unrepresentable.`,
      `${path}.kind`,
    ));
  }

  if (credential.ref.trim().length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_CREDENTIAL_REF_REQUIRED",
      "error",
      "Credential reference must be a non-empty external reference.",
      `${path}.ref`,
    ));
  } else if (CONNECTION_STRING_CREDENTIALS.test(credential.ref)) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Credential reference contains an inline user:password connection string; credentials never travel inline.",
      `${path}.ref`,
    ));
  }

  return diagnostics;
}

export function validateMysqlConnection(
  connection: MysqlConnectionContract,
  path = "connection",
): readonly MysqlDiagnostic[] {
  const diagnostics: MysqlDiagnostic[] = [];

  const host = connection.host.trim();
  if (host.length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_HOST_REQUIRED",
      "error",
      "MySQL connection requires a host.",
      `${path}.host`,
    ));
  } else if (host.includes("@") || CONNECTION_STRING_CREDENTIALS.test(host)) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      `Host "${host}" carries userinfo; hosts are bare hostnames and credentials travel only as external references.`,
      `${path}.host`,
    ));
  }

  if (connection.database.trim().length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_DATABASE_REQUIRED",
      "error",
      "MySQL connection requires a database name.",
      `${path}.database`,
    ));
  }

  if (
    connection.port !== undefined &&
    (!isPositiveSafeInteger(connection.port) || connection.port > 65535)
  ) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_PORT_INVALID",
      "error",
      "MySQL port, when set, must be an integer between 1 and 65535.",
      `${path}.port`,
    ));
  }

  if (!KNOWN_TLS_MODES.has(connection.tlsMode)) {
    // Unknown members are rejected, never defaulted to something weaker.
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_TLS_MODE_UNKNOWN",
      "error",
      `tlsMode "${String(connection.tlsMode)}" is not a known mode (disabled/required/verify_ca/verify_identity).`,
      `${path}.tlsMode`,
    ));
  } else if (!isLocalhostHost(connection.host)) {
    // An empty host is treated as non-localhost: fail closed.
    if (connection.tlsMode === "disabled") {
      diagnostics.push(mysqlDiagnostic(
        "Galerina_DB_MYSQL_TLS_REQUIRED",
        "error",
        "TLS is required for any non-localhost host; tlsMode \"disabled\" is only acceptable for localhost.",
        `${path}.tlsMode`,
      ));
    } else if (WEAK_TLS_MODES.has(connection.tlsMode)) {
      diagnostics.push(mysqlDiagnostic(
        "Galerina_DB_MYSQL_VERIFY_IDENTITY_RECOMMENDED",
        "warning",
        `tlsMode "${connection.tlsMode}" does not fully verify the server identity; "verify_identity" is recommended for non-localhost hosts.`,
        `${path}.tlsMode`,
      ));
    }
  }

  diagnostics.push(
    ...validateMysqlCredentialRef(connection.credential, `${path}.credential`),
  );

  return diagnostics;
}

export function validateMysqlAdapterRequirements(
  requirements: MysqlAdapterRequirements,
  path = "requirements",
): readonly MysqlDiagnostic[] {
  const diagnostics: MysqlDiagnostic[] = [];

  if ((requirements.parameterisedOnly as boolean) !== true) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_PARAMETERISED_ONLY_REQUIRED",
      "error",
      "The MySQL adapter requires parameterised-only access; this is not configurable.",
      `${path}.parameterisedOnly`,
    ));
  }

  if ((requirements.rawSqlDenied as boolean) !== true) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "The MySQL adapter denies raw SQL; this is not configurable.",
      `${path}.rawSqlDenied`,
    ));
  }

  if ((requirements.responseMappingRequired as boolean) !== true) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_RESPONSE_MAPPING_REQUIRED",
      "error",
      "The MySQL adapter requires model-to-response mapping; this is not configurable.",
      `${path}.responseMappingRequired`,
    ));
  }

  return diagnostics;
}

// "Must consume typed contracts" made checkable: an adapter that names no
// model/query/response contract is bypassing the typed data family.
export function validateMysqlContractRefs(
  contractRefs: MysqlContractRefs,
  path = "contractRefs",
): readonly MysqlDiagnostic[] {
  const diagnostics: MysqlDiagnostic[] = [];

  if (contractRefs.modelContractRef.trim().length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_MODEL_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-model contract reference.",
      `${path}.modelContractRef`,
    ));
  }

  if (contractRefs.queryContractRef.trim().length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_QUERY_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-query contract reference.",
      `${path}.queryContractRef`,
    ));
  }

  if (contractRefs.responseContractRef.trim().length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_RESPONSE_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-response contract reference.",
      `${path}.responseContractRef`,
    ));
  }

  return diagnostics;
}

export function validateMysqlAdapterDeclaration(
  declaration: MysqlAdapterDeclaration,
): readonly MysqlDiagnostic[] {
  const diagnostics: MysqlDiagnostic[] = [];

  if (declaration.adapter.trim().length === 0) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_ADAPTER_NAME_REQUIRED",
      "error",
      "Adapter declaration requires a name.",
      "adapter",
    ));
  }

  if ((declaration.provider as string) !== "mysql") {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_PROVIDER_MISMATCH",
      "error",
      `Adapter provider "${String(declaration.provider)}" is not "mysql".`,
      "provider",
    ));
  }

  diagnostics.push(...validateMysqlAdapterRequirements(declaration.requirements));
  diagnostics.push(...validateMysqlContractRefs(declaration.contractRefs));

  if (!KNOWN_PLACEHOLDER_STYLES.has(declaration.placeholderStyle)) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_PLACEHOLDER_STYLE_INVALID",
      "error",
      `Placeholder style "${String(declaration.placeholderStyle)}" is not "question_mark"; MySQL parameterisation uses ?-style placeholders only.`,
      "placeholderStyle",
    ));
  }

  diagnostics.push(...validateMysqlConnection(declaration.connection));

  if (!isPositiveSafeInteger(declaration.statementTimeoutMs)) {
    diagnostics.push(mysqlDiagnostic(
      "Galerina_DB_MYSQL_STATEMENT_TIMEOUT_REQUIRED",
      "error",
      "statementTimeoutMs must be a positive integer; an unbounded statement is unsafe.",
      "statementTimeoutMs",
    ));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveMysqlAdapterStatus(
  diagnostics: readonly MysqlDiagnostic[],
): MysqlAdapterReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createMysqlAdapterReport(input: {
  readonly declaration: MysqlAdapterDeclaration;
}): MysqlAdapterReport {
  const diagnostics = [...validateMysqlAdapterDeclaration(input.declaration)];

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<MysqlAdapterCheck, MysqlAdapterCheckOutcome>;
  for (const check of MYSQL_ADAPTER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    adapter: input.declaration.adapter,
    provider: "mysql",
    status: deriveMysqlAdapterStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
