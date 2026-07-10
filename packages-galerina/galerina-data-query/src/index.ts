// Typed query/command declarations, parameterised access policy, raw-SQL
// denial policy, Option result handling and query report contracts.
//
// The goal is to make injection unrepresentable at the contract level:
// values reach a query ONLY through declared, typed, named parameters. A
// template carrying raw interpolation markers, stacked statements or
// undeclared placeholders is rejected, and raw SQL is denied by default —
// an exception exists only as an explicit, reviewed, expiring record.

export type QueryParameterType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "timestamp"
  | "uuid"
  | "json"
  | "binary";

export interface QueryParameter {
  readonly name: string;
  readonly type: QueryParameterType;
}

// Missing-result handling: "option" declares that absence is an expected,
// typed outcome rather than an exception or a null surprise.
export type QueryCardinality = "option" | "one" | "many";

export interface TypedQueryDeclaration {
  readonly name: string;
  readonly model: string;
  readonly parameters: readonly QueryParameter[];
  readonly template: string;
  readonly resultType: string;
  readonly cardinality: QueryCardinality;
}

export type CommandEffect = "insert" | "update" | "delete" | "upsert";

export interface TypedCommandDeclaration {
  readonly name: string;
  readonly model: string;
  readonly effect: CommandEffect;
  readonly parameters: readonly QueryParameter[];
  readonly template: string;
}

// Raw SQL is denied by default and the denial itself is not configurable:
// the field's type is the literal `true`. Exceptions are explicit records
// that must be reviewed, justified and time-boxed.
export interface RawSqlException {
  readonly queryName: string;
  readonly reviewedBy: string;
  readonly justification: string;
  readonly expiresAt: string;
}

export interface DatabaseAccessPolicy {
  readonly name: string;
  readonly rawSqlDenied: true;
  readonly exceptions: readonly RawSqlException[];
}

// Option result contract for missing-result handling.
export type QueryOption<T> =
  | { readonly kind: "some"; readonly value: T }
  | { readonly kind: "none" };

export function optionSome<T>(value: T): QueryOption<T> {
  return { kind: "some", value };
}

export function optionNone<T>(): QueryOption<T> {
  return { kind: "none" };
}

export function isSome<T>(
  option: QueryOption<T>,
): option is { readonly kind: "some"; readonly value: T } {
  return option.kind === "some";
}

export function unwrapOr<T>(option: QueryOption<T>, fallback: T): T {
  return option.kind === "some" ? option.value : fallback;
}

export interface QueryReport {
  readonly flow: string;
  readonly queries: readonly string[];
  readonly commands: readonly string[];
  readonly rawSqlExceptionCount: number;
  readonly diagnostics: readonly QueryDiagnostic[];
  readonly warnings: readonly string[];
}

export type QueryDiagnosticSeverity = "warning" | "error";

export interface QueryDiagnostic {
  readonly code: string;
  readonly severity: QueryDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const KNOWN_PARAMETER_TYPES: ReadonlySet<string> = new Set([
  "string",
  "integer",
  "float",
  "boolean",
  "timestamp",
  "uuid",
  "json",
  "binary",
]);

const KNOWN_CARDINALITIES: ReadonlySet<string> = new Set(["option", "one", "many"]);

const KNOWN_COMMAND_EFFECTS: ReadonlySet<string> = new Set([
  "insert",
  "update",
  "delete",
  "upsert",
]);

const PARAMETER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEHOLDER_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

function queryDiagnostic(
  code: string,
  severity: QueryDiagnosticSeverity,
  message: string,
  path?: string,
): QueryDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function validateParameters(
  parameters: readonly QueryParameter[],
  path: string,
): QueryDiagnostic[] {
  const diagnostics: QueryDiagnostic[] = [];
  const seen = new Set<string>();

  parameters.forEach((parameter, index) => {
    // An empty or non-identifier parameter name cannot be bound safely by
    // any driver, and empty names are how "anonymous" concatenation sneaks
    // back in — error, not warning.
    if (!PARAMETER_NAME_PATTERN.test(parameter.name)) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_PARAMETER_NAME_INVALID",
        "error",
        `Query parameter name "${parameter.name}" must be a non-empty identifier.`,
        `${path}.${index}.name`,
      ));
      return;
    }
    if (seen.has(parameter.name)) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_PARAMETER_DUPLICATE",
        "error",
        `Query parameter "${parameter.name}" is declared more than once.`,
        `${path}.${index}.name`,
      ));
    }
    seen.add(parameter.name);

    if (!KNOWN_PARAMETER_TYPES.has(parameter.type)) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_PARAMETER_TYPE_UNKNOWN",
        "error",
        `Query parameter type "${String(parameter.type)}" is not a known type.`,
        `${path}.${index}.type`,
      ));
    }
  });

  return diagnostics;
}

