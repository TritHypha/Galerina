# Q35 AUTH_VERIFY_ROUTE parity

Frozen TS: `packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts` @ dc0f9c8c (sha256 `2cddca1eefd6bbd4c3e6d1ec7ba4fa53ec5e798f737d52712cc9ca683be0d4db`). Parked #187 `b59598787` has the same route bytes; rcp/secret-gate differ and were not used unless dc0 failed to load.

Skills applied: translating-typescript-to-fungi (binding translation shape; no else-if/null/NaN/throw; foreign Ints through c-boundary; ports as typed effects); writing-fungi (`@version 1`, sequential if-return, `_ =>` as terminal unlisted 11, CALL helper, no invented syntax).

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`. Body not copied.

C186-N1 corrected reference: transport 499 for `client_disconnected` is kept as the typed HTTP row (TS l.235) and recorded here; it is non-standard and stays an open question with that zero-trust default.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| AUTH_VERIFY_METHOD POST l.36 | admitIngress methodToken 0 | PRESERVED | BOUNDED_INPUT | MUST-ADMIT exact POST |
| method !== POST l.695 | admitIngress 112 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE wrong method |
| path !== /auth/verify l.695 | admitIngress 113 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE path variants |
| contentType empty l.698 | admitIngress 114 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE wrong content type |
| channelAllow l.701 | admitIngress 115 | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | MUST-REFUSE channel |
| body.byteLength > cap l.707 | admitIngress 116 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE body over cap |
| unknown JSON field C186-N6 | admitIngress 117 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE unknown body field |
| malformed body l.704 | admitIngress 118 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE malformed body |
| body throw runPort threw l.727 | admitIngress 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | body throw UNKNOWN |
| mintOperationId caller override l.423 | mintOperation 120 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE caller-supplied mint |
| default predictable mint l.419 | mintOperation randomness 119 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY AVR-N1 | MUST-REFUSE randomness absent |
| Date.now nowMs l.424 | applyClock 121 | NEEDS_LANGUAGE | MONOTONIC_TYPED_TIME | clock missing |
| clock refused throw l.29 | applyClock 121 | INTENDED_DIVERGENCE | NO_NULL_NAN | clock missing/negative |
| remainingMs deadline l.446 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL | deadline overrun |
| ARTIFACT_DIGEST_MISSING l.739 | applyPrePorts 125 | PRESERVED | SEALED_INTRINSICS | digest missing |
| ARTIFACT_MISMATCH l.741 | applyPrePorts 126 | PRESERVED | SEALED_INTRINSICS | mismatch |
| AOT_REFUSED l.742 | applyPrePorts 127 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | AOT |
| BYTECODE_REQUIRED l.743 | applyPrePorts 128 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | bytecode |
| slide_admission_refused | applyPrePorts 130 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | slide |
| authority_missing | applyPrePorts 131 | PRESERVED | NO_AMBIENT_AUTHORITY | vok missing |
| authority_stale | applyPrePorts 132 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | vok stale |
| authority_revoked | applyPrePorts 133 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | vok revoked |
| VERDICT_REFUSED | applyPrePorts 134 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | VERDICT |
| secret_unavailable l.254 | applyPrePorts 135 | PRESERVED | LINEAR_SECRET | secret 101 |
| tcb_profile_refused | applyPrePorts 136 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | tcb |
| prior-status replay l.872 | applyPrePorts 137 | PRESERVED | CN-2 | replay every recovery |
| unlisted recovery default | applyPrePorts 138 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | unlisted recovery |
| revokeBeforeRelease l.369 | absent option; host revokeCommittedToken | INTENDED_DIVERGENCE | AVR-N2 | revoke first 102 |
| consume released l. consume | applyConsume 100 | PRESERVED | commit point | MUST-ADMIT consume |
| guest_trap | applyPostConsume 139 | PRESERVED | TOTAL_EFFECT_OUTCOME | guest trap |
| client_disconnected l.693 | applyPostConsume 140 | PRESERVED | C186-N5 | disconnect vs deadline |
| cleanup_failed l.503 | applyPostConsume 141 | PRESERVED | LINEAR_SECRET MB-11 | cleanup failed quarantine |
| ACK refusal C186-F1 | applyPostConsume 142 | PRESERVED | C186-F1 | ack refused |
| receiptSeal no suite C186-F3 | applyPostConsume 143 | INTENDED_DIVERGENCE | C186-F3 | no suite |
| released after sink l.565 | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME Astra W1 | post never packed 100 |
| httpStatusFor undefined l.247 | httpStatusFor default 503 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | default 503 |
| client_disconnected HTTP 499 l.235 | httpStatusFor 140 -> 499 | PRESERVED | C186-N5 | disconnect 499 |
| admitAtRouteBoundary null l.258 | typed secretPacked 100 | INTENDED_DIVERGENCE | NO_NULL_NAN | secret bind |
| operationId = "" l.433 | mintedOp domain gate | INTENDED_DIVERGENCE | NO_NULL_NAN | mint missing |
| leaseEpoch = -1 l.438 | epoch < 0 -> 123 | INTENDED_DIVERGENCE | NO_NULL_NAN | epoch |
| receiptSeal sha256 l.314 | sealReceipt hybrid | NEEDS_LANGUAGE | CONSTANT_TIME_COMPARE | seal hybrid 100 equality not CT |
| PQ classical-only | sealReceipt 106 | NEEDS_LANGUAGE | hybrid AND | classical never Assured |
| HOST_ADAPTER_PRESENCE | c-boundary classTag | UNKNOWN | HOST_ADAPTER_PRESENCE | foreign 110 |
| MB-06 listed cleanup | applyConsume 106 | INTENDED_DIVERGENCE | MB-06 CARRIED_UNKNOWN | listed cleanup |
| Addendum D OPEN ordering | typed 106 | UNKNOWN | TOTAL_EFFECT_OUTCOME | OPEN items |

Summary counts (rows above): PRESERVED 18 / INTENDED_DIVERGENCE 18 / UNKNOWN 2 / NEEDS_LANGUAGE 3.

ABANDONED_TS_DESIGN:
- unit AUTH_VERIFY_ROUTE; obligation UNFORGEABLE_CAPABILITY AVR-N1; why caller mint and predictable mint; .fungi kernel mint plus randomness-absent refusal
- unit AUTH_VERIFY_ROUTE; obligation AVR-N2; why revokeBeforeRelease test seam; .fungi has no such option
- unit AUTH_VERIFY_ROUTE; obligation TOTAL_EFFECT_OUTCOME Astra W1; why TS released after out-of-process sink; .fungi post-consume UNKNOWN 106
