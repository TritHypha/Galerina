# Defensive Publication — Provenance: integrity is not fidelity — a signature attests authenticity, not correctness

**Disclosure ID:** DP-RD-0129 · **Date:** 2026-07-04 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Provenance:** RD-0129 · source invariant `galerina-provenance-integrity-vs-fidelity.md` (dated 2026-06-26; threat-model #36 finding P1, sharpened by the RD-0117 photonic-admission re-verify) · the two signed-artifact fail-opens named therein · the acceptance-bar substrate harnesses `galerina-core-compiler/tests/{fidelity-differential,wat-i64-differential,u64-wasm-differential,float-nonfinite-wasm-parity}.test.mjs` and the `verifyPhotonicCertifiedAdmission` code path in `galerina-tower-citizen/src/hybrid-engine.ts` — all confirmed present on disk 2026-07-04. No RD-0129-specific proof script exists; the source explicitly defers that build (disclosed in §6, §8).

> **Purpose of this document.** This is a *defensive publication* — a deliberate act of putting a design invariant and its acceptance bar into the public domain as prior art, so the technique cannot later be monopolised by a patent, and so the *honest* bound on what a signature does — and does not — attest is on the record. It is expressly **not** a patent application and makes **no** proprietary claim. The contribution here is as much the disclosed *limitation* as the disclosed *discipline*: the invariant below states precisely what a valid signature **fails** to prove (fidelity), and names two concrete places where treating a signature as a fidelity proof is a fail-open. That honesty — naming the gap and the bar a real fix must clear — is the point. This document is a **design invariant / discipline, not a mechanism**; it does not itself produce the equivalence proofs it demands, and the two specific fail-opens it names are owner-gated to remediate.

---

## 1. Technical field

Software supply-chain and runtime trust decisions that consult a cryptographic signature over an artifact (a compiled binary, a build manifest, a capability/bridge manifest, a hardware-identity label) as an input to a behavioural gate — admission, boot, dispatch, or compile-accept. Specifically: the semantic distinction between the property a digital signature actually attests (authenticity + integrity of the signed bytes) and the property a trust decision often silently assumes it attests (fidelity — that the bytes correctly represent or compute what they claim).

## 2. Background & problem

A digital signature over an artifact binds two facts: **authenticity** (a trusted key-holder vouched for these bytes) and **integrity** (these exact bytes are unmodified since signing). Both are facts *about the bytes as bytes*. Neither is a fact about whether those bytes are *correct* — whether a compiled artifact faithfully realizes its source semantics, or whether a named label faithfully reflects the physical thing it labels.

The source invariant (`galerina-provenance-integrity-vs-fidelity.md`, lines 10–12) states it as:

> "A verified signature proves AUTHENTICITY + INTEGRITY — that these exact bytes / this exact label are unmodified since a trusted key signed them. It does NOT prove FIDELITY — that the bytes faithfully realize the source semantics, nor that a named label faithfully reflects the physical substrate."

Treating a valid signature as evidence of *correctness* is therefore a **fail-open**: the provenance attests the wrong property for the trust decision being made. The decision passes because "it is signed" — but signed-ness was never evidence for the thing being decided. This is acute anywhere a signed artifact gates a behavioural decision, because a signed-but-non-faithful artifact carries all the outward marks of trustworthiness (valid signature, green provenance) while being wrong.

The problem addressed here: **state the invariant crisply enough to be applied as a discipline at every signed-artifact gate, enumerate concrete instances where it was violated, and define the acceptance bar a genuine fidelity attestation must clear — so that "signed" is never again silently read as "correct".**

## 3. Prior art (stated honestly)

The disclosed framing composes several well-established, individually non-novel ideas. This section names the closest prior art precisely so this publication claims nothing already public, and so the *combination + scoping* is what enters the record.

- **The general principle "a signature is not a proof of correctness."** This is folklore in cryptographic engineering and formal methods: a signature is an authenticity/integrity primitive, not a verification primitive. **Not claimed as novel.** This document's contribution is the *crisp integrity ≠ fidelity framing applied specifically to governed signed artifacts on a behavioural gate*, plus a concrete acceptance bar.
- **SLSA (Supply-chain Levels for Software Artifacts) provenance.** SLSA attestations bind *how and from what* an artifact was built (the build platform, source, and process) — they attest the **build**, not the **program's correctness**. SLSA explicitly does not certify that the built program does the right thing. This document is squarely downstream of and consistent with that scoping; **no novelty is claimed over SLSA.** The point made here is the same distinction pushed one step: even a perfect build attestation over a faithful build process does not attest that *this artifact* faithfully realizes *its source semantics* on a per-construct basis.
- **Reproducible / deterministic builds.** Reproducibility lets independent parties confirm that given source + toolchain produce bit-identical output — an integrity/authenticity strengthener (it detects tampering in the build path). It does **not** establish that the output is a faithful lowering of the source's *semantics*; a deterministic build of a non-faithful emitter reproducibly yields the same non-faithful bytes. **Not claimed as novel; cited to disclaim.**
- **Translation validation (Pnueli, Siegel & Singerman, TACAS 1998) and certifying / proof-carrying compilation (Necula, POPL 1997 — proof-carrying code; Necula & Lee — certifying compilers).** These are the canonical prior art for *establishing that a compiler's output is semantically equivalent to (or a sound refinement of) its input*, per compilation run, rather than trusting the compiler. The acceptance bar in §4 (sign the equivalence *verdict*) is an instance of exactly this discipline. **Translation validation is the prior art the bar rests on and is not claimed as novel.** The net contribution is applying that discipline as the *acceptance criterion for what a governed signature may attest* — "sign the equivalence verdict, not the artifact bytes." *(These works are named by author/venue/year; see the Declarations block on citation-verification scope.)*

**What is therefore NOT claimed as novel:** the "signature ≠ correctness" principle; SLSA build provenance; reproducible builds; translation validation / certifying compilation. **What this document places on record** is (a) the crisp **integrity ≠ fidelity** framing applied to *governed signed artifacts that gate a behavioural decision*, (b) two concrete fail-opens of that framing grounded in live code, and (c) the acceptance bar **"if you must attest fidelity, sign the machine-checked equivalence verdict, not the artifact bytes."**

## 4. Summary of the disclosed subject matter

A design invariant and acceptance discipline for systems that consult a signed artifact at a behavioural gate:

1. **The invariant.** A verified signature attests **authenticity + integrity** (these exact bytes / this exact label, from this key-holder, unmodified). It does **not** attest **fidelity** (that the bytes faithfully realize the source semantics, nor that a label faithfully reflects the physical substrate).
2. **The fail-open it names.** Any gate that reads "signature valid" as evidence of correctness is fail-open with respect to a signed-but-non-faithful artifact.
3. **The acceptance bar.** Where fidelity *must* be attested, the attestation must sign a **machine-checked equivalence / translation-validation verdict** — a receipt binding the artifact to the differential corpus that established, per construct, that the artifact is observably equivalent to a reference semantics — and must **fail closed** on any construct lacking such a witness. The signature then rides on the *equivalence verdict*, not on the artifact bytes.

## 5. Detailed description / embodiment (with the two named fail-opens and the acceptance bar, verbatim)

The invariant is instantiated by two concrete fail-opens on record (source doc, lines 19–24), both of the *same shape*: a signature is load-bearing for a property it does not actually attest.

**Instance P1-a — the compiler EMITTER stub signed as if it were the real lowering.**
The build provenance path (`manifest-generator` / `proof-graph`) signs the emitted WAT/WASM bytes. A *legal* `.fungi` source whose WAT the assembler rejects falls back to a **minimal-encoder stub**; the provenance then signs the stub's bytes. The signature faithfully attests *the stub's bytes* — but the trust decision downstream reads it as attesting *that the emitted artifact realizes the source flow*, which the stub does not. Source (line 23):

> "a *non-faithful* emit (a legal `.fungi` whose WAT the assembler rejects → minimal-encoder stub) is signed-as-correct: the signature attests the stub's bytes, not that the stub realizes the source flow"

**Acute-risk bound (disclosed honestly, per source line 23).** The acute exploit — *ship a signed stub* — is stated in the source to be already shut by the C2 faithful-compile gate: under `GALERINA_PROFILE=production` a non-faithful stub (`diagnostics ≠ 0`) fails the build before signing. What remains open is the *deep* gap: a **non-stub but semantically divergent** emit, which C2's stub-detector does not catch. That deep gap is what the acceptance bar (below) targets and is **owner-gated to remediate**. *(This bound is reproduced as the source's stated assertion; this document did not independently re-run the C2 gate.)*

