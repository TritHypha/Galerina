# RD-1413 Boundary Check — 2026-10-14

## Scope and identity

- Galerina integration checkout build point: `122ad07dfcfe53fafb8d717972e5f7b673227cf6` (`main`, equal to `origin/main` at check time).
- The checkout is shared and dirty. This report records only the bounded checks below; it does not certify the whole working tree or any branch integration.
- The initial SecretGate/VOK checks did not change source. A later, separately scoped API-server transport delta is recorded below. No GitHub Actions/CI was run or triggered.
- Fresh KB RD query on 2026-10-14 returned `PRIVATE (FRESH)` with RD-1413 decision metadata `AMBIGUOUS`; this is a locator/metadata result, not a substitute for the owner source. The exact local owner source is `private/research/rd/RD-1413-governed-protected-io-and-incoming-access-PRIVATE.md`, SHA-256 `C4875BE644D526527EB416BBF3923A6BA2001E131989C0FB7A68A0633F8CC1E0`. It records `HOLD_REAL_OPERATION / SYNTHETIC_INPUT_HANDOFF_ACCEPTED`, selects `POST /auth/verify` as the first candidate and states that the real operation/provider and owner authority remain open. No private body was sent to a reviewer.

## Checks and results

1. **Actual `SecretGate` stale-presence regression (Windows/Node):**
   `node --test tests/rd1413-revocation-before-delivery.test.mjs`
   in `packages-ts/galerina-framework-app-kernel`.
   Original fixture result: **1 positive control passed; revocation regression failed**. It imports and calls the real `createSecretGate` from the package build. On the final `provider.has()` call, the adversarial provider snapshots `true`, synchronously revokes and wipes its stored bytes, then returns that stale `true`; the gate passes its staged `SECRET` copy to the consumer. Original test SHA-256: `2CCC1D93568921CDF4444A17159B17C48D7018A1AF76431C0164BC3A403E2EA6`.
   The fixture was then strengthened without changing production code: its trigger is now keyed to provider-use completion rather than an exact `has()` call count, `use()` refuses if already revoked, and a separate revoke-after-admission control verifies zero provider opens. Current result: **2 controls pass; the stale-final-presence regression remains failing**. Current test SHA-256: `FCC8898345736835943A200EF30AA07243E36503B5057A79DD0FA7F3639C57E9`.
   Source-direct cross-check: the original fixture was executed against `src/secret-gate.ts` with Node `v24.18.0` type stripping, bypassing the existing `dist`; it reproduced the finding. This was an inline probe, not a retained test artifact, and it did not type-check the source. It predates the fixture refinement.
   Source SHA-256: `DF1E4AC1992E1A0F7DB869742417D85357AFCEB0F0D77E655AB566512A71F128`.
   Provider cross-check: current `galerina-ext-secrets-spore/src/arena.ts` `SealArena.use` copies and wipes a transient, `has` is a plain private-Map lookup, and `remove`/`rotateValue` are synchronous. No source evidence shows that this implementation itself re-enters from `has`; the negative provider is adversarial. The gate still has no generation/lease signal to distinguish a stale provider result.

2. **Existing `SecretGate` suite (Windows/Node):**
   `node --test tests/secret-gate.test.mjs` in `packages-ts/galerina-framework-app-kernel`.
   Result: **38/38 passed against the package's existing `dist`**. It includes revocation during the provider's staging callback, which is detected by the later presence check. That passing case does not cover revocation re-entering from the final presence check after it has already captured `true`; the separate regression above distinguishes the two orderings. A fresh TypeScript build/typecheck could not be run in this checkout because no TypeScript compiler is installed in its local or bundled dependency paths; do not treat this suite result as a fresh compile receipt.

3. **Native VOK local-epoch controls (Windows):**
   `cargo test --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml context_advance_ -- --nocapture`
   Result: **2 passed**.

4. **Native VOK local-epoch controls (WSL):** the same filtered Cargo test was run from WSL against this checkout.
   Result: **2 passed**.
   These tests show that the in-process `AuthorityTable` refuses prior-epoch local leases. They do not connect that table to secret-provider acquisition, the Fungi operation, or result delivery, and do not prove cross-process or host-level revocation ordering.

