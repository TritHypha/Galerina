# MEM-R30b: integer-width narrowing refused before any module is built (gap 4.6/H13)

Date: 2026-10-31. Branch `grok/mem-r30b-raw-typecheck-first-20261031`, base main `e48b0adcd` (MEM-R30a).
Decision applied: Phillip, 2026-10-31 12:01 GMT. Narrowing 64-to-32 is checked and refuses; Int is an
alias of Int32 (checked i32). TypeScript is frozen, so the change is in `galerina.mjs` only.

## What was wrong (probed on main e48b0adcd)

* Plain `check` passed `Int64 -> Int` narrowing with 0 errors: the checker reports it as an advisory
  FUNGI-TYPE-002 / 005 / 008, which only `--strict-types` folds into the exit code.
* Raw `run --invoke` failed late, inside wabt validation (`type mismatch ... expected [i32] but got
  [i64]`), so the only guard on the raw path was the WASM validator.
* `Int32` returned from an `Int` flow was itself reported as a FUNGI-TYPE-008 mismatch (alias unknown
  to the checker), so `--strict-types` refused correct code.

## What changed

`galerina.mjs` classifies each integer-width checker diagnostic from the checker's three pinned
message shapes (assignment 002, argument 005, return 008), using the MEM-R30a `INVOKE_INTEGER_RANGES`:

| Class     | Rule                                         | Treatment                                     |
|-----------|----------------------------------------------|-----------------------------------------------|
| ALIAS     | both sides normalise to the same width       | dropped (Int is Int32)                        |
| NARROWING | source range not inside target range         | FUNGI-INT-NARROW-001, K3 DENY, every profile  |
| WIDENING  | source range inside target range             | unchanged (advisory)                          |
| null      | not two known widths, or not a pinned shape  | unchanged: nothing is silently relaxed         |

NARROWING is refused on `check` (plain and strict), `build`, and raw `run --invoke`, in the shared
compile section before WASM generation, next to the security type codes. The refusal names the two
types and the site, never a value, and says there is no wrap and no truncation. UInt64 <-> Int64 is
narrowing in both directions (neither range contains the other).

## Blast radius

All 27 tracked `.fungi` files that mention a sized integer type were checked with the patch: one hit,
the intended MEM-R30 fixture `mr30-narrow.fungi`. The MEM-R30 narrowing pin now expects
FUNGI-INT-NARROW-001 on the raw path and asserts the late wabt error is gone.

## Tests

`packages/fungi/memory/tests/mr30b-int-narrowing/`: unit file (7 tests: frozen exports and alias, shape
direction, full width matrix against range containment for every pinned shape, off-shape stays null,
one DENY per narrowing error with location and no value, severity filter, advisory filter) and CLI file
(5 end-to-end tests plus 5 mutants M1-M5, all killed): check refuses all five sites in plain and strict
mode, alias fixture is clean and runs exactly raw, raw run refuses before WASM with no truncated value
and no echo, build refuses, widening runs exactly on both surfaces (including 2^53+1 via Int64).

## Still open (TS frozen)

* F1 governed alias: the TS runner still refuses `Int32` returned as `Int` (FUNGI-TYPE-008). Fail closed,
  never lossy; pinned so a TS fix shows up.
* F2 governed intermediate overflow and F4 raw UInt64 lane remain as listed in MEM-R30 findings.