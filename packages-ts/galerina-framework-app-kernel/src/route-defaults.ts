/**
 * Secure-by-default route policy resolver (design-doc §10, framework P1).
 *
 * A minimal route declaration is a MAXIMALLY secure route. Omitting a block =
 * the secure default. Relaxing a default must be explicit, and every relaxation
 * is recorded for the security report. Under OS/HW posture `on` (#195, resolved
 * by @galerina/core-config), body + limit ceilings tighten further.
 */
import type {
  HttpMethod, RouteDeclaration, EffectiveRoutePolicy,
  AuthPolicy, BodyPolicy, IdempotencyPolicy, LimitsPolicy, AuditPolicy, SecretsPolicy,
} from "./types.js";
import { MUTATING_METHODS } from "./types.js";

/** Effective posture as resolved by @galerina/core-config (#195). Only on/off matters here. */
export type EffectivePosture = "off" | "on";

const KB = 1024;
const MB = 1024 * 1024;

// ── Closed declaration validation (app-frame hardening S1/S2/S8) ──
// Every declared value is checked at construction. An unknown, wrong-case, non-finite or
// non-integer value REFUSES (throws) instead of silently weakening a gate: NaN used to disable
// size/concurrency limits, and a typo'd auth mode used to fall open to public.
// Zero is accepted where it is fail-closed (a 0-byte body ceiling refuses every body, 0 in-flight
// refuses every call, a 0 ms deadline times out at once). No blanket "> 0" rule is applied.
const HTTP_METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const AUTH_MODES: ReadonlySet<string> = new Set(["required", "public"]);
/** "strip" is declared in the type but NOT implemented, so it is refused until it is. */
const UNKNOWN_FIELDS_MODES: ReadonlySet<string> = new Set(["deny", "allow"]);
const DUPLICATE_KEYS_MODES: ReadonlySet<string> = new Set(["deny", "lastWins"]);
/** "replay" is declared in the type but NOT implemented (a duplicate is always 409), so it is refused until it is. */
const ON_DUPLICATE_MODES: ReadonlySet<string> = new Set(["reject"]);
const RESOLVED_POSTURES: ReadonlySet<string> = new Set(["off", "on"]);
/** Largest delay a host timer honours; above it Node fires after 1 ms. */
const MAX_TIMER_MS = 2_147_483_647;
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function refuseRoute(route: RouteDeclaration, detail: string): never {
  const where = typeof route.method === "string" && typeof route.path === "string"
    ? `${route.method} ${route.path}`
    : "route";
  throw new Error(`Invalid route policy for '${where}': ${detail}`);
}

function isPresent(value: unknown): boolean {
  return value !== undefined;
}

function checkBlock(route: RouteDeclaration, name: string, value: unknown): void {
  if (isPresent(value) && (typeof value !== "object" || value === null || Array.isArray(value))) {
    refuseRoute(route, `'${name}' must be an object.`);
  }
}

function checkNonNegativeInteger(route: RouteDeclaration, name: string, value: unknown, max: number): void {
  if (!isPresent(value)) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) {
    refuseRoute(route, `'${name}' must be an integer from 0 to ${max} (got ${String(value)}).`);
  }
}

function checkPositiveFinite(route: RouteDeclaration, name: string, value: unknown): void {
  if (!isPresent(value)) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    refuseRoute(route, `'${name}' must be a finite number above 0 (got ${String(value)}).`);
  }
}

function checkEnum(route: RouteDeclaration, name: string, value: unknown, allowed: ReadonlySet<string>): void {
  if (!isPresent(value)) return;
  if (typeof value !== "string" || !allowed.has(value)) {
    refuseRoute(route, `'${name}' must be one of ${[...allowed].join(", ")} (got ${String(value)}).`);
  }
}

function checkBoolean(route: RouteDeclaration, name: string, value: unknown): void {
  if (isPresent(value) && typeof value !== "boolean") {
    refuseRoute(route, `'${name}' must be a boolean (got ${String(value)}).`);
  }
}

function checkNonEmptyString(route: RouteDeclaration, name: string, value: unknown): void {
  if (isPresent(value) && (typeof value !== "string" || value.trim().length === 0)) {
    refuseRoute(route, `'${name}' must be a non-empty string.`);
  }
}

function checkNameList(route: RouteDeclaration, name: string, value: unknown): void {
  if (!isPresent(value)) return;
  if (!Array.isArray(value)) refuseRoute(route, `'${name}' must be an array of names.`);
  const seen = new Set<string>();
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string" || item.trim().length === 0) refuseRoute(route, `'${name}' entries must be non-empty strings.`);
    if (seen.has(item as string)) refuseRoute(route, `'${name}' repeats '${item as string}'.`);
    seen.add(item as string);
  }
}

/**
 * Refuse a route declaration whose values the kernel cannot enforce exactly.
 * Called by resolveEffectiveRoutePolicy before any default is merged.
 */
