# Q34 mutants (all RED then restored; withMutant try/finally)

Mutant string is built in memory and flattened into the mkdtemp dir. Tracked compiler source is never written. Flatten harness inlines the frozen helper plus release-commit-point for invoke. Landed source has no constant-guarded admit branch (queue 33 F3). Typed sentinel UNIT_SOURCE_LANDING (queue 34 N4).

| file:line (unique from-string) | change | red test name | red observation | restore |
|---|---|---|---|---|
| secret-gate.fungi admit missing-epoch arm | finish(3) -> finish(0) | RED mutant accept missing epoch | empty+provider no epoch packed 100, not 103 | 103 |
| secret-gate.fungi admit faulted arm | finish(1) -> finish(0) | RED mutant admit on faulted | presenceStatus 2 packed 100, not 101 | 101 |
| secret-gate.fungi post twice arm | finish(14) -> finish(0) | RED mutant allow second callback | callback 2 packed 100, not 114 | 114 |
| secret-gate.fungi post wipe arm | wipeResult != 0 -> == 99 | RED mutant skip wipe check | wipeResult 1 packed 106, not 117 | 117 |
| secret-gate.fungi presence default arm | finish(11) -> finish(0) | RED mutant drop the default arm | presenceStatus 9 packed 100, not 111 | 111 |
| secret-gate.fungi empty-require admit | finish(0) -> finish(1) | F1 tamper empty-require admit 0 to 1 | empty no-provider packed not 100 | 100 |
| secret-gate.fungi undeclared arm | finish(12) -> finish(0) | F1 tamper undeclared 12 to 0 | declaredToken 0 packed not 112 | 112 |
| secret-gate.fungi epochMint versus epochUse | != -> == 99 | RED mutant F1 skip epochMint versus epochUse | mint 1 use 2 packed 100, not 118 | 118 |
| secret-gate.fungi consumeStep call | consumeStep body -> finish(6,true) | RED mutant F2 remove consumeStep | presentToken 0 packed 106, not 105 | 105 |
| secret-gate.fungi consumed==100 arm | finish(6) -> finish(0) | RED mutant F3 return packed 100 on listed cleanup | listed cleanup packed 100, not 106 | 106 |
| secret-gate.fungi prePacked gate | != 100 -> == 99 | RED mutant F4 skip prePacked gate | prePacked 112 packed 106, not 111 | 111 |
| secret-gate.fungi releaseGuard 6th arg | currentValidityToken -> 1 | RED mutant F1 fabricate current validity as 1 | validity 0 + present 0 packed 105, not 106 | 106 |
| secret-gate.fungi consumedAuthority-constant (Grok M15) | n/a | EQUIVALENT | MB-06 106 / consumeStep re-check | n/a |
| secret-gate.fungi guard-result-ignored (Grok M29) | n/a | EQUIVALENT | MB-06 106 / consumeStep re-check | n/a |
