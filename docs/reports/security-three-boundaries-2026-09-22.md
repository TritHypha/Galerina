# Three security boundaries — test and audit packet

**As of:** 2026-09-22 (repair follow-up after demonstrated reds).
**Overall:** INCOMPLETE_NON_AUTHORITATIVE. SELF-REJECTED as production clearance and as “all security fixes complete”.
The three hostile oracles that were red are now green on this dirty tree. Implementable residuals (mixed-body tail zero, host cleanup after copy including a rebased heap) are closed. Deferred: Windows-native FIFO, RD-1286 backend, JSON-Decimal, OAuth, 124-finding scan, constitution adoption. Independent review of the repair revision is **HOLD** (`01a0c9d8-65b8-78e0-98e1-03562c2f0890`). No commit, signing, or `.fungi` work.

Prompt: `GROK-THREE-SECURITY-BOUNDARIES-TESTING.md`.
This packet challenges the implementation. Owner decisions 1/2/8 remain settled policy.

## Candidate identity

| Field | Value |
|---|---|
| Worktree | `Galerina/.worktrees/rd-0873-native-fungi-bootstrap-implementation` |
| HEAD | `91b4dec08fe4376febc9494a8023bd02912b8695` (`main`, dirty) |
| Historical base cited by the prompt | `dc05e30a728484877623c957b522dc6dc8b550a2` |
| Node | v24.18.0 |
| npm | 12.0.2 |
| Platform | Windows 11 + WSL for live FIFO |

Dirty tree includes prior approved-decision implementation plus this testing round. Passing tests here are not clean-HEAD evidence. Untracked this round: the Q1/Q2/Q3 tests, FIFO TOCTOU helpers, audit CLI, corpus/operator/receipt files, and the independent HOLD receipt. Staged paths: none. Production sources under test are modified but uncommitted.

### Source digests (sha256)

| Path | sha256 | bytes |
|---|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `d92045ca648945d09bcbf736bb458b54413131e59fd5e8deb24ec5b5c681400a` | 280501 |
| `packages-ts/galerina-framework-api-server/src/index.ts` | `009c7b0f0ee4be815d8e0a3e3e568f57afb6e1878f418ca8e90dcab51e9fc784` | 38560 |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | `dbf3519f56e4ccb68428bb031b94d7a7dbc751de49925fb3211acc556af887a2` | 5900 |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | `1f093d3e4ed2a207dcf0c61fa8a12c4018609de9e0e38394858b3a36e7c70dc8` | 7892 |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | `fcdcfa5f0903b199e09d3a99b7caf535da3813c3c59cfd9d3f74a3d27a956842` | 28474 |
| `packages-ts/galerina-framework-app-kernel/src/host-floor.ts` | `a99b6c4a6132656dc41719917e6ce7bf20a3b8b30acd4079c9af5b7d8dfbee1f` | 6305 |

## Summary table

| ID | Pre-repair | After this repair | Residual |
|---|---|---|---|
| Q1 WAT wipe vs return | **CONFIRMED** `g(7)→0` | Hostile suite **13/13**; G5b/G5c **5/5**; B2b **7/7**. Capture-then-wipe on primitive `(return`; mixed-body tail uses on-exit zeroing; `wipeSecretHeapAfterHostCopy` zeros the exported arena even if `$__fungi_heap` is rebased. | Host/import exceptions **NOT VERIFIABLE** on wasm-standalone. Repair-revision review **HOLD**. |
| Q2 durability gate | **CONFIRMED** wrappers admitted | Hostile suite **13/13** plus replay-store **9/9**. Empty admit-list: unknown adapters refuse. No backend fabricated. | No admitted durable production backend (RD-1286 deferred). Example-app omits `requireDurableReplay`. |
| Q3 FIFO TOCTOU | **CONFIRMED** SIGKILL after `Q3_SWAPPED` | Q3+atomic-writer **15/15** on WSL. `O_NONBLOCK` open then handle `isFIFO`; scrub `ENXIO`→`LSS-FIFO-001`. | Windows-native FIFO **NOT VERIFIABLE**. Corpus scanner PASS is not full-corpus assurance. |