5. **Synthetic route/fixture controls (Windows/Node):**
   `node --test tests/phase34-verify-password-service.test.mjs tests/runtime-route-request-size.test.mjs`
   in `packages-ts/galerina-core-compiler`.
   Result: **32 passed**. The fixture test asserts that its password service binds `POST /__fixture/auth/verify`, not the selected production `POST /auth/verify`. The route-dispatcher test exercises raw `Bytes` handling and route reservation using a test program. These establish fixture and transport behavior only; they do not establish a production verifier, authenticated workload identity, protected provider, or sink.
   Test SHA-256 values:
   - `phase34-verify-password-service.test.mjs`: `7E57AD5810C4A9B8AEB8513034B38D08A4C14F056F92F35A2A4572D31A738579`
   - `runtime-route-request-size.test.mjs`: `20989EBD958AA9F5EB973A832672059589195A222FB95178DC57A7987F316F33`

## RD-1413 interpretation

The local VOK epoch invalidation and the HTTP route tests are separate component controls. Neither serializes revocation with provider-open nor atomically gates the permitted result at its authenticated sink. The new red test directly exercises the current TypeScript `createSecretGate` and establishes that the generic `has/use` contract accepts stale authorization from an adversarial provider; it does not prove a naturally occurring race in the current synchronous `SealArena` or a reachable production compromise. Existing 38/38 gate tests cover other cases and do not negate this vector. Committed `main` already declares WIT `acquire-password-lease` and `release-verification-result` operations in `packages-ts/galerina-ext-secrets-vault/src/types.ts`, but its stronger O/R/D serialization wording is present only in the **modified, uncommitted** working-tree version of that file. The coupled design document is also modified and remains `DRAFT FOR OWNER REVIEW`; its M3 section says “preferred, not owner-adopted.” Treat both as candidate design, not committed or owner-approved authority. The live app-kernel still exposes the TypeScript `has/use` seam, and the WIT lease/release operations are not implemented or wired into the running app. The next step is to settle the owner-review gate, then implement and race-test O/R/D at the actual Fungi/runtime/provider/sink boundary; do not treat candidate text, local VOK controls, or this report as runtime proof.

**Disposition:** RD-1413 remains **HOLD / NON_AUTHORIZING**. RD-1414 and RD-1415 are not adjudicated or advanced by these checks. Synthetic data only.

## Current route and native-authority cross-check — 2026-10-14

Rechecked the integration checkout at `main` / `122ad07dfcfe53fafb8d717972e5f7b673227cf6`. The clean `examples/auth-service/deno-adapter.ts` still returns 503 for `POST /auth/verify`; `verifyPasswordService.fungi` declares only the synthetic `/__fixture/auth/verify` route and reads the password as `String`. `routeDispatcherService.fungi` maps `/auth/verify` to a flow-name string; that is not invocation of the protected operation. The service, dispatcher, and adapter are not wired into one loaded protected request path.

The native VOK filtered WSL check, `cargo test --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml context_advance_ -- --nocapture`, passed 2/2. It verifies monotonic local-table context advancement and revocation of that table's open lease before consumption. It does not acquire provider bytes, invoke the Fungi operation, or gate an authenticated result sink. This is supporting component evidence only; it does not change the RD disposition.

## Independent Astra adjudication — 2026-10-14

Read-only Astra worker: `01a1383c-8394-79b2-9ba0-5b206d17e0e8` (Carson), reviewing Galerina `main` at `122ad07dfcfe53fafb8d717972e5f7b673227cf6`. The worker confirmed the finding narrowly against the original test fixture: the generic `SecretsProvider`/`has`/`use` contract allows post-revocation delivery if provider code returns stale `true` after revoking and wiping. It does not trigger the swallowed callback-violation mechanism and distinguishes a case not covered by the existing staging-revocation test. Astra classified this as a moderate bootstrap contract/enforcement weakness; production exploitability is unestablished. Astra subsequently reviewed the refined fixture at hash `FCC8898345736835943A200EF30AA07243E36503B5057A79DD0FA7F3639C57E9`; see the follow-up adjudication below. Production source is unchanged.

Astra independently inspected `SealArena`: `has()` is a synchronous private-map lookup; `remove()` and `rotateValue()` are synchronous; its `use()` wipes a transient copy in `finally`. No source evidence shows natural same-stack re-entry in this implementation. Thus the adversarial provider regression demonstrates what the generic interface cannot enforce, not a reachable `SealArena` exploit. The consumer callback is a local disclosure boundary, not the production recipient/storage sink.

