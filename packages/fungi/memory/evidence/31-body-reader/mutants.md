# Q31 mutants (all RED then restored)

| file:line (approx) | change | red test | red observation | restore |
|---|---|---|---|---|
| body-reader.fungi nChunks==1 len1 <= 0 | `<=` to `<` (admits zero-length) | mutant admit zero-length | value !== 104 | 104 |
| body-reader.fungi rangesOverlap | `<` to `<=` (closed interval) | mutant closed-interval overlap | adjacent !== 100 | 100 |
| body-reader.fungi streamPresentToken == 0 | finish(8, true) to finish(8, false) | mutant skip wipe | 8 (no +100) | 108 |
| c-boundary.fungi classTag == 3 | return 3 to return 0 | mutant accept NaN | 0 | 3 |
| body-reader.fungi nChunks==1 len1 > cap | `>` to `< 0` (drop cap) | mutant drop cap compare | value !== 105 | 105 |
| body-reader.fungi len2 > remaining | remaining < 0 (GM6) | mutant GM6 remaining compare | two-chunk cap+1 !== 105 | 105 |
| body-reader.fungi declaredLen < total | declaredLen < 0 (GM7) | mutant GM7 declared shorter compare | two-chunk declared shorter !== 107 | 107 |
| body-reader.fungi declaredPresent unlisted (GM9) | delete `declaredPresentToken != 1` finish(11) block | mutant GM9 declaredPresent token 2 | value !== 111 | 111 |
| body-reader.fungi deadline unlisted (GM10) | delete `deadlineExpiredToken != 1` finish(11) block | mutant GM10 deadline token 2 | value !== 111 | 111 |
| body-reader.fungi foreignThrow unlisted (GM11) | delete `foreignThrowToken != 1` finish(11) block | mutant GM11 foreignThrow token 2 | value !== 111 | 111 |
| body-reader.fungi nChunksClass != 0 (GM12) | delete nChunksClass finish(11) block | mutant GM12 nChunksClass != 0 | value !== 111 | 111 |
| body-reader.fungi declaredLenClass != 0 (GM14) | delete declaredLenClass finish(11) block | mutant GM14 declaredLenClass != 0 | value !== 111 | 111 |
| body-reader.fungi off1Class != 0 (GM15) | delete off1Class finish(11) block | mutant GM15 off1Class != 0 | value !== 111 | 111 |
| body-reader.fungi len1Class != 0 (GM16) | delete len1Class finish(11) block | mutant GM16 len1Class != 0 | value !== 111 | 111 |
| body-reader.fungi off2Class != 0 (GM17) | delete off2Class finish(11) block | mutant GM17 off2Class != 0 | value !== 111 | 111 |
| body-reader.fungi len2Class != 0 (GM18) | delete len2Class finish(11) block | mutant GM18 len2Class != 0 | value !== 111 | 111 |
| body-reader.fungi nChunks==2 off1 overflow (GM5) | delete `off1 > maxInt2 - len1` finish(14) | mutant GM5 two-chunk off1 overflow | value !== 114 | 114 |
| body-reader.fungi nChunks==2 off2 overflow (GM4) | delete `off2 > maxInt2 - len2` finish(14) | mutant GM4 two-chunk off2 overflow | value !== 114 | 114 |
| body-reader.fungi nChunks==0 declaredLen > 0 (GM24) | `declaredLen > 0` to `> 99999` | mutant GM24 zero-chunk declared 5 | value !== 106 | 106 |
| body-reader.fungi cap < 0 (GM27) | delete cap<0 finish(12) block | mutant GM27 cap -1 | value !== 112 | 112 |
| body-reader.fungi terminal readChunks (GM29) | terminal `finish(11, true)` to `finish(0, true)` | mutant GM29 nChunks 3 | value !== 111 | 111 |

Invoke uses `galerina.mjs run --invoke` on the source file. A prior `galerina build` signed manifest makes mutants TAMPER; tests run without `build/` artefacts.
Test oracle uses present/reason/value; missing invoke value is INVOKE_VALUE_ABSENT (no NaN).
A2 import+CALL is not a source mutant: check admits; build FUNGI-NAME-001; run --invoke WAT undefined callee. ClassTag gate kept. See import-refuse.txt.
