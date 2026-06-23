# LogicN — Deterministic Compiler Intelligence & Tri-Pipe Routing (R&D)

> Owner's R&D blueprint ("R&D Document 005", 2026-06-23), captured + mapped against shipped code (verify-before-build).
> **The thesis: "intelligence" = Deterministic Mathematical Foresight, NOT black-box AI guessing.** In an Absolute
> Zero-Trust architecture, *guessing is a fatal vulnerability.* The compiler does not guess what code will do; it
> **mathematically proves the boundaries of the code before it executes**, and routes/heals deterministically.

## The three pillars (owner's blueprint)

1. **Kleene K3 Abstract Interpretation (static trust analysis).** Map every variable in the execution DAG to the
   verdict domain `V = {−1, 0, +1}`; traverse the AST applying `vAnd = min` statically. If a downstream capability
   depends on input A (`+1`, pinned sig) AND input B (`−1`, revoked cert), the compiler proves `E = min(+1,−1) = −1`
   **at compile-time** and performs **Governance Dead-Code Elimination** — it refuses to emit WASM for the
   downstream branch, replacing it with a static `TRAP → ERASE`. It proves the failure instead of waiting for runtime.
2. **Tri-Pipe Substrate Routing (physics-aware scheduling).** A deterministic routing function `R(o)` assigns each
   operation to a substrate `{S_B Binary, S_H Hybrid, S_P Photonic}`. **Rule 1 (crypto invariant):**
   `R(o_crypto) = S_B` rigidly (hashing/KDF/exact-indexing stay Binary). **Rule 2 (photonic promotion):** massive
   parallel tensor multiply where precision-loss is acceptable → `S_P`. **Substrate contamination:** a tensor (`S_P`)
   result used as an AES key (`S_B`) is proven illegal (analog noise cannot cross into a bit-exact field) → immediate
   `LLN-SUBSTRATE-001` compile error before `.wasm` is generated.
3. **Semantic Auto-Resilience (injecting the `0` state).** On a network call (`db.fetch`) the compiler rewrites it
   into a ternary state machine — `+1` verified · `0` noise-detected (request Ternary Symbol Repair, holding pattern)
   · `−1` signature-invalid (TRAP) — so a forgotten `try/catch` becomes a physics-aware fault-tolerant machine
   automatically, without the developer writing one.

## Verify-before-build mapping (what already ships vs net-new)

| Pillar | Shipped today | Net-new / under-explored |
|---|---|---|
| §2 K3 abstract interpretation → **Governance DCE** | governance-verifier proves contracts at compile-time; AOT const-fold/branch-fold/DCE (R&D 0036) | **A formal per-variable trust-state abstract-interpretation pass over the K3 lattice + DCE of provably-DENY branches (`TRAP→ERASE`) is the genuine net-new intelligence.** This is the R&D focus. |
| §3 Tri-Pipe substrate routing | `tri-pipe/execution-router.ts`, `photonic-emulator/partition-decider.ts` + `photonic-switch.ts`, `tower-citizen/hybrid-engine.ts` + `precision-strategy.ts`, `hardware-tier/tier-loader.ts`, `routePrecision` | mostly **BUILT**; gap = the *agency policy* (below) + a unified compile-time `R(o)` surfacing |
| §3 crypto invariant + contamination | `substrate-inference.ts`, `substrate-math.ts`, `LLN-SUBSTRATE-001..004`, `verifySubstrate` (governance-verifier) | mostly **BUILT**; confirm the `S_P→S_B` key-contamination case is explicitly a hard error |
| §4 semantic auto-resilience | `resilience-inference.ts` (resilience{} auto-by-default); `on_*_fault` handlers (R&D 0017) | `on_*_fault` **doesn't parse yet** (◑); the photonic-noise→`0`→Ternary-Symbol-Repair holding pattern is net-new |

**Headline: ~70-80% of the blueprint re-derives shipped architecture** (the recurring pattern). The high-value R&D
is **§2 Governance Dead-Code Elimination** — a static K3 abstract-interpretation pass that elides provably-DENY code.

## The agency question (owner asked) + recommendation

*Should the substrate router auto-promote heavy math to Photonic if the hardware is available, or must the developer
explicitly authorize it (`substrate { photonic }`)?*

**Recommendation: bounded agency — explicit authorization of the ENVELOPE, automatic routing WITHIN it, fail-closed
to Binary.** The developer opts in at the contract (`substrate { photonic }` / a tolerance+precision declaration);
the compiler's PartitionDecider then auto-routes eligible kernels to the photonic lane **only** when it proves a
**net-win + tolerance-witness + Freivalds cheap-verify + attestation**, and **never** promotes crypto / exact-index /
precision-sensitive ops. Silent auto-promotion is rejected: it violates *"no hidden power, no hidden cost"* and the
determinism contract (photonic is lossy/noisy). This is exactly the standing **Tri-Pipe coverage rule**
([[feedback-tri-pipe-coverage-rule]]) — Binary is the default+correct; Hybrid/Photonic only for eligible kernels
behind the decider, fail-closed to Binary. So the blueprint's §3 "compiler intelligently promotes tensor → S_P"
should read **"auto-routes within the developer-authorized, tolerance-witnessed envelope."**

> Status: R&D (workflow in flight). Net-new build candidate = §2 Governance DCE pass. Photonic perf = projected/emulated.
