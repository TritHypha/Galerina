# Q35 AUTH_VERIFY_ROUTE parity

Frozen TS: `packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts` @ dc0f9c8c (sha256 `2cddca1eefd6bbd4c3e6d1ec7ba4fa53ec5e798f737d52712cc9ca683be0d4db`). Parked #187 `b59598787` has the same route bytes; rcp/secret-gate differ and were not used unless dc0 failed to load.

Skills applied: translating-typescript-to-fungi (binding translation shape; no else-if/null/NaN/throw; foreign Ints through c-boundary; ports as typed effects); writing-fungi (`@version 1`, sequential if-return, `_ =>` as terminal unlisted 11, CALL helper, no invented syntax).

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`. Body not copied.

C186-N1 corrected reference: transport 499 for `client_disconnected` is kept as the typed HTTP row (TS l.235) and recorded here; it is non-standard and stays an open question with that zero-trust default.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| AUTH_VERIFY_METHOD POST l.36 | admitIngress methodToken 0 | UNKNOWN | BOUNDED_INPUT | MUST-ADMIT exact POST |
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
| remainingMs deadline l.446 | applyClock 129 | UNKNOWN | DEADLINE_COVERS_ALL | deadline overrun |
| ARTIFACT_DIGEST_MISSING l.739 | applyPrePorts 125 | UNKNOWN | SEALED_INTRINSICS | digest missing |
| ARTIFACT_MISMATCH l.741 | applyPrePorts 126 | UNKNOWN | SEALED_INTRINSICS | mismatch |
| AOT_REFUSED l.742 | applyPrePorts 127 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | AOT |
| BYTECODE_REQUIRED l.743 | applyPrePorts 128 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | bytecode |
| slide_admission_refused | applyPrePorts 130 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | slide |
| authority_missing | applyPrePorts 131 | UNKNOWN | NO_AMBIENT_AUTHORITY | vok missing |
| authority_stale | applyPrePorts 132 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | vok stale |
| authority_revoked | applyPrePorts 133 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | vok revoked |
| VERDICT_REFUSED | applyPrePorts 134 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | VERDICT |
| secret_unavailable l.254 | applyPrePorts 135 | UNKNOWN | LINEAR_SECRET | secret 101 |
| tcb_profile_refused | applyPrePorts 136 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | tcb |
| prior-status replay l.872 | applyPrePorts 137 | UNKNOWN | CN-2 | replay every recovery |
| unlisted recovery default | applyPrePorts 138 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | unlisted recovery |
| revokeBeforeRelease l.369 | absent option; host revokeCommittedToken | INTENDED_DIVERGENCE | AVR-N2 | revoke first 102 |
| consume released l. consume | applyConsume 100 | UNKNOWN | commit point | MUST-ADMIT consume |
| guest_trap | applyPostConsume 139 | UNKNOWN | TOTAL_EFFECT_OUTCOME | guest trap |
| client_disconnected l.693 | applyPostConsume 140 | PRESERVED | C186-N5 | disconnect vs deadline |
| cleanup_failed l.503 | applyPostConsume 141 | UNKNOWN | LINEAR_SECRET MB-11 | cleanup failed quarantine |
| ACK refusal C186-F1 | applyPostConsume 142 | UNKNOWN | C186-F1 | ack refused |
| receiptSeal no suite C186-F3 | applyPostConsume 143 | INTENDED_DIVERGENCE | C186-F3 | no suite |
| released after sink l.565 | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME Astra W1 | post never packed 100 |
| httpStatusFor undefined l.247 | httpStatusFor default 503 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | default 503 |
| client_disconnected HTTP 499 l.235 | httpStatusFor 140 -> 499 | UNKNOWN | C186-N5 | disconnect 499 |
| admitAtRouteBoundary null l.258 | typed secretPacked 100 | INTENDED_DIVERGENCE | NO_NULL_NAN | secret bind |
| operationId = "" l.433 | mintedOp domain gate | INTENDED_DIVERGENCE | NO_NULL_NAN | mint missing |
| leaseEpoch = -1 l.438 | epoch < 0 -> 123 | INTENDED_DIVERGENCE | NO_NULL_NAN | epoch |
| receiptSeal sha256 l.314 | sealReceipt hybrid | NEEDS_LANGUAGE | CONSTANT_TIME_COMPARE | seal hybrid 100 equality not CT |
| PQ classical-only | sealReceipt 106 | NEEDS_LANGUAGE | hybrid AND | classical never Assured |
| HOST_ADAPTER_PRESENCE | c-boundary classTag | UNKNOWN | HOST_ADAPTER_PRESENCE | foreign 110 |
| MB-06 listed cleanup | applyConsume 106 | INTENDED_DIVERGENCE | MB-06 CARRIED_UNKNOWN | listed cleanup |
| Addendum D OPEN ordering | typed 106 | UNKNOWN | TOTAL_EFFECT_OUTCOME | OPEN items |

Summary counts (rows above): PRESERVED 3 / INTENDED_DIVERGENCE 17 / UNKNOWN 22 / NEEDS_LANGUAGE 3.

ABANDONED_TS_DESIGN:
- unit AUTH_VERIFY_ROUTE; obligation UNFORGEABLE_CAPABILITY AVR-N1; why caller mint and predictable mint; .fungi kernel mint plus randomness-absent refusal
- unit AUTH_VERIFY_ROUTE; obligation AVR-N2; why revokeBeforeRelease test seam; .fungi has no such option
- unit AUTH_VERIFY_ROUTE; obligation TOTAL_EFFECT_OUTCOME Astra W1; why TS released after out-of-process sink; .fungi post-consume UNKNOWN 106

## F3 follow-up 02

Brief text said auth-verify-route.ts is 1131 lines; frozen bytes at dc0f9c8c are 1196 lines (same sha256 `2cddca1eefd6bbd4c3e6d1ec7ba4fa53ec5e798f737d52712cc9ca683be0d4db` at both oracle heads). Grok-side line-count error.

tests/rd1415-*.test.mjs importing auth-verify-route at dc0f9c8c = 0 files (10 rd1415 test files present; 0 mention the unit).

A1: after consume, applyPostConsume maps helper-nonzero, unlisted tokens, and prePacked other than 100 to packed 106. Named 139/140/141/142/143 stay. Pre-consume consume() currentValidity classTag 3/11 stay 110/111.

Every parity row is executed as frozen TS handle() plus flattened .fungi, or marked UNKNOWN / NEEDS_LANGUAGE with a typed reason in ts-differential.txt.

## F3 follow-up 03

20 fungi-only differential rows still said PRESERVED although frozen TS was not executed for them (deadline overrun, digest missing, artifact mismatch, AOT refused, bytecode required, slide refused, authority missing/stale/revoked, VERDICT refused, secret unavailable, tcb refused, replay recovery, consume released, guest trap, cleanup failed, ack refused, http default 503, disconnect HTTP 499, POST exact method). Verdict is now UNKNOWN; typed unknownReason kept. Live handle rows stay executed.

## Frozen TS 102 cases

| n | ts_case | fungi_probe_or_row | verdict | obligation id |
|---|---|---|---|---|
| 1 | construction: missing timeout refuses | no constructor; host budget | UNKNOWN | TS_CONSTRUCTION_REFUSE |
| 2 | construction: missing Fungi max request size refuses | no constructor; host cap | UNKNOWN | TS_CONSTRUCTION_REFUSE |
| 3 | pos-release-before-revoke S-01 boolean only, one consume | applyPostConsume 106 | INTENDED_DIVERGENCE | Astra W1 |
| 4 | neg-malformed-input F-01 | admitIngress 112/113/114/118 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED |
| 5 | neg-oversized-body F-02 | admitIngress 116 | PRESERVED | BOUNDED_INPUT |
| 6 | neg-missing-operation-id F-03 | mintOperation domain | INTENDED_DIVERGENCE | NO_NULL_NAN |
| 7 | neg-replay-operation-id F-04 | applyPrePorts 137 | PRESERVED | CN-2 |
| 8 | neg-artifact-digest-missing F-05 | applyPrePorts 125 | PRESERVED | SEALED_INTRINSICS |
| 9 | neg-artifact-mismatch F-06 | applyPrePorts 126 | PRESERVED | SEALED_INTRINSICS |
| 10 | neg-aot-refused F-07 | applyPrePorts 127 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 11 | neg-bytecode-required F-08 | applyPrePorts 128 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 12 | neg-slide-refused F-09 | applyPrePorts 130 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 13 | production unnamed SLIDE record is F-09 | applyPrePorts 130 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 14 | neg-authority-missing F-10 | applyPrePorts 131 | PRESERVED | NO_AMBIENT_AUTHORITY |
| 15 | neg-authority-stale F-11 | applyPrePorts 132 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 16 | neg-revoke-before-release F-12 | applyConsume 102 | INTENDED_DIVERGENCE | AVR-N2 |
| 17 | neg-verifier-missing F-13 | applyPrePorts 134 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 18 | neg-verifier-pin-mismatch F-14 | applyPrePorts 134 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 19 | neg-verifier-spawn-failure F-15 | applyPrePorts 134 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 20 | neg-verdict-malformed F-16 | applyPrePorts 134 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 21 | neg-verifier-nonzero-exit F-17 | applyPrePorts 134 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 22 | neg-secret-unavailable F-18 | applyPrePorts 135 | PRESERVED | LINEAR_SECRET |
| 23 | neg-guest-trap F-19 | applyPostConsume 139 | PRESERVED | TOTAL_EFFECT_OUTCOME |
| 24 | neg-timeout-verifier F-20 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 25 | neg-timeout-slide F-21 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 26 | neg-timeout-vok F-22 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 27 | neg-timeout-provider F-23 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 28 | neg-timeout-guest F-24 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 29 | neg-timeout-sink F-25 | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 30 | neg-timeout-ack F-26 does not re-release | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 31 | neg-client-disconnect F-27 | applyPostConsume 140 | PRESERVED | C186-N5 |
| 32 | neg-crash-after-release F-28 does not re-release | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 33 | neg-partial-delivery F-29 does not retry D | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 34 | neg-unknown-outcome F-30 | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 35 | neg-cleanup-failure F-31 quarantines | applyPostConsume 141 | PRESERVED | LINEAR_SECRET MB-11 |
| 36 | timeout-late-result is wiped and never disclosed | applyClock 129 | UNKNOWN | LINEAR_SECRET wipe host |
| 37 | response-binding swap/replay onto another request is refused | applyPrePorts 137 | PRESERVED | CN-2 |
| 38 | unnamed TCB profile refuses production disclosure | applyPrePorts 136 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 39 | verifier-dependency: C WAMR host does not link Rust; #183 crate-type is rlib | c-boundary classTag | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 40 | S-01 not-matched is boolean-only success | applyPostConsume 106 | UNKNOWN | TS_GUEST_MATCHED_BOOLEAN |
| 41 | neg-revoke-during-guest F-12 consume-fenced | applyConsume 102 | INTENDED_DIVERGENCE | AVR-N2 |
| 42 | secret-after-fenced-lease does not open provider | applyPrePorts 135 | PRESERVED | LINEAR_SECRET |
| 43 | double-and-late-secret-callback never S-01 | applyPrePorts 135 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 44 | guest-secret-view is staged and zero after response | applyPostConsume 106 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 45 | guest-body-wiped-after-response | applyPostConsume 106 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 46 | undeclared-secret-name never S-01 and does not open provider | applyPrePorts 135 | PRESERVED | LINEAR_SECRET |
| 47 | pos-ack-bound S-01 status acknowledged | applyPostConsume 106 | INTENDED_DIVERGENCE | Astra W1 |
| 48 | neg-ack-not-acknowledged is status-only | applyPostConsume 142 | PRESERVED | C186-F1 |
| 49 | neg-zero-artifact-digest F-05 | applyPrePorts 125 | PRESERVED | SEALED_INTRINSICS |
| 50 | default-operation-id is a legal HTTP header value | mintOperation 100 | UNKNOWN | TS_HTTP_HEADER_SHAPE |
| 51 | default-operation-id unique per route instance sharing authority | mintOperation 100 | UNKNOWN | TS_INSTANCE_IDENTITY |
| 52 | neg-clock-nan F-30 | applyClock 121 | INTENDED_DIVERGENCE | NO_NULL_NAN |
| 53 | neg-clock-infinity F-30 | applyClock 121 | INTENDED_DIVERGENCE | NO_NULL_NAN |
| 54 | neg-clock-non-number F-30 | applyClock 121 | INTENDED_DIVERGENCE | NO_NULL_NAN |
| 55 | neg-mint-typed-stale classifies by outcome not message | applyPrePorts 132 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 56 | neg-replay-delivery-unknown reports delivery-unknown | applyPrePorts 137 | PRESERVED | CN-2 |
| 57 | neg-clock-nan-after-mint fences unused lease | applyClock 121 | INTENDED_DIVERGENCE | NO_NULL_NAN |
| 58 | neg-clock-nan-after-consume sink-wait is status-only | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 59 | neg-clock-nan-after-consume ack-read is status-only | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 60 | port-loadArtifact-rejects does not reject handle | applyPrePorts 125-128 | PRESERVED | TOTAL_EFFECT_OUTCOME |
| 61 | port-loadArtifact-sync-throw does not reject handle | admitIngress 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 62 | port-verifierCustody-rejects does not reject handle | applyPrePorts 134 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 63 | port-verifierCustody-sync-throw does not reject handle | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 64 | port-admitSlide-rejects does not reject handle | applyPrePorts 130 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED |
| 65 | port-admitSlide-sync-throw does not reject handle | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 66 | port-authorizeVok-rejects does not reject handle | applyPrePorts 131-133 | PRESERVED | NO_AMBIENT_AUTHORITY |
| 67 | port-authorizeVok-sync-throw does not reject handle | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 68 | port-runGuest-rejects fences unused and wipes | applyPostConsume 139 | PRESERVED | TOTAL_EFFECT_OUTCOME |
| 69 | port-runGuest-sync-throw fences unused and wipes | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 70 | port-deliverSink-rejects is status-only delivery-unknown | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 71 | port-deliverSink-sync-throw is status-only delivery-unknown | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 72 | port-acknowledge-rejects is status-only delivery-unknown | applyPostConsume 142 | PRESERVED | C186-F1 |
| 73 | port-acknowledge-sync-throw is status-only delivery-unknown | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 74 | port-wipe-sync-throw quarantines and resolves | applyPostConsume 141 | PRESERVED | LINEAR_SECRET MB-11 |
| 75 | neg-route-ack-not-acknowledged is status-only never WAX_SEAL | applyPostConsume 142 | PRESERVED | C186-F1 |
| 76 | late-getSecret getter-closed latch holds when lease spoofed unused | applyPrePorts 135 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 77 | route-fence-inside-provider-use does not hand bytes to guest | applyPrePorts 135 | UNKNOWN | LINEAR_SECRET |
| 78 | foreign-boundary readForeignSafeInteger refuses NaN Infinity string object | c-boundary 110/111 | PRESERVED | HOST_ADAPTER_PRESENCE |
| 79 | foreign-boundary content-length digits only | admitIngress 118 | PRESERVED | BOUNDED_INPUT |
| 80 | foreign-boundary readBodyCapped wipes over-cap chunks | readChunks 105 then admitIngress 116 | PRESERVED | BOUNDED_INPUT F4 |
| 81 | foreign-boundary readBodyCapped wipes on non-Uint8Array chunk | readChunks 110 then 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 82 | foreign-boundary readBodyCapped wipes on stream error | readChunks 110 then 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 83 | foreign-boundary readBodyCapped refuses liar byteLength subclass and wipes | readChunks 105 | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 84 | foreign-boundary readBodyCapped refuses flipping byteLength subclass vs cap | readChunks 105 | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 85 | foreign-boundary readBodyCapped intrinsic-wipes fill-override subclass | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 86 | foreign-boundary readBodyCapped refuses non-integer caps | readChunks 111 | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 87 | authority-fence-throws on guest-timeout handle stays typed | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 88 | authority-markUnknown-throws after sink-throw handle stays typed | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 89 | consume-commits-then-throws is status-only never leftover released | applyPostConsume 106 | INTENDED_DIVERGENCE | Astra W1 |
| 90 | loadArtifact snapshot getter is read once and wiped | applyPrePorts 125 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 91 | unlisted stateOf after consume is status-only never leftover released | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 92 | stateOf-throw after consume is status-only never leftover released | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 93 | foreign-boundary readBodyCapped uses intrinsic length not own-instance byteLength | readChunks cap | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 94 | foreign-boundary readBodyCapped wipes source chunks after ok copy | readChunks 100 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 95 | foreign-boundary readBodyCapped assembly catch wipes chunks | readChunks 110 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 96 | foreign-boundary captured fill is required for a successful read | readChunks 100 | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 97 | foreign-boundary readBodyCapped refuses resizable and SharedArrayBuffer chunks | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 98 | foreign-boundary P35 own buffer getter cannot hide a resizable shrink | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 99 | foreign-boundary P36 own resizable false cannot hide a resizable shrink | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 100 | foreign-boundary P37 own buffer getter cannot hide a SharedArrayBuffer | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 101 | foreign-boundary P38 throwing buffer getter does not escape and the chunk is wiped | readChunks 110 | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 102 | foreign-boundary post-load resizable getter tamper cannot reclassify a fixed buffer | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |

## Frozen TS 31 mutant labels

| n | label | fungi_probe_or_row | verdict | obligation id |
|---|---|---|---|---|
| 1 | consume-order-swapped | RED mutant swap release and revoke order | PRESERVED | AVR-N2 |
| 2 | wipe-removed | RED mutant skip one wipe on cleanup-failed post | PRESERVED | LINEAR_SECRET MB-11 |
| 3 | binding-field-dropped | applyPrePorts secret op/epoch bind 135/123 | PRESERVED | LINEAR_SECRET |
| 4 | timeout-removed | RED mutant drop deadline check | PRESERVED | DEADLINE_COVERS_ALL |
| 5 | verifier-pin-skipped | applyPrePorts 134 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 6 | g1-fenced-treated-released | applyPostConsume 106 | INTENDED_DIVERGENCE | Astra W1 |
| 7 | g2-mark-unknown-removed | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 8 | g3-body-copy-not-wiped | readChunks over cap 105 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 9 | g4-undeclared-served | applyPrePorts 135 | PRESERVED | LINEAR_SECRET |
| 10 | g5-ack-dropped | applyPostConsume 142 | PRESERVED | C186-F1 |
| 11 | g8-zero-digest | applyPrePorts 125 | PRESERVED | SEALED_INTRINSICS |
| 12 | g10-guest-timeout-fence-removed | applyClock 129 | PRESERVED | DEADLINE_COVERS_ALL |
| 13 | clock-refused-fence-removed | applyClock 121 | INTENDED_DIVERGENCE | NO_NULL_NAN |
| 14 | clock-refused-post-commit-not-recovered | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 15 | getter-closed-latch-removed | applyPrePorts 135 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 16 | route-ack-ignored | applyPostConsume 142 | PRESERVED | C186-F1 |
| 17 | delivery-recheck-removed | applyPostConsume 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME |
| 18 | catch-rethrows-non-clock-refused | applyPostConsume 106 | UNKNOWN | TS_NEEDS_PORT_FIXTURE |
| 19 | cap-typing-removed | admitIngress 116 | PRESERVED | BOUNDED_INPUT |
| 20 | post-commit-authority-state-ignored | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 21 | unlisted-state-post-commit-ignored | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 22 | stateof-throw-post-commit-ignored | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 23 | assembly-catch-wipe-removed | readChunks 110 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 24 | ok-path-chunk-wipe-removed | readChunks 100 | UNKNOWN | LINEAR_SECRET CARRIED_UNKNOWN |
| 25 | length-via-instance-byteLength | readChunks cap | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 26 | fill-absent-refuses-reads | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 27 | buffer-via-own-property | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 28 | resizable-via-own-property | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 29 | sab-via-instanceof | readChunks packed | UNKNOWN | HOST_ADAPTER_PRESENCE |
| 30 | classify-throw-unwiped | applyPostConsume 106 | INTENDED_DIVERGENCE | A1_AFTER_CONSUME_UNKNOWN |
| 31 | classify-unexpected-flag-admits | applyPostConsume 106 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED |
