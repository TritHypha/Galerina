# LogicN — Scientific Papers

This folder holds LogicN's publishable scholarly artifacts. **Read the standard before adding anything here.**

---

## 1. The standard — what gets published, and what does not

LogicN's binding rule is **"no new cryptography and no new science."** Every crypto/codec primitive is borrowed and standard (FIPS / NIST / RFC / peer-reviewed); what is "new" is **engineering composition, byte-precise specification, and honest measured results.** Consequently:

- **LogicN publishes ZERO flagship and ZERO workshop papers** — by design. A "novel contribution" paper here would fail peer review and damage the project's credibility, because the contribution would not survive an adversarial prior-art search.
- The **only** publishable artifacts are: **defensive-publication notes** (timestamped prior-art records of an engineering composition, novelty *disclaimed*) and, at most, **short measured-negative / experience notes** (eprint-scale) that report a *surprising, decision-relevant negative result* on a *named machine*.

### Honest-tier framework (label every document)

| Tier | Definition | LogicN policy |
|---|---|---|
| **flagship** | top-venue, measured non-obvious result, no close prior art | **none exist** — do not write |
| **workshop** | narrow but real novel contribution | **none landed** — do not write |
| **defensive-pub** | engineering composition of established primitives; published to establish prior art, **novelty disclaimed** | the main artifact type here |
| **measured-negative** | a reproducible negative result on a named machine that isn't a re-confirmation of a known principle | at most ~1 borderline candidate |
| **none** | fully re-derives existing work | keep as repo prior art, do **not** write up |

**Bar for a measured-negative note** (all must hold): a fresh, reproducible benchmark on a **named machine** (e.g. i9-9900K @3.60 GHz, pinned Node + library versions, named scripts, run counts); a **surprising or decision-relevant** negative; and **not** reducible to standards-composition or a textbook fact.

---

## 2. Compliance checklist (UK / US / EU research-integrity & open-science)

Any document in this folder follows the conventions below. These are good-practice alignments, **not** a claim of formal certification or a filed legal prior-art search.

- **Integrity (UK):** UKRI research-integrity policy and the **Concordat to Support Research Integrity** — honesty, rigour, transparency, accountability.
- **Integrity (EU):** the **ALLEA European Code of Conduct for Research Integrity**; **Horizon Europe** open-science obligations.
- **Integrity (US):** **NSF**/federal research-integrity expectations and the **2022 OSTP public-access memo** (free, immediate access to federally-relevant results).
- **Reproducibility & artifact availability:** every quantitative claim names the machine, versions, scripts, and run counts; spec/vectors/harnesses are in-repo and re-runnable.
- **FAIR data (EU):** artifacts are Findable, Accessible, Interoperable, Reusable — in-repo paths, open formats, Apache-2.0.
- **GDPR / personal data:** N/A — no document here processes personal data. (Add a data-protection statement if one ever does.)
- **Citation standard:** cite **primary** sources by authoritative identifier (FIPS/RFC number, DOI, arXiv id). **No fabricated references.** If a citation cannot be verified, it is removed, not kept.
- **AI-assisted-drafting disclosure:** documents drafted with AI assistance under human direction say so in their declarations block, with the grounding (spec/source) stated.
- **Declarations block (required template):** Type/tier · Authorship & AI assistance · Funding (default: none) · Competing interests (default: none) · Data/artifact availability · Licence (Apache-2.0).

> Triage here is informed by training knowledge, **not** a filed legal prior-art search or freedom-to-operate opinion. Confirm novelty/clearance with a qualified professional before any external submission.

---

## 3. Index of the corpus

### In this folder (`docs/scientific-papers/`)

| Document | Tier | Summary |
|---|---|---|
| [`tmf-trust-capsule-format-defensive-publication-2026-06-23.md`](tmf-trust-capsule-format-defensive-publication-2026-06-23.md) | **defensive-pub** | The `.tmf` trust-capsule **universal file & communications format** — TMX-256 (3-ary SHAKE256 Merkle-XOF), ML-DSA-65 root signing, KEM-DEM confidentiality, codec-agnostic modalities (image/audio/video/document/structured), streaming. Maths + usage + security + full references; novelty disclaimed. |

### Companion defensive-publication notes (in the `LogicN-Patens/` repo)

| Note | Tier | Summary |
|---|---|---|
| note-01 — No-Coercion degrade-only K3 composition | defensive-pub | absorbing a continuous/telemetry trust signal into a fail-closed Kleene meet (`e = vAnd(t*,r) ≤ t*`). Cites/disclaims vs Zdancewic-Myers, Bruns-Huth, Birgisson. |
| note-02 — Prove-own-maths methodology + measured-negative catalogue | defensive-pub | PROVEN/SAMPLED/ASSERTED evidence grading; Z3 i32 conformance as translation validation. Cites/disclaims vs Pnueli/Necula, SLSA, Livshits. |
| note-03 — Crypto-on-core rejected-path record | defensive-pub | why analog entropy cannot enter a KDF and an optical PUF cannot be a sole auth factor. Cites/disclaims vs NIST SP 800-90A/B, Rührmair PUF-modeling. |

### Measured-negative candidate (not yet written — needs a re-measurement)

| Candidate | Tier | Status |
|---|---|---|
| Lane A — "Photonic acceleration of ML-DSA-65 signing is an Amdahl latency-wash" | measured-negative (**borderline**) | f≈28% offloadable ⇒ ideal ~1.4×, realisable ~0.9× (wash). Only becomes genuinely novel after a **native/SIMD Dilithium re-measurement**; the published vectorised-Dilithium profile (arXiv:2306.01989) already implies the conclusion. Reviewer-novelty ~0.62. Kept as repo prior art until re-measured. |

### Pre-graded NO-PAPER (kept as repo prior art only — with the one-line reason)

- **`.tmf` / TMX-256 / KEM-DEM as a flagship** — engineering composition of borrowed standards (this folder publishes the *defensive* version above, not a novelty claim).
- **Photonic SHA-256 / "the photon IS the signature"** — physically/architecturally rejected; crypto stays digital on-core.
- **K3 governance gate as novel** — application of Kleene three-valued logic (1938).
- **Differential privacy ≈ anonymisation** — known-false (NIST SP 800-226).
- **Cleartext embeddings ≈ confidential** — vec2text shows embeddings ≈ plaintext.

---

*Maintained as part of the LogicN KB. The patents-decision rationale lives in `LogicN-Patens/README.md` (zero patents, on purpose); the full paper-worthiness assessments live in `docs/Knowledge-Bases/logicn-paper-worthiness-assessment-2026-06-23.md` and the IP/paper strategy memory.*
