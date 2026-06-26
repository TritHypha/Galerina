/**
 * decimal-arith.ts — EXACT base-10 fixed-point arithmetic for the `Decimal` type. Sibling of i64/u64-arith.
 *
 * Why this exists: `Decimal` is a STRING-backed value (`{ __tag: "decimal", value: "0.1" }`), chosen so a
 * monetary/tax amount is never an IEEE-754 double (`0.1 + 0.2 === 0.30000000000000004` is the classic
 * "wrong VAT"). But until now the interpreter had NO decimal arithmetic — `Decimal + Decimal` type-checked
 * as `Decimal` yet TRAPPED at runtime ("Operator '+' not supported for decimal"): a compile-passes /
 * runtime-traps mismatch. This layer makes `+ - *` EXACT by computing on BigInt unscaled integers (no
 * float ever touches a decimal), so 0.1 + 0.2 = "0.3", exactly.
 *
 * Representation: a decimal D = unscaled · 10^(−scale), with `unscaled: bigint` and `scale: number ≥ 0`.
 * "0.1" → (1, 1); "12.34" → (1234, 2); "-5" → (-5, 0). Add/sub align to the larger scale; multiply adds
 * scales. The result scale is a deterministic function of the inputs (no silent truncation, no rounding).
 *
 * Fail-closed: malformed input returns `"MalformedDecimal"` (never a guessed value).
 *
 * DIVISION/MODULO (the partial-operator resolution, #53/#54): exact decimal division is generally
 * non-terminating (1/3 = 0.333…), so `a / b` as a bare operator stays a COMPILE-REJECT (SPORE-NUMERIC-OP-001
 * redirects to the method form). The method `decDiv(a, b, scale, mode)` makes the obligation EXPLICIT — the
 * caller states the target scale AND the rounding policy, so there is no silent default-rounding on money (a
 * silent default would itself be a fail-open). `decRem` is exact (no policy needed). Divide-by-zero is a
 * fail-closed `"DivideByZero"` trap, mapped to the propagating runtime trap. NOT for crypto/verdict (Decimal
 * is a value type, governance decisions stay on the K3 trit).
 */

export type DecTrapKind = "MalformedDecimal" | "DivideByZero";
export type DecResult = string | DecTrapKind;
export type DecCompare = -1 | 0 | 1 | DecTrapKind;

export function isDecTrap(r: DecResult | DecCompare): r is DecTrapKind {
  return r === "MalformedDecimal" || r === "DivideByZero";
}

/**
 * Rounding policy for exact decimal division (the explicit obligation the partial-op redirect forces).
 * Mirrors the IEEE 754-2008 / Java BigDecimal rounding modes a money domain needs. `halfEven` (banker's
 * rounding) is the standard default for finance — it is the only unbiased tie-break.
 */
export type RoundMode =
  | "halfEven" | "halfUp" | "halfDown"
  | "up" | "down" | "ceiling" | "floor";

const ROUND_MODES: ReadonlySet<string> = new Set<RoundMode>([
  "halfEven", "halfUp", "halfDown", "up", "down", "ceiling", "floor",
]);

export function isRoundMode(s: string): s is RoundMode {
  return ROUND_MODES.has(s);
}

interface Dec { readonly unscaled: bigint; readonly scale: number; }

/** Parse a canonical decimal string into (unscaled, scale). Returns null on any malformed input. */
function parseDecimal(s: string): Dec | null {
  if (typeof s !== "string") return null;
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] ?? "";
  const fracPart = m[3] ?? "";
  if (intPart === "" && fracPart === "") return null; // "", ".", "+", "-" are not numbers
  const digits = intPart + fracPart;
  const unscaled = sign * BigInt(digits === "" ? "0" : digits);
  return { unscaled, scale: fracPart.length };
}

const TEN = 10n;
const pow10 = (n: number): bigint => TEN ** BigInt(n);

/** Format (unscaled, scale) back to a canonical decimal string. Preserves the computed scale (no stripping). */
function formatDecimal(unscaled: bigint, scale: number): string {
  const neg = unscaled < 0n;
  let digits = (neg ? -unscaled : unscaled).toString();
  if (scale === 0) return (neg ? "-" : "") + digits;
  while (digits.length <= scale) digits = "0" + digits; // ensure at least one integer digit
  const cut = digits.length - scale;
  const out = digits.slice(0, cut) + "." + digits.slice(cut);
  return (neg ? "-" : "") + out;
}

/** Align two decimals to a common (larger) scale, returning their unscaled values at that scale. */
function align(a: Dec, b: Dec): { ua: bigint; ub: bigint; scale: number } {
  const scale = Math.max(a.scale, b.scale);
  return {
    ua: a.unscaled * pow10(scale - a.scale),
    ub: b.unscaled * pow10(scale - b.scale),
    scale,
  };
}

