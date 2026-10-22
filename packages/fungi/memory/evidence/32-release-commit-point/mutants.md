# Q32-03 mutants (all RED then restored; withMutant try/finally B8)

| change | red test | red observation | restore |
|---|---|---|---|
| consume epoch mismatch returns 0 | mutant skip epoch compare | value !== 104 | 104 |
| absent randomness returns 0 | mutant accept fallback nonce | value !== 102 | 102 |
| ack without audit returns 1 | mutant drop audit-before-ack | value !== 106 | 106 |
| scanned != lenA ignored | mutant bytesEqual early-exit | value !== 102 | 102 |
| competitor 1 returns 0 | mutant swap Q07 competitor order | value !== 102 | 102 |
| consume unlisted lease finish(0) | mutant B1 consume unlisted lease | value !== 111 | 111 |
| reissue existingLease 1 as finish(0) | mutant B2 reissue as fresh mint | value !== 107 | 107 |
| skip issuedHereToken == 0 | mutant B2 skip issuedHere missing | value !== 105 | 105 |
| skip independentAuthToken == 0 | mutant B3 skip independent auth | value !== 105 | 105 |
| skip preparedCustodyToken == 0 | mutant B3 skip prepared custody | value !== 105 | 105 |
| skip cleanupEvidence == 2 | mutant B3 skip cleanup pending | value !== 106 | 106 |
| skip NotRequired empty-set | mutant B3 skip NotRequired empty-set | value !== 102 | 102 |
| skip consumedAuthorityToken == 0 | mutant B3 skip consumed authority | value !== 106 | 106 |
| skip currentValidityToken == 0 | mutant B3 skip current validity | value !== 106 | 106 |
| kind 5 drain admits 0 | mutant S1 drain as delivery | value !== 111 | 111 |
| kind 7 close admits 0 | mutant S1 close as file release | value !== 111 | 111 |
| kind 8 transferred admits 0 | mutant S1 transferred undelivered | value !== 111 | 111 |
| kind 9 error-after-write admits 0 | mutant S1 error-after-write as zero effect | value !== 106 | 106 |
| kind 14 crash-before-begin as 2 | mutant S1 crash-before-begin as REFUSE | value === 102 | 111 |
| after-begin stale maps to Refused | mutant S2 after-begin stale as Refused | value !== 106 | 106 |
| revokeDelivery released finish(0) | mutant S3 no-op as released | value !== 108 | 108 |
| casBegin FAILED 4 admits 100 | mutant F1 casBegin FAILED admitted 100 | value === 100 | 102 |
| casCommit INDETERMINATE 5 admits 100 | mutant F1 casCommit INDETERMINATE as 100 | value === 100 | 106 |
| outcomeClass 6 as Success | mutant F1 DELIVERY_UNKNOWN as Success | value === 100 both phases | 106 |
| outcomeClass 2 as Success | mutant F1 fenced as Success | value === 100 both phases | 102 |
| reissue fenced as fresh 100 | mutant F1 reissue fenced as fresh 100 | value === 100 | 107 |
| reissue DU as fresh 100 | mutant F1 reissue DU as fresh 100 | value === 100 | 107 |
| unlisted after-begin as Refused 102 | mutant F2 unlisted after-begin as Refused 102 | value === 102 | 106 |
| consume skips releaseGuard | mutant F3 skip releaseGuard on consume | value === 100 with guard 105 | 105 |
| mint present 0 lease != 0 admits | mutant F6 mint skip inconsistent pair | value !== 111 | 111 |
| recovery present 0 lease != 0 admits | mutant F6 recovery skip inconsistent pair | value !== 111 | 111 |
| consumeStep guardOutcome range dead | mutant G1 guardOutcome range check dead | guard 0 raw 0; guard 101 raw 101 | 111 |
