// slide-admission-request.ts — Tri-Pipe side of the SLIDE/VOK admission HOLD.
//
// PROPOSAL ONLY. This package may emit a typed admission *request*. It never admits,
// authorises, leases, or dispatches. SLIDE admits; VOK authorises (decision, one-use
// lease, receipt). RD-0855 §4.3.

import { createHash } from "node:crypto";
import {
  COMPUTE_TRANSFER_SCHEMA,
  type ComputeTransferV1,
  type TriPipeProposal,
} from "./tri-pipe.js";
import { ATTEMPT_PROPOSAL_SCHEMA, type AttemptProposalV1 } from "./alternative-proposal.js";

export const SLIDE_ADMISSION_REQUEST_SCHEMA = "galerina.tri-pipe.slide-admission-request.v1" as const;

export type SlideAdmissionRequestStatus = "REQUESTED_NOT_ADMITTED";

export interface SlideAdmissionRequestV1 {
  readonly kind: "SLIDE_ADMISSION_REQUEST";
  readonly schema: typeof SLIDE_ADMISSION_REQUEST_SCHEMA;
  readonly status: SlideAdmissionRequestStatus;
  readonly proposalKind: "PROPOSAL" | "ATTEMPT_PROPOSAL";
  readonly proposalDigest: string;
  readonly transfer: ComputeTransferV1;
  readonly requestDigest: string;
  readonly requires: {
    readonly freshSlideAdmission: true;
    readonly freshVokDecision: true;
    readonly freshVokLease: true;
    readonly linkedTerminalReceipt: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface SlideAdmissionRequestRefusal {
  readonly kind: "REFUSED";
  readonly code:
    | "TP_SLIDE_REQUEST_MALFORMED"
    | "TP_SLIDE_REQUEST_AUTHORITY_FIELD_PRESENT"
    | "TP_SLIDE_REQUEST_ALREADY_CLAIMED";
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type SlideAdmissionRequestResult = SlideAdmissionRequestV1 | SlideAdmissionRequestRefusal;

export interface SlideAdmissionActRefusal {
  readonly kind: "REFUSED";
  readonly code: "TP_SLIDE_ADMISSION_FORBIDDEN";
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
]);

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;

const REQUIRES = Object.freeze({
  freshSlideAdmission: true,
  freshVokDecision: true,
  freshVokLease: true,
  linkedTerminalReceipt: true,
});

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

function refusal(
  code: SlideAdmissionRequestRefusal["code"],
): SlideAdmissionRequestRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

function asTransfer(value: unknown): ComputeTransferV1 | null {
  if (!isPlainDataObject(value)) return null;
  if (value.schema !== COMPUTE_TRANSFER_SCHEMA) return null;
  if (value.owner !== "galerina.tri-pipe") return null;
  if (value.kind !== "route-proposal") return null;
  if (typeof value.digest !== "string" || !DIGEST_RE.test(value.digest)) return null;
  return Object.freeze({
    schema: COMPUTE_TRANSFER_SCHEMA,
    owner: "galerina.tri-pipe",
    kind: "route-proposal",
    digest: value.digest,
  });
}

function requiresFresh(value: unknown): boolean {
  if (!isPlainDataObject(value)) return false;
  return value.freshSlideAdmission === true
    && value.freshVokDecision === true
    && value.freshVokLease === true
    && value.linkedTerminalReceipt === true;
}

/**
 * Package a well-formed proposal as a SLIDE/VOK admission *request*.
 * Never admits. Status is always REQUESTED_NOT_ADMITTED.
 */
export function prepareSlideAdmissionRequest(proposal: unknown): SlideAdmissionRequestResult {
  if (hasAuthorityField(proposal, 0)) return refusal("TP_SLIDE_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(proposal)) return refusal("TP_SLIDE_REQUEST_MALFORMED");
  if (proposal.authorityReleased !== false || proposal.admissionAuthority !== false) {
    return refusal("TP_SLIDE_REQUEST_ALREADY_CLAIMED");
  }
  if (proposal.kind !== "PROPOSAL" && proposal.kind !== "ATTEMPT_PROPOSAL") {
    return refusal("TP_SLIDE_REQUEST_MALFORMED");
  }
  if (!requiresFresh(proposal.requires)) return refusal("TP_SLIDE_REQUEST_MALFORMED");
  const transfer = asTransfer(proposal.transfer);
  if (transfer === null) return refusal("TP_SLIDE_REQUEST_MALFORMED");

  let proposalDigest: string;
  if (proposal.kind === "PROPOSAL") {
    const route = proposal as unknown as TriPipeProposal;
    if (typeof route.candidateRouteDigest !== "string" || !DIGEST_RE.test(route.candidateRouteDigest)) {
      return refusal("TP_SLIDE_REQUEST_MALFORMED");
    }
    if (transfer.digest !== route.candidateRouteDigest) return refusal("TP_SLIDE_REQUEST_MALFORMED");
    proposalDigest = route.candidateRouteDigest;
  } else {
    const attempt = proposal as unknown as AttemptProposalV1;
    if (attempt.schema !== ATTEMPT_PROPOSAL_SCHEMA) return refusal("TP_SLIDE_REQUEST_MALFORMED");
    if (typeof attempt.planIdentity !== "string" || !DIGEST_RE.test(attempt.planIdentity)) {
      return refusal("TP_SLIDE_REQUEST_MALFORMED");
    }
    if (transfer.digest !== attempt.planIdentity) return refusal("TP_SLIDE_REQUEST_MALFORMED");
    proposalDigest = attempt.planIdentity;
  }

  const encoded = JSON.stringify({
    schema: SLIDE_ADMISSION_REQUEST_SCHEMA,
    proposalKind: proposal.kind,
    proposalDigest,
    transfer,
    status: "REQUESTED_NOT_ADMITTED",
    requires: REQUIRES,
  });
  const requestDigest = `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
  return Object.freeze({
    kind: "SLIDE_ADMISSION_REQUEST",
    schema: SLIDE_ADMISSION_REQUEST_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    proposalKind: proposal.kind,
    proposalDigest,
    transfer,
    requestDigest,
    requires: REQUIRES,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * The admission act is not this package. Every input is refused.
 */
export function admitProposedRoute(_request: unknown): SlideAdmissionActRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code: "TP_SLIDE_ADMISSION_FORBIDDEN",
    authorityReleased: false,
    admissionAuthority: false,
  });
}
