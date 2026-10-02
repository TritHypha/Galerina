# Independent audit — package scan roots / task loader / formatter symlink

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent lows):

- **A. `csf_d6acd81d895092a4750e52bf`**: Package scan roots escaping
  scope. File
  `packages-ts/galerina-devtools-package-graph/src/scanner.ts`.
  ALREADY: `admitScanRoot` canonicalizes, `lstat`s, refuses
  symlink/non-dir and `../` escape. Tests
  `tests/package-graph.test.mjs` include “explicit missing or escaping
  scan roots are refused” (suite **36/36**). THIS TURN did not rewrite
  that path. Residual the author flags: no aggregate
  traversal/input-size budget on `listSourceFiles`.

- **B. `csf_cd736ac270a43e44766d688f`**: Task loader unbounded read.
  File `packages-ts/galerina-core-tasks/src/load-tasks.ts`. ALREADY:
  `MAX_TASK_SOURCE_BYTES` 1MiB + `stat` size. THIS TURN: missing `stat`
  is fail-closed; `parseTasksSource` byte-caps; `extractTaskBlocks`
  uses regex `lastIndex` (no per-match slice of remaining source) and
  `MAX_TASK_BLOCKS` 4096. Tests `tests/load-tasks.test.mjs` **10/10**.
  Dist rebuilt (author). Residual the author flags: `stat` follows
  symlinks; `findMatchingBrace` still scans braces in strings.

- **C. `csf_231c2c91fe1c3bf4207683a3`**: Formatter follows source
  symlink. File `packages-ts/galerina-core/compiler/formatter.js`.
  ALREADY `lstat` refuse. THIS TURN: ENOENT/stat failure no longer
  falls through to `writeFileSync`; symlink or non-file throws. Test
  `fmt-symlink.test.mjs` **1/1**. Residual the author flags: TOCTOU
  between `lstat` and `writeFileSync`; `loadProject` also
  `lstat`-refuses source links.

