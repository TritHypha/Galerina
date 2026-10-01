# 001 — pure flow

**Concept:** pure flow

A `pure flow` is deterministic and has no side effects. The compiler enforces
that no I/O, network, database, or effectful operations appear inside it.

`price.multiply(Decimal("0.20"), "halfEven")` scales a monetary amount by a factor; the product is rounded to the currency's minor units by the named mode (there is no default mode, so the bare `price * rate` is refused with FUNGI-NUMERIC-OP-002).

**AI rule:** Use `pure flow` for deterministic logic with no effects.
