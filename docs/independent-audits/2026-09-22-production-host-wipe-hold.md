# Independent audit — production host copy-then-wipe (`$__fungi_ret_is_heap` at secret exits)

**Verdict: HOLD** (scoped to this continue)

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

This file previously HOLDed two production-host-wipe continues:

1. Aligned secret `Int >= 1024` treated as an arena pointer (`g(1024) → 0`).
2. Guest tag `$__fungi_ret_is_heap` set at secret-flow **entry** (last-writer-wins).
   Nested outer-Int + inner-Sec production `g(1024) → 0`. Nested outer-Sec +
   inner-Int returned a wiped pointer (`1028`) instead of field 7.

This update reviews the follow-up that claims the tag is now set **at each
secret exit** (G5c / zero-on-exit set `0`; heap-return wrapper sets `1` at
exit) and that nested production tests were added. Named oracles:

- leaf `Sec h(7)` result `7`
- leaf `Int g(1024)` result `1024`
- nested outer `Int` + inner `Sec` result `1024`
- nested outer `Sec` + inner `Int` result `7`

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested `outer(7)===14` was only re-checked as non-regression.

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` on this host
and contains the same G5c-exit `i32.const 0`, zero-on-exit `i32.const 0`, and
heap-wrapper post-block `i32.const 1`. `wasm-runtime.ts` / `seam-adapters.ts`
hashes are unchanged from the prior HOLD.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `0b6461f2161e516bccf45c951f617dc67e800206d08a4074d6e260be5a9fff28` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `5223191dec006c8600ed0d6eabac063bfe8b11169426c0733771466636c817b4` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `5047e9306d286eeb1c18d59db4b629a922742380d73eec75168b10ef53cdd187` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `b947ea21b8ed93910565c65315b2916b8ae1ab27675e2f83faa676e905226039` |
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `e419288295a60bf2fe929d8aa72679dcb8b70c76dc43ea4f5d8f22193583dc73` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `bb7c71dae678f815d786cd36e432a47344ee0004e5e4738884871e621046ab07` |
| `packages-ts/galerina-core-runtime-wasm/src/seam-adapters.ts` | `fbb32d30d23656004f658e8df2224f7935ca9e9befd1ef3df6aeeaab545d85e0` |
| `packages-ts/galerina-core-runtime-wasm/dist/seam-adapters.js` | `ae959e3ff81e903e29622279dd63f1fb1ead8658d80170aae6bcc1c003a96423` |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | `1c7d83466fe5811b5c59819ac3f1c420aab32a2b32a7a3cb3bcd62143be70d94` |

`wat-emitter.ts` differs from the prior HOLD pin (`a27a97cf…`).
`wasm-runtime.ts` and `seam-adapters.ts` do not (`e4192882…` / `fbb32d30…`).
The Q1 test file is untracked and now includes the two nested production
cases. Passing tests here are **not** production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="production executor" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **4/4 pass**, `duration_ms 359.1323`.
   - leaf `g(1024) -> Int` after `Cell { a: 1 }` asserts `r.result === 1024`.
   - leaf `h(7) -> Sec` asserts `r.result === 7`.
   - nested outer `Int` + inner `Sec` asserts `r.result === 1024`.
   - nested outer `Sec` + inner `Int` asserts `r.result === 7`.
   None of the four reads post-call WASM memory, so they are copy/identity
   oracles, not wipe oracles.
2. `node --test --test-timeout=30000 packages-ts/galerina-core-runtime-wasm/tests/seam-adapters.test.mjs` → **20/20 pass**, `duration_ms 146.9051`. `add(2,40)` and the governed e2e `add(40,2)` both return **42**.
3. Independent extra: same Q1 file unfiltered → **19/19 pass**, `duration_ms 463.3618` (non-regression; nested `outer(7)===14` still holds).

Independent extra probes (temp scripts `%TEMP%\production-host-ret-is-heap-exit-probe.mjs` and `…-probe2.mjs`, not production):

- Leaf secret `g(s) -> Int` after an allocation: WAT is zero-on-exit (`$__fungi_xl`). Sets `0` at entry and again after the owned fill. Direct `g(7/1024/1025/1028)` = `7/1024/1025/1028`. Getter after call is **0**. Production: all four match the scalar. `WebAssembly.Module.exports` has **zero** globals. Exports are `memory`, `__fungi_heap_get`, `__fungi_wipe_owned`, `__fungi_ret_is_heap_get`, `g`.
- Leaf secret `h(s) -> Sec` with a **tail value** (no WAT `(return`): heap wrapper captures the body, then `(global.set $__fungi_ret_is_heap (i32.const 1))`. Direct `h(7)` is pointer **1024** with field 7. Getter is **1**. Production result **7**. Helper `finalizeSecretExportResult(instance, 1024)` → `{finalized:7, fieldAfter:0}`.
- Named nested outer-Int + inner-Sec: inner wrapper sets `1` at its exit; outer zero-on-exit sets `0` **after** `call $inner`. Direct `g(1024)` is 1024. Getter is **0**. Production **1024**.
- Named nested outer-Sec + inner-Int: inner (non-leaf tail `(local.get $p0)`) sets `0` at entry only; outer wrapper sets `1` **after** `call $inner`. Direct field is 7 at pointer 1024. Getter is **1**. Production **7**.
- Nested `outer(7)===14` on direct and production.
- No-wipe `add` module: exports `["add","boom"]`, production result **42**.
- Missing getter (wipe export, no `__fungi_ret_is_heap_get`): production `g(1024)` stays **1024**.
- Hostile getter always `1` plus wiped word at 1024: production `g(1024)` is **0** (adversarial WAT, not honest compiler).
- **Heap-returning secret with early WAT `(return`** (honest compiler; not in the suite): `{ if s <= 10 { return Sec { a: s } } return Sec { a: 99 } }`. G5c is skipped (`isPrimI32Return` false). The `(return …)` exits the function and **skips** the wrapper’s `i32.const 1`. Getter after `h(7)` is **0**. Direct field is 7 at pointer 1024. Helper finalize then **wipes** and returns pointer **1024**. Production `h(7) → 1024`. Fall-through `h(11)` does hit the wrapper: getter **1**, production **99**.
- Same skip after a nested inner Int: production `h(7) → 1024` (getter 0); `h(11) → 99` (getter 1).
- **Non-leaf primitive inner that calls a heap `deeper`** (honest compiler; not in the suite): inner is referenced so `emitZeroOnExit` is false; `{ return s }` lowers to a tail value so G5c does not rewrite. Inner WAT sets `0` at **entry** only, then `call $deeper` (deeper sets `1` at exit). Getter after `inner(1028)` is **1**. Production **`inner(1028) → 0`**. Direct WASM still returns 1028. Leaf outer `g` wrapping the same inner does set `0` at exit: production `g(1028) === 1028`.
- Secret `g(s: Float64) -> Float64` after `Cell { a: 1 }`: **does not assemble**. Heap wrapper wraps the f64 body in `(block (result i32))` / `(local.get $__fungi_heap_ret)`. wabt: `type mismatch in block, expected [i32] but got [f64]` and `implicit return, expected [f64] but got [i32]`. Prior HOLD assembled this shape and production-copied `Cell.a` (`1`); this continue is fail-closed at assemble, not a primitive scalar tag.
- Non-secret `h(s) -> Sec`: getter stays 0 (never set). Production result **1024** (skip-copy of a live pointer, then wipe).
- Multi-field `h(s) -> Wide {a,b,c}`: production result **7** (first i32 only).
- Bool / Int8 secret primitives: tagged `0`, production matches the scalar.

## Challenge 1 — leaf scalar `g(1024)` is 1024, not 0?

**Yes for the leaf production case. CONFIRMED closed for that shape.**

Locator: Q1 test `Q1 production executor keeps a large scalar Int…`;
`wat-emitter.ts` 911 / 918 (zero-on-exit sets `0` after the owned fill);
`wasm-runtime.ts` 825–826 / dist 693–694 (`resultIsHeapPointer` requires
getter `=== 1`).

The prior HOLDs’ leaf `g(1024) → 0` is gone on this path: getter is 0, so
finalize wipes and returns the scalar. Probe also has `g(1028)=1028` and
`g(1025)=1025`.

This is **not** a proof that every secret numeric result survives finalize.
See Challenges 6 and 7.

## Challenge 2 — leaf heap `Sec h(7)` is 7, not pointer 1024?

**Yes for the tail-value leaf. CONFIRMED closed for that shape. REFUTED for early WAT `(return` of a heap pointer.**

Locator: Q1 test `Q1 production executor copies a heap-pointer field…`;
`wat-emitter.ts` 926–942 (wrapper sets `1` **after** `(local.set $__fungi_heap_ret (block …))`).

`{ return Sec { a: s } }` lowers to a tail i32 value, not a WAT `(return`.
The wrapper runs. Direct `h(7)` is still pointer 1024. Production returns 7.
Helper finalize then zeros the word.

`{ if s <= 10 { return Sec { a: s } } return Sec { a: 99 } }` emits
`(return (block (result i32) …alloc…))` **inside** the wrapper block.
WASM `return` leaves the function. The post-block `i32.const 1` does not
run. Getter stays **0** (entry store). Production `h(7) → 1024` and the
helper wipes the live field. The named leaf test does not cover this exit.
See Challenge 6.

## Challenge 3 — modules without wipe still return 42 for add?

**Yes. CONFIRMED.**

Locator: `wasm-runtime.ts` 823–824 (`if (typeof wipe !== "function") return result`)
and `seam-adapters.test.mjs` (low-level `add` + governed e2e).

The hand-encoded `add` module has no `__fungi_wipe_owned`. Production
`instantiateAndCall` and the governed e2e both return 42. Independent probe
re-confirmed `exports=["add","boom"]`, result 42.

## Challenge 4 — mut `$__fungi_ret_is_heap` not exported; getter exists?

**Yes on honest compiler heap modules. CONFIRMED.**

Locator: `wat-emitter.ts` 774–776. The bump-pointer block (when `usesHeap`)
emits:

```text
(global $__fungi_ret_is_heap (mut i32) (i32.const 0))
(func $__fungi_ret_is_heap_get (result i32) (global.get $__fungi_ret_is_heap))
(export "__fungi_ret_is_heap_get" (func $__fungi_ret_is_heap_get))
```

There is no `(export "__fungi_ret_is_heap" …)`. Probe:
`WebAssembly.Module.exports` global list is `[]` on both leaf `g` and leaf
`h`. The host can read the flag only through the function export.

## Challenge 5 — copy first i32 only when getter `=== 1`?

**Yes, that is the host gate. CONFIRMED as written.**

Locator: `wasm-runtime.ts` 825–847; dist 693–712.

`resultIsHeapPointer` is `typeof getter === "function" && getter() === 1`.
Copy still also requires a safe integer `>= WAT_HEAP_BASE` that is 4-aligned
and an exported `memory`. Otherwise wipe-then-return. Missing getter: no
copy (`g(1024)` stays 1024). Getter `=== 1`: copy then wipe.

The gate is only as correct as the guest flag at export return. Challenges
6–7 refute that for honest programs that are not the four named tails.

## Challenge 6 — is `$__fungi_ret_is_heap` set at **each** secret exit?

**No. REFUTED. Primitive G5c / leaf zero-on-exit / fall-through heap wrapper
do set it. Heap-pointer WAT `(return` and non-leaf primitive tail-value
exits do not.**

Locator: `wat-emitter.ts` 669 (G5c sets `0` inside the rewritten `(return`),
883–918 (zero-on-exit is `emitArenaReset` / leaf-only and sets `0` after the
body block), 926–942 (heap wrapper for `!isPrimI32Return`, sets `1` after
the body block), 963–969 (fallback still sets the flag at **entry**).
G5c rewrite is gated on `isPrimI32Return` (865–866), so heap early returns
are not rewritten.

WASM `return` is a function-level branch. Putting `(global.set … (i32.const 1))`
after a `(block …)` does not run when the body contains `(return …)`.
Fungi last-statement `return <expr>` often lowers to a tail value (the four
named tests). Early `if { return Sec { … } }` lowers to a real WAT
`(return`. That is an honest compiler secret exit with no flag store.

Fall-through of the same function **does** set `1`. Production therefore
copies the fall-through field and skip-copies (then wipes) the early-return
pointer. Probe: `h(7) → 1024`, `h(11) → 99`.

## Challenge 7 — did moving the store to exit close nested last-writer-wins?

**Closed for the two named leaf-outer shapes. REFUTED for a non-leaf
primitive export that calls a heap callee.**

Locator: named Q1 nested production tests; probe2 `inner` WAT (entry
`i32.const 0` only, then `call $deeper`); `emitZeroOnExit` requires
`emitArenaReset` (leaf).

Named:

1. Outer leaf `g -> Int` zero-on-exit sets `0` **after** `call $inner`
   (`inner -> Sec` sets `1` at its own exit). Getter after `g(1024)` is **0**.
   Production **1024**. Prior HOLD `g(1024) → 0` on this shape is gone.
2. Outer leaf `h -> Sec` wrapper sets `1` **after** `call $inner`
   (`inner -> Int` tail). Getter after `h(7)` is **1**. Production **7**.
   Prior HOLD pointer-`1028` on this shape is gone.

Still last-writer-wins when the **export** is the non-leaf primitive:

- `inner` is referenced by `g`, so it is not a leaf: no zero-on-exit.
- `{ let _w: Sec = deeper(s) return s }` is a tail value: no G5c.
- `deeper -> Sec` wrapper sets `1` at exit. `inner` never stores `0` after
  the call. Getter after `inner(1028)` is **1**. Production
  **`inner(1028) → 0`** (copy of an uninitialized word at 1028, then wipe).
- Leaf `g` wrapping the same inner still returns 1028, because `g`’s
  zero-on-exit overwrites the flag.

The new nested tests are both **leaf** outers with tail-value bodies. That
negative control (non-leaf primitive export / heap early return) is missing
from the suite. Independent probe supplies both and the production path
fails them.

`PRIMITIVE_RETURN_TYPES` (`wat-emitter.ts` 816) is
`Int|Int8|Int16|Int32|Byte|Bool`. Secret `Float64` after an allocation is
treated as heap (`!isPrimI32Return`) and the i32 wrapper **fails wabt
validate**. Bool and Int8 on this emitter are i32 primitives and pass.

## Lane status

| Claim | This continue | Label |
|---|---|---|
| `$__fungi_ret_is_heap` mut global + `__fungi_ret_is_heap_get` on `usesHeap` modules | WAT 774–776; Module.exports has 0 globals | **CONFIRMED** |
| Mut global is not exported | no `export "__fungi_ret_is_heap"`; probe `global:[]` | **CONFIRMED** |
| G5c primitive early return sets flag 0 | rewrite at 669; mixed-body getter 0 | **CONFIRMED** |
| Leaf zero-on-exit sets flag 0 at exit | WAT 918 after owned fill | **CONFIRMED** |
| Heap-return wrapper sets flag 1 at exit | WAT 941 after the body block | **CONFIRMED** for **fall-through** only |
| Flag is set at each secret exit | heap WAT `(return` skips 941; non-leaf prim tail has no exit store | **REFUTED** |
| Flag is the export result’s kind | named leaf-outers yes; early heap / non-leaf prim no | **REFUTED** as a general claim |
| Leaf production `h(7)` is 7, not pointer 1024 | Q1 4/4 tail-value + probe | **CONFIRMED** for the named tail |
| Early-return production `h(7)` is 7 | getter 0; result **1024**; field wiped | **REFUTED** |
| Leaf production `g(1024)` is 1024, not 0 | Q1 4/4 + probe | **CONFIRMED** |
| Nested production outer-Int + inner-Sec `g(1024)` is 1024 | Q1 nested test + probe getter 0 | **CONFIRMED** for that leaf outer |
| Nested production outer-Sec + inner-Int `h(7)` is 7 | Q1 nested test + probe getter 1 | **CONFIRMED** for that leaf outer |
| Non-leaf prim export `inner(1028)` is 1028 | inner entry-only flag; deeper sets 1; production **0** | **REFUTED** |
| Secret `Float64` 1024 is a scalar | i32 heap wrapper; **assemble fail** | **REFUTED** (fail-closed, not tagged 0) |
| Modules without wipe still return 42 for `add` | 20/20 + probe | **CONFIRMED** |
| `createLowLevelWasmExecutor` still calls finalize after the export | `seam-adapters.ts` 156; hash unchanged | **CONFIRMED** |
| Q1 production tests prove wipe | assert result only | **CONFIRMED missing** as a wipe oracle |
| Guest wipe on leaf heap helper zeros the word | finalize helper `fieldAfter:0` | **CONFIRMED** on the helper |
| Nested `outer(7)` stays 14 | Q1 19/19 | **CONFIRMED** non-regression |
| Non-secret record return is copied | getter stays 0; production **1024** | **CONFIRMED residual** |
| Multi-field records are fully copied | production first i32 only (`Wide` 7) | **CONFIRMED** first-i32 ABI, as named |
| `admitAndInstantiate` also copy-then-wipes | still returns a raw instance; src hash unchanged | **CONFIRMED residual** |

## Deferred — do not claim closed

These remain open and were **not** started by this review:

- JSON-Decimal (RD-1289)
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend
- 124-finding Galerina scan
- host/import exception wipe (wasm-standalone still has zero `(import`)
- trap-path wipe (finalize is skipped when the export throws; instance is not returned)
- `admitAndInstantiate` callers still skip-copy
- exported `memory` remains host-writable
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony
- G5c-equivalent flag store on heap-pointer WAT `(return`
- exit-time flag store on non-leaf primitive tail-value bodies
- primitive secret returns outside `PRIMITIVE_RETURN_TYPES` (at least `Float64`, now unassemblable)
- non-secret heap-pointer results through the production executor

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**HOLD** of this “flag at each secret exit” follow-up on the dirty candidate.

The named 4/4 wiring happened for **leaf tail-value** shapes: mut
`$__fungi_ret_is_heap` is not exported; `__fungi_ret_is_heap_get` exists;
finalize copies the first i32 only when that getter returns 1; leaf secret
`h(7)` is 7; leaf secret `g(1024)` is 1024; nested outer-Int + inner-Sec is
1024; nested outer-Sec + inner-Int is 7; `add` is still 42. That closes the
prior HOLD’s **leaf-outer nested** last-writer-wins **for those two Q1
shapes**.

It is not a PASS of the continue:

1. The guest tag is still not stored at every secret exit. Heap-pointer WAT
   `(return` skips the wrapper’s `i32.const 1`. Production `h(7) → 1024`
   (skip-copy) and the helper wipes the live field. G5c was updated to set
   `0` on primitive early returns; heap early returns have no counterpart.
2. Non-leaf primitive tail-value bodies still set the flag at **entry**
   only. A referenced `inner -> Int` that calls `deeper -> Sec` leaves
   getter `1`. Production **`inner(1028) → 0`**. Same 1024-to-0 class as
   the prior HOLD, now on a non-leaf export the suite does not call.
3. Secret `Float64` after an allocation no longer assembles (i32 heap
   wrapper). Passing 4/4, 20/20, and extra 19/19 on this dirty candidate is
   **not** clean-HEAD or production clearance.

Do not treat the production executor returning 1024/7 on the four named
tails as proof that `$__fungi_ret_is_heap` classifies the value
`finalizeSecretExportResult` actually sees on every secret exit.
