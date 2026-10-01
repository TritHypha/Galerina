/**
 * decimal-core.ts — the ONE canonical exact base-10 Decimal core (R6, rounding audit F15/F16/F17).
 *
 * Every Galerina tier uses this module and nothing else for Decimal and Money amounts:
 *   - the compiler's tree-walker (via `galerina-core-compiler/src/decimal-arith.ts`, a re-export shim),
 *   - stdlib Money (`galerina-core-compiler/src/stdlib.ts`),
 *   - the WASM host runtime (`./wasm-runtime.ts`, the `__decimal_*` / `__money_*` imports).
 * It lives in the border-safe runtime package because the dependency direction is compiler -> here.
 *
 * Rules (zero-trust defaults, 2026-09-30; owner may revisit):
 *   - Canonical text only: `-?(0|[1-9][0-9]*)(\.[0-9]+)?`. No `+`, no leading/trailing `.`, no leading
 *     zeros, no exponent, no `_`, no whitespace, no hex. Anything else is `MalformedDecimal`.
 *   - Frozen limits: at most MAX_DECIMAL_SCALE fractional digits and MAX_DECIMAL_DIGITS digits of
 *     unscaled magnitude, on every input AND every result. Over the limit is `DecimalLimitExceeded`.
 *   - No default rounding. Division and quantization take an explicit RoundMode; a missing mode is
 *     `MissingRoundMode`, an unknown one is `UnknownRoundMode`. A scale outside 0..MAX is `ScaleOutOfRange`.
 *   - Division / remainder by zero is `DivisionByZero` (the same label as the i32/i64 checked traps).
 *   - No implicit coercion: a Float never becomes a Decimal (`InexactOperandRefused`); Decimal op Int/Float
 *     is `MixedDecimalOperand`; an Int enters only through the exact `Decimal.fromInt`. Bare `/` and `%` on
 *     Decimal are `PartialDecimalOperator` (use `divide(b, scale, mode)` / `remainder(b)`).
 *   - Remainder is TRUNCATED: `a rem b = a - trunc(a/b)*b`, the sign follows the dividend, and the
 *     result scale is max(scale(a), scale(b)). `-7 rem 3 = -1`, `7 rem -3 = 1`.
 *   - Every function returns a defined result: a canonical string / number, or a named trap label.
 */

export type DecTrapKind =
  | "MalformedDecimal"
  | "DivisionByZero"
  | "ScaleOutOfRange"
  | "UnknownRoundMode"
  | "MissingRoundMode"
  | "DecimalLimitExceeded"
  | "UnknownDecimalHandle"
  | "InexactOperandRefused"
  | "DecimalOperandRequired"
  | "PartialDecimalOperator"
  | "MixedDecimalOperand"
  | "UnsupportedDecimalMethod"
  | "WrongArity";

/** The frozen trap vocabulary. The interpreter, stdlib and host emit these exact strings. */
export const DEC_TRAP_KINDS: readonly DecTrapKind[] = [
  "MalformedDecimal", "DivisionByZero", "ScaleOutOfRange", "UnknownRoundMode",
  "MissingRoundMode", "DecimalLimitExceeded", "UnknownDecimalHandle",
  "InexactOperandRefused", "DecimalOperandRequired", "PartialDecimalOperator",
  "MixedDecimalOperand", "UnsupportedDecimalMethod", "WrongArity",
];

/** Money traps (R11). Same failure model as Decimal: a named, propagating trap, never a default. */
export type MoneyTrapKind =
  | "MalformedMoneyAmount"
  | "MoneyScaleExceedsMinorUnits"
  | "CurrencyMismatch"
  | "UnknownCurrency"
  | "MoneyOperandNotExact"
  | "UnknownMoneyHandle";

export const MONEY_TRAP_KINDS: readonly MoneyTrapKind[] = [
  "MalformedMoneyAmount", "MoneyScaleExceedsMinorUnits", "CurrencyMismatch",
  "UnknownCurrency", "MoneyOperandNotExact", "UnknownMoneyHandle",
];

export type DecResult = string | DecTrapKind;
export type DecCompare = -1 | 0 | 1 | DecTrapKind;

/** Frozen Decimal limits (C02 "rounding and limit rules"). */
export const MAX_DECIMAL_SCALE = 100;
export const MAX_DECIMAL_DIGITS = 256;