RD reuse: RD-1286 (durable replay), existing WAT G5 / B2b notes. No new RD allocated.

## Q1 — return semantics versus secret lifetime

**Locator:** `wat-emitter.ts` `rewriteG5cCaptureThenWipe` plus `wipeSecretHeapAfterHostCopy`. Primitive early `(return` captures the operand, wipes, then returns. Heap-pointer results skip G5c; the host copies then calls `wipeSecretHeapAfterHostCopy(instance, true)`, which fills from `WAT_HEAP_BASE` to the end of exported memory.

WAT `(return (i32.load …))` becomes fill-then-load. The inspected region is linear memory `[WAT_HEAP_BASE=1024, $__fungi_heap)`.

**Minimal reproducer** (secret, early heap load):

```text
record Wide { a: Int, b: Int, c: Int }
pure flow g(s: Int) -> Int
contract { intent { "q1" } privacy { contains PII } }
{ let w: Wide = Wide { a: s, b: s, c: s } if s <= 10 { return w.a } return 1 }
```

| Case | Expected | Actual |
|---|---|---|
| secret `g(7)` early `w.a` | 7 | **0** |
| non-secret identical `g(7)` | 7 | 7 |
| secret `g(11)` constant branch | 1 | 1 |
| secret fall-through `if s > 10 { return 1 } return w.a` at 7 | 7 | 7 (last expr is not WAT `(return`) |
| emitZeroOnExit `w.a+w.b` at 7 | 14 then zeros | 14 then zeros |
| heap-pointer `h(7)->Sec` field | 7 | 7 (implicit result, no G5c wrap) |
| `wipeSecretHeapAfterHostCopy` | host cleanup | **absent** (`undefined`) |

**Commands**

```text
node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs
```

Lane worker Q1 (`01a0c9c4-d056-7341-931e-22f4fc45d763`): **13 tests, 8 pass, 5 fail**. Failures are the 7-to-0 family. Post-exit arena words at 1024/1028/1032 are 0 even on the red path. Host/import exceptions on this wasm-standalone fixture are **NOT VERIFIABLE** (no `(import`). Return-expression emits exactly one `(call $id`. Hand-WAT mutation control: wipe-before-load **0**, capture-then-wipe **7**.

**Mutation:** existing G5c substring test (`wat-arena-intrusion-wipe-g5b.test.mjs`) remains green on this candidate and does not assert `g(7)===7` on an early heap load. The hand-WAT pair is the red-capable evaluation-order control.

**Unsupported:** genuine host/import exceptions vs trap-instruction `unreachable` — trap path uses `ensure s > 0` → WASM unreachable. Host-import exceptions were not exercised.

**Repair (not applied):** stop splicing `memory.fill` as a sibling before `(return`. For primitive i32, evaluate the operand into a local, wipe `[1024, heap)`, return the local (same order as emitZeroOnExit). Heap-pointer results must not be zeroed and called success; add a host cleanup/refusal after the host copies the object. Independent challenge: capture-then-wipe on `(return` can green the 7-to-0 tests and still leave mixed-body remanence and heap-pointer secrets; a no-op `wipeSecretHeapAfterHostCopy` export would fake the absence oracle.

## Q2 — claimed durability versus admitted authority

**Locator:** `index.ts` 554–562 (`createApiServer`); `replay-store.ts` 25–51 (`PROCESS_LOCAL_REPLAY_STORES` WeakSet). The gate refuses only `isProcessLocalReplayStore(store)`. It does not positively admit a durable store. Construction starts no listener.

**Minimal reproducer:** `requireDurableReplay: true` with `{ claim: (...a) => memory.claim(...a) }` — construction succeeds today.

| Adapter (all NON-DURABLE) | Expected | Actual |
|---|---|---|
| `new MemoryReplayStore` | refuse | refuse |
| subclass of `MemoryReplayStore` | refuse | refuse |
| forwarding wrapper | refuse | **admitted** |
| bound `claim` object | refuse | **admitted** |
| `Proxy` | refuse | **admitted** |
| accessor `claim` | refuse | **admitted** |
| forged `durable: true` field | refuse | **admitted** |
| omit `requireDurableReplay` (dev) | construct | construct |
| `requireDurableReplay` and no webhook | construct (no replay consumer) | construct |

