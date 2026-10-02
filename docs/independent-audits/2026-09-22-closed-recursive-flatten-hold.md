# Independent audit — closed recursive secret-heap flatten (`Node { child: Node, n: Int }`)

**Verdict: PASS** (scoped to “secret heap flatten of recursive record
`Node { child: Node, n: Int }` copies one closed inner layout plus outer `n`,
with no live heap pointer `>= 1024` and no 8-hop zero pad”). Filename keeps
the requested `*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed, pushed, merged, or signed. This receipt is
not the author’s packet, not GPT-6 Astra, **not** 124-scan closure, and **not**
items 1–15 complete.

This file reviews the continue after
`docs/independent-audits/2026-09-22-null-flatten-hold.md` /
`docs/independent-audits/2026-09-22-cyclic-flatten-hold.md`. Those PASSed
“no live child pointer” and “do not `i32.load` address 0”, but the production
copy of `Node { child: Node { n: 1 }, n: 7 }` was still the 8-hop pad
**`[0,0,0,0,0,0,0,0,1,7]`**. A lossy ancestor-zero would have been **`[0,7]`**.

Named claim on this continue:

- Fixture `return Node { child: Node { n: 1 }, n: s }` with `s=7` → production
  copy **`[0, 1, 7]`** (inner `n` kept; grandchild pointer zeroed).
- Omitted child `return Node { n: s }` must not load address 0; expected
  **`[0, 0, 7]`**.
- Acyclic `Outer { inner: Sec { a: s }, n: 99 }` remains **`[7, 99]`**.
- Nested `outer(7)===14` still holds.

JSON-Decimal, OAuth, durable replay, and the 124-finding scan were **not**
started.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` and contains
`flattenClosedRecursivePlan`, ancestor-set `flattenPlanFor`,
`emitFlattenStores`, and `flattenFromHeapRet` matching src. Tests load
`dist/index.js`, which re-exports `buildWATModuleFromGIR` from
`./wat-emitter.js`.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `377ff5f0912542085bdf620c705f2be24cdd37e921c8bf3a22214b560249522e` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `0bd91cd093e1a454ccb6d9bd8783fe80b20da6eb4c100ed7a40e9c5c7e589da1` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `caa56ee4e80d255f7d2b916364c130fe254b9075fe5b5098f1edfdf2cec44426` |
| `packages-ts/galerina-core-compiler/src/index.ts` | `1d022aa96f0b4e0e17804961f33724681b3016e1445b08bf96276336e7e113b9` |
| `packages-ts/galerina-core-compiler/dist/index.js` | `ee263c482991a71e48a07c2ac4c7a4acc46f33bd1aae5ec16ca4020283003523` |
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `86bee8d24cca6e28c7df3e72ed61425199f0db34207f0802379156002818bcf7` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `7dc79a1fbb59ab4d50209cf8c6a3603ac694b21370bc22ff6f118a3778c8c35a` |

`wat-emitter.ts` is dirty vs HEAD and differs from the null-flatten pin
(`b199e7e4…`). Dist mtime `2026-09-22T22:52:28+01:00` is after src
`2026-09-22T22:52:17+01:00`. The Q1 test file is untracked and differs
(`d41d54a8…`) by exact `[0,1,7]` / `[0,0,7]` oracles. `wasm-runtime.ts`
does **not** (`86bee8d2…`); host copy remains “guest-tagged word list then
wipe”. Passing tests here are **not** production admission.

Subject dirty paths: `packages-ts/galerina-core-compiler/src/wat-emitter.ts`
(modified), `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs`
(untracked). Unrelated retained dirty paths on this HEAD were not reset.

## Requirement-to-evidence matrix

| requirement | evidence class | result |
|---|---|---|
| Recursive `child: Node` is a nested closed plan, not `{zero:true}` and not `MAX_FLATTEN_DEPTH=8` unroll | source inspect of `flattenPlanFor` / `flattenClosedRecursivePlan` | **CONFIRMED** |
| Production copy `[0,1,7]` for `Node { child: Node { n: 1 }, n: 7 }` | Q1 cyclic test + independent probe | **CONFIRMED** |
| Omitted child does not load address 0; copy `[0,0,7]` | Q1 address-0 test + probe | **CONFIRMED** |
| Acyclic `Outer` still `[7,99]` | Q1 nested-rec test + probe | **CONFIRMED** |
| Nested `outer(7)===14` | Q1 nested-secret test + probe | **CONFIRMED** |
| `[0,1,7]` detector can go red on loss / pad / live pointer | `assert.deepEqual` discrimination probe | **CONFIRMED** (would **not** accept `[0,7]`) |
| Deeper than one recursive expansion drops grandchild secrets | independent deeper-tree probe | residual, **CONFIRMED** |
| Compile-time closed plan is not a runtime cycle walk | source + self-ref trap | residual, **CONFIRMED** |
| `let leaf = Node { child: leaf }` may trap | independent self-ref probe | residual, **CONFIRMED** (`unreachable`) |
| Exported memory remains host-writable | WAT `(export "memory"` | residual, **CONFIRMED** |

