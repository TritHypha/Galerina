/**
 * Fail-closed structural self-validation for the emitted OpenAPI document.
 *
 * A documentation generator is a governance surface: a *broken* or *misleading*
 * API contract is worse than none, because clients and gateways trust it. So the
 * generator validates its own output before returning, and throws
 * {@link OpenApiGenerationError} rather than hand back a document that is not a
 * well-formed OpenAPI 3.x object. This is the zero-trust default applied to docs:
 * emit only what is provably valid.
 *
 * The checks are structural (not a full JSON-Schema meta-validation): version,
 * non-empty `info`, well-formed paths, every operation has responses, every
 * `operationId` is unique, every `$ref` resolves to a defined component, every
 * path-template `{param}` has a required path parameter (and vice-versa), and
 * every security requirement names a defined scheme.
 */
import type {
  OpenApiDocument,
  OperationObject,
  PathItemObject,
  HttpOperationKey,
} from "./types.js";

/** Thrown when the generator cannot produce — or was handed — a valid OpenAPI document. */
export class OpenApiGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenApiGenerationError";
  }
}

const OP_KEYS: readonly HttpOperationKey[] = [
  "get", "put", "post", "delete", "options", "head", "patch", "trace",
];

/** Yield every [verb, operation] present on a path item, in a stable order. */
function* operationEntries(
  item: PathItemObject,
): Iterable<readonly [HttpOperationKey, OperationObject]> {
  for (const k of OP_KEYS) {
    const op = item[k];
    if (op !== undefined) yield [k, op];
  }
}

/** Collect the `{param}` names templated into a path. */
function templateParams(path: string): Set<string> {
  const out = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    const name = m[1];
    if (name !== undefined && name.length > 0) out.add(name);
  }
  return out;
}

/** Deep-walk any value and collect every `$ref` string it contains. */
function collectRefs(value: unknown, acc: string[]): string[] {
  if (value === null || typeof value !== "object") return acc;
  if (Array.isArray(value)) {
    for (const v of value) collectRefs(v, acc);
    return acc;
  }
  const obj = value as Record<string, unknown>;
  const ref = obj["$ref"];
  if (typeof ref === "string") acc.push(ref);
  for (const k of Object.keys(obj)) {
    if (k === "$ref") continue;
    collectRefs(obj[k], acc);
  }
  return acc;
}

/**
 * Validate the document, throwing {@link OpenApiGenerationError} on the first
 * structural defect. Returns normally (void) when the document is well-formed.
 */
export function validateOpenApiDocument(doc: OpenApiDocument): void {
  // ── version ──
  if (typeof doc.openapi !== "string" || !/^3\.(0|1)\.\d+$/.test(doc.openapi)) {
    throw new OpenApiGenerationError(
      `openapi must be a 3.0.x or 3.1.x version string; got ${JSON.stringify(doc.openapi)}.`,
    );
  }

  // ── info ──
  if (doc.info === undefined || typeof doc.info.title !== "string" || doc.info.title.trim() === "") {
    throw new OpenApiGenerationError("info.title must be a non-empty string.");
  }
  if (typeof doc.info.version !== "string" || doc.info.version.trim() === "") {
    throw new OpenApiGenerationError("info.version must be a non-empty string.");
  }

  // ── paths ──
  if (doc.paths === undefined || typeof doc.paths !== "object") {
    throw new OpenApiGenerationError("paths must be an object.");
  }
  if (Object.keys(doc.paths).length === 0) {
    throw new OpenApiGenerationError("paths must contain at least one route.");
  }

  const operationIds = new Set<string>();
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!path.startsWith("/")) {
      throw new OpenApiGenerationError(`Path '${path}' must start with "/".`);
    }
    const tmpl = templateParams(path);

    for (const [verb, op] of operationEntries(item)) {
      const where = `${verb.toUpperCase()} ${path}`;

      if (typeof op.operationId !== "string" || op.operationId.length === 0) {
        throw new OpenApiGenerationError(`Operation ${where} is missing an operationId.`);
      }
      if (operationIds.has(op.operationId)) {
        throw new OpenApiGenerationError(`Duplicate operationId '${op.operationId}'.`);
      }
      operationIds.add(op.operationId);

      if (op.responses === undefined || Object.keys(op.responses).length === 0) {
        throw new OpenApiGenerationError(`Operation ${where} has no responses.`);
      }

      // Path parameters must correspond exactly to the `{param}` segments.
      const declared = new Set<string>();
      for (const p of op.parameters ?? []) {
        if (p.in === "path") {
          if (p.required !== true) {
            throw new OpenApiGenerationError(`Path parameter '${p.name}' on ${where} must be required.`);
          }
          declared.add(p.name);
        }
      }
      for (const t of tmpl) {
        if (!declared.has(t)) {
          throw new OpenApiGenerationError(`Path template '{${t}}' on ${where} has no matching path parameter.`);
        }
      }
      for (const d of declared) {
        if (!tmpl.has(d)) {
          throw new OpenApiGenerationError(`Path parameter '${d}' on ${where} is not present in the path template.`);
        }
      }
    }
  }

  // ── $ref resolution (only local component refs are ever emitted) ──
  const schemaNames = new Set(Object.keys(doc.components.schemas ?? {}));
  const schemeNames = new Set(Object.keys(doc.components.securitySchemes ?? {}));
  for (const ref of collectRefs(doc, [])) {
    const m = /^#\/components\/(schemas|securitySchemes)\/(.+)$/.exec(ref);
    const kind = m?.[1];
    const name = m?.[2];
    if (kind === undefined || name === undefined) {
      throw new OpenApiGenerationError(`Unsupported $ref '${ref}' — only local component refs are emitted.`);
    }
    if (kind === "schemas" && !schemaNames.has(name)) {
      throw new OpenApiGenerationError(`$ref '${ref}' does not resolve to a defined component schema.`);
    }
    if (kind === "securitySchemes" && !schemeNames.has(name)) {
      throw new OpenApiGenerationError(`$ref '${ref}' does not resolve to a defined security scheme.`);
    }
  }

  // ── security requirements must name a defined scheme ──
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [verb, op] of operationEntries(item)) {
      for (const req of op.security ?? []) {
        for (const schemeName of Object.keys(req)) {
          if (!schemeNames.has(schemeName)) {
            throw new OpenApiGenerationError(
              `Security scheme '${schemeName}' on ${verb.toUpperCase()} ${path} is not defined in components.securitySchemes.`,
            );
          }
        }
      }
    }
  }
}
