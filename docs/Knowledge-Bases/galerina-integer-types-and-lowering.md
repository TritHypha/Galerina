# Galerina numeric types & integer lowering (i32 / i64) — reference + maths

**Date:** 2026-06-25 · **Posture:** Fork A = TRAP (overflow never silently wraps) · crypto-on-core · fail-closed

This is the canonical reference for how Galerina represents and lowers **integers** across its three execution
tiers, the **trapping arithmetic** that makes overflow a security event, the **fail-closed gate** that
protects the not-yet-faithful widths, and the **maths** behind each check. All paths are hard paths from the
repo root; line numbers are accurate as of this date (the structure, not the line, is the contract).

Companion: the WASM-extension overview is summarised in [galerina-i64-lowering-plan-verified-2026-06-25.md].

---

## 1. The numeric type taxonomy → WASM value type

Galerina scalar numerics map to a WebAssembly value type by a single function,
`galerinaTypeToWAT` — **`packages-galerina/galerina-core-compiler/src/wat-emitter.ts:210`**:

| Galerina type | WASM valtype | Range | Faithful end-to-end? |
|---|---|---|---|
| `Bool`, `Int`, `Int8`, `Int16`, `Int32`, `Byte` | **i32** | `Int` = signed 32-bit `[−2³¹, 2³¹−1]` | **yes** (i32 is the reference width) |
| `Int64` | **i64** | signed 64-bit `[−2⁶³, 2⁶³−1]` | **yes for arithmetic** (lowers to validating WASM; gate still closed pending the full differential + owner lift) |
| `UInt64` | i64 | unsigned `[0, 2⁶⁴−1]` | **no — gated** (needs unsigned `div_u`/`lt_u`/`extend_i32_u`) |
| `Float16`, `Float32` | f32 | — | value-safe via widening, not bit-faithful |
| `Float`, `Float64`, `Double`, `Decimal` | **f64** | — | `Float` = f64 (yes); `Decimal` is f64-approx |
| `String`, `Array`, `Record`, `Option`, `Result`, `Tensor`, … | i32 handle | opaque | — (pointer/handle, not a scalar number) |

`Int` is the everyday 32-bit signed integer. The smaller widths (`Int8/16/32`) **widen** to i32 with no value
loss, so they are not gated. The **data-losing** 64-bit widths (`Int64`, `UInt64`) are the ones that need
real i64 lowering — see §4–§6.

---

## 2. Fork A = TRAP — overflow is a security event, not a wrap

Owner decision (2026-06-18): **signed integer overflow must NEVER silently wrap.** Native WebAssembly
`i32.add` / `i64.add` wrap mod 2³² / 2⁶⁴ — a *lying abstraction* in a governed system (a value that escapes
a bounds check by wrapping is a classic CWE-190 / CWE-704 exploit primitive). Galerina therefore **hardens**
the native ops into a `LOAD → TRAP → ERASE` event: every overflowing `+`/`−`/`*`, every `÷0`/`%0`, and the
one signed-division overflow `INT_MIN ÷ −1` is a trap (`unreachable` in WASM, a `runtimeError` value in the
walker). This is enforced by **one source of truth per width**, mirrored across all three tiers.

### i32 — `packages-galerina/galerina-core-compiler/src/i32-arith.ts`
### i64 — `packages-galerina/galerina-core-compiler/src/i64-arith.ts`

Range constants (`i64-arith.ts:22-23`): `I64_MIN = −2⁶³ = −9223372036854775808n`,
`I64_MAX = 2⁶³−1 = 9223372036854775807n`. Operands and results are **`bigint`** — a JS `number` cannot hold
the i64 range exactly above `2⁵³`, which is the precise fail-open the gate guards against. BigInt is exact
across the whole range.

The checked ops (both widths) are range-checks over the *exact* result:

```
addChecked(a,b)  =  rangeOrTrap(a + b)          // bigint a+b is exact → the range check is the only gate
subChecked(a,b)  =  rangeOrTrap(a − b)
mulChecked(a,b)  =  rangeOrTrap(a · b)          // exact product (can reach 2^126) → range check traps i64 overflow
divChecked(a,b)  =  b==0      ⇒ DivisionByZero
                    a==MIN ∧ b==−1 ⇒ IntegerOverflow   // 2^63 overflows i64 — the one signed-div overflow
                    else a / b   (truncate toward zero — byte-identical to WASM i64.div_s)
modChecked(a,b)  =  b==0 ⇒ DivisionByZero ; else a % b  // sign-of-dividend; |a%b|<|b| so it never overflows
negChecked(a)    =  subChecked(0, a)            // so −INT_MIN traps (it would overflow)

rangeOrTrap(r)   =  (r < MIN ∨ r > MAX) ⇒ IntegerOverflow ; else r
```

