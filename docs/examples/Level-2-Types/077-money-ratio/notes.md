# 077 — Money ratio

**Concept:** Money<GBP> / Money<GBP> yields Decimal — written `a.divideBy(b, scale, mode)`, since a ratio must be rounded to a named scale by a named mode (the bare `/` is refused, FUNGI-NUMERIC-OP-002)

Dividing a monetary amount by another monetary amount of the same currency yields a dimensionless Decimal ratio. This is valid because the currency units cancel out.

**AI rule:** Dividing Money<GBP> by Money<GBP> produces a dimensionless Decimal ratio.
