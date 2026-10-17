/**
 * POST /auth/verify composition (Brief B).
 *
 * Base: #182 `e0601a2e64009ea2be7c43d2235dcc4d9f3ebc4f`. Cherry-pick of
 * `33f9745d..ead2d7cc` conflicted at `02d68758` (Cargo.toml, lib.rs,
 * modify/delete of vok_authority_handoff.h). Alternative taken: #183 is the
 * hash-pinned out-of-process verifier built from
 * `ead2d7cc3f63f8a971da184458758d173f58bebc`.
 *
 * D = ReleaseCommitAuthority.consume. Rust is never linked into this runtime.
 * Production has no owner-named SLIDE record or attested TCB profile; those
 * handles refuse. Tests use the synthetic test-only identifiers below.
 */

import { createHash } from "node:crypto";
import {
  ReleaseCommitAuthority,
  wipeBytes,
} from "./release-commit-point.js";
import { createSecretGate } from "./secret-gate.js";
import type { SecretsProvider } from "./secret-gate.js";

export const AUTH_VERIFY_METHOD = "POST" as const;
export const AUTH_VERIFY_PATH = "/auth/verify" as const;
export const AUTH_VERIFY_MAX_BODY_BYTES = 16384;
export const AUTH_VERIFY_TIMEOUT_MS = 5000;
export const AUTH_VERIFY_RECEIPT_SCHEMA = "galerina.auth-verify.receipt.v1" as const;
export const AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD =
  "galerina.test.only.auth-verify.slide-record.v1" as const;
export const AUTH_VERIFY_SYNTHETIC_TCB_PROFILE =
  "galerina.test.only.auth-verify.tcb-profile.v1" as const;
export const AUTH_VERIFY_PINNED_VERIFIER_COMMIT =
  "ead2d7cc3f63f8a971da184458758d173f58bebc" as const;

export type AuthVerifyMode = "production" | "test";

export type AuthVerifyCode =
  | "released"
  | "malformed_input"
  | "payload_too_large"
  | "operation_id_missing"
  | "operation_replay"
  | "ARTIFACT_DIGEST_MISSING"
  | "ARTIFACT_MISMATCH"
  | "AOT_REFUSED"
  | "BYTECODE_REQUIRED"
  | "slide_admission_refused"
  | "authority_missing"
  | "authority_stale"
  | "authority_revoked"
  | "VERDICT_REFUSED"
  | "secret_unavailable"
  | "guest_trap"
  | "deadline_exceeded"
  | "client_disconnected"
  | "delivery_unknown"
  | "partial_delivery"
  | "unknown_outcome"
  | "cleanup_failed"
  | "tcb_profile_refused";

export type AuthVerifyStage =
  | "ingress"
  | "mint"
  | "verifier"
  | "wamr"
  | "slide"
  | "vok"
  | "provider"
  | "guest"
  | "sink"
  | "ack"
  | "cleanup";

export type AuthVerifyLeaseState =
  | "unused"
  | "not-minted"
  | "missing"
  | "released"
  | "retired"
  | "fenced"
  | "delivery-unknown"
  | "quarantined";

export type AuthVerifyReceiptKind =
  | "WAX_SEAL"
  | "refuse"
  | "delivery-unknown"
  | "status-only"
  | "refuse+quarantine";

export type VerifierCustodyFail = {
  readonly ok: false;
  readonly code: "ARTIFACT_DIGEST_MISSING" | "VERDICT_REFUSED";
  readonly reason: "missing" | "pin" | "spawn" | "malformed" | "nonzero";
};

export type VerifierCustodyResult = { readonly ok: true } | VerifierCustodyFail;

export type LoadArtifactResult =
  | { readonly ok: true; readonly artifactDigest: string; readonly snapshot: Uint8Array }
  | {
      readonly ok: false;
      readonly code: "ARTIFACT_DIGEST_MISSING" | "ARTIFACT_MISMATCH" | "AOT_REFUSED" | "BYTECODE_REQUIRED";
    };

export type SlideAdmitResult = { readonly ok: true } | { readonly ok: false };

export type VokAuthorizeResult =
  | { readonly ok: true; readonly epoch: number }
  | { readonly ok: false; readonly code: "authority_missing" | "ARTIFACT_MISMATCH" };

