# Independent audit — WASM host string store internStringValue bounds

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

- `createHostRuntime` internStringValue admits `MAX_WASM_STRINGS` 4096
  and `MAX_WASM_STRING_CHARS` 1_048_576.
- `internString`, `__int_to_str`, `__float_to_str`, `__str_concat`,
  `__str_to_lower` / `__str_to_upper` / `__str_trim` / `__str_slice`,
  `__char_to_string`, `__decimal_to_str` use that helper.
- `internString` throws if not a string, if `s.length > MAX`, or
  `strings.length >= MAX`.
- `seedString` refuses a handle not in `[0, MAX_WASM_STRINGS)` and
  oversize `s`; it may still sparse-fill holes under MAX (compiler
  intern-table replay).
- Hostile: internString of MAX+1 chars; 4097 internString(`"a"`);
  `seedString(MAX, "x")`.
- Positive: internString(`"hi"`).
- Tests `wasm-runtime.test.mjs` **19/19**.
- Residual: `results` / `options` / `moneys` / `decimals` unbounded;
  `seedString` sparse holes.

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
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | **M** HEAD blob `93a8b55b77` → WT blob `496ea5535b`. HEAD had no `MAX_WASM_STRINGS` / `MAX_WASM_STRING_CHARS`. `internString` was `strings.push(s)`. Host string makers (`__int_to_str`, `__float_to_str`, `__str_concat`, `__str_to_lower`/`upper`/`trim`/`slice`, `__char_to_string`, `__decimal_to_str`) each `strings.push(...)`. `seedString` was `strings[handle] = s` with no range or length check. THIS TURN: helper `internStringValue`; those intern paths call it; `seedString` refuses handle `>= MAX` / non-integer / oversize `s`. Array internArrayItems bounds are also on this dirty tree (prior independent receipt `2026-09-23-wasm-array-store-hold.md`). |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | **M** HEAD blob `58c5779782` → WT blob `8b9dcebdb5`. THIS TURN: re-export `MAX_WASM_ARRAYS`, `MAX_WASM_ARRAY_ITEMS`, `MAX_WASM_STRINGS`, `MAX_WASM_STRING_CHARS`. |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | **M** HEAD blob `076d2784c6` → WT blob `79a5fff43b`. THIS TURN: positive internString `"hi"`; hostile MAX+1 chars; 4097 internString `"a"`; `seedString(MAX, "x")`. Array-store tests also present. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | gitignored; rebuilt this review (`tsc`); `internStringValue` 178–191, `internString` 631–633, `seedString` 634–645 match src. |

