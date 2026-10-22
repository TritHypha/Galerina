# Q32 parity: release-commit-point.ts @ dc0f9c8c vs release-commit-point.fungi

Input: `packages-ts/galerina-framework-app-kernel/src/release-commit-point.ts` sha256 `ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3` at `dc0f9c8c4f1365f0228cda213b2ecd001400463e`.
Workbench capsule REFUSE `REFUSED_RESERVED_DECODER_ID`. HOST/FUNGI views typed UNKNOWN. C2 applied under Q31-05 ruling. PROPOSED never permission.
Local `readForeignSafeInteger` copy (ts:79) is NOT converted (CN-1). Dead alias `ReleaseStatusState` dropped (CN-2).
B4 command+output: `evidence/32-release-commit-point/ts-differential.txt`.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| release-commit-point.ts:79 readForeignSafeInteger | c-boundary.fungi (untouched) | PRESERVED | NO_NULL_NAN | CN-1 helper NaN epoch class 111 |
| release-commit-point.ts:91 instanceNonce fallback | mintAdmit randomnessPresent 0 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE mint with randomness absent 102 |
| release-commit-point.ts:188 mint | mintAdmit | PRESERVED | BOUNDED_INPUT | MUST-REFUSE retired/in-flight/at-cap/unfresh |
| release-commit-point.ts:204 existing terminal return | mintAdmit existingLease 1..4 code 7 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | reissue 107 never fresh 100; issuedHere 0 -> 105 |
| release-commit-point.ts:258 status | classifyRecovery | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | unused/retired/tombstone DELIVERY_UNKNOWN 103; absent NOT_FOUND 104 |
| release-commit-point.ts:299 consume | consumeStep | PRESERVED | TOTAL_EFFECT_OUTCOME | revoke-first 102; second release 103; D 100 |
| release-commit-point.ts:302 forged unused returns stale | consumeStep tokenMatch 0 unused | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | forged unused 102 fenced (B1) |
| release-commit-point.ts:341 ack optional epoch | ackStep epochPresent 0 | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE omitted epoch 104 (C192-N3) |
| release-commit-point.ts:371 ack ternary | ackStep exhaustive table | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | unused 104 fenced 102 unknown 103 unlisted 111 (C192-N5) |
| release-commit-point.ts:341 ack without audit | ackStep auditCommitted 0 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE ack before audit 106 (P24-R1) |
| release-commit-point.ts:421 revokeDelivery acked | revokeDelivery lease 2 | PRESERVED | TOTAL_EFFECT_OUTCOME | acked -> 106; unlisted 111 |
| release-commit-point.ts:435 revokeDelivery no-op void | revokeDelivery code 8 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | unused/released/fenced -> 108 never 100 (S3) |
| release-commit-point.ts:460 bytesEqual | bytesEqualScan | NEEDS_LANGUAGE | LINEAR_SECRET | host-reported full scan; early-exit 102; constant-time XOR not in this unit (B7) |
| release-commit-point.ts:472 wipeBytes | finish(..., true) | NEEDS_LANGUAGE | LINEAR_SECRET | packed +100 construct |
| Map/CAS live store | host observations | NEEDS_LANGUAGE | HOST_ADAPTER_PRESENCE | AP-Q07-1 CARRIED_UNKNOWN |
| Q07 OPEN CAS | casBegin | PRESERVED | TOTAL_EFFECT_OUTCOME | revoke-wins 102; release-begin 100; unlisted 111 |
| Q09 adapter class | casCommit | PRESERVED | TOTAL_EFFECT_OUTCOME | in-process commit 100; out-of-process 106; unknown 111 |
| observation points | observationPoint | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | kind 0 admits; 1-8 and 14 refuse 111; 9-13 stay 106 (S1) |
| retry after unknown | retryAfterUnknown | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | prior 6 stays 106 |
| Addendum D release guard | releaseGuard | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | auth/custody missing 105; pending/failed/unknown 106; NotRequired nonempty 102 |
| Addendum D outcome class | outcomeClass | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | missing/stale before begin 102; after begin 106 (S2) |
| import c-boundary CALL | classTag gate kept | NEEDS_LANGUAGE | NO_NULL_NAN | B5 check 0 / build FUNGI-NAME-001 / run WAT undefined callee |

## S2 outcome-code mapping (Grok zero-trust default, pending Phillip)

| code | name | class |
|---|---|---|
| 0 | released | Success |
| 1 | acknowledged | Success |
| 2 | fenced | Refused |
| 3 | replay | Refused |
| 4 | stale | Refused before begin; Indeterminate after begin |
| 5 | missing | Refused before begin; Indeterminate after begin |
| 6 | delivery-unknown | Indeterminate |
| 7 | reissued-existing-terminal | Success (same credentials, not a fresh mint) |
| 8 | no-op | no-op (never Success, never Refused) |
| 11 | Unlisted | Refused before begin; Indeterminate after begin |

Probe both sides: `mintAdmit` absent id before begin -> 105 (Refused); `casCommit` epoch mismatch after begin -> 106 (Indeterminate); `outcomeClass 5 0` -> 102; `outcomeClass 4 1` -> 106; `outcomeClass 11 0` -> 102; `outcomeClass 11 1` -> 106.

Counts: PRESERVED 6, INTENDED_DIVERGENCE 12, UNKNOWN 0, NEEDS_LANGUAGE 4. Unlisted verdict refuses.

## Notes

N1. `outcomeClass(7)` maps to Success because re-issue returns the existing terminal record. It is not a new disclosure.

N2. `casCommit` revoke-after-begin -> 106 is INTENDED_DIVERGENCE (stricter than the Q07 ruling that a release which began first is the one permitted disclosure).

N3. RD-0778 is cited in `receipts.json` by path + sha256 + kbCommit only (never its body): `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md` sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a` kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`.

N4. Rebasing onto the q31 ACK head `fc7db4db` stays a later NEW `-r2` series.

N5. Astra W1/W3/W5 (addendum-20261020 section 2): in the current profile COMMITTED is unreachable after begin (B) for every out-of-process release (policy, not a theorem). UNKNOWN is never success, never proof of zero effect, and never retry authority. Recovery runs before new claims and never promotes or reissues. Automatic retry after DELIVERY_UNKNOWN is prohibited.
