/**
 * @galerina/docs — type model.
 *
 * Two groups of types live here:
 *   1. The INPUT a caller hands the generator (`GenerateOpenApiInput`): an API
 *      `info` block plus either the App Kernel route DECLARATIONS (resolved through
 *      the secure defaults for us) or the already-resolved EFFECTIVE policies.
 *   2. The OUTPUT object model — the subset of the OpenAPI 3.x document model we
 *      emit. It is deliberately a faithful, well-typed subset, not the whole spec:
 *      we only ever produce local component `$ref`s, a single `bearerAuth` scheme,
 *      and a fixed error envelope, so a narrow model keeps the output honest.
 *
 * `x-galerina-*` vendor extensions are permitted on the objects that carry governance
 * provenance (operations, schemas) via a template-literal index signature — only
 * `x-`-prefixed keys are allowed, so the typed fields stay typed.
 *
 * The route types (`RouteDeclaration`, `EffectiveRoutePolicy`, `HttpMethod`,
 * `EffectivePosture`) are owned by `@galerina/framework-app-kernel`; this package
 * reads them, it does not redefine the route model.
 */
import type {
  RouteDeclaration,
  EffectiveRoutePolicy,
  EffectivePosture,
} from "../../galerina-framework-app-kernel/dist/index.js";

// Re-export the route types we accept so consumers can import the whole surface
// from `@galerina/docs` without reaching into the kernel package directly.
export type { RouteDeclaration, EffectiveRoutePolicy, EffectivePosture };

// ── OpenAPI document model (emitted subset) ─────────────────────────────────

/** A $ref to a local component (the only kind of reference this package emits). */
export interface Reference {
  readonly $ref: string;
}

/** A JSON-Schema object (the subset we emit) — or a {@link Reference} to one. */
export type SchemaOrRef = SchemaObject | Reference;

export interface SchemaObject {
  readonly type?: string;
  readonly format?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, SchemaOrRef>>;
  readonly required?: readonly string[];
  readonly items?: SchemaOrRef;
  readonly enum?: readonly unknown[];
  /** `x-galerina-*` provenance extensions only. */
  readonly [extension: `x-${string}`]: unknown;
}

export interface MediaTypeObject {
  readonly schema: SchemaOrRef;
}

export interface RequestBodyObject {
  readonly description?: string;
  readonly required?: boolean;
  readonly content: Readonly<Record<string, MediaTypeObject>>;
}

export interface ResponseObject {
  readonly description: string;
  readonly content?: Readonly<Record<string, MediaTypeObject>>;
}

export type ParameterLocation = "path" | "query" | "header" | "cookie";

export interface ParameterObject {
  readonly name: string;
  readonly in: ParameterLocation;
  readonly required?: boolean;
  readonly description?: string;
  readonly schema: SchemaOrRef;
}

/** scheme name → required scopes (empty for non-oauth2 schemes, per the spec). */
export type SecurityRequirementObject = Readonly<Record<string, readonly string[]>>;

/** The HTTP verbs an OpenAPI path item can carry, as lowercase operation keys. */
export type HttpOperationKey =
  | "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

export interface OperationObject {
  readonly operationId: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly ParameterObject[];
  readonly requestBody?: RequestBodyObject;
  readonly responses: Readonly<Record<string, ResponseObject>>;
  readonly security?: readonly SecurityRequirementObject[];
  /** `x-galerina-*` provenance extensions only (handler, limits, scopes, relaxations). */
  readonly [extension: `x-${string}`]: unknown;
}

export interface PathItemObject {
  readonly get?: OperationObject;
  readonly put?: OperationObject;
  readonly post?: OperationObject;
  readonly delete?: OperationObject;
  readonly options?: OperationObject;
  readonly head?: OperationObject;
  readonly patch?: OperationObject;
  readonly trace?: OperationObject;
  readonly parameters?: readonly ParameterObject[];
}

export interface HttpSecurityScheme {
  readonly type: "http";
  readonly scheme: "bearer";
  readonly bearerFormat?: string;
  readonly description?: string;
}

export interface ApiKeySecurityScheme {
  readonly type: "apiKey";
  readonly name: string;
  readonly in: "header" | "query" | "cookie";
  readonly description?: string;
}

export type SecuritySchemeObject = HttpSecurityScheme | ApiKeySecurityScheme;

export interface ComponentsObject {
  readonly schemas: Readonly<Record<string, SchemaObject>>;
  readonly securitySchemes?: Readonly<Record<string, SecuritySchemeObject>>;
}

export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
}

export interface OpenApiServer {
  readonly url: string;
  readonly description?: string;
}

export interface OpenApiDocument {
  readonly openapi: string;
  readonly info: OpenApiInfo;
  readonly servers?: readonly OpenApiServer[];
  readonly paths: Readonly<Record<string, PathItemObject>>;
  readonly components: ComponentsObject;
  readonly security?: readonly SecurityRequirementObject[];
}

// ── Generator input ─────────────────────────────────────────────────────────

/** Supported OpenAPI document versions. 3.1.0 is the default (matches the api-server spec). */
export type OpenApiVersion = "3.1.0" | "3.0.3";

/**
 * Input to {@link generateOpenApi}/{@link exportOpenApi}.
 *
 * Supply `routes` (resolved through the kernel's secure defaults for you) and/or
 * `policies` (the already-resolved effective policies, documented verbatim). At
 * least one route must be supplied across the two — an empty API fails closed.
 */
export interface GenerateOpenApiInput {
  readonly info: OpenApiInfo;
  /** Route declarations — resolved via `resolveEffectiveRoutePolicy` before documenting. */
  readonly routes?: readonly RouteDeclaration[];
  /** Already-resolved effective policies — documented exactly as the kernel enforces them. */
  readonly policies?: readonly EffectiveRoutePolicy[];
  /** Output document version. Default `"3.1.0"`. */
  readonly openApiVersion?: OpenApiVersion;
  /** Posture used when resolving `routes` (`"on"` tightens body/limit ceilings). Default `"off"`. */
  readonly posture?: EffectivePosture;
  /** Optional `servers` block copied into the document. */
  readonly servers?: readonly OpenApiServer[];
}
