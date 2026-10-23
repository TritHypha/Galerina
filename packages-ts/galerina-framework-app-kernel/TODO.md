# Galerina App Kernel TODO

## RD-1413 live re-entrant revocation finding — 2026-10-14 (working tree only)

- **DEMONSTRATED only as an adversarial interface counterexample in the
  TypeScript bootstrap:** `src/secret-gate.ts` uses the provider's `use` callback
  to create a separate staged byte copy, then calls
  provider-controlled `has` before invoking the consumer. The untracked
  `tests/rd1413-revocation-before-delivery.test.mjs` models `has()` observing
  `present`, synchronously revoking and wiping the provider buffer, then
  returning its stale `true` snapshot. The gate subsequently gives the still-
  populated staged copy to the consumer. The current test run reproduces that
  schedule. This provider behavior may be non-conforming if `has()` promises a
  value that remains valid through its return. The inspected `SealArena.has()`
  is a synchronous map lookup; no natural same-stack revocation path or
  production `/auth/verify` exploit has been established. The test demonstrates
  that the generic `has/use` shape does not specify effect-level serialization;
  its refusal expectation remains contingent on owner adoption of the O/R/D
  ordering contract.
- Native Windows app-kernel tests against a fresh local TypeScript build:
  **604/605 pass; the sole failure is this RD-1413 counterexample** (no timeout
  failures on this run). API-server typecheck/build and package tests against
  the same freshly rebuilt app-kernel output pass **86/86**. The app-kernel
  package's `npm run build` launcher itself fails because its TypeScript
  executable is missing in that package context; invoking the already-present
  local `tsc -p tsconfig.json` from the API-server package succeeded. No
  GitHub Actions/CI ran.
- The existing `has/use` interface has no atomic operation that serializes a
  final provider-open/revocation decision with delivery. Repeating `has()` is
  not a fix: provider-controlled code can revoke after any stale observation.
  A local O/R/D contract candidate exists in
  `packages-ts/galerina-ext-secrets-vault/src/types.ts` and its generated WIT
  asset. **Owner decision (2026-10-14): release is the ordering/commit point.**
  Serialize verified revocation and recipient-bound release in one authoritative
  provider/host ordering domain: a revocation committed before release fences
  the release; a release committed first is the one permitted irreversible
  disclosure and cannot be recalled by a later revocation. An unavailable or
  stale ordering authority must refuse release. This is a selected design rule,
  not proof that the candidate contract or any runtime implements it.
- **Next:** implement and test a provider/host-owned atomic lease/release point
  against the adopted O/R/D contract; prove refusal when R commits before D,
  exactly-once release when D commits before R, and cleanup/quarantine for
  interruption or unknown outcomes. Do not weaken or rewrite the regression
  expectation. Then trace a real `POST /auth/verify` through Fungi-owned bytes,
  runtime/FFI/host, recipient ACK and recovery. This checkpoint leaves
  RD-1413/1414/1415 unresolved and non-authorizing; preserve the mixed dirty
  tree and do not publish this work yet.

## Duplicate-key response reconciliation — 2026-10-10

- [x] Independent review and integration of the retained no-key-echo fix.
  Integrated into main in `65792296d`; the generic duplicate-request 409 preserves
  the conflict code and atomic-claim ordering. The donor regression failed against
  a fresh pre-fix build, then passed; fresh WSL typecheck/build and package tests
  passed 579/579. Astra verified source preservation and retained green evidence;
  the reported pre-fix failure has no retained standalone raw log.
  The October 6 contract row below describes the earlier key-echo state; that
  specific limitation is addressed by the integrated fix. Durable storage,
  response replay, reserved audit/queue kinds and core-network reconciliation
  remain open. This does not establish Fungi runtime or host memory guarantees.

## Tower import boundary — 2026-09-26

The RD-0873 dirty worktree retargets the app-kernel request path to Tower
`/governance` and registry paths to `/custody`; the focused result is
recorded in `../../docs/TODO.md`. This does not close the contract-spec
backlog below, the core-network package-install HOLD, or production
admission. No fresh tests were run for this TODO refresh.

> Note (2026-06-16): the App-Kernel **P1 implementation shipped** — `src/{types,route-defaults,kernel,fuse-loader,index}.ts`
> (the fail-closed request pipeline + fuse-loader), **38 tests**, and **3 `.fungi` examples**
> (`typed-api-boundary`, `security-policy`, `job`). The unchecked `Define …` items below are the
> remaining contract-spec backlog, not the implementation.

