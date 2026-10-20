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
| deadline handler still running is held-slot | applyConcurrency zombie 1 released 0 packed 159 | INTENDED_DIVERGENCE | LINEAR_SECRET | MUST-REFUSE held-slot 159 |
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
| ack before audit l.1341-1369 KRN-N3 | applyFinalize spent auditPacked != 100 finish(44) packed 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | audit-failed-no-ack 144; mutant RED 144 to 106 |
| spent path never packed 100 Astra W1 | applyFinalize spentToken 1 never 100 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | spent 106 |
| unspent listed dispatch after audit | applyFinalize spentToken 0 listed dispatch consume != 100 audit 100 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | unspent gated; unlisted dispatch 106 |
| recovery unlisted default CN-2 | recoverLease classifyRecovery then finish(38) packed 138 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unlisted; mutant RED |
| HTTP map default 503 l.537 | httpStatusFor unlisted 503; 120=404 121=405 123=413 124=415 125=401 126=403 127/134=429 129=422 139=409 144=503 147=504 159=503 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | HTTP map total |
| performance.now / Date.now l.79-81 | no clock source in unit | NEEDS_LANGUAGE | MONOTONIC_TYPED_TIME | clock missing 121; q46 types CARRIED_UNKNOWN |
| crypto.timingSafeEqual | equality only | NEEDS_LANGUAGE | CONSTANT_TIME_COMPARE | MB-15 native intrinsic absent |
| PQ hybrid AND | no PQ in toolchain | NEEDS_LANGUAGE | hybrid AND | classical never Assured |
| HOST_ADAPTER_PRESENCE | c-boundary classTag | UNKNOWN | HOST_ADAPTER_PRESENCE | foreign 110; Q44 not imported |
| MB-06 listed cleanup | applyConsume cleanupEvidence through rcp | UNKNOWN | MB-06 CARRIED_UNKNOWN | Q43 not imported; listed cleanup 106 |
| Addendum D OPEN ordering/FFI/cleanup-binding | typed 106 | UNKNOWN | TOTAL_EFFECT_OUTCOME | OPEN items carried |
| captured JS intrinsics l.66-80 | host adapter | UNKNOWN | SEALED_INTRINSICS | MB-13/MB-17 CARRIED_UNKNOWN |

| composed pre-dispatch TS order | runPreDispatch clock per stage then applyDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | refusal never dispatch; readChunks cap+1 123 |
| composed post-dispatch clock | runPostDispatch clock before consume finalize audit | PRESERVED | DEADLINE_COVERS_ALL | deadline 147 at finalize and audit |
| audit failed ack not recorded | applyFinalize spent audit != 100 finish(44) packed 144 HTTP 503 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | distinct from acked-after-audit 106 |
| skip-one-wipe | rcp finish packed +100 wipe construct | UNKNOWN | LINEAR_SECRET | WIPE_OUTSIDE_UNIT |

P24-F1, P24-F2, P24-F3b, P24-F4, P24-N1, P24-N3, P24-N4: OUT_OF_UNIT secret-arena (later U3). Listed, not dropped.

Summary counts (rows above): PRESERVED 25 / INTENDED_DIVERGENCE 38 / UNKNOWN 6 / NEEDS_LANGUAGE 3.

ABANDONED_TS_DESIGN:
- unit APP_KERNEL; obligation DEADLINE_COVERS_ALL KRN-N1; why TS arms deadline only at dispatch; .fungi arms at gate 1 covering every stage
- unit APP_KERNEL; obligation MONOTONIC_TYPED_TIME KRN-N2; why TS rate windows use wall clock reset/stretch; .fungi jump refuses
- unit APP_KERNEL; obligation TOTAL_EFFECT_OUTCOME KRN-N3; why TS ack then swallows audit-commit failure; .fungi ack only after audit, UNKNOWN on fail
- unit APP_KERNEL; obligation NO_NULL_NAN KRN-N4; why TS getSecret returns undefined; .fungi typed 52-56
- unit APP_KERNEL; obligation UNFORGEABLE_CAPABILITY KRN-N5; why TS empty-string mint; .fungi typed mint-absent/caller-mint
- unit APP_KERNEL; obligation NO_AMBIENT_AUTHORITY construction 18; why TS console.warn for secret-no-provider; .fungi construction refusal
- unit APP_KERNEL; obligation TOTAL_EFFECT_OUTCOME Astra W1; why TS post-consume 200-acked; .fungi spent never packed 100

## Frozen TS 20 createAppKernel files

Oracle `dc0f9c8c`. Count 20 files, 242 `test`/`it` cases. Live `handle()` only for proven ingress/construction vectors (404, 405, unknown posture throw). Remaining cases map to flattened fungi probes or typed UNKNOWN.

