# Galerina External Bridge — Governed Quantum Simulation (`ffsim`)

**Status:** 🟢 **PHASE 0 + PHASE 1 IMPLEMENTED (2026-06-15).** The package
`packages-galerina/galerina-ext-bridge-quantum` now exists and is in the suite (49/49 · 4,518 · 0 fail, verified 2026-06-17; bridge has 21 tests, now Phase 1.5):
- **Phase 0** — shared `@galerina/inference-bridge-contract` manifest extended (`determinismMode:"tolerance"`,
  optional `domain`/`tolerance`/`pinnedEnvHash`/`backendArtifactHash`, `precision` optional), the
  fail-closed tolerance rule (§9.1.3), additively + hash-preserving. Verified across bitnet/cpp/tower-citizen.
- **Phase 1** — the pure-TS governance core: `subspace.ts` (the §6 governor, fail-closed overflow→Infinity),
  `limits.ts` (the §8 Stage-2 pre-spawn gate, distinct error code per breach), `quantum-contract.ts` (§7),
  `manifest.ts` (`FFSIM_MANIFEST`), `env-detect.ts` (honest `available:false`), `ffsim-backend.ts` (governed
  lifecycle: LOAD→TRAP→ERASE on breach; NEVER fakes a run), `index.ts` registry, `schemas/data_types.json`,
  **12 package tests** (subspace 5 + governance 7) plus **2 Phase-0 tests** in the shared contract. No ffsim needed.
