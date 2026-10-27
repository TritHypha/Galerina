// =============================================================================
// Galerina App Kernel - registry rotation policy (root-signed) and issued
// delegations (policy-issuer-signed).
//
// The offline root signs ONE long-lived rotation policy. An online-but-
// bounded issuer key then issues short-lived operational delegations inside
// that policy, with overlap windows so there is never a gap. A verifier trusts
// an issued delegation only if the whole chain holds:
//
//   offline root -> RotationPolicy (root signature, bounds, window)
//     -> anchor: the last root-signed galerina-registry-delegation/v1
//     -> issued delegations (galerina-registry-delegation/v2), each fitting the
//        policy bounds, serial-monotonic, overlapping its predecessor
//     -> operational key signs the registry index / package manifests.
//
// The issuer key can NOT sign indexes or manifests (its id may never be an
// operational key id) and can NOT widen roles, lifetime, algorithms or the
// policy window. Revoking the root, the issuer or the selected operational key
// kills the chain. Fail-closed throughout: only exact success authorizes.
//
// Placement note: the DECISIONS (lifetime, overlap/gap, serial, role, key,
// window) are mirrored by src/self-hosted/registry-rotation-policy.fungi, which
// is checker-verified, non-authorizing and NOT build-wired (#143); a
// differential test proves the twin equals the verdict functions below. This
// TypeScript file is the minimal host seam: canonical bytes, injected crypto
// verification and evidence collection. All new rotation logic that can live in
// .fungi is there; nothing here is a new trust model beyond the policy format.
// =============================================================================

import { canonicalJson } from "./fuse-loader.js";
import {
  type RegistryIndex,
  type RegistryIndexVerifier,
  verifyRegistryIndex,
} from "./registry-index.js";
import {
  type RegistryManifestVerifiers,
  type RegistryPackageManifest,
  verifyRegistryPackageManifest,
} from "./registry-package-manifest.js";
import {
  type RegistryAuthorityDelegation,
  type RegistryDelegationRole,
  type RegistryOperationalAuthority,
  type RegistryRootVerifiers,
  verifyRegistryAuthorityDelegation,
} from "./registry-authority.js";

export const REGISTRY_ROTATION_POLICY_V1_CONTEXT =
  "galerina.registry.rotation-policy.sig.v1" as const;
export const REGISTRY_ISSUED_DELEGATION_V1_CONTEXT =
  "galerina.registry.delegation.issued.sig.v1" as const;
export const REGISTRY_ROTATION_POLICY_SCHEMA =
  "galerina-registry-rotation-policy/v1" as const;
export const REGISTRY_ISSUED_DELEGATION_SCHEMA =
  "galerina-registry-delegation/v2" as const;

export const ERR_REGISTRY_ROTATION_MALFORMED = "ERR_REGISTRY_ROTATION_MALFORMED";
export const ERR_REGISTRY_ROTATION_UNSIGNED = "ERR_REGISTRY_ROTATION_UNSIGNED";
export const ERR_REGISTRY_ROTATION_BAD_SIGNATURE =
  "ERR_REGISTRY_ROTATION_BAD_SIGNATURE";
export const ERR_REGISTRY_ROTATION_KEY_MISMATCH =
  "ERR_REGISTRY_ROTATION_KEY_MISMATCH";
export const ERR_REGISTRY_ROTATION_NOT_ACTIVE = "ERR_REGISTRY_ROTATION_NOT_ACTIVE";
export const ERR_REGISTRY_ROTATION_REVOKED = "ERR_REGISTRY_ROTATION_REVOKED";
export const ERR_REGISTRY_ROTATION_ROLE = "ERR_REGISTRY_ROTATION_ROLE";
export const ERR_REGISTRY_ROTATION_LIFETIME = "ERR_REGISTRY_ROTATION_LIFETIME";
export const ERR_REGISTRY_ROTATION_SERIAL = "ERR_REGISTRY_ROTATION_SERIAL";
export const ERR_REGISTRY_ROTATION_STALE = "ERR_REGISTRY_ROTATION_STALE";
export const ERR_REGISTRY_ROTATION_GAP = "ERR_REGISTRY_ROTATION_GAP";
export const ERR_REGISTRY_ROTATION_OVERLAP = "ERR_REGISTRY_ROTATION_OVERLAP";
export const ERR_REGISTRY_ROTATION_ORDER = "ERR_REGISTRY_ROTATION_ORDER";
export const ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED =
  "ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED";
export const ERR_REGISTRY_ROTATION_ALGORITHM = "ERR_REGISTRY_ROTATION_ALGORITHM";
export const ERR_REGISTRY_ROTATION_ANCHOR = "ERR_REGISTRY_ROTATION_ANCHOR";
export const ERR_REGISTRY_ROTATION_POLICY_STALE =
  "ERR_REGISTRY_ROTATION_POLICY_STALE";
export const ERR_REGISTRY_ROTATION_POLICY_WINDOW =
  "ERR_REGISTRY_ROTATION_POLICY_WINDOW";
export const ERR_REGISTRY_ROTATION_BACKDATED = "ERR_REGISTRY_ROTATION_BACKDATED";
export const ERR_REGISTRY_ROTATION_CHAIN = "ERR_REGISTRY_ROTATION_CHAIN";

/** Hard guard rails the verifier enforces regardless of what a policy says. */
export const REGISTRY_ROTATION_HARD_MAX_DELEGATION_LIFETIME_SECONDS =
  90 * 24 * 60 * 60;
export const REGISTRY_ROTATION_HARD_MAX_POLICY_LIFETIME_SECONDS =
  730 * 24 * 60 * 60;
export const REGISTRY_ROTATION_MAX_CHAIN_LENGTH = 1024;

export const REGISTRY_ROTATION_ALGORITHM_SUITE = "hybrid-ed25519-mldsa65" as const;
const DELEGATION_ALGORITHM = "Ed25519+ML-DSA-65" as const;
const KEY_ID = /^[0-9a-f]{16}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ALLOWED_ROLES: readonly RegistryDelegationRole[] = [
  "package-manifest.sign",
  "registry-index.sign",
];

export class RegistryRotationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistryRotationError";
    this.code = code;
  }
}

export interface RegistryRotationIssuer {
  readonly keyId: string;
  readonly algorithm: typeof DELEGATION_ALGORITHM;
  readonly ed25519PublicKeySha256: string;
  readonly mlDsa65PublicKeySha256: string;
}

