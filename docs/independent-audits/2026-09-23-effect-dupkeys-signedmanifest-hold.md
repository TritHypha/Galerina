# PASS

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent lows, this-turn PARTIAL candidates):

- **A. `csf_1c14fc61fe1e266650aea121`**: Effect-name audit treats unread
  or absent corpus as a clean sweep. File
  `scripts/audit-corpus-effect-names.mjs`. THIS TURN: exported
  `auditCorpusEffectNames`; `lstat` root must be a regular directory;
  unread `.fungi` (symlink / non-file / read error) is blocking class
  `unreadable`; 0 `.fungi` files is class `empty-corpus` blocking; walk
  errors blocking; `isDirectRun` so import does not audit. Tests
  `scripts/tests/corpus-effect-names.test.mjs` **7/7** including absent
  root, empty corpus, dangling `.fungi` symlink. Residual the author
  flags: walk still skips `self-hosted/` and uses regex over source;
  TOCTOU between `lstat` and `readFileSync`.

- **B. `csf_5afc126460cedbd17c970337`**: Build-evidence duplicate-key
  scan must be bounded. Inventory path is
  `packages-ts/galerina-test/src/runners.ts` (unchanged this turn;
  already imports `verifyBuildEvidence`). Production body
  `packages-ts/galerina-core-compiler/scripts/write-build-evidence.mjs`.
  HEAD already had `assertNoDuplicateJsonKeys` with 8MiB / 100000 nodes
  / depth 32 as locals; `verifyBuildEvidence` already called it. THIS
  TURN: exported `MAX_EVIDENCE_FILE_BYTES`, `MAX_EVIDENCE_JSON_NODES`,
  `MAX_EVIDENCE_JSON_DEPTH` and the walker; extra hostiles in
  `packages-ts/galerina-test/tests/compiler-build-evidence.test.mjs`
  **8/8** (nested duplicate keys, depth, nodes, oversize). Residual the
  author flags: hand JSON walker, not a full RFC 8259 parser; primitive
  scan is coarse.

- **C. `csf_322ab6f1302a5fe0ecac5b2c`**: Shape-only signed-manifest
  detection must not exempt arbitrary corpus files from `--strict`. File
  `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts`. THIS TURN:
  `findSignedPackageRoots` requires `isCommittedCeremonyManifest` (`git
  ls-files --error-unmatch` then `git show HEAD:rel`); disk
  keyId+signature shape does not freeze; git errors / untracked /
  unreadable HEAD do not freeze (fail-closed for the exemption
  privilege). Tests `fungi-scan.test.mjs` **25/25**. Dist rebuilt
  (author). Residual the author flags: still does not verify
  Ed25519/hybrid bytes; `git show HEAD:rel` is the ceremony identity;
  TOCTOU vs later scan of source files.

