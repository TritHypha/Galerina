import { canonicalJson } from "./fuse-loader.js";
import {
  isVerifiedRegistryDurabilityEvidence,
  type RegistryDurabilityEvidenceRecord,
  type VerifiedRegistryDurabilityEvidence,
} from "./registry-durability-evidence.js";
import type { PersistedRegistryGeneration } from "./registry-generation-store.js";
import type {
  AdmittedRegistryRotationCandidate,
  AdmittedRegistryRotationIndex,
} from "./registry-rotation-authority.js";

export const REGISTRY_DURABILITY_PRODUCTION_SIGNATURE_CONTEXT =
  "galerina.registry.durability.production.sig.v1" as const;

export const REGISTRY_DURABILITY_PRODUCTION_RELEASE_CONTEXT =
  "galerina.registry.durability.production.release.v1" as const;

export interface RegistryDurabilityProductionSignature {
  readonly algorithm: "Ed25519+ML-DSA-65";
  readonly keyId: string;
  readonly ed25519Signature: string;
  readonly mlDsa65Signature: string;
  readonly canon: "jcs";
  readonly context: typeof REGISTRY_DURABILITY_PRODUCTION_SIGNATURE_CONTEXT;
}

export interface RegistryDurabilityProductionManifest {
  readonly schema: "galerina.registry.durability.production-manifest.v1";
  readonly adapterId: string;
  readonly sourceDigest: string;
  readonly contractDigest: string;
  readonly binaryDigest: string;
  readonly buildRecipeDigest: string;
  readonly toolchainDigest: string;
  readonly evidenceId: string;
  readonly repositoryCommit: string;
  readonly platform: RegistryDurabilityEvidenceRecord["platform"];
  readonly architecture: RegistryDurabilityEvidenceRecord["architecture"];
  readonly operatingSystem: RegistryDurabilityEvidenceRecord["operatingSystem"];
  readonly filesystem: string;
  readonly storageProfileDigest: string;
  readonly generationId: string;
  readonly operationalKeyId: string;
  readonly delegationSerial: number;
  readonly indexIssuedAt: string;
  readonly acceptedCheckpointDigest: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly rootSignature: RegistryDurabilityProductionSignature;
}

export type RegistryDurabilityRootVerifier = (
  message: Uint8Array,
  signature: string,
  keyId: string,
) => boolean | "no-key";

export interface RegistryDurabilityProductionAuthority {
  readonly schema: "galerina.registry.durability.production-authority.v1";
  readonly expectedRootKeyId: string;
  readonly expectedOperationalKeyId: string;
  readonly at: string;
  readonly minDelegationSerial: number;
  readonly isRevoked: (keyId: string) => boolean;
  readonly verifyRootEd25519: RegistryDurabilityRootVerifier;
  readonly verifyRootMlDsa65: RegistryDurabilityRootVerifier;
}

export interface ProductionRegistryDurabilityProfile {
  readonly schema: "galerina.registry.durability.production-profile.v1";
  readonly adapterId: string;
  readonly durabilityAdapterDigest: string;
  readonly binaryDigest: string;
  readonly buildRecipeDigest: string;
  readonly toolchainDigest: string;
  readonly evidenceId: string;
  readonly repositoryCommit: string;
  readonly platform: RegistryDurabilityEvidenceRecord["platform"];
  readonly architecture: RegistryDurabilityEvidenceRecord["architecture"];
  readonly operatingSystem: RegistryDurabilityEvidenceRecord["operatingSystem"];
  readonly filesystem: string;
  readonly storageProfileDigest: string;
  readonly generationId: string;
  readonly rootKeyId: string;
  readonly operationalKeyId: string;
  readonly minDelegationSerial: number;
  readonly delegationSerial: number;
  readonly indexIssuedAt: string;
  readonly acceptedCheckpointDigest: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly authenticated: true;
  readonly authorityReleased: false;
  readonly productionAuthorizing: false;
}

/** Separate owner authorization that can promote one exact candidate profile. */
export interface RegistryDurabilityProductionReleaseAuthorization {
  readonly schema: "galerina.registry.durability.production-release.v1";
  readonly releaseId: string;
  readonly ownerKeyId: string;
  readonly targetEvidenceId: string;
  readonly targetGenerationId: string;
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly signature: string;
  readonly canon: "jcs";
  readonly context: typeof REGISTRY_DURABILITY_PRODUCTION_RELEASE_CONTEXT;
}

