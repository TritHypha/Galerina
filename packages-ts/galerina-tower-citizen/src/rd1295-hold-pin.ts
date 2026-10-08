// rd1295-hold-pin.ts — Tower side of the RD-1295 HOLD rows.
//
// This package may emit a typed request or a typed refusal. It never extracts
// core-network's package install, never signs a v1 certified deployment, never
// converts to .fungi, never admits (SLIDE), never authorises (VOK), never mints
// hardware evidence, and never claims an independent audit.

import { createHash } from "node:crypto";

export const RD1295_HOLD_PIN_SCHEMA = "galerina.tower-citizen.rd1295-hold-pin.v1" as const;

export type TowerHoldRefusalCode =
  | "TW_CORE_NETWORK_INSTALL_EXTRACT_FORBIDDEN"
  | "TW_CERTIFIED_DEPLOYMENT_SIGN_FORBIDDEN"
  | "TW_FUNGI_CONVERSION_FORBIDDEN"
  | "TW_SLIDE_ADMISSION_FORBIDDEN"
  | "TW_VOK_AUTHORISE_FORBIDDEN"
  | "TW_HARDWARE_EVIDENCE_FORBIDDEN"
  | "TW_INDEPENDENT_AUDIT_FORBIDDEN"
  | "TW_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "TW_HOLD_REQUEST_KEY_MATERIAL_PRESENT"
  | "TW_HOLD_REQUEST_UNSIGNED_LOAD"
  | "TW_HOLD_REQUEST_MALFORMED";

export interface TowerHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: TowerHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface CertifiedDeploymentRequestV1 {
  readonly kind: "CERTIFIED_DEPLOYMENT_REQUEST";
  readonly schema: typeof RD1295_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_SIGNED";
  readonly profile: "tower.certified.v1";
  readonly allowUnsignedLoad: false;
  readonly requestDigest: string;
  readonly requires: {
    readonly v1ReleaseSigningCeremony: true;
    readonly freshSlideAdmission: true;
    readonly freshVokDecision: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type CertifiedDeploymentRequestResult = CertifiedDeploymentRequestV1 | TowerHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
]);

const KEY_MATERIAL_KEYS: ReadonlySet<string> = new Set([
  "privateKey", "privateKeyPem", "mlDsaPrivateKey", "signingKey", "releaseSigningKey",
  "deploymentKey", "deploymentPrivateKey", "throwawayKey", "ceremonyKey", "v1ReleaseKey",
]);

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scanForbiddenKeys(value: unknown, keys: ReadonlySet<string>, depth: number): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && keys.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return true;
    if (scanForbiddenKeys(descriptor.value, keys, depth + 1)) return true;
  }
  return false;
}

function refusal(code: TowerHoldRefusalCode): TowerHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** RD-1295 does not authorize a package split. The extract act is not this package. */
export function extractCoreNetworkTowerInstall(_input: unknown): TowerHoldRefusal {
  return refusal("TW_CORE_NETWORK_INSTALL_EXTRACT_FORBIDDEN");
}

/**
 * Package a well-formed certified-deployment *request*. Never signs.
 * Status is always REQUESTED_NOT_SIGNED. Owner O4: wait for the v1 ceremony.
 */
export function prepareCertifiedDeploymentRequest(input: unknown): CertifiedDeploymentRequestResult {
  if (scanForbiddenKeys(input, AUTHORITY_KEYS, 0)) return refusal("TW_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (scanForbiddenKeys(input, KEY_MATERIAL_KEYS, 0)) return refusal("TW_HOLD_REQUEST_KEY_MATERIAL_PRESENT");
  if (!isPlainDataObject(input)) return refusal("TW_HOLD_REQUEST_MALFORMED");
  if (input.allowUnsignedLoad === true) return refusal("TW_HOLD_REQUEST_UNSIGNED_LOAD");
  if (input.profile !== "tower.certified.v1") return refusal("TW_HOLD_REQUEST_MALFORMED");
  if (input.allowUnsignedLoad !== false) return refusal("TW_HOLD_REQUEST_MALFORMED");
  const encoded = JSON.stringify({
    schema: RD1295_HOLD_PIN_SCHEMA,
    profile: "tower.certified.v1",
    allowUnsignedLoad: false,
    status: "REQUESTED_NOT_SIGNED",
  });
  const requestDigest = `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
  return Object.freeze({
    kind: "CERTIFIED_DEPLOYMENT_REQUEST",
    schema: RD1295_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_SIGNED",
    profile: "tower.certified.v1",
    allowUnsignedLoad: false,
    requestDigest,
    requires: Object.freeze({
      v1ReleaseSigningCeremony: true,
      freshSlideAdmission: true,
      freshVokDecision: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** The v1 release-signing ceremony is not this package. Every input is refused. */
export function signCertifiedDeployment(_input: unknown): TowerHoldRefusal {
  return refusal("TW_CERTIFIED_DEPLOYMENT_SIGN_FORBIDDEN");
}

export function convertTowerToFungi(_input: unknown): TowerHoldRefusal {
  return refusal("TW_FUNGI_CONVERSION_FORBIDDEN");
}

export function admitTowerArtifact(_input: unknown): TowerHoldRefusal {
  return refusal("TW_SLIDE_ADMISSION_FORBIDDEN");
}

export function authoriseTowerArtifact(_input: unknown): TowerHoldRefusal {
  return refusal("TW_VOK_AUTHORISE_FORBIDDEN");
}

export function claimHardwareEvidence(_input: unknown): TowerHoldRefusal {
  return refusal("TW_HARDWARE_EVIDENCE_FORBIDDEN");
}

export function claimIndependentAudit(_input: unknown): TowerHoldRefusal {
  return refusal("TW_INDEPENDENT_AUDIT_FORBIDDEN");
}
