# Independent audit — WASM host array store internArrayItems bounds

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree (`Test-Path` False). It is **not**
clean-HEAD evidence. Production sources and tests were not edited by this
reviewer. Nothing was committed, merged, pushed, or signed. `.fungi` was
not touched. This receipt is not the author’s packet and is not GPT Astra.
Passing tests here are **not** production admission. Finding inventory was
**not** promoted. `csf_e3409dfe75ff7adda18f556a` stays
**PARTIAL_THIS_TREE**. Do **not** promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `createHostRuntime` now internArrayItems with `MAX_WASM_ARRAYS` 4096
  and `MAX_WASM_ARRAY_ITEMS` 1_000_000. `internArray`, `__array_create`,
  and `__range` go through that helper.
- `internArray` throws on `items.length > MAX` before map/copy.
- `__array_append` refuses unknown handles (no sparse fill) and refuses
  append when `arr.length >= MAX_WASM_ARRAY_ITEMS`.
- Hostile: `internArray(new Array(MAX+1))`; unknown append 99; 4097
  `__array_create`.
- Positive: `internArray([1,2,3])`; existing `__range` tests still pass.
- Tests `wasm-runtime.test.mjs` **15/15**.
- Residual: `internString` and other host registries unbounded; 1e6
  append item-cap not live-exercised.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/wasm-runtime.js`, hashed working-tree bytes, re-ran
`npx tsc -p tsconfig.json` then the named suite, and executed an extra
probe from `%TEMP%` (not by trusting the named tests alone). Independent
`crypto.createHash('sha256')` and `Get-FileHash` **MATCH** each other on
every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | **M** HEAD blob `93a8b55b77` → WT blob `86a35568c2`. HEAD had no `MAX_WASM_ARRAYS` / `MAX_WASM_ARRAY_ITEMS`. `__array_create` was `arrays.push([])`. `__array_append` was `(arrays[id] ?? (arrays[id] = [])).push(item)` (sparse fill). `__range` and `internArray` pushed directly. THIS TURN: helper `internArrayItems`; `internArray` length-check then `items.map`; unknown-handle refuse; append cap `arr.length >= MAX`. |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | **M** HEAD blob `58c5779782` → WT blob `41b12c3558`. THIS TURN: re-export `MAX_WASM_ARRAYS`, `MAX_WASM_ARRAY_ITEMS`. |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | **M** HEAD blob `076d2784c6` → WT blob `6feb337ac9`. THIS TURN: positive `[1,2,3]`; hostile `new Array(MAX+1)`; unknown append 99; 4097 `__array_create`. Existing `__range` tests unchanged. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | gitignored; rebuilt this review (`tsc`); `internArrayItems` 165–175, `internArray` 648–653 match src. |

Prior independent receipt
`docs/independent-audits/2026-09-22-wasm-range-host-hold.md` recorded that
`internArray` and `__array_append` still stored 100000 items after the
`__range` guest-words/fuel bound. That unbounded-array-store residual is
closed on this dirty tree for the named internArrayItems / unknown-append
/ create-cap claim. `internString` and sibling registries remain uncapped.
Named tests still do not loop to 1e6 appends.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | 53956 | `3abfff762e5e8364cade53b14dd45108d3c211f936da43c3de236353241143c6` | 2026-09-23T18:22:14.369Z |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | 1423 | `297760835881f1ddb5a77b669e2070f83fcf6b808f28a1ee8cd34e2ad59e842d` | 2026-09-23T18:22:14.346Z |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | 5647 | `e42bca1f91f3f1cf10a8ac1ca2b3563def89fcbd15e3732ab9ad02fc140e6855` | 2026-09-23T18:22:14.355Z |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | 44757 | `9ac80b3039be67f0ca76cbcec1ed1c8b1bbd63d9f11e0c458a0a8bafd4584c3f` | 2026-09-23T18:24:01.438Z |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | 1229 | `ff4e408683461b1e574c2659ac3e7d3be2740f57fc8d62c58014e16dcae4a5dd` | 2026-09-23T18:24:01.449Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suite imports dist (`packages-ts/.gitignore`
`dist/`). Barrel `dist/index.js` re-exports `MAX_WASM_ARRAYS` /
`MAX_WASM_ARRAY_ITEMS` from `./wasm-runtime.js`.

Inventory `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` already
records `csf_e3409dfe75ff7adda18f556a` as `PARTIAL_THIS_TREE` (medium;
title “WASM's range host import allocates outside guest memory and fuel
limits”; path `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`).
Independent recount of that file: **0 OPEN / 120 PARTIAL_THIS_TREE /
4 PATCHED_AUDIT_PENDING** (`n` 124). This review does **not**
recategorize that row.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| internArrayItems helper | `MAX_WASM_ARRAYS` 4096, `MAX_WASM_ARRAY_ITEMS` 1_000_000; internArray / `__array_create` / `__range` use helper | src 34–35, 303–313, 370–372, 607, 623, 767–772; dist 30–31, 165–175, 230–232, 462, 479, 648–653 | create 4096 then 4097 **pass**; internArray hostile **pass**; `__range` still **pass** | TEMP: `MAX_WASM_ARRAYS:4096` `MAX_WASM_ARRAY_ITEMS:1000000`; `create4097.threw:true` | helper pushes `items` by reference after admit |
| internArray before map/copy | throw `items.length > MAX` before `items.map` | src 768–771; dist 649–652 | hostile `new Array(MAX+1)` **pass** 2.0108ms | TEMP: `copied:false` (patched `Array.prototype.map`); `threw:true` `msg:Array cardinality exceeds the host bound` | internArrayItems still re-checks length after map |
| `__array_append` unknown handle | refuse, no sparse fill | src 375–381; dist 235–241 | hostile append 99 **pass** 0.199ms | TEMP: `threw:true` `unknown array handle 99`; `readArray(99)` absent | `__array_get` still `arrays[id] ?? []` (out of named claim) |
| `__array_append` item cap | refuse when `arr.length >= MAX_WASM_ARRAY_ITEMS` | src 382–384; dist 242–244 | **not** in named 15 tests | TEMP: internArray of 1e6 then one append `threw:true` `internedLen:1000000` `internMs:10` | **named-suite residual**; extra probe closed the code path |
| hostile internArray `MAX+1` | `new Array(MAX+1)` throws cardinality | tests 86–90 | **pass** | TEMP `hugeLength:1000001` `copied:false` | sparse holes, not filled 1e6+1 values |
| hostile unknown append 99 | no sparse fill at handle 99 | tests 92–95 | **pass** | TEMP as above | — |
| hostile 4097 `__array_create` | 4096 creates then refuse | tests 97–102 | **pass** 0.6312ms | TEMP `Array store exceeds the host bound` | — |
| positive internArray `[1,2,3]` | stores small i32 list | tests 80–84 | **pass** 0.255ms | TEMP `items:[1,2,3]` | — |
| existing `__range` still pass | exclusive `[2,3,4,5,6]`; 1e5 refuse; fuel; bindMemory | tests 57–78 | **4/4 pass** | TEMP `range27:[2,3,4,5,6]` `range1e5:cardinality exceeds guest memory` | `__range` still has its own guest-words/fuel gate before internArrayItems |
| focused tests | 15/15 | named command below | **15/15** 0 fail 0 skip `duration_ms 143.172` | TEMP is extra, not a count | suite imports dist, not src |
| internString / other registries | still unbounded | src 743–745 internString; 314 results; 319 options; 320 moneys; 321 decimals; 753–757 internDecimal; dist 620–638 | **not** in named tests | TEMP: 5000 internString last `s4999` `threw:false`; 5000 internDecimal last `1.00` `threw:false` | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   and tests **M**. `Galerina.worktrees` is not this tree.

2. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-core-runtime-wasm` → **exit 0**.