export interface RegistryRotationPinnedKey {
  readonly keyId: string;
  readonly ed25519PublicKeySha256: string;
  readonly mlDsa65PublicKeySha256: string;
}

export interface RegistryRotationAnchor {
  readonly serial: number;
  readonly keyId: string;
  readonly notAfter: string;
}

export interface RegistryRotationFirstRotation {
  readonly fromKeyId: string;
  readonly toKeyId: string;
}

export interface RegistryRotationSignature<C extends string> {
  readonly algorithm: typeof DELEGATION_ALGORITHM;
  readonly keyId: string;
  readonly ed25519Signature: string;
  readonly mlDsa65Signature: string;
  readonly canon: "jcs";
  readonly context: C;
}

export interface RegistryRotationPolicyInput {
  readonly registry: string;
  readonly serial: number;
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly rootKeyId: string;
  readonly issuer: RegistryRotationIssuer;
  readonly allowedRoles: readonly string[];
  readonly allowedAlgorithms: readonly string[];
  readonly maxDelegationLifetimeSeconds: number;
  readonly minOverlapSeconds: number;
  readonly pinnedOperationalKeys: readonly RegistryRotationPinnedKey[];
  readonly allowGeneratedKeyIds: boolean;
  readonly deniedOperationalKeyIds: readonly string[];
  readonly anchor: RegistryRotationAnchor;
  readonly firstRotation: RegistryRotationFirstRotation | null;
}

export interface RegistryRotationPolicy extends RegistryRotationPolicyInput {
  readonly schema: typeof REGISTRY_ROTATION_POLICY_SCHEMA;
  readonly allowedRoles: readonly RegistryDelegationRole[];
  readonly rootSignature?: RegistryRotationSignature<
    typeof REGISTRY_ROTATION_POLICY_V1_CONTEXT
  >;
}

export interface RegistryIssuedDelegationInput {
  readonly registry: string;
  readonly serial: number;
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly rootKeyId: string;
  readonly operational: RegistryOperationalAuthority;
  readonly roles: readonly string[];
  readonly policySerial: number;
  readonly policySha256: string;
  readonly issuerKeyId: string;
}

export interface RegistryIssuedDelegation {
  readonly schema: typeof REGISTRY_ISSUED_DELEGATION_SCHEMA;
  readonly registry: string;
  readonly serial: number;
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly rootKeyId: string;
  readonly operational: RegistryOperationalAuthority;
  readonly roles: readonly RegistryDelegationRole[];
  readonly policySerial: number;
  readonly policySha256: string;
  readonly issuerKeyId: string;
  readonly issuerSignature?: RegistryRotationSignature<
    typeof REGISTRY_ISSUED_DELEGATION_V1_CONTEXT
  >;
}

// ---------------------------------------------------------------------------
// Pure decision verdicts. Each returns "ok" or a structured ERR_* code. These
// are mirrored one-to-one by registry-rotation-policy.fungi.
// ---------------------------------------------------------------------------

export function rotationLifetimeVerdict(
  lifetimeMs: number,
  maxLifetimeMs: number,
): string {
  if (lifetimeMs < 0) return ERR_REGISTRY_ROTATION_MALFORMED;
  if (lifetimeMs > maxLifetimeMs) return ERR_REGISTRY_ROTATION_LIFETIME;
  return "ok";
}

/**
 * overlapMs = predecessor.notAfter - successor.notBefore (negative = a gap).
 */
export function rotationOverlapVerdict(
  overlapMs: number,
  minOverlapMs: number,
  startsBeforePredecessor: boolean,
): string {
  if (startsBeforePredecessor) return ERR_REGISTRY_ROTATION_ORDER;
  if (overlapMs < 0) return ERR_REGISTRY_ROTATION_GAP;
  if (overlapMs < minOverlapMs) return ERR_REGISTRY_ROTATION_OVERLAP;
  return "ok";
}

export function rotationSerialVerdict(
  serial: number,
  predecessorSerial: number,
): string {
  if (serial <= predecessorSerial) return ERR_REGISTRY_ROTATION_SERIAL;
  return "ok";
}

export function rotationRoleVerdict(
  roleCount: number,
  outsidePolicyCount: number,
): string {
  if (roleCount <= 0) return ERR_REGISTRY_ROTATION_MALFORMED;
  if (outsidePolicyCount > 0) return ERR_REGISTRY_ROTATION_ROLE;
  return "ok";
}

export function rotationAlgorithmVerdict(suiteAllowed: boolean): string {
  if (!suiteAllowed) return ERR_REGISTRY_ROTATION_ALGORITHM;
  return "ok";
}

export function rotationKeyVerdict(
  denied: boolean,
  reserved: boolean,
  pinnedIdKnown: boolean,
  pinnedFingerprintsMatch: boolean,
  generatedAllowed: boolean,
  formatOk: boolean,
): string {
  if (denied) return ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED;
  if (reserved) return ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED;
  if (pinnedIdKnown) {
    if (!pinnedFingerprintsMatch) return ERR_REGISTRY_ROTATION_KEY_MISMATCH;
    return "ok";
  }
  if (!generatedAllowed) return ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED;
  if (!formatOk) return ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED;
  return "ok";
}

export function rotationWindowVerdict(
  startsBeforePolicy: boolean,
  endsAfterPolicy: boolean,
  issuedOutsidePolicy: boolean,
  issuedAfterStart: boolean,
): string {
  if (startsBeforePolicy) return ERR_REGISTRY_ROTATION_POLICY_WINDOW;
  if (endsAfterPolicy) return ERR_REGISTRY_ROTATION_POLICY_WINDOW;
  if (issuedOutsidePolicy) return ERR_REGISTRY_ROTATION_POLICY_WINDOW;
  if (issuedAfterStart) return ERR_REGISTRY_ROTATION_BACKDATED;
  return "ok";
}

// ---------------------------------------------------------------------------
// Validation and builders
// ---------------------------------------------------------------------------

function malformed(message: string): never {
  throw new RegistryRotationError(ERR_REGISTRY_ROTATION_MALFORMED, message);
}

function fail(code: string, message: string): never {
  throw new RegistryRotationError(code, message);
}

function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    malformed(`${field} must be a non-empty string.`);
  }
}

function requireKeyId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !KEY_ID.test(value)) {
    malformed(`${field} must be 16 lowercase hexadecimal characters.`);
  }
}

function requireSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    malformed(`${field} must be 64 lowercase hexadecimal characters.`);
  }
}

function requirePositiveInt(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    malformed(`${field} must be a positive safe integer.`);
  }
}

function parseInstant(value: unknown, field: string): number {
  requireNonEmpty(value, field);
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString() !== value
  ) {
    malformed(`${field} must be a canonical ISO-8601 UTC instant.`);
  }
  return milliseconds;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    malformed(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireClosedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) malformed(`${field} has unknown field '${key}'.`);
  }
}

function validateRoles(roles: unknown, field: string): readonly RegistryDelegationRole[] {
  if (!Array.isArray(roles) || roles.length === 0) {
    malformed(`${field} must be a non-empty array.`);
  }
  const seen = new Set<string>();
  for (const role of roles) {
    if (!ALLOWED_ROLES.includes(role as RegistryDelegationRole)) {
      malformed(`${field} contains unsupported role '${String(role)}'.`);
    }
    if (seen.has(role as string)) malformed(`${field} contains duplicate role.`);
    seen.add(role as string);
  }
  return ALLOWED_ROLES.filter((role) => roles.includes(role));
}

function validateFingerprintSet(
  value: unknown,
  field: string,
  extra: readonly string[],
): void {
  const record = requireObject(value, field);
  requireClosedKeys(
    record,
    ["keyId", "ed25519PublicKeySha256", "mlDsa65PublicKeySha256", ...extra],
    field,
  );
  requireKeyId(record["keyId"], `${field}.keyId`);
  requireSha256(record["ed25519PublicKeySha256"], `${field}.ed25519PublicKeySha256`);
  requireSha256(record["mlDsa65PublicKeySha256"], `${field}.mlDsa65PublicKeySha256`);
}

const POLICY_FIELDS = [
  "schema", "registry", "serial", "issuedAt", "notBefore", "notAfter",
  "rootKeyId", "issuer", "allowedRoles", "allowedAlgorithms",
  "maxDelegationLifetimeSeconds", "minOverlapSeconds",
  "pinnedOperationalKeys", "allowGeneratedKeyIds", "deniedOperationalKeyIds",
  "anchor", "firstRotation", "rootSignature",
] as const;

function validatePolicyFields(policy: RegistryRotationPolicyInput): void {
  const record = requireObject(policy, "policy");
  requireClosedKeys(record, POLICY_FIELDS, "policy");
  requireNonEmpty(policy.registry, "registry");
  requireKeyId(policy.rootKeyId, "rootKeyId");
  requirePositiveInt(policy.serial, "serial");
  const issuedAt = parseInstant(policy.issuedAt, "issuedAt");
  const notBefore = parseInstant(policy.notBefore, "notBefore");
  const notAfter = parseInstant(policy.notAfter, "notAfter");
  if (notBefore >= notAfter) malformed("notBefore must be earlier than notAfter.");
  if (issuedAt > notBefore) malformed("issuedAt must not be later than notBefore.");
  if (
    notAfter - notBefore
    > REGISTRY_ROTATION_HARD_MAX_POLICY_LIFETIME_SECONDS * 1000
  ) {
    malformed("policy validity exceeds the hard 730-day ceiling.");
  }
  validateFingerprintSet(policy.issuer, "issuer", ["algorithm"]);
  if (policy.issuer.algorithm !== DELEGATION_ALGORITHM) {
    malformed("issuer.algorithm must be Ed25519+ML-DSA-65.");
  }
  validateRoles(policy.allowedRoles, "allowedRoles");
  if (
    !Array.isArray(policy.allowedAlgorithms)
    || policy.allowedAlgorithms.length === 0
    || policy.allowedAlgorithms.some(
      (suite) => suite !== REGISTRY_ROTATION_ALGORITHM_SUITE,
    )
    || new Set(policy.allowedAlgorithms).size !== policy.allowedAlgorithms.length
  ) {
    malformed("allowedAlgorithms must be exactly [hybrid-ed25519-mldsa65].");
  }
  requirePositiveInt(
    policy.maxDelegationLifetimeSeconds,
    "maxDelegationLifetimeSeconds",
  );
  if (
    policy.maxDelegationLifetimeSeconds
    > REGISTRY_ROTATION_HARD_MAX_DELEGATION_LIFETIME_SECONDS
  ) {
    malformed("maxDelegationLifetimeSeconds exceeds the hard 90-day ceiling.");
  }
  requirePositiveInt(policy.minOverlapSeconds, "minOverlapSeconds");
  if (policy.minOverlapSeconds >= policy.maxDelegationLifetimeSeconds) {
    malformed("minOverlapSeconds must be shorter than the delegation lifetime cap.");
  }
  if (!Array.isArray(policy.pinnedOperationalKeys)) {
    malformed("pinnedOperationalKeys must be an array.");
  }
  const pinnedIds = new Set<string>();
  for (const pinned of policy.pinnedOperationalKeys) {
    validateFingerprintSet(pinned, "pinnedOperationalKeys[]", []);
    if (pinnedIds.has(pinned.keyId)) malformed("duplicate pinned operational key id.");
    pinnedIds.add(pinned.keyId);
  }
  if (typeof policy.allowGeneratedKeyIds !== "boolean") {
    malformed("allowGeneratedKeyIds must be a boolean.");
  }
  if (policy.pinnedOperationalKeys.length === 0 && !policy.allowGeneratedKeyIds) {
    malformed("policy allows no operational key at all.");
  }
  if (!Array.isArray(policy.deniedOperationalKeyIds)) {
    malformed("deniedOperationalKeyIds must be an array.");
  }
  const denied = new Set<string>();
  for (const id of policy.deniedOperationalKeyIds) {
    requireKeyId(id, "deniedOperationalKeyIds[]");
    if (denied.has(id)) malformed("duplicate denied operational key id.");
    denied.add(id);
    if (pinnedIds.has(id)) malformed("a pinned operational key is also denied.");
  }
  if (policy.issuer.keyId === policy.rootKeyId) {
    malformed("the issuer key must differ from the root key.");
  }
  if (pinnedIds.has(policy.issuer.keyId) || pinnedIds.has(policy.rootKeyId)) {
    malformed("root and issuer key ids may not be pinned operational keys.");
  }
  const anchor = requireObject(policy.anchor, "anchor");
  requireClosedKeys(anchor, ["serial", "keyId", "notAfter"], "anchor");
  requirePositiveInt(policy.anchor.serial, "anchor.serial");
  requireKeyId(policy.anchor.keyId, "anchor.keyId");
  parseInstant(policy.anchor.notAfter, "anchor.notAfter");
  if (policy.firstRotation !== null) {
    const first = requireObject(policy.firstRotation, "firstRotation");
    requireClosedKeys(first, ["fromKeyId", "toKeyId"], "firstRotation");
    requireKeyId(policy.firstRotation.fromKeyId, "firstRotation.fromKeyId");
    requireKeyId(policy.firstRotation.toKeyId, "firstRotation.toKeyId");
    if (policy.firstRotation.fromKeyId !== policy.anchor.keyId) {
      malformed("firstRotation.fromKeyId must be the anchor operational key.");
    }
    if (policy.firstRotation.toKeyId === policy.firstRotation.fromKeyId) {
      malformed("firstRotation must move to a different key.");
    }
    if (!denied.has(policy.firstRotation.fromKeyId)) {
      malformed("the retired firstRotation key must be in deniedOperationalKeyIds.");
    }
    if (denied.has(policy.firstRotation.toKeyId)) {
      malformed("the firstRotation target key must not be denied.");
    }
    if (!pinnedIds.has(policy.firstRotation.toKeyId)) {
      malformed("the firstRotation target key must be pinned with its fingerprints.");
    }
  }
}

