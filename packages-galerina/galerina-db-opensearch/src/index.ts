// OpenSearch adapter boundary contracts.
//
// This package is the contract for a future OpenSearch adapter — no client,
// no network code lives here. It mirrors the galerina-data-db boundary
// vocabulary BY NAME: the three non-negotiables (parameterised-only access,
// raw-SQL denial, mandatory response mapping) are literal `true` in the type
// and re-checked at runtime, and the adapter must name the typed data-family
// contracts it consumes (model, query, response) as reference strings —
// vocabulary, never imports.
//
// OpenSearch-specific invariants: every index operation and every query must
// carry a searchIndexPolicyRef naming the galerina-data-search PII-allowlist
// policy it runs under — an unpoliced index write or read is rejected, not
// defaulted. Endpoints require TLS for any non-localhost host and may never
// embed userinfo. Every query carries a positive integer limit (the
// galerina-data-search bounded-result rule): unbounded result sets are
// unsafe. Credentials travel only as external references.

export type OpenSearchDiagnosticSeverity = "warning" | "error";

export interface OpenSearchDiagnostic {
  readonly code: string;
  readonly severity: OpenSearchDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The three non-negotiables, mirrored from the galerina-data-db boundary.
// Their type is the literal `true`: relaxing one is not configuration, it
// is a different (and rejected) contract.
export interface OpenSearchAdapterRequirements {
  readonly parameterisedOnly: true;
  readonly rawSqlDenied: true;
  readonly responseMappingRequired: true;
}

// The adapter must consume the typed data-family contracts. Refs are names
// into sibling packages (e.g. "@galerina/data-model#User"); each package
// stands alone at its boundary, so these are strings, never imports.
export interface OpenSearchContractRefs {
  readonly modelContractRef: string;
  readonly queryContractRef: string;
  readonly responseContractRef: string;
}

// Credentials never travel inline. The only representable credential is an
// external reference resolved by a secrets holder at runtime.
export interface OpenSearchCredentialRef {
  readonly kind: "external_ref";
  readonly ref: string;
}

export interface OpenSearchConnectionContract {
  // "https://host[:port]" — scheme-checked, TLS required off-localhost,
  // and never carrying userinfo.
  readonly endpoint: string;
  readonly credential: OpenSearchCredentialRef;
}

export type OpenSearchIndexOperationKind = "index" | "update" | "delete";

// Every index operation names the galerina-data-search policy it runs
// under (e.g. "@galerina/data-search#users-index-policy"): the PII
// allowlist is the only path into the index.
export interface OpenSearchIndexOperation {
  readonly index: string;
  readonly kind: OpenSearchIndexOperationKind;
  readonly searchIndexPolicyRef: string;
}

// Every query is bounded and policy-scoped, mirroring the
// galerina-data-search query contract.
export interface OpenSearchQueryContract {
  readonly index: string;
  readonly limit: number;
  readonly searchIndexPolicyRef: string;
}

export interface OpenSearchAdapterDeclaration {
  readonly adapter: string;
  readonly provider: "opensearch";
  readonly requirements: OpenSearchAdapterRequirements;
  readonly contractRefs: OpenSearchContractRefs;
  readonly connection: OpenSearchConnectionContract;
}

export type OpenSearchAdapterCheck =
  | "declaration"
  | "nonNegotiables"
  | "typedContracts"
  | "connection"
  | "tls"
  | "searchIndexPolicy"
  | "operations"
  | "queryBounds"
  | "credentials";

export type OpenSearchAdapterCheckOutcome = "pass" | "fail";

export type OpenSearchAdapterReportStatus = "success" | "partial" | "failed";

export interface OpenSearchAdapterReport {
  readonly adapter: string;
  readonly provider: "opensearch";
  readonly status: OpenSearchAdapterReportStatus;
  readonly checks: Readonly<Record<OpenSearchAdapterCheck, OpenSearchAdapterCheckOutcome>>;
  readonly indexOperationCount: number;
  readonly queryCount: number;
  readonly diagnostics: readonly OpenSearchDiagnostic[];
  readonly warnings: readonly string[];
}

export const KNOWN_OPENSEARCH_OPERATION_KINDS: readonly OpenSearchIndexOperationKind[] = [
  "index",
  "update",
  "delete",
];

export const OPENSEARCH_ADAPTER_CHECKS: readonly OpenSearchAdapterCheck[] = [
  "declaration",
  "nonNegotiables",
  "typedContracts",
  "connection",
  "tls",
  "searchIndexPolicy",
  "operations",
  "queryBounds",
  "credentials",
];

const KNOWN_OPERATION_KINDS: ReadonlySet<string> = new Set(
  KNOWN_OPENSEARCH_OPERATION_KINDS,
);

const LOCALHOST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

// "scheme://user:password@host" — a connection string carrying credentials.
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^/@\s]+:[^@\s]+@/;

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<OpenSearchAdapterCheck, readonly string[]>> = {
  declaration: [
    "Galerina_DB_OPENSEARCH_ADAPTER_NAME_REQUIRED",
    "Galerina_DB_OPENSEARCH_PROVIDER_MISMATCH",
  ],
  nonNegotiables: [
    "Galerina_DB_OPENSEARCH_PARAMETERISED_ONLY_REQUIRED",
    "Galerina_DB_OPENSEARCH_RAW_SQL_DENIAL_REQUIRED",
    "Galerina_DB_OPENSEARCH_RESPONSE_MAPPING_REQUIRED",
  ],
  typedContracts: [
    "Galerina_DB_OPENSEARCH_MODEL_CONTRACT_REF_REQUIRED",
    "Galerina_DB_OPENSEARCH_QUERY_CONTRACT_REF_REQUIRED",
    "Galerina_DB_OPENSEARCH_RESPONSE_CONTRACT_REF_REQUIRED",
  ],
  connection: [
    "Galerina_DB_OPENSEARCH_ENDPOINT_REQUIRED",
    "Galerina_DB_OPENSEARCH_ENDPOINT_SCHEME_INVALID",
  ],
  tls: ["Galerina_DB_OPENSEARCH_TLS_REQUIRED"],
  searchIndexPolicy: ["Galerina_DB_OPENSEARCH_SEARCH_INDEX_POLICY_REQUIRED"],
  operations: [
    "Galerina_DB_OPENSEARCH_INDEX_NAME_REQUIRED",
    "Galerina_DB_OPENSEARCH_OPERATION_KIND_UNKNOWN",
  ],
  queryBounds: ["Galerina_DB_OPENSEARCH_QUERY_LIMIT_REQUIRED"],
  credentials: [
    "Galerina_DB_OPENSEARCH_CREDENTIAL_KIND_INVALID",
    "Galerina_DB_OPENSEARCH_CREDENTIAL_REF_REQUIRED",
    "Galerina_DB_OPENSEARCH_INLINE_CREDENTIALS_FORBIDDEN",
  ],
};

