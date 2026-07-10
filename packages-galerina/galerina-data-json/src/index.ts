// JSON streaming and archive contracts.
//
// Everything here is fail-closed, mirroring the sibling contract packages
// (galerina-ai-neural, galerina-ai-agent): typed contracts plus runtime
// validators that return typed diagnostics. An unbounded decode is a
// denial-of-service primitive, an unknown schema kind must never validate
// silently, and an archive that claims personal data but redacts nothing is
// reported — never assumed safe.

export type JsonDecodeMode = "document" | "stream" | "json_lines";

// Memory policy for large-document decoding. Bounds are REQUIRED: parsing
// attacker-sized input without depth and byte limits is unbounded work, so a
// missing or non-positive bound is a contract error, not a default.
export interface JsonMemoryPolicy {
  readonly maxDepth: number;
  readonly maxDocumentBytes: number;
  readonly maxStringBytes?: number;
}

export interface JsonDecodePlan {
  readonly name: string;
  readonly mode: JsonDecodeMode;
  readonly memory: JsonMemoryPolicy;
}

export type JsonSchemaKind =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

export interface JsonSchemaField {
  readonly name: string;
  readonly kind: JsonSchemaKind;
  readonly required: boolean;
}

export interface JsonSchemaContract {
  readonly name: string;
  readonly root: JsonSchemaKind;
  readonly fields: readonly JsonSchemaField[];
}

// Partial extraction is expressed as RFC 6901 JSON Pointers. An empty pointer
// selects the whole document, which defeats "partial" extraction and silently
// widens the data surface — so it is rejected.
export interface JsonExtractionPlan {
  readonly source: string;
  readonly pointers: readonly string[];
}

// Redaction-before-archive policy. A policy must LIST the fields it redacts:
// a policy that claims personal data but names no fields redacts nothing.
export interface JsonRedactionPolicy {
  readonly name: string;
  readonly containsPersonalData: boolean;
  readonly redactFields: readonly string[];
  readonly replacement?: string;
}

export interface JsonArchiveReport {
  readonly archive: string;
  readonly mode: JsonDecodeMode;
  readonly documentCount: number;
  readonly redactedFieldCount: number;
  readonly redactionDeclared: boolean;
  readonly diagnostics: readonly JsonDiagnostic[];
  readonly warnings: readonly string[];
}

export type JsonDiagnosticSeverity = "warning" | "error";

export interface JsonDiagnostic {
  readonly code: string;
  readonly severity: JsonDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// Runtime sets deliberately typed over `string`: validators receive data that
// may not have passed the TypeScript compiler (config files, wire input), so
// membership is checked instead of trusted.
const KNOWN_DECODE_MODES: ReadonlySet<string> = new Set([
  "document",
  "stream",
  "json_lines",
]);

const KNOWN_SCHEMA_KINDS: ReadonlySet<string> = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

function jsonDiagnostic(
  code: string,
  severity: JsonDiagnosticSeverity,
  message: string,
  path?: string,
): JsonDiagnostic {
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

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

// Every bound a decode must satisfy. Unbounded parse = unsafe, so absent or
// non-positive limits are errors (never defaulted upward).
export function validateJsonMemoryPolicy(
  policy: JsonMemoryPolicy,
  path = "memory",
): readonly JsonDiagnostic[] {
  const diagnostics: JsonDiagnostic[] = [];

  if (!isPositiveSafeInteger(policy.maxDepth)) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_DEPTH_LIMIT_REQUIRED",
      "error",
      "JSON memory policy requires a positive integer maxDepth; unbounded nesting is unsafe.",
      `${path}.maxDepth`,
    ));
  }

  if (!isPositiveSafeInteger(policy.maxDocumentBytes)) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_DOCUMENT_LIMIT_REQUIRED",
      "error",
      "JSON memory policy requires a positive integer maxDocumentBytes; unbounded documents are unsafe.",
      `${path}.maxDocumentBytes`,
    ));
  }

  if (
    policy.maxStringBytes !== undefined &&
    !isPositiveSafeInteger(policy.maxStringBytes)
  ) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_STRING_LIMIT_INVALID",
      "error",
      "JSON memory policy maxStringBytes, when set, must be a positive integer.",
      `${path}.maxStringBytes`,
    ));
  }

  return diagnostics;
}

export function validateJsonDecodePlan(
  plan: JsonDecodePlan,
): readonly JsonDiagnostic[] {
  const diagnostics: JsonDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_PLAN_NAME_REQUIRED",
      "error",
      "JSON decode plan requires a name.",
      "name",
    ));
  }

  // Unknown mode is an error, not a fallback: silently treating an unknown
  // mode as "document" would load a stream whole into memory.
  if (!KNOWN_DECODE_MODES.has(plan.mode)) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_DECODE_MODE_UNKNOWN",
      "error",
      `JSON decode mode "${String(plan.mode)}" is not a known mode.`,
      "mode",
    ));
  }

  diagnostics.push(...validateJsonMemoryPolicy(plan.memory));

  return diagnostics;
}

