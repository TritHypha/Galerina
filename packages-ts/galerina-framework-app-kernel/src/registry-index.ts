// =============================================================================
// Galerina App Kernel — Signed Central Registry Index (Framework B5a)
//
// A tamper-evident catalog of certified packages that sits BEFORE the package
// resolver (see ../ZTF-Knowledge-Bases/certified-package-registry.md). A package is
// admissible only if it appears in a VALIDLY-SIGNED index, its sourceHash matches the
// PINNED hash, and it satisfies registry policy. Fail-closed at every step: missing or
// forged index signature, unknown package/version, hash mismatch, keyId mismatch, or
// policy denial → DENY. Complements the per-manifest signature gate in fuse-loader.ts
// with a CENTRAL allow-list (defeats a validly self-signed but unlisted / forked package).
//
// Crypto-agnostic: signing and verification are INJECTED callbacks (like fuse-loader's
// verify), so this module has no node:* dependency. Deterministic: no Date.now —
// `issuedAt` is supplied by the caller.
//
// Diagnostic codes: ERR_REGISTRY_* (one code = one failure mode — conventions §1/§2,
// ../ZTF-Knowledge-Bases/galerina-diagnostic-code-conventions.md).
// =============================================================================

import { canonicalJson } from "./fuse-loader.js";

export type CertificationLevel =
  | "uncertified" | "community" | "verified" | "certified" | "enterprise" | "regulated";
export type RiskRating = "low" | "medium" | "high" | "critical";

/** A pinned, certified package record. The registry authority asserts these facts. */
export interface RegistryEntry {
  readonly name: string;
  readonly version: string;
  readonly sourceHash: string;        // "sha256:<hex>" — the PINNED expected package hash
  readonly publisher: string;
  readonly keyId: string;             // the manifest-signing keyId expected for this package
  readonly certificationLevel: CertificationLevel;
  readonly riskRating: RiskRating;
  readonly capabilities: readonly string[];
  readonly effects: readonly string[];
}

/** Historical v1 Ed25519 signature. Verify-only; never use for a new index. */
export interface LegacyRegistryIndexSignature {
  readonly algorithm: "Ed25519";
  readonly keyId: string;             // the registry authority keyId (NOT a package keyId)
  readonly signature: string;         // base64
  readonly canon: "jcs";              // RFC 8785 canonical JSON
}

export const REGISTRY_INDEX_V2_CONTEXT = "galerina.registry.index.sig.v2" as const;

/**
 * v2 dual-signature envelope. Both components cover the same domain-separated
 * bytes. This is a Galerina application envelope, not the still-draft IETF
 * Composite ML-DSA encoding.
 */
export interface HybridRegistryIndexSignature {
  readonly algorithm: "Ed25519+ML-DSA-65";
  readonly keyId: string;
  readonly ed25519Signature: string;
  readonly mlDsa65Signature: string;
  readonly canon: "jcs";
  readonly context: typeof REGISTRY_INDEX_V2_CONTEXT;
}

export type RegistryIndexSignature =
  | LegacyRegistryIndexSignature
  | HybridRegistryIndexSignature;

export interface RegistryIndex {
  readonly schema: "galerina-registry-index/v1" | "galerina-registry-index/v2";
  readonly registry: string;          // registry identity (name or URL)
  readonly issuedAt: string;          // ISO-8601, caller-supplied (deterministic build)
  readonly entries: readonly RegistryEntry[];
  readonly signature?: RegistryIndexSignature;  // absent until signed
}

// ── structured error codes (one code = one fault — conventions §1) ───────────
export const ERR_REGISTRY_INDEX_UNSIGNED = "ERR_REGISTRY_INDEX_UNSIGNED";
export const ERR_REGISTRY_INDEX_NO_KEY = "ERR_REGISTRY_INDEX_NO_KEY";
export const ERR_REGISTRY_INDEX_BAD_SIGNATURE = "ERR_REGISTRY_INDEX_BAD_SIGNATURE";
export const ERR_REGISTRY_PACKAGE_UNKNOWN = "ERR_REGISTRY_PACKAGE_UNKNOWN";
export const ERR_REGISTRY_VERSION_UNKNOWN = "ERR_REGISTRY_VERSION_UNKNOWN";
export const ERR_REGISTRY_HASH_MISMATCH = "ERR_REGISTRY_HASH_MISMATCH";
export const ERR_REGISTRY_KEYID_MISMATCH = "ERR_REGISTRY_KEYID_MISMATCH";
export const ERR_REGISTRY_POLICY_DENIED = "ERR_REGISTRY_POLICY_DENIED";
export const ERR_REGISTRY_INDEX_STALE = "ERR_REGISTRY_INDEX_STALE";        // signed but older-or-equal than the accepted floor (rollback/replay)
export const ERR_REGISTRY_INDEX_MALFORMED = "ERR_REGISTRY_INDEX_MALFORMED"; // unsupported schema / signature canon
export const ERR_REGISTRY_DUPLICATE = "ERR_REGISTRY_DUPLICATE";            // >1 entry for the same (name,version) — ambiguous

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── canonical signing input ──────────────────────────────────────────────────
/** The exact bytes the index signature covers: the index WITHOUT its `signature`, RFC 8785. */
export function registryIndexSigningInput(index: RegistryIndex): string {
  const { signature: _omit, ...withoutSig } = index;
  return canonicalJson(withoutSig);
}

