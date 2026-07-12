// Firestore adapter boundary contracts.
//
// This package is the contract for a future Firestore adapter — no SDK, no
// network code lives here. It mirrors the galerina-data-db boundary
// vocabulary BY NAME: the three non-negotiables (parameterised-only access,
// raw-SQL denial, mandatory response mapping) are literal `true` in the type
// and re-checked at runtime, and the adapter must name the typed data-family
// contracts it consumes (model, query, response) as reference strings —
// vocabulary, never imports.
//
// Firestore-specific invariants: a security-rules reference is REQUIRED —
// a Firestore adapter without rules is an open database, so the contract
// refuses to describe one. Paths are relative segment strings ("//" and
// "."/".." segments rejected) whose collection/document meaning is declared
// by kind and checked against segment parity: collection paths have an odd
// number of segments, document paths an even number. Composite indexes must
// name at least two fields. Credentials travel only as external references.

export type FirestoreDiagnosticSeverity = "warning" | "error";

export interface FirestoreDiagnostic {
  readonly code: string;
  readonly severity: FirestoreDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The three non-negotiables, mirrored from the galerina-data-db boundary.
// Their type is the literal `true`: relaxing one is not configuration, it
// is a different (and rejected) contract.
export interface FirestoreAdapterRequirements {
  readonly parameterisedOnly: true;
  readonly rawSqlDenied: true;
  readonly responseMappingRequired: true;
}

// The adapter must consume the typed data-family contracts. Refs are names
// into sibling packages (e.g. "@galerina/data-model#User"); each package
// stands alone at its boundary, so these are strings, never imports.
export interface FirestoreContractRefs {
  readonly modelContractRef: string;
  readonly queryContractRef: string;
  readonly responseContractRef: string;
}

// Credentials never travel inline. The only representable credential is an
// external reference resolved by a secrets holder at runtime.
export interface FirestoreCredentialRef {
  readonly kind: "external_ref";
  readonly ref: string;
}

// A path's collection/document meaning is declared, then checked against
// segment parity — never inferred silently.
export type FirestorePathKind = "collection" | "document";

export interface FirestorePathContract {
  readonly kind: FirestorePathKind;
  readonly path: string;
}

export type FirestoreIndexFieldOrder = "ascending" | "descending" | "array_contains";

export interface FirestoreIndexField {
  readonly name: string;
  readonly order: FirestoreIndexFieldOrder;
}

export interface FirestoreCompositeIndex {
  readonly collection: string;
  readonly fields: readonly FirestoreIndexField[];
}

export interface FirestoreAdapterDeclaration {
  readonly adapter: string;
  readonly provider: "firestore";
  readonly requirements: FirestoreAdapterRequirements;
  readonly contractRefs: FirestoreContractRefs;
  readonly projectId: string;
  readonly credential: FirestoreCredentialRef;
  // REQUIRED: a Firestore adapter without security rules is open.
  readonly securityRulesRef: string;
  readonly compositeIndexes: readonly FirestoreCompositeIndex[];
}

export type FirestoreAdapterCheck =
  | "declaration"
  | "nonNegotiables"
  | "typedContracts"
  | "securityRules"
  | "paths"
  | "indexes"
  | "credentials";

export type FirestoreAdapterCheckOutcome = "pass" | "fail";

export type FirestoreAdapterReportStatus = "success" | "partial" | "failed";

export interface FirestoreAdapterReport {
  readonly adapter: string;
  readonly provider: "firestore";
  readonly status: FirestoreAdapterReportStatus;
  readonly checks: Readonly<Record<FirestoreAdapterCheck, FirestoreAdapterCheckOutcome>>;
  readonly collectionPathCount: number;
  readonly documentPathCount: number;
  readonly diagnostics: readonly FirestoreDiagnostic[];
  readonly warnings: readonly string[];
}

export const KNOWN_FIRESTORE_PATH_KINDS: readonly FirestorePathKind[] = [
  "collection",
  "document",
];

export const KNOWN_FIRESTORE_INDEX_FIELD_ORDERS: readonly FirestoreIndexFieldOrder[] = [
  "ascending",
  "descending",
  "array_contains",
];

export const FIRESTORE_ADAPTER_CHECKS: readonly FirestoreAdapterCheck[] = [
  "declaration",
  "nonNegotiables",
  "typedContracts",
  "securityRules",
  "paths",
  "indexes",
  "credentials",
];

const KNOWN_PATH_KINDS: ReadonlySet<string> = new Set(KNOWN_FIRESTORE_PATH_KINDS);

const KNOWN_INDEX_FIELD_ORDERS: ReadonlySet<string> = new Set(
  KNOWN_FIRESTORE_INDEX_FIELD_ORDERS,
);

// "scheme://user:password@host" — a connection string carrying credentials.
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^/@\s]+:[^@\s]+@/;

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<FirestoreAdapterCheck, readonly string[]>> = {
  declaration: [
    "Galerina_DB_FIRESTORE_ADAPTER_NAME_REQUIRED",
    "Galerina_DB_FIRESTORE_PROVIDER_MISMATCH",
    "Galerina_DB_FIRESTORE_PROJECT_ID_REQUIRED",
  ],
  nonNegotiables: [
    "Galerina_DB_FIRESTORE_PARAMETERISED_ONLY_REQUIRED",
    "Galerina_DB_FIRESTORE_RAW_SQL_DENIAL_REQUIRED",
    "Galerina_DB_FIRESTORE_RESPONSE_MAPPING_REQUIRED",
  ],
  typedContracts: [
    "Galerina_DB_FIRESTORE_MODEL_CONTRACT_REF_REQUIRED",
    "Galerina_DB_FIRESTORE_QUERY_CONTRACT_REF_REQUIRED",
    "Galerina_DB_FIRESTORE_RESPONSE_CONTRACT_REF_REQUIRED",
  ],
  securityRules: ["Galerina_DB_FIRESTORE_SECURITY_RULES_REQUIRED"],
  paths: [
    "Galerina_DB_FIRESTORE_PATH_REQUIRED",
    "Galerina_DB_FIRESTORE_PATH_NOT_RELATIVE",
    "Galerina_DB_FIRESTORE_PATH_SEGMENT_EMPTY",
    "Galerina_DB_FIRESTORE_PATH_SEGMENT_INVALID",
    "Galerina_DB_FIRESTORE_PATH_KIND_UNKNOWN",
    "Galerina_DB_FIRESTORE_PATH_KIND_MISMATCH",
  ],
  indexes: [
    "Galerina_DB_FIRESTORE_INDEX_COLLECTION_REQUIRED",
    "Galerina_DB_FIRESTORE_INDEX_FIELDS_REQUIRED",
    "Galerina_DB_FIRESTORE_INDEX_FIELD_NAME_REQUIRED",
    "Galerina_DB_FIRESTORE_INDEX_FIELD_DUPLICATE",
    "Galerina_DB_FIRESTORE_INDEX_FIELD_ORDER_UNKNOWN",
  ],
  credentials: [
    "Galerina_DB_FIRESTORE_CREDENTIAL_KIND_INVALID",
    "Galerina_DB_FIRESTORE_CREDENTIAL_REF_REQUIRED",
    "Galerina_DB_FIRESTORE_INLINE_CREDENTIALS_FORBIDDEN",
  ],
};

