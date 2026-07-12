// Umbrella typed database boundary contracts.
//
// The database is a typed, validated, permissioned and reportable boundary.
// Every operation crossing it declares its kind — model, query, command,
// response, archive or report — and an unknown kind is rejected outright:
// an operation the boundary cannot classify is an operation it cannot
// police. The boundary's standing requirements (parameterised-only access,
// raw-SQL denial, mandatory response mapping) are literal `true` in the
// type and re-checked at runtime so untyped callers cannot switch them off.
// No engine, ORM, migration tool or provider adapter lives here.

export type DbBoundaryOperationKind =
  | "model"
  | "query"
  | "command"
  | "response"
  | "archive"
  | "report";

export interface DbBoundaryOperation {
  readonly name: string;
  readonly kind: DbBoundaryOperationKind;
  readonly contractRef: string;
  readonly requiresPermission?: string;
}

// The three non-negotiables of the boundary. Their type is the literal
// `true`: relaxing them is not a configuration, it is a different (and
// rejected) contract.
export interface DbBoundaryRequirements {
  readonly parameterisedOnly: true;
  readonly rawSqlDenied: true;
  readonly responseMappingRequired: true;
}

export interface DbModelFlow {
  readonly model: string;
  readonly operations: readonly DbBoundaryOperation[];
  readonly requirements: DbBoundaryRequirements;
}

export interface DbReportIndexEntry {
  readonly kind: string;
  readonly location: string;
}

export interface DbReportIndex {
  readonly flow: string;
  readonly entries: readonly DbReportIndexEntry[];
}

export interface DbBoundaryReport {
  readonly flow: string;
  readonly operationCounts: Readonly<Record<DbBoundaryOperationKind, number>>;
  readonly diagnostics: readonly DbDiagnostic[];
  readonly warnings: readonly string[];
}

export type DbDiagnosticSeverity = "warning" | "error";

export interface DbDiagnostic {
  readonly code: string;
  readonly severity: DbDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export const KNOWN_DB_OPERATION_KINDS: readonly DbBoundaryOperationKind[] = [
  "model",
  "query",
  "command",
  "response",
  "archive",
  "report",
];

const KNOWN_KINDS: ReadonlySet<string> = new Set(KNOWN_DB_OPERATION_KINDS);

// Report index entries name family report artefacts (app.<name>.json) at
// relative locations — an index may never point outside its own tree.
const REPORT_KIND_PATTERN = /^app\.[a-z0-9-]+\.json$/;

function dbDiagnostic(
  code: string,
  severity: DbDiagnosticSeverity,
  message: string,
  path?: string,
): DbDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// The non-negotiable of this package: an operation whose kind the boundary
// does not recognise is rejected, never passed through "just in case".
export function validateDbBoundaryOperation(
  operation: DbBoundaryOperation,
  path = "operation",
): readonly DbDiagnostic[] {
  const diagnostics: DbDiagnostic[] = [];

  if (operation.name.trim().length === 0) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_OPERATION_NAME_REQUIRED",
      "error",
      "Database boundary operation requires a name.",
      `${path}.name`,
    ));
  }

  if (!KNOWN_KINDS.has(operation.kind)) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_OPERATION_KIND_UNKNOWN",
      "error",
      `Operation kind "${String(operation.kind)}" is not a known boundary kind (model/query/command/response/archive/report).`,
      `${path}.kind`,
    ));
  }

  if (operation.contractRef.trim().length === 0) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_CONTRACT_REF_REQUIRED",
      "error",
      "Database boundary operation requires a contract reference to its owning package contract.",
      `${path}.contractRef`,
    ));
  }

  if (
    operation.requiresPermission !== undefined &&
    operation.requiresPermission.trim().length === 0
  ) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_PERMISSION_REF_INVALID",
      "error",
      "Operation requiresPermission, when set, must be non-empty.",
      `${path}.requiresPermission`,
    ));
  }

  return diagnostics;
}

// Untyped callers can hand us `false` where the type says `true`; the
// boundary re-checks at runtime and fails closed.
export function validateDbBoundaryRequirements(
  requirements: DbBoundaryRequirements,
  path = "requirements",
): readonly DbDiagnostic[] {
  const diagnostics: DbDiagnostic[] = [];

  if ((requirements.parameterisedOnly as boolean) !== true) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_PARAMETERISED_ONLY_REQUIRED",
      "error",
      "The database boundary requires parameterised-only access; this is not configurable.",
      `${path}.parameterisedOnly`,
    ));
  }

  if ((requirements.rawSqlDenied as boolean) !== true) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "The database boundary denies raw SQL by default; this is not configurable.",
      `${path}.rawSqlDenied`,
    ));
  }

  if ((requirements.responseMappingRequired as boolean) !== true) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_RESPONSE_MAPPING_REQUIRED",
      "error",
      "The database boundary requires model-to-response mapping; this is not configurable.",
      `${path}.responseMappingRequired`,
    ));
  }

  return diagnostics;
}