// Schema validation must not silently pass unknown kinds: an unrecognised
// kind means the validator cannot make any claim about the data, and "no
// claim" must surface as an error rather than an implicit pass.
export function validateJsonSchemaContract(
  schema: JsonSchemaContract,
): readonly JsonDiagnostic[] {
  const diagnostics: JsonDiagnostic[] = [];

  if (schema.name.trim().length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_SCHEMA_NAME_REQUIRED",
      "error",
      "JSON schema contract requires a name.",
      "name",
    ));
  }

  if (!KNOWN_SCHEMA_KINDS.has(schema.root)) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_SCHEMA_KIND_UNKNOWN",
      "error",
      `JSON schema root kind "${String(schema.root)}" is not a known kind.`,
      "root",
    ));
  }

  const seenFieldNames = new Set<string>();
  schema.fields.forEach((field, index) => {
    if (field.name.trim().length === 0) {
      diagnostics.push(jsonDiagnostic(
        "Galerina_DATA_JSON_SCHEMA_FIELD_NAME_REQUIRED",
        "error",
        "JSON schema field requires a name.",
        `fields.${index}.name`,
      ));
      return;
    }

    if (seenFieldNames.has(field.name)) {
      diagnostics.push(jsonDiagnostic(
        "Galerina_DATA_JSON_SCHEMA_FIELD_DUPLICATE",
        "error",
        `JSON schema field "${field.name}" is declared more than once.`,
        `fields.${index}.name`,
      ));
    }
    seenFieldNames.add(field.name);

    if (!KNOWN_SCHEMA_KINDS.has(field.kind)) {
      diagnostics.push(jsonDiagnostic(
        "Galerina_DATA_JSON_SCHEMA_KIND_UNKNOWN",
        "error",
        `JSON schema field kind "${String(field.kind)}" is not a known kind.`,
        `fields.${index}.kind`,
      ));
    }
  });

  return diagnostics;
}

export function validateJsonExtractionPlan(
  plan: JsonExtractionPlan,
): readonly JsonDiagnostic[] {
  const diagnostics: JsonDiagnostic[] = [];

  if (plan.source.trim().length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_EXTRACTION_SOURCE_REQUIRED",
      "error",
      "JSON extraction plan requires a source.",
      "source",
    ));
  }

  if (plan.pointers.length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_EXTRACTION_POINTERS_REQUIRED",
      "error",
      "JSON extraction plan requires at least one JSON Pointer; partial extraction cannot be empty.",
      "pointers",
    ));
  }

  plan.pointers.forEach((pointer, index) => {
    // RFC 6901: a non-root pointer starts with "/". The empty (root) pointer
    // selects the whole document, defeating partial extraction, so it is
    // rejected alongside malformed pointers.
    if (!pointer.startsWith("/")) {
      diagnostics.push(jsonDiagnostic(
        "Galerina_DATA_JSON_POINTER_INVALID",
        "error",
        `JSON Pointer "${pointer}" must start with "/" and must not select the whole document.`,
        `pointers.${index}`,
      ));
    }
  });

  return diagnostics;
}

export function validateJsonRedactionPolicy(
  policy: JsonRedactionPolicy,
  path = "redaction",
): readonly JsonDiagnostic[] {
  const diagnostics: JsonDiagnostic[] = [];

  if (policy.name.trim().length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_REDACTION_NAME_REQUIRED",
      "error",
      "JSON redaction policy requires a name.",
      `${path}.name`,
    ));
  }

  // A policy that claims personal data but lists no fields redacts nothing.
  // Warning (not error) because the claim may be precautionary, but it must
  // never pass silently.
  if (policy.containsPersonalData && policy.redactFields.length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_REDACTION_FIELDS_EMPTY",
      "warning",
      "JSON redaction policy claims personal data but lists no fields to redact.",
      `${path}.redactFields`,
    ));
  }

  policy.redactFields.forEach((field, index) => {
    if (field.trim().length === 0) {
      diagnostics.push(jsonDiagnostic(
        "Galerina_DATA_JSON_REDACTION_FIELD_NAME_REQUIRED",
        "error",
        "JSON redaction field names must be non-empty.",
        `${path}.redactFields.${index}`,
      ));
    }
  });

  return diagnostics;
}

// Archive report builder. The report carries its own diagnostics so a caller
// can never archive "cleanly" past a bad plan: validation happens here, not
// in an optional side channel.
export function createJsonArchiveReport(input: {
  readonly archive: string;
  readonly plan: JsonDecodePlan;
  readonly redaction?: JsonRedactionPolicy;
  readonly documentCount: number;
  readonly redactedFieldCount: number;
}): JsonArchiveReport {
  const diagnostics: JsonDiagnostic[] = [];

  if (input.archive.trim().length === 0) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_ARCHIVE_NAME_REQUIRED",
      "error",
      "JSON archive report requires an archive name.",
      "archive",
    ));
  }

  diagnostics.push(...validateJsonDecodePlan(input.plan));

  if (input.redaction === undefined) {
    // Redaction-before-archive is the point of this package: an archive with
    // no declared redaction policy is not an error (data may be public) but
    // it must be visible in the report, never implicit.
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_ARCHIVE_REDACTION_UNDECLARED",
      "warning",
      "JSON archive declares no redaction policy; confirm the data is safe to archive unredacted.",
      "redaction",
    ));
  } else {
    diagnostics.push(...validateJsonRedactionPolicy(input.redaction));
  }

  if (!isNonNegativeSafeInteger(input.documentCount)) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_COUNT_INVALID",
      "error",
      "JSON archive documentCount must be a non-negative integer.",
      "documentCount",
    ));
  }

  if (!isNonNegativeSafeInteger(input.redactedFieldCount)) {
    diagnostics.push(jsonDiagnostic(
      "Galerina_DATA_JSON_COUNT_INVALID",
      "error",
      "JSON archive redactedFieldCount must be a non-negative integer.",
      "redactedFieldCount",
    ));
  }

  return {
    archive: input.archive,
    mode: input.plan.mode,
    documentCount: input.documentCount,
    redactedFieldCount: input.redactedFieldCount,
    redactionDeclared: input.redaction !== undefined,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
