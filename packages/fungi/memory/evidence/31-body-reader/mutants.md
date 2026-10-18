# Q31 mutants (all RED then restored)

| file:line (approx) | change | red test | red observation | restore |
|---|---|---|---|---|
| body-reader.fungi nChunks==1 len1 <= 0 | `<=` to `<` (admits zero-length) | mutant admit zero-length | value !== 104 | 104 |
| body-reader.fungi rangesOverlap | `<` to `<=` (closed interval) | mutant closed-interval overlap | adjacent !== 100 | 100 |
| body-reader.fungi streamPresent false | finish(8, true) to finish(8, false) | mutant skip wipe | 8 (no +100) | 108 |
| c-boundary.fungi classTag == 3 | return 3 to return 0 | mutant accept NaN | 0 | 3 |
| body-reader.fungi len1 > cap | `>` to `< 0` (drop cap) | mutant drop cap compare | value !== 105 | 105 |

Invoke uses `galerina.mjs run --invoke` on the source file. A prior `galerina build` signed manifest makes mutants TAMPER; tests run without `build/` artefacts.
