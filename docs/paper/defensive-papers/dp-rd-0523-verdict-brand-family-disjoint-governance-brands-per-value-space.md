# The verdict-brand family: one Kleene algebra, many mutually-disjoint governance brands

**Disclosure ID:** DP-RD-0523 (landed in `docs/paper/defensive-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-19 · **Type:** defensive publication (prior-art disclosure — NOT a patent claim) · **Provenance:** the KB verdict-brand-family adjudication (the data-mining/AI arc) generalizing the shipped `Verdict`⊥`Trit` brand (SP-RD-0510); the shared K3 algebra is machine-checked (`verify-governance-algebra`, **169/169 — re-run green 2026-07-22**). Design-stage generalization; no performance number is claimed.
**Purpose:** establish prior art for the construction below so it remains freely implementable. The **two-brand instance is shipped + machine-checked**; the N-domain **family is the disclosed design law** that generalizes it. Companion disclosure: dp-rd-0524 (AI control plane), which consumes this rule.

## Setting

A fail-closed ternary governance boundary uses Kleene K3 over `DENY(−1) < INDETERMINATE(0) < ALLOW(+1)`: conjunction is `min`, disjunction is `max`, negation is sign-flip, an **empty fold is INDETERMINATE** (deny-by-default), and a verdict collapses to a decision **only at the boundary**. A prior disclosure (SP-RD-0510) showed that a governance `Verdict` must be a **brand disjoint** from an arithmetic `Trit` over the same three symbols, because arithmetic operators can *raise or flip* a value's sign and thereby launder authority. This paper generalizes that two-brand result to a **family** across every governed value-space.

## The law (claimed)

Every governed value-space gets **its own brand of the same K3 algebra**, and the brands are **mutually non-assignable**:

> `SecurityVerdict ⊥ DataQualityVerdict ⊥ MathVerdict ⊥ …` — all share the identical Kleene structure (`min`/`max`/`neg`, empty→INDETERMINATE, collapse-at-boundary), but **no verdict of one domain is assignable to another.** A data-quality `+1` ("this record is clean") is **type-incapable** of flowing into a security decision ("allow this action") or a mathematical validity ("this proof holds"), and vice-versa. Cross-domain influence is legal **only** through an explicit, audited **boundary adjudication** — never an implicit assignment or a bare cast.

Same representation (`−1|0|1`), same algebra, disjoint types. Only same-brand values fold together; crossing a brand is a **named, logged decision**, not a silent coercion.

## Why the brands must be disjoint (the necessity, inherited + generalized)

SP-RD-0510 machine-checked the two-brand necessity: the arithmetic family is **truth-table-disjoint** from the Kleene family (a balanced-ternary `SUM` wraps `−1,−1 → +1`, so `DENY∘DENY` becomes `ALLOW` — not governance-safe), while the Kleene family is **closed** over the verdict lattice (a `min`/`max`/`neg` of verdicts is a verdict). The **same argument is the reason to keep the *domains* apart:** a "clean data" verdict and an "allow action" verdict are produced and consumed by **different evidence and different policy**; letting one stand in for another is the identical authority-laundering error — a value earned under one domain's rules **spent as authority under another's**. The disjoint-brand family makes that substitution a **compile-time type error** instead of a silent runtime confusion.

Machine-checked base: the K3 algebra the whole family shares is green at **169/169** (`verify-governance-algebra`, re-run + personally verified), and the two-brand disjointness/closure necessity is SP-RD-0510's SUITE 3 + SUITE 5. The family is the **design generalization** over that proven base.

## Why this is safe to disclose (harm filter)

This discloses a **design law plus a shipped instance** — a strength. The two-brand separation is closed by construction (non-assignable at compile time); the general principle (each governed value-space is its own brand; cross-domain requires a boundary adjudication) is a **positive architectural constraint**, not a bypass. It helps a defender *structure* a system and gives an attacker **nothing**: there is no enumerated weakness, no live gap, and no deployment-specific detail. Disclosing "keep each domain's verdicts in a disjoint type" is the same reputation-positive class already cleared for SP-RD-0510.

## Prior art (novelty disclaimed)

Nominal / newtype / phantom types (Haskell, Rust, TypeScript branded types) and Kleene K3 logic are established; the two-brand instance is SP-RD-0510. **No novelty is claimed** for those. The recorded contribution is the **family formulation**: the generalization from one disjoint pair to a per-value-space *family* under one shared K3 algebra, with **boundary-adjudication-not-assignment** as the sole legal cross-domain path — positioned as the type-system prerequisite for a *universal* three-valued admit/hold/refuse layer spanning data-quality, mathematical-validity, and security. Completes, with SP-RD-0439 (the calculus), SP-RD-0456 (the min-identity), and SP-RD-0510 (the two-brand disjointness), the account of **why a single trit shape can serve many domains without any one lending authority to another**.

## Honest bound

A compile-time (type-level) separation. The **two-brand instance ships and is machine-checked** (169/169 plus the disjointness/closure suites); the **N-domain family is design-stage** — a disclosed law resting on that proven base, not a running N-brand engine. K3 semantics are unchanged by branding (governance is byte-identical either way). **No claim is made about which domains a given deployment has or has not yet branded** — the disclosure is the law and the proven instance, not a status map.

## Declarations
- **Type / tier:** defensive publication (prior-art disclosure, novelty disclaimed) — **not** a flagship/workshop novelty claim; no new cryptography, no new science.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the KB verdict-brand-family adjudication and the shipped two-brand instance with its machine-checked disjointness harness (`verify-governance-algebra`, 169/169, plus the SP-RD-0510 disjointness/closure suites).
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** in-repo — `ZTF-Knowledge-Bases/tools/verify-governance-algebra.mjs` (re-runnable) and the SP-RD-0510 suites; no external data.
- **Licence:** Apache-2.0.

*Published as a defensive disclosure. Contact hello@trithypha.dev.*
