# Independent audit — loadProject / listLOFiles aggregate source budgets

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `loadProject` / `listLOFiles` enforce aggregate source
budgets: `MAX_PROJECT_FILES=4096`, `MAX_PROJECT_FILE_BYTES=10MiB`,
`MAX_PROJECT_TOTAL_BYTES=32MiB`, `MAX_PROJECT_DEPTH=32`. Walk refuses
depth `> 32` and file count `>= 4096`. `loadProject` lstat-skips
symlinks and refuses oversized files; sums total bytes before/while
reading. Hostile tests: depth+2 nested dirs throw `/nesting exceeds/`;
`Buffer.alloc(MAX_PROJECT_FILE_BYTES+1)` `huge.fungi` throws `/not an
admitted regular file|exceeds/`; small project admits.

Tests: `packages-ts/galerina-core/compiler/project-ingest-bounds.test.mjs`
`require("./galerina.js")` (this JS compiler, not a gitignored dist).

Scan `csf_d27f1685f1b406f9a3f55647` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
`76431095cf9305eb88482a87a062f5f95b9eb6229d4fa6ce5fa73ea00a505a91`
`disposition_counts` independently re-counted here as **80 OPEN /
40 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 80,
`PARTIAL_THIS_TREE` 40, `PATCHED_AUDIT_PENDING` 4; `n` 124). This
reviewer did not re-adjudicate the other 123 IDs. This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Tests
import the working-tree `galerina.js` directly. This reviewer did not
rebuild.

Production `MAX_*` / `loadProject` / `listLOFiles` bounds are **clean vs
HEAD** `91b4dec0` (git blob `e8fecad285bee13b78cd6cc17191e4fbdba0b25b`
already contains the four constants and both functions). Dirty vs HEAD
for this claim: `module.exports` of `loadProject`+`MAX_*` plus
`if (require.main === module) { main(process.argv); }` (HEAD ended with
unconditional `main(process.argv);`) and the new untracked test file.
`galerina.js` also has unrelated dirty `pathIsSymlink` /
`refuseBuildOutputLinks` / `writeReportFiles` link-refuse (AI-guide
output path). That hunk does not change ingest and is **not this
claim**. Working-tree git blob `0a98b97ad52dad2a26f2108cd5b9868f11dfa121`.
`listLOFiles` is module-private (not exported); `loadProject` is the
observable.

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of the
working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-core/compiler/galerina.js` | `40ff3d3b23c8633b7e2bb1b368fc9420428025d920a05cf561a068bd201d1836` |
| `packages-ts/galerina-core/compiler/project-ingest-bounds.test.mjs` | `039978ead11773d215bd519edb0ec803a40b25078b20ae1972ae9939a3b68b42` |

HEAD test path does not exist (untracked). HEAD `galerina.js` tail is
`main(process.argv);` with no `module.exports`. Scan-era ancestor
`0f24ca30ef3f173c43a60c914c18b161327f2227` `loadProject` used
`fs.statSync` (follows links), mapped `readFileSync` with no size sum,
and `listLOFiles` walked with no depth / file-count / symlink skip and
no `MAX_PROJECT_*` symbols.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `MAX_PROJECT_FILES=4096` | galerina.js 761; exported; independent `MAX_PROJECT_FILES=4096` |
| `MAX_PROJECT_FILE_BYTES=10MiB` | 762 `10 * 1024 * 1024` = 10485760; independent match |
| `MAX_PROJECT_TOTAL_BYTES=32MiB` | 763 `32 * 1024 * 1024` = 33554432; independent match |
| `MAX_PROJECT_DEPTH=32` | 764; independent match |
| Walk refuses depth `> 32` | `listLOFiles` walk 817–818 `if (depth > MAX_PROJECT_DEPTH) fail(... nesting exceeds ...)`. Root walk is depth 0. Named hostile `MAX_PROJECT_DEPTH+2`; independent depth 33 and 34 throw `/nesting exceeds/`; depth 32 still admits |
| Walk refuses file count `>= 4096` | 833–835 `if (output.length >= MAX_PROJECT_FILES)` **before** push, so the 4096th `.fungi` is admitted and the 4097th fails. **4097 files not created** (allowed residual) |
| `loadProject` lstat-skips / refuses symlinks | root 772–775 `lstatSync` then fail if symlink; per-file 790–792 `st.isSymbolicLink() \|\| !st.isFile() \|\| st.size > MAX` → `"not an admitted regular file"`. Walk 828 Dirent `isSymbolicLink()` `continue`. Independent: `link.fungi` skipped, `real.fungi` admitted; root symlink throws `/symbolic link/` |
| Refuses oversized files | 791 `st.size > MAX_PROJECT_FILE_BYTES` before `readFileSync`; 799–800 post-read `Buffer.byteLength` `"exceeds"`. Named `huge.fungi` `MAX+1`; independent `size_plus` / single-file huge throw `/not an admitted regular file\|exceeds/`; exact `MAX` admits |
| Sums total bytes before/while reading | 785–797 `totalBytes += st.size` then refuse `"Project source exceeds"` **before** that file’s `readFileSync`. Independent four chunks of `floor(32MiB/4)+1` throw `/Project source exceeds/` |
| Small project admits | named test; independent `small_admit_count=1` `main.fungi` |
| Import does not run CLI | dirty `require.main === module` guard 5833–5835; named suite and probe both `require("./galerina.js")` without `main()` |
| Named node tests | **3/3 pass** under the assigned file, `duration_ms 177.0017` |
| 124-finding scan | **not this claim** (`csf_d27f1685f1b406f9a3f55647` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core/compiler/project-ingest-bounds.test.mjs`
   → **3/3 pass**, 0 fail, `duration_ms 177.0017`.
   - `loadProject admits a small project under the budgets` — **green** (4.6141ms)
   - `hostile: nesting deeper than MAX_PROJECT_DEPTH is refused` — **green** (18.6888ms)
   - `hostile: a source file larger than MAX_PROJECT_FILE_BYTES is refused` — **green** (7.2483ms)

