# RD-1413 revocation ordering follow-up — 2026-10-14

**Disposition: OPEN.** This note records a generic-provider counterexample and a
candidate O/R/D contract. It does not establish a production exploit, implement
revocation ordering, or close RD-1413.

## Pinned state and evidence

- Galerina checkout: `main` at `b619ca491dbb8f941460166906b0e47cb5c98751`.
- Gate source, `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts`,
  SHA-256 `DF1E4AC1992E1A0F7DB869742417D85357AFCEB0F0D77E655AB566512A71F128`.
- Arena source, `packages-ts/galerina-ext-secrets-spore/src/arena.ts`, SHA-256
  `B68E4DD132369384D7A8A25B9F34A79FA14991CE74EC55E35DA0999988928368`.
- Controlled regression,
  `packages-ts/galerina-framework-app-kernel/tests/rd1413-revocation-before-delivery.test.mjs`,
  SHA-256 `FCC8898345736835943A200EF30AA07243E36503B5057A79DD0FA7F3639C57E9`.
- Candidate contract oracle,
  `packages-ts/galerina-ext-secrets-vault/src/types.ts`, SHA-256
  `15C64E1FC08A0281A53D440445A3008F6AC7DC08FB079E14DF0D7E35CE0172B6`.
- Candidate Fungi mirrors:
  `packages-ts/galerina-ext-secrets-vault/src/self-hosted/secrets-gateway-wit.fungi`
  SHA-256 `34D23A3066B15EAF775C20AE8CA96A8813DDD16D949DC03C5C02BF4417F05618`;
  `packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi`
  SHA-256 `0BBA523E70460EE03CC1391F9A831E4B3CADE926200D3470EB2C2355E53D3BD6`.
- The candidate oracle and mirrors are modified working-tree files; the regression
  is untracked. Their hashes identify this review snapshot, not committed product
  state.

## Fresh local checks

- The app-kernel package-local TypeScript compiler completed successfully when
  invoked directly. The normal `npm run build` wrapper failed because it resolved
  a broken global `tsc` shim; that wrapper failure is not counted as a source
  compile result.
- Combined `secret-gate.test.mjs` and the new regression: **40 passed, 1 failed**
  on Windows. The only failure is the intended stale-presence counterexample; the
  active-credential and revoke-before-open controls pass. The test imports freshly
  rebuilt package output.
- The same controlled regression in WSL: **2 passed, 1 failed**, with the same
  stale-presence assertion. Git fixture variables were unset.
- The vault contract/mirror suite: **15/15 passed** on Windows. It checks contract
  shape, mirror consistency, and the candidate O/R/D wording; it does not execute
  host enforcement.
- No GitHub Actions/CI was run.

## Independent review

- Reviewer: Astra subagent `01a1383c-8394-79b2-9ba0-5b206d17e0e8`.
- Submission: `01a13869-c321-7f73-bb82-d1278d11f1c2`.
- The review verified all three supplied source/test hashes. Its outcome was
  **PARTIAL** for the generic-contract counterexample, **NOT_VERIFIABLE** for
  production `SealArena`/kernel reachability within its scope, and **PARTIAL** for
  the ordering contract. The reviewer found no same-schedule interleaving in the
  inspected synchronous `SealArena` bodies; it noted separately that an active
  callback may continue using its already-created transient after `remove()`.
  Neither observation proves production exploitability or settles active-use
  policy. The agent tool did not expose a separate response timestamp or response
  digest; do not infer one from this note's timestamp.

## Interpretation and next action

The adversarial provider snapshots presence as true, revokes and wipes storage,
then returns the stale true value. The gate accepts that Boolean and delivers its
staged copy. This establishes that the generic `has/use` interface cannot itself
prove revocation-before-delivery against that provider behavior. It does not show
that the current `SealArena` naturally produces the schedule, nor that a loaded
`POST /auth/verify` operation exists.

The modified candidate contract defines O (protected open), R (effective
revocation), and D (irreversible disclosure). It proposes refusal for `R < O`,
lease invalidation plus cleanup/quarantine for `O < R < D`, and one truthful
pre-revocation disclosure for `O < D < R`. The candidate is internally
consistent under the 15-test mirror suite, but remains uncommitted,
non-authorizing, and not wired to the provider/runtime/sink. The app-kernel TODO
still records owner adoption of the active-use/revocation policy as pending.

**Owner decision requested:** when effective R follows O but precedes D, must the
host cancel/fence disclosure and quarantine until cleanup, or may a bounded
already-open lease finish once (with revocation acknowledgement delayed until it
ends)? Do not implement either policy in the product path until that choice is
settled and the enforcing host/provider boundary is identified.

The existing SuperGrok review was already delivered as
`codex-supergrok-galerina-rd1413-ordering-contract-20261014-01` and had no reply in
its bucket at this check. It was not redispatched. RD-1413 remains
**HOLD / NON_AUTHORIZING**; the production route and runtime enforcement remain
unproven.

## Follow-up verification — current checkout

- Rebuilt app-kernel with the package-local TypeScript compiler, then reran the
  controlled regression: **2 controls pass, 1 revocation-before-delivery case
  fails**. In the failing schedule, backing storage is zeroed but the staged
  `SECRET` bytes still enter the consumer. `npm run build` itself could not
  resolve its configured global `tsc` shim in this checkout; the direct
  package-local compiler invocation succeeded, so the test result is source-bound.
- Ran the Rust `secret_arena` integration-test target in Ubuntu WSL: **3 passed,
  2 ignored**. The ignored tests require target-specific Linux memfd_secret and
  memory-lock conditions.
- Explicitly ran the ignored `secret_arena_owned_copy_survives_arena_cleanup`
  Rust counterexample in WSL: **1 passed**. It confirms a detached `Vec` copy
  survives cleanup of the arena mapping. This is component evidence for copy
  escape, not proof that a production route creates that copy.
