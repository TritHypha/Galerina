/**
 * decimal-arith.ts — the compiler-side name for the ONE canonical exact Decimal core.
 *
 * R6 (rounding audit F15/F16/F17, 2026-09-30): this file used to carry its own parser, formatter and
 * `roundDiv`; the WASM host carried a copy and stdlib Money a third, half-up-only variant with a laxer
 * parser. All three now use `@galerina/core-runtime-wasm`'s `decimal-core.ts` (dependency direction
 * compiler -> runtime-wasm). This module only re-exports it so existing imports keep one spelling.
 *
 * Semantics (frozen there): canonical text only; frozen limits (scale <= 100, <= 256 digits); no default
 * rounding (`decDiv`/`decQuantize` need an explicit RoundMode); `/0` is `DivisionByZero`; remainder is
 * truncated with the dividend's sign. Bare `/` and `%` on Decimal stay a compile-time refusal
 * (FUNGI-NUMERIC-OP-001) that redirects to `a.divide(b, scale, mode)` / `a.remainder(b)`.
 */
export {
  DEC_TRAP_KINDS, MONEY_TRAP_KINDS, MAX_DECIMAL_SCALE, MAX_DECIMAL_DIGITS, ROUND_MODES, HOST_MONEY_MINOR_UNITS,
  isRoundMode, isDecTrap, isExactTrapLabel, parseDec, isCanonicalDecimal, formatDec, checkRoundMode,
  decAdd, decSub, decMul, decNeg, decAbs, decCompare, decDiv, decRem, decQuantize, decRescaleExact,
  decScale, decFromInt, decIsZero, admitMoneyAmount,
} from "@galerina/core-runtime-wasm/dist/decimal-core.js";
export type {
  DecTrapKind, MoneyTrapKind, DecResult, DecCompare, RoundMode, Dec, DecParse, MoneyAmount,
} from "@galerina/core-runtime-wasm/dist/decimal-core.js";