/**
 * Exact signature bytes. v2 binds the suite metadata and authority identity as
 * well as the canonical payload; envelope fields cannot be relabelled later.
 */
export function registryIndexSignaturePreimage(index: RegistryIndex, keyId?: string): Uint8Array {
  const canonical = registryIndexSigningInput(index);
  if (index.schema === "galerina-registry-index/v1") {
    return new TextEncoder().encode(canonical);
  }
  if (index.schema === "galerina-registry-index/v2") {
    if (typeof keyId !== "string" || keyId.length === 0) {
      throw new RegistryIndexError(
        ERR_REGISTRY_INDEX_MALFORMED,
        "A v2 signature preimage requires a non-empty authority keyId.",
      );
    }
    return new TextEncoder().encode(
      `${REGISTRY_INDEX_V2_CONTEXT}\0Ed25519+ML-DSA-65\0${keyId}\0jcs\0${canonical}`,
    );
  }
  throw new RegistryIndexError(
    ERR_REGISTRY_INDEX_MALFORMED,
    `unsupported index schema '${String(index.schema)}'.`,
  );
}

// ── build (unsigned, canonical) ──────────────────────────────────────────────
/** Build an unsigned index with entries sorted by (name, version) for a stable catalog. */
export function buildRegistryIndex(input: {
  readonly registry: string;
  readonly issuedAt: string;
  readonly entries: readonly RegistryEntry[];
}): RegistryIndex {
  const entries = [...input.entries].sort((a, b) =>
    a.name === b.name ? cmp(a.version, b.version) : cmp(a.name, b.name));
  return { schema: "galerina-registry-index/v2", registry: input.registry, issuedAt: input.issuedAt, entries };
}

// ── sign (inject a sign fn; keeps the kernel crypto-agnostic) ────────────────
/** A detached-signature producer over UTF-8 bytes → base64. */
export type IndexSignFn = (message: Uint8Array) => string;

/** Historical v1 signer. It refuses v2 rather than silently downgrading it. */
export function signRegistryIndex(index: RegistryIndex, keyId: string, sign: IndexSignFn): RegistryIndex {
  if (index.schema !== "galerina-registry-index/v1") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_MALFORMED,
      "The Ed25519-only signer is verify-only legacy and cannot sign a v2 index.",
    );
  }
  const message = registryIndexSignaturePreimage(index);
  return { ...index, signature: { algorithm: "Ed25519", keyId, signature: sign(message), canon: "jcs" } };
}

/** New-production signer: both callbacks must produce non-empty signatures. */
export function signRegistryIndexHybrid(
  index: RegistryIndex,
  keyId: string,
  signEd25519: IndexSignFn,
  signMlDsa65: IndexSignFn,
): RegistryIndex {
  if (index.schema !== "galerina-registry-index/v2") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_MALFORMED,
      "The hybrid signer only signs galerina-registry-index/v2.",
    );
  }
  if (keyId.length === 0) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_MALFORMED,
      "The registry authority keyId must not be empty.",
    );
  }
  const message = registryIndexSignaturePreimage(index, keyId);
  const ed25519Signature = signEd25519(message);
  const mlDsa65Signature = signMlDsa65(message);
  if (
    typeof ed25519Signature !== "string"
    || ed25519Signature.length === 0
    || typeof mlDsa65Signature !== "string"
    || mlDsa65Signature.length === 0
  ) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_UNSIGNED,
      "Both Ed25519 and ML-DSA-65 signatures are required.",
    );
  }
  return {
    ...index,
    signature: {
      algorithm: "Ed25519+ML-DSA-65",
      keyId,
      ed25519Signature,
      mlDsa65Signature,
      canon: "jcs",
      context: REGISTRY_INDEX_V2_CONTEXT,
    },
  };
}