**Phase 1.5 DONE 2026-06-16** (commits a3536bb attestation + 1a12b4e audit): `src/attestation.ts`
(`attestFfsimManifest` / `verifyFfsimAdmission`) wires CF-3/CF-7 via tower-citizen's **hybrid
Ed25519+ML-DSA-65** path — #34 has landed, so it's hybrid, not just Ed25519 (a hybrid policy rejects an
Ed25519-only or tampered attestation; missing = fail-closed). `FfsimBackend` takes an optional
`AuditLogger` and emits the **LOAD→TRAP→ERASE** trail (EXEC deferred to Phase 2 — nothing executes yet).
+8 tests (20/20 package, tsc clean).
**Still PENDING:** **Phase 2** (the real hashed `ffsim_worker.py` + `child_process` driver + EXEC emission —
gated on a pinned venv with ffsim) · **Phase 3** (worked H₂ example flow + flip #199). §12 is the checklist.

**Decisions: all seven open questions RATIFIED 2026-06-15** (§13). The headline ruling:
a *tolerance-certified* backend is admissible **iff** it pins all three of
`pinnedEnvHash` + `tolerance` + `backendArtifactHash` (fail-closed if any is missing)
**and** carries **no Hash/Sign/crypto effect** — that exclusion is the already-shipped
`SPORE-SUBSTRATE-001` (B1 *crypto-on-core*), reached "for free" by declaring the ffsim
path as a noisy `lane` (§5.4, §9). Integrity stays bit-exact on the deterministic
core; only the *compute* is tolerance-bounded.

**Date:** 2026-06-15 · **Author layer:** Layer 2A/2B design proposal · **Task:** #199 (🔲 not started)
**Proposed package:** `@galerina/ext-bridge-quantum` (dir `packages-galerina/galerina-ext-bridge-quantum`)
**First backend:** IBM **`ffsim`** (qiskit-community/ffsim, Apache-2.0)
**Provenance:** `notes/33-IBM-FFSIM.md` (the user's eval — *see §2, it contains errors this design corrects*),
IBM Quantum blog `ibm.com/quantum/blog/ffsim`, local clone `C:\wwwprojects\IBM-FFSIM\ffsim`.

---

## 1. One-line thesis: *govern it, don't absorb it*

Galerina does **not** reimplement ffsim's mathematics. ffsim is a mature, heavily
optimised quantum-chemistry simulator (Python + a compiled Rust core). We wrap it
as a **capability-bounded, out-of-process backend behind the Toxic Border**, exactly
the way `galerina-ext-bridge-cpp` (BitNet) and `galerina-ext-bridge-bitnet` wrap an
external engine — except ffsim runs **out-of-process** (subprocess), never as an
in-process FFI addon. A governed Galerina `flow` declares a bounded quantum-simulation
contract; the bridge maps that to a fixed, enumerated set of ffsim calls with
validated numeric parameters, enforces hard resource ceilings *before* spawning,
validates and hashes the results on the way back, and writes a full provenance
receipt to the Tower audit ledger.

This mirrors the existing two-layer split:

| Layer | Trust | Where it runs | This package's role |
|---|---|---|---|
| **Governance (Brain)** | trusted | Galerina / TypeScript, in-process | the contract, limit gates, Tower lifecycle, attestation, Toxic Border |
| **Compute (Brawn)** | **untrusted (Tier 3)** | ffsim: Python + Rust, **separate OS process** | does the linear algebra; never sees the flow, only enumerated validated jobs |

---

## 2. What this is **NOT** (correcting `notes/33-IBM-FFSIM.md`)

The eval in `notes/33` reached the right instinct ("this is relevant, but don't
`pip install` it into the core") via a chain of **technical conflations**. This
design explicitly rejects them. Future readers: do not reintroduce these.

| Claim in note 33 | Why it is wrong | What is actually true |
|---|---|---|
| ffsim's speedup ≈ "discarding non-affinity states" in a vector database / MeshQL | Category error. ffsim is a **quantum-chemistry FCI simulator**, not a database or vector-search engine. | ffsim restricts the state vector to the **fixed particle-number, fixed spin-Sₓ subspace**. Its memory win comes from an **exact conservation law**, not a heuristic affinity prune. |
| Port ffsim's Givens / orbital rotations into ternary `{-1,0,+1}` gates via `ntt_mul` | You **cannot** quantize continuous `float64`-complex unitary rotations into balanced ternary without destroying the physics. Givens angles are continuous; the simulation is exact-arithmetic-sensitive. | ffsim gates are dense `complex128` unitaries applied to a `complex128` state vector. There is no lossless ternary lowering. |
| ffsim ≈ BitNet b1.58 ≈ NTT (Number-Theoretic Transform) | Three unrelated things. BitNet is 1.58-bit *neural-net inference*; NTT is *modular integer convolution*; ffsim is *fermionic quantum simulation*. | They share **nothing** mathematically. Do not unify them. |
| Build it inside `galerina-substrate-mytri` as a "Tri-Bit Quantization Bridge (TBQB)" | `myTri` / `MeshQL` / `TBQB` are a **separate project**, not Galerina. There is no `galerina-substrate-mytri` package in this repo. | This bridge is a **standalone `ext-bridge` package**, peer to `ext-bridge-cpp`. No TBQB, no NTT intrinsics, no MeshQL. |
| Extract its "mathematical shortcuts" into the core engine | Violates the **No-Rust-in-core** charter axiom *and* the "govern it, don't absorb it" principle. | ffsim's Rust **stays in ffsim**, out-of-process. The core stays TypeScript-like. We govern the boundary; we do not import the math. |

**The legitimate value** of ffsim to Galerina is real and narrow: it is an excellent
*first non-trivial scientific backend* to demonstrate that Galerina's governance model
(deny-by-default effects, hard resource ceilings, attestation, audited provenance,
hard erasure) can wrap a genuinely heavyweight, non-deterministic, untrusted
external compute engine — the hardest bridge case the project has tackled so far.

---

## 3. Why ffsim is a *different shape* of bridge than BitNet

The existing `InferenceBridge` contract (`@galerina/inference-bridge-contract`:
`BridgeOp` / `BridgeResult`) is built for a **ternary GEMM hot path**: packed-trit
weights, an `Int32Array` activation vector, a scaled-integer accumulator, and
**bit-exact determinism** verified against a `TernaryOracle`. ffsim breaks every one
of those assumptions:

| Property | BitNet bridge (`ext-bridge-cpp`) | ffsim bridge (this design) |
|---|---|---|
| Granularity | per-op GEMM (microseconds, millions/s) | per-**job** (a whole simulation; ms→seconds) |
| Numeric domain | packed ternary `{-1,0,+1}` + int accumulator | `complex128` / `float64` dense linear algebra |
| Determinism | **bit-exact** (Standard 1; oracle cross-check) | **NOT bit-exact** — BLAS + Rayon threads + float reassociation ⇒ reproducible only to a *tolerance* |
| Process model | **in-process** N-API addon (zero-copy, hot path) | **out-of-process** subprocess (Python+Rust); marshalled I/O |
| Trust tier | Tier 1 (air-gapped CPU kernel) | **Tier 3 (untrusted external compute)** |
| Right contract | `InferenceBridge` (op-oriented) | **new `QuantumSimBackend` (job-oriented)** — see §7 |

**Decision:** do **not** shoehorn ffsim into `InferenceBridge`. Define a new
coarse-grained, job-oriented contract `QuantumSimBackend` in the new package. **Reuse**
the parts that genuinely transfer:

- the **`BridgeManifest` / `BridgeAttestation`** schema + Ed25519 attestation (CF-3/CF-7, tasks #137/#138);
- the **`TowerRuntime` Load → Execute → Erase** lifecycle + `PluginMetadata` capability mask;
- the **Hardened Border** 5-stage cycle + blacklist protocol (`galerina-hardened-border.md`);
- the **determinism-oracle *concept*** — but as a *tolerance* check, never bit-exact.

---

## 4. ffsim — grounded facts (the only basis for the contract)

Surveyed from `C:\wwwprojects\IBM-FFSIM\ffsim` (README, `pyproject.toml`, `Cargo.toml`,
`python/ffsim/__init__.py` and submodules). All figures below are ffsim's, not invented.

- **Package:** `ffsim` `0.0.81` (dev at survey time). **License: Apache-2.0** (compatible with this repo's Apache-2.0/MIT packages).
- **Pure Python library**, no CLI / `[project.scripts]`. Public API is `import ffsim`.
- **Runtime deps:** `numpy`, `scipy`, `jax`, `opt_einsum`, `orjson`, `pyscf>=2.9` (chemistry/integrals), `qiskit>=2.0`. Python `>=3.10`.
- **Compiled core:** a Rust extension (`ffsim._lib`) built with **maturin/PyO3**, using **`ndarray` + `rayon`** (multithreading via `RAYON_NUM_THREADS`). From a Galerina/TS perspective this is opaque compiled code we run **out-of-process** — never linked into core.
- **Sizing model — the crux:** every operation is parameterised by
  - `norb`: number of **spatial orbitals**, and
  - `nelec`: `(n_alpha, n_beta)` electron counts.
  The simulated state vector lives in the fixed-particle subspace of dimension
  ```
  dim(norb, nelec) = C(norb, n_alpha) · C(norb, n_beta)        # binomial product
  ```
  stored as `complex128` ⇒ **16 · dim bytes** for the state vector alone (Trotter /
  evolution need additional working buffers — a multiplier K to be benchmarked, budget conservatively).
  *Example:* `dim = 2²⁷ ≈ 1.34×10⁸` ⇒ **2 GiB** state vector. This `dim` — **not** `norb`
  alone — is the real memory governor (see §6). ffsim's own headline (64-site Hubbard:
  256 EiB → 19.3 GiB) is exactly this subspace restriction at work.
- **Public API by workflow stage** (module paths under `ffsim.`):
  - *State prep:* `hartree_fock_state`, `slater_determinant`, `StateVector` (`ffsim.states`)
  - *Gates:* `apply_orbital_rotation`, `apply_givens_rotation`, `apply_diag_coulomb_evolution`, `apply_num_op_sum_evolution`, … (`ffsim.gates`)
  - *Evolution:* `simulate_trotter_double_factorized`, `simulate_trotter_diag_coulomb_split_op`, `simulate_qdrift_double_factorized` (`ffsim.trotter`)
  - *Observables:* `rdms`, `expectation_one_body_product`, `spin_square`, `linear_operator` (`ffsim.states` / `ffsim.protocols`)
  - *Sampling:* `sample_state_vector`, `sample_slater` (accept `seed`) (`ffsim.states`)
  - *Hamiltonians:* `MolecularHamiltonian`, `DiagonalCoulombHamiltonian`, `DoubleFactorizedHamiltonian` (`ffsim.hamiltonians`); `MolecularData` (PySCF integrals)
  - *Ansätze:* UCJ/LUCJ, UCCSD, Givens-ansatz (`ffsim.variational`)
- **Determinism / seeding:** all stochastic functions take `seed: None | int | np.random.Generator`; given a seed they are deterministic **within a fixed environment**. There is **no hidden global RNG state**. But float results still vary across BLAS builds / thread counts ⇒ reproducibility must be *contract-bounded* (§5.4).

---

## 5. The contract surface (what the `flow` declares)

The bridge is driven from a `quantum {}` contract sub-block — the direct analog of
the existing `ai {}` block (see `examples/foundations/ai-inference-governed.spore`).
Everything is **deny-by-default**: only what is listed is permitted.

### 5.1 Effects (what the code may technically do) — new vocabulary

Following the codebase's dotted-effect style (`ai.infer`, `db.read`, `network.outbound`,
`audit.write`), this package introduces the **`QuantumSim` effect family**:

| Effect token | Authorises |
|---|---|
| `quantum.simulate` | run a fermionic simulation (state prep + gates + time evolution) |
| `quantum.observe` | compute observables (energy, RDMs, ⟨S²⟩, expectation values) |
| `quantum.sample` | sample bitstrings from a prepared state vector |
| `audit.write` | emit the governing `AuditEvent` (**always required**) |

`QuantumSim` is the family/`PluginMetadata.capabilityMask` bit name. **Open question
(§12):** the canonical V_DPM bit index must be assigned against `self-hosted/dss/vdpm.spore`
(task #85) — do **not** invent a bit number here.

### 5.2 Capabilities (what the actor is authorised to do)

| Capability | Meaning |
|---|---|
| `quantum.simulate.run` | actor may launch a simulation job |
| `quantum.chemistry.read` | actor may supply molecular integrals / Hamiltonians (these can be sensitive research IP) |
| `quantum.results.export` | actor may receive the large output artifacts (state vector / RDMs), not just scalar summaries |

### 5.3 Limits (hard ceilings — the V_DPM traps the job if exceeded)

These are grounded in §4's real sizing model:

| Limit | Governs | Notes |
|---|---|---|
| `max_orbitals` | `norb` ceiling | coarse first gate |
| **`max_subspace_dim`** | `C(norb,nα)·C(norb,nβ)` | **the real governor**; computed in pure TS *before* spawn (§6) |
| `max_memory` | derived MB ceiling | ≈ `16 · max_subspace_dim · K` bytes; checked against `TowerRuntime.assimilation_memory_budget` |
| `max_wall_ms` | subprocess wall-clock timeout | the worker is killed on breach |
| `max_trotter_steps` | evolution depth | bounds compute time |
| `max_shots` | sampling shots | bounds sampling cost |
| `rayon_threads` | `RAYON_NUM_THREADS` (pinned) | resource bound **and** reproducibility |
| `tolerance` | reproducibility band | e.g. energies agree to `1e-8` Hartree (§5.4) |

### 5.4 Determinism is *tolerance*, never *exact* — and ffsim is a **noisy `lane`**

This is the single most important honest design point. ffsim over float64 + BLAS +
Rayon is **not bit-reproducible** across machines, thread counts, or library versions.
Therefore:

- The bridge manifest declares **`determinismMode: "tolerance"`** — a **proposed
  extension** to the existing `DeterminismMode = "exact" | "sampled" | "unverified"`
  (§9). It **must never** claim `"exact"`.
- Reproducibility is contract-bounded by pinning: ffsim **version hash**, the **venv
  lock**, **`RAYON_NUM_THREADS`**, a **required explicit `seed`** for any stochastic
  op, and a numeric **`tolerance`**. Two runs "agree" iff their scalar observables
  match within `tolerance`.

**This is not a new concept — it is the shipped substrate/tolerance model
(`galerina-substrate-contracts.md`, Direction B; `substrate-model.ts`, Direction C).**
The float64 ffsim path **is** a substrate *noisy lane*. The flow therefore declares a
`substrate {}` block (peer to `resilience {}` / `observability {}`):

```spore
substrate {
  lane: noisy          ;; photonic | noisy | digital — float64 ffsim is a noisy lane
  tolerance: 1e-8      ;; epsilonDeclared — scalars must agree to this band
  redundancy: 1        ;; odd int ≥ 1, or `tmr`; 1 = un-voted (see B3 below)
}
```

The already-shipped `verifySubstrate()` pass then enforces, **before any silicon or
subprocess**, three obligations that this bridge gets *for free*:

- **B1 / `SPORE-SUBSTRATE-001` (crypto-on-core)** — a flow on a `noisy` lane may carry
  **no Hash/Sign/crypto effect**, an `error` in *every* profile. This is exactly the
  ratified §9 constraint: integrity is never tolerance-bounded. (See §9 for how the
  Epilogue Receipt still signs the output digest — on the *digital* core, over the
  produced bytes.)
- **B3 / `SPORE-SUBSTRATE-004` (determinism preservation)** — an **un-voted** (`redundancy: 1`)
  noisy result must not feed a deterministic-integrity sink. To let an ffsim scalar
  gate a deterministic decision, declare `redundancy: tmr` (run ffsim N times, vote /
  tolerance-cluster) or route it through an explicit tolerance-bounded branch.
- **B2 / `SPORE-SUBSTRATE-002`/`-003` (redundancy sufficiency)** — the declared
  `tolerance` must be provable at the declared `N` under the modeled noise. *Refinement
  (Open item, §13.8):* the substrate model's per-lane noise profile must gain a
  `float64`/BLAS+Rayon-reproducibility profile for this lane; today its profiles are
  photonic-oriented.

So `quantum { determinism tolerance(ε) }` (§5, §10) is the quantum-facing surface; it
**lowers to / requires** the `substrate { lane: noisy, tolerance: ε, redundancy: N }`
declaration that the existing verifier already polices.

---

## 6. The subspace-dimension governor (pre-spawn limit gate)

Before any subprocess is spawned, a **pure-TypeScript** function computes the FCI
subspace dimension and the implied memory, and the flow's `invariant {}` / the
bridge both trap if it exceeds the ceiling. This is the precise, honest replacement
for note 33's hand-wavy "discard non-affinity states".

```ts
// subspace.ts — pure TS, no ffsim needed. The gate that runs BEFORE we trust the worker.
export function binomial(n: number, k: number): number { /* exact via multiplicative form */ }

/** dim = C(norb, nAlpha) · C(norb, nBeta) — ffsim's fixed-particle subspace size. */
export function subspaceDim(norb: number, nelec: readonly [number, number]): number {
  return binomial(norb, nelec[0]) * binomial(norb, nelec[1]);
}

/** State-vector bytes (complex128 = 16B/amplitude). Peak ≈ this × K working-set factor. */
export function stateVectorBytes(norb: number, nelec: readonly [number, number]): number {
  return 16 * subspaceDim(norb, nelec);
}
```

The flow can reference `subspace_dim(norb, nelec)` in its `invariant {}` (a
compile-time/runtime proof obligation), and the bridge re-checks it at the border —
**defence in depth**. A job whose `dim` exceeds `max_subspace_dim` is rejected with
`ERR_SUBSPACE_TOO_LARGE` and a `LOAD → TRAP → ERASE` audit trail proving **no
subprocess ran**.

---

## 7. The new bridge contract (`QuantumSimBackend`)

Job-oriented, not op-oriented. Lives in the new package (it is *not* part of the
neutral `inference-bridge-contract`, which is ternary-specific).

```ts
// quantum-contract.ts — coarse-grained governed-job contract for out-of-process backends.
import type { BridgeManifest, BridgeAttestation } from "@galerina/inference-bridge-contract";

export type QuantumOp =
  | "hartree_fock_state"
  | "slater_determinant"
  | "apply_orbital_rotation"
  | "simulate_trotter_double_factorized"
  | "simulate_trotter_diag_coulomb_split_op"
  | "expectation_energy"        // ⟨ψ|H|ψ⟩ via rdms / linear_operator
  | "rdms"
  | "sample_state_vector";       // requires seed

export interface QuantumLimits {
  readonly maxOrbitals: number;
  readonly maxSubspaceDim: number;   // the real governor (§6)
  readonly maxMemoryMB: number;
  readonly maxWallMs: number;
  readonly maxTrotterSteps?: number;
  readonly maxShots?: number;
  readonly rayonThreads: number;     // pinned → reproducibility + resource bound
  readonly tolerance: number;        // tolerance-determinism band
}

/** A hashed handle to a large numeric artifact — never inline a giant array in the hot path. */
export interface QuantumArtifactRef {
  readonly handle: string;           // scratch-dir path or content id
  readonly sha256: string;
  readonly shape: readonly number[];
  readonly dtype: "complex128" | "float64";
}

export interface QuantumJob {
  readonly op: QuantumOp;
  readonly correlationId: string;
  readonly norb: number;
  readonly nelec: readonly [number, number];        // (n_alpha, n_beta)
  readonly seed: number;                             // REQUIRED — no implicit entropy
  readonly params: Readonly<Record<string, number | readonly number[]>>;  // validated numerics only
  readonly inputArtifacts?: readonly QuantumArtifactRef[];                 // integrals / prior state
}

export interface QuantumProvenance {
  readonly backendVersion: string;        // ffsim version
  readonly backendArtifactHash: string;   // sha256(pinned venv lock + ffsim wheel + worker script)
  readonly seed: number;
  readonly rayonThreads: number;
  readonly tolerance: number;
  readonly inputHash: string;
  readonly outputHash: string;
}

export interface QuantumResult {
  readonly correlationId: string;
  readonly backendId: string;             // "ffsim-quantum-v1"
  readonly executedNatively: boolean;     // true = real ffsim ran; false = unavailable stub
  readonly scalars: Readonly<Record<string, number>>;  // energy, norm, ⟨S²⟩ — what the flow branches on
  readonly artifacts: readonly QuantumArtifactRef[];    // hashed handles to big outputs
  readonly provenance: QuantumProvenance;
  readonly latencyMs: number;
  readonly trapFired: boolean;
}

export interface QuantumSimBackend {
  readonly backendId: string;
  readonly available: boolean;            // python + ffsim importable in the pinned venv?
  readonly manifest?: BridgeManifest;
  readonly attestation?: BridgeAttestation;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  run(job: QuantumJob, limits: QuantumLimits): Promise<QuantumResult>;
}

export type QuantumBridgeRegistry = ReadonlyMap<string, QuantumSimBackend>;  // keyed by backendId
```

**Why scalars + artifact handles, not raw arrays:** ffsim outputs (state vectors,
RDMs) are large and untrusted-origin. The flow receives small **scalar summaries**
(energy, norm, sample histogram) it can branch on, plus **hashed handles** to the big
arrays (released only if the actor holds `quantum.results.export`). This is the
out-of-process analog of the in-process bridge's zero-copy-handle rule.

---

## 8. Out-of-process security posture (the Toxic Border, applied)

ffsim is **Tier 3 untrusted external compute**. The full `galerina-hardened-border.md`
5-stage cycle applies, adapted for a subprocess instead of a WASM instance:

```
Stage 1 — Admission     verify pinned ffsim version + venv hash == attested manifest hash (CF-3/CF-7);
                        verify backend not blacklisted; verify governance tier ≤ flow's tier.
Stage 2 — Interrogate   validate the job against schemas/data_types.json (strict): op ∈ enum,
                        norb/nelec/seed integers in range, subspaceDim ≤ max_subspace_dim (§6),
                        params are finite numbers only. Any breach → SPORE-BORDER-001..004 SECURITY_ALERT,
                        job blocked, NO spawn.
Stage 3 — Execute       spawn the pinned worker (child_process) in a confined scratch dir:
                          • RAYON_NUM_THREADS pinned     • wall-clock timeout (max_wall_ms) → SIGKILL
                          • memory ceiling (OS rlimit where available)  • NO network (deny-by-default)
                          • stdin/stdout strict length-prefixed JSON; large arrays via hashed temp files
                        Worker runs ONLY the enumerated op with validated params — never arbitrary Python.
                        Unexpected exit (segfault / OOM kill / non-zero) → SPORE-BORDER-005 → blacklist version.
Stage 4 — Compliance    validate outputs against schema (shape, dtype, FINITE — reject NaN/Inf);
                        sha256 every artifact; assemble QuantumProvenance; write Epilogue Receipt.
Stage 5 — Hard Erase    kill subprocess, wipe scratch dir, erase sandbox. No worker state survives.
```

**Non-negotiables:**
- **ffsim's Rust stays in ffsim**, in a separate OS process. Nothing from ffsim is
  linked, FFI'd, or `pip install`ed into Galerina core. (Charter: No-Rust-in-core.)
- The flow **never** hands Python a string to evaluate. The bridge owns a fixed
  `ffsim_worker.py` (a shipped, **hashed data asset**, not compiled into core) that
  dispatches a closed enum of operations over validated numeric parameters.
- **No crypto on the noisy lane (`SPORE-SUBSTRATE-001`, RATIFIED).** An ffsim flow
  (`lane: noisy`) may carry **no Hash/Sign/crypto effect** — enforced by `verifySubstrate`
  in every profile. Signing the result is a *separate, downstream* digital-core step
  over the produced bytes (§9). Integrity is bit-exact; only the compute is tolerance-bounded.
- **No un-voted noisy result into a deterministic sink (`SPORE-SUBSTRATE-004`).** An
  ffsim scalar at `redundancy: 1` cannot silently gate a deterministic/commit decision;
  use `redundancy: tmr` (vote across N runs) or a tolerance-bounded branch.
- **Deny-by-default everywhere:** effects, capabilities, network, filesystem (scratch
  dir only). **RATIFIED Stage A/B split:** Stage A enforces at the TS boundary —
  the `QuantumSim` capability is required and **no network handle is ever passed to the
  worker**, but "no network" is *not yet OS-enforced* (documented gap, not a silent
  claim). Stage B runs the worker inside the existing **OCI/gVisor** deploy path
  (tasks #43–44, #111–113) with **seccomp + network-deny**. No hand-rolled isolation.

---

## 9. Attestation & certified mode (#137 / #138) + tolerance extension — RATIFIED

Reuse `tower-citizen/bridge-attestation.ts` (Ed25519, `verifyAttestation` fails
**closed**, `allowedHashes` pinning, `requireCertifiedProfile`). The bridge ships a
`BridgeManifest`:

```ts
const FFSIM_MANIFEST: BridgeManifest = {
  bridgeId:            "ffsim-quantum-v1",
  packageName:         "@galerina/ext-bridge-quantum",
  packageHash:         "<sha256 of the built TS package>",
  nativeAddonHash:     undefined,                       // no in-process addon
  backendArtifactHash: "<sha256(venv lock + ffsim wheel + ffsim_worker.py)>",  // NEW
  sourceEngine:        "qiskit-community/ffsim",
  domain:              "quantum",                        // NEW discriminator (RATIFIED)
  // precision: omitted — now OPTIONAL; the ternary enum is N/A for a quantum backend
  layoutVersion:       "ffsim-job-v1",
  hardwareIdentity:    "py-ffsim-oop",
  determinismMode:     "tolerance",                     // NEW — never "exact"
  tolerance:           1e-8,                             // NEW — required when determinismMode="tolerance"
  pinnedEnvHash:       "<sha256 of the venv lock>",      // NEW — required for tolerance-certified
  certificationProfile:"certified",                      // ADMISSIBLE under the ratified rule below
};
```

### 9.1 Ratified schema change to `@galerina/inference-bridge-contract/manifest.ts`

This touches a shared neutral package (consumed by #137) — **Phase 0**, do it first,
re-run that package's `.graph/BOUNDARY.md`, and update `canonicalManifestString`
(append the new fields **in a fixed order at the end** so existing manifest hashes are
unaffected) plus `validateManifestShape` + tests.

1. **`DeterminismMode += "tolerance"`**; new optional fields `tolerance?: number`,
   `pinnedEnvHash?: string`, `backendArtifactHash?: string`, and a
   **`domain?: "inference" | "quantum"`** discriminator (RATIFIED #2). **`precision`
   becomes optional** (the ternary enum is meaningless for `domain:"quantum"`).
2. **`backendArtifactHash`** is the out-of-process analog of `nativeAddonHash` — covered
   by `allowedHashes` pinning (CF-7) the same way.
3. **`validateManifestShape` rule (RATIFIED #1) — fail-closed:** a manifest with
   `determinismMode:"tolerance"` is valid **iff** `tolerance`, `pinnedEnvHash`, **and**
   `backendArtifactHash` are *all* present and well-formed. A `certified` +
   `tolerance` manifest is admissible **only** when all three pins are present;
   if **any** is missing → invalid (today the function only forbids
   `certified` + `unverified`). `domain:"quantum"` does not require `precision`.

### 9.2 Why tolerance-certified is safe — integrity stays bit-exact (RATIFIED #1)

The gating worry was "certified implies bit-exact." The resolution: **separate the
compute lane from the integrity lane.**

- The **compute** (ffsim, `lane: noisy`) is tolerance-bounded. By `SPORE-SUBSTRATE-001`
  (§5.4) that flow may carry **no crypto effect** — you cannot sign *inside* the float64
  computation.
- The **Epilogue Receipt** signs `sha256(output bytes)` on the **deterministic digital
  core**, over the exact bytes the worker produced. That digest is bit-exact regardless
  of how the bytes were computed; signing it is a downstream `lane: digital` step.
- So the receipt attests *"this exact output, produced under this pinned
  env/seed/threads/tolerance, hashes to this digest, signed bit-exact"* —
  **provenance integrity**, distinct from **value reproducibility** (the separate
  `tolerance` claim that re-runs agree within ε). Re-running may yield different bytes →
  a different digest, and that's fine: the receipt commits to *one* run; the tolerance
  claim covers run-to-run agreement.
- No invented crypto: SHA-256 stays (already quantum-OK, Grover→128-bit — see
  `galerina-quantum-resistance-posture.md`); the signature is Ed25519 today, ML-DSA-65
  when the PQ signature work (#34/#107–109) lands. The tolerance lane never touches it.

**Certified/P9 mode (#138):** with `requireCertifiedProfile`, the Tower refuses an
unsigned/dev bridge; a tolerance-certified ffsim bridge passes **iff** it is signed,
all three pins are present, and the consuming flow is `SPORE-SUBSTRATE-001`-clean.

---

## 10. Example `.spore` flow (illustrative — does not compile yet)

```spore
/*
 * Example: governed ground-state energy via IBM ffsim (out-of-process, under contract).
 * Phase 1.5 IMPLEMENTED — @galerina/ext-bridge-quantum exists (governance + hybrid attestation, 21 tests); out-of-process EXEC is Phase 2. The quantum {} contract sub-block is still design-stage.
 * See: docs/Knowledge-Bases/galerina-ext-bridge-quantum-design.md
 */

;; Import the quantum backend across the Toxic Border, demand-loaded, deny-by-default.
import plugin safe "@galerina/ext-bridge-quantum" as Quantum {
  contract {
    intent "Fermionic quantum-chemistry simulation backend (IBM ffsim, untrusted, out-of-process)"
    access {
      grant quantum.simulate
      grant quantum.observe
      grant audit.write
    }
  }
}

secure flow groundStateEnergy(mol: MolecularInput, seed: Int) -> Result<EnergyResult, Error>
contract {
  intent "Estimate ground-state energy of a small molecule via governed ffsim Trotter evolution"

  ;; Deny-by-default; each effect must be within the plugin's granted access set above.
  effects { allow quantum.simulate, allow quantum.observe, allow audit.write }

  ;; Actor authority — distinct from code effects.
  capabilities { require quantum.simulate.run, require quantum.chemistry.read }

  ;; Proof obligations — the subspace gate is the real memory governor (§6).
  invariant {
    ensure mol.norb > 0
    ensure mol.norb <= 26
    ensure subspace_dim(mol.norb, mol.nelec) <= 134217728   ;; 2^27 ≈ 2 GiB state vector
    ensure seed >= 0
  }

  ;; The ffsim float64 path is a NOISY LANE. verifySubstrate enforces (every profile):
  ;;   B1/SPORE-SUBSTRATE-001 — no crypto effect on this flow (integrity stays on the core)
  ;;   B3/SPORE-SUBSTRATE-004 — an un-voted (redundancy:1) scalar can't gate a deterministic sink
  substrate {
    lane: noisy
    tolerance: 1e-8                    ;; scalars must agree to this band (Hartree)
    redundancy: 1                      ;; use `tmr` to let a result gate a deterministic decision
  }

  ;; The governed-simulation sub-block (analog of ai {}). Every line is a HARD limit.
  ;; `determinism tolerance(ε)` requires the substrate{} lane:noisy + tolerance:ε above.
  quantum {
    backend ffsim
    backend_version "0.0.81"          ;; pinned; bridge verifies the attested venv/wheel hash
    operation trotter_double_factorized
    max_orbitals 26
    max_subspace_dim 134217728
    max_memory MB2048
    max_wall_ms 60000
    max_trotter_steps 50
    rayon_threads 4                    ;; pinned for reproducibility
    determinism tolerance(1e-8)        ;; energies agree to 1e-8 Hartree
    require runtime_attestation        ;; signed bridge manifest (CF-3/CF-7)
    require seed                       ;; explicit seed for any stochastic step
  }
}
{
  trap mol.norb <= 0 : ERR_INVALID_ORBITALS
  trap subspace_dim(mol.norb, mol.nelec) > 134217728 : ERR_SUBSPACE_TOO_LARGE

  ;; step → DWI isolate. The ffsim call runs out-of-process behind the Toxic Border,
  ;; hard-erased after. Returns scalars + a provenance handle, never a raw state vector.
  let result = step Quantum.trotterGroundState(mol, seed)
  return Ok(result)
}
```

Like `ai-inference-governed.spore`, the `quantum {}` block is **not decoration** — it is
the source of truth for the limits the Tower enforces at the border *before* any
compute. An over-budget or unattested job is denied with `LOAD → TRAP → ERASE` only.

---

## 11. Package spec / skeleton plan (ready to implement — DO NOT BUILD YET)

Mirror `galerina-ext-bridge-cpp` / `galerina-ext-bridge-bitnet`.

### 11.1 Directory layout

```
packages-galerina/galerina-ext-bridge-quantum/
├── package.json
├── package.spore.json                 ← Galerina package manifest (kind/provides/capabilities)
├── tsconfig.json                    ← copy verbatim from ext-bridge-bitnet
├── src/
│   ├── index.ts                     ← exports + createQuantumBridgeRegistry() / selectQuantumBackend()
│   ├── quantum-contract.ts          ← QuantumOp/QuantumJob/QuantumResult/QuantumSimBackend (§7)
│   ├── quantum-bridge.ts            ← governed wrapper: TowerRuntime Load→Execute→Erase + limit gates
│   ├── ffsim-backend.ts             ← out-of-process driver: spawn worker, marshal JSON, timeout/memory
│   ├── subspace.ts                  ← binomial / subspaceDim / stateVectorBytes (§6) — pure TS
│   ├── manifest.ts                  ← FFSIM_MANIFEST + the tolerance/backendArtifactHash extension
│   └── env-detect.ts                ← detect python + ffsim + version; honest unavailable (mirrors hardware-detect.ts)
├── worker/                          ← the OUT-OF-PROCESS contract (analog of cpp's native/)
│   ├── README.md                    ← venv pinning, ffsim version, hashing, RAYON pin, JSON protocol
│   ├── ffsim_worker.py              ← FIXED enumerated-op entrypoint (shipped + hashed; NOT arbitrary eval)
│   └── requirements.lock            ← pinned deps → pinnedEnvHash pre-image
├── schemas/
│   └── data_types.json              ← Hardened Border strict I/O schema for a quantum job
└── tests/
    └── quantum-bridge.test.mjs      ← Stage A: governed lifecycle, limit traps, env-absent fallback (no real ffsim)
```

### 11.2 `package.json` (mirror ext-bridge-bitnet)

```json
{
  "name": "@galerina/ext-bridge-quantum",
  "version": "0.1.0",
  "description": "Galerina governed bridge for IBM ffsim — out-of-process fermionic quantum simulation under contract, Tower audit lifecycle + attestation",
  "license": "Apache-2.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "test": "npm run build && node --test tests/*.test.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@galerina/tower-citizen": "file:../galerina-tower-citizen",
    "@galerina/inference-bridge-contract": "file:../galerina-inference-bridge-contract"
  },
  "devDependencies": { "@types/node": "^25.9.1", "typescript": "^5.5.0" },
  "keywords": ["galerina", "ffsim", "quantum", "bridge", "governance", "out-of-process"],
  "note": "Stage A: governance wrapper + out-of-process driver + env-absent stub. Stage B: real subprocess execution + OS sandbox. ffsim source (Apache-2.0): C:/wwwprojects/IBM-FFSIM/ffsim. ffsim's Rust stays in ffsim — never linked into Galerina core."
}
```

### 11.3 `package.spore.json` (mirror galerina-api-protocol-rest)

```json
{
  "name": "galerina-ext-bridge-quantum",
  "version": "0.1.0",
  "kind": "ext-bridge",
  "provides": "quantum",
  "entry": "src/index.ts",
  "seam": "bridge.compute.outbound",
  "capabilities": ["quantum.simulate", "quantum.observe", "quantum.sample", "audit.write"]
}
```

### 11.4 Registry factory (mirror `createCppBridgeRegistry`)

```ts
// index.ts
export function selectQuantumBackend(): QuantumSimBackend {
  const ffsim = new FfsimBackend();          // env-detected; available=false if python/ffsim absent
  return ffsim;                              // honest unavailable stub when env missing (like cpp bridge)
}
export function createQuantumBridgeRegistry(): QuantumBridgeRegistry {
  const b = selectQuantumBackend();
  return new Map([[b.backendId, b]]) as QuantumBridgeRegistry;
}
```

---

## 12. Implementation checklist (for the future session)

**Phase 0 — ratify the shared-package changes first (they gate everything):**
- [x] Decisions ratified 2026-06-15 (§13) — no design left to settle; this phase is *implementation*.
- [ ] Confirm `verifySubstrate` (`substrate-inference.ts` / `substrate-model.ts`) already fires `SPORE-SUBSTRATE-001` for a `lane: noisy` flow carrying any crypto effect, and `SPORE-SUBSTRATE-004` for an un-voted noisy→deterministic feed. If the `float64`/BLAS+Rayon lane noise profile for B2 is missing, add it (§13.8). **No new crypto-exclusion machinery — reuse the shipped pass.**
- [ ] Extend `@galerina/inference-bridge-contract/manifest.ts`: `DeterminismMode += "tolerance"`, optional `tolerance` / `pinnedEnvHash` / `backendArtifactHash`; update `validateManifestShape` + `canonicalManifestString` (field order!) + tests. *(Touches a neutral package consumed by #137 — re-run its boundary report.)*

**Phase 1 — pure-TS governance core (no ffsim needed; fully testable):**
- [ ] Scaffold the package (layout §11.1); copy `tsconfig.json` from ext-bridge-bitnet.
- [ ] `subspace.ts` — `binomial` / `subspaceDim` / `stateVectorBytes` + exhaustive tests (incl. overflow guards for large `norb`).
- [ ] `quantum-contract.ts` — the §7 interfaces.
- [ ] `manifest.ts` — `FFSIM_MANIFEST`; wire Ed25519 attestation via `tower-citizen/bridge-attestation.ts`.
- [ ] `quantum-bridge.ts` — `TowerRuntime` Load→Execute→Erase; pre-spawn limit gates (subspace, memory, orbitals); `LOAD→TRAP→ERASE` on breach.
- [ ] `env-detect.ts` — probe `python --version` + `python -c "import ffsim; print(ffsim.__version__)"`; honest `available:false` when absent.
- [ ] `index.ts` — `selectQuantumBackend` / `createQuantumBridgeRegistry`.
- [ ] `schemas/data_types.json` — strict job I/O schema (op enum, integer ranges, finite params).
- [ ] `tests/quantum-bridge.test.mjs` — governed lifecycle, every limit trap, env-absent fallback (the BitNet-style stub path).

**Phase 2 — out-of-process backend (real ffsim; gated on a pinned venv):**
- [ ] `worker/requirements.lock` + `worker/README.md` (venv pinning, RAYON pin, JSON protocol, hashing).
- [ ] `worker/ffsim_worker.py` — fixed enumerated-op dispatcher (NO `eval`); length-prefixed JSON over stdio; large arrays via hashed temp files.
- [ ] `ffsim-backend.ts` — `child_process.spawn` under scratch dir; `RAYON_NUM_THREADS` pinned; wall-clock SIGKILL; output finite/shape/dtype validation; sha256 artifacts; `QuantumProvenance`.
- [ ] Reproducibility test: same `(job, seed, threads)` ⇒ scalars agree within `tolerance` (two runs).
- [ ] Border tests: oversized subspace, NaN/Inf output, worker non-zero exit → `SPORE-BORDER-005` → blacklist.

**Phase 3 — integration & docs:**
- [ ] One worked example flow under `examples/` (small molecule, e.g. H₂/H₄ in a minimal basis) with a `quantum {}` block; mark experimental.
- [ ] `galerina border-check` recognises the package; manifest signing via `galerina bridge attest`.
- [ ] Update SOT runtime status, KB index (done here), task ledger (done here → flip #199 status).
- [ ] `.graph/BOUNDARY.md` for the package (run `@galerina/devtools-package-graph`).

---

## 13. Resolved decisions (all RATIFIED 2026-06-15)

The seven questions below were ratified by the project owner. They are now **binding
design constraints**, not open items. One refinement (§13.8) remains genuinely open.

1. **Certified-tolerance profile — RATIFIED YES (the gate).** P9 certified mode admits a
   non-bit-exact external backend via `certified` + `determinismMode:"tolerance"`, valid
   **only** with all three pins (`pinnedEnvHash` + `tolerance` + `backendArtifactHash`),
   **fail-closed if any is missing** (§9.1.3). **Hard constraint:** a tolerance-certified
   backend may **never** carry a Hash/Sign/crypto effect — that is `SPORE-SUBSTRATE-001`
   (crypto-on-core), enforced "for free" by declaring `lane: noisy` (§5.4). This is *why*
   it is safe: the compute is tolerance-bounded but the Epilogue Receipt signs the output
   digest with SHA-256 on the **deterministic core**, not the float64 lane (§9.2).
2. **`precision` field — RATIFIED.** Make `BridgeManifest.precision` **optional** and add a
   **`domain: "inference" | "quantum"`** discriminator. Do not overload `fp16`/add `"na"`.
3. **OS sandboxing — RATIFIED (strongly).** Stage A = TS boundary + an **honestly
   documented gap** ("no network" = "we don't call it / no handle passed", *not* OS-enforced)
   + deny-by-default (`QuantumSim` capability required). Stage B = the existing **OCI/gVisor**
   path (#43–44, #111–113) with **seccomp + network-deny**. No hand-rolled isolation.
4. **Large-artifact lifecycle — RATIFIED.** Scratch-dir with a **quota** (DoS bound);
   readable **only** with `quantum.results.export` (deny-by-default); retain the **SHA-256
   hash, not the payload**, in the receipt; **GC the payload on hard-erase** (matches the
   #195 zeroize-after-use posture).
5. **PySCF provenance — RATIFIED.** v1: the flow **supplies pre-computed integrals as a
   hashed (attested) input artifact** — smallest trusted surface. Governed in-process PySCF
   generation is a separate later step.
6. **Worker spawn — RATIFIED.** **Per-call spawn for v1** (clean fail-closed / hard-erase;
   no state survives the boundary). A warm pool conflicts with that invariant — defer it to
   **#147** (warm-sandbox + zero-after-run sanitizer), which is what makes reuse safe.
7. **V_DPM bit — RATIFIED.** Do **not** allocate speculatively. Assign the `QuantumSim`
   capability bit in `self-hosted/dss/vdpm.spore` (#85/#91, the `bitfield V_DPM {}` register)
   **when implementation starts**, to avoid bit collisions.

### 13.8 Remaining open item (refinement, not a blocker)

- **B2 lane noise profile for the float64 lane.** `verifySubstrate`'s B2/`SPORE-SUBSTRATE-002/003`
  (tolerance provable at the declared `N`) currently reasons over *photonic-oriented* per-lane
  noise profiles (`substrate-model.ts`). A `float64`/BLAS+Rayon-reproducibility profile must be
  added so B2 can hold an ffsim flow's declared `tolerance` to a real model. Until then, B1
  (crypto-on-core) and B3 (unvoted→deterministic) already apply unchanged; B2 is advisory for
  this lane. Track under #199 Phase 0.

---

## 14. Guardrail compliance (self-check)

- ✅ **No Rust/Zig in core** — ffsim's Rust stays in ffsim, out-of-process; the package is pure TS + a pinned, hashed Python worker script (a data asset, not compiled in).
- ✅ **No invented crypto** — reuses existing Ed25519 attestation (#137) + sha256 hashing only.
- ✅ **Integrity stays bit-exact (`SPORE-SUBSTRATE-001`)** — the tolerance lane carries no crypto; the receipt signs `sha256(output)` on the deterministic core. No new exclusion machinery — the shipped `verifySubstrate` pass enforces it.
- ✅ **No fictional hardware/perf numbers** — only ffsim's own published figure (64-site Hubbard 256 EiB → 19.3 GiB) is cited, as ffsim's claim; the binomial memory formula is exact; no Galerina perf numbers are asserted.
- ✅ **TS-like core preserved** — adds a peer `ext-bridge` package; no language-model changes beyond the proposed `quantum {}` sub-block (analog of `ai {}`) and the additive manifest fields.
- ✅ **Design-only** — no package, code, or tests created; every artifact above is a specification.

---

## 15. Related documents

- `docs/Knowledge-Bases/galerina-hardened-border.md` — the Toxic Border 5-stage cycle this design applies.
- `docs/Knowledge-Bases/galerina-governed-inference-tower.md` — the `ai {}` block this design's `quantum {}` mirrors.
- `docs/Knowledge-Bases/capabilities.md` — effects-vs-capabilities model used in §5.
- `packages-galerina/galerina-inference-bridge-contract/` — `BridgeManifest`/`BridgeAttestation` reused (with proposed extensions, §9).
- `packages-galerina/galerina-tower-citizen/src/bridge-attestation.ts` — CF-3/CF-7 attestation (#137/#138).
- `packages-galerina/galerina-ext-bridge-cpp/` · `…-bitnet/` — the in-process bridge pattern this one diverges from (out-of-process, job-oriented).
- `notes/33-IBM-FFSIM.md` — the original eval (errors corrected in §2).
- `docs/Knowledge-Bases/galerina-photonic-tri-substrate-rd-agenda.md` — the tolerance-contract philosophy (§5.4).
- `docs/Knowledge-Bases/galerina-substrate-contracts.md` — the `substrate { lane / tolerance / redundancy }` block + `verifySubstrate` pass this design reuses (B1/B2/B3).
- `docs/Knowledge-Bases/galerina-substrate-failure-model.md` — Direction C noise model + `SPORE-SUBSTRATE-001..004` (`substrate-model.ts`).
- `docs/Knowledge-Bases/galerina-quantum-resistance-posture.md` — KEEP-SHA-256 + ML-DSA-65 signature decision behind §9.2's bit-exact integrity.
- `docs/Knowledge-Bases/compiler-diagnostics.md` §SPORE-SUBSTRATE — the diagnostic family enforcing the crypto-on-core exclusion.
- **`C:\wwwprojects\Galerina-R-AND-D\FFSM\`** — concrete build-readiness R&D grounding mined from the ffsim source: `ffsim-build-readiness.md` (env/container/determinism/Rust core), `ffsim-op-catalog.md` (op catalog + wire protocol + golden test), `_raw-miner-findings.md` (raw `file:line` cites). **Read before Phase 1/2 implementation.**