This reviewer independently re-read production + tests + dist for the
three named bodies, hashed working-tree bytes, ran the named suites,
and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not** supplied in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **35 OPEN / 85
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 35 = 0 high / 0 medium /
35 low, `PARTIAL_THIS_TREE` 85, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124; `severity_counts` 4 high / 68 medium / 52 low).
The three named IDs are among the 35 OPEN lows. Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named fungi-scan suite
imports gitignored `dist/` (`packages-ts/.gitignore` line 5 `dist/`).
Named effect-name tests spawn `scripts/audit-corpus-effect-names.mjs`.
Named build-evidence tests import the `.mjs` source. This reviewer did
not rebuild. Dist mtime for fungi-scan is newer than matching src and
carries `isCommittedCeremonyManifest`.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `scripts/audit-corpus-effect-names.mjs` | **M** HEAD blob `7cf818b58b` → WT blob `f73dc2eaa3`. HEAD walked `ROOT` at module load (`existsSync`/`statSync` unused after import), `readFileSync` catch `continue` (unread skipped), empty file list was a clean sweep, no `isDirectRun`. THIS TURN: exported `auditCorpusEffectNames`; `lstat` root refuses symlink/non-dir; unread `.fungi` class `unreadable` blocking; 0 files class `empty-corpus` blocking; walk errors blocking; `MAX_FUNGI_FILES` 8192 / `MAX_WALK_DEPTH` 32; `isDirectRun` gates CLI. |
| `scripts/tests/corpus-effect-names.test.mjs` | **M** HEAD blob `17d843f65` → WT. THIS TURN: three hostiles (absent root status 1; empty corpus `empty-corpus`; dangling `.fungi` symlink `unreadable`). Pre-existing 4 classification tests kept. |
| `packages-ts/galerina-core-compiler/scripts/write-build-evidence.mjs` | **M** HEAD blob `c65f2d2dbf` → WT blob `4d993c00ec` (+12 / −8). HEAD already had exported `assertNoDuplicateJsonKeys` with `json.length > MAX_EVIDENCE_FILE_BYTES` (8MiB) and inner `MAX_NODES=100_000` / `MAX_DEPTH=32`; `verifyBuildEvidence` already called it first. THIS TURN: export those three MAX_* constants (no new cap values). |
| `packages-ts/galerina-test/tests/compiler-build-evidence.test.mjs` | **M**. THIS TURN: imports exported MAX_* + `assertNoDuplicateJsonKeys`; one hostile test (nested dup / depth / nodes / oversize). Pre-existing 7 tests kept including top-level duplicate keys via `verifyBuildEvidence`. |
| `packages-ts/galerina-test/src/runners.ts` | **unchanged**. `compilerFreshnessFailure` 58–67 still `readFileSync`s evidence then `verifyBuildEvidence`. Inventory path for B. |
| `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | **M** HEAD blob `364a4d2dfb` → WT blob `79dc31cc9b`. HEAD `findSignedPackageRoots` `JSON.parse`d disk `dist/<name>.lmanifest.json` and froze on `keyId` string + non-placeholder `signature`. THIS TURN: `isCommittedCeremonyManifest` (`ls-files --error-unmatch` then `git show HEAD:rel` then `isRealSignature` on HEAD bytes); disk shape does not freeze. |
| `packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs` | **M**. THIS TURN: disk-only fake stays `runtime` and still gates strict; committed HEAD ceremony freezes `pkg-signed`. |
| `packages-ts/galerina-devtools-fungi-scan/dist/scanner.js` | gitignored; rebuilt this turn; `isCommittedCeremonyManifest` 95–126; `findSignedPackageRoots` 150 calls it. Barrel `dist/index.js` re-exports `isCommittedCeremonyManifest`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `scripts/audit-corpus-effect-names.mjs` | 12309 | `10818f8a2a8b371bd09dca52f5c2c04ea775f8914fb6bbd6fc3130e5edc33063` |
| `scripts/tests/corpus-effect-names.test.mjs` | 5674 | `926139333c5cb89f37caaba485562965b603bc2e7fe41da09d1faeab71bd0933` |
| `packages-ts/galerina-core-compiler/scripts/write-build-evidence.mjs` | 16238 | `3d5591a62343b20d614549a690a066c6c9b72bedd554727b0600c9edb835ee2b` |
| `packages-ts/galerina-test/tests/compiler-build-evidence.test.mjs` | 8603 | `15a9bdfcbd43973341c6e3ba86ecdc64d788cd8646c62e1e2ee0e89ff79ddf58` |
| `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | 20123 | `09a2f3d362a1237732bb355521195fade90c9c1688ad4a11d4dc165d211abc35` |
| `packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs` | 17540 | `611f6bf03db0e6f0e593488030a12a66fb9667e27e0cefe2b951b369f03f5940` |
| `packages-ts/galerina-devtools-fungi-scan/dist/scanner.js` | 17221 | `f3ed8fbc6277cef31a6e1222a138950a774d04af2ad8403a858d8dc75ab6cb65` |
| `packages-ts/galerina-devtools-fungi-scan/dist/index.js` | 524 | `ee3d2f2e861df5e529e7fe447e0727447bc6ca2dbb0cacf211f3d57b47177425` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 65583 | `afe63b60f8dbe03b4d3063b7a0b7b4f36bc5b2df13506fa86a8dd939b510a37a` |