function firestoreDiagnostic(
  code: string,
  severity: FirestoreDiagnosticSeverity,
  message: string,
  path?: string,
): FirestoreDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// Untyped callers can hand us an inline secret where the type says
// external reference; the contract re-checks and fails closed.
export function validateFirestoreCredentialRef(
  credential: FirestoreCredentialRef,
  path = "credential",
): readonly FirestoreDiagnostic[] {
  const diagnostics: FirestoreDiagnostic[] = [];

  if ((credential.kind as string) !== "external_ref") {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_CREDENTIAL_KIND_INVALID",
      "error",
      `Credential kind "${String(credential.kind)}" is not "external_ref"; inline credentials are unrepresentable.`,
      `${path}.kind`,
    ));
  }

  if (credential.ref.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_CREDENTIAL_REF_REQUIRED",
      "error",
      "Credential reference must be a non-empty external reference.",
      `${path}.ref`,
    ));
  } else if (CONNECTION_STRING_CREDENTIALS.test(credential.ref)) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Credential reference contains an inline user:password connection string; credentials never travel inline.",
      `${path}.ref`,
    ));
  }

  return diagnostics;
}

// Paths are relative segment strings; the declared kind is checked against
// segment parity (collection = odd, document = even), never inferred.
export function validateFirestorePath(
  pathContract: FirestorePathContract,
  path = "path",
): readonly FirestoreDiagnostic[] {
  const diagnostics: FirestoreDiagnostic[] = [];

  const kindKnown = KNOWN_PATH_KINDS.has(pathContract.kind);
  if (!kindKnown) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PATH_KIND_UNKNOWN",
      "error",
      `Path kind "${String(pathContract.kind)}" is not "collection" or "document".`,
      `${path}.kind`,
    ));
  }

  const value = pathContract.path;
  if (value.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PATH_REQUIRED",
      "error",
      "Firestore path requires at least one segment.",
      `${path}.path`,
    ));
    return diagnostics;
  }

  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PATH_NOT_RELATIVE",
      "error",
      `Firestore path "${value}" must be relative segments, not an absolute or drive-lettered path.`,
      `${path}.path`,
    ));
    return diagnostics;
  }

  const segments = value.split("/");
  let segmentsValid = true;

  if (segments.some((segment) => segment.trim().length === 0)) {
    segmentsValid = false;
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PATH_SEGMENT_EMPTY",
      "error",
      `Firestore path "${value}" contains an empty segment ("//" or a trailing slash).`,
      `${path}.path`,
    ));
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    segmentsValid = false;
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PATH_SEGMENT_INVALID",
      "error",
      `Firestore path "${value}" contains a "." or ".." segment; traversal segments are rejected.`,
      `${path}.path`,
    ));
  }

  // Parity semantics only mean anything once the kind and segments are
  // themselves valid.
  if (kindKnown && segmentsValid) {
    const expectOdd = pathContract.kind === "collection";
    const isOdd = segments.length % 2 === 1;
    if (expectOdd !== isOdd) {
      diagnostics.push(firestoreDiagnostic(
        "Galerina_DB_FIRESTORE_PATH_KIND_MISMATCH",
        "error",
        `A ${pathContract.kind} path requires an ${expectOdd ? "odd" : "even"} number of segments; "${value}" has ${segments.length}.`,
        `${path}.path`,
      ));
    }
  }

  return diagnostics;
}

