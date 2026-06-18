# MeshQL wavefront shortest-path — R&D verdict, PARKED for TritMesh R&D (2026-06-18)

> **Scope / boundary:** MeshQL graph queries are a **TritMesh PRODUCT feature** (TritMesh consumes LogicN;
> MeshQL/ANN/HNSW are TritMesh-owned per `logicn-tritmesh-boundary-and-seam.md`). This note records LogicN's
> **R&D verdict** on an owner-posted "Photonic Wavefront Exponentiation" / Dijkstra-replacement proposal so it
> isn't lost — but the graph algorithm itself is **TritMesh's to build**, not a LogicN build. **PARKED: pick up
> in TritMesh R&D.** LogicN's only role here is the **governance / authorization layer** (the seam).
>
> Verdict source: hub adjudication + the 0035 gov-lens (`w64nco3em`) + `0026` (tropical semiring, K3 ≠ +/× T-MAC).
> Don't-trust-check: claims below are computed/grounded, not asserted.

## Refuted claims (the proposal's overselling — same pattern as the phase-resonant / photonic-claims audits)
- **`ntt_mul` wavefront traversal** — fabricated: `ntt_mul` appears in **zero source files** (real op is `tmacVector`). And NTT (number-theoretic transform) accelerates *polynomial/integer convolution* — it has **nothing to do with graph shortest-path**. Double category error.
- **"O(1) oblivious, all paths in one sweep" / matrix exponentiation** — matrix-power reachability is **O(V³)** (Floyd–Warshall / algebraic-path), not O(1). "Oblivious / constant-time" is a **security** property (pad to worst case), **not** O(1) speed.
- **Ternary `{-1,0,+1}` as shortest-path edge costs — wrong algebra (the load-bearing error).** Shortest-path is optimization over the **min-plus / tropical semiring** (⊗ = +, ⊕ = min) with *ordered, additive* costs ("road costs 5 vs 10"). The K3/BitNet T-MAC computes **affinity** (a dot-product-like accumulation); "constructive interference = shortest" **conflates affinity with distance**. Over the K3 lattice the matrix powers compute **reachability / authorization-within-k-hops**, *not* minimum-cost routes — a different problem. `0026` proved K3 ≠ the +/× T-MAC semiring; min-plus matmul also has no FFT-style speedup, so the "fast transform" framing is unsound.
- **"WASM enclaves"** — WASM is not an enclave; and the intra-module memory-safety gap is open (task 0033).

## The honest kernel (what's real — for TritMesh R&D, when it happens)
The query splits cleanly into **two layers** that must not be conflated:
1. **Governance / admissibility (LogicN's job — already designed):** which nodes/edges a caller is *authorized* to traverse. This is the **trust-trit path-authorization fold + the mtrit mask** (LogicN R&D task **0035**): a path's authorization = `allOf` (min-dominance Kleene-AND) over the trits on it; one `0`/`−1` node sinks the path to deny; masking a node to `0`/`−1` removes it from the **authorized adjacency view** (non-leaky — never reveal the masked node). K3 gates *admissibility*, fail-closed.
2. **The actual shortest path (TritMesh's job):** a **conventional min-plus / Dijkstra router over the AUTHORIZED subgraph** — layered *above* LogicN's K3 gate. This is real, well-understood graph computation; it is **not** the K3 fold and **not** O(1). TritMesh builds it; LogicN supplies the governance seam.

**The Pipe-3 "0 bridge node in a path" answer (grounded):** the requested path is **denied** (min-dominance); to be helpful, recompute over the authorized subgraph with the masked node removed → return an authorized alternate or "no authorized path"; **never** reveal that a masked node was the blocker (that's a topology-enumeration oracle).

## Parking note
When TritMesh R&D starts on MeshQL routing: (a) build the min-plus/Dijkstra router as a TritMesh component over the authorized subgraph; (b) consume LogicN's 0035 governance gate (trust-trit path-fold + mtrit mask) as the admissibility seam; (c) carry NONE of the refuted framing (ntt_mul / O(1) / matrix-exp-shortest-path / ternary-as-cost). No perf claim without a bench + named machine; photonic HW EXCLUDED (software ternary sim only).

## See also
`logicn-tritmesh-boundary-and-seam.md` (the LogicN↔TritMesh seam; MeshQL is TritMesh-owned) ·
R&D task **0035** (the governance-grid path-authorization + mtrit mask LogicN provides) ·
`logicn-tree-walker-speed-and-photonic-governance.md` §5 (the refuted-hype ledger incl. `ntt_mul`-fabricated) ·
`logicn-three-valued-governance.md` (the K3 algebra) · R&D `0026` (tropical semiring; K3 ≠ +/× T-MAC).