// ── verify (fail-closed) ─────────────────────────────────────────────────────
/**
 * Verify a UTF-8 `message` against a base64 `signature` for `keyId`. Return true/false
 * for a known key, or "no-key" if no public key is registered for that keyId. For the
 * CENTRAL index, "no-key" is fail-CLOSED (DENY) — unlike a package manifest, an
 * unverifiable central index is worthless.
 */
export type IndexVerifier = (message: Uint8Array, signature: string, keyId: string) => boolean | "no-key";
export interface HybridIndexVerifiers {
  readonly ed25519: IndexVerifier;
  readonly mlDsa65: IndexVerifier;
}
export type RegistryIndexVerifier = IndexVerifier | HybridIndexVerifiers;

export class RegistryIndexError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistryIndexError";
    this.code = code;
  }
}

function isLiteralVerificationSuccess(
  result: boolean | "no-key",
): result is true {
  return result === true;
}

function isStrictlyNewerThanFloor(
  issuedAt: string,
  minIssuedAt: string | undefined,
): boolean {
  return minIssuedAt === undefined || issuedAt > minIssuedAt;
}

/**
 * Throws RegistryIndexError (fail-closed) unless the index carries a real, verifiable signature.
 * @param minIssuedAt optional ISO-8601 floor — the index MUST be strictly newer (rollback/replay defense).
 */
export function verifyRegistryIndex(
  index: RegistryIndex,
  verify: RegistryIndexVerifier,
  minIssuedAt?: string,
): "verified" {
  if (index.schema === "galerina-registry-index/v2") {
    return verifyRegistryIndexV2(index, verify, minIssuedAt);
  }
  if (index.schema !== "galerina-registry-index/v1") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_MALFORMED,
      `unsupported index schema '${String(index.schema)}'.`,
    );
  }
  const sig = index.signature as LegacyRegistryIndexSignature | undefined;
  if (typeof verify !== "function") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_NO_KEY,
      "The historical Ed25519 verifier is unavailable.",
    );
  }
  if (!sig || sig.algorithm !== "Ed25519" || typeof sig.signature !== "string" || sig.signature.length === 0) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_UNSIGNED,
      "Registry index is unsigned or carries a placeholder signature — refused (fail-closed).",
    );
  }
  // `canon` sits OUTSIDE the signed bytes (signature is excluded) so it is UNAUTHENTICATED. We only ever
  // recompute JCS — reject any other tag rather than let a future legacy branch be downgrade-triggered.
  if (sig.canon !== "jcs") {
    throw new RegistryIndexError(ERR_REGISTRY_INDEX_MALFORMED, `unsupported signature canon '${sig.canon}' — only 'jcs' accepted.`);
  }
  const message = new TextEncoder().encode(registryIndexSigningInput(index));
  const result = verify(message, sig.signature, sig.keyId);
  if (result === "no-key") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_NO_KEY,
      `No public key registered for registry authority keyId '${sig.keyId}' — cannot verify index; refused.`,
    );
  }
  // FAIL-CLOSED: ONLY a literal `true` admits. A truthy non-boolean verifier return (a raw crypto-lib
  // result, a thin wrapper) must NOT pass — was `if (!result)`, which admitted any truthy value.
  if (!isLiteralVerificationSuccess(result)) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_BAD_SIGNATURE,
      `Registry index signature failed verification for keyId '${sig.keyId}' — possible tampering; refused.`,
    );
  }
  // Authentic from here — validate the (signed) schema and enforce freshness.
  if (index.schema !== "galerina-registry-index/v1") {
    throw new RegistryIndexError(ERR_REGISTRY_INDEX_MALFORMED, `unsupported index schema '${index.schema}'.`);
  }
  if (!isStrictlyNewerThanFloor(index.issuedAt, minIssuedAt)) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_STALE,
      `index issuedAt '${index.issuedAt}' is not newer than the accepted floor '${minIssuedAt}' — possible rollback/replay; refused.`,
    );
  }
  return "verified";
}

