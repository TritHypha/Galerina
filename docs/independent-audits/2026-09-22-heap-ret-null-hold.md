# Independent audit — `$__fungi_heap_ret` null-check (`i32.lt_u` vs `HEAP_BASE` before flatten-load)

**Verdict: PASS** (scoped to “`flattenFromHeapRet` must not `i32.load` through
`$__fungi_heap_ret` when that local is `< WAT_HEAP_BASE` (1024); a null/low
pointer must fill zeros instead of loading address 0; honest `Sec { a: s }`
must still copy **7**”). Filename keeps the requested `*-hold.md` path; the
heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

This file reviews the continue after
`docs/independent-audits/2026-09-22-null-flatten-hold.md`, which PASSed the
nested-child `i32.eqz` continue but left a residual: `$__fungi_heap_ret`
itself was not guarded, so the first flatten load was `heap_ret+0`
unguarded. The same receipt also recorded that nested child guards were
`i32.eqz` only (a nested pointer of `4` would still load address 4).

Named claim on this continue:

- `flattenFromHeapRet` null-checks `$__fungi_heap_ret` with `i32.lt_u`
  `HEAP_BASE` before flatten-load. Null/low pointer fills zeros instead of
  loading address 0.

Named challenge: challenge WAT contains
`i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024)` before flatten
stores. `Sec { a: s }` still copies **7**.

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested `outer(7)===14`, acyclic `Outer { inner: Sec, n: 99 } → [7,99]`,
omitted-child `[0×9,7]`, and cyclic `[0×8,1,7]` were only re-checked as
non-regression.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0. Tests import `dist/`.
`dist/wat-emitter.js` mtime (22:35:37) is newer than `src/wat-emitter.ts`
(22:35:17) and contains `flattenFromHeapRet` with
`(if (i32.lt_u (local.get $__fungi_heap_ret) (i32.const ${WAT_HEAP_BASE}))`
then zero-fill else flatten stores. `dist/wasm-runtime.js` is unchanged vs
the null-flatten pin (not the named subject of this continue).

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
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `26621ec5e1e65785447f793f8fcc76810ecbcb2d1df295935cd38ae84cfc8f45` |
| `packages-ts/galerina-core-compiler/tests/helpers/wasm-invoke-worker.mjs` | `2b1342a04c531b74c1af560362d749157f5f355f3d79c00b0bed1fc7e3d073ec` |
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `d503a2dbf728a5e592afda3ccceecf35071d054467ad71997069827fa37680de` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `a6f6d5536dff4982eb3fac08ef4f45722170e3f38aad31f9623b32f6e449f280` |

`wat-emitter.ts` differs from the null-flatten pin (`b199e7e4…`). The Q1
test file is untracked and differs (`d41d54a8…`) by the `$__fungi_heap_ret`
guard case. `wasm-runtime.ts` / `seam-adapters.ts` / `wasm-invoke-worker.mjs`
do **not** (`86bee8d2…` / `48a933aa…` / `2b1342a0…`). Passing tests here are
**not** production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="heap_ret|address 0|flattens nested" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **3/3 pass**, `duration_ms 384.6232`.
   - `Q1 secret heap return null-checks $__fungi_heap_ret before flatten`
     compiles `Sec { a: s }`, asserts WAT matches
     `i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024)`, then
     production `h(7)===7`.
   - omitted-child `Node { n: s }` still refuses planted `0x11111111` /
     `0x22222222` at words 0/1; last word is `7`.
   - acyclic `Outer { inner: Sec { a: s }, n: 99 }` still deep-equals `[7, 99]`.
2. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **27/27 pass**, `duration_ms 529.9948` (file grew by the heap_ret case vs the null-flatten pin’s 26; nested `outer(7)===14` still holds; admit `h(1024)===1024` still holds; cyclic `[0×8,1,7]` still holds).

Independent extra probes (temp scripts `%TEMP%\heap-ret-null-challenge.mjs`
and `%TEMP%\heap-ret-dump-wat.mjs` / `heap-ret-dump-early.mjs`, not
production). Honest `return Sec { a: s }` always allocates at `WAT_HEAP_BASE`,
so the Q1 regex+`h(7)===7` case never takes the then-branch. The null oracle
is a WAT splice that replaces the `$__fungi_heap_ret` capture block with
`(i32.const 0)` or `(i32.const 4)`, plants `0x11111111` at `memory[0]` and
`0x22222222` at `memory[1]`, then `finalizeSecretExportResult`:

- Named `Sec { a: s }`: WAT has `$__fungi_flat` and
  `(if (i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024)) (then
  memory.fill zeros; set heap_ret = flat))`. Guest flatten **loads of
  `$__fungi_heap_ret`: none** (leaf path; host copies the returned pointer).
  `i32.eqz (local.get $__fungi_heap_ret)`: **absent**. Production **7**.
  Forced `heap_ret=0`: copied **`[0]`**, `hasSentinel: false`, `memory[0]`
  still `0x11111111`. Forced `heap_ret=4`: **`[0]`**, same. Honest poison
  then `h(7)`: copied **`[7]`**, sentinel untouched.
