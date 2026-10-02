# Independent audit — trit bounds / provenance gate-order / conformance presence

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
admission. The full-repo conformance scan (no `--self-test`) was **not** run.
Inventory JSON was **not** promoted. Reviewer is a Grok worker, not GPT Astra.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_38215fae09550ce4426e5ce1`**: pack requires an array; `packedLen`
  admits `lenTrits`; `prefilterBatch` refuses `n*stride > subjects.length`.
  File `packages-ts/galerina-ext-tritsocket/src/prefilter.ts`. Tests
  `tests/prefilter-bounds.test.mjs` **2/2** plus existing
  `tests/prefilter.test.mjs` **11/11** (combined **13/13**). Dist rebuilt.
  Platform this review: win32 Node v24.18.0.

- **B. `csf_5e50fd79deea0f1d7bfc1c84`**: `scanGateCalls` ignores comment/string
  lines; `gatedBindings` only gates with line `<` sink; no fabricated
  last-transform edge. File
  `packages-ts/galerina-devtools-provenance/src/analyzer.ts`. Tests
  `tests/provenance-gate-order.test.mjs` **3/3** plus existing
  `tests/provenance.test.mjs` **20/20** (combined **23/23**). Dist rebuilt.
  Residual (author-flagged; independently observed): still regex, not CFG;
  RD-1304 all-path remains.

- **C. `csf_635ee1a63cbbdf28942f7abc`**: `sourcePresenceText` strips
  block/line comments before `includes`; `isDirectRun`. File
  `packages-ts/galerina-devtools-security/conformance-scan.mjs`. Tests
  `conformance-presence.test.mjs` **1/1**. Full-repo conformance scan was
  **not** run. `--self-test` (allowed) **27/27**.

This reviewer independently re-read production + tests + gitignored `dist/`
(tritsocket and provenance suites import `dist/`; conformance is executed as
`.mjs` source), hashed working-tree bytes, ran the named suites, and executed
an extra probe from `%TEMP%` (not by trusting the named tests alone).
Author-named hashes were **not** supplied in the review packet. Independent
`crypto.createHash('sha256')` and `Get-FileHash` MATCH each other on the
listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not** promote
them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **5 OPEN / 115
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 5 = 0 high / 0 medium /
5 low, `PARTIAL_THIS_TREE` 115, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). Header `disposition_counts` MATCH the findings-array
recount. The three named IDs are among the 5 OPEN lows. Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure.
Not production admission.

The inventory file changed underfoot during this review (reviewer did not
edit it): first hash this session was `12b5d3f0…` (69245 bytes, mtime
`2026-09-23T14:26:47Z`, then-array 8 OPEN / 112 PARTIAL / 4 PATCHED). Live
file at receipt time is `9b7ffa17…` (69709 bytes, mtime
`2026-09-23T14:43:31Z`, 5/115/4). Named three stayed OPEN on both snapshots.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named TypeScript suites import
gitignored `dist/` (`packages-ts/.gitignore` `dist/`). This reviewer did not
rebuild; dist mtimes are newer than matching src and carry the claimed bodies.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-ext-tritsocket/src/prefilter.ts` | **M** HEAD blob `246af5f69` → WT blob `95e2bcb6f`. HEAD `pack` accepted any `length` (array-like `{length:8}` allocated); `prefilterBatch` sliced `n` rows even when `n*stride > subjects.length`. THIS TURN: `Array.isArray` refuse; `n>0 && (!Number.isSafeInteger(n*stride) \|\| n*stride > subjects.length)` throws `batch subjects are smaller than n packed rows`. `packedLen` → `admitLenTrits` was **already** at HEAD (not this-turn); still present. |
| `packages-ts/galerina-ext-tritsocket/dist/prefilter.js` | gitignored; rebuilt this turn; `trits must be an array` + batch-size refuse present. |
| `packages-ts/galerina-ext-tritsocket/tests/prefilter-bounds.test.mjs` | **??** untracked. THIS TURN: non-array / oversize pack + undersize batch. |
| `packages-ts/galerina-ext-tritsocket/tests/prefilter.test.mjs` | unchanged vs HEAD. Deny/Maybe / reserved / linear batch still pass. |
| `packages-ts/galerina-devtools-provenance/src/analyzer.ts` | **M** HEAD blob `8d7f4a1ee` → WT blob `ab7bfbe73`. HEAD `scanGateCalls` matched raw lines (comment `validate.input` counted); `gatedBindings` unioned every gate in the flow (post-sink gates certified); incomplete sink wiring fabricated `lastTx`/`lastSrc` edges. THIS TURN: skip `//` / `*` / `/*` lines, strip trailing `//` and quoted strings; `gatedBefore` requires `gate.lineNumber < sink`; incomplete wiring is left unwired. Extra dirty (not a named claim): `collectFungiCorpus` lstat/depth/file caps replaced recursive `statSync`. Unused `analyzeFlowAst` still fabricates a last-transform sink edge. |
| `packages-ts/galerina-devtools-provenance/dist/analyzer.js` | gitignored; rebuilt this turn; comment skip + `gatedBefore` + “Incomplete wiring is unknown coverage” present. |
| `packages-ts/galerina-devtools-provenance/tests/provenance-gate-order.test.mjs` | **??** untracked. THIS TURN: comment-gate / late-gate hostile + prior-gate still clears. |
| `packages-ts/galerina-devtools-provenance/tests/provenance.test.mjs` | unchanged vs HEAD. Existing lineage suite still pass. |
| `packages-ts/galerina-devtools-security/conformance-scan.mjs` | **M** HEAD blob `a0cebc315` → WT blob `1ef0fc72a`. HEAD `readText` returned raw file bytes; module ran `runAll` on import. THIS TURN: exported `sourcePresenceText` strips `/* */` and whole-line `//` before presence `includes`; `isDirectRun` gates `--self-test` and the enforcing scan. |
| `packages-ts/galerina-devtools-security/conformance-presence.test.mjs` | **??** untracked. THIS TURN: whole-line `// crypto.verify(null,` is stripped; live pin is kept. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-ext-tritsocket/src/prefilter.ts` | 6985 | `35f0a77c33a02978f076332cd8cd272989431c4dbd644cc43c39163768932706` |
| `packages-ts/galerina-ext-tritsocket/dist/prefilter.js` | 6584 | `d8c15acaa6476bcd93d0eaa096640421fd45b7c776c16e42614ae55bca4afb38` |
| `packages-ts/galerina-ext-tritsocket/dist/index.js` | 807 | `1227d162438f2114417cdabbdd255ec02562b3e8aae1d6e8b2be57279c99a9f1` |
| `packages-ts/galerina-ext-tritsocket/tests/prefilter-bounds.test.mjs` | 634 | `22b9709c96f37891f961baaa4e8ab27d04c3e2cbfc67eb706e63cb07be56c638` |
| `packages-ts/galerina-ext-tritsocket/tests/prefilter.test.mjs` | 4313 | `d27b4f8d3abc389393df2c8e96734c3de3a418b7236ac6b28341745c3c57e14c` |
| `packages-ts/galerina-devtools-provenance/src/analyzer.ts` | 34397 | `c47127e3aa5f67c0d64a1849283059ef0a40c604a178dd95cf3bb71e29f8c8c5` |
| `packages-ts/galerina-devtools-provenance/dist/analyzer.js` | 33846 | `5915afe7247e2a805db646f189f56785f10d2d8e2913bf35bcc2400d2ce4fdfe` |
| `packages-ts/galerina-devtools-provenance/dist/index.js` | 512 | `aa6ed5e225d016a77931e8aab0361c4888392bf0effac56f5f38ed68e4f4a873` |
| `packages-ts/galerina-devtools-provenance/tests/provenance-gate-order.test.mjs` | 1341 | `ae0e8fa08060fe0050c7435a4bed0883aabd1b19ceffb08b67fddb21668f3ec9` |
| `packages-ts/galerina-devtools-provenance/tests/provenance.test.mjs` | 16481 | `dc64a056c9c44e7b37f4a1ad5c46e0b761739c37eef60144851a9e66c015aa73` |
| `packages-ts/galerina-devtools-security/conformance-scan.mjs` | 27597 | `e13640c9722a4a55cca3f2929cf22a3f8c9f6fbaea448cd6da84897a02a3dc1b` |
| `packages-ts/galerina-devtools-security/conformance-presence.test.mjs` | 549 | `4eab3b067228d92309e6b200e6e1e3719654ef829a88a7054f9c9bce07e37eaa` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 69709 | `9b7ffa1706df80a84cdf52e619d0b304ce0dd0689a84cbc867d08867a7ccf3b2` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above. The three listed
claim files MATCH:

- `prefilter.ts` `35f0a77c33a02978f076332cd8cd272989431c4dbd644cc43c39163768932706`
- `analyzer.ts` `c47127e3aa5f67c0d64a1849283059ef0a40c604a178dd95cf3bb71e29f8c8c5`
- `conformance-scan.mjs` `e13640c9722a4a55cca3f2929cf22a3f8c9f6fbaea448cd6da84897a02a3dc1b`

Dist mtimes (UTC): tritsocket `prefilter.js` / `index.js`
`2026-09-23T14:40:24Z` (src `2026-09-23T14:38:18Z`); provenance `analyzer.js`
`2026-09-23T14:40:24Z` (src `2026-09-23T14:38:18Z`). Dist is newer than
this-turn src and contains the claimed bodies.

Inventory file sha256 `9b7ffa1706df80a84cdf52e619d0b304ce0dd0689a84cbc867d08867a7ccf3b2`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | pack requires array; packedLen admits lenTrits; prefilterBatch refuses n*stride > subjects.length | `Array.isArray` throw; `packedLen` → `admitLenTrits`; `n*stride > subjects.length` throw | prefilter-bounds **2/2**; prefilter.test **11/11** | `%TEMP%` `pack({length:8})` throws `/array/`; `packedLen(-1\|4097\|NaN)` throws `/lenTrits/`; `prefilterBatch(row,row,4,8)` throws `/batch subjects/` | `packedLen` admit was already at HEAD; `n*stride` product is still IEEE Number (capped by MAX_BATCH×packedLen(MAX_TRITS) inside SafeInteger); TypedArray subjects are not arrays and are refused |
| B | scanGateCalls ignores comment/string lines; gatedBindings only line `<` sink; no fabricated last-transform edge | skip `//`/`*`/`/*`; strip trailing `//` + quoted strings; `gatedBefore`; incomplete wiring left unwired | provenance-gate-order **3/3** (comment-gate and late-gate still ungated; prior-gate clears); provenance.test **20/20** | `%TEMP%` comment-gate / string-literal-gate / late-gate all `ungatedSinkReached===true`; unlinked `DB.insert({ name: other })` has no tx→sink edge | still regex not CFG; RD-1304 all-path remains; unused `analyzeFlowAst` still fabricates last-transform; `scanGateCalls` does not strip mid-line `/* */`; `scanSinkCalls` still matches raw lines |
| C | sourcePresenceText strips block/line comments before includes; isDirectRun so import does not scan | `sourcePresenceText` `/* */` + `^\s*//.*$`; `readText` uses it; `isDirectRun` gates CLI | conformance-presence **1/1**; `--self-test` **27/27** (allowed); full-repo scan **not** run | `%TEMP%` import printed no scan banner; line-comment and block-comment pins stripped; live pin kept | trailing `code // pin` and dead-string `"crypto.verify(null,"` still present (`includes` true); original finding title also named dead strings |

