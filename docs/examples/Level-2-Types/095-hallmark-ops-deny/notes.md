# 095 — Hallmark ops are deny-by-default (RD-0353, T3/T7)

A hallmark's `ops {}` schema is the **closed algebra** for that type. The vocabulary is
fixed — `{ add, subtract, scale, ratio, compare }` — and you *enable* the subset your type
supports. Anything you do not declare does not exist for that type:

```fungi
hallmark LoyaltyPoints of Decimal {
  ops:  { add, subtract, scale, compare }   // no ratio
  gate: flow assayPoints
}

let r = base / bonus   // FUNGI-HALLMARK-005 — 'ratio' is undeclared
```

Two guarantees follow:

- **A schema subtracts, never adds.** `ops {}` draws only from the closed algebra set — it
  can never name an effect (`shell`, `network`, …). Attempting to is `FUNGI-HALLMARK-004`.
  A schema cannot grant a capability.
- **Cross-type operations stay unrepresentable.** `LoyaltyPoints + Money<GBP>` and
  `LoyaltyPoints + CustomerRef` never unify (`FUNGI-TYPE-004`). A hallmark is nominal and
  shares no algebra with any other type.
