# 319 — Money * Decimal

`m.multiply(rate, "halfEven")` produces Money<C>. This is the correct pattern for rates, VAT, and percentage calculations. The arithmetic is exact (BigInt decimal core, no parseFloat); only the final rounding to the minor units uses the named mode, and there is no default mode — the bare `Money<C> * Decimal` is refused (FUNGI-NUMERIC-OP-002).
