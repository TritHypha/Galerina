/**
 * key-rotation.ts — the triple-lock, fail-closed, append-only key-rotation DECISION core (#28/D2)
 *
 * Implements the owner-ratified design in docs/architecture/audit-key-rotation-
 * triple-lock-design-2026-07-10.md, build-plan steps 1–3. This module DECIDES and
 * VERIFIES; it NEVER touches key material — key bytes live in custody (offline
 * vault today, HSM later) and reach this module only as:
 *   - keyCommit: a hash/MAC COMMITMENT to a key (proves distinctness, reveals nothing)
 *   - DI seams : injected check functions (RotationCtx) computed by the custody
 *     layer that holds the bytes. Every seam is FAIL-CLOSED: absent ⇒ the check
 *     is INDETERMINATE (couldn't run → abstain → deny, audited); throwing ⇒
 *     INDETERMINATE; anything but `true` ⇒ DENY.
 *
 * THE OVERRIDING PRINCIPLE — rotation is APPEND, never REPLACE, and "remove the
 * old key" means remove its SIGNING power, never its VERIFY power. The KeyRing is
 * append-only with a MAC'd head: epochs are never deleted, so every historical
 * batch verifies against its own epoch forever. Orphaning the ledger is
 * structurally unreachable.
 *
 * THE LIFECYCLE (each gate fail-closed; nothing irreversible until retire):
 *   R  READINESS   "good time?" — audit-quiescence · chain-health · queue-depth   NOT READY ⇒ DEFER
 *   0  STAGE       mint ahead (~30 min) into its OWN file; current key stays active
 *   1  TRIPLE LOCK allOf([A new-key soundness, B continuity/dual-sign, C quorum M≥2])
 *   2  SWITCH      atomic; old epoch keeps VERIFYING; only the new epoch signs
 *   3  TRIPLE-VERIFY forward + backward + continuity over a canary window          FAIL ⇒ fallback
 *   4  DRAIN       queue-empty + no-in-flight + quorum witness                     NOT DRAINED ⇒ wait
 *   5  RETIRE      signing power ONLY — symmetric = cold-retain (destroy = DENY);
 *                  asymmetric = destroy-private (default) or revoke-then-archive
 *                  (legal ONLY with revocation recorded first)
 *
 * Atomicity is by IMMUTABILITY: every phase function returns a NEW process on
 * ALLOW and the ORIGINAL process object (same reference — provably untouched) on
 * any non-ALLOW, with the INDETERMINATE case audited via decideAtBoundary
 * (FUNGI-GOV-3VL-001, never silent). The ONE sanctioned reversal is
 * fallbackSwitch (Phase-3 failure re-activates the old epoch and REVOKES the bad
 * candidate — a failed key never gets a second chance); everything else is
 * forward-only.
 *
 * Reuses (does not reinvent): Verdict/allOf/decideAtBoundary (three-valued-
 * governance), quorumVerdict (quorum.ts — M-of-N distinct signers, anti-Sybil),
 * the MAC'd-head append-only pattern (revocation registry / .spore history).
 * Step 4 (epoch-aware AuditEgress/StateSerializer verification) and step 5
 * (custody execution — the ONLY part that ever holds bytes) are built separately;
 * step 5 is owner-gated.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  Verdict, allOf, decideAtBoundary,
  type GovernanceDiagnostic, type BoundaryDecision,
} from "./three-valued-governance.js";
import { quorumVerdict, type SignerVote } from "./quorum.js";

// ── Step 1: the append-only key ring ─────────────────────────────────────────

/** Which cryptosystem an epoch key belongs to — decides what "retire" may ever do. */
export type KeyKind = "symmetric" | "asymmetric";

/**
 * Forward-only status: staged → active → retired → revoked. `retired` = signing
 * power withdrawn, VERIFY capability retained forever. `revoked` = verification
 * REFUSED too (compromised / archived-under-revocation) — still never deleted.
 */
export type KeyEpochStatus = "staged" | "active" | "retired" | "revoked";

export interface KeyEpoch {
  readonly epochId: number;        // monotone from 1, +1 per rotation, never reused
  readonly keyId: string;          // opaque custody id — NOT the key bytes
  readonly keyKind: KeyKind;
  readonly keyCommit: string;      // hex commitment (hash/MAC of the key) — proves distinctness
  readonly fileRef: string;        // WHICH custody file holds the material (old+new in SEPARATE files)
  readonly createdTick: number;
  readonly retiredTick: number | null;
  readonly status: KeyEpochStatus;
}

/** Append-only epoch history with an anti-tamper/anti-rollback MAC'd head. */
export interface KeyRing {
  readonly epochs: readonly KeyEpoch[];
  readonly headMac: string;
}

