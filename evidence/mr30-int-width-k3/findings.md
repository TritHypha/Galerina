# MEM-R30 - Int width, zero-trust and K3 on both CLI surfaces (gap 4.6 / H13)

Date: 2026-10-31. Branch `grok/mem-r30-int-width-zt-k3-20261031`, base main `df51a00ea` (merge of MEM-R29).

## Decision (Phillip, 2026-10-31)

.fungi has 32-bit and 64-bit integers. `Int` stays the canonical checked i32 (GIR type id 1) and is an
alias of `Int32`. The 64-bit built-ins are the existing `Int64` / `UInt64`. No new 64-bit name, and
`Int` is not redefined.

## What was wrong before (probed on base df51a00ea)

| Path | Input | Before |
|---|---|---|
| raw `--invoke` | `i64Max()` (Int64) | printed `9223372036854775807n` |
| `--governed` | any Int64 result | crashed: `Do not know how to serialize a BigInt` |
| `--governed` | `Int` arg `9007199254740991` | admitted (safe-integer check, not i32) |
| `--governed` | `Int32` / `Int64` / `UInt64` params | refused as unsupported |
| raw `--invoke` | undeclared type | legacy-admitted Bool literals or an i32 |

## What changed (galerina.mjs only; TypeScript frozen)

One declared-type admission `admitInvokeArg(text, type, "raw" | "governed")` now serves both surfaces.

* Integer text must be canonical `/^-?(0|[1-9][0-9]*)$/`, not `-0`, at most 64 chars, and is parsed with
  `BigInt` (never `Number`) against the exact range of the declared width (`INVOKE_INTEGER_RANGES`):
  Int = Int32 = [-2^31, 2^31-1], Int64 = [-2^63, 2^63-1], UInt64 = [0, 2^64-1], plus the narrow widths
  Int8, Int16, UInt8, Byte, UInt16 and UInt32 at their exact ranges. Unsigned widths refuse `-`.
* Raw carries Int/Int32 on the i32 lane (number) and Int64 on the i64 lane (bigint). UInt64 and the
  narrow widths have no raw carrier yet and are DENY `RAW_ARG_TYPE_UNSUPPORTED` (use `--governed`).
* Governed carries Int/Int32 as `int`, Int64 as `int64`, UInt64 as `uint64` (bigint), Bool, String.
* Output: raw prints a bigint exactly (`asUintN(64)` for UInt64); governed renders int64/uint64 via
  `toString`. Both paths run `checkDeclaredIntegerResult` before printing, so a value that does not fit
  the declared integer return type is refused (exit 2, `K3 DENY RESULT_RANGE`), never truncated.

## Zero-trust and K3 together (the shape)

Every argument gets a K3 verdict; zero-trust is the rule that only ALLOW executes.

| Verdict | When | Reason codes (raw / governed) |
|---|---|---|
| ALLOW | canonical text inside the declared range; value carried out of band | - |
| DENY | malformed, out of range, too long, or a known type the surface cannot carry | `*_MALFORMED`, `RAW_ARG_I32_RANGE`, `RAW_ARG_I64_RANGE` / `GOV_ARG_RANGE`, `*_TOO_LONG`, `*_TYPE_UNSUPPORTED` |
| UNKNOWN | declared type missing or not recognised, or the argument is not text | `*_TYPE_UNKNOWN`, `*_NOT_TEXT` |

Verdicts fold with strong Kleene AND (`foldInvokeArgVerdicts`, min over DENY < UNKNOWN < ALLOW). The
refusal names the first argument holding the folded verdict, by position, parameter and declared type,
and never echoes the text. DENY and UNKNOWN both exit 2 with distinct codes. A verdict is never coded
inside an integer value; where it crosses as a byte it uses the K3 wire ALLOW 0x01, DENY 0xFF,
UNKNOWN 0x80 (`k3ArgVerdictWire`). The K3 codec and the Step Z flags were not changed.

Answer to "do both still work?": yes. Zero-trust alone is two-valued (admit / refuse); K3 splits refuse
into DENY (we know it is bad) and UNKNOWN (we cannot tell). Both refuse, so the zero-trust guarantee
is unchanged, and the operator learns which of the two it was.

## Layers that refuse Int64 -> Int narrowing

1. Governed: the type checker refuses `return x` of Int64 from an Int flow (FUNGI-TYPE-008).
2. Raw: the WASM validator refuses the module (`expected [i32] but got [i64]`). Finding: the raw path
   does not run the type checker first, so the refusal is correct but late (follow-up F3).
3. Both: `checkDeclaredIntegerResult` refuses any integer result outside its declared width.
4. The governed interpreter re-checks Int64/UInt64 arguments (FUNGI-RUNTIME-003), a second layer
   behind the CLI admission.

## Tests

`packages/fungi/memory/tests/mr30-int-width-k3/`: unit file (16 tests: boundaries at 2^31, 2^53, 2^63
and 2^64, each +/-1, for every width; canonical text; unsigned `-`; K3 shape; Kleene AND truth table;
wire bytes; no sentinel; narrowing guard; Int/Int32 alias on both surfaces; docs pin) and CLI file
(10 end-to-end tests on both surfaces plus 9 mutants M1-M9, all killed). MEM-R27 tests updated for the
superseded untyped admission and Int64 now admitted raw; its 6 mutants were retargeted and still die.

## TypeScript follow-ups (TS frozen, not edited)

* F1 type-checker.ts: state the `Int` = `Int32` alias explicitly in the type table (today they are
  compatible in practice; see the mixInt pin) rather than two names.
* F2 governed interpreter: check Int/Int32 values stay inside i32 after arithmetic (the CLI checks
  the arguments and the result; intermediate overflow is the interpreter's job).
* F3 raw `run --invoke`: run the type checker before WASM generation so narrowing gets FUNGI-TYPE-008
  rather than a wabt validation error.
  CLOSED by MEM-R30b in galerina.mjs (no TS edit): narrowing is refused as FUNGI-INT-NARROW-001 before
  WASM generation; see `evidence/mr30b-int-narrowing/findings.md`.
* F4 raw UInt64 lane: an unsigned i64 marshal so UInt64 can be invoked raw.

## Deferred

SLIDE Int64 BigInt refusal (arena / SLIDE boundary) was not attempted: it touches the Rust/TS SLIDE
lane, beyond this galerina.mjs change. Queued as the next row (MEM-R31).

## Pre-existing

`tests/cli-invoke-marshal` "--governed fails closed when a discarded call emits a runtime diagnostic"
fails on base df51a00ea in this clone too (FUNGI-PIPELINE-001 instead of FUNGI-RUNTIME-002), so it is
not caused by MEM-R30.