function openSearchDiagnostic(
  code: string,
  severity: OpenSearchDiagnosticSeverity,
  message: string,
  path?: string,
): OpenSearchDiagnostic {
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

function endpointHost(endpoint: string): string {
  const afterScheme = endpoint.replace(/^https?:\/\//i, "");
  const authority = afterScheme.split("/")[0] ?? "";
  if (authority.startsWith("[")) {
    const closing = authority.indexOf("]");
    return closing === -1 ? authority : authority.slice(1, closing);
  }
  return authority.split(":")[0] ?? "";
}

function isLocalhostHost(host: string): boolean {
  return LOCALHOST_HOSTS.has(host.trim().toLowerCase());
}

// Untyped callers can hand us an inline secret where the type says
// external reference; the contract re-checks and fails closed.
export function validateOpenSearchCredentialRef(
  credential: OpenSearchCredentialRef,
  path = "credential",
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  if ((credential.kind as string) !== "external_ref") {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_CREDENTIAL_KIND_INVALID",
      "error",
      `Credential kind "${String(credential.kind)}" is not "external_ref"; inline credentials are unrepresentable.`,
      `${path}.kind`,
    ));
  }

  if (credential.ref.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_CREDENTIAL_REF_REQUIRED",
      "error",
      "Credential reference must be a non-empty external reference.",
      `${path}.ref`,
    ));
  } else if (CONNECTION_STRING_CREDENTIALS.test(credential.ref)) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Credential reference contains an inline user:password connection string; credentials never travel inline.",
      `${path}.ref`,
    ));
  }

  return diagnostics;
}

