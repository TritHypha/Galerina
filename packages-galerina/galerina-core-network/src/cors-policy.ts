// cors-policy.ts — deny-by-default CORS admission (the browser cross-origin complement to inbound-guard.ts).
//
// CORS governs which cross-ORIGIN browsers may READ a response. The dangerous default in the wild is
// REFLECTING the request Origin into Access-Control-Allow-Origin without checking it — effectively "let any
// site read authenticated responses". This module is deny-by-default and NEVER reflects an unvalidated
// origin: only an EXACT match against the configured allow-list is admitted, and the response echoes THAT
// specific origin (with Vary: Origin) — never a wildcard combined with credentials.
//
// FOOTGUN DEFENCES (each explicit + tested):
//   1. NEVER reflect an unvalidated Origin — only an exact allow-list member is admitted and echoed.
//   2. EXACT origin match only, never substring/suffix (evil-good.com must not match good.com).
//   3. `null` Origin (sandboxed iframe / file:// / some redirects) is DENIED by default — a common bypass.
//   4. `*` + credentials is a forbidden, dangerous combination → treated as misconfiguration, DENIED.
//   5. Preflight (OPTIONS): the requested method and headers must be on the allow-lists, else DENY.
//   6. Same-origin / no Origin header → not a CORS concern → pass, emitting no CORS headers.
//
// Pure + deterministic (no I/O); mirrors inbound-guard's `{ allowed, reason, code }` decision shape.

export interface CorsPolicy {
  /**
   * EXACT origins permitted (`scheme://host[:port]`). Deny-by-default: an empty list admits NO cross-origin
   * request. The single token `"*"` permits any origin, but ONLY when `allowCredentials` is false (spec + safety).
   */
  readonly allowedOrigins: readonly string[];
  /** Methods permitted at preflight. Default: a safe `GET`/`HEAD`/`POST` set. */
  readonly allowedMethods?: readonly string[];
  /** Request headers permitted at preflight (matched case-insensitively). Default: none. */
  readonly allowedHeaders?: readonly string[];
  /** Allow credentials (cookies / Authorization). Default false. Cannot combine with `"*"`. */
  readonly allowCredentials?: boolean;
  /** Preflight cache lifetime (seconds). Omitted by default. */
  readonly maxAgeSec?: number;
}

export interface CorsRequest {
  /** The request's `Origin` header (undefined/empty = same-origin / non-CORS). */
  readonly origin?: string;
  /** The HTTP method of the actual request. */
  readonly method: string;
  /** True for a CORS preflight (`OPTIONS` + `Access-Control-Request-Method` present). */
  readonly isPreflight?: boolean;
  /** Preflight: the method the real request will use (`Access-Control-Request-Method`). */
  readonly requestMethod?: string;
  /** Preflight: the headers the real request will send (`Access-Control-Request-Headers`). */
  readonly requestHeaders?: readonly string[];
}

export interface CorsDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly code?: string;
  /** CORS response headers to set — populated only when admitted AND the request is cross-origin. */
  readonly headers?: Readonly<Record<string, string>>;
  /** True when this decision answers a preflight (the caller short-circuits with 204 + these headers). */
  readonly isPreflight: boolean;
}

const DEFAULT_METHODS = ["GET", "HEAD", "POST"] as const;

/**
 * Decide CORS admission for a request against a deny-by-default policy. Never reflects an unvalidated
 * origin; only an exact allow-list member (or `"*"` without credentials) is admitted.
 */
export function guardCorsRequest(req: CorsRequest, policy: CorsPolicy): CorsDecision {
  const isPreflight = req.isPreflight === true;

  // 6. No Origin ⇒ same-origin / non-browser ⇒ CORS does not apply. Pass, no CORS headers.
  const rawOrigin = req.origin?.trim() ?? "";
  if (rawOrigin.length === 0) {
    return { allowed: true, reason: "no Origin header — not a cross-origin request", isPreflight };
  }

  // 3. `null` is not a real origin (sandboxed iframe, file://, opaque redirects) — deny by default.
  if (rawOrigin.toLowerCase() === "null") {
    return { allowed: false, reason: "null Origin denied (deny-by-default)", code: "Galerina_NETWORK_CORS_NULL_ORIGIN", isPreflight };
  }

  const allowCredentials = policy.allowCredentials === true;
  const wildcard = policy.allowedOrigins.includes("*");

  // 4. `*` + credentials is forbidden by the Fetch spec and dangerous — fail closed on the misconfiguration.
  if (wildcard && allowCredentials) {
    return {
      allowed: false,
      reason: "wildcard origin combined with credentials is forbidden (misconfiguration)",
      code: "Galerina_NETWORK_CORS_WILDCARD_CREDENTIALS",
      isPreflight,
    };
  }

  // 1 + 2. Admit only an EXACT allow-list member (or `"*"` without credentials). No reflection, no suffix match.
  const exact = policy.allowedOrigins.includes(rawOrigin);
  if (!exact && !wildcard) {
    return {
      allowed: false,
      reason: `origin ${rawOrigin} is not on the CORS allow-list (deny-by-default)`,
      code: "Galerina_NETWORK_CORS_ORIGIN_DENIED",
      isPreflight,
    };
  }

  const methods = policy.allowedMethods ?? [...DEFAULT_METHODS];
  const allowHeaders = policy.allowedHeaders ?? [];

  // 5. Preflight: the requested method + every requested header must be permitted.
  if (isPreflight) {
    const reqMethod = (req.requestMethod ?? "").toUpperCase();
    if (reqMethod.length === 0 || !methods.map((m) => m.toUpperCase()).includes(reqMethod)) {
      return {
        allowed: false,
        reason: `preflight method ${reqMethod || "(none)"} is not allowed`,
        code: "Galerina_NETWORK_CORS_METHOD_DENIED",
        isPreflight,
      };
    }
    const allowedLower = new Set(allowHeaders.map((h) => h.toLowerCase()));
    const unlisted = (req.requestHeaders ?? []).map((h) => h.toLowerCase()).filter((h) => !allowedLower.has(h));
    if (unlisted.length > 0) {
      return {
        allowed: false,
        reason: `preflight requests disallowed header(s): ${unlisted.join(", ")}`,
        code: "Galerina_NETWORK_CORS_HEADER_DENIED",
        isPreflight,
      };
    }
  }

  // With credentials we MUST echo the specific origin (never "*"); a wildcard-without-credentials config may
  // answer "*". When the origin is also exactly listed we echo it (more precise than "*").
  const allowOriginHeader = wildcard && !allowCredentials && !exact ? "*" : rawOrigin;

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOriginHeader,
    // Vary: Origin so a shared cache never serves one origin's CORS response to another.
    Vary: "Origin",
  };
  if (allowCredentials) headers["Access-Control-Allow-Credentials"] = "true";
  if (isPreflight) {
    headers["Access-Control-Allow-Methods"] = methods.join(", ");
    if (allowHeaders.length > 0) headers["Access-Control-Allow-Headers"] = allowHeaders.join(", ");
    if (policy.maxAgeSec !== undefined && Number.isFinite(policy.maxAgeSec) && policy.maxAgeSec >= 0) {
      headers["Access-Control-Max-Age"] = String(Math.floor(policy.maxAgeSec));
    }
  }

  return { allowed: true, reason: `origin ${rawOrigin} admitted`, headers, isPreflight };
}
