# Independent audit — workspace dep names / build verification paths / cec-do-promote candidates

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

- **A. `csf_ddbb7e9eaad1d95ecfd447ee`**: Workspace dep names. File
  `scripts/relink-workspace.mjs`. THIS TURN: `admitWorkspaceDepName` —
  one unscoped token or `@scope/name`, no `\`, `.`, `..`. Used before
  `join(node_modules, ...split)`. Containment of link under `ROOT`
  already existed. Main walk only when direct-run. Tests
  `scripts/relink-workspace.test.mjs` **2/2**. Residual the author
  flags: `mkdirSync(dirname(link))` still creates parents for scoped
  names; `APPLY` still required.

- **B. `csf_6d57f5d985e3cf31042c6b60`**: Build verification paths. File
  `packages-ts/galerina-core/compiler/galerina.js`. ALREADY:
  `verifyBuild` uses `normaliseBuildOutputPath` + `resolve`/`relative`
  + `lstat` refuse symlink. THIS TURN: extra hostiles for `C:/` and
  `/etc` in `ai-guide-path.test.mjs` **5/5**. Residual the author
  flags: `readFileSync` after `lstat` is TOCTOU.

- **C. `csf_2341f6d5046d9f3ae2f276ef`**: cec-do-promote candidates.
  File `packages-ts/galerina-core-compiler/scripts/cec-do-promote.mjs`.
  ALREADY refused `..`/absolute. THIS TURN: `admitPromoteCandidate`;
  `lstat` candidate dir refuses symlink dirs; script body only on
  direct-run. Tests `scripts/cec-do-promote.test.mjs` **2/2**. Residual
  the author flags: `writeFileSync` after `lstat` TOCTOU; no list-file
  digest pin.

This reviewer independently re-read production + tests for the three
named bodies, hashed working-tree bytes, ran the named suites, and
executed an extra probe from `%TEMP%` (not by trusting the named tests
alone). Author-named hashes were **not** supplied in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **38 OPEN / 82
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 38 = 0 high / 0 medium /
38 low, `PARTIAL_THIS_TREE` 82, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 38 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
relink and promote suites `import` the matching `.mjs` sources. Named
AI-guide tests `require("./galerina.js")` (source, not dist); CLI gated
by `require.main === module` at line 5860. This reviewer did not
rebuild. No named body here is consumed via gitignored `dist/`.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `scripts/relink-workspace.mjs` | **M** HEAD blob `79edc8fe76` → WT blob `5b5a12b033`. HEAD line 88 continued on a name that was a string without NUL/`.`/`..` path parts, then `join(pkgDir, "node_modules", ...name.split("/"))` at 93; link containment under `ROOT` already at 94–95. Walk + `process.exit(0)` ran at module top-level (no `isDirectRun`). THIS TURN: exported `admitWorkspaceDepName` (unscoped token or `@scope/name`; refuse `\0`, `\`, empty/`.`/`..` parts); `if (!admitWorkspaceDepName(name)) continue` before the join; `relinkMain` only when `isDirectRun()`. Src no BOM. Residual: `mkdirSync(dirname(link), { recursive: true })` still under `if (APPLY)`; dry-run default. |
| `scripts/relink-workspace.test.mjs` | **??** untracked. THIS TURN: “admitWorkspaceDepName accepts unscoped and scoped npm names”; “hostile: traversal and option-like names cannot become link paths” (`../victim`, `@galerina/../victim`, `foo/../../etc`, `foo\\..\\bar`, empty, `@scope/name/extra`). Imports `./relink-workspace.mjs`. |
| `packages-ts/galerina-core/compiler/galerina.js` | **M** HEAD blob `e8fecad285` → WT blob `6f1a813525` (+99 / −12 vs HEAD, **not** this-turn verifyBuild). HEAD `verifyBuild` 3143 already called `normaliseBuildOutputPath` + `path.resolve`/`relative` + `lstatSync` refuse symlink on uniqueFiles / outputHashes / reports. HEAD `normaliseBuildOutputPath` 4712 already refused `""`, `/`, `//`, `/^[A-Za-z]:/`, `.`/`..` parts. THIS TURN did not rewrite that path (mtime `2026-09-23T08:16:14.983Z`; this-turn relink/promote src are `10:14`/`10:15`). Extra dirty vs HEAD, **not** the named verifyBuild bullet: `pathIsSymlink` / `refuseBuildOutputLinks` / `writeReportFiles` ancestor walk; `stripQuotedStrings` / `benchmarkKindFromMainBody`; `require.main === module` + `module.exports`. Hash `9d93b899…ae5c030` unchanged vs prior independent receipt `2026-09-23-reachable-reportlinks-pci-hold.md`. |
| `packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` | **??** untracked. THIS TURN extra hostiles in the first of five tests: `normaliseBuildOutputPath("C:/Windows/app.manifest.json")` and `("/etc/passwd")` throw `/escapes\|admitted/`. Still **5** tests (`../` refuse including drive/root; write under build dir; dangling leaf symlink; parent-dir `docs/` symlink; lstat ENOENT still refuses via readlink). Bytes 4731 / sha256 `697eb484…3dc5dd` (prior independent receipt 4546 / `610c0ded…8534b8`). `require("./galerina.js")`. |
| `packages-ts/galerina-core-compiler/scripts/cec-do-promote.mjs` | **M** HEAD blob `675187a6bb` → WT blob `d1ecb22a88`. HEAD 26–31 already refused empty/NUL/`.`/`..`/absolute/`^[A-Za-z]:`; 37–38 `relative(EXAMPLES_DIR)` refuse `..`;  fungiFile `lstatSync` symlink refuse already present. HEAD body ran at import when `cec-promote-list.json` existed (it does on this tree). THIS TURN: exported `admitPromoteCandidate` (same string checks); `lstatSync(candidateDir)` refuse symlink dirs; `isDirectRun()` else-if around the promote body. Src no BOM. Residual: `writeFileSync` after last `lstat`; no digest pin on the list file. |
| `packages-ts/galerina-core-compiler/scripts/cec-do-promote.test.mjs` | **??** untracked. THIS TURN: “admitPromoteCandidate accepts a single relative example id”; “hostile: traversal and absolute candidates are refused” (`../outside`, `foo/../../etc`, `/tmp/x`, `C:/Windows`, empty). Imports `./cec-do-promote.mjs`. Named tests cover the string admit helper, not the candidate-dir `lstat`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `scripts/relink-workspace.mjs` | 7291 | `b5838576e79927c413eaf2f019b9964faef98d556a3e43edde115642b0c5bef2` |
| `scripts/relink-workspace.test.mjs` | 811 | `69a5bbbd484e8a71fd6ea1d69fb6528f867a70d5db385ef63abef7c5217de06d` |
| `packages-ts/galerina-core/compiler/galerina.js` | 226804 | `9d93b899180e6b0b0ce5ae14647a861fe7fcfb4b69cca22d3abab1488ae5c030` |
| `packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` | 4731 | `697eb4847ab1bede96a7ba63998d8721378ec851d36e6bb22f707653f53dc5dd` |
| `packages-ts/galerina-core-compiler/scripts/cec-do-promote.mjs` | 3737 | `be0025dc5354fae994defb88a92a89b5d379098874a94a4e7649b59971ccb651` |
| `packages-ts/galerina-core-compiler/scripts/cec-do-promote.test.mjs` | 642 | `95a070db634c35b57cd0558ce8bc17860d870259f1ab14d8c4b1a4afbe93f69e` |