export function validateOpenSearchConnection(
  connection: OpenSearchConnectionContract,
  path = "connection",
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  const endpoint = connection.endpoint.trim();
  if (endpoint.length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_ENDPOINT_REQUIRED",
      "error",
      "OpenSearch connection requires an endpoint.",
      `${path}.endpoint`,
    ));
  } else if (endpoint.includes("@")) {
    // Userinfo in a URL is an inline credential, whatever the scheme.
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Endpoint carries userinfo; credentials travel only as external references.",
      `${path}.endpoint`,
    ));
  } else if (!/^https?:\/\//i.test(endpoint)) {
    // Unknown schemes are rejected, never defaulted.
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_ENDPOINT_SCHEME_INVALID",
      "error",
      `Endpoint "${endpoint}" must be an http(s) URL.`,
      `${path}.endpoint`,
    ));
  } else if (/^http:\/\//i.test(endpoint) && !isLocalhostHost(endpointHost(endpoint))) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_TLS_REQUIRED",
      "error",
      "TLS is required for any non-localhost endpoint; plain http is only acceptable for localhost.",
      `${path}.endpoint`,
    ));
  }

  diagnostics.push(
    ...validateOpenSearchCredentialRef(connection.credential, `${path}.credential`),
  );

  return diagnostics;
}

// The data-search privacy mandate made checkable: an index operation that
// names no PII-allowlist policy is an unpoliced write and is rejected.
export function validateOpenSearchIndexOperation(
  operation: OpenSearchIndexOperation,
  path = "operation",
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  if (operation.index.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_INDEX_NAME_REQUIRED",
      "error",
      "Index operation requires an index name.",
      `${path}.index`,
    ));
  }

  if (!KNOWN_OPERATION_KINDS.has(operation.kind)) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_OPERATION_KIND_UNKNOWN",
      "error",
      `Index operation kind "${String(operation.kind)}" is not a known kind (index/update/delete).`,
      `${path}.kind`,
    ));
  }

  if (operation.searchIndexPolicyRef.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_SEARCH_INDEX_POLICY_REQUIRED",
      "error",
      "Index operation requires a galerina-data-search index policy reference; unpoliced index writes are rejected.",
      `${path}.searchIndexPolicyRef`,
    ));
  }

  return diagnostics;
}

// The data-search bounded-result rule: a missing or non-positive limit asks
// the provider for an unbounded result set.
export function validateOpenSearchQuery(
  query: OpenSearchQueryContract,
  path = "query",
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  if (query.index.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_INDEX_NAME_REQUIRED",
      "error",
      "Query requires an index name.",
      `${path}.index`,
    ));
  }

  if (!isPositiveSafeInteger(query.limit)) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_QUERY_LIMIT_REQUIRED",
      "error",
      "Query requires a positive integer limit; unbounded result sets are unsafe.",
      `${path}.limit`,
    ));
  }

  if (query.searchIndexPolicyRef.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_SEARCH_INDEX_POLICY_REQUIRED",
      "error",
      "Query requires a galerina-data-search index policy reference; unpoliced reads are rejected.",
      `${path}.searchIndexPolicyRef`,
    ));
  }

  return diagnostics;
}

