# 454 — Financial cross-currency invalid

**Concept:** adding Money<GBP> and Money<USD> without currency conversion is a type error

Currency types are not interchangeable. Adding `Money<GBP>` and `Money<USD>` directly would silently lose the exchange rate. The compiler rejects this with `SPORE-TYPE-004`. The correct pattern is to convert USD to GBP via an FX rate first: `FxService.convert(usd, to: GBP)`.

**AI rule:** Cross-currency addition is always a compile error; use an explicit FX conversion before adding.
