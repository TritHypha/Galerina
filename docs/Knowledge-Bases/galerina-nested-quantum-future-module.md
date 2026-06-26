# TODO (FUTURE / parked) — Nested quantum simulation as an optional Galerina app module

> **Status:** 🅿️ **PARKED — future-use only. NOT part of the main architecture. Do not build now.**
> Origin: R&D job 0010 (`Galerina-R-AND-D/_session-bridge/done/0010-nested-quantum-in-continuous-engine.done.md`).
> This is a backlog idea for a *future* use of Galerina as an app, captured so it isn't lost — not a current work item.

## Verdict (why it is parked, not built)

Running a quantum-state simulator (e.g. IBM `ffsim`) **nested inside** the continuous "photonic" engine is **net-negative** as a production architecture:

- **No speed win.** The continuous engine is a TypeScript/`Int32Array` *software simulator*, not real hardware. Nesting quantum amplitudes inside it adds an **emulation layer**; it does not remove one. The cost of a quantum state vector is `2ⁿ` complex amplitudes — that exponential wall is **substrate-invariant** (identical on silicon or on a *simulated* photonic substrate), so the wrapper cannot make it cheaper.
- **No extra isolation.** Every governance primitive a nested quantum sim would need **already ships and is tested** in `galerina-ext-bridge-quantum` (Tier-3 Toxic Border, 21 in-package tests): the subspace-dimension memory governor, the `LOAD→TRAP→ERASE` kill-switch, crypto-exclusion (`SPORE-SUBSTRATE-001`), hybrid Ed25519+ML-DSA-65 attestation, and tolerance-determinism with pinned artifacts.

**Production quantum work → use the shipped `galerina-ext-bridge-quantum` bridge.** Do not nest.

## The only future-use shape worth keeping

An **optional, OFF-BY-DEFAULT R&D / pedagogy module** — for *experimentation* (e.g. exploring continuous-state amplitude representations for a hypothetical future photonic substrate, or teaching), **never on any production path**. If a real future use of Galerina-as-an-app ever needs it, the gating is hub-specifiable over existing governance infra (no owner action to design):

- a new `package.spore.json` `kind` value (e.g. `rnd-experimental`),
- a `GALERINA_RND_QUANTUM_CONTINUOUS` opt-in flag (default off),
- a capability-bit assignment, and
- a **dev-only profile** (refused under `production`).

It would reuse the shipped bridge's governance envelope verbatim — the module would be a *thin pedagogy wrapper*, explicitly carrying no production guarantee.

## To-do (only if a real use-case emerges)

- [ ] Confirm a concrete future use-case exists (Galerina app needing in-process continuous-state quantum experimentation) — **do not build speculatively.**
- [ ] If so: ratify the four gating mechanisms above (hub), build the off-by-default module over the existing `galerina-ext-bridge-quantum` envelope, and keep it out of every production/certified profile.
- [ ] Otherwise: leave parked. The shipped Tier-3 bridge already covers all real quantum needs.

Cross-refs: `galerina-ext-bridge-quantum-design.md` (the shipped Tier-3 bridge), `galerina-roadmap-and-audit-2026-06-17.md` (R&D queue / 0010).
