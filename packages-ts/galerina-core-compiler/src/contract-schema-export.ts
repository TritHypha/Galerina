import { createHash } from "node:crypto";
import { parseProgram, type AstNode } from "./parser.js";

export const CONTRACT_TYPES_SCHEMA = "galerina.contract-types.v1";

export interface ContractJsonSchema {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, ContractJsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: ContractJsonSchema;
  readonly $ref?: string;
}

export interface CompilerContractSchemaExport {
  readonly schemaVersion: typeof CONTRACT_TYPES_SCHEMA;
  readonly sourceIdentity: string;
  readonly types: Readonly<Record<string, ContractJsonSchema>>;
}

export interface ContractSchemaDiagnostic {
  readonly code: string;
  readonly message: string;
}

export type ContractSchemaExportResult =
  | { readonly ok: true; readonly export: CompilerContractSchemaExport }
  | { readonly ok: false; readonly diagnostics: readonly ContractSchemaDiagnostic[] };

const FIELD = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/;

function ownRecord<V>(): Record<string, V> {
  return {};
}

function defineOwn<V>(target: Record<string, V>, key: string, value: V): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function sourceIdentity(source: string): string {
  return `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;
}

function stripQualifiers(typeName: string): string {
  let input = typeName.trim();
  if (input.startsWith("protected ")) input = input.slice("protected ".length).trim();
  if (input.startsWith("redacted ")) input = input.slice("redacted ".length).trim();
  return input;
}

function mapType(typeName: string, recordNames: ReadonlySet<string>): ContractJsonSchema | undefined {
  const input = stripQualifiers(typeName);
  if (input === "String") return { type: "string" };
  if (input === "Int") return { type: "integer" };
  if (input === "Bool") return { type: "boolean" };
  if (input.startsWith("Array<") && input.endsWith(">")) {
    const inner = input.slice("Array<".length, -1);
    const items = mapType(inner, recordNames);
    if (items === undefined) return undefined;
    return { type: "array", items };
  }
  if (recordNames.has(input)) {
    return { $ref: `#/types/${input}` };
  }
  return undefined;
}

function recordSchema(
  node: AstNode,
  recordNames: ReadonlySet<string>,
): ContractJsonSchema | ContractSchemaDiagnostic {
  const properties = ownRecord<ContractJsonSchema>();
  const required: string[] = [];
  const seen = new Set<string>();
  for (const field of node.children ?? []) {
    const raw = field.value ?? "";
    const match = FIELD.exec(raw);
    if (match === null || match[1] === undefined || match[2] === undefined) {
      return {
        code: "FUNGI-CONTRACT-SCHEMA-001",
        message: `Record '${node.value ?? ""}' field '${raw}' is not a typed contract field.`,
      };
    }
    const name = match[1];
    if (seen.has(name)) {
      return {
        code: "FUNGI-CONTRACT-SCHEMA-002",
        message: `Record '${node.value ?? ""}' repeats field '${name}'.`,
      };
    }
    const mapped = mapType(match[2], recordNames);
    if (mapped === undefined) {
      return {
        code: "FUNGI-CONTRACT-SCHEMA-003",
        message: `Record '${node.value ?? ""}' field '${name}' uses unsupported contract type '${match[2].trim()}'.`,
      };
    }
    seen.add(name);
    defineOwn(properties, name, mapped);
    required.push(name);
  }
  if (required.length === 0) {
    return {
      code: "FUNGI-CONTRACT-SCHEMA-004",
      message: `Record '${node.value ?? ""}' has no typed fields.`,
    };
  }
  return { type: "object", properties, required };
}

function collectRecords(node: AstNode, out: AstNode[]): void {
  if (node.kind === "recordDecl") out.push(node);
  for (const child of node.children ?? []) collectRecords(child, out);
}

export function exportContractSchemasFromSource(
  source: string,
  file = "contract.fungi",
): ContractSchemaExportResult {
  const parsed = parseProgram(source, file);
  const parseErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (parseErrors.length > 0) {
    return {
      ok: false,
      diagnostics: parseErrors.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
      })),
    };
  }

  const records: AstNode[] = [];
  collectRecords(parsed.ast, records);
  const recordNames = new Set<string>();
  for (const record of records) {
    const name = record.value?.trim() ?? "";
    if (name === "") {
      return {
        ok: false,
        diagnostics: [{ code: "FUNGI-CONTRACT-SCHEMA-005", message: "A record declaration is missing its name." }],
      };
    }
    if (recordNames.has(name)) {
      return {
        ok: false,
        diagnostics: [{
          code: "FUNGI-CONTRACT-SCHEMA-002",
          message: `Record '${name}' is declared more than once.`,
        }],
      };
    }
    recordNames.add(name);
  }
  const types = ownRecord<ContractJsonSchema>();
  for (const record of records) {
    const name = record.value?.trim() ?? "";
    const schema = recordSchema(record, recordNames);
    if ("code" in schema) return { ok: false, diagnostics: [schema] };
    defineOwn(types, name, schema);
  }
  if (Object.keys(types).length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: "FUNGI-CONTRACT-SCHEMA-004",
        message: "No record declarations were found for a contract schema export.",
      }],
    };
  }

  return {
    ok: true,
    export: Object.freeze({
      schemaVersion: CONTRACT_TYPES_SCHEMA,
      sourceIdentity: sourceIdentity(source),
      types: Object.freeze(types),
    }),
  };
}