The reviewed ordering uses `R` = revocation effective at the enforcing authority, `O` = actual protected provider effect, and `D` = irreversible recipient/storage delivery. Required schedules are: `R < O` refuses with no successful protected open or delivery; `O < R < D` blocks delivery and retry-open while keeping acquired bytes charged/quarantined pending verified cleanup; `O < D < R` permits only the already-completed one-time disclosure and records it as pre-revocation. A check/fence must be enforced at the effect itself, not merely read before a separate I/O call.

The least-bypassable design candidate is an authority-owned operation path with atomic authorized-open and atomic one-use release, both bound to the same request, principal, object/version, provider, recipient and current revocation generation. A lease, token, local lock, or cached epoch is not sufficient unless the provider and sink enforce it at `O` and `D`. The current WIT/design text is still a proposal and is not wired into the app-kernel path. The public design draft recommends M3 (one authoritative epoch enforced at both `O` and `D`), but says it is **not owner-adopted**. The route choice itself is already settled by the owner record: `POST /auth/verify` remains the first slice.

Astra's response is source-based and advisory. At review time, it accepted the 38/38 existing gate-test receipt and the original one-positive/one-failing regression receipt; it could not freshly run the TypeScript suite because WSL TypeScript support/compiler payloads were unavailable. The current unchanged gate suite was rerun on Windows and passed 38/38; the refined regression fixture now has two passing controls and one failing stale-presence assertion. Astra did not inspect the private RD body, production wipe helpers, or a composed production route, and did not claim runtime proof. No RD status, TODO, authorization, or product state changes follow from this review. Pending the owner ordering decision and effect-level implementation/evidence, RD-1413 remains HOLD / NON_AUTHORIZING.

**Current VOK wiring check:** `AuthorityTable::open_lease`, `consume_lease`, `execute_lease`, and `advance_context` in `packages-ts/galerina-core-runtime/native/vok-authority/src/lib.rs` manage a flow-local table and invalidate its own lease slots when context advances. They do not call a secret provider or result sink, and do not hold an authoritative serialization point across either external effect. A bounded source search across `packages-ts` and `examples` found no runtime implementation of the WIT names `acquire-password-lease` / `release-verification-result` outside the contract and tests. The Rust epoch tests therefore remain component controls, not implementation of M3 or evidence of `O`/`D` ordering.

**Vault contract/mirror verification — 2026-10-14 (Windows/Node):** ran `node --test tests/secrets-gateway-wit.test.mjs` in `packages-ts/galerina-ext-secrets-vault`; **15/15 passed**. This verifies that the candidate WIT declarations and both generated Fungi mirrors agree with the package's built contract oracle, including the draft O/R/D ordering language, opaque-resource shape, and accountancy checks. Exact inspected hashes: `src/types.ts` `15C64E1FC08A0281A53D440445A3008F6AC7DC08FB079E14DF0D7E35CE0172B6`; `src/self-hosted/secrets-gateway-wit.fungi` `34D23A3066B15EAF775C20AE8CA96A8813DDD16D949DC03C5C02BF4417F05618`; `packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi` `0BBA523E70460EE03CC1391F9A831E4B3CADE926200D3470EB2C2355E53D3BD6`; test `tests/secrets-gateway-wit.test.mjs` `A63178C720D6E7B29B786C92612FC76FDD7879073E5A273A14F89A836D82F96F`. This is contract/mirror consistency evidence only: WIT does not implement provider-open, revocation serialization, cleanup, or result handoff; the matching runtime operations remain absent from production source.

**Fresh WSL negative control — 2026-10-14:** explicitly executed the ignored counterexample with `GIT_DIR` and `GIT_WORK_TREE` unset, offline Cargo, and build output under `/tmp/codex-rd1413-vok-target`:
`cargo test --offline --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml secret_arena_owned_copy_survives_arena_cleanup -- --ignored --nocapture`.
Result: **1 passed, 0 failed**. An initial default invocation selected but skipped this ignored test; it is not counted as evidence. The explicit run confirms that a separately owned Rust `Vec` copy survives cleanup of the arena backing. It is a deliberate copy-escape counterexample, not proof of provider/revocation ordering, physical erasure, or a composed protected `/auth/verify` path.

