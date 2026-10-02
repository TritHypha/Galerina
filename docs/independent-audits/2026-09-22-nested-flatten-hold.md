# Independent audit — nested heap flatten + `admitAndInstantiate` export wrap

**Verdict: HOLD**

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

This file reviews the continue after
`docs/independent-audits/2026-09-22-full-record-copy-hold.md`, which left two
residuals:

1. Nested `Outer { inner: Inner }` copied one i32 handle (**1028**) then wiped
   the inner payload (dangling pointer, not `[7,99]`).
2. `admitAndInstantiate` returned a raw instance; `exports.h(7)` skip-copied
   pointer **1024**.

Named claims on this continue:

- Nested heap records are flattened in guest WAT before host copy.
  `Outer { inner: Sec, n: Int }` must copy **`[7,99]`**, not `[ptr,99]`.
- `admitAndInstantiate` wraps `instance.exports` so function calls run
  `finalizeSecretExportResult`. Skip-copy via raw `exports.h(7)` must return
  **7**.

Named challenges: Proxy bypass (`Object.getOwnPropertyDescriptor`), cycles in
nested records, double-finalize.

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested `outer(7)===14` was only re-checked as non-regression.

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` and contains
`flattenPlanFor` / `flattenFromHeapRet`. `dist/wasm-runtime.js` mtime is newer
than `src/wasm-runtime.ts` and contains `wrapAdmittedExports` (Proxy `get`
only; no `getOwnPropertyDescriptor` trap).

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `09941fab2b38e53db7d439a3d43cd9be96d7e1f843431da7b53e4f24423dab2a` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `08dd0488e1c400de36897e93237eb4e0c2e5fc0c5cf851533c628dfc2515950d` |
| `packages-ts/galerina-core-runtime-wasm/src/seam-adapters.ts` | `48a933aaec6f2fcd4780f2c7d7fdcdfd6c0febeaf8dd1eca790f05a15b83ea75` |
| `packages-ts/galerina-core-runtime-wasm/dist/seam-adapters.js` | `0b3a3f3e2c4556937c83f1387e3db410e95ceeb3557f9bd08756bfb9a5a21b73` |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | `ac717c891982f4f19be69a34257ea3c37ca751c5613d9ce5244b91a1dd846acc` |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | `e1d1f81137dd402b6b4874f9d4807bfe7ad1dad51c770d770b938b30bb22997c` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `1d022aa96f0b4e0e17804961f33724681b3016e1445b08bf96276336e7e113b9` |
| `packages-ts/galerina-core-compiler/dist/index.js` | `ee263c482991a71e48a07c2ac4c7a4acc46f33bd1aae5ec16ca4020283003523` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `ae3e558216f138c1abecce8c2ae0dddbb0cebfe1a39ce95657538ff189e273df` |
| `packages-ts/galerina-core-compiler/tests/helpers/wasm-invoke-worker.mjs` | `2b1342a04c531b74c1af560362d749157f5f355f3d79c00b0bed1fc7e3d073ec` |
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `03600305f76da54478a74a2c9e48a9d69c31325544396568440b8dfc46c7d68e` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `8c679a92163f9c83b8cf2cae5761e9dc78f544b25ee68db90b228f65be301551` |

`wasm-runtime.ts` differs from the full-record-copy pin (`e24905a8…`).
`wat-emitter.ts` differs (`ddf88017…`). The Q1 test file is untracked and
differs (`507d34fe…`). `seam-adapters.ts` and `wasm-invoke-worker.mjs` do
**not** (`48a933aa…` / `2b1342a0…`). Passing tests here are **not**
production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="flattens nested|admitAndInstantiate" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **2/2 pass**, `duration_ms 356.0215`.
   - leaf nested `Outer { inner: Sec { a: s }, n: 99 }` asserts `r.result` deep-equals `[7, 99]`.
   - `admitAndInstantiate` then `invokeAdmittedExport(instance, "h", [7])` asserts `7`; `instance.exports.h(7)` asserts `7`.
2. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **24/24 pass**, `duration_ms 493.4426` (file grew by the flatten + admit-wrap cases; nested `outer(7)===14` still holds).
3. `node --test --test-timeout=30000 packages-ts/galerina-core-runtime-wasm/tests/seam-adapters.test.mjs` → **20/20 pass**, `duration_ms 159.7469`. Low-level `add` and governed e2e still **42**.
4. `node --test --test-timeout=60000 packages-ts/galerina-core-compiler/tests/wasm-admission-gate.test.mjs` → **10/10 pass**, `duration_ms 400.0424`. Signed `numStr(42)` still interned `"42"` through the wrapped `exports` getter.

Independent extra probes (temp scripts `%TEMP%\nested-flatten-probe.mjs` and
`…-probe2.mjs` / `…-wat.mjs`, not production):

- Named `Outer { inner: Sec { a: 7 }, n: 99 }`: WAT has `$__fungi_flat` /
  `$__fungi_n0`, `i32.const 2` words. Direct WASM returns flattened ptr
  **1036** with live words **`[7,99]`**. Production frozen **`[7,99]`**.
- Extra alloc after nested Outer: production still **`[7,99]`**.
- Three-level `Outer { mid: Mid { inner: Sec, x: 8 }, n: 99 }`: **`[7,8,99]`**.
- Diamond `Outer { x: Inner, y: Inner }`: **`[7,8,9,10]`**.
- Early `if s <= 10 { return Outer {…} }`: `h(7)→[7,99]`, `h(11)→[1,2]`.
- Recursive `record Node { child: Node, n: Int }`: compiles; **no**
  `$__fungi_flat`; wordsGet **2**; production **`[1032,7]`**. Live arena
  `[1032,7,0,1,…]`. After wrap, those words are **0**. Host keeps dangling
  **1032**.
- Mutual `A { b: B, n: Int }` / `B { a: A, n: Int }` with `B { n: 3 }` only:
  production **`[0,3,7]`** (null `a` pointer inlined as word 0).
- `Node { n: s }` without child: **`[7,0]`**.
- `admitAndInstantiate` `exports.h(7)` **7**; `invokeAdmittedExport` on the
  same proxy also **7** (double-finalize of a value `< 1024`).
- Extra Cell then `Sec { a: 1024 }`: raw ptr **1028**, field **1024**. Wrap
  once **1024**. `invokeAdmittedExport` on the wrapped instance **0**.
  `finalizeSecretExportResult(proxy, proxy.exports.h(1024))` **0**.
  Production raw-instance executor **1024**.
- Last-allocated `Sec { a: 1024 }`: wrap once **1024**; invoke-on-wrapped
  **0**; production **1024**.
- `Object.getOwnPropertyDescriptor(proxy, "exports")` is **undefined**
  (`exports` is a prototype getter, not own). Calling that getter with the
  Proxy as receiver throws `Receiver is not a WebAssembly.Instance`.
  `Reflect.get` / `instance.exports.h(7)` stay **7**. `Reflect.ownKeys` is
  `[]`. `instance instanceof WebAssembly.Instance` is true.
- Helper exports are not wrapped. After wrapped `h(7)`, word @1024 is **0**.
- Non-secret nested Outer (no `privacy`): production **1024** (pointer;
  getter stays 0).

## Challenge 1 — Proxy bypass via `Object.getOwnPropertyDescriptor`?

**No on Node v24.18.0 `WebAssembly.Instance`. CONFIRMED closed for that
layout. The trap set is still get-only.**

Locator: `wasm-runtime.ts` 820–836 / dist 689–706.

```text
return new Proxy(instance, {
  get(target, prop, receiver) {
    if (prop === "exports") return wrappedExports;
    return Reflect.get(target, prop, receiver);
  },
})
```

There is no `getOwnPropertyDescriptor` / `ownKeys` / `has` trap. On this
engine that does not leak raw exports:

- `exports` is a **prototype accessor**, not an own data property.
  `Object.getOwnPropertyDescriptor(instance, "exports")` is `undefined` on
  both the raw Instance and the Proxy.
- `Object.getOwnPropertyDescriptor(WebAssembly.Instance.prototype, "exports").get.call(proxy)`
  throws `Receiver is not a WebAssembly.Instance` (brand check). It does not
  return the target’s raw export object.
- `Reflect.get(proxy, "exports")` hits the `get` trap and returns the
  wrapped table. Named `exports.h(7)` is **7**.

So the named `getOwnPropertyDescriptor` skip-copy is **REFUTED** on this
host. Residual, not shown: an engine that stored `exports` as an own data
property would forward `[[GetOwnProperty]]` to the raw Instance. The wrap
does not defend that layout.

## Challenge 2 — cycles in nested records?

**Yes. CONFIRMED: type-recursive records are not flattened. Host copies the
inner pointer, then wipe destroys the child.**

Locator: `wat-emitter.ts` 412–425.

```text
if (seen.has(typeName)) return undefined;
…
const nested = flattenPlanFor(field.type, layouts, new Set(seen));
steps.push(nested !== undefined ? { srcOffset, nested } : { srcOffset });
```

A cyclic field becomes a leaf i32 (the pointer). `flattenFromHeapRet` then
takes the no-nested path (`planHasNested` false): set words, return the
original record pointer. Honest compiler:

```text
record Node { child: Node, n: Int }
{ return Node { child: Node { n: 1 }, n: 7 } }
```

assembles. WAT has **no** `$__fungi_flat`. wordsGet **2**. Production
**`[1032,7]`**. Live child payload is at 1032 (`n=1` at 1036). After wrap /
production finalize the arena is zero; the host array still holds **1032**.
That is the prior nested-under-copy HOLD, now on recursive records.

Acyclic nesting is flattened (named Outer, three-level, diamond). Sharing
two `Inner` fields duplicates payload; it does not hang. Heap-identity
cycles (`a.b.a = a`) were **NOT VERIFIABLE** as honest programs (no field
mutation). Type-level recursion is enough.

## Challenge 3 — double-finalize?

**Yes. CONFIRMED: wrap + `invokeAdmittedExport` zeros a single-word secret
`>= 1024` that is 4-aligned.**

Locator: `wrapAdmittedExports` already calls `finalizeSecretExportResult`
(`wasm-runtime.ts` 824–825). `invokeAdmittedExport` 896–898 always calls it
again on the export’s return value. `wasm-invoke-worker.mjs` 11–18 (hash
unchanged) does `admitAndInstantiate` then `invokeAdmittedExport`.

First finalize copies the payload and wipes. Guest `$__fungi_ret_is_heap`
stays **1**. If the copied ABI is a number `>= WAT_HEAP_BASE` and 4-aligned,
the second finalize treats that number as a pointer into **already-wiped**
memory and returns **0**.

| path | `Sec { a: 1024 }` after extra Cell (raw ptr 1028) |
|---|---|
| wrap once (`exports.h(1024)`) | **1024** |
| `invokeAdmittedExport` on the proxy | **0** |
| wrap then `finalizeSecretExportResult` | **0** |
| `createLowLevelWasmExecutor` (raw Instance + one invoke) | **1024** |

`Sec { a: 7 }` survives because 7 `< 1024`, so the second pass wipes again
and returns the number. Frozen arrays (`[7,99]`) also survive the second
pass (`typeof result !== "number"`). The Q1 admit test uses **7** on both
`invokeAdmittedExport` and `exports.h`; it cannot see this hole.
`createLowLevelWasmExecutor` still instantiates a **raw** Instance
(`seam-adapters.ts` 138–150, hash unchanged), so the production executor
named in the flatten test is not the double-finalize path. The worker /
admit+invoke composition is.

## Named wiring (acyclic flatten / wrap-once skip-copy)

**CONFIRMED for those shapes.**

Guest flatten (`wat-emitter.ts` 454–481, 1077–1099, `rewriteHeapReturnTag`
782–816): when `flattenPlan` has nested record steps, allocate `$__fungi_flat`
at the live bump pointer, `i32.load` the inner handle, store inner fields
then outer scalars, set `$__fungi_ret_words` to the flattened count, return
the flat pointer. Host copy is still `__fungi_ret_words_get` words from that
pointer.

Named Outer WAT:

```text
(local.set $__fungi_n0 (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 0))))
(i32.store (i32.add (local.get $__fungi_flat) (i32.const 0)) (i32.load (i32.add (local.get $__fungi_n0) (i32.const 0))))
(i32.store (i32.add (local.get $__fungi_flat) (i32.const 4)) (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 4))))
(global.set $__fungi_ret_words (i32.const 2))
(local.get $__fungi_flat)
```

Prior HOLD production **1028** is gone on that acyclic shape. Wrap-once
`exports.h(7)` is **7**; helpers are not wrapped; post-call word @1024 is 0.

## Lane status

| Claim | This continue | Label |
|---|---|---|
| Guest WAT flattens acyclic `Outer { inner: Sec, n: Int }` to `[7,99]` | WAT `$__fungi_flat`; production `[7,99]` | **CONFIRMED** |
| Nested copy is still `[ptr,99]` | named production `[7,99]`; extra-after still `[7,99]` | **REFUTED** for acyclic |
| Three-level / diamond flatten | `[7,8,99]` / `[7,8,9,10]` | **CONFIRMED** |
| Early nested `(return` also flattens | `h(7)→[7,99]`, `h(11)→[1,2]` | **CONFIRMED** |
| Recursive `Node { child: Node }` flattens | no `$__fungi_flat`; production `[1032,7]`; arena then 0 | **REFUTED** |
| `admitAndInstantiate` wraps `exports` through finalize | `wrapAdmittedExports`; `exports.h(7)===7` | **CONFIRMED** wrap-once |
| Skip-copy via `Object.getOwnPropertyDescriptor` | own desc undefined; proto getter brand-check throws | **REFUTED** on Node 24 |
| Wrap trap set covers descriptor / ownKeys | only `get` | **CONFIRMED residual** (not shown as a leak here) |
| `invokeAdmittedExport` on a wrapped instance is safe | `h(1024)→0` | **REFUTED** |
| `createLowLevelWasmExecutor` double-finalizes | raw Instance + one invoke; `h(1024)→1024` | **REFUTED** (not that path) |
| `wasm-invoke-worker` is wrap+invoke | still admit then invoke; hash unchanged | **CONFIRMED** double-finalize composition |
| Helpers are not wrapped; wipe still runs | names include wipe/getters; fieldAfter 0 | **CONFIRMED** |
| Modules without wipe still return 42 for `add` | 20/20 | **CONFIRMED** |
| Admission `numStr(42)` still `"42"` | 10/10 | **CONFIRMED** |
| Nested `outer(7)` stays 14 | Q1 24/24 | **CONFIRMED** non-regression |
| Non-secret nested records are flattened | production **1024** | **CONFIRMED residual** |
| JSDoc still says copy `[ptr, $__fungi_heap)` | wasm-runtime.ts 843 | **CONFIRMED leftover comment** |
| Q1 admit test proves no double-finalize | uses `h(7)` only | **CONFIRMED missing** as a 1024 oracle |

## Deferred — do not claim closed

These remain open and were **not** started by this review:

- JSON-Decimal (RD-1289)
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend
- 124-finding Galerina scan
- host/import exception wipe (wasm-standalone still has zero `(import`)
- trap-path wipe (`invokeAdmittedExport` catch still skips finalize)
- exported `memory` remains host-writable
- fail-closed refuse when tagged words exceed 64
- i64/f64 fields presented as i32 word arrays
- non-secret heap-pointer results through the production executor
- type-recursive nested flatten (this continue’s cycle hole)
- wrap + `invokeAdmittedExport` composition (`wasm-invoke-worker`)
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**HOLD** of this nested-flatten + admit-wrap continue on the dirty candidate.

The named acyclic wiring happened: guest WAT inlines `Outer.inner` before
the host copy, so production is **`[7,99]`** not `[ptr,99]`; three-level and
diamond match; early nested returns flatten; `admitAndInstantiate`’s
`exports.h(7)` is **7** (wrap-once); `Object.getOwnPropertyDescriptor` does
not skip-copy on Node 24; `add` is still 42; admission `numStr` is still
`"42"`. That closes the prior HOLD’s **acyclic nested handle** and
**get-path skip-copy**.

It is not a PASS of the continue:

1. Type-recursive `Node { child: Node, n: Int }` is an honest compiler
   program. Flatten refuses the cyclic field and copies **`[1032,7]`**.
   Wipe then destroys the child. Same dangling-pointer class as the prior
   nested HOLD.
2. `wrapAdmittedExports` plus `invokeAdmittedExport` double-finalizes.
   Wrapped `h(1024)` is **1024**; the worker/admit test helper then returns
   **0**. The Q1 admit case uses **7**, so 2/2 is green. The production
   executor avoids this only because it still instantiates a raw Instance.

Do not treat 2/2, 24/24, 20/20, and 10/10 on this dirty candidate as
clean-HEAD or production clearance. Do not treat `exports.h(7)===7` as proof
that admit+invoke is copy-then-wipe-once for every secret payload.
