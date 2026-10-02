# Coding batch ready — 2026-09-22

**Overall:** implemented; CLI echo independent scoped PASS `01a0cb29`
(`docs/independent-audits/2026-09-22-cli-repl-echo-hold.md`). Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695` branch `main`. Not production
admission. No commit.

Later live inventory (2026-09-23) is **69 OPEN / 51 PARTIAL / 4 PATCHED**
in [scan-0f6063dd-inventory-2026-09-22.json](scan-0f6063dd-inventory-2026-09-22.json).
The 114 OPEN figure below is this packet's batch-time count.

## Preflight identity

| Field | Value |
|---|---|
| Worktree | `Galerina/.worktrees/rd-0873-native-fungi-bootstrap-implementation` |
| HEAD / branch | `91b4dec08fe4376febc9494a8023bd02912b8695` / `main` |
| Porcelain | dirty (pre-existing generated + security slice retained) |
| Touched this batch | `ext-secrets-spore` `src/io.ts`, `src/cli.ts`, `tests/cli-repl-echo.test.mjs`; WAT comment in `wat-emitter.ts`; this report + register |
| Untouched by plan | JSON encoder, graphs, roadmap SVG, `.fungi`, keys, constitution |

Source sha256:

| path | sha256 |
|---|---|
| `packages-ts/galerina-data-json/src/json-value.ts` | `d017efe4068aac7b9415448313b63a36de2ba10efb191cbab6dd888f7431eeef` |
| `packages-ts/galerina-ext-secrets-spore/src/io.ts` | `f90713783af4b3b7ecdb0416ea1c2c8070fb9997403768613b7edfc56fe97ff5` |
| `packages-ts/galerina-ext-secrets-spore/src/cli.ts` | `e7b32bda2db31404d785a9632602c1d4f1dc8e47af3c944bcced19eb095ab6f5` |
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `66a5fb30ec1cbc63b5cc7f16711b85f765e4cf6632cb334c90068a7fda27ddf3` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `caa56ee4e80d255f7d2b916364c130fe254b9075fe5b5098f1edfdf2cec44426` |

## Phase A

| Item | Result | Identity | Command | Review |
|---|---|---|---|---|
| JSON UTF-8 encoder | **CONFIRMED** 7/7 focused + package **40/40**; impl untouched | json-value `d017efe4…` | `node --test packages-ts/galerina-data-json/tests/json-encode-budget.test.mjs`; package `node --test` | author-run |
| Interactive secret input | **CONFIRMED** echo defect then repair | io `f9071378…` cli `e7b32bda…` | `node --test tests/io-prompt.test.mjs tests/cli-repl-echo.test.mjs` → **7/7** | scoped PASS `01a0cb29` |
| Finding inventory | **CONFIRMED** 124/124 IDs; 114 OPEN | findings.json `07cdbef5…` | inventory JSON n=124 unique | not closure |
| Records | this report + register | — | — | — |

Invariant: secret keystrokes never share an echoing readline output. Hostile
`_ttyWrite` still echoes dummy `dummy-secret-value`; exclusive mute does not.
Non-TTY still refuses. Hardware TTY **NOT VERIFIABLE**.

## Phase B

Allocation invariant: a secret flow owns `[owner_base, $__fungi_heap)` only;
host cleanup after copy zeros `[WAT_HEAP_BASE, heap)` via guest
`__fungi_wipe_owned`. Nested inner wipe must not clear the caller's live
`Cell { a: 7 }`.

| Oracle | Result |
|---|---|
| nested outer.a + inner = 14 | **CONFIRMED** pass |
| host sentinel above live heap | **CONFIRMED** pass |
| Q1 full file | **CONFIRMED** **27/27** |
| Unsupported recursion | documented at `flattenClosedRecursivePlan`; deeper trees drop grandchild secrets; `let leaf = Node { child: leaf }` may trap |

No second hard task started.

## Residuals

- CLI echo independent scoped PASS `01a0cb29`; hardware TTY **NOT VERIFIABLE**.
- Scan **110** OPEN_ON_SCAN_SNAPSHOT (inventory 124/124; 10 PARTIAL_THIS_TREE).
- WAT execution metering implemented; independent scoped PASS `01a0cb36`.
- Authenticated CBOR subject vs JSON sidecar: independent scoped PASS `01a0cb43`.
- Native registry FIFO admission: independent scoped PASS `01a0cb4d`. Coding-batch queued hard tasks are complete.
- WASM host `__range` guest-memory/fuel bound: independent scoped PASS `01a0cb5b`. This is post-packet continue work, not Phase A/B of GROK-CODING-BATCH-READY.
