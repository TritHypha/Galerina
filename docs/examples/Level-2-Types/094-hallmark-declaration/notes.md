# 094 — Hallmark declaration (RD-0353)

A **hallmark** is a developer-minted nominal type: a name, a carrier type, and a
mandatory *assay* gate. The declaration IS the mint — no separate registration, and a
bare use of an undeclared name is rejected (no use-equals-create).

```fungi
hallmark CustomerRef of String {
  gate: flow assayCustomerRef        // the assay — parse-don't-validate, must be able to fail
}

hallmark LoyaltyPoints of Decimal {
  decimals: 0
  sign:     non-negative
  ops:      { add, subtract, scale, compare }   // the CLOSED algebra for this type
  gate:     flow assayPoints
}
```

The metaphor is Britain's assay office — ~700 years of *don't trust the dealer, verify at
the assay, strike a protected mark, prosecute counterfeits*:

| Hallmarking | This system |
|---|---|
| the assay office | the compiler |
| the assay (must be able to fail) | the mandatory gate + the redness test |
| the struck mark, travelling with the metal | the schema (pinned across packages under B4, owner-gated) |
| protected marks | the reserved-name gate (`FUNGI-HALLMARK-001`) + non-ASCII refusal |
| fineness standards (925, 999.9) | the schema — decimals · sign · ops |
| no hallmark → not sellable as sterling | no gate → not a hallmark (`FUNGI-HALLMARK-003`) |

**Reused machinery:** construction-only is `FUNGI-TYPE-003` (a hallmark is a *declared*
branded type); cross-type non-unification is `FUNGI-TYPE-004`; declare-or-reject is
`FUNGI-TYPE-001`. The hallmark-specific gates are `FUNGI-HALLMARK-001..005`.

See also: 095 (ops deny-by-default), 096 (reserved names), 097 (construction only through
the gate), 098 (minting is taint-transparent).