function validateTemplate(
  template: string,
  parameters: readonly QueryParameter[],
  path: string,
): QueryDiagnostic[] {
  const diagnostics: QueryDiagnostic[] = [];

  if (template.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_TEMPLATE_REQUIRED",
      "error",
      "Query template must be non-empty.",
      path,
    ));
    return diagnostics;
  }

  // Raw interpolation markers mean values are spliced into the text instead
  // of bound as parameters — the exact thing this contract exists to forbid.
  if (template.includes("${")) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_RAW_INTERPOLATION",
      "error",
      "Query template contains a raw interpolation marker (\"${\"); values must flow through declared parameters.",
      path,
    ));
  }

  // A ";" followed by more text is a stacked statement — the classic
  // injection escalation. One statement per declaration.
  const semicolonIndex = template.indexOf(";");
  if (semicolonIndex !== -1 && template.slice(semicolonIndex + 1).trim().length > 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_STACKED_STATEMENTS",
      "error",
      "Query template contains multiple statements; one statement per declaration.",
      path,
    ));
  }

  const declared = new Set(parameters.map((parameter) => parameter.name));
  const used = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const placeholder = match[1];
    if (placeholder === undefined) {
      continue;
    }
    used.add(placeholder);
    if (!declared.has(placeholder)) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_PLACEHOLDER_UNDECLARED",
        "error",
        `Template placeholder ":${placeholder}" has no declared parameter.`,
        path,
      ));
    }
  }

  // A declared-but-unused parameter is not exploitable, but it usually means
  // the template and the declaration drifted apart — surface it.
  for (const parameter of parameters) {
    if (PARAMETER_NAME_PATTERN.test(parameter.name) && !used.has(parameter.name)) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_PARAMETER_UNUSED",
        "warning",
        `Declared parameter "${parameter.name}" is not used by the template.`,
        path,
      ));
    }
  }

  return diagnostics;
}

export function validateTypedQuery(
  query: TypedQueryDeclaration,
): readonly QueryDiagnostic[] {
  const diagnostics: QueryDiagnostic[] = [];

  if (query.name.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_NAME_REQUIRED",
      "error",
      "Typed query requires a name.",
      "name",
    ));
  }

  if (query.model.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_MODEL_REQUIRED",
      "error",
      "Typed query requires a target model.",
      "model",
    ));
  }

  if (query.resultType.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_RESULT_TYPE_REQUIRED",
      "error",
      "Typed query requires a result type.",
      "resultType",
    ));
  }

  if (!KNOWN_CARDINALITIES.has(query.cardinality)) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_CARDINALITY_UNKNOWN",
      "error",
      `Query cardinality "${String(query.cardinality)}" is not a known cardinality.`,
      "cardinality",
    ));
  }

  diagnostics.push(...validateParameters(query.parameters, "parameters"));
  diagnostics.push(...validateTemplate(query.template, query.parameters, "template"));

  return diagnostics;
}

