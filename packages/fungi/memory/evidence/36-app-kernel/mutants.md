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
| U07 spent applyFinalize acked==100 success | kernel.fungi applyFinalize | `if acked == 100 { return finish(6, true)` -> finish(0) | T5 EQUIVALENT: standalone ackStep on applyFinalize args (epochClass 0, auditCommitted 1) never packed 100; U07 mutant still 106 | never 100 |

## 47a composed body-reader 20-arg ABI

Old 13-arg Bool ABI call at tests/36-app-kernel/kernel.test.mjs:663 re-pointed to ACKed 20-arg `readChunksArgs`. OverCap packed 105; admitBody 123; preDispatch skips dispatch. Flatten `stripBodyFinish` is packer-only; it does not encode the old ABI.

| claim | file | needle | red test | landed restore |
|---|---|---|---|---|
| (a) old 13-arg call | kernel.test.mjs F1 composed body-reader | `[1, 1, 0, 16385, 0, 0, 0, 16384, false, 0, true, false, false]` put back | mutant 47a old 13-arg readChunks call goes RED then restore | 105 then 123 skip dispatch |
| (b) cap compare off by one | body-reader.fungi in-memory | nChunks==1 `if len1 > cap` → `if len1 > cap + 1` (maxInt1 unique) | mutant 47a body-reader cap compare off by one goes RED then restore | 105 |
| (c) classTag gate dropped on cap | body-reader.fungi in-memory | `if capClass != 0 { return finish(11, true) }` → `if capClass == 999` | mutant 47a drop cap classTag gate goes RED then restore | 111 |

Tracked body-reader.fungi sha256 asserted unchanged in `withBodyMutant` finally. Offset+len overflow probe packed 114 matches tests/31-body-reader/body-reader.test.mjs `MUST-REFUSE offset plus length overflow`.
