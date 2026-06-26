# Tree-walker speed + governance-as-T-MAC — measured R&D thread (2026-06-18)

> **Curated absorption** of the R&D `treewalker-speed/` thread (R&D repo: `TREE-WALKER-SPEED-RND.md`,
> `PHOTONIC-GOVERNANCE-TMAC-CONCEPT.md`, `PHOTONIC-CLAIMS-AUDIT.md`, `LINEAR-PIPELINE-FLATTEN-RND.md`,
> `PHASE-RESONANT-TRAVERSAL-AUDIT.md`; R&D commits `5eff026`·`c8a297d`·`8ebf7eb`·`acc135a`·`f52e37c`).
> **HUB-RE-VERIFIED 2026-06-18** — I re-ran all five benches myself (don't-trust-check; the headline numbers
> reproduce, exit 0, Node v24.16.0). This doc records what is **machine-proven** vs **literature-from-knowledge
> (ASSERTED)** vs **refuted hype**, per the record-everything + prove-own-maths postures.
> Companion (speculative levers, now backed by these measurements): [galerina-interpreter-speedup-and-json-rd.md](galerina-interpreter-speedup-and-json-rd.md).
> Continuation tasks queued in the R&D bridge: **0025–0030**.

---

## 1. The measured tree-walker lever ranking (machine-proven; model walker — relative deltas transfer, not absolute ns)

`treewalker-speed/walker-techniques-bench.mjs` — determinism-gated (all variants must compute the identical
result before timing). Re-run this session:

| Variant | ns/iter | vs async-baseline (A) | vs sync (B) |
|---|---:|---:|---:|
| A async+boxed+nameMap (= governed async walker) | 1554 | 1.00× | 0.14× |
| B sync+boxed+nameMap (= SyncInterpreter) | 210 | **7.38×** | 1.00× |
| C sync+unboxed (finish NaN-boxing) | 184 | 8.47× | **1.15×** |
| D sync+unboxed+slot-locals | 132 | 11.8× | 1.59× |
| E closure-compiled | 96 | 16.3× | 2.20× |
| F closure+specialized+const-fold | 39 | 39.8× | 5.39× |
| **G async-capable + sync per-node core** | **182** | **8.55×** | 1.16× |

**Two findings worth a paper (both reproduce):**
1. **The async/await-per-node tax is ~80% of the cost (7.4×)** — it dominates everything. This empirically
   validates Galerina's `SyncInterpreter` (Phase 27B) as the **#1 lever**; since its node coverage is partial,
   **finishing that coverage is the highest-ROI move**, ahead of anything exotic.
2. **Finishing NaN-boxing buys only ~1.15×** — far less than closure-compilation (2.2×) or slot-locals (1.6×).
   On V8 young-gen allocation is cheap; the **dispatch structure, not boxing, is the bottleneck**. A
   question-the-choice result: it demotes the "finish NaN-boxing" item.

**Ranked recs:** R1 finish `SyncInterpreter` coverage → R2 closure-compiled tier (carries hoisted governance
checks → stays fail-closed + 0014-deterministic) → R3 specialize/quicken → R4 slot-locals → R5 tagged-repr
(demoted by the measurement) → R6/R7 cheap wins. **Dismissed-and-recorded:** `eval()`-codegen (governance
policy), C-style float NaN-boxing (NaN collision), trace-JIT (determinism risk), computed-goto (N/A in JS).

## 2. async/await — the language-feature verdict (3 different things, don't conflate)

Galerina has **no user-facing async/await** — `async`/`await`/`yield` are in `V1_FUTURE_RESERVED` (lexer.ts:187-191),
reserved with no syntax/parser/semantics. Concurrency/effects are modelled by the **governed capability/effect
system**, not colored functions. The 7.4× tax is the **interpreter implementation** being async-colored
(every `.spore` program pays it, even a 100%-sync no-effect flow). **Variant G proves the converse:** an
interpreter that keeps the async signature (can still `await` at a real effect boundary) but runs a synchronous
per-node core = **182 ns ≈ sync, 8.5× faster than A** — so the tax is *coloring every node*, not the ability to suspend.

**Verdict:** *as a language feature* — don't add a colored one (Galerina is already on the correct colorless/effects
path; `async`/`await` stay harmlessly reserved). *As an implementation strategy* — **yes, de-color the hot path**
(extend `SyncInterpreter` to all flows; suspend only at the rare real effect boundary via the capability handler
— Galerina's "Io-as-a-parameter" analogue). Biggest measured win (7–9×), 0014-determinism-safe (G computed the
identical result), governance more explicit not less. **Zig context (grounded):** Zig removed async/await
(too coupled to stackless coroutines) and Zig 0.16 (~early 2026) reintroduces it **colorless** via an `Io`
parameter — Galerina already took that fork at the language level (capabilities are parameters, not a color), so
it's vindicated by and ahead of where Zig is going.

## 3. Governance-as-T-MAC — the genuine substrate game-changer (machine-proven, exact)

`treewalker-speed/governance-tmac-poc.mjs` — re-run this session: **decision-equivalence 200004/200004 flows
identical** (the walker's per-node Kleene-AND fold == the tower-citizen VPP's single `minTrit` reduction),
T-MAC weighted consensus **fail-closed HELD**. Sound because Kleene `min` is associative+commutative:
**governance is an associative ternary semiring reduction**, so it collapses from a per-node interleaved fold to
**one parallelisable substrate pass, audited once**.

