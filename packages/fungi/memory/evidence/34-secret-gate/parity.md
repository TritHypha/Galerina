# Q34 parity: secret-gate.fungi

Frozen TS `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts` @ `dc0f9c8c` sha256 `bfb6ccd88ef2cc47017dd8fc439d0d82386954949baaa81244a5471fc52855d8` executed for real (Node type-strip). Frozen `release-commit-point.ts` sha256 `ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3` loaded as the specifier target. A hand-copy of secret-gate logic is not the differential.

Workbench capsule REFUSE `REFUSED` / `evidence:DECODER_UNAVAILABLE`. HOST/FUNGI views typed UNKNOWN. C2 applied under Q31-05 ruling. PROPOSED never permission.
CN-1: import the frozen helper and CALL it. CN-2: import release-commit-point unchanged (blob `b38e774f8e2150a74fed5cc19fb092dcf640cdb3`) and CALL ackStep / classifyRecovery / revokeDelivery / releaseGuard / consumeStep / finish. check 0; build FUNGI-NAME-001; run WAT callee neither defined nor imported. Tests flatten helper body plus release-commit-point plus this unit for invoke.

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`.
c-boundary.fungi git blob `cfec32c93d0cf611010042cb6843d5af5ba6a78a` (q32 ACK base; differs from q31 `a92a3271`; not reconciled).
release-commit-point.fungi git blob `b38e774f8e2150a74fed5cc19fb092dcf640cdb3`.

writing-fungi sections applied: `@version 1`; `pure flow`; sequential if-return; no `else if`; no `null`/`NaN`; no `throw`/`try`/`catch`; no clock; foreign values through one helper; fail-closed unlisted arm; wipe construct `finish(code, true)` with no erase claim.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| secret-gate.ts:181 admit empty require, no provider -> null | admit requiredCount 0 providerPresent 0 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | empty no provider 100 |
| secret-gate.ts:183-185 admit nonempty, no provider -> secret_unavailable | admit providerPresent 0 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | nonempty no provider 101 |
| secret-gate.ts:187-201 admit has() true -> null | admit presenceStatus 0 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | present 100 |
| secret-gate.ts:200 present !== true -> secret_unavailable | admit presenceStatus 1/2/3 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | absent/faulted/error 101 |
| secret-gate.ts:193-196 has() throw -> secret_unavailable | admit presenceStatus 4 | PRESERVED | TOTAL_EFFECT_OUTCOME | has-threw 101 |
| secret-gate.ts:197-200 unlisted presence (no TS tag) | admit presenceStatus 9 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | unlisted 111 |
| secret-gate.ts:148-154 epoch optional on legacy provider | admit epochPresentToken 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | empty+provider no epoch 103 |
| secret-gate.ts:212 undeclared getSecret -> undefined | deliverSecret declaredToken 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | undeclared 112 |
| secret-gate.ts:213 no provider getSecret throw | deliverSecret providerPresent 0 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | provider absent 119 |
| secret-gate.ts:338 callback not called throw | deliverSecret callbackOutcome 0 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 113 |
| secret-gate.ts:265-267 callback twice throw | deliverSecret callbackOutcome 2 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 114 |
| secret-gate.ts:385-392 callback returns value throw | deliverSecret callbackOutcome 3 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 115 |
| secret-gate.ts:331-336 / 385-392 thenable throw | deliverSecret callbackOutcome 4 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 116 |
| secret-gate.ts:412-421 wipe failed after delivery throw SecretGateWipeFailed | deliverSecret wipeResult 1/2 | INTENDED_DIVERGENCE | LINEAR_SECRET | 117; packed +100 wipe construct; no erase claim |
| secret-gate.ts:301-307 epoch moved consume stale | deliverSecret epochMovedToken 1 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | 118 |
| secret-gate.ts:399-423 LINEAR_SECRET wipe on every exit | finish(code, true) | NEEDS_LANGUAGE | LINEAR_SECRET | WebAssembly zeroing best effort; free is not wipe |
| MB-06 cleanup evidence UNKNOWN | deliverSecret cleanupEvidence 4 -> releaseGuard | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 106 DELIVERY_UNKNOWN; Q43 not imported |
| secret-gate.ts:426 acknowledge | gateAcknowledge -> ackStep | PRESERVED | UNFORGEABLE_CAPABILITY | released+audit 101 |
| secret-gate.ts:430 status | gateStatus -> classifyRecovery | PRESERVED | TOTAL_EFFECT_OUTCOME | ACKED 100; UNACKED 101; UNKNOWN 103; NOT_FOUND 104 |
| secret-gate.ts:438 noteUndelivered | gateNoteUndelivered -> revokeDelivery | PRESERVED | TOTAL_EFFECT_OUTCOME | ack 106; unused 108 |
| secret-gate.ts:434 noteUnknown -> markUnknown | (missing rcp flow) | UNKNOWN | TOTAL_EFFECT_OUTCOME | CN-2 missing type; no parallel flow |
| secret-gate.ts:442 auditEvents / 446 issueLeaseId | host maps | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | Q44 not on this base |
| secret-gate.ts:161 epoch through readForeignSafeInteger | readForeignSafeInteger CALL | PRESERVED | NO_NULL_NAN | classTag 3 -> 110; 11 -> 111 |
| secret-gate.ts:148 epoch < 0 / NaN | epochClass 3 | PRESERVED | NO_NULL_NAN | C190-N3 NaN epoch impossible |
| bytesEqual / epoch compare | epochMovedToken host-mapped | NEEDS_LANGUAGE | LINEAR_SECRET | CONSTANT_TIME_COMPARE native intrinsic missing; equality kept |
| secret-gate.ts:119-132 captured intrinsics | host adapter | CARRIED_UNKNOWN | SEALED_INTRINSICS | MB-13/MB-17; callback closed sum through boundary |
| COMMITTED after begin | consumeStep / releaseGuard | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | W1 policy; never 100 after begin via cleanup 4 -> 106 |
| no clock | no time construct | PRESERVED | MONOTONIC_TYPED_TIME | MONOTONIC_TYPED_TIME CARRIED_UNKNOWN / NEEDS_LANGUAGE |
| import CALL link | classTag gate kept | NEEDS_LANGUAGE | NO_NULL_NAN | B5 check 0 / build FUNGI-NAME-001 / run WAT undefined callee |
| SecretGateWipeFailed class | wipeResult 1 packed 117 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | throw-as-outcome replaced |
| createSecretGate options.requireRevocationEpoch default false | epoch always required when provider present | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | legacy refuses 103 |

Counts: PRESERVED 10, INTENDED_DIVERGENCE 16, UNKNOWN 1, NEEDS_LANGUAGE 3, CARRIED_UNKNOWN 2 in the table (MONOTONIC/HOST also carried in receipts). Unlisted verdict refuses.

## Notes

N1. Epoch is required when a provider is present, including empty-require + provider. Empty require with no provider still admits (TS no-op preserved).

N2. Callback outcomes are a closed Int sum supplied through the boundary. "returns a value" and "returns a thenable" are typed violation tags, not host introspection.

N3. CONSTANT_TIME_COMPARE is NEEDS_LANGUAGE. Epoch-moved is a host-mapped token. crypto.timingSafeEqual is not a mechanism.

N4. Astra W1/W3/W5: COMMITTED unreachable after begin (policy). UNKNOWN is never success, zero-effect proof, or retry. No automatic retry after DELIVERY_UNKNOWN. Status-only recovery never opens the provider.

N5. Do not rebase onto fc7db4db. c-boundary blob on this base is cfec32c9. Do not import Q43.

N6. WebAssembly zeroing is best effort; no erase claim (MB-11/MB-14). noteUnknown has no rcp flow; carried UNKNOWN rather than a parallel type.

N7. Landed source has no constant-guarded admit branch (queue 33 F3). Mutants are unique sequential if-return edits applied in-memory (queue 43 F4).