## Source inspect (before tests)

Locator: `packages-ts/galerina-core-compiler/src/wat-emitter.ts`
`flattenClosedRecursivePlan` 416–434, `flattenPlanFor` 436–465,
`flattenFromHeapRet` 485–535, `emitFlattenStores` 537–580,
call site 4858–4871. Dist JS counterparts present at the same symbols.

`flattenPlanFor("Node", layouts)` adds `Node` to `ancestors` **before** walking
fields. `child: Node` therefore hits `next.has(field.type)` on the **first**
expansion and does **not** recurse `flattenPlanFor` eight times:

```text
flattenClosedRecursivePlan(Node):
  child (i32 record) → { srcOffset: 0, zero: true }   // grandchild pointer
  n     (Int)        → { srcOffset: 4 }               // inner n copy

flattenPlanFor(Node):
  child → { srcOffset: 0, nested: <closed Node> }     // NOT {zero:true}
  n     → { srcOffset: 4 }
flattenWordCount = 3
```

That is one closed inner layout (zero grandchild + copy inner `n`) plus outer
`n`. A single `{zero:true}` child would be two words (`[0, 7]`). The still-
present `MAX_FLATTEN_DEPTH = 8` bound is **not** the Node path: only `$__fungi_n0`
is allocated (`flattenNeedsTemps === 1`); there is no `$__fungi_n1`…`$__fungi_n7`
and `__fungi_ret_words` is `i32.const 3`, not `10`.

`emitFlattenStores` for the nested child:

1. `(local.set $__fungi_n0 (i32.load (heap_ret + 0)))`
2. `(if (i32.lt_u $__fungi_n0 (i32.const 1024)) (then two zero-stores) (else grandchild i32.const 0 + load n0+4))`
3. copy root `n` from `heap_ret+4` to dest+8

`flattenFromHeapRet` still null-checks `$__fungi_heap_ret` with
`i32.lt_u` vs `WAT_HEAP_BASE` (1024) and `memory.fill`s zeros instead of
loading address 0. Host `finalizeSecretExportResult` copies
`__fungi_ret_words` contiguous i32s then guest-wipes; it does not re-walk
the graph.

`#record` construction (`wat-emitter.ts` 2263–2308) stores **only named
literal fields**. `return Node { n: s }` bump-allocates the full 8-byte
layout but does not `i32.store` the omitted `child` slot. On a fresh
instance that slot is 0; flatten then takes the `< HEAP_BASE` branch.
That is enough for the named address-0 oracle. It is **not** an explicit
zero-init of omitted recursive fields.

## Command receipts

1. Intended named oracles (PowerShell-safe pattern so `outer.a + inner` matches):

   `node --test --test-timeout=120000 --test-name-pattern='cyclic nested|flattens nested|does not load a nested|outer.a \+ inner' packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs`

   → **4/4 pass**, `duration_ms 368.3712`.
   - `Q1 production executor does not copy a cyclic nested child pointer`
     deep-equals **`[0, 1, 7]`** and every word `< 1024`.
   - `Q1 flatten does not load a nested record through address 0` plants
     `memory[0]=0x11111111` / `memory[1]=0x22222222` on a raw instance of
     `Node { n: s }`, then `finalizeSecretExportResult(instance, h(7))`.
     Sentinels absent; words **`[0, 0, 7]`**.
   - `Q1 production executor flattens nested heap records` deep-equals
     **`[7, 99]`**.
   - `Q1 nested secret call preserves caller allocation: outer.a + inner = 14`
     still `outer(7)===14`.

   A first run with the prompt’s double-quoted `outer.a \\+ inner` matched
   only **3/3** (the `+` test did not select). That miss is quoting, not a
   product skip; the 4/4 run above is the named-oracle receipt.