export type RegistryDurabilityProductionReleaseVerifier = (
  message: Uint8Array,
  signature: string,
  ownerKeyId: string,
) => boolean | "no-key";

/** An activated profile is distinct from the non-authorizing candidate and is process-local. */
export interface ReleasedRegistryDurabilityProfile
  extends Omit<ProductionRegistryDurabilityProfile, "authorityReleased" | "productionAuthorizing"> {
  readonly releaseId: string;
  readonly ownerKeyId: string;
  readonly releasedAt: string;
  readonly authorityReleased: true;
  readonly productionAuthorizing: true;
}

export class RegistryDurabilityProductionError extends TypeError {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "RegistryDurabilityProductionError";
    this.code = code;
  }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const GENERATION = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[0-9A-Za-z][0-9A-Za-z._-]{2,127}$/;
const ADAPTER_ID =
  /^galerina\.registry\.durability\.(windows|linux|macos)\.v[1-9][0-9]*$/;
const KEY_ID = /^[0-9A-Za-z][0-9A-Za-z._-]{2,127}$/;
const MANIFEST_KEYS = Object.freeze([
  "acceptedCheckpointDigest",
  "adapterId",
  "architecture",
  "binaryDigest",
  "buildRecipeDigest",
  "contractDigest",
  "delegationSerial",
  "evidenceId",
  "filesystem",
  "generationId",
  "indexIssuedAt",
  "notAfter",
  "notBefore",
  "operatingSystem",
  "operationalKeyId",
  "platform",
  "repositoryCommit",
  "rootSignature",
  "schema",
  "sourceDigest",
  "storageProfileDigest",
  "toolchainDigest",
]);
const SIGNATURE_KEYS = Object.freeze([
  "algorithm",
  "canon",
  "context",
  "ed25519Signature",
  "keyId",
  "mlDsa65Signature",
]);
const AUTHORITY_KEYS = Object.freeze([
  "at",
  "expectedOperationalKeyId",
  "expectedRootKeyId",
  "isRevoked",
  "minDelegationSerial",
  "schema",
  "verifyRootEd25519",
  "verifyRootMlDsa65",
]);
const RELEASE_AUTHORIZATION_KEYS = Object.freeze([
  "canon",
  "context",
  "issuedAt",
  "notAfter",
  "notBefore",
  "ownerKeyId",
  "releaseId",
  "schema",
  "signature",
  "targetEvidenceId",
  "targetGenerationId",
]);
const productionProfiles = new WeakSet<object>();
const releasedProfiles = new WeakSet<object>();

function refuse(code: string): never {
  throw new RegistryDurabilityProductionError(code);
}

function hasExactDataShape(
  value: object,
  keys: readonly string[],
  functionsAllowed = false,
): boolean {
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).sort().join(",") !== keys.join(",")) return false;
  return Object.values(descriptors).every((descriptor) =>
    "value" in descriptor
    && descriptor.get === undefined
    && descriptor.set === undefined
    && (functionsAllowed || typeof descriptor.value !== "function")
  );
}

function canonicalInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : null;
}

function manifestShapeIsValid(
  value: unknown,
): value is RegistryDurabilityProductionManifest {
  if (
    typeof value !== "object"
    || value === null
    || !hasExactDataShape(value, MANIFEST_KEYS)
  ) {
    return false;
  }
  const manifest = value as RegistryDurabilityProductionManifest;
  const signature = manifest.rootSignature;
  return manifest.schema === "galerina.registry.durability.production-manifest.v1"
    && ADAPTER_ID.test(manifest.adapterId)
    && manifest.adapterId.includes(`.${manifest.platform}.`)
    && DIGEST.test(manifest.sourceDigest)
    && DIGEST.test(manifest.contractDigest)
    && DIGEST.test(manifest.binaryDigest)
    && DIGEST.test(manifest.buildRecipeDigest)
    && DIGEST.test(manifest.toolchainDigest)
    && DIGEST.test(manifest.evidenceId)
    && COMMIT.test(manifest.repositoryCommit)
    && DIGEST.test(manifest.storageProfileDigest)
    && GENERATION.test(manifest.generationId)
    && KEY_ID.test(manifest.operationalKeyId)
    && Number.isSafeInteger(manifest.delegationSerial)
    && manifest.delegationSerial > 0
    && canonicalInstant(manifest.indexIssuedAt) !== null
    && DIGEST.test(manifest.acceptedCheckpointDigest)
    && canonicalInstant(manifest.notBefore) !== null
    && canonicalInstant(manifest.notAfter) !== null
    && typeof signature === "object"
    && signature !== null
    && hasExactDataShape(signature, SIGNATURE_KEYS)
    && signature.algorithm === "Ed25519+ML-DSA-65"
    && KEY_ID.test(signature.keyId)
    && typeof signature.ed25519Signature === "string"
    && signature.ed25519Signature.length > 0
    && signature.ed25519Signature.length <= 16_384
    && typeof signature.mlDsa65Signature === "string"
    && signature.mlDsa65Signature.length > 0
    && signature.mlDsa65Signature.length <= 65_536
    && signature.canon === "jcs"
    && signature.context === REGISTRY_DURABILITY_PRODUCTION_SIGNATURE_CONTEXT;
}

