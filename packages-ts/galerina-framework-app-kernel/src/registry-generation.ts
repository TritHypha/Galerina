import {
  createRegistryPublicVerifiers,
  type RegistryRotationHybridSignature,
  type RegistryRotationPublicBundle,
} from "@galerina/tower-citizen/custody";
import { canonicalJson } from "./fuse-loader.js";
import {
  signRegistryIndexHybrid,
  verifyRegistryIndex,
  type RegistryEntry,
  type RegistryIndex,
} from "./registry-index.js";
import {
  signRegistryPackageManifest,
  verifyRegistryPackageManifest,
  type RegistryPackageManifest,
} from "./registry-package-manifest.js";

export const REGISTRY_GENERATION_V1_CONTEXT =
  "galerina.registry.generation.v1" as const;

export interface RegistryGeneration {
  readonly schema: "galerina-registry-generation/v1";
  readonly delegationSerial: number;
  readonly operationalKeyId: string;
  readonly manifests: readonly RegistryPackageManifest[];
  readonly index: RegistryIndex;
}

export type RegistryGenerationSigningRole =
  | "package-manifest"
  | "registry-index";

export interface RegistryGenerationCustody {
  signHybrid(
    keyId: string,
    message: Uint8Array,
    role: RegistryGenerationSigningRole,
  ): RegistryRotationHybridSignature | null;
}

export interface VerifyRegistryGenerationOptions {
  readonly expectedDelegationSerial: number;
  readonly publicBundle: RegistryRotationPublicBundle;
  readonly minIndexIssuedAt: string;
}

const KEY_ID = /^[0-9a-f]{16}$/;
const SOURCE_HASH = /^sha256:[0-9a-f]{64}$/;
const MAX_MANIFESTS = 10_000;
const LEVELS = new Set([
  "uncertified",
  "community",
  "verified",
  "certified",
  "enterprise",
  "regulated",
]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const GENERATION_ID = /^[0-9a-f]{64}$/;
const CANONICAL_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_ARTIFACT_FILES = 10_000;

function deepFreeze(value: unknown): void {
  if (
    typeof value !== "object"
    || value === null
    || Object.isFrozen(value)
  ) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

function materialize<T>(value: T, label: string): T {
  let json: string;
  try {
    json = canonicalJson(value);
  } catch {
    throw new TypeError(`${label} is not canonical JSON data`);
  }
  let parsed: T;
  try {
    parsed = JSON.parse(json) as T;
  } catch {
    throw new TypeError(`${label} could not be materialized`);
  }
  return parsed;
}

function requiredString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function stringList(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value)
    || value.some(
      (item) => typeof item !== "string" || item.length === 0,
    )
    || new Set(value).size !== value.length
  ) {
    throw new TypeError(`${label} must be a duplicate-free string list`);
  }
  return value as readonly string[];
}

function canonicalInstant(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !CANONICAL_INSTANT.test(value)
  ) {
    throw new TypeError(`${label} must be a canonical UTC instant`);
  }
  try {
    if (new Date(value).toISOString() !== value) {
      throw new TypeError(`${label} must be a canonical UTC instant`);
    }
  } catch {
    throw new TypeError(`${label} must be a canonical UTC instant`);
  }
  return value;
}

function artifactFileList(value: unknown): readonly string[] {
  const files = stringList(value, "manifest.artifactFiles");
  if (
    files.length === 0
    || files.length > MAX_ARTIFACT_FILES
    || files.some((file) => {
      const parts = file.split("/");
      return file.length > 512
        || file.includes("\\")
        || file.includes("\0")
        || file.startsWith("/")
        || /^[A-Za-z]:/.test(file)
        || parts.some(
          (part) => part.length === 0 || part === "." || part === "..",
        );
    })
  ) {
    throw new TypeError(
      "manifest.artifactFiles must contain bounded package-relative paths",
    );
  }
  return files;
}

