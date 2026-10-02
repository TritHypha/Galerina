# Independent audit — Q1/Q2/Q3 three security boundaries

**Verdict: HOLD**

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited.
Author claims were re-run; this receipt is not the author’s report.

Frozen source SHA-256 matched on this tree:

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `56f31f24f3e07ad13c43a448d298adf47466a41ef125e450ac24d34da0310a95` |
| `packages-ts/galerina-framework-api-server/src/index.ts` | `8649156f18eb8709ff049bbd7ce82472d60a5d6f2459c1cbe769c7a8bdbb48e5` |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | `43a84a5559ba8020fb5cc6bc87412eada0584f8927cb31bca23eddff4577a579` |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | `7555095d7cbb0330990e232d14421b01187ac4664fec18b1297530bcf2ba4008` |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | `c1f83dbd20f6172c7c30bb59862af39b30e4b883310af7ed34647bfee016bcb3` |

`dist/` for those packages was newer than source on this run; the failing tests executed the dirty lowering/admission/open paths.

## Command receipts

1. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **6/11 pass, 5 fail** (`duration_ms 431`). Failures are `0 !== 7` on secret early heap returns.
2. `node --test --test-timeout=60000 packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs` → **3/10 pass, 7 fail**. Failures are `Missing expected exception` on wrappers/proxy/bound/accessor/forged/unknown.
3. `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs` → **3/6 pass, 3 fail** (`duration_ms 33483`). TOCTOU children `signal=SIGKILL`, `stderr=Q3_SWAPPED`. Direct FIFO control passed.
4. `node scripts/audit-three-security-boundaries.mjs --self-test` → **OK (16 fixtures)**, exit 0.
5. `node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest docs/reports/security-three-boundaries-corpus-2026-09-22.json` → **FINDING**, exit 1, four findings, all five corpus digests matched.

Independent extra probes (temp scripts, not production):

- Q1 WAT for `g`: G5c splice is `(memory.fill …) (return (; G5c … ;) (i32.load …))`. `g(7)` → `{got:0,w0:0,w1:0,w2:0,hasG5c:true,hostCleanup:"undefined"}`.
- Q2: `MemoryReplayStore` refused; forwarding wrapper, Proxy, and forged brand **admitted**.
- Q3 symlink control on this Windows host is a real `LSS-LINK-001` (not a silent skip this run).
- `fs.constants.O_NONBLOCK` is **absent** on Windows Node; WSL Node reports `2048`.

## Q1 — secret return vs wipe

**Author claim: CONFIRMED.**

Locator: `wat-emitter.ts` 769–783 string-replaces `/\(return\b/g` with `memory.fill` immediately before WAT `(return`. Independent WAT:

```
(then
  (memory.fill (i32.const 1024) …) (return (; G5c secret-wipe before early return ;) (i32.load (i32.add (local.get $w) (i32.const 0))))
)
```

WASM evaluates the fill first, then the load, so a secret early return of `w.a` is **0** and the arena words are 0. Non-secret control still returns 7. Fall-through last expression still returns 7 while the G5c substring is present (`q1-secret-return-value.test.mjs` pass). `emitZeroOnExit` capture-then-wipe (`wat-emitter.ts` 801–824) still returns 14 for `w.a+w.b`. Heap-pointer implicit return keeps field 7. `wipeSecretHeapAfterHostCopy` is undefined.

**Tests:** the 7-to-0 cases are honest failing oracles, not substring-only. The host-cleanup test is an **absence oracle** (passes because the export is missing); it documents a gap, it does not prove cleanup. The 7-to-0 test fails before its post-exit memory asserts; the independent probe supplies those zeros. Tests import `dist/`; that matched this dirty tree.

**Proposed repair (capture operand, wipe, then return; skip wiping a heap-pointer result; host cleanup after copy): PLAUSIBLE, incomplete.**

- Capture-then-wipe is the right order for primitive i32; the current regex splice is the wrong layer (`emitZeroOnExit` already shows the local-capture pattern).
- Skipping wipe of a heap-pointer result avoids “destroyed and called success”, but **leaves remanence** in exported memory until a host cleanup/refusal exists. That pair is not optional.
- `return id(w.a)` must capture the **call result** after the load, then wipe.
- Do not invent a guest wipe of the pointed-to object and still return the pointer.

## Q2 — durable replay admission

**Author claim: CONFIRMED.**