This reviewer independently re-read production + tests + dist for the
three named bodies (B required src/tests/dist), hashed working-tree
bytes, ran the named suites, and executed an extra probe from `%TEMP%`
(not by trusting the named tests alone). Author-named hashes were
**not** supplied in the review packet. Independent
`crypto.createHash('sha256')` and `Get-FileHash` MATCH each other on
the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **41 OPEN / 79
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 41 = 0 high / 0 medium /
41 low, `PARTIAL_THIS_TREE` 79, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 41 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
package-graph and load-tasks suites import gitignored `dist/`
(`packages-ts/.gitignore` line 5 `dist/`). Named fmt-symlink tests
`require("./formatter.js")` (source, not dist). This reviewer did not
rebuild. Dist mtime for the tasks body is newer than matching src and
carries the named fail-closed `stat`, `parseTasksSource` byte cap,
`lastIndex`, and `MAX_TASK_BLOCKS`. Package-graph dist is newer than
its src and carries `admitScanRoot` (rebuilt earlier today with extra
dirty coverage-root helpers, not this-turn B/C).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | **M** HEAD blob `0052d4c78b` → WT blob `2ea387680e`. HEAD already had `admitScanRoot` (canonicalRelative + `lstatSync` + refuse symlink/non-dir + `fromScope` `../`). THIS TURN did not rewrite that path. Extra dirty vs HEAD, **not** the named scan-root bullet: export `DEFAULT_ROOTS`, `dirHasCode` / `scanOmitsCoveredDefaultRoots`. Src no BOM. `listSourceFiles` still unbounded recursion/`readdir` with no aggregate file/byte budget. |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | **M** HEAD blob `61b1eea0c5` → WT blob `e567a54149`. ALREADY: “explicit missing or escaping scan roots are refused” (`../victim` + missing root). Extra dirty vs HEAD, **not** that bullet: “hostile: a same-line string containing //…”; “omitting src while it holds code fails the boundary gate”. Imports `../dist/index.js`. |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | **M** HEAD blob `3c4508672f` → WT blob `ac0058675a`. Extra dirty: re-exports `scanOmitsCoveredDefaultRoots`, `DEFAULT_ROOTS`. Not the named admit-root bullet. |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | gitignored; rebuilt earlier today (`08:32:36Z` > src `08:31:47Z`); `admitScanRoot` present (canonical + lstat + symlink/non-dir + `../`); barrel `dist/index.js` re-exports `scanPackage` |
| `packages-ts/galerina-core-tasks/src/load-tasks.ts` | **M** HEAD blob `de2cdbf87c` → WT blob `d0ee09d524` (+25 / −15-ish). HEAD `admitTaskFile` returned when `stat` missing; HEAD `parseTasksSource` had no byte cap; HEAD `extractTaskBlocks` did `/\btask…/.exec(source.slice(index))` each match. THIS TURN: missing `stat` throws; `parseTasksSource` refuses `source.length > MAX_TASK_SOURCE_BYTES`; regex `lastIndex` + `MAX_TASK_BLOCKS` 4096; both constants exported. |
| `packages-ts/galerina-core-tasks/tests/load-tasks.test.mjs` | **M** HEAD blob `ea057bbf94` → WT blob `44a1424ef5` (+21). THIS TURN: “refuses a task source above the byte ceiling”; “refuses more than MAX_TASK_BLOCKS task definitions”; “refuses an oversize task file before parse”. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-tasks/dist/load-tasks.js` | gitignored; rebuilt this turn; `MAX_TASK_SOURCE_BYTES` / `MAX_TASK_BLOCKS`; missing `stat` throw; `parseTasksSource` byte cap; `re.lastIndex`; barrel `dist/index.js` re-exports those four |
| `packages-ts/galerina-core/compiler/formatter.js` | **M** HEAD blob `82add55cce` → WT blob `79aa54d6c0` (+10 / −6). HEAD `formatProject` `lstatSync` refuse of `isSymbolicLink()`, then `catch` swallowed `ENOENT` into `writeFileSync`. THIS TURN: any `lstat` failure throws `fmt cannot stat source`; symlink or non-file throws; then `writeFileSync`. |
| `packages-ts/galerina-core/compiler/fmt-symlink.test.mjs` | **??** untracked. THIS TURN: “hostile: fmt refuses to follow a source symlink and does not overwrite the target”. `require("./formatter.js")`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | 28845 | `06629e3f270ea1896acf6f1ce5125395b83bd813594530dcacdd19b31f257f5c` |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | 31330 | `afa5c91fbee938ac43b7a994285426d1dc0b308368c30716c185e6827944dd4c` |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | 27429 | `9a87044ad5333b422f35628a63788869e6266e6cc7b50fe0efe9cafc538abbb6` |
| `packages-ts/galerina-devtools-package-graph/dist/index.js` | 246 | `8ec00977bdd8398954b03b4cfaabbbf7a999f0aca8ca8448fa53a4490deab40f` |
| `packages-ts/galerina-core-tasks/src/load-tasks.ts` | 6659 | `1ef85a2faa7a664f491b2e7c56368c5c30a367709c1343870d9a25024162d53d` |
| `packages-ts/galerina-core-tasks/tests/load-tasks.test.mjs` | 5411 | `2f88b60833c7f14e0faa6bccc97f98b2f926ff71c78ff51796db580c5188e9d7` |
| `packages-ts/galerina-core-tasks/dist/load-tasks.js` | 5820 | `df2581b44d3a52129d8a42ebf0b4df911151cd9c63afab738bc15d1b4331fed0` |
| `packages-ts/galerina-core-tasks/dist/index.js` | 407 | `1a5443f292b9fc6703d896035b3dbb65f17260956fcfc3d65fe59308fcd78be9` |
| `packages-ts/galerina-core/compiler/formatter.js` | 3009 | `0528a7245b88ab483068c56f3807b166daab3886a22a073ec460f756a2cacfdf` |
| `packages-ts/galerina-core/compiler/fmt-symlink.test.mjs` | 1356 | `39bb1785dd9f67352d5695e288349d41354ba522ccff7a8d6eeb44317523a522` |

Independent MATCH (Get-FileHash ↔ crypto): scanner src
`06629e3f…257f5c`; package-graph tests `afa5c91f…44dd4c`; scanner dist
`9a87044a…8abbb6`; load-tasks src `1ef85a2f…162d53d`; load-tasks tests
`2f88b608…18e9d7`; load-tasks dist `df2581b4…331fed0`; formatter.js
`0528a724…2cacfdf`; fmt-symlink tests `39bb1785…17523a522`; inventory
`5319571d…0674359a`.

Dist mtimes (UTC): package-graph `scanner.js` `2026-09-23T08:32:36.486Z`
(src `2026-09-23T08:31:47.072Z` / tests `2026-09-23T08:31:47.073Z`);
package-graph `dist/index.js` `2026-09-23T08:32:36.514Z`; tasks
`load-tasks.js` `2026-09-23T10:02:31.576Z` (src
`2026-09-23T10:02:26.196Z` / tests `2026-09-23T10:01:06.296Z`); tasks
`dist/index.js` `2026-09-23T10:02:31.587Z`. Named tasks dist is newer
than its src. Package-graph dist is newer than its src but older than
this-turn B/C (`~10:00–10:03Z`); `admitScanRoot` was not rewritten this
turn. `formatter.js` `2026-09-23T10:00:50.048Z`; fmt-symlink tests
`2026-09-23T10:03:02.778Z`. Tasks dist was rebuilt this turn;
`admitScanRoot` was not. Fmt-symlink has no dist; tests import src.

Inventory file sha256 `5319571d88c790c3a2dd30b8b110f3018df37d274a825cd4e4f6e8400674359a`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_d6acd81d895092a4750e52bf` (`occ_50384140a6a0ee1c43fd7012`,
  path `packages-ts/galerina-devtools-package-graph/src/scanner.ts`,
  scan-era `start_line` 180, title “Package scan roots can traverse
  outside the caller-selected scope”)