```text
[x] Create /packages-ts/galerina-framework-app-kernel
[x] Add README.md
[x] Add package metadata
[x] Add checked Run Mode smoke fixtures
[x] Define typed API boundary contract -- src/typed-api-boundary.ts, tests/typed-api-boundary.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed TypedApiBoundary / TypedApiRoute via descriptors; schema galerina.app-kernel.typed-api-boundary/v1; FUNGI-APPK-001..005; never throws; never echoes refused tokens; reserved strip/replay refused
[x] Define request validation policy -- src/request-validation-policy.ts, tests/request-validation-policy.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed RequestValidationPolicy via descriptors; schema galerina.app-kernel.request-validation-policy/v1; FUNGI-APPK-RVP-001..005; deny requires non-empty admittedFields; strip refused; never throws; never echoes refused tokens
[x] Define auth provider boundary contract -- src/auth-provider-boundary.ts, tests/auth-provider-boundary.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed AuthProviderBoundary / AuthProviderDescriptor via descriptors; schema galerina.app-kernel.auth-provider-boundary/v1; FUNGI-APPK-APB-001..005; kinds bearer/jwt/oauth2/oidc/dpop/mtls/apiKey/webhookSignature/capabilityToken; none/HS* + header-presence fallback refused; never throws; never echoes refused tokens
[x] Define scope and role policy model -- src/scope-role-policy.ts, tests/scope-role-policy.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed ScopeRolePolicy / RoleDescriptor via descriptors; schema galerina.app-kernel.scope-role-policy/v1; FUNGI-APPK-SRP-001..005; defaultDecision deny-only; wildcards refused; role scopes subset of admittedScopes; never throws; never echoes refused tokens
[x] Define idempotency and replay protection contract -- src/idempotency-replay-policy.ts, tests/idempotency-replay-policy.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): closed IdempotencyReplayPolicy via descriptors; schema galerina.app-kernel.idempotency-replay-policy/v1; FUNGI-APPK-IDR-001..005; records the shipped kernel.ts 9.75 / route-defaults behaviour as single-value fail-closed fields: mutatingMethods required, missingKey reject, onDuplicate reject (replay reserved, as route admission refuses it), storeFailure reject, claim atomic (never read-then-write), claimAfterGates required, scope route, echoKey deny; header RFC 9110 token <= 64; ttlSeconds 1..604800 and maxKeyBytes 1..1024 are owner-revisit ceilings; never throws; never echoes refused tokens. Not done here: kernel.ts is unchanged (its duplicate-key 409 message still includes the caller's key, which echoKey deny records as the target; raised with Codex), no durable store, no response replay, the runtime-audit-report-format idempotency kind and queue-job idempotency key stay reserved, and the core-network IdempotencyStore get/put [!] reconciliation row stays open
[x] Define rate-limit and workload control policy -- src/rate-limit-workload-policy.ts, tests/rate-limit-workload-policy.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed RateLimitWorkloadPolicy / RateLimitRule / WorkloadControl via descriptors; schema galerina.app-kernel.rate-limit-workload-policy/v1; FUNGI-APPK-RLW-001..005; defaultDecision deny-only; keyKinds principal/route/principal_route; positive finite ceilings; never throws; never echoes refused tokens
[x] Define request Structured Await scope and cancellation policy -- src/structured-await-policy.ts, tests/structured-await-policy.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed StructuredAwaitPolicy / StructuredAwaitLimits via descriptors; schema galerina.app-kernel.structured-await-policy/v1; FUNGI-APPK-SAW-001..005; requestScope required-only; onRequestCancel cancel_children-only; onChildError cancel_siblings-only; backgroundWork deny-only (queue_handoff reserved until queue/job contract); externalAwaitTimeout required-only; await modes all/race/single/stream strictly ascending; external timeout <= request timeout; never throws; never echoes refused tokens; no live scope execution
[x] Define queue/job contract -- src/queue-job-contract.ts, tests/queue-job-contract.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed QueueJobContract / QueueJobDescriptor / QueueJobRetryPolicy via descriptors; schema galerina.app-kernel.queue-job-contract/v1; FUNGI-APPK-QJC-001..005; defaultDecision deny-only; admittedQueues + jobs non-empty strictly ascending; job queue must be admitted; named typed payload (Any/Json/Unknown/Object/Raw... refused); positive finite maxPayloadBytes / timeoutMs / retry ceilings; backoff exponential/fixed; audit required-only; idempotency key reserved while idempotency contract is HOLD; never throws; never echoes refused tokens; no live enqueue/execution
[x] Define runtime audit report format -- src/runtime-audit-report-format.ts, tests/runtime-audit-report-format.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed RuntimeAuditReportFormat via descriptors; schema galerina.app-kernel.runtime-audit-report-format/v1; FUNGI-APPK-RAR-001..005; defaultDecision deny-only; admittedReports non-empty strictly ascending subset of closed README report kinds; idempotency kind reserved while IdempotencyStore HOLD; redaction required-only; includeSecrets deny-only; positive finite maxEventsPerReport; never throws; never echoes refused tokens; no live report emission
[x] Define app-kernel to galerina-core-runtime handoff contract -- src/core-runtime-handoff-contract.ts, tests/core-runtime-handoff-contract.test.mjs (SuperGrok 2026-10-08; zero-trust defaults, owner may revisit): closed CoreRuntimeHandoff via descriptors; schema galerina.app-kernel.core-runtime-handoff/v1; FUNGI-APPK-CRH-001..005; createCoreRuntimeHandoff / readCoreRuntimeHandoff / checkCoreRuntimeHandoff; seamVersion galerina.runtime.seam.v1 mirrored from core-runtime GOVERNED_RUNTIME_SEAM_VERSION via filesystem drift test (no @galerina/core-runtime package dependency); executorBinding deny_all-only; effectPolicy clock+random / denyProcessEffects true / requireExplicitNetworkPermission true (DEFAULT_RUNTIME_EFFECT_POLICY); references structured-await-policy / queue-job-contract / runtime-audit-report-format schema tokens (does not copy their fields); GovernedRuntimeRequest WASM fields and RuntimeContext mode/projectRoot/timeoutMs omitted (OWNER-REVISIT); never throws; never echoes refused tokens; not wired; kernel.ts (RD-1413) untouched.
[x] Define app-kernel to galerina-framework-api-server contract -- src/api-server-handoff-contract.ts, tests/api-server-handoff-contract.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): records the shipped handoff (api-server normalises one request -> AppKernel.handle once -> writes GalerinaKernelResponse); schema galerina.app-kernel.api-server-handoff/v1; checkKernelHandoffRequest / checkKernelHandoffResponse closed shapes via descriptors; FUNGI-APPK-ASH-001..005; field lists pinned by test to kernel.ts GalerinaKernelRequest/Response and types.ts HttpMethod, and the api-server kreq builder is checked to set contract fields only; channelVerdict is K3 data (evidence, never admission; RD-0855); principalId + principalScopes travel together; records (does not fix) that api-server normaliseMethod casts any verb to HttpMethod (kernel then 404/405). Not wired; kernel.ts (RD-1413) and api-server untouched
[x] Add examples
[x] Add tests
[x] Package-side HOLD pin: `prepareProtectedMemoryRouteRequest` emits
    REQUESTED_NOT_ADMITTED; `addSecretAuthority` /
    `bindProtectedMemoryLifecycle` / `wireFuseBorderIntoKernel` /
    `installKernelDefaultRegistryCheck` / `bindGovernedRuntime` /
    `installDurableReplayStore` / `enqueueQueueJob` /
    `executeStructuredAwait` / `emitRuntimeAuditReport` always refuse
    with APPK_*_FORBIDDEN. kernel.ts and secret-gate.ts unchanged.
    tests/app-kernel-hold-pin.test.mjs. (SuperGrok 2026-10-08.)
[HOLD] RD-1413 / RD-1414 / RD-1415 coupled protected-memory path --
    HOLD / NON_AUTHORIZING. Do not add TypeScript secret-authority.
    Kept HOLD: SuperGrok's side is the typed refuse. Unique `bbeb067a` UNCHANGED.
[HOLD] Wire fuse-border / central package registry as kernel.ts defaults --
    fuse-loader already accepts host-injected revocationCheck / registryCheck.
    Kept HOLD: kernel.ts stays unwired. Unique `bbeb067a` UNCHANGED.
[HOLD] Wire CoreRuntimeHandoff / bindGovernedRuntime into createAppKernel --
    descriptor exists; CreateAppKernelOptions has no executor field.
    Kept HOLD: not wired. Unique `bbeb067a` UNCHANGED.
[HOLD] Durable replay store and live SAW / queue / audit execution --
    descriptors stay deny-only; no live kernel acts.
    Kept HOLD: SuperGrok's side is the typed refuse. Unique `bbeb067a` UNCHANGED.
```

