# Galerina Substrate Failure-Mode Model — Direction C sub-spec (seeded, fail-closed)

**Status:** spike sub-spec + implementation (Direction **C** of the photonic/ternary R&D agenda).
**Date:** 2026-06-15. Sequenced **after** Direction A (shipped), **before** Direction B.
**Parent agenda:** `galerina-photonic-tri-substrate-rd-agenda.md` §5 (Direction C).
**Provenance:** the TMX-256 boundary (`notes/31–33`) fixed the lane — *govern* a substrate, never
*absorb* its hardware/crypto. Direction A made the verdict three-valued and proved it fail-closed
(`galerina-three-valued-governance.md`). Direction C models the substrate's *failure modes in software*
so the verifier can reason against them **before any silicon exists**.
**Module:** `packages-galerina/galerina-tower-citizen/src/substrate-model.ts` — a **new sibling file**.
`tpl-simulator.ts` is **not modified** (its gate / `tmacVector` / `consensusTrit` semantics are frozen;
other code depends on them). The model *wraps* the gates; it never alters them — exactly as
`three-valued-governance.ts` already does.
**Guardrails honoured:** deny-by-default / fail-closed; no invented crypto (SHA-256 + ML-DSA-65 stay);
no `.tmf`/TritMesh coupling; plain TS (no Rust/Zig); **no hardware/throughput claims** (software
simulation only); **deterministic & seeded** (no non-seeded randomness, no wall-clock time — the seed
is injected). **Direction C only**: the `substrate {}` contract grammar and the compiler verifier pass
are **Direction B** and are listed as follow-ups (§11). This spike ships a self-contained library +
diagnostics, mirroring how Direction A landed.

---

## 1. The problem

Modelling a substrate's failure modes *before the chip exists* means we cannot test against silicon.
The honest move: **carry the failure modes as parameters** and let the verifier ask — *given this
noise, is the guarantee the flow declares actually provable?* If not, fail closed and say why,
reproducibly. The model is **not a hardware twin**; it is (a) a conservative checker the compiler can
run today, and (b) the **spec a future photonic backend is held to**: if a flow signs off under
parameters `P`, the eventual silicon must be at least as good as `P`, or the sign-off is void.

---

## 2. Prior art (named, accurate)

- **Abstract interpretation (Cousot & Cousot).** Sound static reasoning over an abstracted domain;
  here the abstraction is *"trit value ± modeled noise"*, and *sound* = we never under-report error.
- **Fault injection / runtime verification.** Perturb-and-observe to surface failure modes — done at
  *verification* time, deterministically, against a parametrised model (not live faults).
- **Photonic-noise modelling** (optical-compute literature): **phase drift / thermo-optic shift**
  (phase-shifter AWGN), **crosstalk** in MZI/MRR meshes (a dB coupling ratio), **shot noise** (∝√I)
  and **thermal/Johnson noise** (∝√(4kTΔf/R)) at photodetection. Carried as **parameters, not
  hardware**.
- **von Neumann N-modular redundancy (NMR) / TMR.** Majority voting of `N` independent replicas fails
  only when ⌈N/2⌉ are simultaneously bad; for per-lane error `p < 0.5` the residual is **strictly
  decreasing in odd `N`**. The theorem behind acceptance test #2. Galerina already ships the 3-input
  majority kernel as `consensusTrit`.
- **Kleene K3 + deny-by-default (Direction A).** A failed lane is an *erasure to INDETERMINATE*, which
  composes through `vAnd`/`vOr` and collapses to deny at the boundary. The basis of §5's safety proof.

---

## 3. The model

### 3.1 Parameters (seeded, software-only)

```ts
export interface SubstrateParameters {
  readonly seed: number;            // uint32 — the ONLY entropy source; 0 remapped to 1
  readonly phaseDriftSigma: number; // [0,1] fraction of a 2π cycle; band ~0.0–0.1
  readonly crosstalkCoeff: number;  // [0,1] linear coupling fraction; band ~0.0–0.2
  readonly laneFailureProb: number; // [0,1] per-op P(lane goes dark → abstains to 0); band ~0.0–0.05
  readonly readoutSigma: number;    // [0,1] vote-margin jitter (shot+thermal at readout); band ~0.0–0.5
}
```

