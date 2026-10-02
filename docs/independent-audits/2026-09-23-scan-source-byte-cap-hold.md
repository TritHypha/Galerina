# Independent audit — package-graph scan source-byte cap

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
Passing tests here are **not** production admission. Finding inventory
was **not** promoted. `csf_d6acd81d895092a4750e52bf` stays
**PARTIAL_THIS_TREE**. Do **not** promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- Package scan now refuses a source file whose `lstat` size is not a
  safe non-negative integer or exceeds `MAX_SCAN_FILE_BYTES` 1 MiB, and
  refuses when summed sizes exceed `MAX_SCAN_TOTAL_BYTES` 32 MiB.
- After `readFileSync`, `raw.length > MAX_SCAN_FILE_BYTES` also throws.
- Hostile: a `src/huge.ts` of `MAX_SCAN_FILE_BYTES+1` chars throws host
  file-byte bound.
- Positive: small `src/index.ts` scans.
- Tests `package-graph.test.mjs` **41/41** including compiler package
  scan.
- Residual: `readdir` catch still skips; `lstat` size then
  `readFileSync` TOCTOU; 32 MiB total cap not live-exercised in the
  named suite.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/scanner.js`, hashed working-tree bytes, re-ran
`npx tsc -p tsconfig.json` then the named suite, and executed an extra
probe from `%TEMP%` (not by trusting the named tests alone). Independent
`crypto.createHash('sha256')` and `Get-FileHash` **MATCH** each other on
every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

Prior independent receipt
`docs/independent-audits/2026-09-23-scan-traversal-budget-hold.md`
closed files/dirs/depth throw-on-exceed and recorded **no aggregate
source-byte cap** (TEMP 2,097,172-char `.ts` scanned). That byte residual
is the named claim of this receipt.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | **M** HEAD blob `2ea387680e` → WT blob `37d54bfb5f`. HEAD `listSourceFiles(dir, extensions)` unbounded recurse, no throw, no size check. THIS TREE: exported `MAX_SCAN_FILES/DIRS/DEPTH` plus `MAX_SCAN_FILE_BYTES` `1_048_576` / `MAX_SCAN_TOTAL_BYTES` `32 * 1_048_576`; shared `ScanBudget` `{files,dirs,bytes}`; per-file `Number.isSafeInteger` / `< 0` / `> MAX_SCAN_FILE_BYTES` throw host file-byte bound; summed `budget.bytes > MAX_SCAN_TOTAL_BYTES` throw host total-byte bound; after `readFileSync`+`stripComments`, `raw.length > MAX_SCAN_FILE_BYTES` throw host file-byte bound. |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | **M** HEAD blob `ac0058675` → WT blob `0735fdf94b`. THIS TREE: re-export the five MAX constants including the two byte caps. |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | **M** HEAD blob `e567a5414` → WT blob `49c65ead7b` (+51). THIS TREE: imports `MAX_SCAN_FILES` / `MAX_SCAN_DEPTH` / `MAX_SCAN_FILE_BYTES` (not `MAX_SCAN_TOTAL_BYTES`); positive nested tree; hostile 4097 files; hostile depth 33; **positive small `src/index.ts` byte budget**; **hostile `src/huge.ts` of `MAX_SCAN_FILE_BYTES+1` chars**. Imports `../dist/index.js`. |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | gitignored; rebuilt this review (`tsc`); `listSourceFiles` 137–186 and `scanPackage` budget 607–615 match src. |

HEAD `scanPackage` called `listSourceFiles(join(scopePath, r), meta.extensions)`
per root with no shared counter and no byte check. THIS TREE creates one
`{ files: 0, dirs: 0, bytes: 0 }` and charges `s.size` before admitting
the path.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | 30178 | `9d501c13b484ba72af20b287dd9cfa2a148e3fd86cc7b658c29e692887ad0946` | 2026-09-23T18:13:26.567Z |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | 605 | `e28c1c8d0527a5195cd5765acaf94e91bc23f47a6cb23b682efd41ce2384c8b6` | 2026-09-23T18:13:26.549Z |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | 33185 | `08e89bea1dc116ed322e2071224a8ad104a68c278a3987fb50b9c7b1e340a0b0` | 2026-09-23T18:13:26.559Z |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | 28722 | `f8d8b341a55e003778a9a8ec612a2d116b4d80b75cd8285f718fe4bfec222c8f` | 2026-09-23T18:15:22.274Z |
| `packages-ts/galerina-devtools-package-graph/dist/index.js` | 336 | `ad5c1f921b31308bc2c57fd85d1f52541a07356c9fc4d21a4390ecadc317b407` | 2026-09-23T18:15:22.298Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suite imports dist (`packages-ts/.gitignore`
`dist/`). `dist/index.js` re-exports `MAX_SCAN_FILE_BYTES` and
`MAX_SCAN_TOTAL_BYTES` from `./scanner.js`.

Inventory `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` already
records `csf_d6acd81d895092a4750e52bf` as `PARTIAL_THIS_TREE` (low; title
“Package scan roots can traverse outside the caller-selected scope”;
path `packages-ts/galerina-devtools-package-graph/src/scanner.ts`). This
review does **not** recategorize that row.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| per-file lstat size refuse | size not safe non-negative integer or `> 1 MiB` → host file-byte bound | src 216–218; dist 170–172 | hostile huge **pass** | TEMP `hugePlusOneChars` / `overMaxFileBytes` both `threw:true` `packageGraph scan exceeds the host file-byte bound`; exact 1 MiB `fileCount:1` | non-safe / negative `s.size` is construction-only; Node `lstat` of a real file yields a safe non-negative integer |
| summed sizes refuse | `budget.bytes > 32 MiB` → host total-byte bound | src 219–222; dist 174–176 | **not** in named suite | TEMP 32×1 MiB `threw:false` `fileCount:32`; +1 small file `threw:true` host total-byte bound | named tests never import or exceed `MAX_SCAN_TOTAL_BYTES` |
| post-`readFileSync` length | `raw.length > MAX_SCAN_FILE_BYTES` throws | src 683–685; dist 612–615 | **not uniquely** (lstat already refuses oversize) | TEMP exact 1 MiB still scans; oversize never reaches this line | `raw` is UTF-8 string after `stripComments` (chars, not bytes); `readFileSync` still allocates the whole file first |
| hostile `src/huge.ts` | `MAX_SCAN_FILE_BYTES+1` chars throw host file-byte bound | tests 751–757 (`x`.repeat(MAX+1)+newline) | **pass** 76.5695ms | TEMP same message; also `Buffer.alloc(MAX+1)` | named fixture is MAX+1 `x` plus `\n` (2 bytes over), caught at list-time lstat |
| positive small `src/index.ts` | small file still scans | tests 742–749 | **pass** 4.5032ms | TEMP `smallIndex.fileCount:1` `src/index.ts` | — |
| constants | file 1 MiB; total 32 MiB | src 46–47; dist 44–45 | tests import `MAX_SCAN_FILE_BYTES` only | TEMP `MAX_SCAN_FILE_BYTES=1048576` `MAX_SCAN_TOTAL_BYTES=33554432` | named tests omit `MAX_SCAN_TOTAL_BYTES` |
| focused tests | 41/41 including compiler package scan | named command below | **41/41** 0 fail 0 skip `duration_ms 4185.9657`; compiler loaded-assets 0.6905ms; compiler `scanPackage(COMPILER_ROOT)` orphans 207.505ms | TEMP is extra, not a count | suite imports dist, not src |
| readdir skip residual | `readdirSync` catch returns `[]` | src 205; dist 147–152 | **not** in named tests | construction **CONFIRMED** in src/dist | live deny **NOT VERIFIABLE** on this NTFS host (prior chmod probe still listed) |
| lstat → `readFileSync` TOCTOU | list via `lstat` size, later unbounded `readFileSync(abs)` | src 209–227 then 682–685 | **not** in named tests | construction + exact-MAX still reads whole file | **CONFIRMED residual**; post-read throw is after allocate |
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
   → **41/41 pass**, 0 fail, 0 skip, `duration_ms 4185.9657`.
   Hostile file-byte 76.5695ms; positive small byte 4.5032ms; compiler
   orphans `scanPackage(COMPILER_ROOT)` 207.505ms.

Independent extra (`%TEMP%\zt-scan-source-byte-cap-probe\probe.mjs`;
cwd not the worktree; `file://` import of working-tree `dist/index.js`;
no production write):

