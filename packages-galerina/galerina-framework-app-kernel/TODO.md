# Galerina App Kernel TODO

> Note (2026-06-16): the App-Kernel **P1 implementation shipped** — `src/{types,route-defaults,kernel,fuse-loader,index}.ts`
> (the fail-closed request pipeline + fuse-loader), **38 tests**, and **3 `.spore` examples**
> (`typed-api-boundary`, `security-policy`, `job`). The unchecked `Define …` items below are the
> remaining contract-spec backlog, not the implementation.

```text
[x] Create /packages-galerina/galerina-framework-app-kernel
[x] Add README.md
[x] Add package metadata
[x] Add checked Run Mode smoke fixtures
[ ] Define typed API boundary contract
[ ] Define request validation policy
[ ] Define auth provider boundary contract
[ ] Define scope and role policy model
[ ] Define idempotency and replay protection contract
[ ] Define rate-limit and workload control policy
[ ] Define request Structured Await scope and cancellation policy
[ ] Define queue/job contract
[ ] Define runtime audit report format
[ ] Define app-kernel to galerina-core-runtime handoff contract
[ ] Define app-kernel to galerina-framework-api-server contract
[x] Add examples
[x] Add tests
```
