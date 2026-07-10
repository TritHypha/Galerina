// Safe model-to-response mapping contracts.
//
// Database data must not leave the server raw: it passes through a typed
// response model. The mapping is allowlist-based — a model field not named
// in the allowlist is DROPPED, never silently included — and a mapping that
// names a secret/credential field is an error. applyResponseMapping is the
// runtime enforcement of that projection, so "return the whole row" is not
// something this contract can express.

export type ResponseFieldClassification =
  | "public"
  | "internal"
  | "pii"
  | "secret"
  | "credential";

// Minimal classified view of the source storage model. Declared here rather
// than imported so this package stands alone at its boundary, matching how
// the sibling contract packages keep their vocabularies self-contained.
export interface SourceModelField {
  readonly name: string;
  readonly classification: ResponseFieldClassification;
}

export interface ResponseFieldMapping {
  readonly from: string;
  readonly to: string;
}

export interface ModelToResponseMapping {
  readonly model: string;
  readonly response: string;
  readonly allowlist: readonly ResponseFieldMapping[];
}

// An endpoint that declares no mapping is returning the storage model raw —
// exactly the failure mode this package exists to make visible.
export interface ResponseFlowDeclaration {
  readonly endpoint: string;
  readonly model: string;
  readonly mapping?: ModelToResponseMapping;
}

export type ResponseReportKind = "api" | "archive";

export interface ResponseReport {
  readonly kind: ResponseReportKind;
  readonly response: string;
  readonly mappedFieldCount: number;
  readonly droppedFieldCount: number;
  readonly diagnostics: readonly ResponseDiagnostic[];
  readonly warnings: readonly string[];
}

export type ResponseDiagnosticSeverity = "warning" | "error";

export interface ResponseDiagnostic {
  readonly code: string;
  readonly severity: ResponseDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const KNOWN_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "public",
  "internal",
  "pii",
  "secret",
  "credential",
]);

// Classifications that may NEVER appear in a response mapping. pii is
// warned (a user may legitimately see their own email) but secrets and
// credentials have no legitimate response path at all.
const FORBIDDEN_IN_RESPONSE: ReadonlySet<string> = new Set(["secret", "credential"]);

const KNOWN_REPORT_KINDS: ReadonlySet<string> = new Set(["api", "archive"]);

function responseDiagnostic(
  code: string,
  severity: ResponseDiagnosticSeverity,
  message: string,
  path?: string,
): ResponseDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

export function validateResponseMapping(
  mapping: ModelToResponseMapping,
  modelFields: readonly SourceModelField[],
  path = "mapping",
): readonly ResponseDiagnostic[] {
  const diagnostics: ResponseDiagnostic[] = [];

  if (mapping.model.trim().length === 0) {
    diagnostics.push(responseDiagnostic(
      "Galerina_DATA_RESPONSE_MODEL_NAME_REQUIRED",
      "error",
      "Response mapping requires a source model name.",
      `${path}.model`,
    ));
  }

  if (mapping.response.trim().length === 0) {
    diagnostics.push(responseDiagnostic(
      "Galerina_DATA_RESPONSE_NAME_REQUIRED",
      "error",
      "Response mapping requires a response model name.",
      `${path}.response`,
    ));
  }

  if (mapping.allowlist.length === 0) {
    // Valid but returns nothing; deny-by-default means empty is safe, but it
    // is almost never what the endpoint author intended.
    diagnostics.push(responseDiagnostic(
      "Galerina_DATA_RESPONSE_ALLOWLIST_EMPTY",
      "warning",
      "Response mapping allowlist is empty; the mapping is valid but returns nothing.",
      `${path}.allowlist`,
    ));
  }

  const classificationByField = new Map<string, string>();
  modelFields.forEach((field) => {
    classificationByField.set(field.name, field.classification);
  });

  const seenTargets = new Set<string>();
  mapping.allowlist.forEach((entry, index) => {
    if (entry.from.trim().length === 0 || entry.to.trim().length === 0) {
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_MAPPING_FIELD_REQUIRED",
        "error",
        "Response mapping entries require non-empty from and to field names.",
        `${path}.allowlist.${index}`,
      ));
      return;
    }

    if (seenTargets.has(entry.to)) {
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_MAPPING_DUPLICATE",
        "error",
        `Response field "${entry.to}" is mapped more than once; the projection would be ambiguous.`,
        `${path}.allowlist.${index}.to`,
      ));
    }
    seenTargets.add(entry.to);

    const classification = classificationByField.get(entry.from);
    if (classification === undefined) {
      // Mapping an undeclared field means mapping unclassified data —
      // fail-closed, because nobody can say whether it is safe to expose.
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_SOURCE_FIELD_UNKNOWN",
        "error",
        `Response mapping references undeclared model field "${entry.from}".`,
        `${path}.allowlist.${index}.from`,
      ));
      return;
    }

    if (!KNOWN_CLASSIFICATIONS.has(classification)) {
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_FIELD_UNCLASSIFIED",
        "error",
        `Model field "${entry.from}" carries an unknown classification "${classification}".`,
        `${path}.allowlist.${index}.from`,
      ));
      return;
    }

    if (FORBIDDEN_IN_RESPONSE.has(classification)) {
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_SENSITIVE_FIELD_EXPOSED",
        "error",
        `Model field "${entry.from}" is classified ${classification} and may never be mapped into a response.`,
        `${path}.allowlist.${index}.from`,
      ));
      return;
    }

    if (classification === "pii") {
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_PII_FIELD_EXPOSED",
        "warning",
        `Model field "${entry.from}" is classified pii; confirm this response is scoped to the data subject.`,
        `${path}.allowlist.${index}.from`,
      ));
    }
  });

  return diagnostics;
}