Claims at construction: 0 (gate is identity check only). Unknown adapters never reach `claim` because they are admitted without calling it.

**Commands**

```text
node --test --test-timeout=60000 packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs
```

Lane worker Q2 (`01a0c9c4-d056-7341-931e-230dbd1e618f`): **5 pass / 7 fail** on 12 tests before the no-webhook control and claim-count instrument fix. Empty-grant vs omitted-grant: **2/2 pass**. Unknown adapters are admitted. `example-app/host/server.ts` calls `createApiServer({ kernel, allowInsecureLoopback: true })` with **no** `requireDurableReplay`.

No admitted durable production backend exists. A positive production-durable case was not fabricated. Actual durability would still need independent-process contention, restart retention, namespace separation and expiry on a named backend (deferred, RD-1286).

**Repair (not applied):** when `requireDurableReplay === true` and a webhook store is present, refuse unless the store is on an admit-list of durable implementations. Until that backend exists, production remains refused for every store. WeakSet branding of `MemoryReplayStore` may remain as a diagnostic, not as the authority. Independent challenge: naming `isAdmittedDurableReplayStore` without changing the denylist would silence the corpus scanner; a no-webhook `requireDurableReplay` still constructs (no replay consumer).

## Q3 — checked pathname versus opened object

**Locator:** `atomic-writer.ts` 114–119 (`read`: `lstatSync` → `refuseSnapshotSpecialFile` → `openSync` without `O_NONBLOCK`); 147–159 (`scrub`, same). `registry-generation-store.ts` 410–433 (`lstat` → `isFifo`/`isFile` → `fs.open`).

**Minimal reproducer:** Node `--require` preload returns the original regular-file stats from `lstatSync`/`fs.promises.lstat`, then `unlink`+`mkfifo` on that path before return. Next `open` blocks. Child is supervised with an 8s SIGKILL deadline. Sleep is not the race.

Live files live in WSL `/tmp` (DrvFs `/mnt/c` cannot host FIFOs).

| Case | Expected | Actual |
|---|---|---|
| valid regular snapshot | read succeeds | pass |
| symlink snapshot | `LSS-LINK-001` | pass |
| FIFO already present at lstat | `LSS-FIFO-001`, no block | pass (~1.6s) |
| FIFO substituted after lstat, `read` | refuse, no block | **SIGKILL**, stderr `Q3_SWAPPED` |
| same, `scrub` | refuse, no block | **SIGKILL**, `Q3_SWAPPED` |
| `loadRegistryGeneration` same swap | refuse, no block | **SIGKILL**, `Q3_SWAPPED` |

**Commands**

```text
node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs
```

Lane worker Q3 (`01a0c9c4-d056-7341-931e-231391af263c`): **9 tests, 5 pass, 4 fail**. Failures: file TOCTOU read/scrub/registry plus **parent-directory substitution** (`Q3_SWAPPED` / `Q3_SWAPPED_PARENT` then SIGKILL). Passes: Windows has no `O_NONBLOCK`, valid file, symlink `LSS-LINK-001`, direct FIFO, unrelated sibling unchanged. Kill deadline 8000 ms. Descriptor cleanup is the killed child’s process death. Additional consumers: `ColdBootOrchestrator` uses `AtomicWriter`; `full-sentinel-flight.test.mjs` is a Tower consumer of the same writer.

**Windows:** native Node on NTFS cannot establish a FIFO open. This lane used WSL `node` + `mkfifo` + Linux tmpdir. A Windows host without WSL node/mkfifo is NOT VERIFIABLE for live FIFO open. Discovery-time `isFIFO` on a pre-existing FIFO remains covered by `fifo-live-linux.mjs` and the direct-FIFO control.