function verifyRegistryIndexV2(
  index: RegistryIndex,
  verify: RegistryIndexVerifier,
  minIssuedAt?: string,
): "verified" {
  const sig = index.signature;
  if (
    sig === undefined
    || sig.algorithm !== "Ed25519+ML-DSA-65"
    || sig.context !== REGISTRY_INDEX_V2_CONTEXT
    || typeof sig.keyId !== "string"
    || sig.keyId.length === 0
    || typeof sig.ed25519Signature !== "string"
    || sig.ed25519Signature.length === 0
    || typeof sig.mlDsa65Signature !== "string"
    || sig.mlDsa65Signature.length === 0
  ) {
    if (sig !== undefined && sig.algorithm !== "Ed25519+ML-DSA-65") {
      throw new RegistryIndexError(
        ERR_REGISTRY_INDEX_MALFORMED,
        "A v2 index must carry the pinned Ed25519+ML-DSA-65 suite.",
      );
    }
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_UNSIGNED,
      "A v2 index requires both component signatures and the pinned context.",
    );
  }
  if (sig.canon !== "jcs") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_MALFORMED,
      `unsupported signature canon '${sig.canon}' â€” only 'jcs' accepted.`,
    );
  }
  if (
    typeof verify === "function"
    || typeof verify.ed25519 !== "function"
    || typeof verify.mlDsa65 !== "function"
  ) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_NO_KEY,
      "Both Ed25519 and ML-DSA-65 verifiers are required for a v2 index.",
    );
  }

  const message = registryIndexSignaturePreimage(index, sig.keyId);
  verifyComponent(message, sig.ed25519Signature, sig.keyId, verify.ed25519);
  verifyComponent(message, sig.mlDsa65Signature, sig.keyId, verify.mlDsa65);
  if (!isStrictlyNewerThanFloor(index.issuedAt, minIssuedAt)) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_STALE,
      `index issuedAt '${index.issuedAt}' is not newer than the accepted floor '${minIssuedAt}' â€” possible rollback/replay; refused.`,
    );
  }
  return "verified";
}

function verifyComponent(
  message: Uint8Array,
  signature: string,
  keyId: string,
  verify: IndexVerifier,
): void {
  let result: boolean | "no-key";
  try {
    result = verify(message, signature, keyId);
  } catch {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_BAD_SIGNATURE,
      `Registry index signature verifier rejected the component for keyId '${keyId}'.`,
    );
  }
  if (result === "no-key") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_NO_KEY,
      `No public key registered for registry authority keyId '${keyId}' â€” cannot verify index; refused.`,
    );
  }
  if (!isLiteralVerificationSuccess(result)) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_BAD_SIGNATURE,
      `Registry index signature failed verification for keyId '${keyId}' â€” possible tampering; refused.`,
    );
  }
}

// ── lookup (fail-closed) ─────────────────────────────────────────────────────
export interface CertifiedLookup {
  readonly name: string;
  readonly version: string;
  readonly sourceHash: string;        // the package's ACTUAL hash, checked against the pinned entry
  readonly keyId?: string | undefined; // the package's ACTUAL manifest keyId (optional cross-check)
}
export type LookupResult =
  | { readonly ok: true; readonly entry: RegistryEntry }
  | { readonly ok: false; readonly code: string; readonly reason: string };

/**
 * Resolve a package against the index. Fail-closed: a package not listed, at an unlisted version,
 * or whose actual sourceHash / keyId does not match the PINNED entry is DENIED. The caller MUST
 * verifyRegistryIndex() first — this trusts the (verified) index contents.
 */
export function lookupCertifiedPackage(index: RegistryIndex, q: CertifiedLookup): LookupResult {
  const named = index.entries.filter((e) => e.name === q.name);
  if (named.length === 0) {
    return { ok: false, code: ERR_REGISTRY_PACKAGE_UNKNOWN, reason: `Package '${q.name}' is not in the certified registry index.` };
  }
  const matches = named.filter((e) => e.version === q.version);
  if (matches.length === 0) {
    return { ok: false, code: ERR_REGISTRY_VERSION_UNKNOWN, reason: `Package '${q.name}' has no certified version '${q.version}' (certified: ${named.map((e) => e.version).join(", ")}).` };
  }
  // Ambiguous: >1 entry for the same (name,version). Entry ORDER must not silently decide which
  // hash/keyId/level applies (a duplicate placed first = DoS + fact-spoofing). Fail-closed.
  if (matches.length > 1) {
    return { ok: false, code: ERR_REGISTRY_DUPLICATE, reason: `Registry has ${matches.length} entries for '${q.name}@${q.version}' — ambiguous; refused.` };
  }
  const entry = matches[0]!; // length === 1 guaranteed by the checks above
  if (entry.sourceHash !== q.sourceHash) {
    return { ok: false, code: ERR_REGISTRY_HASH_MISMATCH, reason: `Package '${q.name}@${q.version}' hash ${q.sourceHash} does not match the pinned ${entry.sourceHash} — supply-chain integrity failure.` };
  }
  if (q.keyId !== undefined && entry.keyId !== q.keyId) {
    return { ok: false, code: ERR_REGISTRY_KEYID_MISMATCH, reason: `Package '${q.name}@${q.version}' was signed by keyId '${q.keyId}' but the registry pins '${entry.keyId}'.` };
  }
  return { ok: true, entry };
}

