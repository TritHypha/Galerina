# Q31 parity: foreign-boundary.ts @ dc0f9c8c vs c-boundary.fungi + body-reader.fungi

Input: `packages-ts/galerina-framework-app-kernel/src/foreign-boundary.ts` sha256 `11bb502b0a0080a9953cdc4b548666919662c4df9eabcfb898a43348db2286b5` at `dc0f9c8c4f1365f0228cda213b2ecd001400463e`.
Workbench capsule status REFUSE (`evidence:DECODER_UNAVAILABLE`); C2+A1 conversion continued with CARRIED_UNKNOWN. PROPOSED never permission.
Skills: translating-typescript-to-fungi core/binding/workflow 1,4-7,25; writing-fungi core/binding/workflow 1-5,8,14,33. Sequential if-return (secret-gate.fungi style) after nested if/else failed WAT emit.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| foreign-boundary.ts:11 readForeignSafeInteger | c-boundary.fungi readForeignSafeInteger | PRESERVED | NO_NULL_NAN | helper admits SafeInteger; helper refuses Null NaN Infinity NegZero NonInteger OutOfSafeRange NegativeLength WrongType Absent Unlisted |
| foreign-boundary.ts:24 readDeclaredContentLength | c-boundary.fungi readForeignLength | PRESERVED | NO_NULL_NAN | helper length refuses negative integer |
| foreign-boundary.ts:11 NaN/Infinity/-0/null | c-boundary.fungi classTag 1-10 + 11 | INTENDED_DIVERGENCE | NO_NULL_NAN | helper refuses; mutant accept NaN |
| foreign-boundary.ts:362 readBodyCapped cap 16384 | body-reader.fungi readChunks cap | PRESERVED | BOUNDED_INPUT | MUST-REFUSE over cap by one byte; mutant drop cap |
| foreign-boundary.ts:362 stream null -> ok empty | body-reader.fungi streamPresent false -> 8 | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE absent stream (P20-N3) |
| foreign-boundary.ts chunks may alias | body-reader.fungi duplicate id/range/overlap refuse | INTENDED_DIVERGENCE | NO_OVERLAPPING_CHUNKS | MUST-REFUSE duplicate reference / overlapping views / duplicate range; MUST-ADMIT adjacent; G4 zero-length refuse |
| foreign-boundary.ts zero-length dropped | body-reader.fungi ZeroLength 4 | INTENDED_DIVERGENCE | NO_OVERLAPPING_CHUNKS | MUST-REFUSE lone zero-length; zero-length at covered offset; mutant admit zero-length |
| foreign-boundary.ts:65-261 intrinsic capture / live getters | body-reader.fungi no intrinsic probe | INTENDED_DIVERGENCE | SEALED_INTRINSICS | P20-F2/P20-R1: missing/unlisted refuses before first read (host classTag); no prototype lookup in .fungi |
| foreign-boundary.ts finally wipe | body-reader.fungi finish(..., true) every exit | PRESERVED | LINEAR_SECRET | packed +100 wipe evidence; mutant skip wipe |
| foreign-boundary.ts timeout 5000 | body-reader.fungi deadlineExpired | PRESERVED | DEADLINE_COVERS_ALL | MUST-REFUSE deadline expiry |
| foreign-boundary.ts throw mid-read | body-reader.fungi foreignThrow | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE foreign throw mid-read wipes (typed code 10, not throw) |
| foreign-boundary.ts declared length mismatch | body-reader.fungi 6/7 | PRESERVED | BOUNDED_INPUT | MUST-REFUSE declared longer/shorter |
| release-commit-point.ts:79 second helper | none in MEMDIR | INTENDED_DIVERGENCE | NO_NULL_NAN | CN-1: exactly one readForeignSafeInteger in packages/fungi/memory |
| Deno adapter P20-N5 | none | UNKNOWN | HOST_ADAPTER_PRESENCE | CARRIED_UNKNOWN; UNKNOWN_IN_TS |
| monotonic clock | deadlineExpired Bool from host | NEEDS_LANGUAGE | MONOTONIC_TYPED_TIME | host supplies Bool; .fungi has no typed monotonic time |
| total effect COMMITTED/REFUSED/DELIVERY_UNKNOWN | packed Int code | NEEDS_LANGUAGE | TOTAL_EFFECT_OUTCOME | CARRIED_UNKNOWN |
| live TypedArray/SAB views | identity Int + offset + length | NEEDS_LANGUAGE | LINEAR_SECRET | host-owned chunks as scalars; physical ByteArray ABI not in this unit |

Counts: PRESERVED 6, INTENDED_DIVERGENCE 7, UNKNOWN 1, NEEDS_LANGUAGE 3. Unlisted verdict refuses.
