# MR3 memory research: .fungi port of the MR2 todo targets

Run: Grok work driver gcw-wd-9af6fdb8, 2026-10-28. Base: Galerina main c20cbbf6c.
Branch: grok/mem-r3-fungi-arena-20261028. Status: PROVISIONAL (Grok decision, full auto; logged in AGENTS LEDGER-002).

## Why

MR2 (evidence/mr2-memory-research/findings.md) pinned seven zero-trust targets as
`todo` against the frozen TypeScript reference, because the TS provider is laxer
than the .fungi target and TS is frozen. MR3 pins all seven on the .fungi unit
`packages/fungi/memory/src/secret-arena.fungi`, so the target is now enforced code,
not a todo. The MR2 TS todo tests stay as they are (TS is reference only).

## Target by target

| MR2 target | .fungi before MR3 | MR3 result |
| --- | --- | --- |
| has-long | arenaHas already 106 for dataLen != 1 | pinned; new state-after proves quarantine |
| status-empty | arenaStatus already 121 | pinned |
| status-long | arenaStatus already 121 | pinned |
| status-two | arenaStatus already 121 | pinned |
| put-extra | arenaPut had no reply-length input, extra bytes unseen | new `arenaPutExact`: OK reply must be exactly 0 data bytes, else 106 |
| epoch-long | arenaEpoch 140 but no defined state effect | new `arenaStateAfter`: 140 quarantines (answers the MR1 open question: yes) |
| nested same-name lease (1.6) | no flow | new `arenaLeaseOpen` / `arenaLeaseClose`: exactly one live lease per name |

## New flows

- `arenaPutExact` (18 params): runs `arenaPut` first and passes any non-ok verdict
  through unchanged. On ok, the reply length must be exactly 0 (extra or negative
  is 106 UNKNOWN plus quarantine). The reply buffer wipe is checked on every exit
  and a failed (117) or unknown (106) reply wipe wins over ok. This also closes the
  MR2 note that the TS `put()` leaves reply data unwiped.
- `arenaStateAfter(op, state, packed)`: the one-way state machine. Disposed is
  final; dispose of any listed state is Disposed; 141 is Disposed; Partial and
  Quarantined never return to Active; 106, 117, 121, 139 and 140 quarantine; a
  listed benign code keeps state; any other packed code quarantines (fail closed).
- `arenaLeaseOpen`: Active with 0 live leases admits 100; 1 live lease is refused
  with the new code 151 LEASE_ALREADY_LIVE (state kept); a negative or >1 count
  means the invariant is already broken and is 106 plus quarantine.
- `arenaLeaseClose`: exactly one live lease closes 100; double close or a broken
  count is 106 plus quarantine.

## Decisions (Grok, provisional)

1. A wrong-length or malformed epoch frame (140) quarantines. Keeps the 140 code
   (no churn for existing callers); the quarantine is in the state transition.
2. An epoch that moves backwards (139 STALE) quarantines: a custodian rolling its
   epoch back is untrusted.
3. A failed reply wipe (117) quarantines, like every other wipe failure.
4. New packed code 151 LEASE_ALREADY_LIVE (next free after 150 STALE_HANDLE).

No existing flow's return codes changed; the existing suites are the regression check.

## Tests

`packages/fungi/memory/tests/mr3-fungi-arena/`: harness plus length-exact,
put-exact, state-after, lease-per-name and seven killing mutants (MR3-M1..M7),
each run on a flattened temp copy with the tracked source sha256 checked unchanged.

## Still open (not in MR3)

- Wiring: nothing calls `arenaPutExact`, `arenaStateAfter` or the lease flows yet;
  the SLIDE/runtime caller must adopt them. Owed as a follow-up row.
- 2.4 zero-on-release re-allocation and H5 PR_SET_DUMPABLE (Rust, needs Phillip / VOK row).
