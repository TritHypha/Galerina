# Governance reference

The per-element detail pages behind the two born-governed overview docs
([`../contract-authoring-model.md`](../contract-authoring-model.md) — what the developer writes; and
[`../governance-automated-floor.md`](../governance-automated-floor.md) — what the runtime enforces). Every page
here is **source-verified**: each documents a vocabulary that resolves to a real registry/checker in
`galerina-core-compiler` or `galerina-tower-citizen`, and states its evidence tier honestly.

## Start here

- **[three-valued-logic-primer.md](three-valued-logic-primer.md)** — the one idea under everything: Galerina's
  decision logic is **three-valued (`-1`/`0`/`+1`), not boolean**; "unknown" is first-class and collapses to
  DENY. Read this first — every page below is this one trit, composed.

## The vocabularies a contract declares

- **[effects.md](effects.md)** — the `effects { domain.verb }` vocabulary: every canonical effect, its
  aliases and inference triggers, and the two deny-only effects (`eval.execute`, `memory.spill`).
- **[types.md](types.md)** — the typed-boundary vocabulary: built-in types (incl. `Bool` vs the 3-valued
  `Tri`), value-unit brands, and the sensitivity qualifiers.
- **[value-states.md](value-states.md)** — the boundary-data lattice (`Unsafe`→`Safe`→`Validated`, plus
  `Tainted`/`Secret`) and how a value earns the right to reach a governed sink.
- **[trust-trit.md](trust-trit.md)** — the epistemic trust-trit (RD-0337): the `PROVEN`/`UNKNOWN`/`REFUTED`
  status a *value* carries, and the audited transitions between them (`discharge`; `REFUTED` is sticky).
- **[hardening.md](hardening.md)** — the `hardening { … }` residency/erase/timing/substrate ceilings a value
  may carry (RD-0358), and what each denies.
- **[receipts.md](receipts.md)** — the Epilogue Receipt every governed flow emits, and the strategies that set
  its assurance level (`sha256_seal` shipped; `zk_snark_receipt` is a documented stub).

## The cost model

- **[cost-model-nesting.md](cost-model-nesting.md)** — what is "level 0" (the `flow` wrapper, the whole
  `contract` block, block nesting — all erased/lifted at compile time, evidenced by regenerated WAT) and what
  actually costs (flow calls today, loops as algorithm, host crossings). *Structure is free; safety text is
  free; declare the contraction.*

## The runtime error contract

- **[dss-wasm-runtime-errors.md](dss-wasm-runtime-errors.md)** — the stable `FUNGI-*` error codes a program
  hits at the WASM/wasmtime boundary (traps, fuel, admission `CRITICAL_SECURITY_VIOLATION`), and the rule that
  the DSS.wasm sidecar translates every raw engine error into one of them — so a `.fungi` program's error
  handling survives an engine upgrade (the `add_fuel`→`set_fuel` lesson). Compile-time + admission codes are
  live; the runtime trap-classification lands with DSS.wasm (`#102`).

## How to trust these pages

Each page ends with a **provenance line** naming the source file(s) it was verified against. A mechanical
check (the reference-doc verifier) confirms every canonical effect / hardening tier / value-state / trust
value is present and unfabricated, and the claim-hygiene gate (`scripts/audit-claim-hygiene.mjs`) holds these
docs to their evidence tier along with the rest of `docs/`.
