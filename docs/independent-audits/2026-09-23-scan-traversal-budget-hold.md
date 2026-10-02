# Independent audit — package-graph scan traversal budget

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This receipt
is not the author’s packet and is not GPT Astra. Passing tests here are
**not** production admission. Finding inventory was **not** promoted.
`csf_d6acd81d895092a4750e52bf` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `listSourceFiles` now shares a `ScanBudget` across roots with
  `MAX_SCAN_FILES` 4096, `MAX_SCAN_DIRS` 4096, `MAX_SCAN_DEPTH` 32, and
  throws (does not silently truncate) when exceeded.
- Hostile: 4097 source files refuse host file bound; nesting above depth
  32 refuses host depth bound.
- Positive: small nested tree scans.
- Tests `package-graph.test.mjs` **39/39**.
- Residual: `readdir` failure still returns empty (skip); `lstat` then
  `readFileSync` TOCTOU; no aggregate source-byte cap.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/scanner.js`, hashed working-tree bytes, re-ran
`npx tsc -p tsconfig.json` then the named suite, and executed an extra
probe from `%TEMP%` (not by trusting the named tests alone). Independent
`crypto.createHash('sha256')` and `Get-FileHash` **MATCH** each other on
every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | **M** HEAD blob `2ea387680e` → WT blob `5f757fba1e`. HEAD `listSourceFiles(dir, extensions)` unbounded recurse, no throw. THIS TURN: exported `MAX_SCAN_FILES/DIRS/DEPTH`, shared `ScanBudget`, throw on exceed. |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | **M** HEAD blob `ac0058675` → WT blob `8bd60db4f3`. THIS TURN: re-export the three MAX constants. |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | **M** HEAD blob `e567a5414` → WT blob `375fa7aac3` (+33). THIS TURN: positive nested scan + hostile file/depth tests. Imports `../dist/index.js`. |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | gitignored; rebuilt this review (`tsc`); `listSourceFiles` 135–176 and `scanPackage` budget 597–598 match src. |

HEAD `listSourceFiles` had no budget and `scanPackage` called
`listSourceFiles(join(scopePath, r), meta.extensions)` per root with no
shared counter. THIS TURN creates one `{ files: 0, dirs: 0 }` and passes
it to every root.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | 29550 | `7884566f5d58d5dbff6527a5a036be68b6ef75dd69f9724b7e359890e31ea1af` | 2026-09-23T17:52:31.805Z |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | 562 | `42a2341d9c59d81851d729e1ea768255f21439837ae0c3743f7d127c950ea28d` | 2026-09-23T17:52:31.793Z |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | 32531 | `8bbb55ceb684535ef3a30bce840476c54b3c1ae86d1b8d7605c0c6c4fa7b1736` | 2026-09-23T17:52:31.803Z |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | 28059 | `21110209b276c5c73bd9527e515c54f24c6fa155d33bb30895dad8220c92c2ef` | 2026-09-23T17:54:37.953Z |
| `packages-ts/galerina-devtools-package-graph/dist/index.js` | 293 | `5e24e9cdd0aef00c47c9dd7dd6bc28b67af21344c8ba7a57a1844d56ed596aec` | 2026-09-23T17:54:37.978Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suite imports dist (`packages-ts/.gitignore`
`dist/`). `dist/index.js` re-exports `MAX_SCAN_FILES`, `MAX_SCAN_DIRS`,
`MAX_SCAN_DEPTH` from `./scanner.js`.

Inventory `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` already
records `csf_d6acd81d895092a4750e52bf` as `PARTIAL_THIS_TREE` (low; title
“Package scan roots can traverse outside the caller-selected scope”;
path `packages-ts/galerina-devtools-package-graph/src/scanner.ts`). This
review does **not** recategorize that row.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| shared `ScanBudget` across roots | one `{files,dirs}` object passed to every root | src 181–184, 665–666; dist 597–598 | suite uses default/`src` only | TEMP `src`+`host` 2049+2049 threw `host file bound`, `returnedCount:null` | named tests do not split the file cap across two roots |
| MAX constants | files 4096, dirs 4096, depth 32 | src 43–45; dist 41–43 | tests import `MAX_SCAN_FILES` / `MAX_SCAN_DEPTH` | TEMP `constants` all three 4096/4096/32 | named tests do not import `MAX_SCAN_DIRS` |
| throw, not silent truncate | exceed → `Error`, no 4096-file result | src 193–199, 213–215 | hostile file/depth **pass** | TEMP 4097 `threw:true` `returnedCount:null`; exact 4096 `fileCount:4096` | — |
| hostile 4097 files | seed + `MAX_SCAN_FILES` extra `.ts` refuse host file bound | tests 721–728 | **pass** 3073.5095ms | TEMP same message | — |
| hostile depth > 32 | `MAX_SCAN_DEPTH+1` nested dirs refuse host depth bound | tests 730–740; `depth > 32` at src 193 | **pass** 22.7726ms | TEMP depth 32 `fileCount:2`; depth 33 `hostDepthBound:true` | — |
| positive small nested tree | `src/index.ts` + `src/nested/a.ts` scan | tests 711–719 | **pass** 6.7577ms | TEMP `fileCount:2` those paths | — |
| focused tests | 39/39 | named command below | **39/39** 0 fail 0 skip `duration_ms 4033.541` | TEMP is extra, not a count | suite imports dist, not src |
| readdir skip residual | `readdirSync` catch returns `[]` | src 201–202; dist 145–149 | **not** in named tests | TEMP `chmod(0)` on win32 still listed `hidden.ts` (`skippedHidden:false`) | live deny **NOT VERIFIABLE** on this NTFS host; skip is **CONFIRMED** in src/dist |
| lstat → `readFileSync` TOCTOU | list via `lstat`, later `readFileSync(abs)` follows / unbounded | src 205–216 then 671 | **not** in named tests | construction + 2 MiB file read | **CONFIRMED residual** |
| no aggregate source-byte cap | budget counts files/dirs/depth only | src 665–671 | **not** in named tests | TEMP `inputChars:2097172` `threw:false` `fileCount:1` | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   and tests **M**. `Galerina.worktrees` is not this tree.

2. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-devtools-package-graph` → **exit 0**.

