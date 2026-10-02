# Independent audit — Q1/Q2/Q3 repair revision

**Verdict: HOLD**

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet.

The three demonstrated reds from the earlier independent HOLDs
(`docs/independent-audits/2026-09-22-q123-three-security-boundaries-independent-hold.md`,
`docs/independent-audits/2026-09-22-q123-astra-style-challenge-hold.md`)
were re-run on this repaired tree. Passing tests here are **not** production
admission and **not** all-estate closure.

Node v24.18.0, npm 12.0.2, Windows 11 + WSL for live FIFO.
Tests import `dist/`. Those `dist/` files are newer than source on this host.

## Frozen hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `e880c4fad4d2d6ed00338a9986270a41ed53f7309619f36da2b5a9fc47a18654` |
| `packages-ts/galerina-framework-api-server/src/index.ts` | `009c7b0f0ee4be815d8e0a3e3e568f57afb6e1878f418ca8e90dcab51e9fc784` |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | `dbf3519f56e4ccb68428bb031b94d7a7dbc751de49925fb3211acc556af887a2` |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | `1f093d3e4ed2a207dcf0c61fa8a12c4018609de9e0e38394858b3a36e7c70dc8` |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | `fcdcfa5f0903b199e09d3a99b7caf535da3813c3c59cfd9d3f74a3d27a956842` |

These five hashes differ from the pre-repair HOLD (`56f31f24…` / `8649156f…` /
`43a84a55…` / `7555095d…` / `c1f83dbd…`). Q2 and Q3 match the current corpus
pin. Q1 `wat-emitter.ts` does **not**: corpus expects `fed2245b915e8b19d20820b5e3ffe2364ea06f261d9790a10cb0574d39a65c67`.

Untracked tests on this run:

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `cf8508da5fc11c2bbc6216c64bc0d333fa7c3c65264da1f0a3da27c5b5c076e2` |
| `packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs` | `0345f558b81597b4d4c46f05a34f5b46043cb28041ed0345ce60fbb9b7107ab4` |
| `packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs` | `c0e6875a3f158a204e3acdbdc13d27863b5e4e5509c2cf784662550e037ce261` |

## Command receipts

1. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **13/13 pass**, `duration_ms 449.5636`.
2. `node --test --test-timeout=60000 packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs` → **13/13 pass**, `duration_ms 428.9701`.
3. `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs` → **9/9 pass**, `duration_ms 18175.2814`. Read/scrub/registry/parent children finished with `signal=null` (no SIGKILL). Windows `O_NONBLOCK` absence test passed as NOT VERIFIABLE documentation.
4. `node scripts/audit-three-security-boundaries.mjs --self-test` → **OK (18 fixtures)**, exit 0.
5. `node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest docs/reports/security-three-boundaries-corpus-2026-09-22.json` → **REFUSED**, exit 2, `digest-mismatch` on `wat-emitter.ts` (`expected=fed2245b…`, `actual=e880c4fa…`).

Independent extra probes (temp scripts under `%TEMP%`, not production):

- Mixed-body secret `g(7)` / `g(11)`: `{got7:7, words7:[0,0,0], heap7:1036}` and `{got11:1, words11:[0,0,0], heap11:1036}`. WAT has both `G5c capture-then-wipe` and `$__fungi_xl`.
- Early heap `g(7)`: `{got:7, words:[0,0,0]}`. Operand is captured into `$__fungi_g5c_ret` **before** `memory.fill`.
- `wipeSecretHeapAfterHostCopy` honest path: `{ptr:1024, field:7, heapAfter:1028, fillLen:4, fieldAfterWipe:0}`.
- `wipeSecretHeapAfterHostCopy` after forcing `__fungi_heap.value = 1024`: `{fieldAfterNoOp:7}` — **the helper is a no-op**.
- Q2: MemoryReplayStore, forwarding wrapper, Proxy, bound method, forged brand, and subclass all **refused**. `isAdmittedDurableReplayStore` is false for all of them. `requireDurableReplay` without a webhook **constructs**.
- Q3 independent WSL read-child: `{status:0, signal:null, stdout:"CODE LSS-FIFO-001", stderr:"Q3_SWAPPED"}`.

