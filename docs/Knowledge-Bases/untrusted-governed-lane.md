# The Untrusted Governed Lane

**Date:** 2026-06-25 · **Posture:** Govern-Don't-Absorb · fail-closed · crypto-on-core (SPORE-SUBSTRATE-001)
**Companions:** [`galerina-zero-trust-core-relaxation-analysis-2026-06-24.md`](galerina-zero-trust-core-relaxation-analysis-2026-06-24.md) · [`ai-as-untrusted-reasoning-worker.md`](ai-as-untrusted-reasoning-worker.md) · [`untrusted-file-asset-processing.md`](untrusted-file-asset-processing.md)

> **One sentence:** the Untrusted Governed Lane is where Galerina runs fast, exotic, or externally-authored
> **work** — *without trusting it* — by keeping the **decision** in a small exact core and letting the
> untrusted result only ever **lower** a verdict, never raise it.

This is the architectural answer to "can we get the cool new tech (photonics, ML, JIT, external code)
without lowering the zero-trust core?" **Yes — admit it as an untrusted lane, don't absorb it into the
core.** Lowering the core trades a permanent, *systemic* security loss for a benefit you can already get a
safer way.

---

## 1. The split: Decision vs Work

Every governed operation `O` decomposes into two parts that live in two different places:

| | **Decision `D`** | **Work `W`** |
|---|---|---|
| What | the verdict, the crypto, the determinism | the compute, the storage, the inference |
| Where | the small **TRUSTED CORE** | the **UNTRUSTED GOVERNED LANE** |
| How | exact · digital · bit-reproducible · fail-closed | fast · may be analog / probabilistic / external |
| If wrong | a wrong decision is a breach | a wrong result is *caught* + degraded |

> **Keep the decision exact and digital. Offload the work to whatever is fastest. Verify the work cheaply.**

The lane is "governed" because nothing enters or leaves it without passing the core's exact gates. It is
"untrusted" because the core never *assumes* the lane is correct — it *checks*.

---

## 2. The maths (three invariants that make it safe)

Let the K3 verdict domain be `V = {−1, 0, +1}` = `{DENY, UNKNOWN, ALLOW}`, ordered `−1 < 0 < +1`.

### (a) Admission predicate — exact, in the core, fail-closed
Untrusted work `W` is admitted to run only if **all** of these hold (each is exact and digital):

```
  admit(W)  =  pin(hash(W)) ∧ verifySig(W) ∧ ¬revoked(key(W)) ∧ capBounded(W)
```

Any clause UNKNOWN ⇒ `admit = 0` ⇒ the lane does not run (deny-by-default). There is no probabilistic
"probably-fine" admit — admission is a Boolean computed by the trusted core.

### (b) No-Coercion — the load-bearing invariant
The untrusted lane contributes a trit `t ∈ V` (its attested/observed signal). It combines with the core's
verdict `v ∈ V` by three-valued AND, which is `min`:

```
  vAnd(v, t)  =  min(v, t)        and therefore        min(v, t) ≤ v        ∀ v, t
```

So the untrusted operand can **only pull the verdict down** (toward DENY), **never up**. A *compromised,
buggy, or adversarial* lane can at worst cause a **false-DENY** (a safe availability cost) — it can
**never** manufacture a **false-ALLOW**. This is what lets us run untrusted code at all: its blast radius
is bounded *by algebra*, not by hope.

> Corollary (degrade-only telemetry): an untrusted *measurement* `m` (tolerance, path-deviation,
> confidence) discretizes into the codomain `{−1, 0}` — it is **never** allowed to emit `+1`. It can deny,
> it can abstain, it cannot grant.

### (c) Cheap-verify — the core checks the work without redoing it
The core does not trust the lane's result `R`; it verifies `R` with a check **asymptotically cheaper** than
recomputation. Canonical example (Freivalds) for an offloaded matrix product `C = A·B`:

```
  pick random r ;   accept  C  iff   A·(B·r)  ==  C·r        // O(n²) check of an O(n³) product
```

The expensive multiply ran in the untrusted lane (photonic / GPU / NPU); the *verification* ran in the
trusted core. Wrong result ⇒ check fails ⇒ verdict degrades (No-Coercion) ⇒ fail-closed.

---

## 3. The line diagram

```
            TRUSTED CORE  (small · exact · digital · bit-reproducible · fail-closed)
            ┌────────────────────────────────────────────────────────────────┐
            │   verdict v ∈ {−1,0,+1}      crypto (SHA-256 + hybrid sig)       │
            │   determinism / proofs       capability registry · revocation   │
            └──────────▲─────────────────────────────────────────┬────────────┘
                       │                                          │
        signed admission  A = 1                      vAnd(v, t) = min(v, t) ≤ v
   pin(hash) ∧ verifySig ∧ ¬revoked ∧ capBounded      No-Coercion: t only LOWERS v
   (any UNKNOWN ⇒ A = 0, lane never runs)             (false-DENY possible, false-ALLOW impossible)
                       │                                          │
                       │            cheap-verify R (Freivalds)    │
                       ▼                  ▲                       │
            ┌──────────┴──────────────────┴───────────────────────┴──────────┐
            │   UNTRUSTED GOVERNED LANE  (fast · exotic · external)            │
            │   photonic T-MAC · GPU/NPU inference · storage substrate ·       │
            │   AI reasoning worker · JIT/dynamic codegen · 3rd-party module   │
            │   produces:  result R   +   trit t   (both checked at the border)│
            └─────────────────────────────────────────────────────────────────┘
```

The lane touches the core at exactly two seams, both guarded:
- **IN:** signed admission `A` (nothing runs unadmitted).
- **OUT:** `min`-combination of the result-trit `t` (nothing the lane returns can raise authority).

---

## 4. Worked examples

