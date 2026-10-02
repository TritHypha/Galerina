# Independent audit — fungi collect / wasm vacuous sweep / retirement path

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

- **A. `csf_37603f68f4f4bc0ad123cb61`**: Package/root `.fungi` collection
  and generated-comment rewrite must not follow paths outside the
  requested root. File `galerina.mjs`. THIS TURN: exported
  `collectFungiFiles` — `lstat` refuse symlink root, skip symlink
  entries, `relative(root, file)` must not start with `..` or be
  absolute. `refreshGeneratedComments` refuses write when `file`
  escapes root. CLI `main()` only on `isDirectRun`. Tests
  `scripts/tests/collect-fungi-files.test.mjs` **2/2**. Residual the
  author flags: `Dirent.isFile` still used (follows some links on some
  hosts); write TOCTOU after collect.

- **B. `csf_bcefbf918290f4ae5f95fb54`**: WASM validation must not report
  clean for absent or fully skipped input. File
  `scripts/audit-wasm-validate.mjs`. THIS TURN: exported
  `refuseVacuousWasmSweep` (`fileCount<=0` or `assessedCount<=0` → not
  clean). CLI walk only on `isDirectRun`; exits 1 when vacuous. Tests
  `scripts/tests/audit-wasm-validate.test.mjs` **3/3**. Residual the
  author flags: mixed SKIP+VALID still exits 0 if no fresh INVALID.

- **C. `csf_ad2941465d7416a0948f89da`**: Conversion queue must not hash
  files outside the repository from unvalidated retirement paths. File
  `scripts/conversion-queue.mjs`. THIS TURN: exported
  `admitRetirementPath`; ledger paths must admit;
  `readAdmittedRetirementFile` `resolve`+`relative` must equal the
  path. `isDirectRun` around `main`. Tests
  `scripts/tests/conversion-queue.test.mjs` **9/9** including hostile
  `../secret.ts`. Residual the author flags: still trusts path identity
  after admit; no fd identity.

This reviewer independently re-read production + tests for the three
named bodies, hashed working-tree bytes, ran the named suites, and
executed an extra probe from `%TEMP%` (not by trusting the named tests
alone). Author-named hashes were **not** supplied in the review packet.
Independent `crypto.createHash('sha256')` and `Get-FileHash` MATCH each
other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **26 OPEN / 94
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 26 = 0 high / 0 medium /
26 low, `PARTIAL_THIS_TREE` 94 = 68 medium / 26 low,
`PATCHED_AUDIT_PENDING` 4 high; `n` 124; disposition sum 124). The three
named IDs are among the 26 OPEN lows. Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suites import source modules (`galerina.mjs`,
`scripts/audit-wasm-validate.mjs`, `scripts/conversion-queue.mjs`).
`audit-wasm-validate.mjs` still top-level-imports compiler `dist/` on
any import (CLI walk is gated; extra probe did not walk).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `galerina.mjs` | **M** HEAD blob `e5bbafe901` → WT blob `dfe2962c1a` (+/− on this file includes earlier dirty slices). HEAD `collectFungiFiles` was an inner `statSync` walker with no symlink skip and no `contained()` check; HEAD `refreshGeneratedComments` wrote `if (write && changed && !blocked)`; HEAD always `main().catch(...)`. THIS TURN: exported `collectFungiFiles` (`lstat` refuse symlink root, skip `isSymbolicLink`, `contained` via `relative`/`isAbsolute`); rewrite adds `escapesRoot`; `isDirectRun` gates `main()`. |
| `scripts/tests/collect-fungi-files.test.mjs` | **??** untracked. 2 tests: in-root collect; hostile symlink-to-outside not collected. Imports `../../galerina.mjs` (source). |
| `scripts/audit-wasm-validate.mjs` | **M** HEAD blob `ebd111eecb` → WT blob `1abded71fd`. HEAD always walked `SCAN_DIRS` on import and treated `VIOLATIONS: 0` as success even for empty/all-SKIP. THIS TURN: exported `refuseVacuousWasmSweep`; `isDirectRun` around self-test and corpus walk; vacuous → `process.exit(1)` before baseline/json. Top-level `await import(DIST)` still runs on library import. |
| `scripts/tests/audit-wasm-validate.test.mjs` | **??** untracked. 3 tests: `(0,0,0)` refuse; `(4,4,0)` refuse; `(4,1,3)` admit. Imports `../audit-wasm-validate.mjs` (source). |
| `scripts/conversion-queue.mjs` | **M** HEAD blob `4e2625fb04` → WT blob `e748af61a8`. HEAD hashed `readFileSync(join(root, ...decision.path.split("/")))` with only `typeof path === "string"` on the ledger, and always ran `main()`. THIS TURN: exported `admitRetirementPath`; ledger requires admit; `readAdmittedRetirementFile` resolve+relative equals path; `isDirectRun` around `main`. |
| `scripts/tests/conversion-queue.test.mjs` | **M** HEAD blob `9c24eec7dc` → WT blob `458478d335` (+20). THIS TURN: `admitRetirementPath` unit cases + hostile ledger `../secret.ts` → spawn `--write` status 1. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `galerina.mjs` | 189131 | `0ef6807af723581e85ce9fe3ff6618f88145ea996648de4f3d7d9ceaa8fd6244` |
| `scripts/tests/collect-fungi-files.test.mjs` | 1504 | `67b41e2e7d07b988b69cc00ebfd1d9d662e8608cc91d06167e044b4dfa1b75d0` |
| `scripts/audit-wasm-validate.mjs` | 16423 | `5299df790679cca46be32efcb5e108685221963dbc62b84070a651f3a4c9bc14` |
| `scripts/tests/audit-wasm-validate.test.mjs` | 649 | `15e061ba0ac4c41d65f18321c1b61cab798763d71eeec99bc1eb42663bcb968e` |
| `scripts/conversion-queue.mjs` | 18194 | `909100a64c689c78c33bb2fe26dc362fb40c14629e162484f375fd6baa9fa220` |
| `scripts/tests/conversion-queue.test.mjs` | 11689 | `fc43d88a90041e40b14351b8e179884b55e98cf81dffe0667b88c9a6e982c414` |