| probe | result |
|---|---|
| constants | `MAX_SCAN_FILE_BYTES=1048576` `MAX_SCAN_TOTAL_BYTES=33554432` (`fileBytesIs1MiB` / `totalBytesIs32MiB` true); files/dirs/depth still 4096/4096/32 |
| small `src/index.ts` | `threw:false` `fileCount:1` `src/index.ts` |
| `x`.repeat(MAX+1)+newline `src/huge.ts` | `threw:true` host file-byte bound `fileCount:null` |
| exact 1 MiB `.ts` | `threw:false` `fileCount:1` |
| `Buffer.alloc(MAX+1)` `.ts` | `threw:true` host file-byte bound |
| 32 × 1 MiB files (exact 32 MiB summed lstat) | `threw:false` `fileCount:32` |
| those 32 plus one small extra file | `threw:true` `packageGraph scan exceeds the host total-byte bound` `fileCount:null` |

## Challenge 1 — does the scan still admit oversize source bytes?

**No on this dirty tree for the named per-file and summed-lstat caps.
CONFIRMED closed for those list-time checks.** HEAD had no byte budget.
WT throws `packageGraph scan exceeds the host file-byte bound` when
`lstat` size is not a safe non-negative integer or is `> 1 MiB`, and
`packageGraph scan exceeds the host total-byte bound` when summed sizes
exceed 32 MiB. Named hostile `src/huge.ts` and the TEMP MAX+1 probes
threw; small `src/index.ts` still scans; exact 1 MiB still scans.
Summed 32 MiB still scans; 32 MiB plus one extra file throws — proved
only by the TEMP probe (named suite does not exercise the total cap).
The post-`readFileSync` `raw.length` check is present in src/dist but is
not uniquely live-exercised: list-time lstat already refuses oversize,
and `readFileSync` still allocates the whole file before the length
throw.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** `readdir`
failure still returns empty (skip, not throw). Listing uses `lstatSync`
size then later unbounded `readFileSync(abs)` with no re-lstat (TOCTOU).
Named suite does not live-exercise the 32 MiB total cap. Dirty HEAD,
unsigned TypeScript, tests load gitignored `dist/`. Inventory was not
promoted. Independent production admission remains **HOLD**. Not 124-scan
closure. Not Astra. Not clean-HEAD evidence.