export function decAdd(a: string, b: string): DecResult {
  const da = parseDecimal(a), db = parseDecimal(b);
  if (!da || !db) return "MalformedDecimal";
  const { ua, ub, scale } = align(da, db);
  return formatDecimal(ua + ub, scale);
}

export function decSub(a: string, b: string): DecResult {
  const da = parseDecimal(a), db = parseDecimal(b);
  if (!da || !db) return "MalformedDecimal";
  const { ua, ub, scale } = align(da, db);
  return formatDecimal(ua - ub, scale);
}

export function decMul(a: string, b: string): DecResult {
  const da = parseDecimal(a), db = parseDecimal(b);
  if (!da || !db) return "MalformedDecimal";
  return formatDecimal(da.unscaled * db.unscaled, da.scale + db.scale);
}

/**
 * Round a signed quotient N/D (D assumed > 0) to an integer per `mode`. q is the toward-zero truncation;
 * r = N − q·D is the remainder (|r| < D, sign of N). Returns the rounded integer quotient. The half-modes
 * compare 2·|r| to D so the tie test is exact (no division). halfEven breaks an exact tie toward the even q.
 */
function roundDiv(N: bigint, D: bigint, mode: RoundMode): bigint {
  const q = N / D;          // BigInt division truncates toward zero
  const r = N - q * D;      // |r| < D, sign follows N
  if (r === 0n) return q;   // exact — no rounding
  const neg = N < 0n;
  const twiceAbsR = (r < 0n ? -r : r) * 2n;
  let roundAway: boolean;   // round AWAY from zero (increase magnitude) vs keep the truncated q
  switch (mode) {
    case "down":     roundAway = false; break;            // toward zero
    case "up":       roundAway = true; break;             // away from zero
    case "floor":    roundAway = neg; break;              // toward −∞ (negatives go more negative)
    case "ceiling":  roundAway = !neg; break;             // toward +∞ (positives go more positive)
    case "halfUp":   roundAway = twiceAbsR >= D; break;   // tie → away
    case "halfDown": roundAway = twiceAbsR >  D; break;   // tie → toward zero
    case "halfEven":                                      // tie → toward the even quotient
      roundAway = twiceAbsR > D || (twiceAbsR === D && (q % 2n) !== 0n);
      break;
  }
  return roundAway ? (neg ? q - 1n : q + 1n) : q;
}

/**
 * EXACT decimal division to a fixed `scale` under an explicit `mode`. a/b = (ua·10^(scale+sb−sa))/ub rounded
 * to an integer, then placed at `scale` fractional digits. Fail-closed: malformed → MalformedDecimal,
 * divide-by-zero → DivideByZero, an out-of-range scale → MalformedDecimal. No float ever touches the value.
 */
export function decDiv(a: string, b: string, scale: number, mode: RoundMode): DecResult {
  if (!Number.isInteger(scale) || scale < 0 || scale > 100) return "MalformedDecimal";
  const da = parseDecimal(a), db = parseDecimal(b);
  if (!da || !db) return "MalformedDecimal";
  if (db.unscaled === 0n) return "DivideByZero";
  const exp = scale + db.scale - da.scale;
  let num = da.unscaled;
  let den = db.unscaled;
  if (exp >= 0) num *= pow10(exp);
  else den *= pow10(-exp);
  if (den < 0n) { num = -num; den = -den; }   // normalize denominator positive for roundDiv
  return formatDecimal(roundDiv(num, den, mode), scale);
}

/**
 * EXACT decimal remainder: r = a − trunc(a/b)·b, at the common (larger) scale. No rounding policy is needed
 * (the result is exact). Divide-by-zero is fail-closed. `decRem("10","3") = "1"`, `decRem("0.30","0.12")="0.06"`.
 */
export function decRem(a: string, b: string): DecResult {
  const da = parseDecimal(a), db = parseDecimal(b);
  if (!da || !db) return "MalformedDecimal";
  if (db.unscaled === 0n) return "DivideByZero";
  const { ua, ub, scale } = align(da, db);
  const q = ua / ub;          // truncate toward zero
  return formatDecimal(ua - q * ub, scale);
}

/** Compare by VALUE (not string): -1 if a<b, 0 if equal, 1 if a>b. "0.1" and "0.10" compare EQUAL. */
export function decCompare(a: string, b: string): DecCompare {
  const da = parseDecimal(a), db = parseDecimal(b);
  if (!da || !db) return "MalformedDecimal";
  const { ua, ub } = align(da, db);
  return ua < ub ? -1 : ua > ub ? 1 : 0;
}
