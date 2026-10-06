// alternative-proposal.ts — RD-0855 admission-time attempt and alternative proposals.
//
// PROPOSAL ONLY. Tri-Pipe proposes, routes and composes; it never admits, authorises,
// dispatches or retries. SLIDE admits, VOK authorises, Tower is evidence. Every proposal
// returned here needs its own fresh SLIDE admission, a fresh VOK decision and one-use
// lease, and a linked terminal receipt before anything may run.
//
// Owner order (2026-10-06): (1) the requested trit-width profile; (2) only if that width
// cannot run, standard Galerina Trit (K3) logic; (3) only if Trit cannot be processed at
// all, binary implementing the same task semantics, with K3 still deciding permission.
// A failed attempt keeps its typed refusal. DENY, revocation, invalid evidence, unknown
// outcome, partial effect and cleanup failure never produce an alternative.
//
// Design calls (Grok 2026-10-06, on Phillip's 21:03 BST instruction; owner may revisit):
//  - Task policy is a closed, digest-bound input. Tri-Pipe is not the issuer and does not
//    verify the issuer; it recomputes the policy digest and refuses unless it equals the
//    digest the parent attempt was admitted under (no substitution).
//  - Tri-Pipe is not the coordinator. It exposes two pure steps (initial, alternative);
//    nothing here loops, sleeps, schedules or calls SLIDE/VOK/Tower.
//  - Attempt budget: policy.maxAttempts, an integer 1..3 (3 = one attempt per tier), with
//    no default. The chain follows the fixed tier order, never revisits a candidate and
//    never skips a tier.
//  - A permitted reason counts only when a host-injected verifier (Tower evidence) returns
//    exactly true for the bound reason record. No verifier, a throw or any other value
//    refuses. Tri-Pipe never trusts its own or the caller's unavailability claim.
//  - Requested width 1 is the standard K3 scalar: the first attempt is tier 2, so the next
//    and last alternative is tier 3. Wider widths need workloadClass SCIENCE (owner input:
//    non-science work uses binary, a single K3 trit and 8-bit at the API edge).

import { createHash } from "node:crypto";
import {
  ADMITTED_REPRESENTATION_PROFILES, COMPUTE_TRANSFER_SCHEMA,
  type ComputeTransferV1, type RepresentationProfile,
} from "./tri-pipe.js";

export const TASK_POLICY_SCHEMA = "galerina.tri-pipe.task-policy.v1" as const;
export const INITIAL_ATTEMPT_REQUEST_SCHEMA = "galerina.tri-pipe.initial-attempt-request.v1" as const;
export const ALTERNATIVE_REQUEST_SCHEMA = "galerina.tri-pipe.alternative-request.v1" as const;
export const ATTEMPT_PROPOSAL_SCHEMA = "galerina.tri-pipe.attempt-proposal.v1" as const;

/** One attempt per tier at most. */
export const MAX_ATTEMPTS_HARD_CAP = 3;

export type FallbackStep = 1 | 2 | 3;
export type LogicCarrier = "TRIT_WIDTH" | "K3_SCALAR" | "BINARY_K3_CARRIER";
export type PermittedReason = "CANDIDATE_LOCAL_UNAVAILABLE" | "CANDIDATE_LOCAL_INCOMPATIBLE";
export type WorkloadClass = "GENERAL" | "SCIENCE";
export type ParentOutcome =
  | "REFUSED_BEFORE_EFFECT"
  | "DENY"
  | "REVOKED"
  | "INVALID_EVIDENCE"
  | "UNKNOWN_OUTCOME"
  | "PARTIAL_EFFECT"
  | "CLEANUP_FAILURE";

export const PERMITTED_REASONS: readonly PermittedReason[] = Object.freeze([
  "CANDIDATE_LOCAL_UNAVAILABLE", "CANDIDATE_LOCAL_INCOMPATIBLE",
] as const);

const PARENT_OUTCOMES: readonly ParentOutcome[] = Object.freeze([
  "REFUSED_BEFORE_EFFECT", "DENY", "REVOKED", "INVALID_EVIDENCE",
  "UNKNOWN_OUTCOME", "PARTIAL_EFFECT", "CLEANUP_FAILURE",
] as const);