**Instance P1-b — a `hardwareIdentity` LABEL that is signed but never verified against the real hardware.**
`verifyPhotonicCertifiedAdmission` (`hybrid-engine.ts`) consults a signed `BridgeManifest` whose `hardwareIdentity` field claims `"photonic…"`. The check `hardwareIdentity.startsWith("photonic")` reads a **self-asserted label the signer vouched for** — not proof that the backend is physically photonic. A trust-root holder can sign a coupon labelled photonic for a non-photonic backend. Source (line 24):

> "`hardwareIdentity.startsWith("photonic")` is a self-asserted label the signer vouched for, NOT proof the backend is physically photonic. A trust-root holder can sign a coupon labelled photonic for a non-photonic backend"

This is verifiable in the live code: `hybrid-engine.ts` line 568 performs `!hwId.startsWith("photonic")`, and the surrounding comment (lines 561–563) records "`hardwareIdentity` is an ADVISORY label the signer vouched for, NOT a [proof]" with the load-bearing check being `signed.manifest.bridgeId !== declaredBridgeId` (line 577). The method carries the annotation "(RD-0129 red-team fix)" (line 511).

**Acute-risk bound (disclosed honestly, per source line 24).** Reaching this requires *both* the engine's pinned signing key *and* the operator to declare the matching `bridgeId`; outside that confused-deputy model an unprivileged caller is dead (forgery / cross-policy / cross-id all fail closed, stated in the source as verified in RD-0117 + RD-0129). The load-bearing binding is `bridgeId === declaredBridgeId` under a verified signature; `hardwareIdentity` is **advisory**. A true substrate-fidelity proof would need a hardware attestation root (TPM / secure-element measuring the actual backend) which Galerina does not own — so P1-b's deep fix is **out of scope by design** (source, lines 45–49): Galerina governs; it does not manufacture a hardware root of trust.

