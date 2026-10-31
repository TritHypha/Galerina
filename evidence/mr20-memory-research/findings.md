# MR20 findings: .fungi canary no-trace sweep (gap 1.3, .fungi side)

Date: 2026-10-31. Branch `grok/mem-r20-fungi-canary-20261031` from Galerina main `5857ee5e6`.
Synthetic data only: the canary is `SYNTH-CANARY-7f3a` and integers built from its own bytes.

## What was open

Gap map row 1.3 asks that no failure path leaves a trace of four or more canary bytes.
The VOK side was covered by MEM-R15 and the SLIDE side by MEM-R16. The `.fungi` secret
arena (`packages/fungi/memory/src/secret-arena.fungi`) had no sweep of its own.

## What the sweep does

`packages/fungi/memory/tests/mr20-fungi-canary/` runs every `pure flow ... -> Int` in the
unit through `galerina run --invoke`, read from the source so a new flow joins without an edit:
29 `arena*` entry points and 7 shared helpers, 36 flows and 378 Int parameters.

For each parameter position the canary goes in that position with every other argument 0,
once with `0x53594E54` ("SYNT") and once with `0x37663361` ("7f3a"). 756 runs in four shards.

Each run must:

1. exit 0 with a packed result present;
2. show no 4-byte window of the canary text, and no decimal or hex spelling (either case,
   with or without `0x`, signed or absolute) of any canary integer, anywhere in the run text;
3. return a value from the closed set
   `0, 1, 11, 100, 106, 111, 112, 121, 124, 140, 144, 1061, 1110, 1111, 1211, 1240, 1401`;
4. return the same value for both canaries at the same position (differential), so no
   canary bits reach a result or refusal code.

Result: 756/756 clean. No trace, no differential split, no value outside the set.

## Finding fixed: the CLI echoed a rejected argument

`galerina run --invoke` refused a non-Int argument with exit 2, but printed the argument
back with `JSON.stringify(a)`. Passing `SYNTH-CANARY-7f3a` put all 14 canary windows on
stderr. A secret passed by mistake would land in a log the same way.

Fix in `galerina.mjs`: the message names the argument by position only
(`invoke argument #N is not a valid Int or Bool (the value is not echoed).`). Exit code and
the "not a valid Int or Bool" wording are unchanged, so `tests/cli-invoke-marshal` and
`45-host-adapter-audit/wrap-vectors` still match. `mr20-cli-echo.test.mjs` pins the fix at
argument positions 1 to 3. The old message text recorded in
`packages/fungi/memory/evidence/45-host-adapter-audit/` is historical evidence and is left as is.

## Mutants (in memory only, the tracked unit is never written)

- A: `arenaSlotCheck` returns the raw `freed` argument. Caught by the trace scan and the closed set.
- B: `arenaSlotCheck` branches on `freed > 1000000000`. No direct echo, caught by the
  differential and the closed set.
- C: control, the unmutated unit gives one value for both canaries.

## Not covered here

- Integers above i32 range are still passed to WebAssembly and wrap (`Number(a)` then i32).
  That is a truncation question for gap 4.6, not a trace, and is left for that row.
- `tests/cli-invoke-marshal` has one failing test on main before this change
  (`--governed fails closed when a discarded call emits a runtime diagnostic` expects
  `FUNGI-RUNTIME-002`, main prints `FUNGI-PIPELINE-001`). It fails the same way with
  main's `galerina.mjs`, so it is not caused by MR20.
- Gap 1.3 remains open only for a crash-time scan (row 1.5).

## Block pass

mr20 + mr3 to mr7 + 45-host-adapter-audit: 224 tests, 224 pass. Folder audit `FOLDER_ADMITTED`.