- `csf_cd736ac270a43e44766d688f` (`occ_507510d0fa7ede6821a5a810`,
  path `packages-ts/galerina-core-tasks/src/load-tasks.ts`,
  scan-era `start_line` 9, title “Task loader allocates an entire
  source file without a byte ceiling”)
- `csf_231c2c91fe1c3bf4207683a3` (`occ_520cdb2d781b91ff08543a8c`,
  path `packages-ts/galerina-core/compiler/formatter.js`,
  scan-era `start_line` 48, title “Formatter follows a caller-supplied
  source symlink and overwrites its target”)

Named package-graph/load-tasks tests import gitignored dist, not src.
Named fmt-symlink tests import source.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. `admitScanRoot` canonicalizes | src 614–615 `canonicalRelative("roots", root)`; `canonicalRelative` 292–293 refuses `..` / `../` |
| A. `lstat`, refuse symlink/non-dir | src 617–626 `lstatSync` then `isSymbolicLink() \|\| !isDirectory()`; dist same |
| A. refuse `../` escape after resolve | src 627–630 `fromScope === ".." \|\| startsWith("../")` |
| A. HEAD already had that helper | HEAD `admitScanRoot` identical; THIS TURN did not rewrite it |
| A. Tests refuse missing + escaping roots | WT tests 697–709 (also on HEAD); missing `/does not exist/`; `../victim` `/canonical\|inside the package\|\.\./` 7.923ms |
| A. Suite **36/36** | named suite 36 pass 0 skip; extra dirty tests (same-line `//`, omitting `src`) also green |
| A. THIS TURN did not rewrite that path | scanner extra dirty is `scanOmitsCoveredDefaultRoots` / `DEFAULT_ROOTS` export; mtime 08:31:47Z vs B/C ~10:02Z |
| A. Residual: no aggregate traversal/input-size budget on `listSourceFiles` | src 177–195 recursive `readdirSync`/`lstatSync`, no `MAX_` / byte / file-count cap; `out.push(...listSourceFiles(...))` |
| B. ALREADY `MAX_TASK_SOURCE_BYTES` 1MiB + `stat` size | src 4 / 14–16; HEAD already had the constant (unexported) and `st.size` check |
| B. THIS TURN missing `stat` is fail-closed | src 11–13 throw `task file admission requires fs.stat`; HEAD `return` |
| B. THIS TURN `parseTasksSource` byte-caps | src 38–41; dist 25–28; HEAD had no cap in `parseTasksSource` |
| B. THIS TURN regex `lastIndex`, no per-match remaining-source slice | src 52 / 71 `re.lastIndex = closeBraceIndex + 1`; HEAD `source.slice(index)` each `exec` |
| B. THIS TURN `MAX_TASK_BLOCKS` 4096 | src 5 / 56–58; dist 3 / 36–38 |
| B. Dist rebuilt | dist mtime 10:02:31Z > src 10:02:26Z; suite imported that dist and passed |
| B. Tests **10/10** | named suite 10 pass 0 skip; byte ceiling 0.3744ms; `MAX_TASK_BLOCKS` 2.566ms; oversize file 88.481ms |
| B. Residual: `stat` follows symlinks | src 14 `fsPromises.stat(path)` not `lstat` |
| B. Residual: `findMatchingBrace` scans braces in strings | src 95–115 / dist 69–85 only test `char === "{"` / `"}"` |
| C. ALREADY `lstat` refuse | HEAD `lstatSync(source.path).isSymbolicLink()` throw |
| C. THIS TURN ENOENT/stat failure does not fall through to `writeFileSync` | src 50–54 catch always throws `fmt cannot stat source`; HEAD swallowed `ENOENT` |
| C. THIS TURN symlink or non-file throws | src 55–57 `st.isSymbolicLink() \|\| !st.isFile()` |
| C. Tests **1/1** | named suite 1 pass 0 skip 6.0084ms; symlink not skipped on this host |
| C. Residual: TOCTOU between `lstat` and `writeFileSync` | src 51 then 58; extra probe `writeFileAfterLstat:true`, `noFdIdentity:true` (source-shape) |
| C. Residual: `loadProject` also `lstat`-refuses source links | `galerina.js` 772–774 root link; 790–792 per-file `isSymbolicLink() \|\| !isFile()` |
| Package-graph 36 named tests | `node --test tests/package-graph.test.mjs` → 36/36 |
| Load-tasks 10 named tests | `node --test tests/load-tasks.test.mjs` → 10/10 |
| Fmt-symlink 1 named test | `node --test fmt-symlink.test.mjs` → 1/1 |
| Dist not stale for named rebuilt body B | hashes + same order in src/dist; tasks dist newer than src; named suite imported that barrel and passed; extra probe imported the same dist + formatter src + package-graph dist |
| Inventory 41/79/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` scanner src; `M`
   package-graph tests; `M` package-graph `index.ts`; `M` load-tasks
   src; `M` load-tasks tests; `M` formatter.js; `??` fmt-symlink tests;
   dist gitignored (not listed).

2. `node --test tests/package-graph.test.mjs` in
   `packages-ts/galerina-devtools-package-graph`
   → **36/36 pass**, 0 fail, 0 skip, `duration_ms 1002.2432`.
   Explicit missing or escaping scan roots 7.923ms; green.

3. `node --test tests/load-tasks.test.mjs` in
   `packages-ts/galerina-core-tasks`
   → **10/10 pass**, 0 fail, 0 skip, `duration_ms 266.4257`.
   Byte ceiling 0.3744ms; `MAX_TASK_BLOCKS` 2.566ms; oversize file
   before parse 88.481ms; all green.

4. `node --test fmt-symlink.test.mjs` in
   `packages-ts/galerina-core/compiler`
   → **1/1 pass**, 0 fail, 0 skip, `duration_ms 137.9827`.
   Hostile source symlink 6.0084ms; not skipped on this host.

Independent extra (`%TEMP%\zt-scanroots-tasks-fmt-probe\probe.mjs`;
cwd `%TEMP%\zt-scanroots-tasks-fmt-probe`; `file://` import of
working-tree package-graph/tasks dist and `require` of formatter.js
src; no production write):