export interface TaskPolicyV1 {
  readonly schema: typeof TASK_POLICY_SCHEMA;
  readonly taskId: string;
  /** Issuer identity, bound into the digest. Verified downstream by SLIDE admission, not here. */
  readonly issuerId: string;
  readonly requestedRepresentationProfile: number;
  readonly workloadClass: WorkloadClass;
  readonly permittedReasons: readonly PermittedReason[];
  readonly maxAttempts: number;
}

export interface CandidateIdentityV1 {
  readonly step: FallbackStep;
  readonly carrier: LogicCarrier;
  readonly representationProfile: RepresentationProfile;
}

export interface ParentAttemptV1 {
  /** 0-based index of the refused attempt. */
  readonly attemptIndex: number;
  readonly planIdentity: string;
  readonly candidate: CandidateIdentityV1;
  /** The task-policy digest the parent attempt was admitted under. */
  readonly taskPolicyDigest: string;
  readonly checkedSnapshotDigest: string;
  readonly outcome: ParentOutcome;
  /** Original typed refusal code; kept verbatim, never rewritten. */
  readonly refusalCode: string;
  readonly refusalDigest: string;
  readonly noPriorEffect: boolean;
}

export interface ReasonEvidenceV1 {
  readonly reason: PermittedReason;
  readonly evidenceDigest: string;
  readonly attestedBy: string;
}

export interface InitialAttemptRequestV1 {
  readonly schema: typeof INITIAL_ATTEMPT_REQUEST_SCHEMA;
  readonly taskId: string;
  readonly checkedSnapshotDigest: string;
  readonly taskPolicy: TaskPolicyV1;
}

export interface AlternativeRequestV1 {
  readonly schema: typeof ALTERNATIVE_REQUEST_SCHEMA;
  readonly taskId: string;
  readonly checkedSnapshotDigest: string;
  readonly taskPolicy: TaskPolicyV1;
  readonly parent: ParentAttemptV1;
  /** Every prior attempt's candidate in order; the last entry is the parent's candidate. */
  readonly history: readonly CandidateIdentityV1[];
  readonly reasonEvidence: ReasonEvidenceV1;
}

/** The record a host verifier (Tower evidence) is asked to authenticate. */
export interface ReasonBindingV1 {
  readonly taskId: string;
  readonly checkedSnapshotDigest: string;
  readonly taskPolicyDigest: string;
  readonly parentPlanIdentity: string;
  readonly parentCandidate: CandidateIdentityV1;
  readonly parentRefusalDigest: string;
  readonly reason: PermittedReason;
  readonly evidenceDigest: string;
  readonly attestedBy: string;
}

export type ReasonVerifier = (binding: ReasonBindingV1) => unknown;

export interface AlternativeDeps {
  /** Must return exactly `true`. Absent, throwing or any other value refuses. */
  readonly verifyReasonEvidence?: ReasonVerifier;
}

export interface BinaryCarrierConstraintsV1 {
  readonly minBitsPerTrit: 2;
  readonly illegalCodePolicy: "REFUSE";
  readonly unknownCollapse: "FINAL_PERMISSION_BOUNDARY_ONLY";
}

export interface ProposedCandidateV1 extends CandidateIdentityV1 {
  readonly semantics: "K3";
  readonly permissionDecidedBy: "K3";
  readonly binaryCarrier: BinaryCarrierConstraintsV1 | null;
}

export interface ParentLinkV1 {
  readonly planIdentity: string;
  readonly attemptIndex: number;
  readonly refusalCode: string;
  readonly refusalDigest: string;
  readonly reason: PermittedReason;
  readonly reasonEvidenceDigest: string;
}

export interface AttemptProposalV1 {
  readonly kind: "ATTEMPT_PROPOSAL";
  readonly schema: typeof ATTEMPT_PROPOSAL_SCHEMA;
  readonly taskId: string;
  readonly attemptIndex: number;
  readonly checkedSnapshotDigest: string;
  readonly taskPolicyDigest: string;
  readonly candidate: ProposedCandidateV1;
  /** null on the initial attempt; on an alternative, the refused parent (its refusal kept). */
  readonly parent: ParentLinkV1 | null;
  readonly planIdentity: string;
  readonly requires: {
    readonly freshSlideAdmission: true;
    readonly freshVokDecision: true;
    readonly freshVokLease: true;
    readonly linkedTerminalReceipt: true;
  };
  readonly transfer: ComputeTransferV1;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
  readonly dataBrand: "Trit";
  readonly governanceBrand: "Verdict";
}