## Suites (fresh this review)

From worktree, `node --test`:

- `packages-ts/galerina-ext-tritsocket/tests/prefilter-bounds.test.mjs` +
  `tests/prefilter.test.mjs`: **13/13** pass, fail 0, skipped 0, duration
  ~150ms. Bounds **2/2**: non-array `{length:8}` and 4097-trit pack refuse;
  `prefilterBatch` n=8 on one packed row throws `/batch subjects/`. Existing
  **11/11**: packing density, missing/forbidden Deny, Maybe-not-Allow,
  reserved/undersize Deny, linear batch, ABI.
- `packages-ts/galerina-devtools-provenance/tests/provenance-gate-order.test.mjs`
  + `tests/provenance.test.mjs`: **23/23** pass, fail 0, duration ~861ms.
  Gate-order **3/3**: comment `// validate.input(rawName)` does not certify;
  gate after `DB.insert` does not certify; gate before sink still clears.
  Existing **20/20**: verifyPassword node kinds, gated/ungated synthetics,
  corpus graph, filters, text/JSON/PROV reports, riskFlows.
- `packages-ts/galerina-devtools-security/conformance-presence.test.mjs`:
  **1/1** pass, duration ~130ms. Whole-line comment pin stripped; live pin kept.
- `node packages-ts/galerina-devtools-security/conformance-scan.mjs --self-test`:
  **27/27** detector assertions, exit 0. Full-repo enforcing scan (no
  `--self-test`) was **not** run.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/tritbounds-provgate-conformance-probe.mjs`
imported worktree tritsocket dist, provenance dist, and
`conformance-scan.mjs`. CWD `<LOCAL_TEMP>`.
`PROBE_OK` 10/10 exit 0. Import of conformance-scan printed no
by-construction scan banner (`isDirectRun` false).

- (i) `pack({length:8})` throws `/array/`. `packedLen(-1)`, `packedLen(4097)`,
  `packedLen(NaN)` throw `/lenTrits/`. `prefilterBatch(row,row,4,8)` throws
  `/batch subjects/`; n=1 on one row returns length 1.
- (ii) comment-gate, string-literal `"validate.input(rawName)"`, and late-gate
  all yield `ungatedSinkReached===true`. Incomplete wiring
  (`validate.input(rawName)` then `DB.insert({ name: other })`) has transform
  and sink nodes but **no** fabricated tx→sink edge.
- (iii) `sourcePresenceText("// crypto.verify(null, …)")` and
  `sourcePresenceText("/* crypto.verify(null, …) */")` do not include the pin;
  live `crypto.verify(null,` is kept.

Residual observation script
`<LOCAL_TEMP>/tritbounds-provgate-conformance-residuals.mjs`
(same CWD, not counted in PROBE_OK): dead-string pin still present;
trailing `code // crypto.verify(null,` still present; mid-line
`/* validate.input(rawName) */` fixture stayed ungated on this tree
(compiler OR-escalation / regex leftover — not CFG).

## Residuals (author-flagged; independently observed)

- Provenance is still a line-regex scanner, not a CFG / all-path (RD-1304).
  `gatedBefore` is source order, not dominance. Unused `analyzeFlowAst`
  still wires `lastTransformId` when a sink has no binding link.
- `scanGateCalls` skips only start-of-line `//` / `*` / `/*` and then strips
  trailing `//` plus a single quoted span; mid-line block comments are not
  stripped. `scanSinkCalls` still scans raw lines.
- Conformance `sourcePresenceText` line-comment regex is `^\s*//.*$` only
  (trailing comments remain). Dead strings are not stripped; the scan-row
  title still names “comments or dead strings”.
- Tritsocket `packedLen` admit of `lenTrits` predates this turn (HEAD already
  called `admitLenTrits`). Batch bound is a byte-length check, not fd/identity.
- Extra dirty `collectFungiCorpus` in analyzer.ts is outside the named B
  claim and was not separately admitted.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 5 /
`PARTIAL_THIS_TREE` 115 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 5 remaining OPEN are low. Named three remain
OPEN (`csf_38215fae09550ce4426e5ce1`, `csf_5e50fd79deea0f1d7bfc1c84`,
`csf_635ee1a63cbbdf28942f7abc`). Other OPEN lows on this snapshot:
`csf_ea1e5710b3b1a7fc3df7e589`, `csf_0e7d6b428bc9ca9bc291ea3d`.
Reviewer did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. Pack refuses non-arrays; `packedLen` admits `lenTrits`;
`prefilterBatch` refuses oversize `n*stride`. Provenance ignores
comment/string gate lines, requires gate line `<` sink, and does not
fabricate a last-transform edge on the live `analyzeFile` path.
Conformance strips block/whole-line comments before presence includes and
does not scan on import. Residuals remain and keep the scan rows OPEN.
**INCOMPLETE_NON_AUTHORITATIVE**. Not production admission. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
