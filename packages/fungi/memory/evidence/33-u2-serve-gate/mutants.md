# Q33 mutants (all RED then restored; withMutant try/finally)

Temp copy is the landed serve-gate.fungi restored in finally. Tracked compiler source is never written. Flatten harness inlines c-boundary for invoke. Deadlines are harness-only.

| file:line (unique from-string) | change | red test name | red observation | restore |
|---|---|---|---|---|
| serve-gate.fungi pathProtection pathClass == 6 | return 2 -> return 0 | mutant null-path-as-unprotected goes RED then restore | pathClass 6 packed != 102 | 102 |
| serve-gate.fungi pathProtection pathClass == 1 | return 1 -> return 0 | mutant drop trailing-slash normalisation goes RED then restore | pathClass 1 packed != 101 | 101 |
| serve-gate.fungi effectSecretClass | unlistedEffectSecretDefault 4 -> 0 | mutant unlisted effect non-secret goes RED then restore | effectClass 99 packed == 100 | 104 |
| serve-gate.fungi classifyServeRoute before pathProtection | insert `if layer == 1 { return finish(0, true) }` | mutant remove startServer layer check goes RED then restore | layer 1 pathClass 0 packed == 100; layer 0 still 101 | 101 |
| serve-gate.fungi reachSecretClass | unlistedReachSecretDefault 4 -> 0 | mutant unlisted reach class admitted goes RED then restore | reachClass 99 packed == 100 | 104 |
| serve-gate.fungi effectReason != 0 | made dead `== 99` | mutant effect foreign classTag check dead goes RED then restore | effectClassClass 3 packed != 110 | 110 |
| serve-gate.fungi reachReason != 0 | made dead `== 99` | mutant reach foreign classTag check dead goes RED then restore | reachClassClass 3 packed != 110 | 110 |
| serve-gate.fungi pathProtection pathClass == 6 | return 2 -> 0 | F1 tamper pathClass 6 turns differential RED | packed != 102 | 102 |
| serve-gate.fungi pathProtection pathClass == 0 | return 1 -> 0 | F1 tamper pathClass 0 turns differential RED | packed != 101 | 101 |
