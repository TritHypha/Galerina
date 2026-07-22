# "Physics-as-authority" is a fallacy class: a machine-checked refutation corpus for photonic/analog security overclaims, with the source model's concession on record

**Disclosure ID:** DP-RD-0270 · **Date:** 2026-07-08 · **Type:** Prior-art disclosure (defensive) — NOT a patent claim · **Provenance:** RD-0111 (`galerina-rd-0111-photonic-3d-brief-rigorous-2026-06-24.md` (internal engineering KB)), RD-0266/0266b/0266c (`galerina-rd-0266*.md` (internal engineering KB)), machine-checked proof `rd-0266-photonic-syntax-claims-proof.mjs` (internal engineering KB) (15/15, exit 0), rebuttal protocol `PROMPT-gemini-rebuttal-photonic-overclaims-2026-07-08.md` (internal engineering KB) with the source model's concession recorded in RD-0266c §1. Companion to the in-folder notes `latency-is-not-work` (DP, 2026-06-25) and DP-RD-0257 (span-not-work).

**Purpose.** This is a defensive publication with **novelty explicitly disclaimed** (§3): every individual refutation below is textbook physics, information theory, or security engineering. What this document places on record is (a) the *named fallacy class* — **physics-as-authority**: treating an unauthenticated physical signal, or a property of a physical process, as an authorization/security authority — (b) a **corpus of ten refuted claim families** with one-line mathematics each, all machine-checked by a re-runnable script, (c) the **fail-closed composition rule** that makes physical signals safe to consume (`verdict = min(digital, physical)` — a physical signal may only *degrade* a verdict toward DENY, never mint an ALLOW), and (d) a documented **AI-overclaim audit protocol**: each overclaim was returned to the AI system that generated it (Google Gemini) as a rebuttal prompt containing the counter-mathematics and a request for sources, and the system **formally conceded every rebuttal** (2026-07-08). The corpus exists because AI-generated design notes repeatedly re-derive these overclaims; naming the class and recording the refutations is cheaper than re-litigating them.

---

## 1. Technical field

Security architecture for systems incorporating photonic/analog computation or sensing (ternary optical computing, WDM interconnects, polarization/phase encoding, optical sensing); the boundary between physical-layer properties (tamper-evidence, entropy, latency) and cryptographic authority (authentication, authorization, integrity); auditing of AI-generated systems-design claims.

## 2. Background & problem