### 4.1 Photonic / analog co-processor (`galerina-ext-photonic-emulator`)
- **Work (lane):** a ternary multiply-accumulate runs on a photonic PPU — fast, analog, *not* bit-exact.
- **Decision (core):** Freivalds-verifies the returned product; the analog tolerance discretizes to a
  degrade-only trit (`vAnd`). Crypto + the governance verdict stay digital.
- **Result:** you get the throughput where it's safe (the math), and an *irreproducible* analog value can
  never become a *reproducible* security decision. (`executedNatively=false` is stated honestly.)

### 4.2 AI as an untrusted reasoning worker (`ai-as-untrusted-reasoning-worker.md`)
- **Work (lane):** an LLM *proposes* a contract, a plan, or generated code.
- **Decision (core):** the proposal is admitted only after it passes the *same fixed* governance gates as
  any human-authored artifact (effect-checker, signed admission, capability bound). **The AI cannot confer
  capability** — every artifact it produces meets the same O(1) gates; its soft spot is only the
  human/key grant boundary, which stays in the core.
- **Result:** you get AI-speed authoring with zero AI-trust — a malicious or hallucinating model produces
  an artifact that simply fails admission.

### 4.3 Untrusted storage substrate / file & asset processing (`untrusted-file-asset-processing.md`)
- **Work (lane):** data lives on / is processed by an untrusted device or parser.
- **Decision (core):** integrity + decryption verified on read; a tampered blob fails the check → fail-closed.
- **Result:** cheap, fast, commodity storage; the *trust* is in the digital MAC, not the device.

### 4.4 The non-negotiables (what never moves into the lane)
- Crypto + bit-exact determinism stay **digital** (reproducible proofs).
- Security / authority verdicts stay **exact + fail-closed** (no probabilistic "allow").
- **No unsigned code execution** — signed-admission is the spine; JIT/dynamic codegen is admitted as
  *signed* work or not at all.

---

## 4.5 Worked example — how a developer actually uses the lane for maths

A developer opts a flow's *work* onto the untrusted (low-trust) lane with a `substrate {}` block in its
contract. The block is the **declared guarantee** the runtime must verify; the lane is admitted, never
trusted. This compiles + verifies today (the behaviour is pinned by `substrate-contracts.test.mjs`).

```spore
// The WORK runs on the photonic lane (fast, analog, NOT bit-exact). It carries the VALUE (a score),
// never the DECISION. `tolerance` is the guarantee the runtime cheap-verifies; `redundancy` majority-votes
// the noisy reads (NMR); the resilience handler degrades to exact digital fail-closed.
guarded flow scoreBatch(features: Tensor<Float,[256]>) -> Float
contract {
  intent { "rank a batch on the photonic co-processor — value-only, governed" }
  effects {}                                  // pure compute: no crypto, no network, no ledger
  substrate {
    lane: photonic                            // ← the UNTRUSTED lane: admitted, never trusted
    tolerance: 5e-3                            // the declared guarantee (runtime verifies, Freivalds-style)
    redundancy: 3                             // NMR — majority-vote the analog reads
  }
  resilience {
    on_substrate_fault fallback scoreBatchDigital   // degrade-only: noisy → fall back to exact digital
  }
}
{
  return Tensor.dot(features, weights)        // the high-value batched MAC the photonic lane is good at
}
```

The line the lane may **not** cross — the *decision* stays digital, enforced at compile time:

```spore
secure flow sealResult(score: Float) -> Result<Receipt, ApiError>
contract {
  effects { crypto.sign }
  substrate { lane: photonic  tolerance: 5e-3 }   // ← COMPILE ERROR: SPORE-SUBSTRATE-001
}
{ return Ok(sign(score)) }
// crypto.sign on a noisy (photonic) lane is REFUSED — "crypto stays on the digital, bit-exact lane".
```

So the developer's mental model is exactly the two seams of §2–§3: put the *maths* on `lane: photonic`
(value-only, tolerance-bounded, degrade-only via `on_substrate_fault`), and the compiler **guarantees** the
*decision* (crypto, the verdict) can never follow it onto the untrusted lane. That is why this component
scores **low trust but high ZT-alignment** — it's untrusted *by construction*, and the fail-closed border is
the language, not a convention.

## 5. How the lane merges into the rest of Galerina

| Construct | Role as a lane seam |
|---|---|
| `admitPhotonicConfig` / `admitStorageSubstrate` / Tier-3 rails | the **IN** seam — hash-pin + signature + revocation + capability |
| K3 governance verdict (`three-valued-governance.ts`, `vAnd = min`) | the **OUT** seam — degrade-only `min`-combination (No-Coercion) |
| `bridge-attestation` / capability registry / `revocations.json` | what the admission predicate consults |
| `@experimental_profile` flows | per-flow opt-in to riskier lane features, *still* gated fail-closed — risk contained to the opting flow, not the core |
| Tri-Pipe / ExecutionRouter | the dispatcher that routes *work* to a lane while the *verdict* path stays binary/digital |
| PartitionDecider (`galerina-ext-photonic-emulator`) | refuses a net-loss offload (stay in-core) — degrade-only, Freivalds-cheap-verify |

**The merge rule:** to make Galerina "a lot better," **govern more tech, don't trust more tech** — add
admission rails (more lanes), never lower the core. Each new substrate is one more untrusted lane behind the
same two seams; the trusted core's guarantees are unchanged.

---

## 6. Diagram

See [`docs/diagrams/galerina-untrusted-governed-lane.svg`](../diagrams/galerina-untrusted-governed-lane.svg) for
the rendered version, and [`docs/diagrams/README.md`](../diagrams/README.md) for how it fits the diagram set
(it is the security-architecture companion to `galerina-tri-pipe.svg` and `galerina-runtime.svg`).
