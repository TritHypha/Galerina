# Fungi memory readiness audit

**Status: DRAFT FOR OWNER REVIEW, NON_AUTHORIZING.**

Never `READY` while the RD-1413/1414/1415 TODO gate is closed. Owner A1: converting memory files to `.fungi` is not blocked by that gate; converted units stay unmerged to main. This audit prepares the first slice. No authoritative `.fungi` is authored here.

Scaffold branch: `grok/fungi-memory-scaffold-20261017` off main `bdb5d1baa9fd97a3b0ac8a16cb074809a2d00567`.
TS input files: consolidation branch `grok/memory-ts-consolidated-20261018` HEAD `dc0f9c8c4f1365f0228cda213b2ecd001400463e` (ls-remote TritHypha; CONSOLIDATION-NOTES.md at its root).
Queue 29 registry: branch `grok/fungi-lowering-obligations-20261017` HEAD `5caebad6c32d41a058400fea84d3c25370e5348b` path `docs/superpowers/specs/2026-10-17-fungi-lowering-obligations.registry.json` (29 landed as a branch, not on main).

## Standing owner rulings

- No null or NaN; typed uncertainty only.
- Every match/switch ends with an exhaustive fail-closed `_ =>` or default arm that refuses (Rust Ok/Err may omit `_ =>`).
- A shared C-boundary helper turns foreign NULL/NaN/Infinity into typed UNKNOWN/Ambiguous; these values do not exist in .fungi.
- U4: evicted/live/default operation states report DELIVERY_UNKNOWN.
- v1 crypto is hybrid classical + post-quantum behind a swappable modular interface; no v3 crypto work now.
- Rust is only an independent out-of-process verifier; the compiled .fungi runtime contains no Rust.
- No GitHub CI and nothing that triggers it; every commit carries [skip ci]; no force-push, rebase, or --no-verify; nothing deleted without Phillip.
- Synthetic data and keys only; never export RD bodies or keys.
- FULL AUTO: don't stop to ask; make the zero-trust choice and record it. Verify, never assume.


## Converter sequence and conflicts (Addendum C)

Workbench → translating-typescript-to-fungi → writing-fungi. C1–C4 as in the marker spec. Obligations win over TS-preserving translation. Workbench HOLD is evidence, not a stop (A1). REFUSE stops that unit.

Skills applied: `code-logic-workbench` (planning evidence only, not run against a PROJECT graph this brief — graph evidence UNKNOWN in this clone); `translating-typescript-to-fungi` core/binding/workflow 1,4–7,13,25; `writing-fungi` core/binding/workflow 4,5,8,14,20,33. No `.fungi` authored.

## Closed verdicts

Per unit × obligation: `KEEP` | `PATCH` | `REBUILD` | `ABANDON_TS_DESIGN` | `UNKNOWN`. Unlisted refuses.

Per RD part: `READY_FOR_SLICE_AFTER_GATE` | `NEEDS_DESIGN` | `NEEDS_TOOLCHAIN` | `UNKNOWN` | `REFUSED`. Unlisted is `REFUSED` (never `READY`).

## Shared C-boundary helper

Grep at base `bdb5d1ba`: no shared null/NaN helper in `.fungi` or main TS. Queue 20 `foreign-boundary.ts` is absent from main and PARKED_TS_REFERENCE. Consolidation head has two copies (`secret-gate.ts` and `foreign-boundary.ts`, CN-1). Zero-trust: one helper in `packages/fungi/memory/src/c-boundary.fungi`. Checklist (brief 29 Addendum A item 2): null-test first; panic/exception → typed result; no pointer into a temporary; trusted length; no terminator scan; foreign integer range-checked; allocator frees its own allocation; unchecked foreign allocation is fail-open. Converter `NULLISH` / `BINARY64` blockers stay in force until the helper exists.

## Readiness matrix (unit × obligation)

Evidence is file:line at main base unless marked consolidation. Conservative default for NO_TWIN units is `REBUILD`. Existing twins do not own secret bytes (secret-gate.fungi comment at base lines 11–13) so LINEAR_SECRET is `REBUILD`.