3. `node --test tests/package-graph.test.mjs` in
   `packages-ts/galerina-devtools-package-graph`
   → **39/39 pass**, 0 fail, 0 skip, `duration_ms 4033.541`.
   Hostile file bound 3073.5095ms; hostile depth 22.7726ms; positive
   nested 6.7577ms.

Independent extra (`%TEMP%\zt-scan-traversal-budget-probe\probe.mjs`;
cwd not the worktree; `file://` import of working-tree `dist/index.js`;
no production write):

| probe | result |
|---|---|
| constants | `MAX_SCAN_FILES=4096` `MAX_SCAN_DIRS=4096` `MAX_SCAN_DEPTH=32` |
| small nested tree | `fileCount:2` `src/index.ts`, `src/nested/a.ts` |
| exact 4096 files | `threw:false` `fileCount:4096` |
| 4097 files | `threw:true` `packageGraph scan exceeds the host file bound` `returnedCount:null` |
| shared budget `src`+`host` (2049+2049) | `threw:true` host file bound `returnedCount:null` |
| depth 32 | `threw:false` `fileCount:2` |
| depth 33 | `threw:true` host depth bound `returnedCount:null` |
| 4096 sibling dirs under `src` (4097 dir visits) | `threw:true` host directory bound (extra; not named tests) |
| 2,097,172-char `.ts` | `threw:false` `fileCount:1` — **no byte cap** |
| `chmod(0)` nested dir | still scanned `src/blocked/hidden.ts` on this Windows host |

## Challenge 1 — does the scan still silently truncate or run unbounded?

**No on this dirty tree for file/dir/depth counts. CONFIRMED closed for
the named budget.** HEAD recursed with no counters. WT throws
`packageGraph scan exceeds the host {file,directory,depth} bound` and
does not return a truncated list (`returnedCount:null`). Exact 4096
files still scan. Depth 32 still scans; 33 throws. Shared object across
`src`+`host` was proved only by the TEMP probe (named tests stay on one
root). Directory bound is implemented and extra-probed; named suite does
not cover it.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** `readdir`
failure still returns empty (skip, not throw). Listing uses `lstatSync`
then later `readFileSync(abs)` with no re-lstat and no aggregate byte
cap (2 MiB file admitted). Dirty HEAD, unsigned TypeScript, tests load
gitignored `dist/`. Inventory was not promoted. Independent production
admission remains **HOLD**. Not 124-scan closure. Not Astra. Not
clean-HEAD evidence.

## Residuals (not findings against the named budget claim)

- **`readdir` failure still returns empty (skip).** src 201–202
  `catch { return out; }`. Named tests do not cover it. TEMP `chmod(0)`
  did not deny listing on this NTFS host (**NOT VERIFIABLE** live here);
  the skip path is still **CONFIRMED** in src/dist.
- **`lstat` then `readFileSync` TOCTOU.** Symlink skip is at list time;
  `readFileSync` later follows a replacement and allocates the whole
  file. No re-lstat, no size check.
- **No aggregate source-byte cap.** Budget counts files/dirs/depth only.
  TEMP 2,097,172-char source scanned.
- Named tests omit the directory bound and the two-root shared-file
  case. Extra probe closed both as throws.
- `dirHasCode` (vacuous-border helper) still walks without this budget.
  Extra, not the named `listSourceFiles` claim.
- Independent production admission HOLD. Dirty HEAD, no commit, no
  signed certified deployment.
- Finding inventory is **not** promoted. `csf_d6acd81d895092a4750e52bf`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named shared-budget / throw-on-exceed
claim. Evidence is sufficient that `listSourceFiles` shares one
`ScanBudget` across roots, that the three MAX constants are 4096 / 4096
/ 32, that 4097 files and depth 33 throw rather than truncate, and that
a small nested tree still scans. Evidence is insufficient for PATCHED
promotion (readdir skip, lstat/`readFileSync` TOCTOU, no source-byte
cap) and for production admission.

**PASS scoped.** Hashes **MATCH**. Tests **39/39**. Finding stays
**PARTIAL_THIS_TREE**. Residuals: readdir skip; lstat→readFileSync
TOCTOU; no aggregate source-byte cap. Not production admission. Not
Astra. Not 124-scan closure. **Not clean-HEAD evidence.**
