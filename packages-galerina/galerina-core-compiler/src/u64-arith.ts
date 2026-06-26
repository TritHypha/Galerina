/**
 * u64-arith.ts — strict-trapping UNSIGNED 64-bit integer arithmetic: the SINGLE source of truth for
 * Galerina's UInt64 overflow / underflow / divide-by-zero TRAP semantics. Sibling of i64-arith.ts.
 *
 * Owner decision (Fork A = TRAP) carried to unsigned 64-bit: arithmetic must NEVER silently wrap. Native
 * WebAssembly `i64.add/sub/mul` wrap mod 2^64 (a lying abstraction in a governed system), so Galerina
 * HARDENS that reference: every add/mul that exceeds 2^64-1, every subtraction that would go below 0
 * (unsigned underflow), and every divide/modulo by zero is a `LOAD → TRAP → ERASE` event, exactly as for
 * i64/i32. There is no silent 2^64-1 + 1 = 0 wraparound — that boundary TRAPS.
 *
 * Why a layer SEPARATE from i64-arith (the split SPORE-NUMERIC-001 deliberately preserved): an unsigned
 * operand occupies [0, 2^64-1], so the same 64-bit pattern denotes a DIFFERENT value than signed i64 for
 * anything ≥ 2^63. That changes three things vs the i64.* ops:
 *   1. range is [0, 2^64-1], not [-2^63, 2^63-1];
 *   2. subtraction underflows at 0 (not at -2^63);
 *   3. div/rem are UNSIGNED — and because operands are kept NON-NEGATIVE bigints, BigInt `/` and `%` are
 *      byte-identical to WASM `i64.div_u` / `i64.rem_u` (no sign-of-dividend remainder, and none of the
 *      signed `INT64_MIN / -1` overflow case exists for unsigned division).
 *
 * Operands and results are `bigint` — a JS `number` cannot represent the u64 range exactly above 2^53,
 * which is the precise fail-open (silent precision loss) that gating scalar UInt64 behind SPORE-NUMERIC-001
 * guards against. Callers MUST hold in-range, NON-NEGATIVE u64 operands.
 *
 * NOTE (sequencing): this is the arithmetic layer only. It is additive and reachable from nothing yet —
 * UInt64 stays fail-closed under SPORE-NUMERIC-001 until the interpreter dispatch + gate-lift land. Building
 * and proving the math BEFORE admitting the type is the most-secure order (prove, then lift the gate).
 */

export const U64_MIN = 0n;
export const U64_MAX = 18446744073709551615n; // 2^64 - 1

/** The two trap kinds. Surfaced as `runtimeError.message` (walker) or a thrown `Error.message` (VM). */
export type U64TrapKind = "IntegerOverflow" | "DivisionByZero";

/** A checked op returns the u64 result (bigint), or a trap-kind string when it must trap. */
export type U64Result = bigint | U64TrapKind;

export function isU64Trap(r: U64Result): r is U64TrapKind {
  return typeof r === "string";
}

/** Trap unless the (exact) bigint result lands within the unsigned 64-bit range. */
function rangeOrTrap(r: bigint): U64Result {
  return r < U64_MIN || r > U64_MAX ? "IntegerOverflow" : r;
}

export function u64AddChecked(a: bigint, b: bigint): U64Result {
  return rangeOrTrap(a + b); // BigInt is exact — no wrap; the range check is the only gate
}

export function u64SubChecked(a: bigint, b: bigint): U64Result {
  return rangeOrTrap(a - b); // a < b → negative → below U64_MIN → IntegerOverflow (unsigned underflow)
}

export function u64MulChecked(a: bigint, b: bigint): U64Result {
  return rangeOrTrap(a * b); // exact product (can reach 2^128); range check traps a u64 overflow
}

export function u64DivChecked(a: bigint, b: bigint): U64Result {
  if (b === 0n) return "DivisionByZero";
  // Non-negative operands ⇒ BigInt `/` truncates toward zero == WASM i64.div_u. Unsigned division has no
  // overflow case (the signed INT64_MIN / -1 = 2^63 trap is impossible: there is no -1 and no INT64_MIN).
  return a / b;
}

export function u64ModChecked(a: bigint, b: bigint): U64Result {
  if (b === 0n) return "DivisionByZero";
  // Non-negative operands ⇒ `%` is byte-identical to WASM i64.rem_u; |a%b| < b ≤ U64_MAX, never overflows.
  return a % b;
}

/**
 * Unary negation as 0 - x. For unsigned that traps for ANY positive x (it would underflow below 0), and is
 * 0 for x = 0. (Tree-walker only; there is no native WASM unsigned-neg opcode, and u64 never lowers to the
 * fast tiers — FAST_TIER_UNLOWERABLE_SCALAR keeps it on the walker.)
 */
export function u64NegChecked(a: bigint): U64Result {
  return u64SubChecked(0n, a);
}