Independent MATCH (Get-FileHash ↔ crypto): effect-name audit
`10818f8a…c33063`; effect-name tests `92613933…bd0933`; write-build-evidence
`3d5591a6…35ee2b`; build-evidence tests `15a9bdfc…9ddf58`; scanner src
`09a2f3d3…1abc35`; fungi-scan tests `611f6bf0…3f5940`; scanner dist
`f3ed8fbc…b6cb65`; dist barrel `ee3d2f2e…177425`; inventory
`afe63b60…10a37a`.

Dist mtimes (UTC): `scanner.js` `2026-09-23T10:33:46.191Z` (src
`2026-09-23T10:33:13.153Z` / tests `2026-09-23T10:33:23.777Z`);
`dist/index.js` `2026-09-23T10:33:46.208Z`. Named fungi-scan dist is
newer than src. Effect-name audit `2026-09-23T10:32:07.365Z`;
write-build-evidence `2026-09-23T10:31:55.328Z`. Inventory mtime
`2026-09-23T10:24:59.159Z` is **older** than this-turn source (not
reclassified this turn).

Inventory file sha256 `afe63b60f8dbe03b4d3063b7a0b7b4f36bc5b2df13506fa86a8dd939b510a37a`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
`worktree_head` pin `91b4dec08fe4376febc9494a8023bd02912b8695`.
`overall` `INCOMPLETE_NON_AUTHORITATIVE`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_1c14fc61fe1e266650aea121` (`occ_5f12b0d701bb73202f234ea2`,
  path `scripts/audit-corpus-effect-names.mjs`,
  scan-era `start_line` 66, title “Effect-name audit treats unread or
  absent corpus input as a clean sweep”)
- `csf_5afc126460cedbd17c970337` (`occ_6bea021f083a367bd449c468`,
  path `packages-ts/galerina-test/src/runners.ts`,
  scan-era `start_line` 58, title “Build-evidence verification performs
  unbounded recursive duplicate-key scanning”)
- `csf_322ab6f1302a5fe0ecac5b2c` (`occ_717389f5607dff01b95b99f3`,
  path `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts`,
  scan-era `start_line` 169, title “Shape-only signed-manifest detection
  exempts arbitrary corpus files from strict migration checks”)

Named fungi-scan tests import gitignored dist, not src. Named
build-evidence tests import compiler script source. Named effect-name
tests spawn the script as CLI.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. exported `auditCorpusEffectNames` | src 120–224; extra probe keys=`auditCorpusEffectNames` |
| A. `lstat` root must be a regular directory | src 124–132; symlink/non-dir → `ok: false` |
| A. absent root is not a clean sweep | src 125–128; tests 90–94 status 1; extra probe `ok===false` reason `absent or unreadable` |
| A. unread `.fungi` blocking `unreadable` | src 167–182; tests 113–123 dangling symlink class `unreadable` |
| A. 0 `.fungi` files class `empty-corpus` blocking | src 200–208; tests 96–111 |
| A. walk errors blocking | src 56–64 / 152–161 class `unreadable` `blocking: true` |
| A. `isDirectRun` so import does not audit | src 226–230 / 269; extra probe from `%TEMP%` reached after import (no `process.exit`) |
| A. HEAD skipped unread (`catch { continue }`) and empty was clean | HEAD walk + `readFileSync` continue; no empty-corpus class |
| A. Residual: skip `self-hosted/` + regex-over-source | src 164 `rel.includes("/self-hosted/")`; `declaredEffectNames` 84–104 regex / brace walk |
| A. Residual: TOCTOU `lstat` then `readFileSync` | src 168–172 |
| B. walker byte/node/depth caps | src 27–30 / 77–80 / 128–130; HEAD already had same numeric caps as locals |
| B. `assertNoDuplicateJsonKeys` exported; `verifyBuildEvidence` calls it | src 77 export; src 361–363 first step of verify |
| B. `runners.ts` already delegates | runners.ts 24 import, 66 `verifyBuildEvidence` (unchanged this turn) |
| B. THIS TURN extra hostiles nested dup / depth / nodes / oversize | tests 218–227; extra probe nested `{"a":{"b":1,"b":2}}` throws `DuplicateJsonKeyError: "b"` |
| B. Residual: hand walker, coarse `readPrimitive` | src 116–125 consumes until whitespace/`,]}` without validating literal |
| B. Extra residual: `runners.ts` still unbounded `readFileSync` before the 8MiB check | runners.ts 58–61; cap is after the string exists |
| C. `isCommittedCeremonyManifest` git HEAD identity | src 160–192; dist 95–126 |
| C. disk keyId+signature shape does not freeze | tests 192–199 `fake.corpus === "runtime"`; extra probe untracked inside repo `false` |
| C. git errors / untracked / unreadable HEAD do not freeze | src 177 / 184–185 / 189–191 return `false` |
| C. committed HEAD ceremony does freeze | tests 215–219 `frozen.corpus === "signed-frozen"`; strict exempt `pkg-signed/` |
| C. Dist rebuilt | dist mtime 10:33:46Z > src 10:33:13Z; suite imported dist barrel and passed |
| C. Residual: no Ed25519/hybrid verify; `isRealSignature` is still shape | src 144–153 keyId string + signature non-empty not `placeholder*` |
| C. Residual: TOCTOU vs later scan of source files | freeze is package-root prefix at `scanCorpus` 392–399, not a byte bind of each `.fungi` |
| C. Extra residual: `JSON.parse` of HEAD blob / `package.fungi.json` unbounded | src 188 / 212 |
| Effect-name 7 named tests | `node --test scripts/tests/corpus-effect-names.test.mjs` → 7/7 |
| Build-evidence 8 named tests | `node --test packages-ts/galerina-test/tests/compiler-build-evidence.test.mjs` → 8/8 |
| Fungi-scan 25 named tests | `node --test packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs` → 25/25 |
| Inventory 35/85/4 | independent recount of 124 `findings`; this review did **not** reclassify |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` effect-name audit; `M`
   effect-name tests; `M` write-build-evidence; `M` build-evidence tests;
   `M` scanner src; `M` fungi-scan tests; runners.ts clean; dist
   gitignored (not listed); inventory `??`.

