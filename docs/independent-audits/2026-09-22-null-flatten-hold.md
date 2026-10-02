# Independent audit — nested flatten null child (`i32.eqz` before load-use)

**Verdict: PASS** (scoped to “flatten of secret `Node { n: s }` must not
`i32.load` through address `0`, and a host sentinel `0x11111111` planted at
`memory[0]` before `h(7)` must not appear in the copied words”). Filename
keeps the requested `*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

This file reviews the continue after
`docs/independent-audits/2026-09-22-cyclic-flatten-hold.md`, which PASSed the
cyclic dangling-child-pointer continue but left a residual: omitted/`0` nested
fields were chased with unguarded `i32.load`, and poisoning addresses `0`/`4`
on a raw instance of `Node { n: 7 }` put **4096** into the flattened words.

Named claim on this continue:

- Nested flatten WAT is now `(if (i32.eqz ptr) (then store zeros) (else flatten))`.
  It must not `i32.load` through address `0`.

Named challenge: plant `0x11111111` at `memory[0]` before `h(7)` for
`record Node { child: Node, n: Int }` / `{ return Node { n: s } }`. The result
must not contain that sentinel. Challenge WAT must actually contain `i32.eqz`
before nested load-use.

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested `outer(7)===14`, acyclic `Outer { inner: Sec, n: 99 } → [7,99]`,
and cyclic `[0×8,1,7]` were only re-checked as non-regression.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` and contains
`emitFlattenStores` with `(if (i32.eqz (local.get ${temp}))` then zero-stores
else recursive flatten. `dist/wasm-runtime.js` mtime is newer than
`src/wasm-runtime.ts` (unchanged vs the cyclic-flatten pin; not the named
subject of this continue).

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
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `d41d54a808811f7fd7951433c0791431038f1e2db78f5e9111e547b8be87d371` |
| `packages-ts/galerina-core-compiler/tests/helpers/wasm-invoke-worker.mjs` | `2b1342a04c531b74c1af560362d749157f5f355f3d79c00b0bed1fc7e3d073ec` |
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `b199e7e4e8243e021918ce4d922cb347f1558c47394191bcaad5966ac8d29df0` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `22f2749673dfc43e2f2ae78fb65729a11975339352c235d6131b394ac2950766` |

`wat-emitter.ts` differs from the cyclic-flatten pin (`cd386f9a…`). The Q1
test file is untracked and differs (`8a6f700e…`) by the address-0 case.
`wasm-runtime.ts` / `seam-adapters.ts` / `wasm-invoke-worker.mjs` do **not**
(`86bee8d2…` / `48a933aa…` / `2b1342a0…`). Passing tests here are **not**
production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="address 0|cyclic nested|flattens nested" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **3/3 pass**, `duration_ms 365.0346`.
   - `Q1 flatten does not load a nested record through address 0` plants
     `memory[0]=0x11111111` and `memory[1]=0x22222222` on a raw instance of
     `Node { n: s }`, then `finalizeSecretExportResult(instance, exports.h(7))`.
     Asserts neither sentinel is in the copied words; last word is `7`.
   - cyclic `Node { child: Node { n: 1 }, n: s }` still deep-equals
     `[0,0,0,0,0,0,0,0]` then `1`, `7`.
   - acyclic `Outer { inner: Sec { a: s }, n: 99 }` still deep-equals `[7, 99]`.
2. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **26/26 pass**, `duration_ms 513.2433` (file grew by the address-0 case; nested `outer(7)===14` still holds; admit `h(1024)===1024` still holds).

Independent extra probes (temp scripts `%TEMP%\null-flatten-challenge.mjs` and
`%TEMP%\null-flatten-wat.mjs`, not production):

- Named omitted-child `Node { n: 7 }`: WAT has `$__fungi_flat`, temps
  `$__fungi_n0`…`$__fungi_n7`, **eight** `(if (i32.eqz (local.get $__fungi_nK))`
  gates, `i32.const 10` words. After planting `0x11111111` at word 0 and
  `0x22222222` at word 1, raw `h(7)` returns flat ptr **1032**; live flat
  words and host finalize are **`[0,0,0,0,0,0,0,0,0,7]`**. Sentinels:
  **none**. `memory[0]` still holds `0x11111111` after the call (the then
  branch never loaded it). Production frozen **`[0,0,0,0,0,0,0,0,0,7]`**.