| unit | NO_NULL_NAN | EXHAUSTIVE_FAIL_CLOSED | TOTAL_EFFECT_OUTCOME | MONOTONIC_TYPED_TIME | LINEAR_SECRET | UNFORGEABLE_CAPABILITY | SEALED_INTRINSICS | NO_AMBIENT_AUTHORITY | BOUNDED_INPUT | DEADLINE_COVERS_ALL | NO_OVERLAPPING_CHUNKS | HOST_ADAPTER_PRESENCE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SECRET_GATE | PATCH | PATCH | REBUILD | UNKNOWN | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | PATCH | UNKNOWN | UNKNOWN | UNKNOWN |
| APP_KERNEL | PATCH | PATCH | REBUILD | UNKNOWN | REBUILD | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U4_RELEASE_COMMIT_POINT | REBUILD | REBUILD | REBUILD | REBUILD | UNKNOWN | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U3_SECRET_ARENA | REBUILD | REBUILD | REBUILD | REBUILD | REBUILD | REBUILD | REBUILD | UNKNOWN | UNKNOWN | REBUILD | UNKNOWN | UNKNOWN |
| APPK_HOLD_PIN | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP | KEEP |
| APPK_API_SERVER_HANDOFF | PATCH | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PATCH | UNKNOWN | UNKNOWN | UNKNOWN |
| APPK_CORE_RUNTIME_HANDOFF | PATCH | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| U2_SERVE_GATE | REBUILD | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | REBUILD | UNKNOWN | REBUILD | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN |
| AUTH_VERDICT | PATCH | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| AUTH_FACTORS | PATCH | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| AUTH_VERIFY_ROUTE | REBUILD | REBUILD | REBUILD | UNKNOWN | REBUILD | UNKNOWN | REBUILD | UNKNOWN | REBUILD | UNKNOWN | REBUILD | UNKNOWN |
| SIGNET_GATEWAY_WIT | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PATCH | PATCH | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| SPORE_SECRETS | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| BODY_READER | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | REBUILD | PATCH | REBUILD | UNKNOWN |
| CAPABILITY_LEASE | PATCH | PATCH | REBUILD | UNKNOWN | UNKNOWN | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| MEMORY_VALIDATOR | PATCH | PATCH | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PATCH | UNKNOWN | UNKNOWN | UNKNOWN |
| C_BOUNDARY_HELPER | REBUILD | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | REBUILD | UNKNOWN | UNKNOWN | UNKNOWN |
| (unlisted unit) | refuses | refuses | refuses | refuses | refuses | refuses | refuses | refuses | refuses | refuses | refuses | refuses |

Notes:
- APPK_HOLD_PIN KEEP: stays TypeScript refusal pin (`prepareProtectedMemoryRouteRequest`); not converted.
- AUTH_VERIFY_ROUTE TS oracle confirmed on consolidation `dc0f9c8c` as `auth-verify-route.ts#createAuthVerifyRoute`; absent at main `bdb5d1ba`.
- SECRET_GATE twin `admitSecrets` at base returns String `"admit"` / `"secret_unavailable"` and does not own secret bytes (secret-gate.fungi:11–27) → LINEAR_SECRET REBUILD, NO_NULL_NAN PATCH (String status not a closed union).
- ABANDONED_TS_DESIGN: NONE in this scaffold. CN-1 (two boundary helpers) and CN-2 (auth-verify `.state` vs U4 status shape) are composition failures on the consolidation branch; they are REBUILD in .fungi, not abandoned RDs.

### Parked-finding discharge units