Independent MATCH (Get-FileHash ↔ crypto): relink src
`b5838576…0c5bef2`; relink tests `69a5bbbd…17de06d`; galerina.js
`9d93b899…ae5c030`; ai-guide tests `697eb484…3dc5dd`; promote src
`be0025dc…1ccb651`; promote tests `95a070db…be93f69e`; inventory
`4a09561c…27b31ed`.

Mtimes (UTC): relink src `2026-09-23T10:14:35.171Z` / tests
`2026-09-23T10:15:06.302Z`; `galerina.js` `2026-09-23T08:16:14.983Z`
(older than this-turn A/C; verifyBuild not rewritten this turn);
ai-guide tests `2026-09-23T10:15:06.299Z`; promote src
`2026-09-23T10:15:20.921Z` / tests `2026-09-23T10:15:06.299Z`. Named
suites import those sources. No dist for these three bodies.

Inventory file sha256 `4a09561c5c1c4bef8692ca638fb18afe80dd1335afbe2e46e966c2d1a27b31ed`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_ddbb7e9eaad1d95ecfd447ee` (`occ_53cfee54541e5d2c69eec081`,
  path `scripts/relink-workspace.mjs`,
  scan-era `start_line` 86, title “Workspace dependency names redirect
  link creation outside node_modules”)
- `csf_6d57f5d985e3cf31042c6b60` (`occ_568d47b5c3d0675aa3592097`,
  path `packages-ts/galerina-core/compiler/galerina.js`,
  scan-era `start_line` 3128, title “Build verification follows
  manifest-controlled paths outside the build directory”)
- `csf_2341f6d5046d9f3ae2f276ef` (`occ_5a4b56f72e2fd55583c8e925`,
  path `packages-ts/galerina-core-compiler/scripts/cec-do-promote.mjs`,
  scan-era `start_line` 25, title “cec-do-promote trusts candidate
  names and can overwrite files outside Examples”)

Named relink/promote/AI-guide tests import source, not dist.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. `admitWorkspaceDepName` one unscoped token or `@scope/name` | src 71–83; unscoped `token.test(parts[0])`; scoped `parts.length === 2 && parts[0].startsWith("@")` then both tokens |
| A. no `\`, `.`, `..` | src 72 `/[\\]/`; 76 empty/`.`/`..` parts; 73 NUL |
| A. used before `join(node_modules, ...split)` | src 114 `if (!admitWorkspaceDepName(name)) continue`; 119 `join(pkgDir, "node_modules", ...name.split("/"))` |
| A. containment of link under ROOT already existed | HEAD 94–95 `relative(ROOT, link)` refuse `..` / absolute / missing `/node_modules/`; WT 120–121 same |
| A. main walk only when direct-run | src 85–93 `isDirectRun()` then `relinkMain()`; HEAD ran the walk at load and `process.exit(0)` |
| A. Tests **2/2** | named suite 2 pass 0 skip; accept 0.8411ms; hostile 0.1535ms |
| A. Residual: `mkdirSync(dirname(link))` creates parents for scoped names | src 135 under `if (APPLY)`; extra probe `mkdirParents:true` |
| A. Residual: `APPLY` still required | src 40 `APPLY = argv.includes("--apply")`; 132; extra probe `applyRequired:true` |
| B. ALREADY `verifyBuild` uses `normaliseBuildOutputPath` + resolve/relative + lstat refuse symlink | HEAD uniqueFiles loop (function at 3143) already those three; WT 3205–3211 same; outputHashes 3220–3226; reports 3243–3247 |
| B. ALREADY `normaliseBuildOutputPath` refuses `/`, drive, `.`/`..` | HEAD 4712 / WT 4742–4758 `startsWith("/")`, `/^[A-Za-z]:/`, split parts |
| B. THIS TURN extra hostiles `C:/` and `/etc` | tests 22–23; suite still 5 tests |
| B. THIS TURN did not rewrite `verifyBuild` | galerina.js mtime 08:16:14Z; git diff vs HEAD does not touch `verifyBuild`/`normaliseBuildOutputPath`; hash matches prior receipt |
| B. Tests **5/5** | named suite 5 pass 0 skip; parent-dir 1.8935ms; dangling leaf 2.1454ms; parent-dir symlink 3.0411ms; lstat ENOENT 2.476ms; none skipped |
| B. Residual: `readFileSync` after `lstat` is TOCTOU | WT 3225–3230 `lstatSync` then `readFileSync(file)` in hash check; extra probe `verifyReadAfterLstat:true` |
| C. ALREADY refused `..`/absolute | HEAD 26–31 `split(/[\\/]/)` `.`/`..`, `isAbsolute`, `/^[A-Za-z]:/`; HEAD 37–38 `relative(EXAMPLES_DIR)` |
| C. THIS TURN `admitPromoteCandidate` | src 13–20 export; 43 `if (!admitPromoteCandidate(name))` |
| C. THIS TURN `lstat` candidate dir refuses symlink dirs | src 48–54 `lstatSync(candidateDir).isSymbolicLink()`; extra probe `promoteLstatDir:true` |
| C. THIS TURN script body only on direct-run | src 22–33 `isDirectRun()` else-if `existsSync(listFile)`; HEAD ran at import |
| C. Tests **2/2** | named suite 2 pass 0 skip; accept 0.7436ms; hostile 0.6464ms |
| C. Residual: `writeFileSync` after `lstat` TOCTOU | src 67 then 73 `readFileSync` then 111 `writeFileSync`; extra probe `promoteWriteAfterLstat:true` |
| C. Residual: no list-file digest pin | src 35 `JSON.parse(readFileSync(listFile))`; extra probe `promoteNoListDigest:true` |
| Relink 2 named tests | `node --test scripts/relink-workspace.test.mjs` → 2/2 |
| AI-guide 5 named tests | `node --test packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` → 5/5 |
| Promote 2 named tests | `node --test packages-ts/galerina-core-compiler/scripts/cec-do-promote.test.mjs` → 2/2 |
| Import of relink/promote does not walk / write examples | extra probe from `%TEMP%`: `walkedRelink:false`, `walkedPromote:false`, `importExits:[]`, `importLogCount:0`, `examplesUnchanged:true`; `listFileExists:true` (HEAD would have entered the promote body) |
| Inventory 38/82/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` relink src; `??` relink
   tests; `M` galerina.js; `??` ai-guide-path tests; `M` cec-do-promote
   src; `??` cec-do-promote tests.