- Finite tree `Node { child: Node { n: 1 }, n: 7 }` with the same poison:
  **`[0,0,0,0,0,0,0,0,1,7]`**. No sentinel. Production same.
- Acyclic omitted inner `Outer { n: 99 }`: poison copy **`[0, 99]`**. No
  sentinel. Production same.
- Acyclic present inner `Outer { inner: Sec { a: 7 }, n: 99 }`: poison copy
  **`[7, 99]`**. No sentinel. Production same.
- Early `(return Node { n: s })`: poison copy **`[0,0,0,0,0,0,0,0,0,7]`**.
  `rewriteHeapReturnTag` inlines the same `i32.eqz` flatten.
- Per-temp scan of `func $h`: every `(local.set $__fungi_nK (i32.load …))`
  is followed by `(if (i32.eqz (local.get $__fungi_nK))` **before** any
  `i32.load (i32.add (local.get $__fungi_nK) …)`. Unguarded nested load-use:
  **none** (`unguarded: []`). Eight eqz gates, 15 nested load-uses, all
  inside the matching `else`.
- Sentinel only at address 4 (`memory[1]=0x11111111`) with an honest omitted
  child still copies **`[0×9,7]`**. Honest omitted child is `0`, so address 4
  is not chased.

## Challenge — plant `0x11111111` at `memory[0]` before `h(7)`; result contains that sentinel? WAT missing `i32.eqz` before nested load-use?

**No. CONFIRMED closed for omitted nested records. Challenge WAT contains
`i32.eqz` before every nested load-use of `$__fungi_nK`.**

Locator: `wat-emitter.ts` 486–528 / dist 322–354; Q1 address-0 test 319–333;
wrapper 1104–1120 and `rewriteHeapReturnTag` 833–834 (both call
`flattenFromHeapRet` → `emitFlattenStores`).

```text
(local.set temp (i32.load (src + srcOffset)))   ;; load nested POINTER from parent
(if (i32.eqz (local.get temp))
  (then (i32.store dest+off (i32.const 0)) …)   ;; nestedWords zeros; no load through temp
  (else <emitFlattenStores nested using temp>)) ;; only non-zero ptr is flattened
```

The pointer load itself is from the parent (`$__fungi_heap_ret` at ≥ 1024, or
a prior temp already proven non-zero). Nested load-use is `i32.load (temp +
fieldOffset)` and exists only in the `else`. Bound `zero: true` still stores
`i32.const 0` with no load.

Named omitted-child WAT (honest `Node { n: s }`; child slot left 0):

```text
(local.set $__fungi_n0 (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 0))))
(if (i32.eqz (local.get $__fungi_n0))
  (then
    (i32.store (i32.add (local.get $__fungi_flat) (i32.const 0)) (i32.const 0))
    … eight more zero-stores through dest offset 32 …
  )
  (else
    (local.set $__fungi_n1 (i32.load (i32.add (local.get $__fungi_n0) (i32.const 0))))
    (if (i32.eqz (local.get $__fungi_n1)) …)
    …
    (i32.store … (i32.load (i32.add (local.get $__fungi_n0) (i32.const 4))))  ;; n0.n, still in else
  )
)
(i32.store … (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 4)))) ;; root.n
```

Prior cyclic-flatten residual (raw poison of addr 0/4 → flattened **4096**)
is gone on this shape: then-branch never uses `$__fungi_n0` as an address.

| path | result | contains `0x11111111` |
|---|---|---|
| prior cyclic-flatten HOLD, raw poison of addr 0/4 | live words included **4096** | **yes** (low-memory chase) |
| this continue, poison then `h(7)` + finalize | `[0,0,0,0,0,0,0,0,0,7]` | **no** |
| this continue, live flat @1032 before finalize | same 10 words | **no** |
| this continue, production `instantiateAndCall` | `[0,0,0,0,0,0,0,0,0,7]` | **no** (fresh memory is 0) |

The Q1 oracle (`includes(0x11111111)===false` and last word `7`) matches.
It does **not** pin the exact 10-word padding. It would reject a copy that
inlined the planted sentinel. That is enough for the named challenge.

`createLowLevelWasmExecutor().instantiateAndCall` builds a **fresh** instance,
so `memory[0]` is already 0 and cannot show a missing null check. The named
poison is the raw-instance path used by the Q1 address-0 test.

## Named wiring

**CONFIRMED for secret nested record flatten.**