export function validateDbModelFlow(
  flow: DbModelFlow,
): readonly DbDiagnostic[] {
  const diagnostics: DbDiagnostic[] = [];

  if (flow.model.trim().length === 0) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_MODEL_REQUIRED",
      "error",
      "Database model flow requires a model name.",
      "model",
    ));
  }

  if (flow.operations.length === 0) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_OPERATIONS_REQUIRED",
      "error",
      "Database model flow requires at least one operation.",
      "operations",
    ));
  }

  const seen = new Set<string>();
  let hasQuery = false;
  let hasResponse = false;

  flow.operations.forEach((operation, index) => {
    diagnostics.push(...validateDbBoundaryOperation(operation, `operations.${index}`));

    if (seen.has(operation.name)) {
      diagnostics.push(dbDiagnostic(
        "Galerina_DATA_DB_OPERATION_DUPLICATE",
        "error",
        `Operation "${operation.name}" is declared more than once in the flow.`,
        `operations.${index}.name`,
      ));
    }
    seen.add(operation.name);

    if (operation.kind === "query") {
      hasQuery = true;
    }
    if (operation.kind === "response") {
      hasResponse = true;
    }

    // Model permission integration: reads and writes that cross the
    // boundary without naming the permission they run under are visible.
    if (
      (operation.kind === "query" || operation.kind === "command") &&
      operation.requiresPermission === undefined
    ) {
      diagnostics.push(dbDiagnostic(
        "Galerina_DATA_DB_PERMISSION_UNDECLARED",
        "warning",
        `Operation "${operation.name}" (${operation.kind}) declares no required permission.`,
        `operations.${index}.requiresPermission`,
      ));
    }
  });

  diagnostics.push(...validateDbBoundaryRequirements(flow.requirements));

  // Safe response mapping requirement, applied to the flow shape itself: a
  // flow that queries data but declares no response boundary is shipping
  // storage rows somewhere unmapped.
  if (hasQuery && !hasResponse) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_RESPONSE_OPERATION_MISSING",
      "warning",
      "Flow declares query operations but no response operation; query results have no declared response boundary.",
      "operations",
    ));
  }

  return diagnostics;
}

export function validateDbReportIndex(
  index: DbReportIndex,
): readonly DbDiagnostic[] {
  const diagnostics: DbDiagnostic[] = [];

  if (index.flow.trim().length === 0) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_FLOW_REQUIRED",
      "error",
      "Database report index requires a flow name.",
      "flow",
    ));
  }

  if (index.entries.length === 0) {
    diagnostics.push(dbDiagnostic(
      "Galerina_DATA_DB_REPORT_INDEX_EMPTY",
      "warning",
      "Database report index has no entries; the index is valid but empty.",
      "entries",
    ));
  }

  const seen = new Set<string>();
  index.entries.forEach((entry, entryIndex) => {
    if (!REPORT_KIND_PATTERN.test(entry.kind)) {
      diagnostics.push(dbDiagnostic(
        "Galerina_DATA_DB_REPORT_KIND_INVALID",
        "error",
        `Report kind "${entry.kind}" must match app.<name>.json.`,
        `entries.${entryIndex}.kind`,
      ));
    }

    const location = entry.location;
    const traversal = location.split(/[\\/]/).some((segment) => segment === "..");
    if (
      location.trim().length === 0 ||
      location.startsWith("/") ||
      location.startsWith("\\") ||
      /^[A-Za-z]:/.test(location) ||
      traversal
    ) {
      diagnostics.push(dbDiagnostic(
        "Galerina_DATA_DB_REPORT_LOCATION_UNSAFE",
        "error",
        `Report location "${location}" must be a non-empty relative path without upward traversal.`,
        `entries.${entryIndex}.location`,
      ));
    }

    if (seen.has(entry.kind)) {
      diagnostics.push(dbDiagnostic(
        "Galerina_DATA_DB_REPORT_DUPLICATE",
        "error",
        `Report kind "${entry.kind}" is indexed more than once.`,
        `entries.${entryIndex}.kind`,
      ));
    }
    seen.add(entry.kind);
  });

  return diagnostics;
}

export function createDbBoundaryReport(input: {
  readonly flow: DbModelFlow;
}): DbBoundaryReport {
  const diagnostics = [...validateDbModelFlow(input.flow)];

  const operationCounts: Record<DbBoundaryOperationKind, number> = {
    model: 0,
    query: 0,
    command: 0,
    response: 0,
    archive: 0,
    report: 0,
  };
  for (const operation of input.flow.operations) {
    if (KNOWN_KINDS.has(operation.kind)) {
      operationCounts[operation.kind] += 1;
    }
  }

  return {
    flow: input.flow.model,
    operationCounts,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