export function validateOpenSearchAdapterRequirements(
  requirements: OpenSearchAdapterRequirements,
  path = "requirements",
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  if ((requirements.parameterisedOnly as boolean) !== true) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_PARAMETERISED_ONLY_REQUIRED",
      "error",
      "The OpenSearch adapter requires parameterised (typed-argument) access; this is not configurable.",
      `${path}.parameterisedOnly`,
    ));
  }

  if ((requirements.rawSqlDenied as boolean) !== true) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "The OpenSearch adapter denies raw query strings; this is not configurable.",
      `${path}.rawSqlDenied`,
    ));
  }

  if ((requirements.responseMappingRequired as boolean) !== true) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_RESPONSE_MAPPING_REQUIRED",
      "error",
      "The OpenSearch adapter requires model-to-response mapping; this is not configurable.",
      `${path}.responseMappingRequired`,
    ));
  }

  return diagnostics;
}

// "Must consume typed contracts" made checkable: an adapter that names no
// model/query/response contract is bypassing the typed data family.
export function validateOpenSearchContractRefs(
  contractRefs: OpenSearchContractRefs,
  path = "contractRefs",
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  if (contractRefs.modelContractRef.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_MODEL_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-model contract reference.",
      `${path}.modelContractRef`,
    ));
  }

  if (contractRefs.queryContractRef.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_QUERY_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-query contract reference.",
      `${path}.queryContractRef`,
    ));
  }

  if (contractRefs.responseContractRef.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_RESPONSE_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-response contract reference.",
      `${path}.responseContractRef`,
    ));
  }

  return diagnostics;
}

export function validateOpenSearchAdapterDeclaration(
  declaration: OpenSearchAdapterDeclaration,
): readonly OpenSearchDiagnostic[] {
  const diagnostics: OpenSearchDiagnostic[] = [];

  if (declaration.adapter.trim().length === 0) {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_ADAPTER_NAME_REQUIRED",
      "error",
      "Adapter declaration requires a name.",
      "adapter",
    ));
  }

  if ((declaration.provider as string) !== "opensearch") {
    diagnostics.push(openSearchDiagnostic(
      "Galerina_DB_OPENSEARCH_PROVIDER_MISMATCH",
      "error",
      `Adapter provider "${String(declaration.provider)}" is not "opensearch".`,
      "provider",
    ));
  }

  diagnostics.push(...validateOpenSearchAdapterRequirements(declaration.requirements));
  diagnostics.push(...validateOpenSearchContractRefs(declaration.contractRefs));
  diagnostics.push(...validateOpenSearchConnection(declaration.connection));

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveOpenSearchAdapterStatus(
  diagnostics: readonly OpenSearchDiagnostic[],
): OpenSearchAdapterReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createOpenSearchAdapterReport(input: {
  readonly declaration: OpenSearchAdapterDeclaration;
  readonly indexOperations?: readonly OpenSearchIndexOperation[];
  readonly queries?: readonly OpenSearchQueryContract[];
}): OpenSearchAdapterReport {
  const indexOperations = input.indexOperations ?? [];
  const queries = input.queries ?? [];

  const diagnostics = [...validateOpenSearchAdapterDeclaration(input.declaration)];
  indexOperations.forEach((operation, position) => {
    diagnostics.push(
      ...validateOpenSearchIndexOperation(operation, `indexOperations.${position}`),
    );
  });
  queries.forEach((query, position) => {
    diagnostics.push(...validateOpenSearchQuery(query, `queries.${position}`));
  });

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<OpenSearchAdapterCheck, OpenSearchAdapterCheckOutcome>;
  for (const check of OPENSEARCH_ADAPTER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    adapter: input.declaration.adapter,
    provider: "opensearch",
    status: deriveOpenSearchAdapterStatus(diagnostics),
    checks,
    indexOperationCount: indexOperations.length,
    queryCount: queries.length,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