## Coupled RD-1413–1415 protected-memory path — 2026-10-05

**Owner-approved direction (scoped):** ECC/RAS is a host reliability layer;
Galerina uses one bounded protected staging-and-verification lifecycle. ECC and
a second plaintext copy are not authorization or zero-trust integrity controls.
This is a design decision only; it does not approve the whole V1 design or close
any RD.

**Current package boundary, source checked:** `src/secret-gate.ts` is still the
kernel's executing TypeScript path. The package-declared
`src/self-hosted/secret-gate.fungi` is only a pure fold over host-supplied
presence evidence, remains not build-wired, and does not own secret bytes, an
affine lease, a Linux arena, cleanup, or release. The current TS provider seam
(`has(name)` / `use(name, callback)`) is name-based and cannot establish an
authorized object/version. The same-name replacement counterexample and exact
pins are documented in [`../../docs/reports/rd1413-1415-coupled-review-20261005.md`](../../docs/reports/rd1413-1415-coupled-review-20261005.md)
and the current integrated proposal in
[`../../docs/superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md`](../../docs/superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md).

**Astra exact-delta reviews:** agent `01a10e20-d54f-7a30-bba4-abf1c32d5573`
reviewed v0.2 (PARTIAL; no loaded operation/platform enforcement was
verifiable); agent `01a10e2c-1849-7b60-ad24-2bab119b1f90` reviewed v0.4 SHA-256
`FCEE68175E12F1176646907E82FC6A8F96E866FC0471A152186A273EA93C4595` and
returned PARTIAL without executing tests or injections. The v0.4 review found
seven deltas: atomic destination/write-authority/revocation checks; full
plaintext/key custody; late-fault result invalidation; provenance correction;
authenticated recovery transaction identity; opaque-ingress/protected-parse
ordering and endpoint roots; and late-fault/controller-state handling. These
are now represented in design v0.7; they are design review findings, not product
attack findings. Agent `01a10e2c-1849-7b60-ad24-2bab119b1f90` reviewed v0.6 SHA-256
`EC9F7489407C5E2339255FEDA543CF9AA4122B1A051DA57D964D0F6B30786422`, returned
PARTIAL, and found length-domain/order, pre-admission scratch, mutation timing,
endpoint-binding, old-incarnation recovery, and Windows plaintext-policy gaps.
No source execution or tests were performed. Astra's v0.7 delta review returned
PASS for those bounded document corrections, while implementation readiness
remains PARTIAL and loaded-operation/platform enforcement NOT_VERIFIABLE. The
review confirmed no remaining contradiction within its delta scope; it did not
approve the full design or close any RD.

