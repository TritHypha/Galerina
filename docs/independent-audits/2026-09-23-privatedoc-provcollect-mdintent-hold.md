# Independent audit — private-doc JSON exit / provenance collect / context intent escape

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation 91b4dec08 [main]`.
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet.
Passing tests here are **not** production admission.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_f1da2541c73e90978ac2095c`**: JSON mode must not use violation
  count as process exit (256 wrap). File
  `scripts/audit-private-doc-leak.mjs`.
  THIS TURN: `exitCodeFromViolationCount` maps a non-negative safe integer
  to `0`/`1`; JSON payload keeps exact `violations.length` plus `exitCode`;
  CLI `--root` for disposable git fixtures; `isDirectRun` so tests can
  import. Tests `scripts/tests/audit-private-doc-leak.test.mjs` **2/2**
  covering `0,1,255,256,257,512` text+JSON. Platform this review: win32
  Node v24.18.0. WSL **NOT VERIFIABLE** this turn.

- **B. `csf_f8430446c39ce8e2ed571bab`**: provenance corpus walk must not
  follow symlinks / treat incomplete coverage as empty-clean. Files
  `packages-ts/galerina-devtools-provenance/src/analyzer.ts` +
  `src/cli.ts`.
  THIS TURN: `collectFungiCorpus` `lstat`-refuses
  symlinks/unreadable/depth/file-cap; complete empty ≠ incomplete. CLI
  `audit` and `report` return `2` on incomplete, `0` on complete empty.
  Dist rebuilt. Tests `tests/provenance-collect.test.mjs` **2/2** (empty +
  symlink consumers; symlink **did not skip** on this host). Residual the
  author flags: TOCTOU after `lstat`; no fd identity.

- **C. `csf_9897c60d1d1b4dc57fa81419`**: context receipt Markdown must not
  emit source-controlled intent unescaped. File
  `packages-ts/galerina-devtools-context/src/markdown-renderer.ts`.
  ALREADY on HEAD: `md()` escape table and
  `md(receipt.contract.intent)`. THIS TURN: exported `md` (and `src/index.ts`
  re-export). Hostile intent with pipe/newline/script. Tests
  `tests/context-markdown-escape.test.mjs` **1/1**. Dist rebuilt.

