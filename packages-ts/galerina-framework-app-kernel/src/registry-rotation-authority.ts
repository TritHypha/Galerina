import {
  decideAtBoundary,
  Verdict,
  type GovernanceDiagnostic,
} from "@galerina/tower-citizen/governance";
import {
  createRegistryPublicVerifiers,
  registryRotationKeyCommit,
  registryRotationPublicKeyFingerprints,
  stageCandidate,
  type PhaseOutcome,
  type RotationProcess,
  type RegistryRotationPublicBundle,
} from "@galerina/tower-citizen/custody";
import {
  verifyRegistryAuthorityDelegation,
  type RegistryAuthorityDelegation,
} from "./registry-authority.js";
import {
  verifyRegistryIndex,
  type RegistryIndex,
} from "./registry-index.js";

export interface RegistryRotationAuthorityOptions {
  readonly delegation: RegistryAuthorityDelegation;
  readonly expectedRootKeyId: string;
  readonly rootPublicBundle: RegistryRotationPublicBundle;
  readonly operationalPublicBundle: RegistryRotationPublicBundle;
  readonly at: string;
  readonly minDelegationSerial: number;
  readonly isRevoked: (keyId: string) => boolean;
}

export interface AdmittedRegistryRotationCandidate {
  readonly keyId: string;
  readonly keyCommit: string;
  readonly delegationSerial: number;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly roles: readonly [
    "package-manifest.sign",
    "registry-index.sign",
  ];
}

const admittedCandidates = new WeakSet<object>();
const admittedIndexes = new WeakSet<object>();

/**
 * Verify a pre-provisioned candidate under the offline root. This does not
 * rotate or sign anything; it only mints an in-process receipt that the
 * Galerina rotation controller can distinguish from a caller-authored object.
 */
export function admitRegistryRotationCandidate(
  options: RegistryRotationAuthorityOptions,
): AdmittedRegistryRotationCandidate {
  if (
    options.rootPublicBundle.keyId !== options.expectedRootKeyId
    || options.operationalPublicBundle.keyId
      !== options.delegation.operational?.keyId
  ) {
    throw new TypeError(
      "registry rotation public identities do not match the delegation",
    );
  }
  const verifyRoot = createRegistryPublicVerifiers({
    role: "root",
    ...options.rootPublicBundle,
  });
  const fingerprints = registryRotationPublicKeyFingerprints(
    options.operationalPublicBundle,
  );
  verifyRegistryAuthorityDelegation(options.delegation, {
    expectedRootKeyId: options.expectedRootKeyId,
    at: options.at,
    minSerial: options.minDelegationSerial,
    requiredRoles: ["package-manifest.sign", "registry-index.sign"],
    isRevoked: options.isRevoked,
    verifyRoot,
  });
  if (
    options.delegation.operational.ed25519PublicKeySha256
      !== fingerprints.ed25519PublicKeySha256
    || options.delegation.operational.mlDsa65PublicKeySha256
      !== fingerprints.mlDsa65PublicKeySha256
  ) {
    throw new TypeError(
      "registry rotation candidate public keys do not match offline-root pins",
    );
  }
  const receipt: AdmittedRegistryRotationCandidate = Object.freeze({
    keyId: options.operationalPublicBundle.keyId,
    keyCommit: registryRotationKeyCommit(
      options.operationalPublicBundle,
    ),
    delegationSerial: options.delegation.serial,
    notBefore: options.delegation.notBefore,
    notAfter: options.delegation.notAfter,
    roles: Object.freeze([
      "package-manifest.sign",
      "registry-index.sign",
    ]) as AdmittedRegistryRotationCandidate["roles"],
  });
  admittedCandidates.add(receipt);
  return receipt;
}

export function isAdmittedRegistryRotationCandidate(
  value: unknown,
): value is AdmittedRegistryRotationCandidate {
  return typeof value === "object"
    && value !== null
    && admittedCandidates.has(value);
}

export interface AdmittedRegistryRotationIndex {
  readonly keyId: string;
  readonly issuedAt: string;
  readonly entryCount: number;
}

export function isAdmittedRegistryRotationIndex(
  value: unknown,
): value is AdmittedRegistryRotationIndex {
  return typeof value === "object"
    && value !== null
    && admittedIndexes.has(value);
}

