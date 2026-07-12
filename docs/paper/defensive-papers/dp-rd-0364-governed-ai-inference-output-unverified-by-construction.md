# Defensive Publication — Governed AI-inference output: a ternary epistemic type-state that types model output `Unverified`-by-construction, so a model answer can never mint authority

**Disclosure ID:** DP-RD-0364 · **Date:** 2026-07-12 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — the per-call inference governance contract is specified in KB RD-0364; the underlying **ternary epistemic type-state** (the "trust-trit", RD-0337) and the K3 governance meet are shipped constituents. The inference bridge contract itself is design-stage.

## 1. What is disclosed

A **type-system discipline for the output of a machine-learning inference call** (an LLM, a classifier, any model bridge) inside a governed language/runtime, built on a **ternary epistemic type-state** — a *trust-trit* with three values: **PROVEN (+1) · UNKNOWN (0) · REFUTED (−1)**, aliasing the Kleene-K3 governance verdicts ALLOW / INDETERMINATE / DENY.

1. **Model output is born `Unverified` (UNKNOWN), by construction.** The value a model returns enters the program's type system as epistemic-state UNKNOWN — *a claim, not a fact* — regardless of how confident the model is. This is not a runtime flag the caller may forget to set; it is the *type* the bridge produces.
2. **The trust-trit is contagious and sticky under composition.** Combining values takes the **minimum** over the trit (`combine = min`; PROVEN is the identity, REFUTED the annihilator, UNKNOWN the fail-closed floor): any computation that consumes an UNKNOWN model output yields at best UNKNOWN. A value once REFUTED can never rise. The only way a value leaves UNKNOWN is an **explicit `discharge`** through a declared verifier flow — the single, auditable lift.
3. **Deny-at-boundary.** A trust boundary (a capability grant, an effect emission, an authorization decision) admits only PROVEN. An UNKNOWN (or REFUTED) model output presented at a boundary is **denied**, fail-closed — so a model answer *contributes evidence, never a verdict*: folded into a governed decision it enters as 0, and `min(0, x) ≤ 0` — a lone model output can never lift a decision to ALLOW.
4. **Per-call governance envelope (the bridge contract).** Each inference call additionally declares, and the runtime enforces: a **content-addressed model identity** (a locally-attested model pins its weights hash; a cloud model is honestly tagged *provider-asserted*, never claimed *attested*); **inference effects** (`inference.invoke` / `inference.load`) deny-by-default; **prompt egress** treated as a data-egress event (subject to the outbound redaction + allow-list boundary); and **cost caps** (calls/tokens/spend) enforced fail-closed.

## 2. What it prevents

- **Prompt-injection minting authority.** An injected instruction in model input is still *data*, and the model's obedient output is still UNKNOWN — it cannot cross a `requireTrusted` boundary or emit a governed effect, no matter how authoritative it reads. The injection cannot manufacture a PROVEN value.
- **Hallucination-as-fact.** A confident but wrong model answer cannot silently become a trusted input to a security decision; it must pass an explicit verifier (`discharge`) first, or it is denied at the boundary.
- **LLM-as-oracle-for-authorization.** Using a model verdict *as* an allow/deny is structurally blocked — a model contributes to a K3 fold only as evidence (0), which can lower a decision toward deny but never raise it to allow.
- **Provenance overclaim.** The identity tiering forbids a receipt claiming a cloud model's output is *attested* when only the provider *asserts* the model — the honesty is in the type, not the marketing.

## 3. Honest scope and bounds

- **Defence-in-depth, not a perimeter.** This constrains what a model output can *authorize*; it does not make the model correct, nor stop injection from occurring — it stops injection from *escalating*.
- **Only as good as the boundary discipline.** The guarantee holds where the trust boundaries and verifier flows are declared; an application that discharges an UNKNOWN without a real verifier has removed its own guard (the discharge is visible and auditable, but the modeling obligation is above the mechanism).
- **A verifier is a modeling obligation.** "Discharge through a declared verifier" is only as strong as that verifier; the type-state enforces that *a* verifier ran, not that it was sufficient.
- **Provider-asserted identity is not attestation.** For a cloud model the mechanism pins `{provider, model, version}` and channel trust; it cannot cryptographically attest weights it never sees, and says so.
- **The undecidable→UNKNOWN default trades availability for safety** — some benign outputs are held pending discharge; that is the deliberate fail-closed posture.

## 4. Prior art acknowledged (novelty disclaimed)

Information-flow control and security-label lattices (Denning 1976; Myers–Liskov Decentralized Label Model); taint tracking and provenance typing; Kleene three-valued logic (1938); gradual/refinement typing and "parse, don't validate" smart-constructor discipline; capability security and deny-by-default composition; standard guidance to treat LLM output as untrusted input; OWASP LLM Top-10 (prompt injection, excessive agency, insecure output handling); the MCP tool-poisoning / toxic-flow advisory literature; content-addressed artifact identity (hash-pinning). The disclosed composition — *a ternary epistemic type-state that types ML-inference output UNKNOWN-by-construction, contagious-min under composition, discharge-only-lift, denied at trust boundaries so a model output is evidence-never-verdict, wrapped in a per-call governance envelope with content-addressed identity tiers, deny-by-default inference effects, prompt-egress-as-data-egress, and fail-closed cost caps* — is published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (design-stage).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB RD-0364 and RD-0337 (the trust-trit / epistemic type-state), the shipped K3 governance meet, and the shipped `HybridInferenceEngine` bridge-attestation surface.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0364…` / `galerina-rd-0337…`; shipped constituents: the epistemic type-state runtime, the K3 `vAnd`/meet, the hybrid-signed bridge attestation. The per-call inference contract is not yet built.
- **Licence:** Apache-2.0.
