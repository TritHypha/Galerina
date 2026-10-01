# 311 — Money VAT calculation

**Concept:** multiplying Money by a Decimal rate

`price.multiply(Decimal("0.20"), "halfEven")` produces `Money<GBP>`, rounded to pence by the named mode (the bare `*` is refused — there is no default rounding mode). Using `Decimal` (arbitrary-precision) rather than `Float` avoids floating-point rounding errors in financial calculations.

**AI rule:** Multiply `Money<C>` by `Decimal` to scale an amount; the result preserves the currency type.
