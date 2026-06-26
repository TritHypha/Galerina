<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/privacy/privacy-governance-v0.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Privacy as a Governed, Compile-Time Primitive — design v0

**Status:** R&D design (2026-06-16). Charter: [`../RESEARCH-PHASE-privacy-governance.md`](../RESEARCH-PHASE-privacy-governance.md).
**Posture (binding):** grounded, cited, adversarially verified; honest-core vs aspirational kept separate; **no
perf number without a reproducible benchmark + the machine**; **no invented crypto**; fail-closed
(`unknown → deny`). **The lane:** Galerina *governs* privacy (who / where / purpose / how-much) at compile time;
the privacy/DP **mechanisms** (noise, anonymization) stay **vetted host libraries** — the exact crypto-on-core
analogue (`SPORE-SUBSTRATE-001`): *Galerina owns the policy, the host owns the math.*
**Builds on (shipped):** `SPORE-SECRET-002` (secret/derived-secret egress), `SPORE-PRIVACY-002` (cleartext-embedding
egress / SealTaint), the parsed `privacy {}` contract block, taint propagation, the capability/effect model, and
tri-encryption **verdict 5** (no leak-free in-network semantic routing → encrypt + filter at trusted endpoints).

> **The thesis in one line:** no mainstream language tracks a **differential-privacy budget** or a **collection
> purpose** in its type/effect system. Doing so — deny-by-default, checked at compile time, mechanisms delegated
> to OpenDP — is a defensible, standards-backed product gap (language-level GDPR/DP), without inventing crypto.

---

## 0. What ships per direction (acceptance, charter §3)
Each direction below carries: a **worked accept/reject example**, a **threat model**, an **honest scoping note**
(what stays a host lib), and an **adversarial fail-open review**. Lead = **D1 + D2** (most novel; both are "the
existing taint/effect machinery + one label/cost").

---

## D1 — Differential-privacy budget as a governed effect (the standout)

Make **ε/δ a tracked, deny-by-default resource**. Each release over personal data debits a
compile-time-accounted budget; egress is blocked when the budget is exhausted (`over/unknown → deny`). DP is
rigorous and standards-backed (**NIST SP 800-226**, **OpenDP**); the *novel* part is accounting the budget in
the **effect/type system**, not at runtime in a library.

### D1.1 Syntax + the effect
```spore
privacy { budget epsilon: 1.0, delta: 1e-6 }     // per data-subject, per release-channel (declared scope)

// DP-emitting stdlib ops carry an epsilon-cost EFFECT (the mechanism is the vetted host lib, D1.5):
secure flow publishMeanAge(rows: PersonalData) -> Released
  effects { dp(epsilon: 0.4) }                     // declared cost, checked against the budget
{ return opendp.mean(rows, bounds, epsilon: 0.4) } // OpenDP does the noise; Galerina accounts the budget
```
The **effect-checker sums `dp(ε,δ)` costs per data-subject / per release-channel** and **denies the build** if a
path can exceed the declared budget. Under **basic sequential composition** (Dwork–Roth Thm 3.16) **both ε and
δ add**, so the checker sums δ alongside ε (a Gaussian-mechanism `dp()` carries δ > 0; a pure-ε / Laplace
mechanism carries δ = 0) — declaring a δ budget you don't account would be a silent leak. (Advanced composition
/ RDP tighten the bound — those stay the host lib's accountant; Galerina's static sum is a **sound
over-approximation**: it may over-charge, never under-charge.)

### D1.2 The loop / decidability boundary (TRAP 1 — fix stated explicitly)
Statically summing ε is trivial for straight-line code but **undecidable when a DP-emitting op sits in a loop
whose trip-count depends on runtime input** — the compiler cannot compute the final ε. **Rule (fail-closed):**
- A `dp(ε)` effect inside a loop whose bound is **not statically known is a compile error** (`SPORE-DP-003`,
  *effect-check*) — never assume a bound.
- It is allowed **only** with a **static upper-bound annotation** on the loop, and the checker charges
  `ε × upper_bound`:
  ```spore
  for r in shards bounded 8 {        // static upper bound REQUIRED for a dp() body
    publishMeanAge(r)                // charged 0.4 × 8 = 3.2 against the budget
  }
  ```
- If `0.4 × 8 > budget`, the build is **rejected** (over-budget), exactly as intended. No annotation ⇒ no
  DP-in-loop ⇒ deny.
