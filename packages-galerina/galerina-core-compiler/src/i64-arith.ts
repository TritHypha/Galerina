/**
 * i64-arith.ts — strict-trapping 64-bit integer arithmetic: the SINGLE source of truth for
 * Galerina's Int64 overflow / divide-by-zero TRAP semantics. Sibling of i32-arith.ts.
 *
 * Owner decision 2026-06-18 (Fork A = TRAP) carried to 64-bit: integer overflow must NEVER silently
 * wrap. Native WebAssembly `i64.add/sub/mul` wrap mod 2^64 (a lying abstraction in a governed system),
 * so Galerina HARDENS the WASM-i64 reference: every add/sub/mul that leaves [-2^63, 2^63-1], every
 * divide/modulo by zero, and the one signed-division overflow (INT64_MIN / -1 = 2^63) is a
 * `LOAD → TRAP → ERASE` event, exactly as for i32.
 *
 * Operands and results are `bigint` — a JS `number` cannot represent the i64 range exactly above 2^53,
 * which is the precise fail-open (silent precision loss) that gating scalar Int64 behind SPORE-NUMERIC-001
 * guarded against. BigInt is exact across the whole range. `/` and `%` truncate toward zero in JS BigInt,
 * which is byte-identical to WASM `i64.div_s` / `i64.rem_s` (sign-of-dividend remainder) — so every
 * execution tier that funnels through this ONE definition stays differential-identical (the 0014 gate).
 *
 * Inputs MUST already be in i64 range (callers hold i64 operands). Unsigned 64-bit (UInt64) is NOT
 * handled here — it has distinct div/compare semantics and stays fail-closed under SPORE-NUMERIC-001
 * until its own layer lands.
 */

export const I64_MIN = -9223372036854775808n; // -(2^63)
export const I64_MAX = 9223372036854775807n; //  2^63 - 1

/** The two trap kinds. Surfaced as `runtimeError.message` (walker) or a thrown `Error.message` (VM). */
export type I64TrapKind = "IntegerOverflow" | "DivisionByZero";

/** A checked op returns the i64 result (bigint), or a trap-kind string when it must trap. */
export type I64Result = bigint | I64TrapKind;

export function isI64Trap(r: I64Result): r is I64TrapKind {
  return typeof r === "string";
}

function rangeOrTrap(r: bigint): I64Result {
  return r < I64_MIN || r > I64_MAX ? "IntegerOverflow" : r;
}

export function i64AddChecked(a: bigint, b: bigint): I64Result {
  return rangeOrTrap(a + b); // BigInt is exact — no wrap, the range check is the only gate
}

export function i64SubChecked(a: bigint, b: bigint): I64Result {
  return rangeOrTrap(a - b);
}

export function i64MulChecked(a: bigint, b: bigint): I64Result {
  return rangeOrTrap(a * b); // exact product (can reach 2^126); range check traps an i64 overflow
}

export function i64DivChecked(a: bigint, b: bigint): I64Result {
  if (b === 0n) return "DivisionByZero";
  if (a === I64_MIN && b === -1n) return "IntegerOverflow"; // 2^63 overflows i64 (the one signed-div overflow)
  return a / b; // BigInt `/` truncates toward zero — matches WASM i64.div_s
}

export function i64ModChecked(a: bigint, b: bigint): I64Result {
  if (b === 0n) return "DivisionByZero";
  // BigInt `%` takes the sign of the dividend and |a%b| < |b| ≤ I64_MAX, so it never overflows —
  // byte-identical to WASM i64.rem_s. (i64.rem_s does NOT trap on INT64_MIN % -1; it yields 0.)
  return a % b;
}

/** Unary negation as 0 - x, so `-INT64_MIN` traps (it would overflow i64). */
export function i64NegChecked(a: bigint): I64Result {
  return i64SubChecked(0n, a);
}