/** The dual-signed rotation event: the new epoch chains onto the old chain head. */
export interface Transition {
  readonly fromEpoch: number;
  readonly toEpoch: number;
  readonly atTick: number;
  readonly prevChainHead: string;  // the old epoch's last batch hash — no gap, no fork
  readonly macOld: string;         // transition body MAC'd under the OLD key (custody-computed)
  readonly macNew: string;         // …and under the NEW key — a half-signed handover is a DENY
}

/** True when a ring-MAC key is missing, empty, or all zero bytes (the non-secret dev key). */
function isWeakRingKey(key: Uint8Array | undefined): boolean {
  if (!key || key.length === 0) return true;
  for (const b of key) if (b !== 0) return false;
  return true;
}

/** Canonical serialization of the epoch list — the ring-MAC input. */
function canonicalEpochs(epochs: readonly KeyEpoch[]): string {
  return JSON.stringify(epochs.map((e) => [
    e.epochId, e.keyId, e.keyKind, e.keyCommit, e.fileRef, e.createdTick, e.retiredTick, e.status,
  ]));
}

function ringMac(ringMacKey: Uint8Array, epochs: readonly KeyEpoch[]): string {
  const h = createHmac("sha256", ringMacKey);
  h.update("galerina-key-ring-v1\n");
  h.update(canonicalEpochs(epochs));
  return h.digest("hex");
}

function macEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** A commitment must be substantial hex and not the all-zero placeholder. */
function isWellFormedCommit(commit: string): boolean {
  if (typeof commit !== "string" || commit.length < 32) return false;
  if (!/^[0-9a-f]+$/i.test(commit)) return false;
  return /[1-9a-f]/i.test(commit); // not all zeros
}

/**
 * Create a ring with its genesis epoch (epochId 1, active). Hard-errors on a
 * weak ring-MAC key or malformed genesis — a ring that starts broken must not exist.
 */
export function createKeyRing(
  ringMacKey: Uint8Array,
  genesis: { keyId: string; keyKind: KeyKind; keyCommit: string; fileRef: string; createdTick: number },
): KeyRing {
  if (isWeakRingKey(ringMacKey)) {
    throw new Error("createKeyRing: a real (non-zero) ring-MAC key is required — fail-closed");
  }
  if (!isWellFormedCommit(genesis.keyCommit)) {
    throw new Error("createKeyRing: genesis keyCommit is not a well-formed commitment — fail-closed");
  }
  if (genesis.keyId === "" || genesis.fileRef === "") {
    throw new Error("createKeyRing: genesis keyId/fileRef must be non-empty — fail-closed");
  }
  const epochs: KeyEpoch[] = [{
    epochId: 1, keyId: genesis.keyId, keyKind: genesis.keyKind, keyCommit: genesis.keyCommit,
    fileRef: genesis.fileRef, createdTick: genesis.createdTick, retiredTick: null, status: "active",
  }];
  return { epochs, headMac: ringMac(ringMacKey, epochs) };
}

/**
 * Full structural verification of a ring: head MAC intact, epochIds monotone
 * 1..n, exactly one active epoch, no duplicate keyId/keyCommit/fileRef,
 * retired/revoked epochs carry a retiredTick. Any failure ⇒ false (fail-closed).
 */
export function verifyRing(ring: KeyRing, ringMacKey: Uint8Array): boolean {
  if (isWeakRingKey(ringMacKey)) return false;
  if (!ring || !Array.isArray(ring.epochs) || ring.epochs.length === 0) return false;
  if (!macEqual(ring.headMac, ringMac(ringMacKey, ring.epochs))) return false;
  const seenId = new Set<string>(); const seenCommit = new Set<string>(); const seenFile = new Set<string>();
  let active = 0;
  for (let i = 0; i < ring.epochs.length; i++) {
    const e = ring.epochs[i]!;
    if (e.epochId !== i + 1) return false;                       // monotone, gap-free, rollback-proof
    if (!isWellFormedCommit(e.keyCommit)) return false;
    if (e.keyId === "" || e.fileRef === "") return false;
    if (seenId.has(e.keyId) || seenCommit.has(e.keyCommit.toLowerCase()) || seenFile.has(e.fileRef)) return false;
    seenId.add(e.keyId); seenCommit.add(e.keyCommit.toLowerCase()); seenFile.add(e.fileRef);
    if (e.status === "active") active += 1;
    if ((e.status === "retired" || e.status === "revoked") && e.retiredTick === null) return false;
  }
  return active === 1;
}

/** The single active (signing) epoch, or null on a malformed ring. */
export function activeEpoch(ring: KeyRing): KeyEpoch | null {
  const actives = ring.epochs.filter((e) => e.status === "active");
  return actives.length === 1 ? actives[0]! : null;
}

/**
 * Resolve the epoch a batch claims — for VERIFICATION key lookup. Fail-closed:
 * unknown/future epochId ⇒ null; a REVOKED epoch ⇒ null (revocation refuses
 * verification even of cryptographically valid signatures — signature-custody §7).
 * staged/active/retired epochs all verify: verify capability is never removed.
 */