`emitFlattenStores` (`wat-emitter.ts` 486–528) is the only nested-store
emitter. `flattenFromHeapRet` uses it for both the heap-return wrapper and
early `(return` rewrite. Dist matches src.

Acyclic Outer with a present inner still takes `else` and copies `[7,99]`.
Omitted inner takes `then` and copies `[0,99]`. Recursive Node still unrolls
eight hops; a null child at any hop zeros that suffix instead of loading
address 0.

## Lane status

| Claim | This continue | Label |
|---|---|---|
| Nested flatten WAT is `(if (i32.eqz ptr) (then zeros) (else flatten))` | eight eqz gates on Node; Outer has one | **CONFIRMED** |
| Challenge WAT has `i32.eqz` before nested load-use of `$__fungi_nK` | `unguarded: []` on omitted, child, early, Outer | **CONFIRMED** |
| Poison `memory[0]=0x11111111` then `h(7)` copies that sentinel | `[0×9,7]`; `hasSentinel: false` | **REFUTED** |
| Prior residual (unguarded chase through addr 0 → 4096) still present | then-branch is zero-stores only | **REFUTED** for address 0 |
| Production omitted-child copy still `[0×9,7]` | production `[0,0,0,0,0,0,0,0,0,7]` | **CONFIRMED** |
| Cyclic `[0×8,1,7]` and acyclic `[7,99]` still hold | 3/3 + 26/26 | **CONFIRMED** |
| Early nested `(return` also eqz-guards | inlined flatten; poison `[0×9,7]` | **CONFIRMED** |
| Omitted acyclic `Outer { n: 99 }` copies inner from addr 0 | production/poison `[0,99]` | **REFUTED** |
| Null-check is `ptr < HEAP_BASE`, not only `i32.eqz` | source is `i32.eqz` only | **REFUTED** (residual) |
| `$__fungi_heap_ret` itself is eqz-guarded before field loads | first load is `heap_ret+0` unguarded | **CONFIRMED residual** |
| Q1 address-0 oracle pins the exact 10-word ABI | only `includes(sentinel)===false` and last `7` | **CONFIRMED missing** as an exact-shape pin |
| Production `instantiateAndCall` is the poison oracle | fresh instance; memory[0] already 0 | **CONFIRMED** not that path |
| Non-secret cyclic Node is flattened / null-checked | not re-opened; prior residual still a raw pointer | **not started** |
| Nested `outer(7)` stays 14 | Q1 26/26 | **CONFIRMED** non-regression |

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
- flatten null-check is `i32.eqz` only (a nested pointer of `4` would still
  load address 4; honest omitted fields are `0`, not shown as a leak here)
- `$__fungi_heap_ret == 0` is not eqz-guarded (honest `return Node { n: s }`
  allocates at `WAT_HEAP_BASE`)
- deep recursive payload beyond 8 nested hops (under-copy, pointer zeroed)
- 10-word padded ABI vs a compact live tree
- Q1 address-0 assertion does not pin the exact flattened array
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**PASS** of the null-child flatten continue on this dirty candidate.

The named wiring happened: nested flatten WAT is `(if (i32.eqz ptr) (then
store zeros) (else flatten))`. Challenge WAT contains `i32.eqz` before every
nested load-use of `$__fungi_n0`…`$__fungi_n7`. Planting `0x11111111` at
`memory[0]` before `h(7)` for `Node { n: s }` copies **`[0,0,0,0,0,0,0,0,0,7]`**
with **no** sentinel. Omitted acyclic inner, present inner, cyclic finite
tree, and early `(return` match. That closes the cyclic-flatten HOLD’s
**unguarded address-0 chase**.

It is not production clearance:

1. The guard is `i32.eqz`, not “pointer below `HEAP_BASE`”. Honest omitted
   fields are `0`. A nested pointer of `4` would still load address 4.
2. The returned record pointer `$__fungi_heap_ret` is not itself null-checked.
3. Production `instantiateAndCall` cannot plant the sentinel (fresh memory).
   The poison oracle is the raw instance used by the Q1 address-0 test.
4. Non-secret cyclic Node remains a raw pointer (prior residual).

Do not treat 3/3 and 26/26 on this dirty candidate as clean-HEAD or
production clearance. Do not treat `includes(0x11111111)===false` on
`[0×9,7]` as proof that every nested pointer below the heap base is refused.