**The acceptance bar — sign the equivalence verdict, not the bytes (source lines 28–49).**
The deep fix is to attest **equivalence**, not bytes — sign a proof that the artifact *faithfully realizes its source*, per construct:

1. **Reference semantics.** The walker (`interpreter.ts`) is the reference; the emitted WASM must be observably equivalent to it — the existing **0014 differential discipline**: the seed harnesses `fidelity-differential.test.mjs`, `wat-i64-differential.test.mjs`, `u64-wasm-differential.test.mjs`, `float-nonfinite-wasm-parity.test.mjs`, which the source characterizes as establishing walker ≡ WASM, byte/value-exact.
2. **Per-construct coverage, fail-closed on a gap.** Equivalence must hold for *every* construct the emitter lowers; any construct without a differential witness must **DENY** the fidelity attestation (not pass by omission). A construct the emitter cannot lower must be a hard compile-reject, never a silent stub (the emitter-completeness dependency).
3. **The attestation signs the equivalence verdict, not the bytes.** A `TestWitness`-style signed receipt binding the artifact hash to *the differential corpus that passed for it*, so a verifier admits only an artifact whose *fidelity* (not just integrity) was witnessed (`leak-proof.ts` `TestWitness` + the 0014 harness are the two halves to join).
4. **For P1-b specifically:** demote `hardwareIdentity` to documented-advisory (done — code comment + `bridgeId` binding is load-bearing); a true substrate-fidelity proof requires a hardware attestation root Galerina does not own, so it is out of scope by design.

**Decision on record (source lines 51–60):** record the invariant, add the advisory-label comment at the `hardwareIdentity` check, cross-link the threat-model P1 row — *no behavioural code change at that pass*, because the acute cases are already bounded (P1-a by C2, P1-b by trust-root + binding). **Defer** the equivalence-attestation build (the emitter-completeness workstream). **Do NOT** treat a passing signature as a fidelity proof anywhere new without a differential witness behind it.

## 6. Honest limitations & scope

Disclosed as first-class content, not minimised caveats:

