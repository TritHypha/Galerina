# Q34 mutants (all RED then restored; withMutant try/finally)

Mutant string is built in memory and flattened into the mkdtemp dir. Tracked compiler source is never written. Flatten harness inlines the frozen helper plus release-commit-point for invoke. Landed source has no constant-guarded admit branch (queue 33 F3).

| file:line (unique from-string) | change | red test name | red observation | restore |
|---|---|---|---|---|
| secret-gate.fungi admit missing-epoch arm | finish(3) -> finish(0) | RED mutant accept missing epoch | empty+provider no epoch packed 100, not 103 | 103 |
| secret-gate.fungi admit faulted arm | finish(1) -> finish(0) | RED mutant admit on faulted | presenceStatus 2 packed 100, not 101 | 101 |
| secret-gate.fungi deliver twice arm | finish(14) -> finish(0) | RED mutant allow second callback | callback 2 packed 100, not 114 | 114 |
| secret-gate.fungi deliver wipe arm | wipeResult != 0 -> == 99 | RED mutant skip wipe check | wipeResult 1 packed 100, not 117 | 117 |
| secret-gate.fungi presence default arm | finish(11) -> finish(0) | RED mutant drop the default arm | presenceStatus 9 packed 100, not 111 | 111 |
| secret-gate.fungi empty-require admit | finish(0) -> finish(1) | F1 tamper empty-require admit 0 to 1 | empty no-provider packed not 100 | 100 |
| secret-gate.fungi undeclared arm | finish(12) -> finish(0) | F1 tamper undeclared 12 to 0 | declaredToken 0 packed not 112 | 112 |
