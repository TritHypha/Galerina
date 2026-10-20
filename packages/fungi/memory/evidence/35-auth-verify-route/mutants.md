# Q35 mutants

All mutants are in-memory `unitSourceOverride` (typed sentinel LANDING). Tracked UNIT sha256 is asserted unchanged in `finally`.

| claim | file:line change | red test | restore |
|---|---|---|---|
| drop unknown-field refusal | `finish(17)` to `finish(0)` on unknownFieldToken | RED mutant drop unknown-field refusal | 117 |
| accept caller mint | `finish(20)` to `finish(0)` on callerMintToken | RED mutant accept caller mint | 120 |
| drop recovery default arm | recovered 111 `finish(38)` to `finish(0)` | RED mutant drop default arm on recovery switch | 138 |
| map delivery_unknown to released | post terminal `finish(6)` to `finish(0)` | RED mutant map delivery_unknown to released after consume | 106 |
| map port throw to REFUSED | bodyPacked 110 `finish(6)` to `finish(18)` | RED mutant map a port throw to REFUSED | 106 |
| drop deadline check | clock overrun `finish(29)` to `finish(0)` | RED mutant drop deadline check | 129 |
| swap release and revoke order | consumeStep revokeCommittedToken forced 0 | RED mutant swap release and revoke order | 102 |

Standalone landed-source pins (no withMutant): unknownFieldToken 1 -> 117; callerMintToken 1 -> 120; recLeaseState 9 -> 138; currentValidityToken 0 presentToken 1 -> 106; consumedAuthorityToken 0 presentToken 1 -> 106.
