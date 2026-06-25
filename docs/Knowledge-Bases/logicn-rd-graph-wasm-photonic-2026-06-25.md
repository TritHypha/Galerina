# R&D — Does a graph (GraphCast-inspired) help WASM / photonic / virtual-3D? + the WASM test methodology (2026-06-25)

Owner asked four things, framed by **GraphCast / GenCast / NeuralGCM** (DeepMind's GNN weather models that
predict in *seconds* what a numerical simulation takes *hours* to compute). Researched honestly via workflow
`wf_054a6a6f-edd` (4 web-grounded threads + an adversarial synthesis). **Headline: the graph idea helps in
exactly ONE of its two senses, and the split is clean.**

## The load-bearing distinction (apply it to every "graph" claim)

- **Graph-as-DATA-STRUCTURE** (call / dataflow / dependency / capability graph; tensor-network contraction
  order) — classical, **exact**, often already-built. Zero-trust-clean.
- **Graph-as-LEARNED-GNN-SURROGATE** (the literal GraphCast transplant — a trained, *approximate*,
  *probabilistic* model that predicts a computation's output). By **No-Coercion (`vAnd = min`)** an
  approximation can only ever be an **untrusted, Freivalds-verified lane that LOWERS a verdict — never
  carries one**. Identical status to the photonic MAC lane.

## Per-thread verdict

| Thread | Verdict | ZT | The real part |
|--------|---------|----|---------------|
| **WASM test methodology** | **BUILDABLE** | 93 | the differential currently shares `i64-arith.ts` between walker + WASM → proves walker≡WASM, **not** ≡spec; add an independent oracle + missing edges + fuzz + Stryker + bounded Z3 |
| **Graph in/with WASM (production)** | **MIXED** | 88 | (i) ship the existing boundary/dataflow/capability graph as the signed `.lmanifest` + a WASM custom-section digest = **attestation + admission legibility, ~85% shipped, real**. (ii) a learned GNN surrogate of execution = **do not build** |
| **Graph → photonic** | **REFUTE** | 88 | contraction-order / cross-kernel scheduling are exact + legit but **inapplicable** (single GEMM, single kernel); a GNN surrogate approximates an O(1)-exact closed form; the real lever is the **188:1 Freivalds verify** term, not any graph |
| **Graph → virtual-3D** | **REFUTE** | 88 | a single dense rank-3 contraction has **no path to optimize**; the real step is the **WDM-batched-MAC** emulator extension (amortise one DAC/ADC across W wavelengths) — batching, not graph |

## Would a graph with the WASM help production? — Yes, for *governance*, not speed

The honest yes: ship the **graph LogicN already computes** (boundary/dataflow/capability surface) as the
**signed `.lmanifest`** beside the `.wasm` (it ~85% does this — `manifest-generator.ts`, `proof-graph.ts`,
the `ExecutionSignature` governance-shape hash), so a host can make the admission decision **without parsing
the `.wasm` body** (the cosign / SLSA-in-toto / WASM-custom-section direction). That is an **attestation +
legibility** win — it changes how *cheaply and legibly* a host reaches the **same exact verdict**, not the
speed of the compute. The concrete buildable delta: bind the capability-surface + dependency digest into the
manifest as a first-class block + embed its digest in a WASM custom-section. **Do not** build a learned-graph
surrogate of execution (no training corpus; it would approximate verdicts LogicN already computes exactly and
O(1)-cheaply; it can only ever be an untrusted lane).

## Could a graph improve the photonic / virtual-3D benchmark? — No (honestly)

Both **REFUTE**. The photonic op is a single dense GEMM and virtual-3D is a single dense rank-3 contraction —
neither has a multi-tensor network with shared internal legs, so contraction-order / `opt_einsum` /
treewidth has **nothing to order**. A GraphCast-style surrogate would *approximate* a function that is
already exact and cheap, adding error + an attack surface. The honest ~1.91× photonic envelope is dominated
**188:1 by the Freivalds verify cost** — *no graph technique touches it*; the only real lever is verify cost
(e.g. amortising the `k≈20` probes across a WDM batch). The real virtual-3D step remains the **WDM-batched-MAC
emulator extension** (a throughput experiment, batching — not a graph).

## The WASM test methodology — the gold-standard ladder (the highest-value action)

The session's `wat-i64-differential.test.mjs` is a correct differential, but **both tiers import
`i64-arith.ts` / `numeric-lowering.ts`**, so a *shared-reference* bug is correlated and invisible — it proves
**agreement, not spec-conformance**. The ladder, cheapest-first:

1. **Edge cases (DONE 2026-06-25):** added negative-i32→i64 sign-ext (the `extend_i32_s` sign bug was
   invisible — `addWiden` was positive-only), `I64_MIN − 1` underflow, mul-to-≈−2⁶³ both signs, `÷0`,
   `−(I64_MIN)`, alongside the existing `I64_MIN/−1` div-trap vs `%`-0.
2. **Independent oracle (NEXT):** derive the expected value from inline `BigInt.asIntN(64)` + the WASM i64
   spec trap rules, **not** routed through `i64-arith.ts`; optionally cross-run `wabt wasm-interp` for engine
   independence. (The current hardcoded expects are already hand-derived from the spec — this makes the
   oracle explicit + reusable.)
3. **Property/structured fuzzing:** `fast-check` over op-templates with shrinking (the EMI/Csmith analogue),
   then a small grammar of nested Int64 flows. **Do NOT** build a full Csmith-grade `.lln` generator yet.
4. **Mutation testing:** Stryker over `wat-emitter.ts` + `i64-arith.ts` — a surviving mutant marks a hole.
5. **Bounded Z3 QF-BV proof:** each emitted i64 op as bit-vectors vs the spec → universal coverage of the
   corners (mirrors the i32-conformance plan). Complements, does not supplant, the differential.

**Never** put a learned/GNN component in the oracle — i64 conformance is exact, deterministic, fail-closed;
the opposite of an approximation. A learned input-*generator* is at most an untrusted lane *proposing* inputs,
still adjudicated by the exact oracle (it can only surface a counterexample, never vouch).

## The hard honesty line

- A learned/GNN graph surrogate can **never** carry a verdict or admission decision (No-Coercion) — untrusted,
  verdict-lowering lane only, same as the photonic MAC.
- **No "seconds-not-hours" GraphCast speed story on the LogicN core.** GraphCast's win is replacing an
  *expensive simulation*; LogicN's verdicts/crypto/photonic-decision are already exact + O(1)-cheap.
- Shipping the graph as signed metadata is a **governance/attestation** win, not a speed claim — say so plainly.
- Crypto stays binary; the core stays exact, deterministic, fail-closed.

*Source: workflow `wf_054a6a6f-edd` (2026-06-25). Tests #1 acted on in `wat-i64-differential.test.mjs`; the
graph-as-`.lmanifest` build delta is TRACK; photonic/virtual-3D graph layers are REFUTE; the WDM-batched-MAC
emulator extension remains the honest photonic next step.*
