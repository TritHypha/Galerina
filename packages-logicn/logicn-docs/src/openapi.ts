/**
 * OpenAPI 3.x generation from the App Kernel's governed route table.
 *
 * The generator is a pure, I/O-free transform: `EffectiveRoutePolicy[]` (what the
 * kernel enforces) → `OpenApiDocument`. Each operation documents EXACTLY the gates
 * the kernel's fixed pipeline applies to that route — its auth requirement, the
 * body limits, the idempotency contract, the rate/concurrency limits, and the
 * precise set of error statuses the kernel can return — so the spec is a faithful
 * description of the governance surface, never a looser guess.
 *
 * Zero-trust posture:
 *   - No permissive defaults are invented. `auth.mode === "required"` →
 *     `security:[{bearerAuth:[]}]` + 401; `auth.mode === "public"` → `security:[]`,
 *     documented as the explicit relaxation the source chose.
 *   - The document is self-validated before return (see `./validate.ts`); on any
 *     structural defect the generator THROWS rather than emit a misleading contract.
 *   - The generator reads policy metadata only — never bodies, env, or secrets.
 */
import type {
  EffectiveRoutePolicy,
  GenerateOpenApiInput,
  OpenApiDocument,
  OpenApiInfo,
  OpenApiVersion,
  OperationObject,
  ParameterObject,
  PathItemObject,
  Reference,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
  SchemaOrRef,
  SecurityRequirementObject,
  SecuritySchemeObject,
  ComponentsObject,
  HttpOperationKey,
  MediaTypeObject,
} from "./types.js";
import type { HttpMethod } from "../../logicn-framework-app-kernel/dist/index.js";
import { resolveEffectiveRoutePolicy } from "../../logicn-framework-app-kernel/dist/index.js";
import { OpenApiGenerationError, validateOpenApiDocument } from "./validate.js";

const DEFAULT_VERSION: OpenApiVersion = "3.1.0";
const BEARER_SCHEME = "bearerAuth";
const ERROR_SCHEMA = "Error";

/** Methods that carry a JSON request body by contract (and so get body gates documented). */
const BODY_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  "POST", "PUT", "PATCH", "DELETE",
]);

const METHOD_TO_KEY: Readonly<Record<HttpMethod, HttpOperationKey>> = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
  OPTIONS: "options",
  HEAD: "head",
};

const BEARER_SCHEME_OBJECT: SecuritySchemeObject = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Bearer token — or, equivalently, a verified mutual-TLS channel (TLSTP S1 cert-gate). " +
    "Required by routes whose auth.mode is 'required'.",
};

const ERROR_SCHEMA_OBJECT: SchemaObject = {
  type: "object",
  description: "The kernel's typed error envelope: a stable error code plus a safe, secret-free message.",
  properties: {
    error: { type: "string", description: "Stable kernel error code (e.g. unauthorized, payload_too_large)." },
    message: { type: "string", description: "Human-readable, secret-free message." },
  },
  required: ["error"],
};

// ── small builders ───────────────────────────────────────────────────────────

function jsonContent(schema: SchemaOrRef): Readonly<Record<string, MediaTypeObject>> {
  return { "application/json": { schema } };
}

function errorResponse(description: string): ResponseObject {
  return { description, content: jsonContent({ $ref: `#/components/schemas/${ERROR_SCHEMA}` }) };
}

function contractTypePlaceholder(original: string): SchemaObject {
  return {
    type: "object",
    description:
      `LogicN contract type '${original}'. Referenced by a route's request/response; ` +
      `expand from the governed contract's types {} block.`,
    "x-logicn-source": "contract-type",
  };
}

/** OpenAPI component keys must match `^[a-zA-Z0-9._-]+$`. */
function sanitizeSchemaName(typeName: string): string {
  const cleaned = typeName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "Schema";
}

function sanitizeOperationId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "op";
}

/**
 * Convert a kernel route path to an OpenAPI path, mapping Express-style `:param`
 * (and already-templated `{param}`) segments to `{param}` and collecting the names.
 * A path that is not an absolute path fails closed.
 */
function convertPath(rawPath: string): { readonly path: string; readonly params: readonly string[] } {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/")) {
    throw new OpenApiGenerationError(`Route path must start with "/": got ${JSON.stringify(rawPath)}.`);
  }
  const params: string[] = [];
  const segments = rawPath.split("/").map((seg) => {
    if (seg.startsWith(":") && seg.length > 1) {
      const name = seg.slice(1);
      params.push(name);
      return `{${name}}`;
    }
    const templated = /^\{([^}]+)\}$/.exec(seg);
    const name = templated?.[1];
    if (name !== undefined && name.length > 0) {
      params.push(name);
      return seg;
    }
    return seg;
  });
  return { path: segments.join("/"), params };
}

/** Mutable build state threaded through the per-route builders. */
interface BuildContext {
  readonly usedOperationIds: Set<string>;
  /** sanitized schema name → original LogicN type name (for the placeholder description). */
  readonly referencedSchemas: Map<string, string>;
  anyAuthRequired: boolean;
}

