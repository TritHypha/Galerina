# RD-0144..0149 — "Automate the defence" in Governed Chaos & Multi-Substrate

**Source.** Owner notes `notes/75-improvments-r-d-7..12.md` (2026-06-27) — the second half of the "automate the
defence" series, covering the *Governed Chaos & Multi-Substrate* capability area. Same three-layer pattern as
[[galerina-rd-0138-0143-photonic-security-automation]] (Tower-Citizen + Tri-Pipe K3 + Photonic Tri-Logic).

**Hub disposition.** Numbered + ZT-scored + proven/disproven on absorption. Proof:
`scripts/rd-0144-0149-governed-chaos-suite-proof.mjs` — **6/6 V GREEN, 4 excluded, 1 duplicate noted.** Deep
per-claim matrix handed to the encryption R&D worker.

> ⚠️ **RD-0148 (note `75-improvments-r-d-11`) is a BYTE-IDENTICAL duplicate of RD-0147 (note `…-10`, Fault-Healing)**
> — confirmed by `diff`. No separate verdict; owner may delete note 11.

## Per-note verdicts

| RD | Note | Topic | ZT | Verdict |
|---|---|---|---|---|
| 0144 | 7 | **Degrade-Only** | **6** | Survival-Contract auto-degrade (32-bit→4-bit on power drop) ✅ re-derives `substrate{}` + DRCM degrade-only operand (degrade-to-lower-fidelity is the *safe* direction); elastic backpressure ✅ shipped; **"Spectral Shredding" (cut WDM colours → shrink model in 0 cycles) ❌** (X1 architecture-false + 0-cycle) |
| 0145 | 8 | **Substrate-Switch** | **5** | intent-driven partition (secure-DB→CHERI, neural→photonic) ✅ re-derives PartitionDecider/compiler-intelligence; fluid mid-compute blend ⚠️ = the hybrid switch but MUST be deterministic + Safe-Floor (V2); **phase-encoded waveguide routing AS the switch ❌** (No-Coercion: analog phase can't be the trusted control) |
| 0146 | 9 | **Verified-Approx** | **6** | mathematical bound invariants (veto if breached) ✅ re-derives `invariant{ensure}` DbC + `substrate{}` tolerance; Freivalds Lane-0 correction ✅ shipped; **K3-0-as-"acceptable fuzzy math, proceed" ⚠️** is availability-not-safety only (V1 — `authorize(0)=false`); fuzzy-analog 100×/90% = aspirational (X2) |
| 0147 | 10 | **Fault-Healing** | **5** | telemetry mesh + NMR/redundancy ✅ shipped; predictive pre-emptive hot-swap = aspirational (live supervisor, DRCM Ph5, X3); **passive optical self-reverse "heals at 0 energy/0 cycles" ❌** (latency≠work) |
| 0148 | 11 | *(duplicate of 0147)* | — | byte-identical to note 10 — delete candidate |
| 0149 | 12 | **AI-Proposal-Safety** | **6** | abstract interpretation + K3 counter-proof to the AI ✅ re-derives the shipped checkers + `governAiProposal` (No-Coercion: AI can't lift the verdict); **shadow-sandbox forking LIVE traffic = genuine net-new lead, BUT a data-exposure hazard** → MUST run behind the note-54 border (V3) + attenuated caps; optical non-interference parallel = aspirational (X2) |

## What's proved (V1–V3)
- **V1 — K3-0 = availability, not safety.** A substrate-noise `0` (INDETERMINATE) must NOT authorize (`authorize(0)=false`);
  folded via `vAnd` it can only DOWNGRADE a verdict. So note 9's "treat 0 as acceptable approximation and proceed"
  is fail-open in a *safety* decision — sound only in the *availability* lane (the shipped substrate-model rule).
- **V2 — Substrate-blend / degrade Safe-Floor.** A hybrid/degraded result is admissible only if VERIFIED; otherwise
  it falls back to the bit-exact Binary result. Over 50 inputs, a wrong/unverified hybrid never escapes — the
  shipped hybrid-switch Safe-Floor Theorem (RD-0117), applied to notes 7/8's "60% photonic / 40% digital".
- **V3 — Shadow-sandbox behind the note-54 border.** Note 12's "fork live production traffic to an AI proposal"
  leaks foreign rows WITHOUT a data-plane border; routed through `intersectUserScope` (shipped this session as D)
  it is contained. The net-new lead = shadow/canary deploy of AI proposals **behind the note-54 border + attenuated
  capability tokens + Freivalds verify + the Lane-0 declassifier rail** — all shipped/known pieces, composed.

## Net-new + cross-cutting (owner-gated)
1. **Shadow/canary deploy rail for AI proposals** — the one genuinely new mechanism in the batch (note 12). Compose
   the note-54 border (D, shipped) + attenuated caps + Freivalds + the RD-0138-0143 Lane-0 declassifier rail. Design-only.
2. Reinforces the RD-0138-0143 cross-cutting finding: every "Lane 0 = continue" framing (blend / correct / shunt /
   shadow / fuzzy-proceed) is sound ONLY as an explicit, audited declassifier or as availability-degrade — never a
   silent safety bypass.

## Guardrails held
Crypto stays Binary. Photonic = degrade-only operand UNDER the digital gate (phase can't be the control — V1).
Degrade-to-lower-fidelity is the *safe* direction and genuinely Galerina's strength; "0-cycle / 0-energy /
spectral-shred / phase-as-switch" are the refuted overclaims. No perf claim without a named-machine bench (X2).
