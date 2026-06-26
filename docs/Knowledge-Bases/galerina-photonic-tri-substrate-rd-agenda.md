# Galerina R&D Agenda — Governing Photonic / Ternary Substrates

**Status:** research agenda (KB-first). No code yet. This doc defines the problem space, the
boundary, prior art, how each direction maps onto *existing* Galerina machinery, and acceptance
tests — so a later spike starts from a discharged design, not a blank page.
**Date:** 2026-06-15.
**Provenance:** follows the TMX-256 / TriMerkle-XOF boundary review (`notes/31`, `notes/32`,
`notes/33`). That review established what Galerina must **not** do (absorb a separate project's crypto
or hardware). This agenda establishes what it legitimately **can** do.
**Guardrails (binding):** Galerina stays a TypeScript-like `flow` + `contract` language; no Rust/Zig
in core; no invented crypto (keep FIPS SHA-256 + ML-DSA-65); no coupling to TritMesh/`.tmf`.

---

## 0. The thesis, stated honestly

Photonic and ternary (multi-valued) computing are **real but immature** research substrates:
optical matrix accelerators (analog, for ML-style bulk linear algebra) and multi-valued-logic
research. They are immature in *exactly the dimension Galerina exists to address*: a novel substrate
arrives with novel failure modes and **no trust/verification toolchain**.

Galerina's differentiator — *governance declared in source, enforced by tooling, fail-closed* — gets
**more** valuable as a substrate gets **harder to trust**. So the defensible R&D lane is:

> **Galerina as the governance / verification / containment layer that makes an emerging
> photonic/ternary substrate trustworthy — without becoming the hardware or inventing the crypto.**

This is not a pivot. It is the existing mission aimed at the frontier. The TMX detour is the
cautionary tale: it tried to *absorb* the substrate's primitives (a tree hash, lattice ops as
addresses) instead of *governing* them. Governing them is the Galerina-shaped move.

### In scope vs out of scope

