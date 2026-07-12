/**
 * key-rotation.test.mjs — the triple-lock rotation decision core (#28/D2, steps 1–3).
 *
 * The ADR's test demand: EVERY failure mode → abort (DENY/DEFER), only the
 * all-good path → ALLOW, and abort leaves the process byte-identical (asserted
 * here as REFERENCE identity — stronger). No live key material anywhere: key
 * bytes appear only as commitments and DI-seam closures.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Verdict, GOV_3VL_DIAGNOSTIC,
  createKeyRing, verifyRing, activeEpoch, epochForVerification,
  stageEpoch, switchActive, fallbackSwitch, markRevoked,
  readinessVerdict, lockAVerdict, lockBVerdict, lockCVerdict, tripleLockVerdict,
  tripleVerifyVerdict, drainVerdict, retireVerdict,
  beginRotation, checkReadiness, stageCandidate, commitTripleLock, switchEpoch,
  confirmTripleVerify, fallbackToOldEpoch, confirmDrain, retireOldEpoch,
} from "../dist/index.js";

const RING_KEY = new Uint8Array(32).fill(7);
const COMMIT_1 = "a".repeat(64);
const COMMIT_2 = "b".repeat(64);
const COMMIT_3 = "c".repeat(64);

const genesis = { keyId: "attest-2026-06", keyKind: "asymmetric", keyCommit: COMMIT_1, fileRef: "vault/epoch-1.key", createdTick: 100 };
const cand2 = { keyId: "attest-2026-07", keyKind: "asymmetric", keyCommit: COMMIT_2, fileRef: "vault/epoch-2.key", createdTick: 200 };

const okCtx = {
  verifyCandidateRoundTrip: () => true,
  verifyCurrentChain: () => true,
  verifyTransitionMacOld: () => true,
  verifyTransitionMacNew: () => true,
  verifyForwardProbe: () => true,
  verifyBackwardSample: () => true,
};
const vote = (signer, v = Verdict.ALLOW) => ({ signer, verdict: v });
const twoVotes = [vote("owner"), vote("re-verifier")];
const goodTransition = (head) => ({ fromEpoch: 1, toEpoch: 2, atTick: 300, prevChainHead: head, macOld: "m1", macNew: "m2" });

// ── Step 1: the append-only ring ──────────────────────────────────────────────

describe("key-ring — append-only, monotone, MAC'd head", () => {
  it("genesis ring verifies; epoch 1 active", () => {
    const ring = createKeyRing(RING_KEY, genesis);
    assert.equal(verifyRing(ring, RING_KEY), true);
    assert.equal(activeEpoch(ring)?.epochId, 1);
  });
  it("weak ring-MAC key is a hard error (fail-closed at birth)", () => {
    assert.throws(() => createKeyRing(new Uint8Array(32), genesis));
  });
  it("malformed genesis commit is a hard error", () => {
    assert.throws(() => createKeyRing(RING_KEY, { ...genesis, keyCommit: "00" }));
  });
  it("tampered head MAC fails verification (anti-tamper)", () => {
    const ring = createKeyRing(RING_KEY, genesis);
    assert.equal(verifyRing({ ...ring, headMac: "0".repeat(64) }, RING_KEY), false);
  });
  it("tampered epoch content fails verification", () => {
    const ring = createKeyRing(RING_KEY, genesis);
    const forged = { ...ring, epochs: [{ ...ring.epochs[0], keyCommit: COMMIT_3 }] };
    assert.equal(verifyRing(forged, RING_KEY), false);
  });
  it("stage appends epoch 2 as staged; ring stays valid; original ring untouched", () => {
    const ring = createKeyRing(RING_KEY, genesis);
    const staged = stageEpoch(ring, RING_KEY, cand2);
    assert.equal(staged.epochs.length, 2);
    assert.equal(staged.epochs[1].status, "staged");
    assert.equal(verifyRing(staged, RING_KEY), true);
    assert.equal(ring.epochs.length, 1); // append never overwrites
  });
  it("key REUSE is rejected: same commit / same keyId / same fileRef each throw", () => {
    const ring = createKeyRing(RING_KEY, genesis);
    assert.throws(() => stageEpoch(ring, RING_KEY, { ...cand2, keyCommit: COMMIT_1 }), /reuse|rollback/i);
    assert.throws(() => stageEpoch(ring, RING_KEY, { ...cand2, keyId: genesis.keyId }), /reuse/i);
    assert.throws(() => stageEpoch(ring, RING_KEY, { ...cand2, fileRef: genesis.fileRef }), /SEPARATE files/i);
  });
  it("only one staged candidate at a time", () => {
    const ring = stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2);
    assert.throws(() => stageEpoch(ring, RING_KEY, { keyId: "x", keyKind: "asymmetric", keyCommit: COMMIT_3, fileRef: "vault/e3.key", createdTick: 250 }), /one rotation at a time/i);
  });
  it("switchActive: staged→active, old active→retired (RETAINED, retiredTick set)", () => {
    const ring = switchActive(stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2), RING_KEY, 300);
    assert.equal(activeEpoch(ring)?.epochId, 2);
    const old = ring.epochs.find((e) => e.epochId === 1);
    assert.equal(old.status, "retired");
    assert.equal(old.retiredTick, 300);
    assert.equal(verifyRing(ring, RING_KEY), true);
  });
  it("verification key lookup: retired epochs VERIFY forever; unknown/future/revoked → null (fail-closed)", () => {
    let ring = switchActive(stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2), RING_KEY, 300);
    assert.equal(epochForVerification(ring, 1)?.keyId, genesis.keyId); // retired still verifies
    assert.equal(epochForVerification(ring, 99), null);                // unknown → fail-closed
    ring = markRevoked(ring, RING_KEY, 1, 400);
    assert.equal(epochForVerification(ring, 1), null);                 // revoked → REFUSED even if valid
  });
  it("fallbackSwitch: old re-activated, failed candidate REVOKED (no second chance)", () => {
    const switched = switchActive(stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2), RING_KEY, 300);
    const back = fallbackSwitch(switched, RING_KEY, 310);
    assert.equal(activeEpoch(back)?.epochId, 1);
    assert.equal(back.epochs.find((e) => e.epochId === 2).status, "revoked");
    assert.equal(verifyRing(back, RING_KEY), true);
  });
  it("markRevoked is forward-only: revoking an ACTIVE epoch throws", () => {
    const ring = createKeyRing(RING_KEY, genesis);
    assert.throws(() => markRevoked(ring, RING_KEY, 1, 400), /retired/i);
  });
});

// ── Step 2: the gates — every failure mode ────────────────────────────────────

describe("readiness gate — R1/R2/R3, NOT READY defers", () => {
  const ev = { auditRunsMidFlight: 0, queueDepth: 2, maxQueueDepth: 10 };
  it("all-good → ALLOW", () => {
    assert.equal(readinessVerdict(ev, okCtx).verdict, Verdict.ALLOW);
  });
  it("R1: an audit mid-flight → DEFER (INDETERMINATE, never rotate into live audit work)", () => {
    const r = readinessVerdict({ ...ev, auditRunsMidFlight: 1 }, okCtx);
    assert.equal(r.verdict, Verdict.INDETERMINATE);
    assert.ok(r.reasons.some((x) => x.includes("R1")));
  });
  it("R2: broken current chain → DENY (never plan a rotation off a broken chain)", () => {
    assert.equal(readinessVerdict(ev, { ...okCtx, verifyCurrentChain: () => false }).verdict, Verdict.DENY);
  });
  it("R2: chain check unavailable/crashing → ABSTAIN (defer)", () => {
    assert.equal(readinessVerdict(ev, { ...okCtx, verifyCurrentChain: undefined }).verdict, Verdict.INDETERMINATE);
    assert.equal(readinessVerdict(ev, { ...okCtx, verifyCurrentChain: () => { throw new Error("io"); } }).verdict, Verdict.INDETERMINATE);
  });
  it("R3: busy queue → DEFER", () => {
    assert.equal(readinessVerdict({ ...ev, queueDepth: 11 }, okCtx).verdict, Verdict.INDETERMINATE);
  });
  it("malformed evidence → ABSTAIN (fail-closed)", () => {
    assert.equal(readinessVerdict({ auditRunsMidFlight: -1, queueDepth: 0, maxQueueDepth: 5 }, okCtx).verdict, Verdict.INDETERMINATE);
  });
});

describe("Lock A — new-key soundness", () => {
  const stagedRing = () => stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2);
  it("all-good → ALLOW", () => {
    assert.equal(lockAVerdict(stagedRing(), RING_KEY, 2, okCtx).verdict, Verdict.ALLOW);
  });
  it("A3 round-trip false → DENY; absent/crash → ABSTAIN", () => {
    assert.equal(lockAVerdict(stagedRing(), RING_KEY, 2, { ...okCtx, verifyCandidateRoundTrip: () => false }).verdict, Verdict.DENY);
    assert.equal(lockAVerdict(stagedRing(), RING_KEY, 2, { ...okCtx, verifyCandidateRoundTrip: undefined }).verdict, Verdict.INDETERMINATE);
    assert.equal(lockAVerdict(stagedRing(), RING_KEY, 2, { ...okCtx, verifyCandidateRoundTrip: () => { throw new Error("hsm"); } }).verdict, Verdict.INDETERMINATE);
  });
  it("A4: not-a-staged-epoch → DENY (active epoch, unknown epoch)", () => {
    assert.equal(lockAVerdict(stagedRing(), RING_KEY, 1, okCtx).verdict, Verdict.DENY);
    assert.equal(lockAVerdict(stagedRing(), RING_KEY, 9, okCtx).verdict, Verdict.DENY);
  });
  it("A0: tampered ring → DENY", () => {
    const ring = stagedRing();
    assert.equal(lockAVerdict({ ...ring, headMac: "0".repeat(64) }, RING_KEY, 2, okCtx).verdict, Verdict.DENY);
  });
});

describe("Lock B — continuity + dual-sign", () => {
  const stagedRing = () => stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2);
  const HEAD = "f".repeat(64);
  it("all-good → ALLOW", () => {
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, goodTransition(HEAD), HEAD, okCtx).verdict, Verdict.ALLOW);
  });
  it("B1: current chain broken → DENY", () => {
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, goodTransition(HEAD), HEAD, { ...okCtx, verifyCurrentChain: () => false }).verdict, Verdict.DENY);
  });
  it("B2: gap/fork (prevChainHead ≠ observed head) → DENY; empty head → DENY", () => {
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, goodTransition("e".repeat(64)), HEAD, okCtx).verdict, Verdict.DENY);
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, goodTransition(""), "", okCtx).verdict, Verdict.DENY);
  });
  it("B3: HALF-SIGNED handover → DENY (either MAC missing its verify)", () => {
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, goodTransition(HEAD), HEAD, { ...okCtx, verifyTransitionMacOld: () => false }).verdict, Verdict.DENY);
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, goodTransition(HEAD), HEAD, { ...okCtx, verifyTransitionMacNew: () => false }).verdict, Verdict.DENY);
  });
  it("B4: wrong epoch pair (skip/replay) → DENY", () => {
    assert.equal(lockBVerdict(stagedRing(), RING_KEY, { ...goodTransition(HEAD), toEpoch: 3 }, HEAD, okCtx).verdict, Verdict.DENY);
  });
});

describe("Lock C — independent witness quorum (M≥2 floor)", () => {
  it("two distinct ALLOW signers, M=2 → ALLOW", () => {
    assert.equal(lockCVerdict(twoVotes, 2).verdict, Verdict.ALLOW);
  });
  it("M<2 is below the design floor → ABSTAIN (a single witness is not 'several independent checks')", () => {
    assert.equal(lockCVerdict(twoVotes, 1).verdict, Verdict.INDETERMINATE);
  });
  it("one signer short → non-ALLOW (fail-closed)", () => {
    assert.notEqual(lockCVerdict([vote("owner")], 2).verdict, Verdict.ALLOW);
  });
  it("duplicate signer cannot fake a quorum (anti-Sybil, from quorum.ts)", () => {
    assert.notEqual(lockCVerdict([vote("owner"), vote("owner")], 2).verdict, Verdict.ALLOW);
  });
});

describe("THE TRIPLE LOCK — allOf([A,B,C]): one non-ALLOW annihilates", () => {
  const ok = { verdict: Verdict.ALLOW, reasons: [] };
  it("ALLOW·ALLOW·ALLOW → ALLOW", () => {
    assert.equal(tripleLockVerdict(ok, ok, ok).verdict, Verdict.ALLOW);
  });
  it("any single DENY → DENY; any single ABSTAIN → non-ALLOW", () => {
    const deny = { verdict: Verdict.DENY, reasons: ["DENY: x"] };
    const abstain = { verdict: Verdict.INDETERMINATE, reasons: ["ABSTAIN: y"] };
    assert.equal(tripleLockVerdict(deny, ok, ok).verdict, Verdict.DENY);
    assert.equal(tripleLockVerdict(ok, deny, ok).verdict, Verdict.DENY);
    assert.equal(tripleLockVerdict(ok, ok, deny).verdict, Verdict.DENY);
    assert.equal(tripleLockVerdict(abstain, ok, ok).verdict, Verdict.INDETERMINATE);
  });
});

describe("triple-verify — forward/backward/continuity + canary", () => {
  const ev = { firstNewBatchPrevHash: "h1", lastOldBatchHash: "h1", cleanBatches: 5, canaryN: 5 };
  it("all-good → ALLOW", () => {
    assert.equal(tripleVerifyVerdict(ev, okCtx).verdict, Verdict.ALLOW);
  });
  it("V1 forward probe fails → DENY", () => {
    assert.equal(tripleVerifyVerdict(ev, { ...okCtx, verifyForwardProbe: () => false }).verdict, Verdict.DENY);
  });
  it("V2 backward sample fails → DENY (the switch disturbed history — fall back)", () => {
    assert.equal(tripleVerifyVerdict(ev, { ...okCtx, verifyBackwardSample: () => false }).verdict, Verdict.DENY);
  });
  it("V3 seam broken (chain discontinuity) → DENY", () => {
    assert.equal(tripleVerifyVerdict({ ...ev, firstNewBatchPrevHash: "h2" }, okCtx).verdict, Verdict.DENY);
  });
  it("canary window not yet complete → DEFER (keep watching)", () => {
    assert.equal(tripleVerifyVerdict({ ...ev, cleanBatches: 3 }, okCtx).verdict, Verdict.INDETERMINATE);
  });
});

describe("drain gate — nothing may still need the old key to SIGN", () => {
  const clean = { oldEpochPendingSigning: 0, oldEpochInFlight: 0 };
  it("drained + witness quorum → ALLOW", () => {
    assert.equal(drainVerdict(clean, twoVotes, 2).verdict, Verdict.ALLOW);
  });
  it("pending old-epoch signing work → WAIT (INDETERMINATE)", () => {
    assert.equal(drainVerdict({ ...clean, oldEpochPendingSigning: 3 }, twoVotes, 2).verdict, Verdict.INDETERMINATE);
  });
  it("in-flight old-epoch batch → WAIT", () => {
    assert.equal(drainVerdict({ ...clean, oldEpochInFlight: 1 }, twoVotes, 2).verdict, Verdict.INDETERMINATE);
  });
  it("no witness quorum → non-ALLOW (never retire on a single 'looks empty' read)", () => {
    assert.notEqual(drainVerdict(clean, [vote("owner")], 2).verdict, Verdict.ALLOW);
  });
  it("malformed counts → DENY", () => {
    assert.equal(drainVerdict({ oldEpochPendingSigning: -1, oldEpochInFlight: 0 }, twoVotes, 2).verdict, Verdict.DENY);
  });
});

describe("retire policy — signing power only, verify capability NEVER destroyed", () => {
  const retiredRing = () => switchActive(stageEpoch(createKeyRing(RING_KEY, genesis), RING_KEY, cand2), RING_KEY, 300);
  it("asymmetric destroy-private (default) → ALLOW", () => {
    assert.equal(retireVerdict(retiredRing(), RING_KEY, 1, { mode: "destroy-private" }).verdict, Verdict.ALLOW);
  });
  it("revoke-then-archive WITHOUT recorded revocation → DENY (revocation is what makes archiving safe)", () => {
    assert.equal(retireVerdict(retiredRing(), RING_KEY, 1, { mode: "revoke-then-archive" }).verdict, Verdict.DENY);
    assert.equal(retireVerdict(retiredRing(), RING_KEY, 1, { mode: "revoke-then-archive", revocationRecorded: true }).verdict, Verdict.ALLOW);
  });
  it("SYMMETRIC key: destroy is STRUCTURALLY DENIED (verify-key == sign-key — orphans the ledger); cold-retain allowed", () => {
    const symGenesis = { ...genesis, keyKind: "symmetric", keyId: "audit-hmac-1", keyCommit: COMMIT_3, fileRef: "vault/hmac-1.key" };
    const symCand = { keyId: "audit-hmac-2", keyKind: "symmetric", keyCommit: "d".repeat(64), fileRef: "vault/hmac-2.key", createdTick: 200 };
    const ring = switchActive(stageEpoch(createKeyRing(RING_KEY, symGenesis), RING_KEY, symCand), RING_KEY, 300);
    assert.equal(retireVerdict(ring, RING_KEY, 1, { mode: "destroy-private" }).verdict, Verdict.DENY);
    assert.equal(retireVerdict(ring, RING_KEY, 1, { mode: "revoke-then-archive", revocationRecorded: true }).verdict, Verdict.DENY);
    assert.equal(retireVerdict(ring, RING_KEY, 1, { mode: "cold-retain" }).verdict, Verdict.ALLOW);
  });
  it("retiring the ACTIVE epoch → DENY; unknown epoch → DENY", () => {
    assert.equal(retireVerdict(retiredRing(), RING_KEY, 2, { mode: "destroy-private" }).verdict, Verdict.DENY);
    assert.equal(retireVerdict(retiredRing(), RING_KEY, 9, { mode: "destroy-private" }).verdict, Verdict.DENY);
  });
});

// ── Step 3: the phase machine — atomicity by identity ────────────────────────

describe("phase machine — happy path idle→retired", () => {
  it("walks every gate to retirement; old epoch retained in the ring throughout", () => {
    const HEAD = "f".repeat(64);
    let proc = beginRotation(createKeyRing(RING_KEY, genesis));

    let r = checkReadiness(proc, { auditRunsMidFlight: 0, queueDepth: 0, maxQueueDepth: 10 }, okCtx);
    assert.equal(r.decision.authorized, true); proc = r.process;

    r = stageCandidate(proc, RING_KEY, cand2);
    assert.equal(r.decision.authorized, true); proc = r.process;
    assert.equal(proc.ring.epochs.length, 2);

    r = commitTripleLock(proc, RING_KEY, goodTransition(HEAD), HEAD, twoVotes, 2, okCtx);
    assert.equal(r.decision.authorized, true); proc = r.process;

    r = switchEpoch(proc, RING_KEY, 300);
    assert.equal(r.decision.authorized, true); proc = r.process;
    assert.equal(activeEpoch(proc.ring)?.epochId, 2);

    r = confirmTripleVerify(proc, { firstNewBatchPrevHash: "h", lastOldBatchHash: "h", cleanBatches: 5, canaryN: 5 }, okCtx);
    assert.equal(r.decision.authorized, true); proc = r.process;

    r = confirmDrain(proc, { oldEpochPendingSigning: 0, oldEpochInFlight: 0 }, twoVotes, 2);
    assert.equal(r.decision.authorized, true); proc = r.process;

    r = retireOldEpoch(proc, RING_KEY, { mode: "destroy-private" }, 400);
    assert.equal(r.decision.authorized, true); proc = r.process;

    assert.equal(proc.phase, "retired");
    // THE anti-corruption invariant: epoch 1 is still in the ring, still verify-capable.
    assert.equal(epochForVerification(proc.ring, 1)?.keyId, genesis.keyId);
    assert.equal(proc.log.length, 7);
  });
});

describe("phase machine — abort is IDENTITY (nothing persists) + audited", () => {
  const HEAD = "f".repeat(64);
  const readyProc = () => {
    let proc = beginRotation(createKeyRing(RING_KEY, genesis));
    proc = checkReadiness(proc, { auditRunsMidFlight: 0, queueDepth: 0, maxQueueDepth: 10 }, okCtx).process;
    return stageCandidate(proc, RING_KEY, cand2).process; // phase: staged
  };
  it("readiness DEFER: process object is the SAME reference; FUNGI-GOV-3VL-001 emitted", () => {
    const proc = beginRotation(createKeyRing(RING_KEY, genesis));
    let heard = null;
    const r = checkReadiness(proc, { auditRunsMidFlight: 2, queueDepth: 0, maxQueueDepth: 10 }, okCtx, (d) => { heard = d; });
    assert.equal(r.decision.authorized, false);
    assert.equal(r.process, proc);                       // identity — provably untouched
    assert.equal(heard?.code, GOV_3VL_DIAGNOSTIC);       // LOUD, never silent
  });
  it("triple-lock failure (half-signed transition): abort, same reference, reasons name the lock", () => {
    const proc = readyProc();
    const r = commitTripleLock(proc, RING_KEY, goodTransition(HEAD), HEAD, twoVotes, 2,
      { ...okCtx, verifyTransitionMacNew: () => false });
    assert.equal(r.decision.authorized, false);
    assert.equal(r.process, proc);
    assert.ok(r.reasons.some((x) => x.includes("B3")));
  });
  it("quorum shortfall: abort, same reference", () => {
    const proc = readyProc();
    const r = commitTripleLock(proc, RING_KEY, goodTransition(HEAD), HEAD, [vote("owner")], 2, okCtx);
    assert.equal(r.decision.authorized, false);
    assert.equal(r.process, proc);
  });
  it("phase-skip is DENIED (cannot retire from staged)", () => {
    const proc = readyProc();
    const r = retireOldEpoch(proc, RING_KEY, { mode: "destroy-private" }, 400);
    assert.equal(r.decision.authorized, false);
    assert.equal(r.process, proc);
    assert.ok(r.reasons.some((x) => x.includes("phase")));
  });
  it("stage failure (key reuse) aborts with the ring untouched", () => {
    let proc = beginRotation(createKeyRing(RING_KEY, genesis));
    proc = checkReadiness(proc, { auditRunsMidFlight: 0, queueDepth: 0, maxQueueDepth: 10 }, okCtx).process;
    const r = stageCandidate(proc, RING_KEY, { ...cand2, keyCommit: COMMIT_1 });
    assert.equal(r.decision.authorized, false);
    assert.equal(r.process, proc);
    assert.equal(proc.ring.epochs.length, 1);
  });
});

describe("phase machine — the sanctioned fallback (Phase-3 failure)", () => {
  it("verify fails → fallbackToOldEpoch: old re-activated, candidate revoked, process → idle", () => {
    const HEAD = "f".repeat(64);
    let proc = beginRotation(createKeyRing(RING_KEY, genesis));
    proc = checkReadiness(proc, { auditRunsMidFlight: 0, queueDepth: 0, maxQueueDepth: 10 }, okCtx).process;
    proc = stageCandidate(proc, RING_KEY, cand2).process;
    proc = commitTripleLock(proc, RING_KEY, goodTransition(HEAD), HEAD, twoVotes, 2, okCtx).process;
    proc = switchEpoch(proc, RING_KEY, 300).process;

    const bad = confirmTripleVerify(proc, { firstNewBatchPrevHash: "x", lastOldBatchHash: "y", cleanBatches: 5, canaryN: 5 }, okCtx);
    assert.equal(bad.decision.authorized, false);
    assert.equal(bad.process, proc); // verify failure alone changes nothing

    const back = fallbackToOldEpoch(proc, RING_KEY, 310);
    assert.equal(back.decision.authorized, true);
    assert.equal(back.process.phase, "idle");
    assert.equal(activeEpoch(back.process.ring)?.epochId, 1);       // reversal is free — old key was never destroyed
    assert.equal(back.process.ring.epochs.find((e) => e.epochId === 2).status, "revoked"); // no second chance
  });
  it("fallback from any other phase is DENIED", () => {
    const proc = beginRotation(createKeyRing(RING_KEY, genesis));
    const r = fallbackToOldEpoch(proc, RING_KEY, 310);
    assert.equal(r.decision.authorized, false);
    assert.equal(r.process, proc);
  });
});
