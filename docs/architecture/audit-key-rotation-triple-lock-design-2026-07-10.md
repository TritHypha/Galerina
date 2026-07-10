# DESIGN — Key rotation: the triple-lock, fail-closed, phased, append-only design (#28 / D2)

**Status:** Proposed (2026-07-10) — design for owner review BEFORE any live key-material code is built.

**Owner constraints (verbatim intent):**
1. *"Key rotation must be very carefully planned, designed and built. We cannot afford key corruption — not one but several independent checks at each stage: a triple lock against failure, and stability."*
2. *"The key when building on my computer took about 30 minutes, so we need to keep the current key active; place both in different files; safely switch over; triple-verify everything is working; check there is nothing in the queue that needs the old key (processing, message queue, etc.); safely remove the old key."*

---

## 0. The overriding principle (why corruption is impossible by construction)

> **Rotation is APPEND, never REPLACE — and "remove the old key" means remove its SIGNING power, NEVER its VERIFY power.**
>
> The key history is an **append-only, monotone-epoch ring**. A rotation *adds* an epoch; no epoch's **verification capability** is ever destroyed. Every historical batch stays verifiable against its own epoch forever. The single greatest fear — *losing a key and orphaning the ledger it signed* — is therefore **structurally unreachable**: the only key material we ever destroy is a retired key's ability to *make new signatures*, which after switch-over we do not want it to have anyway.

Everything below is defense-in-depth *on top of* that structural guarantee.

---

## 1. Two key systems (verified from source) — and why the destroy-safety differs

This is the crux the owner's note surfaced. Galerina has **two independent key systems**, and "safely remove the old key" means different things for each:

| System | Files (verified) | Scheme | Keygen cost | Sign vs verify | "Remove the old key" =|
|---|---|---|---|---|---|
| **Audit-ledger integrity** | `core-sentinel-egress/audit-egress.ts`, `core-sentinel-state/state-serializer.ts` | **symmetric HMAC-SHA256** (`createHmac`) | **instant** | **same key does both** | **RETIRE to cold, NEVER destroy** — destroying it orphans every batch it signed (the exact corruption we fear) |
| **Attestation / signing** | `ext-spore` signature-custody spec, `tower-citizen/hybrid-engine.ts` | **asymmetric** hybrid **Ed25519 + ML-DSA-65** (FIPS-204) | **expensive** | **private signs, public verifies** | **destroy the old PRIVATE half after drain; KEEP the public half forever** to verify history |

**The 30-minute mint cost identifies the key.** An HMAC key is random bytes — instant. A **hybrid Ed25519 + ML-DSA-65** (or an L5 `ML-DSA-87` / `SLH-DSA-256s`) keypair, minted through an offline-vault ceremony, is the expensive one. So the key the owner rotated is the **asymmetric attestation key** — which is *precisely* the system where "safely remove the old key" is achievable **without orphaning anything** (destroy the private half, the public half keeps verifying history forever). The `ext-spore` custody spec §7 already blesses this: *"new key_id per period; overlap window accepts previous + current; old signatures stay valid while the old key_id is non-revoked."*

> ⚠️ **The one hard rule that prevents corruption:** for the **symmetric HMAC audit ledger**, "remove the old key" can **never** mean *destroy* — verify-key == sign-key, so destroying it makes historical batches permanently unverifiable. There it means **retire to the cold offline vault, retained forever.** Only the **asymmetric** system's **private** half may ever be destroyed, and only after Phase 4 (drain) confirms nothing still needs it to sign.