export function assertRouteDeclaration(route: RouteDeclaration): void {
  if (typeof route !== "object" || route === null) throw new Error("Invalid route policy: a route declaration must be an object.");
  if (typeof route.method !== "string" || !HTTP_METHODS.has(route.method)) {
    refuseRoute(route, `'method' must be one of ${[...HTTP_METHODS].join(", ")} (got ${String(route.method)}).`);
  }
  if (typeof route.path !== "string" || !route.path.startsWith("/")) refuseRoute(route, "'path' must be a string starting with '/'.");
  if (typeof route.handler !== "string" || route.handler.length === 0) refuseRoute(route, "'handler' must be a non-empty string.");
  checkNonEmptyString(route, "requestType", route.requestType);
  checkNonEmptyString(route, "responseType", route.responseType);

  checkBlock(route, "auth", route.auth);
  if (isPresent(route.auth)) {
    checkEnum(route, "auth.mode", route.auth?.mode, AUTH_MODES);
    checkNameList(route, "auth.scopes", route.auth?.scopes);
  }

  checkBlock(route, "body", route.body);
  if (isPresent(route.body)) {
    if (route.body?.unknownFields === "strip") {
      refuseRoute(route, "'body.unknownFields: strip' is not implemented; use 'deny' or 'allow'.");
    }
    checkNonEmptyString(route, "body.contentType", route.body?.contentType);
    checkNonNegativeInteger(route, "body.maxSizeBytes", route.body?.maxSizeBytes, Number.MAX_SAFE_INTEGER);
    checkEnum(route, "body.unknownFields", route.body?.unknownFields, UNKNOWN_FIELDS_MODES);
    checkEnum(route, "body.duplicateKeys", route.body?.duplicateKeys, DUPLICATE_KEYS_MODES);
  }

  if (route.idempotency !== false) {
    checkBlock(route, "idempotency", route.idempotency);
    if (isPresent(route.idempotency)) {
      const o = route.idempotency as Partial<IdempotencyPolicy>;
      checkBoolean(route, "idempotency.enabled", o.enabled);
      if (isPresent(o.header) && (typeof o.header !== "string" || !HEADER_TOKEN.test(o.header))) {
        refuseRoute(route, "'idempotency.header' must be a valid HTTP header name.");
      }
      checkPositiveFinite(route, "idempotency.ttlSeconds", o.ttlSeconds);
      if (o.onDuplicate === "replay") {
        refuseRoute(route, "'idempotency.onDuplicate: replay' is not implemented; use 'reject'.");
      }
      checkEnum(route, "idempotency.onDuplicate", o.onDuplicate, ON_DUPLICATE_MODES);
    }
  }

  checkBlock(route, "limits", route.limits);
  if (isPresent(route.limits)) {
    if (isPresent(route.limits?.rate) && typeof route.limits?.rate !== "string") refuseRoute(route, "'limits.rate' must be a string like '60/minute'.");
    checkNonNegativeInteger(route, "limits.maxConcurrent", route.limits?.maxConcurrent, Number.MAX_SAFE_INTEGER);
    checkNonNegativeInteger(route, "limits.memoryBytes", route.limits?.memoryBytes, Number.MAX_SAFE_INTEGER);
    checkNonNegativeInteger(route, "limits.timeoutMs", route.limits?.timeoutMs, MAX_TIMER_MS);
  }

  checkBlock(route, "audit", route.audit);
  if (isPresent(route.audit)) checkBoolean(route, "audit.runtimeReport", route.audit?.runtimeReport);

  checkBlock(route, "secrets", route.secrets);
  if (isPresent(route.secrets)) checkNameList(route, "secrets.require", route.secrets?.require);
}

/** Deny-by-default secure baseline. */
export const SECURE_DEFAULTS = {
  auth: { mode: "required", scopes: [] } as AuthPolicy,
  body: { contentType: "application/json", maxSizeBytes: 256 * KB, unknownFields: "deny", duplicateKeys: "deny" } as BodyPolicy,
  limits: { rate: "60/minute", maxConcurrent: 10, memoryBytes: 32 * MB, timeoutMs: 10_000 } as LimitsPolicy,
  audit: { runtimeReport: true } as AuditPolicy,
} as const;

/** Hostile-host posture (`on`) tightens the body + limit ceilings. */
const HARDENED = {
  body: { contentType: "application/json", maxSizeBytes: 64 * KB, unknownFields: "deny", duplicateKeys: "deny" } as BodyPolicy,
  limits: { rate: "30/minute", maxConcurrent: 5, memoryBytes: 16 * MB, timeoutMs: 5_000 } as LimitsPolicy,
};

function methodAwareIdempotency(method: HttpMethod): IdempotencyPolicy {
  return {
    enabled: MUTATING_METHODS.has(method),   // on for POST/PUT/PATCH/DELETE
    header: "Idempotency-Key",
    ttlSeconds: 24 * 60 * 60,
    onDuplicate: "reject",
  };
}

export interface ResolveOptions {
  readonly posture?: EffectivePosture;
}

/**
 * Resolve a route declaration into the full policy the kernel enforces.
 * Returns the effective policy plus `appliedDefaults` (blocks taken from the
 * secure baseline) and `relaxations` (explicit weakenings, for the report).
 */
