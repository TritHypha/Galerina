# MEM-R7: a malformed release reply quarantines

Branch `grok/mem-r7-release-malformed-20261029`, from Galerina `main`
`ec33550f5` (after MEM-R6). Pure `.fungi` work in
`packages/fungi/memory/src/secret-arena.fungi`; TypeScript is untouched
(frozen reference). Synthetic integers only.

## What MR6 left open

MR6 listed op 7 (release) and op 8 (re-alloc read) in `arenaStateAfter`, and
both followed the MR3 table, where 110 (malformed) and 111 (unlisted) are
benign and keep the state. On release that means a wipe, read-back or freed
reply that cannot be read left the arena Active, even though nobody could
confirm the bytes were zeroed. The `arenaReleaseStep` intent already said
"111 unlisted quarantines", which the table did not do.

## Decision (full auto, Work driver 2026-10-29)

On ops 7 and 8 only, 110 and 111 quarantine. A release or re-alloc reply that
cannot be read is treated like an unknown wipe (106): fail closed. Ops 0-6
keep the MR3 table unchanged; whether 110/111 should quarantine everywhere is
a table-wide question left open (it would move pinned MR3/MR4 values).

## What changed

| Change | Effect |
|---|---|
| `arenaStateAfter`: `if opCode > 6` arm before the benign list | op 7/8 with 110 or 111 is Quarantined; Disposed stays final and Quarantined/Partial were already Quarantined |
| intents of `arenaStateAfter`, `arenaReleaseStep`, `arenaReallocReadStep` | say what the code now does |
| `mr6-state-ops` | the op 7/8 111 pin moves from Active to Quarantined |

No new verdict codes and no change to any verdict: `arenaRelease`,
`arenaReallocRead` and `arenaReleaseCycle` return the same values as in MR6.
Only the paired next state moves: malformed release 1100 to 1101, unlisted
1110 to 1111, the same for re-alloc read and the cycle step.

## Tests (`packages/fungi/memory/tests/mr7-release-malformed/`)

- `mr7-state-table`: ops 7 and 8 with 110 and 111 against `arenaStateAfter`
  and `arenaStep`; Disposed final; 100 and 150 still keep Active.
- `mr7-other-ops`: ops 0-4 and 6 still keep Active on 111, op 3 on 110, op 5
  still Disposed, op 9 still unlisted.
- `mr7-release-step`: malformed wipe and read-back 1101, unlisted read-back
  and freed token 1111, Quarantined stays 1101, re-alloc length and residue
  class 1101/1111, clean release still 1000.
- `mr7-cycle`: cycle verdict unchanged (110), cycle step 1101/1111 under both
  op 7 and op 8, clean cycle step 1000.
- `mr7-mutants`: five mutants (guard off, guard narrowed to op 8, guard
  widened to every op, 110 arm keeping state, 111 arm keeping state), each
  must move a pinned value.

## Still open

- 110/111 on ops 0-6 still keep the state (MR3 table); a table-wide change is
  a separate row.
- Nothing calls the release steps from a production path yet; that wiring is
  SLIDE's (production is GIR to SLIDE).
- On-target zero-on-release (VOK `secret_arena.rs`, Linux runner) and H5
  `PR_SET_DUMPABLE=0` still need Phillip/VOK.