# MEM-R27: raw `--invoke` arguments are typed and i32-exact (gap 4.6 / H13)

Date: 2026-10-31. Branch `grok/mem-r27-raw-invoke-i32-20261031`. Synthetic data only.

## What was wrong

`galerina run <file> --invoke <flow> [args]` (the raw WebAssembly path) turned each CLI
argument into a JS number with `Number(a)` and only refused non-finite results. A .fungi `Int`
is a WebAssembly i32, so WebAssembly's ToInt32 then wrapped or truncated whatever came in:

| Argument | Before | After |
|---|---|---|
| `4294967300` for `Int` | ran as 4 | exit 2, out of i32 range |
| `2147483648` for `Int` | ran as -2147483648 | exit 2, out of i32 range |
| `""` for `Int` | ran as 0 | exit 2, not a valid Int or Bool |
| `1.5` / `1e3` / `0x10` for `Int` | ran as 1 / 1000 / 16 | exit 2 |
| `-0`, `+1`, `01`, ` 1` for `Int` | ran | exit 2 (non-canonical) |
| `1` / `0` / `2` for `Bool` | ran (2 became a malformed Bool) | exit 2, only `true` / `false` |
| `true` for `Int` | ran as 1 | exit 2 |
| any number for `String` / `Array` / `Result` / `Option` | became a forged registry handle | exit 2, use `--governed` |

The governed path (`--governed`) already marshalled by declared type; the raw path did not.
MEM-R20 noted the i32 wrap and left it for row 4.6. The Q45 audit
(`packages/fungi/memory/tests/45-host-adapter-audit/wrap-vectors.test.mjs`) characterised the
wrap as observed behaviour.

## Fix (galerina.mjs)

- New exported pure helpers: `declaredRawParamType`, `marshalRawInvokeArg`,
  `rawInvokeRefusalLines`, and constants `RAW_INVOKE_I32_MIN`, `RAW_INVOKE_I32_MAX`,
  `RAW_INVOKE_MAX_ARG_CHARS` (64).
- The raw path looks up the flow's declared parameter types (same "name: Type" parse as the
  governed path). Malformed metadata refuses the whole invoke (exit 2).
- `Int`: `^-?(0|[1-9][0-9]*)$`, not `-0`, at most 11 characters, safe integer, inside
  [-2147483648, 2147483647]. Nothing is wrapped.
- `Bool`: `true` or `false` only.
- `Float` / `Float64` / `Double`: plain finite decimal (`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`), `-0.0`
  normalised to 0. `Float32` / `Float16` (exact-carrier lane, E5 provisional) are refused.
- Any other declared type: refused with a pointer to `--governed`.
- A flow not found in metadata (no declared types) admits only `true`/`false` or a canonical i32.
- Refusals keep the MEM-R20 rule: the argument is named by position, its text is never echoed,
  and the existing "not a valid Int or Bool" wording is kept for Int/Bool.

## Tests (`packages/fungi/memory/tests/mr27-raw-invoke-i32`, 25 tests)

- `mr27-marshal-unit.test.mjs` (11): bounds, canonical spellings, every refusal reason, the
  metadata parser and refusal-line no-echo, directly on the exported helpers.
- `mr27-raw-invoke-cli.test.mjs` (14): end-to-end CLI pins on `mr27-scalars.fungi` (Int, Bool,
  two-Int, Float, String flows), synthetic canary no-echo, exact arity, and six mutants of
  galerina.mjs (M1 range check off, M2 Bool admits digits, M3 `-0` admitted, M4 unsupported type
  falls through, M5 refusal echoes, M6 typed lookup off). All six turn their pin RED.
- `45-host-adapter-audit/wrap-vectors.test.mjs` moved to the new contract: out-of-range, `1.5`
  and `""` are refused, and its mutant now restores the old `Number(a)` wrap (4294967300 runs
  as 4 under the mutant, refused live).

## Not changed

- The governed path. It still admits `Number.isSafeInteger` Ints, because it runs the
  interpreter rather than the i32 lane. Whether governed `Int` should also be i32-bounded is
  the remaining part of row 4.6 / H13 (the .fungi `Int` width decision), which is Phillip's.
- `packages/fungi/memory/evidence/45-host-adapter-audit/` is historical evidence and is left as is.
