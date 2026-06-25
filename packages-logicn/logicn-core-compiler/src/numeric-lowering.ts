/**
 * numeric-lowering.ts — shared numeric type/literal utilities for faithful 64-bit lowering.
 *
 * Two pure helpers consulted across the value-state gate, the interpreter, the WASM emitter, and the
 * type-checker so every tier agrees on (a) the BASE type of an annotation string and (b) the exact
 * bigint value + range edges of an integer LITERAL. Per the verified i64-lowering plan
 * (docs/Knowledge-Bases/logicn-i64-lowering-plan-verified-2026-06-25.md) Step 0: ONE `numericBaseType`
 * + ONE `parseI64Literal` feeding two tier-specific origination hooks, so the I64_MIN/I64_MAX literal
 * edges can never DIVERGE between tiers — a divergence is a silent 64→32 truncation fail-open (CWE-704),
 * exactly what `LLN-NUMERIC-001` gates against.
 *
 * NEVER parse an Int64 literal with `parseInt()` / `Number()` — they round above 2^53, which is the
 * precise fail-open. `BigInt` is exact across the whole i64 range.
 */
import { I64_MIN, I64_MAX } from "./i64-arith.js";

/**
 * Base type identifier from a type-annotation string: strips leading governance/safety qualifiers
 * and any generic/array suffix. "protected Int64"→"Int64", "Tensor<Int64,[4]>"→"Tensor", "Int64"→"Int64".
 * The EXACT base match is load-bearing: a generic position like `Tensor<Int64,[4]>` is an opaque i32
 * handle whose base is "Tensor" and must NOT be treated as a scalar Int64. A bare `=== "Int64"` compare
 * (the forbidden shortcut) would both miss `protected Int64` and mis-flag `Tensor<Int64>`.
 */
export function numericBaseType(typeSection: string): string {
  let s = typeSection.trim();
  for (const q of ["protected ", "redacted ", "unsafe ", "safe "]) {
    if (s.startsWith(q)) s = s.slice(q.length).trim();
  }
  const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return m?.[1] ?? "";
}

/** A parsed integer literal (exact bigint in i64 range) or a fail-closed reason. Callers MUST handle both arms. */
export type I64LiteralResult = bigint | "OutOfRange" | "NotIntegral";

export function isI64LiteralError(r: I64LiteralResult): r is "OutOfRange" | "NotIntegral" {
  return typeof r === "string";
}

/**
 * Parse an integer literal's RAW SOURCE TEXT to an exact bigint in [I64_MIN, I64_MAX], or a fail-closed
 * reason. Handles:
 *  - an optional leading sign — REQUIRED to accept I64_MIN = -2^63, whose magnitude 2^63 is itself ONE
 *    past the positive range (so the sign must be parsed here, not composed after a range check);
 *  - `_` digit-group separators;
 *  - `0x` / `0o` / `0b` radix prefixes (decimal otherwise).
 *
 * A fractional / scientific / otherwise non-integer form is "NotIntegral" (an Int64 slot rejects a Float
 * literal, fail-closed). A magnitude outside the i64 range is "OutOfRange". NEVER uses parseInt/Number.
 */
export function parseI64Literal(rawText: string): I64LiteralResult {
  let s = rawText.trim();
  if (s.length === 0) return "NotIntegral";
  // optional leading sign (parsed HERE so -9223372036854775808 = I64_MIN is accepted)
  let neg = false;
  if (s[0] === "+" || s[0] === "-") {
    neg = s[0] === "-";
    s = s.slice(1).trim();
  }
  // strip digit-group separators
  s = s.replace(/_/g, "");
  if (s.length === 0) return "NotIntegral";
  // a fractional / scientific form is not an integer literal (the hex guard avoids rejecting 0xE…)
  if (/[.eE]/.test(s) && !/^0[xX]/.test(s)) return "NotIntegral";
  let magnitude: bigint;
  try {
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) magnitude = BigInt(s);
    else if (/^0[oO][0-7]+$/.test(s)) magnitude = BigInt(s);
    else if (/^0[bB][01]+$/.test(s)) magnitude = BigInt(s);
    else if (/^[0-9]+$/.test(s)) magnitude = BigInt(s);
    else return "NotIntegral";
  } catch {
    return "NotIntegral";
  }
  const value = neg ? -magnitude : magnitude;
  if (value < I64_MIN || value > I64_MAX) return "OutOfRange";
  return value;
}
