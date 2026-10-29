# MEM-R6: release and re-alloc read as arena steps

Branch `grok/mem-r6-release-steps-20261029`, from Galerina `main` after the
MEM-R4/MEM-R5 merge. Pure `.fungi` work in
`packages/fungi/memory/src/secret-arena.fungi`; TypeScript is untouched
(frozen reference). Synthetic integers only.

## What MR5 left open

MR5 added `arenaRelease`, `arenaReleaseNextGeneration` and `arenaReallocRead`,
but release was not a listed op in `arenaStateAfter` (ops 0-6). A caller could
not turn a release or re-alloc verdict into a next arena state, and the
re-alloc check took the release verdict and the new generation as plain
arguments, so a caller could hand it a commit (100) or a generation that never
happened.

## What changed

| Change | Effect |
|---|---|
| `arenaStateAfter` lists op 7 release and op 8 re-alloc read | both follow the general one-way table: 100, 150 and 111 keep the state, 117/106/140 quarantine, Quarantined never heals, Partial quarantines, Disposed is final |
| unlisted op is now `> 8` | op 9 is the first 11; the MR3 pin moved from op 7 to op 9 (MR4 M3/S8 already used op 9) |
| `arenaReleaseStep` | `arenaStep(7, state, arenaRelease(...))`; the wipe and read-back run in every state, the state only picks the next state |
| `arenaReallocReadStep` | `arenaStep(8, state, arenaReallocRead(...))` |
| `arenaReleaseCycle` | release, then the generation from `arenaReleaseNextGeneration`, then the re-alloc read against exactly that generation; a refused or failed release is returned as is and no read runs |
| `arenaReleaseCycleStep` | op 7 when the release did not commit, op 8 with the re-alloc verdict when it did, so residue in the new slot quarantines in the same value |

No new verdict codes. Packed values: clean release 1000, stale 1500, read-back
residue 1171, negative read-back 1061, exhausted 1401; in Quarantined a clean
release is 1001 (zeroing still runs), in Disposed 1002.

## Tests (`packages/fungi/memory/tests/mr6-release-steps/`)

- `mr6-state-ops`: ops 7 and 8 against the table, op 9 unlisted.
- `mr6-release-step`: pinned packed values per state, plus a differential
  grid showing the step verdict always equals `arenaRelease` /
  `arenaReallocRead`.
- `mr6-cycle`: pinned cycle values and a differential grid against the
  manual MR5 composition (release, bump by one, re-alloc read).
- `mr6-mutants`: six mutants (op range back to 0-6, state token ignored,
  release wired as dispose, re-alloc against the old generation, cycle step
  pairing the wrong verdict, release check skipped), each must move a pinned
  value. Passing a literal 100 into the cycle's re-alloc read is equivalent
  (the value is always 100 there) and is not counted.

## Still open

- Nothing calls the release steps from a production path yet; wiring into
  SLIDE admission is SLIDE's job (production is GIR to SLIDE).
- A malformed release reply (wipe or read-back class not 0) is 110 and, as in
  the MR3 table, keeps the arena state. The slot is not released (no bump,
  no re-alloc read), so nothing is exposed, but whether 110/111 on release should
  quarantine is a table-wide question left for a later row.
- The `cycleGeneration < 1` guard in `arenaReleaseCycle` is defensive: a
  committed release always bumps to at least 2, so mutating it is equivalent.
- On-target zero-on-release (VOK `secret_arena.rs`, Linux runner) and H5
  `PR_SET_DUMPABLE=0` still need Phillip/VOK.