## Challenge 1 — can `wipeSecretHeapAfterHostCopy` be a no-op?

**Yes. CONFIRMED.**

Locator: `wat-emitter.ts` 679–701. The helper fills `[WAT_HEAP_BASE, min(memory.length, __fungi_heap))`. It does **not** bind the returned object’s range. After `h(7) -> Sec`, the bump pointer is 1028 and an honest call zeros the field. If the host (or a later leaf reset) sets `__fungi_heap` back to 1024 before the call, `view.fill(0, 1024, 1024)` is empty and the secret word stays **7**.

The Q1 host-cleanup test calls the helper immediately after `h(7)` and asserts `memory[ptr/4] === 0`. That oracle is real for the honest sequence. It does **not** cover:

- heap rebase before wipe (independent probe: field stays 7);
- `copied: true` as a protocol flag with no copy (independent probe: live field is destroyed);
- any production host path actually invoking the helper (none is wired; wasm-standalone has zero `(import`);
- host/import exception wipe (**NOT VERIFIABLE** on this fixture).

Heap-pointer results still skip G5c and skip `emitZeroOnExit`. After `h(7)` the field is 7 in exported memory until a host calls this helper. That remanence window remains.

A complete no-op export (`function wipeSecretHeapAfterHostCopy() {}`) would fail the current test. The landed helper is not vacuous on the happy path. It **can still be a no-op** without changing the test. That is a HOLD residual, not a PASS of host cleanup.

## Challenge 2 — does mixed-body actually zero?

**Yes, for the tested shape. CONFIRMED.**

Locator: `wat-emitter.ts` 862–868. `emitZeroOnExit` is now `!tailIsFunctionReturn` rather than `!bodyHasEarlyReturn`. The mixed-body program

```
{ let w: Wide = Wide { a: s, b: s, c: s } if s > 10 { return 1 } return w.a }
```

lowers `return w.a` as a fall-through `i32.load` (not a WAT `(return`). The capture block then `$__fungi_xl` fill zeros `[1024, heap)`. The early `return 1` is G5c capture-then-wipe and returns from the function, skipping the exit fill — G5c already filled. Independent WAT + memory: `g(7)===7` with words `0,0,0`; `g(11)===1` with words `0,0,0`.

The suite’s substring `G5c capture-then-wipe || $__fungi_xl` is still not an oracle by itself; this revision’s mixed-body test **also** reads the three arena words. Those zeros are the oracle.

Coverage gap, not a remanence hole in the tested program: a last expression `w.a` **without** the `return` keyword lowers to `(unreachable) ;; unsupported-in-WASM: block` and traps. Nested/multi-return tests still do not read memory; this probe’s early-heap and mixed-body dumps do.

## Challenge 3 — do wrappers still refuse?

**Yes. CONFIRMED.** Unknown adapters refuse.

Locator: `createApiServer` `index.ts` 559–567 fails closed unless `isAdmittedDurableReplayStore(opts.webhook.replayStore)`. `replay-store.ts` 26–39: `ADMITTED_DURABLE_REPLAY_STORES` is a module-private WeakSet with **no `.add`**. Independent construct of forwarding wrapper, Proxy, bound method, accessor-equivalent forged brand, subclass, and direct `MemoryReplayStore` all throw `production durable replay is outstanding`. `isAdmittedDurableReplayStore` is false for each.

Residual, not a wrapper hole:

- `requireDurableReplay: true` with **no webhook** still constructs (suite now documents this as “no replay store is in use”). Previous independent challenge treated that as incomplete.
- There is still **no** admitted durable production backend. Do not fabricate one. RD-1286 remains deferred. Fail-closed empty admit-list is what this tree can honestly ship.
- Naming `isAdmittedDurableReplayStore` silences the substring scanner even if the body were inverted; executable wrapper tests are the oracle, and they refuse.

## Challenge 4 — does TOCTOU still complete without SIGKILL?

**Yes on WSL. CONFIRMED.** Not verifiable as a Windows-native FIFO open.

