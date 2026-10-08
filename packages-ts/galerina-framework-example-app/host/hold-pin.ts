// hold-pin.ts — package side of the example-app HOLD rows.
//
// Golden `galerina new app` template. This package never adds a second route,
// never grants extra capabilities, and never owns fuse-border admission
// (that path is framework-app-kernel src/kernel.ts, Codex RD-1413).

export const EXAMPLE_APP_HOLD_PIN_SCHEMA = "galerina.framework-example-app.hold-pin.v1" as const;

export type ExampleAppHoldRefusalCode =
  | "EA_SECOND_ROUTE_FORBIDDEN"
  | "EA_GOLDEN_GRANT_FORBIDDEN"
  | "EA_FUSE_BORDER_KERNEL_FORBIDDEN"
  | "EA_CENTRAL_PACKAGE_REGISTRY_FORBIDDEN"
  | "EA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "EA_HOLD_REQUEST_MALFORMED";

export interface ExampleAppHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: ExampleAppHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface ExampleAppRouteRequestV1 {
  readonly kind: "EXAMPLE_APP_ROUTE_REQUEST";
  readonly schema: typeof EXAMPLE_APP_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADDED";
  readonly method: string;
  readonly path: string;
  readonly requires: {
    readonly ownerTemplateWiden: true;
    readonly matchingEffectsAndManifest: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type ExampleAppRouteRequestResult = ExampleAppRouteRequestV1 | ExampleAppHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "fuseBorder",
]);

const GOLDEN_ROUTE = Object.freeze({ method: "GET", path: "/hello" });

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasAuthorityField(value: unknown, depth: number): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && AUTHORITY_KEYS.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return true;
    if (hasAuthorityField(descriptor.value, depth + 1)) return true;
  }
  return false;
}

function boundedString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) return null;
  return value.trim();
}

function refusal(code: ExampleAppHoldRefusalCode): ExampleAppHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * Package a second-route *request*. Never adds the route.
 * The golden template already owns GET /hello; any other path stays REQUESTED_NOT_ADDED.
 */
export function prepareExampleAppRouteRequest(input: unknown): ExampleAppRouteRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("EA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("EA_HOLD_REQUEST_MALFORMED");
  const method = boundedString(input.method);
  const path = boundedString(input.path);
  if (method === null || path === null) return refusal("EA_HOLD_REQUEST_MALFORMED");
  if (method === GOLDEN_ROUTE.method && path === GOLDEN_ROUTE.path) {
    return refusal("EA_HOLD_REQUEST_MALFORMED");
  }
  return Object.freeze({
    kind: "EXAMPLE_APP_ROUTE_REQUEST",
    schema: EXAMPLE_APP_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADDED",
    method,
    path,
    requires: Object.freeze({
      ownerTemplateWiden: true,
      matchingEffectsAndManifest: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** A second host route is not the golden template. Every input is refused. */
export function addExampleAppRoute(_input: unknown): ExampleAppHoldRefusal {
  return refusal("EA_SECOND_ROUTE_FORBIDDEN");
}

/** Extra capability grants are not the golden template. Every input is refused. */
export function grantExampleAppCapability(_input: unknown): ExampleAppHoldRefusal {
  return refusal("EA_GOLDEN_GRANT_FORBIDDEN");
}

/** Fuse-border admission is kernel.ts in app-kernel. Every input is refused. */
export function wireFuseBorder(_input: unknown): ExampleAppHoldRefusal {
  return refusal("EA_FUSE_BORDER_KERNEL_FORBIDDEN");
}

/** A central package registry is not this template. Every input is refused. */
export function wireCentralPackageRegistry(_input: unknown): ExampleAppHoldRefusal {
  return refusal("EA_CENTRAL_PACKAGE_REGISTRY_FORBIDDEN");
}
