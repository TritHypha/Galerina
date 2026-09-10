import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type ArtifactOwner = "galerina" | "slide" | "lyth" | "vok" | "dfe" | "tower";
export type ArtifactKind =
  | "fungi-source"
  | "checked-module-snapshot"
  | "canonical-gir"
  | "physical-slide"
  | "lyth-evidence"
  | "vok-receipt";
export type Sha256Digest = `sha256:${string}`;

export const ARTIFACT_REFERENCE_SCHEMA = "galerina.artifact-reference.v1" as const;
export const COMPUTE_TRANSFER_SCHEMA = "galerina.compute-transfer.v1" as const;
export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const owners = ["galerina", "slide", "lyth", "vok", "dfe", "tower"] as const;
const kinds = [
  "fungi-source",
  "checked-module-snapshot",
  "canonical-gir",
  "physical-slide",
  "lyth-evidence",
  "vok-receipt",
] as const;
const ownerKinds: Readonly<Record<ArtifactOwner, readonly ArtifactKind[]>> = Object.freeze({
  galerina: ["fungi-source", "checked-module-snapshot", "canonical-gir"],
  slide: ["physical-slide"],
  lyth: ["lyth-evidence"],
  vok: ["vok-receipt"],
  // These owners are reserved for future non-authorising inputs. They do not
  // currently mint an artifact kind and therefore cannot pass this boundary.
  dfe: [],
  tower: [],
});

export interface ArtifactReferenceV1 {
  readonly schema: typeof ARTIFACT_REFERENCE_SCHEMA;
  readonly owner: ArtifactOwner;
  readonly kind: ArtifactKind;
  readonly digest: Sha256Digest;
  readonly byteLength: number;
}

export interface ComputeTransferV1 {
  readonly schema: typeof COMPUTE_TRANSFER_SCHEMA;
  readonly fromOwner: ArtifactOwner;
  readonly toOwner: ArtifactOwner;
  readonly artifact: ArtifactReferenceV1;
  readonly prerequisiteDigests: readonly Sha256Digest[];
  readonly operationId: string;
  readonly runIdentity: Sha256Digest;
  readonly authorityEpoch: number;
  readonly authorityContextDigest: Sha256Digest;
}

export interface OwnedArtifactRepository<O extends ArtifactOwner> {
  readonly owner: O;
  read(reference: ArtifactReferenceV1 & { readonly owner: O }): Promise<Uint8Array>;
  write(kind: ArtifactKind, bytes: Uint8Array): Promise<ArtifactReferenceV1 & { readonly owner: O }>;
}

export class ArtifactReferenceRefusal extends Error {
  constructor(readonly code: string) {
    super(`ARTIFACT_REFERENCE_${code}: refused`);
    this.name = "ArtifactReferenceRefusal";
  }
}

function refuse(code: string): never {
  throw new ArtifactReferenceRefusal(code);
}

function ownDataRecord(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    refuse(`${code}_OBJECT`);
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) refuse(`${code}_OBJECT`);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const names = Reflect.ownKeys(descriptors);
    if (names.some((name) => typeof name !== "string")) refuse(`${code}_SYMBOL`);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const name of names as string[]) {
      const descriptor = descriptors[name];
      if (descriptor === undefined || !("value" in descriptor)) refuse(`${code}_ACCESSOR`);
      snapshot[name] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch (error) {
    if (error instanceof ArtifactReferenceRefusal) throw error;
    refuse(`${code}_ACCESS`);
  }
}

function exactFields(record: Readonly<Record<string, unknown>>, expected: readonly string[], code: string): void {
  const actual = Object.keys(record);
  if (actual.length !== expected.length || actual.some((field) => !expected.includes(field))) {
    refuse(`${code}_FIELD`);
  }
}

function boundedString(value: unknown, code: string, maxBytes = 512): string {
  if (typeof value !== "string" || value.length === 0 || new TextEncoder().encode(value).byteLength > maxBytes) {
    refuse(`${code}_STRING`);
  }
  if (value.normalize("NFC") !== value) refuse(`${code}_NFC`);
  return value;
}

function checkedDigest(value: unknown, code: string): Sha256Digest {
  if (typeof value !== "string" || !digestPattern.test(value)) refuse(`${code}_DIGEST`);
  return value as Sha256Digest;
}

function checkedOwner(value: unknown, code: string): ArtifactOwner {
  if (typeof value !== "string" || !(owners as readonly string[]).includes(value)) refuse(`${code}_OWNER`);
  return value as ArtifactOwner;
}

function checkedKind(value: unknown, code: string): ArtifactKind {
  if (typeof value !== "string" || !(kinds as readonly string[]).includes(value)) refuse(`${code}_KIND`);
  return value as ArtifactKind;
}

function assertOwnerKind(owner: ArtifactOwner, kind: ArtifactKind, code: string): void {
  if (!ownerKinds[owner].includes(kind)) refuse(`${code}_OWNER_KIND`);
}

function checkedLength(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > MAX_ARTIFACT_BYTES) {
    refuse(`${code}_LENGTH`);
  }
  return value;
}

function canonicalReferenceRecord(reference: ArtifactReferenceV1): Record<string, unknown> {
  return {
    schema: reference.schema,
    owner: reference.owner,
    kind: reference.kind,
    digest: reference.digest,
    byteLength: reference.byteLength,
  };
}

export function decodeArtifactReference(value: unknown): ArtifactReferenceV1 {
  const record = ownDataRecord(value, "REFERENCE");
  exactFields(record, ["schema", "owner", "kind", "digest", "byteLength"], "REFERENCE");
  if (record.schema !== ARTIFACT_REFERENCE_SCHEMA) refuse("REFERENCE_SCHEMA");
  const owner = checkedOwner(record.owner, "REFERENCE");
  const kind = checkedKind(record.kind, "REFERENCE");
  assertOwnerKind(owner, kind, "REFERENCE");
  const digest = checkedDigest(record.digest, "REFERENCE");
  const byteLength = checkedLength(record.byteLength, "REFERENCE");
  return Object.freeze({
    schema: ARTIFACT_REFERENCE_SCHEMA,
    owner,
    kind,
    digest,
    byteLength,
  });
}

export function createArtifactReference(
  owner: ArtifactOwner,
  kind: ArtifactKind,
  bytes: Uint8Array,
): ArtifactReferenceV1 {
  assertOwnerKind(checkedOwner(owner, "CREATE"), checkedKind(kind, "CREATE"), "CREATE");
  const copy = copyArtifactBytes(bytes, "CREATE");
  const digest = digestArtifactBytes(copy);
  return Object.freeze({
    schema: ARTIFACT_REFERENCE_SCHEMA,
    owner,
    kind,
    digest,
    byteLength: copy.byteLength,
  });
}

export function encodeArtifactReference(value: unknown): Uint8Array {
  const reference = decodeArtifactReference(value);
  return new TextEncoder().encode(`${JSON.stringify(canonicalReferenceRecord(reference))}\n`);
}

export function decodeArtifactReferenceBytes(bytes: Uint8Array): ArtifactReferenceV1 {
  try {
    return decodeArtifactReference(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (error) {
    if (error instanceof ArtifactReferenceRefusal) throw error;
    refuse("REFERENCE_ENCODING");
  }
}

export function digestArtifactBytes(bytes: Uint8Array): Sha256Digest {
  const copy = copyArtifactBytes(bytes, "DIGEST");
  return `sha256:${createHash("sha256").update(copy).digest("hex")}` as Sha256Digest;
}

export function copyArtifactBytes(value: Uint8Array, code = "BYTES"): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > MAX_ARTIFACT_BYTES) {
    refuse(`${code}_LENGTH`);
  }
  return new Uint8Array(value);
}

export function decodeComputeTransfer(value: unknown): ComputeTransferV1 {
  const record = ownDataRecord(value, "TRANSFER");
  exactFields(record, [
    "schema", "fromOwner", "toOwner", "artifact", "prerequisiteDigests",
    "operationId", "runIdentity", "authorityEpoch", "authorityContextDigest",
  ], "TRANSFER");
  if (record.schema !== COMPUTE_TRANSFER_SCHEMA) refuse("TRANSFER_SCHEMA");
  const fromOwner = checkedOwner(record.fromOwner, "TRANSFER");
  const toOwner = checkedOwner(record.toOwner, "TRANSFER");
  if (fromOwner === toOwner) refuse("TRANSFER_OWNER");
  const artifact = decodeArtifactReference(record.artifact);
  if (artifact.owner !== fromOwner) refuse("TRANSFER_ARTIFACT_OWNER");
  if (!Array.isArray(record.prerequisiteDigests)) refuse("TRANSFER_PREREQUISITES");
  const prerequisiteDigests = record.prerequisiteDigests.map((digest) => checkedDigest(digest, "TRANSFER_PREREQUISITE"));
  const operationId = boundedString(record.operationId, "TRANSFER_OPERATION");
  const runIdentity = checkedDigest(record.runIdentity, "TRANSFER_RUN");
  const authorityContextDigest = checkedDigest(record.authorityContextDigest, "TRANSFER_CONTEXT");
  if (typeof record.authorityEpoch !== "number" || !Number.isSafeInteger(record.authorityEpoch) || record.authorityEpoch < 0) {
    refuse("TRANSFER_EPOCH");
  }
  return Object.freeze({
    schema: COMPUTE_TRANSFER_SCHEMA,
    fromOwner,
    toOwner,
    artifact,
    prerequisiteDigests: Object.freeze(prerequisiteDigests),
    operationId,
    runIdentity,
    authorityEpoch: record.authorityEpoch,
    authorityContextDigest,
  });
}

