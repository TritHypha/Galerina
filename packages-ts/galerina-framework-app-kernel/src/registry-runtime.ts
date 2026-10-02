import {
  checkRegistryPolicy,
  lookupCertifiedPackage,
  type AdmissionResult,
  type CertifiedLookup,
  type HybridIndexVerifiers,
  type RegistryIndex,
  type RegistryPolicy,
} from "./registry-index.js";
import {
  verifyRegistryIndexUnderDelegation,
  type RegistryAuthorityDelegation,
} from "./registry-authority.js";
import { loadRegistryGeneration } from "./registry-generation-store.js";
import {
  activeEpoch,
  createRegistryPublicVerifiers,
  isRestoredRegistryRotationState,
  registryRotationKeyCommit,
  type RegistryRotationState,
} from "@galerina/tower-citizen/custody";
import {
  loadRegistryRuntimeHostFloor,
  loadTrustedRevocationAuthorityHostFloor,
} from "./host-floor.js";

interface NodeStats {
  readonly size: number;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

interface NodeFs {
  lstatSync(path: URL): NodeStats;
  readFileSync(path: URL): Uint8Array;
  readdirSync(path: URL): string[];
}

interface NodeHash {
  update(data: Uint8Array): NodeHash;
  digest(encoding: "hex"): string;
}

interface NodePublicKey {
  export(options: { readonly type: "spki"; readonly format: "der" }): Uint8Array;
}

interface NodeCrypto {
  createHash(algorithm: "sha256"): NodeHash;
  createPublicKey(pem: string): NodePublicKey;
}

interface NodeUrl {
  fileURLToPath(url: URL): string;
}

async function loadNode(): Promise<{
  fs: NodeFs;
  crypto: NodeCrypto;
  url: NodeUrl;
}> {
  const host = await loadRegistryRuntimeHostFloor();
  return host as { fs: NodeFs; crypto: NodeCrypto; url: NodeUrl };
}

const MAX_INDEX_BYTES = 1_048_576;
const MAX_DELEGATION_BYTES = 1_048_576;
const MAX_PUBLIC_KEY_BYTES = 65_536;
const SIGNED_DELEGATION =
  /^registry-delegation-([0-9a-f]{16})-v1\.json$/;

export const ERR_REGISTRY_RUNTIME_IO = "ERR_REGISTRY_RUNTIME_IO";
export const ERR_REGISTRY_RUNTIME_MALFORMED =
  "ERR_REGISTRY_RUNTIME_MALFORMED";
export const ERR_REGISTRY_RUNTIME_AUTHORITY =
  "ERR_REGISTRY_RUNTIME_AUTHORITY";

export class RegistryRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistryRuntimeError";
    this.code = code;
  }
}

export interface ProductionRegistryOptions {
  readonly expectedRootKeyId: string;
  readonly at: string;
  readonly minDelegationSerial: number;
  readonly minIndexIssuedAt: string;
  readonly isRevoked: (keyId: string) => boolean;
  readonly expectedOperationalEpoch?: {
    readonly keyId: string;
    readonly keyCommit: string;
  };
  readonly expectedAcceptedArtifacts?: {
    readonly delegationSerial: number;
    readonly indexIssuedAt: string;
    readonly generationId: string;
  };
}

export interface RotationBoundProductionRegistryOptions {
  readonly expectedRootKeyId: string;
  readonly rotationState: RegistryRotationState;
}

export interface ProductionRegistryRuntime {
  readonly rootKeyId: string;
  readonly operationalKeyId: string;
  readonly delegationSerial: number;
  readonly indexIssuedAt: string;
  readonly generationId: string | null;
  admit(
    lookup: CertifiedLookup,
    policy: RegistryPolicy,
  ): AdmissionResult;
}

