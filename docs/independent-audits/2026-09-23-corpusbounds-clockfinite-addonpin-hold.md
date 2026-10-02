# Independent audit — corpus byte bound / finite clock envelope / addon pin-stage

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation 91b4dec08 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This receipt
is not the author’s packet. Passing tests here are **not** production
admission.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_a77cdc8c16ffb066c41b81fd`**: corpus scanner must not unbounded-read
  hostile files before parser limits. Files
  `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` +
  `src/inline-fixtures.ts`.
  THIS TURN: exported `MAX_CORPUS_FILE_BYTES` `1_048_576`;
  `corpusSourceExceedsMaxBytes` is UTF-8 `Buffer.byteLength`; `lstat` before
  `readFileSync` in `scanCorpus` and `scanInlineFixtures`;
  `scanFungiSource`/`scanGateSource` refuse before `lex`. Oversize is a
  `readError` finding, not lexed. Tests `tests/fungi-scan.test.mjs` **28/28**
  including hostile oversize disk, in-memory, and inline host. Dist rebuilt.
  Platform this review: win32 Node v24.18.0.

- **B. `csf_ec4df379040fdca288ff057c`**: non-finite clock/envelope inputs must
  not suppress drift refusal. File
  `packages-ts/galerina-core-sentinel-time/src/synchronization-gate.ts`.
  THIS TURN: constructor refuses non-safe-integer `maxDriftTicks`;
  `driftTicks`/`enforceDrift` refuse non-finite `now()` / `physicalMs` /
  `ticksPerMs` / computed drift with `LST-SYNC-002`. Tests
  `tests/synchronization-gate.test.mjs` **7/7** including NaN `clock.now()`
  fake. Dist rebuilt.

- **C. `csf_b020bf3ce948fc9267d8e23d`**: pin hash must be of captured bytes;
  `require()` must load an exclusive staged copy of those bytes, not a second
  path read. File `packages-ts/galerina-ext-bridge-cpp/src/addon-loader.ts`.
  THIS TURN: `snapshotAddonFile` `lstat`+bounded read; hash of those bytes;
  `stageAddonBytes` wx-writes `galerina-pinned-addon-*`; `require(staged.path)`.
  Symlink/non-file refused. Tests `tests/addon-loader.test.mjs` **8/8**
  (symlink consumer **did not skip** on this host). Dist rebuilt.

This reviewer independently re-read production + tests + dist (all three
suites import gitignored `dist/`), hashed working-tree bytes, ran the named
suites, and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not** supplied in the review packet.
Independent `crypto.createHash('sha256')` and `Get-FileHash` MATCH each other
on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not** promote
them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **14 OPEN / 106
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 14 = 0 high / 0 medium /
14 low, `PARTIAL_THIS_TREE` 106, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 14 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure.
Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named suites import gitignored
`dist/` (`packages-ts/.gitignore` `dist/`). This reviewer did not rebuild;
dist mtimes are newer than matching src and carry the claimed bodies.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | **M** HEAD blob `364a4d2df` → WT blob `48ffd70bd`. HEAD `scanCorpus` already `lstat`-refused symlink/non-file/`st.size > 1_048_576` then `source.length > 1_048_576` after decode; `scanFungiSource`/`scanGateSource` lexed unbounded. THIS TURN: exported `MAX_CORPUS_FILE_BYTES` `1_048_576`, `corpusSourceExceedsMaxBytes` UTF-8 byteLength, bound before `lex`, post-decode check uses byteLength not `source.length`. |
| `packages-ts/galerina-devtools-fungi-scan/src/inline-fixtures.ts` | **M** HEAD blob `7ae028ea5` → WT blob `c001a8b0a`. HEAD `readFileSync` with no size check. THIS TURN: `lstat` + size/`corpusSourceExceedsMaxBytes` before extract; oversize host is a finding. |
| `packages-ts/galerina-devtools-fungi-scan/src/index.ts` | **M** HEAD blob `40272e56f` → WT blob `547c44afe`. Re-exports bound helpers + `MAX_CORPUS_*`. |
| `packages-ts/galerina-devtools-fungi-scan/dist/scanner.js` | gitignored; rebuilt this turn; `MAX_CORPUS_FILE_BYTES` + `lstat` + pre-lex bound present. |
| `packages-ts/galerina-devtools-fungi-scan/dist/inline-fixtures.js` | gitignored; rebuilt this turn; host `lstat` bound present. |
| `packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs` | **M** HEAD blob `7618e700f` → WT blob `2e17b511f`. THIS TURN: three hostile oversize tests (disk / in-memory / inline host). |
| `packages-ts/galerina-core-sentinel-time/src/synchronization-gate.ts` | **M** HEAD blob `1d24edf44` → WT blob `b706549d3`. HEAD constructor copied envelope as-is; `driftTicks` did not check `now()`; `enforceDrift` was `Math.abs(drift) > maxDriftTicks` (`NaN` envelope never refuses). THIS TURN: `Number.isSafeInteger` constructor; finite `now`/drift checks; `LST-SYNC-002`. |
| `packages-ts/galerina-core-sentinel-time/dist/synchronization-gate.js` | gitignored; rebuilt this turn; constructor + finite checks present. |
| `packages-ts/galerina-core-sentinel-time/tests/synchronization-gate.test.mjs` | **M** HEAD blob `97df8f45c` → WT blob `55d80f552`. THIS TURN: hostile NaN/Infinity envelope + NaN `clock.now()` fake. |
| `packages-ts/galerina-ext-bridge-cpp/src/addon-loader.ts` | **M** HEAD blob `1234c8d4c` → WT blob `b02426cdc`. HEAD `existsSync` + `readFileSync(p)` hash then `require(p)` (second path access). THIS TURN: `snapshotAddonFile` / `stageAddonBytes` / `require(staged.path)`; symlink/non-file refused. |
| `packages-ts/galerina-ext-bridge-cpp/src/index.ts` | **M** HEAD blob `9e89f6a16` → WT blob `a7b39ef45`. Re-exports `snapshotAddonFile`, `stageAddonBytes`, `MAX_ADDON_BYTES`. |
| `packages-ts/galerina-ext-bridge-cpp/dist/addon-loader.js` | gitignored; rebuilt this turn; snapshot/stage/`require(staged.path)` present. |
| `packages-ts/galerina-ext-bridge-cpp/tests/addon-loader.test.mjs` | **M** HEAD blob `7610ea910` → WT blob `3d0d5ddf4`. THIS TURN: pin-identity snapshot-survive-replace, directory refuse, symlink refuse, staged hash on `allowUnverified`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-devtools-fungi-scan/src/scanner.ts` | 21234 | `74b682ae2ad706dffcf15f2ec59b1a8f7f9ff1c0c9026d7647cd13fcb337d65a` |
| `packages-ts/galerina-devtools-fungi-scan/src/inline-fixtures.ts` | 10752 | `1ca82a2addfbf4df66f6a8340f692ed13a3b9cc3b8979c80f69e06ed87a493f3` |
| `packages-ts/galerina-devtools-fungi-scan/src/index.ts` | 804 | `27bfcb8bd86bb14975f03810db3fe4ec1fc736422a2274e7590739dbf70a6232` |
| `packages-ts/galerina-devtools-fungi-scan/dist/scanner.js` | 18299 | `d830c567d0ab56748229da2ed73d22a1f33114c7ca628cfc43e667fe69d71ef8` |
| `packages-ts/galerina-devtools-fungi-scan/dist/inline-fixtures.js` | 10697 | `a0850086c9bdef0f9c0264be657967d2fe39cd24998a11e1a664ad6bfbb6ae5a` |
| `packages-ts/galerina-devtools-fungi-scan/dist/index.js` | 617 | `871df4a46a82d4aed46ae2ab57ea92c68f87d68f8bd4b821b8c73f86c0efbcf6` |
| `packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs` | 20042 | `87d0e3ad18a71e947cf0654aa0058aab09a3ce2bc26a3e37b5b4c46073197e80` |
| `packages-ts/galerina-core-sentinel-time/src/synchronization-gate.ts` | 4008 | `1dc33ca5e7d0a8b7da3803ae363cf9b692e8dfabbef1f5e43b8f88516c9496f5` |
| `packages-ts/galerina-core-sentinel-time/dist/synchronization-gate.js` | 3655 | `02033645ac3f4d598513022cf5607045db839ed4ae90ed979a9a3a3503b579bf` |
| `packages-ts/galerina-core-sentinel-time/dist/index.js` | 580 | `49ce4d89757c231ad6356dfa02558c4d87879abb6cee2ab60d632fc0ff5f4e11` |
| `packages-ts/galerina-core-sentinel-time/tests/synchronization-gate.test.mjs` | 4291 | `0c48b90c542588014659a234c791dacffb8f03eb26bb20cb521a598ed5955f04` |
| `packages-ts/galerina-ext-bridge-cpp/src/addon-loader.ts` | 9019 | `3b89422a08071bfb43311e6e4a722e4a63c14d664a76d2583ef7716c8bd28f1c` |
| `packages-ts/galerina-ext-bridge-cpp/src/index.ts` | 2562 | `be6cd68c7ebd05b2fa6a149fdc4f89ed08644ecdad7adb4dbf0584c722d388c0` |
| `packages-ts/galerina-ext-bridge-cpp/dist/addon-loader.js` | 7800 | `a28a6afe003281e9ec336c574790ab6b4a4d096103a86563210b1c299b7e4356` |
| `packages-ts/galerina-ext-bridge-cpp/dist/index.js` | 2229 | `93a28439e6bffffb8889cfecff271d8bc03b286e32724b2c4bab5351b96d8387` |
| `packages-ts/galerina-ext-bridge-cpp/tests/addon-loader.test.mjs` | 7117 | `bfb686074c35c5fcdf1f3d92626f9cbad4dfa9626541a5d304564d5f307be995` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 67774 | `787a4bc064b1eae7d5b5164b542862af9f7e74cab4ab6d8adc1d75916932a8c7` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above.

