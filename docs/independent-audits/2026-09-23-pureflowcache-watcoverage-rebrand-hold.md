# Independent audit — pure-flow AST cache / WAT coverage / rebrand git-mv

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
admission. The full-repo WAT auditor was **not** run. `runRebrand()` was
**not** invoked against this dirty worktree.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_456107f3e63d6f916462d1bf`**: pure-flow result cache must be bound to
  the current flow AST via `canonicalHash(flowNode)`, not optional
  `sourceTag`/`traceId` alone. Files
  `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` + live consumer
  `src/interpreter.ts` `executeFlow`.
  THIS TURN: `admitPureFlowSourceTag` refuses empty/`undefined`/`NUL` with
  `FUNGI-CACHE-001`; `pureFlowCacheKey` requires an admitted source identity;
  `executeFlow` builds `sourceBoundPureFlowTag` from `canonicalHash(flowNode)`
  and skips cache when that identity is missing. Tests
  `tests/pure-flow-source-cache.test.mjs` **2/2** including two bodies of
  `double` with the same args not sharing a cached 42. Dist rebuilt.
  `tests/governance/flags-and-manifest.test.mjs` same-AST memoization **1/1**.
  Platform this review: win32 Node v24.18.0.

- **B. `csf_ca20b261bd6e7c977a558785`**: unread, parse-skipped, refused, and
  empty corpus must be coverage violations, not a clean sweep. File
  `scripts/audit-wat-lowering.mjs`.
  THIS TURN: exported `scanFungiCorpus` + `coverageProblems`; empty/`scanned<=0`,
  `parseErr`, `unread`, and `refused` are problems; `isDirectRun` so import does
  not scan the repo. Tests `scripts/tests/audit-wat-lowering.test.mjs` **4/4**.
  `--self-test` was run (allowed) and is **13/15** because this dirty tree maps
  `galerinaTypeToWAT("Decimal")` to `"i32"` (Decimal record fields supported);
  those two failed checks are Decimal-anchor drift, not the coverage claim.

- **C. `csf_96f8b6458988c6ce1208df0b`**: tracked names admitted (no leading `-`,
  no `..`, no absolute); `git mv` uses `["mv","--",from,to]`; `isDirectRun` so
  import does not rewrite the tree. File `scripts/rebrand-tmf-to-spore.mjs`.
  THIS TURN: `admitRebrandRel` / `gitMvArgs` / `isDirectRun`. Tests
  `scripts/tests/rebrand-tmf-to-spore.test.mjs` **3/3**. `runRebrand()` was not
  executed on this dirty worktree.

This reviewer independently re-read production + tests + compiler dist (the
compiler suite imports gitignored `dist/`; the two scripts are executed as
`.mjs` source), hashed working-tree bytes, ran the named suites, and executed
an extra probe from `%TEMP%` (not by trusting the named tests alone).
Author-named hashes were **not** supplied in the review packet. Independent
`crypto.createHash('sha256')` and `Get-FileHash` MATCH each other on the
listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not** promote
them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **11 OPEN / 109
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 11 = 0 high / 0 medium /
11 low, `PARTIAL_THIS_TREE` 109, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 11 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure.
Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named compiler suite imports
gitignored `dist/` (`packages-ts/.gitignore` `dist/`). This reviewer did not
rebuild; dist mtimes are newer than matching src and carry the claimed bodies.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` | **M** HEAD blob `40316d31c` → WT blob `7f2a8edaf`. HEAD `pureFlowCacheKey` took optional `sourceTag?: string` and hashed `sourceTag ?? null` (empty identity was a cache key). THIS TURN: exported `admitPureFlowSourceTag` refuses empty/`undefined`/`NUL`/oversize with `FUNGI-CACHE-001`; `sourceTag` is required. |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | **M** HEAD blob `313e59827` → WT blob `ed847e5a5`. HEAD `executeFlow` keyed cache on optional `runtimeOptions.sourceTag` else `traceId`, else omitted — two bodies of `double` with the same args shared a cached 42. THIS TURN: `sourceBoundPureFlowTag` = `canonicalHash(flowNode)` (+ optional extra); missing identity returns `null` and skips get/set. |
| `packages-ts/galerina-core-compiler/src/index.ts` | **M** HEAD blob `a40b6d1ce` → WT blob `85725beaa`. THIS TURN: re-exports `admitPureFlowSourceTag` (file also carries unrelated dirty-tree edits). |
| `packages-ts/galerina-core-compiler/dist/pure-flow-cache.js` | gitignored; rebuilt this turn; `admitPureFlowSourceTag` + `FUNGI-CACHE-001` present. |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | gitignored; rebuilt this turn; `sourceBoundPureFlowTag` + `cacheKey === null` skip present. |
| `packages-ts/galerina-core-compiler/tests/pure-flow-source-cache.test.mjs` | **??** untracked. THIS TURN: empty-identity refuse + two-body `double` not sharing 42. |
| `packages-ts/galerina-core-compiler/tests/governance/flags-and-manifest.test.mjs` | unchanged vs HEAD blob `0caf69edc`. Same-AST memoization still passes. |
| `scripts/audit-wat-lowering.mjs` | **M** HEAD blob `f66fa7e2a` → WT blob `f44b1d513`. HEAD `fungiFiles` used `statSync` (follows links), unread `continue`d without a counter, empty `scanned=0` was not a violation, and the module ran `runAudit()` on import. THIS TURN: `lstat`+size cap, `unread`/`refused`/`parseErr`/`scanned<=0` via `coverageProblems`, exported `scanFungiCorpus`, `isDirectRun` gates `runAudit()`. |
| `scripts/tests/audit-wat-lowering.test.mjs` | **??** untracked. THIS TURN: readable / parse-skip / oversize unread / empty-root coverage. |
| `scripts/rebrand-tmf-to-spore.mjs` | **M** HEAD blob `c32a42d6e` → WT blob `c21e82eea`. HEAD ran rewrite+`git("mv", rel, newRel)` at import with no `--` and no path admission. THIS TURN: `admitRebrandRel`, `gitMvArgs` → `["mv","--",from,to]`, `isDirectRun` gates `runRebrand()`, `lstat` skips symlink/non-file. |
| `scripts/tests/rebrand-tmf-to-spore.test.mjs` | **??** untracked. THIS TURN: option-like/`..`/absolute refuse + `ERR_REBRAND_PATH`. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` | 10432 | `728a984c1a09cebe51573f97d0d305ed92d606ad3902c21d4f852e5b3d69fc21` |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | 224113 | `825c4d7aba11814a7d4acd2c84e32718e1c14c412197022734b4d4cabb937477` |
| `packages-ts/galerina-core-compiler/src/index.ts` | 124439 | `7b98377bdc84e43e5505b6186dfccf1998a6b149c1e50949bbc5527322fffbbd` |
| `packages-ts/galerina-core-compiler/dist/pure-flow-cache.js` | 9931 | `9384c71abdcf50a0ed3a697d550f10ec09972d5979759e06fc1e5b383da30193` |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | 222740 | `cafe4f15bc023e3e9dd36a253181682fb5f7ba46f3ba4ae88a82085c7c59cf44` |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101448 | `405e20bc1347165b1c3acd744277d7514bcad4dc912a54aa336a8b294ba0d57b` |
| `packages-ts/galerina-core-compiler/tests/pure-flow-source-cache.test.mjs` | 2019 | `fd74ee7e80fdd52089d3eb686e33f6001551b6c59b8da9c023b107c18f794929` |
| `packages-ts/galerina-core-compiler/tests/governance/flags-and-manifest.test.mjs` | 24670 | `73086e6f065070050b1b9edc505935d673ff8efae48290714e5a247b42d4c251` |
| `scripts/audit-wat-lowering.mjs` | 19481 | `9369e67d1b77dabf527047978d78850d49c4a5fa0725727f6f16a02624beaf3b` |
| `scripts/tests/audit-wat-lowering.test.mjs` | 2453 | `456f337a699befd618994651c522e1d671ea04164dfa0ec5a9fd8f68ee17d069` |
| `scripts/rebrand-tmf-to-spore.mjs` | 4073 | `5ca3fe088bab7525c3080fd1e2c97675898393267f416adebe5734e9483b8514` |
| `scripts/tests/rebrand-tmf-to-spore.test.mjs` | 1169 | `08015ccc62201d9b466a3840c65a8d12e7a5b441e5f7c215a3f9083f494681a6` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 68603 | `b0da83d8ed132040bc92da1c5344ba5f1104e494b0598458625ba45509ffc971` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above. The four listed
claim files MATCH:

- `pure-flow-cache.ts` `728a984c1a09cebe51573f97d0d305ed92d606ad3902c21d4f852e5b3d69fc21`
- `interpreter.ts` `825c4d7aba11814a7d4acd2c84e32718e1c14c412197022734b4d4cabb937477`
- `audit-wat-lowering.mjs` `9369e67d1b77dabf527047978d78850d49c4a5fa0725727f6f16a02624beaf3b`
- `rebrand-tmf-to-spore.mjs` `5ca3fe088bab7525c3080fd1e2c97675898393267f416adebe5734e9483b8514`

Dist mtimes (UTC): compiler `pure-flow-cache.js` `2026-09-23T14:16:37Z`,
`interpreter.js` `2026-09-23T14:16:37Z`, `index.js` `2026-09-23T14:16:38Z`
(src cache/index `2026-09-23T14:13:38Z`, interpreter `2026-09-23T14:13:45Z`).
Dist is newer than this-turn src and contains the claimed bodies.

Inventory file sha256 `b0da83d8ed132040bc92da1c5344ba5f1104e494b0598458625ba45509ffc971`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | cache bound to current flow AST via `canonicalHash(flowNode)`, not optional `sourceTag`/`traceId` alone; missing identity skips cache; empty tag refused | `sourceBoundPureFlowTag` hashes `flowNode`; `cacheKey===null` skips get/set; `admitPureFlowSourceTag` `FUNGI-CACHE-001` | pure-flow-source-cache **2/2** (two `double` bodies, second is 0 not cached 42, `executionTier !== "cache"`); flags-and-manifest same-AST **1/1** | `%TEMP%` `pureFlowCacheKey(BASE,"main",emptyMap)` without `sourceTag` throws `FUNGI-CACHE-001`; empty/`undefined` admit same | process-wide LRU `SESSION_CACHE` still shared across callers; optional `sourceTag`/`traceId` still *concatenated* onto the AST hash (not used alone); tag `length>256` falls back to hash-only |
| B | unread / parse-skipped / refused / empty corpus are coverage violations, not a clean sweep; import must not scan | `coverageProblems` on `scanned<=0` / `parseErr` / `unread` / `refused`; `scanFungiCorpus` exported; `isDirectRun` | audit-wat-lowering.test **4/4** (ok / parse-skip / oversize unread / empty root) | `%TEMP%` `coverageProblems({scanned:0,...})` → `["absent or unread corpus"]`; parse-skipped / unread / refused strings nonempty | `lstat` then `readFileSync` TOCTOU; `--self-test` **13/15** because Decimal is now `i32` / field-supported on this tree (anchor drift, not coverage) |
| C | tracked names admitted (no leading `-`, no `..`, no absolute); `git mv` is `["mv","--",from,to]`; import must not rewrite | `admitRebrandRel`; `gitMvArgs`; `isDirectRun` | rebrand-tmf-to-spore.test **3/3** | `%TEMP%` `gitMvArgs("--output=x","a")` throws `ERR_REBRAND_PATH`; admitted pair is `["mv","--","docs/tmf.md","docs/spore.md"]` | content `lstat` then read/write is TOCTOU; `git mv` is still path-based (not fd-rename); `runRebrand()` not executed here |

## Suites (fresh this review)

From worktree, `node --test`:

- `packages-ts/galerina-core-compiler/tests/pure-flow-source-cache.test.mjs`:
  **2/2** pass, fail 0, skipped 0, duration ~394ms. Platform win32 Node
  v24.18.0. Covers `FUNGI-CACHE-001` on missing/empty identity and two bodies
  of `double` (`return x` vs `return 0`) with args `x=42` not sharing a
  cached 42 (`executionTier !== "cache"`).
- `packages-ts/galerina-core-compiler/tests/governance/flags-and-manifest.test.mjs`
  `--test-name-pattern "same pure flow called twice"`: **1/1** pass, duration
  ~397ms. Same-AST second call still memoizes.
- `scripts/tests/audit-wat-lowering.test.mjs`: **4/4** pass, fail 0, duration
  ~490ms. Readable corpus clean; parse-skipped / oversize unread / empty root
  are coverage problems. Import did not scan the repo.
- `scripts/tests/rebrand-tmf-to-spore.test.mjs`: **3/3** pass, fail 0, duration
  ~153ms. Content rewrite cases; option-like/`..`/absolute refuse; `git mv`
  argv option-terminated.
- `node scripts/audit-wat-lowering.mjs --self-test`: **13/15** (exit 1).
  Failed: “Decimal record field is BOTH Leg-A and Leg-C” and
  “decimal-wart still present (`galerinaTypeToWAT(Decimal)=f64`)”. Extra probe
  independently observed `galerinaTypeToWAT("Decimal")==="i32"` and
  `isWATRecordFieldTypeSupported("Decimal")===true` on this dist. Coverage
  self-checks in that run are among the 13 that passed. Full-repo auditor
  (no `--self-test`) was **not** run.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/pureflowcache-watcoverage-rebrand-probe.mjs`
