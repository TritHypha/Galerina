# Paper-Worthiness Assessment — R&D 0065–0070 (2026-06-22)

**Question:** is anything in the transport/auth R&D (0065–0070) worth a scientific paper?
**Answer: No.** Nothing clears the bar — not flagship, not workshop. This is the expected outcome under Galerina's
standing IP/paper strategy ("no new crypto, no new science by design → 0 patents; default = defensive-publication +
Apache-2.0; **papers only for genuinely-novel MEASURED negatives**"), and it matches the prior full-corpus verdict
(0 flagship papers). Method: prior-art-verified assessment, workflow `wuyrn9956`. See [[galerina-ip-paper-strategy]].

> Caveat carried from the strategy: this is engineering/IP triage informed by training knowledge + targeted prior-art
> checks, **not a filed legal prior-art search**. Any actual filing needs an IP attorney.

## The bar (both arms required for a paper)
A candidate is paper-worthy only if it is **(1) genuinely novel vs real prior art AND (2) has a measured result (or a
measured negative)**. A re-statement of a known result is, at most, a defensive publication — never a paper.

## Per-candidate verdict
| Candidate (source) | Novelty | Measured? | Closest prior art | Verdict |
|---|---|---|---|---|
| **No-coercion degrade-only K3** (0069 DTM + 0070 TamperTrust + substrate-model) | known-result | design-only | Zdancewic–Myers *robust declassification* (CSFW 2001); Myers–Sabelfeld–Zdancewic *qualified robustness* (JCS 2006); Bruns–Huth *Belnap access control* (TISSEC 2011); Birgisson et al. *Macaroons* (NDSS 2014) | **defensive-pub** |
| **Prove-maths methodology** (0067: PROVEN/SAMPLED/ASSERTED grading; Z3 i32 conformance; measured negatives) | known-result | **measured** | translation validation (Pnueli/Siegel/Singerman TACAS 1998; Necula PLDI 2000); GRADE / Assurance-2.0 / SLSA graded rigor; Livshits *In Defense of Soundiness*; IBM-Haifa vacuity; Woodcock et al. (CSUR 2009) | **defensive-pub** (the only one with real measured content, but every limb is prior art → borderline-workshop at most) |
| **Crypto-on-core refutations** (0065/0070: analog-in-KDF non-reproducible; optical-PUF-as-auth) | known-result | none | NIST SP 800-90A/90B (KDF/DRBG determinism); Rührmair-lineage PUF modeling attacks / optical-PUF PAC-learnability | **defensive-pub** (rejected-path record) |
| **TLSTP governance composition** (0065/0066/0068; B8) | known-result | design-only | RFC 7633 OCSP Must-Staple; RFC 7469 SPKI pinning; RFC 5705/8471 channel binding; macaroon attenuation; TrustBase (arXiv 1610.08570) | **not-publishable** (cite the RFCs inline; nothing to defend) |

## The single conditional future paper path — now RESOLVED (still ~no)
If the team **MEASURES a real availability/false-deny negative** (K3 hard-fail vs soft-fail under measured OCSP/CRL
outage rates), that genuine *measured negative* could justify a short workshop note — the only realistic route from
this corpus. **Update 2026-06-22: R&D 0076 built that benchmark** (27/27, exit 0, cited outage range) **and the verdict
is borderline-NO even reframed** — it largely re-derives the known Web-PKI soft-fail consensus; publishable only if
narrowed to the K3 framing + a first-party availability measurement. So the one conditional path resolves to
**essentially still no paper.** (And the 3 defensive-publication notes are now WRITTEN into `Galerina-Patens/` per R&D
0075 — see [rd-tlstp-closure-0071-0077-2026-06-22.md](rd-absorbed/rd-tlstp-closure-0071-0077-2026-06-22.md).)

## What to actually do
1. **No paper.** Do not write or submit one from 0065–0070.
2. **3 defensive-publication notes** (cite the prior art, explicitly disclaim novelty — timestamped prior-art records,
   not invention claims): no-coercion-K3 · prove-maths-methodology · crypto-on-core-refutations → seed into
   `Galerina-Patens/` + `Galerina-ScientificPapers/`. **Queued as R&D task 0075** (with the exact citations); awaiting the
   manual R&D session (or a "seed now" go).
3. **Nothing** for the TLSTP composition — cite RFC 7633/7469/5705/8471 + TrustBase inline in the implementation docs.

## Pointers
- Strategy + the standing 0-flagship verdict: [[galerina-ip-paper-strategy]] (`NOVELTY-AND-IP-ASSESSMENT-2026-06-20.md`).
- The research these candidates come from: [galerina-transport-auth-research-explained-2026-06-22.md](galerina-transport-auth-research-explained-2026-06-22.md).
- Defensive-pub track (where the 3 notes will land): `Galerina-Patens/` + `Galerina-ScientificPapers/`.
