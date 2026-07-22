# Dimensioned money, sourced scale, and the money/commodity partition — an executable value-unit algebra

**Disclosure ID:** SP-RD-0351 (landed in `docs/paper/scientific-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-18 · **Type:** construction paper (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0349 (value-unit types: money/commodity/crypto registry), RD-0350 (*"gold is not money"* — the adversarial case for the commodity/crypto generics), RD-0351 (*"the algebra decides — money/markets partition"*); runnable harness `verify-value-unit-algebra.mjs` (internal engineering KB) — **35/35 assertions green** (dependency-free; re-run and personally verified 2026-07-18, and again 2026-07-22). Honesty lock: the harness verifies the **algebra**; `Money<C>` ships in the Galerina type-checker, the `Commodity<T>` partition is the disclosed extension.

## Purpose
Money is not a number. Representing amounts as bare floats or fixed-2-decimal values silently (a) **corrupts** currencies whose minor-unit scale is not 2 (JPY = 0dp, BHD = 3dp, ETH = 18dp), (b) permits nonsensical **cross-currency** arithmetic, and (c) lets a **commodity** (gold, priced in troy ounces) be handled as if it were money. We disclose a uniform value-unit construction: every amount carries a dimension (unit + *sourced* scale); operations are defined only *within* a dimension; distinct value-kinds occupy **disjoint partitions**; and any unit mismatch is **deny-by-default** — with the algebra machine-checked.

## The construction (all machine-checked, 35/35)
- **Sourced scale, not fixed 2dp.** Each currency carries its minor-unit exponent *from a source* (JPY→0, USD/GBP→2, BHD→3, ETH→18). Checked: a fixed-2dp representation **over-scales** JPY and **truncates** BHD; ETH's 18dp requires exact **integer** minor units (arbitrary-precision), never a float.
- **Exact rationals for non-decimal units.** One troy ounce = 31.1034768 g is held as the exact rational **311034768 / 10⁷**, never a float — checked exact under repeated conversion (no rounding drift).
- **Disjoint partitions.** `Money<C>` and `Commodity<T>` are disjoint value-kinds: a money operation cannot take a commodity operand, and vice-versa; there is **no implicit bridge**. Checked: cross-partition operations are *rejected*, not coerced. (This is the machine-checked form of RD-0350's *"gold is not money."*)
- **Deny-by-default on mismatch.** Combining `Money<GBP>` with `Money<USD>`, or any unknown/mismatched unit, is **denied** unless an **explicit** conversion — carrying a policy and rate provenance — is applied. Checked: unit mismatch → deny, never a silent cast.

## The tie to governance
The value-unit deny-by-default is the **same min-fold discipline** as the K3 governance calculus (SP-RD-0439): an under-specified or mismatched dimension is the *third state* and acts as **deny at the operation boundary**. Dimensioned analysis and governance share one law — **never combine what you cannot prove commensurable.**

## Prior art (novelty disclaimed)
Units-of-measure type systems (F# units-of-measure, Frink, Fortran physical units), fixed-point money libraries, and the ISO-4217 minor-unit table are all established. **No novelty is claimed** over any of these. The disclosed *composition* — sourced-scale-per-currency defeating fixed-2dp corruption, exact-rational non-decimal units, the disjoint money/commodity partition with no implicit bridge, deny-by-default-on-mismatch tied to the K3 min-fold, and the machine-checked harness form — is recorded as prior art.

## Honest bound
The harness verifies the **algebra** (scale exactness, partition disjointness, deny-by-default), not a running settlement engine; `Money<C>` ships in the Galerina type-checker while the `Commodity<T>` partition is the disclosed extension (partially built). A conversion still requires a **trusted rate source** — the algebra guarantees you cannot mix *without* a conversion, not that any given rate is correct.

## Declarations

- **Type / tier:** defensive-pub tier, eprint-shaped construction disclosure (harness-backed; novelty disclaimed per §"Prior art") — not a flagship/workshop novelty claim; no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the cited KB R&D records (RD-0349/0350/0351) and the named runnable harness.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** re-runnable harness `verify-value-unit-algebra.mjs` in the internal engineering KB (dependency-free; 35/35 on re-run 2026-07-22); no external data.
- **Licence:** Apache-2.0.

*Contact hello@trithypha.dev.*
