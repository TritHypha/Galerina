# Q32 parity: release-commit-point.ts @ dc0f9c8c vs release-commit-point.fungi

Input: `packages-ts/galerina-framework-app-kernel/src/release-commit-point.ts` sha256 `ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3` at `dc0f9c8c4f1365f0228cda213b2ecd001400463e`.
Workbench capsule REFUSE `REFUSED_RESERVED_DECODER_ID`. HOST/FUNGI views typed UNKNOWN. C2 applied under Q31-05 ruling. PROPOSED never permission.
Local `readForeignSafeInteger` copy (ts:79) is NOT converted (CN-1). Dead alias `ReleaseStatusState` dropped (CN-2).

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| release-commit-point.ts:79 readForeignSafeInteger | c-boundary.fungi (untouched) | PRESERVED | NO_NULL_NAN | CN-1 helper NaN epoch class 111 |
| release-commit-point.ts:91 instanceNonce fallback | mintAdmit randomnessPresent 0 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE mint with randomness absent 102 |
| release-commit-point.ts:188 mint | mintAdmit | PRESERVED | BOUNDED_INPUT | MUST-REFUSE retired/in-flight/at-cap/unfresh |
| release-commit-point.ts:258 status | classifyRecovery | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | unused/retired/tombstone DELIVERY_UNKNOWN 103; absent NOT_FOUND 104 |
| release-commit-point.ts:299 consume | consumeStep | PRESERVED | TOTAL_EFFECT_OUTCOME | revoke-first 102; second release 103; D 100 |
| release-commit-point.ts:341 ack optional epoch | ackStep epochPresent 0 | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE omitted epoch 104 (C192-N3) |
| release-commit-point.ts:371 ack ternary | ackStep exhaustive table | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | unused 104 fenced 102 unknown 103 unlisted 111 (C192-N5) |
| release-commit-point.ts:341 ack without audit | ackStep auditCommitted 0 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE ack before audit 106 (P24-R1) |
| release-commit-point.ts:421 revokeDelivery | revokeDelivery | PRESERVED | TOTAL_EFFECT_OUTCOME | acked -> 106; unlisted 111 |
| release-commit-point.ts:460 bytesEqual | bytesEqualScan | INTENDED_DIVERGENCE | LINEAR_SECRET | full scan required; early-exit 102; physical XOR is NEEDS_LANGUAGE |
| release-commit-point.ts:472 wipeBytes | finish(..., true) | NEEDS_LANGUAGE | LINEAR_SECRET | packed +100 construct |
| Map/CAS live store | host observations | NEEDS_LANGUAGE | HOST_ADAPTER_PRESENCE | AP-Q07-1 CARRIED_UNKNOWN |
| Q07 OPEN CAS | casBegin | PRESERVED | TOTAL_EFFECT_OUTCOME | revoke-wins 102; release-begin 100; unlisted 111 |
| Q09 adapter class | casCommit | PRESERVED | TOTAL_EFFECT_OUTCOME | in-process commit 100; out-of-process 106; unknown 111 |
| observation points | observationPoint | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | only kind 0 admits; publish/atomics/write/fsync 111 |
| retry after unknown | retryAfterUnknown | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | prior 6 stays 106 |

Counts: PRESERVED 6, INTENDED_DIVERGENCE 8, UNKNOWN 0, NEEDS_LANGUAGE 2. Unlisted verdict refuses.