export function buildRegistryRotationPolicy(
  input: RegistryRotationPolicyInput,
): RegistryRotationPolicy {
  validatePolicyFields(input);
  const roles = ALLOWED_ROLES.filter((role) => input.allowedRoles.includes(role));
  return {
    schema: REGISTRY_ROTATION_POLICY_SCHEMA,
    registry: input.registry,
    serial: input.serial,
    issuedAt: input.issuedAt,
    notBefore: input.notBefore,
    notAfter: input.notAfter,
    rootKeyId: input.rootKeyId,
    issuer: { ...input.issuer },
    allowedRoles: roles,
    allowedAlgorithms: [...input.allowedAlgorithms],
    maxDelegationLifetimeSeconds: input.maxDelegationLifetimeSeconds,
    minOverlapSeconds: input.minOverlapSeconds,
    pinnedOperationalKeys: input.pinnedOperationalKeys
      .map((key) => ({ ...key }))
      .sort((a, b) => (a.keyId < b.keyId ? -1 : a.keyId > b.keyId ? 1 : 0)),
    allowGeneratedKeyIds: input.allowGeneratedKeyIds,
    deniedOperationalKeyIds: [...input.deniedOperationalKeyIds].sort(),
    anchor: { ...input.anchor },
    firstRotation:
      input.firstRotation === null ? null : { ...input.firstRotation },
  };
}

function withoutSignature<T extends object, K extends string>(
  value: T,
  key: K,
): Omit<T, K> {
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete copy[key];
  return copy as Omit<T, K>;
}

export function registryRotationPolicyPreimage(
  policy: RegistryRotationPolicy,
): Uint8Array {
  if (policy.schema !== REGISTRY_ROTATION_POLICY_SCHEMA) {
    malformed(`unsupported policy schema '${String(policy.schema)}'.`);
  }
  validatePolicyFields(policy);
  return new TextEncoder().encode(
    `${REGISTRY_ROTATION_POLICY_V1_CONTEXT}\0${DELEGATION_ALGORITHM}\0${policy.rootKeyId}\0jcs\0${canonicalJson(withoutSignature(policy, "rootSignature"))}`,
  );
}

/** Content digest an issued delegation binds to (hash of the unsigned preimage). */
export function registryRotationPolicyDigest(
  policy: RegistryRotationPolicy,
  sha256Hex: (bytes: Uint8Array) => string,
): string {
  const digest = sha256Hex(registryRotationPolicyPreimage(policy));
  requireSha256(digest, "policy digest");
  return digest;
}

function requireSignatureStrings(a: string, b: string, what: string): void {
  if (
    typeof a !== "string" || a.length === 0
    || typeof b !== "string" || b.length === 0
  ) {
    fail(
      ERR_REGISTRY_ROTATION_UNSIGNED,
      `Both ${what} signature components must be non-empty.`,
    );
  }
}

export function signRegistryRotationPolicy(
  policy: RegistryRotationPolicy,
  signRootEd25519: (message: Uint8Array) => string,
  signRootMlDsa65: (message: Uint8Array) => string,
): RegistryRotationPolicy {
  const message = registryRotationPolicyPreimage(policy);
  const ed25519Signature = signRootEd25519(message);
  const mlDsa65Signature = signRootMlDsa65(message);
  requireSignatureStrings(ed25519Signature, mlDsa65Signature, "offline-root policy");
  return {
    ...policy,
    rootSignature: {
      algorithm: DELEGATION_ALGORITHM,
      keyId: policy.rootKeyId,
      ed25519Signature,
      mlDsa65Signature,
      canon: "jcs",
      context: REGISTRY_ROTATION_POLICY_V1_CONTEXT,
    },
  };
}

const ISSUED_FIELDS = [
  "schema", "registry", "serial", "issuedAt", "notBefore", "notAfter",
  "rootKeyId", "operational", "roles", "policySerial", "policySha256",
  "issuerKeyId", "issuerSignature",
] as const;

function validateIssuedFields(delegation: RegistryIssuedDelegationInput): void {
  const record = requireObject(delegation, "delegation");
  requireClosedKeys(record, ISSUED_FIELDS, "delegation");
  requireNonEmpty(delegation.registry, "registry");
  requireKeyId(delegation.rootKeyId, "rootKeyId");
  requireKeyId(delegation.issuerKeyId, "issuerKeyId");
  requirePositiveInt(delegation.serial, "serial");
  requirePositiveInt(delegation.policySerial, "policySerial");
  requireSha256(delegation.policySha256, "policySha256");
  const issuedAt = parseInstant(delegation.issuedAt, "issuedAt");
  const notBefore = parseInstant(delegation.notBefore, "notBefore");
  const notAfter = parseInstant(delegation.notAfter, "notAfter");
  if (notBefore >= notAfter) malformed("notBefore must be earlier than notAfter.");
  if (issuedAt > notAfter) malformed("issuedAt must not be later than notAfter.");
  const operational = requireObject(delegation.operational, "operational");
  requireClosedKeys(
    operational,
    ["keyId", "algorithm", "ed25519PublicKeySha256", "mlDsa65PublicKeySha256"],
    "operational",
  );
  requireNonEmpty(delegation.operational.keyId, "operational.keyId");
  if (delegation.operational.algorithm !== DELEGATION_ALGORITHM) {
    malformed("operational.algorithm must be Ed25519+ML-DSA-65.");
  }
  requireSha256(
    delegation.operational.ed25519PublicKeySha256,
    "operational.ed25519PublicKeySha256",
  );
  requireSha256(
    delegation.operational.mlDsa65PublicKeySha256,
    "operational.mlDsa65PublicKeySha256",
  );
  validateRoles(delegation.roles, "roles");
}