- Cleared inherited `GIT_DIR` and `GIT_WORK_TREE` for both WSL cargo runs. No
  GitHub Actions/CI ran. No implementation, staging, commit, push, merge, or
  Myco refresh occurred during this follow-up.

The RD-1413 issue remains at the composition boundary: VOK epoch advancement,
`SecretArena` cleanup, the app-kernel's generic `has/use/has` gate, and recipient
disclosure are not one wired operation. The specific O/R/D owner choice also
remains pending in the package TODO. A fresh owner answer is required before
selecting the cancellation-vs-finish policy; do not treat candidate WIT text as
that approval.

## Route capability versus protected-operation wiring

- The committed compiler route dispatcher already supports one exact
  `POST /auth/verify` binding, preserves its body as raw bytes rather than
  auto-decoding JSON, and refuses overlapping/template aliases. Its targeted
  `runtime-route-request-size.test.mjs` suite passed **13/13** after a fresh
  package-local TypeScript compile.
- That suite runs a synthetic `inspectCiphertext` flow which returns only body
  length and hex. It proves route matching/body representation behavior; it
  does not verify identity, authenticate ciphertext, access a provider, execute
  the Fungi secret gateway, or disclose a result.
- The example host's `createGreetingKernel` still loads only `GET /hello`, and
  the API-server package contains no `/auth/verify` implementation. Thus the
  earlier statement that compiler-level exact route handling exists is now
  source-verified, while the production application operation remains unwired.
- This correction does not alter the endpoint choice or grant clearance. The
  separate app-kernel TODO's fixture/Deno and provider-ordering gaps remain.

## Fungi contract/build and disclosure-order adjudication — 2026-10-14

The current working-tree WIT contract is mirrored consistently as text, but that
is not a compiled or wired protected operation:

- `node scripts/generate-secrets-gateway-wit.mjs --check` returned
  `verified 2 Fungi WIT mirrors against the TypeScript source declaration`.
  The product Fungi source is SHA-256
  `0BBA523E70460EE03CC1391F9A831E4B3CADE926200D3470EB2C2355E53D3BD6`; the
  TypeScript declaration is `15C64E1FC08A0281A53D440445A3008F6AC7DC08FB079E14DF0D7E35CE0172B6`.
- `scripts/generate-secrets-gateway-wit.mjs` generates Fungi functions whose
  body returns the WIT text as a `String`. It does not generate a WIT host
  adapter. The checked-in `secrets-gateway-wit.wat` is a 223-byte module whose
  only function returns `i32.const 1`; it contains no provider, revocation, or
  recipient-sink operation. The paired WASM is 66 bytes.
- The build manifest records source hash `23f2a8c9cd7c8990ee1fbf02e33a086bab687d2d7831fae57ad81be9fa964879`
  and generation time `2026-09-13T17:47:09.924Z`, which do not match the
  current product Fungi source hash. Treat that built artifact/manifest as stale
  for the current working-tree source. The generator check validates mirror
  text only; it does not refresh or validate the WASM artifact.
- The package test parses WIT text, compares Fungi string literals with the
  TypeScript oracle, and invokes the Fungi checker. Those checks establish
  contract-text parity and source acceptance only; they do not execute a WIT
  interface or host/provider/revocation/sink implementation.

The existing Astra worker returned a further advisory adjudication (worker
`01a1383c-8394-79b2-9ba0-5b206d17e0e8`; retained submission reference
`01a13869-c321-7f73-bb82-d1278d11f1c2`). Its response digest and response
timestamp were not exposed by the worker interface. The review agrees that the
O/R/D schedule is only a proposal and identifies contract obligations to settle
before a real host implementation:

1. D must mean the actual irreversible recipient-side disclosure effect, not a
   validation performed before releasing a lock. The authoritative serialization
   must cover that effect (or a participating recipient commit), otherwise
   `validate; unlock; R; sink-write` still discloses after revocation.
2. Specify an operation-wide one-use release state. Opaque borrowed request/grant
   handles alone do not evidence that repeated issuance/acquisition cannot create
   two release attempts for one operation.
3. Define partial/uncertain delivery and status-only recovery transitions. The
   `delivery-unknown` enum is present, but no current host implementation or test
   demonstrates its persistence, crash recovery, or prevention of a second
   disclosure.

Source comparison confirms these are unresolved contract/enforcement obligations,
not a demonstrated production exploit: the WIT functions remain declarations,
the Fungi mirror returns a string, and no implementation call site was found in
the scoped package/application source. The owner decision on the `O < R < D`
active-use policy remains pending; this review does not adopt the candidate
policy. No source implementation, RD disposition, TODO closure, or publication
occurred in this follow-up. No GitHub Actions/CI ran.

## Owner ruling reconciliation — 2026-10-14

The pending-choice statements above describe the review checkpoint before the
owner's subsequent selection. The owner selected **release as the ordering
point**. The current app-kernel TODO records the resulting rule: if effective
revocation commits before recipient-bound release, release is fenced; if release
commits first, exactly that one disclosure is permitted and a later revocation
cannot recall it. If the ordering authority is unavailable or stale, release
refuses. This resolves the earlier question about an open operation: opening
does not reserve permission to disclose after a prior revocation; bytes already
acquired remain subject to cleanup/quarantine when release is fenced.

This is a design ruling, not evidence that O, R and the actual irreversible D
effect share an enforcing serialization domain. The report remains **OPEN**:
provider/runtime/sink wiring, one-use release, interruption/unknown-outcome
handling, authenticated recipient acknowledgement, recovery, and composed
`POST /auth/verify` evidence are still required. RD-1413/1414/1415 remain
HOLD / NON_AUTHORIZING.
