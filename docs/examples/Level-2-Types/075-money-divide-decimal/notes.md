# 075 — Money divide Decimal

**Concept:** Money<GBP> divided by Decimal

Dividing a monetary amount by a Decimal divisor is valid. The result preserves the currency type. Use Decimal("...") for the divisor to maintain precision.

**AI rule:** Divide with `m.divideBy(Decimal("4"), "halfEven")`; it yields Money<GBP> rounded to the minor units by the named mode. The bare `/` is refused (FUNGI-NUMERIC-OP-002).
