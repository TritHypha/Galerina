# 313 — Decimal precision

**Concept:** dividing Money by a Decimal value for precise splitting

`total.divideBy(n, "halfEven")` performs exact decimal division and rounds the share to pence by the named mode. An Int divisor is converted exactly (the same as `Decimal.fromInt(n)`); no floating-point value is ever involved.

**AI rule:** Use `Decimal` arithmetic for all monetary division to avoid floating-point rounding errors.
