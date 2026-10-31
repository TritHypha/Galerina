# MEM-R22: one-use lease receipt, .fungi side (gap map row 1.1)

Date: 2026-10-31. Branch `grok/mem-r22-fungi-lease-receipt-20261031` from Galerina main `3d315bfaf`.
Synthetic integers only; no secret bytes exist in these tests.

## Gap

Row 1.1 asks that a second `getSecret` on the same lease is refused, leaves one
DENY receipt and carries no bytes. SLIDE covered it in MEM-R10 and the Rust VOK
lease audit in MEM-R14; `secret-arena.fungi` had one live lease per name
(MR3 151 LEASE_ALREADY_LIVE) but nothing that made a lease single-use or tied it
to exactly one receipt.

## What changed (`packages/fungi/memory/src/secret-arena.fungi`)

- `arenaLeaseSpend(spentClass, spentCount, receiptClass, receiptCount)`:
  100 unspent with no receipt; new code 152 LEASE_SPENT for a spent lease with
  its one receipt; 106 UNKNOWN + quarantine when the spent mark and receipt
  count disagree (used without a receipt, orphan receipt), are negative or
  exceed one; 111 / 110 for foreign classes.
- `arenaLeaseReceiptOutcome(verdict)`: the receipt outcome as a K3 Int:
  100 is 1 ALLOW; listed refusals (102 110 111 113 114 115 116 141 147 150 151
  152) are -1 DENY; 106, 117 and every unlisted verdict are -128 UNKNOWN,
  never 0, so a gate admitting only ALLOW refuses them (strong Kleene, gates
  refuse UNKNOWN).
- `arenaOneUseLeasedUse(4 spend params + the 28 arenaLeasedUse params)`: the
  spend gate runs before the lease opens, so 152 / 106 / 111 / 110 return
  before any read and do not depend on any use input. An unspent lease returns
  exactly the `arenaLeasedUse` verdict.
- `arenaOneUseReceiptsAfter(...)`: derived receipt count after one attempt:
  1 after an admitted first attempt whatever its verdict, still 1 after a
  refused reuse (no second receipt), 11 (untrusted, caller quarantines)
  otherwise. It can never reach 2.
- 152 deliberately has no Step wrapper: through `arenaStep` it is an unlisted
  verdict for `arenaStateAfter` and quarantines (fail closed). Pinned.

## Tests (`packages/fungi/memory/tests/mr22-fungi-receipt/`, 25 tests)

- spend table incl. negative, >1, i32 max and foreign classes;
- differential: 13 use-input variants give the same verdict as
  `arenaLeasedUse` when unspent, and all give 152 when spent and 106 when the
  receipt invariant is broken (no use input reaches the result);
- K3 outcome table (12 DENY, 19 UNKNOWN incl. 0, -1, -128, 1000), never 0;
- receipt count grid over spent/receipt in {-1,0,1,2}: only 1 or 11;
- two-attempt sequence: ALLOW receipt, then 152 / DENY with the count still 1;
  a failed first use (117) still writes its one receipt, as UNKNOWN;
- 152 through `arenaStep` (ops 3, 6) quarantines;
- mutants 6/6 killed: R1 receipt-agreement check dropped, R2 spend gate
  skipped, R3 UNKNOWN written as 0, R4 152 outcome turned UNKNOWN, R5 refused
  reuse writing a second receipt, R6 spent arm admitting a second use.

MR20 canary sweep now covers the four new flows; its closed result set gains
-128 (K3 UNKNOWN from `arenaLeaseReceiptOutcome` on a canary verdict).

## Block test

MR22 25/25; MR20 (all shards) + MR3..MR7 + 45 host-adapter audit 224/224;
`audit-fungi-memory-folder` FOLDER_ADMITTED; code-index regenerated.

## Still open

Wiring a real receipt store (the counts here are caller-supplied readings, as
everywhere in this file) belongs to SLIDE production admission; this row pins
the .fungi semantics in lock-step with SLIDE MEM-R10.