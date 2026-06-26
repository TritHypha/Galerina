<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/FFSM/ffsim-build-readiness.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-ext-bridge-quantum-design.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-ext-bridge-quantum-design.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# ffsim — Build-Readiness Grounding (environment · container · determinism · Rust core)

> **R&D scratch — design-only.** Lives outside the Galerina build. Concrete technical
> grounding beneath the canonical governance design doc
> `C:\wwwprojects\Galerina\docs\Knowledge-Bases\galerina-ext-bridge-quantum-design.md` (task **#199**).
> It does **not** restate the contract / Toxic-Border / attestation design — it supplies the
> facts that design needs to be *implemented*. Every concrete fact is cited `relative/path:line`
> against `C:\wwwprojects\IBM-FFSIM\ffsim`. Items not observed in a file are marked **UNVERIFIED**.
> Exhaustive un-edited findings: [`_raw-miner-findings.md`](_raw-miner-findings.md) (workflow `ffsim-rnd-pack`, 2026-06-15).

ffsim package version `0.0.81.dev` (`pyproject.toml:8`); Rust crate `ffsim 0.0.0` (`Cargo.toml:1-9`); Apache-2.0.

---

## 1. Linux/WSL reality (this is a Windows machine)

- ffsim's own `CONTRIBUTING.md:3` states the dev instructions **"won't work natively on Windows"** and recommends **WSL**. The build toolchain (maturin/PyO3 + manylinux cibuildwheel, `pyproject.toml:67,71-76`; `compose.yaml:6` `platform: linux/amd64`) is Linux-first in practice.
- **Implication:** the governed worker must be a **Linux container/process**, not a native-Windows process — even though the repo sits at `C:\wwwprojects\IBM-FFSIM\ffsim`. This *confirms* the ratified Stage B = OCI/gVisor decision (#3): there is no credible native-Windows worker path.
- Hash/path caveat: normalize line endings before hashing any checked-out file (Windows checkout + `CONTRIBUTING.md:3`).

## 2. Pinned dependencies + Python range + system libs

**Python:** `requires-python = ">=3.10"` (`pyproject.toml:7`, `uv.lock:3`); classifiers 3.10–3.14 (`pyproject.toml:16-20`); Rust wheel is `abi3-py310` — one stable-ABI wheel for 3.10+ (`Cargo.toml:18`). **No `[project.scripts]`** — ffsim is an importable library only, no CLI (full `pyproject.toml` read).

**Resolution split (critical):** `uv.lock` pins *different* core-dep versions per interpreter, gated on `python_full_version < '3.11'` vs `>= '3.11'`. Pin ONE interpreter and you get exactly one column:

| Package | `< 3.11` | `>= 3.11` | all | Cite |
|---|---|---|---|---|
| numpy | 2.2.6 | 2.3.0 | | `uv.lock:2062-2064 / 2127-2129` |
| scipy | 1.15.3 | 1.17.1 | | `uv.lock:3190-3192 / 3249-3251` |
| jax / jaxlib | 0.6.2 | 0.9.2 | | `uv.lock:1083-1084 / 1102-1103` |
| pyscf | | | 2.12.1 | `uv.lock:2711-2713` |
| qiskit | | | 2.3.1 | `uv.lock:2920-2922` |
| orjson | | | 3.11.8 | `uv.lock:2208-2210` |
| opt-einsum | | | 3.4.0 | `uv.lock:2199-2201` |
| typing-extensions | | | 4.15.0 | `uv.lock:3694-3696` |

Declared specifiers (`pyproject.toml:26-35`): only `pyscf>=2.9`, `qiskit>=2.0` carry bounds; the rest unpinned → **the lock is the source of truth**. Rust crates (`Cargo.lock`): `pyo3 0.27.2` (`abi3-py310`, `num-complex`), `ndarray 0.15.6` (feat `rayon`), `rayon 1.11.0`, `numpy 0.27.1`, `num-integer 0.1.45`.

**System libs** (`Dockerfile:11`): `gcc libssl-dev libopenblas-dev pkg-config`. OpenBLAS is the BLAS/LAPACK backend for numpy/scipy/pyscf. cibuildwheel sets `RUSTFLAGS=-C target-cpu=x86-64` (baseline ISA, not host) (`pyproject.toml:74-76`).

**Thread env vars the project honors** (`pyproject.toml:127-133`): `OMP_NUM_THREADS`, `RAYON_NUM_THREADS`, `MKL_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, `VECLIB_MAXIMUM_THREADS`. Pin all to `1` for a deterministic single-tenant worker (determinism *rationale* UNVERIFIED in repo; the vars are real).

## 3. The worker container: ffsim's image is the wrong shape

ffsim ships an **interactive Jupyter notebook image** — explicitly "so users can easily get started" (`compose.yaml:1-2`). Every property is wrong for a governed worker:

| Shipped image property | Cite | Why it's wrong for the worker |
|---|---|---|
| Base `quay.io/jupyter/minimal-notebook:python-3.13` | `Dockerfile:1` | drags the whole Jupyter/IPython server stack — huge surface, zero benefit |
| Jupyter server on an **open port** 58888 | `compose.yaml:9-13` | a worker must be **network-denied**; a listening server is the opposite |
| **Token auth disabled** (`--ServerApp.token=''`) | `compose.yaml:11` | unauthenticated notebook = arbitrary-code-exec endpoint |
| **Persistent named volume** | `compose.yaml:14-18`, `Dockerfile:20` | worker must be **scratch-only/ephemeral**; persistence breaks isolation+reproducibility |
| `restart: unless-stopped` | `compose.yaml:6` | long-lived daemon, not a one-shot job |
| Installs `[dev]` group, editable (`-e`) | `Dockerfile:28` | ships pytest/ruff/mypy/maturin into runtime; `-e` leaves source+build tooling resident |
| Copies entire repo incl. docs | `Dockerfile:15,24-25` | docs/notebooks/tests are runtime dead weight |

**Stripped worker image (design sketch — not a repo file):**

```dockerfile
# Pin ONE supported minor (3.10–3.14) → fixes the numpy/scipy/jax column from §2.
FROM python:3.13-slim-bookworm        # pin by DIGEST, not tag (UNVERIFIED digest)
# build stage only: gcc libssl-dev libopenblas-dev pkg-config (Dockerfile:11)
# runtime stage:    libopenblas runtime .so only (exact bookworm pkg name UNVERIFIED)
# install FROM THE LOCK, not loose specifiers:
#   uv sync --frozen --no-dev         # uv.lock rev 3; excludes [dev]/[docs]
# build Rust cdylib via maturin>=1.0,<2.0 (pyproject.toml:1-3) as abi3-py310 wheel
ENV OMP_NUM_THREADS=1 RAYON_NUM_THREADS=1 MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1     # pyproject.toml:127-133
USER 65534:65534                      # non-root; no jovyan
WORKDIR /scratch                      # tmpfs / scratch-only; no persistent volume
# NO EXPOSE, NO restart, NO Jupyter, NO token server.
ENTRYPOINT ["python", "ffsim_worker.py"]   # one-shot; library has no console script
```

**Maps to ratified Stage B (#3):** run with `--network=none`, read-only rootfs, tmpfs `/scratch`, seccomp profile, under OCI/gVisor (tasks #43-44, #111-113). *These outer controls are orchestrator-enforced — nothing in the ffsim repo configures them; the shipped compose does the opposite.* Stage A = TS-boundary + no network handle passed + documented gap.

## 4. `pinnedEnvHash` + `backendArtifactHash` pre-image (manifest §9.1)

**`pinnedEnvHash`** must cover *every input that determines the resolved binary environment* and nothing dev-only:

```text
pinnedEnvHash = SHA-256( canonical_concat_sorted_by_path(
    sha256(pyproject.toml),   # specifiers, python-requires, maturin/build config
    sha256(uv.lock),          # authoritative Python pins (revision 3)
    sha256(Cargo.toml),       # Rust specs + pyo3 abi3-py310 feature
    sha256(Cargo.lock),       # authoritative Rust pins + checksums
    sha256(Dockerfile),       # OS libs + base image
    base_image_digest,        # immutable digest, NOT the mutable tag (Dockerfile:1)
    "py=3.13",                # REQUIRED scalar — the lock resolves DIFFERENT numpy/
))                            #   scipy/jax per interpreter (§2); lock alone is ambiguous
```

- **Interpreter minor MUST be an explicit input** — the `< 3.11` / `>= 3.11` split (§2) means hashing only the lock conflates two materially different envs.
- **Pin the base image by digest, not tag** (`Dockerfile:1` uses a mutable tag).
- Normalize line endings before hashing (Windows checkout).
- `compose.yaml` is **excluded** (mostly discarded for the worker; avoids dev-only churn).

**`backendArtifactHash`** = sha256 of the *built* artifacts as-deployed: the built wheel / `ffsim._lib` `.so` + the pinned `ffsim_worker.py`, or (cleanest) the worker **OCI image digest**. Record as-built — reproducible builds across hosts are UNVERIFIED, so the artifact hash commits to one concrete build.

## 5. Determinism envelope → what `tolerance` can promise (and what it can't)

| Knob | Controllable? | Evidence |
|---|---|---|
| NumPy RNG stream | **Yes** — `seed` | `random.py:41`; `sample_slater.py:114` |
| Rust thread count | **Yes** — `RAYON_NUM_THREADS` | `README.md:39`; `gates/orbital_rotation.rs:37` |
| Host core count (env unset) | **No** — auto-detected via `available_parallelism()` | `gates/orbital_rotation.rs:39-44` |
| BLAS thread count / reassociation | **Not via ffsim** — separate pool, UNVERIFIED | `sample_slater.py:255,280`; `random.py:103` |
| Jordan-Wigner coeff accumulation order | **No** — nondeterministic `HashMap` merge in `par_iter().fold().reduce()` | `jordan_wigner.rs:104-118` |

**Grounded definition of "tolerance reproducibility":** fix `seed` **and** pin `RAYON_NUM_THREADS` **and** hold the rest constant (same wheel/build, same NumPy/SciPy + BLAS backend + BLAS thread count, same CPU ISA) ⇒ results reproduce to **≈ machine-eps × problem-scale**, *not bit-for-bit*.

**Hard honesty rules for the wrapper (do not overstate):**
- **Do NOT advertise bit-level thread-determinism.** No source asserts it, and `jordan_wigner_qiskit` provably violates it (`jordan_wigner.rs:104-118`; its `tol` cutoff can even flip near-threshold terms). Same-seed+same-threads ⇒ bit-identical is **UNVERIFIED / not guaranteed by the code**.
- Pin **both** `seed` and `RAYON_NUM_THREADS`, and the BLAS thread env too (`OPENBLAS_NUM_THREADS`/`MKL_NUM_THREADS` — which BLAS ships is UNVERIFIED).
- **Consequence for the design:** `determinismMode` must be `"tolerance"`, never `"exact"` — exactly as ratified. For **B2 / `SPORE-SUBSTRATE-002/003`** (is the declared `tolerance` provable at the declared `N`?), the substrate model needs a **float64/BLAS+Rayon lane noise profile** — it currently has photonic-oriented profiles only. This is the **§13.8 open item** in the design doc. B1 (crypto-on-core) and B3 (unvoted→deterministic) apply unchanged regardless.

## 6. The Rust-accelerated core = the opaque out-of-process compute (`src/lib.rs:21-64`)

The **only** functions in the compiled `ffsim._lib` (and `python/ffsim/_lib.pyi`). This is the exact boundary the wrapper treats as opaque:

| Exported name | Accelerates | Parallelism |
|---|---|---|
| `apply_phase_shift_in_place` | phase shift on state rows | single-threaded `for_each` (`phase_shift.rs:26`) |
| `apply_givens_rotation_in_place` | Givens/orbital-rotation building block | manual `thread::scope` (`orbital_rotation.rs:64`) |
| `apply_num_op_sum_evolution_in_place` | num-op-sum time evolution | `par_for_each` (`num_op_sum.rs:31`) |
| `apply_diag_coulomb_evolution_in_place_num_rep` / `_z_rep` | diagonal-Coulomb evolution | `par_for_each` (`diag_coulomb.rs:47/61/77`, `125/144/170`) |
| `givens_decomposition` / `givens_decomposition_slater` | decompose unitary → rotations | sequential (`linalg/givens.rs:86-145`, `166-196`) |
| `contract_diag_coulomb_into_buffer_num_rep` / `_z_rep` | diag-Coulomb contraction | `par_for_each` (`contract/diag_coulomb.rs:50/64/80`, …) |
| `contract_num_op_sum_spin_into_buffer` | num-op-sum contraction | `par_for_each` (`contract/num_op_sum.rs:31`) |
| `jordan_wigner_qiskit` | FermionOperator → Qiskit Pauli list | `par_iter/fold/reduce` — **nondeterministic merge** |
| `FermionOperator` (class) | Rust-backed operator container | (not a numeric kernel) |

- Numeric kernels are **in-place / into-buffer** (mutate caller-owned NumPy arrays); only `givens_decomposition*` and `jordan_wigner_qiskit` return values.
- **Critical honesty point:** the code is an **in-process PyO3 extension** (`Cargo.toml:9,16`); there is **no IPC/subprocess boundary in ffsim today**. "Out-of-process" is **Galerina's framing** — a sandbox boundary the *wrapper* imposes, not an existing ffsim property. The wrapper spawns Python (which loads `_lib` in-process inside that subprocess); the isolation is at the OS/process level the wrapper creates, never inside ffsim.

---

### Files read for this grounding
`pyproject.toml`, `uv.lock`, `Cargo.toml`, `Cargo.lock`, `Dockerfile`, `compose.yaml`, `CONTRIBUTING.md`, `README.md`, `python/ffsim/random/random.py` (+`__init__`), `python/ffsim/_lib.pyi`, `python/ffsim/states/{sample_slater,states}.py`, `src/lib.rs`, `src/gates/*`, `src/contract/*`, `src/linalg/*`, `src/jordan_wigner.rs` — all under `C:\wwwprojects\IBM-FFSIM\ffsim`.