- Nested `Outer { inner: Sec { a: s }, n: 99 }`: WAT sets `$__fungi_flat`
  then the same `i32.lt_u` on `$__fungi_heap_ret`. Flatten stores and both
  `i32.load (heap_ret + off)` sit in the **else**. Loads before the guard:
  **none**. Flatten stores before the guard: **none**. Production **`[7,99]`**.
  Forced `0` / `4`: **`[0,0]`**, no sentinel.
- Early `{ if s <= 10 { return Sec { a: s } } return Sec { a: 1 } }`: **two**
  `i32.lt_u` guards (inlined `rewriteHeapReturnTag` on the early `(return`,
  plus the wrapper flatten on the fall-through). Production `h(7)===7`,
  `h(11)===1`. Forced `0`: **`[0]`**, no sentinel.
- Omitted-child `Node { n: s }`: heap_ret guard present; both heap_ret loads
  in else. Production **`[0×9,7]`**. Forced `0` / `4`: **`[0×10]`**, no
  sentinel.
- Omitted inner `Outer { n: 99 }`: production **`[0,99]`**. Forced `0`:
  **`[0,0]`**.

## Challenge — WAT contains `i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024)` before flatten stores? `Sec { a: s }` still copies 7?

**Yes. CONFIRMED closed for `$__fungi_heap_ret` itself. Challenge WAT contains
the `i32.lt_u` vs 1024 before every flatten-load of `$__fungi_heap_ret`.
Honest `Sec { a: s }` still copies 7.**

Locator: `wat-emitter.ts` 456–506 / dist 293–343; Q1 heap_ret test 319–334;
wrapper 1126–1142 and `rewriteHeapReturnTag` 855–856 (both call
`flattenFromHeapRet`). Nested child temps still go through
`emitFlattenStores` 508–550, now also `i32.lt_u` vs `WAT_HEAP_BASE`.

Leaf (no nested plan — named `Sec { a: Int }`):

```text
(if (i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024))
  (then
    (local.set $__fungi_flat (global.get $__fungi_heap))
    (memory.fill (local.get $__fungi_flat) (i32.const 0) (i32.const 4))
    (global.set $__fungi_heap (i32.add (local.get $__fungi_flat) (i32.const 4)))
    (local.set $__fungi_heap_ret (local.get $__fungi_flat))
  ))
(global.set $__fungi_ret_is_heap (i32.const 1))
(global.set $__fungi_ret_words (i32.const 1))
(local.get $__fungi_heap_ret)
```

If `heap_ret` is low, the then-branch allocates a zeroed slot at the live
bump pointer and **replaces** `$__fungi_heap_ret` with that pointer. The host
copy then loads zeros, not address 0. If `heap_ret >= 1024`, the then-branch
is skipped and the original record pointer is returned (honest `h(7)→7`).

Nested (`Outer { inner: Sec, n: Int }`):

```text
(local.set $__fungi_flat (global.get $__fungi_heap))
(if (i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024))
  (then (memory.fill (local.get $__fungi_flat) (i32.const 0) (i32.const 8)))
  (else
    (local.set $__fungi_n0 (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 0))))
    (if (i32.lt_u (local.get $__fungi_n0) (i32.const 1024)) …)
    (i32.store … (i32.load (i32.add (local.get $__fungi_heap_ret) (i32.const 4))))
  ))
(local.get $__fungi_flat)
```

Flatten stores and `i32.load` of `$__fungi_heap_ret` exist only in the else.
The then-branch is `memory.fill` zeros of the flattened byte length. Bound
`zero: true` still stores `i32.const 0` with no load.

Prior null-flatten residual (first load is unguarded `heap_ret+0`) is gone
on these shapes: a spliced `heap_ret=0` or `4` copies zeros and leaves the
planted sentinel at address 0/4.

| path | result | contains `0x11111111` |
|---|---|---|
| prior null-flatten residual, unguarded `heap_ret+0` | would load address 0 | **yes** if `heap_ret` were 0 |
| this continue, honest `Sec { a: 7 }` production | **7** | **no** |
| this continue, forced `heap_ret=0` / `4` then finalize | **`[0]`** | **no** |
| this continue, nested honest production | **`[7,99]`** | **no** |
| this continue, nested forced `0` / `4` | **`[0,0]`** | **no** |

The Q1 oracle (`wat` matches `i32.lt_u … 1024` and `h(7)===7`) matches. It
does **not** execute the then-branch. That is enough for the named WAT +
non-regression challenge; the zeros-on-null claim is the independent splice.

`createLowLevelWasmExecutor().instantiateAndCall` builds a **fresh**
instance with `heap_ret` at 1024, so it cannot show a missing heap_ret
guard. The named null oracle is the spliced WAT.

## Named wiring

**CONFIRMED for secret heap-return flatten of `$__fungi_heap_ret`.**