export type RoundMode =
  | "halfEven" | "halfUp" | "halfDown"
  | "up" | "down" | "ceiling" | "floor";

/** The frozen RoundMode set. A drift test pins this against both `decimal-round-mode.fungi` copies. */
export const ROUND_MODES: readonly RoundMode[] = [
  "halfEven", "halfUp", "halfDown", "up", "down", "ceiling", "floor",
];

const ROUND_MODE_SET: ReadonlySet<string> = new Set<string>(ROUND_MODES);
const TRAP_SET: ReadonlySet<string> = new Set<string>([...DEC_TRAP_KINDS, ...MONEY_TRAP_KINDS]);

export function isRoundMode(s: string): s is RoundMode {
  return ROUND_MODE_SET.has(s);
}

export function isDecTrap(r: DecResult | DecCompare): r is DecTrapKind {
  return typeof r === "string" && TRAP_SET.has(r);
}

/** True for every Decimal or Money trap label (used by tiers to propagate the trap). */
export function isExactTrapLabel(s: string): boolean {
  return TRAP_SET.has(s);
}

export interface Dec { readonly unscaled: bigint; readonly scale: number; }

export type DecParse =
  | { readonly ok: true; readonly dec: Dec }
  | { readonly ok: false; readonly trap: DecTrapKind };

const CANONICAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const TEN = 10n;
const pow10 = (n: number): bigint => TEN ** BigInt(n);

function magnitudeDigits(u: bigint): number {
  return (u < 0n ? -u : u).toString().length;
}

function checkLimits(dec: Dec): DecParse {
  if (dec.scale > MAX_DECIMAL_SCALE) return { ok: false, trap: "DecimalLimitExceeded" };
  if (magnitudeDigits(dec.unscaled) > MAX_DECIMAL_DIGITS) return { ok: false, trap: "DecimalLimitExceeded" };
  return { ok: true, dec };
}

/** Parse canonical decimal text. Non-canonical text is `MalformedDecimal`; over-limit is `DecimalLimitExceeded`. */
export function parseDec(text: string): DecParse {
  if (typeof text !== "string") return { ok: false, trap: "MalformedDecimal" };
  const m = CANONICAL.exec(text);
  if (m === null) return { ok: false, trap: "MalformedDecimal" };
  const neg = m[1] === "-";
  const intPart = m[2] ?? "0";
  const fracPart = m[3] ?? "";
  if (fracPart.length > MAX_DECIMAL_SCALE) return { ok: false, trap: "DecimalLimitExceeded" };
  if (intPart.length + fracPart.length > MAX_DECIMAL_DIGITS + 1) return { ok: false, trap: "DecimalLimitExceeded" };
  const mag = BigInt(intPart + fracPart);
  return checkLimits({ unscaled: neg ? -mag : mag, scale: fracPart.length });
}

/** True iff `text` is canonical decimal text inside the frozen limits. */
export function isCanonicalDecimal(text: string): boolean {
  return parseDec(text).ok;
}

/** Format (unscaled, scale) to canonical text. The scale is preserved (no stripping); -0 prints as 0. */
export function formatDec(dec: Dec): string {
  const neg = dec.unscaled < 0n;
  let digits = (neg ? -dec.unscaled : dec.unscaled).toString();
  if (dec.scale === 0) return (neg ? "-" : "") + digits;
  while (digits.length <= dec.scale) digits = "0" + digits;
  const cut = digits.length - dec.scale;
  return (neg ? "-" : "") + digits.slice(0, cut) + "." + digits.slice(cut);
}

function finish(dec: Dec): DecResult {
  const checked = checkLimits(dec);
  return checked.ok ? formatDec(checked.dec) : checked.trap;
}

function align(a: Dec, b: Dec): { ua: bigint; ub: bigint; scale: number } {
  const scale = Math.max(a.scale, b.scale);
  return { ua: a.unscaled * pow10(scale - a.scale), ub: b.unscaled * pow10(scale - b.scale), scale };
}

type Pair = { readonly ok: true; readonly a: Dec; readonly b: Dec } | { readonly ok: false; readonly trap: DecTrapKind };

function parsePair(a: string, b: string): Pair {
  const pa = parseDec(a);
  if (!pa.ok) return { ok: false, trap: pa.trap };
  const pb = parseDec(b);
  if (!pb.ok) return { ok: false, trap: pb.trap };
  return { ok: true, a: pa.dec, b: pb.dec };
}