`%` matches WASM `rem_s` exactly: `INT_MIN % −1 = 0` (no trap), unlike `div_s`. This asymmetry is the
`I64_MIN / −1` vs `I64_MIN % −1` corpus case in the 0014 differential.

---

## 3. Three execution tiers — and which width each can carry

A pure flow can run on three tiers; all must be **byte-identical** (the 0014 fidelity differential):

| Tier | File | i32 | i64 |
|---|---|---|---|
| **Tree-walker** (reference) | `interpreter.ts` | exact (trapping) | **exact** — int64 carried as a `bigint` value tag (`interpreter.ts:26`); arithmetic via `i64R` → `i64-arith.ts` (`interpreter.ts:78`) |
| **Bytecode VM** (fast, Int32Array) | `bytecode-vm.ts` | exact (trapping) | **bails fail-closed** — i32-only; `flowDeclaresUnlowerable64` makes it defer to the walker |
| **WASM** (Stage-B, the semantic target) | `wat-emitter.ts` | exact (trapping helpers) | **exact** — i64 checked helpers + routing (§4) |

The safety rule: the fast tiers (bytecode + sync fast-path) are i32-only, so they **fail-closed bail** on any
flow that declares a 64-bit scalar — `flowDeclaresUnlowerable64` in
**`packages-galerina/galerina-core-compiler/src/numeric-lowering.ts`** (used the same `BACKEND_UNLOWERABLE_SCALAR`
set the gate uses). Only the faithful walker / WASM tiers ever run an Int64 flow. A wrong result is therefore
*impossible*; the worst case is a (safe) fallback to the slower walker.

---

## 4. The WASM emitter — i64 checked helpers + the overflow maths

`wat-emitter.ts` emits strict-trapping helper functions on demand. The i32 set is
**`wat-emitter.ts:817`** (`I32_CHECKED_HELPERS`); the i64 set is **`wat-emitter.ts:855`**
(`INT64_CHECKED_HELPERS`). The overflow predicates:

**add / sub (sign-bit test).** Two's-complement signed overflow of `r = a + b` happens iff `a` and `b`
share a sign and `r` differs — i.e. `(a ^ r) & (b ^ r) < 0`. For subtraction `r = a − b` it is
`(a ^ b) & (a ^ r) < 0`. Emitted (i64 shown):

```wat
(func $spore_checked_add_i64 (param $a i64) (param $b i64) (result i64)
  (local $r i64) (local.set $r (i64.add (local.get $a) (local.get $b)))
  (if (i64.lt_s (i64.and (i64.xor a r) (i64.xor b r)) (i64.const 0)) (then unreachable))
  (local.get $r))
```

**mul (divide-back).** The i32 helper multiplies in i64 then range-checks. For i64 there is **no wider native
type**, so overflow is detected by dividing the wrapped product back: if `a ≠ 0` and `i64.div_s(r, a) ≠ b`,
the multiply overflowed. The division is placed in a **nested `if (a ≠ 0)`** so it is never reached at
`a = 0` (a flat `i32.and` would still evaluate both args ⇒ a spurious div-by-zero). `i64.div_s(INT64_MIN,−1)`
traps natively, which correctly catches the one product-overflow edge (e.g. `−1 · INT64_MIN`).

`÷`/`%` lower to native `i64.div_s` / `i64.rem_s` (which already trap `÷0` + `INT64_MIN/−1` for div, `÷0` for
rem). Comparisons (`i64.lt_s`/…/`eq`/`ne`) yield an **i32 bool**.

### Mixed-width (the sign-extension rule)
In an Int64 binary op, an operand is **already i64** (used as-is) iff it is Int64-typed **or** it is a
*literal* in an i64 context (it emits `i64.const`). A genuine **i32 variable** in an i64 context is
**sign-extended** with `i64.extend_i32_s` — never reinterpreted. (This is the exact bug fixed in `14d9c19`:
`wantI64` must promote a *literal* but extend a *variable*.) So `let total: Int64 = a + b` with `Int`
operands emits `(call $spore_checked_add_i64 (i64.extend_i32_s a) (i64.extend_i32_s b))` and stays exact past
i32 range.

