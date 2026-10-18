# Q32 mutants (all RED then restored)

| change | red test | red observation | restore |
|---|---|---|---|
| consume epoch mismatch returns 0 | mutant skip epoch compare | value !== 104 | 104 |
| absent randomness returns 0 | mutant accept fallback nonce | value !== 102 | 102 |
| ack without audit returns 1 | mutant drop audit-before-ack | value !== 106 | 106 |
| scanned != lenA ignored | mutant bytesEqual early-exit | value !== 102 | 102 |
| competitor 1 returns 0 | mutant swap Q07 competitor order | value !== 102 | 102 |