imported worktree compiler dist, `scripts/audit-wat-lowering.mjs`, and
`scripts/rebrand-tmf-to-spore.mjs`. CWD `<LOCAL_TEMP>`.
`PROBE_OK` 12/12 exit 0. Import of the two scripts did not print a corpus
sweep and did not print `rebrand tmf->spore` ( `isDirectRun` false).

- (i) `pureFlowCacheKey(BASE, "main", emptyMap)` without `sourceTag` throws
  `FUNGI-CACHE-001: pure-flow cache requires a non-empty source identity`.
  `admitPureFlowSourceTag("")` and `admitPureFlowSourceTag(undefined)` same.
- (ii) `coverageProblems({ scanned: 0, parseErr: 0, unread: 0, refused: [] })`
  → `["absent or unread corpus"]` (nonempty). `parseErr:1` → parse-skipped;
  `unread:2` → unread; `refused:[{…}]` → refused.
- (iii) `gitMvArgs("--output=x","a")` throws `ERR_REBRAND_PATH`.

## Residuals (author-flagged; independently observed)

- Pure-flow cache is still a process-wide LRU (`SESSION_CACHE`, `MAX_ENTRIES`
  1000) for the lifetime of the process. AST binding prevents two bodies of
  the same flow name colliding; it does not isolate callers/users.