### Result / local value types
The flow's result valtype is i64 for an Int64 return (`wat-emitter.ts` §3e, ~`:3074`); an Int64 binding gets
an i64 local. A mismatch (i64 body, i32 result) is rejected by wabt — **fail-safe** (the WASM tier declines →
walker), never a silent truncation.

---

## 5. Literal origination — the exact-from-source rule

A bare `9223372036854775807` is just text; evaluated through the historical path it becomes `parseInt(raw)`
which **rounds above 2⁵³**. So an Int64 literal is re-read from the **raw source text** via
`parseI64Literal` — **`packages-galerina/galerina-core-compiler/src/numeric-lowering.ts:62`** — which:

- parses with **BigInt, never parseInt/Number** (exact);
- handles the **leading sign** (required: `I64_MIN = −2⁶³` is accepted even though its magnitude `2⁶³` is one
  past the positive range — the sign must be seen before the range check);
- honours `_` separators and `0x`/`0o`/`0b`;
- returns `"OutOfRange"` / `"NotIntegral"` fail-closed.

The same parser is used by the interpreter (the `coerceToDeclaredNumeric` hook) and the emitter (the
`expectedType` threading), so the I64_MIN/I64_MAX edges can never diverge between tiers — the whole point of
the shared `numeric-lowering.ts` module (Step 0). `numericBaseType` (`:35`) strips governance qualifiers
(`protected Int64` → `Int64`) and is the *single* base-type resolver the gate, the bytecode bail, and the
emitter all consult.

---

## 6. The fail-closed gate (`SPORE-NUMERIC-001`) and the lift criteria

Until a width lowers **faithfully end-to-end**, declaring it must **fail closed** rather than emit a
truncating module. `BACKEND_UNLOWERABLE_SCALAR = {Int64, UInt64}` —
**`packages-galerina/galerina-core-compiler/src/numeric-lowering.ts:26`** — drives `scanUnlowerableNumerics` in
**`packages-galerina/galerina-core-compiler/src/value-state-checker.ts`** (~`:2096`), which emits
`SPORE-NUMERIC-001` (error) on a scalar `Int64`/`UInt64` in return / param / local position. It is
**unconditional** (not mode-gated) — silent truncation is always wrong, and the governed runtime runs
`checkValueStates` in default development mode.

**`Int64` removes from this set ONLY when all hold** (the lift criteria): interpreter + emitter both faithful
(✔, this session); the i64 checked helpers injected (✔); a **fused Int64 module actually validates under
wabt** (✔ — `tests/wat-i64-milestone.test.mjs`); and the **0014 walker≡WASM differential passes
non-vacuously** over the `(2⁵³, 2⁶³)` corpus (param slice ✔ via the worker's rd-0113b 12/12; literal slice +
type-checker tightening + the rare bare-`return <literal>` are the remaining items). The lift is **owner-gated**.
**`UInt64` stays gated** for this effort (unsigned needs its own `u64-arith.ts`).

> Why the gate stays closed even though the module validates: the milestone test validates via the **raw
> WASM-emit path**, which bypasses `checkValueStates`. The production `run`/build paths *do* run the gate, so
> a real `let x: Int64 = …` flow still errors today — exactly as intended until the full differential passes.

---

## Appendix — honest performance context (incl. the photonic "intuition check")

Galerina is governance-first; its **governed** execution tier is orders of magnitude slower than native/JIT
(see [galerina-percent-audit-roadmap-2026-06-25-v2.md] — Node is ~1549× the governed tree-walker on nbody).
The i64 work here makes Int64 *correct*, not *fast*; the WASM tier it extends is the fastest Galerina tier but
still below native. On the separate "could photonics make it much faster?" intuition: the
`@galerina/ext-photonic-emulator` cost model (`npm run prove`) gives **ideal ~9.4× / realized ~1.91×** for the
bulk-math T-MAC — and the PartitionDecider **never** accepts a net-loss offload (it stays digital). That is a
**modest, I/O-bound, emulated envelope** (`executedNatively=false`), not a magic speedup — which is exactly
why the photonic overclaims were refused. Crypto and the verdict always stay digital.
