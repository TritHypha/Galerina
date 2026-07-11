// =============================================================================
// Defensive controls (RD-0325 attacker-past-proxy + RD-0326 API enumeration).
//
// Five fail-closed decision surfaces that fall out of "the reverse proxy is a
// PERFORMANCE layer, never the security boundary" (RD-0325) and "enumeration
// resistance by default" (RD-0326). Each is a pure function — the host supplies
// the evidence (did mTLS verify? is the gateway token valid? what did the socket
// peer say?), these fold it fail-closed. They ride the RD-0322 rule: a
// fail-closed default with a recorded relaxation, never a fail-open convenience.
//
//   1. proxyIsTrusted / resolveClientAddress — trust X-Forwarded-* ONLY when the
//      proxy proved identity (verified+pinned mTLS, or a verified gateway token);
//      IP/header presence never confers trust.
//   2. uniformResourceResponse / uniformAuthResponse — collapse not-found vs
//      forbidden (and user-unknown vs bad-credentials) into ONE opaque denial so
//      the response carries no existence/authorization differential.
//   3. boundPageLimit — clamp page size to [1, maxLimit], defaulting on
//      absent/hostile input; never an unbounded dataset walk.
//   4. isOpaqueId — reject sequential/guessable ids at the boundary (generation
//      is a host CSPRNG concern; this validates the FORMAT).
//
// No node:* dependency — pure decisions, unit-testable, wireable into
// route-defaults / the inbound guard by the kernel.
// =============================================================================

// ── 1. Verified-trusted-proxy posture (RD-0325) ─────────────────────────────

/** How a proxy may prove it is the trusted gateway. `none` = no proof → untrusted. */
export type ProxyAuthMethod = "mtls" | "gateway-token" | "none";

/** Evidence the APP computed about the immediate peer's proxy identity (never self-asserted by headers). */
export interface ProxyTrustEvidence {
  readonly method: ProxyAuthMethod;
  /** mTLS: the app verified the client certificate chain. */
  readonly mtlsClientCertVerified?: boolean;
  /** mTLS: the verified subject matches the app's PINNED trusted-proxy subject (presence ≠ pinned). */
  readonly mtlsSubjectPinned?: boolean;
  /** gateway-token: the app verified a signed gateway token (not merely that a header was present). */
  readonly gatewayTokenVerified?: boolean;
}

/**
 * A proxy is trusted ONLY when it proved identity: a verified AND pinned mTLS client cert, or a verified
 * signed gateway token. Fail-closed — `none`, an unverified cert, an unpinned subject, or an unverified
 * token all yield `false`. Source IP / header presence never confer trust (they are spoofable).
 */
export function proxyIsTrusted(evidence: ProxyTrustEvidence): boolean {
  if (evidence.method === "mtls") {
    return evidence.mtlsClientCertVerified === true && evidence.mtlsSubjectPinned === true;
  }
  if (evidence.method === "gateway-token") {
    return evidence.gatewayTokenVerified === true;
  }
  return false;
}

export interface ClientAddressInput {
  /** The real TCP socket peer address — always authoritative. */
  readonly socketPeer: string;
  /** X-Forwarded-For (the client-nearest hop) — proxy-asserted, UNTRUSTED unless the proxy is verified. */
  readonly forwardedFor?: string;
  readonly proxy: ProxyTrustEvidence;
}

export interface ClientAddressDecision {
  readonly clientIp: string;
  readonly source: "forwarded" | "socket-peer";
  readonly proxyTrusted: boolean;
}

/**
 * Resolve the authoritative client address. `X-Forwarded-For` is honoured ONLY when the proxy is
 * verified-trusted AND the value is a non-blank string; otherwise the socket peer is authoritative.
 * Fail-closed: a forged or blank XFF (even under a trusted proxy) never becomes the identity — it falls
 * back to the socket peer, never to `""`.
 */
export function resolveClientAddress(input: ClientAddressInput): ClientAddressDecision {
  const trusted = proxyIsTrusted(input.proxy);
  const forwarded = (input.forwardedFor ?? "").trim();
  if (trusted && forwarded.length > 0) {
    return { clientIp: forwarded, source: "forwarded", proxyTrusted: true };
  }
  return { clientIp: input.socketPeer, source: "socket-peer", proxyTrusted: trusted };
}

// ── 2. Uniform, constant-time responses (RD-0326 — kill the enumeration differential) ──

