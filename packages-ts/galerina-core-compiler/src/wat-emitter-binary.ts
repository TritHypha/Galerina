import type { WATValType } from "./wat-emitter-types.js";

export const BINARY_OP_TO_WAT: ReadonlyMap<string, string> = new Map([
  // +,-,* lower to strict-trapping checked helpers (owner Fork A=TRAP, 2026-06-18): native i32.add/
  // sub/mul wrap silently, so signed overflow → `unreachable` (LOAD→TRAP→ERASE) via the helpers
  // below. /,% stay native and match i32-arith.ts exactly: i32.div_s traps on /0 AND INT32_MIN/-1
  // (overflow); i32.rem_s traps on /0 ONLY — INT32_MIN % -1 returns 0 (no trap), exactly like
  // i32ModChecked. So div traps the overflow edge, rem returns 0 there — both byte-exact with the VM/walker.
  ["+",  "call $fungi_checked_add_i32"],
  ["-",  "call $fungi_checked_sub_i32"],
  ["*",  "call $fungi_checked_mul_i32"],
  ["/",  "i32.div_s"],
  ["%",  "i32.rem_s"],
  ["<",  "i32.lt_s"],
  [">",  "i32.gt_s"],
  ["<=", "i32.le_s"],
  [">=", "i32.ge_s"],
  ["==", "i32.eq"],
  ["!=", "i32.ne"],
  // J-R3: && / || → if-short-circuit (binaryExpr); not i32.and / i32.or.
]);

// #165: native f64 lowering for float operands. All floats are treated as f64 (matching the f64.const
// literal emission, wat-emitter §numberLiteral). Without these, a float `+ - * /`/comparison emitted an
// i32 checked helper over f64 operands → an invalid module (WASM tier declined → walker fallback).
export const FLOAT_WAT_TYPES = new Set<string>(["Float", "Float64", "Double"]);
// Decimal remains exact and is deliberately excluded from the Float64 Option ABI.
export const FLOAT_OPTION_WAT_TYPES = new Set<string>(["Float", "Float64", "Double"]);
export const FLOAT_ARITH_WAT: Readonly<Record<string, string>> = { "+": "f64.add", "-": "f64.sub", "*": "f64.mul", "/": "f64.div" };
export const FLOAT_CMP_WAT: Readonly<Record<string, string>> = { "==": "f64.eq", "!=": "f64.ne", "<": "f64.lt", ">": "f64.gt", "<=": "f64.le", ">=": "f64.ge" };

// Int64 — the lifted 64-bit signed width (verified i64 plan, Steps 3a/4c). `+`/`-`/`*` route to the
// strict-trapping checked i64 helpers (Fork A=TRAP); `/`/`%` use native i64.div_s/rem_s (div_s traps /0
// AND INT64_MIN/-1; rem_s traps /0 only). Comparisons yield an i32 bool. UInt64 is NOT here — unsigned
// needs i64.div_u/lt_u + its own helpers and stays fail-closed under FUNGI-NUMERIC-001.
export const INT64_WAT_TYPES = new Set<string>(["Int64"]);
export const INT64_ARITH_WAT: Readonly<Record<string, string>> = { "+": "call $fungi_checked_add_i64", "-": "call $fungi_checked_sub_i64", "*": "call $fungi_checked_mul_i64", "/": "i64.div_s", "%": "i64.rem_s" };
export const INT64_CMP_WAT: Readonly<Record<string, string>> = { "==": "i64.eq", "!=": "i64.ne", "<": "i64.lt_s", ">": "i64.gt_s", "<=": "i64.le_s", ">=": "i64.ge_s" };

// UInt64 — the lifted 64-bit UNSIGNED width (#52). Same i64 storage, but UNSIGNED semantics: `+`/`-`/`*`
// route to strict-trapping checked u64 helpers (overflow > 2^64-1 / underflow < 0 TRAP — no silent 2^64
// wrap); `/`/`%` use native i64.div_u/rem_u (trap /0; unsigned has no INT_MIN/-1 overflow case);
// comparisons are UNSIGNED (i64.lt_u/…). Byte-exact with the tree-walker's u64-arith. Lowered ONLY for
// uint64×uint64 — a mixed UInt64×Int operand declines to the walker (the sign promotion is subtle).
export const UINT64_WAT_TYPES = new Set<string>(["UInt64"]);
export const UINT64_ARITH_WAT: Readonly<Record<string, string>> = { "+": "call $fungi_checked_add_u64", "-": "call $fungi_checked_sub_u64", "*": "call $fungi_checked_mul_u64", "/": "i64.div_u", "%": "i64.rem_u" };
export const UINT64_CMP_WAT: Readonly<Record<string, string>> = { "==": "i64.eq", "!=": "i64.ne", "<": "i64.lt_u", ">": "i64.gt_u", "<=": "i64.le_u", ">=": "i64.ge_u" };