| Parameter | Failure mode | Effect on a trit |
|---|---|---|
| `phaseDriftSigma` | phase-shifter AWGN / thermo-optic shift | one adjacent step (`-1↔0↔+1`, never `-1↔+1` directly) |
| `crosstalkCoeff` | neighbour-lane optical/thermal coupling | biases the flip toward the neighbours' sign |
| `laneFailureProb` | dead modulator / lost power / detector saturation | **erasure to `0`** (= `Verdict.INDETERMINATE`) |
| `readoutSigma` | shot + thermal noise at photodetection | jitters the summed vote-margin's sign (HOLD dead-band) |
| `seed` | *reproducibility control* (not physical) | makes all noise a deterministic function of `(seed, op-coords)` |

### 3.2 Per-lane error probability (the bridge between parameters and the check)

Both the analytic check and the fault-injector use one derived quantity — the probability a single
lane fails to deliver the correct trit:

```
pFlip = clamp01(phaseDriftSigma·PHASE_GAIN + crosstalkCoeff·XTALK_GAIN + readoutSigma·READOUT_GAIN)
pBad  = 1 − (1 − laneFailureProb)·(1 − pFlip)      // erase OR (survive then flip); always in [0,1]
```

`PHASE_GAIN`, `XTALK_GAIN`, `READOUT_GAIN` are documented **calibration constants** (no silicon to
calibrate against — conservative placeholder defaults, retunable; §12 Q3). `pBad` is **monotone
non-decreasing** in every physical parameter — more noise never lowers modeled error.

### 3.3 The seeded fault-injector (the literal "model applied to trit ops")

`NoisyLane` perturbs a clean trit, reusing **Mulberry32** (a clean, integer-safe, seeded PRNG — no
non-seeded randomness, no wall-clock). Order is binding (**lane-failure first**, so a dead lane never
fabricates a value):

```ts
export class NoisyLane {
  constructor(readonly params: SubstrateParameters) {}
  /** One perturbed reading. neighbors = the STATIC adjacent clean trits. */
  read(t: -1|0|1, opId: string, neighbors: {left:-1|0|1; right:-1|0|1}): Reading;
  /** Odd-N replicas (replicaIndex remixed into the seed), folded with the SHIPPED consensusTrit
   *  (N=3) or an odd-N majority built only from consensusTrit/min/max. */
  readVoted(t: -1|0|1, N: number, opId: string, neighbors: {left:-1|0|1; right:-1|0|1}): Reading;
}
export interface Reading { value:-1|0|1; indeterminate:boolean; noiseMargin:number; }
```

