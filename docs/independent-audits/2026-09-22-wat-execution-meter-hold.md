# Independent audit — `executeWASMFlow` work metering (loop fuel + worker deadline)

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `executeWASMFlow` in
`packages-ts/galerina-core-compiler/src/wat-assembler.ts` now enforces work
metering:

1. Loop fuel: `injectLoopFuel` inserts `$__fungi_fuel` and a loop-body tick
   that `unreachable`s at 0.
2. Worker deadline: instantiate+call run in `src/wasm-flow-worker.mjs`;
   parent `terminate()`s on deadline.
3. Non-positive deadline/fuel are refused without running the guest.

Same-thread `Promise.race` around instantiate-only was the defect. This is
**not** 124-scan closure (one ID: `csf_0a079c981e51180496dc447a`).
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission were
not started.

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wat-assembler.js` mtime is newer than `src/wat-assembler.ts` and
contains `injectLoopFuel` / `invokeWithDeadline`; it does **not** contain
`Promise.race` or `WebAssembly.instantiate`. `dist/wasm-flow-worker.mjs` is
absent; `resolveFlowWorkerFile` falls back to `src/wasm-flow-worker.mjs` on
this tree. This reviewer did not rebuild.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-assembler.ts` | `33d9f27a9e6fd6d1f433c67b5fdcf2b292bc9a8e3e8ba8bf361a31287b0f4454` |
| `packages-ts/galerina-core-compiler/src/wasm-flow-worker.mjs` | `f2242874ab318e697f9e260e2e150df1f97bae94fee9f7b0f67a07d4d70d14a7` |
| `packages-ts/galerina-core-compiler/tests/wat-execution-meter.test.mjs` | `c694de3ab17b4dee82e078234307c9a13394e0e21410ff20b895bac811ba01d8` |
| `packages-ts/galerina-core-compiler/dist/wat-assembler.js` | `d38df49458953bcee4b8b58d80728f3be97312fcf9cbb361000430d32a574503` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `e7bd055d665e1e84b41461eaed05a73f2a012c94cab408e52252963ae173a468` |