function readBoundedFile(
  fs: NodeFs,
  path: URL,
  maxBytes: number,
  label: string,
): Uint8Array {
  let stats: NodeStats;
  try {
    stats = fs.lstatSync(path);
  } catch {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_IO,
      `${label} is missing or unreadable.`,
    );
  }
  if (
    !stats.isFile()
    || stats.isSymbolicLink()
    || !Number.isSafeInteger(stats.size)
    || stats.size <= 0
    || stats.size > maxBytes
  ) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_IO,
      `${label} is not a bounded regular file.`,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = fs.readFileSync(path);
  } catch {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_IO,
      `${label} could not be read.`,
    );
  }
  if (bytes.length !== stats.size || bytes.length > maxBytes) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_IO,
      `${label} changed while it was being read.`,
    );
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  if (
    bytes.length >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf
  ) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} must be canonical UTF-8 without a byte-order mark.`,
    );
  }
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} is not valid UTF-8.`,
    );
  }
  if (value.includes("\0")) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} contains a forbidden NUL character.`,
    );
  }
  return value;
}

function parseObject<T>(bytes: Uint8Array, label: string): T {
  let value: unknown;
  try {
    value = JSON.parse(decodeUtf8(bytes, label));
  } catch (error) {
    if (error instanceof RegistryRuntimeError) throw error;
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} is not valid JSON.`,
    );
  }
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} must contain one JSON object.`,
    );
  }
  return value as T;
}

function decodeCanonicalBase64(value: string, label: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} is not canonical base64.`,
    );
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  let roundTrip = "";
  for (const byte of bytes) roundTrip += String.fromCharCode(byte);
  if (btoa(roundTrip) !== value) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `${label} is not canonical base64.`,
    );
  }
  return bytes;
}

function sha256(crypto: NodeCrypto, bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function publicKeyFacts(
  fs: NodeFs,
  crypto: NodeCrypto,
  governanceRoot: URL,
  keyId: string,
): {
  readonly ed25519PublicKeyPem: string;
  readonly mlDsa65PublicKey: Uint8Array;
  readonly ed25519Sha256: string;
  readonly mlDsa65Sha256: string;
} {
  const edBytes = readBoundedFile(
    fs,
    new URL(`signing-key-${keyId}.pub.pem`, governanceRoot),
    MAX_PUBLIC_KEY_BYTES,
    `Ed25519 public key '${keyId}'`,
  );
  const ed25519PublicKeyPem = decodeUtf8(
    edBytes,
    `Ed25519 public key '${keyId}'`,
  );
  let edDer: Uint8Array;
  try {
    edDer = crypto.createPublicKey(ed25519PublicKeyPem).export({
      type: "spki",
      format: "der",
    });
  } catch {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_MALFORMED,
      `Ed25519 public key '${keyId}' is malformed.`,
    );
  }
  const mlText = decodeUtf8(
    readBoundedFile(
      fs,
      new URL(`signing-key-${keyId}.mldsa.pub.b64`, governanceRoot),
      MAX_PUBLIC_KEY_BYTES,
      `ML-DSA-65 public key '${keyId}'`,
    ),
    `ML-DSA-65 public key '${keyId}'`,
  ).trim();
  const mlDsa65PublicKey = decodeCanonicalBase64(
    mlText,
    `ML-DSA-65 public key '${keyId}'`,
  );
  return {
    ed25519PublicKeyPem,
    mlDsa65PublicKey,
    ed25519Sha256: sha256(crypto, edDer),
    mlDsa65Sha256: sha256(crypto, mlDsa65PublicKey),
  };
}

function deepFreeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