// A composite index that does not name its fields cannot be reasoned about;
// one with fewer than two fields is not composite.
export function validateFirestoreCompositeIndex(
  index: FirestoreCompositeIndex,
  path = "compositeIndex",
): readonly FirestoreDiagnostic[] {
  const diagnostics: FirestoreDiagnostic[] = [];

  if (index.collection.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_INDEX_COLLECTION_REQUIRED",
      "error",
      "Composite index requires a collection name.",
      `${path}.collection`,
    ));
  }

  if (index.fields.length < 2) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_INDEX_FIELDS_REQUIRED",
      "error",
      "Composite index must name at least two fields.",
      `${path}.fields`,
    ));
  }

  const seen = new Set<string>();
  index.fields.forEach((field, fieldIndex) => {
    if (field.name.trim().length === 0) {
      diagnostics.push(firestoreDiagnostic(
        "Galerina_DB_FIRESTORE_INDEX_FIELD_NAME_REQUIRED",
        "error",
        "Composite index fields must be named.",
        `${path}.fields.${fieldIndex}.name`,
      ));
    } else if (seen.has(field.name)) {
      diagnostics.push(firestoreDiagnostic(
        "Galerina_DB_FIRESTORE_INDEX_FIELD_DUPLICATE",
        "error",
        `Composite index names field "${field.name}" more than once.`,
        `${path}.fields.${fieldIndex}.name`,
      ));
    }
    seen.add(field.name);

    if (!KNOWN_INDEX_FIELD_ORDERS.has(field.order)) {
      diagnostics.push(firestoreDiagnostic(
        "Galerina_DB_FIRESTORE_INDEX_FIELD_ORDER_UNKNOWN",
        "error",
        `Index field order "${String(field.order)}" is not a known order (ascending/descending/array_contains).`,
        `${path}.fields.${fieldIndex}.order`,
      ));
    }
  });

  return diagnostics;
}

export function validateFirestoreAdapterRequirements(
  requirements: FirestoreAdapterRequirements,
  path = "requirements",
): readonly FirestoreDiagnostic[] {
  const diagnostics: FirestoreDiagnostic[] = [];

  if ((requirements.parameterisedOnly as boolean) !== true) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PARAMETERISED_ONLY_REQUIRED",
      "error",
      "The Firestore adapter requires parameterised (typed-argument) access; this is not configurable.",
      `${path}.parameterisedOnly`,
    ));
  }

  if ((requirements.rawSqlDenied as boolean) !== true) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "The Firestore adapter denies raw query strings; this is not configurable.",
      `${path}.rawSqlDenied`,
    ));
  }

  if ((requirements.responseMappingRequired as boolean) !== true) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_RESPONSE_MAPPING_REQUIRED",
      "error",
      "The Firestore adapter requires model-to-response mapping; this is not configurable.",
      `${path}.responseMappingRequired`,
    ));
  }

  return diagnostics;
}