This reviewer independently re-read production + tests + dist (B and C
suites import gitignored `dist/`), hashed working-tree bytes, ran the
named suites, and executed an extra probe from `%TEMP%` (not by trusting
the named tests alone). Author-named hashes were **not** supplied in the
review packet. Independent `crypto.createHash('sha256')` and
`Get-FileHash` MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **17 OPEN / 103
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 17 = 0 high / 0 medium /
17 low, `PARTIAL_THIS_TREE` 103, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 17 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named provenance and
context suites import gitignored `dist/` (`packages-ts/.gitignore`
`dist/`). Named private-doc tests import
`scripts/audit-private-doc-leak.mjs` (no dist). This reviewer did not
rebuild; dist mtimes are newer than matching src and carry the claimed
bodies.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `scripts/audit-private-doc-leak.mjs` | **M** HEAD blob `0d064ede6` → WT blob `8c6ca4e99`. HEAD JSON `process.exit(violations.length)`; text already `violations.length > 0 ? 1 : 0`. THIS TURN: `exitCodeFromViolationCount`; JSON `{ scanned, skippedBinary, violations, exitCode }` + `process.exit(exitCode)`; `--root`; `isDirectRun`. |
| `scripts/tests/audit-private-doc-leak.test.mjs` | **??** (new). Unit map `0/1/255/256/257/512`; CLI text+JSON on disposable `git init` fixtures via `--root`. |
| `packages-ts/galerina-devtools-provenance/src/analyzer.ts` | **M** HEAD blob `8d7f4a1ee` → WT blob `4d9cfc1df`. HEAD `statSync` recursive `collectFungiFiles` followed directories (and therefore directory symlinks). THIS TURN: `lstatSync` + `collectFungiCorpus` `{ files, complete, refused }`; symlink/unreadable/depth 32/file-cap 8192 → `complete: false`. `collectFungiFiles` is now a list-only wrapper. |
| `packages-ts/galerina-devtools-provenance/src/cli.ts` | **M** HEAD blob `97a7b2faf` → WT blob `04dec869e`. `audit`/`report` use `collectFungiCorpus`; incomplete → stderr + exit `2`; complete empty → exit `0`. |
| `packages-ts/galerina-devtools-provenance/src/index.ts` | **M**. Re-exports `collectFungiCorpus` + `FungiCollection`. |
| `packages-ts/galerina-devtools-provenance/dist/analyzer.js` | gitignored; rebuilt this turn; `collectFungiCorpus` + `lstatSync` present. |
| `packages-ts/galerina-devtools-provenance/dist/cli.js` | gitignored; rebuilt this turn; incomplete → `2`. |
| `packages-ts/galerina-devtools-provenance/tests/provenance-collect.test.mjs` | **??** (new). Empty complete + hostile symlink. Imports `../dist/index.js` and `../dist/cli.js`. |
| `packages-ts/galerina-devtools-context/src/markdown-renderer.ts` | **M** HEAD blob `ec12b89b4` → WT blob `40c70cca5` (`+1 / −1`). Sole production hunk: `function md` → `export function md`. Escape table and `md(receipt.contract.intent)` already on HEAD. |
| `packages-ts/galerina-devtools-context/src/index.ts` | **M**. Re-exports `md`. |
| `packages-ts/galerina-devtools-context/dist/markdown-renderer.js` | gitignored; rebuilt this turn; `export function md` + intent through `md()`. |
| `packages-ts/galerina-devtools-context/tests/context-markdown-escape.test.mjs` | **??** (new). Hostile pipe/newline/`<script>`. Imports `../dist/index.js`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `scripts/audit-private-doc-leak.mjs` | 9286 | `27ed52898d7a629c7fa82e041b1ed02329f81797b34c79cb7fd634d3ee4b23a5` |
| `scripts/tests/audit-private-doc-leak.test.mjs` | 2534 | `28572a782fc924993225d46dbbcd1d0d9475cbca3561e1c0f019d61f26f5d573` |
| `packages-ts/galerina-devtools-provenance/src/analyzer.ts` | 34330 | `78e56dc3f9d02511d8a470c262bdd75c80992a7346ff4c87406d666ea396adf9` |
| `packages-ts/galerina-devtools-provenance/src/cli.ts` | 7676 | `bf232cfd276a60d7eda1271f29b7cca6e8ec2894681746bf5ed00419c14bca83` |
| `packages-ts/galerina-devtools-provenance/src/index.ts` | 758 | `1657aea728a9db4f33c491063247b264cfd29a481c5ebaaea08f02bda9f59b2c` |
| `packages-ts/galerina-devtools-provenance/dist/analyzer.js` | 33821 | `a27b4350a4bd355ef029ccafbc79078d6179d0443581e739dbbf2381540ef549` |
| `packages-ts/galerina-devtools-provenance/dist/cli.js` | 8310 | `f156491a138735f591a24d2ba0cc6251bf2c71265cdec48b918bbb5ce634c501` |
| `packages-ts/galerina-devtools-provenance/dist/index.js` | 512 | `aa6ed5e225d016a77931e8aab0361c4888392bf0effac56f5f38ed68e4f4a873` |
| `packages-ts/galerina-devtools-provenance/tests/provenance-collect.test.mjs` | 2326 | `81c7ffb44a28a62ebcebec81c00e50d94e3b012d3f1687394b7556fb9209258d` |
| `packages-ts/galerina-devtools-context/src/markdown-renderer.ts` | 4336 | `8249db52c2d5345ac41379fc76d778e42a40f3cb82cbcbce83145dacdfa29aef` |
| `packages-ts/galerina-devtools-context/src/index.ts` | 863 | `311cec5e6342fc337f8662f33dc90fa71c57c5ddb10307f1e392fa343a55316b` |
| `packages-ts/galerina-devtools-context/dist/markdown-renderer.js` | 4296 | `a66147f30338c3c6f9022d01fb8d5e2b046a9033549340458d598bb99852c213` |
| `packages-ts/galerina-devtools-context/dist/index.js` | 740 | `d1569993d53692a470b8125b51a22b1f2792d62ff63c7ed71d62ba34c3552972` |
| `packages-ts/galerina-devtools-context/tests/context-markdown-escape.test.mjs` | 1098 | `809aae42e9726ff4931041ba10ffaca1bae4e5b3c7a3903b16843e3467e5af3d` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 67341 | `8beed52dd6ced10ad9595d29c4d4ec842e8d755d1408c21f2dc444741cb7a185` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above.

