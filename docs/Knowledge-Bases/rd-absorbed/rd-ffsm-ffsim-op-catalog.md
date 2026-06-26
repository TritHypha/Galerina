<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/FFSM/ffsim-op-catalog.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-ext-bridge-quantum-design.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-ext-bridge-quantum-design.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# ffsim — Operation Catalog · Wire Protocol · Golden Test

> **R&D scratch — design-only.** Concrete operation grounding beneath the canonical design doc
> `C:\wwwprojects\Galerina\docs\Knowledge-Bases\galerina-ext-bridge-quantum-design.md` (task **#199**, §7 `QuantumSimBackend`).
> Every fact cited `relative/path:line` against `C:\wwwprojects\IBM-FFSIM\ffsim`. **UNVERIFIED** = not observed in a file.
> Exhaustive findings (full snippets, overloads, all golden values): [`_raw-miner-findings.md`](_raw-miner-findings.md).

All ops are re-exported at the package root, so the worker dispatches `ffsim.<op>` directly (`python/ffsim/__init__.py:14-123`).

---

## 1. Per-op call templates for the closed `QuantumOp` enum

| `QuantumOp` | ffsim callable | Signature shape (key args) | Returns | Cite |
|---|---|---|---|---|
| `hartree_fock_state` | `ffsim.hartree_fock_state` | `(norb, nelec)` | complex state vec `np.ndarray` | `states/slater.py:122-138` |
| `slater_determinant` | `ffsim.slater_determinant` | `(norb, occupied_orbitals, orbital_rotation=None)` | complex state vec | `states/slater.py:42-103` |
| `apply_orbital_rotation` | `ffsim.apply_orbital_rotation` | `(vec, mat, norb, nelec, *, copy=True)` | rotated state vec | `gates/orbital_rotation.py:44-99` |
| `simulate_trotter_double_factorized` | `ffsim.simulate_trotter_double_factorized` | `(vec, ham: DoubleFactorizedHamiltonian, time, *, norb, nelec, n_steps=1, order=0, copy=True)` | final state vec | `trotter/double_factorized.py:25-35` |
| `simulate_trotter_diag_coulomb_split_op` | `ffsim.simulate_trotter_diag_coulomb_split_op` | `(vec, ham: DiagonalCoulombHamiltonian, time, *, norb, nelec, n_steps=1, order=0, copy=True)` | final state vec | `trotter/diagonal_coulomb_split_op.py:25-35` |
| `expectation_energy` | `ffsim.linear_operator` + `np.vdot` | `linop = linear_operator(ham, norb, nelec); E = np.vdot(vec, linop @ vec).real` | `float` (real) | `protocols/linear_operator_protocol.py:42-62` |
| `rdms` | `ffsim.rdms` | `(vec, norb, nelec, *, rank=1, spin_summed=False, reorder=True)` | `ndarray` (rank1) or `(rdm1,rdm2)` tuple | `states/rdm.py:82-141` |
| `sample_state_vector` | `ffsim.sample_state_vector` | `(vec, *, norb, nelec, orbs=None, shots=1, concatenate=True, bitstring_type=STRING, seed=None)` | list of `shots` bitstrings | `states/states.py:71-116` |

**Key caveats (load-bearing):**
- **`expectation_energy` has two paths.** Primary: `linear_operator` + `np.vdot` works for *any* Hamiltonian type and `FermionOperator` directly. Secondary (RDM): `ffsim.ReducedDensityMatrix(*ffsim.rdms(vec, norb=, nelec=, rank=2, spin_summed=True)).expectation(mol_ham)` — but `.expectation()` is typed for `MolecularHamiltonian` only (reads `.two_body_tensor`); DoubleFactorized/DiagonalCoulomb lack that attr (UNVERIFIED for those) (`states/rdm.py:73-79`; `tests/python/states/rdm_test.py:30-40`).
- **`rdms` ≠ `ReducedDensityMatrix`.** `rdms(...)` returns plain arrays; `ReducedDensityMatrix(...)` is a dataclass you wrap them in, and only *it* has `.expectation()`.
- **Trotter sims require `nelec: tuple[int,int]`** (keyword-only) — spinless ints are not in the typed signature (`double_factorized.py:31`).
- **`copy=True` (default) is safe** (fresh array). Keep it in a governed wrapper so caller buffers aren't mutated; internal trotter steps use `copy=False` only for in-place chaining.
- `sample_state_vector` body past `:116` is **UNVERIFIED**; docstring says `seed` is "valid input to `np.random.default_rng`".

## 2. How `norb` / `nelec` and Hamiltonians thread through

- `norb: int` = number of **spatial** orbitals; `nelec` = `int` (spinless) or `(n_alpha, n_beta)` (spinful). Passed **explicitly** into every gate/sim/`linear_operator` even though Hamiltonians expose `.norb` (`molecular_hamiltonian.py:57-60`).
- **Subspace dimension** `dim = C(norb,nα)·C(norb,nβ)` = `ffsim.dim(norb, nelec)` (`states/dimensions.py:47-50`); state vec is a flat array of that length (reshaped `(dim_a, dim_b)` internally). **This is the pre-spawn memory governor** (design doc §6).

| Hamiltonian | Consumed by | Construction | Cite |
|---|---|---|---|
| `MolecularHamiltonian` | `linear_operator`, RDM energy | `MolecularData.from_scf(scf, active_space).hamiltonian` (PySCF) | `molecular_hamiltonian.py:28-54`; `molecular_data.py:117-124` |
| `DoubleFactorizedHamiltonian` | `simulate_trotter_double_factorized` | `.from_molecular_hamiltonian(mol_ham, *, tol=1e-8, max_vecs=None, …)` | `double_factorized_hamiltonian.py:139-152` |
| `DiagonalCoulombHamiltonian` | `simulate_trotter_diag_coulomb_split_op` | `.from_fermion_operator(op)` (e.g. `fermi_hubbard_2d`) | `diagonal_coulomb_hamiltonian.py:120-206` |
| `FermionOperator` | `linear_operator` directly (no PySCF) | `fermi_hubbard_1d/2d(...)` | `linear_operator_protocol.py:55-56` |

Hamiltonian tensors and state vectors are **large** → they cross the worker boundary as **hashed artifact handles**, not inline JSON (design doc §7).

## 3. Wire protocol for `ffsim_worker.py` (closed-enum dispatch, NO eval)

Strict length-prefixed UTF-8 JSON over stdio. The worker dispatches a **closed enum** via a dict — never `eval`/`getattr`/`exec`/pickle.

```text
REQUEST   <10-digit-decimal-byte-length><utf8 json>
RESPONSE  <10-digit-decimal-byte-length><utf8 json>
```

```jsonc
// request
{ "op": "simulate_trotter_double_factorized",   // MUST be in the closed QuantumOp enum
  "norb": 4, "nelec": [2, 2],
  "seed": 12345,                                  // REQUIRED for any stochastic op
  "params": { "time": 1.0, "n_steps": 5, "order": 0 },   // per-op allowlisted numerics only
  "inputArtifacts": [                             // hashed handles to big inputs
    { "handle": "scratch/df_ham.npz", "sha256": "…", "shape": [/*…*/], "dtype": "float64" }
  ] }
// response
{ "ok": true,
  "scalars": { "energy": -1.234, "norm": 1.0 },  // what the flow branches on
  "artifacts": [ { "handle": "scratch/state.npy", "sha256": "…", "shape": [36], "dtype": "complex128" } ],
  "provenance": { "ffsim_version": "0.0.81", "seed": 12345, "rayon_threads": 1, "tolerance": 1e-8 } }
```

**Security invariants (worker side):** closed-enum dict dispatch only (no `eval`/`getattr`/`exec`/pickle); per-op `params` allowlist with type+range checks; artifacts content-addressed and loaded `allow_pickle=False`; gates called with `copy=True`; `RAYON_NUM_THREADS` + BLAS thread env pinned **before** `import ffsim`. Re-validate `dim(norb,nelec) ≤ max_subspace_dim` at the border (defence in depth). No bit-determinism promised (see build-readiness §5).

## 4. Golden / reproducibility test (Phase 2 gate)

**Recommended primary golden — smallest, exactly-reproducible, NO PySCF:** 1-D Fermi-Hubbard, `norb=2`, half-filling. Source: `tests/python/operators/fermi_hubbard_test.py:852-863`.

```python
import ffsim, scipy.sparse.linalg, numpy as np
op = ffsim.fermi_hubbard_1d(norb=2, tunneling=1, interaction=2,
                            chemical_potential=3, nearest_neighbor_interaction=4, periodic=True)
ham = ffsim.linear_operator(op, norb=2, nelec=(1, 1))
eigs, _ = scipy.sparse.linalg.eigsh(ham, which="SA", k=1)
np.testing.assert_allclose(eigs[0], -6.000000000000)        # EXACT expected eigenvalue
```

- `subspace_dim = C(2,1)·C(2,1) = 4`; expected ground-state eigenvalue **-6.000000000000** (`:863`).
- Tolerance: bare `assert_allclose` default rtol=1e-7 (no override; **UNVERIFIED** that the test overrides). The `-6.0` edge case is exact → safest single golden. (norb=2 periodic counts the ring's two-vertex edge twice → tunneling coeff −2 not −1; `fermi_hubbard.py:52-54`.)
- PySCF-free: `FermionOperator` is consumed by `linear_operator` directly (`linear_operator_protocol.py:55-56`).

**Secondary goldens** (same params t=1,U=2,μ=3,V=4; all `eigsh(which="SA",k=1)`, all in `fermi_hubbard_test.py`): 1d norb=4 (2,2) open → **-9.961978205599**; 1d norb=4 (2,2) periodic → **-8.781962448006**; 2d 2×2 (2,2) periodic → **-9.428197577536**. (Full table of 9 in `_raw-miner-findings.md`.)

**Smallest molecule golden (needs PySCF):** H₂ / STO-6G (bond 1.8 Bohr) linear-method VQE, fixed RNG seed → `result.fun == -0.970773` (`tests/python/optimize/linear_method_test.py:26-87`); re-asserted under 4 optimizer configs. norb/nelec not asserted numerically (presumed 2 / (1,1), subspace_dim 4) — **UNVERIFIED**.

**As a Phase-2 wire test:** send `{op:"expectation_energy"/eigsh-equivalent, norb:2, nelec:[1,1], seed:0, params:{…hubbard…}}`; pass condition `|scalars.energy − (−6.0)| ≤ tolerance`. (ffsim has no `eigsh` op; the worker computes the energy of a prepared state, or the golden is run as a `linear_operator` ground-state check — confirm the exact op mapping in Phase 2.)

---

### Files read
`python/ffsim/__init__.py`, `states/{slater,states,rdm,dimensions}.py`, `gates/{orbital_rotation,diag_coulomb}.py`, `trotter/{double_factorized,diagonal_coulomb_split_op}.py`, `protocols/linear_operator_protocol.py`, `hamiltonians/*`, `molecular_data.py`, `operators/fermi_hubbard.py`, and tests under `tests/python/{operators,optimize,states,gates,contract}/` — all under `C:\wwwprojects\IBM-FFSIM\ffsim`.