/**
 * Verify the complete candidate-signed index before it can become the active
 * artifact identity. Every entry must already name the candidate signer, so
 * an old-manifest/new-index split cannot be represented as rotation-ready.
 */
export function admitRegistryRotationIndex(options: {
  readonly receipt: AdmittedRegistryRotationCandidate;
  readonly publicBundle: RegistryRotationPublicBundle;
  readonly index: RegistryIndex;
  readonly minIndexIssuedAt: string;
}): AdmittedRegistryRotationIndex {
  if (
    !isAdmittedRegistryRotationCandidate(options.receipt)
    || options.publicBundle.keyId !== options.receipt.keyId
    || options.index.signature?.keyId !== options.receipt.keyId
    || options.index.entries.length === 0
    || options.index.entries.some(
      (entry) => entry.keyId !== options.receipt.keyId,
    )
  ) {
    throw new TypeError(
      "registry rotation index does not match the root-admitted candidate",
    );
  }
  const verifiers = createRegistryPublicVerifiers({
    role: "operational",
    ...options.publicBundle,
  });
  verifyRegistryIndex(
    options.index,
    verifiers,
    options.minIndexIssuedAt,
  );
  const admitted: AdmittedRegistryRotationIndex = Object.freeze({
    keyId: options.receipt.keyId,
    issuedAt: options.index.issuedAt,
    entryCount: options.index.entries.length,
  });
  admittedIndexes.add(admitted);
  return admitted;
}

export interface StageAdmittedRegistryRotationCandidateOptions {
  readonly process: RotationProcess;
  readonly ringMacKey: Uint8Array;
  readonly receipt: AdmittedRegistryRotationCandidate;
  readonly publicBundle: RegistryRotationPublicBundle;
  readonly custodyRef: string;
  readonly createdTick: number;
  readonly at: string;
  readonly onDiagnostic?: (diagnostic: GovernanceDiagnostic) => void;
}

function denied(
  process: RotationProcess,
  reason: string,
  onDiagnostic?: (diagnostic: GovernanceDiagnostic) => void,
): PhaseOutcome {
  return {
    process,
    decision: decideAtBoundary(Verdict.DENY, onDiagnostic),
    reasons: [`DENY: ${reason}`],
  };
}

/**
 * Stage only a live, exact, offline-root-admitted candidate. The custody
 * reference is opaque and cannot be a local path; no private bytes cross this
 * boundary.
 */
export function stageAdmittedRegistryRotationCandidate(
  options: StageAdmittedRegistryRotationCandidateOptions,
): PhaseOutcome {
  if (!isAdmittedRegistryRotationCandidate(options.receipt)) {
    return denied(
      options.process,
      "candidate receipt was not minted by the root-authority gate",
      options.onDiagnostic,
    );
  }
  if (
    options.publicBundle.keyId !== options.receipt.keyId
    || !Number.isSafeInteger(options.createdTick)
    || options.createdTick < 0
    || typeof options.custodyRef !== "string"
    || !/^custody:\/\/[A-Za-z0-9._/-]+$/.test(options.custodyRef)
  ) {
    return denied(
      options.process,
      "candidate identity, tick, or opaque custody reference is malformed",
      options.onDiagnostic,
    );
  }
  const at = Date.parse(options.at);
  if (
    !Number.isFinite(at)
    || new Date(at).toISOString() !== options.at
    || at < Date.parse(options.receipt.notBefore)
    || at > Date.parse(options.receipt.notAfter)
  ) {
    return denied(
      options.process,
      "candidate delegation is not active at the staging instant",
      options.onDiagnostic,
    );
  }
  let keyCommit: string;
  try {
    keyCommit = registryRotationKeyCommit(options.publicBundle);
  } catch {
    return denied(
      options.process,
      "candidate public bundle is malformed",
      options.onDiagnostic,
    );
  }
  if (keyCommit !== options.receipt.keyCommit) {
    return denied(
      options.process,
      "candidate public bundle does not match the admitted root receipt",
      options.onDiagnostic,
    );
  }
  return stageCandidate(
    options.process,
    options.ringMacKey,
    {
      keyId: options.receipt.keyId,
      keyKind: "asymmetric",
      keyCommit,
      fileRef: options.custodyRef,
      createdTick: options.createdTick,
    },
    options.onDiagnostic,
  );
}