export type AttemptRefusalCode =
  | "TP_ALT_AUTHORITY_FIELD_PRESENT"
  | "TP_ALT_INPUT_MALFORMED"
  | "TP_ALT_POLICY_INVALID"
  | "TP_ALT_WIDTH_NOT_OPTED_IN"
  | "TP_ALT_TASK_POLICY_SUBSTITUTED"
  | "TP_ALT_SNAPSHOT_MISMATCH"
  | "TP_ALT_PRIOR_OUTCOME_TERMINAL"
  | "TP_ALT_PRIOR_EFFECT_NOT_EXCLUDED"
  | "TP_ALT_CHAIN_INCONSISTENT"
  | "TP_ALT_CHAIN_CYCLE"
  | "TP_ALT_ATTEMPT_BUDGET_EXHAUSTED"
  | "TP_ALT_NO_FURTHER_TIER"
  | "TP_ALT_REASON_NOT_PERMITTED"
  | "TP_ALT_REASON_UNAUTHENTICATED";

export interface AttemptRefusalV1 {
  readonly kind: "REFUSED";
  readonly code: AttemptRefusalCode;
  /** The parent's original typed refusal, kept as is (null when unknown or initial). */
  readonly parentRefusalCode: string | null;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type AttemptResult = AttemptProposalV1 | AttemptRefusalV1;

// ---------------------------------------------------------------- helpers

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/u;
const CODE_RE = /^[A-Z0-9_.:-]{1,128}$/u;

/** Keys that would carry authority into a proposal-only seam. Refused at any depth. */
const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
]);

class Refuse extends Error {
  constructor(readonly code: AttemptRefusalCode) { super(code); }
}

function refusal(code: AttemptRefusalCode, parentRefusalCode: string | null): AttemptRefusalV1 {
  return Object.freeze({ kind: "REFUSED", code, parentRefusalCode, authorityReleased: false, admissionAuthority: false });
}

function isPlainDataObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Refuses authority-bearing keys anywhere, before any other reading. Accessors are never invoked. */
function scanForAuthority(v: unknown, depth: number): void {
  if (depth > 8) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  if (v === null || typeof v !== "object") return;
  for (const key of Reflect.ownKeys(v)) {
    if (typeof key !== "string") throw new Refuse("TP_ALT_INPUT_MALFORMED");
    if (AUTHORITY_KEYS.has(key)) throw new Refuse("TP_ALT_AUTHORITY_FIELD_PRESENT");
    const d = Object.getOwnPropertyDescriptor(v, key);
    if (d === undefined || !("value" in d)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
    scanForAuthority(d.value, depth + 1);
  }
}

function exactRecord(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainDataObject(v)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  const own = Reflect.ownKeys(v);
  if (own.length !== keys.length) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  for (const k of keys) if (!Object.hasOwn(v, k)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  return v;
}

function str(v: unknown, re: RegExp): string {
  if (typeof v !== "string" || !re.test(v)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  return v as T;
}

function int(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  return v;
}

function sha256(domain: string, payload: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify({ domain, payload })).digest("hex")}`;
}

function isAdmittedProfile(value: number): value is RepresentationProfile {
  return (ADMITTED_REPRESENTATION_PROFILES as readonly number[]).includes(value);
}

function readPolicy(v: unknown): TaskPolicyV1 {
  const r = exactRecord(v, ["schema", "taskId", "issuerId", "requestedRepresentationProfile", "workloadClass", "permittedReasons", "maxAttempts"]);
  if (r.schema !== TASK_POLICY_SCHEMA) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  const taskId = str(r.taskId, ID_RE);
  const issuerId = str(r.issuerId, ID_RE);
  const requested = int(r.requestedRepresentationProfile);
  const workloadClass = oneOf(r.workloadClass, ["GENERAL", "SCIENCE"] as const);
  const maxAttempts = int(r.maxAttempts);
  if (!Array.isArray(r.permittedReasons) || r.permittedReasons.length > PERMITTED_REASONS.length) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  const reasons = r.permittedReasons.map((x: unknown) => oneOf(x, PERMITTED_REASONS));
  if (new Set(reasons).size !== reasons.length) throw new Refuse("TP_ALT_POLICY_INVALID");
  if (!isAdmittedProfile(requested)) throw new Refuse("TP_ALT_POLICY_INVALID");
  if (maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS_HARD_CAP) throw new Refuse("TP_ALT_POLICY_INVALID");
  if (workloadClass === "GENERAL" && requested !== 1) throw new Refuse("TP_ALT_WIDTH_NOT_OPTED_IN");
  return {
    schema: TASK_POLICY_SCHEMA, taskId, issuerId,
    requestedRepresentationProfile: requested, workloadClass,
    permittedReasons: [...reasons].sort(), maxAttempts,
  };
}

function readCandidate(v: unknown): CandidateIdentityV1 {
  const r = exactRecord(v, ["step", "carrier", "representationProfile"]);
  const step = int(r.step);
  if (step !== 1 && step !== 2 && step !== 3) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  const carrier = oneOf(r.carrier, ["TRIT_WIDTH", "K3_SCALAR", "BINARY_K3_CARRIER"] as const);
  const profile = int(r.representationProfile);
  if (!isAdmittedProfile(profile)) throw new Refuse("TP_ALT_INPUT_MALFORMED");
  return { step, carrier, representationProfile: profile };
}

function sameCandidate(a: CandidateIdentityV1, b: CandidateIdentityV1): boolean {
  return a.step === b.step && a.carrier === b.carrier && a.representationProfile === b.representationProfile;
}

/** Digest of the canonical task policy (reasons sorted). Throws on an invalid policy. */
export function computeTaskPolicyDigest(policy: TaskPolicyV1): string {
  let p: TaskPolicyV1;
  try { p = readPolicy(policy); } catch (e) {
    throw new TypeError(e instanceof Refuse ? e.code : "TP_ALT_INPUT_MALFORMED");
  }
  return sha256(TASK_POLICY_SCHEMA, [
    p.taskId, p.issuerId, p.requestedRepresentationProfile, p.workloadClass, p.permittedReasons, p.maxAttempts,
  ]);
}

/** Tier 1 at the requested width, or tier 2 directly when the request is the standard K3 scalar. */
export function initialCandidate(requested: RepresentationProfile): CandidateIdentityV1 {
  return requested === 1
    ? { step: 2, carrier: "K3_SCALAR", representationProfile: 1 }
    : { step: 1, carrier: "TRIT_WIDTH", representationProfile: requested };
}

/** The single next tier in the owner's order, or null after tier 3. Never skips a tier. */
export function nextCandidate(c: CandidateIdentityV1): CandidateIdentityV1 | null {
  if (c.step === 1) return { step: 2, carrier: "K3_SCALAR", representationProfile: 1 };
  if (c.step === 2) return { step: 3, carrier: "BINARY_K3_CARRIER", representationProfile: 1 };
  return null;
}

function wellFormedCandidate(c: CandidateIdentityV1): boolean {
  if (c.step === 1) return c.carrier === "TRIT_WIDTH" && c.representationProfile !== 1;
  if (c.step === 2) return c.carrier === "K3_SCALAR" && c.representationProfile === 1;
  return c.carrier === "BINARY_K3_CARRIER" && c.representationProfile === 1;
}

function propose(
  taskId: string, snapshot: string, policyDigest: string, attemptIndex: number,
  c: CandidateIdentityV1, parent: ParentLinkV1 | null,
): AttemptProposalV1 {
  const binaryCarrier: BinaryCarrierConstraintsV1 | null = c.step === 3
    ? Object.freeze({ minBitsPerTrit: 2, illegalCodePolicy: "REFUSE", unknownCollapse: "FINAL_PERMISSION_BOUNDARY_ONLY" })
    : null;
  const candidate: ProposedCandidateV1 = Object.freeze({
    step: c.step, carrier: c.carrier, representationProfile: c.representationProfile,
    semantics: "K3", permissionDecidedBy: "K3", binaryCarrier,
  });
  const planIdentity = sha256("galerina.tri-pipe.attempt-plan.v1", {
    taskId, checkedSnapshotDigest: snapshot, taskPolicyDigest: policyDigest, attemptIndex, candidate, parent,
  });
  return Object.freeze({
    kind: "ATTEMPT_PROPOSAL",
    schema: ATTEMPT_PROPOSAL_SCHEMA,
    taskId,
    attemptIndex,
    checkedSnapshotDigest: snapshot,
    taskPolicyDigest: policyDigest,
    candidate,
    parent: parent === null ? null : Object.freeze({ ...parent }),
    planIdentity,
    requires: Object.freeze({ freshSlideAdmission: true, freshVokDecision: true, freshVokLease: true, linkedTerminalReceipt: true }),
    transfer: Object.freeze({ schema: COMPUTE_TRANSFER_SCHEMA, owner: "galerina.tri-pipe", kind: "route-proposal", digest: planIdentity }),
    authorityReleased: false,
    admissionAuthority: false,
    dataBrand: "Trit",
    governanceBrand: "Verdict",
  });
}

// ---------------------------------------------------------------- public steps

/**
 * Propose the first attempt of a task under its admitted task policy. Proposal only:
 * SLIDE admission and a VOK decision/lease are still required.
 */
export function proposeInitialAttempt(input: InitialAttemptRequestV1): AttemptResult {
  try {
    scanForAuthority(input, 0);
    const r = exactRecord(input, ["schema", "taskId", "checkedSnapshotDigest", "taskPolicy"]);
    if (r.schema !== INITIAL_ATTEMPT_REQUEST_SCHEMA) throw new Refuse("TP_ALT_INPUT_MALFORMED");
    const taskId = str(r.taskId, ID_RE);
    const snapshot = str(r.checkedSnapshotDigest, DIGEST_RE);
    const policy = readPolicy(r.taskPolicy);
    if (policy.taskId !== taskId) throw new Refuse("TP_ALT_TASK_POLICY_SUBSTITUTED");
    const c = initialCandidate(policy.requestedRepresentationProfile as RepresentationProfile);
    return propose(taskId, snapshot, computeTaskPolicyDigest(policy), 0, c, null);
  } catch (e) {
    if (e instanceof Refuse) return refusal(e.code, null);
    return refusal("TP_ALT_INPUT_MALFORMED", null);
  }
}

/**
 * Propose the single next-tier alternative after a refused attempt, or refuse.
 * The parent's typed refusal is kept and linked, never replaced. Proposal only.
 */
export function proposeAlternative(input: AlternativeRequestV1, deps: AlternativeDeps = {}): AttemptResult {
  let parentRefusalCode: string | null = null;
  try {
    scanForAuthority(input, 0);
    const r = exactRecord(input, ["schema", "taskId", "checkedSnapshotDigest", "taskPolicy", "parent", "history", "reasonEvidence"]);
    if (r.schema !== ALTERNATIVE_REQUEST_SCHEMA) throw new Refuse("TP_ALT_INPUT_MALFORMED");
    const taskId = str(r.taskId, ID_RE);
    const snapshot = str(r.checkedSnapshotDigest, DIGEST_RE);

    const p = exactRecord(r.parent, [
      "attemptIndex", "planIdentity", "candidate", "taskPolicyDigest", "checkedSnapshotDigest",
      "outcome", "refusalCode", "refusalDigest", "noPriorEffect",
    ]);
    parentRefusalCode = str(p.refusalCode, CODE_RE);
    const parentIndex = int(p.attemptIndex);
    if (parentIndex < 0 || parentIndex >= MAX_ATTEMPTS_HARD_CAP) throw new Refuse("TP_ALT_INPUT_MALFORMED");
    const parentPlan = str(p.planIdentity, DIGEST_RE);
    const parentCandidate = readCandidate(p.candidate);
    const parentPolicyDigest = str(p.taskPolicyDigest, DIGEST_RE);
    const parentSnapshot = str(p.checkedSnapshotDigest, DIGEST_RE);
    const outcome = oneOf(p.outcome, PARENT_OUTCOMES);
    const parentRefusalDigest = str(p.refusalDigest, DIGEST_RE);
    if (typeof p.noPriorEffect !== "boolean") throw new Refuse("TP_ALT_INPUT_MALFORMED");

    if (!Array.isArray(r.history) || r.history.length < 1 || r.history.length > MAX_ATTEMPTS_HARD_CAP) throw new Refuse("TP_ALT_INPUT_MALFORMED");
    const history = r.history.map((h: unknown) => readCandidate(h));

    const ev = exactRecord(r.reasonEvidence, ["reason", "evidenceDigest", "attestedBy"]);
    const reason = oneOf(ev.reason, PERMITTED_REASONS);
    const evidenceDigest = str(ev.evidenceDigest, DIGEST_RE);
    const attestedBy = str(ev.attestedBy, ID_RE);

    // Policy: closed, digest-bound, never substituted.
    const policy = readPolicy(r.taskPolicy);
    if (policy.taskId !== taskId) throw new Refuse("TP_ALT_TASK_POLICY_SUBSTITUTED");
    const policyDigest = computeTaskPolicyDigest(policy);
    if (policyDigest !== parentPolicyDigest) throw new Refuse("TP_ALT_TASK_POLICY_SUBSTITUTED");
    if (parentSnapshot !== snapshot) throw new Refuse("TP_ALT_SNAPSHOT_MISMATCH");

    // A refusal is never retry permission unless it is candidate-local and before any effect.
    if (outcome !== "REFUSED_BEFORE_EFFECT") throw new Refuse("TP_ALT_PRIOR_OUTCOME_TERMINAL");
    if (p.noPriorEffect !== true) throw new Refuse("TP_ALT_PRIOR_EFFECT_NOT_EXCLUDED");

    // Chain: starts at the policy's initial candidate and follows the fixed tier order.
    if (history.length !== parentIndex + 1) throw new Refuse("TP_ALT_CHAIN_INCONSISTENT");
    for (let i = 0; i < history.length; i++) {
      for (let j = i + 1; j < history.length; j++) {
        if (sameCandidate(history[i]!, history[j]!)) throw new Refuse("TP_ALT_CHAIN_CYCLE");
      }
    }
    for (const h of history) if (!wellFormedCandidate(h)) throw new Refuse("TP_ALT_CHAIN_INCONSISTENT");
    const first = initialCandidate(policy.requestedRepresentationProfile as RepresentationProfile);
    if (!sameCandidate(history[0]!, first)) throw new Refuse("TP_ALT_CHAIN_INCONSISTENT");
    for (let i = 1; i < history.length; i++) {
      const expected = nextCandidate(history[i - 1]!);
      if (expected === null || !sameCandidate(history[i]!, expected)) throw new Refuse("TP_ALT_CHAIN_INCONSISTENT");
    }
    if (!sameCandidate(history[history.length - 1]!, parentCandidate)) throw new Refuse("TP_ALT_CHAIN_INCONSISTENT");

    const next = nextCandidate(parentCandidate);
    if (next === null) throw new Refuse("TP_ALT_NO_FURTHER_TIER");
    if (parentIndex + 1 >= policy.maxAttempts) throw new Refuse("TP_ALT_ATTEMPT_BUDGET_EXHAUSTED");

    // Reason: permitted by the admitted policy, and authenticated by injected evidence.
    if (!policy.permittedReasons.includes(reason)) throw new Refuse("TP_ALT_REASON_NOT_PERMITTED");
    const verify = deps.verifyReasonEvidence;
    if (typeof verify !== "function") throw new Refuse("TP_ALT_REASON_UNAUTHENTICATED");
    const binding: ReasonBindingV1 = Object.freeze({
      taskId, checkedSnapshotDigest: snapshot, taskPolicyDigest: policyDigest,
      parentPlanIdentity: parentPlan, parentCandidate: Object.freeze({ ...parentCandidate }),
      parentRefusalDigest, reason, evidenceDigest, attestedBy,
    });
    let verdict: unknown;
    try { verdict = verify(binding); } catch { verdict = false; }
    if (verdict !== true) throw new Refuse("TP_ALT_REASON_UNAUTHENTICATED");

    return propose(taskId, snapshot, policyDigest, parentIndex + 1, next, {
      planIdentity: parentPlan,
      attemptIndex: parentIndex,
      refusalCode: parentRefusalCode,
      refusalDigest: parentRefusalDigest,
      reason,
      reasonEvidenceDigest: evidenceDigest,
    });
  } catch (e) {
    if (e instanceof Refuse) return refusal(e.code, parentRefusalCode);
    return refusal("TP_ALT_INPUT_MALFORMED", parentRefusalCode);
  }
}