Locator: `createApiServer` `index.ts` 554–562 denies only when `requireDurableReplay === true` **and** `isProcessLocalReplayStore(replayStore)` (`replay-store.ts` WeakSet, 25–52). No `isAdmittedDurableReplayStore`. No durable production backend.

Direct `MemoryReplayStore` and subclass refuse. Forwarding wrapper, bound method, Proxy, accessor, and forged `durable: true` **construct successfully**.

**Tests:** the seven failures are the right oracle for unknown-adapter admission. Gaps: the first case forges `MemoryReplayStore.prototype` onto an unused wrapper while constructing `memory`; “post-admission method replacement” never executes replacement if construction throws; “does not call claim” is not a durability proof (construct does not claim). Correctly does **not** fabricate a durable backend.

**Proposed repair (fail closed unless positively admitted durable; unknown adapters refuse; no fake backend): PLAUSIBLE as posture, not a completed fix.**

- Positive admit must not be a duck-typed `claim` or a forged brand field (already admitted).
- “Not in the process-local WeakSet” is the current bug, not an admit rule.
- An empty admit-list under `requireDurableReplay: true` is fail-closed and is what this tree can honestly ship today.
- Naming `isAdmittedDurableReplayStore` anywhere would silence the audit regex even if the denylist remains. Do not treat that instrument as the repair.

## Q3 — FIFO lstat-then-open

**Author claim: CONFIRMED** on this host via WSL. Windows-native live FIFO identity remains **NOT VERIFIABLE** (no `O_NONBLOCK`; Node here is `win32`).

Locators:

- `atomic-writer.ts` `read` 114–119: `lstatSync` → `refuseSnapshotSpecialFile` → `openSync(live, O_RDONLY)` (blocking).
- `atomic-writer.ts` `scrub` 147–159: same, then `openSync(live, O_WRONLY)` (blocking).
- `registry-generation-store.ts` `readBoundedRegularFile` 417–433: `lstat` `isFifo` then `fs.open(filePath, "r")` (blocking). Post-open `handle.stat()` does not call `isFifo`.

Live: `--require` preload unlinks+mkfifo after regular `lstat`; AtomicWriter read/scrub and registry children **SIGKILL at the 8s deadline** with `stderr=Q3_SWAPPED`. Direct FIFO present at `lstat` refuses `LSS-FIFO-001` without blocking. Valid-file and symlink controls passed (symlink was a real `LSS-LINK-001` on this Windows host).

**Tests:** deterministic interposition, not a sleep race; kill deadline is a real block oracle. Harness gap: symlink `catch { return }` can silent-pass if `symlinkSync` fails (did not fire this run). Registry child accepts a broad `fifo|FIFO|special file|not a bounded regular file` message, not `LSS-FIFO-001`. Windows without WSL `node`/`mkfifo` would skip TOCTOU as NOT VERIFIABLE.

**Proposed repair (open `O_NONBLOCK` then `fstat` `isFIFO` refuse): PLAUSIBLE on Linux, incomplete as specified.**

- FIFO type must be taken from the **opened fd**, not the pathname `lstat`.
- `scrub` is `O_WRONLY`: `O_WRONLY|O_NONBLOCK` on a FIFO with no reader is `ENXIO`, not a hang. Map that to refuse; do not treat it as absent (`ENOENT` no-op).
- A FIFO that already has a writer will not block even without `O_NONBLOCK`; `fstat` is still required.
- `fs.promises.open(path, "r")` cannot set `O_NONBLOCK`; numeric flags are required.
- Windows Node has no `fs.constants.O_NONBLOCK` here. A Linux-only flag must not disable the fd-type refuse.
- After swap, ino/dev will not match `lstat`; prefer FIFO refuse over “identity changed” so the tests’ `LSS-FIFO-001` oracle stays honest.
- Audit regex goes silent if `O_NONBLOCK` appears anywhere in the file, even beside a remaining blocking open.

## Audit instrument

Self-test 16/16 and corpus FINDING are consistent with the executable tests. The scanner is substring-only. Known vacuity: `isAdmittedDurableReplayStore` or any `O_NONBLOCK` token silences Q2/Q3; `Q1_CAPTURE_THEN_WIPE` is unused in `detect()`. Do not treat `--json --corpus-manifest` PASS as WASM/TOCTOU proof.

## Overall

**HOLD.** Q1, Q2, and Q3 remain open on this dirty candidate. The author’s tests are mostly hostile oracles of those gaps, not evidence the repairs landed. Do not claim the security fixes complete. No production admission, no clean-HEAD certification.
