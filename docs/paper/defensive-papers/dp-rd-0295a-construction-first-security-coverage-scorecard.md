# Defensive Publication — Construction-first security coverage scoring: "unrepresentable-by-construction" as a first-class coverage category over a public attack taxonomy

**Disclosure ID:** DP-RD-0295a · **Date:** 2026-07-09 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE / METHODOLOGY DISCLOSURE** — the scoring *method* and a qualitative first-cut are
specified in KB RD-0293/0294/0295; the full quantified scorecard is future work. **This is NOT a measured
scientific paper** — a coverage enumeration is not a named-machine measurement (the papers standard reserves
that tier; the RD-0285j dispatch benchmark remains the first candidate). Methodology + prior-art record only.

## 1. What is disclosed

A method for scoring the security posture of a zero-trust / construction-first language against a **public
attack taxonomy** (OWASP Top 10, OWASP API Security Top 10, OWASP LLM Top 10, and a MITRE ATT&CK/ATLAS-mapped
skills corpus), in which each attack class is assigned to exactly one of three coverage categories:

1. **unrepresentable-by-construction** — the class has no runtime home; a specific language/format
   construction is cited that makes it *not expressible* (e.g. persisted-plan-only + no-value-in-operator-
   position ⇒ injection has no parse surface; authenticate-before-parse + data-not-objects ⇒ deserialization
   gadget chains cannot instantiate; capability-bound object set ⇒ a query cannot widen beyond its grant).
2. **detect-only** — the class is not foreclosed by construction and remains a runtime/operational risk that
   can at best be *detected/mitigated* (e.g. prompt injection, rate/wallet abuse, key custody, side channels).
3. **out-of-scope** — the class does not apply to the artifact under test.

Two rules make the scorecard honest rather than promotional: **(a)** every "unrepresentable" cell must cite
the *specific* construction (not a slogan), and **(b)** a **mandatory residuals column** lists every
detect-only/operational class in the *same* table, so the scorecard cannot be read as a security proof. The
qualitative first-cut over RD-0293/0294 is included as the seed instance.

## 2. What it prevents (the communication/governance defect)

The pervasive category error of conflating **"we detect X"** with **"X cannot happen."** Coverage matrices in
practice (ASVS checklists, ATT&CK-coverage heatmaps) collapse *prevention* and *detection* into a single
"covered" tick, which overstates assurance. Separating **unrepresentable-by-construction** as its own
category — and forcing the residuals into the same view — makes the difference legible to reviewers,
auditors, and downstream integrators, and stops a construction-first design from being marketed as
"unhackable" (the residuals column is the standing rebuttal).

## 3. Honest scope and bounds

- **Necessary, not sufficient.** "Unrepresentable-by-construction" removes a class at the runtime boundary; it
  is not a proof of whole-system security. The residuals (unsigned-v0 origin, key custody, prompt injection,
  rate/race/TOCTOU) are exactly the detect-only column and must remain visible.
- **Not a measurement.** A coverage count is empirical but not a named-machine performance measurement; this
  document is defensive/methodology tier by the project's own bar, not scientific-paper tier.
- **The taxonomy is a comparator, not an authority.** The public skills corpus used as the denominator is a
  community artifact; it bounds *what we checked against*, not *what is true* (DP-RD-0270 discipline).
- **Coverage is per-construction and versioned** — a grammar/format change can move a class between columns; a
  scorecard is only valid against a stated language/format version.

## 4. Prior art acknowledged (novelty disclaimed)

OWASP ASVS and its coverage matrices; MITRE ATT&CK coverage mapping / Navigator layers; systematization-of-
knowledge (SoK) security papers; threat-modeling coverage rubrics (STRIDE/LINDDUN); the secure-by-design and
"secure by construction" literature; language-based security (type-safety-forecloses-a-class arguments). The
disclosed composition — *scoring by unrepresentability-by-construction as a category distinct from detect and
prevent, over a public attack taxonomy, with a mandatory in-table residuals column, applied to a
construction-first zero-trust language* — is published to establish prior art; novelty is disclaimed for every
constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (methodology; design-stage). Not flagship/workshop; **no measurements claimed**.
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB
  RD-0293/0294/0295 and the public OWASP / MITRE-mapped taxonomy used as comparator.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design sources KB `galerina-rd-0293…`, `…-0294…`, `…-0295…`; the
  quantified scorecard is future work (candidate home: `@galerina/devtools-security`, RD-0296).
- **Licence:** Apache-2.0.
