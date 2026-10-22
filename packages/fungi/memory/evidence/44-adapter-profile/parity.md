# Q44 parity: adapter-profile.fungi (ts_oracle: NONE)

Rule unit. No TypeScript oracle. translating-typescript-to-fungi has no source file to convert. RD rules encoded by path + sha only.

Workbench capsule status REFUSE (`evidence:DECODER_UNAVAILABLE`). HOST/FUNGI views typed UNKNOWN. C2 applied under the Q31-05 reserved-decoder ruling (same decoder gap as Q31/Q32; not a Q44 file defect). PROPOSED never permission. Skills: writing-fungi core/binding/workflow 1-5,8; sequential if-return (secret-gate.fungi style).

RD-0778 cited by path + sha256 only (never its body): `private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md` sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`. The shas 07f9803e, 49311281 and 9438d9b5 are stale.

Q45 host-adapter audit cited by path + head only: `packages/fungi/memory/evidence/45-host-adapter-audit/audit.md` at `96a69400964cb3ae4a7dfb06f2d124af46302d54`.

c-boundary.fungi blob `a92a32713a19eb48c57fea62d49e6ac7fdf9eabe` sha256 `7715db227015fcba0f485de8becb6684de40b42ac824e6cbc69137eaa57856bf` imported and called; 0..10 table not copied.

## Packed codes

| code | name | table |
|---|---|---|
| 0 | IN_PROCESS_BOUND | Q07 (COMMITTED reachable) |
| 1 | OUT_OF_PROCESS_UNBOUND | DELIVERY_UNKNOWN-only (COMMITTED unreachable) |
| 2 | ADAPTER_CLASS_NOT_ADMITTED | none |
| 3 | UNKNOWN_ADAPTER_KIND | none (distinct from 2) |
| 4 | RAW_VALUE_REFUSED | none (classTag 1..10) |
| 11 | Unlisted | none |

## Kind admit-list (MB-11 / MB-12)

| kind | name | AUDITED_NO_BUFFERING | UNAUDITED / AUDITED_BUFFERS |
|---|---|---|---|
| 0 | host-import non-shared WebAssembly.Memory | 0 IN_PROCESS / Q07 | 1 OUT_OF_PROCESS / DU-only |
| 1 | SharedArrayBuffer | 2 NOT_ADMITTED | 2 |
| 2 | shared WebAssembly.Memory | 2 | 2 |
| 3 | MessagePort copy | 2 | 2 |
| 4 | MessagePort transfer | 2 | 2 |
| 5 | mmap | 2 | 2 |
| 6 | file-descriptor passing | 2 | 2 |
| 7 | native / foreign hand-off | 1 OUT_OF_PROCESS | 1 |
| else | unknown kind | 3 | 3 |

## Real adapter rows (MB-07)

Until a later audit produces AUDITED_NO_BUFFERING, no real adapter is IN_PROCESS_BOUND. Queue 45 ACK at `96a69400` found no WASI fd_write path; `__print` / `console.log` and HTTP `res.end` buffer before begin.

| adapter | preBeginAudit | class | cite |
|---|---|---|---|
| `__print` / `console.log` (galerina run outputSink) | AUDITED_BUFFERS | OUT_OF_PROCESS_UNBOUND | evidence/45-host-adapter-audit/audit.md Q1 at 96a69400 |
| POST `/auth/verify` HTTP `res.end` | AUDITED_BUFFERS | OUT_OF_PROCESS_UNBOUND | evidence/45-host-adapter-audit/audit.md Q1 at 96a69400 |
| WASI `fd_write` | UNAUDITED | path absent; unaudited later WASI adapter would be OUT_OF_PROCESS_UNBOUND | audit.md Q1 |
| Node stdout / libuv after console.log | UNAUDITED | OUT_OF_PROCESS_UNBOUND | audit.md Q1 syscall UNKNOWN |
| `audit.write` / `audit.log` grant | UNAUDITED | OUT_OF_PROCESS_UNBOUND | audit.md Q1 |
| SharedArrayBuffer / shared WebAssembly.Memory / MessagePort / mmap / fd passing | n/a | ADAPTER_CLASS_NOT_ADMITTED | this unit |
| native / foreign hand-off | n/a | OUT_OF_PROCESS_UNBOUND | MB-12 |

Every other real adapter: UNAUDITED.

## Verdicts

| claim | fungi_ref | verdict | obligation | probe |
|---|---|---|---|---|
| closed sum IN_PROCESS / OUT_OF_PROCESS | classifyAdapter + tableForClass | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | kind 0 audit 0 -> 0; kind 0 audit 1/2 -> 1; classVal 2 -> 11 |
| unlisted class never defaults in-process | tableForClass unlistedClassDefault | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | mutant default-to-in-process red |
| SAB / shared memory / MessagePort / mmap / fd | classifyAdapter kind 1-6 | PRESERVED | TOTAL_EFFECT_OUTCOME | each returns 2; mutant admit SAB red; mutant merge 2 with 11 red |
| unknown kind distinct from NOT_ADMITTED | unknownKindCode 3 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | kind 8 and 99 -> 3 |
| negative and out-of-list kind | fall-through to unknownKindCode 3 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | kind -1, -2147483648, 8 and 2147483647 with audit 0 -> 3; mutant `if kind == 0` widened to `if kind <= 0` returns 0 |
| negative audit | audit 0, 1, 2 only; else 11 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | audit -1 and -2147483648 with kind 0 and kind 7 -> 11; mutant `if audit != 0` widened to `if audit > 0` returns 1 |
| native hand-off OUT_OF_PROCESS | nativeSelectsDu | PRESERVED | TOTAL_EFFECT_OUTCOME | kind 7 audit 0 -> 1; mutant native as in-process red |
| UNAUDITED / AUDITED_BUFFERS never IN_PROCESS | unauditedSelectsDu | PRESERVED | TOTAL_EFFECT_OUTCOME | kind 0 audit 1/2 -> 1; mutant UNAUDITED as in-process red |
| DU-only table is not COMMITTED-capable | duOnlyTable 1 | PRESERVED | TOTAL_EFFECT_OUTCOME | tableForClass(0,1) -> 1; mutant duOnlyTable 0 red |
| raw value refuses 4 | classTag 1..10 | PRESERVED | NO_NULL_NAN | kind class 3 -> 4; unlisted tag 12 -> 11 |
| import+call c-boundary | import "./c-boundary.fungi" | NEEDS_LANGUAGE | NO_NULL_NAN | check 0 / build FUNGI-NAME-001 / run WAT undefined callee |
| ECMAScript / WebAssembly Q09 Q6-Q8 | admit-list only | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | can only widen v1 later |
| HOST_ADAPTER_PRESENCE of live adapters | parity rows | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | Q45 buffering YES for print and HTTP; syscall UNKNOWN |
| MB-13 invoke ToInt32 wrap | galerina.mjs argument boundary | CARRIED_UNKNOWN | NO_NULL_NAN | `galerina run --invoke` wraps before the unit. kind 4294967296 can arrive as 0 and then take the kind 0 arm. audit 4294967298 can arrive as 2. The unit cannot see the original value. Observation only, not a MUST admit. |
| MB-11 no erase claim | note | CARRIED_UNKNOWN | TOTAL_EFFECT_OUTCOME | Engine copies are permitted. A non-shared grow detaches the old buffer without erasing it. |
| MB-12 passed descriptors | kind 6 returns 2 | CARRIED_UNKNOWN | TOTAL_EFFECT_OUTCOME | Passed or inherited descriptors cannot be revoked. File-descriptor passing is refused in v1. The memfd seal set F_SEAL_WRITE + F_SEAL_SHRINK + F_SEAL_GROW + F_SEAL_SEAL is grok.com direction and is unverified. |
| W2 write completion | wording | CARRIED_UNKNOWN | TOTAL_EFFECT_OUTCOME | Ordinary write or send completion does not establish durable recipient effect. fsync is a storage-synchronization contract stronger than plain write acceptance. Neither local persistence nor a successful close establishes recipient effect. None of this moves release from B or changes post-B DELIVERY_UNKNOWN. |
| W4 profile from topology | wording | CARRIED_UNKNOWN | TOTAL_EFFECT_OUTCOME | The profile comes from demonstrated exposure and custody topology, not from API names or same-trust-domain membership. B precedes the earliest operation that can make the payload usable, including a capability handoff or a store into already shared memory. Missing or unclear topology refuses before B. A missing profile never selects the in-process success table. |

Counts: PRESERVED 10, INTENDED_DIVERGENCE 0, UNKNOWN 0, NEEDS_LANGUAGE 1, CARRIED_UNKNOWN 7. Unlisted verdict refuses.
