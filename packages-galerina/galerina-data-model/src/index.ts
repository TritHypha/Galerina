// Typed storage model contracts: table/collection mapping, field types, key
// metadata, field classification, permissions and archive/retention refs.
//
// The zero-trust core: EVERY field must be classified (public / internal /
// pii / secret) — an unclassified field is an error because nothing
// downstream (responses, search, archive) can decide how to treat it — and a
// secret field must declare a non-plaintext storage mode. Storage models are
// not automatically safe API responses; only "public" is response-safe here.

export type ModelFieldClassification = "public" | "internal" | "pii" | "secret";

export type ModelFieldType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "timestamp"
  | "uuid"
  | "json"
  | "binary";

// How a secret may be stored. There is deliberately no "plaintext" member:
// a secret column that is not hashed, encrypted or externalised is a breach
// waiting to be exported.
export type SecretStorageMode = "hashed" | "encrypted" | "external_ref";

export interface ModelField {
  readonly name: string;
  readonly type: ModelFieldType;
  readonly classification: ModelFieldClassification;
  readonly nullable: boolean;
  readonly secretStorage?: SecretStorageMode;
}

export type ModelKeyKind = "primary" | "unique";

export interface ModelKey {
  readonly kind: ModelKeyKind;
  readonly fields: readonly string[];
}

export type ModelPermissionAction = "read" | "create" | "update" | "delete";

export interface ModelPermission {
  readonly role: string;
  readonly actions: readonly ModelPermissionAction[];
}

export type StorageKind = "table" | "collection";

export interface StorageMapping {
  readonly kind: StorageKind;
  readonly name: string;
}

export interface DataModelContract {
  readonly name: string;
  readonly storage: StorageMapping;
  readonly fields: readonly ModelField[];
  readonly keys: readonly ModelKey[];
  readonly permissions: readonly ModelPermission[];
  readonly archiveRef?: string;
  readonly retentionRef?: string;
}

export type DataModelDiagnosticSeverity = "warning" | "error";

export interface DataModelDiagnostic {
  readonly code: string;
  readonly severity: DataModelDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const KNOWN_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "public",
  "internal",
  "pii",
  "secret",
]);

const KNOWN_FIELD_TYPES: ReadonlySet<string> = new Set([
  "string",
  "integer",
  "float",
  "boolean",
  "timestamp",
  "uuid",
  "json",
  "binary",
]);

const KNOWN_SECRET_MODES: ReadonlySet<string> = new Set([
  "hashed",
  "encrypted",
  "external_ref",
]);

const KNOWN_KEY_KINDS: ReadonlySet<string> = new Set(["primary", "unique"]);

const KNOWN_STORAGE_KINDS: ReadonlySet<string> = new Set(["table", "collection"]);

const KNOWN_PERMISSION_ACTIONS: ReadonlySet<string> = new Set([
  "read",
  "create",
  "update",
  "delete",
]);

function modelDiagnostic(
  code: string,
  severity: DataModelDiagnosticSeverity,
  message: string,
  path?: string,
): DataModelDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// Storage models are not automatically safe API responses: only "public"
// survives a default response mapping. Everything else needs an explicit,
// reviewed allowlist entry in the response layer.
export function isResponseSafeClassification(
  classification: ModelFieldClassification,
): boolean {
  return classification === "public";
}

export function validateModelField(
  field: ModelField,
  path = "field",
): readonly DataModelDiagnostic[] {
  const diagnostics: DataModelDiagnostic[] = [];

  if (field.name.trim().length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_FIELD_NAME_REQUIRED",
      "error",
      "Model field requires a name.",
      `${path}.name`,
    ));
  }

  if (!KNOWN_FIELD_TYPES.has(field.type)) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_FIELD_TYPE_UNKNOWN",
      "error",
      `Model field type "${String(field.type)}" is not a known type.`,
      `${path}.type`,
    ));
  }

  // Unclassified data cannot be handled safely by ANY downstream consumer,
  // so a missing or unknown classification is an error, never a default.
  if (!KNOWN_CLASSIFICATIONS.has(field.classification)) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_FIELD_UNCLASSIFIED",
      "error",
      `Model field "${field.name}" has no valid classification (public/internal/pii/secret).`,
      `${path}.classification`,
    ));
  }

  if (field.classification === "secret") {
    // A secret with no declared non-plaintext storage mode IS plaintext.
    if (
      field.secretStorage === undefined ||
      !KNOWN_SECRET_MODES.has(field.secretStorage)
    ) {
      diagnostics.push(modelDiagnostic(
        "Galerina_DATA_MODEL_SECRET_PLAINTEXT",
        "error",
        `Secret field "${field.name}" must declare a non-plaintext storage mode (hashed/encrypted/external_ref).`,
        `${path}.secretStorage`,
      ));
    }
  }

  return diagnostics;
}

