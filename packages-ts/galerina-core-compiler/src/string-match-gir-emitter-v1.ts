import { createArtifactReference, decodeArtifactReference, digestArtifactBytes, type ArtifactReferenceV1, type Sha256Digest } from "./artifact-reference.js";
import { decodeStringMatchCheckedModuleSnapshot, type StringMatchCheckedModuleSnapshotV2, type StringMatchArmV2 } from "./string-match-checked-module-snapshot-v2.js";

export const STRING_MATCH_GIR_SCHEMA = "galerina.string-match-gir.v1" as const;
export const STRING_MATCH_SEMANTIC_PROFILE_ID = "slide.semantic.executable-gir.string-match.v1" as const;
export const STRING_MATCH_REGISTRY_SET_ID = "slide.registry.executable-gir.string-match.v1" as const;
export const STRING_MATCH_REGISTRY_SET_DIGEST = "8a5d4b8f0f58c6c8ca1e9df6c0c0e2c1c8b7a77a1d9a41b0dd9b8b2b6a5c4d3e" as const;
export const STRING_MATCH_GIR_EDITION = "string-match-v1" as const;
export const STRING_MATCH_GIR_STRING_TYPE_ID = 5 as const;
export const STRING_MATCH_GIR_MATCH_TERMINATOR_ID = 5 as const;

const TYPE_IDS = Object.freeze({ Bool: 2, String: STRING_MATCH_GIR_STRING_TYPE_ID } as const);
const OPCODES = Object.freeze({ param: 1, boolConst: 2 } as const);
const BASE_LIMITS = Object.freeze([24576, 1, 3, 8, 32, 48, 4, 2, 0, 0, 0, 0, 96, 256, 1024, 16, 8, 8, 4, 4096, 0] as const);

export interface StringMatchGIREmissionResultV1 {
  readonly schema: typeof STRING_MATCH_GIR_SCHEMA;
  readonly edition: typeof STRING_MATCH_GIR_EDITION;
  readonly snapshotReference: ArtifactReferenceV1;
  readonly girReference: ArtifactReferenceV1;
  readonly girBytes: Uint8Array;
  readonly girDigest: Sha256Digest;
  readonly semanticProfileId: typeof STRING_MATCH_SEMANTIC_PROFILE_ID;
  readonly registrySetId: typeof STRING_MATCH_REGISTRY_SET_ID;
  readonly registrySetDigest: typeof STRING_MATCH_REGISTRY_SET_DIGEST;
  readonly authorityReleased: false;
}