export function buildRegistryIssuedDelegation(
  input: RegistryIssuedDelegationInput,
): RegistryIssuedDelegation {
  validateIssuedFields(input);
  return {
    schema: REGISTRY_ISSUED_DELEGATION_SCHEMA,
    registry: input.registry,
    serial: input.serial,
    issuedAt: input.issuedAt,
    notBefore: input.notBefore,
    notAfter: input.notAfter,
    rootKeyId: input.rootKeyId,
    operational: { ...input.operational },
    roles: ALLOWED_ROLES.filter((role) => input.roles.includes(role)),
    policySerial: input.policySerial,
    policySha256: input.policySha256,
    issuerKeyId: input.issuerKeyId,
  };
}

export function registryIssuedDelegationPreimage(
  delegation: RegistryIssuedDelegation,
): Uint8Array {
  if (delegation.schema !== REGISTRY_ISSUED_DELEGATION_SCHEMA) {
    malformed(`unsupported delegation schema '${String(delegation.schema)}'.`);
  }
  validateIssuedFields(delegation);
  return new TextEncoder().encode(
    `${REGISTRY_ISSUED_DELEGATION_V1_CONTEXT}\0${DELEGATION_ALGORITHM}\0${delegation.issuerKeyId}\0jcs\0${canonicalJson(withoutSignature(delegation, "issuerSignature"))}`,
  );
}

export function signRegistryIssuedDelegation(
  delegation: RegistryIssuedDelegation,
  signIssuerEd25519: (message: Uint8Array) => string,
  signIssuerMlDsa65: (message: Uint8Array) => string,
): RegistryIssuedDelegation {
  const message = registryIssuedDelegationPreimage(delegation);
  const ed25519Signature = signIssuerEd25519(message);
  const mlDsa65Signature = signIssuerMlDsa65(message);
  requireSignatureStrings(ed25519Signature, mlDsa65Signature, "issuer");
  return {
    ...delegation,
    issuerSignature: {
      algorithm: DELEGATION_ALGORITHM,
      keyId: delegation.issuerKeyId,
      ed25519Signature,
      mlDsa65Signature,
      canon: "jcs",
      context: REGISTRY_ISSUED_DELEGATION_V1_CONTEXT,
    },
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifyComponent(
  message: Uint8Array,
  signature: string,
  keyId: string,
  verifier: RegistryRootVerifiers["ed25519"],
  what: string,
): void {
  let result: boolean | "no-key";
  try {
    result = verifier(message, signature, keyId);
  } catch {
    fail(
      ERR_REGISTRY_ROTATION_BAD_SIGNATURE,
      `The ${what} signature verifier rejected keyId '${keyId}'.`,
    );
  }
  if (result === "no-key") {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      `A pinned ${what} public key is unavailable for keyId '${keyId}'.`,
    );
  }
  if (result !== true) {
    fail(
      ERR_REGISTRY_ROTATION_BAD_SIGNATURE,
      `${what} signature verification failed for keyId '${keyId}'.`,
    );
  }
}

function checkEnvelope(
  signature: RegistryRotationSignature<string> | undefined,
  context: string,
  expectedKeyId: string,
  what: string,
): RegistryRotationSignature<string> {
  if (
    signature === undefined
    || signature === null
    || typeof signature !== "object"
    || signature.algorithm !== DELEGATION_ALGORITHM
    || signature.canon !== "jcs"
    || signature.context !== context
    || typeof signature.ed25519Signature !== "string"
    || signature.ed25519Signature.length === 0
    || typeof signature.mlDsa65Signature !== "string"
    || signature.mlDsa65Signature.length === 0
  ) {
    fail(
      ERR_REGISTRY_ROTATION_UNSIGNED,
      `${what} requires the pinned Ed25519+ML-DSA-65 envelope.`,
    );
  }
  if (signature.keyId !== expectedKeyId) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      `${what} signer does not match the pinned key '${expectedKeyId}'.`,
    );
  }
  return signature;
}

function checkRevoked(keyId: string, check: (keyId: string) => boolean): void {
  let revoked: boolean;
  try {
    revoked = check(keyId) === true;
  } catch {
    fail(
      ERR_REGISTRY_ROTATION_REVOKED,
      `Revocation status could not be established for keyId '${keyId}'.`,
    );
  }
  if (revoked) {
    fail(ERR_REGISTRY_ROTATION_REVOKED, `Key '${keyId}' is revoked.`);
  }
}

function requireVerifiers(value: RegistryRootVerifiers, what: string): void {
  if (
    typeof value !== "object"
    || value === null
    || typeof value.ed25519 !== "function"
    || typeof value.mlDsa65 !== "function"
  ) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      `Both pinned ${what} public-key verifiers are required.`,
    );
  }
}

function throwVerdict(verdict: string, message: string): void {
  if (verdict !== "ok") fail(verdict, message);
}

export interface RegistryRotationPolicyVerification {
  readonly expectedRootKeyId: string;
  /** Verification instant; the policy must be in force at it. */
  readonly at: string;
  /** Lowest acceptable policy serial (rollback floor for the policy itself). */
  readonly minPolicySerial?: number;
  readonly isRevoked: (keyId: string) => boolean;
  /** Root verifiers built with the rotationPolicy context. */
  readonly verifyRootPolicy: RegistryRootVerifiers;
}

