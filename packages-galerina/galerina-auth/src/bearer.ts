/**
 * bearer.ts — JWT / bearer-token authentication FACTOR (a K3 verdict).
 *
 * This is the REAL token verification that credential.ts's `headerPresenceVerdict`
 * posture stands in for: it parses `Authorization: Bearer <jwt>`, verifies the
 * signature and the temporal/identity claims, and returns a Kleene-K3 `Verdict`
 * (+1 ALLOW / 0 INDETERMINATE / −1 DENY). Like every galerina-auth factor it
 * computes a verdict; it does NOT decide admission — compose it (compose.ts) and the
 * App Kernel performs the authoritative fail-closed collapse.
 *
 * VERDICT SEMANTICS (deny-by-default):
 *   - No token presented (absent/empty `Authorization`, or not a `Bearer` scheme)
 *     → INDETERMINATE (0): no positive evidence, never authorizes on its own — the
 *     same polarity credential.ts uses for "presence is not proof".
 *   - A token that is present but fails ANY check (malformed, bad signature, expired,
 *     not-yet-valid, wrong/absent required claim, disallowed algorithm) → DENY (−1):
 *     a definite refusal, the K3 annihilator.
 *   - A token that passes EVERY check → ALLOW (+1).
 *
 * THE FOOTGUN DEFENCES (JWT verification is a minefield; each is explicit + tested):
 *   1. ALGORITHM IS PINNED BY THE CALLER, NEVER THE TOKEN. `algorithms` is required and
 *      non-empty; a token whose header `alg` is not in that exact set is DENIED. This is
 *      the single defence that closes BOTH `alg:"none"` (unsigned) AND the RS256↔HS256
 *      confusion attack (an attacker re-signing an RS256 token as HS256 using the public
 *      key as the HMAC secret) — the token never gets to choose how it is verified.
 *   2. `alg:"none"` is refused explicitly as well (belt-and-braces with the pin).
 *   3. KEY-TYPE MUST MATCH THE ALGORITHM FAMILY. An HS* alg requires a symmetric secret;
 *      an RS* / EdDSA alg requires an asymmetric public key of the matching type. A
 *      mismatch DENIES — so even a misconfigured caller cannot verify an RSA token with
 *      an HMAC over the public key, or vice-versa.
 *   4. `exp` IS REQUIRED BY DEFAULT. A token with no expiry is DENIED unless the caller
 *      explicitly opts out (`requireExp:false`) — an eternal token is a deny-by-default
 *      hazard.
 *   5. HMAC comparison is constant-time (`timingSafeEqual`, length-guarded); asymmetric
 *      verification delegates to node:crypto (no hand-rolled crypto).
 *   6. Unsupported-but-listed algorithms (ES*) fail CLOSED (DENY), never silently pass.
 *
 * No new dependency (node:crypto only), no monkeypatching — the clock is an injected
 * seam (`now`) so tests are hermetic without touching Date.
 */

