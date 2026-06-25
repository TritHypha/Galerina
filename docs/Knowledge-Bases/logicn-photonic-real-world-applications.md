# Beyond "maths in photonic" — what the photonic lane does in the real world, and which sectors use it

Owner asked: beyond the abstract "maths on the photonic lane," what does it *activate* in the real world, and
which sectors would use it (physics, weather, …)? This is the concrete, honest version.

## What the lane actually does (one thing, very well)
The photonic lane does **one** thing at high throughput and low energy: dense, **fixed-weight matrix×vector /
multiply-accumulate (MAC)**, by encoding numbers as light through a mesh of interferometers. It does **not** branch,
do crypto, or general-purpose compute. So "what it activates" = **any workload dominated by big dense linear
algebra with reused weights that tolerates small numerical noise** — *and* where the result must be trusted/audited.

## The sectors

| Sector | The MAC-heavy workload it accelerates |
|---|---|
| **AI / ML inference** (the #1 target) | transformer attention, CNN convolutions, embedding dot-products — all dense matmul (what Lightmatter / Lightelligence photonic chips target) |
| **Weather / climate** | dynamical cores + the ML surrogates (GraphCast / GenCast / NeuralGCM) are huge linear-algebra workloads |
| **Computational physics / chemistry** | PDE / FEM solvers, molecular-dynamics forces, quantum-chemistry integrals |
| **Signal processing / radar / telecom** | beamforming, MIMO, matched filtering — MAC-heavy *and* analog-native (photonics literally *is* signal processing) |
| **Computational finance** | Monte-Carlo risk, covariance matrices, portfolio optimization — and *regulated*, so it needs the governance |
| **Genomics / semantic search** | similarity / embedding search over huge corpora |

## The honest part — LogicN's value is trust, not speed
LogicN does **not** make photonics faster. It makes it **safe to use in a zero-trust / regulated setting.** You
offload the heavy MAC of a regulated workload to an untrusted fast substrate, and LogicN **guarantees** — via
[the self-check](logicn-photonic-maths-quality-self-check.md): Freivalds cheap-verify + No-Coercion + a signed
ToleranceWitness — that a *wrong analog result can never become a wrong decision*. So the sectors that need
*LogicN's* version most are the ones where the workload is MAC-heavy **and** the answer must be trusted:

> **Regulated medical-AI inference · financial risk under compliance · safety-critical engineering simulation ·
> defense signal processing.**

The split made literal ([untrusted-governed-lane.md](untrusted-governed-lane.md)): the **work** (the maths) runs
untrusted on the lane; the **decision** (is this result good enough?) stays in the exact digital core, behind a
verification cheaper than the work itself.

## Caveats held (the honesty bar)
- **Emulator-level / Rung-2 today** — `executedNatively=false` is stated honestly; there's no real photonic chip.
  The verify + witness + decider run CPU-side against a physics-faithful emulator; hardware stays TRACK-not-build
  (#102-106 gated).
- **Realized speedup is modest** (~1.91× batched, not the ideal 9.4×) — the cheap-verify is exactly what makes
  offload *safe even at modest speedup*. There is no O(1)/instant/free-lunch win (latency ≠ work).
- **Crypto + bit-exact determinism never go on the lane** (LLN-SUBSTRATE-001) — only value-carrying maths.

*Companion docs: [logicn-photonic-maths-quality-self-check.md](logicn-photonic-maths-quality-self-check.md) (how the
result is verified) · [logicn-substrate-worked-example.md](logicn-substrate-worked-example.md) (the `substrate {}`
flow) · [untrusted-governed-lane.md](untrusted-governed-lane.md) (the decision-vs-work split) ·
[logicn-hardware-future-substrates.md](logicn-hardware-future-substrates.md).*