Locators: `atomic-writer.ts` `openFlags` / `openSnapshotFd` (50–66) open `O_RDONLY|O_NONBLOCK` or `O_WRONLY|O_NONBLOCK` (flag omitted when not a number), `fstat` the handle, `refuseSnapshotSpecialFile` on `isFIFO`, map `ENXIO`/`EAGAIN`/`EWOULDBLOCK` to `LSS-FIFO-001`. `registry-generation-store.ts` `readBoundedRegularFile` 435–450 uses numeric `O_RDONLY|O_NONBLOCK` from `loadRegistryGenerationHostFloor` (`host-floor.ts` 143–146), then `handle.stat()` `isFifo`.

Official suite: read 6753 ms, scrub 1636 ms, registry 2440 ms, parent 3175 ms — all `signal=null`, status 0. Independent WSL read-child: `status=0`, `signal=null`, `CODE LSS-FIFO-001`, stderr `Q3_SWAPPED`. Direct FIFO at lstat still `LSS-FIFO-001`.

Residuals:

- Native Windows Node has no `fs.constants.O_NONBLOCK` (suite asserts this and returns). `nonblock=0` leaves a blocking open. Live FIFO on this host remains WSL `/tmp` only. DrvFs cannot host FIFOs. Windows-native FIFO open is **NOT VERIFIABLE**.
- Registry refuse is `TypeError("registry generation is not a bounded regular file")`, not `LSS-FIFO-001`. The registry child greens on `/fifo|FIFO|special file|not a bounded regular file/i`. Hang is gone; the diagnostic is weaker.
- Sibling-after-swap still does not require `signal===null` or `LSS-FIFO-001`. It is not a refuse oracle. The dedicated TOCTOU tests are.
- FIFO with a live writer does not block on `O_RDONLY` even without `O_NONBLOCK`. Tests never open a writer. `fstat`/`isFIFO` on the opened fd is still the required check; it is present.
- Corpus Q3 files match this tree; the scanner still REFUSED this revision because Q1 `wat-emitter.ts` drifted after the pin.

## Lane status vs the original reds

| Original red | This revision | Label |
|---|---|---|
| Q1 secret early `g(7)===0` (wipe-before-operand) | `g(7)===7` and arena words 0 via capture-then-wipe | **CONFIRMED repaired** for primitive i32 early returns |
| Q1 mixed-body remanence | mixed-body zeros both `g(7)` and `g(11)` | **CONFIRMED repaired** for the explicit `return w.a` shape |
| Q1 host cleanup absent | helper exists; honest path zeros; **can be a no-op** if heap is at base; not auto-invoked | **HOLD** |
| Q2 wrappers admitted under `requireDurableReplay` | wrappers/proxy/bound/forged/subclass refuse; empty admit-list | **CONFIRMED repaired** (fail-closed; no durable backend) |
| Q3 FIFO swap SIGKILL | WSL children exit 0 with `LSS-FIFO-001`, `signal=null` | **CONFIRMED repaired** on WSL; Windows-native **NOT VERIFIABLE** |

## Deferred — do not claim closed

These remain open and are **not** closed by this revision:

- JSON-Decimal
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend (admit-list stays empty)
- 124-finding Galerina scan
- host/import exception wipe (wasm-standalone, zero imports)
- Windows-native FIFO open
- corpus rebind of `wat-emitter.ts` (`fed2245b…` vs `e880c4fa…`)
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE**.

## Overall

**HOLD.** The three demonstrated executable reds (Q1 7-to-0, Q2 wrapper admission, Q3 SIGKILL) are repaired on this dirty candidate and were re-confirmed by independent probes, not only by the suite going green. That is not a PASS of the revision:

1. `wipeSecretHeapAfterHostCopy` can be a no-op (challenge 1).
2. Host-exception wipe and Windows-native FIFO remain NOT VERIFIABLE.
3. Corpus digest is unbound on the Q1 source.
4. RD-1286, JSON-Decimal, OAuth, and the 124-finding scan remain deferred.
5. This is a dirty HEAD, not clean-HEAD evidence.

Do not claim the security fixes complete. Do not claim all-estate TODOs closed. No production admission. No commit.