2. `node --test scripts/relink-workspace.test.mjs` in the worktree
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 134.3206`.
   Unscoped/scoped accept 0.8411ms; hostile traversal 0.1535ms; both
   green.

3. `node --test packages-ts/galerina-core/compiler/ai-guide-path.test.mjs`
   → **5/5 pass**, 0 fail, 0 skip, `duration_ms 148.1862`.
   Parent-directory (now including `C:/` and `/etc`) 1.8935ms; dangling
   leaf / parent-dir / lstat ENOENT all green (symlinks not skipped on
   this host).

4. `node --test packages-ts/galerina-core-compiler/scripts/cec-do-promote.test.mjs`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 126.041`.
   Relative id 0.7436ms; hostile `../` / absolute / `C:/` 0.6464ms;
   both green.

Independent extra (`%TEMP%\zt-relink-verify-promote-probe\probe.mjs`;
cwd `%TEMP%\zt-relink-verify-promote-probe`; `file://` import of
working-tree relink + promote sources and `require` of `galerina.js`
src; `process.exit` intercepted; no production write):

| probe | result |
|---|---|
| `admitWorkspaceDepName("../victim")` | **`admitVictim:false`** (also `foo\\..\\bar` false, `@galerina/../victim` false; `galerina-core` / `@galerina/core-compiler` true) |
| `normaliseBuildOutputPath("../x")` | **`normThrew:true`**, msg `Build output path escapes the configured build directory.` (also `C:/Windows/app.manifest.json` and `/etc/passwd` threw) |
| `admitPromoteCandidate("../x")` | **`promoteVictim:false`** (also `/tmp/x` and `C:/Windows` false; `hello-world` true) |
| import relink/promote does not walk/write | **`walkedRelink:false`**, **`walkedPromote:false`**, `importLogCount:0`, `importExits:[]`, `examplesUnchanged:true`; `listFileExists:true` (`candidateCount:0`) |