// Raw model return detection: an endpoint with no declared mapping is
// returning storage data directly. That is an error, not a warning — the
// entire contract of this package is that responses are projections.
export function validateResponseFlow(
  flow: ResponseFlowDeclaration,
  modelFields: readonly SourceModelField[],
): readonly ResponseDiagnostic[] {
  const diagnostics: ResponseDiagnostic[] = [];

  if (flow.endpoint.trim().length === 0) {
    diagnostics.push(responseDiagnostic(
      "Galerina_DATA_RESPONSE_ENDPOINT_REQUIRED",
      "error",
      "Response flow requires an endpoint name.",
      "endpoint",
    ));
  }

  if (flow.mapping === undefined) {
    diagnostics.push(responseDiagnostic(
      "Galerina_DATA_RESPONSE_RAW_MODEL_RETURN",
      "error",
      `Endpoint "${flow.endpoint}" returns model "${flow.model}" without a response mapping; raw model returns are denied.`,
      "mapping",
    ));
    return diagnostics;
  }

  diagnostics.push(...validateResponseMapping(flow.mapping, modelFields));
  return diagnostics;
}

// Runtime projection: copy ONLY allowlisted own-properties into the
// response. Everything else is dropped and named in droppedFields so the
// caller can see exactly what the allowlist held back.
export function applyResponseMapping(
  mapping: ModelToResponseMapping,
  record: Readonly<Record<string, unknown>>,
): {
  readonly response: Record<string, unknown>;
  readonly droppedFields: readonly string[];
} {
  const response: Record<string, unknown> = {};
  const mappedSources = new Set<string>();

  for (const entry of mapping.allowlist) {
    if (Object.prototype.hasOwnProperty.call(record, entry.from)) {
      response[entry.to] = record[entry.from];
      mappedSources.add(entry.from);
    }
  }

  const droppedFields = Object.keys(record).filter(
    (key) => !mappedSources.has(key),
  );

  return { response, droppedFields };
}

export function createResponseReport(input: {
  readonly kind: ResponseReportKind;
  readonly mapping: ModelToResponseMapping;
  readonly modelFields: readonly SourceModelField[];
  readonly mappedFieldCount: number;
  readonly droppedFieldCount: number;
}): ResponseReport {
  const diagnostics: ResponseDiagnostic[] = [];

  if (!KNOWN_REPORT_KINDS.has(input.kind)) {
    diagnostics.push(responseDiagnostic(
      "Galerina_DATA_RESPONSE_REPORT_KIND_UNKNOWN",
      "error",
      `Response report kind "${String(input.kind)}" is not a known kind.`,
      "kind",
    ));
  }

  diagnostics.push(...validateResponseMapping(input.mapping, input.modelFields));

  for (const [name, value] of [
    ["mappedFieldCount", input.mappedFieldCount],
    ["droppedFieldCount", input.droppedFieldCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      diagnostics.push(responseDiagnostic(
        "Galerina_DATA_RESPONSE_COUNT_INVALID",
        "error",
        `Response report ${name} must be a non-negative integer.`,
        name,
      ));
    }
  }

  return {
    kind: input.kind,
    response: input.mapping.response,
    mappedFieldCount: input.mappedFieldCount,
    droppedFieldCount: input.droppedFieldCount,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