Prior independent receipt
`docs/independent-audits/2026-09-23-wasm-array-store-hold.md` recorded
`internString` and sibling host registries as unbounded. The internString
/ internStringValue / seedString-handle residual is closed on this dirty
tree for the named string-store claim. `results` / `options` / `moneys` /
`decimals` remain uncapped. `seedString` still sparse-fills holes under
MAX.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | 54793 | `efd88057b87f2b286a0834f3accb3105e9f9a6367d9eb22c23711c1c542450b1` | 2026-09-23T18:29:45.248Z |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | 1464 | `e86cba552aa8c1c72388020a0093fcf8f53e89db3d8a669c21fc4dc691510414` | 2026-09-23T18:29:45.223Z |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | 6571 | `8334293029e51f1e122bae13e10d2b7bc3f6113eb5893e6f1bd4a41ce42346c7` | 2026-09-23T18:30:12.789Z |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | 45602 | `c0a78c9d08198a440b8d0516153b42a8494690271d552e041c4431c02b6e3712` | 2026-09-23T18:32:20.672Z |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | 1270 | `f4e576b0bdf30b5b46325fecb70c0f1e1b4c141bc761277ca1d6a43ad4a8f330` | 2026-09-23T18:32:20.682Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suite imports dist (`packages-ts/.gitignore`
`dist/`). Barrel `dist/index.js` re-exports `MAX_WASM_STRINGS` /
`MAX_WASM_STRING_CHARS` from `./wasm-runtime.js`.

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
| internStringValue helper | `MAX_WASM_STRINGS` 4096, `MAX_WASM_STRING_CHARS` 1_048_576; internString / listed host string makers use helper | src 36–37, 316–329, 418–425, 444–446, 465–468, 510–512, 652–656, 758–760; dist 32–33, 178–191, 278–286, 306–308, 323–326, 367–369, 503–508, 631–633 | internString `"hi"` **pass**; MAX+1 **pass**; 4097th **pass** | TEMP: `MAX_WASM_STRINGS:4096` `MAX_WASM_STRING_CHARS:1048576`; `__int_to_str(42)` `"42"`; concat `"AABB"`; lower/upper/trim/slice/char/decimal_to_str routed | named suite does not call host import intern paths; extra did |
| internString type / length / store | throw if not a string, `s.length > MAX`, or `strings.length >= MAX` | src 317–324, 758–760; dist 179–187, 631–633 | hostile MAX+1 and 4097th **pass**; non-string **not** in named 19 | TEMP: `internString(123)` `String intern requires a string`; MAX+1 `host char bound`; 4097th `String store exceeds the host bound`; exact MAX chars stored | named tests omit non-string intern; extra closed it |
| seedString handle / oversize | refuse handle not in `[0, MAX)`; refuse oversize `s`; may sparse-fill under MAX | src 761–772; dist 634–645 | hostile `seedString(MAX, "x")` **pass** | TEMP: `unknown string handle 4096`; `-1` and `1.5` refuse; oversize seed `host char bound` and did not store | named tests omit oversize seed and non-integer handle; extra closed them |
| hostile internString MAX+1 chars | `"x".repeat(MAX+1)` throws char bound | tests 110–113 | **pass** 0.1648ms | TEMP `len:1048577` `threw:true` | — |
| hostile 4097 internString `"a"` | 4096 intern then refuse | tests 115–119 | **pass** 0.4183ms | TEMP `String store exceeds the host bound` | — |
| hostile seedString(MAX, `"x"`) | handle 4096 unknown | tests 121–124 | **pass** 0.1339ms | TEMP as above | — |
| positive internString `"hi"` | stores short value | tests 104–108 | **pass** 0.1608ms | TEMP `id:0` `value:hi` | — |
| focused tests | 19/19 | named command below | **19/19** 0 fail 0 skip `duration_ms 150.1009` | TEMP is extra, not a count | suite imports dist, not src |
| results/options/moneys/decimals | still unbounded | src 330, 335–337, 427–433, 559–572, 590–599, 643–693, 779–784; dist 192, 197–199, 290–295, 417–429, 444–453, 500, 517–618, 652–657 | **not** in named tests | TEMP: 5000 `__result_ok` / `__option_some_v2` / `__money_usd` / `internDecimal` last handle `4999`, `threw:false` | **CONFIRMED residual** |
| seedString sparse holes | `strings[handle] = s` under MAX still sparse-fills | src 771; dist 644 | **not** in named tests | TEMP: `seedString(10,"hole")` holes `[0..9]`; intern after id `11`; `seedString(4095)` inflates length so next intern throws store bound | **CONFIRMED residual** |
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
   → **19/19 pass**, 0 fail, 0 skip, `duration_ms 150.1009`.

Independent extra (`%TEMP%\zt-wasm-string-store-probe\probe.mjs`; cwd
not the worktree; `file://` import of working-tree `dist/index.js`; no
production write):