## Residuals (not findings against the named per-file byte-cap claim)

- **`readdir` failure still returns empty (skip).** src 205
  `catch { return out; }` / dist 147–152. Named tests do not cover it.
  Live deny remains **NOT VERIFIABLE** on this NTFS host; the skip path
  is **CONFIRMED** in src/dist.
- **`lstat` size then `readFileSync` TOCTOU.** Symlink skip and size
  charge are at list time; later `readFileSync(abs)` follows a
  replacement and allocates the whole file, then maybe throws on
  `raw.length`. No re-lstat, no handle-bounded read.
- **32 MiB total cap not live-exercised in the named suite.**
  Implementation **CONFIRMED** (src/dist + TEMP 32×1 MiB then +1 threw
  host total-byte bound). Named tests import `MAX_SCAN_FILE_BYTES` only.
- Non-safe / negative `s.size` refuse is construction-only on this host.
- Post-read check compares JS string length after `stripComments` to a
  byte MAX; units mixed; not uniquely hit by named hostile fixture.
- `dirHasCode` (vacuous-border helper) still walks without this budget.
  Extra, not the named `listSourceFiles` claim.
- Independent production admission HOLD. Dirty HEAD, no commit, no
  signed certified deployment.
- Finding inventory is **not** promoted. `csf_d6acd81d895092a4750e52bf`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named per-file / summed-lstat source-byte
cap. Evidence is sufficient that `listSourceFiles` refuses unsafe or
over-1-MiB `lstat` sizes, that summed sizes over 32 MiB throw, that
`src/huge.ts` of MAX+1 chars throws host file-byte bound, that small
`src/index.ts` still scans, and that the post-`readFileSync` length
check exists. Evidence is insufficient for PATCHED promotion (`readdir`
skip, lstat/`readFileSync` TOCTOU, named-suite total-cap gap) and for
production admission.

**PASS scoped.** Hashes **MATCH**. Tests **41/41**. Finding stays
**PARTIAL_THIS_TREE**. Residuals: readdir skip; lstat→readFileSync
TOCTOU; 32 MiB total cap not live-exercised in the named suite. Not
production admission. Not Astra. Not 124-scan closure. **Not clean-HEAD
evidence.**
