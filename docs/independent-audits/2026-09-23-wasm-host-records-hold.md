# Independent audit — WASM host records internResult/Option/Money/DecimalValue bounds

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

- `createHostRuntime` now internResult / internOption / internMoney /
  internDecimalValue with `MAX_WASM_HOST_RECORDS` 4096.
- `__result_ok` / `__result_err`, option v2 helpers, money constructors,
  decimal ops, and `internDecimal` go through those helpers.
- Hostile: 4097th `__result_ok`, `__option_some_v2`, `internDecimal`,
  `__money_gbp` throw named store bounds.
- Positive: `internDecimal("1.00")` stores.
- Tests `wasm-runtime.test.mjs` **24/24**.
- Residual: `seedString` still sparse-fills holes under
  `MAX_WASM_STRINGS`.

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
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | **M** HEAD blob `93a8b55b77` → WT blob `0bc274c346`. HEAD had no `MAX_WASM_HOST_RECORDS`, no internResult / internOption / internMoney / internDecimalValue. `__result_ok`/`err` did `results.push`; option v2 helpers did `options.push(...) - 1`; money constructors did `moneys.push`; decimal ops and `internDecimal` did `decimals.push`. THIS TURN: four helpers cap at 4096 then push; those intern paths call the helpers. Array internArrayItems and string internStringValue bounds are also on this dirty tree (prior independent receipts `2026-09-23-wasm-array-store-hold.md`, `2026-09-23-wasm-string-store-hold.md`). |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | **M** HEAD blob `58c5779782` → WT blob `04b19ab8bd`. THIS TURN: re-export `MAX_WASM_HOST_RECORDS` (array/string MAX exports already on the dirty tree). |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | **M** HEAD blob `076d2784c6` → WT blob `8d6fa4c950`. THIS TURN: positive internDecimal `"1.00"`; hostile 4097th `__result_ok`, `__option_some_v2`, internDecimal, `__money_gbp`. Array/string-store tests also present. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | gitignored; rebuilt this review (`tsc`); internResult 201–208, internOption 209–216, internMoney 217–224, internDecimalValue 225–232, internDecimal 676–679 match src. |

Prior independent receipt
`docs/independent-audits/2026-09-23-wasm-string-store-hold.md` recorded
`results` / `options` / `moneys` / `decimals` unbounded (TEMP 5000 of
each last handle 4999, no throw). That host-record residual is closed on
this dirty tree for the named internResult / internOption / internMoney /
internDecimalValue claim. `seedString` still sparse-fills holes under
`MAX_WASM_STRINGS`.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | 55301 | `69644fefa329a20159d473dcc30dcda846432b643a39146c421b9c541f5e05f3` | 2026-09-23T18:38:12.150Z |
| `packages-ts/galerina-core-runtime-wasm/src/index.ts` | 1487 | `cc7b2360221c9ab90b3f085baa9e320e4ec461b71d66e7cd1f1c1c1c062ea3bd` | 2026-09-23T18:38:12.122Z |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | 8028 | `c2badcc01f4edd7ceeee733b36f96916aabe029f12e996930197b3175d43090f` | 2026-09-23T18:38:26.205Z |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | 46021 | `264a27dc3ffba89330d57831cb2ad68eb7ac2c7d04c51eba4e3346a5afd1634d` | 2026-09-23T18:40:20.564Z |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | 1293 | `000a1b00777725e32b22aede9ee01dd9372cf50c85b197349ec6c4b9c433122a` | 2026-09-23T18:40:20.576Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suite imports dist (`packages-ts/.gitignore`
`dist/`). Barrel `dist/index.js` re-exports `MAX_WASM_HOST_RECORDS` from
`./wasm-runtime.js`.

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
| intern helpers | `MAX_WASM_HOST_RECORDS` 4096; internResult / internOption / internMoney / internDecimalValue | src 38, 339–370; dist 34, 201–232 | 4097th result/option/decimal/money **pass** | TEMP: `MAX_WASM_HOST_RECORDS:4096`; 4097th each threw named store bound | four registries each cap at 4096 independently |
| `__result_ok` / `__result_err` | go through internResult | src 460–467; dist 321–326 | hostile `__result_ok` **pass** | TEMP: `__result_ok` and `__result_err` both `Result store exceeds the host bound` | named suite omits `__result_err`; extra closed it |
| option v2 helpers | go through internOption | src 509–511, 564–584, 592–605; dist 367, 421–437, 447–460 | hostile `__option_some_v2` **pass** | TEMP: `__option_some_v2`, `__option_some_f64_v2`, `__array_get_option_v2` threw Option store bound | named suite omits f64 / array option interners; extra closed them |
| money constructors | go through internMoney | src 623–632; dist 475–484 | hostile `__money_gbp` **pass** | TEMP: `__money_gbp` and `__money_usd` threw Money store bound | named suite omits EUR/USD/…; extra closed USD |
| decimal ops + internDecimal | go through internDecimalValue | src 676–771, 805–808; dist 530–642, 676–679 | positive internDecimal **pass**; hostile internDecimal **pass** | TEMP: internDecimal / `__decimal_from_str` / `__decimal_add` threw Decimal store bound | named suite omits host decimal ops; extra closed from_str/add |
| hostile 4097th `__result_ok` | 4096 then refuse | tests 132–137 | **pass** 1.5136ms | TEMP `Result store exceeds the host bound` | — |
| hostile 4097th `__option_some_v2` | 4096 then refuse | tests 139–144 | **pass** 0.6078ms | TEMP `Option store exceeds the host bound` | — |
| hostile 4097th internDecimal | 4096 then refuse | tests 146–150 | **pass** 1.9191ms | TEMP `Decimal store exceeds the host bound` | — |
| hostile 4097th `__money_gbp` | 4096 then refuse | tests 152–158 | **pass** 0.5342ms | TEMP `Money store exceeds the host bound` | — |
| positive internDecimal `"1.00"` | stores canonical amount | tests 126–130 | **pass** 0.2456ms | TEMP `id:0` `value:1.00` | — |
| focused tests | 24/24 | named command below | **24/24** 0 fail 0 skip `duration_ms 150.4362` | TEMP is extra, not a count | suite imports dist, not src |
| seedString sparse holes | `strings[handle] = s` under MAX still sparse-fills | src 787–798; dist 658–668 | **not** in named 24 | TEMP: `seedString(10,"hole")` holes `[0..9]`; intern after id `11`; `seedString(4095)` inflates length so next intern throws store bound | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

