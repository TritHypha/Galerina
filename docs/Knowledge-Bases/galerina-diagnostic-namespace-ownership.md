# Galerina — Diagnostic Namespace Ownership (a checked invariant)

**Status:** convention + enforcement (2026-06-16). **Why:** with ~180 emitted `SPORE-*` codes across ~20
categories, a *documentation* convention drifts — codes get emitted but never registered, or a registry entry
goes stale. This turns the convention into a **machine-checked invariant**. Cross-ref:
[[galerina-design-stability-and-forward-planning]] §5, [[galerina-governance-rules]].

## 1. One canonical registry
`docs/Knowledge-Bases/compiler-diagnostics.md` is the **canonical** diagnostic registry (every `SPORE-*` code).
`galerina-governance-rules.md` is the **governance subset** (the rules with enforce-status), not the full list.
A code is "registered" iff it appears in `compiler-diagnostics.md`.

## 2. The checked invariant (the anti-drift mechanism)
A conformance test (`galerina-core-compiler/tests/diagnostic-namespace.test.mjs`) asserts:

> **Every `SPORE-*` code emitted in the compiler source (`code: "SPORE-..."` literals) is registered in
> `compiler-diagnostics.md`, OR is on the explicit `PENDING_REGISTRATION` allowlist.**

- A **new** unregistered code → the test fails. You must register it (or, temporarily, add it to the allowlist
  with a reason). This is what makes ownership *checked*, not merely documented.
- The `PENDING_REGISTRATION` allowlist is the **baseline backlog** captured at adoption (the codes already
  emitted-but-unregistered as of 2026-06-16). **Policy: it may only SHRINK.** Reconcile entries by writing the
  registry entry and removing them from the allowlist — never grow it for convenience.

## 3. Ownership rules (per code)
- **Reserved family prefix + owner.** Each family (`SPORE-SECRET-*`, `SPORE-PRIVACY-*`, `SPORE-CRYPTO-*`,
  `SPORE-SUBSTRATE-*`, `SPORE-EFFECT-*`, `SPORE-VALUESTATE-*`, …) has a documented meaning in the registry.
- **Mechanism tag.** Each code states its mechanism so same-family codes can't blur:
  `declarative-clause | dataflow-taint | effect-check | substrate-inference | type-check | runtime-trap |
  governance-verifier`. (This is exactly what distinguishes `SPORE-PRIVACY-001` *declarative-clause* from
  `SPORE-PRIVACY-002` *dataflow-taint*.)
- **Numbering.** Next free number within a family; **never reuse a retired number** (e.g. `SPORE-TYPE-021` was
  retired in favour of `SPORE-TYPE-023` — do not recycle 021).

## 4. How to add a diagnostic (the workflow)
1. Pick the family + next free number; choose the mechanism tag.
2. Emit `code: "SPORE-FAMILY-NNN"` in the source.
3. Add the registry entry to `compiler-diagnostics.md` (and, if it's a governance rule, to
   `governance-rules.md` with enforce-status).
4. The conformance test passes because the code is now registered — no allowlist entry needed.

## 5. Baseline (2026-06-16)
180 emitted codes; 87 not yet in `compiler-diagnostics.md` at adoption → captured in `PENDING_REGISTRATION`.
This session's new codes (`SPORE-CRYPTO-PQ-001`, …) are reconciled into the registry, not left on the allowlist.
The backlog is now visible and shrink-only.