| # | file | cases | probe | verdict | obligation | unknownReason |
|---|---|---|---|---|---|---|
| 1 | `app-frame-hardening.test.mjs` | 31 | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 2 | `audit-async.test.mjs` | 11 | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 3 | `handler-reference-check.test.mjs` | 10 | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 4 | `kernel.test.mjs` | 23 | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 5 | `posture-resolution.test.mjs` | 5 | constructKernel postureToken | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_POSTURE_THROW |
| 6 | `rd0361-kernel-auth-gate-execution.test.mjs` | 1 | admitAuth | PRESERVED | NO_AMBIENT_AUTHORITY | TS_AUTH_GATE_LIVE_HANDLE |
| 7 | `rd1413-release-commit-point.test.mjs` | 26 | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 8 | `rd1414-hostile-intrinsics.test.mjs` | 3 | constructKernel intrinsicToken | UNKNOWN | SEALED_INTRINSICS | TS_HOSTILE_INTRINSICS_CARRIED_UNKNOWN |
| 9 | `rd1414-sync-deadline.test.mjs` | 19 | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 10 | `rd1415-ack-after-publication-audit.test.mjs` | 3 | applyFinalize spent auditPacked != 100 packed 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THEN_AUDIT |
| 11 | `rd1415-ack-downgrade.test.mjs` | 10 | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 12 | `rd1415-ack-throw-fail-closed.test.mjs` | 9 | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 13 | `rd1415-epoch-required.test.mjs` | 2 | applyClock / applySecrets / mintOperation epoch packed 123 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | TS_EPOCH_OPTIONAL |
| 14 | `rd1415-hostile-proxy-dispatch.test.mjs` | 4 | applyDispatch handlerToken 1 packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_NEEDS_PROXY_DISPATCH_FIXTURE |
| 15 | `rd1415-kernel-minted-id.test.mjs` | 2 | mintOperation callerMintToken packed 137 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | TS_EMPTY_STRING_MINT |
| 16 | `rd1415-overflow-epoch.test.mjs` | 14 | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 17 | `rd1415-staging-refusal-after-consume.test.mjs` | 1 | applyConsume / applyFinalize spent packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_STAGING_AFTER_CONSUME |
| 18 | `relaxation-report.test.mjs` | 9 | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 19 | `secret-gate.test.mjs` | 39 | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 20 | `security-closure.test.mjs` | 20 | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |

## Frozen TS 242 cases

