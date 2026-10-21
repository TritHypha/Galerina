# Q37 SECRET_ARENA mutants

All mutants are in-memory (`unitSourceOverride` / `portSourceOverride`) flattened into a temp dir. Tracked `secret-arena.fungi` and `secret-arena-custodian-port.fungi` sha256 asserted unchanged in `finally`. Landed tests sit outside `withMutant`.

| claim | file | needle | red test | landed restore |
|---|---|---|---|---|
| unlisted has never absent | secret-arena.fungi arenaHas | frameDecoded == 11 finish(6) → finish(1) | unlisted status 9 admits 101 | 106 |
| empty status never Active | secret-arena.fungi arenaStatus | dataLen != 1 finish(21) → finish(0) | empty frame admits 100 | 121 |
| 7-byte epoch refused | secret-arena.fungi arenaEpoch | dataLen != 8 finish(40) → finish(0) | 7-byte admits 100 | 140 |
| STALE_EPOCH | secret-arena.fungi arenaEpoch | epochValue < lastEpoch finish(39) → finish(0) | decreasing admits 100 | 139 |
| quarantine one-way | secret-arena.fungi arenaHas | statePacked == 101 finish(6) → finish(0) | quarantined has admits 100 | 106 |
| wipe failed never success | secret-arena.fungi listedWipe | wipeToken == 1 finish(17) → finish(0) | failed wipe admits 100 | 117 |
| unknown wipe read-back | secret-arena.fungi listedWipe | wipeToken == 2 finish(6) → finish(0) | unknown wipe admits 100 | 106 |
| dispose never Verified | secret-arena.fungi arenaDispose | cleanup OK return finish(6) → finish(0) | dispose admits 100 | 106 |
| status default arm | secret-arena-custodian-port.fungi decodeFrameStatus | return 11 → return 0 | unlisted frame admits present 100 | 106 |
| lastEpoch overflow before +1 | secret-arena.fungi arenaEpoch | lastEpoch > 2147483647 - 1 finish(40) → finish(0) | quarantined last max admits 100 | 140 |
| second dispose closed sum | secret-arena.fungi arenaDispose | default finish(11) → return recordedPacked | recorded 0 passthrough 0 | 111 |
| wipeWins over later refusal | secret-arena.fungi wipeWins | wiped == 117 return wiped → finish(0) | wipe-failed + lenClass 3 admits 110 | 117 |

No wait loop and no live getter are source probes on landed files (adding a `while` or a getter would be a new language path this unit refuses to carry). Skip-wipe CALL is covered by the listedWipe failed/unknown arms: a success token in place of 117/106 is RED. Follow-up 05: wipeWins makes 117/106 win on every later exit; arenaEpoch overflow-gates lastEpoch + 1; arenaDispose Disposed is a closed sum 144/106/100→106 else 111.
