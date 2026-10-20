# Q37 SECRET_ARENA parity

Frozen TS: `packages-ts/galerina-framework-app-kernel/src/secret-arena-provider.ts` @ dc0f9c8c (sha256 `e4b4315bea125218b0ed52f6013ba4e3e0ae4e0283befc012d4bd51ff956c2c1`, 25760 bytes). Parked queue 24 `93934967ef72e4fc711754775760c18b10f1d240` unused: construction ran at dc0f9c8c; remaining methods need a linux memfd_secret custodian that this unit does not build.

Skills applied: translating-typescript-to-fungi (throws become packed codes; foreign Ints through c-boundary; custodian as typed effects; no else-if/null/NaN); writing-fungi (`@version 1`, sequential if-return, unlisted 11, CALL helper plus rcp `finish`, port decode flows).

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`. Body not copied.

Workbench C2 REFUSE DECODER_UNAVAILABLE recorded; obligations carried as typed UNKNOWN. PROPOSED/REUSE/WRAP/ADAPT/BUILD never permission.

Live TS execute: `createSecretArenaProvider()` throws SecretArenaUnavailable on every host without a built custodian (unsupported platform or missing binary). Fungi `constructArena` platformToken 0 packed 112. Live TS has/use/revocationEpoch/put/dispose each recorded typed UNKNOWN `CUSTODIAN_UNAVAILABLE` (methods unreachable after construction throw; never present/absent/Active/ok). CN-3 fakes not run against Rust.

Secret-gate presence map (A1): packed 100→0 present, 101→1 absent, 106/117/121/141→2 faulted, else 11. Quarantine never maps to absent or present. Probe `mapHasToPresence closed table`.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| create linux-only l.484-486 | constructArena platformToken != 1 finish(12) packed 112 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | TS throw vs 112; MUST-REFUSE platform |
| defaultCustodianPath l.245-258 / bin missing l.487-489 | constructArena pathPresent 0 finish(13) packed 113 | INTENDED_DIVERGENCE | NO_AMBIENT_AUTHORITY | MUST-REFUSE path absent; no default path |
| spawn catch l.493-499 | constructArena spawnToken 1 finish(14) packed 114 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE spawn |
| stdio/pid l.508-515 | constructArena stdioToken 0 finish(15) packed 115 | INTENDED_DIVERGENCE | HOST_ADAPTER_PRESENCE | MUST-REFUSE stdio; fd custody CARRIED_UNKNOWN |
| hello not OK l.629-642 | constructArena helloStatus != 0 finish(16) packed 116 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE hello not ok |
| hello frame length | constructArena helloLen != 1 finish(17) packed 117 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE hello empty/long |
| missing intrinsic l.43-76 | constructArena intrinsicPresent 0 finish(18) packed 118 | INTENDED_DIVERGENCE | SEALED_INTRINSICS | MUST-REFUSE missing intrinsic |
| has OK byte 1 l.650-668 | arenaHas finish(0) packed 100 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | MUST-ADMIT present; TS needs custodian |
| has OK byte 0 / NOT_FOUND | arenaHas finish(1) packed 101 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | MUST-ADMIT absent |
| has unlisted / empty / byte 2 / extra (TS maps non-1 to absent) | arenaHas finish(6) packed 106 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unlisted never 101 |
| has QUARANTINED l.657 | arenaHas finish(6) packed 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE quarantined never absent |
| status empty OK fail-open Active l.806-812 | arenaStatus dataLen != 1 finish(21) packed 121 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE empty never Active |
| status quarantined bit | arenaStatus dataByte 1 finish(21) packed 121 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE quarantined-bit |
| epoch exactly 8 bytes l.732-768 / 17-N3 | arenaEpoch dataLen != 8 finish(40) packed 140 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE 7-byte and 9-byte |
| epoch decreasing 17-N2 | arenaEpoch epochValue < lastEpoch finish(39) packed 139 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE STALE |
| epoch overflow / negative | arenaEpoch finish(40) packed 140 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE overflow; never truncate |
| quarantine fence 17-N1 l.519-526 | arenaEpoch state quarantined fence < last+1 finish(6) else 121 | INTENDED_DIVERGENCE | UNFORGEABLE_CAPABILITY | MUST-REFUSE fence not past last |
| use callback unit-only l.715-716 | listedCallback non-once-void 113/114/115 | INTENDED_DIVERGENCE | LINEAR_SECRET | MUST-REFUSE returns-value twice thenable |
| use abort | arenaUse abortToken 1 finish(16) packed 116 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | MUST-REFUSE abort |
| use NOT_FOUND | arenaUse finish(2) packed 102 | UNKNOWN | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE not-found |
| use wipe fail l.528-540 | listedWipe wipeToken 1 finish(17) packed 117 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE wipe-failed; mutant RED |
| use deadline l.566-627 | applyArenaClock finish(47) packed 147 | INTENDED_DIVERGENCE | DEADLINE_COVERS_ALL | MUST-REFUSE deadline; wipe 117 wins |
| put over MAX_FRAME l.769-786 | arenaPut finish(23) packed 123 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE over cap |
| put zero length l.590-597 | arenaPut finish(24) packed 124 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE zero |
| put high-bit length | arenaPut finish(25) packed 125 | INTENDED_DIVERGENCE | BOUNDED_INPUT | MUST-REFUSE high-bit |
| dispose ignores OP_CLEANUP l.787-801 | arenaDispose cleanup != OK finish(44) packed 144; else 106 never 100 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | MUST-REFUSE never Verified; mutant RED |
| terminate busy-wait l.163-193 | decodeTerminate still-running 2 → 106; no while | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | MUST-REFUSE still-running; no wait loop |
| Memory.prototype.buffer live getter l.82 | no getter in .fungi | INTENDED_DIVERGENCE | SEALED_INTRINSICS | source probe no prototype/buffer |
| subarray / Symbol.species / @@hasInstance | no JS path in .fungi | INTENDED_DIVERGENCE | SEALED_INTRINSICS | source probe; LINEAR_SECRET NEEDS_LANGUAGE |
| performance.now l.40 | caller-supplied clock through c-boundary | INTENDED_DIVERGENCE | MONOTONIC_TYPED_TIME | NEEDS_LANGUAGE clock source; missing/backwards/epoch/overflow/deadline typed |
| constant-time compare | equality only | NEEDS_LANGUAGE | CONSTANT_TIME_COMPARE | intrinsic absent on base |
| custodian language / FFI | foreign port only | UNKNOWN | OBLIGATION_UNMAPPABLE | CUSTODIAN_RUNTIME_LANGUAGE; do not build Rust |
| Addendum D OPEN cleanup bind | dispose never Verified (MB-06) | UNKNOWN | TOTAL_EFFECT_OUTCOME | second dispose recorded; never 100 |
| HOST_ADAPTER_PRESENCE q44 | fd/pid tokens | UNKNOWN | HOST_ADAPTER_PRESENCE | CARRIED_UNKNOWN exclusive custody |
| WebAssembly zeroing | wipe token 0/1/2; no erase claim | UNKNOWN | LINEAR_SECRET | wipe fail/unknown quarantine |

Summary: PRESERVED 0 / INTENDED_DIVERGENCE 28 / UNKNOWN 8 / NEEDS_LANGUAGE 1 (CONSTANT_TIME_COMPARE; MONOTONIC_TYPED_TIME and LINEAR_SECRET also NEEDS_LANGUAGE on the clock/view primitives and are listed on those rows).
