# RD-0136 — Galerina Playbook + Runbook (operational docs design)

- **Date:** 2026-06-26 · **Status:** ⏸ **DEFERRED (owner hold — do NOT action yet)**
- **ZT score:** 4/10 (R&D-direction soundness under the AZT honesty bar — 7–10 sound · 5–7 doable-with-care · 3–5 risky · 0–3 fail-open). Risky as-framed: the Runbook half leans on RD-0130-refuted hardware ops (CHERI silicon bootstrapping, photonic MZI recalibration, lane −1 isolation) — aspirational, not buildable. Only the governance/compliance Playbook + *software* degrade-only fallback is real; rises to ~7 if the doc is fenced to that buildable half.
- **Source:** `notes/74-playbook-runbook.md`

## Summary
Galerina should have **both** a Playbook (strategy/human) and a Runbook (ops/hardware), but they differ from
legacy DevOps guides because the language handles much of the chaos natively.
- **Playbook** (architects/security/CTO): substrate economic policies (when to offload to a tolerant lane + the
  crossover threshold N*), legal/compliance `intent{}` invariants per data type, capability-provisioning matrix
  (which teams hold which linear capability tokens), chaos-engineering via the K3 `0` state.
- **Runbook** (SRE/hardware ops): much SMALLER than a legacy runbook because Galerina proves the degrade-only
  fallback at build time (a dropped dependency → K3 `0` → native fallback lane, no human pager).

## ⚠ Honesty fence (apply RD-0130 before drafting)
The note frames the Runbook around **CHERI silicon bootstrapping, photonic MZI re-calibration, hardware lane
−1 isolation** — i.e. the **RD-0130-refuted hardware claims** (CHERI is not a Galerina compile target; photonic is
emulated, not real silicon). Treat as **aspirational positioning, not a buildable runbook**. The real, shippable
operational docs are the governance/compliance Playbook + the *software* fallback behaviour, not laser/CHERI ops.

## Status
DEFERRED. See [[galerina-rd-0130-frontier-domains-positioning]].
