# Q33 parity: serve-secret-gate.ts @ dc0f9c8c vs serve-gate.fungi

Input: `packages-ts/galerina-core-compiler/src/serve-secret-gate.ts` sha256 `5be17ebf6387d6f9396e571c3cbc47dd3b61a6989a4cf1f3de9b06408bae0df2` at `dc0f9c8c4f1365f0228cda213b2ecd001400463e`.
Workbench capsule status REFUSE (`evidence:DECODER_UNAVAILABLE`); HOST/FUNGI views typed UNKNOWN. C2 applied under Q31-05 ruling / Q33 A1. PROPOSED never permission.
Skills: translating-typescript-to-fungi core/binding/workflow 1,3-8,11; writing-fungi core/binding/workflow 1-9,16. Sequential if-return (secret-gate.fungi style) after nested if/else failed WAT emit. Spell it WebAssembly.

Host maps method/path/effect/reach/layer onto Int tags once (P20-N2). The unit does not parse path bytes or walk an AST.
The string-to-tag normaliser (ASCII case, trailing slash, percent, dot segments, double slash, byte bound, invalid UTF-8, NUL) is host-side HOST_ADAPTER_PRESENCE CARRIED_UNKNOWN. Variant MUST-REFUSE probes prove the closed Int table, not the normaliser.

| ts_ref (path:line @dc0f9c8c) | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| serve-secret-gate.ts:16 STANDALONE_AUTH_VERIFY_REFUSAL | classifyServeRoute pathClass 0 -> 1 | PRESERVED | NO_AMBIENT_AUTHORITY | MUST-REFUSE POST /auth/verify on serve layer before exposure |
| serve-secret-gate.ts:19 ServeGateVerdict admit/refuse | finish packed 0 vs 1..12 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-ADMIT secret-free hello; unlisted path 112; unlisted layer 108 |
| serve-secret-gate.ts:64 normalizeDeclaredRoutePath | pathProtection | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE unnormalisable path as PROTECTED; mutant null-path-as-unprotected |
| serve-secret-gate.ts:80 trailing-slash strip | pathClass 1 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE trailing slash; mutant drop trailing-slash normalisation |
| serve-secret-gate.ts:75 decodeURIComponent.toLowerCase | pathClass 2 and 3 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE case percent |
| serve-secret-gate.ts:84 compileDeclaredPathPattern null | pathProtection unlisted 12 | INTENDED_DIVERGENCE | NO_NULL_NAN | MUST-REFUSE unlisted path class as PROTECTED |
| serve-secret-gate.ts:107 isProtectedAuthVerifyRoute | pathProtection 0-5 -> 1 | PRESERVED | NO_AMBIENT_AUTHORITY | MUST-REFUSE GET and PUT /auth/verify as protected identity |
| serve-secret-gate.ts:111 route.pathPattern.test("/auth/verify") | host maps a declared pattern that can match /auth/verify to a protected tag; unlisted -> 112 | PRESERVED | NO_AMBIENT_AUTHORITY | POST /auth/{x} packed 101; unlisted path 112 |
| serve-secret-gate.ts:112 normalized === null return false | pathClass 6 -> 2 | INTENDED_DIVERGENCE | NO_NULL_NAN | C188-N2; POST/GET unnormalisable 102 |
| serve-secret-gate.ts:117 isSecretBearingEffectName | effectSecretClass 1-5 -> 3 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE secret.read vault.read vault.write env and Secrets.get |
| serve-secret-gate.ts:124 isSecretEffectName | effectSecretClass | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | deprecated alias of the sealed list |
| serve-secret-gate.ts:35 SECRET_EFFECT_NAMESPACES | effectSecretClass closed list | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | unlisted integer 99 -> 104 |
| serve-secret-gate.ts:405 classifyEffectName unrecognised | effectClass 10 -> 4 | INTENDED_DIVERGENCE | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unlisted effect name as secret-bearing; mutant unlisted effect non-secret |
| serve-secret-gate.ts:412 DENY_ONLY_EFFECTS | effectClass 8 -> 7 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE deny-only effect |
| serve-secret-gate.ts:427 classifyStandaloneServeRoute | classifyServeRoute | PRESERVED | NO_AMBIENT_AUTHORITY | mixed program is the protected route 101 |
| serve-secret-gate.ts:444 secrets block | effectClass 9 / reachClass 7 -> 5 | PRESERVED | LINEAR_SECRET | MUST-REFUSE secrets block |
| serve-secret-gate.ts:387 unresolved bare call | reachClass 6 -> 6 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | MUST-REFUSE unresolved call |
| serve-secret-gate.ts:194 identifier alias | reachClass 2 -> 3 | PRESERVED | NO_AMBIENT_AUTHORITY | MUST-REFUSE secret through alias |
| serve-secret-gate.ts:203 nested fn | reachClass 1 -> 3 | PRESERVED | NO_AMBIENT_AUTHORITY | nested callee module step shadow record Ok wrap |
| serve-secret-gate.ts:457 standaloneAuthVerifyRefusal | classifyServeRoute pathClass 0 | PRESERVED | NO_AMBIENT_AUTHORITY | serve layer 0 |
| serve-secret-gate.ts:464 standaloneServeSecretRefusal | classifyServeRoute layer 0 | PRESERVED | NO_AMBIENT_AUTHORITY | C188-F1 behavioural probe |
| runtime.ts serve() then startServer | classifyServeRoute layer 1 | PRESERVED | NO_AMBIENT_AUTHORITY | C188-F2 startServer layer; mutant remove startServer layer check |
| serve-secret-gate.ts:485 protectedStandaloneFlowNames | host maps flow identity | UNKNOWN | HOST_ADAPTER_PRESENCE | CARRIED_UNKNOWN; unit classifies route tags not AST names |
| serve-secret-gate.ts AST walk / effect-checker | host reach/effect tags | UNKNOWN | HOST_ADAPTER_PRESENCE | CARRIED_UNKNOWN |
| crypto.timingSafeEqual / JS ToInt32 | none | UNKNOWN | SEALED_INTRINSICS | MB-15: compare compiled to WebAssembly is CT UNKNOWN; c-boundary admits range |
| clock / Date / performance.now | none | NEEDS_LANGUAGE | MONOTONIC_TYPED_TIME | test deadlines harness-only `node --test --test-timeout`; no clock in .fungi |
| finish wipe | finish(..., true) | NEEDS_LANGUAGE | LINEAR_SECRET | packed +100 construct |
| import "./c-boundary.fungi" plus helper CALL | classTag gate via helper | NEEDS_LANGUAGE | NO_NULL_NAN | check admits; build FUNGI-NAME-001; flatten for invoke |
| C188-N3 13 core-compiler tsc errors | none | UNKNOWN | UNKNOWN_IN_TS | CARRIED_UNKNOWN |
| COMMITTED after begin | no packed code | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | gate never yields COMMITTED; W1 W3 W5 |