export function verifyRegistryRotationPolicy(
  policy: RegistryRotationPolicy,
  options: RegistryRotationPolicyVerification,
): "verified" {
  if (policy.schema !== REGISTRY_ROTATION_POLICY_SCHEMA) {
    malformed(`unsupported policy schema '${String(policy.schema)}'.`);
  }
  validatePolicyFields(policy);
  requireNonEmpty(options.expectedRootKeyId, "expectedRootKeyId");
  const signature = checkEnvelope(
    policy.rootSignature,
    REGISTRY_ROTATION_POLICY_V1_CONTEXT,
    policy.rootKeyId,
    "Rotation policy",
  );
  if (policy.rootKeyId !== options.expectedRootKeyId) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      "Rotation policy root identity does not match the locally pinned root key.",
    );
  }
  checkRevoked(policy.rootKeyId, options.isRevoked);
  checkRevoked(policy.issuer.keyId, options.isRevoked);
  requireVerifiers(options.verifyRootPolicy, "offline-root policy");
  const message = registryRotationPolicyPreimage(policy);
  verifyComponent(
    message, signature.ed25519Signature, signature.keyId,
    options.verifyRootPolicy.ed25519, "offline-root policy",
  );
  verifyComponent(
    message, signature.mlDsa65Signature, signature.keyId,
    options.verifyRootPolicy.mlDsa65, "offline-root policy",
  );
  const at = parseInstant(options.at, "at");
  if (
    at < Date.parse(policy.notBefore)
    || at > Date.parse(policy.notAfter)
  ) {
    fail(
      ERR_REGISTRY_ROTATION_NOT_ACTIVE,
      "Rotation policy is not in force at the supplied verification instant.",
    );
  }
  const minPolicySerial = options.minPolicySerial ?? 0;
  if (!Number.isSafeInteger(minPolicySerial) || minPolicySerial < 0) {
    malformed("minPolicySerial must be a non-negative safe integer.");
  }
  if (policy.serial < minPolicySerial) {
    fail(
      ERR_REGISTRY_ROTATION_POLICY_STALE,
      `Rotation policy serial ${policy.serial} is below accepted floor ${minPolicySerial}.`,
    );
  }
  return "verified";
}

export interface RegistryRotationChainVerification
  extends RegistryRotationPolicyVerification {
  /** Highest delegation serial already accepted (rollback floor). */
  readonly minSerial?: number;
  readonly requiredRoles?: readonly string[];
  /** Root verifiers built with the delegation (v1) context, for the anchor. */
  readonly verifyRootDelegation: RegistryRootVerifiers;
  /** Issuer verifiers built with the rotationIssuer context. */
  readonly verifyIssuer: RegistryRootVerifiers;
  /** Public-key fingerprints of the issuer key bytes the host actually holds. */
  readonly issuerPublicKeyFingerprints: {
    readonly ed25519: string;
    readonly mlDsa65: string;
  };
  readonly sha256Hex: (bytes: Uint8Array) => string;
}

export interface RegistryRotationChain {
  readonly policy: RegistryRotationPolicy;
  /** The root-signed v1 delegation the policy extends. */
  readonly anchor: RegistryAuthorityDelegation;
  /** Every issued delegation the host found (any operational key). */
  readonly delegations: readonly RegistryIssuedDelegation[];
}