function authorityShapeIsValid(
  value: unknown,
): value is RegistryDurabilityProductionAuthority {
  if (
    typeof value !== "object"
    || value === null
    || !hasExactDataShape(value, AUTHORITY_KEYS, true)
  ) {
    return false;
  }
  const authority = value as RegistryDurabilityProductionAuthority;
  return authority.schema
    === "galerina.registry.durability.production-authority.v1"
    && KEY_ID.test(authority.expectedRootKeyId)
    && KEY_ID.test(authority.expectedOperationalKeyId)
    && canonicalInstant(authority.at) !== null
    && Number.isSafeInteger(authority.minDelegationSerial)
    && authority.minDelegationSerial >= 0
    && typeof authority.isRevoked === "function"
    && typeof authority.verifyRootEd25519 === "function"
    && typeof authority.verifyRootMlDsa65 === "function";
}

function releaseAuthorizationShapeIsValid(
  value: unknown,
): value is RegistryDurabilityProductionReleaseAuthorization {
  if (
    typeof value !== "object"
    || value === null
    || !hasExactDataShape(value, RELEASE_AUTHORIZATION_KEYS)
  ) {
    return false;
  }
  const authorization = value as RegistryDurabilityProductionReleaseAuthorization;
  const issuedAt = canonicalInstant(authorization.issuedAt);
  const notBefore = canonicalInstant(authorization.notBefore);
  const notAfter = canonicalInstant(authorization.notAfter);
  return authorization.schema
    === "galerina.registry.durability.production-release.v1"
    && RELEASE_ID.test(authorization.releaseId)
    && KEY_ID.test(authorization.ownerKeyId)
    && DIGEST.test(authorization.targetEvidenceId)
    && GENERATION.test(authorization.targetGenerationId)
    && issuedAt !== null
    && notBefore !== null
    && notAfter !== null
    && notBefore <= issuedAt
    && issuedAt <= notAfter
    && typeof authorization.signature === "string"
    && authorization.signature.length > 0
    && authorization.signature.length <= 65_536
    && authorization.canon === "jcs"
    && authorization.context === REGISTRY_DURABILITY_PRODUCTION_RELEASE_CONTEXT;
}

function preimage(manifest: RegistryDurabilityProductionManifest): Uint8Array {
  const { rootSignature: _signature, ...unsigned } = manifest;
  return new TextEncoder().encode(
    `${REGISTRY_DURABILITY_PRODUCTION_SIGNATURE_CONTEXT}\0Ed25519+ML-DSA-65\0${manifest.rootSignature.keyId}\0jcs\0${canonicalJson(unsigned)}`,
  );
}

function releasePreimage(
  profile: ProductionRegistryDurabilityProfile,
  authorization: RegistryDurabilityProductionReleaseAuthorization,
): Uint8Array {
  const { signature: _signature, ...unsignedAuthorization } = authorization;
  return new TextEncoder().encode(
    `${REGISTRY_DURABILITY_PRODUCTION_RELEASE_CONTEXT}\0jcs\0${canonicalJson({
      authorization: unsignedAuthorization,
      profile,
    })}`,
  );
}

function verifyComponent(
  verifier: RegistryDurabilityRootVerifier,
  message: Uint8Array,
  signature: string,
  keyId: string,
): void {
  let result: boolean | "no-key";
  try {
    result = verifier(message, signature, keyId);
  } catch {
    refuse("REGISTRY_DURABILITY_PRODUCTION_SIGNATURE_REFUSED");
  }
  if (result !== true) {
    refuse("REGISTRY_DURABILITY_PRODUCTION_SIGNATURE_REFUSED");
  }
}

