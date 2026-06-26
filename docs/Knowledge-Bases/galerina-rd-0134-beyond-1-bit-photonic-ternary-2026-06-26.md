# RD-0134 — "Beyond 1-bit": photonic ternary {−1,0,+1} AI compute

- **Date:** 2026-06-26 · **Status:** ⏸ **DEFERRED (owner hold — do NOT action yet)**
- **ZT score:** 5/10 (R&D-direction soundness under the AZT honesty bar — 7–10 sound · 5–7 doable-with-care · 3–5 risky · 0–3 fail-open). ZT-positive core: the analog/photonic lane can only False-DENY, never False-ALLOW (fail-safe by construction). But the source's "millions-×/zero-electrical" claims are RD-0130-refuted overclaims that must be stripped, and it is hardware-gated/aspirational — sound only with the honesty fence applied.
- **Source:** `notes/70-beyond-1-bit.md` + `notes/71.beyond-1bit.md`

## Summary
Microsoft BitNet (marketed "1-bit", mathematically a **1.58-bit ternary** net using {−1,0,+1}) replaces power-hungry
fp16 matrix-multiplies with add/subtract. The R&D question: is there a **photonic / wavelength equivalent** of the
ternary state that does the same job for AI neural nets — i.e. let the physics of light perform the ternary MAC
rather than electronic logic gates. This sits in Galerina's existing **governed-chaos / tolerant compute-only lane**
framing (govern a precision-limited analog sub-kernel, decision stays bit-exact digital).

## ⚠ Honesty fence (apply RD-0130 before any positioning)
The source note carries **"millions of times faster / zero electrical computation"** style claims. Per RD-0130 these
must be stripped: optics is a **precision-limited (~8-bit) analog accelerator**, **latency ≠ work** (~1.9× emulated,
never "instant/free/O(1)"), and the analog lane can only **False-DENY, never False-ALLOW**. Ternary photonic compute
is a *governed substrate*, not a silicon product Galerina ships.

## Status
DEFERRED. Overlaps the shipped substrate model (`SPORE-SUBSTRATE-001..004`) + three-valued governance — verify-before-build
any claim. TritMesh-adjacent. See [[galerina-rd-0130-frontier-domains-positioning]] · [[galerina-substrate-failure-model]].