export function decAdd(a: string, b: string): DecResult {
  const p = parsePair(a, b);
  if (!p.ok) return p.trap;
  const { ua, ub, scale } = align(p.a, p.b);
  return finish({ unscaled: ua + ub, scale });
}

export function decSub(a: string, b: string): DecResult {
  const p = parsePair(a, b);
  if (!p.ok) return p.trap;
  const { ua, ub, scale } = align(p.a, p.b);
  return finish({ unscaled: ua - ub, scale });
}

export function decMul(a: string, b: string): DecResult {
  const p = parsePair(a, b);
  if (!p.ok) return p.trap;
  return finish({ unscaled: p.a.unscaled * p.b.unscaled, scale: p.a.scale + p.b.scale });
}

export function decNeg(a: string): DecResult {
  const pa = parseDec(a);
  if (!pa.ok) return pa.trap;
  return finish({ unscaled: -pa.dec.unscaled, scale: pa.dec.scale });
}

/** Exact absolute value; the scale is kept (`-0.10` -> `0.10`). */
export function decAbs(a: string): DecResult {
  const pa = parseDec(a);
  if (!pa.ok) return pa.trap;
  const u = pa.dec.unscaled;
  return finish({ unscaled: u < 0n ? -u : u, scale: pa.dec.scale });
}

/** Compare by VALUE: "0.1" and "0.10" are equal, "-0" and "0" are equal. */
export function decCompare(a: string, b: string): DecCompare {
  const p = parsePair(a, b);
  if (!p.ok) return p.trap;
  const { ua, ub } = align(p.a, p.b);
  return ua < ub ? -1 : ua > ub ? 1 : 0;
}

/** Round N/D (D > 0) to an integer under an explicit mode. Exact tie test (2|r| vs D). */
function roundDiv(N: bigint, D: bigint, mode: RoundMode): bigint {
  const q = N / D;
  const r = N - q * D;
  if (r === 0n) return q;
  const neg = N < 0n;
  const twiceAbsR = (r < 0n ? -r : r) * 2n;
  let away: boolean;
  switch (mode) {
    case "down":     away = false; break;
    case "up":       away = true; break;
    case "floor":    away = neg; break;
    case "ceiling":  away = !neg; break;
    case "halfUp":   away = twiceAbsR >= D; break;
    case "halfDown": away = twiceAbsR > D; break;
    case "halfEven": away = twiceAbsR > D || (twiceAbsR === D && (q % 2n) !== 0n); break;
    default:         away = false; break; // unreachable: `mode` is a RoundMode (checked by every caller)
  }
  return away ? (neg ? q - 1n : q + 1n) : q;
}

type ModeCheck = { readonly ok: true; readonly mode: RoundMode } | { readonly ok: false; readonly trap: DecTrapKind };

/** Validate an explicit rounding mode. `""` counts as missing. Aliases (e.g. `HALF_EVEN`) are unknown. */
export function checkRoundMode(mode: string): ModeCheck {
  if (typeof mode !== "string" || mode === "") return { ok: false, trap: "MissingRoundMode" };
  return isRoundMode(mode) ? { ok: true, mode } : { ok: false, trap: "UnknownRoundMode" };
}

function checkScale(scale: number): boolean {
  return Number.isInteger(scale) && scale >= 0 && scale <= MAX_DECIMAL_SCALE;
}

/** EXACT a/b placed at `scale` fractional digits, rounded by the caller's explicit `mode`. */
export function decDiv(a: string, b: string, scale: number, mode: string): DecResult {
  if (!checkScale(scale)) return "ScaleOutOfRange";
  const m = checkRoundMode(mode);
  if (!m.ok) return m.trap;
  const p = parsePair(a, b);
  if (!p.ok) return p.trap;
  if (p.b.unscaled === 0n) return "DivisionByZero";
  const exp = scale + p.b.scale - p.a.scale;
  let num = p.a.unscaled;
  let den = p.b.unscaled;
  if (exp >= 0) num *= pow10(exp);
  else den *= pow10(-exp);
  if (den < 0n) { num = -num; den = -den; }
  return finish({ unscaled: roundDiv(num, den, m.mode), scale });
}