2. `node --test scripts/tests/corpus-effect-names.test.mjs` cwd worktree
   → **7/7 pass**, 0 fail, 0 skip, `duration_ms 734.1618`.
   Absent root 76.0992ms; empty corpus 93.0159ms; unread symlink
   82.0205ms; all green.

3. `node --test packages-ts/galerina-test/tests/compiler-build-evidence.test.mjs`
   cwd worktree → **8/8 pass**, 0 fail, 0 skip, `duration_ms 3238.4751`.
   Hostile nested/depth/nodes/oversize 11.4393ms green.

4. `node --test packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs`
   cwd worktree → **25/25 pass**, 0 fail, 0 skip, `duration_ms 1448.4024`.
   Signed-frozen disk-vs-HEAD 1079.14ms green.

Independent extra (`%TEMP%\zt-effect-dupkeys-signedmanifest-probe.mjs`;
cwd `%TEMP%\zt-effect-dupkeys-signedmanifest-cwd`; `file://` import of
working-tree audit script, write-build-evidence source, and fungi-scan
dist; no production write):

| probe | result |
|---|---|
| import `auditCorpusEffectNames` from TEMP cwd (not CLI) | **`import-audit-did-not-exit:true`**; only export is the function; no repo walk / no `process.exit` |
| missing root | **`ok===false`**, reason `corpus root is absent or unreadable: …` |
| empty-string root | **`ok===false`**, reason `corpus root is missing` |
| nested duplicate JSON key `{"a":{"b":1,"b":2}}` | **throws** `DuplicateJsonKeyError: duplicate JSON object key: "b"` |
| clean nested `{"a":{"b":1,"c":2}}` | does not throw |
| `isCommittedCeremonyManifest(WT, %TEMP%\…lmanifest.json)` | **`false`** |
| untracked path inside the repo | **`false`** |

