// =============================================================================
// LogicN App Kernel — Signed Central Registry Index (Framework B5a)
//
// A tamper-evident catalog of certified packages that sits BEFORE the package
// resolver (see docs/Knowledge-Bases/certified-package-registry.md). A package is
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
// docs/Knowledge-Bases/logicn-diagnostic-code-conventions.md).
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

/** Detached Ed25519 signature by the REGISTRY AUTHORITY over registryIndexSigningInput(). */
export interface RegistryIndexSignature {
  readonly algorithm: "Ed25519";
  readonly keyId: string;             // the registry authority keyId (NOT a package keyId)
  readonly signature: string;         // base64
  readonly canon: "jcs";              // RFC 8785 canonical JSON
}

export interface RegistryIndex {
  readonly schema: "logicn-registry-index/v1";
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

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── canonical signing input ──────────────────────────────────────────────────
/** The exact bytes the index signature covers: the index WITHOUT its `signature`, RFC 8785. */
export function registryIndexSigningInput(index: RegistryIndex): string {
  const { signature: _omit, ...withoutSig } = index;
  return canonicalJson(withoutSig);
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
  return { schema: "logicn-registry-index/v1", registry: input.registry, issuedAt: input.issuedAt, entries };
}

// ── sign (inject a sign fn; keeps the kernel crypto-agnostic) ────────────────
/** A detached-signature producer over UTF-8 bytes → base64. */
export type IndexSignFn = (message: Uint8Array) => string;

/** Return a copy of the index carrying an Ed25519 signature by `keyId`. */
export function signRegistryIndex(index: RegistryIndex, keyId: string, sign: IndexSignFn): RegistryIndex {
  const message = new TextEncoder().encode(registryIndexSigningInput(index));
  return { ...index, signature: { algorithm: "Ed25519", keyId, signature: sign(message), canon: "jcs" } };
}

// ── verify (fail-closed) ─────────────────────────────────────────────────────
/**
 * Verify a UTF-8 `message` against a base64 `signature` for `keyId`. Return true/false
 * for a known key, or "no-key" if no public key is registered for that keyId. For the
 * CENTRAL index, "no-key" is fail-CLOSED (DENY) — unlike a package manifest, an
 * unverifiable central index is worthless.
 */
export type IndexVerifier = (message: Uint8Array, signature: string, keyId: string) => boolean | "no-key";

export class RegistryIndexError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistryIndexError";
    this.code = code;
  }
}

/** Throws RegistryIndexError (fail-closed) unless the index carries a real, verifiable signature. */
export function verifyRegistryIndex(index: RegistryIndex, verify: IndexVerifier): "verified" {
  const sig = index.signature;
  if (!sig || sig.algorithm !== "Ed25519" || typeof sig.signature !== "string" || sig.signature.length === 0) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_UNSIGNED,
      "Registry index is unsigned or carries a placeholder signature — refused (fail-closed).",
    );
  }
  const message = new TextEncoder().encode(registryIndexSigningInput(index));
  const result = verify(message, sig.signature, sig.keyId);
  if (result === "no-key") {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_NO_KEY,
      `No public key registered for registry authority keyId '${sig.keyId}' — cannot verify index; refused.`,
    );
  }
  if (!result) {
    throw new RegistryIndexError(
      ERR_REGISTRY_INDEX_BAD_SIGNATURE,
      `Registry index signature failed verification for keyId '${sig.keyId}' — possible tampering; refused.`,
    );
  }
  return "verified";
}

// ── lookup (fail-closed) ─────────────────────────────────────────────────────
export interface CertifiedLookup {
  readonly name: string;
  readonly version: string;
  readonly sourceHash: string;        // the package's ACTUAL hash, checked against the pinned entry
  readonly keyId?: string;            // the package's ACTUAL manifest keyId (optional cross-check)
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
  const entry = named.find((e) => e.version === q.version);
  if (!entry) {
    return { ok: false, code: ERR_REGISTRY_VERSION_UNKNOWN, reason: `Package '${q.name}' has no certified version '${q.version}' (certified: ${named.map((e) => e.version).join(", ")}).` };
  }
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
  /** Maximum acceptable risk rating (inclusive). Higher → denied. Omit to not gate on risk. */
  readonly maxRiskRating?: RiskRating;
}
const RISK_ORDER: Readonly<Record<RiskRating, number>> = { low: 0, medium: 1, high: 2, critical: 3 };
export type PolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly reason: string };

export function checkRegistryPolicy(entry: RegistryEntry, policy: RegistryPolicy): PolicyResult {
  if (!policy.allowedLevels.includes(entry.certificationLevel)) {
    return { ok: false, code: ERR_REGISTRY_POLICY_DENIED, reason: `Package '${entry.name}' certification level '${entry.certificationLevel}' is not permitted (allowed: ${policy.allowedLevels.join(", ")}).` };
  }
  if (policy.maxRiskRating !== undefined && RISK_ORDER[entry.riskRating] > RISK_ORDER[policy.maxRiskRating]) {
    return { ok: false, code: ERR_REGISTRY_POLICY_DENIED, reason: `Package '${entry.name}' risk rating '${entry.riskRating}' exceeds the policy maximum '${policy.maxRiskRating}'.` };
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
  verify: IndexVerifier,
  q: CertifiedLookup,
  policy: RegistryPolicy,
): AdmissionResult {
  try {
    verifyRegistryIndex(index, verify);
  } catch (e) {
    const err = e as RegistryIndexError;
    return { ok: false, code: err.code ?? ERR_REGISTRY_INDEX_BAD_SIGNATURE, reason: err.message };
  }
  const found = lookupCertifiedPackage(index, q);
  if (!found.ok) return found;
  const pol = checkRegistryPolicy(found.entry, policy);
  if (!pol.ok) return { ok: false, code: pol.code, reason: pol.reason };
  return { ok: true, entry: found.entry };
}