function refSchema(typeName: string, ctx: BuildContext): Reference {
  const name = sanitizeSchemaName(typeName);
  if (!ctx.referencedSchemas.has(name)) ctx.referencedSchemas.set(name, typeName);
  return { $ref: `#/components/schemas/${name}` };
}

function uniqueOperationId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

/**
 * Build the OpenAPI operation for one resolved route policy, recording any
 * referenced component schemas and whether the auth scheme is needed.
 */
function buildOperation(
  policy: EffectiveRoutePolicy,
  openApiPath: string,
  pathParams: readonly string[],
  ctx: BuildContext,
): { readonly key: HttpOperationKey; readonly operation: OperationObject } {
  const method = policy.method;
  const key = METHOD_TO_KEY[method];
  if (key === undefined) {
    throw new OpenApiGenerationError(`Unsupported HTTP method '${method}' on route '${method} ${policy.path}'.`);
  }

  const handler = typeof policy.handler === "string" ? policy.handler : "";
  const idBase = sanitizeOperationId(handler.length > 0 ? handler : `${key}_${openApiPath}`);
  const operationId = uniqueOperationId(idBase, ctx.usedOperationIds);

  // ── parameters: path params (+ idempotency header, added below) ──
  const parameters: ParameterObject[] = [];
  for (const p of pathParams) {
    parameters.push({
      name: p,
      in: "path",
      required: true,
      description: `Path parameter '${p}'.`,
      schema: { type: "string" },
    });
  }

  // ── request body: documented when the route carries one by contract ──
  const acceptsBody = policy.requestType !== undefined || BODY_METHODS.has(method);
  let requestBody: RequestBodyObject | undefined;
  if (acceptsBody) {
    const schema: SchemaOrRef =
      policy.requestType !== undefined
        ? refSchema(policy.requestType, ctx)
        : { type: "object", description: "Request body (the route declares no requestType)." };
    requestBody = {
      required: true,
      description:
        `JSON request body. The kernel enforces: max ${policy.body.maxSizeBytes} bytes, ` +
        `content-type '${policy.body.contentType}', unknown-fields '${policy.body.unknownFields}', ` +
        `duplicate-keys '${policy.body.duplicateKeys}'.`,
      content: { [policy.body.contentType]: { schema } },
    };
  }

  // ── idempotency header ──
  if (policy.idempotency.enabled) {
    parameters.push({
      name: policy.idempotency.header,
      in: "header",
      required: false,
      description:
        `Idempotency key. When supplied, a duplicate within ${policy.idempotency.ttlSeconds}s ` +
        `is rejected with 409 (onDuplicate '${policy.idempotency.onDuplicate}').`,
      schema: { type: "string" },
    });
  }

  // ── security ──
  const authRequired = policy.auth.mode === "required";
  const scopes = policy.auth.scopes ?? [];
  let security: readonly SecurityRequirementObject[];
  if (authRequired) {
    ctx.anyAuthRequired = true;
    // Scopes cannot ride on an http-bearer requirement (must be empty per spec); they are
    // surfaced via x-logicn-scopes + the description instead.
    security = [{ [BEARER_SCHEME]: [] }];
  } else {
    security = []; // public: explicitly no security (the documented relaxation)
  }

  // ── responses: exactly what the kernel can return for this route ──
  const responses: Record<string, ResponseObject> = {};
  const successSchema: SchemaOrRef | undefined =
    policy.responseType !== undefined ? refSchema(policy.responseType, ctx) : undefined;
  responses["200"] =
    successSchema !== undefined
      ? { description: "Successful response.", content: jsonContent(successSchema) }
      : { description: "Successful response (no body)." };

  if (authRequired) {
    responses["401"] = errorResponse("Authentication required, or the channel/identity verdict denied admission.");
    if (scopes.length > 0) {
      responses["403"] = errorResponse(`Authenticated but missing a required scope (${scopes.join(", ")}).`);
    }
  }
  if (acceptsBody) {
    responses["413"] = errorResponse(`Request body exceeds the ${policy.body.maxSizeBytes}-byte limit.`);
    responses["415"] = errorResponse(`Unsupported content type (expected '${policy.body.contentType}').`);
    responses["422"] = errorResponse("Request body is not valid UTF-8 / JSON.");
  }
  if (policy.idempotency.enabled) {
    responses["409"] = errorResponse("Duplicate idempotency key.");
  }
  responses["429"] = errorResponse(
    `Rate or concurrency limit exceeded (rate '${policy.limits.rate}', maxConcurrent ${policy.limits.maxConcurrent}).`,
  );
  responses["500"] = errorResponse("Internal server error.");

  // ── description ──
  const descParts: string[] = [];
  descParts.push(
    authRequired
      ? scopes.length > 0
        ? `Requires authentication with scopes: ${scopes.join(", ")}.`
        : "Requires authentication."
      : "Public route — no authentication required.",
  );
  if (policy.relaxations.length > 0) {
    descParts.push(`Security relaxations: ${policy.relaxations.join(", ")}.`);
  }

  const operation: OperationObject = {
    operationId,
    summary: `${method} ${policy.path}`,
    description: descParts.join(" "),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestBody !== undefined ? { requestBody } : {}),
    responses,
    security,
    // governance provenance (x-logicn-*; template-literal index signature)
    "x-logicn-handler": handler,
    "x-logicn-rate-limit": policy.limits.rate,
    "x-logicn-max-concurrent": policy.limits.maxConcurrent,
    "x-logicn-timeout-ms": policy.limits.timeoutMs,
    "x-logicn-memory-bytes": policy.limits.memoryBytes,
    ...(acceptsBody
      ? {
          "x-logicn-max-body-bytes": policy.body.maxSizeBytes,
          "x-logicn-unknown-fields": policy.body.unknownFields,
          "x-logicn-duplicate-keys": policy.body.duplicateKeys,
        }
      : {}),
    ...(authRequired && scopes.length > 0 ? { "x-logicn-scopes": [...scopes] } : {}),
    ...(policy.relaxations.length > 0 ? { "x-logicn-relaxations": [...policy.relaxations] } : {}),
    ...(policy.appliedDefaults.length > 0 ? { "x-logicn-applied-defaults": [...policy.appliedDefaults] } : {}),
  };

  return { key, operation };
}