- **`bounded N` must be compiler-*enforced*, not trusted.** `ε × N` is a sound charge only if the loop provably
  cannot exceed `N`, so the compiler either **proves** `N` from the loop form or emits a checked **trip-guard
  that fails closed** (traps) at iteration `N`. A merely-asserted bound the loop could overrun would under-charge
  ε — a fail-open; enforcement closes it.
This is the honest decidability line: the compiler refuses to guess an unbounded budget.

### D1.3 Declassification: a successful DP release downgrades the D2 purpose taint (TRAP 2 — the intersection rule)
Data collected for `purpose:"billing"` carries a D2 taint (below) that blocks it from an analytics sink. A
release through a **vetted DP mechanism carries a quantified, budget-debited privacy-loss bound**, and DP output
is robust to post-processing (Dwork–Roth) — so it may reach **aggregate** sinks. **Honest scope (NIST SP
800-226): DP is *not* anonymization** — a finite-(ε,δ) release still carries privacy loss and the output is not
legally non-personal; under GDPR it is *compatible further processing* (Art. 5(1)(b) + Art. 89), still governed.
So the declassifier downgrades to a **governed `aggregate`** label, **not** unconstrained `public`. **The one
sanctioned declassifier:**
> `dp_release(x, ε[, δ])` (a) **debits the budget** (D1.1) **and** (b) **downgrades the `purpose` taint to
> `aggregate`** — *iff* the noise is added by the **vetted host DP lib** (OpenDP) at the declared cost.
> Output of `dp_release` is `Released` (label `aggregate`), free to reach **aggregate** sinks — **not** arbitrary
> `public` egress (DP bounds privacy loss; it does not legally anonymize).

Declassification is **only** via `dp_release` (or an explicit, capability-gated, audited consent re-purpose,
D2.3). A bare cast that "removes the taint" without a real DP mechanism is **forbidden** (`SPORE-DP-004`,
*dataflow-taint*) — that is the laundering trap (D2 threat model). This rule is what makes D1 and D2 compose
instead of deadlock.

### D1.4 Worked accept/reject (the acceptance example)
```
budget epsilon = 1.0 (per subject, per channel "public-stats")
publishMeanAge(...)   dp(0.4)   -> spent 0.4   (0.4 <= 1.0)  ACCEPT
publishMeanAge(...)   dp(0.4)   -> spent 0.8   (0.8 <= 1.0)  ACCEPT
publishMeanAge(...)   dp(0.4)   -> spent 1.2   (1.2  > 1.0)  REJECT  SPORE-DP-001 (budget exhausted: 1.2 > 1.0)
```
The checker prints the running accounting and the exhausting call. The third release is a **compile error**, not
a runtime exception — the over-budget program does not build.

### D1.5 Honest scoping (what stays a host lib)
The **DP mechanism** (Laplace/Gaussian noise, clamping, the actual (ε,δ) math) is **OpenDP** (vetted, the
mechanism-on-core analogue). Galerina owns: the **budget ledger**, the **effect summation**, the
**declassification gate**, and the **fail-closed egress**. Galerina never implements a noise mechanism. **No perf
claim** is made; correctness of the mechanism is OpenDP's, audited there.

### D1.6 Threat model + fail-open review
| Threat | Mitigation / fail-open check |
|---|---|
| Budget under-count via dynamic loop | D1.2: dp() in an unbounded loop is a compile error; bounded loops charge ε×bound |
| Declassify without real DP (laundering) | D1.3: only `dp_release` via the vetted lib drops taint; bare casts forbidden (`SPORE-DP-004`) |
| Per-subject vs global budget confusion | budget scope is **declared** (`per subject` / `per channel`); cross-subject aggregation re-scopes; checker rejects ambiguous scope (`unknown → deny`) |
| Parallel composition mis-accounted (disjoint subjects) | static sum **over-approximates** (charges sequential); a tighter parallel bound is opt-in via an annotation the host accountant validates — never the other direction |
| Privacy loss is incurred at query, not at use | the **debit happens at the effect** (when the mechanism queries the data), not at consumption; discarding the result does not undo the query, so **no refund** (conservative) |
**Fail-open hunt result:** no path releases over budget; the only declassifier is the vetted DP gate; unbounded
loops and ambiguous scope both `→ deny`.

---

## D2 — Purpose limitation as types (GDPR Art. 5(1)(b) as dataflow)

Bind data to a declared **purpose** at collection; the compiler forbids data gathered for purpose X reaching a
sink serving purpose Y. A real regulatory need with **no** language-level solution today — and it is the
**existing taint/capability machinery + a `purpose` label** (the same engine as `SPORE-PRIVACY-002` SealTaint).