- The tower-citizen VPP (`tpl-simulator.ts`) is a BitNet-faithful ternary T-MAC engine whose trit states ARE the
  governance lattice: REJECT/HOLD/COMMIT = DENY(−1)/INDETERMINATE(0)/ALLOW(+1). K3's operators already delegate
  to its gates: `vAnd=minTrit`, `vOr=maxTrit`, `vNot=negTrit`; `allOf/anyOf` are already semiring reductions
  (they just run scalar, per-node, in the walker today).
- **The method:** decouple governance from evaluation — the (de-colored) eval core emits a verdict trit-vector;
  the whole flow's decision is one `minTrit` reduction (fail-closed AND) or a `tmacVector` weighted consensus.
- **The win is mathematical, not a photonic speed claim:** governance becomes associative-semiring linear algebra
  (parallelisable, audit-collapsible, native to the substrate → photonic-HW-ready), proven decision-equivalent.
  The software deltas (3.4× / 1.7×) are **audit-collapse + batching, NOT photonics**. Real ternary-photonic
  latency is **HW-gated → EXCLUDED**. Consistent with the standing verdicts: offload **logic-reduction** (the
  substrate's strength), **never crypto** (its weakness). See [galerina-three-valued-governance.md](galerina-three-valued-governance.md).

## 4. Two CPU-side keepers from the proposal audits (measured, no photonics)

From `PHASE-RESONANT-TRAVERSAL-AUDIT.md` (re-run, all checks resolved):
- **Flat contiguous (SoA) AST — 2.22×.** A 2M-node tree as `Int32Array` (val/parent + CSR children) walks
  120.7 ms vs 267.7 ms for a pointer-chasing object graph — pure cache locality, no GC objects. A genuine new
  tree-walker lever alongside de-coloring/closures/slots; same `Int32Array` discipline the VPP already uses.
- **Constant-time governed traversal — a side-channel defence (not speed).** A branchy early-exit search swings
  **15.5×** by where it matches (a timing leak of tree shape / matched node / governance path); a branchless
  full-scan is 0.99× (timing-independent). Valuable for zero-trust governance — honestly a security trade
  (worst-case-always), not a speed win.

## 5. Refuted-hype ledger (computed, not asserted — the recurring overselling pattern)

Two AI proposals were audited with re-runnable artifacts; each had a real kernel under wrong framing:

| Claim | Verdict | The maths |
|---|---|---|
| branch co-evaluation ⇒ O(1) | **refuted** | eager all-paths = `2^(d+1)−1` work (7,710× at depth 16); breaks fail-closed. Salvage: latency-hide ~log₂(P) depth — bounded const, never O(1). |
| flatten ANY expression ⇒ one matrix | **refuted** | `multiply` is nonlinear (three zero-product points force any affine map to 0, but 1·1=1). Salvage: genuinely **linear** pipelines flatten exactly. |
| zero-cost quantum-erasure GC | **refuted** | Landauer: erase ≥ `kT ln2` > 0, irreducibly. Real = classical `mem.fill(0)` (0022/0023 zeroize). |
| AST as a dense ternary adjacency **tensor** | **refuted** | dense V×V is O(V²) (a tree has V−1 edges; 3,333× at V=10k). Locality instinct right, matrix framing wrong → §4 flat SoA. |
| visitor = `ntt_mul` convolution | **refuted** | grep: **no NTT/convolution anywhere in the substrate** — the `ntt_mul` intrinsic is fabricated; the real primitive is `tmacVector`; matching = a branchless predicate scan. |
| "oblivious O(1), same cycles for 10 vs 10,000 nodes" | **refuted** | matrix-power reachability ~O(V³) ≫ O(V); "same cycles" = pad to fixed dim + pay worst case = **constant-time-for-security, not O(1)-fast**. |
| homomorphism + SMT validation | **sound — already ours** | = the 0014 fidelity harness + the governance-T-MAC PoC + hub task 0024 (Z3). Fix: prove **exact** trit equality, not `‖·‖₂≤ε` (tolerance = the nondeterminism 0014 forbids). |

**Root cause (both proposals):** conflating **quantum** computing (superposition/Hilbert/"erasure") with the
tower-citizen's **classical ternary BitNet** substrate. The only real photonic win is **linear ternary
matrix-vector** (ANN/T-MAC) — i.e. §3 governance-as-T-MAC (offload the linear reduction, never control flow).

### Honest boundary on the linear-flatten salvage
`linear-pipeline-flatten-poc.mjs` (re-run): flattening linear runs is **mathematically exact** (7.1e-14) but
**software-negative at small N** (0.31× — a homogeneous matmul is more work than tiny direct affines) **and the
ternary substrate makes it 69% lossy** → ANN/tolerance regime only, never exact-numeric or decision flows; any
speed is HW-gated. Narrow but real. (Continuation: R&D task 0029.)

## See also
[galerina-interpreter-speedup-and-json-rd.md](galerina-interpreter-speedup-and-json-rd.md) (speculative levers, now measured here) ·
[galerina-three-valued-governance.md](galerina-three-valued-governance.md) (the K3 algebra governance-as-T-MAC reduces) ·
[galerina-substrate-failure-model.md](galerina-substrate-failure-model.md) · [galerina-formal-verification-direction.md](galerina-formal-verification-direction.md) (the SMT/exact-equality point) ·
R&D tasks 0025–0030 (`_session-bridge/tasks/`).
