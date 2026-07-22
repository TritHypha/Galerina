# The verdict and the reasoning space: a three-axis extension of ternary governance logic

**Defensive publication · dp-rd-0460 · 2026-07-17 · TritHypha (hello@trithypha.dev) · Prior-art disclosure — not a patent claim** (landed in `docs/paper/defensive-papers/` 2026-07-22)
**Purpose:** establish prior art for the mechanisms below so they remain freely implementable. Design-stage; the discrete governance boundary described is shipped practice, the vector extension is a design.

## Setting

A fail-closed ternary governance boundary uses Kleene K3 over `DENY(−1) < INDETERMINATE(0) < ALLOW(+1)`: conjunction is `min`, disjunction is `max`, and authorization occurs only on exactly `+1`. A proven production pattern extends this with a *continuous triage layer*: a probability vector over the three outcomes that must collapse through a fail-safe projection before any decision — where the projection allows only a confident strict argmax, and a confidence signal **can only lower an outcome toward deny, never manufacture an allow**. The design below generalizes that "richness can only lower" architecture.

## Claimed mechanisms

### 1. The K3-V state: verdict vs reasoning space

Keep the trit as the **public verdict**. Represent internal state as a vector `L = (x, e, i)`:

- `x ∈ [−1,+1]` — **orientation** (deny ↔ allow; domain-typed)
- `e ∈ [0,1]` — **evidence saturation** — how much information supports the state
- `i ∈ [0,1]` — **integrity** — how trustworthy the evidence and execution path are

The governance boundary remains exact and fail-closed: a profile-specific projection `Π(x,e,i) → {−1,0,+1}` authorizes only when all axes clear their thresholds; everything else denies. **Indeterminate becomes a region, not a point** — while the external decision language is unchanged.

### 2. The evidence ledger with non-amplification invariants

State is derived, never asserted: observations `(direction, weight, reliability, timestamp, provenance-group, id)` fold into positive/negative/unresolved masses `P, N, U` with reliability, age, and correlation discounting. Invariants, machine-checkable:

- **Replay non-amplification:** re-fusing an observation with an already-seen id is a no-op — `fuse(E,o,o) = fuse(E,o)`. Repetition is not corroboration.
- **Correlation discount:** copies sharing a provenance root are down-weighted (`1/n_g^α`) — replicas of one origin cannot masquerade as independent witnesses.
- **Freshness monotonicity:** with no new evidence, `e(t+Δ) ≤ e(t)` — confidence decays, it never coasts.
- **Contradiction safety:** adding balanced contradictory evidence can never produce an allow.
- **Integrity monotonicity:** reducing `i` can never raise the projected verdict.
- **Veto dominance:** hard security facts override all numeric evidence (invalid signature ⇒ −1; missing proof ⇒ 0; revoked identity ⇒ −1).

### 3. Conflict and ignorance as distinct first-class signals

Derived values `ν = 1 − e` (ignorance) and `χ = 2·min(P,N)/(P+N+ε)` (conflict) separate "we know nothing" from "strong evidence disagrees." Both deny at an authorization boundary — but they route differently: ignorance requests more evidence; **high conflict is an anomaly signal** (compromised sensors, stale replicas, active tampering) that can feed detection and response rather than being silently absorbed into "unknown."

### 4. The asymmetric security voter

For redundant ternary lanes, majority voting is replaced at authority-relevant points by an asymmetric rule: output `+1` only when `n₊ ≥ q_allow ∧ n₋ = 0 ∧ i ≥ i_min`; output `−1` when `n₋ ≥ q_deny`; otherwise `0`. A single dissenting deny blocks acceptance — false-allow is made strictly harder than false-deny, which is the correct asymmetry for a security gate (and the opposite of plain majority, which lets two corrupted lanes outvote one honest denial).

### 5. The ternary channel matrix and correlated redundancy model

Per-lane measurement error is modeled as a row-stochastic 3×3 matrix `C_ab = P(read b | true a)` rather than a scalar error rate — erasure (`+1→0`), inversion (`+1→−1`), false-positive (`0→+1`) and false-negative (`0→−1`) are distinct, unequally dangerous events with their own probabilities, telemetry-dependent (drift, temperature, power, age). Redundant lanes are modeled as **conditionally independent given a shared environmental variable** (common drift, shared supply, calibration error, malicious injection), so common-cause failure is representable — replicas are not assumed diverse. Combined with §4, redundancy claims become auditable instead of optimistic.

### 6. Typed algebra profiles with a risk budget

Operators are profile-typed `⟨S, ⊕, ⊗, Π⟩`: an all-conditions governance profile (component-wise `min`), an independent-reliability profile (series/parallel products), a matching profile (consume/merge), an optimization profile. The compiler rejects operations between incompatible profiles — an authorization vector cannot be multiplied by a latency vector. Each profile's projection may also carry an explicit **risk budget** `δ`: authorize only when the calibrated probability of incorrect allow is ≤ δ, letting one algebra serve UI search and safety shutdown with different budgets, without changing the underlying mathematics.

### 7. Physical interpretation and quantization

Dual-rail optical rendering: orientation = normalized rail difference, evidence = total usable signal energy, integrity = pilot/calibration-channel validity — giving physically distinct readings for "both rails dark" (no evidence), "both rails strong" (conflict), and "output plausible but pilot failed" (hardware-invalid). Each axis quantizes to three bands, yielding a 27-state internal model (3×3×3) suitable for FPGA/software realization while the public decision remains one trit.

## Relation to prior art

Bilattice/Belnap-style logics separate truth from information ordering; subjective logic and Dempster–Shafer separate belief from uncertainty; weighted automata parameterize one structure by different semirings. The mechanisms claimed here are the specific composition: the three-axis state with **integrity as a first-class axis** (§1), the ledger invariants as machine-checkable properties (§2), conflict-as-anomaly-signal routing (§3), the zero-dissent asymmetric voter (§4), the telemetry-dependent ternary channel matrix with correlated-lane redundancy (§5), profile-typed algebras with risk budgets (§6), and the dual-rail/27-state physical mapping (§7) — all under the governing constraint that **the exact fail-closed trit boundary is preserved and every added layer can only lower an outcome, never lift it.**

## Declarations

- **Type / tier:** defensive publication (prior-art disclosure, novelty disclaimed per §"Relation to prior art") — **design-stage** (the discrete fail-closed boundary it generalizes is shipped practice; the K3-V vector extension is a design); no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the project's K3-V assessment R&D (the RD-0460 line), which grounds against the shipped discrete-boundary production pattern.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** design disclosure — the mechanisms and their machine-checkable invariants (§2) are specified in this document; no harness ships with this note.
- **Licence:** Apache-2.0.

*Published as a defensive disclosure. Contact hello@trithypha.dev.*