interface Window {
  readonly serial: number;
  readonly notBefore: number;
  readonly notAfter: number;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function checkDelegationFitsPolicy(
  delegation: RegistryIssuedDelegation,
  policy: RegistryRotationPolicy,
  policyDigest: string,
  predecessor: Window,
  isFirst: boolean,
): Window {
  validateIssuedFields(delegation);
  if (
    delegation.registry !== policy.registry
    || delegation.rootKeyId !== policy.rootKeyId
    || delegation.policySerial !== policy.serial
    || delegation.policySha256 !== policyDigest
    || delegation.issuerKeyId !== policy.issuer.keyId
  ) {
    fail(
      ERR_REGISTRY_ROTATION_CHAIN,
      `Issued delegation serial ${delegation.serial} is not bound to this rotation policy.`,
    );
  }
  const notBefore = Date.parse(delegation.notBefore);
  const notAfter = Date.parse(delegation.notAfter);
  const issuedAt = Date.parse(delegation.issuedAt);
  const policyStart = Date.parse(policy.notBefore);
  const policyEnd = Date.parse(policy.notAfter);

  throwVerdict(
    rotationSerialVerdict(delegation.serial, predecessor.serial),
    `Issued delegation serial ${delegation.serial} is not newer than ${predecessor.serial} (replay or rollback).`,
  );
  const outside = delegation.roles.filter(
    (role) => !policy.allowedRoles.includes(role),
  ).length;
  throwVerdict(
    rotationRoleVerdict(delegation.roles.length, outside),
    `Issued delegation serial ${delegation.serial} grants a role outside the policy.`,
  );
  throwVerdict(
    rotationAlgorithmVerdict(
      delegation.operational.algorithm === DELEGATION_ALGORITHM
        && policy.allowedAlgorithms.includes(REGISTRY_ROTATION_ALGORITHM_SUITE),
    ),
    `Issued delegation serial ${delegation.serial} uses an algorithm outside the policy.`,
  );
  const operational = delegation.operational;
  const pinned = policy.pinnedOperationalKeys.find(
    (key) => key.keyId === operational.keyId,
  );
  throwVerdict(
    rotationKeyVerdict(
      policy.deniedOperationalKeyIds.includes(operational.keyId),
      operational.keyId === policy.rootKeyId
        || operational.keyId === policy.issuer.keyId,
      pinned !== undefined,
      pinned !== undefined
        && pinned.ed25519PublicKeySha256 === operational.ed25519PublicKeySha256
        && pinned.mlDsa65PublicKeySha256 === operational.mlDsa65PublicKeySha256,
      policy.allowGeneratedKeyIds,
      KEY_ID.test(operational.keyId),
    ),
    `Issued delegation serial ${delegation.serial} names operational key '${operational.keyId}' outside the policy.`,
  );
  throwVerdict(
    rotationLifetimeVerdict(
      notAfter - notBefore,
      policy.maxDelegationLifetimeSeconds * 1000,
    ),
    `Issued delegation serial ${delegation.serial} exceeds the policy lifetime cap.`,
  );
  throwVerdict(
    rotationWindowVerdict(
      notBefore < policyStart,
      notAfter > policyEnd,
      issuedAt < policyStart || issuedAt > policyEnd,
      issuedAt > notBefore,
    ),
    `Issued delegation serial ${delegation.serial} falls outside the policy window or is backdated.`,
  );
  throwVerdict(
    rotationOverlapVerdict(
      predecessor.notAfter - notBefore,
      policy.minOverlapSeconds * 1000,
      notBefore < predecessor.notBefore,
    ),
    `Issued delegation serial ${delegation.serial} leaves a gap or too short an overlap after serial ${predecessor.serial}.`,
  );
  if (isFirst && policy.firstRotation !== null) {
    if (operational.keyId !== policy.firstRotation.toKeyId) {
      fail(
        ERR_REGISTRY_ROTATION_KEY_NOT_ALLOWED,
        `The first rotation must move to '${policy.firstRotation.toKeyId}'.`,
      );
    }
  }
  return { serial: delegation.serial, notBefore, notAfter };
}

/**
 * Verify the full chain for `target`: policy (root-signed, in force, not
 * rolled back), anchor (root-signed v1 delegation named by the policy), every
 * issued delegation from the anchor to `target` (issuer signature, bounds,
 * serial monotonic, overlap/no-gap), then the target itself (active, above the
 * serial floor, required roles, issuer/root/operational not revoked).
 * Operational keys of earlier chain links may be retired or revoked without
 * killing the chain; only the root, the issuer and the target's key matter.
 */
export function verifyRegistryIssuedDelegationChain(
  target: RegistryIssuedDelegation,
  chain: RegistryRotationChain,
  options: RegistryRotationChainVerification,
): "verified" {
  const { policy, anchor } = chain;
  verifyRegistryRotationPolicy(policy, options);
  if (
    options.issuerPublicKeyFingerprints.ed25519 !== policy.issuer.ed25519PublicKeySha256
    || options.issuerPublicKeyFingerprints.mlDsa65 !== policy.issuer.mlDsa65PublicKeySha256
  ) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      "Issuer public-key bytes do not match the fingerprints the offline root signed.",
    );
  }
  requireVerifiers(options.verifyIssuer, "issuer");
  const policyDigest = registryRotationPolicyDigest(policy, options.sha256Hex);

  // Anchor: root-signed v1, extended (not replaced) by the policy. A retired
  // or revoked anchor operational key must not kill the chain, so only the
  // root's revocation status is consulted for it.
  if (
    anchor.registry !== policy.registry
    || anchor.rootKeyId !== policy.rootKeyId
    || anchor.serial !== policy.anchor.serial
    || anchor.operational.keyId !== policy.anchor.keyId
    || anchor.notAfter !== policy.anchor.notAfter
  ) {
    fail(
      ERR_REGISTRY_ROTATION_ANCHOR,
      "The anchor delegation does not match the anchor the root signed in the policy.",
    );
  }
  try {
    verifyRegistryAuthorityDelegation(anchor, {
      expectedRootKeyId: options.expectedRootKeyId,
      at: anchor.notBefore,
      minSerial: 0,
      isRevoked: (keyId) =>
        keyId === anchor.rootKeyId ? options.isRevoked(keyId) : false,
      verifyRoot: options.verifyRootDelegation,
    });
  } catch (error) {
    if (error instanceof RegistryRotationError) throw error;
    const code = (error as { code?: unknown }).code;
    fail(
      ERR_REGISTRY_ROTATION_ANCHOR,
      `The anchor delegation did not verify (${typeof code === "string" ? code : "error"}).`,
    );
  }

  const bound = chain.delegations
    .filter((candidate) => candidate.policySerial === policy.serial)
    .sort((a, b) => a.serial - b.serial);
  if (bound.length > REGISTRY_ROTATION_MAX_CHAIN_LENGTH) {
    fail(ERR_REGISTRY_ROTATION_CHAIN, "Issued delegation chain is too long.");
  }
  const seen = new Set<number>();
  for (const candidate of bound) {
    if (seen.has(candidate.serial)) {
      fail(
        ERR_REGISTRY_ROTATION_SERIAL,
        `Issued delegation serial ${candidate.serial} appears more than once.`,
      );
    }
    seen.add(candidate.serial);
  }
  const prefix = bound.filter((candidate) => candidate.serial <= target.serial);
  const last = prefix[prefix.length - 1];
  if (last === undefined || !sameDelegation(last, target)) {
    fail(
      ERR_REGISTRY_ROTATION_CHAIN,
      "The selected delegation is not part of the supplied issued chain.",
    );
  }

  let predecessor: Window = {
    serial: anchor.serial,
    notBefore: Date.parse(anchor.notBefore),
    notAfter: Date.parse(anchor.notAfter),
  };
  const issuerEnvelopeContext = REGISTRY_ISSUED_DELEGATION_V1_CONTEXT;
  prefix.forEach((delegation, position) => {
    if (delegation.schema !== REGISTRY_ISSUED_DELEGATION_SCHEMA) {
      malformed(`unsupported delegation schema '${String(delegation.schema)}'.`);
    }
    const signature = checkEnvelope(
      delegation.issuerSignature,
      issuerEnvelopeContext,
      policy.issuer.keyId,
      "Issued delegation",
    );
    const message = registryIssuedDelegationPreimage(delegation);
    verifyComponent(
      message, signature.ed25519Signature, signature.keyId,
      options.verifyIssuer.ed25519, "issuer",
    );
    verifyComponent(
      message, signature.mlDsa65Signature, signature.keyId,
      options.verifyIssuer.mlDsa65, "issuer",
    );
    predecessor = checkDelegationFitsPolicy(
      delegation, policy, policyDigest, predecessor, position === 0,
    );
  });

  // The target itself.
  const at = parseInstant(options.at, "at");
  if (
    at < Date.parse(target.notBefore)
    || at > Date.parse(target.notAfter)
  ) {
    fail(
      ERR_REGISTRY_ROTATION_NOT_ACTIVE,
      "Issued delegation is not active at the supplied verification instant.",
    );
  }
  const minSerial = options.minSerial ?? 0;
  if (!Number.isSafeInteger(minSerial) || minSerial < 0) {
    malformed("minSerial must be a non-negative safe integer.");
  }
  if (target.serial <= minSerial) {
    fail(
      ERR_REGISTRY_ROTATION_STALE,
      `Issued delegation serial ${target.serial} is not newer than accepted floor ${minSerial}.`,
    );
  }
  for (const role of options.requiredRoles ?? []) {
    if (
      !ALLOWED_ROLES.includes(role as RegistryDelegationRole)
      || !target.roles.includes(role as RegistryDelegationRole)
    ) {
      fail(
        ERR_REGISTRY_ROTATION_ROLE,
        `Issued delegation does not authorize required role '${role}'.`,
      );
    }
  }
  checkRevoked(target.operational.keyId, options.isRevoked);
  return "verified";
}