**Repair (not applied):** open with `O_RDONLY|O_NONBLOCK` (POSIX), `fstat` the handle, refuse FIFO/link/identity change, then read/scrub only a proven regular file. Apply to both `AtomicWriter.read`/`scrub` and `readBoundedRegularFile`. Independent challenge: `scrub` uses `O_WRONLY` — POSIX FIFO open without a reader is `ENXIO` before `fstat`; `fs.open(path, "r")` cannot set `O_NONBLOCK`; Windows Node has no `O_NONBLOCK` (bitwise OR with `undefined` is 0). Ino/dev mismatch without `LSS-FIFO-001` can unhang while the refuse tests stay red.

## Audit CLI and corpus

Owner: `scripts/audit-three-security-boundaries.mjs`.

```text
node scripts/audit-three-security-boundaries.mjs --self-test
node scripts/audit-three-security-boundaries.mjs --json <file>…
node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest docs/reports/security-three-boundaries-corpus-2026-09-22.json
```

Exits: 0 PASS · 1 FINDING · 2 REFUSED.
Bounds: 64 files, 8 MiB each, self-test in-process before any report.

**Self-test:** OK, 18 fixtures (paired hostile/clean, production-shaped Q2 gate, omitted/missing refuse, mutation of a clean fixture goes red, `.fungi` not-applicable, flag liveness). Receipt sha256 `83b8aef387fcc95d938fc559c27ab3ff1ab027580565dfb870c99bbaa4b61f37`.

**Omitted input:** `--json` with no files → `REFUSED omitted-input`.
**Directory input:** `packages-ts` → `REFUSED not-a-file`.

**Corpus scan** (digest-bound enumerated sources only; not full `.fungi` assurance):

| Input | Classification |
|---|---|
| `wat-emitter.ts` | inspected (capture-then-wipe; digest `d92045ca…`) |
| `api-server/src/index.ts` | inspected (empty `isAdmittedDurableReplayStore` admit-list) |
| `replay-store.ts` | inspected |
| `atomic-writer.ts` | inspected (`O_NONBLOCK` + handle `isFIFO`) |
| `registry-generation-store.ts` | inspected (`O_NONBLOCK` + handle `isFIFO`) |
| `examples/ai-inference/classifyMessage.fungi` | not-applicable (existing `.fungi` is not the emitter/admission/open gate) |
| `examples/auth-service/verifyPassword.fungi` | not-applicable |

Manifest digest `d5b1057809ca3646c4cfc0b3fc4457296b6e2093d70385862c30dfe69bfde1f3`.
Scan status **PASS** (exit 0) on the enumerated digest-bound set after the repairs. That is not full-corpus assurance. Lexical hits are leads; the hostile suites above are the proof.

Excluded: full compiler `.fungi` corpus; generated `build/`; other worktrees. Operator map: `docs/reports/security-three-boundaries-operator-2026-09-22.md`.

## Downstream inventory (read-only)

Read-only walk of sibling checkouts `SLIDE` and `lyth-weaver` (skip `.git`/`node_modules`/`build`):

| Tree | Hits |
|---|---|
| SLIDE | 1: `fixtures/galerina-restore-verdict.fungi` mentions `AtomicWriter` as **host-floor commentary**. The file is a trit `restoreVerdict` fold; it does not open snapshots. |
| lyth-weaver | 0 |
| VOK as a sibling repo | **absent** on this machine (`SLIDE/src` exists; no `VOK` checkout) |

These three gates are Galerina-hosted. That is inventory, not a SLIDE/VOK/Lyth security audit.

## Operator notes

- Do not treat G5c comment presence as a passing secret-return test.
- Do not treat `isProcessLocalReplayStore(wrapper)===false` as durability.
- Do not treat `refuseSnapshotSpecialFile` unit tests as TOCTOU coverage.
- Q3 children must run on a Linux filesystem. WSL `/tmp` works; `/mnt/c` does not host FIFOs.
- Each blocking child has an 8s kill deadline. Timeout is a FINDING (blocked open), not PASS.
- Audit `--self-test` must run in the same process as a report.

## Independent review

Author cannot self-certify. GPT-6 Astra is not a callable reviewer in this Grok session (**NOT VERIFIABLE** as that provider).