Dist mtimes (UTC): fungi-scan `scanner.js` / `inline-fixtures.js` / `index.js`
`2026-09-23T14:00:44Z` (src scanner/inline `2026-09-23T13:58:39Z`, index
`2026-09-23T13:58:39Z`); sentinel-time `synchronization-gate.js` / `index.js`
`2026-09-23T14:00:44Z` (src `2026-09-23T13:59:25Z`); addon-loader
`addon-loader.js` / `index.js` `2026-09-23T14:00:44Z` (src
`2026-09-23T13:59:25Z`). Dist is newer than this-turn src and contains the
claimed bodies.

Inventory file sha256 `787a4bc064b1eae7d5b5164b542862af9f7e74cab4ab6d8adc1d75916932a8c7`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | hostile files must not be unbounded-read / lexed before parser limits | exported `MAX_CORPUS_FILE_BYTES`; `lstat` before read; `scanFungiSource`/`scanGateSource` refuse before `lex`; inline host same bound | fungi-scan **28/28** including disk oversize `readError` + in-memory + inline host | `%TEMP%` exact `MAX` `readError===null`; `MAX+1` `"corpus source exceeds 1 MiB"` and not lexed | `lstat`→`readFileSync` TOCTOU; `discoverCorpus` / `discoverInlineHosts` still `return` on unreadable dirs (skip, not finding). HEAD already had disk `lstat` size magic; this turn is exported bound + in-memory/API + inline + UTF-8 byteLength. |
| B | non-finite clock/envelope must not suppress drift refusal | constructor `Number.isSafeInteger`; `driftTicks` finite `now`/drift; `enforceDrift` finite-or-abs | synchronization-gate **7/7** including NaN envelope + NaN `now()` fake | `%TEMP%` `Math.abs(NaN)>5===false`; constructor NaN/Infinity → `LST-SYNC-002` | `syncToPhysical` captures `#bootTick = clock.now()` with no finite check at that call. Later `driftTicks` still throws if `now()` or computed drift is non-finite. |
| C | pin hash of captured bytes; `require` of exclusive staged copy, not a second source-path read | `snapshotAddonFile` hash of captured bytes; `stageAddonBytes` `galerina-pinned-addon-*`; `require(staged.path)`; symlink/non-file refuse | addon-loader **8/8**; symlink consumer ran | `%TEMP%` snapshot hash equals sha256 of dummy after source overwrite; post-overwrite snapshot matches replaced bytes, not dummy | `lstat`→`readFileSync` TOCTOU; `require` is still a path load of the staged copy (not fd-exec); successful load returns without `rmSync` of the temp dir. |