| parked id | unit | obligation ids | verdict |
|---|---|---|---|
| P20-F1 | AUTH_VERIFY_ROUTE | LINEAR_SECRET, TOTAL_EFFECT_OUTCOME, BOUNDED_INPUT | REBUILD (A4: overlapping/duplicate chunks refused outright) |
| P20-F2 | AUTH_VERIFY_ROUTE | SEALED_INTRINSICS, EXHAUSTIVE_FAIL_CLOSED | REBUILD |
| P20-N2 | AUTH_VERIFY_ROUTE | SEALED_INTRINSICS, BOUNDED_INPUT | REBUILD |
| P20-N3 | AUTH_VERIFY_ROUTE | NO_NULL_NAN | REBUILD |
| P20-N5 | AUTH_VERIFY_ROUTE | HOST_ADAPTER_PRESENCE | UNKNOWN (Deno adapter; Q29 `c098d466` maps this id) |
| P20-R1 | AUTH_VERIFY_ROUTE | SEALED_INTRINSICS | REBUILD |
| P20-R2 | AUTH_VERIFY_ROUTE | LINEAR_SECRET | REBUILD |
| P24-F1 | U3_SECRET_ARENA | LINEAR_SECRET | REBUILD |
| P24-F2 | U3_SECRET_ARENA | SEALED_INTRINSICS, LINEAR_SECRET | REBUILD |
| P24-F3a | APP_KERNEL | UNFORGEABLE_CAPABILITY | REBUILD |
| P24-F3b | U3_SECRET_ARENA | SEALED_INTRINSICS, LINEAR_SECRET | REBUILD |
| P24-F4 | U3_SECRET_ARENA | NO_NULL_NAN | REBUILD |
| P24-N1 | U3_SECRET_ARENA | DEADLINE_COVERS_ALL, MONOTONIC_TYPED_TIME | REBUILD |
| P24-N2 | APP_KERNEL | UNFORGEABLE_CAPABILITY, TOTAL_EFFECT_OUTCOME | REBUILD |
| P24-N3 | U3_SECRET_ARENA | LINEAR_SECRET | REBUILD |
| P24-N4 | U3_SECRET_ARENA | SEALED_INTRINSICS | REBUILD |
| P24-R1 | U4_RELEASE_COMMIT_POINT | TOTAL_EFFECT_OUTCOME | REBUILD |
| CN-1 | C_BOUNDARY_HELPER | NO_NULL_NAN, SEALED_INTRINSICS | REBUILD |
| CN-2 | AUTH_VERIFY_ROUTE | TOTAL_EFFECT_OUTCOME, EXHAUSTIVE_FAIL_CLOSED | REBUILD |
| CN-3 | U3_SECRET_ARENA | LINEAR_SECRET, BOUNDED_INPUT | REBUILD |
| (unlisted) | OBLIGATION_UNMAPPABLE | refuses silent drop | this row |

## 30-inputs check items (RD-1899..1910 PRIVATE, not yet in KB indexes (indexes stale))

No RD body quoted. Ideas 5 and 9 from `30-inputs-rd1899-1910.md` sha256 `10031f3b9ce7028152aeea529e8d2b8c2db148cabffb70b7256ea6f6c4423d04`.

| check | units | verdict | source |
|---|---|---|---|
| Leases as type-state (issued → consumed/released; double release unwritable) | CAPABILITY_LEASE, U4_RELEASE_COMMIT_POINT | NEEDS_DESIGN | RD-1909 PRIVATE, not yet in KB indexes (indexes stale) |
| Revoke shorter than grant and fail-closed, no approval step | U4_RELEASE_COMMIT_POINT, AUTH_VERIFY_ROUTE | NEEDS_DESIGN | RD-1903 PRIVATE, not yet in KB indexes (indexes stale) |
| Per-use attributable credentials | UNFORGEABLE_CAPABILITY units | NEEDS_DESIGN | RD-1903 PRIVATE, not yet in KB indexes (indexes stale) |
| Risk-tiered U2 serve gate; unlisted tier refuses | U2_SERVE_GATE | NEEDS_DESIGN | RD-1903 PRIVATE, not yet in KB indexes (indexes stale) |
| Audit record on every grant/use/revoke/refusal | APP_KERNEL, U4_RELEASE_COMMIT_POINT | NEEDS_DESIGN | RD-1903 PRIVATE, not yet in KB indexes (indexes stale) |
| Signet callers depend only on the interface | SIGNET_GATEWAY_WIT | NEEDS_DESIGN | RD-1907 PRIVATE, not yet in KB indexes (indexes stale) |
| (unlisted check) | refuses | this row | |

## RD part readiness

