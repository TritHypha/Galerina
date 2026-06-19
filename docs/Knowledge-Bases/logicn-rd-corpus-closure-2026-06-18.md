# R&D corpus closure + shipping-readiness ledger (2026-06-18)

> **Status: R&D bridge queue DRAINED — 35/35 tasks done.** Verified structurally by the hub (every
> `_session-bridge/tasks/00NN-*.md` has a matching `done/00NN-*.done.md`; R&D commits `7f2dae0` + `48b606e`).
> **Provenance honesty:** verdicts 0009/0031/0032/0033/0034/0035 were **hub-verified this session** (own
> workflows + source reads); 0024/0025/0027/0028/0029/0030 are **worker-reported** (authority = the done
> report + its re-runnable artifact). The R&D session is the encryption R&D worker; production stayed READ-ONLY
> for it — every fix below is a *recommendation* until shipped by the hub/owner.
>
> This doc is the **apply-phase checklist**: what's proven, what's owner-gated-to-ship, what's HW/env/external-blocked.

## Proven ledger (re-runnable artifact behind each)
| Task | Verdict / proof |
|---|---|
| 0024 Z3/SMT i32 conformance | z3-solver 4.16.0: **18/20 obligations PROVEN domain-complete**; 2 div/rem value identities EXCLUDED (BV-division solver limit; definitional + 3M-sample-backed). The note-40 "math compiler" — now a real proof. |
| 0025 governance-as-T-MAC | decision-identical to the per-node fold; one VPP min-reduction; fail-closed. |
| 0027 decouple governance | verdict trit-vector, one VPP pass, decision-identical to interleaved, fail-closed. |
| 0028 photonic HW-readiness | SNR-aware CALIBRATION-REQUIRED gate; harness caught an over-strong invariant → EXCLUDED-until-HW. |
| 0029 linear-flatten | exact; two-sided crossover mapped; ternary-lossy (ANN regime only). |
| 0030 flat AST + const-time | **2.22× flat SoA AST**; constant-time = a security trade, not O(1). |
| 0031 boundary-flow | keyword REJECTED; param-trusted-by-default fail-OPEN reproduced; fix = `tainted` param (34A/34B). |
| 0032 stability-vs-C++ | per-axis (not blanket); the 2 liveness hazards reproduced — **now FIXED (see below)**. |
| 0033 WASM memory-safety | 32/32; intra-module corruption + ternary tombstoning + crypto-hygiene gaps. |
| 0034 memory-safety stance | drop the borrow checker for value-state + ternary-tag; Claim A/B proven vs shipped binary. |
| 0035 path-auth + mtrit mask | 1092 paths fail-closed/non-leaky; mask works; strictly finer than binary BFS. |

Citation verifiers exit 0 (the content-assert caught + fixed a real mis-cite in the 0031 done-report).

## APPLY PHASE 2026-06-19 (owner Go) — what SHIPPED + what's still parked
**Shipped this phase (commits on `main`, not pushed):**
- **0032 liveness** — `a728e44` (loops+recursion fail-closed) + `a9c4ebd` (wall-clock `checkDeadline()` in loop bodies + enforcer/capabilityHost propagated into sub-interpreters) + **`264723a`** (the part the first pass MISSED: the duplicate `whileStmt` in the *synchronous* pure-flow fast-path `tryPureFlowSync` — it had no iteration cap and swallowed every non-`SyncReturn` throw, so after Fork-A=TRAP an int-overflow→runtimeError→thrown-SyncNotSupported aborted the loop body before the counter advanced → **infinite loop**; this is what hung the compute-mix benchmark ~31 min. Fix = stop swallowing (bail → trapping tree-walker) + cap the sync loop; +4 regression tests).
- **0033** — `5c1f846` (crypto hygiene: `timingSafeEqual` + `fill(0)` derived keys in `logicn-ext-tmf/kemdem.ts`) + `692e62d` (`static-memory-pool` per-allocation **generation tag** → `LSM-UAF-001` use-after-free guard, +2 tests).
- **0034** — `08d6905` (borrow-checker KB → non-goal banner on 3 docs).
- Verification: graph regen clean (3660 nodes/4056 edges); SOT `--core` **3608** + compiler **3488** + sentinel **33** all green; full 28-benchmark suite **lands** (was hanging).

