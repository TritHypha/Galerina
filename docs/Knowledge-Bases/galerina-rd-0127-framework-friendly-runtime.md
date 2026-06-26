# RD-0127 — Framework-Friendly Runtime (note 16) + retro proof/score of the contested notes 8–15 claims

**Status:** R&D complete (adversarial workflow `wsqlqeskd`, 16 agents). Reproducible maths: `scripts/rd-0127-framework-friendly-runtime-proof.mjs` (**15/15 PASS**). No core build landed; **one** build is tracked (C4).

## Why this RD exists (the honest gap)

Notes **8–15** got a *triage table* (disposition + a ZT *direction* ✅/❌) — **not** the corpus's rigorous
treatment: no proof script proving/refuting each claim's math, no numeric **ZT score**, no RD number. The
owner flagged this directly. RD-0127 closes the gap: note 16 + the contested 8–15 claims now get **proved or
refuted with concrete numbers** and a **numeric ZT score (0–10)**, and the perf-note stream rejoins the
numbered corpus (resumes after RD-0126). **Going forward each owner perf-note gets an RD number + this
prove-and-score treatment.**

**ZT rubric (0–10):** governance-stays-in-the-trusted-boundary + fail-closed ⇒ HIGH; TCB bloat / fail-open /
strip-checks / **silent value change** ⇒ LOW. 10 = pure ZT win · 5 = neutral/needs-guards · 0 = refuse.

## Results

| # | Claim (source) | Math result (proven/refuted, key number) | ZT | Verdict |
|---|---|---|---:|---|
| **C1** | Native contiguous `Tensor<T>` (note16-1) | **REFUTED as live footprint**: claimed 4 MB @ N=1M, but Galerina's persistent rep is a **boxed `GalerinaValue` list ≈ 40 MB** (10× worse than claimed, worse than the 32 MB CPython list it claims to beat); the 8×-vs-list direction is a 30-yr-old numpy result, not net-new. Contiguous buffer lives one op then re-boxes. | 4 | **track** |
| **C2** | Unified Substrate Codegen into `logicnc` (note16-2) | **REFUTED (strong form)**: framework artifact ↓MB but TCB **↑40–80× (SPIRV) to ~1000× (CUDA)** over the 2.6 MB core; the substrate win it chases is bounded at **~1.9× (Θ(N²) work + Θ(N²) precompute mem, latency-O(1)≠work-O(1))**. Sub-2× gain bought with 1–3 orders-of-magnitude trusted-surface inflation = the prior *"don't replace WASM = TCB trap"* verdict. | 2 | **position** |
| **C3** | Type-level layout polymorphism `Layout::ColumnMajor` (note16-3) | **REFUTED — owner already said NO; confirmed SOUND**: layout is **value-identical** (a 768² no-op transpose moves 2.36 MB, same value), guards a perf not a safety property; **6.7×** annotation blow-up (320 SSA values vs 48 layout-sensitive ops) + **r!** type-lattice fanout (2/6/24/120) ⇒ an equivalence-solver inside the core type checker for **zero new value-safety**. | 1 | **refuse** |
| **C4** | AST loop-fusion / deforestation `Σ f(g(xᵢ))` (note16-4) | **PROVEN**: a 3-op eager chain (today `map`/`filter` are eager) = **3 passes + 2 intermediate N-arrays**; fused = **1 pass, 0 arrays** ⇒ removes `2·N` allocs and a constant **3×** RAM-pass factor (honest: O(N) constant, NOT asymptotic). | 6 | **build** |
| **C5** | N\* photonic net-loss lint, μ·N crossover (note8/12) | **PROVEN** (cites `rd-photonic-ppu-virtualisation-proof.mjs`, 10/10): integer crossover **22/61/182/503** for rows 128/256/512/1024; below ⇒ **12.3×/3.6×/1.4× slowdown**, above ⇒ **1.52×/3.13×/6.32× win**. The **Freivalds verify term (~6 ns ≈ 188× the 0.0319 ns optical)** sets the crossover, not optics. | 5 | **track** |
| **C6** | "Zero-byte photonic compute" / "0-cycle CHERI" (note14/15) | **REFUTED both halves**: digital marshalling lower-bound `(N²+2N)·4 = 2.37 MB/layer` **>0 and additive** ("zero bytes" inverts the sign); `P(exact 32-bit \| 8-bit ENOB) = 2⁻²⁴ = 5.96e-8` (an analog lane is NOT bit-exact memory); CHERI absent in the WASM target, never 0-cycle on real Morello (≥0.78% tag floor). | 1 | **refuse** |
| **C7** | "Ghost Runtime": strip 100% governance from the binary (note14/15) | **REFUTED at the information floor**: **SAFE-TO-STRIP = 0, N\* = ∞** — revocation (mutable `revocations.json`) / lease-TTL / quorum gate a 1-bit verdict on **compile-time-unknown runtime operands** (~53-bit). The lean-tier only ever removes an *empty* obligation set (double-gated). The owner-confirmed strip-checks fail-open. | 0.5 | **refuse** |
| **C8** | Tolerance-driven precision compaction `f64→int8` at ENOB floor (note14/15) | **8× byte math holds** (52−8 = **44 mantissa bits** below an 8-bit ENOB), but a **silent** narrow drops 44 mantissa bits **+ the float exponent** (int8 has none → needs a paid-back per-block scale, shrinking the real ratio below 8×). A silent value-narrow is a fail-open; it must be a declared/attested `ToleranceWitness`. | 4 | **track** |

## Disposition

- **The ONE build (owner-greenlit class):** **C4 loop-fusion / deforestation** (ZT 6) — perf-only, fail-SAFE
  (identical values), zero new trusted surface. Galerina's stdlib `map`/`filter` are *eager* today, so this is a
  genuine net-new honest win (a constant ~3× + alloc elimination, no overclaim). Tracked as a follow-up build.
- **Track (real but gated):** C1 (contiguous runtime rep — a real perf gap, but the *governance* asset already
  ships: SPORE-SUBSTRATE-005 compute-only fence + SPORE-TYPE-016/030 rank/shape), C5 (advisory crossover lint —
  needs a substrate `size` field; **not** a safety control — PartitionDecider already defaults-digital
  fail-safe), C8 (compaction only behind an attested ToleranceWitness, never silent).
- **Position (true-but-not-a-build):** C2 — the framework-shrink *direction* is real, but moving a multi-target
  ASSEMBLER into the compiler is the TCB trap; Galerina's shipped **delegate + attest + fence** seam
  (`inference-bridge-contract`, `BridgeAttestation`, SPORE-SUBSTRATE-005) is the deliberate alternative.
- **Refuse (fail-open / refused):** C3 (layout types — TCB-bloat-for-zero-value-safety; owner already NO), C6
  ("zero-byte/0-cycle" overclaim — licenses trusting an analog lane as exact memory), **C7 (Ghost Runtime
  strip-governance — the canonical strip-checks fail-open, ZT floor)**.

**Net:** note 16's premise (keep frameworks small) is sound, but its strongest mechanisms (native codegen,
layout types) are **TCB traps**; the only honest, ZT-safe win is **loop fusion (C4)**. The 8–15 retro confirms
the earlier triage directions with hard numbers — and pins the two refused ideas (strip-governance, zero-byte)
at the ZT floor with proofs, not assertions.