export function epochForVerification(ring: KeyRing, epochId: number): KeyEpoch | null {
  const e = ring.epochs.find((x) => x.epochId === epochId);
  if (!e) return null;
  if (e.status === "revoked") return null;
  return e;
}

/**
 * Append a STAGED candidate epoch (Phase 0). Pure — returns a NEW ring; the old
 * ring object is untouched (append never overwrites; a crash leaves both files
 * and both ring states intact). Hard-errors on any structural violation.
 */
export function stageEpoch(
  ring: KeyRing,
  ringMacKey: Uint8Array,
  candidate: { keyId: string; keyKind: KeyKind; keyCommit: string; fileRef: string; createdTick: number },
): KeyRing {
  if (!verifyRing(ring, ringMacKey)) throw new Error("stageEpoch: ring failed verification — fail-closed");
  if (ring.epochs.some((e) => e.status === "staged")) {
    throw new Error("stageEpoch: a staged candidate already exists — one rotation at a time");
  }
  if (!isWellFormedCommit(candidate.keyCommit)) throw new Error("stageEpoch: candidate keyCommit malformed — fail-closed");
  if (candidate.keyId === "" || candidate.fileRef === "") throw new Error("stageEpoch: candidate keyId/fileRef must be non-empty");
  for (const e of ring.epochs) {
    if (e.keyId === candidate.keyId) throw new Error("stageEpoch: keyId reuse — fail-closed (no rollback to an old key)");
    if (e.keyCommit.toLowerCase() === candidate.keyCommit.toLowerCase()) {
      throw new Error("stageEpoch: keyCommit matches a prior epoch — key reuse/rollback denied");
    }
    if (e.fileRef === candidate.fileRef) throw new Error("stageEpoch: fileRef collision — old and new keys must live in SEPARATE files");
  }
  const last = ring.epochs[ring.epochs.length - 1]!;
  const epochs = [...ring.epochs, {
    epochId: last.epochId + 1, keyId: candidate.keyId, keyKind: candidate.keyKind,
    keyCommit: candidate.keyCommit, fileRef: candidate.fileRef, createdTick: candidate.createdTick,
    retiredTick: null, status: "staged" as KeyEpochStatus,
  }];
  return { epochs, headMac: ringMac(ringMacKey, epochs) };
}

/**
 * The Phase-2 SWITCH, atomically: staged → active, old active → retired
 * (signing power withdrawn; verify capability RETAINED — the epoch stays in the
 * ring forever). Pure; hard-errors if the ring is not in the switchable shape.
 */
export function switchActive(ring: KeyRing, ringMacKey: Uint8Array, atTick: number): KeyRing {
  if (!verifyRing(ring, ringMacKey)) throw new Error("switchActive: ring failed verification — fail-closed");
  const staged = ring.epochs.filter((e) => e.status === "staged");
  const act = activeEpoch(ring);
  if (staged.length !== 1 || !act) throw new Error("switchActive: need exactly one staged candidate and one active epoch");
  const epochs = ring.epochs.map((e): KeyEpoch => {
    if (e.status === "active") return { ...e, status: "retired", retiredTick: atTick };
    if (e.status === "staged") return { ...e, status: "active" };
    return e;
  });
  return { epochs, headMac: ringMac(ringMacKey, epochs) };
}

/**
 * THE ONE SANCTIONED REVERSAL — Phase-3 verify failed: re-activate the previous
 * epoch (it was never destroyed; reversal is free) and REVOKE the bad candidate.
 * A key that failed live verification never gets a second chance — a fresh mint
 * (new epoch) is required. Everything before retire stays reversible; this is how.
 */
export function fallbackSwitch(ring: KeyRing, ringMacKey: Uint8Array, atTick: number): KeyRing {
  if (!verifyRing(ring, ringMacKey)) throw new Error("fallbackSwitch: ring failed verification — fail-closed");
  const act = activeEpoch(ring);
  if (!act) throw new Error("fallbackSwitch: no active epoch");
  const prev = ring.epochs.find((e) => e.epochId === act.epochId - 1 && e.status === "retired");
  if (!prev) throw new Error("fallbackSwitch: no retired predecessor to fall back to");
  const epochs = ring.epochs.map((e): KeyEpoch => {
    if (e.epochId === act.epochId) return { ...e, status: "revoked", retiredTick: atTick };
    if (e.epochId === prev.epochId) return { ...e, status: "active", retiredTick: null };
    return e;
  });
  return { epochs, headMac: ringMac(ringMacKey, epochs) };
}