| In scope (governance layer) | Out of scope (someone else's project) |
|---|---|
| Modeling substrate failure modes as contract obligations | Designing photonic hardware / an ALU |
| Three-valued (allow/deny/unknown) governance, proved fail-closed | Inventing a new hash/signature primitive |
| Tolerance + redundancy contracts the verifier can check | Coupling to `.tmf` / TritMesh internals |
| Forcing crypto/integrity onto a deterministic core | Throughput claims that need hardware we don't have |
| A *simulated* substrate model in the verifier (software) | Claiming current Galerina runs on photonics |

---

## 1. The hard problems of photonic/ternary substrates (the "issues to find and tackle")

These are the substrate properties a governance layer must confront. Each maps to a direction below.

1. **Non-determinism / analog noise.** Photonic compute is analog — phase drift, thermal/shot
   noise, crosstalk. Results are *probabilistic*, not bit-exact. This breaks the bedrock assumption
   of deterministic execution **and** of cryptography (which demands bit-exactness).
2. **Indeterminacy is first-class.** On a noisy or ternary substrate, "we don't yet know" is a real
   runtime state, not an error. Binary allow/deny has nowhere to put it. Balanced ternary
   (`-1/0/+1`) has a natural home: `0` = neutral / abstain / indeterminate.
3. **No memory protection / no capability model.** Novel substrates often have flat memory, no MMU,
   no process isolation — precisely the gap Galerina's capability + effect system already fills.
4. **Verification gap.** No formal toolchain reasons about photonic failure modes *as part of
   program correctness*. Today you find out by running it on silicon that doesn't exist yet.
5. **Crypto cannot be analog.** A corollary of (1): hashing/signing must be bit-exact, so it cannot
   run on a noisy lane. *Where* crypto runs becomes a safety property worth enforcing.

---

## 2. Existing Galerina assets these directions build on (grounded)

This agenda is cheap because the seeds already exist in-tree:

- **Balanced-ternary ops** — `galerina-tower-citizen/src/tpl-simulator.ts` (#173/#196):
  `negTrit / sumTrit / xorTrit / carryTrit / addTrit / mulTrit / minTrit / maxTrit / consensusTrit`
  (`-0`-normalized). **`consensusTrit` is already a majority/agreement primitive** — the kernel of
  redundancy voting.
- **Governance verifier + effect/value-state(taint)/capability checkers** — the enforcement spine a
  new obligation plugs into.
- **Strict security profile** — already forbids unbounded loops / recursion / non-determinism; the
  natural hook for "determinism/tolerance contracts."
- **Tiered runtime with per-result tier telemetry** — already records *which* tier executed a
  result; a substrate/lane dimension is a small extension of an existing idea.
- **V_DPM capability bitmask + sentinels** (`sentinel-time/power/state/egress`, #130–#136) — runtime
  monitors whose remit (timing, power, state regression) overlaps analog-substrate health signals.
- **FIPS crypto already correct** — SHA-256 integrity + Ed25519/ML-DSA-65 signing over the digest
  (`manifest-generator.ts`), the deterministic core that Direction B protects.

---

## 3. Direction A — Three-valued (ternary) governance logic  *(recommended first)*

### Problem
Galerina governance is effectively two-valued (allow / deny). But proofs can be *undischarged*,
evidence *incomplete*, posture *uncertain*, and a ternary substrate emits a literal `0`. Collapsing
all of that into "deny" loses information; collapsing it into "allow" is unsafe. Make the third
value **first-class and proved**.

### Prior art (accurate, named)
- **Kleene three-valued logic** (strong K3): `TRUE / FALSE / UNKNOWN` with conservative propagation
  (`UNKNOWN ∧ FALSE = FALSE`, `UNKNOWN ∨ TRUE = TRUE`, else `UNKNOWN`). The formal model.
- **Łukasiewicz** Ł3 (different implication) — the alternative if we need a designated-value algebra.
- **SQL `NULL`** — three-valued logic *in production for decades*: `WHERE` returns a row only when
  the predicate is `TRUE`; `UNKNOWN` rows are excluded. A real-world "unknown ⇒ exclude/deny"
  precedent to point compliance reviewers at.
- **Abstaining / reject-option classifiers** (ML) — formalizing "decline to decide."
- **OPA `undefined` results** and **Cedar's explicit deny-by-default** — policy-engine framing of
  the same gap, but neither offers a *proved* three-valued fail-closed calculus.

### Mapping onto Galerina
- Represent a governance verdict as a trit: `+1 = allow`, `-1 = deny`, `0 = indeterminate`.
- Reuse `tpl-simulator` ops (`minTrit` = Kleene ∧, `maxTrit` = Kleene ∨, `negTrit` = ¬) so the
  calculus is *already implemented* at the bit level.
- The governance verifier composes clause verdicts with Kleene ∧/∨, then applies a **collapse rule
  at the trust boundary**: `collapse(0) = deny`.

### The theorem to prove (the whole point)
> **Fail-closed soundness:** `∀ verdict v. authorize(v) ⇔ v = +1`. Equivalently `collapse(0) =
> collapse(−1) = deny`. No indeterminate verdict can ever authorize, and `0` cannot be silently
> coerced to `+1` anywhere in composition.

### Sketch
- A `decision` value type with three states; verifier emits `0` when an obligation is undischarged.
- New diagnostic, e.g. `SPORE-GOV-3VL-001`: "indeterminate verdict reached a trust boundary →
  collapsed to deny" (audited, not silent).
- Truth-table oracle tests (Galerina already has this pattern — #166/#185) over the full 3×3 space.

### Acceptance tests
1. Kleene ∧/∨/¬ tables match `min/max/negTrit` for all 9/9/3 cases.
2. Property: no input assignment yields `authorize = true` unless every contributing clause is `+1`.
3. An undischarged proof obligation produces `0`, audited, and denies.
4. Differential: existing two-valued policies behave identically when no `0` arises (no regression).

**Difficulty:** medium. **Risk:** low (pure software, seeds exist). **Leverage:** high — novel,
defensible, and the foundation B and C stand on.

---

## 4. Direction B — Substrate-tolerance & redundancy contracts

### Problem
If a flow runs on a noisy/analog lane, "correct" means "within a declared error envelope, with
declared redundancy" — and crypto must be *forbidden* on such a lane. Today nothing lets a flow
*declare* this, and nothing checks it.

### Prior art
- **Triple-Modular Redundancy (TMR) / N-modular redundancy** (von Neumann) — three lanes + majority
  vote; standard in avionics/space. **`consensusTrit` already is the 3-input majority primitive.**
- **DO-178C / DO-254** — safety-critical assurance levels; the vocabulary for "declared tolerance +
  mitigation ⇒ assurance."
- **Approximate computing** and **probabilistic assertions** (e.g. *Expressing & verifying
  probabilistic assertions*; `Uncertain<T>`) — declaring and statically reasoning about error/noise.

### Mapping onto Galerina
- A `substrate { lane: photonic|digital; tolerance: <bound>; redundancy: tmr|none }` (or a
  `tolerance {}` sub-block) on a flow/contract — parsed by Stage A like other contract blocks.
- Verifier obligations:
  - **B1 — Crypto-on-core invariant:** any flow with effect `Crypto`/`Hash`/`Sign` **must** be
    `lane: digital`. Violations → `SPORE-SUBSTRATE-CRYPTO-ON-NOISY`. *This is the honest, durable
    insight from the entire TMX thread, expressed as an enforceable rule:* bulk compute may be
    photonic; integrity must stay on a deterministic core.
  - **B2 — Redundancy sufficiency:** if `tolerance` is tighter than the lane's modeled noise (Dir.
    C), require `redundancy: tmr` and a `consensusTrit`-style vote, else deny.
  - **B3 — Determinism preservation:** a `tolerance` flow may not feed an un-voted analog result
    into a context that the strict profile requires to be deterministic.

### Acceptance tests
1. A flow declaring `Hash` on `lane: photonic` is rejected (`SPORE-SUBSTRATE-CRYPTO-ON-NOISY`).
2. A tight-tolerance flow without TMR is rejected; adding a `consensusTrit` vote admits it.
3. A voted analog result is accepted into a deterministic sink; an un-voted one is not.

**Difficulty:** medium-high (new contract surface). **Risk:** medium. **Depends on:** A (verdicts)
+ C (noise model for B2). **Leverage:** high — the crypto-on-core rule alone is a crisp, shippable
guarantee.

---

## 5. Direction C — Substrate failure-mode model in the verifier (simulation, not silicon)

### Problem
"Find issues with photonic/tri and tackle them" — *before the hardware exists* — means modeling its
failure modes in software and letting the verifier reason against them. No silicon dependency.

### Prior art
- **Abstract interpretation** (Cousot) — sound static reasoning over an abstracted value domain;
  here the abstraction is "value ± modeled noise."
- **Fault injection** and **runtime verification (RV)** — systematically perturbing/observing to
  surface failure modes.
- **Photonic-noise modeling** (phase drift, crosstalk, shot/thermal noise) from the optical-compute
  literature — captured as parameters, not as hardware.

### Mapping onto Galerina
- Extend `tpl-simulator.ts` into a **substrate model**: parameters for phase-drift, crosstalk, and
  lane-failure probability, applied to trit/analog operations.
- The verifier runs each `substrate`-annotated flow against the model and emits `SPORE-SUBSTRATE-*`
  diagnostics when the flow's *declared* guarantee (Dir. B tolerance) is **not provable** under the
  modeled noise.
- Output doubles as the **spec a future photonic backend must satisfy** — the model is the contract
  the hardware is later held to.

### Acceptance tests
1. A flow whose tolerance is unachievable under the modeled noise is flagged at compile time.
2. Raising redundancy (TMR) until the guarantee holds clears the diagnostic — monotonic, explainable.
3. The model is deterministic and seeded (reproducible builds: no `Math.random` — inject a seed),
   consistent with Galerina's determinism rules.

**Difficulty:** medium. **Risk:** low-medium (self-contained, software). **Leverage:** medium-high —
turns an aspiration ("governs photonics") into testable artifacts today.

---

## 6. Non-goals (explicit)

- ❌ Designing photonic hardware, an ALU, or a systolic/tensor fabric.
- ❌ Inventing crypto primitives (TMX/TriMerkle, lattice-as-address). Keep **SHA-256 + ML-DSA-65**.
- ❌ Coupling Galerina to `.tmf` / TritMesh internals (separate project — `notes/31–33`).
- ❌ Performance/throughput claims contingent on hardware not in the tree.
- ❌ Adding Rust/Zig to core, or changing Galerina away from TS-like `flow`+`contract`.

---

## 7. Recommended sequencing

1. **A first** — three-valued governance logic. Smallest, most grounded (seeds exist), highest
   leverage, and the algebra B and C reuse. Deliverable: a formal-spec doc + truth-table oracle
   tests + the collapse-rule diagnostic.
2. **C next** — the substrate noise model (needed to give B2 something to check).
3. **B last** — tolerance/redundancy contracts, with the **crypto-on-core invariant (B1)** pullable
   forward independently as a quick, crisp win even before the full model lands.

Each step is a contained spike behind its own KB sub-spec and acceptance tests — the Galerina way.

## 8. Open questions

- Kleene (K3) vs Belnap four-valued (`both`/`neither`) — does an audit ever need to distinguish
  "conflicting evidence" from "no evidence"? Start K3; revisit if audits demand FOUR.
- Does `tolerance` belong on `flow`, on `contract`, or as its own `substrate {}` block? (Lean: its
  own block, consistent with `resilience {}` / `observability {}`, #58.)
- How does a voted analog result get represented in the type system so downstream determinism proofs
  see it as deterministic-after-vote?

## 9. Cross-references

`notes/31` (ML-DSA≠hash boundary) · `notes/32` (TMX explainer) · `notes/33` (non-transfer evidence) ·
`tpl-simulator.ts` (#173/#196 ternary ops) · `#166/#185` (truth-table oracle pattern) ·
`#58` (resilience/observability contract sub-blocks precedent) · `manifest-generator.ts` (FIPS crypto core).