Author hashes **matched** this tree for `wat-assembler.ts`,
`wasm-flow-worker.mjs`, and `wat-execution-meter.test.mjs`. Dirty paths:
`M` `src/wat-assembler.ts`, `M` `src/index.ts`; untracked
`src/wasm-flow-worker.mjs` and `tests/wat-execution-meter.test.mjs`.
Passing tests here are **not** production admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Loop fuel tick + `unreachable` at 0 | source `wat-assembler.ts` 312–323; dist `wat-assembler.js` 242–252; executed meter test + independent `RuntimeError: unreachable` |
| instantiate+call in worker; parent `terminate()` on deadline | source 325–367 / worker `wasm-flow-worker.mjs`; independent skip-fuel deadline 419ms; hang probe `got: null` at 409ms then terminate |
| Non-positive deadline/fuel refuse without guest | source `admitPositiveBound` 304–309 / `executeWASMFlow` 380–387; independent wall 0ms, `execMs` 0, `binaryBytes` 0 |
| Infinite loop refuses in well under 1.5s | suite 58.3795ms; independent 52ms `unreachable` |
| `add(2,3)=5` | suite + independent result 5 |
| `sumTo` 55 / 5050 | phase-27 suite |
| Isolation 5/5 | `wat-assembler-isolation.test.mjs` (assembleWAT + direct instantiate; not `executeWASMFlow`) |
| Hostile: deadline 0 / fuel 0 refuse | suite + independent |
| Hostile: unmetered WAT still contains bare `(loop` | suite + independent `hasBare: true` |
| Recursive calls without `loop` | independent `RangeError: Maximum call stack size exceeded` at 34ms |
| Hardware / wasmtime metering | **NOT VERIFIABLE** |
| 124-finding scan | **not this claim** (inventory still `PARTIAL_THIS_TREE` for this ID) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-compiler/tests/wat-execution-meter.test.mjs packages-ts/galerina-core-compiler/tests/wat-phase27-wasm-execution.test.mjs packages-ts/galerina-core-compiler/tests/wat-assembler-isolation.test.mjs` → **27/27 pass**, `fail 0`, `duration_ms 923.1273`.
   - isolation: **5/5**.
   - meter: **6/6**. Infinite loop **58.3795ms** (assert `< 1500`). `add(2,3)=5`. Deadline 0 / fuel 0 refuse. Unmetered SPIN still matches `\(loop \$go \(br \$go\)`.
   - phase 27: **16/16** including `sumTo(10)=55` and `sumTo(100)=5050`.

Independent extra probes (temp script under `%TEMP%\galerina-wat-meter-probe.mjs`; not production):

- Unmetered SPIN: bare `(loop $go (br $go)` present; no `$__fungi_fuel`.
- `injectLoopFuel(SPIN, 8)`: global `(i32.const 8)`, `unreachable` tick, bare form gone.
- `deadlineMs: 0` → error `/deadline/`, `execMs` 0, `binaryBytes` 0, wall **0ms**.
- `maxLoopBackedges: 0` → error `/fuel/`, `execMs` 0, `binaryBytes` 0, wall **0ms**.
- Fuel 8 on SPIN → `RuntimeError: unreachable`, wall **52ms**, `execMs` 29.58.
- `add(2,3)` → **5**.
- WAT comment `;; skip-token $__fungi_fuel` leaves source unchanged (no fuel global). Same module with `deadlineMs: 400` → `WASM execution deadline exceeded` at **419ms**. Discriminates deadline from fuel; author suite ORs `/unreachable|deadline/i`.
- Recursion-only `(call $rec)` with fuel 8 → `RangeError: Maximum call stack size exceeded` at **34ms** (no `loop`; fuel not involved).
- Unmetered SPIN assembled faithfully (42 bytes), instantiated in a throwaway worker: parent waited **409ms**, `got: null`, then `terminate()`. Pre-patch hang class still exists **without** metering.

## Challenge 1 — does an infinite `(loop (br))` still hang the parent?

**No on this Node worker+fuel path. CONFIRMED closed for `executeWASMFlow`.**

Locators: `wat-assembler.ts` 312–323 (fuel rewrite), 332–367 (worker + `setTimeout` + `terminate`), `wasm-flow-worker.mjs` 4–14 (instantiate then call). Dist has no `Promise.race` / in-process `WebAssembly.instantiate`.

Fuel 8 traps `unreachable` in 52ms. The same unmetered binary in a raw worker did **not** return in 409ms until `terminate()`. That is the discriminating hang class, not a vacuous timeout around instantiate.

## Challenge 2 — can non-positive bounds run the guest?

**No. CONFIRMED.** `admitPositiveBound` returns before `injectLoopFuel` / `assembleWAT` / worker spawn. Independent wall 0ms and `binaryBytes` 0. Hostile suite tests passed (detector red on 0).

## Challenge 3 — does the worker deadline fire when fuel does not?

**Yes on the textual-skip fixture. CONFIRMED.** A `$__fungi_fuel` substring in a WAT comment skips injection (`unchanged: true`). `deadlineMs: 400` then returns `WASM execution deadline exceeded` at 419ms. Fuel-trap and deadline-terminate are distinct.

## Residuals (not findings against the named claim)

- Recursive calls without `loop` rely on stack overflow or worker deadline. Independent recursion hit JS `RangeError` at 34ms; it did **not** consume loop fuel.
- Fuel rewrite is textual. A comment containing `$__fungi_fuel` disables injection. Deadline still contained that case here.
- `dist/wasm-flow-worker.mjs` is missing; this tree uses `../src/wasm-flow-worker.mjs`. A missing worker would fail-closed on construct (`error` event), not hang the parent. Packaging copy is unproven off this tree.
- Hardware / wasmtime metering is **NOT VERIFIABLE** here.
- Isolation 5/5 exercises `assembleWAT` + same-thread instantiate, not the metered worker.
- 124-finding scan remains a separate open programme. Inventory disposition for `csf_0a079c981e51180496dc447a` is still `PARTIAL_THIS_TREE`.
  Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid: unmetered SPIN still has a bare `(loop`, deadline/fuel 0 refuse, and the hang probe still fails to return until `terminate()`. Evidence is sufficient for Node `worker_threads` + textual loop fuel on this dirty tree; insufficient for wasmtime/hardware and scan closure.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