async function loadProductionRegistryFromRoot(
  repositoryRoot: URL,
  options: ProductionRegistryOptions & {
    readonly useSignedIndexIssuedAt?: boolean;
  },
): Promise<ProductionRegistryRuntime> {
  const { fs, crypto, url } = await loadNode();
  const governanceRoot = new URL("governance/", repositoryRoot);
  const registryRoot = new URL(
    "packages-ts/galerina-registry/",
    repositoryRoot,
  );
  const generationId =
    options.expectedAcceptedArtifacts?.generationId ?? null;
  let index: RegistryIndex | null = null;
  let indexKeyId: string | undefined;
  if (generationId === null) {
    index = parseObject<RegistryIndex>(
      readBoundedFile(
        fs,
        new URL("registry-index-v2.json", registryRoot),
        MAX_INDEX_BYTES,
        "bootstrap registry index",
      ),
      "bootstrap registry index",
    );
    indexKeyId = index.signature?.keyId;
  } else {
    indexKeyId = options.expectedOperationalEpoch?.keyId;
  }
  if (typeof indexKeyId !== "string" || indexKeyId.length === 0) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      "Production registry index has no signing identity.",
    );
  }

  let delegationNames: string[];
  try {
    delegationNames = fs.readdirSync(governanceRoot);
  } catch {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_IO,
      "Registry governance directory is missing or unreadable.",
    );
  }
  const matching: RegistryAuthorityDelegation[] = [];
  for (const name of delegationNames.sort()) {
    const match = SIGNED_DELEGATION.exec(name);
    if (match === null) continue;
    const delegation = parseObject<RegistryAuthorityDelegation>(
      readBoundedFile(
        fs,
        new URL(name, governanceRoot),
        MAX_DELEGATION_BYTES,
        `registry delegation '${name}'`,
      ),
      `registry delegation '${name}'`,
    );
    if (delegation.operational?.keyId === indexKeyId) {
      matching.push(delegation);
    }
  }
  matching.sort((left, right) => right.serial - left.serial);
  const delegation = matching[0];
  if (delegation === undefined) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      `No signed delegation matches operational key '${indexKeyId}'.`,
    );
  }
  if (
    matching[1] !== undefined
    && matching[1].serial === delegation.serial
  ) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      `Operational key '${indexKeyId}' has an ambiguous delegation serial.`,
    );
  }

  const rootFacts = publicKeyFacts(
    fs,
    crypto,
    governanceRoot,
    options.expectedRootKeyId,
  );
  const operationalFacts = publicKeyFacts(
    fs,
    crypto,
    governanceRoot,
    indexKeyId,
  );
  if (options.expectedOperationalEpoch !== undefined) {
    const epoch = options.expectedOperationalEpoch;
    let commit: string;
    try {
      commit = registryRotationKeyCommit({
        keyId: indexKeyId,
        ed25519PublicKeyPem: operationalFacts.ed25519PublicKeyPem,
        mlDsa65PublicKey: operationalFacts.mlDsa65PublicKey,
      });
    } catch {
      throw new RegistryRuntimeError(
        ERR_REGISTRY_RUNTIME_AUTHORITY,
        "Operational registry public bundle cannot be bound to its rotation epoch.",
      );
    }
    if (epoch.keyId !== indexKeyId || epoch.keyCommit !== commit) {
      throw new RegistryRuntimeError(
        ERR_REGISTRY_RUNTIME_AUTHORITY,
        "Operational registry authority does not match the authenticated active epoch.",
      );
    }
  }
  const verifyRoot = createRegistryPublicVerifiers({
    role: "root",
    keyId: options.expectedRootKeyId,
    ed25519PublicKeyPem: rootFacts.ed25519PublicKeyPem,
    mlDsa65PublicKey: rootFacts.mlDsa65PublicKey,
  });
  const verifyIndex = createRegistryPublicVerifiers({
    role: "operational",
    keyId: indexKeyId,
    ed25519PublicKeyPem: operationalFacts.ed25519PublicKeyPem,
    mlDsa65PublicKey: operationalFacts.mlDsa65PublicKey,
  }) as HybridIndexVerifiers;

  if (generationId !== null) {
    try {
      const persisted = await loadRegistryGeneration({
        directory: url.fileURLToPath(
          new URL("generations/", registryRoot),
        ),
        generationId,
        verify: {
          expectedDelegationSerial: delegation.serial,
          publicBundle: {
            keyId: indexKeyId,
            ed25519PublicKeyPem:
              operationalFacts.ed25519PublicKeyPem,
            mlDsa65PublicKey:
              operationalFacts.mlDsa65PublicKey,
          },
          minIndexIssuedAt: options.minIndexIssuedAt,
        },
      });
      index = persisted.generation.index;
    } catch {
      throw new RegistryRuntimeError(
        ERR_REGISTRY_RUNTIME_AUTHORITY,
        "Authenticated registry generation is unavailable or invalid.",
      );
    }
  }
  if (index === null) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      "Registry index authority could not be resolved.",
    );
  }
  verifyRegistryIndexUnderDelegation(index, delegation, {
    authority: {
      expectedRootKeyId: options.expectedRootKeyId,
      verifyRoot,
      at: options.useSignedIndexIssuedAt === true
        ? index.issuedAt
        : options.at,
      minSerial: options.minDelegationSerial,
      isRevoked: options.isRevoked,
    },
    operationalPublicKeyFingerprints: {
      ed25519: operationalFacts.ed25519Sha256,
      mlDsa65: operationalFacts.mlDsa65Sha256,
    },
    verifyIndex,
    minIndexIssuedAt: options.minIndexIssuedAt,
  });
  if (
    options.expectedAcceptedArtifacts !== undefined
    && (
      delegation.serial
        !== options.expectedAcceptedArtifacts.delegationSerial
      || index.issuedAt
        !== options.expectedAcceptedArtifacts.indexIssuedAt
      || generationId
        !== options.expectedAcceptedArtifacts.generationId
    )
  ) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      "Canonical registry artifacts do not match the authenticated accepted artifact identity.",
    );
  }
  deepFreeze(index);
  deepFreeze(delegation);

  return Object.freeze({
    rootKeyId: delegation.rootKeyId,
    operationalKeyId: delegation.operational.keyId,
    delegationSerial: delegation.serial,
    indexIssuedAt: index.issuedAt,
    generationId,
    admit(
      lookup: CertifiedLookup,
      policy: RegistryPolicy,
    ): AdmissionResult {
      const found = lookupCertifiedPackage(index, lookup);
      if (!found.ok) return found;
      const checked = checkRegistryPolicy(found.entry, policy);
      if (!checked.ok) {
        return {
          ok: false,
          code: checked.code,
          reason: checked.reason,
        };
      }
      return { ok: true, entry: found.entry };
    },
  });
}