Independent MATCH (Get-FileHash ↔ crypto): galerina.mjs
`0ef6807a…fd6244`; collect tests `67b41e2e…1b75d0`; audit-wasm-validate
`5299df79…c9bc14`; wasm tests `15e061ba…cb968e`; conversion-queue
`909100a6…9fa220`; conversion-queue tests `fc43d88a…82c414`; inventory
`6f0e12d5…cedf1d`.

Inventory file sha256 `6f0e12d51f05111350eed3c845103dc5d1d7cd74e201cd797ba66e047bcedf1d`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
`worktree_head` `91b4dec08fe4376febc9494a8023bd02912b8695`. `overall`
`INCOMPLETE_NON_AUTHORITATIVE`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_37603f68f4f4bc0ad123cb61` (`occ_8eed0334048bae54b2eba413`,
  path `galerina.mjs`, scan-era `start_line` 1022, title “Package entry
  traversal redirects automatic source rewriting outside the package”)
- `csf_bcefbf918290f4ae5f95fb54` (`occ_8f4bd95ee9a94471aff65429`,
  path `scripts/audit-wasm-validate.mjs`, scan-era `start_line` 99,
  title “WASM validation returns success for skipped or absent input”)
- `csf_ad2941465d7416a0948f89da` (`occ_9d940802089c2cee7db9be1b`,
  path `scripts/conversion-queue.mjs`, scan-era `start_line` 309,
  title “Conversion queue hashes files outside the repository from
  unvalidated retirement metadata”)

Named suites import source, not dist.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. Exported `collectFungiFiles` | src 40–73; extra probe keys `["collectFungiFiles"]` |
| A. `lstat` refuse symlink root | src 45–46 `if (st.isSymbolicLink()) return out` |
| A. Skip symlink entries | src 61 `e.isSymbolicLink() \|\| !contained(p)` |
| A. `relative` must not start with `..` or be absolute | src 51–54 `contained` |
| A. HEAD followed via `statSync` / no symlink skip | HEAD inner walker used `statSync(root)` and `e.isFile()` with no `isSymbolicLink` / `contained` |
| A. Rewrite refuses write when file escapes root | src 1030–1032 `escapesRoot` then `write && changed && !blocked && !escapesRoot` |
| A. HEAD wrote without escape check | HEAD `if (write && changed && !blocked) writeFileSync(file, after)` |
| A. CLI `main()` only on `isDirectRun` | src 2989–2997; HEAD always `main().catch(...)` |
| A. THIS TURN tests in-root + hostile symlink | WT tests 8–18 length 1; 21–38 `files.length === 0` |
| A. Residual: `Dirent.isFile`; write TOCTOU | src 63 `e.isFile()`; src 1003 collect then 1032 `writeFileSync` |
| B. Exported `refuseVacuousWasmSweep` | src 145–153; tests import it |
| B. `fileCount<=0` or `assessedCount<=0` → not clean | src 146–151; tests `(0,0,0)` and `(4,4,0)` |
| B. CLI walk only on `isDirectRun` | src 187–268 else-branch; extra probe wasm import 183ms, no sweep text |
| B. Vacuous exits 1 before clean report | src 198–203 before baseline / `--json` / `VIOLATIONS: 0` |
| B. HEAD always walked and could print `VIOLATIONS: 0` | HEAD no `isDirectRun`, no vacuous refuse |
| B. Residual: mixed SKIP+VALID still 0 if no fresh INVALID | src 263–267 `fresh.length ? 1 : 0`; `skipCount` unused |
| C. Exported `admitRetirementPath` | src 33–41; extra probe `../secret.ts===false` |
| C. Ledger paths must admit | src 257 `!admitRetirementPath(path)` → throw not exact |
| C. `readAdmittedRetirementFile` resolve+relative equals path | src 43–53 |
| C. HEAD hashed `join(root, ...split)` without admit | HEAD `sha256(readFileSync(join(root, ...decision.path.split("/"))))` |
| C. `isDirectRun` around `main` | src 389–402; HEAD always `try { main() }` |
| C. THIS TURN tests `../secret.ts` | WT tests 186–203 unit + spawn `--write` status 1 |
| C. Residual: path identity after admit; no fd | src 52 `readFileSync(abs)` follows; no `lstat`/fd |
| collect-fungi-files 2 named tests | `node --test scripts/tests/collect-fungi-files.test.mjs` → 2/2 |
| audit-wasm-validate 3 named tests | `node --test scripts/tests/audit-wasm-validate.test.mjs` → 3/3 |
| conversion-queue 9 named tests | `node --test scripts/tests/conversion-queue.test.mjs` → 9/9 |
| Inventory 26/94/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` galerina.mjs; `M`
   audit-wasm-validate.mjs; `M` conversion-queue.mjs; `??`
   collect-fungi-files tests; `??` audit-wasm-validate tests; `M`
   conversion-queue tests.