WT remaining `results.push` / `options.push` / `moneys.push` /
`decimals.push` are only inside the four helpers (src 344, 352, 360,
368). No intern-path bypass on this dirty tree.

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
   → **24/24 pass**, 0 fail, 0 skip, `duration_ms 150.4362`.

Independent extra (`%TEMP%\zt-wasm-host-records-probe\probe.mjs`; cwd
not the worktree; `file://` import of working-tree `dist/index.js`; no
production write):

| probe | result |
|---|---|
| `MAX_WASM_HOST_RECORDS` | `4096` |
| internDecimal(`"1.00"`) | `id:0` value `"1.00"` |
| 4096 `__result_ok` then 4097th | `Result store exceeds the host bound` |
| 4096 `__result_err` then 4097th | `Result store exceeds the host bound` |
| 4096 `__option_some_v2` then 4097th | `Option store exceeds the host bound` |
| 4096 `__option_some_f64_v2` then 4097th | `Option store exceeds the host bound` |
| 4096 internDecimal then 4097th | `Decimal store exceeds the host bound` |
| 4096 `__money_gbp` then 4097th | `Money store exceeds the host bound` |
| 4096 `__money_usd` then 4097th | `Money store exceeds the host bound` |
| 4096 `__decimal_from_str` then 4097th | `Decimal store exceeds the host bound` |
| intern two decimals then add to cap | `__decimal_add` Decimal store bound |
| 4096 `__array_get_option_v2` then 4097th | `Option store exceeds the host bound` |
| seedString(10, `"hole"`) | holes `[0..9]`; intern after id 11 `"next"` |
| seedString(4095, `"last"`) then intern | `String store exceeds the host bound` |

## Challenge 1 — do results/options/moneys/decimals still intern unbounded?

**No on this dirty tree. CONFIRMED closed for the named internResult /
internOption / internMoney / internDecimalValue claim.** HEAD
`__result_ok`/`err` pushed with no cap; option v2 helpers pushed then
used `push() - 1`; money constructors pushed; decimal ops and
`internDecimal` pushed. WT: each helper admits at most 4096 records;
`__result_ok`/`err` call internResult; option v2 interners
(`__option_some_v2`, `__option_some_f64_v2`,
`__str_to_int_option_v2`, `__array_get/first/last_option_v2`,
`__str_char_at_option_v2`) call internOption; `__money_gbp` through
`__money_hkd` call internMoney; `__decimal_from_str` / add / sub / mul /
neg / div / rem and `internDecimal` call internDecimalValue. Named
hostile tests and the TEMP probe both saw the 4097th refuse. Positive
`internDecimal("1.00")` still stores.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** `seedString`
still sparse-fills holes under `MAX_WASM_STRINGS` (`strings[handle] = s`;
TEMP seed 10 left holes 0–9; seed 4095 inflates `strings.length` to 4096).
Named tests do not cover that residual. Dirty HEAD, unsigned TypeScript,
tests load gitignored `dist/`. Inventory was not promoted. Independent
production admission remains **HOLD**. Not 124-scan closure. Not Astra.
Not clean-HEAD evidence.

## Residuals (not findings against the named host-records claim)

- **`seedString` still sparse-fills holes under `MAX_WASM_STRINGS`.** Src
  797 `strings[handle] = s` after a handle-range check only. TEMP:
  seedString(10) left 10 undefined holes; intern after received id 11.
  seedString(4095) inflates length so the next internString throws store
  bound without 4096 dense interned values. Named as compiler intern-table
  replay. **CONFIRMED residual.**
- Named suite does not live-exercise `__result_err`, f64 option intern,
  other money constructors, or host decimal ops. Extra probe closed those
  code paths; they are not a named-test count.
- Four host-record registries each cap at 4096 independently (worst-case
  16384 records plus strings/arrays). Out of the named per-store claim.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_e3409dfe75ff7adda18f556a`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named internResult / internOption /
internMoney / internDecimalValue claim. Evidence is sufficient that
`createHostRuntime` routes `__result_ok`/`err`, option v2 helpers, money
constructors, decimal ops, and `internDecimal` through those helpers with
`MAX_WASM_HOST_RECORDS` 4096, that the 4097th `__result_ok`,
`__option_some_v2`, internDecimal, and `__money_gbp` throw named store
bounds, and that internDecimal(`"1.00"`) stores **24/24**. Evidence is
insufficient for PATCHED promotion (`seedString` sparse holes under
`MAX_WASM_STRINGS`) and for production admission.

**PASS scoped.** Hashes **MATCH**. Tests **24/24**. Finding stays
**PARTIAL_THIS_TREE**. Residual: seedString still sparse-fills holes
under `MAX_WASM_STRINGS`. Not production admission. Not Astra. Not
124-scan closure. **Not clean-HEAD evidence.**
