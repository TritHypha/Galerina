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
| skip one wipe | cleanup-failed `finish(41, true)` to `finish(41, false)` | RED mutant skip one wipe on cleanup-failed post | 141 |

Standalone landed-source pins (no withMutant): unknownFieldToken 1 -> 117; callerMintToken 1 -> 120; recLeaseState 9 -> 138; currentValidityToken 0 presentToken 1 -> 106; consumedAuthorityToken 0 presentToken 1 -> 106; mint retiredToken 1 -> 137; issuedFreshToken 0 -> 137; clock budget 5001 -> 129; consume independentAuthToken 0 -> 105; httpStatusFor classTag 3/11 code 100 -> 503; consume currentValidity classTag 3 -> 110 and 11 -> 111.

Follow-up 02: skip-one-wipe RED mutant `finish(41, true)` to `finish(41, false)` on cleanupEvidence == 3; restore packed 141. F1 post-consume helper/unlisted/prePacked!=100 now 106. F4 readChunks cap+1 -> admitIngress 116; deliverPreHandoff admit 100 and provider-absent 119 -> applyPrePorts 100/135.

## 47a composed body-reader 20-arg ABI

Old 13-arg Bool ABI call at tests/35-auth-verify-route/auth-verify-route.test.mjs:804 re-pointed to ACKed 20-arg `readChunksArgs` (classTags 0, tokens 0/1). Expected packed 105 then admitIngress 116. Flatten `stripBodyFinish` is packer-only; it does not encode the old ABI.

| claim | file:line change | red test | restore |
|---|---|---|---|
| (a) old 13-arg call | test call `[1, 1, 0, 16385, 0, 0, 0, 16384, false, 0, true, false, false]` put back | mutant 47a old 13-arg readChunks call goes RED then restore | 105 |
| (b) cap compare off by one | body-reader.fungi in-memory `if len1 > cap` → `if len1 > cap + 1` on nChunks==1 (maxInt1 unique) | mutant 47a body-reader cap compare off by one goes RED then restore | 105 |
| (c) classTag gate dropped on cap | body-reader.fungi in-memory `if capClass != 0 { return finish(11, true) }` → `if capClass == 999` | mutant 47a drop cap classTag gate goes RED then restore | 111 |

Tracked body-reader.fungi sha256 asserted unchanged in `withBodyMutant` finally. Offset+len overflow probe packed 114 matches tests/31-body-reader/body-reader.test.mjs `MUST-REFUSE offset plus length overflow`.
