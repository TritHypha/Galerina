# Defensive Publication — Fail-closed differential cutover: promoting a verified implementation to authority against a retained reference oracle, with a cross-layer algebra-conformance gate

**Disclosure ID:** DP-RD-0361 · **Date:** 2026-07-12 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** shipped constituents (a signed-artifact admission gate, a differential-fidelity test pattern, a reproducible build path) composed into the disclosed method; the method is a verification/migration discipline.

## 1. What is disclosed

A **fail-closed methodology for replacing a reference implementation of a governed decision with a second, independently-verified implementation** (e.g. a compiled, sandboxed one), such that authority transfers only after execution-proven equivalence — and such that a divergence can never silently prefer the wrong answer.

The method is a **rung ladder**, each rung independently landable and continuously tested:

1. **Build-eligibility.** The candidate implementation compiles to a real deployable artifact (exit-clean). A failure here is scoped, logged work — not a shortcut taken.
2. **Signed admission.** The built artifact passes a **signed admission gate** (hash-pin · signature · closed import set) — the same admission any first-class code passes. An artifact that would execute *un-admitted* is a regression, not progress.
3. **Marshalling shim, decision-free.** A thin adapter moves inputs in and the result out. It contains **no decision logic** — it is host plumbing by construction, and stays.
4. **Fail-closed differential.** The candidate and the retained reference **both** run; **any disagreement is a REJECT plus an audit event** — never a silent preference for either side. Soak across the full test suite and a boundary-input fuzz corpus. Performance is measured here.
5. **Authority flip, atomic and evidence-gated.** Only after the differential is clean does the candidate become authoritative — and in the **same atomic change** the reference decision body is retired. Crucially: **after the flip there is no runtime fallback to the reference** — a candidate failure is a deny, and rollback is a deliberate, audited revert, never a live fallback path (a live fallback would silently bypass everything the differential proved).

A per-item **execution state-machine** — `shadow → differential → authoritative` — is recorded by an audit tool, so migration progress is **measured, not narrated**, and a regression (authoritative → lesser) fails a gate.

**The cross-layer companion: an algebra-conformance gate.** When the two implementations live in different layers that may not depend on each other (e.g. a compile-time checker and a runtime enforcer implementing the *same* small logic), a **conformance differential** proves them identical without either importing the other: it pins the **state bijection** (a rename on either side goes red), checks the **full truth table** of the shared operation (every input combination, both sides), asserts the algebra's laws (contagion, stickiness, a single explicit lift, deny-at-boundary), and includes an **anti-neuter self-test** — a deliberately drifted mock must turn the gate red, proving the gate is not vacuous. The test may see both layers even though the layers may not see each other, so it lives where both are visible.

## 2. What it prevents

- **Trusting-a-rewrite.** A reimplementation (hand-written, compiled, or machine-generated) cannot silently diverge from the behaviour it replaces: the retained reference is the oracle, and equivalence is *executed*, not asserted.
- **Silent-preference on divergence.** Because a mismatch is a fail-closed REJECT + audit, neither side is quietly favoured — the class of bug where "the new path wins and no one notices" is structurally excluded.
- **Two-implementations-drift.** Where the same logic is implemented twice across a layer boundary (a common, drift-prone necessity), the conformance gate turns "we believe they agree" into a fail-closed proof that they do — and a vacuous gate that could not detect drift is itself caught by the anti-neuter self-test.
- **Progress theatre.** The execution state-machine forbids reporting migration as done when the new implementation is still a passive shadow; a percentage is only as advanced as its measured rung.

## 3. Honest scope and bounds

- **Equivalence is proven over the exercised inputs.** A differential (even with fuzzing) demonstrates agreement on what it runs; it is not a proof of total equivalence for all inputs. The oracle is retained precisely because "passed the corpus" is not "provably identical everywhere."
- **The reference is the trust root during migration.** The method assumes the retained reference is itself correct; it migrates *authority*, it does not independently re-establish *correctness* of the oracle.
- **The conformance gate proves equality of the two algebras, not that either is the intended one.** It closes the drift seam; the specification correctness of the shared logic is a separate obligation.
- **Fail-closed costs availability at the seam.** A divergence halts rather than guesses; that is the deliberate posture.

## 4. Prior art acknowledged (novelty disclaimed)

Translation validation (Pnueli–Siegel–Singerman 1998; Necula 2000); differential / back-to-back testing (McKeeman 1998) and N-version programming (Avizienis); metamorphic and mutation testing (DeMillo et al. 1978) as the ancestor of the anti-neuter self-test; the bootstrapping-a-compiler-against-a-reference discipline and "reflections on trusting trust" (Thompson 1984) as the motivation for a retained oracle + reproducible build; signed-artifact admission and content-addressed pinning (SLSA, reproducible-builds); Kleene three-valued logic (1938) as the shared algebra in the worked case. The disclosed composition — *a rung ladder that promotes a verified implementation to authority only after a **fail-closed** differential against a retained reference oracle (divergence = REJECT + audit, no post-flip runtime fallback), with an atomic evidence-gated flip, a measured shadow→differential→authoritative state-machine, and a cross-layer algebra-conformance gate (pinned bijection · full truth table · algebra-law checks · anti-neuter self-test) that proves two non-dependent implementations identical* — is published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub.
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB RD-0361 (the cutover ladder) and RD-0360 (the trit-conformance gate), and the shipped admission-gate, differential-fidelity, and reproducible-build constituents. Galerina-internal migration *status* is deliberately **not** reproduced here; this discloses the method, not a progress report.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0361…` / `galerina-rd-0360…`; the admission gate, the differential-fidelity test pattern, and the conformance-gate self-test are in-repo and re-runnable.
- **Licence:** Apache-2.0.
