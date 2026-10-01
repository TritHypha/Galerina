# 074 — Money times Decimal

**Concept:** Money<GBP> multiplied by Decimal

Scaling a monetary amount by a Decimal factor is valid. The result preserves the currency type. This is the correct way to calculate percentages or ratios of monetary amounts.

**AI rule:** Scale Money<GBP> by a Decimal with `m.multiply(rate, "halfEven")`; the bare `*` is refused (FUNGI-NUMERIC-OP-002 — there is no default rounding mode).