- WAT `scanFungiCorpus` `lstatSync` then later `readFileSync` is TOCTOU; no
  fd identity / `O_NOFOLLOW`. A swapped symlink/file after `lstat` can still
  be read (then counted as scanned or unread depending on the replacement).
- Rebrand content rewrite `lstatSync` then `readFileSync` / `writeFileSync`
  is the same TOCTOU class. `git mv` is still path-based
  (`["mv","--",fromRel,toRel]`), not an fd-rename of the admitted inode.
- `--self-test` Decimal f64 anchors are stale on this dirty tree (`Decimal`
  lowers to `i32` and is a supported record field). That is independent of
  the coverage-violation claim and was not treated as a named-claim miss.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 11 /
`PARTIAL_THIS_TREE` 109 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 11 remaining OPEN are low. Named three remain
OPEN (`csf_456107f3e63d6f916462d1bf`, `csf_ca20b261bd6e7c977a558785`,
`csf_96f8b6458988c6ce1208df0b`). Matches author-last 11/109/4. Reviewer
did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. Pure-flow cache keys include `canonicalHash(flowNode)` and skip on
missing identity (`FUNGI-CACHE-001`); WAT unread/parse-skip/refused/empty
are coverage violations and import does not scan; rebrand admits tracked
names and `git mv` is option-terminated, and import does not rewrite.
Residuals remain and keep the scan rows OPEN. **INCOMPLETE_NON_AUTHORITATIVE**.
Not production admission. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
