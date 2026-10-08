// native-hold-pin.ts — package side of the target-native HOLD rows.
//
// Planning/metadata only. This package never physically opens a locator,
// never follows a symlink, never promotes FUNGI-NATIVE into the live
// diagnostic registry, and never claims VOK verification.

import { createHash } from "node:crypto";
import { PROPOSED_FUNGI_NATIVE_MAPPING } from "./proposed-fungi-native-mapping.js";

export const NATIVE_HOLD_PIN_SCHEMA = "galerina.target-native.hold-pin.v1" as const;

export type NativeHoldRefusalCode =
  | "NT_PHYSICAL_OPEN_FORBIDDEN"
  | "NT_FUNGI_NATIVE_PROMOTION_FORBIDDEN"
  | "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "NT_HOLD_REQUEST_MALFORMED"
  | "NT_HOLD_REQUEST_PATH_ESCAPES";

export interface NativeHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: NativeHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface NativeOpenRequestV1 {
  readonly kind: "NATIVE_OPEN_REQUEST";
  readonly schema: typeof NATIVE_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_OPENED";
  readonly locator: string;
  readonly digest: string;
  readonly requestDigest: string;
  readonly requires: {
    readonly toctouSafeOpen: true;
    readonly digestMatch: true;
    readonly currentVokReceipt: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type NativeOpenRequestResult = NativeOpenRequestV1 | NativeHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
]);

const SHA256_HEX = /^[0-9a-f]{64}$/u;

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasAuthorityField(value: unknown, depth: number): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && AUTHORITY_KEYS.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return true;
    if (hasAuthorityField(descriptor.value, depth + 1)) return true;
  }
  return false;
}

function locatorEscapes(locator: string): boolean {
  const normalized = locator.replace(/\\/g, "/");
  if (locator.includes("\0") || locator.includes("\\")) return true;
  if (/^[a-zA-Z]:/.test(locator) || normalized.startsWith("/") || normalized.startsWith("//")) return true;
  const parts = normalized.split("/");
  return parts.includes("..") || parts.includes("") || parts.some((part) => part === ".");
}

function refusal(code: NativeHoldRefusalCode): NativeHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * Package a well-formed open *request*. Never opens. Status is always
 * REQUESTED_NOT_OPENED. Identity remains the bound digest, not a path.
 */
export function prepareNativeOpenRequest(input: unknown): NativeOpenRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("NT_HOLD_REQUEST_MALFORMED");
  if (typeof input.path !== "string" || input.path.trim().length === 0) {
    return refusal("NT_HOLD_REQUEST_MALFORMED");
  }
  if (typeof input.digest !== "string" || !SHA256_HEX.test(input.digest)) {
    return refusal("NT_HOLD_REQUEST_MALFORMED");
  }
  const locator = input.path.trim();
  if (locatorEscapes(locator)) return refusal("NT_HOLD_REQUEST_PATH_ESCAPES");
  const encoded = new TextEncoder().encode(JSON.stringify({
    schema: NATIVE_HOLD_PIN_SCHEMA,
    locator,
    digest: input.digest,
    status: "REQUESTED_NOT_OPENED",
  }));
  const requestDigest = `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
  return Object.freeze({
    kind: "NATIVE_OPEN_REQUEST",
    schema: NATIVE_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_OPENED",
    locator,
    digest: input.digest,
    requestDigest,
    requires: Object.freeze({
      toctouSafeOpen: true,
      digestMatch: true,
      currentVokReceipt: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** Physical open/TOCTOU is not this package. Every input is refused. */
export function openNativeArtifact(_input: unknown): NativeHoldRefusal {
  return refusal("NT_PHYSICAL_OPEN_FORBIDDEN");
}

/** FUNGI-CATEGORY-NNN ownership is not this package. Every input is refused. */
export function promoteNativeDiagnosticsToFungi(_input: unknown = PROPOSED_FUNGI_NATIVE_MAPPING): NativeHoldRefusal {
  return refusal("NT_FUNGI_NATIVE_PROMOTION_FORBIDDEN");
}
