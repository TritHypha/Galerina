/**
 * Bind one exact core-wasm SHA-256 across SLIDE admission, the WAMR loaded
 * snapshot, VOK mint/lease/receipt evidence, Lyth producer identity, and
 * Tower producer identity. Mismatch, missing, unknown, or wrong-length
 * refuses before secret access. This module does not admit, lease, or
 * disclose secrets.
 */
import { createHash } from "node:crypto";

export const ARTIFACT_DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

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
  | ArtifactDigestBindResult;

type ExpectedDigest =
  | { readonly kind: "unset" }
  | { readonly kind: "set"; readonly digest: string };

function parseHop(hop: ArtifactDigestHop): ParsedHop {
  switch (hop.kind) {
    case "present":
      if (typeof hop.digest !== "string" || !ARTIFACT_DIGEST_RE.test(hop.digest)) {
        return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MALFORMED" };
      }
      return { kind: "ok", digest: hop.digest };
    case "missing":
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
    case "unknown":
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_UNKNOWN" };
    default: {
      const _exhaustive: never = hop;
      void _exhaustive;
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_UNKNOWN" };
    }
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
  if (typeof hops !== "object" || hops === null || Array.isArray(hops)) {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
  }
  let expected: ExpectedDigest = { kind: "unset" };
  for (const name of HOP_NAMES) {
    const hop = hops[name];
    if (hop === undefined) {
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
    }
    const parsed = parseHop(hop);
    if (parsed.kind === "REFUSED") return parsed;
    if (expected.kind === "unset") {
      expected = { kind: "set", digest: parsed.digest };
    } else if (parsed.digest !== expected.digest) {
      return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISMATCH" };
    }
  }
  if (expected.kind !== "set") {
    return { kind: "REFUSED", code: "ARTIFACT_DIGEST_MISSING" };
  }
  return { kind: "BOUND", digest: expected.digest };
}