2. Full Q1 file:

   `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs`

   → **27/27 pass**, `duration_ms 532.2916`.

Independent extra probe (`%TEMP%\closed-recursive-flatten-probe.mjs`, not
production):

- Detector discrimination against expected `[0,1,7]`:
  - lossy `[0,7]` → `deepEqual` **red**
  - 8-hop pad `[0×8,1,7]` → `deepEqual` **red**
  - live `[1032,7]` and `[0,1032,7]` → `deepEqual` **red** and `>= 1024` **true**
- Named finite tree: WAT `ret_words=3`, `maxTemp=0` (only `$__fungi_n0`),
  grandchild zero-store at dest 0, inner `n` load from `$__fungi_n0+4`,
  outer `n` load from `$__fungi_heap_ret+4`, **no** `$__fungi_n1`.
  Guest flat ptr **1040** live words **`[0,1,7]`**. Production frozen
  **`[0,1,7]`**. Words `>= 1024`: **none**.
- Omitted child: guest ptr **1032** live words **`[0,0,7]`**;
  `ret_words=3`. Production **`[0,0,7]`**.
- Acyclic Outer: production **`[7,99]`**; `ret_words=2`.
- Nested `outer(7)`: **14**.
- Deeper tree `Node { child: Node { child: Node { n: 2 }, n: 1 }, n: 7 }`:
  production **`[0,1,7]`** — grandchild secret `2` **dropped**.
- Self-referential `let leaf: Node = Node { child: leaf, n: s }`: assembles
  with the same 3-word flatten and **traps** `unreachable` on raw `h(7)`.
- WAT still `(export "memory"`.

## Challenge — would `[0,1,7]` pass a dropped-inner-n `[0,7]` implementation?

**No.** `assert.deepEqual(r.result, [0, 1, 7])` turns red on `[0,7]`, on the
previous 8-hop pad, and on a live child pointer. The additional
`every(w < HEAP_BASE)` clause rejects `>= 1024` even if the array shape were
loosened. This is a discriminating known-answer gate, not a happy-path-only
check.

| implementation | production shape | `[0,1,7]` gate |
|---|---|---|
| prior dangling pointer | `[1032,7]` | red (value + live ptr) |
| lossy ancestor-zero | `[0,7]` | red (length + missing inner n) |
| `MAX_FLATTEN_DEPTH=8` pad | `[0,0,0,0,0,0,0,0,1,7]` | red (length) |
| this continue | `[0,1,7]` | green |

## Residuals (not blockers of the named oracles)

- **Deeper than one recursive expansion still drops grandchild secrets.**
  Confirmed: `n=2` in a three-level tree is not in the host copy. The closed
  inner plan zeros nested record fields of the child type; it does not walk
  further Nodes at runtime.
- **Compile-time closed plan is not a runtime cycle walk.** `ancestors` is a
  type-name set. Mutual `A`/`B` recursion and mixed `Node { child: Node, payload: Sec }`
  would close *all* inner nested records to zero, including non-recursive
  payloads on the closed expansion.
- **Self-referential `let leaf = Node { child: leaf }` traps** `unreachable`
  (confirmed). No host copy.
- **Exported `memory` remains host-writable.** Host can still plant sentinels;
  the named omit test only proves flatten does not chase address 0 on this
  fixture.
- **`#record` does not store omitted fields as `i32.const 0`.** Honest omitted
  `child` is 0 on a fresh arena; a stale `>= 1024` leftover in that slot would
  be treated as a live inner Node. Not exercised by the named omit oracle.
- **`MAX_FLATTEN_DEPTH = 8` remains** for acyclic deep nesting; it is unused
  for this recursive `Node` axis.
- Non-secret cyclic Node (no `privacy`) is outside this secret-heap claim.
- This dirty HEAD is **not** clean-HEAD production admission.

## Challenge — production copy of secret `Node { child: Node { n: 1 }, n: 7 }` is one closed inner layout plus outer n, with no live pointer and no 8-hop pad?

**Yes for the named fixtures. CONFIRMED closed for the prior 8-hop pad and
the lossy `[0,7]` ancestor-zero on this shape.**

Locator: `wat-emitter.ts` 416–580 / 4858–4871; Q1 tests 336–388 and 186–198;
production executor `createLowLevelWasmExecutor().instantiateAndCall`.