Dist mtimes (UTC): provenance `analyzer.js` / `cli.js` / `index.js`
`2026-09-23T13:41:47Z` (src analyzer `2026-09-23T13:40:38Z`, cli
`2026-09-23T13:41:14Z`); context `markdown-renderer.js` / `index.js`
`2026-09-23T13:41:47Z` (src `2026-09-23T13:40:31Z`). Dist is newer than
this-turn src and contains the claimed bodies (JSON/text 0/1 is source-only
for A).

Inventory file sha256 `8beed52dd6ced10ad9595d29c4d4ec842e8d755d1408c21f2dc444741cb7a185`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | JSON must not `process.exit(violations.length)` (256→0 Unix wrap) | `exitCodeFromViolationCount`; JSON and text both `process.exit(exitCode)` | private-doc **2/2** including CLI text+JSON `n=256` status `1`, payload `violations.length===256` and `exitCode===1` | `%TEMP%` `exitCodeFromViolationCount(256)===1` | Unix 8-bit wrap not exercised (win32 `process.exit(256)` would have been status `256`, not `0`; tests still require `1`). WSL NOT VERIFIABLE. Unreadable tracked files are skipped, not fail-closed. |
| B | symlink / incomplete walk must not report empty-clean | `lstatSync` refuse; `complete:false` on missing/symlink/unreadable/depth/cap; CLI audit/report `2` if `!complete`, `0` if complete empty | provenance-collect **2/2**; symlink consumer ran (not skipped) | `%TEMP%` missing dir `complete===false` and path in `refused` | TOCTOU after `lstat`; `buildProvenanceGraph` `readFileSync` can follow a swapped symlink; `collectFungiFiles` drops `complete`; non-file/non-dir/non-symlink entries skipped without `complete=false`. |
| C | source-controlled intent must not inject Markdown/HTML | `md(receipt.contract.intent)`; `export function md` | context-markdown-escape **1/1** | `md("<script>")` === `&lt;script&gt;` | `renderFileReceiptsMarkdown` interpolates `file.sourceFile` unescaped. HTML comments not stripped beyond `<` `>`. Intent escape already on HEAD; this turn is export + hostile test. |

## Suites (fresh this review)

From worktree, `node --test`:

- `scripts/tests/audit-private-doc-leak.test.mjs`: **2/2** pass, fail 0,
  duration ~8409ms. Platform win32 Node v24.18.0. Covers unit map and
  CLI text+JSON for `0,1,255,256,257,512` on disposable git fixtures.
- `packages-ts/galerina-devtools-provenance/tests/provenance-collect.test.mjs`:
  **2/2** pass, fail 0, skipped 0, duration ~1388ms. Empty complete +
  hostile symlink both ran.
- `packages-ts/galerina-devtools-context/tests/context-markdown-escape.test.mjs`:
  **1/1** pass, fail 0, duration ~315ms.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/privatedoc-provcollect-mdintent-probe.mjs`
imported worktree private-doc source, context dist, and provenance dist.
CWD `<LOCAL_TEMP>`. `PROBE_OK` exit 0.

- `exitCodeFromViolationCount(256) === 1`
- `exitCodeFromViolationCount(0) === 0`
- `md("<script>") === "&lt;script&gt;"`
- `collectFungiCorpus(missingDir).complete === false` with the missing
  path in `refused`

## Residuals (author-flagged; independently observed)

- Private-doc JSON/text 0/1 mapping was executed on **win32** Node
  v24.18.0. Unix `process.exit` 8-bit wrap (the original 256→0 shape) is
  **not** verifiable this turn. On this host the tests still discriminate
  because they require status `1`, not `256`.
- Provenance `lstat` then later `readFileSync` is TOCTOU; no fd identity /
  `O_NOFOLLOW`. Compatibility `collectFungiFiles` still returns only the
  file list (CLI no longer uses it).
- Context `renderFileReceiptsMarkdown` still interpolates `sourceFile`
  without `md()`. `md()` does not strip HTML comments beyond replacing
  `<` `>`.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 17 /
`PARTIAL_THIS_TREE` 103 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 17 remaining OPEN are low. Named three remain
OPEN. Reviewer did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. JSON private-doc exit is 0/1 with exact payload counts; provenance
corpus walk refuses incomplete coverage including a live symlink consumer
on win32; context intent goes through `md()`. Residuals remain and keep
the scan rows OPEN. **INCOMPLETE_NON_AUTHORITATIVE**. Not production
admission. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