/**
 * Bootstrap/recovery entry for constructing the first authenticated rotation
 * checkpoint. Normal production callers must use loadProductionRegistry.
 */
export async function loadRegistryForBootstrap(
  options: ProductionRegistryOptions,
): Promise<ProductionRegistryRuntime> {
  return loadProductionRegistryFromRoot(
    new URL("../../../", import.meta.url),
    options,
  );
}

/**
 * Preferred production entry: freshness floors and active operational identity
 * come from a successfully authenticated rotation checkpoint, not loose caller
 * scalars. Delegation time is checked against the hybrid-signed index issuance
 * instant; revocation is read once from the pinned, signed canonical register.
 */
export async function loadProductionRegistry(
  options: RotationBoundProductionRegistryOptions,
): Promise<ProductionRegistryRuntime> {
  if (!isRestoredRegistryRotationState(options.rotationState)) {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      "Production registry requires an authenticated restored rotation state.",
    );
  }
  const epoch = activeEpoch(options.rotationState.process.ring);
  if (epoch === null || epoch.keyKind !== "asymmetric") {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      "Authenticated rotation state has no active asymmetric operational epoch.",
    );
  }
  const repositoryRoot = new URL("../../../", import.meta.url);
  const { url } = await loadNode();
  let revocations: {
    readonly isRevoked: (keyId: string) => boolean;
  };
  try {
    const module = await loadTrustedRevocationAuthorityHostFloor(
      repositoryRoot,
    ) as {
      loadTrustedRevocationSnapshot(rootDir: string): {
        readonly isRevoked: (keyId: string) => boolean;
      };
    };
    revocations = module.loadTrustedRevocationSnapshot(
      url.fileURLToPath(repositoryRoot),
    );
  } catch {
    throw new RegistryRuntimeError(
      ERR_REGISTRY_RUNTIME_AUTHORITY,
      "Pinned production revocation authority is unavailable or invalid.",
    );
  }
  return loadProductionRegistryFromRoot(repositoryRoot, {
    expectedRootKeyId: options.expectedRootKeyId,
    at: "",
    minDelegationSerial:
      options.rotationState.delegationSerialFloor,
    minIndexIssuedAt: options.rotationState.indexIssuedAtFloor,
    isRevoked: revocations.isRevoked,
    useSignedIndexIssuedAt: true,
    expectedOperationalEpoch: {
      keyId: epoch.keyId,
      keyCommit: epoch.keyCommit,
    },
    expectedAcceptedArtifacts: {
      delegationSerial:
        options.rotationState.acceptedDelegationSerial,
      indexIssuedAt:
        options.rotationState.acceptedIndexIssuedAt,
      generationId:
        options.rotationState.acceptedGenerationId,
    },
  });
}

export const loadProductionRegistryFromRotationState =
  loadProductionRegistry;