### D2.1 Worked accept/reject (the acceptance example)
```spore
let d = collect(form, purpose: "billing")     // d : Tainted<purpose="billing">
billing.charge(d)                              // sink purpose ⊇ {billing}     -> ACCEPT
analytics.send(d)                              // sink purpose {analytics}     -> REJECT  SPORE-PRIVACY-010 (purpose-limitation, dataflow-taint)
analytics.send(dp_release(d, 0.4))             // declassified to aggregate (D1.3) -> ACCEPT (and debits ε)
```
The purpose taint **propagates through derivations** (any value computed from `d` inherits the taint — the
SealTaint propagation already shipped), so copying/transforming does not strip it.

### D2.2 Sinks carry an allowed-purpose capability
A sink declares the purpose(s) it serves (`billing.charge` serves `{billing}`); egress is allowed iff the
data's purpose ⊆ the sink's served purposes. **Deny-by-default:** an undeclared sink serves `{}` ⇒ accepts
nothing. (This is the capability model with a purpose set.)

### D2.3 Declassification / re-purpose (the only escape hatches)
1. **`dp_release`** (D1.3) → purpose dropped to `aggregate`, ε debited (the vetted-DP path).
2. **Consented re-purpose** — an explicit, **capability-gated, audited** `repurpose(d, to:"analytics", consent: c)`
   where `c` is a verifiable consent token; emits an audit record. Without a valid consent capability it is a
   compile error (`SPORE-PRIVACY-011`). Never an implicit cast.

### D2.4 Threat model + fail-open review
| Threat | Mitigation |
|---|---|
| Purpose laundering (copy/serialize to strip taint) | taint propagates through all derivations incl. serialization boundaries (SealTaint); a sink reached by a tainted value fails closed |
| Implicit flows (branch on PII, leak via control flow) | **lightweight** control-flow taint only (the Jif/FlowCaml lesson, D3) — we tag the obvious implicit flows, we do **not** chase full non-interference (usability tax) |
| Undeclared sink | serves `{}` → accepts nothing (deny-by-default) |
| Re-purpose without consent | `repurpose` requires a consent capability; else compile error |
**Fail-open hunt:** the only ways tainted data reaches a foreign-purpose sink are the two audited declassifiers;
everything else is a compile error.

---

## D3 — A sensitivity lattice (generalize SealTaint; the *practical* slice of IFC)
A label lattice `public < internal < PII < PHI < secret/semantic` with **lightweight** information-flow control:
**label join/meet** on combination + an **egress gate per top label**. The Jif/FlowCaml lesson (academically
complete, **zero adoption**): ship the 80% (label propagation + egress gates — Galerina already has the engine),
**not** the 20% (full static non-interference) that kills usability. **Explicitly not** full non-interference.
- **Accept/reject:** joining `PII` and `internal` yields `PII`; emitting a `PII` value to a `public` sink is a
  compile error (`SPORE-PRIVACY-012`); the `secret/semantic` top label reuses the existing SealTaint egress gate
  (embeddings invert to plaintext — verdict 5, encrypt + endpoint-filter).
- **Scoping:** labels + propagation + per-label egress gate only. No declassification except via D1.3/D2.3.

---

## D4 — Retention / erasure as a governed lifecycle (crypto-erasure)
The `privacy {}` block already parses `retention N years`. Make it **enforced** with **crypto-erasure**: drop
the per-epoch key ⇒ data unrecoverable — reusing the **`.tmf` segmented-STREAM / history-chain ratchet**
(`tmf/spec/tmf-history-chain-v0.md` §6: drop `MK_k`/`K_aead[k]`, chain still verifies). "Right to be forgotten"
becomes a **checkable** property: data past `retention` whose key is still held is a governance violation.

### D4.1 Key-sprawl threat (TRAP 3 — KMS limits + payload chunking)
A naive 1:1 **key-per-subject** mapping for millions of users is an infeasible KMS burden (millions of rapidly
rotating keys). **Mitigation (the honest design):**
- **Epoch/cohort chunking, not per-subject keys.** Crypto-erase at **chunk granularity** — subjects are grouped
  into retention cohorts (e.g. by collection epoch); one ratchet key per *cohort-epoch*, not per subject. The
  history-chain ratchet already does per-epoch keys; D4 reuses it. Erasing a cohort drops one key.