| Reviewer | Id | Verdict |
|---|---|---|
| Independent freeze | `01a0c9b5-1235-72b3-a89d-f1aea03cbbb7` | HOLD — [earlier receipt](../independent-audits/2026-09-22-q123-three-security-boundaries-independent-hold.md) |
| Q1 lane worker | `01a0c9c4-d056-7341-931e-22f4fc45d763` | Q1 **CONFIRMED** 8/13 |
| Q2 lane worker | `01a0c9c4-d056-7341-931e-230dbd1e618f` | Q2 unknown-adapter durability **REFUTED** (admitted); empty-grant **CONFIRMED** |
| Q3 lane worker | `01a0c9c4-d056-7341-931e-231391af263c` | Q3 TOCTOU **CONFIRMED** 5/9 |
| Astra-style challenge | `01a0c9c4-d056-7341-931e-2320f3c76f1b` | HOLD — [astra-style receipt](../independent-audits/2026-09-22-q123-astra-style-challenge-hold.md) |
| Repair-revision review | `01a0c9d8-65b8-78e0-98e1-03562c2f0890` | HOLD — [repair receipt](../independent-audits/2026-09-22-q123-repair-revision-hold.md). Original reds green; heap-only wipe was a no-op if `$__fungi_heap` rebased — subsequent fill is now the whole exported arena. |

Callers: G5c only in `wat-emitter.ts`. `requireDurableReplay` only in `createApiServer` plus its tests. Example app constructs without that flag. `AtomicWriter` is also used by `ColdBootOrchestrator` and `full-sentinel-flight.test.mjs`. `loadRegistryGeneration` is used by `registry-runtime.ts` / `host-floor.ts`.

Independent challenge: tests can stay partly green while the defect remains (hand-WAT mutation control does not hit the emitter; no-webhook `requireDurableReplay` constructs; sibling test previously optional; corpus tokens can go silent). Adjudicated against executable evidence: the 7-to-0, wrapper-admission, and SIGKILL TOCTOU oracles still **CONFIRMED**. Proposed repairs remain **PLAUSIBLE** and incomplete as described above.

## Engineering handoff (next implementer)

1. Repair Q1 at `wat-emitter.ts` 778–783: capture-then-wipe for primitive early returns; keep 7-to-0 tests until they pass; do not zero heap-pointer results.
2. Repair Q2 at `index.ts` 554–562: unknown stores refuse under `requireDurableReplay`. Keep wrappers as red tests until they throw. Do not add a durable backend.
3. Repair Q3 at `atomic-writer.ts` 119/159 and `registry-generation-store.ts` 433: non-blocking open + handle `isFIFO`. File **and parent** SIGKILL tests must complete with `LSS-FIFO-001`. Handle `scrub` `O_WRONLY`/`ENXIO` and Windows missing `O_NONBLOCK`.
4. Re-run the audit corpus against new digests. Do not treat an `isAdmittedDurableReplayStore` or `O_NONBLOCK` token as the repair.
5. Independent review of the repaired revision. Dirty-candidate tests still are not clean-HEAD evidence.

## Test and tool digests (this round)

| Path | sha256 |
|---|---|
| `tests/q1-secret-return-value.test.mjs` | `18820da650c65d3d1fa42266af19326bf39ae7ce793e95683ba3ba5125a049a7` |
| `tests/q2-durable-replay-admission.test.mjs` | `492fd64814b6c0bca07eed0ed2c81af2d6b3be19e1e4ad98c6d498445edb9e97` |
| `tests/q3-fifo-toctou.test.mjs` | `55d3ee57713ce8a1370d276fa09c094880d42d538aa0dbcaa8361e071c5ca1ec` |
| `tests/q3-fifo-toctou-preload.cjs` | `d35ebfe208bce9fde419bc54316cf544fd4e024a3e8743d630988616dd5d1ddf` |
| `tests/q3-fifo-toctou-child.mjs` | `47ad073875060de4ee826efacd020fbb8b98a916df2edc5103fd59d7d5a30310` |
| `tests/q3-fifo-toctou-registry-child.mjs` | `f80c52ff79c156221fed662f6974aaf47eb098df77f54759f5e5e4f32cce8fe7` |
| `scripts/audit-three-security-boundaries.mjs` | `4cbd2fafc3c5555d27dd70feac0f2bebfb60ec7ea739e139397fc9f2fae31ad9` |