export function validateDataModel(
  model: DataModelContract,
): readonly DataModelDiagnostic[] {
  const diagnostics: DataModelDiagnostic[] = [];

  if (model.name.trim().length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_NAME_REQUIRED",
      "error",
      "Data model requires a name.",
      "name",
    ));
  }

  if (!KNOWN_STORAGE_KINDS.has(model.storage.kind)) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_STORAGE_KIND_UNKNOWN",
      "error",
      `Storage kind "${String(model.storage.kind)}" is not a known kind.`,
      "storage.kind",
    ));
  }

  if (model.storage.name.trim().length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_STORAGE_NAME_REQUIRED",
      "error",
      "Storage mapping requires a table or collection name.",
      "storage.name",
    ));
  }

  if (model.fields.length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_FIELDS_REQUIRED",
      "error",
      "Data model requires at least one field.",
      "fields",
    ));
  }

  const fieldNames = new Set<string>();
  model.fields.forEach((field, index) => {
    diagnostics.push(...validateModelField(field, `fields.${index}`));
    if (fieldNames.has(field.name)) {
      diagnostics.push(modelDiagnostic(
        "Galerina_DATA_MODEL_FIELD_DUPLICATE",
        "error",
        `Model field "${field.name}" is declared more than once.`,
        `fields.${index}.name`,
      ));
    }
    fieldNames.add(field.name);
  });

  // Addressability: a storage model needs exactly one primary key so
  // archive, restore and response mapping can identify rows unambiguously.
  const primaryKeys = model.keys.filter((key) => key.kind === "primary");
  if (primaryKeys.length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_PRIMARY_KEY_REQUIRED",
      "error",
      "Data model requires a primary key.",
      "keys",
    ));
  } else if (primaryKeys.length > 1) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_PRIMARY_KEY_DUPLICATE",
      "error",
      "Data model declares more than one primary key.",
      "keys",
    ));
  }

  model.keys.forEach((key, index) => {
    if (!KNOWN_KEY_KINDS.has(key.kind)) {
      diagnostics.push(modelDiagnostic(
        "Galerina_DATA_MODEL_KEY_KIND_UNKNOWN",
        "error",
        `Model key kind "${String(key.kind)}" is not a known kind.`,
        `keys.${index}.kind`,
      ));
    }
    if (key.fields.length === 0) {
      diagnostics.push(modelDiagnostic(
        "Galerina_DATA_MODEL_KEY_FIELDS_REQUIRED",
        "error",
        "Model key requires at least one field.",
        `keys.${index}.fields`,
      ));
    }
    key.fields.forEach((fieldName, fieldIndex) => {
      if (!fieldNames.has(fieldName)) {
        diagnostics.push(modelDiagnostic(
          "Galerina_DATA_MODEL_KEY_FIELD_UNKNOWN",
          "error",
          `Model key references undeclared field "${fieldName}".`,
          `keys.${index}.fields.${fieldIndex}`,
        ));
      }
    });
  });

  model.permissions.forEach((permission, index) => {
    if (permission.role.trim().length === 0) {
      diagnostics.push(modelDiagnostic(
        "Galerina_DATA_MODEL_PERMISSION_ROLE_REQUIRED",
        "error",
        "Model permission requires a role.",
        `permissions.${index}.role`,
      ));
    }
    permission.actions.forEach((action, actionIndex) => {
      if (!KNOWN_PERMISSION_ACTIONS.has(action)) {
        diagnostics.push(modelDiagnostic(
          "Galerina_DATA_MODEL_PERMISSION_ACTION_UNKNOWN",
          "error",
          `Model permission action "${String(action)}" is not a known action.`,
          `permissions.${index}.actions.${actionIndex}`,
        ));
      }
    });
  });

  // Optional references must be real references when present; a blank ref
  // reads as "configured" while pointing at nothing.
  if (model.archiveRef !== undefined && model.archiveRef.trim().length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_ARCHIVE_REF_INVALID",
      "error",
      "Model archiveRef, when set, must be non-empty.",
      "archiveRef",
    ));
  }
  if (model.retentionRef !== undefined && model.retentionRef.trim().length === 0) {
    diagnostics.push(modelDiagnostic(
      "Galerina_DATA_MODEL_RETENTION_REF_INVALID",
      "error",
      "Model retentionRef, when set, must be non-empty.",
      "retentionRef",
    ));
  }

  return diagnostics;
}

// Convenience partition used by response/search layers: which declared
// fields are response-safe by default. Secret/pii/internal fields are only
// exposable via an explicit allowlist elsewhere — never by this helper.
export function listResponseSafeFields(
  model: DataModelContract,
): readonly string[] {
  return model.fields
    .filter((field) => isResponseSafeClassification(field.classification))
    .map((field) => field.name);
}