import { createHmac, timingSafeEqual, createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { Verdict } from "../../galerina-tower-citizen/dist/index.js";

/** JOSE algorithms this factor understands. ES* are recognised but fail closed (see §6). */
export type JwtAlg =
  | "HS256" | "HS384" | "HS512"
  | "RS256" | "RS384" | "RS512"
  | "ES256" | "ES384" | "ES512"
  | "EdDSA";

export interface BearerVerifyOptions {
  /**
   * Verification key. For HS* an HMAC secret (`string` | `Uint8Array`); for RS* / EdDSA a
   * PEM public key (`string`) or a node `KeyObject`. Deny-by-default: there is no default.
   */
  readonly key: string | Uint8Array | KeyObject;
  /**
   * The EXACT algorithm(s) permitted. REQUIRED and non-empty — the caller pins how the
   * token is verified; the token's own `alg` is only ever checked for MEMBERSHIP here.
   * This is footgun-defence #1.
   */
  readonly algorithms: readonly JwtAlg[];
  /** If set, the token's `iss` must equal this exactly, else DENY. */
  readonly issuer?: string;
  /** If set, the token's `aud` (string or array) must include this, else DENY. */
  readonly audience?: string;
  /** Clock-skew tolerance (seconds) applied to `exp`/`nbf`. Default 0 (strict). */
  readonly clockToleranceSec?: number;
  /** Require an `exp` claim. Default TRUE — a token with no expiry is DENIED. */
  readonly requireExp?: boolean;
  /** Injected clock (seconds since epoch) — the test seam. Default `Date.now()/1000`. */
  readonly now?: () => number;
  /** Header to read the bearer token from (case-insensitive). Default `"authorization"`. */
  readonly header?: string;
}

const HMAC_HASH: Partial<Record<JwtAlg, string>> = { HS256: "sha256", HS384: "sha384", HS512: "sha512" };
const RSA_HASH: Partial<Record<JwtAlg, string>> = { RS256: "sha256", RS384: "sha384", RS512: "sha512" };

/** Case-insensitive header lookup over a frozen record (mirrors credential.ts). */
function header(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return undefined;
}

/** Strict base64url → Buffer. Rejects a non-base64url alphabet (returns null → DENY). */
function b64urlToBuf(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null; // padded/standard base64 or junk → reject
  try {
    return Buffer.from(s, "base64url");
  } catch {
    return null;
  }
}

/** Parse a base64url JSON segment into a plain object, or null if malformed. */
function parseJsonSegment(seg: string): Record<string, unknown> | null {
  const buf = b64urlToBuf(seg);
  if (buf === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Verify the signature over `signingInput` for a pinned `alg`. Any uncertainty → false. */
function verifySignature(
  alg: JwtAlg,
  signingInput: string,
  signature: Buffer,
  key: string | Uint8Array | KeyObject,
): boolean {
  try {
    // ── HMAC family: constant-time compare of the recomputed tag ──
    if (alg in HMAC_HASH) {
      // Key-type defence (#3): an asymmetric KeyObject must NOT be used as an HMAC secret.
      if (typeof key === "object" && !(key instanceof Uint8Array)) return false;
      const secret = typeof key === "string" ? Buffer.from(key, "utf8") : Buffer.from(key as Uint8Array);
      const expected = createHmac(HMAC_HASH[alg] as string, secret).update(signingInput).digest();
      // timingSafeEqual throws on unequal lengths — a length mismatch is simply a non-match.
      return expected.length === signature.length && timingSafeEqual(expected, signature);
    }

    // ── RSA (RS*) and EdDSA: node:crypto asymmetric verify with a matching key type ──
    // An already-public KeyObject is used DIRECTLY — createPublicKey() rejects a public
    // KeyObject ("expected private"); it only parses/derives from a PEM string or DER bytes.
    const pub = typeof key === "string"
      ? createPublicKey(key)
      : key instanceof Uint8Array
        ? createPublicKey({ key: Buffer.from(key), format: "der", type: "spki" })
        : key;

    if (alg in RSA_HASH) {
      if (pub.asymmetricKeyType !== "rsa" && pub.asymmetricKeyType !== "rsa-pss") return false; // #3
      return cryptoVerify(RSA_HASH[alg] as string, Buffer.from(signingInput, "utf8"), pub, signature);
    }
    if (alg === "EdDSA") {
      if (pub.asymmetricKeyType !== "ed25519" && pub.asymmetricKeyType !== "ed448") return false; // #3
      return cryptoVerify(null, Buffer.from(signingInput, "utf8"), pub, signature);
    }

    // ES* recognised but NOT implemented (JOSE raw R||S ⇄ DER conversion omitted on purpose)
    // — fail CLOSED (#6) rather than risk a subtle mis-verification.
    return false;
  } catch {
    return false; // any crypto/parse error → not verified → DENY at the caller
  }
}

/**
 * The bearer/JWT authentication factor as a K3 verdict.
 *
 * Deny-by-default and fail-closed: only a fully-valid token authorizes (ALLOW); a
 * present-but-invalid token DENIES; an absent token is INDETERMINATE. Returns a
 * VERDICT — compose it and hand the result to the kernel.
 */
export function bearerTokenVerdict(
  headers: Readonly<Record<string, string>>,
  opts: BearerVerifyOptions,
): Verdict {
  // Config guard: an empty/absent algorithm pin is a misconfiguration — fail closed.
  if (!Array.isArray(opts.algorithms) || opts.algorithms.length === 0) return Verdict.DENY;

  const raw = header(headers, opts.header ?? "authorization");
  const value = raw?.trim() ?? "";
  if (value.length === 0) return Verdict.INDETERMINATE; // no token presented

  // Scheme: exactly `Bearer <token>` (case-insensitive scheme). Anything else = no bearer token.
  const m = /^Bearer[ \t]+(\S.*)$/i.exec(value);
  if (m === null) return Verdict.INDETERMINATE;
  const token = (m[1] ?? "").trim();

  const parts = token.split(".");
  if (parts.length !== 3) return Verdict.DENY; // malformed compact JWS → definite refusal

  const [h, p, s] = parts;
  // noUncheckedIndexedAccess: length===3 doesn't narrow the tuple — guard fail-closed.
  if (h === undefined || p === undefined || s === undefined) return Verdict.DENY;
  const head = parseJsonSegment(h);
  if (head === null) return Verdict.DENY;

  // ── footgun #1 + #2: the token's alg must be one the CALLER pinned; "none" never passes ──
  const alg = head.alg;
  if (typeof alg !== "string" || alg === "none" || !(opts.algorithms as readonly string[]).includes(alg)) {
    return Verdict.DENY;
  }

  const signature = b64urlToBuf(s);
  if (signature === null || signature.length === 0) return Verdict.DENY;

  if (!verifySignature(alg as JwtAlg, `${h}.${p}`, signature, opts.key)) return Verdict.DENY;

  // ── claims (only after the signature is proven) ──
  const claims = parseJsonSegment(p);
  if (claims === null) return Verdict.DENY;

  const now = (opts.now ? opts.now() : Date.now() / 1000);
  const skew = opts.clockToleranceSec ?? 0;

  // exp — required by default (#4). A present exp must be a finite number and in the future.
  const requireExp = opts.requireExp ?? true;
  if (Object.prototype.hasOwnProperty.call(claims, "exp")) {
    const exp = claims.exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return Verdict.DENY;
    if (now > exp + skew) return Verdict.DENY; // expired
  } else if (requireExp) {
    return Verdict.DENY; // no expiry and one is required
  }

  // nbf — if present, the token is not valid before it.
  if (Object.prototype.hasOwnProperty.call(claims, "nbf")) {
    const nbf = claims.nbf;
    if (typeof nbf !== "number" || !Number.isFinite(nbf)) return Verdict.DENY;
    if (now + skew < nbf) return Verdict.DENY; // not yet valid
  }

  // iss — if the caller requires one, it must match exactly.
  if (opts.issuer !== undefined && claims.iss !== opts.issuer) return Verdict.DENY;

  // aud — if the caller requires one, the token's aud (string or array) must include it.
  if (opts.audience !== undefined) {
    const aud = claims.aud;
    const ok = typeof aud === "string"
      ? aud === opts.audience
      : Array.isArray(aud) && aud.includes(opts.audience);
    if (!ok) return Verdict.DENY;
  }

  return Verdict.ALLOW;
}
