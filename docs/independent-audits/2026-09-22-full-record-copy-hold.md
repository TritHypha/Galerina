# Independent audit — full secret-record copy (`__fungi_ret_words_get` from layout size)

**Verdict: PASS** (scoped to leftover suffix copy on this continue). Filename
keeps the requested `*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet and
is not GPT-6 Astra.

This file previously HOLDed the `[ptr, $__fungi_heap)` bump-suffix copy
(extra-after `Sec` became frozen `[7,99]`; Wide+later Cell became
`[7,7,7,99]`; nested Outer became `[1028,7,99]`). This update reviews the
follow-up that claims host copy uses guest `__fungi_ret_words_get` from the
declared record layout size, not that suffix.

Named oracles from the continue:

- extra alloc after returned `Sec` is still **7**, not `[7,99]`
- last-allocated Wide is frozen **`[7,7,7]`**
- secret Int **1024** stays **1024**
- `admitAndInstantiate` + `invokeAdmittedExport` is **7**
- seam `add` still **42**

Named challenge: leftover suffix copy.

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started. Nested `outer(7)===14` was only re-checked as non-regression.

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wasm-runtime.js` mtime is newer than `src/wasm-runtime.ts` on this host
and contains the same `__fungi_ret_words_get` / `MAX_COPIED_RECORD_WORDS=64`
logic (no `endExclusive`, no `__fungi_heap_get` in the finalize body).
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` and emits
`$__fungi_ret_words` plus `__fungi_ret_words_get`.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `e24905a85fcc4537c2cfedc8e6bcef39ae9c6bd73f4805db4e3eb975765543d0` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `bdb20b3580e3aeab27fa5fd64877c099d1cd26011ea1a9ed03983ad863c3605e` |
| `packages-ts/galerina-core-runtime-wasm/src/seam-adapters.ts` | `48a933aaec6f2fcd4780f2c7d7fdcdfd6c0febeaf8dd1eca790f05a15b83ea75` |
| `packages-ts/galerina-core-runtime-wasm/dist/seam-adapters.js` | `0b3a3f3e2c4556937c83f1387e3db410e95ceeb3557f9bd08756bfb9a5a21b73` |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | `ac717c891982f4f19be69a34257ea3c37ca751c5613d9ce5244b91a1dd846acc` |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | `e1d1f81137dd402b6b4874f9d4807bfe7ad1dad51c770d770b938b30bb22997c` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `1d022aa96f0b4e0e17804961f33724681b3016e1445b08bf96276336e7e113b9` |
| `packages-ts/galerina-core-compiler/dist/index.js` | `ee263c482991a71e48a07c2ac4c7a4acc46f33bd1aae5ec16ca4020283003523` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `507d34fef476b6f43e5f1c5a19b1a78afff9bf6ca0a3016db09870cede57454c` |
| `packages-ts/galerina-core-compiler/tests/helpers/wasm-invoke-worker.mjs` | `2b1342a04c531b74c1af560362d749157f5f355f3d79c00b0bed1fc7e3d073ec` |
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `ddf880176be1c7d46535ee853f15bbb7eedeeec66fbc3c5b761ae40a9a9b2b05` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `224f47bb2d61e9c4b933ebea751abca4375ba46f522fc9b4e4812afd12642941` |

`wasm-runtime.ts` differs from the prior suffix-copy HOLD pin (`a4f92859…`).
`wat-emitter.ts` differs (`5578e44b…`). The Q1 test file is untracked and
differs (`e169bfc6…`). `seam-adapters.ts` does **not** (`48a933aa…`); it still
routes through `invokeAdmittedExport`. Passing tests here are **not**
production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="production executor|later allocations|admitAndInstantiate" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **8/8 pass**, `duration_ms 406.924`.
   - leaf `g(1024) -> Int` after `Cell { a: 1 }` asserts `r.result === 1024`.
   - leaf `h(7) -> Sec` asserts `r.result === 7`.
   - nested outer `Int` + inner `Sec` asserts `r.result === 1024`.
   - nested outer `Sec` + inner `Int` asserts `r.result === 7`.
   - early heap `return Sec { a: s }` asserts `r.result === 7`.
   - extra alloc after returned `Sec` asserts `r.result === 7` (not `[7,99]`).
   - leaf `h(7) -> Wide {a,b,c}` asserts `r.result` deep-equals `[7,7,7]`.
   - `admitAndInstantiate` then `invokeAdmittedExport(instance, "h", [7])` asserts `7`.
   None of the eight reads post-call WASM memory, so they are copy/identity
   oracles, not wipe oracles. The Wide assertion string still says
   `[ptr, heap)`; last-allocated Wide cannot distinguish layout from suffix.
   The later-allocations case is the distinguishing named oracle.
2. `node --test --test-timeout=30000 packages-ts/galerina-core-runtime-wasm/tests/seam-adapters.test.mjs` → **20/20 pass**, `duration_ms 149.4715`. Low-level `add(2,40)` and governed e2e `add(40,2)` both return **42**.
3. Independent extra: same Q1 file unfiltered → **23/23 pass**, `duration_ms 472.2164` (non-regression; nested `outer(7)===14` still holds).

Independent extra probes (temp scripts `%TEMP%\full-record-words-probe.mjs` and
`…-probe2.mjs` / `…-probe3.mjs`, not production):

- Extra-after honest `{ let r: Sec = Sec { a: s } let _x: Sec = Sec { a: 99 } return r }`:
  direct ptr **1024**, heap **1032**, suffix words **`[7,99]`**, getter **1**,
  `__fungi_ret_words_get` **1**, WAT `i32.const 1`, production **7** (`typeof
  number`). Helper finalize then zeros both words (`[7,99]` → `[0,0]`).
- Last-allocated Wide: ptr **1024**, heap **1036**, wordsGet **3**, WAT
  `i32.const 3`, production frozen **`[7,7,7]`**. Assign and `push` throw;
  values stay `[7,7,7]`.
- Named Int 1024: production **1024**, getter **0**.
- Wide then extra Cell: ptr **1024**, heap **1040**, suffix **`[7,7,7,99]`**,
  wordsGet **3**, production frozen **`[7,7,7]`** (prior HOLD was `[7,7,7,99]`).
- Extra allocation **before** the returned Sec: ptr **1028**, heap **1032**,
  wordsGet **1**, production **7**.
- Nested `Outer { inner: Inner { a: s, b: 99 } }`: ptr **1024**, heap **1036**,
  suffix **`[1028,7,99]`**, wordsGet **1**, production **1028** (one i32 handle;
  prior HOLD frozen `[1028,7,99]`). Inner payload is not copied; wipe then
  destroys it. Host keeps a dangling inner pointer as a number.
- `admitAndInstantiate` + `invokeAdmittedExport`: **7**. Raw
  `admitted.instance.exports.h(7)` is still pointer **1024**
  (`admitAndInstantiate` itself does not finalize).
- Nested `outer(7)===14` on the production executor.
- Outer `Sec` after inner `Wide`: wordsGet **1** (outer overwrites inner’s 3),
  production **7**.
- Missing `__fungi_ret_words_get` (wipe + heap-flag 1, live words `[7,99]`):
  finalize **7**, not `[7,99]`. Fallback is **1 word**, not the bump suffix.
- Hostile `__fungi_heap_get()===1096` with wordsGet **1**: finalize **7**.
  Heap getter is unused by copy length.
- Hostile wordsGet **8** after storing `[7,99]`: frozen 8-word array
  `[7,99,0,0,0,0,0,0]`. Guest-lied tag, not `$__fungi_heap`.
- Hostile wordsGet **80**: frozen length **64** (silent cap).
- 70 extra `Cell`s after a returned `Cell`: span **71**, wordsGet **1**,
  production **7** (prior HOLD copied 64-word prefix).
- 65-field last-allocated `Huge`: **parse refuse** (`FUNGI-PARSE-008` /
  `MAX_RECORD_FIELDS = 64`).
- Last-allocated `Pair { a: Int64, b: Int64 }`: production frozen
  **`[7,0,9,0]`** (layout 16 bytes → 4 i32 words).
- Last-allocated 33-field `Int64` record: production frozen length **64**,
  first `1,0,2,0`, last `31,0,32,0`. Field 33 is not in the host result.
  Last-allocated, so this shape cannot distinguish layout-cap from suffix-cap.
- Honest compiler WAT: `$__fungi_ret_words` mut global, `__fungi_ret_words_get`
  export, **no** `(export "__fungi_heap"`.
- Finalize **body** (src+dist): has `__fungi_ret_words_get`; has **no**
  `__fungi_heap_get`; has **no** `endExclusive`. JSDoc immediately above the
  function still says copy `[ptr, $__fungi_heap)`.

## Challenge 1 — leftover suffix copy `[ptr, $__fungi_heap)`?

**No on the copy path. CONFIRMED closed for leftover suffix copy.
Documentation leftovers remain.**

Locator: `wasm-runtime.ts` 841–847 / dist 706–708:

```text
wordsGet = exports["__fungi_ret_words_get"]
taggedWords = typeof wordsGet === "function" ? wordsGet() : 1
count = min(64, max(1, safeInteger(taggedWords) ? taggedWords : 1), view.length - start)
```

There is no `endExclusive = heap > result ? …` and no `__fungi_heap_get` in
the finalize body. Copy length is the guest tag (default **1** if the getter
is missing or not a safe integer), capped at 64 and remaining view.

Guest tag source: `wat-emitter.ts` 4681–4684
`returnWordCount = floor(recordLayout.size / 4)` from `buildWATRecordLayouts`;
set at heap `(return` rewrite (`rewriteHeapReturnTag`, 708) and at the heap
exit wrapper (993) as `(global.set $__fungi_ret_words (i32.const ${wordCount}))`.
Sec → `i32.const 1`. Wide → `i32.const 3`. That is declared layout size, not
live `heap - ptr`.

Distinguishing probes (suffix still visible in WASM memory; host result is
not the suffix):

| honest program | live `[ptr, heap)` | production |
|---|---|---|
| Sec then extra `Sec { a: 99 }`, return first | `[7,99]` | **7** |
| Wide then extra Cell | `[7,7,7,99]` | **`[7,7,7]`** |
| 70 extra Cells after Cell | 71-word span | **7** |
| Outer { inner: Inner {7,99} } | `[1028,7,99]` | **1028** |

The prior HOLD’s extra-after inflation is gone on honest compiler programs.

Leftover **comments**, not leftover copy:

- `wasm-runtime.ts` 816 / dist 685 JSDoc still says copy `[ptr, $__fungi_heap)`.
- Q1 Wide test 315 still says `host must copy [ptr, heap), not only word 0`.

Missing getter is **not** a suffix fallback: live `[7,99]` finalizes to **7**.
A host-writable `__fungi_heap_get()===1096` is ignored for copy length.

## Challenge 2 — extra live allocations after `ptr` inflate the copy?

**No for honest compiler layout tags. CONFIRMED closed for this continue.**

Locator: Q1 `copies only the returned record, not later allocations`; probe
extra-after / Wide-then-Cell / 70 extras.

`return r` after a later `Sec { a: 99 }` stays numeric **7**. Wide + later
Cell stays **`[7,7,7]`**. 71-word span stays **7**, not a 64-word prefix.

Adversarial WAT that exports `__fungi_ret_words_get === 8` still copies eight
i32s including the extra 99. That is a guest-lied tag, not bump-suffix
recovery. Honest compiler stores `i32.const` layout size.

## Challenge 3 — named wiring (Wide / Sec / Int / admit+invoke / add)?

**Yes. CONFIRMED.**

Locator: Q1 8/8; `seam-adapters.ts` 150; `wasm-invoke-worker.mjs` 18;
`wasm-runtime.ts` 859–872; compiler `src/index.ts` 1282–1286 re-export.

- Last-allocated Wide → frozen `[7,7,7]`.
- Last-allocated Sec → number `7`.
- Extra-after Sec → number `7`.
- Secret Int 1024 after an allocation → `1024`.
- `admitAndInstantiate` still returns a raw instance; the Q1 caller uses
  `invokeAdmittedExport` and gets `7`.
- `createLowLevelWasmExecutor.instantiateAndCall` returns
  `invokeAdmittedExport(...)`.
- Modules without `__fungi_wipe_owned` still return `add` **42**.

## Challenge 4 — 64-word cap leftover?

**Silent truncate remains. CONFIRMED residual; not leftover suffix copy.**

Locator: `wasm-runtime.ts` 813 `MAX_COPIED_RECORD_WORDS = 64` and 843–847
`Math.min(64, taggedWords, remaining)`. No throw.

- Parser `MAX_RECORD_FIELDS = 64`. A 65-field last-allocated `Huge` does not
  assemble. Last-allocated **flat Int** records still cannot exceed 64 host
  words.
- Honest last-allocated **33-field Int64** record: layout 66 i32 words,
  production frozen length **64**, last copied value **32**. Field 33 is
  dropped. Last-allocated, so this does not re-open suffix copy.
- Hostile wordsGet 80: length 64.

The cap now bounds the **tagged layout word count**, not the arena suffix.
It is still fail-open truncate, not fail-closed refuse.

## Challenge 5 — nested records copied as a full payload?

**No. CONFIRMED residual: copy is the outer layout (one i32 handle).**

Locator: `buildWATRecordLayouts` + `galerinaTypeToWAT` default i32 handle;
probe nested Outer.

`Outer { inner: Inner }` has layout size 4 → `returnWordCount = 1`. Production
**1028**. Suffix `[1028,7,99]` is **not** copied. After guest wipe the inner
payload is gone; the host number is a dangling pointer. This is under-copy of
nested payload, not leftover suffix inflation. Type-aware nested copy is
still open.

## Lane status

| Claim | This continue | Label |
|---|---|---|
| Copy length is `__fungi_ret_words_get` from layout size | src 841–847; Sec `1`; Wide `3`; extra-after not suffix | **CONFIRMED** |
| Leftover `[ptr, heap)` suffix copy still used | extra-after 7; Wide+Cell `[7,7,7]`; 70 extras 7; missing getter 7 | **REFUTED** |
| JSDoc / Q1 Wide message still say `[ptr, heap)` | wasm-runtime.ts 816; Q1 315 | **CONFIRMED leftover comments** |
| Missing getter falls back to suffix | finalize default 1; `[7,99]` → 7 | **REFUTED** |
| `__fungi_heap_get` still keys copy length | heapGet 1096 still 7; finalize body has no heap_get | **REFUTED** |
| Extra-after inflates the host result | production 7, not `[7,99]` | **REFUTED** (closed) |
| Wide+later Cell inflates | production `[7,7,7]`, not `[7,7,7,99]` | **REFUTED** (closed) |
| Nested Outer copies inner payload | production 1028, not `[1028,7,99]` | **REFUTED** as suffix; **CONFIRMED** dangling handle residual |
| 64-word cap fail-closes | silent `Math.min`; 33×Int64 copies 64 | **REFUTED** as fail-closed |
| Last-allocated 65-field Int record hits the host cap | parser refuses at 64 fields | **CONFIRMED** unreachable that way |
| 1 word stays a number; several become a frozen array | extra-after/Sec `7`; Wide frozen; assign/push throw | **CONFIRMED** |
| `invokeAdmittedExport` wraps call+finalize | src 859–872 | **CONFIRMED** |
| `createLowLevelWasmExecutor` uses `invokeAdmittedExport` | `seam-adapters.ts` 150; hash unchanged | **CONFIRMED** |
| `wasm-invoke-worker` uses `invokeAdmittedExport` | worker 18; compiler re-export | **CONFIRMED** |
| Production extra-after Sec `7` | Q1 8/8 + probe | **CONFIRMED** |
| Production Wide `[7,7,7]` | Q1 8/8 + probe | **CONFIRMED** last-allocated |
| Production Int `1024` | Q1 8/8 + probe | **CONFIRMED** |
| `admitAndInstantiate` + invoke `7` | Q1 admit test + probe | **CONFIRMED** |
| `admitAndInstantiate` itself copy-then-wipes | still returns raw instance; raw `h(7)` is ptr 1024 | **CONFIRMED residual** |
| Modules without wipe still return 42 for `add` | 20/20 | **CONFIRMED** |
| Guest wipe still zeros the owned arena after copy | helper extra-after `[7,99]` → `[0,0]` | **CONFIRMED** |
| Nested `outer(7)` stays 14 | Q1 23/23 + probe production 14 | **CONFIRMED** non-regression |
| Trap path still skip-wipes | `invokeAdmittedExport` catch does not call finalize | **CONFIRMED residual** |
| Hostile words getter can still copy extra words | wordsGet 8 → `[7,99,0…]` | **CONFIRMED residual** (guest tag, not suffix) |

## Deferred — do not claim closed

These remain open and were **not** started by this review:

- JSON-Decimal (RD-1289)
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend
- 124-finding Galerina scan
- host/import exception wipe (wasm-standalone still has zero `(import`)
- trap-path wipe (`invokeAdmittedExport` catch skips finalize)
- `admitAndInstantiate` callers that still invoke the export directly
- exported `memory` remains host-writable
- type-aware nested secret record copy (outer handle vs inner payload)
- fail-closed refuse when tagged words exceed 64 or the live object
- i64/f64 fields presented as i32 word arrays (`[7,0,9,0]`)
- stale JSDoc / Q1 assertion string still describing `[ptr, heap)`
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony
- prior HOLD residuals on `$__fungi_ret_is_heap` at every secret exit (not
  re-opened here; named Q1 early-heap and nested production cases are green)

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE** for production.

## Overall

**PASS** of leftover suffix copy on this dirty candidate.

The named wiring happened: `finalizeSecretExportResult` copies
`__fungi_ret_words_get` words from the pointer (layout `floor(size/4)`,
default 1 if the getter is missing); one word stays a number and several
become a frozen array; `invokeAdmittedExport` wraps call+finalize; the
production executor and wasm-invoke-worker use it; extra-after Sec is **7**
not `[7,99]`; Wide is `[7,7,7]`; Int 1024 stays 1024; admit+invoke is `7`;
`add` is still 42. Independent Wide+later Cell is `[7,7,7]` not
`[7,7,7,99]`. Missing getter and `__fungi_heap_get` do not restore the bump
suffix. That closes the prior HOLD’s **`[ptr, $__fungi_heap)` copy length**.

It is not production clearance:

1. JSDoc and the Wide test message still *say* `[ptr, heap)`. The copy path
   does not.
2. Nested Outer copies one i32 handle (**1028**) then wipes the inner
   payload. That is under-copy, not suffix inflation.
3. The 64-word cap is still silent truncate (honest 33×Int64; hostile
   wordsGet 80).
4. `admitAndInstantiate` still returns a raw instance. Trap paths still
   skip finalize.

Do not treat 8/8, 20/20, and extra 23/23 on this dirty candidate as
clean-HEAD or production clearance. Do not treat last-allocated Wide
`[7,7,7]` alone as the suffix-copy oracle; extra-after and Wide+later Cell
are.
