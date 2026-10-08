// App-kernel <-> api-server handoff contract (TODO pass, Grok 2026-10-06; zero-trust
// defaults, owner may revisit).
//
// Closes the app-kernel TODO row "Define app-kernel to galerina-framework-api-server
// contract". It RECORDS the handoff that already ships and checks a value against it;
// it is not wired into kernel.ts or the api-server (kernel.ts is RD-1413 work and is
// not edited here).
//
// The shipped handoff (galerina-framework-api-server src/index.ts, steps 3-6):
//  1. The api-server normalises one raw HTTP request into a GalerinaKernelRequest:
//     method upper-cased, header names lower-cased (multi-values joined ", "), body
//     bytes already read under maxBodyBytes, a flat decoded query record, a fresh
//     requestId and receivedAt. channelVerdict is added only when a transport factor
//     produced one; principalId + principalScopes are added together, only for an
//     authenticated principal.
//  2. It calls AppKernel.handle(request) exactly once. A throw becomes a fixed 500.
//  3. It writes the GalerinaKernelResponse (status, headers, optional body) back.
//
// Authority (RD-0855): channelVerdict is transport evidence, not authority. The kernel
// collapses it fail-closed (only ALLOW +1 admits; 0 and -1 refuse). This contract
// treats it as data and never admits anything.
//
// Known gap recorded, not fixed: the api-server's normaliseMethod casts ANY verb to
// HttpMethod (the kernel then fails closed with 404/405). This contract's request check
// refuses a verb outside the closed vocabulary, so a future wiring point would refuse
// earlier; today's runtime behaviour is unchanged.
//
// Zero-trust rules: closed shapes read through property descriptors (no getters run;
// proxies / symbols / accessors / custom prototypes refuse); unknown keys refuse;
// diagnostics never echo keys, header names, values, paths or ids; never throws.

import { types as nodeUtilTypes } from "node:util";

const isProxy = (value: unknown): boolean => nodeUtilTypes.isProxy(value);

/** Record / input is not a closed data object. */
export const FUNGI_APPK_ASH_001 = "FUNGI-APPK-ASH-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_ASH_002 = "FUNGI-APPK-ASH-002";
/** Header / query / scope collection refuse (shape, bound, or duplicate). */
export const FUNGI_APPK_ASH_003 = "FUNGI-APPK-ASH-003";
/** Principal consistency refuse (principalId and principalScopes travel together). */
export const FUNGI_APPK_ASH_004 = "FUNGI-APPK-ASH-004";
/** Response refuse (status / headers / body). */
export const FUNGI_APPK_ASH_005 = "FUNGI-APPK-ASH-005";

export const API_SERVER_HANDOFF_SCHEMA = "galerina.app-kernel.api-server-handoff/v1";

/** Closed method vocabulary (types.ts HttpMethod). */
export const KERNEL_HANDOFF_METHODS = Object.freeze(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const);

/** GalerinaKernelRequest fields (kernel.ts). A test pins this list to the kernel.ts source. */
export const KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS = Object.freeze(["method", "path", "headers", "body", "query", "requestId", "receivedAt"] as const);
export const KERNEL_HANDOFF_REQUEST_OPTIONAL_FIELDS = Object.freeze(["channelVerdict", "principalScopes", "principalId"] as const);

/** GalerinaKernelResponse fields (kernel.ts). */
export const KERNEL_HANDOFF_RESPONSE_REQUIRED_FIELDS = Object.freeze(["status", "headers"] as const);
export const KERNEL_HANDOFF_RESPONSE_OPTIONAL_FIELDS = Object.freeze(["body"] as const);

/** K3 channel verdict values (tower-citizen Verdict: DENY -1, INDETERMINATE 0, ALLOW +1). */
export const KERNEL_HANDOFF_CHANNEL_VERDICTS = Object.freeze([-1, 0, 1] as const);

/** Bounds (OWNER-REVISIT picks; none is tighter than what the api-server can legally hand over today). */
export const KERNEL_HANDOFF_LIMITS = Object.freeze({
  maxPathLength: 8192,
  maxHeaders: 256,
  maxHeaderNameLength: 256,
  maxHeaderValueLength: 65536,
  maxQueryEntries: 256,
  maxQueryValueLength: 8192,
  maxRequestIdLength: 128,
  maxPrincipalIdLength: 256,
  maxScopes: 256,
  maxScopeLength: 256,
});

