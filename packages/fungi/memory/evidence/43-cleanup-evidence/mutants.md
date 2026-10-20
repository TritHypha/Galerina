# Q43 mutants (all RED then restored; withMutant try/finally)

Mutant string is built in memory and flattened into the mkdtemp dir. Tracked compiler source is never written. Flatten harness inlines the frozen helper for invoke.

| file:line (unique from-string) | change | red test name | red observation | restore |
|---|---|---|---|---|
| cleanup-evidence.fungi opIdCheckOn | 1 -> 0 | RED mutant skip the opId compare | mismatched DONE packed 100, not 102 | 102 |
| cleanup-evidence.fungi genCheckOn | 1 -> 0 | RED mutant skip the generation compare | mismatched DONE packed 100, not 103 | 103 |
| cleanup-evidence.fungi digestCheckOn | 1 -> 0 | RED mutant skip the digest compare | mismatched DONE packed 100, not 104 | 104 |
| cleanup-evidence.fungi pendingRefuseOn | 1 -> 0 | RED mutant admit PENDING | PENDING packed 100, not 105 | 105 |
| cleanup-evidence.fungi unknownRefuseOn | 1 -> 0 | RED mutant admit UNKNOWN | UNKNOWN packed 100, not 107 | 107 |
| cleanup-evidence.fungi nonemptySecretReleaseEmpty | 0 -> 1 | RED mutant NOT_REQUIRED on a non-empty class | opClass 2 packed 101, not 108 | 108 |
| cleanup-evidence.fungi generationMismatchCode | 3 -> 2 | RED mutant merge two mismatch codes | generation packed 102, not 103 | 103 |
| cleanup-evidence.fungi afterBeginFailedCode | 6 -> 2 | RED mutant after-begin failure mapped to REFUSED | FAILED after begin packed 102, not 106 | 106 |
| cleanup-evidence.fungi afterBeginPendingCode | 6 -> 2 | RED mutant after-begin PENDING mapped to REFUSED | PENDING after begin packed 102, not 106 | 106 |
| cleanup-evidence.fungi afterBeginUnknownCode | 6 -> 2 | RED mutant after-begin UNKNOWN mapped to REFUSED | UNKNOWN after begin packed 102, not 106 | 106 |
| cleanup-evidence.fungi afterBeginDoneCode | 6 -> 0 | RED mutant after-begin DONE mapped to success | DONE after begin packed 100, not 106 | 106 |
| cleanup-evidence.fungi afterBeginNotRequiredCode | 6 -> 0 | RED mutant after-begin NOT_REQUIRED mapped to success | NOT_REQUIRED after begin packed 100, not 106 | 106 |
| cleanup-evidence.fungi phaseBeforeBeginCode | 12 -> 11 | RED mutant phaseToken 0 collapsed to Unlisted | phase 0 packed 111, not 112 | 112 |
| cleanup-evidence.fungi quarantinedReuseRefuseOn | 1 -> 0 | RED mutant QUARANTINED to LIVE allowed | reuse packed 120, not 114 | 114 |
| cleanup-evidence.fungi wipedReuseRefuseOn | 1 -> 0 | RED mutant WIPED reuse admitted | WIPED reuse packed 120, not 114 | 114 |
| cleanup-evidence.fungi wipedReleaseRefuseOn | 1 -> 0 | RED mutant WIPED release admitted | WIPED release packed 120, not 115 | 115 |
| cleanup-evidence.fungi freeIsNotDoneOn | 1 -> 0 | RED mutant free counted as DONE | free packed 100, not 117 | 117 |
| cleanup-evidence.fungi wipeStepReportedCode | 18 -> 0 | RED mutant wipe-step-reported collapsed to AdmitDone | wipe step packed 100, not 118 | 118 |
| cleanup-evidence.fungi mintedCheckOn | 1 -> 0 | RED mutant accept an unminted value | unminted DONE packed 100, not 109 | 109 |
| cleanup-evidence.fungi evOpIdForeignOn | 1 -> 0 | RED mutant skip evOpId foreign gate | evOpId classTag 3 packed 100, not 110 | 110 |
| cleanup-evidence.fungi callOpIdForeignOn | 1 -> 0 | RED mutant skip callOpId foreign gate | callOpId classTag 3 packed 100, not 110 | 110 |
| cleanup-evidence.fungi evGenForeignOn | 1 -> 0 | RED mutant skip evGen foreign gate | evGen classTag 3 packed 100, not 110 | 110 |
| cleanup-evidence.fungi callGenForeignOn | 1 -> 0 | RED mutant skip callGen foreign gate | callGen classTag 3 packed 100, not 110 | 110 |
| cleanup-evidence.fungi evDigestForeignOn | 1 -> 0 | RED mutant skip evDigest foreign gate | evDigest classTag 3 packed 100, not 110 | 110 |
| cleanup-evidence.fungi callDigestForeignOn | 1 -> 0 | RED mutant skip callDigest foreign gate | callDigest classTag 3 packed 100, not 110 | 110 |
| cleanup-evidence.fungi unlistedOpClassRefuseOn | 1 -> 0 | RED mutant unlisted opClass admitted | opClass 9 DONE packed 100, not 111 | 111 |
