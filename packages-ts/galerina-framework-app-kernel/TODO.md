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
[ ] Define rate-limit and workload control policy
[ ] Define request Structured Await scope and cancellation policy
[ ] Define queue/job contract
[ ] Define runtime audit report format
[ ] Define app-kernel to galerina-core-runtime handoff contract
[ ] Define app-kernel to galerina-framework-api-server contract
[x] Add examples
[x] Add tests
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
