# Q36 APP_KERNEL parity

Frozen TS: `packages-ts/galerina-framework-app-kernel/src/kernel.ts` @ dc0f9c8c (sha256 `5a6e13c32c0daab3f303b0840674237836baa742056412b5f84fcae08b2faeee`, 1420 lines). Parked queue 24 `93934967ef72e4fc711754775760c18b10f1d240` unused because dc0 loaded. HEAD 999fbd79 kernel.ts bytes differ and were not used.

Skills applied: translating-typescript-to-fungi (binding translation shape; no else-if/null/NaN/throw; foreign Ints through c-boundary; ports as typed effects; compact Int-tagged orchestration of the 1419-line pipeline); writing-fungi (`@version 1`, sequential if-return, unlisted 11, CALL helper plus rcp `finish`/`mintAdmit`/`classifyRecovery`/`consumeStep`/`ackStep`/`releaseGuard`, secret-gate `admit`, kernel-ports reserve/settle).

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`. Body not copied.

Workbench C2 REFUSE DECODER_UNAVAILABLE recorded; obligations carried as typed UNKNOWN. PROPOSED/REUSE/WRAP/ADAPT/BUILD never permission.

q46 `monotonic-time.fungi` types: CARRIED_UNKNOWN pending Grok-briefed reconciliation. MB-16: .fungi reads no clock; caller supplies typed readings through c-boundary. Idempotency TTL in TS uses wall clock (`Date.now` on the in-memory store); .fungi TTL is a foreign non-negative duration tag.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| pipeline order l.11-26 | construct then match auth body clock rate decode budget concurrency mint secrets idemp dispatch consume finalize | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | happy path 100 through dispatch |
| unknown path l.12 / handle 404 | admitMatch pathToken 1 finish(20) packed 120 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unknown path; TS handle route_not_found |
| known path wrong method l.12 / 405 | admitMatch methodToken 1 finish(21) packed 121 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE wrong method |
| unknown posture throws l.621-622 | constructKernel postureToken 3 finish(12) packed 112 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unknown posture; TS throw |
| unknown env throws l.624-625 | constructKernel envToken 2 finish(13) packed 113 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unknown env |
| missing validator l.651-656 | constructKernel closed+validator finish(14) packed 114 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE missing validator |
| duplicate route l.666-668 | constructKernel duplicateToken 1 finish(15) packed 115 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE duplicate |
| bad rate l.604-608 | constructKernel rateToken 1 finish(16) packed 116 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE bad rate |
| non-positive capacity/key/TTL | constructKernel finish(17) packed 117 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE capacity 0 |
| secret route no provider l.675-680 console.warn | constructKernel finish(18) packed 118 | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | MUST-REFUSE construction; TS boot-warn |
| missing intrinsic throws l.129/150/184 | constructKernel intrinsicToken 1 finish(19) packed 119 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | MUST-REFUSE missing intrinsic |
| policy absent/unlisted | admitMatch policyToken 1/2 finish(22) packed 122 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE policy |
| body over cap l.413 | admitBody bodyPacked 105 finish(23) packed 123 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE body over |
| content-type mismatch l.415 | admitBody contentToken 1 finish(24) packed 124 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE content-type |
| body throw | admitBody bodyPacked 110 finish(6) packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | body throw UNKNOWN |
| channel deny / no principal l.401 | admitAuth finish(25) packed 125 | PRESERVED | NO_AMBIENT_AUTHORITY | MUST-REFUSE unauthorized |
| missing scope l.403 | admitAuth finish(26) packed 126 | PRESERVED | NO_AMBIENT_AUTHORITY | MUST-REFUSE forbidden |
| rate over l.818-830 | applyRate count>=limit finish(27) packed 127 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE rate over |
| rate window Date.now reset/stretch l.821-826 KRN-N2 | applyRate jumpToken 1/2 finish(28) packed 128 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | MUST-REFUSE forward and backward jump |
| malformed JSON l.422 | applyDecode malformedToken 1 finish(29) packed 129 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE malformed |
| JSON null l.860 | applyDecode jsonNullToken 1 finish(30) packed 130 | PRESERVED | NO_NULL_NAN | MUST-REFUSE json null |
| duplicate JSON keys l.570 | applyDecode dupKeysToken 1 finish(31) packed 131 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE dup keys |
| unknown field closed type | applyDecode unknownFieldToken 1 finish(32) packed 132 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE unknown field |
| memory budget l.503 | applyBudget bodyBytes>memory finish(33) packed 133 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE memory |
| concurrency over l.892 | applyConcurrency current>=max finish(34) packed 134 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE concurrency |
| slot not released l.1181 | applyConcurrency releasedToken 0 finish(59) packed 159 | INTENDED_DIVERGENCE | LINEAR_SECRET | MUST-REFUSE slot held |
| deadline handler still running keeps slot | applyConcurrency zombie 1 released 0 packed 100 | PRESERVED | DEADLINE_COVERS_ALL | slot kept for still-running |
| clock missing | applyClock clockPresent 0 finish(21) packed 121 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | MUST-REFUSE clock missing |
| clock backwards KRN-N2 | applyClock clock < armedAt finish(22) packed 122 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | MUST-REFUSE backwards |
| clock epoch mismatch | applyClock finish(23) packed 123 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | MUST-REFUSE epoch |
| armedAt+budget overflow | applyClock finish(51) packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE overflow |
| deadline at every gate KRN-N1 (TS arms at dispatch l.988) | applyClock clock past budget finish(47) packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | MUST-REFUSE deadline; mutant RED |
| caller mint l.910 KRN-N5 | mintOperation callerMintToken 1 finish(37) packed 137 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE caller mint |
| mint capability absent | mintOperation randomness 0 finish(36) packed 136 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE mint absent |
| secret unavailable l.928 | applySecrets CALL admit then bind; finish(35) packed 135 | PRESERVED | LINEAR_SECRET | MUST-REFUSE secret unavailable |
| mintedOp/secretOp bind Q34 IC N4 | applySecrets mintedOp != secretOp finish(35) packed 135 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE bind mismatch; mutant RED |
| idempotency missing key l.409 | reserveIdempotency claimToken 0 finish(38) packed 138 then cancel | PRESERVED | BOUNDED_INPUT | MUST-REFUSE missing key cancelled |
| duplicate key | reserveIdempotency claimToken 2 finish(39) packed 139 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE duplicate |
| store full | reserveIdempotency claimToken 3 finish(40) packed 140 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE full |
| store throw | reserveIdempotency claimToken 4 finish(6) packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | store throw UNKNOWN never REFUSED |
| retry after dispatch MB-19 | reserveIdempotency alreadyReserved+dispatch finish(6) packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE retry; mutant RED |
| post-dispatch cancel MB-19 | settleIdempotency settleToken 1 after dispatch finish(43) packed 143 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE unconditional delete; mutant RED |
| post-dispatch crash | settleIdempotency settleToken 2 finish(6) packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE crash UNKNOWN |
| handler throw | applyDispatch handlerToken 1 finish(6) packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | handler throw UNKNOWN |
| handler never settles | applyDispatch handlerToken 2 finish(47) packed 147 | PRESERVED | DEADLINE_COVERS_ALL | MUST-REFUSE never-settles |
| unlisted handler shape | applyDispatch handlerToken 3 finish(11) packed 111 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unlisted shape |
| getSecret undefined after deadline l.1113 KRN-N4 | getSecretAccess deadlineToken 1 finish(52) packed 152 | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE typed 52; mutant RED |
| getSecret after spend | getSecretAccess spentToken 1 finish(53) packed 153 | INTENDED_DIVERGENCE | LINEAR_SECRET | MUST-REFUSE spent |
| getSecret reentrant | getSecretAccess reentrantToken 1 finish(54) packed 154 | INTENDED_DIVERGENCE | LINEAR_SECRET | MUST-REFUSE reentrant |
| getSecret after failure | getSecretAccess failedToken 1 finish(55) packed 155 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE failed |
| getSecret undeclared | getSecretAccess declaredToken 0 finish(56) packed 156 | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | MUST-REFUSE undeclared |
| getSecret inactive | getSecretAccess activeToken 0 finish(52) packed 152 | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE inactive |
| revoke first commit-point | applyConsume revokeCommittedToken 1 packed 102 | PRESERVED | P24-R1 | landed consume revoke-first |
| validity before revoke | applyConsume currentValidity 0 packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | validity-before-revoke 106 |
| ack before audit l.1341-1369 KRN-N3 | applyFinalize auditPacked != 100 finish(6); ackStep after audit | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | audit fail never ack; mutant RED |
| spent path never packed 100 Astra W1 | applyFinalize spentToken 1 never 100 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | spent 106 |
| unspent returns dispatch packed | applyFinalize spentToken 0 return dispatchPacked | PRESERVED | TOTAL_EFFECT_OUTCOME | unspent 100 |
| recovery unlisted default CN-2 | recoverLease classifyRecovery then finish(38) packed 138 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unlisted; mutant RED |
| HTTP map default 503 l.537 | httpStatusFor unlisted 503; 120=404 121=405 123=413 124=415 125=401 126=403 127/134=429 129=422 139=409 147=504 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | HTTP map total |
| performance.now / Date.now l.79-81 | no clock source in unit | NEEDS_LANGUAGE | MONOTONIC_TYPED_TIME | clock missing 121; q46 types CARRIED_UNKNOWN |
| crypto.timingSafeEqual | equality only | NEEDS_LANGUAGE | CONSTANT_TIME_COMPARE | MB-15 native intrinsic absent |
| PQ hybrid AND | no PQ in toolchain | NEEDS_LANGUAGE | hybrid AND | classical never Assured |
| HOST_ADAPTER_PRESENCE | c-boundary classTag | UNKNOWN | HOST_ADAPTER_PRESENCE | foreign 110; Q44 not imported |
| MB-06 listed cleanup | applyConsume cleanupEvidence through rcp | UNKNOWN | MB-06 CARRIED_UNKNOWN | Q43 not imported; listed cleanup 106 |
| Addendum D OPEN ordering/FFI/cleanup-binding | typed 106 | UNKNOWN | TOTAL_EFFECT_OUTCOME | OPEN items carried |
| captured JS intrinsics l.66-80 | host adapter | UNKNOWN | SEALED_INTRINSICS | MB-13/MB-17 CARRIED_UNKNOWN |

P24-F1, P24-F2, P24-F3b, P24-F4, P24-N1, P24-N3, P24-N4: OUT_OF_UNIT secret-arena (later U3). Listed, not dropped.

Summary counts (rows above): PRESERVED 24 / INTENDED_DIVERGENCE 36 / UNKNOWN 5 / NEEDS_LANGUAGE 3.

ABANDONED_TS_DESIGN:
- unit APP_KERNEL; obligation DEADLINE_COVERS_ALL KRN-N1; why TS arms deadline only at dispatch; .fungi arms at gate 1 covering every stage
- unit APP_KERNEL; obligation MONOTONIC_TYPED_TIME KRN-N2; why TS rate windows use wall clock reset/stretch; .fungi jump refuses
- unit APP_KERNEL; obligation TOTAL_EFFECT_OUTCOME KRN-N3; why TS ack then swallows audit-commit failure; .fungi ack only after audit, UNKNOWN on fail
- unit APP_KERNEL; obligation NO_NULL_NAN KRN-N4; why TS getSecret returns undefined; .fungi typed 52-56
- unit APP_KERNEL; obligation UNFORGEABLE_CAPABILITY KRN-N5; why TS empty-string mint; .fungi typed mint-absent/caller-mint
- unit APP_KERNEL; obligation NO_AMBIENT_AUTHORITY construction 18; why TS console.warn for secret-no-provider; .fungi construction refusal
- unit APP_KERNEL; obligation TOTAL_EFFECT_OUTCOME Astra W1; why TS post-consume 200-acked; .fungi spent never packed 100