export function createComputeTransfer(input: Omit<ComputeTransferV1, "schema">): ComputeTransferV1 {
  return decodeComputeTransfer({ ...input, schema: COMPUTE_TRANSFER_SCHEMA });
}

export function encodeComputeTransfer(value: unknown): Uint8Array {
  const transfer = decodeComputeTransfer(value);
  return new TextEncoder().encode(`${JSON.stringify({
    schema: transfer.schema,
    fromOwner: transfer.fromOwner,
    toOwner: transfer.toOwner,
    artifact: canonicalReferenceRecord(transfer.artifact),
    prerequisiteDigests: [...transfer.prerequisiteDigests],
    operationId: transfer.operationId,
    runIdentity: transfer.runIdentity,
    authorityEpoch: transfer.authorityEpoch,
    authorityContextDigest: transfer.authorityContextDigest,
  })}\n`);
}

export function decodeComputeTransferBytes(bytes: Uint8Array): ComputeTransferV1 {
  try {
    return decodeComputeTransfer(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (error) {
    if (error instanceof ArtifactReferenceRefusal) throw error;
    refuse("TRANSFER_ENCODING");
  }
}

export function createFileOwnedArtifactRepository<O extends ArtifactOwner>(
  owner: O,
  root: string,
): OwnedArtifactRepository<O> {
  const checked = checkedOwner(owner, "REPOSITORY");
  if (root.length === 0 || root.includes("\0")) refuse("REPOSITORY_ROOT");
  const rootPath = resolve(root);
  return Object.freeze({
    owner: checked as O,
    async write(kind: ArtifactKind, bytes: Uint8Array): Promise<ArtifactReferenceV1 & { readonly owner: O }> {
      const checkedKindValue = checkedKind(kind, "REPOSITORY");
      assertOwnerKind(checked, checkedKindValue, "REPOSITORY");
      const copy = copyArtifactBytes(bytes, "REPOSITORY");
      const reference = createArtifactReference(checked, checkedKindValue, copy) as ArtifactReferenceV1 & { readonly owner: O };
      const directory = join(rootPath, checkedKindValue);
      mkdirSync(directory, { recursive: true });
      const target = join(directory, reference.digest.slice("sha256:".length));
      try {
        const existing = new Uint8Array(readFileSync(target));
        verifyArtifactBytes(reference, existing, "REPOSITORY_EXISTING");
      } catch (error) {
        if (error instanceof ArtifactReferenceRefusal) throw error;
        try {
          // The repository's minimal Node declarations expose an incomplete
          // overload set; Node accepts a Uint8Array at runtime.
          writeFileSync(target, copy as any);
        } catch (writeError: unknown) {
          throw writeError;
        }
      }
      return reference;
    },
    async read(reference: ArtifactReferenceV1 & { readonly owner: O }): Promise<Uint8Array> {
      const checkedReference = decodeArtifactReference(reference);
      if (checkedReference.owner !== checked) refuse("REPOSITORY_WRONG_OWNER");
      const target = join(rootPath, checkedReference.kind, checkedReference.digest.slice("sha256:".length));
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(readFileSync(target));
      } catch {
        refuse("REPOSITORY_MISSING");
      }
      verifyArtifactBytes(checkedReference, bytes, "REPOSITORY_READ");
      return new Uint8Array(bytes);
    },
  });
}

export function verifyArtifactBytes(reference: ArtifactReferenceV1, bytes: Uint8Array, code = "VERIFY"): void {
  const copy = copyArtifactBytes(bytes, code);
  if (copy.byteLength !== reference.byteLength) refuse(`${code}_LENGTH`);
  if (digestArtifactBytes(copy) !== reference.digest) refuse(`${code}_DIGEST`);
}