2. `node --test scripts/tests/collect-fungi-files.test.mjs`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 135.8845`.
   Hostile symlink 3.5283ms green (not skipped on this host).

3. `node --test scripts/tests/audit-wasm-validate.test.mjs`
   → **3/3 pass**, 0 fail, 0 skip, `duration_ms 317.3479`.
   Absent corpus 0.7688ms; entire sweep skipped 0.1251ms; both green.

4. `node --test scripts/tests/conversion-queue.test.mjs`
   → **9/9 pass**, 0 fail, 0 skip, `duration_ms 17939.2394`.
   `admitRetirementPath` 0.2954ms; hostile `../secret.ts` 825.6944ms;
   both green.

Independent extra (`%TEMP%\zt-fungicollect-wasmsweep-retirepath-probe\probe.mjs`;
cwd that TEMP dir; `file://` import of working-tree `galerina.mjs`,
`scripts/audit-wasm-validate.mjs`, `scripts/conversion-queue.mjs`;
no production write):

| probe | result |
|---|---|
| import `galerina.mjs` from TEMP | **`galMs:7.648`**, keys `["collectFungiFiles"]`; no CLI stdout |
| import `audit-wasm-validate.mjs` from TEMP | **`wasmMs:182.969`**, keys `["refuseVacuousWasmSweep"]`; no sweep / `VIOLATIONS` text (compiler DIST still loaded at top-level) |
| import `conversion-queue.mjs` from TEMP | **`queueMs:5.012`**, keys `["admitRetirementPath"]`; no `conversion-queue:` / `REFUSED` CLI text |
| `refuseVacuousWasmSweep(0,0,0).ok` | **`false`** (`absent corpus is not a clean sweep`); `(4,4,0).ok===false`; `(4,1,3).ok===true` |
| `admitRetirementPath("../secret.ts")` | **`false`** (also `/etc/passwd` false, `C:/Windows/a.ts` false; `packages/a/src/a.ts` true) |

## Challenge 1 — can package/root `.fungi` collection or generated-comment rewrite still follow paths outside the requested root? Does import run CLI `main()`?

**No for the named symlink-skip + contained + rewrite-escape +
`isDirectRun` bullets on this dirty tree.** HEAD `statSync` followed
and collected `isFile` entries with no symlink skip; HEAD wrote
changed files without an escape check; HEAD always invoked `main()`.
THIS TURN `lstat`s the root (symlink → empty), skips
`isSymbolicLink` entries, requires `relative(rootAbs, resolve(p))`
not `..` / absolute, and skips `writeFileSync` when
`escapesRoot`. Extra probe from `%TEMP%`: import 7.6ms, only
`collectFungiFiles` exported, no CLI text. Named suite 2/2 including
hostile symlink-to-outside (3.5283ms, not skipped). Residual:
`Dirent.isFile` can still follow some links on some hosts; rewrite
escape is lexical `resolve` not `realpath`/`lstat`; collect-then-write
TOCTOU if the leaf is replaced with a symlink. No dedicated executed
red for the rewrite-escape branch (collection hostile test is the
red; rewrite only writes `collectFungiFiles` output plus the lexical
check).

