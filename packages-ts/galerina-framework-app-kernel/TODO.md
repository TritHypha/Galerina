# Galerina App Kernel TODO

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
Package-side pin (SuperGrok 2026-10-08): `src/hold-pin.ts` refuses the
TypeScript secret-authority and protected-memory acts. The `[HOLD]` rows
above stay HOLD. Unique `bbeb067a` UNCHANGED.
