# MR4: caller wiring for the MR3 arena flows

Branch `grok/mem-r4-arena-steps-20261029` (from main e287e3492, MEM-R3).

## What changed

`packages/fungi/memory/src/secret-arena.fungi` gains composed flows so a
caller cannot drop the MR3 one-way state transition or skip the lease:

- `arenaStep(op, state, packed)` returns verdict * 10 + next state from
  `arenaStateAfter`. Unlisted op or state is 11. A verdict outside 100..199
  is read as 106 UNKNOWN (with Quarantined), so a stray code can never come
  back paired with Active.
- `arenaHasStep`, `arenaStatusStep`, `arenaEpochStep` wire the read replies
  (ops 0, 1, 2).
- `arenaPutStep` puts through `arenaPutExact` (never bare `arenaPut`), op 4.
- `arenaLeasedUse` opens the per-name lease, runs `arenaUse` only when the
  lease admits 100, then closes exactly the lease it opened. A refusal (151,
  106, 110, 141, 111) returns before any read. 117 and 106 from use win; a
  close failure is 106 UNKNOWN plus quarantine.
- `arenaLeasedUseStep` wires leased use through op 3.

No existing flow was changed; MR1 to MR3 verdicts are untouched.

## Tests

`packages/fungi/memory/tests/mr4-arena-steps/` (reuses the MR3 flattening
harness): step table, read and put steps, leased use with a differential
check against bare `arenaUse`, and 10 killing mutants (M1 to M10), all killed.

## Equivalent mutants (documented, not killable)

With a correct open and `held = liveCount + 1`, close always returns 100,
so removing the `used == 117` / `used == 106` precedence or the
`closed != 100` guard does not change any verdict. The guard is defensive;
M5 (wrong held count) shows it is live and turns a wrong count into 106.

## Not in scope

K3 rows (SuperGrok K3-ZR) and the SLIDE side are untouched. TS stays frozen
reference; all new logic is in .fungi. Synthetic data only.