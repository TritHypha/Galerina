# Independent audit — cyclic / recursive record flatten (`MAX_FLATTEN_DEPTH` 8)

**Verdict: PASS** (scoped to “production copy of secret `Node { child: Node, n: Int }`
must not contain a live heap pointer `>= 1024`”). Filename keeps the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

This file reviews the continue after
`docs/independent-audits/2026-09-22-nested-flatten-hold.md`, which HOLDed
because type-recursive `Node { child: Node }` skipped flatten (`seen` cycle
cut) and the production copy was **`[1032,7]`** (dangling child pointer after
wipe).

Named claim on this continue:

- Recursive record types flatten with `MAX_FLATTEN_DEPTH = 8`. At the bound a
  nested record field is stored as `i32.const 0`, not a live pointer.

Named challenge: does the production copy of `record Node { child: Node, n: Int }`
contain a heap pointer (`>= 1024`)? Self-referential `let leaf = Node { child: leaf }`
may trap; the suite uses a finite tree of the cyclic type.

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested `outer(7)===14` and acyclic `Outer { inner: Sec, n: 99 }` were
only re-checked as non-regression.

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` and contains
`MAX_FLATTEN_DEPTH = 8`, `{ zero: true }` at the bound, and the
`(i32.store … (i32.const 0))` store. `dist/wasm-runtime.js` mtime is newer
than `src/wasm-runtime.ts` (RAW-instance map for `invokeAdmittedExport`; not
the named subject of this continue).

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `86bee8d24cca6e28c7df3e72ed61425199f0db34207f0802379156002818bcf7` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `7dc79a1fbb59ab4d50209cf8c6a3603ac694b21370bc22ff6f118a3778c8c35a` |
| `packages-ts/galerina-core-runtime-wasm/src/seam-adapters.ts` | `48a933aaec6f2fcd4780f2c7d7fdcdfd6c0febeaf8dd1eca790f05a15b83ea75` |
| `packages-ts/galerina-core-runtime-wasm/dist/seam-adapters.js` | `0b3a3f3e2c4556937c83f1387e3db410e95ceeb3557f9bd08756bfb9a5a21b73` |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | `ac717c891982f4f19be69a34257ea3c37ca751c5613d9ce5244b91a1dd846acc` |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | `e1d1f81137dd402b6b4874f9d4807bfe7ad1dad51c770d770b938b30bb22997c` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `1d022aa96f0b4e0e17804961f33724681b3016e1445b08bf96276336e7e113b9` |
| `packages-ts/galerina-core-compiler/dist/index.js` | `ee263c482991a71e48a07c2ac4c7a4acc46f33bd1aae5ec16ca4020283003523` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `8a6f700edbaf455fd4aed794b3331f1d8c2fdebc95047cf94c02bd94e3e6a3f9` |
| `packages-ts/galerina-core-compiler/tests/helpers/wasm-invoke-worker.mjs` | `2b1342a04c531b74c1af560362d749157f5f355f3d79c00b0bed1fc7e3d073ec` |
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `cd386f9a46b14d354041cf0f6b7332f443329a609ff148c6a4ece8ea65ff8572` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `a751c9b144e1182dc63d3d954b9348647bcd65dfd474d21ff5a934f483bf84ee` |

`wat-emitter.ts` differs from the nested-flatten HOLD pin (`03600305…`).
The Q1 test file is untracked and differs (`ae3e5582…`). `wasm-runtime.ts`
also differs (`09941fab…`) for the RAW-instance invoke path; that is not
re-adjudicated here except as non-regression (`h(1024)===1024` still in the
admit case). `seam-adapters.ts` and `wasm-invoke-worker.mjs` do **not**
(`48a933aa…` / `2b1342a0…`). Passing tests here are **not** production
admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="cyclic nested|flattens nested" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **2/2 pass**, `duration_ms 359.478`.
   - leaf `Node { child: Node { n: 1 }, n: s }` asserts every copied word is a
     number `< 1024` and the last word is `7`.
   - acyclic `Outer { inner: Sec { a: s }, n: 99 }` still deep-equals `[7, 99]`.
2. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **25/25 pass**, `duration_ms 481.0136` (file grew by the cyclic-pointer case; nested `outer(7)===14` still holds; admit `h(1024)===1024` still holds).

Independent extra probes (temp scripts `%TEMP%\cyclic-flatten-probe.mjs`,
`…-probe2.mjs`, `…-wat.mjs`, not production):

- Named suite tree `Node { child: Node { n: 1 }, n: 7 }`: WAT has
  `$__fungi_flat`, temps `$__fungi_n0`…`$__fungi_n7`, **one** bound store
  `(i32.store (i32.add (local.get $__fungi_flat) (i32.const 0)) (i32.const 0))`,
  `i32.const 10` words. Direct WASM returns flattened ptr **1040** with live
  words **`[0,0,0,0,0,0,0,0,1,7]`**. Production frozen **`[0,0,0,0,0,0,0,0,1,7]`**.
  Words `>= 1024`: **none**. Original arena at 1024 still shows child handle
  **1032** until host wipe; that handle is **not** in the copied word list.
- `Node { n: 7 }` (omitted child): production **`[0,0,0,0,0,0,0,0,0,7]`**. No
  heap pointer.
- Three-level finite tree `n=3,2,7`: production **`[0,0,0,0,0,0,0,3,2,7]`**.
- Depth-8 chain `n=1…8`: production **`[0,0,1,2,3,4,5,6,7,8]`**. No heap pointer.
- Depth-9 chain `n=1…9`: production **`[0,1,2,3,4,5,6,7,8,9]`**. Bound child is
  `0`; leaf `n=1` is still present.
- Depth-10 chain `n=1…10` with root `n=s=7`: production **`[0,2,3,4,5,6,7,8,9,7]`**.
  Deepest `n=1` is dropped. Bound word is still **`0`**, not a live child
  pointer.
- Mutual `A { b: B, n: Int }` / `B { a: A, n: Int }` with `B { n: 3 }` only:
  production **`[0,0,0,0,0,0,0,0,3,7]`**. Prior nested-flatten HOLD for this
  shape was **`[0,3,7]`** (null `a` inlined as a word). No heap pointer now.
- `n=1024` as an honest Int field: production **`[0,0,0,0,0,0,0,0,1,1024]`**.
  The `>= 1024` word is the **scalar `n`**, not a child handle. The Q1 cyclic
  oracle `word < HEAP_BASE` would reject this honest payload; the suite uses
  `n=7` / `n=1`.
- Self-referential `let leaf: Node = Node { child: leaf, n: 1 }`: compiles
  with flatten (`$__fungi_flat`, words 10) and **traps** `unreachable` on both
  raw `h` and the production executor (`ok: false`). Untyped `let leaf = …`
  same. No host copy.
- Non-secret cyclic Node (no `privacy`): **no** `$__fungi_flat`;
  `__fungi_ret_is_heap_get === 0`; production **1024** (the record pointer as
  a number). Same residual as the nested-flatten HOLD’s non-secret Outer.
- Host-poison of addresses `0`/`4` on a **raw** instance of `Node { n: 7 }`
  before `h`: flattened live words included **4096** (null-child chase through
  low memory). A fresh production `instantiateAndCall` (unpoisoned memory)
  stayed **`[0,0,0,0,0,0,0,0,0,7]`**. Exported `memory` remains host-writable.
- Acyclic Outer non-regression: production **`[7,99]`**; no bound zero-store.

## Challenge — production copy of secret `Node { child: Node, n: Int }` contains a heap pointer `>= 1024`?

**No for the suite’s finite tree and for honest secret chains through depth 10.
CONFIRMED closed for the prior dangling-child-pointer HOLD.**

Locator: `wat-emitter.ts` 413–454 / dist 253–292; Q1 cyclic test 318–337;
production executor `createLowLevelWasmExecutor().instantiateAndCall`.

```text
const MAX_FLATTEN_DEPTH = 8;
function flattenPlanFor(typeName, layouts, depth = 0) {
  if (depth > MAX_FLATTEN_DEPTH) return undefined;
  …
  if (field.watType === "i32" && layouts.has(field.type)) {
    const nested = flattenPlanFor(field.type, layouts, depth + 1);
    steps.push(nested !== undefined
      ? { srcOffset: field.offset, nested }
      : { srcOffset: field.offset, zero: true });  // bound: not a live load
  }
}
planHasNested: nested !== undefined || zero === true
emitFlattenStores zero: (i32.store dest (i32.const 0))
```

The previous `seen.has(typeName) → undefined` cut returned **no nested plan**
for `Node`, so `flattenFromHeapRet` took the no-nested path and the host
copied layout words `[childPtr, n]`. That path is gone: `Node` now unrolls
depths `0…8` (9 layouts, 8 temps, 10 i32 words = 1 bound zero + 9 `n` slots).
At depth 8 the child field is **`i32.const 0`**, not `i32.load` of the handle.

Suite tree production copy:

| path | result | words `>= 1024` |
|---|---|---|
| prior nested-flatten HOLD | `[1032, 7]` | **1032** |
| this continue, production | `[0,0,0,0,0,0,0,0,1,7]` | **none** |
| this continue, raw flat @1040 | same 10 words | **none** |
| original arena @1024 before wipe | `[1032, 7, 0, 1, …]` | 1032 still in **guest** memory |

The Q1 oracle (`last word === 7` and every word `< 1024`) matches the
production array. It does **not** pin the exact 10-word padding, so it would
also accept `[0,7]` or `[1,7]`. It would **reject** the prior `[1032,7]`.
That is enough for the named pointer challenge.

Self-referential `let leaf = Node { child: leaf }` is an honest syntax that
**traps** (`unreachable`) rather than returning a cyclic host array. The
suite’s finite tree is the executable oracle, as the continue stated.

Depth beyond the bound drops payload (`n=1` gone at 10 hops) but still stores
**`0`** for the truncated child, not the live handle. That is under-copy of
deep data, not a pointer leak.

## Named wiring

**CONFIRMED for secret recursive records.**

Guest flatten (`wat-emitter.ts` `flattenPlanFor` / `flattenFromHeapRet` /
`emitFlattenStores`; heap-return wrapper 1090–1106 and
`rewriteHeapReturnTag` 819–820):

```text
(local.set $__fungi_flat (global.get $__fungi_heap))
(local.set $__fungi_n0 (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 0))))
(local.set $__fungi_n1 (i32.load (i32.add (local.get $__fungi_n0) (i32.const 0))))
…
(local.set $__fungi_n7 (i32.load (i32.add (local.get $__fungi_n6) (i32.const 0))))
(i32.store (i32.add (local.get $__fungi_flat) (i32.const 0)) (i32.const 0))
…stores of n at each unrolled level…
(global.set $__fungi_ret_words (i32.const 10))
(local.get $__fungi_flat)
```

Host copy is still `__fungi_ret_words_get` words from that flat pointer.
Acyclic Outer remains `[7,99]` (no bound zero).

## Lane status

| Claim | This continue | Label |
|---|---|---|
| Secret recursive `Node` flattens (`$__fungi_flat`, words 10) | WAT temps n0–n7; production 10-word array | **CONFIRMED** |
| Bound nested field is `i32.const 0`, not a live load | dest offset 0; one zero-store; depth-10 still `0` | **CONFIRMED** |
| Production copy of the suite tree contains a word `>= 1024` | `[0,0,0,0,0,0,0,0,1,7]` | **REFUTED** |
| Prior HOLD `[1032,7]` still the production ABI | production no longer 2-word `[ptr,n]` | **REFUTED** |
| Finite 2-level / 3-level / 8-level / 9-level trees leak a child ptr | all `geHeap: []` | **REFUTED** |
| Depth 10 still copies the 10th child pointer | production `[0,2,3,4,5,6,7,8,9,7]`; `n=1` dropped | **REFUTED** as pointer leak; **CONFIRMED** deep under-copy |
| Self-ref `let leaf = Node { child: leaf }` returns a cyclic copy | `unreachable` trap; `ok: false` | **REFUTED** as a copy; **CONFIRMED** trap |
| Q1 cyclic oracle proves exact `[0×8,1,7]` | only `word < 1024` and last `7` | **CONFIRMED missing** as an exact-shape pin |
| Honest `n: 1024` is treated as a child pointer by that oracle | production last word 1024 | **CONFIRMED** oracle weakness (not a leak) |
| Omitted child is zero-initialized by the record literal | bump-alloc stores only listed fields; fresh memory is 0 | **CONFIRMED** |
| Flatten null-checks omitted/`0` child before `i32.load` | 8 unguarded loads; poison of addr 0/4 showed 4096 on a **raw** instance | **CONFIRMED residual** |
| Non-secret cyclic Node is flattened | production **1024**; no flat; `is_heap=0` | **REFUTED** (prior residual) |
| Acyclic nested Outer still `[7,99]` | 2/2 + probe | **CONFIRMED** |
| Nested `outer(7)` stays 14 | Q1 25/25 | **CONFIRMED** non-regression |
| Admit `h(1024)===1024` (no double-finalize to 0) | Q1 admit case still present | **CONFIRMED** non-regression; not re-opened |

## Deferred — do not claim closed

These remain open and were **not** started by this review:

- JSON-Decimal (RD-1289)
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend
- 124-finding Galerina scan
- host/import exception wipe (wasm-standalone still has zero `(import`)
- trap-path wipe (`invokeAdmittedExport` catch still skips finalize)
- exported `memory` remains host-writable (raw null-chase can read poisoned
  low memory; production fresh instances did not)
- fail-closed refuse when tagged words exceed 64
- i64/f64 fields presented as i32 word arrays
- non-secret heap-pointer results through the production executor (cyclic
  Node without `privacy` still returns **1024**)
- unguarded flatten loads through omitted/`0` child (padding zeros on honest
  fresh memory; not a suite-tree pointer leak)
- deep recursive payload beyond 8 nested hops (under-copy, pointer zeroed)
- 10-word padded ABI vs a compact `[child…, n]` of the live tree only
- Q1 cyclic assertion does not pin the exact flattened array
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**PASS** of the cyclic dangling-child-pointer continue on this dirty
candidate.

The named wiring happened: recursive `Node` is flattened with
`MAX_FLATTEN_DEPTH = 8`; the bound nested field is `i32.const 0`; the
production copy of the suite finite tree is **`[0,0,0,0,0,0,0,0,1,7]`** with
**no** word `>= 1024`. Depth 8/9/10 chains and mutual `A`/`B` also copy no
child handle. Self-referential `let leaf = Node { child: leaf }` traps, as
the continue allowed. Acyclic `[7,99]` and `outer(7)===14` still hold. That
closes the nested-flatten HOLD’s **type-recursive `[1032,7]`**.

It is not production clearance:

1. Flatten always unrolls 8 hops. A 2-node tree is a 10-word padded array,
   not `[1,7]`. Omitted child is chased through address `0` with no null
   check.
2. A 10-hop tree drops the deepest `n` and still zeros the truncated child
   (data loss, not a pointer leak).
3. Non-secret cyclic Node is still a raw pointer **1024**.
4. The Q1 cyclic oracle is “no word `>= 1024`”, not an exact ABI pin.
   Honest `n=1024` would fail it.

Do not treat 2/2 and 25/25 on this dirty candidate as clean-HEAD or
production clearance. Do not treat `word < 1024` on `[0×8,1,7]` as proof that
every recursive secret payload is fully inlined.
