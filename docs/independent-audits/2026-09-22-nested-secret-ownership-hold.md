# Independent audit — nested secret-memory ownership

**Verdict: HOLD**

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by this
reviewer. Nothing was committed. This receipt is not the author’s packet.

Scope is the nested secret-memory ownership batch in `wat-emitter.ts`:
`$__fungi_owner_base` snapshot, G5c/G5b/on-exit wipe of `[owner_base, heap)`
with heap restore, and `wipeSecretHeapAfterHostCopy` filling
`[WAT_HEAP_BASE, heap)` rather than whole memory. JSON-Decimal, OAuth, and a
durable replay backend were **not** started.

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/`.
`dist/wat-emitter.js` mtime is newer than `src/wat-emitter.ts` on this host
and contains the same owner-base / host-wipe logic.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `5677b2285a0ee7c227518b06c3770d023af8473b72b801d39d30ad2498844008` |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | `c0fa475f275cae77b60361e58ab62ae92b9df409510a4b783a9a91e1c370b78b` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `333b3a93d0552123f4c05561f96855292dcef53e391ffa34f39f24c131f1887c` |

`wat-emitter.ts` differs from the earlier Q1 repair-revision pin
(`e880c4fa…`) and from the pre-repair frozen pin (`56f31f24…`). Passing
tests here are **not** production admission.

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern="nested secret|sentinel above" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **2/2 pass**, `duration_ms 347.9008`. Nested `outer(7)===14`. Sentinel `0x11111111` above heap survived.
2. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **15/15 pass**, `duration_ms 417.458`. File grew from the earlier 13 cases by the nested and sentinel tests.

Independent extra probes (temp script under `%TEMP%`, not production):

- Nested WAT: inner snapshots `$__fungi_owner_base`, does **not** rebase to 1024, G5c fill is `(local.get $__fungi_owner_base)` then `global.set $__fungi_heap` back to that local. Outer **does** rebase (leaf). `outer(7)===14`. Arena words after return are `0,0,0`.
- Two-cell caller `Pair { a:s, b:s } + inner(s)` → **21**, not 14. If inner had wiped the caller Pair, the sum would be `0+0+7`.
- Planted `0x7e7e7e7e` at 1024 with heap at 1028, then `inner(7)` as an export in the nested module: plant **survived**. Inner is referenced by outer, so it is not a leaf and does not run `prevArenaFill` from module base.
- `outer(11)` fall-through inner (`return 1`) → **12**.
- Honest host wipe: heap 1028, sentinel at 1092 = `0x11111111` after fill. Field at 1024 becomes 0.
- Inflate `__fungi_heap` to 1096 then wipe: sentinel becomes **0**.
- Rebase `__fungi_heap` to 1024 then wipe: field stays **7** (empty fill).
- `wipeSecretHeapAfterHostCopy(instance, true)` with **no** prior copy destroys the live WASM field. `false` / `undefined` / `{valueOf: () => true}` throw `/copied/`.

## Challenge 1 — can inner still wipe caller?

**Not on the tested nested shapes. CONFIRMED repaired for those shapes.**

Locator: `wat-emitter.ts` 781–795 (leaf = exported and not `(call $name`), 822 `emitArenaReset`, 838–840 `ownedFill`, 924–926 owner-base snapshot, 851–852 G5c rewrite.

Inner in the nested module is exported **and** referenced, so `emitArenaReset` is false. It snapshots the live bump pointer, allocates above it, then G5c/G5b wipe only `[owner_base, heap)` and restore the bump pointer. Outer’s Cell at 1024 stays live across `inner(7)`, so `o.a + x` is 14 not 7. Two-cell 21 and the planted-word probe agree.

Residuals, not a demonstrated inner-wipes-caller hole on wasm-standalone direct calls:

- Leaf classification is a substring on `fn.body` (`(call $name ` or `(call $name)`). A missed call form would classify inner as a leaf: on-entry `prevArenaFill` from `WAT_HEAP_BASE` **would** destroy the caller. Direct `(call $inner (local.get $p0))` is detected. `call_indirect` / host re-entrancy is **NOT VERIFIABLE** here (zero `(import`)).
- Non-leaf inner’s `return 1` tail is a fall-through `i32.const 1`, not G5c, and `emitZeroOnExit` is still leaf-gated. That leaves inner remanence until the caller’s exit wipe; it does not wipe the caller (`outer(11)===12`).
- WASM `owner_base` defaults to 0. The nested inner WAT does `local.set` before any allocate/wipe. An injection miss would fill from 0 and wipe the caller. **Not shown** on this emitter output.

## Challenge 2 — can host wipe past heap?

**The helper does not fill past the current `__fungi_heap` value. A host can still wipe past live data. CONFIRMED both.**

Locator: `wat-emitter.ts` 679–701.

```text
end = min(memory.length, heap)
view.fill(0, WAT_HEAP_BASE, end)
```

Honest path: heap 1028, sentinel `0x11111111` at 1092 survives. This batch does **not** fill whole memory. That is the sentinel test’s oracle.

The helper **trusts** the exported global. Independent probe: set `__fungi_heap` to 1096, call with `copied: true`, sentinel is 0. Memory is already exported, so a host can also `fill` anything without this helper.

Rebase no-op is open again: `__fungi_heap.value = 1024` then wipe leaves the secret word at 7. An earlier Q1 note filled `[WAT_HEAP_BASE, memory.length)` specifically so a rebased heap could not no-op the wipe. Bounding to `heap` saves the sentinel and restores that no-op. **HOLD** residual.

No production host path invokes the helper. Host/import exception wipe remains **NOT VERIFIABLE** on wasm-standalone.

## Challenge 3 — is `copied: true` still a flag?

**Yes. CONFIRMED.**

The TypeScript parameter is the literal `copied: true`. At runtime the check is `copied !== true`. There is no destination buffer, length, or copy proof. Passing `true` without copying zeros the live WASM field. Passing `false` throws, which is what the suite asserts — that is “the flag rejects false”, not “a copy occurred”.

## Lane status

| Claim | This batch | Label |
|---|---|---|
| Nested `outer(7)` is 14 not 7 | 14; two-cell 21; planted word survives exported inner | **CONFIRMED repaired** for wasm-standalone direct nested calls |
| Inner G5c/G5b/on-exit wipe `[owner_base, heap)` and restore heap | present in inner WAT; inner does not fill from 1024 | **CONFIRMED** on this output |
| Host cleanup does not erase sentinel above heap | honest path sentinel survives | **CONFIRMED** for the current `__fungi_heap` value |
| Host cannot wipe past live heap | inflate global, sentinel dies | **REFUTED** as a host-trust claim |
| `copied: true` is more than a protocol flag | live field destroyed when true is passed without a copy | **REFUTED** |
| Rebased heap cannot no-op host wipe | field stays 7 | **REFUTED** (reopened by bounding fill to heap) |

## Deferred — do not claim closed

These remain open and were **not** started by this review:

- JSON-Decimal (RD-1289)
- OAuth / webhook App Kernel only
- RD-1286 admitted durable replay backend
- 124-finding Galerina scan
- host/import exception wipe
- production admission / `.fungi` / signing / commits
- independent production-clearance ceremony

Overall status remains **INCOMPLETE_NON_AUTHORITATIVE**.

## Overall

**HOLD.** Nested guest ownership is repaired on the shapes that used to return 7 instead of 14, and the honest host fill no longer erases a sentinel above the live bump pointer. That is not a PASS of the batch:

1. `copied: true` is still a flag (challenge 3).
2. A host can raise `__fungi_heap` and wipe past live data, or rebase it and no-op the wipe (challenge 2).
3. Inner-wipes-caller is closed for direct nested calls; leaf-misclassification remains a PLAUSIBLE residual, not shown.

Do not treat 15/15 on this dirty candidate as clean-HEAD or production clearance.
