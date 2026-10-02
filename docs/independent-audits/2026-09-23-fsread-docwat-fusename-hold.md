# Independent audit — fs.read nofollow / emit-doc-wat source= / fuse package name

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

- **A. `csf_487865ffec641dbfe1b0b711`**: Filesystem reads reopen a checked
  path in a way that follows a substituted symlink. File
  `packages-ts/galerina-core-compiler/src/stdlib.ts`. THIS TURN:
  `fs.readText` / `fs.readBytes` (and `File.*`) `openSync` with
  `O_RDONLY | (O_NOFOLLOW ?? 0)`, `fstatSync` `isFile`, `readFileSync(fd)`,
  `closeSync`. Writes unchanged (`writeFile(safePath)`). Tests
  `tests/fs-root-symlink-refuse.test.mjs` **4/4** including regular-file
  read and symlink read refuse. Dist rebuilt (author). Residual the
  author flags: `O_NOFOLLOW` may be 0 / absent on some Windows builds;
  `lstat`/`readlink` still run first; remaining TOCTOU if `open` follows.

- **B. `csf_0a95c15113bc3d0743b38458`**: Marker `source=` must not import
  files outside the repository. File `scripts/emit-doc-wat.mjs`. THIS
  TURN: exported `admitDocWatSource` (NUL, empty/`./`/`..` parts, leading
  `/` or `\`, `isAbsolute`, drive). `generateExcerpt` uses it then
  `relative(ROOT)` escape check. `isDirectRun` so import does not load
  the compiler or walk docs. Tests `scripts/tests/emit-doc-wat.test.mjs`
  **2/2**. Residual the author flags: still reads after admit (TOCTOU vs
  replace with symlink); flow name list unbounded.

- **C. `csf_33d88401265b94e1efe460dc`**: Package name must not derive
  manifest/wasm paths that escape `dist`. File
  `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts`. THIS
  TURN: exported `admitFusePackageName` (token regex, no `..` `/` `\`
  NUL). `loadAndVerifyPackage` uses it before
  `join(dist, name.lmanifest.json / name.wasm)`. Tests
  `fuse-loader.test.mjs` **22/22** including hostile `../evil`. Dist
  rebuilt (author). Residual the author flags: name gate does not verify
  Ed25519; `basename(dir)` fallback still used when JSON `name` is
  missing (then admitted).

This reviewer independently re-read production + tests + dist for the
three named bodies, hashed working-tree bytes, ran the named suites,
and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not** supplied in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **29 OPEN / 91
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 29 = 0 high / 0 medium /
29 low, `PARTIAL_THIS_TREE` 91 = 68 medium / 23 low,
`PATCHED_AUDIT_PENDING` 4 high; `n` 124; disposition sum 124). The three
named IDs are among the 29 OPEN lows. Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named fs
and fuse suites import gitignored `dist/` (`packages-ts/.gitignore`
line 5 `dist/`). Named emit-doc-wat tests import source
`scripts/emit-doc-wat.mjs`. This reviewer did not rebuild. Dist mtime
for stdlib and fuse-loader is newer than matching src and carries the
named `O_NOFOLLOW` open and `admitFusePackageName`.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | **M** HEAD blob `25c3c6a4b4` → WT blob `1ba00cc6f1` (+37 / −8 on this file). HEAD `filesystemAsync` reads `await nodeFs.readFile(safePath)` (follows). THIS TURN: `openSync` + `O_NOFOLLOW ?? 0` + `fstat` `isFile` + `readFileSync(fd)` + `closeSync`. Writes still `writeFile(safePath)`. |
| `packages-ts/galerina-core-compiler/tests/fs-root-symlink-refuse.test.mjs` | **??** untracked. 4 tests: write regular; dangling-symlink write refuse; read regular; symlink read refuse. Imports `../dist/stdlib.js`. |
| `packages-ts/galerina-core-compiler/dist/stdlib.js` | gitignored; rebuilt this turn; read path 1758–1778 `O_NOFOLLOW ?? 0` / `openSync` / `readFileSync(fd)` |
| `scripts/emit-doc-wat.mjs` | **M** HEAD blob `dbfec5067b` → WT blob `0e9b8046d9`. HEAD `generateExcerpt` already had inline NUL / empty `.` `..` parts / leading `/` / drive + `relative(ROOT)` escape; HEAD `const L = await loadCompiler()` always, then walked `DOCS` on import. THIS TURN: exported `admitDocWatSource` (+ leading `\`, `isAbsolute`); `isDirectRun` gates compiler load and doc walk. |
| `scripts/tests/emit-doc-wat.test.mjs` | **??** untracked. 2 tests: repo-relative accept; hostile `../` / `/etc` / `C:/` / UNC / empty. Imports `../emit-doc-wat.mjs` (source). |
| `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts` | **M** HEAD blob `9c999120dd` → WT blob `eeaaa08376`. HEAD already gated `regex \|\| path.basename(name) !== name` then `join(dist, name.…)`. THIS TURN: exported `admitFusePackageName` (regex + no `..` `/` `\` NUL) replacing the basename-equality check; still `basename(dir)` when JSON `name` missing, then admitted. |
| `packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs` | **M** HEAD blob `66067be81c` → WT blob `202b47adc2` (+25). THIS TURN: `admitFusePackageName` unit cases + hostile `package.fungi.json` `name: "../evil"` → `FUNGI-FUSE-BAD-PACKAGE`. Imports `../dist/index.js`. |
| `packages-ts/galerina-framework-app-kernel/dist/fuse-loader.js` | gitignored; rebuilt this turn; `admitFusePackageName` 367–373; `loadAndVerifyPackage` 379–384 uses it before join. Barrel `dist/index.js` `export * from "./fuse-loader.js"`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | 135944 | `0fe47a0dd09a58876be574621cc27e49270e5c1f0612cdba303acae235f883c2` |
| `packages-ts/galerina-core-compiler/tests/fs-root-symlink-refuse.test.mjs` | 4138 | `a42000b9cfebe2dfb4dfbf55bf83a7809217ccc7b022ec0c8fd8ce478777da2a` |
| `packages-ts/galerina-core-compiler/dist/stdlib.js` | 135588 | `815c6c2b3e2fd970e29249855eb90f24f4f5b2118926e7c85d924dff59e3cdf2` |
| `scripts/emit-doc-wat.mjs` | 7889 | `2822ae56b994294ccc7953aac2c1a46f5e1e23173f1dec3fa4cb463abcfe05c2` |
| `scripts/tests/emit-doc-wat.test.mjs` | 749 | `4fba2ad222c0ca36e46313269e0ea9237ffaee13de4209814a4e0c73cf6a260d` |
| `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts` | 54116 | `c528e53a872d34428b10d3c31bb1abf379c4eda381ccfc6fa1c7add26e43d3e3` |
| `packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs` | 30807 | `6367cbed6a99ab531f5359cb02453eda02b6cbc6b373e6a7a5cf75e9d4d6dc65` |
| `packages-ts/galerina-framework-app-kernel/dist/fuse-loader.js` | 39852 | `b8ea5623b397b705c2e955550fa270f629474e570c3688a65e0a063337fc3a5d` |
| `packages-ts/galerina-framework-app-kernel/dist/index.js` | 2117 | `e9b4541e997e514b763dd762310e833fc95cffda9f615b233ccfabe37d0bfb9d` |

Independent MATCH (Get-FileHash ↔ crypto): stdlib src
`0fe47a0d…f883c2`; fs tests `a42000b9…77da2a`; stdlib dist
`815c6c2b…e3cdf2`; emit-doc-wat `2822ae56…fe05c2`; emit-doc-wat tests
`4fba2ad2…6a260d`; fuse-loader src `c528e53a…43d3e3`; fuse tests
`6367cbed…d6dc65`; fuse-loader dist `b8ea5623…fc3a5d`; fuse dist index
`e9b4541e…0bfb9d`; inventory `82889b70…bdd2e9`.

Dist mtimes (UTC): `stdlib.js` `2026-09-23T11:00:48.469Z` (src
`2026-09-23T10:59:29.320Z` / tests `2026-09-23T11:00:35.720Z`);
`fuse-loader.js` `2026-09-23T11:00:46.231Z` (src `10:59:29.320Z` /
tests `11:00:35.720Z`); fuse `dist/index.js` `11:00:46.366Z`. Named
stdlib and fuse dist are newer than their src. emit-doc-wat has no dist;
tests import src (`11:00:00.596Z`). This receipt did not rebuild.

Inventory file sha256 `82889b701995c7067072851e89f853a4ae54f7f47d1b82fac2f8eb8b0bbdd2e9`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
`worktree_head` `91b4dec08fe4376febc9494a8023bd02912b8695`. `overall`
`INCOMPLETE_NON_AUTHORITATIVE`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_487865ffec641dbfe1b0b711` (`occ_84b80b5af004a0d8ab81d052`,
  path `packages-ts/galerina-core-compiler/src/stdlib.ts`,
  scan-era `start_line` 1762, title “Filesystem reads reopen checked
  paths and permit link-substitution escape”)
- `csf_0a95c15113bc3d0743b38458` (`occ_8d1f02072684b635894cfdb4`,
  path `scripts/emit-doc-wat.mjs`,
  scan-era `start_line` 47, title “emit-doc-wat permits
  repository-controlled markers to import files outside the
  repository”)
- `csf_33d88401265b94e1efe460dc` (`occ_8ea0357da7b66d6ef7b9a0da`,
  path `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts`,
  scan-era `start_line` 558, title “Fuse loader derives manifest and
  WASM paths from an unvalidated package name”)

Named fs/fuse suites import gitignored dist, not src. Named emit-doc-wat
suite imports source.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. Reads open with `O_RDONLY\|O_NOFOLLOW` (when defined) | src 1813–1818; dist 1758–1763 `O_NOFOLLOW ?? 0` |
| A. `fstat` `isFile`, read from fd, close | src 1819–1830; dist 1764–1778 `readFileSync(fd)` / `closeSync` |
| A. Writes unchanged | src 1833–1840 / dist 1780–1787 still `writeFile(safePath)` |
| A. HEAD reopened via `readFile(safePath)` (follows) | HEAD 1804–1809 `await nodeFs.readFile(safePath)` |
| A. THIS TURN tests regular read + symlink refuse | WT tests 67–82 `hello`; 84–107 err match `symbolic link\|symlink\|not a regular file\|ELOOP\|EINVAL` |
| A. Dist rebuilt | dist mtime 11:00:48Z > src 10:59:29Z; suite imported that dist and passed |
| A. Residual: `O_NOFOLLOW` undefined on this host | extra probe `O_NOFOLLOW_type:"undefined"`; `O_RDONLY:0` so flags = 0; `lstat`/`readlink` still first at src 1775–1784 |
| A. Residual: remaining TOCTOU if `open` follows | src 1775 then 1818; no fd identity vs the lstat inode |
| B. Exported `admitDocWatSource` | src 47–56; tests import it |
| B. NUL / empty / `.` / `..` / leading `/` `\` / `isAbsolute` / drive | src 48–55; HEAD lacked `\` and `isAbsolute` |
| B. `generateExcerpt` uses admit then `relative(ROOT)` | src 58–66 |
| B. `isDirectRun` skips compiler load and doc walk on import | src 104–111, 128–129; HEAD `const L = await loadCompiler()` always |
| B. THIS TURN tests traversal/absolute | WT tests 9–16 `../secret`, `docs/../../etc/passwd`, `/etc/passwd`, `C:/`, UNC, empty |
| B. Residual: read after admit (symlink TOCTOU); unbounded flow list | src 67 `readFileSync(absSource)`; src 76 `for (const name of flowNames)` |
| C. Exported `admitFusePackageName` token + no `..` `/` `\` NUL | src 562–569; dist 367–373 |
| C. Used before `join(dist, name.lmanifest.json / name.wasm)` | src 580–587; dist 378–384 |
| C. HEAD already had inline regex + `basename(name) !== name` | HEAD 570–572 |
| C. THIS TURN tests `../evil` | WT tests 560–567 unit; 569–580 `FUNGI-FUSE-BAD-PACKAGE` |
| C. Dist rebuilt | dist mtime 11:00:46Z > src 10:59:29Z; suite imported barrel and passed |
| C. Residual: name gate is not Ed25519; `basename(dir)` fallback | src 580 then 581; signature still later at 620 |
| fs-root-symlink-refuse 4 named tests | `node --test …/fs-root-symlink-refuse.test.mjs` → 4/4 |
| emit-doc-wat 2 named tests | `node --test scripts/tests/emit-doc-wat.test.mjs` → 2/2 |
| fuse-loader 22 named tests | `node --test …/fuse-loader.test.mjs` → 22/22 |
| Dist not stale for named rebuilt bodies | hashes + same order in src/dist; stdlib/fuse dist newer than src; named suites imported those files and passed; extra probe imported emit-doc-wat src + fuse dist |
| Inventory 29/91/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` stdlib src; `??`
   fs-root-symlink-refuse tests; `M` emit-doc-wat; `??` emit-doc-wat
   tests; `M` fuse-loader src; `M` fuse-loader tests; dist gitignored
   (not listed).

2. `node --test packages-ts/galerina-core-compiler/tests/fs-root-symlink-refuse.test.mjs`
   → **4/4 pass**, 0 fail, 0 skip, `duration_ms 226.4027`.
   Regular read 3.647ms; hostile symlink read 3.9183ms; both green
   (symlinks not skipped on this host).

3. `node --test scripts/tests/emit-doc-wat.test.mjs`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 127.2279`.
   Hostile traversal/absolute 0.7215ms green.

4. `node --test packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs`
   → **22/22 pass**, 0 fail, 0 skip, `duration_ms 718.5944`.
   `admitFusePackageName` 0.1648ms; hostile `../evil` 14.0954ms; both
   green.

Independent extra (`%TEMP%\zt-fsread-docwat-fusename-probe\probe.mjs`;
cwd `%TEMP%\zt-fsread-docwat-fusename-probe`; `file://` import of
working-tree `scripts/emit-doc-wat.mjs` then fuse `dist/index.js`;
compiler dist imported **after** as a cache probe; no production write):