export type GuestRunResult =
  | { readonly ok: true; readonly matched: boolean }
  | { readonly ok: false; readonly code: "guest_trap" | "unknown_outcome" };

export type SinkDeliverResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "partial_delivery" | "delivery_unknown" };

export interface AuthVerifyPorts {
  readonly verifierCustody: (input: {
    readonly pinSha256: string;
    readonly remainingMs: number;
    readonly snapshot: Uint8Array;
  }) => Promise<VerifierCustodyResult>;
  readonly loadArtifact: (input: {
    readonly remainingMs: number;
  }) => Promise<LoadArtifactResult>;
  readonly admitSlide: (input: {
    readonly recordId: string;
    readonly artifactDigest: string;
    readonly remainingMs: number;
  }) => Promise<SlideAdmitResult>;
  readonly authorizeVok: (input: {
    readonly artifactDigest: string;
    readonly remainingMs: number;
  }) => Promise<VokAuthorizeResult>;
  readonly runGuest: (input: {
    readonly body: Uint8Array;
    readonly remainingMs: number;
    readonly getSecret: (name: string, fn: (value: Uint8Array) => void) => void;
  }) => Promise<GuestRunResult>;
  readonly deliverSink: (input: {
    readonly outcome: "matched" | "not-matched";
    readonly remainingMs: number;
  }) => Promise<SinkDeliverResult>;
  readonly acknowledge: (input: {
    readonly operationId: string;
    readonly remainingMs: number;
  }) => Promise<{ readonly ok: boolean }>;
  readonly wipe: (copies: readonly Uint8Array[]) => void;
}

export interface AuthVerifyRequest {
  readonly method: string;
  readonly path: string;
  readonly contentType: string;
  readonly body: Uint8Array;
  readonly channelAllow: boolean;
  readonly principal: string;
  readonly disconnected?: boolean;
  readonly correlationId?: string;
}

export interface AuthVerifyReceipt {
  readonly schemaVersion: typeof AUTH_VERIFY_RECEIPT_SCHEMA;
  readonly operationId: string;
  readonly requestDigest: string;
  readonly artifactDigest: string;
  readonly leaseId: string;
  readonly outcome: AuthVerifyCode | "matched" | "not-matched";
  readonly authorizing: false;
  readonly replayable: false;
  readonly sealDigest: string;
}

export interface AuthVerifyResponse {
  readonly status: number;
  readonly code: AuthVerifyCode;
  readonly stage: AuthVerifyStage;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
  readonly leave: boolean;
  readonly lease: AuthVerifyLeaseState;
  readonly receiptKind: AuthVerifyReceiptKind;
  readonly quarantined: boolean;
  readonly wiped: boolean;
  readonly secretTouched: boolean;
  readonly consumed: boolean;
  readonly receipt: AuthVerifyReceipt;
  readonly rowId: string;
}

export class AuthVerifyConstructionRefused extends Error {
  readonly code = "unknown_outcome" as const;
  constructor(reason: string) {
    super(`POST /auth/verify refused at construction: ${reason}`);
    this.name = "AuthVerifyConstructionRefused";
  }
}

const HTTP_BY_CODE: Readonly<Record<AuthVerifyCode, number>> = Object.freeze({
  released: 200,
  malformed_input: 400,
  payload_too_large: 413,
  operation_id_missing: 400,
  operation_replay: 409,
  ARTIFACT_DIGEST_MISSING: 503,
  ARTIFACT_MISMATCH: 403,
  AOT_REFUSED: 403,
  BYTECODE_REQUIRED: 403,
  slide_admission_refused: 403,
  authority_missing: 503,
  authority_stale: 403,
  authority_revoked: 403,
  VERDICT_REFUSED: 403,
  secret_unavailable: 503,
  guest_trap: 503,
  deadline_exceeded: 504,
  client_disconnected: 499,
  delivery_unknown: 503,
  partial_delivery: 503,
  unknown_outcome: 503,
  cleanup_failed: 503,
  tcb_profile_refused: 503,
});