export function admitRegistryDurabilityProfile(
  manifestValue: unknown,
  evidenceValue: VerifiedRegistryDurabilityEvidence,
  authorityValue: RegistryDurabilityProductionAuthority,
): ProductionRegistryDurabilityProfile {
  try {
    if (!manifestShapeIsValid(manifestValue)) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_MANIFEST_REFUSED");
    }
    if (!isVerifiedRegistryDurabilityEvidence(evidenceValue)) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_EVIDENCE_REFUSED");
    }
    if (!authorityShapeIsValid(authorityValue)) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_AUTHORITY_REFUSED");
    }
    const manifest = manifestValue;
    const evidence = evidenceValue;
    const authority = authorityValue;
    const at = canonicalInstant(authority.at) as number;
    const notBefore = canonicalInstant(manifest.notBefore) as number;
    const notAfter = canonicalInstant(manifest.notAfter) as number;
    const indexIssuedAt = canonicalInstant(manifest.indexIssuedAt) as number;
    if (
      at < notBefore
      || at > notAfter
      || indexIssuedAt < notBefore
      || indexIssuedAt > at
      || manifest.delegationSerial <= authority.minDelegationSerial
      || manifest.rootSignature.keyId !== authority.expectedRootKeyId
      || manifest.operationalKeyId !== authority.expectedOperationalKeyId
    ) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_AUTHORITY_REFUSED");
    }
    let revoked = true;
    try {
      revoked = authority.isRevoked(manifest.rootSignature.keyId) !== false
        || authority.isRevoked(manifest.operationalKeyId) !== false;
    } catch {
      revoked = true;
    }
    if (revoked) refuse("REGISTRY_DURABILITY_PRODUCTION_REVOKED");
    if (
      evidence.evidenceClass !== "PRODUCTION_ADMISSION"
      || Object.values(evidence.checks).some((status) => status !== "PASS")
      || manifest.evidenceId !== evidence.evidenceId
      || manifest.repositoryCommit !== evidence.repositoryCommit
      || manifest.platform !== evidence.platform
      || manifest.architecture !== evidence.architecture
      || manifest.operatingSystem !== evidence.operatingSystem
      || manifest.filesystem !== evidence.filesystem
      || manifest.storageProfileDigest !== evidence.storageProfileDigest
      || manifest.sourceDigest !== evidence.implementationDigest
    ) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_IDENTITY_REFUSED");
    }
    const message = preimage(manifest);
    verifyComponent(
      authority.verifyRootEd25519,
      message,
      manifest.rootSignature.ed25519Signature,
      manifest.rootSignature.keyId,
    );
    verifyComponent(
      authority.verifyRootMlDsa65,
      message,
      manifest.rootSignature.mlDsa65Signature,
      manifest.rootSignature.keyId,
    );
    const profile = Object.freeze({
      schema: "galerina.registry.durability.production-profile.v1" as const,
      adapterId: manifest.adapterId,
      durabilityAdapterDigest: manifest.sourceDigest,
      binaryDigest: manifest.binaryDigest,
      buildRecipeDigest: manifest.buildRecipeDigest,
      toolchainDigest: manifest.toolchainDigest,
      evidenceId: manifest.evidenceId,
      repositoryCommit: manifest.repositoryCommit,
      platform: manifest.platform,
      architecture: manifest.architecture,
      operatingSystem: manifest.operatingSystem,
      filesystem: manifest.filesystem,
      storageProfileDigest: manifest.storageProfileDigest,
      generationId: manifest.generationId,
      rootKeyId: manifest.rootSignature.keyId,
      operationalKeyId: manifest.operationalKeyId,
      minDelegationSerial: authority.minDelegationSerial,
      delegationSerial: manifest.delegationSerial,
      indexIssuedAt: manifest.indexIssuedAt,
      acceptedCheckpointDigest: manifest.acceptedCheckpointDigest,
      notBefore: manifest.notBefore,
      notAfter: manifest.notAfter,
      authenticated: true as const,
      authorityReleased: false as const,
      productionAuthorizing: false as const,
    });
    productionProfiles.add(profile);
    return profile;
  } catch (error) {
    if (error instanceof RegistryDurabilityProductionError) throw error;
    refuse("REGISTRY_DURABILITY_PRODUCTION_MALFORMED_REFUSED");
  }
}

/**
 * Promote one process-local candidate only after a separate owner signature authorizes its exact
 * evidence and generation. This is the sole production-authority release path; malformed,
 * copied, stale, cross-key or verifier-failed inputs remain refused.
 */
