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
[ ] Define idempotency and replay protection contract
[x] Define rate-limit and workload control policy -- src/rate-limit-workload-policy.ts, tests/rate-limit-workload-policy.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed RateLimitWorkloadPolicy / RateLimitRule / WorkloadControl via descriptors; schema galerina.app-kernel.rate-limit-workload-policy/v1; FUNGI-APPK-RLW-001..005; defaultDecision deny-only; keyKinds principal/route/principal_route; positive finite ceilings; never throws; never echoes refused tokens
[x] Define request Structured Await scope and cancellation policy -- src/structured-await-policy.ts, tests/structured-await-policy.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed StructuredAwaitPolicy / StructuredAwaitLimits via descriptors; schema galerina.app-kernel.structured-await-policy/v1; FUNGI-APPK-SAW-001..005; requestScope required-only; onRequestCancel cancel_children-only; onChildError cancel_siblings-only; backgroundWork deny-only (queue_handoff reserved until queue/job contract); externalAwaitTimeout required-only; await modes all/race/single/stream strictly ascending; external timeout <= request timeout; never throws; never echoes refused tokens; no live scope execution
[x] Define queue/job contract -- src/queue-job-contract.ts, tests/queue-job-contract.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed QueueJobContract / QueueJobDescriptor / QueueJobRetryPolicy via descriptors; schema galerina.app-kernel.queue-job-contract/v1; FUNGI-APPK-QJC-001..005; defaultDecision deny-only; admittedQueues + jobs non-empty strictly ascending; job queue must be admitted; named typed payload (Any/Json/Unknown/Object/Raw... refused); positive finite maxPayloadBytes / timeoutMs / retry ceilings; backoff exponential/fixed; audit required-only; idempotency key reserved while idempotency contract is HOLD; never throws; never echoes refused tokens; no live enqueue/execution
[ ] Define runtime audit report format
[ ] Define app-kernel to galerina-core-runtime handoff contract
[ ] Define app-kernel to galerina-framework-api-server contract
[x] Add examples
[x] Add tests
```
