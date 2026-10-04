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
[ ] Define typed API boundary contract
[ ] Define request validation policy
[ ] Define auth provider boundary contract
[ ] Define scope and role policy model
[ ] Define idempotency and replay protection contract
    (2026-10-04: behaviour hardened on main by PR #5 `875a81c03`: `onDuplicate: "replay"` is refused, S8b;
    the written contract spec is still open)
[ ] Define rate-limit and workload control policy
    (2026-10-04: rate limiting runs before decode on main via PR #5 `875a81c03`; raised `limits.rate`/
    `limits.timeoutMs` are recorded as relaxations via PR #10 `b0a240707`; the policy spec is still open)
[ ] Define request Structured Await scope and cancellation policy
[ ] Define queue/job contract
[ ] Define runtime audit report format
[ ] Define app-kernel to galerina-core-runtime handoff contract
[ ] Define app-kernel to galerina-framework-api-server contract
[x] Add examples
[x] Add tests
```