/** True for a 64-bit WAT-i64 numeric base (Int64 OR UInt64) — both store as i64 (galerinaTypeToWAT), so a
 * literal/local in either context emits i64.const / an i64 local. The SIGNEDNESS differs only in the op. */
export const is64BitWatType = (base: string): boolean => INT64_WAT_TYPES.has(base) || UINT64_WAT_TYPES.has(base);

/**
 * #165: the WASM stack type a fully-emitted expression string leaves on the stack, read from its
 * leading opcode. Used to declare a `let`/`mut` local with the SAME type as its initialiser — an
 * f64 value (f64.mul/add/const/convert…) MUST go in an f64 local or the store is a type error.
 * Float COMPARISONS (f64.lt/eq/…) yield an i32 bool, so they are i32. Anything we can't classify
 * (records, strings, `(block …)`, `(local.get …)`, calls) defaults to i32 — the SAFE default: a
 * wrong guess yields an invalid module → walker fallback (correct, just slower), never a wrongly
 * typed but "valid" store that would compute garbage.
 */
export function watStackType(expr: string): WATValType {
  const t = expr.trimStart();
  // Step 3d: a checked-i64 helper call leaves an i64 on the stack. The generic match below requires a `.`
  // after the head, so `(call $…` falls through to the i32 default — correct for the i32 helpers, WRONG
  // for the i64 ones (an Int64 local declared from it would get an i32 valtype → a truncating/invalid store).
  if (/^\(call \$fungi_checked_(add|sub|mul)_(i64|u64)\b/.test(t)) return "i64";
  // #55: the float finiteness guard returns its f64 argument — a `let x = a / b` local declared from it
  // must be f64, not the i32 default (which would mistype the store).
  if (/^\(call \$fungi_assert_finite_f64\b/.test(t)) return "f64";
  // Float64 Option payload bridges return an f64 value even though the Option itself is an i32 handle.
  if (/^\(call \$host___(?:option_value_f64_v2|unwrap_or_f64_v2)\b/.test(t)) return "f64";
  const groups = [...t.matchAll(/^\(([a-z0-9]+)\.([a-z0-9_]+)/g)][0];
  if (groups === undefined) return "i32";
  const prefix = groups[1]!, op = groups[2]!;
  if (/^(eq|ne|lt|gt|le|ge)/.test(op)) return "i32"; // f64/f32/i64 comparisons → i32 bool
  if (prefix === "f64") return "f64";
  if (prefix === "f32") return "f32";
  if (prefix === "i64") return "i64";
  return "i32";
}

/**
 * i32 strict-trapping arithmetic helpers (owner Fork A=TRAP, 2026-06-18). Native WASM i32.add/sub/mul
 * wrap mod 2^32 — a lying abstraction in a governed system. These harden the WASM-i32 reference so
 * signed overflow is a TRAP (`unreachable` = LOAD→TRAP→ERASE), byte-identical to the tree-walker +
 * bytecode VM (the single source of truth is i32-arith.ts; these mirror its predicates exactly).
 * `+`/`-`/`*` lower to `call` these; `/`/`%` use native i32.div_s/rem_s — div_s traps on /0 AND
 * INT32_MIN/-1; rem_s traps on /0 ONLY (INT32_MIN % -1 = 0, no trap), matching i32ModChecked.
 * Emitted into a module only when a flow body actually references them.
 */
const I32_CHECKED_HELPERS: Readonly<Record<string, string>> = {
  $fungi_checked_add_i32: [
    "(func $fungi_checked_add_i32 (param $a i32) (param $b i32) (result i32)",
    "  (local $r i32)",
    "  (local.set $r (i32.add (local.get $a) (local.get $b)))",
    "  ;; signed overflow iff (a^r) & (b^r) < 0",
    "  (if (i32.lt_s (i32.and (i32.xor (local.get $a) (local.get $r)) (i32.xor (local.get $b) (local.get $r))) (i32.const 0)) (then unreachable))",
    "  (local.get $r))",
  ].join("\n"),
  $fungi_checked_sub_i32: [
    "(func $fungi_checked_sub_i32 (param $a i32) (param $b i32) (result i32)",
    "  (local $r i32)",
    "  (local.set $r (i32.sub (local.get $a) (local.get $b)))",
    "  ;; signed overflow iff (a^b) & (a^r) < 0",
    "  (if (i32.lt_s (i32.and (i32.xor (local.get $a) (local.get $b)) (i32.xor (local.get $a) (local.get $r))) (i32.const 0)) (then unreachable))",
    "  (local.get $r))",
  ].join("\n"),
  $fungi_checked_mul_i32: [
    "(func $fungi_checked_mul_i32 (param $a i32) (param $b i32) (result i32)",
    "  (local $r i64)",
    "  (local.set $r (i64.mul (i64.extend_i32_s (local.get $a)) (i64.extend_i32_s (local.get $b))))",
    "  ;; overflow iff the exact i64 product leaves [-2^31, 2^31-1]",
    "  (if (i32.or (i64.lt_s (local.get $r) (i64.const -2147483648)) (i64.gt_s (local.get $r) (i64.const 2147483647))) (then unreachable))",
    "  (i32.wrap_i64 (local.get $r)))",
  ].join("\n"),
};

/**
 * i64 strict-trapping arithmetic helpers (Fork A=TRAP, carried to 64-bit; verified i64 plan Step 4a). Mirror
 * of i32-arith.ts / I32_CHECKED_HELPERS, matching i64-arith.ts byte-for-byte: `+`/`-`/`*` lower to `call`
 * these and TRAP on signed overflow; `/`/`%` use native i64.div_s/rem_s (div_s traps /0 AND INT64_MIN/-1;
 * rem_s traps /0 only). `*` can't use a wider-type intermediate (none is wider than i64), so it detects
 * overflow by dividing the product back — the div is GUARDED in a NESTED `if a!=0` so it is never reached at
 * a==0 (a flat `i32.and` would still evaluate both args = a spurious div-by-zero trap). div_s(INT64_MIN,-1)
 * traps natively, so the one product-overflow edge (e.g. -1 * INT64_MIN) traps correctly. Emitted into a
 * module only when a flow body actually references them. NOT YET REFERENCED — the i64 binary-op routing
 * (Step 4c) that calls them is the next 2b increment; until then this is inert, and the gate stays closed.
 */
const INT64_CHECKED_HELPERS: Readonly<Record<string, string>> = {
  $fungi_checked_add_i64: [
    "(func $fungi_checked_add_i64 (param $a i64) (param $b i64) (result i64)",
    "  (local $r i64)",
    "  (local.set $r (i64.add (local.get $a) (local.get $b)))",
    "  ;; signed overflow iff (a^r) & (b^r) < 0",
    "  (if (i64.lt_s (i64.and (i64.xor (local.get $a) (local.get $r)) (i64.xor (local.get $b) (local.get $r))) (i64.const 0)) (then unreachable))",
    "  (local.get $r))",
  ].join("\n"),
  $fungi_checked_sub_i64: [
    "(func $fungi_checked_sub_i64 (param $a i64) (param $b i64) (result i64)",
    "  (local $r i64)",
    "  (local.set $r (i64.sub (local.get $a) (local.get $b)))",
    "  ;; signed overflow iff (a^b) & (a^r) < 0",
    "  (if (i64.lt_s (i64.and (i64.xor (local.get $a) (local.get $b)) (i64.xor (local.get $a) (local.get $r))) (i64.const 0)) (then unreachable))",
    "  (local.get $r))",
  ].join("\n"),
  $fungi_checked_mul_i64: [
    "(func $fungi_checked_mul_i64 (param $a i64) (param $b i64) (result i64)",
    "  (local $r i64)",
    "  (local.set $r (i64.mul (local.get $a) (local.get $b)))",
    "  ;; no type is wider than i64 → detect overflow by dividing the product back; nested if guards a!=0.",
    "  (if (i64.ne (local.get $a) (i64.const 0))",
    "    (then (if (i64.ne (i64.div_s (local.get $r) (local.get $a)) (local.get $b)) (then unreachable))))",
    "  (local.get $r))",
  ].join("\n"),
};

/**
 * UInt64 strict-trapping arithmetic helpers (#52). Mirror of the i64 helpers but UNSIGNED — no silent 2^64
 * wrap. add: overflow iff the sum wraps below `a` (r <_u a). sub: underflow iff a <_u b. mul: no wider type,
 * so detect overflow by dividing the product back UNSIGNED (i64.div_u), guarded by a!=0. `/`/`%` use native
 * i64.div_u/rem_u (trap /0; unsigned has no INT_MIN/-1 case). Emitted only when a body references one.
 */
const UINT64_CHECKED_HELPERS: Readonly<Record<string, string>> = {
  $fungi_checked_add_u64: [
    "(func $fungi_checked_add_u64 (param $a i64) (param $b i64) (result i64)",
    "  (local $r i64)",
    "  (local.set $r (i64.add (local.get $a) (local.get $b)))",
    "  ;; unsigned overflow iff the sum wrapped below a  →  r <_u a",
    "  (if (i64.lt_u (local.get $r) (local.get $a)) (then unreachable))",
    "  (local.get $r))",
  ].join("\n"),
  $fungi_checked_sub_u64: [
    "(func $fungi_checked_sub_u64 (param $a i64) (param $b i64) (result i64)",
    "  ;; unsigned underflow iff a <_u b (the result would be negative)",
    "  (if (i64.lt_u (local.get $a) (local.get $b)) (then unreachable))",
    "  (i64.sub (local.get $a) (local.get $b)))",
  ].join("\n"),
  $fungi_checked_mul_u64: [
    "(func $fungi_checked_mul_u64 (param $a i64) (param $b i64) (result i64)",
    "  (local $r i64)",
    "  (local.set $r (i64.mul (local.get $a) (local.get $b)))",
    "  ;; no type is wider than i64 → detect overflow by dividing the product back UNSIGNED; nested if guards a!=0.",
    "  (if (i64.ne (local.get $a) (i64.const 0))",
    "    (then (if (i64.ne (i64.div_u (local.get $r) (local.get $a)) (local.get $b)) (then unreachable))))",
    "  (local.get $r))",
  ].join("\n"),
};

/**
 * Float finiteness guard (#55 / FUNGI-FLOAT-NAN-001). WASM f64.div/add/sub/mul SILENTLY produce NaN (0/0) or
 * ±Inf (x/0, overflow) — a non-finite that passes EVERY range compare (every NaN compare is false) and could
 * be signed into a manifest. This makes the WASM tier fail-closed IDENTICALLY to the tree-walker's mkFloat:
 * `(v - v)` is 0 for a finite v but NaN for NaN/±Inf, so `f64.ne (v - v) 0` traps (unreachable) on any
 * non-finite value. Wrapped around every f64 arithmetic RESULT and every ordering-compare OPERAND. Emitted
 * only when a flow body references it (usage-gated → wasmHash stays a deterministic function of the bodies).
 */
const FLOAT_CHECKED_HELPERS: Readonly<Record<string, string>> = {
  $fungi_assert_finite_f64: [
    "(func $fungi_assert_finite_f64 (param $v f64) (result f64)",
    "  ;; (v - v) = 0 for a finite v but NaN for NaN/±Inf → f64.ne(…,0) traps on any non-finite value",
    "  (if (f64.ne (f64.sub (local.get $v) (local.get $v)) (f64.const 0)) (then unreachable))",
    "  (local.get $v))",
  ].join("\n"),
};

/**
 * Raw Float64 ingress classifier. Unlike the checked arithmetic/comparison
 * helper above, this deliberately does not trap: it reports whether one
 * already-received f64 is finite before ordinary Fungi validation performs an
 * ordering operation. The argument is evaluated once by the call site and no
 * non-finite value is constructed as an ordinary language value.
 */
const FLOAT_CLASSIFIER_HELPERS: Readonly<Record<string, string>> = {
  $fungi_is_finite_f64: [
    "(func $fungi_is_finite_f64 (param $v f64) (result i32)",
    "  ;; NaN fails equality with itself; abs(±Inf) is greater than the largest finite f64.",
    "  (i32.and",
    "    (f64.eq (local.get $v) (local.get $v))",
    "    (f64.le (f64.abs (local.get $v)) (f64.const 1.7976931348623157e+308)))",
    ")",
  ].join("\n"),
  $fungi_is_positive_f64: [
    "(func $fungi_is_positive_f64 (param $v f64) (result i32)",
    "  ;; Raw IEEE-754 greater-than: +Inf is positive; NaN, -Inf, and both zeroes are not.",
    "  (f64.gt (local.get $v) (f64.const 0))",
    ")",
  ].join("\n"),
};

// W5a K3 verdict helpers (2026-07-08): lattice min/max over i32 trits.
// Lattice: DENY(-1) < UNKNOWN(0) < ALLOW(+1).
//
// P2 (2026-07-21): The 2-operand fast path inlines the same select pattern as
// the helpers, but without the function-call overhead.  `left`/`right` in the
// binary-op emitter and `acc`/`next` in k3FoldExpr are fully-evaluated WAT
// expression strings — there is NO duplication risk (the original "one evaluation"
// concern was about inlining raw *source* sub-expressions, not pre-emitted WAT
// strings).  The helpers remain in ALL_CHECKED_HELPERS as the fallback for indirect
// call paths and the ≥3-operand chain tail (after the first step is inlined).
//
// Inline form:
//   K3 AND:  (select L R (i32.lt_s L R))  — L if L < R, else R  (= signed min)
//   K3 OR:   (select L R (i32.gt_s L R))  — L if L > R, else R  (= signed max)
//
// Correctness: identical truth-table to $fungi_k3_min / $fungi_k3_max (proven in
// proofs/k3-truth-tables-proof.mjs over all 9 trit pairs).
// Wabt note: i32.min_s / i32.max_s are NOT in the baseline WASM spec and are
// rejected by the wabt version in this workspace — use select explicitly.
const K3_HELPERS: Readonly<Record<string, string>> = {
  $fungi_k3_min: [
    "(func $fungi_k3_min (param $a i32) (param $b i32) (result i32)",
    "  ;; K3 `and`/all{}: lattice min — DENY absorbs, UNKNOWN never upgrades",
    "  (select (local.get $a) (local.get $b) (i32.lt_s (local.get $a) (local.get $b))))",
  ].join("\n"),
  $fungi_k3_max: [
    "(func $fungi_k3_max (param $a i32) (param $b i32) (result i32)",
    "  ;; K3 `or`/any{}: lattice max — ALLOW absorbs; two non-allows never manufacture one",
    "  (select (local.get $a) (local.get $b) (i32.gt_s (local.get $a) (local.get $b))))",
  ].join("\n"),
};

// All strict-trapping checked helpers (i32 + i64 overflow, f64 non-finite), injected on-demand when a flow
// body references one.
export const ALL_CHECKED_HELPERS: Readonly<Record<string, string>> = { ...I32_CHECKED_HELPERS, ...INT64_CHECKED_HELPERS, ...UINT64_CHECKED_HELPERS, ...FLOAT_CHECKED_HELPERS, ...FLOAT_CLASSIFIER_HELPERS, ...K3_HELPERS };

// ---------------------------------------------------------------------------
// P9.3 — Stdlib method → host import bridge
//
// The self-hosted lexer (lexer.fungi) calls stdlib methods like `s.charAt(i)`,
// `arr.append(x)`, `c.isLetter()`, `opt.unwrapOr(d)`. These parse as method-style
// callExpr nodes (value = method name, callStyle = "method", children = [receiver, ...args]).
//
// At the WASM boundary every value is an opaque i32 handle (see galerinaTypeToWAT),
// so each stdlib method maps to a host import with signature (param i32…)(result i32).
// We emit `(call $host___<name> <receiver> <args…>)`; the host (galerina.mjs
// hostRuntime) supplies the real implementation. renderWAT usage-gates the host
// imports on whether `$host___<name>` appears in a body, so emitting the call
// string is sufficient to pull in the matching import.
//
// Only the EXACT method names below are intercepted. Everything else (flow→flow
// calls like scanWord(...), record constructors) falls through unchanged.
// ---------------------------------------------------------------------------

/**
 * Stdlib method name → host import id (the `$host___…` WAT identifier).
 *
 * Receiver-passing rule: the receiver is emitted as the FIRST argument followed
 * by the call's own arguments — `s.charAt(i)` → `(call $host___str_char_at s i)`,
 * `n.toString()` → `(call $host___int_to_str n)`.
 *
 * P9.3/P9.4: `length` and `toString` are type-directed in emitWATExpr (String vs
 * Array/List; Char vs Int vs Float vs Decimal). `Array.empty()` is handled
 * specially in emitWATExpr (zero-arg host call).
 */
export const STDLIB_HOST_MAP: Record<string, string> = {
  charAt:   "$host___str_char_at_option_v2",
  charCount: "$host___str_count",   // String.charCount() → length (#145 lexer link)
  length:   "$host___str_length",   // String.length / Array.length (shared sig)
  toInt:    "$host___str_to_int_option_v2",
  toStr:    "$host___int_to_str",
  toString: "$host___int_to_str",   // Int.toString (Char.toString → P9.4)
  concat:   "$host___str_concat",
  // #162: String-only methods (no Char/Array equivalent that conflicts by name).
  startsWith: "$host___str_starts_with",
  endsWith: "$host___str_ends_with",
  trim:     "$host___str_trim",
  indexOf:  "$host___str_index_of",
  slice:    "$host___str_slice",     // String.slice(start, end) — Array.slice → type-directed follow-on
  isLetter: "$host___char_is_letter",
  isDigit:  "$host___char_is_digit",
  // #169: Char classifiers — Char-only (String has no isUpper/isLower/isWhitespace),
  // so the name→host mapping is unambiguous. toUpper/toLower are String-ambiguous and
  // are routed type-directed under #162 instead of mapped here.
  isUpper:  "$host___char_is_upper",
  isLower:  "$host___char_is_lower",
  isWhitespace: "$host___char_is_whitespace",
  append:   "$host___array_append",
  get:      "$host___array_get_option_v2",
  count:    "$host___array_length",  // #161: Array.count() → length (reuses the array_length import)
  contains: "$host___array_contains",
  // `includes` is the source-level spelling used by converted JavaScript/TypeScript
  // collection checks. Keep it an exact alias of `contains` so it cannot fall
  // through to a dangling `$includes` call in the standalone WAT module.
  includes: "$host___array_contains",
  first:    "$host___array_first_option_v2",
  last:     "$host___array_last_option_v2",
  unwrapOr: "$host___unwrap_or_v2",
  isSome:   "$host___option_is_some_v2",
  isNone:   "$host___option_is_none_v2",
};

/** Plain (non-method) stdlib calls — constructors mapped to host imports. */
export const STDLIB_HOST_CALL_MAP: Record<string, string> = {
  Some: "$host___option_some_v2",
  Ok:   "$host___result_ok",   // Result.Ok(x)  (#145 lexer link)
  Err:  "$host___result_err",  // Result.Err(x) (#145 lexer link)
  // None is an identifier (no call); resolves via the host_none import at link time.

  // Money currency constructors (ISO 4217) — lowered to host-side tagged handles.
  // Each returns an i32 Money handle. The amount arg is a string handle (intern first).
  gbp: "$host___money_gbp",
  eur: "$host___money_eur",
  usd: "$host___money_usd",
  chf: "$host___money_chf",
  jpy: "$host___money_jpy",
  cad: "$host___money_cad",
  aud: "$host___money_aud",
  nzd: "$host___money_nzd",
  sgd: "$host___money_sgd",
  hkd: "$host___money_hkd",

  // I/O — print(strHandle) emits to the host console; returns 0 (void).
  print:   "$host___print",
  println: "$host___println",

  // Privacy — redact(strHandle) returns a redacted-sentinel handle.
  redact: "$host___redact",

  // Collection — range(lo, hi) returns an Array<Int> handle.
  range: "$host___range",

  // C02: exact Decimal constructor. Argument is a string handle.
  Decimal: "$host___decimal_from_str",
};

/**
 * Resolves a char-literal token value to its concrete string (handles the same
 * escapes as the interpreter's resolveCharEscape, kept in lockstep). Used to lower
 * `'A'`/`'\n'` to their code point for WAT. Local to the emitter — the interpreter
 * owns the canonical copy; this mirror avoids a cross-module import cycle.
 */