| probe | result |
|---|---|
| import emit-doc-wat from TEMP | **`emitMs:1.526`**, keys `["admitDocWatSource","extractFunc"]`; no CLI stdout; `generateExcerpt` not exported |
| compiler already loaded by that import? | **no** — compiler first import `174.555ms`, second (cache) `0.045ms`; `compilerLikelyAlreadyLoaded:false` |
| `admitDocWatSource("../x")` | **`false`** (also `/etc/passwd` false, `C:/Windows/a.fungi` false; repo-relative true) |
| `admitFusePackageName("../evil")` | **`false`** (also `foo/bar` false; `my-custom-api-rest` true) |
| `O_NOFOLLOW` on this host | **undefined**; `O_RDONLY:0` |

## Challenge 1 — do filesystem reads still reopen a checked path and follow a substituted symlink?

**No for an already-present symlink on this dirty tree. CONFIRMED closed
for the named fd-open + `isFile` + read-from-fd bullet. `O_NOFOLLOW` is
undefined on this Node 24.18.0 win32, so the nofollow bit is a no-op
here.** HEAD `readFile(safePath)` followed. THIS TURN opens with
`O_RDONLY | (O_NOFOLLOW ?? 0)`, `fstat` `isFile`, reads the fd, closes.
Named suite 4/4 including symlink read refuse (3.9183ms, not skipped).
That refuse is the pre-open `readlinkSync` / `lstatSync` (src 1775–1784)
plus `isFile`; it is **not** proof that a replace-after-lstat is
non-following, because `O_NOFOLLOW` is absent and `O_RDONLY` is 0.
Residual: TOCTOU between lstat/readlink and `openSync` if `open`
follows. Dist matches src and is newer; named suite imported that dist.