export function validateTypedCommand(
  command: TypedCommandDeclaration,
): readonly QueryDiagnostic[] {
  const diagnostics: QueryDiagnostic[] = [];

  if (command.name.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_NAME_REQUIRED",
      "error",
      "Typed command requires a name.",
      "name",
    ));
  }

  if (command.model.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_MODEL_REQUIRED",
      "error",
      "Typed command requires a target model.",
      "model",
    ));
  }

  if (!KNOWN_COMMAND_EFFECTS.has(command.effect)) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_COMMAND_EFFECT_UNKNOWN",
      "error",
      `Command effect "${String(command.effect)}" is not a known effect.`,
      "effect",
    ));
  }

  diagnostics.push(...validateParameters(command.parameters, "parameters"));
  diagnostics.push(...validateTemplate(command.template, command.parameters, "template"));

  return diagnostics;
}

// Raw SQL denial is the resting state. A policy object whose rawSqlDenied is
// anything but literal `true` (possible from untyped callers) fails closed,
// and every exception must be reviewed, justified and expiring.
export function validateDatabaseAccessPolicy(
  policy: DatabaseAccessPolicy,
): readonly QueryDiagnostic[] {
  const diagnostics: QueryDiagnostic[] = [];

  if (policy.name.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_POLICY_NAME_REQUIRED",
      "error",
      "Database access policy requires a name.",
      "name",
    ));
  }

  if ((policy.rawSqlDenied as boolean) !== true) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_RAW_SQL_DENIAL_REQUIRED",
      "error",
      "Database access policy must deny raw SQL by default; the denial is not configurable.",
      "rawSqlDenied",
    ));
  }

  policy.exceptions.forEach((exception, index) => {
    if (
      exception.queryName.trim().length === 0 ||
      exception.reviewedBy.trim().length === 0 ||
      exception.justification.trim().length === 0
    ) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_EXCEPTION_UNREVIEWED",
        "error",
        "Raw SQL exception requires a query name, a reviewer and a justification.",
        `exceptions.${index}`,
      ));
    }
    if (Number.isNaN(Date.parse(exception.expiresAt))) {
      diagnostics.push(queryDiagnostic(
        "Galerina_DATA_QUERY_EXCEPTION_EXPIRY_REQUIRED",
        "error",
        "Raw SQL exception requires a parseable expiry timestamp; open-ended overrides are not allowed.",
        `exceptions.${index}.expiresAt`,
      ));
    }
  });

  return diagnostics;
}

export function createQueryReport(input: {
  readonly flow: string;
  readonly queries: readonly TypedQueryDeclaration[];
  readonly commands: readonly TypedCommandDeclaration[];
  readonly policy: DatabaseAccessPolicy;
}): QueryReport {
  const diagnostics: QueryDiagnostic[] = [];

  if (input.flow.trim().length === 0) {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_FLOW_REQUIRED",
      "error",
      "Query report requires a flow name.",
      "flow",
    ));
  }

  input.queries.forEach((query) => {
    diagnostics.push(...validateTypedQuery(query));
  });
  input.commands.forEach((command) => {
    diagnostics.push(...validateTypedCommand(command));
  });
  diagnostics.push(...validateDatabaseAccessPolicy(input.policy));

  // Active raw-SQL exceptions are legitimate but never invisible: each one
  // surfaces as a warning in every report that carries the policy.
  input.policy.exceptions.forEach((exception, index) => {
    diagnostics.push(queryDiagnostic(
      "Galerina_DATA_QUERY_RAW_SQL_EXCEPTION_ACTIVE",
      "warning",
      `Raw SQL exception active for "${exception.queryName}" (expires ${exception.expiresAt}).`,
      `policy.exceptions.${index}`,
    ));
  });

  return {
    flow: input.flow,
    queries: input.queries.map((query) => query.name),
    commands: input.commands.map((command) => command.name),
    rawSqlExceptionCount: input.policy.exceptions.length,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
