# Two disjoint trit brands: keeping a governance verdict out of arithmetic — a machine-checked authority-laundering closure

**Disclosure ID:** SP-RD-0510 (landed in `docs/paper/scientific-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-18 · **Type:** construction paper (prior-art disclosure — NOT a patent claim; a **shipped, tested** mechanism + its necessity proof) · **Provenance:** KB RD-0510 (the brand ruling) + the shipped brand in the governed runtime; runnable harness `ZTF-Knowledge-Bases/tools/verify-governance-algebra.mjs` SUITE 3 + SUITE 5 — part of **169/169** green (re-run + personally verified 2026-07-18, and again 2026-07-22); the brand's own `@ts-expect-error` type-guard + mint tests. **Honesty lock:** three-valued *classical* logic (Kleene K3), **not** a qubit/quantum claim.

## Purpose
A three-valued governance system encodes verdicts as `−1|0|1` (`DENY`/`INDETERMINATE`/`ALLOW`). But *arithmetic* over the same three symbols — a balanced-ternary `sum`/`xor`/`carry`/`add`/`mul`/`consensus` — is **also** `−1|0|1`, and those operations can **raise or flip** a value's sign. If a governance verdict and an arithmetic trit share one type, a verdict can be fed to an arithmetic operator that **changes its authority** (an `ALLOW` laundered out of a `DENY`, or the reverse). We disclose the closure: **two nominally-disjoint brands** — `Verdict` (governance) and `Trit` (arithmetic) — mutually non-assignable, so a verdict can never enter an arithmetic operator (or vice-versa), with the **necessity machine-checked**.

## The construction (shipped + machine-checked)
- **Two brands.** `Verdict` — the K3 value, produced/consumed only by the Kleene ops (`min`/`max`/`neg` → `vAnd`/`vOr`/`vNot`); `Trit` — the arithmetic value, produced/consumed by `sum`/`xor`/`carry`/`add`/`mul`/`consensus`. Structurally both are `−1|0|1`; **nominally disjoint** (an opaque brand on `Trit`; the literal-union `Verdict` is not assignable to it, and a branded `Trit` is not assignable to the union). Each has **one blessed validating mint** (parse-don't-cast); **no bare cast** bridges them.
- **Shared primitives stay internal.** `min`/`max`/`neg` are the math both families call — kept **unexported**; only the two branded faces are public, so nothing external can hand a verdict to a raw primitive.
- **Machine-checked NECESSITY (not decoration):** the arithmetic family is **truth-table-disjoint** from the Kleene family — an arithmetic op *can raise* a verdict (balanced-ternary `SUM` wraps `−1,−1 → +1`: a `DENY∘DENY` becomes `ALLOW`), so it is **not governance-safe** (SUITE 3); and a bare cast of a flipped reading *manufactures* `ALLOW` (SUITE 5). Meanwhile the Kleene family is **closed over the verdict lattice** (a `min`/`max`/`neg` of verdicts *is* a verdict). So the two families **provably cannot share a type** without a laundering path — the brand is required.

## Why this is safe to disclose (harm filter)
The laundering path is **closed by construction**: compile-time non-assignability, at a **zero-tolerance baseline** (no bare verdict/trit casts remain). The disclosed technique — feed a verdict to an arithmetic op — is a **fixed exposure**: it *cannot be performed* against the current system (it is a type error). The general principle (three-valued *arithmetic* can flip authority, so separate the algebras) is not specific to any deployment. This is a fixed-exposure + construction disclosure, the same class already cleared for publication.

## Prior art (novelty disclaimed)
Nominal types / newtype brands / phantom types (Haskell, Rust, TypeScript branded types) and Kleene K3 logic are established. **No novelty is claimed.** The disclosed *composition* — the `Verdict`/`Trit` two-brand separation with the **machine-checked truth-table-disjointness necessity proof** (arith raises verdicts; Kleene is closed) and the unexported-shared-primitive discipline — is recorded as prior art. Completes the trit-algebra trilogy with SP-RD-0439 (the K3 calculus) and SP-RD-0456 (the min-identity).

## Honest bound
A compile-time (type-level) separation: it closes the confusion at the type layer, and the harness verifies the **algebraic necessity** (disjointness + closure), not a running engine. K3 semantics are **byte-identical** before and after the brand (no runtime change; the governance-algebra harness is 169/169 either way).

## Declarations

- **Type / tier:** defensive-pub tier, eprint-shaped construction disclosure (harness-backed; a shipped mechanism + its machine-checked necessity proof; novelty disclaimed per §"Prior art") — not a flagship/workshop novelty claim; no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the KB brand ruling (RD-0510) and the named runnable harness suites.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** in-repo — `ZTF-Knowledge-Bases/tools/verify-governance-algebra.mjs` (SUITE 3 + SUITE 5, part of 169/169; re-run 2026-07-22) and the brand's compile-time `@ts-expect-error` pin tests in the product repository; no external data.
- **Licence:** Apache-2.0.

*Contact hello@trithypha.dev.*
