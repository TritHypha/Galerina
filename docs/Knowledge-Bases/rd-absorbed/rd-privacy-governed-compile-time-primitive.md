<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/RESEARCH-PHASE-privacy-governance.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# R&D Phase — Privacy as a Governed, Compile-Time Primitive

> **Status:** research-phase charter (draft, 2026-06-16). **Posture (binding):** grounded, cited,
> adversarially verified; honest-core vs aspirational kept separate; **no perf number without a reproducible
> benchmark + the machine**; **no invented crypto**; fail-closed (`unknown → deny`). **Boundary:** R&D-only.
> **Builds on (already shipped in Galerina):** SPORE-SECRET-002 (secret egress, derived-secret-hardened),
> SPORE-PRIVACY-002 (cleartext-embedding egress / SealTaint), the `privacy {}` contract block (parsed),
> taint propagation, capability/effect model, the tri-encryption verdict 5 (no leak-free in-network semantic
> routing → encrypt + filter at trusted endpoints).

---

## 0. Is privacy R&D worth it? Yes — arguably *more* than the crypto track

Privacy is the sharpest end of Galerina's governance-first thesis, and the field has rigorous, standards-backed
models that **no mainstream language exposes as first-class, compile-time-governed primitives.** That gap is
the whole opportunity: Galerina's lane is **governing** privacy (who / where / purpose / how-much), not inventing
new privacy crypto. Done right, this is genuinely ahead of every general-purpose language.

---

## 1. Research directions (best-first)

### D1 — Differential-privacy budget as a governed effect (the standout)
Make ε/δ a **tracked, deny-by-default resource**. Each query/release over personal data debits a
compile-time-accounted **privacy budget**; egress is blocked when the budget is exhausted (`unknown/over → deny`).
DP itself is rigorous and standards-backed (NIST SP 800-226, OpenDP); the **novel** part is accounting the
budget in the effect/type system rather than at runtime in a library.
- **What's new:** no language tracks a DP budget at compile time.
- **Sketch:** a `privacy { budget epsilon: 1.0 }` clause; DP-emitting stdlib ops carry an `ε`-cost effect; the
  effect-checker sums costs per data subject / per release channel and denies over-budget egress.
- **Acceptance:** a worked example where two releases pass and the third is denied for exhausting ε, with the
  accounting shown; honest note that *correct* DP mechanism implementation stays a vetted host lib (OpenDP).

### D2 — Purpose limitation as types (GDPR/consent-as-dataflow)
Bind data to a declared **purpose** at collection; the compiler forbids data gathered for purpose X reaching a
sink serving purpose Y. A real regulatory need (GDPR Art. 5(1)(b)) with **no** language-level solution today —
and it's the existing taint/capability machinery with a `purpose` label.
- **Acceptance:** `collect(..., purpose: "billing")` → `analytics.send(...)` is a compile error; same data to a
  billing sink passes.

### D3 — A sensitivity lattice (generalize SealTaint, the *practical* slice of IFC)
`public < internal < PII < PHI < secret/semantic` with lightweight information-flow control. The lesson from
Jif/FlowCaml (academically complete, **zero adoption**): ship the 80% — label propagation + egress gates, which
Galerina already has — without the 20% (full static non-interference) that kills usability.
- **Acceptance:** label join/meet rules + an egress gate per top label; explicitly *not* full non-interference.

### D4 — Retention / erasure as a governed lifecycle
The `privacy {}` block already parses `retention N years`. Make it enforced, with **crypto-erasure** (drop the
per-epoch key ⇒ data unrecoverable) — which the `.tmf` segmented-STREAM design already supports. "Right to be
forgotten" as a checkable property.

### D5 — Computation-locality governance
Govern *where* sensitive compute may run — on-device / TEE-attested / the photonic-ANN-on-re-verified-plaintext
lane. Federated-by-construction; ties to the attestation/manifest model.

---

## 2. Honest caveats (so privacy R&D doesn't chase ghosts)
- **Do NOT chase line-rate private compute.** FHE / PIR / SSE are orders too slow **and** invert zero-trust
  (tri-encryption verdict 5). Galerina governs privacy; it does not do magic encrypted search.
- **Do NOT reinvent** OpenDP / GDPR frameworks — make them **compile-time-governed**; that's the differentiator.
- **Keep IFC lightweight** — full static non-interference has a real usability tax (the Jif lesson). The sweet
  spot is taint + capability + labels + DP budgets, not a full lattice type system.
- The DP/anonymity **mechanisms** stay vetted host libs (crypto-on-core analogue): Galerina owns the *policy*,
  the host owns the *math*.

---

## 3. Priority + acceptance
**Lead with D1 (DP-budget-as-effect) + D2 (purpose-typing)** — most novel, both fit the governance model, both
are "the taint/effect machinery + one label." Each direction ships only with: a worked accept/reject example, a
threat model, an honest scoping note (what stays a host lib), and an adversarial fail-open review.

## 4. Connects to
SPORE-PRIVACY-002 / `galerina-privacy-embedding-egress.md` (the shipped embedding rule), the `privacy {}` block spec
(`galerina-contract-privacy-observability.md`), and `galerina-design-stability-and-forward-planning.md` (namespace
ownership for the new SPORE-PRIVACY-* / SPORE-DP-* codes this phase would add).