## Suites (fresh this review)

From worktree, `node --test`:

- `packages-ts/galerina-devtools-fungi-scan/tests/fungi-scan.test.mjs`:
  **28/28** pass, fail 0, skipped 0, duration ~1565ms. Platform win32 Node
  v24.18.0. Covers version/legacy/match/inline plus three hostile oversize
  cases (disk `huge.fungi` never lexed, in-memory `MAX+1`, inline host).
- `packages-ts/galerina-core-sentinel-time/tests/synchronization-gate.test.mjs`:
  **7/7** pass, fail 0, duration ~134ms. Includes NaN/Infinity envelope,
  NaN `physicalMs`/`ticksPerMs`, and `{ now: () => Number.NaN }` fake.
- `packages-ts/galerina-ext-bridge-cpp/tests/addon-loader.test.mjs`:
  **8/8** pass, fail 0, skipped 0, duration ~227ms. Unpinned/mismatch
  refuse, snapshot-survive-replace, directory refuse, symlink refuse
  (live on this host), `allowUnverified` hashes captured bytes then stages.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/corpusbounds-clockfinite-addonpin-probe.mjs`
imported worktree fungi-scan dist, sentinel-time dist, and addon-loader dist.
CWD `<LOCAL_TEMP>`. `PROBE_OK` 17/17 exit 0.

- `scanFungiSource` of exactly `MAX_CORPUS_FILE_BYTES` (`1048576` UTF-8
  bytes) → `readError === null`; `MAX+1` → `"corpus source exceeds 1 MiB"`,
  `lexErrors === 0`. Same bound on `scanGateSource`.
- `Math.abs(Number.NaN) > 5 === false` and `Math.abs(5) > Number.NaN ===
  false` (the HEAD suppress-drift shape). Constructor on `{ maxDriftTicks:
  Number.NaN }` and `Number.POSITIVE_INFINITY` throws `LST-SYNC-002`.
- `snapshotAddonFile` hash equals sha256 of dummy bytes after the original
  file was overwritten; a snapshot taken after overwrite matches the
  replaced bytes, not the dummy.

## Residuals (author-flagged; independently observed)

- Scanner `lstat` then later `readFileSync` is TOCTOU; no fd identity /
  `O_NOFOLLOW`. A swapped symlink/file after `lstat` can still be read.
- `discoverCorpus` and `discoverInlineHosts` still `return` on unreadable
  dirs (junction stub etc.); those trees are skipped, not fail-closed
  findings.
- Addon `lstat` then `readFileSync` is the same TOCTOU class. `require`
  still path-loads the staged copy (not fd-exec of the captured bytes).
  Successful load leaves the `galerina-pinned-addon-*` temp (cleanup only
  on missing-exports / load-throw).
- `SynchronizationGate.syncToPhysical` records `#bootTick = this.#clock.now()`
  with no finite check at capture time. Non-finite `now()` at sync is stored;
  later `driftTicks` still refuses if `now()` or computed drift is non-finite.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 14 /
`PARTIAL_THIS_TREE` 106 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 14 remaining OPEN are low. Named three remain
OPEN. Reviewer did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. Corpus in-memory/disk/inline sources refuse above 1 MiB before lex;
NaN envelope no longer suppresses drift (`LST-SYNC-002`); addon pin is of
captured bytes and `require` is of an exclusive staged copy. Residuals
remain and keep the scan rows OPEN. **INCOMPLETE_NON_AUTHORITATIVE**. Not
production admission. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
