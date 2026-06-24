# R&D 0118 — LLN-RETAIN-001 Hardware Protection Directive (adversarially hardened)

**Date:** 2026-06-24 · **Workflow:** `wrarw1hgi` (3 adversarial lenses + synthesis) · **Status:** directive design + **decision core BUILT** (`admitSubstrateWrite`, 12/12)
**Posture:** fail-closed (unknown→DENY), deny-by-default, crypto-on-core (LLN-SUBSTRATE-001), K3 Kleene, No-Coercion. Brand: "trust the math".
**Builds on:** `RD-0116-O4` (the finding) · guardrail `RD-0114-G3` · the shipped `admitPhotonicConfig` 4-gate rail.
**Companion docs:** [`logicn-rd-0116-holographic-storage-2026-06-24.md`](logicn-rd-0116-holographic-storage-2026-06-24.md) · [`logicn-governance-rules.md`](logicn-governance-rules.md) (LLN-RETAIN-001) · [`logicn-rd-reference-index.md`](logicn-rd-reference-index.md)

> Owner question: "should there be a hardware protection directive in LogicN as a result of RD-0116 — and how should the Substrate Dispatch Gateway discover a drive's eraseModel: hardware auto-reports on boot, or admins manually whitelist every drive?"

---

## 1) VERDICT  `[RD-0118-O1]`

**YES — adopt LLN-RETAIN-001 as a normative, compiler-enforced invariant, not a documentation warning.** The overwrite-based erasure in `wat-emitter.ts` B2/B2b is *provably unsound* on any write-once/fixed medium (a `memset` cannot erase a thermally-fixed hologram or WORM glass), so without the directive a secret that reaches such a substrate is unrecoverable-by-deletion **and the violation is silent** — exactly the failure class zero-trust must foreclose. You cannot claim Absolute Zero-Trust if plugging in a new type of glass/optical drive silently breaks your deletion guarantee. Record-now / build-on-path is correct: the obligation + every digital piece are buildable today; only the physical write seam + a hardware root-of-trust are HW-gated.

## 2) THE DISCOVERY ANSWER (the owner's question)  `[RD-0118-O2]`

**Use a SIGNED ATTESTATION — neither (a) auto-report-on-boot nor (b) a bare admin whitelist.** Both naive options are fail-open, and they fail at the same place: they authenticate a *claim* or a *name*, never the *medium's physics*.

- **(a) auto-report is categorically unsound.** The WORM/holographic drive itself answers "my eraseModel is `overwrite`," which downgrades it out of the KEM-DEM requirement. **The least-trustworthy party — a possibly-malicious or reflashed drive — names the physics that gates whether its own cleartext gets sealed.** The lie isn't signed → it must never be trusted. (This is the exact unsigned-code-path hole `admitPhotonicConfig` was built to kill.)
- **(b) a bare whitelist is strictly better but still fail-open** — plaintext config tamper (a compromised CI flips one entry to `overwrite`), drive-id spoofing (serial/WWN is self-reported), swap-into-a-whitelisted-id. **The whitelist authenticates a NAME, never the MEDIUM.**
- **(c) signed attestation is fail-closed.** `eraseModel` becomes a field in the existing hash-pinned + Ed25519-signed + revocable + capability-gated manifest, admitted through the *same 4-gate rail* via a **capability-axis split** (`storage.mount` / `holo.volume.admit`, RD-0116 §4), with the out-of-band trust-anchor pin (`revocation-registry.mjs`) so the attestation can never name its own authorizing root. A lying `overwrite` WORM drive cannot produce a signed manifest claiming `overwrite`; tamper breaks the sig (DENY), id-spoof fails (the id is inside the signed canonical blob), a rogue signer fails (revocation).

**THE EXACT DEFAULT-ON-UNKNOWN: `eraseModel = "crypto-only"` (the STRICTER model).** An unknown / unattested / signature-failed / absent-witness drive collapses `INDETERMINATE → DENY` for cleartext routing, forcing KEM-DEM sealing. The asymmetry is the whole point:

| mistake | consequence |
|---|---|
| treat an `overwrite` drive as `crypto-only` | **redundant seal** — safe, availability-only cost |
| treat a `crypto-only` drive as `overwrite` | **permanent cleartext remanence** — catastrophic, unrecoverable |

