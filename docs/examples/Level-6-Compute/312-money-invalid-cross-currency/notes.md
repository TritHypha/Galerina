# 312 — Money invalid cross-currency

**Concept:** adding Money values of different currencies is a type error

`Money<GBP>` and `Money<USD>` are distinct types. Adding them without an explicit currency conversion is a compile-time error (`SPORE-TYPE-004`). This prevents silent loss of financial precision due to implicit currency coercion.

**AI rule:** Never add or subtract `Money<C1>` and `Money<C2>` directly; convert to a common currency first.