Independent extra probes (eval only; temp
`%TEMP%\project-ingest-bounds-probe.mjs`, not production; requires the
same working-tree `galerina.js`). Printed `PROBE_OK`. Node v24.18.0.

- constants `4096` / `10485760` / `33554432` / `32`
- `listLOFiles_exported=false`; exports are `writeReportFiles`,
  `normaliseBuildOutputPath`, `loadProject`, four `MAX_*`
- small project `files.length=1` `main.fungi`
- **depth 32 admit** `true`; **depth 33** and **depth 34** throw
  `/nesting exceeds/`
- exact `MAX_PROJECT_FILE_BYTES` admit (`exact_size_bytes=10485760`)
- `MAX+1` directory `huge.fungi` and single-file path both throw
  `/not an admitted regular file|exceeds/` (`size_plus_admitted=true`
  — lstat size gate, not the post-read `"exceeds"` message)
- file symlink created; `symlink_skipped_count=1` `real.fungi` only
- directory root symlink throws `/symbolic link/`
- four files of 8388609 bytes (`> 32MiB` total, each `< 10MiB`) throw
  `/Project source exceeds/`

Scan-shaped `0f24ca30` reconstruction (no `MAX_*`, `statSync` root,
unbounded `walk(dir)` with no symlink skip, `readFileSync` with no
size/total check) would have ingested the named huge file and the
depth+2 tree.

## Challenge 1 — does a small project still admit?

**Yes. CONFIRMED.** Named test `project.files.length === 1` and
independent `small_admit_count=1`. Detector can go green.

## Challenge 2 — does nesting deeper than 32 still ingest?

**No. CONFIRMED refused.** Walk `depth > 32` throws `"Project directory
nesting exceeds 32"`. Named `MAX_PROJECT_DEPTH+2` and independent
depth 33 / 34 all `/nesting exceeds/`. Depth 32 still admits, so the
predicate is `>` not `>=`.

## Challenge 3 — does a file larger than 10MiB still ingest?

**No. CONFIRMED refused.** `st.size > MAX_PROJECT_FILE_BYTES` fails
closed as `"not an admitted regular file"` before `readFileSync`.
Named `Buffer.alloc(MAX+1)` and independent directory + single-file
paths throw. Exact 10MiB still admits.

## Challenge 4 — are the production bounds only in the dirty export slice?

**No. CONFIRMED in HEAD.** `git diff` hunks are `refuseBuildOutputLinks`
(not this claim) and the `require.main` / `module.exports` tail. HEAD
blob already has `MAX_*`, `loadProject` lstat/size/total, and
`listLOFiles` depth/file-count/symlink skip. Dirty exports exist so the
new test can `require` the CLI file without running `main(process.argv)`.

## Residuals (not findings against the named ingest-budget claim)

- **TOCTOU** between `lstatSync` and `readFileSync`. A file can grow
  after the size/total sum. Post-read `Buffer.byteLength` still refuses
  a single file `> 10MiB`; a many-file total that grows past 32MiB
  after the lstat sum is not re-checked on the concatenated UTF-8.
- **File-count 4097 not exercised** (creating 4097 files). Code admits
  4096 and fails on the next push (`length >= 4096` before push).
- **Swallowed `readdir` errors** (`catch { return; }` at 823–825): an
  unreadable directory is omitted rather than fail-closed.
- `listLOFiles` is not exported; tests/probes observe it only through
  `loadProject` on a directory.
- `collectProjectDirectories` (dev-watch) is still an unbounded
  directory walk with no depth/file-count budget. **Not this claim.**
- Unrelated dirty `refuseBuildOutputLinks` is **not this claim.**
- Scan ID `csf_d27f1685f1b406f9a3f55647`
  (`Project ingestion has no aggregate source size, file-count, or
  traversal-depth budget`, medium,
  `packages-ts/galerina-core/compiler/galerina.js`) stays
  `PARTIAL_THIS_TREE`. Inventory
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `76431095cf9305eb88482a87a062f5f95b9eb6229d4fa6ce5fa73ea00a505a91`
  `disposition_counts` independently re-counted **80 OPEN / 40 PARTIAL /
  4 PATCHED**. This review did not re-adjudicate the other 123 IDs.
  Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named aggregate source-budget claim
(constants, depth `> 32` refuse, per-file 10MiB refuse, total 32MiB
sum, symlink skip/refuse, small-project admit). Detector is not
invalid. Evidence is sufficient for those bullets; insufficient for
the 4097-file push, readdir fail-closed, lstat/read TOCTOU, watch-walk
bounds, scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
