/**
 * Bind one exact core-wasm SHA-256 across SLIDE admission, the WAMR loaded
 * snapshot, VOK mint/lease/receipt evidence, Lyth producer identity, and
 * Tower producer identity. Mismatch, missing, unknown, or wrong-length
 * refuses before secret access. This module does not admit, lease, or
 * disclose secrets.
 *
 * Hop fields are snapshotted once from own data properties. Accessors,
 * detectable Proxies, class instances, and non-plain prototypes refuse.
 */
import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

const ARTIFACT_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

/** Predicate over a digest string. The binder's regex is module-private. */
export function isArtifactDigest(value: unknown): boolean {
  return typeof value === "string" && ARTIFACT_DIGEST_RE.test(value);
}

export type ArtifactDigestHop =
  | { readonly kind: "present"; readonly digest: string }
  | { readonly kind: "missing" }
  | { readonly kind: "unknown"; readonly reason: string };

export type ArtifactDigestRefuseCode =
  | "ARTIFACT_DIGEST_MISSING"
  | "ARTIFACT_DIGEST_UNKNOWN"
  | "ARTIFACT_DIGEST_MALFORMED"
  | "ARTIFACT_DIGEST_MISMATCH";

export type ArtifactDigestBindResult =
  | { readonly kind: "BOUND"; readonly digest: string }
  | { readonly kind: "REFUSED"; readonly code: ArtifactDigestRefuseCode };

export interface ArtifactDigestHops {
  readonly slideAdmission: ArtifactDigestHop;
  readonly wamrLoaded: ArtifactDigestHop;
  readonly vokReceipt: ArtifactDigestHop;
  readonly lythProducer: ArtifactDigestHop;
  readonly towerProducer: ArtifactDigestHop;
}

const HOP_NAMES = [
  "slideAdmission",
  "wamrLoaded",
  "vokReceipt",
  "lythProducer",
  "towerProducer",
] as const;

type ParsedHop =
  | { readonly kind: "ok"; readonly digest: string }
  | { readonly kind: "REFUSED"; readonly code: ArtifactDigestRefuseCode };

type ExpectedDigest =
  | { readonly kind: "unset" }
  | { readonly kind: "set"; readonly digest: string };

type OwnDataSnapshot =
  | { readonly kind: "absent" }
  | { readonly kind: "accessor" }
  | { readonly kind: "value"; readonly value: unknown };

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (nodeTypes.isProxy(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  return true;
}

function ownDataSnapshot(obj: object, key: string): OwnDataSnapshot {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (desc === undefined) {
    return { kind: "absent" };
  }
  if (typeof desc.get === "function" || typeof desc.set === "function") {
    return { kind: "accessor" };
  }
  if (!Object.prototype.hasOwnProperty.call(desc, "value")) {
    return { kind: "accessor" };
  }
  return { kind: "value", value: desc.value };
}

function refuseUnknownHopKind(): ParsedHop {
  return { kind: "REFUSED", code: "ARTIFACT_DIGEST_UNKNOWN" };
}

function refuseNonObjectHops(): ArtifactDigestBindResult {
  return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
}

function parseHop(hop: unknown): ParsedHop {
  if (!isPlainDataObject(hop)) {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
  }
  const kindSnap = ownDataSnapshot(hop, "kind");
  if (kindSnap.kind !== "value" || typeof kindSnap.value !== "string") {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
  }
  const hopKind = kindSnap.value;
  switch (hopKind) {
    case "present": {
      const digestSnap = ownDataSnapshot(hop, "digest");
      if (digestSnap.kind !== "value" || typeof digestSnap.value !== "string") {
        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
      }
      const digest = digestSnap.value;
      if (!ARTIFACT_DIGEST_RE.test(digest)) {
        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
      }
      return { kind: "ok", digest };
    }
    case "missing":
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
    case "unknown":
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_UNKNOWN" };
    default:
      return refuseUnknownHopKind();
  }
}

export function hashWasmArtifact(bytes: Uint8Array): ArtifactDigestBindResult {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
  }
  return {
    kind: "BOUND",
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

export function artifactDigestFromRaw32(bytes: Uint8Array): ArtifactDigestBindResult {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
  }
  let hex = "";
  for (let i = 0; i < 32; i += 1) {
    const byte = bytes[i];
    if (typeof byte !== "number") {
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return { kind: "BOUND", digest: `sha256:${hex}` };
}

export function bindExactArtifactDigest(hops: ArtifactDigestHops): ArtifactDigestBindResult {
  if (!isPlainDataObject(hops)) {
    return refuseNonObjectHops();
  }
  let expected: ExpectedDigest = { kind: "unset" };
  for (const name of HOP_NAMES) {
    const hopSnap = ownDataSnapshot(hops, name);
    switch (hopSnap.kind) {
      case "absent":
        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
      case "accessor":
        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
      case "value": {
        const parsed = parseHop(hopSnap.value);
        switch (parsed.kind) {
          case "REFUSED":
            return parsed;
          case "ok":
            if (expected.kind === "unset") {
              expected = { kind: "set", digest: parsed.digest };
            } else if (parsed.digest !== expected.digest) {
              return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISMATCH" };
            }
            break;
          default: {
            const _parsed: never = parsed;
            void _parsed;
            return { kind: "REFUSED", code: "ARTIFACT_DIGEST_UNKNOWN" };
          }
        }
        break;
      }
      default: {
        const _exhaustive: never = hopSnap;
        void _exhaustive;
        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_UNKNOWN" };
      }
    }
  }
  if (expected.kind !== "set") {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
  }
  return { kind: "BOUND", digest: expected.digest };
}