Design notes — increasingly AI-generated — recurringly assign *security authority* to physical phenomena: "the photon **is** the signature", "session hijacking is mathematically impossible", "unhackable because physics", "infinite DDoS protection at zero cost", "O(1) because light is fast". The pattern is seductive because each claim rests on a *true* physical fact (Malus's law, Beer–Lambert absorption, wave-speed, radix economy) — and each is false as a *security* claim because the physical fact does not bind an identity, is observable/reproducible by an adversary, or confuses latency with work. The problem addressed: absent a named class and a recorded refutation corpus, every new design note re-derives the same overclaims and each must be re-refuted from scratch.

## 3. Prior art (stated honestly — novelty disclaimed over each)

- **A. Kerckhoffs, "La cryptographie militaire," *Journal des sciences militaires*, 1883.** Security must not rest on the secrecy/obscurity of the mechanism. An unkeyed physical encoding is a mechanism, not a secret; not claimed.
- **U. Rührmair et al., "Modeling Attacks on Physical Unclonable Functions," ACM CCS 2010.** Even *deliberately* unclonable physical functions are model-and-forge-able from observed challenge–response pairs; a fortiori, a public phase/polarization mask is forgeable. Not claimed.
- **NIST SP 800-90B (2018), *Recommendation for the Entropy Sources Used for Random Bit Generation*.** A raw analog/physical source is never used directly; it is health-tested and conditioned before any cryptographic use. The same admit-through-a-gate posture is applied here to physical *verdict* signals. Not claimed.
- **C. E. Shannon, "A Mathematical Theory of Communication," *Bell System Technical Journal* 27, 1948.** Channel capacity under noise/power constraints — the accounting that kills "N× channels = free N× data". Not claimed.
- **S. C. Kleene, *Introduction to Metamathematics*, 1952 (strong three-valued logic).** The K3 lattice used for the composition rule. Not claimed (logic from 1938/1952).
- **B. Hayes, "Third Base," *American Scientist* 89(6):490–494, 2001; N. P. Brusentsov's Setun (Moscow State University, 1958).** Ternary radix economy — a known **constant** factor (log₂3 ≈ 1.585), optimal integer radix 3 near e ≈ 2.718; historically implemented; never exponential. Not claimed.
- **Y. Jin, H. He, Y. Lü, "Ternary optical computer principle," *Science in China Series F: Information Sciences* 46(2):145–150, 2003.** Real ternary optical computing exists and is **not disputed** here — only the security-authority claims wrapped around it.
- **IEEE Std 802.11bb-2023 (light communications); IETF RFC 9000 (QUIC, incl. 0-RTT); W3C Web Authentication (WebAuthn).** The mature technologies that several of the audited proposals re-derive; cited to scope novelty of those proposals to ≈ zero.
- **In-folder siblings:** `latency-is-not-work` (measured-negatives) and DP-RD-0257 (span-not-work) cover the complexity half; DP-RD-0129 (integrity ≠ fidelity) covers the signed-artifact half. This note federates the *authority* half.

**What is NOT claimed as novel:** any individual physics fact, information-theoretic bound, or security principle above. **What this document places on record:** the fallacy-class naming, the ten-family refutation corpus as a unit, the degrade-only composition rule as the *only* sanctioned way to consume physical signals in an authorization lattice, and the rebuttal-with-mathematics protocol with the source model's concession as a documented outcome.

## 4. Summary of the disclosed subject matter

A security-review method wherein any design claim of the form "physical phenomenon ⇒ security guarantee" is (i) classified as **physics-as-authority** and presumed fail-open until shown otherwise; (ii) tested against the refutation corpus (§5); (iii) admitted, if at all, only as a **degrade-only** input to a three-valued verdict lattice via `verdict = min(digital_keyed_verdict, physical_signal)` so the physical term can force DENY/UNKNOWN but can never manufacture ALLOW; and (iv) where the claim originated from a generative model, returned to that model as a rebuttal prompt carrying the counter-mathematics, the model's concession or counter-sources being recorded in the review artifact.

## 5. The refutation corpus (all machine-checked; proof 15/15)

| # | Claim family (as generated) | Refutation (one line of maths/logic) | Anchor |
|---|---|---|---|
| 1 | "Loops/search become **O(1)** at light speed"; "O(0) compute" | Latency ≠ work: transit time is span; the N² MACs / N fold-steps remain and bound energy/time below by output size | Brent/Amdahl; in-folder DP-RD-0257 |
| 2 | "**Exponentially** more data per symbol (ternary)" | Radix economy is a **constant**: log₂3 ≈ 1.585 bits/symbol; optimal integer radix is 3 because e ≈ 2.718 — a ×1.585 factor, never exponential | Hayes 2001; Setun 1958 |
| 3 | "N wavelength channels ⇒ N× throughput **free**" | Fixed total optical power split across N channels ⇒ per-channel SNR falls ~1/N; capacity per channel shrinks (log of a smaller SNR); crosstalk adds | Shannon 1948 |
| 4 | "The photon/phase-mask **is** the signature; cannot be copied" | A phase/polarization state is a *public, observable, replayable* encoding; observation + re-emission = forgery; no key, no binding | Kerckhoffs 1883; Rührmair 2010 |
| 5 | "Session hijacking **mathematically impossible**" (light tether) | The tether is an unauthenticated channel property; an adversary who controls the channel reproduces the property; possession ≠ identity | standard channel-vs-principal separation |
| 6 | "**Infinite DDoS protection at zero cost**" (Zero-RTT optical handshake) | Admission still costs verification work per request; 0-RTT shifts, not deletes, cost (and adds replay surface — cf. QUIC 0-RTT anti-replay) | RFC 9000 |
| 7 | "Malus's law makes tampering **impossible**" | cos²θ gives tamper-**evidence** (detectable disturbance), not authentication; evidence ≠ identity, and detection is post-hoc | textbook optics; RD-0111 C17/18 |
| 8 | "Beer–Lambert absorption = **self-destructing data / revocation**" | Attenuation destroys *this copy in this fibre*; it cannot reach copies already made; revocation is a key-management property | textbook optics |
| 9 | "Biometric/camera liveness as the **authority**; physics severs sessions" | A sensor stream is spoofable input (presentation attacks); sound only as a *degrade-only* continuous-auth signal feeding min() | NIST SP 800-90B posture, applied to verdicts |
| 10 | "Device-bound optical credential = **unhackable**; replaces cookies/JWT" | Re-derives passkeys/WebAuthn (sound, keyed, standardized) plus an unkeyed physical wrapper that adds forgeability, not strength | W3C WebAuthn |

**The composition rule (the sound residue, disclosed as sound).** In the K3 lattice DENY(−1) < UNKNOWN(0) < ALLOW(+1), a physical/analog signal `p` is admitted only as `verdict = min(v_keyed, p)`. Proof obligations checked: min is associative/commutative on the trit domain (exhaustive over 27 triples); `min(v, p) ≤ v` for all p (degrade-only — no p can raise a verdict); under multiplication two DENYs would forge an ALLOW ((−1)·(−1)=+1), which is why the operator is pinned to min. Crypto and admission remain bit-exact on the digital core (rule `FUNGI-SUBSTRATE-001`); tamper-evidence sensors may *lower* p; nothing physical may *raise* it.

**The audit protocol and the concession.** Each overclaim was formalised, machine-checked (`rd-0266-photonic-syntax-claims-proof.mjs`, 15/15), and returned to the generating model as a standalone rebuttal prompt: the claim verbatim, the counter-mathematics, and a request to either provide primary sources or concede. The source model (Google Gemini) **conceded all rebuttals** (recorded 2026-07-08, RD-0266c §1). Honest weight: a model's concession is **not** scientific authority — the mathematics stands on its own; the concession is recorded as evidence that the claims do not survive even their own generator's scrutiny when confronted with the accounting, and as a worked example of the protocol.

## 6. Honest limitations & scope

- **Model-level and literature-grounded; no physical hardware was measured.** The refutations are information-theoretic/logical and do not depend on measurement; no benchmark of any photonic device is claimed.
- **Ternary optical computing itself is not disputed** (Jin et al. 2003 is real work); nor are Li-Fi (802.11bb), optical interconnects, or WDM. The refuted object is the *security-authority wrapper*, never the substrate.
- **Tamper-evidence and continuous-auth signals are affirmed as useful** — strictly as degrade-only inputs. The corpus removes their promotion to authority, not their use.
- **"Fallacy class" is an engineering label,** not a formal-logic result; the classification's value is recognition speed at review time.
- **The concession is one model, on stated dates, under this protocol** — not a survey of models, and concession text can change with model versions. The mathematics, not the concession, is load-bearing.
- **No new cryptography** is proposed anywhere in this note.

## 7. Illustrative disclosure claims (prior-art disclosures, not patent claims)

1. **A method** of security review wherein any claim assigning authorization, authentication, integrity, or revocation force to an unauthenticated physical phenomenon is classified as presumptively fail-open ("physics-as-authority") and rejected unless re-expressed as a degrade-only input to a keyed digital verdict.
2. **A method** as in claim 1 wherein physical/analog signals are composed with keyed verdicts exclusively via the three-valued meet `min(·,·)` over DENY < UNKNOWN < ALLOW, whereby the physical term can force denial but can never produce an allowance, and wherein cryptographic operations remain bit-exact on a digital substrate.
3. **A method** as in claims 1–2 wherein tamper-evidence (e.g. polarization disturbance, attenuation) is consumed as a DENY/UNKNOWN-forcing sensor input and is never treated as authentication of a principal.
4. **A method** of auditing generative-model design output wherein each quantified or security-bearing claim is formalised, machine-checked by a re-runnable script, and — if refuted — returned to the generating model as a rebuttal prompt carrying the counter-mathematics and a demand for primary sources, the model's concession or counter-evidence being recorded in the review artifact as provenance.
5. **A corpus** structured as claim-family → one-line refutation → machine check → primary-source anchor (per §5), maintained so that recurrence of a family in new design material is dispositioned by reference rather than re-derivation.

## 8. Machine-checkable evidence

**Proof:** `rd-0266-photonic-syntax-claims-proof.mjs` (internal engineering KB) — Node built-ins only; re-run with `node rd-0266-photonic-syntax-claims-proof.mjs`; expect **15 passed, 0 failed**, exit 0. Checks include: latency-vs-work accounting; radix-economy constant (log₂3, optimum at e); per-channel SNR division under fixed power; phase-mask observe-and-replay forgery model; min-fold degrade-only property (exhaustive over the trit domain) vs the multiplication forgery; and the EXCLUDED list (claims refuted with no sound residue). The rebuttal prompts and the concession record are at the provenance paths in the header.

---

### Declarations

- **Type / tier:** defensive-pub (fallacy-class naming + refutation corpus + audit protocol; prior-art record). Not a flagship, not a novelty claim.
- **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth). Grounding: the cited primary literature (Kerckhoffs 1883; Shannon 1948; Kleene 1952; Hayes 2001; Rührmair et al. 2010; NIST SP 800-90B; Jin et al. 2003; IEEE 802.11bb; RFC 9000; W3C WebAuthn), the RD-0111/RD-0266-series assessments, and the re-runnable proof above. The audited overclaims were generated by a third-party model (Google Gemini) and are quoted as claims, not endorsed. Prior-art triage is informed by training knowledge, **not** a filed legal search.
- **Funding:** none. · **Competing interests:** none.
- **Data / artifact availability:** proof script, rebuttal prompts, concession record, and assessments at the stated in-repo paths.
- **Licence:** Apache-2.0.