/** Mark a RETIRED epoch revoked (the revoke-then-archive retire policy). Forward-only. */
export function markRevoked(ring: KeyRing, ringMacKey: Uint8Array, epochId: number, atTick: number): KeyRing {
  if (!verifyRing(ring, ringMacKey)) throw new Error("markRevoked: ring failed verification — fail-closed");
  const e = ring.epochs.find((x) => x.epochId === epochId);
  if (!e) throw new Error("markRevoked: unknown epoch — fail-closed");
  if (e.status !== "retired") throw new Error("markRevoked: only a retired epoch can be revoked (forward-only)");
  const epochs = ring.epochs.map((x): KeyEpoch =>
    x.epochId === epochId ? { ...x, status: "revoked", retiredTick: x.retiredTick ?? atTick } : x,
  );
  return { epochs, headMac: ringMac(ringMacKey, epochs) };
}

// ── Step 2: the gate verdict functions (pure; DI seams; fail-closed) ─────────

/**
 * DI seams computed by the custody layer (which holds key bytes). Fail-closed
 * semantics per seam: absent ⇒ INDETERMINATE (couldn't check — abstain);
 * throws ⇒ INDETERMINATE; returns anything but `true` ⇒ DENY.
 */
export interface RotationCtx {
  /** Lock A3 — the candidate key MACs a challenge and verifies it (the key actually works). */
  readonly verifyCandidateRoundTrip?: () => boolean;
  /** Lock B1 / Readiness R2 — the CURRENT chain verifies end-to-end under the CURRENT key. */
  readonly verifyCurrentChain?: () => boolean;
  /** Lock B3 — Transition body MAC verifies under the OLD key. */
  readonly verifyTransitionMacOld?: () => boolean;
  /** Lock B3 — Transition body MAC verifies under the NEW key. */
  readonly verifyTransitionMacNew?: () => boolean;
  /** Verify V1 — a live batch signed by the new epoch verifies. */
  readonly verifyForwardProbe?: () => boolean;
  /** Verify V2 — a SAMPLE of pre-rotation batches still verifies under the retained old epoch. */
  readonly verifyBackwardSample?: () => boolean;
}

/** Collapse one DI seam to a Verdict under the fail-closed seam semantics. */
function seamVerdict(fn: (() => boolean) | undefined): Verdict {
  if (fn === undefined) return Verdict.INDETERMINATE;      // couldn't check → abstain
  try {
    return fn() === true ? Verdict.ALLOW : Verdict.DENY;   // non-true ⇒ definite refusal
  } catch {
    return Verdict.INDETERMINATE;                          // check crashed → abstain (decision-DoS is fail-closed)
  }
}

/** A verdict with its evidence trail — every non-ALLOW names why. */
export interface GateResult {
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
}

function gate(clauses: Array<[Verdict, string]>): GateResult {
  const reasons = clauses.filter(([v]) => v !== Verdict.ALLOW).map(([v, r]) => `${v === Verdict.DENY ? "DENY" : "ABSTAIN"}: ${r}`);
  return { verdict: allOf(clauses.map(([v]) => v)), reasons };
}

/** Evidence for the Phase-R readiness gate ("is it a GOOD TIME to rotate?"). */
export interface ReadinessEvidence {
  /** Count of audit runs mid-flight at a NON-checkpoint position (R1: must be 0). */
  readonly auditRunsMidFlight: number;
  /** Current signing+processing+message queue depth (R3). */
  readonly queueDepth: number;
  /** R3 threshold — "a good time" = low in-flight. */
  readonly maxQueueDepth: number;
}

/**
 * Phase R — allOf([R1 audit-quiescence, R2 chain-health, R3 system-quiescence]).
 * NOT READY is INDETERMINATE (defer + re-check later), not DENY: an ongoing audit
 * is not a violation, just a bad moment. Malformed evidence ⇒ INDETERMINATE too
 * (fail-closed either way; the boundary collapse audits it).
 */
export function readinessVerdict(ev: ReadinessEvidence, ctx: RotationCtx): GateResult {
  const wellFormed = Number.isInteger(ev.auditRunsMidFlight) && ev.auditRunsMidFlight >= 0
    && Number.isInteger(ev.queueDepth) && ev.queueDepth >= 0
    && Number.isInteger(ev.maxQueueDepth) && ev.maxQueueDepth >= 0;
  if (!wellFormed) return { verdict: Verdict.INDETERMINATE, reasons: ["ABSTAIN: readiness evidence malformed"] };
  return gate([
    [ev.auditRunsMidFlight === 0 ? Verdict.ALLOW : Verdict.INDETERMINATE,
      `R1 audit-quiescence: ${ev.auditRunsMidFlight} audit run(s) mid-flight — defer, never rotate into live audit work`],
    [seamVerdict(ctx.verifyCurrentChain), "R2 chain-health: current chain must verify before we even PLAN a rotation"],
    [ev.queueDepth <= ev.maxQueueDepth ? Verdict.ALLOW : Verdict.INDETERMINATE,
      `R3 system-quiescence: queue depth ${ev.queueDepth} > ${ev.maxQueueDepth} — defer to a quieter moment`],
  ]);
}