3. `node --test tests/wasm-runtime.test.mjs` in
   `packages-ts/galerina-core-runtime-wasm`
   → **15/15 pass**, 0 fail, 0 skip, `duration_ms 143.172`.

Independent extra (`%TEMP%\zt-wasm-array-store-probe\probe.mjs`; cwd
not the worktree; `file://` import of working-tree `dist/index.js`; no
production write):

| probe | result |
|---|---|
| `internArray([1,2,3])` | `id:0` items `[1,2,3]` |
| `internArray(new Array(MAX+1))` | threw cardinality; `copied:false` |
| `__array_append(99, 1)` | `unknown array handle 99 (fail-closed)` |
| 4096 `__array_create` then 4097th | `Array store exceeds the host bound` |
| `__range(2,7)` | `[2,3,4,5,6]` |
| `__range(0, 100000)` | `Array.range: cardinality exceeds guest memory` |
| 5000 `internString` | last `s4999`, no throw |
| 5000 `internDecimal` | last `1.00`, no throw |
| internArray of 1e6 then one append | internedLen 1000000; append threw cardinality (`internMs:10`) |
| append to existing `[1]` | `[1,2]` |

## Challenge 1 — does internArray still copy a MAX+1 list / append still sparse-fill?

**No on this dirty tree. CONFIRMED closed for the named internArrayItems
/ unknown-append / create-cap claim.** HEAD internArray mapped then
pushed with no cardinality check; `__array_append` sparse-filled
`arrays[id] ?? (arrays[id] = [])`; `__array_create` / `__range` pushed
directly. WT: `internArrayItems` admits at most 4096 arrays and
1_000_000 items; `internArray` throws on `items.length > MAX` **before**
`items.map`; `__array_append(99)` throws unknown-handle; 4097th
`__array_create` throws store bound. Named hostile tests and the TEMP
probe both saw those refuses. Positive `[1,2,3]` still stores. Existing
`__range` exclusive-interval / 1e5 / fuel / bindMemory tests still pass.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** `internString`
and sibling host registries (`results`, `options`, `moneys`, `decimals`,
`internDecimal`, `seedString`) remain uncapped. Named tests do not
live-exercise `__array_append` at 1e6 items (extra probe internArray of
MAX then one append did throw). Dirty HEAD, unsigned TypeScript, tests
load gitignored `dist/`. Inventory was not promoted. Independent
production admission remains **HOLD**. Not 124-scan closure. Not Astra.
Not clean-HEAD evidence.

