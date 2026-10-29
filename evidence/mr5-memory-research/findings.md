# MR5 memory research: release, re-alloc read and handle-gated use

Gap map rows: 2.4 (release then re-alloc reads zero), 2.5 / H8 (handle reuse
after release refused), H6 caller side (zero on release is checked, not
assumed). Scope: `.fungi` only (TS stays frozen reference), synthetic integer
inputs, no secret bytes anywhere in the tests.

## What was added (packages/fungi/memory/src/secret-arena.fungi)

| Flow | Rule |
| --- | --- |
| `arenaRelease` | `arenaSlotCheck` first, so a stale or double release is 150 before any wipe and can never wipe a slot already handed to someone else. Then wipe (117/106 wins), then read-back: any non-zero byte 117, negative count 106. Generation 2147483646 is wiped but answers 140 (exhausted, quarantine), never wrapped. |
| `arenaReleaseNextGeneration` | slot generation + 1 only after a committed release (100); every refusal or failure answers 0, which `arenaSlotCheck` refuses as 140. |
| `arenaReallocRead` | 100 only when the previous release committed (100), the new generation is exactly prior + 1 (else 150; < 1 or Int max 140), the read covers the whole expected length (>= 1 byte, else 106), and every byte reads zero (else 117). |
| `arenaHandleLeasedUse` | `arenaSlotCheck` gates `arenaLeasedUse`: a freed (use after release), stale, invalid or unlisted handle is refused before any lease opens or byte is read. A live handle gets exactly `arenaLeasedUse` (differential test). |
| `arenaHandleLeasedUseStep` | the above through `arenaStep` op 3: stale keeps state (1500), invalid quarantines (1401). |

## Decisions (provisional, full auto)

- D-1: release checks the handle before wiping. A stale handle's wipe would
  zero the new owner's bytes, which is a denial of service and hides the bug.
- D-2: generation exhaustion still wipes. Refusing the release would leave
  plaintext in the slot; the slot is quarantined (140) instead of wrapped.
- D-3: a zero read after a failed or unknown release is still 106 UNKNOWN. The
  zero claim needs a committed wipe, not a lucky read.
- D-4: an empty re-alloc read (expected length 0) proves nothing and is 106.
- D-5: a stale handle on use keeps the arena Active (150 is a caller bug, as in
  MB-12); an invalid or exhausted generation (140) quarantines through the
  existing `arenaStateAfter` table. No new codes were needed.

## Tests (packages/fungi/memory/tests/mr5-release-realloc)

- `mr5-release.test.mjs` R1-R8: clean release, double release, stale and
  forged handles (wipe never reached), wipe failure order, read-back residue,
  exhaustion, next-generation rule, generation 0 failing closed downstream.
- `mr5-realloc.test.mjs` A1-A6: zero read, residue, no claim without a
  committed release, exact generation step and wrap refusal, full-length read,
  full release -> bump -> zero read chain with the old handle refused.
- `mr5-handle-use.test.mjs` H1-H4: differential against `arenaLeasedUse`,
  use after release refused before lease/read, invalid handles, step pairing.
- `mr5-mutants.test.mjs` M1-M11: one killing mutant per new guard (slot gate
  in release, wipe verdict, read-back, wrap guard, bump, failure generation,
  uncommitted release, generation step, residue, short read, handle gate).

## Still open

- The real zero-on-release check stays on the VOK side
  (`secret_arena.rs` write_volatile + read_volatile read-back); its on-target
  test is `#[ignore]` and needs a Linux runner (Phillip/VOK).
- H5 `PR_SET_DUMPABLE=0` in the Rust custodian (Phillip/VOK).
- Release is not a listed op in `arenaStateAfter` (ops 0-6), so there is no
  `arenaReleaseStep` yet; adding op 7 changes the MR3/MR4 pinned op range and
  is left for a separate row.
