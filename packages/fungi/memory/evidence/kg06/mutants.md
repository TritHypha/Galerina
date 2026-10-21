# KG-06 mutants

| id | change | vector | expected |
|---|---|---|---|
| m6a | drop `[lo, hi]` range check; classTag 0 returns 0 | `readForeignBoundedInteger(0, 99, 0, 16)` | RED 0 (was 8) |
| m6b | default arm returns 0 instead of 11 | tag 99 | RED 0 (was 11) |
| m6c | hi check returns 0 (widen) | value 17 with hi 16 | RED 0 (was 8) |
| m6d | classTag 8 returns 0 | tag 8 value 4 in [0,16] | RED 0 (was 8) |
| m6e | `readForeignByte` reverts to unbounded `readForeignSafeInteger` | byte 256 | RED 0 (was 8) |