Scan-era object `0f6063dd…:galerina.mjs` is **not** recategorized.
Inventory still lists the row OPEN. Scan-era `start_line` 1022 is the
HEAD rewrite without `escapesRoot`.

## Challenge 2 — can WASM validation still report clean for absent or fully skipped input? Does import walk the corpus?

**No for the named vacuous-refuse + import-isolation bullets.** HEAD
always walked `SCAN_DIRS` on import and could print `VIOLATIONS: 0`
with an empty or all-SKIP sweep. THIS TURN
`refuseVacuousWasmSweep(fileCount<=0 \|\| assessedCount<=0)` is called
after the walk and `process.exit(1)`s before baseline/`--json`/clean
print. Extra probe: import 183ms (compiler DIST still loaded at
top-level), keys only `refuseVacuousWasmSweep`, no sweep text;
`refuseVacuousWasmSweep(0,0,0).ok===false`. Named suite 3/3 is
red-capable against absent and fully skipped counts. Residual: mixed
SKIP+VALID with `assessedCount>=1` still exits 0 when `fresh` INVALID
is empty; `skipCount` is unused; library import still `await import(DIST)`
and can `process.exit(1)` on missing anchors.

Scan-era object `0f6063dd…:scripts/audit-wasm-validate.mjs` is **not**
recategorized.

## Challenge 3 — can the conversion queue still hash files outside the repository from unvalidated retirement paths? Does import run `main()`? Is this 124-scan closure?

**No hash via unvalidated `../secret.ts` on this dirty tree. Import
does not run `main()`. Not 124-scan closure.** HEAD hashed
`join(root, ...decision.path.split("/"))` after only a string-type
check on ledger paths and always ran `main()`. THIS TURN admits every
ledger path, re-admits before read, and requires
`relative(resolve(root), abs) === path`. Extra probe:
`admitRetirementPath("../secret.ts")===false`; import 5.0ms, no CLI
text. Named hostile test mutates the ledger to `../secret.ts` and
`--write` exits 1 (825.6944ms). CSF rows remain
`OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **94** `PARTIAL_THIS_TREE`, **26**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 26 low). This review does
not recategorize the rows. Residual: after admit, `readFileSync(abs)`
follows a same-path symlink; no fd/inode identity.

## Residuals (not findings against the three named bullets)

- collect: `Dirent.isFile` is still the file test after
  `isSymbolicLink` skip; on hosts where a junction/symlink reports as
  a file, `contained()` is lexical `resolve` (not `realpath`).
  `refreshGeneratedComments` writes after collect (TOCTOU if the leaf
  is replaced). Rewrite `escapesRoot` is also lexical. No dedicated
  rewrite-escape test.
- wasm: mixed SKIP+VALID still exits 0 if no *fresh* INVALID
  (`assessedCount>=1` admits). `skipCount` is unused.
  Top-level compiler `DIST` import still runs on library import
  (extra probe 183ms, no corpus walk).
- conversion-queue: `readAdmittedRetirementFile` trusts path identity
  after lexical admit + `relative===path`; `readFileSync(abs)` can
  follow a repo-relative symlink; no fd identity.
- `galerina.mjs` also carries unrelated earlier dirty slices on this
  HEAD (manifest-subject-auth / verify path). Those are out of these
  three bullets.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 26 OPEN / 94 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era package-entry rewrite escape, vacuous WASM
clean, or unvalidated retirement-path hashing; this dirty tree has the
named exported collect + symlink skip + rewrite escape + `isDirectRun`
(src + extra-probe import isolation + hostile symlink collect),
exported `refuseVacuousWasmSweep` before clean report (src + extra
probe `(0,0,0).ok===false`), and exported `admitRetirementPath` +
admitted read (src + hostile `../secret.ts` CLI refuse), with executed
red-capable evidence. Residuals above remain outside those bullets.
Evidence is sufficient for those bullets; insufficient for scan
recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-fungicollect-wasmsweep-retirepath-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** collect-fungi-files **2/2**; audit-wasm-validate **3/3**; conversion-queue **9/9**
- **Extra-probe:** `%TEMP%\zt-fungicollect-wasmsweep-retirepath-probe` — galerina import 7.6ms, no CLI; wasm import 183ms, no sweep; queue import 5.0ms, no CLI; `refuseVacuousWasmSweep(0,0,0).ok===false`; `admitRetirementPath("../secret.ts")===false`
- **Residuals:** collect `isFile` / write TOCTOU / lexical rewrite escape; mixed SKIP+VALID still exit 0; wasm library import still loads DIST; queue path identity after admit / no fd
- **git status (named):** `M` galerina.mjs; `??` collect-fungi-files tests; `M` audit-wasm-validate.mjs; `??` audit-wasm-validate tests; `M` conversion-queue.mjs; `M` conversion-queue tests; extra dirty elsewhere on this worktree; `??` this receipt. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