export function activateRegistryDurabilityProfile(
  profileValue: unknown,
  authorizationValue: unknown,
  verifier: RegistryDurabilityProductionReleaseVerifier,
  nowMs: number = Date.now(),
): ReleasedRegistryDurabilityProfile {
  try {
    if (!isProductionRegistryDurabilityProfile(profileValue)) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_PROFILE_REFUSED");
    }
    if (!releaseAuthorizationShapeIsValid(authorizationValue)) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_RELEASE_REFUSED");
    }
    if (typeof verifier !== "function") {
      refuse("REGISTRY_DURABILITY_PRODUCTION_RELEASE_REFUSED");
    }
    const profile = profileValue;
    const authorization = authorizationValue;
    const issuedAt = canonicalInstant(authorization.issuedAt) as number;
    const notBefore = canonicalInstant(authorization.notBefore) as number;
    const notAfter = canonicalInstant(authorization.notAfter) as number;
    const profileNotBefore = canonicalInstant(profile.notBefore);
    const profileNotAfter = canonicalInstant(profile.notAfter);
    const profileIssuedAt = canonicalInstant(profile.indexIssuedAt);
    if (
      profileNotBefore === null
      || profileNotAfter === null
      || profileIssuedAt === null
      || !Number.isSafeInteger(nowMs)
      || nowMs < notBefore
      || nowMs >= notAfter
      || nowMs < profileNotBefore
      || nowMs >= profileNotAfter
      || notBefore < profileNotBefore
      || notAfter > profileNotAfter
      || issuedAt < profileIssuedAt
      || authorization.targetEvidenceId !== profile.evidenceId
      || authorization.targetGenerationId !== profile.generationId
      || authorization.ownerKeyId === profile.rootKeyId
      || authorization.ownerKeyId === profile.operationalKeyId
      || issuedAt > nowMs
    ) {
      refuse("REGISTRY_DURABILITY_PRODUCTION_RELEASE_REFUSED");
    }
    verifyComponent(
      verifier,
      releasePreimage(profile, authorization),
      authorization.signature,
      authorization.ownerKeyId,
    );
    const released = Object.freeze({
      ...profile,
      releaseId: authorization.releaseId,
      ownerKeyId: authorization.ownerKeyId,
      releasedAt: new Date(nowMs).toISOString(),
      authorityReleased: true as const,
      productionAuthorizing: true as const,
    });
    releasedProfiles.add(released);
    return released;
  } catch (error) {
    if (error instanceof RegistryDurabilityProductionError) throw error;
    refuse("REGISTRY_DURABILITY_PRODUCTION_RELEASE_REFUSED");
  }
}

export function isProductionRegistryDurabilityProfile(
  value: unknown,
): value is ProductionRegistryDurabilityProfile {
  return typeof value === "object"
    && value !== null
    && productionProfiles.has(value);
}

export function isReleasedRegistryDurabilityProfile(
  value: unknown,
): value is ReleasedRegistryDurabilityProfile {
  return typeof value === "object"
    && value !== null
    && releasedProfiles.has(value);
}

export interface RegistryDurabilityRotationIdentity {
  readonly profile: ProductionRegistryDurabilityProfile;
  readonly candidateGeneration: PersistedRegistryGeneration;
  readonly receipt: AdmittedRegistryRotationCandidate;
  readonly admittedIndex: AdmittedRegistryRotationIndex;
  readonly acceptedCheckpointDigest: string;
  readonly authorityAt: string;
}

export function registryDurabilityProfileMatchesRotation(
  identity: RegistryDurabilityRotationIdentity,
): boolean {
  try {
    if (!isProductionRegistryDurabilityProfile(identity.profile)) return false;
    const authorityAt = canonicalInstant(identity.authorityAt);
    const notAfter = canonicalInstant(identity.profile.notAfter);
    return authorityAt !== null
      && notAfter !== null
      && authorityAt <= notAfter
      && identity.profile.generationId
        === identity.candidateGeneration.generationId
      && identity.profile.operationalKeyId
        === identity.candidateGeneration.operationalKeyId
      && identity.profile.operationalKeyId === identity.receipt.keyId
      && identity.profile.delegationSerial
        === identity.candidateGeneration.delegationSerial
      && identity.profile.delegationSerial === identity.receipt.delegationSerial
      && identity.profile.indexIssuedAt
        === identity.candidateGeneration.indexIssuedAt
      && identity.profile.indexIssuedAt === identity.admittedIndex.issuedAt
      && identity.profile.durabilityAdapterDigest
        === identity.candidateGeneration.durabilityAdapterDigest
      && identity.profile.acceptedCheckpointDigest
        === identity.acceptedCheckpointDigest;
  } catch {
    return false;
  }
}