export interface ApiServerHandoffDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export type ApiServerHandoffCheck =
  | { readonly ok: true; readonly schema: typeof API_SERVER_HANDOFF_SCHEMA }
  | { readonly ok: false; readonly schema: typeof API_SERVER_HANDOFF_SCHEMA; readonly diagnostics: readonly ApiServerHandoffDiagnostic[] };

const diag = (code: string, message: string, field: string): ApiServerHandoffDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, field });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function snapshot(value: unknown, maxKeys: number): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) return { ok: false };
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return { ok: false };
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) return { ok: false };
    const values = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d)) return { ok: false };
      values.set(key, d.value);
    }
    return { ok: true, values };
  } catch {
    return { ok: false };
  }
}

function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/** Exact Uint8Array (Node Buffer, a Uint8Array subclass, is admitted); never a proxy or detached view. */
function isBytes(value: unknown): boolean {
  try {
    return value instanceof Uint8Array && !isProxy(value) && value.buffer.byteLength >= value.byteLength;
  } catch {
    return false;
  }
}

function checkStringRecord(
  value: unknown,
  maxEntries: number,
  maxKeyLength: number,
  maxValueLength: number,
  lowercaseKeys: boolean,
  field: string,
  out: ApiServerHandoffDiagnostic[],
  code: string,
): void {
  const snap = snapshot(value, maxEntries);
  if (!snap.ok) {
    out.push(diag(code, "Collection must be a closed plain record within its entry bound.", field));
    return;
  }
  for (const [key, entry] of snap.values) {
    if (key.length === 0 || key.length > maxKeyLength || hasControl(key) || (lowercaseKeys && key !== key.toLowerCase())) {
      out.push(diag(code, "Collection contains an invalid name.", field));
      return;
    }
    if (typeof entry !== "string" || entry.length > maxValueLength || (lowercaseKeys && /[\r\n\0]/.test(entry))) {
      out.push(diag(code, "Collection contains an invalid value.", field));
      return;
    }
  }
}

function checkScopes(value: unknown, out: ApiServerHandoffDiagnostic[]): void {
  const L = KERNEL_HANDOFF_LIMITS;
  try {
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      out.push(diag(FUNGI_APPK_ASH_003, "principalScopes must be a dense array of scope tokens.", "principalScopes"));
      return;
    }
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || length > L.maxScopes) {
      out.push(diag(FUNGI_APPK_ASH_003, "principalScopes exceeds its bound.", "principalScopes"));
      return;
    }
    const seen = new Set<string>();
    for (let i = 0; i < length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      const scope: unknown = d !== undefined && "value" in d ? d.value : undefined;
      if (typeof scope !== "string" || scope.length === 0 || scope.length > L.maxScopeLength || hasControl(scope) || seen.has(scope)) {
        out.push(diag(FUNGI_APPK_ASH_003, "principalScopes contains a missing, invalid or duplicate scope.", "principalScopes"));
        return;
      }
      seen.add(scope);
    }
  } catch {
    out.push(diag(FUNGI_APPK_ASH_003, "principalScopes could not be read safely.", "principalScopes"));
  }
}

const finish = (out: ApiServerHandoffDiagnostic[]): ApiServerHandoffCheck =>
  out.length === 0
    ? Object.freeze({ ok: true as const, schema: API_SERVER_HANDOFF_SCHEMA })
    : Object.freeze({ ok: false as const, schema: API_SERVER_HANDOFF_SCHEMA, diagnostics: Object.freeze(out) });

/**
 * Check a value against the GalerinaKernelRequest the api-server hands to
 * AppKernel.handle. Data check only: a passing request is well-formed, not admitted.
 */