**Owner choice recorded:** ECC/RAS is host reliability only; Galerina should use
one bounded protected staging-and-verification lifecycle. Neither ECC nor a
second plaintext copy is treated as zero-trust authorization or integrity.

**Next gate:** do not add TS secret-authority logic. Before a Fungi-owned
implementation slice, approve the complete design and bind a real protected
operation/object-version, authenticated principal and Signet issuer/revoker,
provider/key owner, recipient, exact Amazon Linux TCB/profile, protected ingress
and output endpoints, revocation/fencing primitive, rollback-resistant freshness
authority, Fungi lease/runtime ABI, crypto policy, and finite budgets. Then make
the implementation plan and discriminating tests for one loaded route. Windows
10 is remote-only and may not fall back to local plaintext. RD-1413, RD-1414,
and RD-1415 remain **HOLD / NON_AUTHORIZING** until the coupled route and
independent owner adjudications pass.

**RD-1413 live source recheck — 2026-10-14:** the focused bootstrap regression
`tests/rd1413-revocation-before-delivery.test.mjs` is controlled red: its active
provider positive control passes, but in the revocation schedule the provider's
stored bytes are zero while the already-staged copy still enters the consumer
(`SECRET`); the consumer is not refused. This demonstrates the behavior of the
adversarial provider fixture, not a confirmed production or `SealArena`
TOCTOU exploit. Whether it violates the generic provider contract depends on
the adopted semantics of `has`. The reproducer's final `has` snapshots `true`,
then revokes and wipes before returning; the gate consumes that stale Boolean and
dispatches its earlier staged copy. The focused run is 1 failing revocation
assertion and 2 passing controls (revoke-before-open and active credential).
The refined fixture at SHA-256
`FCC8898345736835943A200EF30AA07243E36503B5057A79DD0FA7F3639C57E9` was
independently reviewed by Astra, which confirmed the missing generic-interface
serialization contract but did not establish a SealArena or production-route
exploit. Do not patch it by adding TypeScript secret authority; the owner
selected release as the ordering/commit point on 2026-10-14. Implement and test
that rule in the Fungi-owned provider/runtime/sink path; the focused bootstrap
counterexample remains open until release is serialized with verified
revocation, the stale staged-copy schedule refuses, and the composed
`POST /auth/verify` path proves authenticated recipient acknowledgement and
status-only recovery. This owner design decision does not itself close RD-1413.
The selected `POST /auth/verify` operation remains unwired: the example exposes only
`/__fixture/auth/verify`, and the Deno adapter returns 503 for the selected route.
The API-server resolves configured global channel/principal factors before buffering;
the adapter tests cover those explicit refusal paths. A synthetic loopback probe
also confirmed the former no-resolver gap: protected `POST /secure` remained
pending on an incomplete body, then returned 401 only after body completion.