| # | file | case | probe | verdict | obligation | unknownReason |
|---|---|---|---|---|---|---|
| 1 | `app-frame-hardening.test.mjs` | S1 refuses ${block}.${field} = ${String(bad)} at construction | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 2 | `app-frame-hardening.test.mjs` | S1 admits integer ${block}.${field} (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 3 | `app-frame-hardening.test.mjs` | S1 refuses limits.timeoutMs above the host timer ceiling | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 4 | `app-frame-hardening.test.mjs` | S1 zero is fail-closed, not refused: maxSizeBytes 0 refuses every body (413) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 5 | `app-frame-hardening.test.mjs` | S1 NaN can no longer disable the body ceiling or concurrency limit (previously 200) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 6 | `app-frame-hardening.test.mjs` | S1 refuses idempotency.ttlSeconds = ${String(bad)} | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 7 | `app-frame-hardening.test.mjs` | S1 admits a positive idempotency.ttlSeconds (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 8 | `app-frame-hardening.test.mjs` | S2 refuses auth.mode = ${JSON.stringify(bad)} | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 9 | `app-frame-hardening.test.mjs` | S2 admits auth.mode required/public (controls); required without a verdict is 401 | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 10 | `app-frame-hardening.test.mjs` | S2 refuses a wrong-case or unknown method | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 11 | `app-frame-hardening.test.mjs` | S2 refuses ${name} = ${JSON.stringify(value)} | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 12 | `app-frame-hardening.test.mjs` | S2 admits valid enum, boolean and list values (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 13 | `app-frame-hardening.test.mjs` | S2 resolveEffectiveRoutePolicy refuses directly too, and rejects an unknown resolved posture | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 14 | `app-frame-hardening.test.mjs` | S8 refuses body.unknownFields 'strip' (not implemented) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 15 | `app-frame-hardening.test.mjs` | S8 'deny' still refuses an extra field at request time (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 16 | `app-frame-hardening.test.mjs` | S3 refuses posture ${JSON.stringify(bad)} (previously downgraded to 'off') | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 17 | `app-frame-hardening.test.mjs` | S3 refuses an unknown env string | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 18 | `app-frame-hardening.test.mjs` | S3 admits off/on/auto and omitted posture (controls); 'on' still tightens the body ceiling | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 19 | `app-frame-hardening.test.mjs` | S4 refuses two declarations for the same method and path | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 20 | `app-frame-hardening.test.mjs` | S4 admits the same path with different methods (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 21 | `app-frame-hardening.test.mjs` | S5 a handler-forged {error} body is NOT recorded as a kernel gate code | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 22 | `app-frame-hardening.test.mjs` | S5 a real kernel refusal records its own gate code (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 23 | `app-frame-hardening.test.mjs` | S5 a handler success records origin 'handler' and no code | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 24 | `app-frame-hardening.test.mjs` | S7 malformed bodies use up the rate budget (previously 3x422 then 200) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 25 | `app-frame-hardening.test.mjs` | S7 a well-formed body inside the budget is admitted (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 26 | `app-frame-hardening.test.mjs` | S9 a truthy non-boolean registry verdict refuses the fuse | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 27 | `app-frame-hardening.test.mjs` | S9 a literal true registry verdict still admits (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 28 | `app-frame-hardening.test.mjs` | S8b refuses idempotency.onDuplicate 'replay' (not implemented) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 29 | `app-frame-hardening.test.mjs` | S8b refuses 'replay' even on a disabled idempotency block (a declaration must not lie) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 30 | `app-frame-hardening.test.mjs` | S8b resolveEffectiveRoutePolicy refuses 'replay' directly too | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 31 | `app-frame-hardening.test.mjs` | S8b 'reject' still admits and a duplicate key is 409; the default resolves to 'reject' (control) | constructKernel / admitMatch / admitAuth / applyRate | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_CONSTRUCTION_THROWS_FUNGI_PACKED |
| 32 | `audit-async.test.mjs` | posture 'on' tightens kernel body ceiling (256KB default -> 64KB hardened) | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 33 | `audit-async.test.mjs` | audit events are emitted and visible after a tick (default in-memory sink) | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 34 | `audit-async.test.mjs` | in-memory audit acceptance survives scheduler failure and retries before the next reservation | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 35 | `audit-async.test.mjs` | audit event carries the typed error code for a rejected request | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 36 | `audit-async.test.mjs` | unmatched 404/405 traffic does not consume mandatory audit capacity | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 37 | `audit-async.test.mjs` | a slow audit sink does NOT delay handle()'s response | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 38 | `audit-async.test.mjs` | a throwing audit sink refuses a route that requires a runtime report | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 39 | `audit-async.test.mjs` | default audit sink is used when none is supplied (no crash, response intact) | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 40 | `audit-async.test.mjs` | hostile: unknown-path 404s cannot exhaust mandatory audit capacity | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 41 | `audit-async.test.mjs` | mandatory audit capacity is reserved before handler effects | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 42 | `audit-async.test.mjs` | audit reservations are exact affine capabilities | applyFinalize auditPacked / httpStatusFor 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ASYNC_AUDIT_SINK_NOT_IN_UNIT |
| 43 | `handler-reference-check.test.mjs` | accepts routes whose handlers are own function entries | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 44 | `handler-reference-check.test.mjs` | accepts a null-prototype dispatch | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 45 | `handler-reference-check.test.mjs` | refuses a missing handler with the route index | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 46 | `handler-reference-check.test.mjs` | refuses names that resolve only through the prototype chain | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 47 | `handler-reference-check.test.mjs` | refuses non-function entries and never invokes accessors | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 48 | `handler-reference-check.test.mjs` | refuses malformed inputs | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 49 | `handler-reference-check.test.mjs` | does not read an inherited or accessor 'handler' on the route itself | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 50 | `handler-reference-check.test.mjs` | never echoes the handler name | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 51 | `handler-reference-check.test.mjs` | assertHandlerReferences is silent when every reference resolves | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 52 | `handler-reference-check.test.mjs` | documents the gaps it closes: missing handler accepted at boot, inherited handler dispatched | constructKernel intrinsicToken / applyDispatch handlerToken 4 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | TS_HANDLER_REF_CONSTRUCTION |
| 53 | `kernel.test.mjs` | auth-required route with no Authorization header -> 401, handler NOT run | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 54 | `kernel.test.mjs` | auth: channel verdict DENY (-1) refuses admission, handler NOT run | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 55 | `kernel.test.mjs` | auth: channel verdict INDETERMINATE (0) refuses admission (fail-closed), handler NOT run | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 56 | `kernel.test.mjs` | auth: channel verdict ALLOW (+1) admits even with NO Authorization header (handler runs) | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 57 | `kernel.test.mjs` | auth: required + no verdict + header PRESENT but no opt-in → 401 (tightened default) | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 58 | `kernel.test.mjs` | auth: legacy header-presence opt-in is refused even with a non-empty header | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 59 | `kernel.test.mjs` | auth: legacy header-presence opt-in is refused when no header is present | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 60 | `kernel.test.mjs` | auth: legacy header-presence opt-in is refused with an empty header | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 61 | `kernel.test.mjs` | auth: legacy header-presence opt-in is refused with a whitespace-only header | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 62 | `kernel.test.mjs` | public route is allowed without Authorization (handler runs) | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 63 | `kernel.test.mjs` | unknown path -> 404 | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 64 | `kernel.test.mjs` | known path, wrong method -> 405 | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 65 | `kernel.test.mjs` | oversize body -> 413, handler NOT run | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 66 | `kernel.test.mjs` | content-type mismatch -> 415 | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 67 | `kernel.test.mjs` | invalid JSON body -> 422 | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 68 | `kernel.test.mjs` | handler runs ONLY after all gates pass (correct ordering) | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 69 | `kernel.test.mjs` | handler that throws -> safe 500, no leak | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 70 | `kernel.test.mjs` | idempotency: duplicate key -> 409 without echoing the key | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 71 | `kernel.test.mjs` | idempotency claim is deferred until rate admission succeeds | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 72 | `kernel.test.mjs` | malformed atomic claim result fails closed before handler dispatch | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 73 | `kernel.test.mjs` | over concurrency limit -> 429 | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 74 | `kernel.test.mjs` | F3: a THROWING handler releases the concurrency slot (no phantom-slot self-DoS) | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 75 | `kernel.test.mjs` | the pipeline order is fixed: there is no way to register middleware | admitMatch / admitBody / applyRate / applyDispatch / runPreDispatch | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | TS_HANDLE_INGRESS_OR_FULL_PIPELINE |
| 76 | `posture-resolution.test.mjs` | posture 'auto' + production → resolves 'on' (fail-secure, chose the secure default), recorded in audit | constructKernel postureToken | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_POSTURE_THROW |
| 77 | `posture-resolution.test.mjs` | posture 'auto' + development → resolves 'off' (host trusted in dev) | constructKernel postureToken | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_POSTURE_THROW |
| 78 | `posture-resolution.test.mjs` | posture 'auto' + unknown env (omitted) → fail-secure 'on' | constructKernel postureToken | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_POSTURE_THROW |
| 79 | `posture-resolution.test.mjs` | posture 'auto' + production tightens the body ceiling (behaviour matches 'on') | constructKernel postureToken | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_POSTURE_THROW |
| 80 | `posture-resolution.test.mjs` | pre-resolved 'on'/'off' and the default (omitted) do NOT add resolvedPosture (strictly additive) | constructKernel postureToken | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS_POSTURE_THROW |
| 81 | `rd0361-kernel-auth-gate-execution.test.mjs` | RD-0361 kernel · auth gate 6: R0 build → R1 #105-admit → R3 WASM ≡ real kernel handle (string-arg twin) | admitAuth | PRESERVED | NO_AMBIENT_AUTHORITY | TS_AUTH_GATE_LIVE_HANDLE |
| 82 | `rd1413-release-commit-point.test.mjs` | CAS: missing lease refuses | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 83 | `rd1413-release-commit-point.test.mjs` | CAS: stale ordering token refuses and fences the unused lease | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 84 | `rd1413-release-commit-point.test.mjs` | CAS: stale epoch refuses as one compare-and-consume step | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 85 | `rd1413-release-commit-point.test.mjs` | CAS: replayed consumed lease refuses | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 86 | `rd1413-release-commit-point.test.mjs` | CAS: revoke-before-release fences; consume refuses | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 87 | `rd1413-release-commit-point.test.mjs` | CAS: release-before-revoke completes once; later fence cannot recall | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 88 | `rd1413-release-commit-point.test.mjs` | CAS: uncertain delivery is status-only; no retry redisclosure | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 89 | `rd1413-release-commit-point.test.mjs` | getSecret: revoke-before-release (epoch advanced after open) refuses with no consumer entry | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 90 | `rd1413-release-commit-point.test.mjs` | getSecret: release-before-revoke delivers once; later revoke cannot recall or reuse | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 91 | `rd1413-release-commit-point.test.mjs` | getSecret: consumer throw after D is delivery-unknown; retry refuses without redisclosure | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 92 | `rd1413-release-commit-point.test.mjs` | getSecret: SealArena-like transient wipe still delivers when has() stays true | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 93 | `rd1413-release-commit-point.test.mjs` | getSecret: SealArena-like revoke after use (has false) fences without consumer entry | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 94 | `rd1413-release-commit-point.test.mjs` | kernel: result-sink fence maps to 503 secret_unavailable without leaking | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 95 | `rd1413-release-commit-point.test.mjs` | R1: no deliverable copy before D; D then copy then provider wipe | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 96 | `rd1413-release-commit-point.test.mjs` | R2: revoke inside use before D refuses, no consumer, lease fenced | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 97 | `rd1413-release-commit-point.test.mjs` | R3: no provider callback between epoch read and D mark | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 98 | `rd1413-release-commit-point.test.mjs` | R4: empty operationId refuses missing with no provider open | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 99 | `rd1413-release-commit-point.test.mjs` | R5: provider without revocationEpoch still delivers (fixture residual: epoch 0) | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 100 | `rd1413-release-commit-point.test.mjs` | R6: lease map stays at cap; evicted id cannot be minted again | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 101 | `rd1413-release-commit-point.test.mjs` | R7: forged Error named SecretReleaseRefused is 500 not 503 | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 102 | `rd1413-release-commit-point.test.mjs` | lease cap: 1025 unused mints refuse the last and size stays at cap | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 103 | `rd1413-release-commit-point.test.mjs` | lease cap: getSecret whose use never callbacks leaves size unchanged | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 104 | `rd1413-release-commit-point.test.mjs` | F1: mint of an in-flight unused operationId refuses and leaves the outer lease | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 105 | `rd1413-release-commit-point.test.mjs` | F1: dropIfUnused drops only the minted token | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 106 | `rd1413-release-commit-point.test.mjs` | F1: nested getSecret with shared operationId cannot drop the outer unused lease | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 107 | `rd1413-release-commit-point.test.mjs` | F1 controls: failed-open, consumed, fenced, and retired-ID stay unchanged | applyConsume / recoverLease | UNKNOWN | P24-F1 OUT_OF_UNIT | RCP_OWN_UNIT_NOT_IMPORTED_AS_Q43 |
| 108 | `rd1414-hostile-intrinsics.test.mjs` | an inherited thenable getter cannot expose and weaken private route policy | constructKernel intrinsicToken | UNKNOWN | SEALED_INTRINSICS | TS_HOSTILE_INTRINSICS_CARRIED_UNKNOWN |
| 109 | `rd1414-hostile-intrinsics.test.mjs` | a handler cannot suppress mandatory audit retention by replacing Array.prototype.push | constructKernel intrinsicToken | UNKNOWN | SEALED_INTRINSICS | TS_HOSTILE_INTRINSICS_CARRIED_UNKNOWN |
| 110 | `rd1414-hostile-intrinsics.test.mjs` | a handler cannot replace Promise.race and strand deadline settlement | constructKernel intrinsicToken | UNKNOWN | SEALED_INTRINSICS | TS_HOSTILE_INTRINSICS_CARRIED_UNKNOWN |
| 111 | `rd1414-sync-deadline.test.mjs` | a synchronous handler that returns after its deadline is refused | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 112 | `rd1414-sync-deadline.test.mjs` | a handler cannot replace AbortController.abort and strand timeout settlement | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 113 | `rd1414-sync-deadline.test.mjs` | response serialization that crosses the deadline cannot publish success | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 114 | `rd1414-sync-deadline.test.mjs` | response serialization failure after the deadline remains a timeout refusal | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 115 | `rd1414-sync-deadline.test.mjs` | response size uses the typed-array intrinsic without invoking an own byteLength getter | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 116 | `rd1414-sync-deadline.test.mjs` | an own typed-array byteLength getter cannot conceal an over-budget response | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 117 | `rd1414-sync-deadline.test.mjs` | deadline refusal takes precedence when a blocking body getter also exceeds the response budget | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 118 | `rd1414-sync-deadline.test.mjs` | deadline arbitration ignores a handler-installed AbortSignal aborted getter | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 119 | `rd1414-sync-deadline.test.mjs` | a handler cannot replace Reflect.apply to bypass intrinsic response sizing | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 120 | `rd1414-sync-deadline.test.mjs` | response encoding enforces the private route budget despite handler mutation | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 121 | `rd1414-sync-deadline.test.mjs` | published typed-array bytes are stable against handler microtasks | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 122 | `rd1414-sync-deadline.test.mjs` | serialization cannot replace the monotonic clock used for deadline arbitration | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 123 | `rd1414-sync-deadline.test.mjs` | public handle re-arbitrates after the internal pipeline await | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 124 | `rd1414-sync-deadline.test.mjs` | handler-installed audit getters are not invoked after the publication deadline check | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 125 | `rd1414-sync-deadline.test.mjs` | audit timestamps do not execute a handler-replaced Date.now callback | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 126 | `rd1414-sync-deadline.test.mjs` | a synchronous handler cannot acquire a secret after its deadline | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 127 | `rd1414-sync-deadline.test.mjs` | a provider that crosses the deadline cannot deliver plaintext to the consumer | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 128 | `rd1414-sync-deadline.test.mjs` | a provider that blocks after staging cannot deliver plaintext past the deadline | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 129 | `rd1414-sync-deadline.test.mjs` | a late synchronous throw after deadline releases its in-flight slot | applyClock / runPreDispatch / runPostDispatch packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | TS_DEADLINE_ARMS_AT_DISPATCH |
| 130 | `rd1415-ack-after-publication-audit.test.mjs` | audit-sink commit throw is HTTP 503 and status is not acknowledged | applyFinalize spent auditPacked != 100 packed 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THEN_AUDIT |
| 131 | `rd1415-ack-after-publication-audit.test.mjs` | late provider callback before publication seal is error HTTP and not acknowledged | applyFinalize spent auditPacked != 100 packed 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THEN_AUDIT |
| 132 | `rd1415-ack-after-publication-audit.test.mjs` | clean publication and audit commit acknowledges the lease | applyFinalize spent auditPacked != 100 packed 144 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THEN_AUDIT |
| 133 | `rd1415-ack-downgrade.test.mjs` | audit commit throw after ack is HTTP 503 and DELIVERY_UNKNOWN | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 134 | `rd1415-ack-downgrade.test.mjs` | acknowledgeMinted throw after super.ack is DELIVERY_UNKNOWN never RELEASED_ACKED | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 135 | `rd1415-ack-downgrade.test.mjs` | revokeDelivery is one-way and never upgrades a missing operation | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 136 | `rd1415-ack-downgrade.test.mjs` | minted operation whose status lies NOT_FOUND is HTTP 500 | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 137 | `rd1415-ack-downgrade.test.mjs` | publication deadline after getSecret is DELIVERY_UNKNOWN | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 138 | `rd1415-ack-downgrade.test.mjs` | mutant: drop kernel downgrade on audit throw leaves ACKED | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 139 | `rd1415-ack-downgrade.test.mjs` | mutant: revokeDelivery no-op leaves ACKED after audit throw | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 140 | `rd1415-ack-downgrade.test.mjs` | mutant: revokeDelivery must not upgrade a missing op to acknowledged | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 141 | `rd1415-ack-downgrade.test.mjs` | mutant: trust status NOT_FOUND skip leaves minted op unacked success | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 142 | `rd1415-ack-downgrade.test.mjs` | mutant: not-ok finalize skips noteUnknown | applyFinalize spent full success packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_POST_CONSUME_200 |
| 143 | `rd1415-ack-throw-fail-closed.test.mjs` | kernel: acknowledge throw is delivery-unknown and never acknowledged | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 144 | `rd1415-ack-throw-fail-closed.test.mjs` | kernel: acknowledge throw on A leaves concurrent B acknowledged | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 145 | `rd1415-ack-throw-fail-closed.test.mjs` | kernel: acknowledge throw commits audit status 500 origin kernel | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 146 | `rd1415-ack-throw-fail-closed.test.mjs` | kernel: acknowledge ${outcome} is HTTP 500 and never acknowledged | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 147 | `rd1415-ack-throw-fail-closed.test.mjs` | kernel: acknowledge unrecognized outcome is HTTP 500 and never acknowledged | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 148 | `rd1415-ack-throw-fail-closed.test.mjs` | kernel: acknowledgeMinted throw after setting acknowledged is HTTP 500 audit 500 | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 149 | `rd1415-ack-throw-fail-closed.test.mjs` | mutant: audit before finalize goes red | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 150 | `rd1415-ack-throw-fail-closed.test.mjs` | mutant: ignore ack outcome goes red | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 151 | `rd1415-ack-throw-fail-closed.test.mjs` | mutant: leave acknowledged on post-commit throw is blocked | applyFinalize spent ack throw packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_ACK_THROW_SWALLOW |
| 152 | `rd1415-epoch-required.test.mjs` | kernel: ${scenario.name} seals 503, consumer not called, zero escapes | applyClock / applySecrets / mintOperation epoch packed 123 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | TS_EPOCH_OPTIONAL |
| 153 | `rd1415-epoch-required.test.mjs` | kernel: in-flight microtask missing epoch seals 503 with zero uncaughtException | applyClock / applySecrets / mintOperation epoch packed 123 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | TS_EPOCH_OPTIONAL |
| 154 | `rd1415-hostile-proxy-dispatch.test.mjs` | kernel: ${scenario.name} is HTTP 500 and delivery-unknown | applyDispatch handlerToken 1 packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_NEEDS_PROXY_DISPATCH_FIXTURE |
| 155 | `rd1415-hostile-proxy-dispatch.test.mjs` | concurrent hostile A during in-flight B does not touch B's lease | applyDispatch handlerToken 1 packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_NEEDS_PROXY_DISPATCH_FIXTURE |
| 156 | `rd1415-hostile-proxy-dispatch.test.mjs` | spent A throw while B waits is A delivery-unknown and B acknowledged | applyDispatch handlerToken 1 packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_NEEDS_PROXY_DISPATCH_FIXTURE |
| 157 | `rd1415-hostile-proxy-dispatch.test.mjs` | 503 refusal then throwing request does not touch the earlier operation | applyDispatch handlerToken 1 packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_NEEDS_PROXY_DISPATCH_FIXTURE |
| 158 | `rd1415-kernel-minted-id.test.mjs` | kernel: client operation id in header body query is never the lease id | mintOperation callerMintToken packed 137 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | TS_EMPTY_STRING_MINT |
| 159 | `rd1415-kernel-minted-id.test.mjs` | kernel: two kernels sharing one authority and requestId get different lease ids | mintOperation callerMintToken packed 137 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | TS_EMPTY_STRING_MINT |
| 160 | `rd1415-overflow-epoch.test.mjs` | readForeignSafeInteger refuses null NaN Infinity non-integers and non-numbers | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 161 | `rd1415-overflow-epoch.test.mjs` | N1a: never-minted reads NOT_FOUND before any tombstone drop | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 162 | `rd1415-overflow-epoch.test.mjs` | N1a: after a tombstone drop, absent ids read DELIVERY_UNKNOWN | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 163 | `rd1415-overflow-epoch.test.mjs` | N1b P3: remint of dropped op-0 does not return released | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 164 | `rd1415-overflow-epoch.test.mjs` | N1b: authority-issued ids are unique and mint refuses unissued issued-form ids | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 165 | `rd1415-overflow-epoch.test.mjs` | N1b: two kernels sharing one authority and requestId get different lease ids | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 166 | `rd1415-overflow-epoch.test.mjs` | N3: consume with NaN Infinity -1 1.5 string object refuses and fences | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 167 | `rd1415-overflow-epoch.test.mjs` | N3: ack with NaN Infinity -1 1.5 string object refuses and changes nothing | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 168 | `rd1415-overflow-epoch.test.mjs` | N4: unused and default still read DELIVERY_UNKNOWN | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 169 | `rd1415-overflow-epoch.test.mjs` | mutant: watermark drop reads NOT_FOUND goes red then restores green | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 170 | `rd1415-overflow-epoch.test.mjs` | mutant: remint of a dropped id goes red then restores green | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 171 | `rd1415-overflow-epoch.test.mjs` | mutant: M17 skip NaN fence goes red then restores green | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 172 | `rd1415-overflow-epoch.test.mjs` | mutant: remove never check lets an added state compile | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 173 | `rd1415-overflow-epoch.test.mjs` | mutant: kernel uses requestId alone goes red then restores green | applyClock overflow packed 151 | INTENDED_DIVERGENCE | BOUNDED_INPUT | TS_WIDE_INTEGER_CARRIED_UNKNOWN |
| 174 | `rd1415-staging-refusal-after-consume.test.mjs` | kernel: ${scenario.name} ${mode} does not leave the lease released | applyConsume / applyFinalize spent packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | TS_STAGING_AFTER_CONSUME |
| 175 | `relaxation-report.test.mjs` | a rate above the posture ceiling is a recorded relaxation (off: 60/minute) | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 176 | `relaxation-report.test.mjs` | a rate at or below the ceiling is not a relaxation (off) | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 177 | `relaxation-report.test.mjs` | the rate ceiling is posture-aware (on: 30/minute) | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 178 | `relaxation-report.test.mjs` | a timeout above the posture ceiling is a recorded relaxation (off: 10000 ms) | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 179 | `relaxation-report.test.mjs` | a timeout at or below the ceiling is not a relaxation (0 ms is fail-closed) | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 180 | `relaxation-report.test.mjs` | the timeout ceiling is posture-aware (on: 5000 ms) | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 181 | `relaxation-report.test.mjs` | controls: maxConcurrent stays recorded, defaults record nothing, all three can stack | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 182 | `relaxation-report.test.mjs` | a malformed rate is still refused by the kernel; resolution records no rate relaxation for it | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 183 | `relaxation-report.test.mjs` | the runtime audit event carries the rate and timeout relaxations | constructKernel / httpStatusFor | UNKNOWN | HOST_ADAPTER_PRESENCE | TS_RELAXATION_REPORT_NOT_IN_UNIT |
| 184 | `secret-gate.test.mjs` | secrets: arena backing in use = ${SealArena !== undefined ? "REAL SealArena (ext-secrets-spore/dist)" : "local RefArena fallback"} | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 185 | `secret-gate.test.mjs` | secrets: required secret ABSENT → 503 secret_unavailable, handler NOT run | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 186 | `secret-gate.test.mjs` | secrets: required secret PRESENT → handler runs and reads it via view | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 187 | `secret-gate.test.mjs` | secrets: required secret FAULTED → 503, handler NOT run, getSecret(faulted) → undefined | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 188 | `secret-gate.test.mjs` | secrets: provider ABSENT → 503, handler NOT run (fail-closed) | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 189 | `secret-gate.test.mjs` | secrets: route with NO required secret is unaffected (no-op) even with NO provider | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 190 | `secret-gate.test.mjs` | secrets: ANTI-VACUITY — removing the admit() refusal flips absent-secret to handler-ran | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 191 | `secret-gate.test.mjs` | secrets: malformed provider presence values refuse and never dispatch | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 192 | `secret-gate.test.mjs` | secrets: provider loss during async idempotency admission refuses before dispatch | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 193 | `secret-gate.test.mjs` | secrets: provider revocation during staging refuses before consumer delivery | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 194 | `secret-gate.test.mjs` | secrets: getSecret refuses callback return and async escape channels | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 195 | `secret-gate.test.mjs` | secrets: provider callback cannot turn undefined into an empty byte view | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 196 | `secret-gate.test.mjs` | secrets: provider-caught empty byte value is terminal before consumer code | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 197 | `secret-gate.test.mjs` | secrets: prototype-spoofed Uint16Array is refused before consumer code | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 198 | `secret-gate.test.mjs` | secrets: handler cannot catch a failed required-secret use and still succeed | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 199 | `secret-gate.test.mjs` | secrets: swallowed callback violation during final presence check refuses before delivery | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 200 | `secret-gate.test.mjs` | secrets: swallowed callback violation during consumer execution refuses the request | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 201 | `secret-gate.test.mjs` | secrets: callback violation still observes a forbidden consumer rejection | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 202 | `secret-gate.test.mjs` | secrets: a caught secret-use failure prevents provider re-entry | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 203 | `secret-gate.test.mjs` | secrets: synchronous re-entry during consume refuses the request | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 204 | `secret-gate.test.mjs` | secrets: caught re-entry failure prevents the pending outer secret delivery | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 205 | `secret-gate.test.mjs` | secrets: handler callback refusal cannot return a successful request | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 206 | `secret-gate.test.mjs` | secrets: captured getSecret cannot reacquire after a successful response | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 207 | `secret-gate.test.mjs` | secrets: response serialization cannot use the retired request capability | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 208 | `secret-gate.test.mjs` | secrets: a caught provider callback refusal during response serialization prevents success | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 209 | `secret-gate.test.mjs` | secrets: a provider refusal queued during response serialization prevents publication | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 210 | `secret-gate.test.mjs` | secrets: refusal from an audit hook cannot revise the sealed response or its event | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 211 | `secret-gate.test.mjs` | secrets: a successful request acquisition spends the accessor before any second provider call | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 212 | `secret-gate.test.mjs` | secrets: caught late provider callback violation fails a still-live request | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 213 | `secret-gate.test.mjs` | secrets: in-flight microtask may use capability, but serialization and post-response may not | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 214 | `secret-gate.test.mjs` | secrets: timed-out noncooperative handler cannot reacquire after its late continuation | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 215 | `secret-gate.test.mjs` | secrets: provider callback saved past use cannot later deliver a secret view | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 216 | `secret-gate.test.mjs` | secrets: callback saved after one valid use cannot stage a second value | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 217 | `secret-gate.test.mjs` | secrets: provider Promise return is refused and its rejection is observed | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 218 | `secret-gate.test.mjs` | secrets: invalid async provider return cannot run consumer effects before refusal | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 219 | `secret-gate.test.mjs` | secrets: staged view is wiped on provider and consumer throw paths | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 220 | `secret-gate.test.mjs` | secrets: consumer cannot shadow the gate's staged-buffer wipe | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 221 | `secret-gate.test.mjs` | secrets: provider replacement of global Uint8Array cannot alias provider-owned bytes | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 222 | `secret-gate.test.mjs` | F2: consumer transfer-then-throw keeps original error, wipes gate-owned bytes, runs lease cleanup | applySecrets CALL admit | UNKNOWN | LINEAR_SECRET | Q34_SECRET_GATE_OWN_UNIT |
| 223 | `security-closure.test.mjs` | required scopes deny an admitted channel that lacks a route scope | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 224 | `security-closure.test.mjs` | legacy header-presence authentication is refused at kernel construction | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 225 | `security-closure.test.mjs` | handler secret access is declaration-bound and callback-returned views are refused | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 226 | `security-closure.test.mjs` | handler mutation cannot expand the kernel's private secret authorization snapshot | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 227 | `security-closure.test.mjs` | post-construction mutation of a route declaration cannot rewrite the kernel policy | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 228 | `security-closure.test.mjs` | a handler cannot erase a private required scope through Array.prototype.some | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 229 | `security-closure.test.mjs` | a handler cannot obtain and mutate a private route policy through Map.prototype.get | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 230 | `security-closure.test.mjs` | handler mutation of Array.prototype cannot rewrite secret authorization | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 231 | `security-closure.test.mjs` | handler-installed array iterator cannot mutate the private secret allowlist during the next request | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 232 | `security-closure.test.mjs` | transferred handler copies survive gate wipe and cleanup does not throw after delivery | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 233 | `security-closure.test.mjs` | duplicate JSON keys are denied before the handler | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 234 | `security-closure.test.mjs` | named request types require and execute a closed-schema validator | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 235 | `security-closure.test.mjs` | route rate, deadline, and response-memory budgets are enforced | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 236 | `security-closure.test.mjs` | default idempotency storage expires entries, rejects oversized keys, and stays bounded | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 237 | `security-closure.test.mjs` | atomic claims admit exactly one concurrent duplicate | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 238 | `security-closure.test.mjs` | default audit retention refuses overflow without breaking accepted seals | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 239 | `security-closure.test.mjs` | JSON bodies without a closed request type refuse null and surplus input | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 240 | `security-closure.test.mjs` | enabled idempotency requires a bounded key before dispatch | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 241 | `security-closure.test.mjs` | authenticated rate windows are isolated by a required principal identity | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |
| 242 | `security-closure.test.mjs` | a timed-out handler retains its in-flight slot until underlying work settles | admitMatch / admitAuth / applyDispatch | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | TS_SECURITY_CLOSURE_FULL_HANDLE |

rd1415-ack-after-publication-audit / rd1415-ack-downgrade / rd1415-ack-throw-fail-closed import createAppKernel at dc0f9c8c and map to applyFinalize packed 144/106 (INTENDED_DIVERGENCE TOTAL_EFFECT_OUTCOME).