| part | verdict | reason |
|---|---|---|
| RD-1413 | READY_FOR_SLICE_AFTER_GATE | U2 serve-gate + AUTH_VERIFY_ROUTE have TS oracles on consolidation; gate still HOLD; A1 allows conversion unmerged |
| RD-1414 | NEEDS_DESIGN | LINEAR_SECRET / SEALED_INTRINSICS language gaps UNKNOWN; arena wipe structural |
| RD-1415 | NEEDS_DESIGN | TOTAL_EFFECT_OUTCOME language spec UNKNOWN |
| toolchain | NEEDS_TOOLCHAIN | golden-probe RED (stale manifest); compiler `tsc` exit 2 on shims; dist still emitted (`noEmitOnError` unset) |
| (unlisted) | REFUSED | never READY |

## Toolchain facts

| check | status | evidence |
|---|---|---|
| `npm run audit:package-topology` | VERIFIED exit 0, folder UNGOVERNED / typed UNKNOWN | Scan root is `packages-ts/` (`scripts/audit-flat-package-topology.mjs` `scanWorkspace` line 175 at base). `packages/fungi/` is never walked. GREEN 101 identities, 1 deferred, 0 pre-SLIDE node_modules is vacuous for this folder. |
| `npm run audit:package-topology:selftest` | VERIFIED 7/7 pass | |
| `npm run audit:product-boundaries --check` | VERIFIED exit 2 REFUSED | JSON `PRODUCT_GRAPH_MISSING`. Pre-existing in a fresh clone (selftest expects this). Not a refusal of the folder. Fallback `packages-development/` NOT used. Generating the graph would touch `build/` (forbidden). |
| `npm run audit:product-boundaries:selftest` | VERIFIED 10/10 pass | |
| `node scripts/build-core-chain.mjs galerina-core-compiler` (separate scratch clone `galerina-q30-compiler-scratch-20261018`) | PARTIAL | 11 package chain. 10 packages `tsc` exit 0. `@galerina/core-compiler` `tsc -p tsconfig.json` exit 2: `node-crypto-shim.d.ts` has no `randomUUID`; process stub has no `platform`/`chdir`; Buffer stub has no `alloc`. `noEmitOnError` unset so `dist/index.js` was still emitted. Same errors on Windows node v24.18.0 and WSL node v24.21.0. Nothing from the scratch clone is committed. |
| `node scripts/audit-kernel-fungi-twins.mjs` (scratch, after that dist) | VERIFIED exit 0 | `103/103 check-clean` across 10 dirs. frozen-reference: 13 frozen · 13 not-required · 3 deferred · 0 RED of 29 authoritative. |
| `node galerina.mjs check <twin>` | VERIFIED exit 0 | 30/30 manifest twins (every non-`NO_TWIN` `existing_fungi`, overlay, product). 0 errors, 0 governance warnings. |
| `node galerina.mjs build` secret-gate / kernel / memory-validator | VERIFIED exit 0 | scratch-only `build/*.wasm`. Dev signing key auto-provisioned in the scratch tree; not copied, not committed. |
| `node scripts/fungi-golden-probe.mjs --check` | VERIFIED exit 1 RED | Did not `--write`. Cause: stale golden-manifest vs live probe. Manifest recorded `probeRunnerSha256 sha256:587efed3…` (commit `f05c2993` 2026-09-12); live probe commit `f28d0eaa` 2026-10-04 hashes `306dc073…` (CRLF on-disk) / `cce8a8b2…` (LF). Manifest `runtimeClosureFileCount` 320 vs live 359 after core-compiler chain (`runtimeClosureSha256` 29f485dd vs 7e6ef826). `caseDefinitionSha256` recorded `22f4215b…` equals Windows CRLF bytes of `cases.json` (commit `6eebbfb1`); LF bytes are `62bc3954…` so a WSL LF checkout also mismatches. Grok staging RED is this stale-manifest triple, not a memory-folder defect. |
| full `packages-ts/*/dist` rebuild then probe | UNKNOWN | core-compiler-only closure already 359; a full-tree rebuild was not opened (time). |
| whole `npm test` | UNKNOWN | 30-minute budget not opened; full suite rewrites tracked fixtures (CN-3); compiler `tsc` is already exit 2. |
| `wat-p9-*-parity` | VERIFIED exit 1 | 16 files present. `node --test` tokenize + parser-expr: 1 pass / 37 fail / 1.2s. WASM tokenize returns empty Identifier tokens; parser-expr `RangeError: Maximum call stack size exceeded` in `readExprW`. Remaining 14 files not run. Pre-existing on this `tsc`-exit-2 dist, not a memory-folder defect. |
| (unlisted check) | UNKNOWN | refuses a silent green |

