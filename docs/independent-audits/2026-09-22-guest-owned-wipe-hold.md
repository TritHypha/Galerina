# Independent audit — guest-owned host-cleanup wipe range

**Verdict: PASS** (scoped to this continue). Filename keeps the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

Scope is the host-cleanup continue after
`docs/independent-audits/2026-09-22-nested-secret-ownership-hold.md`:

- `wat-emitter.ts` must not export mut `$__fungi_heap`; it must export
  `__fungi_heap_get` and `__fungi_wipe_owned`
- `wipeSecretHeapAfterHostCopy(instance)` must call `__fungi_wipe_owned` only
- `copyI32ThenWipeSecretHeap` must copy an i32 field then wipe

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested inner-wipes-caller was already CONFIRMED on the prior receipt
and was only re-checked as a non-regression (`outer(7)===14`).

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` on this host
and contains the same getter / `__fungi_wipe_owned` / copy-then-wipe logic.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `1215d1ece4080d16710a1dc9a5d59a899c2afff6316a98fb5bf91f77d1d192f6` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `a3b8716c957c49097aa1d20f48c32589a6d1721d91f036093465a08f23378566` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `5047e9306d286eeb1c18d59db4b629a922742380d73eec75168b10ef53cdd187` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `a4a3630d0d044667c8c63cea3e7790d0f6ff2f05a1646e21bf2d494773009f4b` |

`wat-emitter.ts` differs from the nested-ownership pin (`5677b228…`), the Q1
repair-revision pin (`e880c4fa…`), and the pre-repair frozen pin (`56f31f24…`).
Passing tests here are **not** production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="host cleanup|sentinel above|nested secret" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **3/3 pass**, `duration_ms 364.0555`. Host cleanup asserts `exports.__fungi_heap === undefined` and `copyI32ThenWipeSecretHeap` returns 7 then zeros the word. Sentinel `0x11111111` above heap survived. Nested `outer(7)===14`.
2. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **15/15 pass**, `duration_ms 418.2877`.

Independent extra probes (temp script under `%TEMP%\guest-owned-wipe-probe.mjs`, not production):

- Heap-pointer `h(7) -> Sec`: WAT line is `(global $__fungi_heap (mut i32) (i32.const 1024))` with **no** `(export "__fungi_heap"`. Exports are `__fungi_heap_get` (function), `__fungi_wipe_owned` (function), `h`, `memory`. `WebAssembly.Module.exports` lists **zero** globals.
- Write attempts against `instance.exports.__fungi_heap` (assign number, assign `WebAssembly.Global`, `defineProperty`) all throw `object is not extensible`. `__fungi_heap_get()` stayed **1028**.
- Honest `copyI32ThenWipeSecretHeap`: `{copied:7, field:0, sentinel:0x11111111, heap:1028}`.
- `wipeSecretHeapAfterHostCopy` with **no** prior copy: live field becomes 0; sentinel `0x22222222` still survives.
- `wipeSecretHeapAfterHostCopy(instance, false)` does **not** throw; field becomes 0. Extra args are ignored.
- Host `Uint8Array.fill` of exported memory from 1024 through the sentinel: field **and** sentinel become 0. Heap getter stays 1028.
- Nested `outer(7)===14`.
- `wipeSecretHeapAfterHostCopy.length === 1`. Function text has no `copied` protocol check. The identifier `copied` in `copyI32ThenWipeSecretHeap` is the loaded i32.

## Challenge 1 — can host still write `__fungi_heap`?

**No, not as an exported mutable global. CONFIRMED closed for this emitter.**

Locator: `wat-emitter.ts` 767–773. The bump pointer remains `(global $__fungi_heap (mut i32) …)` **inside** the module. The only heap-related exports are:

```text
(func $__fungi_heap_get (result i32) (global.get $__fungi_heap))
(export "__fungi_heap_get" (func $__fungi_heap_get))
(func $__fungi_wipe_owned …)
(export "__fungi_wipe_owned" (func $__fungi_wipe_owned))
```

`renderWAT` WAT exports on this path are `memory`, `__fungi_heap_get`,
`__fungi_wipe_owned`, and entry-point funcs. Independent probe: `globalExports=[]`,
`instance.exports.__fungi_heap === undefined`, host assignment cannot add the
name, getter stays 1028.

The inflate (`value = 1096`) and rebase (`value = 1024`) attacks from the
nested-ownership HOLD require an exported `WebAssembly.Global`. That export is
gone. Host can still mutate **memory** (exported) and can still move the bump
pointer only by calling guest code that does `global.set`. That is not a host
write of the global.

## Challenge 2 — can wipe past live heap?

**The guest wipe / host-cleanup helper cannot. A host can still fill exported memory past the bump pointer without this helper. CONFIRMED both; helper-widening is closed.**

Locator: `wat-emitter.ts` 770–771 (`__fungi_wipe_owned` fill is
`[WAT_HEAP_BASE, $__fungi_heap)` using the **unexported** global) and 679–685
(`wipeSecretHeapAfterHostCopy` calls that export only; no host-side
`view.fill` keyed off a writable global).

Honest path after `h(7)`: heap 1028, helper zeros the 4-byte field, sentinel
at heap+64 stays `0x11111111`. Because the host cannot raise the global, the
previous “set heap to 1096 then wipe, sentinel dies” sequence is **not**
available through this helper.

Host-direct `memory.fill` of the exported `memory` still zeros the sentinel.
That surface exists because the host must be able to **read** the field in
order to copy it. It is not the helper trusting a host-writable range. The
nested-ownership HOLD residual “inflate global, helper wipes past live data”
is closed. The residual “exported memory is writable” is not a fail of
guest-owned wipe range and cannot be closed while copy needs a memory export.

Rebase no-op of the helper is likewise closed for host writes: the host cannot
set the global back to 1024. A later **guest** leaf entry still rebases; that
is the B2 per-flow contract, not this helper.

## Challenge 3 — is the `copied` flag gone?

**Yes. CONFIRMED.**

Locator: `wat-emitter.ts` 679–707. `wipeSecretHeapAfterHostCopy(instance)` has
arity 1 and no `copied !== true` check. `copyI32ThenWipeSecretHeap` loads
`view[index]`, then calls the guest wipe, then returns that i32. The Q1 host
cleanup / sentinel tests call `copyI32ThenWipeSecretHeap`, not a boolean flag.

The previous protocol-flag hole (`copied: true` with no copy destroying the
live WASM field; `false` throwing) is gone as an API. Residuals, not a
surviving flag:

- `wipeSecretHeapAfterHostCopy` remains a no-copy primitive. Calling it
  without a prior load still zeros the live field (independent probe).
- `wipeSecretHeapAfterHostCopy(instance, false)` no longer throws; extra
  arguments are ignored.
- `copyI32ThenWipeSecretHeap` copies **one** aligned i32, then wipes the whole
  guest arena `[WAT_HEAP_BASE, heap)`. Multi-field records are outside this
  helper’s name.

## Lane status

| Claim | This continue | Label |
|---|---|---|
| mut `$__fungi_heap` is not exported | WAT has the mut global, no global export; `exports.__fungi_heap` undefined | **CONFIRMED** |
| `__fungi_heap_get` and `__fungi_wipe_owned` are exported | both present as functions | **CONFIRMED** |
| `wipeSecretHeapAfterHostCopy(instance)` calls `__fungi_wipe_owned` only | dist/src function text is that call | **CONFIRMED** |
| `copyI32ThenWipeSecretHeap` copies an i32 then wipes | returns 7, then field is 0 | **CONFIRMED** |
| Host cannot write `__fungi_heap` | assignment throws; getter stays 1028 | **CONFIRMED closed** |
| Helper cannot wipe past live heap | sentinel `0x11111111` survives honest copy-then-wipe | **CONFIRMED closed** for the helper |
| Host cannot wipe past live heap by any means | exported `memory.fill` still zeros the sentinel | **CONFIRMED residual**, not helper-range widening |
| `copied: true` protocol flag is gone | arity 1; `copied` is the loaded i32 | **CONFIRMED gone** |
| Nested `outer(7)` stays 14 | 14 on suite and probe | **CONFIRMED** non-regression |

## Deferred — do not claim closed

These remain open and were **not** started by this review:

- JSON-Decimal (RD-1289)
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend
- 124-finding Galerina scan
- host/import exception wipe (wasm-standalone still has zero `(import`)
- production host path actually invoking these helpers (none is wired)
- leaf-misclassification residual from the nested-ownership HOLD (PLAUSIBLE, not shown)
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**PASS** of this host-cleanup continue on the dirty candidate. The three
named challenges from the nested-ownership HOLD are closed **for the helper**:

1. Host cannot write `__fungi_heap` (challenge 1).
2. Guest-owned `__fungi_wipe_owned` does not wipe past the live bump pointer;
   the inflate/rebase helper attacks are gone (challenge 2, helper path).
3. The `copied: true` flag is gone; `copyI32ThenWipeSecretHeap` performs a
   real i32 load then guest wipe (challenge 3).

Do not treat 15/15 on this dirty candidate as clean-HEAD or production
clearance. Exported `memory` remains host-writable, and
`wipeSecretHeapAfterHostCopy` can still be invoked without a copy. Those are
labeled residuals, not a surviving writable heap global or protocol flag.