export class StringMatchGIREmissionRefusal extends Error { constructor(readonly code: string) { super(`STRING_MATCH_GIR_${code}: refused`); this.name = "StringMatchGIREmissionRefusal"; } }
function refuse(code: string): never { throw new StringMatchGIREmissionRefusal(code); }
function concat(...parts: readonly Uint8Array[]): Uint8Array { const length = parts.reduce((total, part) => total + part.byteLength, 0); const result = new Uint8Array(length); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.byteLength; } return result; }
function head(major: number, value: number): Uint8Array { if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) refuse("CBOR_BOUND"); if (value < 24) return Uint8Array.of((major * 32) + value); if (value < 256) return Uint8Array.of((major * 32) + 24, value); if (value < 65_536) return Uint8Array.of((major * 32) + 25, value >>> 8, value & 0xff); return Uint8Array.of((major * 32) + 26, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff); }
const uint = (value: number): Uint8Array => head(0, value);
const integer = (value: number): Uint8Array => value >= 0 ? head(0, value) : head(1, -1 - value);
const text = (value: string): Uint8Array => { const payload = new TextEncoder().encode(value); return concat(head(3, payload.byteLength), payload); };
const bytes = (value: Uint8Array): Uint8Array => concat(head(2, value.byteLength), value);
const array = (values: readonly Uint8Array[]): Uint8Array => concat(head(4, values.length), ...values);
const map = (entries: readonly (readonly [Uint8Array, Uint8Array])[]): Uint8Array => concat(head(5, entries.length), ...entries.flatMap(([key, value]) => [key, value]));
function instruction(resultId: number, opcodeId: number, typeId: number, operands: readonly number[], immediate: number): Uint8Array { return array([uint(resultId), uint(opcodeId), uint(typeId), array(operands.map(uint)), integer(immediate)]); }
function terminator(id: number, operands: readonly number[], edges: readonly (readonly [number, readonly number[]])[]): Uint8Array { return array([uint(id), array(operands.map(uint)), array(edges.map(([target, args]) => array([uint(target), array(args.map(uint))]))) ]); }
function block(id: number, instructions: readonly Uint8Array[], end: Uint8Array): Uint8Array { return array([uint(id), array([]), array(instructions), end]); }
function constantRow(arm: StringMatchArmV2): Uint8Array { if (arm.literal === null) refuse("WILDCARD_CONSTANT"); const payload = new TextEncoder().encode(arm.literal); return array([uint(arm.id), uint(TYPE_IDS.String), uint(1), bytes(payload)]); }
function functionValue(snapshot: StringMatchCheckedModuleSnapshotV2): Uint8Array {
  const literalArms = snapshot.arms.filter((arm) => arm.literal !== null);
  const edges: Array<readonly [number, readonly number[]]> = literalArms.map((arm) => [arm.id, []] as const);
  const wildcard = snapshot.arms.at(-1);
  if (wildcard === undefined || wildcard.literal !== null) refuse("WILDCARD");
  edges.push([wildcard.id, []]);
  const entry = block(0, [instruction(0, OPCODES.param, TYPE_IDS.String, [], 0)], terminator(STRING_MATCH_GIR_MATCH_TERMINATOR_ID, [0], edges));
  const returns = snapshot.arms.map((arm) => {
    const resultId = arm.id;
    return block(arm.id, [instruction(resultId, OPCODES.boolConst, TYPE_IDS.Bool, [], arm.result ? 1 : 0)], terminator(4, [resultId], []));
  });
  return array([uint(1), uint(1), array([uint(TYPE_IDS.String)]), uint(TYPE_IDS.Bool), array([]), array([]), uint(0), array([entry, ...returns]), uint(1)]);
}
function emitGIR(snapshot: StringMatchCheckedModuleSnapshotV2): Uint8Array {
  const functions = [functionValue(snapshot)];
  const failures = [[1, 2, 1, 1], [2, 3, 2, 1], [3, 4, 2, 1], [4, 1, 1, 1]] as const;
  const values: readonly Uint8Array[] = [
    uint(2), uint(1), text(STRING_MATCH_SEMANTIC_PROFILE_ID), text("slide.digest.sha256.v1"),
    array([text(STRING_MATCH_REGISTRY_SET_ID), text(STRING_MATCH_REGISTRY_SET_DIGEST)]), text("slide.memory.safe-value.v1"),
    array([1, 2, 3, 4, 5].map(uint)), array(BASE_LIMITS.map(uint)), array([uint(1)]), array(Array.from({ length: 13 }, (_, index) => uint(index + 1))),
    array(snapshot.arms.filter((arm) => arm.literal !== null).map((arm) => uint(arm.id))), array(functions), array(failures.map((failure) => array(failure.map(uint)))), array([]), array([]), array([]), array([]), array([]),
    array(snapshot.arms.filter((arm) => arm.literal !== null).map(constantRow)), array([]), array([]), text(STRING_MATCH_GIR_SCHEMA), text(STRING_MATCH_GIR_EDITION),
  ];
  return map(values.map((value, key) => [uint(key), value] as const));
}

export function emitCanonicalStringMatchGIRFromSnapshot(snapshotBytes: Uint8Array, expected: ArtifactReferenceV1): StringMatchGIREmissionResultV1 {
  const snapshotReference = decodeArtifactReference(expected);
  if (snapshotReference.owner !== "galerina" || snapshotReference.kind !== "checked-module-snapshot") refuse("REFERENCE_KIND");
  const snapshotDigest = digestArtifactBytes(snapshotBytes);
  if (snapshotReference.digest !== snapshotDigest || snapshotReference.byteLength !== snapshotBytes.byteLength) refuse("SNAPSHOT_REFERENCE");
  const snapshot = decodeStringMatchCheckedModuleSnapshot(snapshotBytes);
  const girBytes = emitGIR(snapshot);
  const girReference = createArtifactReference("galerina", "canonical-gir", girBytes);
  return Object.freeze({ schema: STRING_MATCH_GIR_SCHEMA, edition: STRING_MATCH_GIR_EDITION, snapshotReference, girReference, girBytes: new Uint8Array(girBytes), girDigest: girReference.digest, semanticProfileId: STRING_MATCH_SEMANTIC_PROFILE_ID, registrySetId: STRING_MATCH_REGISTRY_SET_ID, registrySetDigest: STRING_MATCH_REGISTRY_SET_DIGEST, authorityReleased: false });
}