## Frozen-reference capture plan (this document, not a third spec)

Plan only. Capture itself is a later brief. Tool: `scripts/rd0361-freeze-reference.mjs`, oracle kind `typescript-shadow-capture`, `capturedAtCommit` = the commit captured from. Queue 24 and later fix briefs still edit `kernel.ts` / `secret-gate.ts` on parked branches, so capture waits until those land or until the consolidation head is the named capture commit. Record the capture commit.

Target fixtures per `audit-kernel-fungi-twins.mjs` `frozenState`: `packages-ts/<pkg>/tests/fixtures/rd0361-<stem>.frozen.json`. Model on `packages-ts/galerina-framework-app-kernel/tests/fixtures/rd0361-route-defaults.{capture.mjs,frozen.json,real-ts.mjs}` and `rd0361-route-defaults-frozen.test.mjs` (paths VERIFIED at base).

Twins: `secret-gate.fungi`, `kernel.fungi`, `memory-validator.fungi`. `FROZEN_DEFERRED` is removed in the same commit that adds a valid frozen set.

Ordering with the marker spec: capture before any TS body is reduced to a stub.

### Schema fit (v2) and owner A3 (v3 design only)

v2 value kinds are bool / int / k3 / string only. `secret-gate.fungi` `admitSecrets(providerPresent: Bool, required: Array<SecretPresence>)` takes an array of records, which v2 cannot express.

| twin export | v2 mapping | v3 need |
|---|---|---|
| secret-gate `admitSecrets` | cannot express `Array<SecretPresence>` | v3 list/record values |
| kernel twin | UNKNOWN pending per-export inventory at capture | UNKNOWN |
| memory-validator | UNKNOWN pending per-export inventory at capture | UNKNOWN |
| (unlisted export) | refuses a silent v2 mapping | this row |

v3 schema design (design only, v2 stays readable, no capture code, no schema file shipped in this brief):

- schema id `galerina.rd0361.frozen-reference.v3`
- v2 documents remain loadable
- new value kinds: `list` (ordered, finite, length-prefixed) and `record` (closed field set, no getters, own data only)
- `Array<SecretPresence>` encodes as `list` of `record` { name: string, status: string } with status in the closed set `present` / `absent` / `faulted` / `error`; unlisted status refuses
- no null, no NaN, no open objects
- loader refuses mixed v2/v3 kinds inside one value
- owner question: whether v3 is admitted before the first memory capture. Zero-trust default: do not capture secret-gate until v3 is admitted; keep the deferral.

Case design (MUST-refuse): empty required list with provider absent (admit only if that is the documented no-op); any required not exactly present; hostile inherited status; surplus fields; overlapping names. Domain or a bounded vector set per export, enumerated at capture time.

## Folder audit fallback

`audit:package-topology` VERIFIED exit 0 on `packages-ts/`. Folder `packages/fungi/memory/` is UNGOVERNED by that audit (typed UNKNOWN). `audit:product-boundaries` REFUSED `PRODUCT_GRAPH_MISSING` (pre-existing, not the folder). Fallback `packages-development/<name>/` was not used. A2 remains the fallback if a later audit refuses the folder. Never `packages-ts`.

## Spec-only folder-content guard (proposal, no script)

Later brief, NOT implemented here. Proposed `scripts/audit-fungi-memory-folder.mjs` walks `packages/fungi/memory/` and admits only:

- `README.md`, `src/README.md`, `tests/README.md`
- `memory-fungi.manifest.json`
- `src/*.fungi` and `tests/*.fungi` after a slice is approved
- no `node_modules/`, no `package.json`, no `package.fungi.json`, no other manifests, no unlisted names

| outcome | meaning | refusing default |
|---|---|---|
| FOLDER_ADMITTED | only allowed names | |
| FOLDER_UNGOVERNED | topology audit did not scan this tree | current state |
| FOLDER_REFUSED | stray package manifest, node_modules, or unlisted file | this row |
