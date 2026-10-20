# Q36 APP_KERNEL mutants

All mutants are in-memory (`unitSourceOverride` / `portsSourceOverride`) flattened into a temp dir. Tracked `kernel.fungi` and `kernel-ports.fungi` sha256 asserted unchanged in `finally`. Landed tests sit outside `withMutant`.

| claim | file | needle | red test | landed restore |
|---|---|---|---|---|
| deadline covers every gate | kernel.fungi applyClock | `if clock > armedAt + budget - 1 { return finish(47, true)` → finish(0) | clock past budget admits 100 | 147 |
| rate jump never resets | kernel.fungi applyRate | `if jumpToken != 0 { return finish(28, true)` → finish(0) | forward jump admits 100 | 128 |
| ack only after audit | kernel.fungi applyFinalize | `if auditPacked != 100 { return finish(44, true)` → finish(6) | audit fail 144 drops to 106 | 144 |
| swallow ack-downgrade | kernel.fungi applyFinalize | `if acked == 101 { return finish(6, true)` → finish(0) | spent success admits 100 | 106 |
| port throw stays UNKNOWN | kernel-ports.fungi reserveIdempotency | `if claimToken == 4 { return finish(6, true)` → finish(11) | throw maps to REFUSED 111 | 106 |
| minted epoch bind | kernel.fungi applySecrets | `if mintedEpoch != secretEpoch { return finish(23, true)` → finish(0) | epoch mismatch leaves 123 | 123 |
| no unconditional delete after dispatch | kernel-ports.fungi settleIdempotency | `if settleToken == 1 { return finish(43, true)` → finish(0) | post-dispatch cancel admits 100 | 143 |
| no retry after dispatch | kernel-ports.fungi reserveIdempotency | alreadyReserved+dispatch finish(6) → finish(0) | retry leaves 106 | 106 |
| recovery default arm | kernel.fungi recoverLease | `if recovered == 111 { return finish(38, true) }` → finish(0) | unlisted admits 100 | 138 |
| slot released on every exit | kernel.fungi applyConcurrency | `if releasedToken == 0 { return finish(59, true)` → finish(0) | unreleased admits 100 | 159 |
| getSecret typed after deadline | kernel.fungi getSecretAccess | `if deadlineToken == 1 { return finish(52, true)` → finish(0) | grants 100 | 152 |
| bind minted op | kernel.fungi applySecrets | `if mintedOp != secretOp { return finish(35, true)` → finish(0) | mismatch leaves 135 | 135 |

Wipe mutant: packed +100 is a wipe construct only (LINEAR_SECRET CARRIED_UNKNOWN; no erase claim). Skip-one-wipe is typed UNKNOWN outside this unit (WIPE_OUTSIDE_UNIT); rcp owns finish(..., true).
## Follow-up 05 Grok survivors and killing tests

Grok IC @ a7ab0999 (sha256 794c43df): 23 RED, 8 survived. U00 control expected. U08 spent finalized passthrough is a redundancy probe (applyFinalize spent never returns 100); no action. Killing tests below are landed outside `withMutant`.

| claim | file | needle | red test | landed restore |
|---|---|---|---|---|
| U25 composed unspent finalize failure | kernel.fungi runPostDispatch | remove `if finalized != 100 { return finalized }` | T1 unspent audit 101 / consume 999 / consume 100 / dispatch 106 / dispatch 999 each 106 | 106 |
| U16 skip slot-release on finalize clock exit | kernel.fungi runPostDispatch | skip `if releasedFinalize != 100 { return releasedFinalize }` | T2 unspent deadline/backwards at finalize released 0 -> 159 | 159 |
| U17 skip slot-release on audit clock exit | kernel.fungi runPostDispatch | skip `if releasedAudit != 100 { return releasedAudit }` | T2 unspent deadline/backwards at audit released 0 -> 159 | 159 |
| U19 remove only clock2 < clock1 | kernel.fungi runPreDispatch | remove `if clock2 < clock1 { return finish(22, true) }` | T3 adjacent pre pair clock2 < clock1 with later clocks non-decreasing -> 122 | 122 |
| U20 remove only clockAudit < clockFinalize | kernel.fungi runPostDispatch | remove `if clockAudit < clockFinalize { ... finish(22, true) }` | T3 unspent audit < finalize released 1 -> 122 | 122 |
| U07 spent applyFinalize acked==100 success | kernel.fungi applyFinalize | `if acked == 100 { return finish(6, true)` -> finish(0) | T4 spent consume 100 audit 100 every ack outcome (present/match/epoch/lease) never 100 | never 100 |