- **This is a discipline, not a mechanism.** The invariant states *what a signature fails to attest* and *the bar a fidelity attestation must clear*. It does **not** itself produce any equivalence proof, sign any verdict, or close any gate. Adopting it is a design-review obligation, not a runtime component.
- **It does not by itself remediate the two named fail-opens; the shipped mitigation is detect/bound, not a fidelity guarantee.** P1-a's deep gap (non-stub divergent emit) and P1-b's label-vs-substrate gap are **owner-gated**. At time of disclosure the mitigations on record are *bounds*, not fidelity proofs: P1-a's acute case is bounded by the C2 production faithful-compile gate; P1-b is bounded by trust-root possession + `bridgeId` binding, with `hardwareIdentity` demoted to advisory. Neither establishes that a signed artifact is *faithful* — that remains the deferred equivalence-attestation build.
- **The acceptance bar depends on emitter-completeness.** Per-construct differential coverage is only tractable once the emitter lowers enough constructs; until then a fully fail-closed fidelity attestation over all constructs cannot be built — which is precisely why the build is deferred, not shipped.
- **P1-b's fidelity gap is out of scope by design.** A genuine substrate-fidelity proof (that a backend labelled photonic *is* physically photonic) requires a hardware attestation root (TPM / secure-element) the reference system does not own and does not claim to. The disclosure keeps the `bridgeId` binding + advisory label + operator-config trust boundary; it does not solve hardware attestation.
- **No new cryptography and no new science.** The signature primitive, translation validation, and differential testing are all pre-existing. The contribution is the framing and the acceptance bar, disclosed as prior art.
- **Evidence is existing harnesses + code-grounded fail-opens, not a self-contained GREEN proof for RD-0129.** Unlike a mechanism disclosure, there is no dedicated `rd-0129-*.mjs` re-runnable that emits a GREEN block; the source explicitly *defers* the equivalence-attestation build. The machine-checkable substrate is the four named 0014 differential harness files and the `verifyPhotonicCertifiedAdmission` code path (§8), all confirmed present on disk 2026-07-04. This document confirms those files exist and match the cited identifiers; it did **not** independently execute the harnesses, and does not restate a pass/fail tally it did not run. This is stated plainly rather than dressed as a proof this document does not have.

## 7. Illustrative disclosure claims

Disclosed embodiments, stated as broadly-but-truthfully as the evidence supports. Prior-art disclosures, **not** patent claims.

1. **A discipline** wherein, at any behavioural gate (admission, boot, dispatch, compile-accept) that consults a cryptographic signature over an artifact, the signature is treated as attesting only authenticity + integrity of the signed bytes/label, and is explicitly barred from being read as evidence of the artifact's fidelity (correct representation or computation of what it claims).

2. **A method** as in claim 1 wherein, where fidelity must nonetheless be attested, the system signs a machine-checked equivalence verdict — a receipt binding the artifact's hash to a differential corpus establishing, per source construct, observable equivalence between the artifact and a reference semantics — rather than signing the artifact bytes, such that a verifier admits only an artifact whose fidelity was witnessed.

3. **A method** as in claim 2 wherein any construct lowered by the artifact but lacking a differential equivalence witness causes the fidelity attestation to be DENIED (fail-closed by omission), and any construct that cannot be lowered is a hard compile-reject rather than a silently substituted stub.

4. **A recognition, placed on record as prior art**, that build-provenance attestation (e.g. SLSA), reproducible builds, and artifact-byte signatures each attest authenticity/integrity or the build process, and none attest program fidelity — so that a signed-but-non-faithful artifact (a signed minimal-encoder stub; a signed but hardware-unverified substrate label) is a fail-open unless a separate equivalence verdict is attested.

5. **A method** as in claim 2 wherein a self-asserted label within a signed manifest (e.g. a claimed hardware/substrate identity) is treated as advisory and not load-bearing, the load-bearing binding being an identity match verified under the signature, absent a hardware attestation root that measures the physical substrate.

## 8. Machine-checkable evidence

**Nature of the evidence (stated honestly).** RD-0129 is a *deferred-build* invariant; there is **no** dedicated single-file GREEN proof script for it, and this document does not present a fabricated GREEN block. The evidence has two verifiable parts, both checked 2026-07-04.

**(a) The acceptance-bar substrate — the 0014 differential harnesses (confirmed present on disk 2026-07-04):**