Scan-era object `0f6063dd…:packages-ts/galerina-core-compiler/src/stdlib.ts`
is **not** recategorized. Inventory still lists the row OPEN.
Scan-era `start_line` 1762 is the HEAD `readFile(safePath)` reopen.

## Challenge 2 — can marker `source=` still import files outside the repository? Does import run the CLI / load the compiler walk?

**No for the named path-admit + import-isolation bullets. Dist N/A
(source module).** HEAD already had inline NUL / empty `.` `..` parts /
leading `/` / drive + `relative(ROOT)`; HEAD always `await loadCompiler()`
and walked `DOCS` on import. THIS TURN exported `admitDocWatSource`
(adds leading `\` and `isAbsolute`) and `isDirectRun`. Extra probe from
`%TEMP%`: import 1.5ms, no CLI text, compiler **not** preloaded
(174ms cold import after); `admitDocWatSource("../x")===false`. Named
suite 2/2 is red-capable against traversal/absolute strings. Residual:
`readFileSync` after lexical admit still follows a symlink replace;
`flowsCsv.split(",")` is unbounded.

Scan-era object `0f6063dd…:scripts/emit-doc-wat.mjs` is **not**
recategorized.

## Challenge 3 — can a package name still derive manifest/wasm paths that escape `dist`? Is dist stale? Is this 124-scan closure?

**No escape via `../evil` (and `/` `\` NUL `..`) on this dirty tree.
Dist not stale for the named fuse body. Not 124-scan closure.** HEAD
already refused via regex + `path.basename(name) !== name` before join.
THIS TURN extracts `admitFusePackageName` (regex + explicit `..` `/` `\`
NUL; `foo..bar` now false) and still joins only after that gate. Extra
probe: `admitFusePackageName("../evil")===false` from fuse dist barrel.
Named hostile test writes `name: "../evil"` → `FUNGI-FUSE-BAD-PACKAGE`
(14.0954ms). Dist `admitFusePackageName` matches src and is newer;
named suite imported that barrel and passed 22/22. CSF rows remain
`OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **91** `PARTIAL_THIS_TREE`, **29**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 29 low). This review does
not recategorize the rows. Residual: name gate is not Ed25519;
`basename(dir)` is still used when JSON `name` is missing, then run
through the same admit.

