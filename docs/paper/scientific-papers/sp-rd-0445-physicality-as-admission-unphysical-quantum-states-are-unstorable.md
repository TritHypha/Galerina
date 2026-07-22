# Physicality is an admission invariant: a fail-closed governed store for quantum-experiment data, demonstrated on real tomography and real hardware shots

**Disclosure ID:** SP-RD-0445 (landed in `docs/paper/scientific-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-22 · **Type:** construction paper (prior-art disclosure — NOT a patent claim; harness-backed) · **Provenance:** KB RD-0435 (the design: quantum data types, storage, and the honest classical backbone), RD-0445 (the executed real-data result), RD-0447 (the executed amplitude-space closure); runnable harnesses `examples/quantum-real-data/verify-quantum-real-data.mjs` — **12/12** on real published data — and `examples/quantum-sim-amplitude/verify-sim-amplitude.mjs` — **16/16** on closed-form states (both dependency-free; **re-run and personally verified 2026-07-22**, exit 0). **Honesty locks:** K3 three-valued logic here is *classical* governance, **not** a qubit claim; no quantum hardware behaviour is claimed; no performance number is claimed.

## Purpose

A data store ordinarily serves whatever bytes were written to it. Quantum-experiment pipelines make that a correctness hazard: widely-used unconstrained estimators (linear-inversion tomography) routinely emit "density matrices" that are **not physical states** — purity above 1, negative eigenvalues — because nothing in the estimator constrains the reconstruction to the physical set. A downstream consumer that trusts a stored ρ inherits the violation silently. We disclose the construction that closes this **at the storage boundary**: physicality is an **admission invariant** — a reconstruction that is not a valid state is *unstorable*, refused fail-closed, with a three-valued verdict distinguishing gross violations from finite-shot noise. The same discipline is demonstrated in both spaces real workflows emit: **measurement space** (shot histograms, on real hardware data) and **amplitude space** (statevectors/ρ, on simulator artifacts — real hardware never emits amplitudes).

## The construction

- **Three-valued admission verdict, per value, deny-by-default.** Each stored physical quantity carries its invariant (purity `Tr(ρ²) ∈ [0,1]`; fidelity `∈ [0,1]`; statevector `Σ|aᵢ|² = 1`; histogram `Σ counts = shots`, `Σpᵢ = 1`, counts ≥ 0; ρ Hermitian, trace-1, PSD). A value inside the invariant **ALLOW**s; a *marginal* overshoot inside a declared finite-shot noise band is **INDETERMINATE** — quarantined and flagged, denied at any authorization boundary, never silently admitted; anything grosser **DENY**s — the store refuses admission.
- **Series fold by `min` (fail-closed).** A data series' verdict is the K3 `min` over its per-value verdicts: one gross violation refuses the series; a marginal-only series quarantines. No series is admitted on the reputation of its estimator — the gate judges values.
- **The balance-invariant shape.** Born-rule normalization (`Σpᵢ = 1` in measurement space, `Σ|aᵢ|² = 1` in amplitude space) is enforced the way a governed ledger enforces double-entry balance: as a stored invariant checked at admission, not a convention.
- **The honest storage split (no exponential pretence).** The store holds the **classical description**: the circuit (the recipe), measurement shots (exact integers), sparse observables, calibration, and — where structure allows — compressed forms (matrix-product states, stabilizer tableaux). It does **not** materialise the raw exponential state of a large system (50 qubits ≈ 18 PB for one pure state); an attempt to store one is *refused*, never silently truncated. This is a fact about physics, not a limitation of any engine, and the construction states it rather than hiding it.
- **Provenance as admissibility.** Every stored result binds its provenance (backend, job id, shot count, series key); a result that cannot be attributed is not admissible as evidence.

## Executed evidence — real published data (12/12)

Run against **Zenodo `10.5281/zenodo.7054827`** (*Experimental single-setting quantum state tomography* — real reconstructed purity/fidelity series across several estimators) and **Zenodo `10.5281/zenodo.7230109`** (real IBM `ibm_oslo` hardware shots, 3 circuits × 20,000 shots). The data is cited and downloaded, not redistributed. Measured verdicts on the real numbers, re-run 2026-07-22:

- **Unconstrained linear-inversion series — REFUSED.** Real purity series spanning `[0.963, 8.661]` and `[4.692, 779.034]`, and a fidelity series reaching `1.066`, all **DENY** — a purity of 779 is not a state, and the gate says so at admission.
- **A quadratic-purity series containing `−5.590` — REFUSED** (8 gross violations among 197 values: the per-value gate + min-fold refuse the series even though most of its values are individually plausible).
- **Constrained estimators (projected-least-squares) — ADMITTED.** Every value in `[0,1]`; series **ALLOW**.
- **A marginal case — QUARANTINED.** A series whose worst values are `1.046` (finite-shot overshoot) folds to **INDETERMINATE**, not ALLOW and not DENY — flagged, denied at boundaries, distinguishable from both.
- **Real hardware histograms — exact.** `Σcounts == shots` (20,000, exactly) and `Σpᵢ = 1.000000000000` across all 3 circuits; counts non-negative; integer round-trip bit-exact.

## Executed evidence — the amplitude-space complement (16/16, simulator)

Real superconducting hardware never emits amplitudes, so the amplitude-space checks run on **closed-form states built in-script** (Bell, GHZ₃, W₃, `H|0⟩`, `S|+⟩`, `Ry(0.7)|0⟩`) — the tier-honest instrument, since the only thing trusted is the analytic states themselves. Measured: all six genuine states admit (`Σ|aᵢ|²` within band; a complex-phase state proves the imaginary part is counted, `|i/√2|² = ½`); the Bell ρ is Hermitian, trace-1, PSD-by-idempotency, purity 1. Adversarially: an unnormalized vector (`Σ = 1.62`) **DENY**s; a marginal one (`Σ = 1.03`) **INDETERMINATE**s; a Hermitian trace-1 but non-PSD matrix (`diag(1.5, −0.5)`) **DENY**s by two *independent* detectors (min-eigenvalue `−0.5 < 0`; purity `2.5 > 1`). Amplitudes round-trip bit-exact.

## The finding

Real experimental pipelines emit both physical and unphysical reconstructions side by side, and a value-level fail-closed admission gate separates them **on the real numbers**: valid in, invalid refused, marginal quarantined — never a silent admit. The point of admission-by-construction is precisely that the store's contents are then *states by construction*: a consumer can no longer inherit a purity-779 "density matrix", because such a thing was never storable.

## Honest bounds

- **Invariant-math tier.** No engine ran; these are the admission invariants executed over real and closed-form values — the same tier as this corpus's other algebra harnesses. No claim is made about any store's throughput, and no hardware behaviour is claimed.
- **Scope of the PSD check.** PSD is proven by idempotency for the pure-state case and by closed-form 2×2 eigenvalues for the adversarial case; a general n×n mixed-state PSD gate needs an eigen-routine and is a later, separate step. Global-phase canonicalization, compression round-trip, and determinism checks remain design-stage.
- **The noise band is policy.** Where ALLOW ends and INDETERMINATE begins is a declared, per-deployment threshold; the construction fixes the *shape* (three-valued, deny-by-default, min-fold), not the numeric band.
- **A conversion of trust, not of truth.** Admission proves a value *could be* a state; it does not prove the experiment was performed well — provenance binding makes results attributable, not correct.

## Prior art (novelty disclaimed)

That unconstrained linear inversion yields unphysical estimates is well known in the tomography literature — constrained estimators (projected least squares, maximum-likelihood) exist precisely because of it. Physicality constraints (Hermitian, trace-1, PSD; Born-rule normalization) are textbook. Database admission/CHECK constraints and schema validation are standard engineering. **No novelty is claimed** over any of these. The disclosed *composition* is what is recorded as prior art: physicality as a **fail-closed, three-valued admission invariant of a governed store** — per-value verdicts, a quarantine band distinct from both admit and refuse, series folded by K3 `min`, the balance-invariant framing across measurement and amplitude space, the refuse-don't-truncate rule for exponential objects, and provenance-as-admissibility — executed on real published data.

## Declarations

- **Type / tier:** defensive-pub tier, eprint-shaped construction disclosure (harness-backed; novelty disclaimed above) — not a flagship/workshop novelty claim; no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the cited KB R&D records (RD-0435/0445/0447) and the two named runnable harnesses, both re-run 2026-07-22.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** harnesses + provenance notes in the project's Tensor-engine examples tree (pre-release): `examples/quantum-real-data/` (12/12; raw downloads git-ignored, DOIs + fetch commands recorded in its PROVENANCE file) and `examples/quantum-sim-amplitude/` (16/16; no external data — closed-form states). Real datasets: Zenodo `10.5281/zenodo.7054827` and `10.5281/zenodo.7230109` (cited, not redistributed).
- **Licence:** Apache-2.0.

*Published as a defensive/construction disclosure. Contact hello@trithypha.dev.*