// ── policy (fail-closed) ─────────────────────────────────────────────────────
export interface RegistryPolicy {
  /** Allowed certification levels. A package whose level is not listed is denied. */
  readonly allowedLevels: readonly CertificationLevel[];
  /**
   * Maximum acceptable risk rating (inclusive). Higher → denied. Omit to not gate on risk.
   * When set, an entry whose riskRating is not exactly one of low | medium | high | critical
   * (unknown, empty, differently cased, non-string) is DENIED: zero-trust default, owner may revisit.
   * A set maxRiskRating that is itself not exactly one of those four is also DENIED (zero-trust default, owner may revisit).
   */
  readonly maxRiskRating?: RiskRating;
}
const RISK_ORDER: Readonly<Record<RiskRating, number>> = { low: 0, medium: 1, high: 2, critical: 3 };
/** Exact, own-key membership: no case folding, no trimming, no prototype keys ("constructor"). */
const isRecognisedRiskRating = (r: unknown): r is RiskRating =>
  typeof r === "string" && Object.prototype.hasOwnProperty.call(RISK_ORDER, r);
export type PolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly reason: string };

export function checkRegistryPolicy(entry: RegistryEntry, policy: RegistryPolicy): PolicyResult {
  if (!policy.allowedLevels.includes(entry.certificationLevel)) {
    return { ok: false, code: ERR_REGISTRY_POLICY_DENIED, reason: `Package '${entry.name}' certification level '${entry.certificationLevel}' is not permitted (allowed: ${policy.allowedLevels.join(", ")}).` };
  }
  if (policy.maxRiskRating !== undefined) {
    // Zero-trust default, owner may revisit: an unrecognised policy maximum has no rank either, so it
    // must not silently admit (`RISK_ORDER[r] > RISK_ORDER[unknown]` is false). Deny before anything else.
    if (!isRecognisedRiskRating(policy.maxRiskRating)) {
      return { ok: false, code: ERR_REGISTRY_POLICY_DENIED, reason: `Package '${entry.name}' denied: policy maxRiskRating not recognised ('${String(policy.maxRiskRating)}'; expected low | medium | high | critical).` };
    }
    // Zero-trust: an unrecognised rating has no rank, and `RISK_ORDER[unknown] > n` is false, which
    // used to ADMIT it (fail-open, RD-0361 S6b finding D1). Deny it explicitly before comparing.
    if (!isRecognisedRiskRating(entry.riskRating)) {
      return { ok: false, code: ERR_REGISTRY_POLICY_DENIED, reason: `Package '${entry.name}' risk rating '${String(entry.riskRating)}' is not a recognised rating (low | medium | high | critical); unknown risk is denied.` };
    }
    if (RISK_ORDER[entry.riskRating] > RISK_ORDER[policy.maxRiskRating]) {
      return { ok: false, code: ERR_REGISTRY_POLICY_DENIED, reason: `Package '${entry.name}' risk rating '${entry.riskRating}' exceeds the policy maximum '${policy.maxRiskRating}'.` };
    }
  }
  return { ok: true };
}

// ── one-call admission (verify → lookup → policy), fail-closed ───────────────
export type AdmissionResult =
  | { readonly ok: true; readonly entry: RegistryEntry }
  | { readonly ok: false; readonly code: string; readonly reason: string };

/**
 * The full fail-closed gate: verify the index signature, resolve the package, enforce policy.
 * Any failure → { ok:false, code, reason }. Index-signature throws are caught and surfaced as a
 * structured result so callers get one uniform shape.
 */
export function admitFromRegistry(
  index: RegistryIndex,
  verify: RegistryIndexVerifier,
  q: CertifiedLookup,
  policy: RegistryPolicy,
  minIssuedAt?: string,
): AdmissionResult {
  try {
    verifyRegistryIndex(index, verify, minIssuedAt);
  } catch (e) {
    const err = e instanceof RegistryIndexError ? e : new RegistryIndexError(ERR_REGISTRY_INDEX_BAD_SIGNATURE, String((e as Error)?.message ?? e));
    return { ok: false, code: err.code, reason: err.message };
  }
  const found = lookupCertifiedPackage(index, q);
  if (!found.ok) return found;
  const pol = checkRegistryPolicy(found.entry, policy);
  if (!pol.ok) return { ok: false, code: pol.code, reason: pol.reason };
  return { ok: true, entry: found.entry };
}