## Residuals (not findings against the three named bullets)

- fs.read: on this host `fs.constants.O_NOFOLLOW` is **undefined**
  (`O_RDONLY` is 0), so `openSync` flags collapse to 0. Pre-open
  `readlink`/`lstat` still refuse an existing symlink (named suite
  4/4). Remaining TOCTOU if the leaf is replaced with a symlink
  between lstat and open; no inode identity check. Writes still
  `writeFile(safePath)` (separate inventory row
  `csf_87352346f8708fa965b75642`, not this bullet).
- emit-doc-wat: `readFileSync` after admit is TOCTOU vs replace with a
  symlink; `relative(ROOT)` is lexical and does not lstat. Flow-name
  list from `flowsCsv.split(",")` is unbounded. HEAD already had the
  core path admit; THIS TURN’s material delta is export + `\` /
  `isAbsolute` + `isDirectRun`.
- fuse name: `admitFusePackageName` is a filename token, not an Ed25519
  verify (that remains Gate 2 later). When `package.fungi.json` `name`
  is not a string, `path.basename(dir)` is still the fallback and is
  then admitted. HEAD already had regex + basename-equality; THIS TURN
  exported the gate and replaced basename-equality with explicit
  `..` `/` `\` NUL includes.
- Named fs/fuse suites import gitignored dist, not src. Dist was
  confirmed non-stale for those named bodies; this receipt did not
  rebuild. emit-doc-wat tests import src.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 29 OPEN / 91 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era path-reopen follow, marker `source=` escape, or
unvalidated fuse package-name join; this dirty tree has the named
fd-open + `isFile` + read-from-fd (this-turn src/dist + tests; nofollow
bit absent on this Windows Node), exported `admitDocWatSource` +
`isDirectRun` (src + extra-probe import isolation), and exported
`admitFusePackageName` before dist join (src/dist + hostile `../evil`),
with executed red-capable evidence. Residuals above remain outside
those bullets. Evidence is sufficient for those bullets; insufficient
for scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-fsread-docwat-fusename-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** fs-root-symlink-refuse **4/4**; emit-doc-wat **2/2**; fuse-loader **22/22**
- **Extra-probe:** `%TEMP%\zt-fsread-docwat-fusename-probe` — emit-doc-wat import 1.5ms, no CLI, compiler not preloaded; `admitDocWatSource("../x")===false`; `admitFusePackageName("../evil")===false`; `O_NOFOLLOW` undefined
- **Residuals:** `O_NOFOLLOW` undefined / read TOCTOU if open follows; emit-doc-wat read-after-admit symlink TOCTOU + unbounded flow list; fuse name gate is not Ed25519 / `basename(dir)` fallback
- **git status (named):** `M` stdlib src; `??` fs-root-symlink-refuse tests; `M` emit-doc-wat; `??` emit-doc-wat tests; `M` fuse-loader src; `M` fuse-loader tests; extra dirty elsewhere on this worktree; `??` this receipt; dist gitignored. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