`PROBE_SUMMARY passed:true n:11 failed:[]` exit 0.

## Challenge 1 — does the effect-name audit still treat unread/absent corpus as a clean sweep?

**No on this dirty tree for the exported function and CLI. CONFIRMED
closed for the named unread/absent bullet.** HEAD skipped unread files
and treated an empty walk as success. THIS TURN refuses absent /
non-directory roots, classifies unread `.fungi` as blocking
`unreadable`, and classifies 0 files as blocking `empty-corpus`. Extra
probe: import from `%TEMP%` does not run the CLI against the real repo;
missing root returns `ok===false`. Named suite 7/7 green. Residual:
`self-hosted/` still skipped; regex extraction; `lstat`/`readFileSync`
TOCTOU; directory symlinks are not walked and not reported as
unreadable (empty tree still blocks via `empty-corpus`).

## Challenge 2 — is the duplicate-key scan still unbounded?

**No on this dirty tree for `assertNoDuplicateJsonKeys`. CONFIRMED
closed for the named recursive-scan bound.** HEAD already capped 8MiB /
100k nodes / depth 32; THIS TURN only exported those caps and added
red tests. Extra probe nested duplicate throws. Named suite 8/8 green
including the new hostile. Residual: hand walker / coarse primitives
(author); `runners.ts` still `readFileSync`s the evidence file with no
pre-read byte cap (8MiB check is after allocation).

## Challenge 3 — does disk-only signature shape still freeze arbitrary corpus files?

**No on this dirty tree for `findSignedPackageRoots`. CONFIRMED closed
for the named disk-shape exemption.** HEAD froze on disk
keyId+signature. THIS TURN requires a tracked HEAD blob that still
passes `isRealSignature`. Extra probe: path outside the repo is
`false`; untracked inside is `false`. Named suite 25/25 green,
including disk-only fake stays `runtime` and still gates `--strict`.
Residual: no Ed25519/hybrid verification; ceremony identity is `git
show HEAD:rel`; TOCTOU vs later file scan; unbounded `JSON.parse` of
HEAD / descriptor.

## Residuals (do not block this scoped PASS; keep PARTIAL not PATCHED)

- Effect-name walk still skips `self-hosted/` and uses regex over
  source; TOCTOU between `lstat` and `readFileSync`; dir symlinks are
  omitted rather than listed unread.
- Duplicate-key scanner is a hand JSON walker, not a full RFC 8259
  parser; `readPrimitive` is coarse; `runners.ts` allocates the evidence
  string before the 8MiB cap.
- Signed-frozen still does not verify Ed25519/hybrid bytes; `git show
  HEAD:rel` is the ceremony identity; TOCTOU vs later scan of source
  files; `isRealSignature` remains shape-only on the HEAD blob.

## Verdict

**PASS** scoped to A/B/C as this-turn PARTIAL candidates on dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`. Hashes MATCH. Suites 7/7,
8/8, 25/25. Extra TEMP probe 11/11. Inventory recount 35 OPEN / 85
PARTIAL / 4 PATCHED (`n` 124); named rows still
`OPEN_ON_SCAN_SNAPSHOT`. `INCOMPLETE_NON_AUTHORITATIVE`. Not production
admission. Not Astra. Not 124-scan closure. This reviewer did not
reclassify inventory.