`opId` mixes `${correlationId}:${laneIndex}:${tritIndex}:${replicaIndex}` into the seed (FNV-1a), so
the same `(seed, op-coords)` reproduces every draw bit-for-bit (acceptance test #3). The gates are
called **as-is**; only the *value handed to* a gate is perturbed.

### 3.4 The analytic guarantee check (the verifier's canonical rule)

The decision is **closed-form**, not sampled — exact, fast, no statistical ceiling on how small a
tolerance it can resolve:

```ts
/** von Neumann NMR residual: P(at least ⌈N/2⌉ of N independent lanes are bad). Exact. */
export function nmrFailureProbability(pBad: number, N: number): number; // Σ_{k≥⌈N/2⌉} C(N,k)pBad^k(1-pBad)^{N-k}

export interface SubstrateGuarantee {
  readonly resultId: string;
  readonly epsilonDeclared: number; // max acceptable P(committing result not delivered), e.g. 1e-6
  readonly redundancyN: number;     // declared TMR factor (odd; 1 = none)
  readonly mustCommit: boolean;     // true: a +1 result is required (availability obligation)
}
export interface SubstrateCheckResult {
  readonly resultId: string;
  readonly pBad: number;
  readonly epsilonModeled: number;          // = nmrFailureProbability(pBad, redundancyN)
  readonly met: boolean;                    // epsilonModeled <= epsilonDeclared
  readonly trace: ReadonlyArray<{N:number; epsilon:number}>; // descending sweep N=1,3,5,7 (explainable)
  readonly redundancyHelps: boolean;        // pBad < 0.5
}
export function checkGuarantee(params: SubstrateParameters, g: SubstrateGuarantee): SubstrateCheckResult;
```

**Rule (strict `>`, inclusive bound):** `epsilonModeled > epsilonDeclared` ⇒ the declared tolerance is
**not provable under the model** ⇒ a diagnostic (§5). The fixed closed form makes the emit/clear
decision a **stable build artifact**.

### 3.5 Redundancy monotonicity (the author's lever)

For `pBad < 0.5`, `nmrFailureProbability(pBad, N)` is **strictly decreasing in odd `N`** (von Neumann
NMR), so a sufficient `N` always exists and **clears** the diagnostic; the `trace` reports the
descending sequence (explainable, not asserted). **Honest boundary:** if `pBad ≥ 0.5`, redundancy does
**not** help — the check sets `redundancyHelps=false` and emits `SPORE-SUBSTRATE-003` rather than
implying more lanes fix it.

---

## 4. Safety vs availability — the central result

A governed result has an *ideal* verdict `t* ∈ {ALLOW +1, INDETERMINATE 0, DENY −1}` (what the pure
gates produce with no noise). The substrate delivers a possibly-perturbed reading `r`. The
**governance-effective** verdict composes them with Kleene ∧ (Direction A's `vAnd`):

```
e = vAnd(t*, r)            // the substrate reading can CONFIRM or DEGRADE, never UPGRADE
```

> **Theorem (Substrate cannot fail open).** For all `t*, r ∈ {-1,0,+1}`: `e = vAnd(t*, r) ≤ t*`, and
> `e = +1  ⇔  t* = +1 ∧ r = +1`. Therefore **no substrate failure mode can manufacture an `ALLOW`**:
> - a failed lane (`r = 0`) gives `e = vAnd(t*, 0) ≤ 0` → deny/indeterminate;
> - a flip of an indeterminate ideal (`t* = 0`, `r = +1`) gives `e = vAnd(0, +1) = 0` → **deny** (the
>   noise cannot coerce `0 → +1`; this is exactly Direction A's No-Coercion);
> - a flip of an allow (`t* = +1`, `r ≠ +1`) degrades to deny — a **safe** loss.
>
> **Consequence:** substrate noise can cost **availability** (a legitimate `+1` denied), never
> **safety** (an illegitimate `+1` allowed). The tolerance/redundancy machinery (§3.4–3.5) bounds the
> *availability* loss; safety is **structural**, inherited from Direction A, and proved exhaustively.

This is the whole reason three-valued governance came first: the substrate layer gets its fail-closed
guarantee for free from `vAnd` + No-Coercion.

---

## 5. Diagnostics — `SPORE-SUBSTRATE-*` (reconciled against `SPORE-PHOTONIC-*`)

`SPORE-PHOTONIC-001…010` already exist — **hardware-capability** codes (static device properties, e.g.
`-005` optical signal loss, `-008` interference unresolvable statically). The new family is
**semantic-guarantee** codes (tolerance / redundancy / determinism proven against a *noise model*) —
strictly complementary, no collision. They sit after `SPORE-PHOTONIC-*`, before `SPORE-RUNTIME-*`.

| Code | name | meaning | severity |
|---|---|---|---|
| `SPORE-SUBSTRATE-001` | `CRYPTO_ON_NOISY_LANE` | a `Hash`/`Sign`/crypto effect declared on a noisy lane. Integrity is **never tolerated** — forbidden outright (the durable B1 insight, registered now). | **error** (always) |
| `SPORE-SUBSTRATE-002` | `TOLERANCE_UNACHIEVABLE_UNDER_NOISE` | `epsilonModeled > epsilonDeclared` at the declared `N`. | **error** in `production`/`deterministic`; **warning** in `dev` |
| `SPORE-SUBSTRATE-003` | `REDUNDANCY_INSUFFICIENT` | redundancy declared but cannot meet tolerance under the model (incl. the `pBad ≥ 0.5` "voting won't help" case). | **error** (always) |
| `SPORE-SUBSTRATE-004` | `UNVOTED_ANALOG_INTO_DETERMINISTIC` | an un-voted (`N=1`) noisy result feeds a context requiring determinism (strict profile / crypto boundary). | **error** (always) |

`SPORE-SUBSTRATE-*` are a **higher** severity category than Direction A's `SPORE-GOV-3VL-001` (`warning`,
an expected/safe runtime collapse): these are *compile-time unproven-guarantee* assertions —
correctness, not information. The diagnostic record uses the same `GovernanceDiagnostic` shape Direction
A introduced (`{code, name, severity, message}`), kept local to tower-citizen (no new cross-package
dependency).

`verifyToleranceUnderNoise(...)` is the verifier-facing entry point: it returns a `Verdict`
(`ALLOW`/`INDETERMINATE`/`DENY`) plus an optional diagnostic, composing `checkGuarantee` with the
crypto-on-lane (`001`), redundancy (`003`), and unvoted-sink (`004`) checks. Its `DENY`/`INDETERMINATE`
results flow through Direction A's `decideAtBoundary`, so the fail-closed boundary + audit are reused.

---

## 6. Acceptance tests (all in `tests/substrate-model.test.mjs`)

Mapping to agenda §5 (1–3) **plus** the safety theorem and a determinism oracle:

1. **Tolerance-unachievable flagged (agenda #1).** Non-trivial noise + tight `epsilonDeclared` at `N=1`
   ⇒ `met=false` and `verifyToleranceUnderNoise` emits exactly one `SPORE-SUBSTRATE-002` whose
   `epsilonModeled > epsilonDeclared` (severity = error in `production`, warning in `dev`).
2. **Raising TMR clears it, monotonically (agenda #2).** Same `(params, epsilonDeclared)`, `pBad<0.5`:
   `trace` over `N=1,3,5,7` is **strictly decreasing**; a smallest `N*` flips `met false→true` and
   `002` stops; it **stays cleared** for `N>N*`. A separate `pBad≥0.5` case asserts `redundancyHelps=false`
   + `SPORE-SUBSTRATE-003` and that the trace never clears.
3. **Deterministic / seeded / reproducible (agenda #3).** Same `seed` ⇒ byte-identical `NoisyLane.read`
   stream and byte-identical `SubstrateCheckResult`; different `seed`/`opId` ⇒ different but reproducible
   stream. (No non-seeded randomness / wall-clock reachable: the stream is built only from `(seed, opId)`.)
4. **Safety theorem — substrate cannot fail open (§4).** EXHAUSTIVE over `t* × r ∈ {-1,0,+1}²`:
   `vAnd(t*, r) ≤ t*`, and `authorize(vAnd(t*, r)) ⇔ (t*=+1 ∧ r=+1)`. Plus: with `laneFailureProb=1`
   every reading is `0`, so for any odd `N` the voted `e` is never `+1` unless `t*` was already `+1`
   and survived — and an all-dark lane (`r=0`) **never** authorizes. Reuses Direction A No-Coercion.
5. **Cross-check — sampler converges to the closed form.** For several `(params, N)`, the empirical
   error rate from `NoisyLane` Monte-Carlo (deterministic, seeded) matches `nmrFailureProbability(pBad,N)`
   within a binomial sampling slack. Mutually validates the fault-injector against the analytic check.
6. **No-regression / noiseless.** All params `0` ⇒ `pBad=0` ⇒ `read` is the identity ⇒ `epsilonModeled=0`,
   `met=true` for any `epsilonDeclared≥0`, no diagnostic. Crypto on a clean (`laneFailureProb=0`) lane ⇒
   no `001`. Confirms existing/clean flows are unaffected.
7. **Crypto-on-noisy + unvoted-sink.** `hasCrypto` on a noisy lane ⇒ `SPORE-SUBSTRATE-001` (error)
   regardless of tolerance; `N=1` + deterministic sink + noise ⇒ `SPORE-SUBSTRATE-004`.

---

## 7. Module API (summary)

```ts
// substrate-model.ts  (galerina-tower-citizen) — sibling to tpl-simulator.ts; imports its gates UNCHANGED
import { consensusTrit } from "./tpl-simulator.js";
import { Verdict, vAnd, decideAtBoundary } from "./three-valued-governance.js";

export interface SubstrateParameters { seed; phaseDriftSigma; crosstalkCoeff; laneFailureProb; readoutSigma; }
export interface Reading { value:-1|0|1; indeterminate; noiseMargin; }
export interface SubstrateGuarantee { resultId; epsilonDeclared; redundancyN; mustCommit; }
export interface SubstrateCheckResult { resultId; pBad; epsilonModeled; met; trace; redundancyHelps; }

export const SUBSTRATE_DIAGNOSTICS = {
  CRYPTO_ON_NOISY_LANE:               "SPORE-SUBSTRATE-001",
  TOLERANCE_UNACHIEVABLE_UNDER_NOISE: "SPORE-SUBSTRATE-002",
  REDUNDANCY_INSUFFICIENT:            "SPORE-SUBSTRATE-003",
  UNVOTED_ANALOG_INTO_DETERMINISTIC:  "SPORE-SUBSTRATE-004",
} as const;

export function singleLaneErrorProbability(p: SubstrateParameters): number;       // pBad
export function nmrFailureProbability(pBad: number, N: number): number;           // exact binomial tail
export function effectiveVerdict(ideal: Verdict, reading: -1|0|1): Verdict;       // vAnd(ideal, reading)
export class    NoisyLane { read(...); readVoted(...); }                          // seeded fault injector
export function empiricalAdversarialError(p, ideal, N, trials): number;          // adversarial sampler (cross-check)
export function checkGuarantee(p: SubstrateParameters, g: SubstrateGuarantee): SubstrateCheckResult;
export function verifyToleranceUnderNoise(
  p: SubstrateParameters, g: SubstrateGuarantee,
  ctx: { hasCryptoEffect: boolean; laneIsNoisy: boolean; sinkRequiresDeterminism: boolean },
  profile: "dev"|"production"|"deterministic",
): { verdict: Verdict; diagnostic?: SubstrateDiagnostic; check: SubstrateCheckResult };
```

---

## 8. Follow-ups (explicitly NOT in this spike)

- **Direction B — substrate/tolerance contracts.** The `substrate { lane, tolerance, redundancy }`
  grammar (lean: its own block, like `resilience {}`/`observability {}`, `#58`); a `verifySubstrate()`
  pass in `galerina-core-compiler/src/governance-verifier.ts` consuming the parsed block + `effectResult`
  and calling this module; `SPORE_SUBSTRATE_001..004` code constants registered in
  `galerina-core-compiler/src/index.ts`; the B1 crypto-on-core invariant pulled forward; `routePrecision()`
  (precision-strategy.ts) gaining a lane/substrate axis.
- **HMAC-bound `SubstrateModelSnapshot`** (sentinel-state pattern) so a backend signs against the exact
  model it must satisfy.
- **Sentinel feedback** — phase-drift/crosstalk are analog health signals analogous to `sentinel-power`
  temperature and `sentinel-time` clock drift; a later iteration can parametrise the model from sentinel
  readings (read-only into the model).
- **Belnap four-valued** (carried from Direction A) — only if an audit must distinguish "conflicting
  lanes" from "no lane". Start K3.

## 9. Decisions taken (were the draft's open questions)

1. **Numeric codes canonical** (`SPORE-SUBSTRATE-001..004`) with `screaming_snake` names — matches the
   `SPORE-PHOTONIC-NNN` neighbourhood.
2. **Closed-form NMR check canonical**, Monte-Carlo only as a cross-check — exact, no `TRIAL_BUDGET`
   ceiling, more honest for tight tolerances.
3. **Conservative placeholder calibration gains** (`PHASE/XTALK/READOUT_GAIN`) — documented knobs; a
   real calibration target/reference can retune them later (the one place external input would refine).
4. **Mulberry32 PRNG** for the cross-check sampler (in-repo idiom is xorshift32; quality matters less
   now the canonical check is closed-form).

## 10. Cross-references

`galerina-photonic-tri-substrate-rd-agenda.md` (parent §5) · `galerina-three-valued-governance.md`
(Direction A — `Verdict`, `vAnd`, `decideAtBoundary`, No-Coercion) · `tpl-simulator.ts`
(`#173/#196` gates + `consensusTrit`, frozen) · `compiler-diagnostics.md` (`SPORE-PHOTONIC-*` neighbourhood
+ new `SPORE-SUBSTRATE-*` subsection) · `hybrid-engine.ts` (seeded-PRNG idiom) · `sentinel-power`/`-time`
(analog-health-signal analogy) · `precision-strategy.ts` (Direction B routing extension point) ·
`tests/three-valued-governance.test.mjs` (oracle-test pattern) · `notes/31–33` (TMX boundary).