/**
 * Lock A — new-key soundness. A1 well-formed commit · A2 distinct from EVERY
 * prior epoch (commit + keyId + fileRef — no reuse, no rollback, separate files)
 * · A3 round-trip (custody seam) · A4 monotone (exactly the staged next epoch).
 */
export function lockAVerdict(ring: KeyRing, ringMacKey: Uint8Array, candidateEpochId: number, ctx: RotationCtx): GateResult {
  if (!verifyRing(ring, ringMacKey)) return { verdict: Verdict.DENY, reasons: ["DENY: A0 ring failed verification"] };
  const cand = ring.epochs.find((e) => e.epochId === candidateEpochId);
  const act = activeEpoch(ring)!;
  if (!cand || cand.status !== "staged") {
    return { verdict: Verdict.DENY, reasons: ["DENY: A4 candidate is not a staged epoch"] };
  }
  // Distinctness (A2) is structurally guaranteed by stageEpoch, but the lock
  // re-derives it — independent evidence, not trust in the writer.
  const priors = ring.epochs.filter((e) => e.epochId !== cand.epochId);
  const dup = priors.some((e) =>
    e.keyCommit.toLowerCase() === cand.keyCommit.toLowerCase() || e.keyId === cand.keyId || e.fileRef === cand.fileRef);
  return gate([
    [isWellFormedCommit(cand.keyCommit) ? Verdict.ALLOW : Verdict.DENY, "A1 commit malformed/weak"],
    [dup ? Verdict.DENY : Verdict.ALLOW, "A2 candidate reuses a prior epoch's commit/keyId/fileRef"],
    [seamVerdict(ctx.verifyCandidateRoundTrip), "A3 round-trip: candidate key must sign+verify a challenge"],
    [cand.epochId === act.epochId + 1 ? Verdict.ALLOW : Verdict.DENY, "A4 monotone: candidate must be active+1 (no skip/replay)"],
  ]);
}

/**
 * Lock B — continuity. B1 current chain verifies BEFORE rotating · B2 the
 * transition chains onto the observed head (no gap, no fork) · B3 dual-signed
 * (old AND new — a half-signed handover is a DENY) · B4 epochs match the ring.
 */
export function lockBVerdict(
  ring: KeyRing, ringMacKey: Uint8Array, transition: Transition, observedChainHead: string, ctx: RotationCtx,
): GateResult {
  if (!verifyRing(ring, ringMacKey)) return { verdict: Verdict.DENY, reasons: ["DENY: B0 ring failed verification"] };
  const act = activeEpoch(ring)!;
  return gate([
    [seamVerdict(ctx.verifyCurrentChain), "B1 current chain must verify end-to-end under the current key"],
    [transition.prevChainHead !== "" && transition.prevChainHead === observedChainHead ? Verdict.ALLOW : Verdict.DENY,
      "B2 prevChainHead must equal the observed chain head (no gap, no fork)"],
    [seamVerdict(ctx.verifyTransitionMacOld), "B3 transition must verify under the OLD key"],
    [seamVerdict(ctx.verifyTransitionMacNew), "B3 transition must verify under the NEW key"],
    [transition.fromEpoch === act.epochId && transition.toEpoch === act.epochId + 1 ? Verdict.ALLOW : Verdict.DENY,
      "B4 transition epochs must be exactly active → active+1"],
  ]);
}

/**
 * Lock C — independent witness quorum: M distinct signers who INDEPENDENTLY
 * re-derived Locks A+B. M < 2 is below the design floor ⇒ INDETERMINATE (a
 * single witness is not "several independent checks"). Anti-Sybil and
 * no-equivocation inherited from quorum.ts.
 */
export function lockCVerdict(votes: readonly SignerVote[], m: number = 2): GateResult {
  if (!Number.isInteger(m) || m < 2) {
    return { verdict: Verdict.INDETERMINATE, reasons: ["ABSTAIN: C quorum floor is M>=2 (owner-ratified)"] };
  }
  const v = quorumVerdict(votes, m);
  return { verdict: v, reasons: v === Verdict.ALLOW ? [] : [`${v === Verdict.DENY ? "DENY" : "ABSTAIN"}: C quorum of ${m} distinct signers not met`] };
}

/** THE TRIPLE LOCK — allOf([A, B, C]); one non-ALLOW annihilates (Kleene ∧). */
export function tripleLockVerdict(a: GateResult, b: GateResult, c: GateResult): GateResult {
  return { verdict: allOf([a.verdict, b.verdict, c.verdict]), reasons: [...a.reasons, ...b.reasons, ...c.reasons] };
}

/** Evidence for the Phase-3 post-switch health check. */
export interface VerifyEvidence {
  /** V3 continuity: first new-epoch batch's prevHash. */
  readonly firstNewBatchPrevHash: string;
  /** V3 continuity: last old-epoch batch's hash. */
  readonly lastOldBatchHash: string;
  /** Canary: clean batches sealed under the new epoch so far. */
  readonly cleanBatches: number;
  /** Canary window size N (small, configurable; owner default). */
  readonly canaryN: number;
}