**Current working-tree follow-through (2026-10-14; unreviewed/unintegrated):**
`AppKernel.preflightAuthorization` and the normal kernel pipeline now share one
authorization fold. The API-server normalizes the route target, invokes the
preflight before body buffering, closes the connection on a matched-route auth
refusal, and repeats the auth check through normal `handle` after buffering.
Unmatched/public routes still use the bounded body reader. A further adapter
dispatch preflight checks the refreshed identity before webhook replay claim or
kernel dispatch. Regressions also pin the callback receiver, shared
null-prototype authorization/query snapshots, and route-scope revocation before
replay. Native Windows and WSL API-server suites pass **84/84**. The app-kernel
suite reports **604/605** on native Windows and in the serialized WSL run; in
both, the only failure is the intentional RD-1413 copied-secret counterexample.
The default parallel WSL run also had two child-process timeouts in unrelated
hostile-intrinsics/deadline tests, while those two files pass **22/22** when run
directly in WSL. No GitHub CI was run.

This is TypeScript/bootstrap transport evidence only, not production
`POST /auth/verify` wiring, Fungi runtime/FFI/host enforcement, protected-byte
custody or RD closure. The Deno adapter still returns 503 for the selected
route. Keep the product/RD requirements open pending the composed protected
operation and owner adjudication.
The Rust VOK context-advance test proves only revocation of its local authority-table
lease; no inspected call path composes it with this secret gate, provider open, or
result handoff. The adjacent Rust `SecretArena` is likewise not wired into this
operation: `SecretArena::with_bytes_mut` is crate-private and marked
`allow(dead_code)`, and the repository's call sites are its Rust tests/doctests;
no production app-kernel or `/auth/verify` caller was found. Treat arena cleanup
tests as component evidence, not operation evidence. Fresh WSL check on 2026-10-14:
the VOK Rust suite passed 48 tests with 6 ignored; the explicitly selected ignored
`secret_arena_owned_copy_survives_arena_cleanup` test also passed (1/1). That test
is a controlled counterexample showing an owned `Vec` copy survives cleanup of
the arena backing; it is not a test failure or evidence of a production route.
Synthetic data only; Git identity variables were unset for the fixture, Cargo ran
offline with its target output under `/tmp`, and GitHub CI was not used. This
confirms component cleanup cannot erase detached copies made by trusted crate
code. The current WAMR host seam is also only an ABI gate: `wamr_validate_module_import_abi`
checks an already-loaded module's function imports against a closed contract;
its header explicitly excludes caller/effect authorization, Signet validation,
and secret custody. The pinned WAMR probe report records bounded runtime
initialization/cleanup tests. Fresh WSL rerun on 2026-10-14 passed all 20 probe
checks against the runner's exact pinned WAMR 2.4.5 headers and library; Git
routing variables were unset, and GitHub CI was not used. A current bounded
source search found the WAMR lifecycle calls only in the probe under
`scripts/tests`, with no `wasm_runtime_init`, `wasm_runtime_register_natives`,
or `wasm_runtime_destroy` call in the inspected `packages-ts` production scope.
Neither result wires a protected provider-open or an effect grant into the
loaded Fungi operation. No RD status changes; retain HOLD / NON_AUTHORIZING.

The compiler's existing `FUNGI-AFFINE-005` gate was freshly rebuilt and its
`galerina-core-compiler/tests/value-state/authority-use-state.test.mjs` suite
passed 107/107 on native Windows and WSL. It verifies secret-lease refusal across
aliases, parameters, containers, returns, persistence sinks, and both build modes.
It does not implement or prove secret-byte cleanup, FFI/host behavior, provider
revocation ordering, or the loaded `/auth/verify` route; keep the lease refused.

Fresh focused boundary checks (2026-10-14) are recorded in
`docs/reports/rd1413-boundary-check-20261014.md`: the provider-copy race remains
controlled-red, local VOK epoch invalidation passes on Windows and WSL, and
route/fixture controls pass without proving a production protected operation.

Package-side pin (SuperGrok 2026-10-08): `src/hold-pin.ts` refuses the
TypeScript secret-authority and protected-memory acts. The `[HOLD]` rows
above stay HOLD. Unique `bbeb067a` UNCHANGED.