function sameDelegation(
  a: RegistryIssuedDelegation,
  b: RegistryIssuedDelegation,
): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export interface IssuedDelegatedRegistryIndexVerification {
  readonly chain: RegistryRotationChain;
  readonly authority: Omit<RegistryRotationChainVerification, "requiredRoles">;
  readonly operationalPublicKeyFingerprints: {
    readonly ed25519: string;
    readonly mlDsa65: string;
  };
  readonly verifyIndex: RegistryIndexVerifier;
  readonly minIndexIssuedAt?: string;
}

export interface IssuedDelegatedRegistryManifestVerification {
  readonly chain: RegistryRotationChain;
  readonly authority: Omit<RegistryRotationChainVerification, "requiredRoles">;
  readonly operationalPublicKeyFingerprints: {
    readonly ed25519: string;
    readonly mlDsa65: string;
  };
  readonly verifyManifest: RegistryManifestVerifiers;
}

function checkOperationalBytes(
  delegation: RegistryIssuedDelegation,
  fingerprints: { readonly ed25519: string; readonly mlDsa65: string },
): void {
  if (
    fingerprints.ed25519 !== delegation.operational.ed25519PublicKeySha256
    || fingerprints.mlDsa65 !== delegation.operational.mlDsa65PublicKeySha256
  ) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      "Operational public-key bytes do not match the issuer-authorized fingerprints.",
    );
  }
}

export function verifyRegistryIndexUnderIssuedDelegation(
  index: RegistryIndex,
  delegation: RegistryIssuedDelegation,
  options: IssuedDelegatedRegistryIndexVerification,
): "verified" {
  verifyRegistryIssuedDelegationChain(delegation, options.chain, {
    ...options.authority,
    requiredRoles: ["registry-index.sign"],
  });
  checkOperationalBytes(delegation, options.operationalPublicKeyFingerprints);
  const signature = index.signature;
  if (
    index.schema !== "galerina-registry-index/v2"
    || signature === undefined
    || signature.algorithm !== DELEGATION_ALGORITHM
    || signature.keyId !== delegation.operational.keyId
  ) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      "Registry index is not signed by the issued operational authority.",
    );
  }
  return verifyRegistryIndex(index, options.verifyIndex, options.minIndexIssuedAt);
}

export function verifyRegistryPackageManifestUnderIssuedDelegation(
  manifest: RegistryPackageManifest,
  delegation: RegistryIssuedDelegation,
  options: IssuedDelegatedRegistryManifestVerification,
): "verified" {
  verifyRegistryIssuedDelegationChain(delegation, options.chain, {
    ...options.authority,
    requiredRoles: ["package-manifest.sign"],
  });
  checkOperationalBytes(delegation, options.operationalPublicKeyFingerprints);
  if (
    manifest.keyId !== delegation.operational.keyId
    || manifest.signerKeyId !== delegation.operational.keyId
  ) {
    fail(
      ERR_REGISTRY_ROTATION_KEY_MISMATCH,
      "Package manifest is not signed by the issued operational authority.",
    );
  }
  return verifyRegistryPackageManifest(
    manifest,
    options.verifyManifest,
    delegation.operational.keyId,
  );
}

// ---------------------------------------------------------------------------
// Scheduling: the next issuance window that extends the chain with no gap.
// ---------------------------------------------------------------------------

export interface RegistryRotationPlanInput {
  readonly policy: RegistryRotationPolicy;
  /** The newest published window (an anchor, or the newest issued delegation). */
  readonly predecessor: {
    readonly serial: number;
    readonly notBefore: string;
    readonly notAfter: string;
  };
  readonly now: string;
  /** Requested lifetime; clamped to the policy cap. Defaults to the cap. */
  readonly lifetimeSeconds?: number;
  /** Requested overlap; never below the policy minimum. Defaults to the minimum. */
  readonly overlapSeconds?: number;
}

export interface RegistryRotationPlan {
  readonly serial: number;
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly notAfter: string;
  /** Latest instant by which this plan's delegation must be published. */
  readonly publishBy: string;
}

export function planRegistryRotationWindow(
  input: RegistryRotationPlanInput,
): RegistryRotationPlan {
  const { policy, predecessor } = input;
  const now = parseInstant(input.now, "now");
  const predecessorStart = parseInstant(predecessor.notBefore, "predecessor.notBefore");
  const predecessorEnd = parseInstant(predecessor.notAfter, "predecessor.notAfter");
  requirePositiveInt(predecessor.serial, "predecessor.serial");
  const lifetimeSeconds = Math.min(
    input.lifetimeSeconds ?? policy.maxDelegationLifetimeSeconds,
    policy.maxDelegationLifetimeSeconds,
  );
  requirePositiveInt(lifetimeSeconds, "lifetimeSeconds");
  const overlapSeconds = Math.max(
    input.overlapSeconds ?? policy.minOverlapSeconds,
    policy.minOverlapSeconds,
  );
  if (overlapSeconds >= lifetimeSeconds) {
    malformed("overlapSeconds must be shorter than the delegation lifetime.");
  }
  const policyStart = Date.parse(policy.notBefore);
  const policyEnd = Date.parse(policy.notAfter);
  const latestStart = predecessorEnd - policy.minOverlapSeconds * 1000;
  if (now > latestStart) {
    fail(
      ERR_REGISTRY_ROTATION_GAP,
      "Too late to extend the chain without a gap or a too-short overlap; "
      + "the root must sign a fresh anchor.",
    );
  }
  const earliestStart = Math.max(
    predecessorEnd - overlapSeconds * 1000,
    predecessorStart,
    policyStart,
    now,
  );
  const notBefore = earliestStart;
  const notAfter = Math.min(notBefore + lifetimeSeconds * 1000, policyEnd);
  if (notAfter <= predecessorEnd) {
    fail(
      ERR_REGISTRY_ROTATION_POLICY_WINDOW,
      "The policy window is exhausted; a new root-signed policy is required.",
    );
  }
  return {
    serial: predecessor.serial + 1,
    issuedAt: new Date(now).toISOString(),
    notBefore: new Date(notBefore).toISOString(),
    notAfter: new Date(notAfter).toISOString(),
    publishBy: new Date(latestStart).toISOString(),
  };
}