/**
 * Phase 3 — TRIPLE-VERIFY: V1 forward (new key signs+verifies live) · V2
 * backward (old batches still verify — the switch didn't disturb history) · V3
 * continuity (the chain is seamless across the epoch boundary) · canary window
 * complete. Failure ⇒ fall back (the old epoch is still in the ring, reversal is free).
 */
export function tripleVerifyVerdict(ev: VerifyEvidence, ctx: RotationCtx): GateResult {
  const canaryOk = Number.isInteger(ev.cleanBatches) && Number.isInteger(ev.canaryN)
    && ev.canaryN >= 1 && ev.cleanBatches >= 0;
  if (!canaryOk) return { verdict: Verdict.INDETERMINATE, reasons: ["ABSTAIN: verify evidence malformed"] };
  return gate([
    [seamVerdict(ctx.verifyForwardProbe), "V1 forward: a live batch under the new epoch must verify"],
    [seamVerdict(ctx.verifyBackwardSample), "V2 backward: sampled old batches must still verify under their retained epoch"],
    [ev.firstNewBatchPrevHash !== "" && ev.firstNewBatchPrevHash === ev.lastOldBatchHash ? Verdict.ALLOW : Verdict.DENY,
      "V3 continuity: the first new-epoch batch must chain onto the last old-epoch batch"],
    [ev.cleanBatches >= ev.canaryN ? Verdict.ALLOW : Verdict.INDETERMINATE,
      `canary: ${ev.cleanBatches}/${ev.canaryN} clean batches — keep watching before drain`],
  ]);
}

/** Evidence for the Phase-4 drain gate. */
export interface DrainEvidence {
  /** Signing work still tagged for the old epoch (processing + message queues). */
  readonly oldEpochPendingSigning: number;
  /** Batches currently being sealed under the old epoch. */
  readonly oldEpochInFlight: number;
}

/**
 * Phase 4 — DRAIN: nothing may still need the old key to SIGN. (Verification
 * against the old key is ALWAYS safe — its verify capability is retained
 * forever; this gate guards only the signing handle.) Not-yet-drained ⇒
 * INDETERMINATE (wait); malformed ⇒ DENY; plus a quorum witness — never retire
 * on a single "looks empty" read.
 */
export function drainVerdict(ev: DrainEvidence, witnessVotes: readonly SignerVote[], m: number = 2): GateResult {
  const wellFormed = Number.isInteger(ev.oldEpochPendingSigning) && ev.oldEpochPendingSigning >= 0
    && Number.isInteger(ev.oldEpochInFlight) && ev.oldEpochInFlight >= 0;
  if (!wellFormed) return { verdict: Verdict.DENY, reasons: ["DENY: drain evidence malformed"] };
  const witness = lockCVerdict(witnessVotes, m);
  return gate([
    [ev.oldEpochPendingSigning === 0 ? Verdict.ALLOW : Verdict.INDETERMINATE,
      `D1 queue: ${ev.oldEpochPendingSigning} old-epoch signing item(s) pending — wait`],
    [ev.oldEpochInFlight === 0 ? Verdict.ALLOW : Verdict.INDETERMINATE,
      `D2 in-flight: ${ev.oldEpochInFlight} old-epoch batch(es) mid-seal — wait`],
    [witness.verdict, "D3 witness quorum must attest drain-complete"],
  ]);
}

/** Retire policy — what Phase 5 may do to the OLD key's material (never its ring entry). */
export type RetirePolicyMode = "cold-retain" | "destroy-private" | "revoke-then-archive";

export interface RetirePolicy {
  readonly mode: RetirePolicyMode;
  /** revoke-then-archive ONLY: the keyId's revocation must already be recorded. */
  readonly revocationRecorded?: boolean;
}

/**
 * Phase 5 — RETIRE legality. The ONLY irreversible act, scoped to SIGNING power:
 *  - symmetric keys: cold-retain ONLY — verify-key == sign-key, destroying it
 *    orphans the ledger ⇒ "destroy-private" is a DENY, structurally.
 *  - asymmetric keys: destroy-private (default, safest — the public half stays in
 *    the ring forever) or revoke-then-archive (legal ONLY with the revocation
 *    recorded FIRST — revocation, not storage, is what makes archiving safe).
 * The epoch must already be retired (post-switch) and NEVER the active one.
 */
