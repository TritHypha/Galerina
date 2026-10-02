# Patched-high verification — 2026-09-23

**Overall:** INCOMPLETE_NON_AUTHORITATIVE. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`. Not clean-HEAD. Not production
admission. Independent review pending at authoring time.

Imported statuses were PATCHED_AUDIT_PENDING. This pass re-verified current
source and existing (plus one new) hostile tests. Commands:
`node --test --test-timeout=120000` of
`scripts/tests/rebuild-fusable-packages.test.mjs`,
`packages-ts/galerina-framework-app-kernel/tests/audit-async.test.mjs`,
`packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs`,
`packages-ts/galerina-framework-api-server/tests/api-server.test.mjs`
→ **47/47 pass**, 0 fail, including the new 404-capacity hostile.

| ID | Prior | Current digest | Invariant | Reproducer / control | Repair | Tests | Remaining |
|---|---|---|---|---|---|---|---|
| `csf_7c334da06ea43bf62f7b58f9` | PATCHED_AUDIT_PENDING | `rebuild-fusable-packages.mjs` `27f08b7edfc1ecd666b4c3c43fed79202e97c49c092ebd3572288be73a4fa3c0` | Rebuild spawn is argv + `shell:false` | Dir `pkg&echo MARKER&rem` must not print MARKER | Already on HEAD | rebuild-fusable-packages **2/2** | `name` still interpolates into dist filename; not this shell claim |
| `csf_2a86648bf19537088fa9b394` | PATCHED_AUDIT_PENDING | `kernel.ts` `189a739e13100d0b08a097e1858551414224ecb6e91e2b66a0a2f2388aa424f3` | Unknown-path 404 does not reserve/emit mandatory audit | 8× `/nope` then `/health` with `runtimeReport` still 200 | reserve/commit only for mandatory routes; 404 has `policy===undefined` | audit-async including 404 hostile | Best-effort `emit` on matched non-mandatory routes still uses shared capacity |
| `csf_176f3d7332761399dac3c39d` | PATCHED_AUDIT_PENDING | `fuse-loader.ts` `fc23ef01bc192c7ac9d74ce33b11b55c6d9469a2f03983df7738607d5bdc87d4` | keyId cannot escape `governanceDir` | `x/../../plugin/attacker` + attacker `.pub.pem` refuses | `SIGNING_KEY_ID` + `admittedGovernanceKeyPath` | fuse-loader path-shaped keyId | Hybrid unverifiable still degrades to unsigned (revoked keyId separately refused) |
| `csf_abb8e005fb7ba36366169ba5` | PATCHED_AUDIT_PENDING | `api-server/src/index.ts` `009c7b0f0ee4be815d8e0a3e3e568f57afb6e1878f418ca8e90dcab51e9fc784` | Malformed targets are 400 inside the request catch | GET `//[` → 400 `bad_request`; no unhandledRejection | `parseUrl` refuses `//` and URL throws; `onRequest` `.catch` | api-server malformed-target | Node may reject some targets before the adapter |

## New non-scan issue

`galerina.mjs` `verify` printed `manifest verified` before signature/revocation.
Repair: print that banner after the signature block. Test
`tests/verify-success-banner.test.mjs` **1/1**. Residual: unsigned-dev still
reports verified after the unsigned notice; production unsigned still exits 1.
