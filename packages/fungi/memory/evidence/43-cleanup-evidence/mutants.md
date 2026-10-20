# Q43 mutants (all RED then restored; withMutant try/finally)

Temp copy is the landed cleanup-evidence.fungi restored in finally. Tracked compiler source is never written. Flatten harness inlines the frozen helper for invoke.

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
| cleanup-evidence.fungi quarantinedReuseRefuseOn | 1 -> 0 | RED mutant QUARANTINED to LIVE allowed | reuse packed 120, not 114 | 114 |
| cleanup-evidence.fungi freeIsNotDoneOn | 1 -> 0 | RED mutant free counted as DONE | free packed 100, not 117 | 117 |
| cleanup-evidence.fungi mintedCheckOn | 1 -> 0 | RED mutant accept an unminted value | unminted DONE packed 100, not 109 | 109 |