export function retireVerdict(ring: KeyRing, ringMacKey: Uint8Array, epochId: number, policy: RetirePolicy): GateResult {
  if (!verifyRing(ring, ringMacKey)) return { verdict: Verdict.DENY, reasons: ["DENY: ring failed verification"] };
  const e = ring.epochs.find((x) => x.epochId === epochId);
  if (!e) return { verdict: Verdict.DENY, reasons: ["DENY: unknown epoch"] };
  const clauses: Array<[Verdict, string]> = [
    [e.status === "retired" ? Verdict.ALLOW : Verdict.DENY, "epoch must be status=retired (never the active epoch; forward-only)"],
  ];
  if (e.keyKind === "symmetric") {
    clauses.push([policy.mode === "cold-retain" ? Verdict.ALLOW : Verdict.DENY,
      "symmetric key: cold-retain is the ONLY legal retire (verify-key == sign-key; destroying it orphans the ledger)"]);
  } else {
    if (policy.mode === "revoke-then-archive") {
      clauses.push([policy.revocationRecorded === true ? Verdict.ALLOW : Verdict.DENY,
        "revoke-then-archive REQUIRES the revocation recorded first (a bare archived signing key is a forgery liability)"]);
    } else {
      clauses.push([policy.mode === "destroy-private" || policy.mode === "cold-retain" ? Verdict.ALLOW : Verdict.DENY,
        "asymmetric retire must be destroy-private (default), cold-retain, or revoke-then-archive"]);
    }
  }
  return gate(clauses);
}

// ── Step 3: the phase machine (atomic by immutability) ───────────────────────

export type RotationPhase = "idle" | "ready" | "staged" | "locked" | "switched" | "verified" | "drained" | "retired";

export interface RotationProcess {
  readonly phase: RotationPhase;
  readonly ring: KeyRing;
  readonly transition: Transition | null;
  /** Phase-decision audit trail (append-only). */
  readonly log: readonly string[];
}

export interface PhaseOutcome {
  /** The process AFTER the gate: a NEW object on ALLOW, the ORIGINAL object (same reference) otherwise. */
  readonly process: RotationProcess;
  readonly decision: BoundaryDecision;
  readonly reasons: readonly string[];
}

/** Begin a rotation process over an existing ring. */
export function beginRotation(ring: KeyRing): RotationProcess {
  return { phase: "idle", ring, transition: null, log: [] };
}

/** Shared close: ALLOW advances to `next` (applying `apply`); anything else returns the process UNTOUCHED. */
function closePhase(
  proc: RotationProcess,
  expectedPhase: RotationPhase,
  result: GateResult,
  next: RotationPhase,
  apply: (p: RotationProcess) => Omit<RotationProcess, "phase" | "log">,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): PhaseOutcome {
  if (proc.phase !== expectedPhase) {
    const decision = decideAtBoundary(Verdict.DENY, onDiagnostic);
    return { process: proc, decision, reasons: [`DENY: phase is '${proc.phase}', expected '${expectedPhase}' (no skip)`] };
  }
  const decision = decideAtBoundary(result.verdict, onDiagnostic);
  if (!decision.authorized) return { process: proc, decision, reasons: result.reasons };
  const applied = apply(proc);
  return {
    process: { ...applied, phase: next, log: [...proc.log, `${expectedPhase}→${next}: ALLOW`] },
    decision,
    reasons: [],
  };
}

/** Phase R — readiness. NOT READY defers (process untouched; re-check later). */
export function checkReadiness(proc: RotationProcess, ev: ReadinessEvidence, ctx: RotationCtx, onDiagnostic?: (d: GovernanceDiagnostic) => void): PhaseOutcome {
  return closePhase(proc, "idle", readinessVerdict(ev, ctx), "ready", (p) => ({ ring: p.ring, transition: p.transition }), onDiagnostic);
}

/** Phase 0 — STAGE the pre-minted candidate (its own file; current key stays active). */
export function stageCandidate(
  proc: RotationProcess, ringMacKey: Uint8Array,
  candidate: { keyId: string; keyKind: KeyKind; keyCommit: string; fileRef: string; createdTick: number },
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): PhaseOutcome {
  let ring: KeyRing;
  try {
    ring = stageEpoch(proc.ring, ringMacKey, candidate);
  } catch (err) {
    const decision = decideAtBoundary(Verdict.DENY, onDiagnostic);
    return { process: proc, decision, reasons: [`DENY: ${err instanceof Error ? err.message : "stage failed"}`] };
  }
  return closePhase(proc, "ready", { verdict: Verdict.ALLOW, reasons: [] }, "staged", () => ({ ring, transition: proc.transition }), onDiagnostic);
}

/** Phase 1 — THE TRIPLE LOCK: allOf([A, B, C]). Any non-ALLOW ⇒ abort, nothing persists. */
export function commitTripleLock(
  proc: RotationProcess, ringMacKey: Uint8Array, transition: Transition, observedChainHead: string,
  votes: readonly SignerVote[], m: number, ctx: RotationCtx,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): PhaseOutcome {
  const staged = proc.ring.epochs.find((e) => e.status === "staged");
  const a = staged ? lockAVerdict(proc.ring, ringMacKey, staged.epochId, ctx)
    : { verdict: Verdict.DENY, reasons: ["DENY: no staged candidate"] } as GateResult;
  const b = lockBVerdict(proc.ring, ringMacKey, transition, observedChainHead, ctx);
  const c = lockCVerdict(votes, m);
  return closePhase(proc, "staged", tripleLockVerdict(a, b, c), "locked",
    (p) => ({ ring: p.ring, transition }), onDiagnostic);
}