**The improvement you invited:** the audit ledger can *also* gain an **asymmetric anchor** (an Ed25519/ML-DSA signature over each epoch's HMAC-chain head), so that even there "remove the old key" becomes genuinely achievable — you keep the tiny public anchor to prove the old chain, and the bulky/secret HMAC material can eventually be cold-retired without the ledger depending on it being *online*. That is a strict upgrade, sequenced after the core rotation lands (§5, step 6).

---

## 2. Data model

```
KeyEpoch {
  epochId:      Int        // monotone, +1 each rotation, never reused
  keyId:        String     // opaque id of the epoch key (NOT the key bytes), e.g. "attest-key-2026-07"
  role:         "sign+verify" (symmetric) | "verify-only" (asymmetric public) | "sign" (asymmetric private, custody-only)
  keyCommit:    String     // HMAC/hash COMMITMENT to the key (proves distinctness without holding the key)
  fileRef:      String     // WHICH file holds this epoch's material — old and new live in SEPARATE files
  createdTick:  Int
  retiredTick:  Int | null // set when a later epoch supersedes it; VERIFY capability is RETAINED
  status:       "staged" | "active" | "retired" | "revoked"   // revoked/retired ≠ deleted
}
KeyRing = append-only [KeyEpoch], monotone by epochId, MAC'd head (anti-tamper, anti-rollback).

AuditBatch += epochId: Int             // every batch records WHICH epoch signed it
Verification: batch verified against KeyRing[batch.epochId]'s VERIFY key.
              An unknown / future / retired-before-created epochId ⇒ FAIL-CLOSED.

Transition {                           // the rotation event itself
  fromEpoch, toEpoch (== fromEpoch+1),
  atTick, prevChainHead,               // the old epoch's last batchHash — the new epoch chains onto it
  macOld,                              // Transition body MAC'd / signed under the OLD key
  macNew                               // ...and under the NEW key  → dual-signed handover
}
```

The key **bytes** never enter the ring, the ledger, or the decision module — only a **commitment**. Old and new material live in **separate files** (owner constraint 2): a rotation *adds a file*, never overwrites one, so a crash mid-rotation leaves both intact. Material lives in custody (offline USB vault today per Decision-1; HSM/PKCS#11 later).

---

## 3. The five-phase gated lifecycle (your sequence, made fail-closed)

Each phase is independently gated; **every gate fails closed**; nothing irreversible happens until the last phase, which is gated hardest. This is the direct answer to *"several independent checks at each stage."*

```
Phase 0  STAGE          mint the new key AHEAD of time (offline, ~30 min) into its OWN file; commit its
                        keyCommit to the ring as status:"staged".  CURRENT KEY STAYS ACTIVE throughout —
                        there is never a window with no active key.                 [reversible: discard the staged file]

Phase 1  TRIPLE LOCK    rotationVerdict = allOf([A, B, C]) — the pre-switch gate (§3.1). Any non-ALLOW ⇒ ABORT,
                        current epoch untouched.                                    [reversible: nothing changed]

Phase 2  SWITCH         atomic: activate the new epoch FOR SIGNING; old epoch → still valid for VERIFY.
                        Overlap window opens (both keys' signatures verify; only the NEW key signs).   [reversible: fall back to old — it is still active]

Phase 3  TRIPLE-VERIFY  post-switch health check (§3.2): new key signs AND verifies live traffic; a sample of
                        OLD batches still verifies; chain head is continuous across the boundary. Runs for a
                        canary window of N clean batches.                            [reversible: any failure ⇒ fall back, retire nothing]

Phase 4  DRAIN GATE     confirm NOTHING still needs the old key to SIGN (§3.3): signing queue empty of old-epoch
                        work, no in-flight batch references the old epoch, message/processing queues quiesced —
                        each checked independently + a quorum witness.               [reversible: not-yet-drained ⇒ keep old key active, wait]

Phase 5  RETIRE         the ONLY irreversible act, and it is scoped to SIGNING power only:
                          symmetric (HMAC)  → mark retired, move to cold offline vault, RETAIN forever (never destroy)
                          asymmetric        → destroy the old PRIVATE half; KEEP the public half in the ring forever
                        Gated behind Phase 4 draining clean + a final allOf re-check.  [IRREVERSIBLE — but verify-capability is provably preserved]
```

**Reversibility invariant:** everything before Phase 5 is reversible — the old key stays fully active until drain completes, so a bad new key is caught (Phase 3) and rolled back with zero loss. The single irreversible act (Phase 5) can only ever remove *signing* capability, never *verify* capability — so it is incapable of orphaning the ledger by construction.

### 3.1 The TRIPLE LOCK (Phase 1 — pre-switch). `allOf([A,B,C])`; any failure ⇒ abort.

Computed by **independent code paths / independent evidence** so no single bug or compromise satisfies more than one lock:

- **Lock A — New-key soundness.** ALLOW iff *all* hold: (1) non-weak (non-zero, len ≥ 32) — reuses `isWeakKey`; (2) **distinct** from every prior epoch (`keyCommit` matches no existing epoch — no reuse/rollback); (3) **round-trips** — signs a challenge and verifies it (the key actually works); (4) **monotone** — `toEpoch == activeEpoch + 1`.
- **Lock B — Continuity.** ALLOW iff *all* hold: (1) the **current** chain verifies end-to-end under the **current** key **before** we rotate (never rotate off a broken chain); (2) `Transition.prevChainHead == current chain head` (no gap, no fork); (3) **dual-signed** — `macOld` verifies under the old key **and** `macNew` under the new key (a half-signed handover is a DENY).
- **Lock C — Independent witness / quorum.** ALLOW iff `checkQuorum(votes, M)` of **M distinct signers** approves, each having INDEPENDENTLY re-derived Locks A + B. Inherits anti-Sybil + no-equivocation from `quorum.ts`. Default **M ≥ 2**.

### 3.2 The TRIPLE-VERIFY (Phase 3 — post-switch health). All three must pass, else fall back.

1. **Forward:** the new key signs a live batch and that batch verifies under the new epoch.
2. **Backward:** a sampled set of pre-rotation batches still verifies under their (retained) old epoch — proves the switch did not disturb history.
3. **Continuity:** the first new-epoch batch's `prevHash` equals the last old-epoch batch's hash — the chain is unbroken across the seam.

### 3.3 The DRAIN GATE (Phase 4 — pre-retire; itself triple-checked). All three, else do not retire.

1. **Queue empty:** no pending signing work is tagged for the old epoch (processing queue + message queue).
2. **No in-flight:** no batch currently being sealed references the old epoch.
3. **Witness:** a `checkQuorum` witness attests drain-complete — we never retire on a single "looks empty" read.

**Commit rule (atomic, all-or-nothing) at every phase boundary:**
```
if gate == ALLOW:  advance one phase; append (never overwrite); persist the ring's new MAC'd head
else:              STAY on the current phase; EVERY key retained; ledger untouched;
                   audited FUNGI-GOV-3VL-001; alert. NO partial state ever persists.
```

---

## 4. Why this satisfies "no corruption + stability" (guarantees, enumerated)

| Failure feared | Guard |
|---|---|
| Losing an old key → orphaned ledger | **Verify-capability never destroyed**; append-only ring; old batches verify forever (structural) |
| "Remove the old key" destroys verification | **Role split** — Phase 5 removes *signing* power only; symmetric = cold-retain, asymmetric = destroy private / keep public |
| No active key during the 30-min mint | **Phase 0 mints ahead**; current key stays active until Phase 5; never a keyless window |
| Old + new key clash / in-place overwrite | **Separate files**; rotation appends a file, never mutates one; crash-safe |
| Half-rotated / partial state | **Atomic per-phase** commit; abort leaves everything untouched |
| Bad/weak/reused new key admitted | **Lock A** — and it must ALSO pass B, C, and Phase-3 health |
| Rotating off a tampered chain | **Lock B.1** verifies the current chain first |
| Gap / fork at the epoch boundary | **Lock B.2** + **Verify.3** prevChainHead == head |
| New key silently broken after switch | **Phase 3 triple-verify** on a canary window ⇒ fall back before any retire |
| Retiring a key still needed in-flight | **Phase 4 drain gate** (queue-empty + no-in-flight + witness) |
| Replay / rollback / skip of a rotation | **monotone epochId** + anti-rollback ring head; Lock A.4 |
| A single compromised checker green-lights a bad rotation | **Triple lock `allOf`** + **quorum M-of-N**; three independent locks must all pass |
| "Automatic" rotation bypassing safety | Scheduler only **PROPOSES**; the gates **DECIDE**. A failing auto-rotation simply doesn't happen (stays on current epoch) + alerts |

---

## 5. Build plan (decision-side first; NO live key material until step 5 is owner-approved)

Each step is a pure module + an exhaustive test suite (every failure mode → abort), differential-/property-tested, before the next. **Reuses, does not reinvent:** `quorum.ts` (`checkQuorum`), `three-valued-governance.ts` (`allOf`, `decideAtBoundary`), `isWeakKey` + `timingSafeEqual`, the append-only MAC'd-head pattern from `governance/revocation-registry.mjs`.

1. **Key-ring + epoch model** — append-only, monotone, MAC'd head, `keyCommit` distinctness, `fileRef` separation. Pure. Tests: append-monotone-only, reject reuse/rollback, unknown-epoch fail-closed.
2. **Locks A/B/C + Verify + Drain as pure verdict functions.** Tests: each check's every failure path → DENY; only the all-good path → ALLOW.
3. **Phase machine** = `allOf([A,B,C])` → switch → triple-verify → drain → retire, with atomic per-phase commit/abort. Tests: abort at any phase ⇒ state byte-identical to phase-entry (the anti-corruption invariant, asserted); Phase-5 asserts verify-capability preserved.
4. **Epoch-aware verification** — extend `AuditEgress.verifyChain` / `StateSerializer.verify` to select the verify key by `batch.epochId`; unknown epoch → fail-closed; default `strictKey` on in production.
5. **(Owner-gated, ext/custody) key-material execution** — mint/store/apply/retire real bytes (offline vault → HSM). The ONLY part that touches a real key; built last, reviewed hardest.
6. **(Improvement, later) asymmetric anchor for the HMAC ledger** — sign each epoch's chain-head with the attestation key so even the symmetric ledger gains a destroy-safe "remove the old key" story.

---

## 6. Open decisions for the owner (before build)

1. **Confirm the key identity.** Is the 30-minute key the **asymmetric attestation key** (hybrid Ed25519 + ML-DSA-65 / an L5 profile), as the mint cost implies? This is the one that governs whether "safely remove" may *destroy* (asymmetric private ✓) or must *cold-retain* (symmetric HMAC ✗). If you actually mean rotating the **audit HMAC** ledger key, "remove" becomes cold-retain-only unless we add step 6 first.
2. **Quorum M** for Lock C / the drain witness (default M=2: you + one independent re-verifier). Second signer = a second custody holder, or a separately-implemented re-verification module?
3. **Rotation trigger cadence** for "automatic" — time (per N days), volume (per N batches), or on-demand only? (The trigger only proposes; the gates decide.)
4. **Placement** — decision module in `tower-citizen` (alongside `quorum.ts`/`lease.ts`) vs a new `core-sentinel-*`; key-material execution in a new owner-gated `galerina-ext-key-custody`?
5. **Canary window size** N for Phase 3 (default: a small fixed N clean batches before drain is allowed to start).

**Recommendation:** confirm asymmetric-attestation as the rotating key (destroy-safe); M=2 with a separately-implemented re-verifier as the second signer; trigger = on-demand + a conservative time cadence; decision module in `tower-citizen`, execution in a new owner-gated `ext` package; N small and configurable. On your go I build steps 1–4 (pure, no key material, heavily tested) and hold step 5 (and the improvement, step 6) for your review of the working decision core.