export function resolveEffectiveRoutePolicy(
  route: RouteDeclaration,
  opts: ResolveOptions = {},
): EffectiveRoutePolicy {
  if (isPresent(opts.posture) && (typeof opts.posture !== "string" || !RESOLVED_POSTURES.has(opts.posture))) {
    throw new Error(`Unknown resolved posture '${String(opts.posture)}'. Expected 'off' or 'on'.`);
  }
  assertRouteDeclaration(route);
  const hardened = opts.posture === "on";
  const baseBody = hardened ? HARDENED.body : SECURE_DEFAULTS.body;
  const baseLimits = hardened ? HARDENED.limits : SECURE_DEFAULTS.limits;

  const appliedDefaults: string[] = [];
  const relaxations: string[] = [];

  // ── auth — deny-by-default ──
  let auth: AuthPolicy;
  if (route.auth === undefined) {
    auth = SECURE_DEFAULTS.auth;
    appliedDefaults.push("auth");
  } else {
    if (route.auth.allowHeaderPresenceFallback === true) {
      throw new Error("Header-presence authentication is forbidden; supply a verified channel verdict and principal.");
    }
    auth = {
      mode: route.auth.mode ?? "required",
      scopes: route.auth.scopes ?? [],
    };
    if (auth.mode === "public") relaxations.push("auth:public");
  }

  // ── body ──
  let body: BodyPolicy;
  if (route.body === undefined) {
    body = baseBody;
    appliedDefaults.push("body");
  } else {
    body = {
      contentType: route.body.contentType ?? baseBody.contentType,
      maxSizeBytes: route.body.maxSizeBytes ?? baseBody.maxSizeBytes,
      unknownFields: route.body.unknownFields ?? baseBody.unknownFields,
      duplicateKeys: route.body.duplicateKeys ?? baseBody.duplicateKeys,
    };
    if (body.maxSizeBytes > baseBody.maxSizeBytes) relaxations.push(`body.maxSize:${body.maxSizeBytes}`);
    if (body.unknownFields !== "deny") relaxations.push(`body.unknownFields:${body.unknownFields}`);
    if (body.duplicateKeys !== "deny") relaxations.push(`body.duplicateKeys:${body.duplicateKeys}`);
  }

  // ── idempotency — method-aware default ──
  const idemDefault = methodAwareIdempotency(route.method);
  let idempotency: IdempotencyPolicy;
  if (route.idempotency === undefined) {
    idempotency = idemDefault;
    if (idemDefault.enabled) appliedDefaults.push("idempotency");
  } else if (route.idempotency === false) {
    idempotency = { ...idemDefault, enabled: false };
    if (MUTATING_METHODS.has(route.method)) relaxations.push("idempotency:disabled-on-mutating");
  } else {
    const o = route.idempotency;
    idempotency = {
      enabled: o.enabled ?? idemDefault.enabled,
      header: o.header ?? idemDefault.header,
      ttlSeconds: o.ttlSeconds ?? idemDefault.ttlSeconds,
      onDuplicate: o.onDuplicate ?? idemDefault.onDuplicate,
    };
    if (MUTATING_METHODS.has(route.method) && !idempotency.enabled) relaxations.push("idempotency:disabled-on-mutating");
  }

  // ── limits ──
  let limits: LimitsPolicy;
  if (route.limits === undefined) {
    limits = baseLimits;
    appliedDefaults.push("limits");
  } else {
    limits = {
      rate: route.limits.rate ?? baseLimits.rate,
      maxConcurrent: route.limits.maxConcurrent ?? baseLimits.maxConcurrent,
      memoryBytes: route.limits.memoryBytes ?? baseLimits.memoryBytes,
      timeoutMs: route.limits.timeoutMs ?? baseLimits.timeoutMs,
    };
    if (limits.maxConcurrent > baseLimits.maxConcurrent) relaxations.push(`limits.maxConcurrent:${limits.maxConcurrent}`);
  }

  // ── audit ──
  let audit: AuditPolicy;
  if (route.audit === undefined) {
    audit = SECURE_DEFAULTS.audit;
    appliedDefaults.push("audit");
  } else {
    audit = { runtimeReport: route.audit.runtimeReport ?? true };
    if (!audit.runtimeReport) relaxations.push("audit:off");
  }

  // ── secrets — default is an EMPTY require list (a strict no-op → non-breaking for every existing
  // route). A required secret only ever TIGHTENS admission (gate 9.5), so it is NOT a relaxation and
  // is never recorded in `relaxations[]`. The list is copied to keep the resolved policy immutable. ──
  const secrets: SecretsPolicy =
    route.secrets?.require === undefined ? { require: [] } : { require: [...route.secrets.require] };

  return {
    method: route.method,
    path: route.path,
    handler: route.handler,
    requestType: route.requestType,
    responseType: route.responseType,
    auth, body, idempotency, limits, audit, secrets,
    appliedDefaults,
    relaxations,
  };
}