```
C:/wwwprojects/Galerina/packages-galerina/galerina-core-compiler/tests/
    fidelity-differential.test.mjs        (308 lines)
    wat-i64-differential.test.mjs         (105 lines)
    u64-wasm-differential.test.mjs         (83 lines)
    float-nonfinite-wasm-parity.test.mjs   (62 lines)
```

The source characterizes these as establishing walker (`interpreter.ts`) ≡ emitted-WASM equivalence, byte/value-exact, and names them (with `leak-proof.ts` `TestWitness`) as the two-halves-to-join that a real fidelity attestation signs. `TestWitness` is confirmed present in `galerina-core-compiler/src/leak-proof.ts`. **How to re-run:** execute each harness with the package's Node test runner from `galerina-core-compiler/`. *(This document confirms the four files exist, are non-empty substantive test files at the line counts shown, and are the named substrate; it did not itself execute them and therefore states no pass/fail count — the source names them as the discipline, not as a green tally for RD-0129.)*

**(b) The two code-grounded fail-opens.** P1-b is verified against live code: `galerina-tower-citizen/src/hybrid-engine.ts` contains `verifyPhotonicCertifiedAdmission` (method at line 517), the `!hwId.startsWith("photonic")` check (line 568), the advisory-label comment (lines 561–563), the load-bearing `bridgeId !== declaredBridgeId` binding (line 577), and the "(RD-0129 red-team fix)" annotation (line 511). P1-a is grounded in the source invariant's description of the `manifest-generator` / `proof-graph` emitter-provenance path; this document did not independently reproduce the emitter stub path.

**No quantitative claim in this document rests on an unverified number.** Where the source states an acute-risk bound (C2 gate for P1-a; trust-root + `bridgeId` binding for P1-b), it is reproduced as the source's assertion with its stated provenance, not upgraded to a machine-checked result this document did not run. Numbers that appear in unrelated proofs (e.g. TritMeshQL graph-spine / divergence-probe counts, or the RD-0233 fix) belong to other disclosures and are deliberately **not** imported here.

**Cross-references:** source invariant `galerina-provenance-integrity-vs-fidelity.md` (2026-06-26); threat-model P1 row `galerina-threat-model-unleashed-2026-06-25.md`; `galerina-rd-0128-cicd-native-testgen.md` (the `TestWitness` receipt); `galerina-rd-0117-hybrid-join-2026-06-24.md` (photonic-admission fail-closed re-verify surfacing P1-b); the 0014 differential harnesses (§8a); the **prove-own-maths** posture (machine-checkable re-runnable artifact for everything proposed *and* dismissed — the discipline this bar instantiates for fidelity).

---

## Declarations

- **Type / tier:** Defensive publication (prior-art disclosure). Not a patent claim, not a novelty claim, not a flagship. Design-invariant / discipline disclosure.
- **Authorship & AI assistance:** Drafted with AI assistance under human direction (owner **Phillip Booth**). Grounding: the cited source `galerina-provenance-integrity-vs-fidelity.md` (read verbatim, dated 2026-06-26), the P1-b fail-open verified against the live `hybrid-engine.ts` code path, and the four 0014 differential harness files plus `leak-proof.ts` `TestWitness` confirmed present on disk (2026-07-04). Prior-art citations (SLSA; reproducible builds; translation validation — Pnueli, Siegel & Singerman, TACAS 1998; proof-carrying / certifying compilation — Necula, POPL 1997) are named to disclaim novelty. These are named by author/venue/year; where an authoritative id (DOI/handle) could not be pinned within this READ-ONLY pass, the reference is given by author/venue/year only and was **not** fabricated into a false DOI. No reference here is invented; any citation that could not be stood behind was omitted rather than guessed.
- **Funding:** None.
- **Competing interests:** None.
- **Data / artifact availability:** All artifacts are in-repo and re-runnable at the paths named in §8 (`galerina-core-compiler/tests/*.test.mjs`; `galerina-tower-citizen/src/hybrid-engine.ts`); the source invariant and cross-referenced docs are in `ZTF-Knowledge-Bases`. No dedicated RD-0129 proof script exists (build deferred) — this is disclosed rather than concealed.
- **Licence:** Apache-2.0. Owner / copyright: **Phillip Booth** (hello@consumerthoughts.co.uk).