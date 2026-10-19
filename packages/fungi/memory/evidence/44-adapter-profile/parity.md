# Q44 parity: adapter-profile.fungi (ts_oracle: NONE)

Rule unit. No TypeScript oracle. translating-typescript-to-fungi has no source file to convert. RD rules encoded by path + sha only.

Workbench capsule status REFUSE (`evidence:DECODER_UNAVAILABLE`). HOST/FUNGI views typed UNKNOWN. C2 applied under the Q31-05 reserved-decoder ruling (same decoder gap as Q31/Q32; not a Q44 file defect). PROPOSED never permission. Skills: writing-fungi core/binding/workflow 1-5,8; sequential if-return (secret-gate.fungi style).

RD-0778 cited by path + sha256 only (never its body): `private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md` sha256 `07f9803efbc1dbc1a1956b3b3ec5cb1404e20a6bf8476009c1685eef9158bfa7`.

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
| native hand-off OUT_OF_PROCESS | nativeSelectsDu | PRESERVED | TOTAL_EFFECT_OUTCOME | kind 7 audit 0 -> 1; mutant native as in-process red |
| UNAUDITED / AUDITED_BUFFERS never IN_PROCESS | unauditedSelectsDu | PRESERVED | TOTAL_EFFECT_OUTCOME | kind 0 audit 1/2 -> 1; mutant UNAUDITED as in-process red |
| DU-only table is not COMMITTED-capable | duOnlyTable 1 | PRESERVED | TOTAL_EFFECT_OUTCOME | tableForClass(0,1) -> 1; mutant duOnlyTable 0 red |
| raw value refuses 4 | classTag 1..10 | PRESERVED | NO_NULL_NAN | kind class 3 -> 4; unlisted tag 12 -> 11 |
| import+call c-boundary | import "./c-boundary.fungi" | NEEDS_LANGUAGE | NO_NULL_NAN | check 0 / build FUNGI-NAME-001 / run WAT undefined callee |
| ECMAScript / WebAssembly Q09 Q6-Q8 | admit-list only | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | can only widen v1 later |
| HOST_ADAPTER_PRESENCE of live adapters | parity rows | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | Q45 buffering YES for print and HTTP; syscall UNKNOWN |

Counts: PRESERVED 8, INTENDED_DIVERGENCE 0, UNKNOWN 0, NEEDS_LANGUAGE 1, CARRIED_UNKNOWN 2. Unlisted verdict refuses.