/** EXACT truncated remainder (sign of the dividend), at scale max(scale(a), scale(b)). */
export function decRem(a: string, b: string): DecResult {
  const p = parsePair(a, b);
  if (!p.ok) return p.trap;
  if (p.b.unscaled === 0n) return "DivisionByZero";
  const { ua, ub, scale } = align(p.a, p.b);
  const q = ua / ub;
  return finish({ unscaled: ua - q * ub, scale });
}

/** Re-scale `a` to exactly `scale` fractional digits: exact when widening, `mode`-rounded when narrowing. */
export function decQuantize(a: string, scale: number, mode: string): DecResult {
  if (!checkScale(scale)) return "ScaleOutOfRange";
  const m = checkRoundMode(mode);
  if (!m.ok) return m.trap;
  const pa = parseDec(a);
  if (!pa.ok) return pa.trap;
  const d = pa.dec;
  if (d.scale <= scale) return finish({ unscaled: d.unscaled * pow10(scale - d.scale), scale });
  return finish({ unscaled: roundDiv(d.unscaled, pow10(d.scale - scale), m.mode), scale });
}

/** Re-scale `a` to `scale` digits ONLY when that is exact (no digit is dropped); otherwise a named refusal. */
export function decRescaleExact(a: string, scale: number): DecResult {
  if (!checkScale(scale)) return "ScaleOutOfRange";
  const pa = parseDec(a);
  if (!pa.ok) return pa.trap;
  const d = pa.dec;
  if (d.scale <= scale) return finish({ unscaled: d.unscaled * pow10(scale - d.scale), scale });
  const drop = pow10(d.scale - scale);
  if (d.unscaled % drop !== 0n) return "ScaleOutOfRange";
  return finish({ unscaled: d.unscaled / drop, scale });
}

/** Number of fractional digits of canonical text, or the trap. */
export function decScale(a: string): number | DecTrapKind {
  const pa = parseDec(a);
  return pa.ok ? pa.dec.scale : pa.trap;
}

/** EXACT Int -> Decimal (scale 0). Only safe integers are admitted (no float ever reaches a Decimal). */
export function decFromInt(n: number | bigint): DecResult {
  if (typeof n === "bigint") return finish({ unscaled: n, scale: 0 });
  if (typeof n !== "number" || !Number.isSafeInteger(n)) return "MalformedDecimal";
  return finish({ unscaled: BigInt(n), scale: 0 });
}

/** True iff the value is zero (any scale). Malformed text is not zero. */
export function decIsZero(a: string): boolean {
  const pa = parseDec(a);
  return pa.ok && pa.dec.unscaled === 0n;
}

/**
 * Minor units of the currencies the WASM host constructs (`__money_gbp` ... `__money_hkd`). The host
 * cannot import the compiler's generated ISO-4217 registry (dependency direction), so this small table is
 * pinned here and a drift test checks it against `unit-registry.generated.ts`.
 */
export const HOST_MONEY_MINOR_UNITS: ReadonlyMap<string, number> = new Map<string, number>([
  ["GBP", 2], ["EUR", 2], ["USD", 2], ["CHF", 2], ["JPY", 0],
  ["CAD", 2], ["AUD", 2], ["NZD", 2], ["SGD", 2], ["HKD", 2],
]);

export type MoneyAmount =
  | { readonly ok: true; readonly amount: string }
  | { readonly ok: false; readonly trap: DecTrapKind | MoneyTrapKind };

/**
 * R11 constructor rule: the amount must be canonical Decimal text with AT MOST `minorUnits` fractional
 * digits (JPY: 0). It is stored padded to exactly `minorUnits` digits. There is no rounding and no default.
 */
export function admitMoneyAmount(text: string, minorUnits: number): MoneyAmount {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > MAX_DECIMAL_SCALE) {
    return { ok: false, trap: "UnknownCurrency" };
  }
  const p = parseDec(text);
  if (!p.ok) return { ok: false, trap: p.trap === "MalformedDecimal" ? "MalformedMoneyAmount" : p.trap };
  if (p.dec.scale > minorUnits) return { ok: false, trap: "MoneyScaleExceedsMinorUnits" };
  const r = finish({ unscaled: p.dec.unscaled * pow10(minorUnits - p.dec.scale), scale: minorUnits });
  return isDecTrap(r) ? { ok: false, trap: r } : { ok: true, amount: r };
}
