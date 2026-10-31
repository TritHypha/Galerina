# MEM-R28: no wall clock reaches expiry; armed time <= 0 is untrusted (gap 4.4, .fungi side)

Date: 2026-10-31. Branch `grok/mem-r28-clock-trust-20261031`. Synthetic data only. No TS
packages changed (TS is frozen reference), no K3 wire change.

## Gap 4.4 before this row

The gap map said: "untrusted/wall clock into expiry refused ... No GIR/compile rejection test".
SLIDE (`k3ClassifyTrustedClock`) and VOK (`src/trusted_clock.rs`, MEM-R21) already refuse an
untrusted clock. The .fungi side had no test that a wall clock cannot reach expiry.

## What changed

| Change | Where |
|---|---|
| `applyArenaClock` refuses an armed time of 0 (was `armedAt < 0`, now `armedAt <= 0`, reason 11, packed 111) | `packages/fungi/memory/src/secret-arena.fungi` |
| New suite, 22 tests (7 mutants) | `packages/fungi/memory/tests/mr28-clock-trust/` |
| Memory folder allowlist entry | `scripts/audit-fungi-memory-folder.mjs` |

### Why armed time 0 had to go

The standing rule is that any clock value <= 0 fails closed. Before this row, a lease armed at
time 0 with a reading of 0 was admitted (`clock 0, armedAt 0` gave packed 100). `clock < 0` was
already refused, and `clock 0` with a positive armed time was already refused as backwards (122,
pinned by MR4). With `armedAt <= 0` refused, a reading of 0 can never be admitted: either the
armed time is untrusted (111) or the reading is behind it (122). Existing pins are unchanged.

| Reading | Before | After |
|---|---|---|
| clock 0, armedAt 0 | 100 (admitted) | 111 |
| clock 5, armedAt 0 | 100 (admitted) | 111 |
| clock 0, armedAt 1000 | 122 | 122 |
| clock -1 | 111 | 111 |
| armedAt -1 | 111 | 111 |

## What the suite pins

1. **Gate table.** Admit only for a present, positive, same-epoch, in-window reading. Missing
   121, presence not 0/1 111, zero budget 111, epoch moved 123, backwards 122, deadline 147,
   armed-plus-budget overflow 151. A foreign class (1, 2, 3, -1) on any of the six clock fields
   never admits. Leased use with armed time 0 is refused exactly like armed time -1.
2. **Source pin.** No `.fungi` file under `packages/fungi/memory/src` calls
   `Clock.*()`, `Time.*()`, `Date.*()`, `Instant.*()` or `SystemTime.*()` or declares a
   `clock.read` / `time.read` effect (comments and strings stripped first; the scanner has its
   own positive and negative self-tests). Every flow in `secret-arena.fungi` is a `pure flow`, and
   `applyArenaClock` takes the reading as parameters.
3. **Compiler probe.** A pure flow calling `Clock.now()` or `Time.nowMs()`, including one that
   feeds the reading into an expiry comparison, does not run: `galerina run --invoke` stops with
   `FUNGI-WAT-METHOD-001` and produces no value. A plain pure flow runs through the same path as a
   control.
4. **Mutants (7).** Each guard is load-bearing: armed `<= 0` back to `< 0`, backwards, negative
   clock, presence, epoch, deadline and budget. Each mutant changes the verdict; the tracked unit
   is sha256-checked unchanged after each.

## Findings

**F1 (open, compiler, TS frozen).** `galerina check` admits a `pure flow` that calls `Clock.now()`
or `Time.nowMs()` with "0 errors, 0 governance warnings". The only refusal today is later, at WASM
lowering (`FUNGI-WAT-METHOD-001`, method not lowered), which is a missing-feature refusal and not
an effect refusal. `Clock.now` is registered with effect `clock.read` in the TS registry, but the
check path does not enforce it for a pure flow; `Time.nowMs` is implemented in `stdlib.ts` but is
not in `stdlib-registry.ts` or the effect checker at all. Once SLIDE lowers these methods, a pure
flow could read a wall clock unless the check rejects it. The suite keeps a tripwire test on the
current `check` behaviour so the fix is noticed. The fix belongs in the .fungi compiler
(effect check: wall-clock reads are refused in `pure flow` and need a declared clock effect); it
was not made here because the compiler today is TS reference.

**F2 (note).** Clock and armed epochs of 0 or below are still accepted when they match. Epochs
are counters, not clock readings, so they were left alone; a later row can decide whether epoch 0
is a valid first epoch.

## Gap map

Row 4.4: .fungi side COVERED for the arena expiry path (source pin, gate table, run refusal);
compile-time effect rejection remains PARTIAL on F1. Row 1.6 is stale and is marked COVERED:
MEM-R2 (provider), MEM-R16 (SLIDE, 64 racers) and MEM-R3 (.fungi, LEASE_ALREADY_LIVE).
## Stale pins fixed on the way (both red on main before this row)

- `37-u3 port and unit have no wait loop`: the MEM-R23 doc comment "dead while idle" in
  `secret-arena.fungi` matched the `"while "` text check. Reworded to "dead when idle"; no code change.
- `37-u3 lastEpoch at i32 max`: since MEM-R27 the raw `--invoke` path refuses 2147483648 before the
  flow runs (exit 2, no value). The two wide-epoch lines now pin that refusal instead of packed 140.

## Block

mr28 22/22 (7 mutants), mr3 + mr4 + mr5 + mr22 + 37-u3 + mr23 green (179 run, the two stale pins
above then fixed and 37-u3 + mr23 re-run 66/66), memory folder audit FOLDER_ADMITTED, code index
regenerated and `--check` clean. WSL node v24.20.0.