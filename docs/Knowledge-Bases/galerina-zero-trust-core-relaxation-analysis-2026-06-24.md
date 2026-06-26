# Should we lower the zero-trust core to allow interesting new tech? — analysis

**Date:** 2026-06-24 · **Posture:** Govern-Don't-Absorb · fail-closed · crypto-on-core (SPORE-SUBSTRATE-001)
**Companion:** [`galerina-why-no-resolve-construct-the-maths-2026-06-24.md`](galerina-why-no-resolve-construct-the-maths-2026-06-24.md)

> Owner: *"if we lowered the ZT core a little we could allow some interesting new technology in to make Galerina a lot better — discuss."*

**Verdict: don't lower the core — enrich the untrusted zone. You get the same new tech with none of the trust.** The premise hides a false tradeoff: Galerina's architecture is *specifically designed* to admit exotic, fast, even probabilistic technology **without** trusting it. Lowering the core trades a permanent, systemic security loss for a benefit you can already obtain a safer way.

---

## 1. Where strict ZT genuinely costs something (steelman)

Honest accounting — strict ZT is not free:

| Strict rule | Real cost it imposes |
|---|---|
| Fail-closed everywhere | availability cost — uncertainty denies some legitimate flows |
| Crypto + determinism stay digital | exotic accelerators (photonic/analog) locked out of the security-relevant hot path |
| Deny-by-default empty-set | zero-config UX friction — everything needs an explicit grant |
| In-process trusted core | can't offload the verifier to faster untrusted hardware |

These are real. The question is whether *lowering the core* is the right way to recover them. It isn't.

## 2. The tempting tech — and why lowering the core to get it is a net loss

| Tempting tech | Gain | Why core-lowering to get it is a trap |
|---|---|---|
| Analog/photonic in the **trusted** path | throughput | breaks bit-exact determinism → no reproducible proofs; an irreproducible governance decision is not a decision |
| **Probabilistic / ML** governance verdicts | adaptive, flexible | a 99%-confident "allow" is a **1% breach rate**; security verdicts must be exact, not calibrated |
| **Speculative** execution before the verdict | latency | speculative side-effects can leak *before* a DENY fires |
| **JIT / dynamic** codegen | speed | unsigned code execution — breaks signed-admission, the spine of the model |

Each gain is real; each cost is a *systemic* hole, not a local one. Lowering the core is a bad trade because the loss is permanent and global while the gain is local.

## 3. The key realization — Govern-Don't-Absorb already gives the upside

You almost never need to lower the core, because the architecture already admits risky tech as **untrusted Tier-3 co-processors** behind signed, fail-closed admission rails (`admitPhotonicConfig`, `admitStorageSubstrate`, the proposed `toleranceWitness`). The invariant that makes this safe is **No-Coercion**: an untrusted operand combines by `min`, so it can only *lower* a verdict, never raise it (`vAnd(v,t)=min(v,t) ≤ v`). Therefore:

> Keep the **decision** (verdict, crypto, determinism) in the small trusted core.
> Offload the **work** (compute, storage, inference) to fast untrusted substrates.
> Verify cheaply (Freivalds-style), attest with signatures, degrade-only.

You get the throughput / new substrate / ML inference *where it is safe* (the work), while the part that must not be wrong (the decision) stays exact.

## 4. Recommendation — expand the admission surface, not weaken the core

Make Galerina "a lot better" by **governing more tech, not trusting more tech**:

1. **More Tier-3 signed-admission rails** — generalize the photonic/quantum/storage pattern so any new substrate is admitted by hash-pin + signature + revocation + capability, degrade-only.
2. **Opt-in `@experimental_profile` flows** — let a flow use riskier features *while governance still gates it fail-closed*; the risk is contained to the flow that opted in, not the core.
3. **Split decision-from-work everywhere** — offload heavy compute; keep the verdict exact and digital. Cheap-verify the offloaded result.

This recovers most of §1's costs (throughput, new substrates, adaptivity) by enriching the **untrusted** zone — with zero change to the trusted core's guarantees.

## 5. The line that must never move (non-negotiables)

- **Crypto + bit-exact determinism stay digital** (reproducible proofs).
- **Security / authority verdicts stay exact + fail-closed** (no probabilistic "allow").
- **No unsigned code execution** (signed-admission is the spine).
- **Deny-by-default for authority** (the empty obligation set is "unknown," not "allowed").

Everything else is negotiable **through** governance, never by weakening it.

## Bottom line

"Lower the core" should be re-read as "expand the admission surface." Same interesting new tech, none of the trust. The most-secure choice is to make the **untrusted zone richer**, never the **trusted core weaker**.