- **Per-subject erasure (true RTBF) needs finer keys** → a **2-level scheme**: a per-cohort key wraps per-subject
  data-keys; erasing a subject drops that subject's wrapped data-key (small) without re-keying the cohort. This
  bounds KMS load to *active* keys; erased keys are deleted, not rotated.
- **Threat-model entries:** KMS key-count limits, key-rotation throughput, the cost of fine-grained
  (per-subject) vs coarse (per-cohort) erasure, and the **availability tension** (crypto-erasure is irreversible
  — an erroneous erase is unrecoverable; gate it behind a governance capability + audit).
- **Honest scope:** the KMS/HSM is the host; Galerina governs *when* erasure is required (retention expiry) and
  *that* the key is provably dropped — not the KMS internals.

---

## D5 — Computation-locality governance
Govern **where** sensitive compute may run: on-device / TEE-attested / the **photonic-ANN-on-re-verified-plaintext**
lane (tri-encryption verdict 5 + the Trust Capsule §9 ANN binding). Federated-by-construction; ties to the
attestation/manifest model (the Trust Capsule custody surface). A `locality { on: device | tee | trusted-endpoint }`
clause; a sensitive value may only be computed in a location whose attestation the verifier holds, else
`unknown → deny`. *(Design sketch; full spec deferred — D1/D2 lead.)*

---

## 2. Honest caveats (so privacy R&D doesn't chase ghosts)
- **No line-rate private compute.** FHE / PIR / SSE are orders too slow **and** invert zero-trust (verdict 5).
  Galerina governs privacy; it does not do magic encrypted search.
- **Don't reinvent OpenDP / GDPR** — make them **compile-time-governed**; that is the differentiator.
- **IFC stays lightweight** (the Jif lesson): taint + capability + labels + DP budgets, **not** a full static
  non-interference lattice type system.
- **Mechanisms stay vetted host libs** (crypto-on-core analogue): Galerina owns the *policy*, the host owns the *math*.

## 3. Reserved diagnostic codes (per the namespace-ownership discipline)
New codes this phase would add — reserved here with **mechanism tags** so they register cleanly (see the
companion [`../diagnostics-namespace-rnd-response.md`](../diagnostics-namespace-rnd-response.md)):

| Code | Mechanism | Meaning |
|---|---|---|
| `SPORE-DP-001` | effect-check | DP budget exhausted (Σε over a path > declared budget) |
| `SPORE-DP-002` | declarative-clause | malformed / missing `privacy { budget … }` for a `dp()`-effecting flow |
| `SPORE-DP-003` | effect-check | `dp()` effect inside a loop without a static upper bound |
| `SPORE-DP-004` | dataflow-taint | declassification attempted without the vetted DP mechanism (laundering) |
| `SPORE-PRIVACY-010` | dataflow-taint | purpose-limitation violation (purpose X data → purpose Y sink) |
| `SPORE-PRIVACY-011` | declarative-clause | re-purpose without a valid consent capability |
| `SPORE-PRIVACY-012` | dataflow-taint | sensitivity-label egress violation (label > sink's max) |
| `SPORE-PRIVACY-013` | effect-check | retention expired but key still held (crypto-erasure not performed) |
(Numbers are *proposed* next-free; the owner allocates the real ones in `compiler-diagnostics.md`, never
reusing a retired number — diagnostic-namespace ownership.)

## 4. Priority + next step
Lead with **D1 (DP-budget-as-effect)** and **D2 (purpose-typing)** — both are "the taint/effect machinery + one
label/cost," both fit the governance model, both are genuinely ahead of every general-purpose language. Concrete
first build target (R&D, no production code): a **worked `.spore` example** exercising D1.4 (two releases accept,
the third rejected for ε exhaustion) and D2.1 (billing→analytics rejected; `dp_release` accepted) once the
effect-checker surface is available — mirroring how `k3-policy.spore` exercises the governance gate.

## 5. Sources
NIST **SP 800-226** *Guidelines for Evaluating Differential Privacy Guarantees* — https://csrc.nist.gov/pubs/sp/800/226/final ·
**OpenDP** (Harvard) — https://opendp.org/ · Dwork & Roth, *The Algorithmic Foundations of Differential Privacy*
(2014) · **GDPR** Art. 5(1)(b) purpose limitation — https://gdpr-info.eu/art-5-gdpr/ · Jif / FlowCaml (IFC
adoption lesson) · companions: `tmf/spec/tmf-history-chain-v0.md` (crypto-erasure ratchet), `tmf/spec/governed-trust-capsule-v0.md`
(§9 ANN locality), tri-encription `metadata-confidentiality.md` (verdict 5).
