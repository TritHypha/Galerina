# Independent audit — migrate-fungi links / signed-root name

**Verdict: PASS** (scoped to the two named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation 91b4dec08 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. `--apply` was
**not** run on this tree. This receipt is not the author’s packet and is not
GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (two independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_ea1e5710b3b1a7fc3df7e589`**: bulk maintenance must not follow
  repository links when rewriting. File `scripts/migrate-fungi.mjs`.
  THIS TURN: exported `isDirectRun` so import does not rewrite; exported
  `admitMigrateTarget` `lstat`-refuses symlinks and non-files; `writeFileSync`
  only after that admit (regular files at check time). Tests
  `scripts/tests/migrate-fungi.test.mjs` **2/2**. `--apply` not executed.

- **B. `csf_0e7d6b428bc9ca9bc291ea3d`**: signed-root discovery must not treat a
  path-shaped manifest `name` as a freeze. File
  `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts`
  `findSignedPackageRoots`. THIS TURN: skip symlink dirents; token name regex
  `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`; `relative(dir, manifestPath)` must
  stay under `dir`; descriptor size cap `MAX_CORPUS_FILE_BYTES` 1 MiB.
  Freeze is `isCommittedCeremonyManifest` (git HEAD), not disk shape. Tests
  `packages-ts/galerina-devtools-fungi-scan/tests/signed-root-name.test.mjs`
  **1/1** import gitignored `dist/`. Dist rebuilt.

This reviewer independently re-read production + tests + fungi-scan dist,
hashed working-tree bytes, ran the named suites, and executed an extra probe
from `%TEMP%` (not by trusting the named tests alone). Author-named hashes
were **not** supplied. Independent `crypto.createHash('sha256')` and
`Get-FileHash` MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not** promote
them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: findings-array
**5 OPEN / 115 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 5 = 0 high /
0 medium / 5 low, `PARTIAL_THIS_TREE` 115 = 68 medium / 47 low,
`PATCHED_AUDIT_PENDING` 4 high; `n` 124; disposition sum 124). Header
`disposition_counts` still reads **8 / 112 / 4** and does not match the
array. Reviewer did not edit the JSON. The two named IDs are among the 5
OPEN lows. Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Platform this review: win32
Node v24.18.0. Fungi-scan tests load `dist/`. Dist mtimes are newer than
matching src and carry the claimed bodies.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `scripts/migrate-fungi.mjs` | **M** HEAD blob `9d2a3ae01` → WT blob `e93890b5b`. HEAD imported `readFileSync`/`writeFileSync` only, always `process.exit(2)` without a mode, always `discoverCorpus(ROOT)` and rewrote on `--apply` with no `lstat`. THIS TURN: `lstatSync`; exported `isDirectRun` / `admitMigrateTarget`; pick-a-mode and corpus walk/write gated on `isDirectRun`; both `.fungi` and `.gate` loops `continue` unless admitted. |
| `scripts/tests/migrate-fungi.test.mjs` | **??** untracked. THIS TURN: regular file admitted; hostile symlink not admitted. |
| `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | **M** HEAD blob `364a4d2df` → WT blob `c5873af19`. HEAD `findSignedPackageRoots` did not skip symlink dirents, `readFileSync`’d `package.fungi.json` (follows links), required regex **and** `!name.includes("..")`, then froze from **disk** `governanceSignature`. No descriptor `lstat` / size cap / `relative` stay-under-dir. THIS TURN: `if (e.isSymbolicLink()) continue`; descriptor `lstat` refuse symlink/non-file/`size > MAX_CORPUS_FILE_BYTES`; regex only (the extra `includes("..")` is gone); `relative(dir, manifestPath)` refuse `..` / `/` / drive; freeze via `isCommittedCeremonyManifest`. |
| `packages-ts/galerina-devtools-fungi-scan/src/index.ts` | **M** HEAD blob `40272e56f` → WT blob `547c44afe`. THIS TURN: re-exports `isCommittedCeremonyManifest`, `corpusSourceExceedsMaxBytes`, `MAX_CORPUS_*`. |
| `packages-ts/galerina-devtools-fungi-scan/dist/scanner.js` | gitignored; rebuilt this turn; claimed bodies present. |
| `packages-ts/galerina-devtools-fungi-scan/tests/signed-root-name.test.mjs` | **??** untracked. THIS TURN: `name: "../escape"` → `[]`; `ok-name` disk fixture also `[]`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `scripts/migrate-fungi.mjs` | 9176 | `3c9f8cfd9dbbf41ac517bd88cf088f4d39938f53a2c037de71fd9f14cab16aeb` |
| `scripts/tests/migrate-fungi.test.mjs` | 1116 | `1b538000a6952085c603da197f241b67d58fe1df2fc0e5aeaf7e82bc317c471f` |
| `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | 21555 | `81d743ea76da44c4ae7380addac6b3be36332300ff1812ce4f32d8929a2086f6` |
| `packages-ts/galerina-devtools-fungi-scan/src/index.ts` | 804 | `27bfcb8bd86bb14975f03810db3fe4ec1fc736422a2274e7590739dbf70a6232` |
| `packages-ts/galerina-devtools-fungi-scan/dist/scanner.js` | 18783 | `d72b4a1bbb379264928541e7185acb41581eb76824b1076e5f7c856303e63d8f` |
| `packages-ts/galerina-devtools-fungi-scan/dist/index.js` | 617 | `871df4a46a82d4aed46ae2ab57ea92c68f87d68f8bd4b821b8c73f86c0efbcf6` |
| `packages-ts/galerina-devtools-fungi-scan/tests/signed-root-name.test.mjs` | 947 | `5e4a20cb1ec6bbcc567510a7993358eb3a70b748d32b1257b76ddfc62802e06f` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 69245 | `12b5d3f02c6d478aaaa065775a024c6cff05d4ef34df819240871606525636af` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above. The two listed
claim files MATCH:

- `migrate-fungi.mjs` `3c9f8cfd9dbbf41ac517bd88cf088f4d39938f53a2c037de71fd9f14cab16aeb`
- `scanner.ts` `81d743ea76da44c4ae7380addac6b3be36332300ff1812ce4f32d8929a2086f6`

Dist mtimes (UTC): fungi-scan `scanner.js` / `index.js` `2026-09-23T14:40:24Z`
(src scanner `2026-09-23T14:38:45Z`, index `2026-09-23T13:58:39Z`). Dist is
newer than this-turn src. Dist `scanner.js` contains `e.isSymbolicLink()`,
the token regex, `relative(dir, manifestPath)`, `st.size > MAX_CORPUS_FILE_BYTES`,
and `isCommittedCeremonyManifest`.

Inventory file sha256 `12b5d3f02c6d478aaaa065775a024c6cff05d4ef34df819240871606525636af`
(`??` untracked on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_ea1e5710b3b1a7fc3df7e589` (`occ_f50c09d309218f01efc3de20`,
  path `scripts/migrate-fungi.mjs`, scan-era `start_line` 150, title
  “Bulk maintenance follows repository links when rewriting external files”)
- `csf_0e7d6b428bc9ca9bc291ea3d` (`occ_f7d8d0ec421d45584cdd9406`,
  path `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts`,
  scan-era `start_line` 163, title “Manifest name permits path traversal
  during signed-root discovery”)

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | `isDirectRun` so import does not rewrite | `isDirectRun` compares `resolve(import.meta.url)` to `argv[1]`; walk/write only in `else` | migrate-fungi.test **2/2** (admit paths; import did not exit 2) | `%TEMP%` import 545ms, `isDirectRun()===false`, no pick-a-mode / dry-run / APPLIED text; process continued | import still top-level-loads scan dist, compiler dist, `findFusablePackages` + `git ls-files` for `SIGNED_DIRS` |
| A | `admitMigrateTarget` lstat-refuses symlinks | `lstatSync`; `!isSymbolicLink() && isFile()` | hostile symlink **not skipped** on this host, `admit===false` (2.0748ms) | symlink file `admit===false` and `lstat.isSymbolicLink===true`; dir/missing false; regular true | lstat then `readFileSync`/`writeFileSync` TOCTOU; no fd / `O_NOFOLLOW` |
| A | writes only regular files | both `.fungi` and `.gate` loops `if (!admitMigrateTarget(abs)) continue` before `writeFileSync` | suite does not execute `--apply` | `--apply` not run (owner constraint) | write does not re-lstat; APPLY path unexecuted here |
| B | skip symlink dirs | `findSignedPackageRoots` `if (e.isSymbolicLink()) continue` before `isDirectory` walk | named suite does not plant a dir symlink | `%TEMP%` dir symlink `isSymbolicLink===true`, `findSignedPackageRoots===[]` | `[]` is also the ceremony-fail result; skip is confirmed in src + Dirent, not by a freeze that would otherwise succeed |
| B | token name regex | `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/` before `join(dir,"dist",name+…)` | `name:"../escape"` → `[]` | regex rejects `../escape`, `..\\..\\windows`, `/etc/passwd`, `C:evil`, `ok/name`, `..`, `.`; accepts `ok-name` and `a..b` | HEAD extra `!name.includes("..")` dropped; `a..b` is a filename, not a segment traversal |
| B | `relative(dir, manifestPath)` stay under dir | refuse `startsWith("..")` / `/` / `/^[A-Za-z]:/` | not a dedicated test (regex already blocks path names) | `ok-name` → `dist\\ok-name.lmanifest.json`, `escaped===false` | `path.join` normalizes `dist`+`../escape.lmanifest.json` to sibling `escape.lmanifest.json` still under dir; regex is the name gate |
| B | descriptor size cap | `st.size > MAX_CORPUS_FILE_BYTES` and `corpusSourceExceedsMaxBytes(raw)` | not in named suite | oversize descriptor 1048604 > 1048576 → `[]` | lstat then `readFileSync` TOCTOU |

## Suites (fresh this review)

From worktree, `node --test`:

- `scripts/tests/migrate-fungi.test.mjs`: **2/2** pass, fail 0, skipped 0,
  duration ~689ms. Platform win32 Node v24.18.0. Regular file admitted;
  hostile symlink not admitted (2.0748ms, **not** skipped on this host).
  Imports source `../migrate-fungi.mjs`. Import did not `process.exit(2)`.
- `packages-ts/galerina-devtools-fungi-scan/tests/signed-root-name.test.mjs`:
  **1/1** pass, fail 0, skipped 0, duration ~411ms. Path-shaped
  `../escape` does not freeze; `ok-name` disk fixture also `[]`.
  Imports `../dist/index.js`.

`--apply` was not invoked. Full-repo `migrate-fungi.mjs --check` walker was
not invoked.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/migratelinks-signedname-probe\probe.mjs`
(6685 bytes, sha256
`83decce21b4a2ff5a288f1f6542a502557d8e99b159421a4ee376ccaa1049735`).
CWD `<LOCAL_TEMP>/migratelinks-signedname-probe`.
`file://` import of working-tree `scripts/migrate-fungi.mjs` and
fungi-scan `dist/index.js`. No production write. **PROBE_OK** 25/25
exit 0 (`passed` 25 / `failed` 0 / `skipped` 0).

- (i) import migrate 545ms; `isDirectRun()===false`; no
  `migrate-fungi: pick a mode` / dry-run / APPLIED stdout. HEAD would have
  `process.exit(2)` on import without a mode.
- (ii) `admitMigrateTarget` regular true; directory false; missing false;
  symlink file false (`lstat.isSymbolicLink===true`).
- (iii) `findSignedPackageRoots` `name:"../escape"` with a fake disk
  signature → `[]`. Disk `ok-name` + non-placeholder signature → `[]`
  (ceremony, not disk shape).
- (iv) token regex as in B. `relative` for `ok-name` stays
  `dist\\ok-name.lmanifest.json`. Oversize descriptor 1048604 skipped.
  Symlink directory skipped (`isSymbolicLink===true`, result `[]`).

## Residuals (author-flagged class; independently observed)

- migrate-fungi library import still top-level-awaits fungi-scan dist,
  compiler dist, `findFusablePackages([packages-ts, packages])` and
  per-manifest `git ls-files` (`SIGNED_DIRS`). That is not a rewrite
  (gated), but import is not side-effect free (extra probe 545ms).
- `admitMigrateTarget` then `readFileSync` / `writeFileSync` is TOCTOU;
  no fd identity / `O_NOFOLLOW`. `--apply` write path was not executed
  here.
- Signed-root `relative()` runs after `path.join`, which collapses
  `dist`+`../escape.lmanifest.json` to a sibling still under `dir`. The
  token regex is the name gate. HEAD’s extra `!name.includes("..")` was
  dropped; `a..b` now matches the regex (not a `..` segment).
- Symlink-dir skip and ceremony-fail both yield `[]`; extra probe cannot
  exhibit a freeze that the skip prevented. Disk signatures no longer
  freeze (fail-closed for exemption).
- Descriptor `lstat` then `readFileSync` is the same TOCTOU class.
  `isCommittedCeremonyManifest` is still path-based `git show HEAD:rel`.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header `disposition_counts`: `OPEN_ON_SCAN_SNAPSHOT` 8 /
`PARTIAL_THIS_TREE` 112 / `PATCHED_AUDIT_PENDING` 4.

Findings-array recount: `OPEN_ON_SCAN_SNAPSHOT` **5** /
`PARTIAL_THIS_TREE` **115** / `PATCHED_AUDIT_PENDING` **4**. Severity
4 high / 68 medium / 52 low. All 5 remaining OPEN are low. Named two
remain OPEN. Header and array **do not MATCH**. Reviewer did not change
the JSON.

Remaining OPEN lows (array): `csf_38215fae09550ce4426e5ce1`,
`csf_5e50fd79deea0f1d7bfc1c84`, `csf_635ee1a63cbbdf28942f7abc`,
`csf_ea1e5710b3b1a7fc3df7e589`, `csf_0e7d6b428bc9ca9bc291ea3d`.

## Verdict

**PASS** for the two named this-turn PARTIAL candidates on this dirty
tree. migrate-fungi import does not rewrite; `admitMigrateTarget`
lstat-refuses symlinks; writes are gated on that admit. `findSignedPackageRoots`
skips symlink dirents, token-gates `name`, requires `relative` stay under
`dir`, and caps descriptor size; path-shaped names do not freeze. Residuals
remain and keep the scan rows OPEN. **INCOMPLETE_NON_AUTHORITATIVE**.
Not production admission. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.

## Close

- **Verdict:** PASS scoped (two named lows). Not production admission. Not Astra.
- **Path:** `docs/independent-audits/2026-09-23-migratelinks-signedname-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** migrate-fungi **2/2**; signed-root-name **1/1**
- **Extra-probe:** `%TEMP%\migratelinks-signedname-probe` — **PROBE_OK 25/25**
  exit 0; import migrate 545ms `isDirectRun===false`; symlink admit false;
  `../escape` → `[]`; oversize 1048604 skipped; symlink dir skipped
- **Residuals:** import still discovers `SIGNED_DIRS`; write TOCTOU; regex
  dropped `includes("..")`; `relative` after `join` normalize; skip vs
  ceremony-fail both `[]`
- **git status (named):** `M` migrate-fungi.mjs; `??` migrate-fungi tests;
  `M` scanner.ts; `M` fungi-scan index.ts; `??` signed-root-name tests;
  extra dirty elsewhere; `??` this receipt. HEAD
  `91b4dec08fe4376febc9494a8023bd02912b8695`
- **Inventory:** array 5 OPEN / 115 PARTIAL / 4 PATCHED; header still
  8 / 112 / 4; named rows still OPEN; not promoted