| probe | result |
|---|---|
| escaping `packageGraph.roots: ["../victim"]` | **`scanEscapeThrew:true`**, msg `packageGraph.roots '../victim' must be canonical and contain no '..'` |
| `parseTasksSource("x".repeat(MAX_TASK_SOURCE_BYTES + 1))` | **`parseOversizeThrew:true`**, msg `task source exceeds 1048576 bytes` |
| `formatProject` on source symlink | **`fmtSymlinkThrew:true`**, msg `fmt refuses to follow a source symlink: main.fungi`; **`targetUnchanged:true`** |
| ENOENT `formatProject` (this-turn vs HEAD fallthrough) | **`fmtEnoentThrew:true`**, msg `fmt cannot stat source: missing.fungi`; **`missingNotCreated:true`** |

## Challenge 1 — can package scan roots still traverse outside the caller-selected scope?

**No on this dirty tree for configured `packageGraph.roots`. CONFIRMED
closed for the named canonicalize + `lstat` + symlink/non-dir + `../`
refuse. THIS TURN did not rewrite that path.** HEAD already called
`admitScanRoot` (canonicalRelative forbids `..`, `lstatSync` refuses
symlink/non-directory, resolved path must stay inside `scopePath`).
Named suite 36/36 including the HEAD-era missing/`../victim` test.
Extra probe: `roots: ["../victim"]` throws canonical-no-`..` before any
walk. Dist `admitScanRoot` matches src. Extra dirty vs HEAD on this
file (`scanOmitsCoveredDefaultRoots`) is outside this bullet. Residual:
`listSourceFiles` still has no aggregate traversal or input-size
budget once a root is admitted.

Scan-era object `0f6063dd…:packages-ts/galerina-devtools-package-graph/src/scanner.ts`
is **not** recategorized. Inventory still lists the row OPEN.
Scan-era `start_line` 180 is the HEAD `listSourceFiles` walk.

## Challenge 2 — does the task loader still allocate an entire source file without a byte ceiling? Is dist stale?