export function checkKernelHandoffRequest(value: unknown): ApiServerHandoffCheck {
  const out: ApiServerHandoffDiagnostic[] = [];
  const L = KERNEL_HANDOFF_LIMITS;
  const snap = snapshot(value, 16);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_ASH_001, "Kernel request must be a closed plain data record.", "record"));
    return finish(out);
  }
  const v = snap.values;
  const known = new Set<string>([...KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS, ...KERNEL_HANDOFF_REQUEST_OPTIONAL_FIELDS]);
  for (const key of v.keys()) {
    if (!known.has(key)) out.push(diag(FUNGI_APPK_ASH_001, "Kernel request contains an unknown field.", "record"));
  }
  for (const key of KERNEL_HANDOFF_REQUEST_REQUIRED_FIELDS) {
    if (!v.has(key)) out.push(diag(FUNGI_APPK_ASH_001, "Kernel request is missing a required field.", key));
  }
  if (out.length > 0) return finish(out);

  const method = v.get("method");
  if (typeof method !== "string" || !(KERNEL_HANDOFF_METHODS as readonly string[]).includes(method)) {
    out.push(diag(FUNGI_APPK_ASH_002, "method is outside the closed HttpMethod vocabulary.", "method"));
  }
  const path = v.get("path");
  if (typeof path !== "string" || !path.startsWith("/") || path.length > L.maxPathLength || hasControl(path) || path.includes("?") || path.includes("#")) {
    out.push(diag(FUNGI_APPK_ASH_002, "path must be an absolute, bounded request path without query, fragment or controls.", "path"));
  }
  checkStringRecord(v.get("headers"), L.maxHeaders, L.maxHeaderNameLength, L.maxHeaderValueLength, true, "headers", out, FUNGI_APPK_ASH_003);
  if (!isBytes(v.get("body"))) out.push(diag(FUNGI_APPK_ASH_002, "body must be a Uint8Array of already-read bytes.", "body"));
  checkStringRecord(v.get("query"), L.maxQueryEntries, L.maxQueryValueLength, L.maxQueryValueLength, false, "query", out, FUNGI_APPK_ASH_003);
  const requestId = v.get("requestId");
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > L.maxRequestIdLength || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    out.push(diag(FUNGI_APPK_ASH_002, "requestId must be a short opaque token.", "requestId"));
  }
  const receivedAt = v.get("receivedAt");
  if (typeof receivedAt !== "number" || !Number.isSafeInteger(receivedAt) || receivedAt < 0) {
    out.push(diag(FUNGI_APPK_ASH_002, "receivedAt must be a non-negative integer epoch-millisecond time.", "receivedAt"));
  }
  if (v.has("channelVerdict")) {
    const verdict = v.get("channelVerdict");
    if (typeof verdict !== "number" || !(KERNEL_HANDOFF_CHANNEL_VERDICTS as readonly number[]).includes(verdict) || Object.is(verdict, -0)) {
      out.push(diag(FUNGI_APPK_ASH_002, "channelVerdict must be a K3 verdict (-1, 0 or +1).", "channelVerdict"));
    }
  }
  const hasId = v.has("principalId");
  const hasScopes = v.has("principalScopes");
  if (hasId !== hasScopes) {
    out.push(diag(FUNGI_APPK_ASH_004, "principalId and principalScopes are handed over together or not at all.", "principalId"));
  }
  if (hasId) {
    const principalId = v.get("principalId");
    if (typeof principalId !== "string" || principalId.length === 0 || principalId.length > L.maxPrincipalIdLength || hasControl(principalId)) {
      out.push(diag(FUNGI_APPK_ASH_002, "principalId must be a bounded identity token.", "principalId"));
    }
  }
  if (hasScopes) checkScopes(v.get("principalScopes"), out);
  return finish(out);
}

/** Check a value against the GalerinaKernelResponse the api-server writes back. */
export function checkKernelHandoffResponse(value: unknown): ApiServerHandoffCheck {
  const out: ApiServerHandoffDiagnostic[] = [];
  const L = KERNEL_HANDOFF_LIMITS;
  const snap = snapshot(value, 8);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_ASH_001, "Kernel response must be a closed plain data record.", "record"));
    return finish(out);
  }
  const v = snap.values;
  const known = new Set<string>([...KERNEL_HANDOFF_RESPONSE_REQUIRED_FIELDS, ...KERNEL_HANDOFF_RESPONSE_OPTIONAL_FIELDS]);
  for (const key of v.keys()) {
    if (!known.has(key)) out.push(diag(FUNGI_APPK_ASH_001, "Kernel response contains an unknown field.", "record"));
  }
  for (const key of KERNEL_HANDOFF_RESPONSE_REQUIRED_FIELDS) {
    if (!v.has(key)) out.push(diag(FUNGI_APPK_ASH_001, "Kernel response is missing a required field.", key));
  }
  if (out.length > 0) return finish(out);
  const status = v.get("status");
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    out.push(diag(FUNGI_APPK_ASH_005, "status must be an integer HTTP status 100-599.", "status"));
  }
  checkStringRecord(v.get("headers"), L.maxHeaders, L.maxHeaderNameLength, L.maxHeaderValueLength, true, "headers", out, FUNGI_APPK_ASH_005);
  if (v.has("body") && !isBytes(v.get("body"))) out.push(diag(FUNGI_APPK_ASH_005, "body, when present, must be a Uint8Array.", "body"));
  return finish(out);
}