## Challenge 1 — can workspace dependency names still redirect link creation outside `node_modules`?

**No on this dirty tree for `admitWorkspaceDepName` before the
`node_modules` join. CONFIRMED closed for the named token/scope + no
`\` / `.` / `..` bullet.** HEAD continued on any non-empty name without
NUL or `.`/`..` slash-parts, including `\` and `@scope/name/extra`, then
`join(..., ...name.split("/"))`. Link containment under `ROOT` already
existed after that join. THIS TURN refuses `\` and non-token / extra
path parts, and only then joins. Extra probe: `"../victim"` is false;
backslash and scoped `../` also false. Named suite 2/2 is red-capable
against HEAD (HEAD did not export `admitWorkspaceDepName`; HEAD would
not refuse `foo\\..\\bar`). HEAD walk ran at import; extra probe import
from `%TEMP%` did not print `relink-workspace` and did not
`process.exit`. Residual: `mkdirSync(dirname(link), { recursive: true })`
still creates parent dirs for admitted scoped names when `--apply` is
set; default remains dry-run.

Scan-era object `0f6063dd…:scripts/relink-workspace.mjs` is **not**
recategorized. Inventory still lists the row OPEN. Scan-era
`start_line` 86 is the HEAD `for (const [name, spec] of Object.entries(deps))`
loop.

## Challenge 2 — does build verification still follow manifest-controlled paths outside the build directory?

**No on this dirty tree for `verifyBuild` uniqueFiles / outputHashes /
reports. CONFIRMED closed for the named `normaliseBuildOutputPath` +
resolve/relative + `lstat` refuse. THIS TURN did not rewrite that
path.** HEAD already admitted each manifest path through
`normaliseBuildOutputPath` (which already refused `/` and `/^[A-Za-z]:/`
and `.`/`..` parts), then `path.resolve`/`relative` stay-inside, then
`lstatSync` file-not-symlink. Named 5/5 includes this-turn extra
hostiles `C:/Windows/app.manifest.json` and `/etc/passwd` on the
exported `normaliseBuildOutputPath` — red-capable against a helper that
admitted drive/root paths; HEAD `normaliseBuildOutputPath` already
threw on those shapes. Extra probe: `"../x"` throws `escapes the
configured build directory`; `C:/` and `/etc` also threw. Residual:
hash check `lstatSync` then `readFileSync` remains TOCTOU vs replace of
the leaf with a link; no fd identity. Extra dirty vs HEAD on this file
(`refuseBuildOutputLinks` / `benchmarkKindFromMainBody` / exports) is
outside this bullet.

Scan-era object `0f6063dd…:packages-ts/galerina-core/compiler/galerina.js`
is **not** recategorized. Scan-era `start_line` 3128 is the HEAD close
of `writeReportFiles`; HEAD `verifyBuild` starts at 3143.

## Challenge 3 — can cec-do-promote still overwrite files outside Examples via candidate names? Does import walk/write? Is this 124-scan closure?

**No on this dirty tree for `admitPromoteCandidate` plus the already-
present `relative(EXAMPLES_DIR)` refuse, plus this-turn candidate-dir
`lstat` and direct-run gate. Import from `%TEMP%` did not walk or
write. Not 124-scan closure.** HEAD already refused `..`/absolute/drive
inline, then joined under `docs/Examples`. HEAD ran that body at import
whenever `cec-promote-list.json` existed (it does on this tree). THIS
TURN extracts `admitPromoteCandidate`, `lstat`s the candidate directory
and refuses symlink dirs, and gates the body on `isDirectRun()`. Extra
probe: `"../x"` is false; import logs empty; no `process.exit`; first
list entries’ `example.fungi` snapshots unchanged (`candidateCount:0`
so even HEAD would not have rewritten files this run; HEAD would still
have printed `Promoting 0` — this import did not). Named 2/2 is
red-capable against HEAD (HEAD did not export `admitPromoteCandidate`).
Named tests do not exercise the candidate-dir `lstat`. Residual:
`writeFileSync` after last `lstat` is TOCTOU; list file is
`JSON.parse(readFileSync)` with no digest pin.

CSF rows remain `OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **82** `PARTIAL_THIS_TREE`, **38**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 38 low). This review does
not recategorize the rows.

