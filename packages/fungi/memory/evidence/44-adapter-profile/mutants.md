# Q44 mutants (all RED then restored; withMutant try/finally)

Temp copy is the landed adapter-profile.fungi restored in finally. Tracked compiler source is never written. Flatten harness inlines c-boundary for invoke.

| change | red test | red observation | restore |
|---|---|---|---|
| unlistedClassDefault 11 -> 0 | mutant default-to-in-process on unlisted class | tableForClass(0,2) === 0 | 11 |
| sabRefuse 2 -> 0 | mutant admit SharedArrayBuffer | classifyAdapter kind 1 === 0 | 2 |
| sabRefuse 2 -> 11 | mutant merge NOT_ADMITTED with unlisted | classifyAdapter kind 1 === 11 | 2 |
| unauditedSelectsDu 1 -> 0 | mutant UNAUDITED admitted as in-process | classifyAdapter kind 0 audit 1 === 0 | 1 |
| nativeSelectsDu 1 -> 0 | mutant native hand-off as in-process | classifyAdapter kind 7 audit 0 === 0 | 1 |
| duOnlyTable 1 -> 0 | mutant DU-only table returning COMMITTED-capable code | tableForClass(0,1) === 0 | 1 |