function httpStatusFor(code: AuthVerifyCode, spawnFailure: boolean): number {
  if (code === "VERDICT_REFUSED" && spawnFailure) return 503;
  const mapped = HTTP_BY_CODE[code];
  if (mapped === undefined) return 503;
  return mapped;
}

type SecretAdmitBoundary =
  | { readonly kind: "admitted" }
  | { readonly kind: "refused"; readonly code: "secret_unavailable" };

function admitAtRouteBoundary(raw: "secret_unavailable" | null): SecretAdmitBoundary {
  if (raw === "secret_unavailable") {
    return { kind: "refused", code: "secret_unavailable" };
  }
  if (raw === null) {
    return { kind: "admitted" };
  }
  return { kind: "refused", code: "secret_unavailable" };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

const TIMEOUT_TOKEN = Symbol("auth-verify-timeout");

async function raceRemainder<T>(work: Promise<T>, remainingMs: number): Promise<T | typeof TIMEOUT_TOKEN> {
  if (remainingMs <= 0) return TIMEOUT_TOKEN; /* AUTH_VERIFY_GUARD_TIMEOUT */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof TIMEOUT_TOKEN>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_TOKEN), remainingMs);
  });
  try {
    return await Promise.race([work, timeoutPromise]); /* AUTH_VERIFY_GUARD_TIMEOUT */
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function jsonBody(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function receiptSeal(fields: {
  operationId: string;
  requestDigest: string;
  artifactDigest: string;
  leaseId: string;
  outcome: string;
}): string {
  const lines = [
    `schemaVersion=${AUTH_VERIFY_RECEIPT_SCHEMA}`,
    `operationId=${fields.operationId}`,
    `requestDigest=${fields.requestDigest}`,
    `artifactDigest=${fields.artifactDigest}`,
    `leaseId=${fields.leaseId}`,
    `outcome=${fields.outcome}`,
    "authorizing=false",
    "replayable=false",
  ].join("\n");
  return sha256Hex(new TextEncoder().encode(lines));
}

function timeoutRow(stage: AuthVerifyStage): { code: AuthVerifyCode; rowId: string } {
  switch (stage) {
    case "verifier":
      return { code: "deadline_exceeded", rowId: "F-20" };
    case "slide":
      return { code: "deadline_exceeded", rowId: "F-21" };
    case "vok":
      return { code: "deadline_exceeded", rowId: "F-22" };
    case "provider":
      return { code: "deadline_exceeded", rowId: "F-23" };
    case "guest":
      return { code: "deadline_exceeded", rowId: "F-24" };
    case "sink":
      return { code: "deadline_exceeded", rowId: "F-25" };
    case "ack":
      return { code: "deadline_exceeded", rowId: "F-26" };
    default:
      return { code: "deadline_exceeded", rowId: "F-30" };
  }
}

export interface AuthVerifyRouteOptions {
  readonly mode: AuthVerifyMode;
  readonly timeoutMs: number;
  readonly fungiMaxRequestSize: number;
  readonly kernelMaxSizeBytes: number;
  readonly namedSlideRecord: string;
  readonly namedTcbProfile: string;
  readonly verifierPinSha256: string;
  readonly ports: AuthVerifyPorts;
  readonly secrets: SecretsProvider;
  readonly requiredSecrets?: readonly string[];
  readonly authority?: ReleaseCommitAuthority;
  readonly mintOperationId?: () => string;
  readonly nowMs?: () => number;
  readonly revokeBeforeRelease?: boolean;
}

export interface AuthVerifyRoute {
  readonly maxBodyBytes: number;
  readonly timeoutMs: number;
  handle(request: AuthVerifyRequest): Promise<AuthVerifyResponse>;
}

export function createAuthVerifyRoute(options: AuthVerifyRouteOptions): AuthVerifyRoute {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new AuthVerifyConstructionRefused("timeoutMs must be a positive integer");
  }
  if (!Number.isSafeInteger(options.fungiMaxRequestSize) || options.fungiMaxRequestSize <= 0) {
    throw new AuthVerifyConstructionRefused("missing Fungi max request size");
  }
  if (!Number.isSafeInteger(options.kernelMaxSizeBytes) || options.kernelMaxSizeBytes <= 0) {
    throw new AuthVerifyConstructionRefused("kernel maxSizeBytes");
  }
  if (typeof options.verifierPinSha256 !== "string" || !isHex64(options.verifierPinSha256)) {
    throw new AuthVerifyConstructionRefused("verifierPinSha256");
  }
  const maxBodyBytes = Math.min(
    AUTH_VERIFY_MAX_BODY_BYTES,
    options.fungiMaxRequestSize,
    options.kernelMaxSizeBytes,
  );
  if (maxBodyBytes <= 0) {
    throw new AuthVerifyConstructionRefused("effective body cap");
  }

  const authority = options.authority ?? new ReleaseCommitAuthority();
  const requiredSecrets = options.requiredSecrets ?? Object.freeze(["auth-verify-credential"]);
  const secretGate = createSecretGate(options.secrets, {
    authority,
    requireBoundOperationId: true,
    requireRevocationEpoch: true,
  });
  let seq = 0;
  const defaultMint = (): string => {
    seq += 1;
    return `auth-verify\u0000${seq}`;
  };
  const mintOperationId = options.mintOperationId ?? defaultMint;
  const nowMs = options.nowMs ?? (() => Date.now());

  async function handle(request: AuthVerifyRequest): Promise<AuthVerifyResponse> {
    const copies: Uint8Array[] = [];
    let secretTouched = false;
    let consumed = false;
    let quarantined = false;
    let wiped = false;
    let leaseState: AuthVerifyLeaseState = "not-minted";
    let operationId = "";
    let requestDigest = "";
    let artifactDigest = "";
    let leaseId = "";
    let leaseToken = "";
    let leaseEpoch = -1;
    const deadlineAt = nowMs() + options.timeoutMs;

    const remainingMs = (): number => deadlineAt - nowMs();

    const markSecretUse = (): void => {
      secretTouched = true;
    };

    const copiesZero = (): boolean => {
      for (const copy of copies) {
        for (const byte of copy) {
          if (byte !== 0) return false;
        }
      }
      return true;
    };
    const finishWipe = (): boolean => {
      try {
        for (const copy of copies) wipeBytes(copy); /* AUTH_VERIFY_GUARD_WIPE */
        options.ports.wipe(copies); /* AUTH_VERIFY_GUARD_WIPE */
        wiped = copiesZero();
        return wiped;
      } catch {
        quarantined = true;
        wiped = false;
        return false;
      }
    };

    const respond = (
      rowId: string,
      stage: AuthVerifyStage,
      code: AuthVerifyCode,
      extra: {
        spawnFailure?: boolean;
        successOutcome?: "matched" | "not-matched";
        receiptKind?: AuthVerifyReceiptKind;
        leave?: boolean;
      } = {},
    ): AuthVerifyResponse => {
      if (code === "cleanup_failed") {
        quarantined = true;
        leaseState = "quarantined";
      }
      const wipeOk = finishWipe();
      if (!wipeOk && code !== "cleanup_failed") {
        rowId = "F-31";
        stage = "cleanup";
        code = "cleanup_failed";
        quarantined = true;
        leaseState = "quarantined";
      }
      const spawnFailure = extra.spawnFailure === true;
      const isSuccess = extra.successOutcome !== undefined && code !== "cleanup_failed";
      const status = isSuccess ? 200 : httpStatusFor(code, spawnFailure);
      const leave = extra.leave === true || extra.successOutcome !== undefined;
      const outcomeField = isSuccess ? extra.successOutcome ?? code : code;
      const receipt: AuthVerifyReceipt = {
        schemaVersion: AUTH_VERIFY_RECEIPT_SCHEMA,
        operationId,
        requestDigest,
        artifactDigest,
        leaseId,
        outcome: outcomeField,
        authorizing: false,
        replayable: false,
        sealDigest: receiptSeal({
          operationId,
          requestDigest,
          artifactDigest,
          leaseId,
          outcome: outcomeField,
        }),
      };
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Galerina-Authorizing": "false",
      };
      if (isSuccess) {
        headers["X-Galerina-Operation-Id"] = operationId; /* AUTH_VERIFY_GUARD_BINDING */
        headers["X-Galerina-Request-Digest"] = requestDigest; /* AUTH_VERIFY_GUARD_BINDING */
        headers["X-Galerina-Artifact-Digest"] = artifactDigest; /* AUTH_VERIFY_GUARD_BINDING */
        headers["X-Galerina-Receipt"] = receipt.sealDigest;
      }
      const successOutcome = extra.successOutcome;
      const body = isSuccess && successOutcome !== undefined
        ? jsonBody({ outcome: successOutcome })
        : jsonBody({ error: code });
      let receiptKind: AuthVerifyReceiptKind = extra.receiptKind
        ?? (isSuccess ? "WAX_SEAL" : "refuse");
      if (quarantined) receiptKind = "refuse+quarantine";
      return Object.freeze({
        status,
        code: isSuccess ? "released" : code,
        stage,
        headers: Object.freeze(headers),
        body,
        leave,
        lease: leaseState,
        receiptKind,
        quarantined,
        wiped,
        secretTouched,
        consumed,
        receipt,
        rowId: isSuccess ? "S-01" : rowId,
      });
    };

    if (request.disconnected === true) {
      return respond("F-27", "ingress", "client_disconnected");
    }
    if (request.method !== AUTH_VERIFY_METHOD || request.path !== AUTH_VERIFY_PATH) {
      return respond("F-01", "ingress", "malformed_input");
    }
    if (typeof request.contentType !== "string" || request.contentType.length === 0) {
      return respond("F-01", "ingress", "malformed_input");
    }
    if (request.channelAllow !== true || typeof request.principal !== "string" || request.principal.length === 0) {
      return respond("F-01", "ingress", "malformed_input");
    }
    if (!(request.body instanceof Uint8Array) || request.body.byteLength === 0) {
      return respond("F-01", "ingress", "malformed_input");
    }
    if (request.body.byteLength > maxBodyBytes) {
      return respond("F-02", "ingress", "payload_too_large");
    }

    const bodyCopy = new Uint8Array(request.body);
    copies.push(bodyCopy);
    requestDigest = sha256Hex(bodyCopy);

    operationId = mintOperationId();
    if (typeof operationId !== "string" || operationId.length === 0) {
      return respond("F-03", "mint", "operation_id_missing");
    }

    const loadRemain = remainingMs();
    const loadRace = await raceRemainder(options.ports.loadArtifact({ remainingMs: loadRemain }), loadRemain);
    if (loadRace === TIMEOUT_TOKEN) {
      const row = timeoutRow("wamr");
      return respond(row.rowId === "F-30" ? "F-20" : row.rowId, "wamr", "deadline_exceeded");
    }
    if (loadRace.ok !== true) {
      const loadCode = loadRace.code;
      const loadRow = loadCode === "ARTIFACT_DIGEST_MISSING" ? "F-05"
        : loadCode === "ARTIFACT_MISMATCH" ? "F-06"
        : loadCode === "AOT_REFUSED" ? "F-07"
        : loadCode === "BYTECODE_REQUIRED" ? "F-08"
        : "F-30";
      const mapped: AuthVerifyCode = loadCode === "ARTIFACT_DIGEST_MISSING"
        || loadCode === "ARTIFACT_MISMATCH"
        || loadCode === "AOT_REFUSED"
        || loadCode === "BYTECODE_REQUIRED"
        ? loadCode
        : "unknown_outcome";
      return respond(loadRow, "wamr", mapped);
    }
    copies.push(loadRace.snapshot);
    artifactDigest = loadRace.artifactDigest;
    if (typeof artifactDigest !== "string" || !isHex64(artifactDigest) || /^0+$/.test(artifactDigest)) {
      return respond("F-05", "wamr", "ARTIFACT_DIGEST_MISSING");
    }

    const pin = options.verifierPinSha256;
    const custodyRemain = remainingMs();
    const custodyRace = await raceRemainder(
      options.ports.verifierCustody({
        pinSha256: pin,
        remainingMs: custodyRemain,
        snapshot: loadRace.snapshot,
      }),
      custodyRemain,
    );
    if (custodyRace === TIMEOUT_TOKEN) {
      return respond("F-20", "verifier", "deadline_exceeded");
    }
    if (custodyRace.ok !== true) {
      if (custodyRace.reason === "missing") {
        return respond("F-13", "verifier", "ARTIFACT_DIGEST_MISSING");
      }
      if (custodyRace.reason === "pin") {
        return respond("F-14", "verifier", "VERDICT_REFUSED"); /* AUTH_VERIFY_GUARD_VERIFIER_PIN */
      }
      if (custodyRace.reason === "spawn") {
        return respond("F-15", "verifier", "VERDICT_REFUSED", { spawnFailure: true });
      }
      if (custodyRace.reason === "malformed") {
        return respond("F-16", "verifier", "VERDICT_REFUSED");
      }
      if (custodyRace.reason === "nonzero") {
        return respond("F-17", "verifier", "VERDICT_REFUSED");
      }
      return respond("F-30", "verifier", "unknown_outcome");
    }

    const slideRecord = options.namedSlideRecord;
    const productionSlideUnknown = options.mode === "production"
      || slideRecord !== AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD;
    if (options.mode === "test" && slideRecord !== AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD) {
      return respond("F-09", "slide", "slide_admission_refused");
    }
    if (productionSlideUnknown && options.mode === "production") {
      return respond("F-09", "slide", "slide_admission_refused");
    }
    const slideRemain = remainingMs();
    const slideRace = await raceRemainder(
      options.ports.admitSlide({
        recordId: slideRecord,
        artifactDigest,
        remainingMs: slideRemain,
      }),
      slideRemain,
    );
    if (slideRace === TIMEOUT_TOKEN) {
      return respond("F-21", "slide", "deadline_exceeded");
    }
    if (slideRace.ok !== true) {
      return respond("F-09", "slide", "slide_admission_refused");
    }

    if (options.namedTcbProfile !== AUTH_VERIFY_SYNTHETIC_TCB_PROFILE) {
      return respond("F-30", "guest", "tcb_profile_refused");
    }

    const vokRemain = remainingMs();
    const vokRace = await raceRemainder(
      options.ports.authorizeVok({ artifactDigest, remainingMs: vokRemain }),
      vokRemain,
    );
    if (vokRace === TIMEOUT_TOKEN) {
      return respond("F-22", "vok", "deadline_exceeded");
    }
    if (vokRace.ok !== true) {
      if (vokRace.code === "ARTIFACT_MISMATCH") {
        return respond("F-06", "vok", "ARTIFACT_MISMATCH");
      }
      return respond("F-10", "vok", "authority_missing");
    }

    const prior = authority.status(operationId);
    if (
      prior.state === "released"
      || prior.state === "acknowledged"
      || prior.state === "retired"
      || prior.state === "delivery-unknown"
    ) {
      leaseState = prior.state === "retired" ? "retired" : "released";
      return respond("F-04", "mint", "operation_replay");
    }
    try {
      const minted = authority.mint(operationId, vokRace.epoch);
      leaseId = minted.leaseId;
      leaseToken = minted.token;
      leaseEpoch = minted.epoch;
      leaseState = "unused";
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("already in flight") || msg.includes("retired")) {
        return respond("F-04", "mint", "operation_replay");
      }
      if (msg.includes("required")) {
        return respond("F-03", "mint", "operation_id_missing");
      }
      return respond("F-11", "vok", "authority_stale");
    }

    const providerRemain = remainingMs();
    if (providerRemain <= 0) {
      authority.fence(leaseId);
      leaseState = "fenced";
      return respond("F-23", "provider", "deadline_exceeded");
    }
    const admit = admitAtRouteBoundary(secretGate.admit(requiredSecrets));
    switch (admit.kind) {
      case "admitted":
        break;
      case "refused": {
        authority.fence(leaseId);
        leaseState = "fenced";
        return respond("F-18", "provider", "secret_unavailable");
      }
      default: {
        const _closed: never = admit;
        void _closed;
        authority.fence(leaseId);
        leaseState = "fenced";
        return respond("F-18", "provider", "secret_unavailable");
      }
    }

    if (options.revokeBeforeRelease === true) {
      authority.fence(leaseId);
      leaseState = "fenced";
      return respond("F-12", "sink", "authority_revoked");
    }

    const guestRemain = remainingMs();
    const guestRace = await raceRemainder(
      options.ports.runGuest({
        body: bodyCopy,
        remainingMs: guestRemain,
        getSecret: (name, fn) => {
          markSecretUse();
          let declared = false;
          for (let i = 0; i < requiredSecrets.length; i += 1) {
            if (requiredSecrets[i] === name) declared = true;
          }
          if (!declared) return;
          options.secrets.use(name, fn);
        },
      }),
      guestRemain,
    );
    if (guestRace === TIMEOUT_TOKEN) {
      authority.fence(leaseId);
      leaseState = "fenced";
      return respond("F-24", "guest", "deadline_exceeded");
    }
    if (guestRace.ok !== true) {
      if (guestRace.code === "guest_trap") {
        authority.fence(leaseId);
        leaseState = "fenced";
        return respond("F-19", "guest", "guest_trap");
      }
      authority.fence(leaseId);
      leaseState = "fenced";
      return respond("F-30", "guest", "unknown_outcome");
    }
    if (guestRace.matched !== true && guestRace.matched !== false) {
      authority.fence(leaseId);
      leaseState = "fenced";
      return respond("F-30", "guest", "unknown_outcome");
    }
    const disclosed: "matched" | "not-matched" = guestRace.matched === true ? "matched" : "not-matched";

    const sinkRemain = remainingMs();
    if (sinkRemain <= 0) {
      authority.fence(leaseId);
      leaseState = "fenced";
      return respond("F-25", "sink", "deadline_exceeded");
    }

    const d = authority.consume(leaseId, leaseToken, leaseEpoch); /* AUTH_VERIFY_GUARD_CONSUME_ORDER */
    if (d === "replay") {
      leaseState = authority.stateOf(leaseId) === "missing" ? "missing" : "released";
      return respond("F-04", "sink", "operation_replay");
    }
    if (d === "fenced") {
      leaseState = "fenced";
      return respond("F-12", "sink", "authority_revoked");
    }
    if (d === "stale") {
      leaseState = "fenced";
      return respond("F-11", "sink", "authority_stale");
    }
    if (d === "missing") {
      leaseState = "missing";
      return respond("F-10", "sink", "authority_missing");
    }
    if (d !== "released") {
      leaseState = "fenced";
      return respond("F-30", "sink", "unknown_outcome");
    }
    consumed = true;
    leaseState = "released";

    const sinkWait = remainingMs();
    const sinkRace = await raceRemainder(
      options.ports.deliverSink({ outcome: disclosed, remainingMs: sinkWait }),
      sinkWait,
    );
    if (sinkRace === TIMEOUT_TOKEN) {
      authority.markUnknown(leaseId);
      leaseState = "delivery-unknown";
      return respond("F-28", "sink", "delivery_unknown", { receiptKind: "delivery-unknown", leave: true });
    }
    if (sinkRace.ok !== true) {
      authority.markUnknown(leaseId);
      leaseState = "delivery-unknown";
      if (sinkRace.code === "partial_delivery") {
        return respond("F-29", "sink", "partial_delivery", { receiptKind: "status-only", leave: true });
      }
      return respond("F-28", "sink", "delivery_unknown", { receiptKind: "status-only", leave: true });
    }

    const ackRemain = remainingMs();
    const ackRace = await raceRemainder(
      options.ports.acknowledge({ operationId, remainingMs: ackRemain }),
      ackRemain,
    );
    if (ackRace === TIMEOUT_TOKEN) {
      authority.markUnknown(leaseId);
      leaseState = "delivery-unknown";
      return respond("F-26", "ack", "deadline_exceeded", { receiptKind: "status-only", leave: true });
    }
    if (ackRace.ok !== true) {
      authority.markUnknown(leaseId);
      leaseState = "delivery-unknown";
      return respond("F-28", "ack", "delivery_unknown", { receiptKind: "status-only", leave: true });
    }
    const ackOutcome = secretGate.acknowledge(operationId);
    if (ackOutcome === "acknowledged" || ackOutcome === "released") {
      leaseState = "released";
    }

    return respond("S-01", "sink", "released", { successOutcome: disclosed, leave: true, receiptKind: "WAX_SEAL" });
  }

  return Object.freeze({
    maxBodyBytes,
    timeoutMs: options.timeoutMs,
    handle,
  });
}