**Benchmark before/after (vs `full-suite-2026-06-16.json`) — HONEST attribution:** the deltas are NOT my fixes. My fixes add one int-compare per loop iteration + a no-op deadline check (no enforcer in the bench harness) and *remove* try/catches — perf-neutral by construction. The visible deltas are: (a) **Fork-A=TRAP** (2026-06-18, owner decision): overflow-dependent flows now correctly TRAP → compute-mix / matrix-multiply / data-query / tri-logic / call-chain governed = `—` (IntegerOverflow / excluded), and checked i32 arithmetic is slower than the old wrap (arithmetic-threshold −72%, governance-cost −74%); (b) **unit-normalisation fixes** since 06-16 (the absurd +900,000% swings on nodejs/passive rows = the old per-pass unit bug being corrected, not real perf); (c) **5 new benchmarks** (mandelbrot, spectral-norm, binary-trees, tmf-container, framework-pipeline). The 06-16 baseline is too stale (pre-Fork-A, pre-normalisation) to cleanly isolate my fixes; the real result is *the suite now completes and overflow workloads fail closed*.

**Found + filed (pre-existing, separate — `task_a680d348`):** the bytecode VM (`runBytecode`) has NO loop cap, and `compileToBytecode` caches by flow-NAME only (collides distinct `main` flows; also pollutes the bench runner, which clears `clearPureFlowCache` but not `clearBytecodeCache`).

**Still parked (owner-gated / not started):** 0034 `move`/`USE_AFTER_MOVE` wiring; 0031 `tainted` param (breaking); 0035 trit-fold reachability + 0025 governance-T-MAC decision path; 0033 WASM handles/WasmGC (ABI); **GAP-2/GAP-4** (item 4 — authorised but owner said stop after the benchmark, NOT started).

## Shipping-readiness / unblock map (what gates the *application* of the proven work)
1. **Owner-gated (production read-only — the big bucket; batch applied per owner Go 2026-06-18/19, see APPLY PHASE above):**
   - **0032 liveness hazards** — **✅ SHIPPED** `a728e44`+`a9c4ebd`+`264723a` (incl. the sync fast-path completion).
   - **0033** — crypto hygiene **✅ SHIPPED** `5c1f846`; `static-memory-pool` generation tag **✅ SHIPPED** `692e62d`; WASM handles/WasmGC for the intra-module gap — still parked (ABI).
   - **0031** `tainted` param (34A/34B); **0034** borrow-checker KB→non-goal **✅ SHIPPED** `08d6905` (the `move`/`USE_AFTER_MOVE` wiring still parked); **0035** wire the trit-fold into live reachability; **0025** governance-T-MAC decision path; GAP-2/GAP-4 engine fixes (parked).
2. **HW-gated (EXCLUDED-until-silicon):** all photonic latency/energy numbers (0028, governance-T-MAC, linear-flatten on a real T-MAC); real QRNG (IDQ Quantis); a hardware TEE; ARM-MTE/CHERI (declined — no silicon, emulate the idea via gen-tags).
3. **Env/runtime-gated:** **X1** — that the shipped tiers physically *dispatch* through the proven ops (the standing "proven-semantics ≠ proven-live-dispatch" gap; recurs in 0014/0021/0022/0023/0024/0032) — needs the 0014 fidelity harness wired into the live tiers. G3 (−6.0 Hubbard under pinned `uv.lock` WSL ffsim). Any perf number needs a named machine + reproducible bench.
4. **Solver-gated:** 0024's 2 div/rem value identities (BV-division SMT limit) — not load-bearing.
5. **External-cited (re-fetch before publishing):** the cross-language interpreter-speed numbers (§4 of the tree-walker doc, tier-ASSERTED — the research pass died on the spend limit) + the literature figures in the coverage index (vec2text, FHE, QKD attributions).

**Highest-leverage unblock:** the owner lifting the read-only gate (ship the proven-fix batch) and/or **wiring the 0014 harness into the live tiers — that single move closes X1**, the most-recurring blocked item across the whole corpus.

## The recurring honest theme (recorded — record-everything)
Every photonic/tri "game-changer" proposal oversold (O(1), `ntt_mul`, matrix-exp shortest-path, "3 parallel CPUs", quantum-erasure GC) — each audit **stripped the overclaim and kept the genuine kernel**. The real, proven wins are all **CPU-side / algebraic / fail-closed**: governance-as-min-fold, flat SoA AST, de-coloring the interpreter, ternary tombstoning, trust-trit path-authorization, and the degrade-to-DENY self-heal.

## See also
`logicn-memory-safety-model.md` · `logicn-tree-walker-speed-and-photonic-governance.md` · `logicn-prove-own-maths-roadmap.md` ·
`logicn-formal-verification-direction.md` (0024 Z3) · `logicn-tritmesh-meshql-shortest-path-parked.md` · `logicn-roadmap-autonomous-queue-2026-06-17.md` · the `_session-bridge/done/00NN-*.done.md` reports (authority).