## Residuals (not findings against the named internArrayItems claim)

- **`internString` and other host registries unbounded.** Src 743–745
  `strings.push(s)` with no cap. TEMP: 5000 internString and 5000
  internDecimal succeeded. `results` / `options` / `moneys` / `decimals`
  / `seedString` sparse assign are the same class.
- **Named suite does not live-exercise the 1e6 append item-cap.** Src
  382–384 is present; tests 92–95 only cover unknown handle 99. Extra
  probe internArray of 1e6 then one append threw cardinality in 10 ms.
  That extra is not a named-test count and does not close internString.
- `__array_get` / `__array_length` still treat unknown ids as `[]`
  (`arrays[id] ?? []`). Out of the named append/create/intern claim.
- `internArrayItems` pushes the admitted `items` array by reference
  (`arrays.push(items)`). `internArray` maps first so that path copies;
  `__range` builds a fresh `items` array.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_e3409dfe75ff7adda18f556a`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named internArrayItems / unknown-append /
create-cap claim. Evidence is sufficient that `createHostRuntime` routes
`internArray`, `__array_create`, and `__range` through internArrayItems
with `MAX_WASM_ARRAYS` 4096 and `MAX_WASM_ARRAY_ITEMS` 1_000_000, that
`internArray` throws on `MAX+1` before map/copy, that unknown append 99
refuses instead of sparse-filling, that the 4097th `__array_create`
refuses, that `internArray([1,2,3])` stores, and that existing `__range`
tests still pass **15/15**. Evidence is insufficient for PATCHED
promotion (internString and sibling registries unbounded; named suite
does not live-exercise 1e6 append) and for production admission.

**PASS scoped.** Hashes **MATCH**. Tests **15/15**. Finding stays
**PARTIAL_THIS_TREE**. Residual: internString and other host registries
unbounded; 1e6 append item-cap not live-exercised in the named suite.
Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