// "Must consume typed contracts" made checkable: an adapter that names no
// model/query/response contract is bypassing the typed data family.
export function validateFirestoreContractRefs(
  contractRefs: FirestoreContractRefs,
  path = "contractRefs",
): readonly FirestoreDiagnostic[] {
  const diagnostics: FirestoreDiagnostic[] = [];

  if (contractRefs.modelContractRef.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_MODEL_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-model contract reference.",
      `${path}.modelContractRef`,
    ));
  }

  if (contractRefs.queryContractRef.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_QUERY_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-query contract reference.",
      `${path}.queryContractRef`,
    ));
  }

  if (contractRefs.responseContractRef.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_RESPONSE_CONTRACT_REF_REQUIRED",
      "error",
      "Adapter requires a galerina-data-response contract reference.",
      `${path}.responseContractRef`,
    ));
  }

  return diagnostics;
}

export function validateFirestoreAdapterDeclaration(
  declaration: FirestoreAdapterDeclaration,
): readonly FirestoreDiagnostic[] {
  const diagnostics: FirestoreDiagnostic[] = [];

  if (declaration.adapter.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_ADAPTER_NAME_REQUIRED",
      "error",
      "Adapter declaration requires a name.",
      "adapter",
    ));
  }

  if ((declaration.provider as string) !== "firestore") {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PROVIDER_MISMATCH",
      "error",
      `Adapter provider "${String(declaration.provider)}" is not "firestore".`,
      "provider",
    ));
  }

  diagnostics.push(...validateFirestoreAdapterRequirements(declaration.requirements));
  diagnostics.push(...validateFirestoreContractRefs(declaration.contractRefs));

  if (declaration.projectId.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_PROJECT_ID_REQUIRED",
      "error",
      "Firestore adapter requires a project id.",
      "projectId",
    ));
  } else if (CONNECTION_STRING_CREDENTIALS.test(declaration.projectId)) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_INLINE_CREDENTIALS_FORBIDDEN",
      "error",
      "Project id contains an inline user:password connection string; credentials never travel inline.",
      "projectId",
    ));
  }

  diagnostics.push(...validateFirestoreCredentialRef(declaration.credential));

  // The open-database refusal: no rules reference, no adapter.
  if (declaration.securityRulesRef.trim().length === 0) {
    diagnostics.push(firestoreDiagnostic(
      "Galerina_DB_FIRESTORE_SECURITY_RULES_REQUIRED",
      "error",
      "Firestore adapter requires a security rules reference; an adapter without rules is an open database.",
      "securityRulesRef",
    ));
  }

  declaration.compositeIndexes.forEach((index, indexPosition) => {
    diagnostics.push(
      ...validateFirestoreCompositeIndex(index, `compositeIndexes.${indexPosition}`),
    );
  });

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveFirestoreAdapterStatus(
  diagnostics: readonly FirestoreDiagnostic[],
): FirestoreAdapterReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createFirestoreAdapterReport(input: {
  readonly declaration: FirestoreAdapterDeclaration;
  readonly paths?: readonly FirestorePathContract[];
}): FirestoreAdapterReport {
  const paths = input.paths ?? [];
  const diagnostics = [...validateFirestoreAdapterDeclaration(input.declaration)];

  let collectionPathCount = 0;
  let documentPathCount = 0;
  paths.forEach((pathContract, pathPosition) => {
    diagnostics.push(...validateFirestorePath(pathContract, `paths.${pathPosition}`));
    // Counts only ever include kinds the contract recognises.
    if (pathContract.kind === "collection") {
      collectionPathCount += 1;
    } else if (pathContract.kind === "document") {
      documentPathCount += 1;
    }
  });

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<FirestoreAdapterCheck, FirestoreAdapterCheckOutcome>;
  for (const check of FIRESTORE_ADAPTER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    adapter: input.declaration.adapter,
    provider: "firestore",
    status: deriveFirestoreAdapterStatus(diagnostics),
    checks,
    collectionPathCount,
    documentPathCount,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