**No unbounded `parseTasksSource` on this dirty tree for the named
byte/block caps. Dist not stale for the named tasks body.** HEAD
already `stat`-sized `admitTaskFile` + post-`readFile` length check,
but swallowed a missing `stat` and let `parseTasksSource` run without a
cap while `extractTaskBlocks` sliced the remaining source on every
match. THIS TURN fail-closes missing `stat`, byte-caps
`parseTasksSource`, advances via `re.lastIndex`, and caps blocks at
4096. Extra probe: oversize string throws `task source exceeds 1048576
bytes`. Named byte-ceiling / `MAX_TASK_BLOCKS` / oversize-file tests
are red-capable against HEAD. Dist `parseTasksSource` matches src and
is newer than src; named suite imported that barrel and passed.
Residual: `stat` follows symlinks; `findMatchingBrace` does not skip
braces inside strings.

Scan-era object `0f6063dd…:packages-ts/galerina-core-tasks/src/load-tasks.ts`
is **not** recategorized.

## Challenge 3 — does fmt still follow a caller-supplied source symlink and overwrite its target? Is this 124-scan closure?

**No follow of an existing source symlink on this dirty tree.
CONFIRMED closed for the named `lstat` refuse plus this-turn ENOENT
no-fallthrough. Dist N/A (tests import src). Not 124-scan closure.**
HEAD already refused `lstat` symlink but swallowed `ENOENT` into
`writeFileSync`. THIS TURN throws on any stat failure and on
symlink/non-file, then writes. Named 1/1 is red-capable against a
formatter that followed the link (scan-era); HEAD would also have
thrown on an existing symlink. Extra probe: symlink throw + target
bytes unchanged, **and** ENOENT throw with the missing path not
created (red-capable against HEAD fallthrough). Residual: TOCTOU
between last `lstat` and `writeFileSync`; `loadProject` in
`galerina.js` independently `lstat`-refuses source links (766–792).

CSF rows remain `OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **79** `PARTIAL_THIS_TREE`, **41**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 41 low). This review does
not recategorize the rows.

## Residuals (not findings against the three named bullets)

- Scan roots: `listSourceFiles` still recursively `readdir`/`lstat`
  with no aggregate file-count or byte budget. Cap/refuse work is in
  `admitScanRoot`, not that walker. Extra dirty vs HEAD
  (`scanOmitsCoveredDefaultRoots` / `DEFAULT_ROOTS` export / omitting-src
  gate test / same-line `//` test) is outside the named escape bullet.
- Task loader: `admitTaskFile` uses `stat` (follows symlinks), not
  `lstat`. `findMatchingBrace` still treats `{`/`}` inside strings as
  structure, so a hostile string/`}` can widen or truncate a task
  block. `readFile` still follows the admitted path after `stat`
  (TOCTOU vs replace with a link).
- Formatter: last `lstat` then `writeFileSync` remains TOCTOU vs a
  replace of the leaf with a link; no `open`+`fstat` identity check.
  Extra probe source-shape still writes after lstat. `loadProject`
  already `lstat`-refuses source links; that is a related ingest
  control, not this write path.
- Named package-graph/load-tasks suites import gitignored dist, not
  src. Dist was confirmed non-stale for the named tasks body and
  carries `admitScanRoot` for package-graph; this receipt did not
  rebuild. Fmt-symlink tests import src.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 41 OPEN / 79 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era escaping package scan roots, unbounded task
source allocation, or formatter symlink follow; this dirty tree has
the named `admitScanRoot` refuse (already present; not rewritten this
turn; 36/36 still green), this-turn fail-closed `stat` +
`parseTasksSource` byte/block caps with rebuilt dist (10/10), and
`lstat` refuse plus ENOENT no-fallthrough on fmt (1/1), with executed
red-capable evidence on dist/src. Residuals above remain outside those
bullets. Evidence is sufficient for those bullets; insufficient for
scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-scanroots-tasks-fmt-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** package-graph **36/36**; load-tasks **10/10**; fmt-symlink **1/1**
- **Extra-probe:** `%TEMP%\zt-scanroots-tasks-fmt-probe` — escaping `../victim` scan throws canonical-no-`..`; `parseTasksSource` oversize throws `1048576 bytes`; `formatProject` on symlink throws and target bytes unchanged; ENOENT no longer writes
- **Residuals:** `listSourceFiles` no aggregate budget; task `stat` follows symlinks; `findMatchingBrace` ignores strings; fmt TOCTOU vs replace / no fd identity; `loadProject` also lstat-refuses
- **git status (named):** `M` scanner src; `M` package-graph tests; `M` package-graph `index.ts`; `M` load-tasks src; `M` load-tasks tests; `M` formatter.js; `??` fmt-symlink tests; extra dirty elsewhere on this worktree; `??` this receipt; dist gitignored. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
