# Q38 mutants (all RED then restored; withMutant try/finally)

Mutant string is built in memory and flattened into the mkdtemp dir. Tracked compiler source is never written.

| file:line (unique from-string) | change | red test name | red observation | restore |
|---|---|---|---|---|
| signet-grant-seal.fungi pqAvailable arm | finish(14) -> finish(0) | RED mutant accept classical-only as hybrid issue | pqAvailable 0 packed 100, not 114 | 114 |
| signet-grant-seal.fungi suite unknown arm | finish(13) -> finish(0) | RED mutant drop suite-id unknown check | suiteId 2 packed 100, not 113 | 113 |
| signet-grant-seal.fungi sink Failed arm | finish(27) -> finish(0) | RED mutant map sink Failed to CONSUMED | sink 1 packed 100, not 127 | 127 |
| signet-grant-seal.fungi ttl < 1 arm | finish(9) -> finish(0) | RED mutant accept TTL 0 | ttl 0 packed 100, not 109 | 109 |
| signet-grant-seal.fungi overflow arm | != -> == 99 | RED mutant drop overflow check | clock max ttl 1 packed 100, not 112 | 112 |
| signet-grant-seal.fungi forged arm | finish(2) -> finish(1) | RED mutant map forged absent to Unknown | sealKind 3 packed 101, not 102 | 102 |
| signet-grant-seal.fungi classify default | finish(11) -> finish(0) | RED mutant turn classification default into Assured | sealKind 9 packed 100, not 111 | 111 |
| signet-grant-seal.fungi serialize-first | == 0 -> == 99 | RED mutant serialise before validating | validated 0 packed 106, not 143 | 143 |
| signet-grant-seal.fungi unlisted exit | finish(48) -> finish(0) | RED mutant unlisted exit reaches stdout parsing | childExit 99 packed 100, not 148 | 148 |
| signet-grant-seal.fungi trit plus nonzero | finish(51) -> finish(0) | RED mutant accept trit plus one with nonzero exit | trit 1 exit 1 packed 100, not 151 | 151 |
| signet-grant-seal.fungi verify finish(6) | finish(6) -> finish(0) | RED mutant swallow cleanup error | verify cleanup 1 packed 100, not 106 | 106 |
| signet-grant-seal.fungi consumeStep | consumeStep -> return guard | RED mutant F1 remove consumeStep | presentToken 0 packed 100, not 105 | 105 |
| signet-grant-seal.fungi post finish(6) | finish(6) -> finish(0) | RED mutant F2 return packed 100 on listed cleanup | listed cleanup packed 100, not 106 | 106 |
| signet-grant-seal.fungi trit allow gate | == 0 -> == 99 | RED mutant F4 skip trit allow gate | trit 0 exit 0 packed 106, not 159 | 159 |
| signet-grant-seal.fungi grantEpoch compare | != -> == 99 | RED mutant F5 skip grantEpoch versus currentEpoch | grant 1 current 2 packed 100, not 118 | 118 |
| signet-grant-seal.fungi testHook | finish(54) -> finish(0) | RED mutant production test hook admitted | testHook 1 packed 100, not 154 | 154 |
| signet-grant-seal.fungi Indeterminate arm | finish(6) -> releaseGuard pass-through | RED mutant F1 restore releaseGuard on Indeterminate | sink 3 auth 0 packed 105, not 106 | 106 |