| probe | result |
|---|---|
| internString(`"hi"`) | `id:0` value `"hi"` |
| internString(`123`) | `String intern requires a string` |
| internString MAX+1 chars | `len:1048577`; `String intern exceeds the host char bound` |
| internString exact MAX chars | stored length 1048576, no throw |
| 4096 internString(`"a"`) then 4097th | `String store exceeds the host bound` |
| seedString(4096, `"x"`) | `unknown string handle 4096 (fail-closed)` |
| seedString(-1 / 1.5) | unknown handle refuse |
| seedString(0, MAX+1 chars) | char bound; did not store |
| seedString(10, `"hole"`) | holes `[0..9]`; intern after id 11 `"next"` |
| seedString(4095, `"last"`) then intern | store bound (length inflated) |
| `__int_to_str(42)` | `"42"`; at cap throws store bound |
| `__str_concat` `"AA"`+`"BB"` | `"AABB"`; 600k+600k concat char bound |
| lower/upper/trim/slice/char_to_string | `" hi "` / `" HI "` / `"Hi"` / `"Hi"` / `"A"` |
| `__decimal_to_str` | `"1.25"` |
| 5000 results / options / moneys / decimals | last handle 4999, no throw |

## Challenge 1 — does internString still push unbounded / seedString still accept handle MAX?

**No on this dirty tree. CONFIRMED closed for the named internStringValue
/ internString / seedString-handle claim.** HEAD internString pushed with
no cap; host string makers pushed directly; seedString assigned any
handle. WT: internStringValue admits at most 4096 strings and 1_048_576
chars; internString / `__int_to_str` / `__float_to_str` / `__str_concat`
/ `__str_to_lower`/`upper`/`trim`/`slice` / `__char_to_string` /
`__decimal_to_str` go through that helper; internString throws on
non-string, oversize, and store cap; seedString(MAX) throws unknown
handle. Named hostile tests and the TEMP probe both saw those refuses.
Positive `"hi"` still stores.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** `results` /
`options` / `moneys` / `decimals` (and `internDecimal`) remain uncapped
(TEMP 5000 each succeeded). `seedString` still sparse-fills holes under
MAX (`strings[handle] = s`; TEMP seed 10 left holes 0–9; seed 4095
inflates `strings.length` to 4096). Named tests do not cover those
residuals. Dirty HEAD, unsigned TypeScript, tests load gitignored
`dist/`. Inventory was not promoted. Independent production admission
remains **HOLD**. Not 124-scan closure. Not Astra. Not clean-HEAD
evidence.

## Residuals (not findings against the named internStringValue claim)

- **`results` / `options` / `moneys` / `decimals` unbounded.** Src
  `results.push` / `options.push` / `moneys.push` / `decimals.push` /
  `internDecimal` with no cap. TEMP: 5000 of each last handle 4999, no
  throw.
- **`seedString` still sparse-fills holes under MAX.** Src 771
  `strings[handle] = s` after a handle-range check only. TEMP:
  seedString(10) left 10 undefined holes; intern after received id 11.
  seedString(4095) inflates length so the next internString throws store
  bound without 4096 dense interned values. Named as compiler intern-table
  replay.
- Named suite does not live-exercise host import intern paths
  (`__int_to_str` and siblings) or internString non-string. Extra probe
  closed those code paths; they are not a named-test count.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_e3409dfe75ff7adda18f556a`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named internStringValue / internString /
seedString-handle claim. Evidence is sufficient that `createHostRuntime`
routes internString and the listed host string makers through
internStringValue with `MAX_WASM_STRINGS` 4096 and
`MAX_WASM_STRING_CHARS` 1_048_576, that internString throws on
non-string / MAX+1 chars / 4097th intern, that seedString(MAX) refuses,
and that internString(`"hi"`) stores **19/19**. Evidence is insufficient
for PATCHED promotion (`results`/`options`/`moneys`/`decimals`
unbounded; seedString sparse holes under MAX) and for production
admission.

**PASS scoped.** Hashes **MATCH**. Tests **19/19**. Finding stays
**PARTIAL_THIS_TREE**. Residual: results/options/moneys/decimals
unbounded; seedString sparse holes. Not production admission. Not Astra.
Not 124-scan closure. **Not clean-HEAD evidence.**