So **`crypto-only` is the free default; `overwrite` is an EARNED, SIGNED, REVOCABLE exception.** Where no hardware root-of-trust exists (the #102-106-not-present case), the gateway treats every seam as `crypto-only` unconditionally — seal everything, never fall back to "trust the boot report." This is exactly the rule built into `effectiveEraseModel` (`substrate-erasure.ts`).

## 3) THE HARDENED 3-STAGE ENFORCEMENT  `[RD-0118-O3]`

**Stage 1 — COMPILER TRAP (pre-flight, buildable now).** Add a crypto-only storage **sink class** to the existing SealTaint taint lattice (LLN-PRIVACY-002 / LLN-SECRET-002, value-state-checker). A cleartext-secret-tainted AST value reaching a crypto-only sink yields **K3 DENY → build fails**, forcing KEM-DEM insertion. *Closes the "no compiler storage sink" hole* — today a `vault.read → write` compiles clean because storage writes are not a registered tainted sink. Pure wiring on an existing lattice; testable on declared substrates with zero physical media.

**Stage 2 — SUBSTRATE DISPATCH GATEWAY (runtime; decision core BUILT).** At hardware dispatch, if the destination's *attested* eraseModel is `crypto-only` (or unknown) and the payload is not KEM-DEM-wrapped, **refuse to route (fail-closed K3).** The gateway must be the **sole chokepoint** for the physical write seam (not an advisory boolean a caller can skip) and must take eraseModel **only from the signed admission record**, never the boot self-report or a caller-supplied `{isOverwrite:true}`. The decision core — `admitSubstrateWrite` / `effectiveEraseModel` — is **built + tested** (`logicn-tower-citizen/src/substrate-erasure.ts`, 12/12; commit `746e161`); the workflow's independently-derived truth table (§4) matches it exactly.

> **Residual the signed model does NOT close — physical-swap-after-attestation TOCTOU.** Hash-pin binds the signed *blob's bytes*, not the *live medium's identity*: mint a valid `overwrite` attestation for a real SSD, then pull it and slot WORM into the same bay/id. **Closure (genuinely HW-gated):** bind the attestation to the MEDIUM via a hardware-rooted device identity (TPM/DICE/SPDM storage quote or measured-boot), re-verified at *every* dispatch with a fresh nonce — not once at boot. With no HW root present, the only safe behavior is unconditional `crypto-only`.

**Stage 3 — DELETION WITNESS (audit, buildable now).** Deletion on immutable media = destroy the DEK on overwritable silicon + mint a signed witness. **The hardened form does NOT attest "I destroyed the key"** (forgery-by-assertion — Ed25519 binds *authorship*, not the physical non-recoverability event); it binds the **constructive preconditions** that make destroying-one-key equal full erasure (§5), and sets `HIST_FLAG.ERASED` (bit2, already under the signed Merkle root in `history.ts`) so "erased" is itself anti-rollback-protected and cannot be quietly un-asserted.

## 4) THE DECISION CORE (built + adversarially validated)  `[RD-0118 §4]`

`admitSubstrateWrite(payload{isSecretTainted, isSealed}, substrate{eraseModel?, attested}) → Verdict`, deny-by-default, fail-closed-to-stricter-on-unknown. The `eraseModel` consumed is **only** the attested value; unattested/unsigned/unknown resolves to `crypto-only`.

| isSecretTainted | isSealed | attested | resolved eraseModel | Verdict |
|---|---|---|---|---|
| false | — | — | any | **ALLOW** (no secret at risk) |
| true | **true** (ciphertext) | — | any | **ALLOW** (key-destruction erases it) |
| true | false | true | `overwrite` (signed) | **ALLOW** (the one earned exception) |
| true | false | true | `crypto-only` (signed) | **DENY** (permanent remanence) |
| true | false | **false / unknown** | → `crypto-only` (default) | **INDETERMINATE → DENY** (LLN-GOV-3VL-001) |
| true | false | sig/revocation fail | → `crypto-only` | **DENY** |

(A malformed/absent payload is treated as a secret — fail-closed.)

## 5) THE CRYPTO-ERASE WITNESS — minimal sound structure  `[RD-0118-O3]`

Canonical pre-image (sorted-keys JSON, the same `canonical()` as `photonic-admission.ts`); **reuses shipped primitives, no new crypto.**

**Fields:** `schemaVersion:"logicn.crypto-erase-witness.v1"` · `chainId`+`epoch` (reuse `history.ts` anti-rollback) · `dekId = sha256(keyCommit(kaead))` (binds the EXACT key destroyed without exposing it — SHAKE256 commitment) · `sealBindingRoot = tmxRoot` of the ciphertext the DEK gated (binds WHAT became unrecoverable) · `custodyClass:"sole-no-copy"` · `bottomSubstrate:"overwrite"` + `bottomEraseAttestation` (**required** — a crypto-only DEK substrate is a fail-closed reject) · `nonce` · `monotoneFloor`/`trustedHead` (freshness via `enforceFreshness`) · `signerKeyId` (same revocation check) · `signature` (Ed25519 v0).

**Invariants (each fail-closed; any missing → INDETERMINATE → deny):**
- **I1 DESTRUCTION-IS-CONSTRUCTIVE** — soundness comes from I2–I5; the signature only *authenticates* them. Never accept a bare `destroyed=true`.
- **I2 SOLE-CUSTODY** — exactly one DEK copy, never escrowed/exported/HA-replicated/paged.
- **I3 BOTTOM-TURTLE OVERWRITE** — the key lived only on attested-overwritable silicon; terminates the recursion (closes "turtles all the way down").
- **I4 SEAL-BEFORE-WRITE** — only KEM-DEM ciphertext touched the immutable medium (reuse the Stage-1 SealTaint sink). This is what makes key-destruction = data-erasure.
- **I5 FRESHNESS** — epoch monotone + nonce + optional trusted-head (reuse `enforceFreshness`); no witness replays.
- **I6 RATCHET-LEAF** — the destroyed key is a leaf, not an internal node whose descendants regenerate (depends on `history.ts` §2 ratchet, currently DEFERRED).
- **Result binding:** set `HIST_FLAG.ERASED` (bit2, under the signed Merkle root) for that epoch.
- **Signing:** Ed25519-only is a SOUND v0 floor (the live threat is forgery-of-authorship, which Ed25519 resists); hybrid ML-DSA-65 is the slice-4 upgrade — **bump the schema version when the hybrid key persists, never silently swap** (Guardrail A / design-stability posture).

## 6) BUILDABLE-NOW vs HW-GATED  `[RD-0118-O3]`

**Buildable NOW on digital silicon (no storage hardware):** (i) the `eraseModel` manifest field + capability-axis split in `photonic-admission.ts` (descriptor widening over the shipped 4-gate rail); (ii) **Stage-1 compiler trap** (crypto-only storage sink on the SealTaint lattice); (iii) **Stage-3 witness struct + verifier** (canonical pre-image, Ed25519, `dekId` from `keyCommit`, `sealBindingRoot` from `tmxRoot`, freshness via `enforceFreshness`, revocation via the shared registry, K3 via `decideAtBoundary`, `HIST_FLAG.ERASED` binding — all shipped); (iv) the default-on-unknown=crypto-only collapse (already `decideAtBoundary(INDETERMINATE)→DENY`); **(★ DONE)** the Stage-2 decision core (`admitSubstrateWrite`).

**The non-aspirational digital append-only instance:** crypto-erase is **real today** without any exotic medium — the `.tmf` anti-rollback history chain (`HIST_FLAG.ERASED` under a signed root) and **S3 Object-Lock / WORM buckets** are digital append-only/immutable sinks that already exist. So `eraseModel="crypto-only"` has a concrete, shippable target (a DEK on overwritable silicon + ciphertext to an Object-Lock bucket) **before any holographic hardware ships** — most of the directive is buildable now.

**HW-gated (#102-106):** Stage-2 physical route-refusal at a real WORM/holographic dispatch seam; the **physical-swap TOCTOU closure** (hardware device-identity re-challenge — the single genuinely HW-gated primitive); I3's bottom-turtle *hardware* sanitize attestation (NIST 800-88 Clear/Purge on the silicon); I6's per-epoch ratchet (`history.ts` §2, DEFERRED).

## 7) HONESTY NOTE

What is real today is the **governance scaffolding**, not the physical enforcement: the 4-gate signed-admission rail, the K3 fail-closed collapse, the KEM-DEM seal, the anti-rollback history chain with the `ERASED` flag under a signed Merkle root, the SealTaint taint lattice, a digital append-only sink, and the built decision core — all bit-exact silicon, all extendable into LLN-RETAIN-001 by descriptor-widening + wiring, **no new crypto and no new science** (0-patents / defensive-pub). What is **not** real today and must not be overclaimed: there is no physical write path to WORM/holographic media, no hardware root-of-trust to bind an attestation to a *live medium* (so the physical-swap TOCTOU is genuinely open until #102-106), no hardware sanitize-attestation for the bottom-turtle silicon (the in-RAM zeroize is *best-effort on a GC VM* — confirmed in `kemdem.ts`), and no per-epoch key-erasure ratchet (`history.ts` §2 DEFERRED). The directive's value today: it makes the LLN-RETAIN-001 obligation **unviolatable-by-silence** and ships every digital piece; the medium-binding hardware lands when a real storage-admission substrate exists. Default-on-unknown stays `crypto-only` precisely because that hardware is absent.

**Ordered next builds (all CPU-now):** ① `eraseModel` field + `storage.admit` capability split — **✅ DONE** (`admitStorageSubstrate`, commit `1642f3e`) → ② wire `admitSubstrateWrite`'s `attested` input to that signed gate — **✅ DONE** (the rail returns a `SubstrateDescriptor` that feeds the write gate; lying-drive attack closed end-to-end, 20/20) → ③ Stage-1 compiler trap (SealTaint storage sink) — owner-gated → ④ Stage-3 crypto-erase witness struct + verifier (golden-fixable) — owner-gated. The physical Stage-2 seam + TOCTOU medium-binding stay HW-gated (#102-106).