## Independent Astra adjudication of the refined regression — 2026-10-14

The same read-only Astra worker, `01a1383c-8394-79b2-9ba0-5b206d17e0e8` (Carson), reviewed the refined regression at SHA-256 `FCC8898345736835943A200EF30AA07243E36503B5057A79DD0FA7F3639C57E9`. Astra confirmed it distinguishes the stale-authorization schedule from callback re-entry and from a provider that freshly returns `false`; it reproduces a valid adversarial-provider gap in the generic `SecretsProvider` contract. Astra verified the source sequence: provider use stages an independent copy, the final provider-controlled `has()` can revoke/wipe backing storage and return its captured `true`, and the consumer is entered before the gate wipes its staged copy.

The refined fixture no longer depends on a hard-coded presence-call count and now refuses provider use after revocation. Its active-credential and revoke-before-open controls pass. The stale final-presence case remains red against the current gate. Astra cautions that if a provider's `has()` contract is interpreted as promising truth through return, the adversarial fixture is non-conforming; the stronger conclusion still stands that the gate's current interface has no epoch, reservation, or serialization contract with which it could enforce that promise. This is a moderate bootstrap contract/enforcement weakness, not proof of natural re-entry in the current synchronous `SealArena`, nor a production exploit or composed `/auth/verify` finding.

Astra's follow-up recommendation remains effect-level enforcement: bind authorization and current revocation state atomically to actual provider-open (`O`) and irreversible delivery (`D`), then test revoke-before-open, open-before-revoke-before-delivery, and delivery-before-revoke. It identified fixture mutation tests and cleanup/quarantine/acknowledgement controls as additional evidence needed. This review does not choose M3 for the owner, approve a product design, or alter any RD status. The response came from the same Astra worker; the current agent interface exposed its worker identity and completed response but no distinct submission ID or response digest, so neither is asserted here.

## Explicit transport identity before body buffering — 2026-10-14

The API-server adapter previously called `bufferBody` before resolving its configured
channel verdict or principal resolver. Initial socket regressions reproduced that
ordering. The final tests send only a prefix of a declared 1,024-byte body: explicit
channel DENY and principal-resolution refusal each return a complete 401 without
waiting for body completion. They assert zero remaining request `data` listeners on
refusal, while an admitted positive control observes the adapter's listener during
body consumption and completes with 200 after the remainder arrives.

The adapter now resolves configured transport-wide channel evidence and, after an
exact ALLOW, configured principal evidence before calling `bufferBody`. A non-ALLOW
global result returns 401 with `Connection: close`, pauses the request stream and
does not enter this adapter's `bufferBody` data-consumer path. The kernel still applies the same
channel verdict in its own pipeline. Requests with no explicit channel result keep
the existing route-specific kernel-auth path.

Verification on 2026-10-14: package `npm test` (typecheck, build, local tests)
passed 76/76 on native Windows; `node --test tests/api-server.test.mjs` passed
18/18 on native Windows and WSL. Astra reviewer Carson (`01a1383c-8394-79b2-9ba0-5b206d17e0e8`)
adjudicated the supplied source excerpts and test design as partial supporting evidence,
not a full source review; it specifically notes listener-count assertions are snapshots,
not registration history. No GitHub Actions/CI ran. Changed source/test/package paths are limited to
`packages-ts/galerina-framework-api-server/src/index.ts`,
`packages-ts/galerina-framework-api-server/package.json`, and
`packages-ts/galerina-framework-api-server/tests/api-server.test.mjs`.

Limits: Node's HTTP parser or TLS layer may already hold network bytes internally;
the source ordering and tests support only the claim that this adapter skips its
`bufferBody` data-consumer path on explicit refusal. The listener-count test is a
snapshot and cannot prove that a listener was never registered and removed; proving
that stronger claim would require recording registration attempts or `bufferBody`
entry. Trusted resolver callbacks receive a raw request object and are not sandboxed;
the no-body-read contract is an assumption. Without an explicit transport identity
result, the adapter still buffers before route-specific kernel auth. The
selected production `POST /auth/verify` is not composed into a loaded protected
operation. This does not prove provider-open (`O`) / irreversible sink disclosure
(`D`) ordering, Fungi runtime/FFI/host enforcement, cleanup, or production
exploitability. RD-1413 remains HOLD / NON_AUTHORIZING; no authority or owner
decision changed.