function entryFromManifest(
  manifest: RegistryPackageManifest,
  expectedKeyId: string,
): RegistryEntry {
  requiredString(manifest.name, "manifest.name");
  requiredString(manifest.version, "manifest.version");
  requiredString(manifest.registry, "manifest.registry");
  requiredString(manifest.hash, "manifest.hash");
  requiredString(manifest.publisher, "manifest.publisher");
  if (
    manifest.schema !== "galerina-package-manifest/v1"
    || manifest.keyId !== expectedKeyId
    || manifest.signerKeyId !== expectedKeyId
    || !SOURCE_HASH.test(manifest.hash)
    || !LEVELS.has(String(manifest.certificationLevel))
    || !RISKS.has(String(manifest.riskRating))
    || manifest.artifactProfile !== "galerina-flat-package-tree/v1"
    || manifest.installScript !== null
    || typeof manifest.governance !== "object"
    || manifest.governance === null
    || Array.isArray(manifest.governance)
    || !("reviewed" in manifest.governance)
    || manifest.governance.reviewed !== true
  ) {
    throw new TypeError(
      "package manifest identity, signer, profile, review, or risk is malformed",
    );
  }
  const governance = manifest.governance as Record<string, unknown>;
  requiredString(
    governance.reviewedBy,
    "manifest.governance.reviewedBy",
  );
  canonicalInstant(
    governance.reviewedAt,
    "manifest.governance.reviewedAt",
  );
  artifactFileList(manifest.artifactFiles);
  const capabilities = stringList(
    manifest.capabilities,
    "manifest.capabilities",
  );
  const effects = stringList(manifest.effects, "manifest.effects");
  return {
    name: manifest.name,
    version: manifest.version,
    sourceHash: manifest.hash,
    publisher: manifest.publisher,
    keyId: expectedKeyId,
    certificationLevel:
      manifest.certificationLevel as RegistryEntry["certificationLevel"],
    riskRating: manifest.riskRating as RegistryEntry["riskRating"],
    capabilities,
    effects,
  };
}

function compareManifest(
  left: RegistryPackageManifest,
  right: RegistryPackageManifest,
): number {
  const leftName = String(left.name);
  const rightName = String(right.name);
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  const leftVersion = String(left.version);
  const rightVersion = String(right.version);
  return leftVersion < rightVersion
    ? -1
    : leftVersion > rightVersion
      ? 1
      : 0;
}

function stringListsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function registryEntriesEqual(
  left: readonly RegistryEntry[],
  right: readonly RegistryEntry[],
): boolean {
  return left.length === right.length
    && left.every((entry, index) => {
      const expected = right[index];
      return expected !== undefined
        && entry.name === expected.name
        && entry.version === expected.version
        && entry.sourceHash === expected.sourceHash
        && entry.publisher === expected.publisher
        && entry.keyId === expected.keyId
        && entry.certificationLevel === expected.certificationLevel
        && entry.riskRating === expected.riskRating
        && stringListsEqual(entry.capabilities, expected.capabilities)
        && stringListsEqual(entry.effects, expected.effects);
    });
}

function signPair(
  custody: RegistryGenerationCustody,
  keyId: string,
  message: Uint8Array,
  role: RegistryGenerationSigningRole,
): RegistryRotationHybridSignature {
  let result: RegistryRotationHybridSignature | null;
  try {
    result = custody.signHybrid(keyId, message, role);
  } catch {
    result = null;
  }
  if (
    result === null
    || typeof result.ed25519 !== "string"
    || result.ed25519.length === 0
    || typeof result.mlDsa65 !== "string"
    || result.mlDsa65.length === 0
  ) {
    throw new TypeError(
      `registry generation custody did not produce complete ${role} proof`,
    );
  }
  return result;
}

export function verifyRegistryGeneration(
  generation: RegistryGeneration,
  options: VerifyRegistryGenerationOptions,
): "verified" {
  canonicalInstant(options.minIndexIssuedAt, "minIndexIssuedAt");
  if (
    typeof generation !== "object"
    || generation === null
    || generation.schema !== "galerina-registry-generation/v1"
    || !Number.isSafeInteger(generation.delegationSerial)
    || generation.delegationSerial < 1
    || generation.delegationSerial
      !== options.expectedDelegationSerial
    || generation.operationalKeyId !== options.publicBundle.keyId
    || !KEY_ID.test(generation.operationalKeyId)
    || !Array.isArray(generation.manifests)
    || generation.manifests.length === 0
    || generation.manifests.length > MAX_MANIFESTS
  ) {
    throw new TypeError("registry generation envelope is malformed");
  }
  const indexIssuedAt = canonicalInstant(
    generation.index?.issuedAt,
    "generation.index.issuedAt",
  );
  const manifestVerifiers = createRegistryPublicVerifiers({
    role: "packageManifest",
    ...options.publicBundle,
  });
  const indexVerifiers = createRegistryPublicVerifiers({
    role: "operational",
    ...options.publicBundle,
  });
  const sorted = [...generation.manifests].sort(compareManifest);
  if (
    sorted.some(
      (manifest, index) => manifest !== generation.manifests[index],
    )
  ) {
    throw new TypeError("registry generation manifests are not canonical-sorted");
  }
  const entries: RegistryEntry[] = [];
  const identities = new Set<string>();
  for (const manifest of generation.manifests) {
    verifyRegistryPackageManifest(
      manifest,
      manifestVerifiers,
      generation.operationalKeyId,
    );
    const entry = entryFromManifest(
      manifest,
      generation.operationalKeyId,
    );
    if (
      Date.parse(String(manifest.governance?.reviewedAt))
        > Date.parse(indexIssuedAt)
    ) {
      throw new TypeError(
        "package manifest review occurs after its generation index",
      );
    }
    if (manifest.registry !== generation.index.registry) {
      throw new TypeError(
        "package manifest registry differs from its generation index",
      );
    }
    const identity = `${entry.name}\0${entry.version}`;
    if (identities.has(identity)) {
      throw new TypeError("registry generation repeats a package identity");
    }
    identities.add(identity);
    entries.push(entry);
  }
  verifyRegistryIndex(
    generation.index,
    indexVerifiers,
    options.minIndexIssuedAt,
  );
  if (
    generation.index.signature?.keyId
      !== generation.operationalKeyId
    || !registryEntriesEqual(generation.index.entries, entries)
    || canonicalJson(generation.index.entries)
      !== canonicalJson(entries)
  ) {
    throw new TypeError(
      "registry generation index does not exactly correspond to its manifests",
    );
  }
  return "verified";
}