function cleanInfo(info: OpenApiInfo): OpenApiInfo {
  return {
    title: info.title,
    version: info.version,
    ...(info.description !== undefined ? { description: info.description } : {}),
  };
}

/** Internal mutable shape for accumulating operations onto a path item. */
type MutablePathItem = { -readonly [K in HttpOperationKey]?: OperationObject } & {
  parameters?: readonly ParameterObject[];
};

/**
 * Generate a valid OpenAPI 3.x document from a LogicN app's governed routes.
 *
 * Pass `routes` (resolved through the kernel's secure defaults for you) and/or
 * `policies` (documented verbatim). The returned document is self-validated; a
 * structural defect throws {@link OpenApiGenerationError} (fail-closed).
 */
export function generateOpenApi(input: GenerateOpenApiInput): OpenApiDocument {
  if (input === null || typeof input !== "object") {
    throw new OpenApiGenerationError("input is required.");
  }
  const info = input.info;
  if (info === undefined || typeof info.title !== "string" || info.title.trim() === "") {
    throw new OpenApiGenerationError("info.title is required and must be a non-empty string.");
  }
  if (typeof info.version !== "string" || info.version.trim() === "") {
    throw new OpenApiGenerationError("info.version is required and must be a non-empty string.");
  }

  const openApiVersion = input.openApiVersion ?? DEFAULT_VERSION;

  // Resolve declarations through the kernel's secure defaults; append verbatim policies.
  const resolveOpts = input.posture !== undefined ? { posture: input.posture } : {};
  const fromRoutes = (input.routes ?? []).map((r) => resolveEffectiveRoutePolicy(r, resolveOpts));
  const policies: readonly EffectiveRoutePolicy[] = [...(input.policies ?? []), ...fromRoutes];
  if (policies.length === 0) {
    throw new OpenApiGenerationError("No routes or policies supplied — refusing to emit an empty API document.");
  }

  const ctx: BuildContext = {
    usedOperationIds: new Set<string>(),
    referencedSchemas: new Map<string, string>(),
    anyAuthRequired: false,
  };

  const paths: Record<string, PathItemObject> = {};
  for (const policy of policies) {
    const { path, params } = convertPath(policy.path);
    const { key, operation } = buildOperation(policy, path, params, ctx);
    const item: MutablePathItem = { ...(paths[path] ?? {}) };
    if (item[key] !== undefined) {
      throw new OpenApiGenerationError(`Duplicate operation ${policy.method} ${policy.path}.`);
    }
    item[key] = operation;
    paths[path] = item;
  }

  // components.schemas: referenced contract types (placeholders) + the shared Error envelope.
  const schemas: Record<string, SchemaObject> = {};
  for (const [name, original] of ctx.referencedSchemas) {
    schemas[name] = contractTypePlaceholder(original);
  }
  schemas[ERROR_SCHEMA] = ERROR_SCHEMA_OBJECT;

  const components: ComponentsObject = ctx.anyAuthRequired
    ? { schemas, securitySchemes: { [BEARER_SCHEME]: BEARER_SCHEME_OBJECT } }
    : { schemas };

  const doc: OpenApiDocument = {
    openapi: openApiVersion,
    info: cleanInfo(info),
    ...(input.servers !== undefined && input.servers.length > 0 ? { servers: input.servers } : {}),
    paths,
    components,
  };

  // Fail closed: never return a document that is not a well-formed OpenAPI 3.x object.
  validateOpenApiDocument(doc);
  return doc;
}

/**
 * Spec-named alias for {@link generateOpenApi} — this is the `exportOpenApi`
 * entry point described in `logicn-framework-api-server` README §30.
 */
export const exportOpenApi = generateOpenApi;
