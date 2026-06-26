# Galerina R&D — outcomes + science-paper check (2026-06-24 processing run)

**Scope:** the R&D processed in the 2026-06-24 photonic/substrate + interpreter/governance series (`RD-0110`–`RD-0118`), plus the R&D-driven builds shipped in the same run. Older corpus (`RD-0001`–`RD-0109`) lives in the R&D repo (`C:\wwwprojects\Galerina-R-AND-D`) with its own ledgers; see [`galerina-rd-reference-index.md`](galerina-rd-reference-index.md) for the ID scheme.

**Outcome legend:** **Positive** = the thing works / is sound / yields a buildable result · **Negative** = refuted / a measured-negative result (a *useful* outcome under our strategy) · **Could-not-be-done** = blocked / hardware-gated (no CPU-only path).
**Paper legend** (standing IP strategy — *papers only for reproducible measured-negatives on a named machine; defensive-pub + Apache-2.0 for the rest; 0 patents*): **Paper** = paper-worthy measured-negative · **DP** = defensive-publication (pin prior art, not a paper) · **No** = covered/positioning, no publication.

## R&D ledger

| ID | Topic | Outcome | Science-paper check | Status |
|---|---|---|---|---|
| **RD-0110** | Photonic O(1)-matmul refutation, deepened | **Negative** (refutation: latency-O(1) but work/area/energy Θ(N²); Meech ~1.94×) | **Paper** (measured-negative, named machine) | ✅ done |
| **RD-0111** | 52-3D photonic brief, 28-claim recheck | **Negative** (mostly refute/overstated; the governance layer is sound) | **DP** (covered by 0110) | ✅ done |
| **RD-0112** | Tree-walker, deepened | **Positive** (integer core sound, byte-exact across 3 tiers) + caught & fixed a latent fail-open | **Paper** (tree-as-tensor negative + cross-tier conformance) | ✅ done |
| **RD-0113** | Tower-citizen K3 governance, deepened | **Positive** (genuine Kleene K3, 0 errors, 145/145) | **DP** (the combination) + **Paper** (T-MAC = a reduction, not a matmul) | ✅ done |
| **RD-0114** | .tmf format vs TritMesh DB, compared | **Positive** (both digital + sound; control/data-plane positioning + 2 guardrails) | **No** (positioning) | ✅ done |
| **RD-0115** | Hybrid photonic/binary placement | **Positive** (shipped switch sound + fail-safe; reuse gap diagnosed, gap is safe) | feeds RD-0117 | ✅ done |
| **RD-0116** | Holographic "O(1)-read petabyte" storage | **Negative** on the claim (refute-and-park) → spawned a **Positive** net-new finding (`SPORE-RETAIN-001`) | **DP** (the sound-erasure note) | ✅ done |
| **RD-0117** | The join (formalize + wire + measure) | **Positive** (Safe-Floor Theorem proved + shipped as a runtime gate, 15/15) | **Paper** (safe-floor theorem + Amdahl measured-negative) | ✅ done |
| **RD-0118** | SPORE-RETAIN-001 HW protection directive, hardened | **Positive** (decision core built 12/12; directive design adversarially hardened) | **DP** (the directive) | 🟡 in progress |