RD-1413 `rd1413-serve-gate.test.mjs` 36 cases each have a matching probe (same admit/refuse) or an INTENDED_DIVERGENCE row. Residual `rd1413-serve-gate-residual.test.mjs` source-text pin is replaced by layer-0 and layer-1 behavioural probes (C188-F1, C188-F2). Dot-segment and double-slash variants are extra MUST-REFUSE probes required by A1.

Counts: PRESERVED 17, INTENDED_DIVERGENCE 6, UNKNOWN 4, NEEDS_LANGUAGE 3. Unlisted verdict refuses.

## Packed codes

| code | name |
|---|---|
| 0 | Admit |
| 1 | ProtectedAuthVerify |
| 2 | UnnormalisableProtected |
| 3 | SecretBearingEffect |
| 4 | UnlistedEffectSecret |
| 5 | SecretsBlock |
| 6 | UnresolvedSecretUnknown |
| 7 | DenyOnlyEffect |
| 8 | LayerUnlisted |
| 10 | ForeignRawRefused |
| 11 | Unlisted |
| 12 | UnlistedPathProtected |

## Notes

N1. Path/effect/method strings stay on the host adapter. The unit sees closed Int tags. The string-to-tag normaliser (case, trailing slash, percent, dot segments, double slash, byte bound, invalid UTF-8, NUL) is HOST_ADAPTER_PRESENCE CARRIED_UNKNOWN. Variant probes prove the table, not the normaliser.

N2. RD-0778 cited by path + sha256 + kbCommit only, never its body: `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md` sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a` kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`.

N3. CONTRADICTED grok.com rows 7, 10, 12, 14, 16, 19, 30 are not used as fact.