/** Phase 2 — SWITCH, atomic: new signs, old keeps verifying (retained forever). */
export function switchEpoch(proc: RotationProcess, ringMacKey: Uint8Array, atTick: number, onDiagnostic?: (d: GovernanceDiagnostic) => void): PhaseOutcome {
  let ring: KeyRing;
  try {
    ring = switchActive(proc.ring, ringMacKey, atTick);
  } catch (err) {
    const decision = decideAtBoundary(Verdict.DENY, onDiagnostic);
    return { process: proc, decision, reasons: [`DENY: ${err instanceof Error ? err.message : "switch failed"}`] };
  }
  return closePhase(proc, "locked", { verdict: Verdict.ALLOW, reasons: [] }, "switched", () => ({ ring, transition: proc.transition }), onDiagnostic);
}

/** Phase 3 — TRIPLE-VERIFY over the canary window. Failure ⇒ use fallbackToOldEpoch. */
export function confirmTripleVerify(proc: RotationProcess, ev: VerifyEvidence, ctx: RotationCtx, onDiagnostic?: (d: GovernanceDiagnostic) => void): PhaseOutcome {
  return closePhase(proc, "switched", tripleVerifyVerdict(ev, ctx), "verified", (p) => ({ ring: p.ring, transition: p.transition }), onDiagnostic);
}

/**
 * The sanctioned Phase-3 reversal: verify failed ⇒ re-activate the old epoch
 * (never destroyed — reversal is free) and REVOKE the failed candidate. Returns
 * the process to `idle` for a fresh mint.
 */
export function fallbackToOldEpoch(proc: RotationProcess, ringMacKey: Uint8Array, atTick: number, onDiagnostic?: (d: GovernanceDiagnostic) => void): PhaseOutcome {
  if (proc.phase !== "switched") {
    const decision = decideAtBoundary(Verdict.DENY, onDiagnostic);
    return { process: proc, decision, reasons: ["DENY: fallback is only legal from 'switched' (before drain/retire)"] };
  }
  let ring: KeyRing;
  try {
    ring = fallbackSwitch(proc.ring, ringMacKey, atTick);
  } catch (err) {
    const decision = decideAtBoundary(Verdict.DENY, onDiagnostic);
    return { process: proc, decision, reasons: [`DENY: ${err instanceof Error ? err.message : "fallback failed"}`] };
  }
  const decision = decideAtBoundary(Verdict.ALLOW, onDiagnostic);
  return {
    process: { phase: "idle", ring, transition: null, log: [...proc.log, "switched→idle: FALLBACK (candidate revoked; old epoch re-activated)"] },
    decision,
    reasons: [],
  };
}

/** Phase 4 — DRAIN gate (queue-empty + no-in-flight + witness quorum). */
export function confirmDrain(proc: RotationProcess, ev: DrainEvidence, witnessVotes: readonly SignerVote[], m: number, onDiagnostic?: (d: GovernanceDiagnostic) => void): PhaseOutcome {
  return closePhase(proc, "verified", drainVerdict(ev, witnessVotes, m), "drained", (p) => ({ ring: p.ring, transition: p.transition }), onDiagnostic);
}

/**
 * Phase 5 — RETIRE (the only irreversible act; signing power only). The ring
 * NEVER loses the epoch — the invariant "verify capability preserved" is
 * asserted structurally after applying the policy. revoke-then-archive marks
 * the ring entry revoked; the material acts (destroy/vault/archive) belong to
 * the owner-gated custody executor (build step 5), NOT this module.
 */
export function retireOldEpoch(
  proc: RotationProcess, ringMacKey: Uint8Array, policy: RetirePolicy, atTick: number,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): PhaseOutcome {
  const act = activeEpoch(proc.ring);
  const oldEpochId = act ? act.epochId - 1 : -1;
  const result = retireVerdict(proc.ring, ringMacKey, oldEpochId, policy);
  return closePhase(proc, "drained", result, "retired", (p) => {
    const ring = policy.mode === "revoke-then-archive"
      ? markRevoked(p.ring, ringMacKey, oldEpochId, atTick)
      : p.ring;
    // Structural anti-corruption invariant: the retired epoch is STILL IN THE RING.
    if (!ring.epochs.some((e) => e.epochId === oldEpochId)) {
      throw new Error("retire invariant violated: epoch vanished from the ring — corruption");
    }
    return { ring, transition: p.transition };
  }, onDiagnostic);
}