**Could-not-be-done (hardware-gated tails — no CPU-only path; tracked, not failed):** pinning the absolute photonic ns-constants to a real PIC (`RD-0110` action #10, `RD-0117` step 8); the holographic *substrate* itself and the real storage-admission *dispatch* (`RD-0116`, gated #102-106). In every case the *governance/math* half is done on CPU and only the silicon is gated — and the design fails safe to digital, so the gate never blocks correctness.

## R&D-driven builds shipped this run (the "R&D done" → code)

| Build | Commit | Driven by |
|---|---|---|
| Interpreter sync-fallback hardened (checked algebra) | `152dc0b` | `RD-0112-F1` |
| Dispatch-completeness lemma (proves the fallback is dead-today, CI gate) | `13276db` | `RD-0112` |
| CLI redaction fail-closed tripwire (`SPORE-CLI-REDACT-001`) | `fe223fd` | 0094-redact PART-A |
| Safe-Floor Theorem proof (imports the real decider, 15/15) | `0c671e6` | `RD-0117-O2` |
| `SPORE-RETAIN-001` sound-erasure gate (`admitSubstrateWrite`, 12/12) | `746e161` | `RD-0116-O4` / `RD-0118` |
| R&D reference-ID scheme + master index | `f901509` | (process) |

## Science-paper bottom line

Consistent with the standing strategy ([`galerina-ip-paper-strategy.md`](../../../Galerina-R-AND-D)): **0 patents** (the framework adds no new crypto/science by design). The **measured-negatives** are the only paper-worthy lane, and they cohere into **one potential paper** — *"Latency is not work: measured negatives on governing photonic/exotic substrates"* — bundling `RD-0110` (latency-O(1) vs work-Θ(N²)), `RD-0117` (the Safe-Floor Theorem + the ~1.0–1.1× Amdahl ceiling on governed dataflow), and `RD-0116` (no exotic medium replaces a digital integrity anchor; overwrite-erasure is unsound on WORM media). Everything else is **defensive-pub** (`RD-0111/0113/0116/0118`) or **positioning** (`RD-0114`). No single result on its own clears the bar for a standalone flagship paper; the *bundle of measured-negatives on a named machine* does, if the owner wants to publish.

### Paper written + the later batch graded (2026-06-24 EOD)

- **DRAFTED (5 measured negatives):** the bundle note now exists — `Galerina-ScientificPapers/latency-is-not-work-measured-negatives-photonic-substrates-2026-06-24.md`. **A** ML-DSA-65 photonic-signing Amdahl wash (f≈0.28 → ~0.9×), **B** photonic latency-O(1)/work-Θ(N²), **C** holographic not-O(1)/not-PB, **D** tree-as-tensor loses on both axes (RD-0112 — the same trade on a CPU), **E** the interpreter speed-lever ranking (RD-0112 — NaN-boxing only 1.15× vs de-color 7.4×, a measured negative against "boxing is the bottleneck" folk wisdom); + the **RD-0113 complement** (a min-fold *reduction* is Θ(N) work / O(log N) depth — Result B's Ω(N²) does NOT bind it; "T-MAC" is misleading vocabulary); + Safe-Floor + honesty bar. **One novelty gate open before submission** (§9): §1's `f≈0.28` is measured pure-JS; a **native/SIMD (AVX2 liboqs/pqclean) re-measurement** is needed to clear reviewer-novelty (~0.62 today). §2–§6 are not gated. Until then it is an **internal draft**, not a submission.
- **The later batch (RD-0122/0125/0126/0109) is pre-graded NO PAPER → defensive-pub only.** The K3 resolution-boundary / "third execution paradigm" is an *application of Kleene 1938* (explicit on the papers-repo NO list). It is concept-settled and **doubly red-teamed** (my RD-0125 red-team found+fixed HOLE-1; the independent bridge 0109 ran ~30 attacks, 0 holes; both grounded on the shipped dist) — but that strengthens *confidence*, not *novelty*. Defensive-pub, not a paper. The "two flagged defensive earlier" = **0037** (trit-0 masking → Apache-Arrow validity-bitmap pattern + SQL-3VL pitfall) and the **K3-uniform-spine combination** (RD-0113 DP).

## Open todos (R&D-side, 2026-06-24 EOD)

- **Paper:** native/SIMD re-measurement of ML-DSA offloadable `f` (the only thing between the draft and a submittable eprint). *Owner-gated: publish or not.*
- **RD-0126 build queue:** A-1 transitive crypto-pin compiler invariant (substrate-inference, reactive→structural) — **NEXT build**. A-2 (derive isCrypto from effects) **DONE** (`8d8bdd7`). Rest TRACK/HW-gated.
- **Audit NOW-tier:** NOW-1 false-memory-gate **DONE** (+ emitter lint), NOW-2 cross-flow egress fail-closed **DONE**, NOW-3 gate-injection CI **DONE**. Remaining: NOW-4 (quarantine env-key CLI test + compiler-suite-in-CI), NOW-5 (`ext-tmf` inclusion.ts), NOW-6 (2 RED r6-corpus assertions).
- **Resolution paradigm residuals (TRACK-until-consumer per RD-0122):** productionize the delivery engine · the atomicity/transaction gap (gate-entry ≠ rollback) · lease-bounded snapshot / mid-flight revocation (RD-0125 HOLE-2).