/** Internal outcome of a resource access — DISTINCT internally, UNIFORM externally. */
export type ResourceOutcome = "ok" | "not-found" | "forbidden";
/** Internal outcome of an auth attempt — DISTINCT internally, UNIFORM externally. */
export type AuthOutcome = "ok" | "user-unknown" | "bad-credentials";

export interface UniformResourceDecision {
  readonly status: number;
  readonly code: string;
  readonly authorized: boolean;
}
export interface UniformAuthDecision {
  readonly status: number;
  readonly code: string;
  readonly authenticated: boolean;
}

/**
 * Collapse `not-found` and `forbidden` into ONE opaque denial (default 404 `not_found`) so a caller
 * cannot distinguish an absent resource from a present-but-forbidden one — the object-enumeration oracle
 * (OWASP-API BOLA probe). `ok` passes through. The compiled route graph already denies undeclared routes;
 * this makes the *response* non-revealing too.
 */
export function uniformResourceResponse(outcome: ResourceOutcome, notFoundStatus = 404): UniformResourceDecision {
  if (outcome === "ok") {
    return { status: 200, code: "ok", authorized: true };
  }
  // not-found AND forbidden → byte-identical denial (no existence differential).
  return { status: notFoundStatus, code: "not_found", authorized: false };
}

/**
 * Collapse `user-unknown` and `bad-credentials` into ONE generic denial (`401 invalid_credentials`) so a
 * caller cannot enumerate which accounts exist (the login / password-reset oracle). `ok` passes through.
 */
export function uniformAuthResponse(outcome: AuthOutcome): UniformAuthDecision {
  if (outcome === "ok") {
    return { status: 200, code: "ok", authenticated: true };
  }
  return { status: 401, code: "invalid_credentials", authenticated: false };
}

// ── 3. Bounded pagination (RD-0326 — no unbounded dataset walk) ──────────────

export interface PaginationPolicy {
  readonly defaultLimit: number;
  readonly maxLimit: number;
}

/** The secure default: a modest page with a hard cap — the walk vector is bounded by construction. */
export const SECURE_PAGINATION: PaginationPolicy = { defaultLimit: 25, maxLimit: 100 };

export interface PageLimitDecision {
  readonly limit: number;
  readonly clamped: boolean;
  readonly reason: "within-bounds" | "absent-or-invalid-defaulted" | "exceeds-max-capped";
}

/**
 * Clamp a requested page size to `[1, maxLimit]`, defaulting on absent / NaN / non-integer / ≤0. Fail-closed:
 * a missing or hostile (huge / negative / NaN) limit becomes the secure default or the cap — an attacker
 * cannot request the whole table in one page.
 */
export function boundPageLimit(
  requested: number | undefined,
  policy: PaginationPolicy = SECURE_PAGINATION,
): PageLimitDecision {
  if (requested === undefined || !Number.isInteger(requested) || requested <= 0) {
    return { limit: policy.defaultLimit, clamped: requested !== undefined, reason: "absent-or-invalid-defaulted" };
  }
  if (requested > policy.maxLimit) {
    return { limit: policy.maxLimit, clamped: true, reason: "exceeds-max-capped" };
  }
  return { limit: requested, clamped: false, reason: "within-bounds" };
}

// ── 4. Opaque IDs (RD-0326 / RD-0327 canonical id = OpaqueId) ────────────────

/** Minimum length for an id to be considered non-enumerable (≈96 bits of base64url). */
export const OPAQUE_ID_MIN_LENGTH = 16;
const OPAQUE_ID_CHARSET = /^[A-Za-z0-9_-]+$/; // URL-safe base64/base62 alphabet

/**
 * True iff `id` is OPAQUE — non-sequential and non-enumerable. Rejects a purely-numeric id (a sequential
 * database key is trivially guessable → dataset walk) and anything shorter than {@link OPAQUE_ID_MIN_LENGTH}
 * or outside the URL-safe alphabet. Generation is a host CSPRNG concern; this validates the FORMAT at the
 * boundary so a guessable id is refused fail-closed.
 */
export function isOpaqueId(id: string): boolean {
  if (typeof id !== "string") return false;
  const s = id.trim();
  if (s.length < OPAQUE_ID_MIN_LENGTH) return false;
  if (/^[0-9]+$/.test(s)) return false;      // pure integer → sequential/guessable
  return OPAQUE_ID_CHARSET.test(s);
}
