# Q38 parity: signet-grant-seal.fungi

Frozen TS `scripts/lib/assurance-fabric/authenticated-host.mjs` @ `dc0f9c8c` sha256 `2cfa23f25bc50c09bb914ba4bb9dc4bac0efbfb2da3800da0d0cd9117be72cd7` executed for real (`git show` into os.tmpdir() plus sibling modules `result-model.mjs`, `private-host.mjs`, `unsafe-observation.mjs`, `strict-json.mjs`). Frozen `signet-verifier-spawn.mjs` sha256 `4a685348a1d258fdd013d919ca5d213cf30e78a8d98b0d8b3eab03eaa19ad53f` is the verifier-port oracle. A hand-copy of host logic is not the differential.

Workbench capsule REFUSE `REFUSED` / `evidence:DECODER_UNAVAILABLE`. HOST/FUNGI views typed UNKNOWN. C2 applied. PROPOSED never permission.
CN-1: import the frozen helper and CALL it. CN-2: import release-commit-point unchanged (blob `b38e774f8e2150a74fed5cc19fb092dcf640cdb3`) and CALL releaseGuard / consumeStep / finish. check 0; build FUNGI-NAME-001; run WAT callee neither defined nor imported. Tests flatten helper body plus release-commit-point plus this unit for invoke.

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`.
c-boundary.fungi git blob `cfec32c93d0cf611010042cb6843d5af5ba6a78a` (q32 ACK base; differs from q31 `a92a3271`; not reconciled).
release-commit-point.fungi git blob `b38e774f8e2150a74fed5cc19fb092dcf640cdb3`.

writing-fungi sections applied: `@version 1`; `pure flow`; sequential if-return; no `else if`; no `null`/`NaN`; no `throw`/`try`/`catch`; no clock source; foreign values through one helper plus unit domain/range gates; fail-closed unlisted arm; wipe construct `finish(code, true)` with no erase claim.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| authenticated-host.mjs:230 empty subjects throw | issueGrant subjectCount 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | empty 101; TS throws, fungi typed result |
| authenticated-host.mjs:237 duplicate subjects throw | issueGrant duplicateToken 1 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | duplicate 102 |
| authenticated-host.mjs:109-112 bad digest throw | issueGrant digestOk 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | digest 103 |
| authenticated-host.mjs:243 missing profileId throw | issueGrant profilePresent 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | profile 104 |
| authenticated-host.mjs:248-254 epoch < 1 throw | issueGrant epoch 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | epoch 105 |
| authenticated-host.mjs:228 Date.now default | issueGrant clockPresent 0 | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | missing clock 106; no ambient clock |
| authenticated-host.mjs:282 randomBytes | issueGrant randomPresent 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | missing random 107 |
| authenticated-host.mjs:255 generateKeyPairSync | issueGrant keyPresent 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | missing key 108 |
| authenticated-host.mjs:277 TTL 0 accepted | issueGrant ttl 0 | INTENDED_DIVERGENCE | BOUNDED_INPUT | ttl 0 109; F1 executed |
| authenticated-host.mjs:277 negative TTL accepted | issueGrant ttl -3 | INTENDED_DIVERGENCE | BOUNDED_INPUT | ttl neg 109 |
| authenticated-host.mjs:277 unbounded TTL | issueGrant ttl 86400001 | INTENDED_DIVERGENCE | BOUNDED_INPUT | ttl over 109 |
| authenticated-host.mjs:287 nowMs + ttl overflow | issueGrant clock max ttl 1 | INTENDED_DIVERGENCE | BOUNDED_INPUT | overflow 112 |
| authenticated-host.mjs:18 ed25519 only | issueGrant suiteId 1 / pqAvailable 0 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | classical-only 114 never hybrid issue |
| authenticated-host.mjs:170-179 getter live read | authenticateGrant shapeToken 1 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | getter 123 |
| authenticated-host.mjs:193 tamper throw | authenticateGrant tamperToken 1 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | tamper 115 |
| authenticated-host.mjs:202 unpinned issuer throw | authenticateGrant issuerPinned 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | unpinned 116 |
| authenticated-host.mjs:327 wrong action throw | authenticateGrant actionMatch 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | wrong action 117 |
| authenticated-host.mjs:328 previous epoch throw | authenticateGrant grantEpoch != currentEpoch | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | prev epoch 118; in-unit compare; token disagree 118 |
| authenticated-host.mjs:329 previous profile throw | authenticateGrant grantProfile != currentProfile | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | prev profile 119; in-unit compare; token disagree 119 |
| authenticated-host.mjs:332 undeclared subject throw | authenticateGrant declaredToken 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | undeclared 121 |
| authenticated-host.mjs:214 expired throw | applyGrant applyClock past expiry | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | expired 122 |
| authenticated-host.mjs:334 consume then sink | applyPreSink then applyPostSink listed cleanup | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 106 DELIVERY_UNKNOWN; MB-06; never packed 100 |
| authenticated-host.mjs:198 replay throw | applyGrant consumedToken 1 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | replay 126 |
| authenticated-host.mjs:337 ignore sink return | applyGrant sinkOutcome 1 Failed | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | Failed 127 never CONSUMED |
| authenticated-host.mjs:337 ignore sink return | applyGrant sinkOutcome 2 Refused | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | Refused 128 never CONSUMED |
| authenticated-host.mjs:338-339 sink throw DELIVERY_UNKNOWN | applyGrant sinkOutcome 3/4 | PRESERVED | TOTAL_EFFECT_OUTCOME | 106 via releaseGuard cleanup 4 |
| authenticated-host.mjs:228 clock step | applyGrant applyClock < issueClock | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | regression 130 |
| authenticated-host.mjs:408-413 restartHost | applyGrant restartToken 1 | PRESERVED | TOTAL_EFFECT_OUTCOME | restart UNKNOWN 131 |
| authenticated-host.mjs:403 epoch exhaustion RangeError | applyGrant epochExhausted 1 / restartHost epoch max | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | 132 typed refusal |
| authenticated-host.mjs:373 kind absent string UNKNOWN | classifySeal sealKind 3 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | forged 102 Distrusted; typed Absent 101 |
| authenticated-host.mjs:383-385 prev epoch DISTRUSTED | classifySeal sealKind 4 both paths | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | 102 identity and copy |
| authenticated-host.mjs:386 DELIVERY_UNKNOWN | classifySeal sealKind 2 | PRESERVED | TOTAL_EFFECT_OUTCOME | 101 Unknown |
| authenticated-host.mjs:387 CONSUMED ASSURED | classifySeal sealKind 1 hybrid | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | 100 Assured |
| authenticated-host.mjs:388 default DISTRUSTED | classifySeal sealKind 9 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | 111 refusing default; mutant Assured RED |
| authenticated-host.mjs:18 classical-only Assured | classifySeal pqAvailable 0 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | 101 Unknown never Assured |
| signet-verifier-spawn.mjs:331 serialize before validate | validateVerifyRequest validatedBeforeSerialize 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | 143 |
| signet-verifier-spawn.mjs:336 body over 16384 | validateVerifyRequest bodyBytes 16385 | PRESERVED | BOUNDED_INPUT | 144 |
| signet-verifier-spawn.mjs:173 unbounded readFileSync | validateVerifyRequest pinnedSize over 64MiB | INTENDED_DIVERGENCE | BOUNDED_INPUT | 146 |
| signet-verifier-spawn.mjs:203 verifier throw | validateVerifyRequest verifierRead 0 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 147 UNKNOWN |
| signet-verifier-spawn.mjs:219 unlisted status parse stdout | validateVerifyRequest childExit 1/5/137 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | 148 refuse; mutant admit RED |
| signet-verifier-spawn.mjs:219 exit 3 shared space | validateVerifyRequest childExit 3 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 149 UNKNOWN |
| signet-verifier-spawn.mjs:247 trit +1 nonzero | validateVerifyRequest tritToken 1 childExit 1 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | 151 |
| signet-verifier-spawn.mjs:241 authorizing true | validateVerifyRequest authorizingToken 1 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | 153 |
| signet-verifier-spawn.mjs:61 GATE1_TEST_HOOK env | validateVerifyRequest testHook 1 | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | 154 production refuses |
| signet-verifier-spawn.mjs:313-318 rmSync force | validateVerifyRequest listed cleanup 0/1/2/3/4 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | 106 MB-06 never packed 100; mutant swallow RED |
| signet-verifier-spawn.mjs trit +1 exit 0 | validateVerifyRequest tritToken 1 childExit 0 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | F4; trit -1/0 with exit 0 packed 159; only trit 1 admits then 106 |
| applyGrant one flow | applyPreSink then applyPostSink | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | F3; pre refusals with no sink; non-consume prePacked 111 |
| releaseGuard(1,1,k,1,1,1) | boundary tokens through helper into releaseGuard/consumeStep | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | F1; revoke first 102; present 0 -> 105 |
| childKind range-checked unused | validateVerifyRequest childKind listed-set | INTENDED_DIVERGENCE | BOUNDED_INPUT | N1; exit 3 stays UNKNOWN 149 |
| authenticated-host.mjs:259 consumed Set in-memory | restartHost | UNKNOWN | UNFORGEABLE_CAPABILITY | CONSUME_RECORD_DURABILITY not persisted |
| authenticated-host.mjs:137 ed25519 verify | suiteId 0 pqAvailable | NEEDS_LANGUAGE | SEALED_INTRINSICS | PQ_SIGNATURE_UNAVAILABLE; VERIFIER_HYBRID_SUPPORT |
| signet-verifier-spawn.mjs:280-295 write then spawn path | SEALED_EXEC_TOCTOU | UNKNOWN | SEALED_INTRINSICS | fd-based exec not in this unit |
| MB-16 clock source | clock through c-boundary | NEEDS_LANGUAGE | MONOTONIC_TYPED_TIME | no clock in this file |
| MB-15 constant-time compare | digest/signature equality | NEEDS_LANGUAGE | LINEAR_SECRET | CONSTANT_TIME_COMPARE intrinsic missing |
| MB-06 cleanup evidence | releaseGuard cleanup 4 | CARRIED_UNKNOWN | TOTAL_EFFECT_OUTCOME | Q43 not imported; 106 |
| HOST_ADAPTER_PRESENCE | host maps names to Int | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | Q44 not on this base |
| Addendum D OPEN items | ordering / FFI / cleanup-binding | UNKNOWN | TOTAL_EFFECT_OUTCOME | carried typed UNKNOWN |
| authenticated-host.test.mjs 17 fail @ dc0f9c8c | vectors needing cargo/memfd | UNKNOWN | SEALED_INTRINSICS | environment INCONCLUSIVE; never PRESERVED |

Summary counts: PRESERVED 7, INTENDED_DIVERGENCE 42, UNKNOWN 5, NEEDS_LANGUAGE 3, CARRIED_UNKNOWN 2.

N1. childKind is range-checked and unused; exit 3 stays UNKNOWN 149.
N2. Negative epochs with classTag 0 ride the c-boundary range gap (carried, no edit).
N3. Carried UNKNOWNs accepted as stated. CONSTANT_TIME_COMPARE stays NEEDS_LANGUAGE; epoch/profile/clock-generation equality is in-unit and not claimed constant time.