## Residuals (not findings against the three named bullets)

- Relink: `mkdirSync(dirname(link), { recursive: true })` still creates
  parent directories for admitted scoped names (`@scope/name` →
  `node_modules/@scope`) when `--apply` is set. Default remains
  dry-run (`APPLY` false). Extra probe `mkdirParents:true`,
  `applyRequired:true`. Token regex still allows `.` inside an
  otherwise admitted name (`galerina.core`); the named bullet is path
  segments `.` / `..` and `\`, not interior dots.
- Build verification: last `lstatSync` then `readFileSync` in the
  outputHashes loop remains TOCTOU vs a replace of the leaf with a
  link; no `open`+`fstat` identity check. Extra probe
  `verifyReadAfterLstat:true`. Extra dirty vs HEAD on `galerina.js`
  (`refuseBuildOutputLinks` / `benchmarkKindFromMainBody` / extra
  exports) is outside the named verifyBuild bullet.
- Promote: last `lstat` of `example.fungi` then `readFileSync` /
  `writeFileSync` remains TOCTOU. `cec-promote-list.json` is parsed
  with no sha256/digest pin (`promoteNoListDigest:true`). Named 2/2
  covers `admitPromoteCandidate` string checks, not the candidate-dir
  `lstat`.
- Named suites import source, not dist. No dist rebuild was required
  or performed. `galerina.js` CLI is gated by `require.main === module`.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 38 OPEN / 82 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era workspace dep-name join, manifest-controlled
verifyBuild paths, or cec-do-promote candidate names; this dirty tree
has the named `admitWorkspaceDepName` before join + direct-run wrap
(2/2), already-present `verifyBuild` `normaliseBuildOutputPath` +
resolve/relative + `lstat` with this-turn extra `C:/` `/etc` hostiles
(5/5; production path not rewritten this turn), and
`admitPromoteCandidate` + candidate-dir `lstat` + direct-run (2/2),
with executed red-capable evidence on source. Residuals above remain
outside those bullets. Evidence is sufficient for those bullets;
insufficient for scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-relink-verify-promote-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** relink-workspace **2/2**; ai-guide-path **5/5**; cec-do-promote **2/2**
- **Extra-probe:** `%TEMP%\zt-relink-verify-promote-probe` — `admitWorkspaceDepName("../victim")` false; `normaliseBuildOutputPath("../x")` throws `escapes the configured build directory`; `admitPromoteCandidate("../x")` false; import of relink/promote did not walk or write (`walkedRelink:false`, `walkedPromote:false`, `examplesUnchanged:true`)
- **Residuals:** relink `mkdirSync(dirname(link))` parents for scoped names / `APPLY` required; verifyBuild `readFileSync` after `lstat` TOCTOU; promote `writeFileSync` after `lstat` TOCTOU / no list-file digest pin
- **git status (named):** `M` relink src; `??` relink tests; `M` galerina.js; `??` ai-guide-path tests; `M` cec-do-promote src; `??` cec-do-promote tests; extra dirty elsewhere on this worktree; `??` this receipt; `??` inventory. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