export function buildRegistryGeneration(options: {
  readonly delegationSerial: number;
  readonly operationalPublicBundle: RegistryRotationPublicBundle;
  readonly unsignedManifests: readonly RegistryPackageManifest[];
  readonly registry: string;
  readonly issuedAt: string;
  readonly custody: RegistryGenerationCustody;
}): RegistryGeneration {
  if (
    !Number.isSafeInteger(options.delegationSerial)
    || options.delegationSerial < 1
    || !KEY_ID.test(options.operationalPublicBundle.keyId)
    || !Array.isArray(options.unsignedManifests)
    || options.unsignedManifests.length === 0
    || options.unsignedManifests.length > MAX_MANIFESTS
  ) {
    throw new TypeError("registry generation build input is malformed");
  }
  requiredString(options.registry, "registry");
  canonicalInstant(options.issuedAt, "issuedAt");
  const keyId = options.operationalPublicBundle.keyId;
  const manifests = options.unsignedManifests
    .map((input) => {
      const unsigned = materialize(
        input,
        "unsigned package manifest",
      );
      const prepared: RegistryPackageManifest = {
        ...unsigned,
        keyId,
        signerKeyId: keyId,
      };
      entryFromManifest(prepared, keyId);
      let pair: RegistryRotationHybridSignature | undefined;
      const getPair = (message: Uint8Array) => {
        pair ??= signPair(
          options.custody,
          keyId,
          message,
          "package-manifest",
        );
        return pair;
      };
      return signRegistryPackageManifest(
        prepared,
        keyId,
        (message) => getPair(message).ed25519,
        (message) => getPair(message).mlDsa65,
      );
    })
    .sort(compareManifest);
  const entries = manifests.map(
    (manifest) => entryFromManifest(manifest, keyId),
  );
  const unsignedIndex = {
    schema: "galerina-registry-index/v2" as const,
    registry: options.registry,
    issuedAt: options.issuedAt,
    entries,
  };
  let indexPair: RegistryRotationHybridSignature | undefined;
  const getIndexPair = (message: Uint8Array) => {
    indexPair ??= signPair(
      options.custody,
      keyId,
      message,
      "registry-index",
    );
    return indexPair;
  };
  const index = signRegistryIndexHybrid(
    unsignedIndex,
    keyId,
    (message) => getIndexPair(message).ed25519,
    (message) => getIndexPair(message).mlDsa65,
  );
  const generation = materialize<RegistryGeneration>({
    schema: "galerina-registry-generation/v1",
    delegationSerial: options.delegationSerial,
    operationalKeyId: keyId,
    manifests,
    index,
  }, "registry generation");
  verifyRegistryGeneration(generation, {
    expectedDelegationSerial: options.delegationSerial,
    publicBundle: options.operationalPublicBundle,
    minIndexIssuedAt: "1970-01-01T00:00:00.000Z",
  });
  deepFreeze(generation);
  return generation;
}

export function registryGenerationCanonicalJson(
  generation: RegistryGeneration,
): string {
  if (
    typeof generation !== "object"
    || generation === null
    || generation.schema !== "galerina-registry-generation/v1"
  ) {
    throw new TypeError("registry generation is malformed");
  }
  return canonicalJson(generation);
}

export async function registryGenerationId(
  generation: RegistryGeneration,
): Promise<string> {
  const canonical = registryGenerationCanonicalJson(generation);
  const preimage = new TextEncoder().encode(
    `${REGISTRY_GENERATION_V1_CONTEXT}\0${canonical}`,
  );
  let digest: ArrayBuffer;
  try {
    digest = await globalThis.crypto.subtle.digest("SHA-256", preimage);
  } catch {
    throw new TypeError("registry generation identity could not be derived");
  }
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function registryGenerationFileName(
  generationId: string,
): string {
  if (!GENERATION_ID.test(generationId)) {
    throw new TypeError("registry generation identity is malformed");
  }
  return `registry-generation-${generationId}.json`;
}
