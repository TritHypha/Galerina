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