`flattenFromHeapRet` (`wat-emitter.ts` 456–506) is the only heap-return
flatten emitter. Both the heap-return wrapper and early `(return` rewrite
use it. Dist matches src.

Leaf `Sec` still copies **7**. Nested present inner still takes else and
copies `[7,99]`. Omitted inner takes the nested-child `i32.lt_u` then-branch
and copies `[0,99]`. Forced low `$__fungi_heap_ret` takes the new heap_ret
then-branch and copies zeros.

`emitFlattenStores` nested-child guards are now `i32.lt_u` vs
`WAT_HEAP_BASE` as well (was `i32.eqz` on the null-flatten pin). That is
extra relative to the named heap_ret claim; it closes the prior “pointer of
`4` still loads address 4” residual for nested temps, independently of
`$__fungi_heap_ret`.

## Lane status

| Claim | This continue | Label |
|---|---|---|
| `flattenFromHeapRet` WAT is `(if (i32.lt_u heap_ret HEAP_BASE) (then zeros) (else flatten))` | leaf then-only; nested then/else | **CONFIRMED** |
| Challenge WAT has `i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024)` before flatten stores | Outer/Node: loads+stores only in else; Sec: no guest flatten-load | **CONFIRMED** |
| Honest `Sec { a: s }` still copies 7 | production `h(7)===7`; poison copy `[7]` | **CONFIRMED** |
| Null/low `$__fungi_heap_ret` fills zeros instead of loading address 0 | forced 0/4 → `[0]` / `[0,0]` / `[0×10]`; sentinel stays at mem[0] | **CONFIRMED** |
| Prior residual (unguarded `heap_ret+0`) still present | first heap_ret load is inside else of `i32.lt_u` | **REFUTED** |
| Guard is `i32.eqz` only | source/dist/WAT are `i32.lt_u` vs 1024; `i32.eqz heap_ret` absent | **REFUTED** |
| Nested child pointer of `4` still loads address 4 | `emitFlattenStores` now `i32.lt_u` vs 1024; forced heap_ret=4 zeros | **REFUTED** for these flatten loads |
| Q1 heap_ret test executes the then-branch | regex + `h(7)===7` only; honest alloc is 1024 | **CONFIRMED missing** as a null oracle |
| Production `instantiateAndCall` is the null oracle | fresh instance; heap_ret is HEAP_BASE | **CONFIRMED** not that path |
| Early nested `(return` also lt_u-guards heap_ret | inlined flatten; two guards; `h(7)===7` / `h(11)===1` | **CONFIRMED** |
| Cyclic `[0×8,1,7]` and omitted-child `[0×9,7]` still hold | 3/3 + 27/27 | **CONFIRMED** |
| Nested `outer(7)` stays 14 | Q1 27/27 | **CONFIRMED** non-regression |
| Non-secret cyclic Node is flattened / null-checked | not re-opened; prior residual still a raw pointer | **not started** |
| High-bit i32 (`>= 2^31`) is treated as a low pointer | `i32.lt_u` is unsigned; such values skip then | **CONFIRMED residual** (not shown) |

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
- honest Fungi still cannot produce `$__fungi_heap_ret == 0` (allocates at
  `WAT_HEAP_BASE`); the then-branch is defensive
- Q1 heap_ret assertion does not force a low pointer
- `i32.lt_u` leaves unsigned values `>= 2^31` in the else (would load that
  address if such a local ever appeared)
- deep recursive payload beyond 8 nested hops (under-copy, pointer zeroed)
- 10-word padded ABI vs a compact live tree
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**PASS** of the `$__fungi_heap_ret` null-check continue on this dirty
candidate.

The named wiring happened: `flattenFromHeapRet` WAT is
`(if (i32.lt_u (local.get $__fungi_heap_ret) (i32.const 1024)) (then fill
zeros) (else flatten-load))`. Challenge WAT contains that `i32.lt_u` before
flatten stores of `$__fungi_heap_ret`. Honest `Sec { a: s }` still copies
**7**. Forced `heap_ret=0` and `heap_ret=4` copy zeros and do not load the
sentinel at address 0. Nested `[7,99]`, omitted-child `[0×9,7]`, cyclic
`[0×8,1,7]`, and early `h(7)===7` match. That closes the null-flatten HOLD’s
**unguarded `$__fungi_heap_ret`**. Nested-child guards are `i32.lt_u` vs
`HEAP_BASE` as well.

It is not production clearance:

1. The Q1 heap_ret test is a WAT regex plus honest `h(7)===7`. Honest
   records allocate at 1024, so that test never takes the then-branch.
2. Production `instantiateAndCall` cannot plant a low `heap_ret` (fresh
   allocation). The zeros-on-null oracle is the spliced WAT.
3. Non-secret cyclic Node remains a raw pointer (prior residual).
4. Unsigned `i32.lt_u` does not treat high-bit i32 values as low pointers.

Do not treat 3/3 and 27/27 on this dirty candidate as clean-HEAD or
production clearance. Do not treat `h(7)===7` as proof that every low
`$__fungi_heap_ret` is refused without the independent splice.
