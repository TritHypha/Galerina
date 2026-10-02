# Independent audit — semantic reachable / report-link writes / PCI flow-span

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

- **A. `csf_b7c875ed001f66b8abedfc85`**: Semantic reachability. File
  `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts`.
  THIS TURN: `reachable` builds an adjacency list for the requested edge
  kind, then BFS with visit cap `graph.nodes.length + 1`. Tests
  `tests/semantic-reachable.test.mjs` (2). Dist rebuilt (author). Residual
  the author flags: no `JSON.parse` byte bound in this function (that
  lives in builders); `callers` still not indexed.

- **B. `csf_a0b09998cf446f5ab4abfa6b`**: Generated-output writes follow
  links. File `packages-ts/galerina-core/compiler/galerina.js`. ALREADY:
  `writeReportFiles` + `refuseBuildOutputLinks` refuse symlink/reparse
  ancestors and the leaf. Tests `ai-guide-path.test.mjs` **5/5**. THIS
  TURN did not rewrite that path. Residual the author flags:
  `writeFileSync` after refuse is still TOCTOU vs replace; no fd identity
  check after publication.

- **C. `csf_c840efd6f4fca9794bafb11d`**: PCI TLS/authority from unrelated
  flows. File `packages-ts/galerina-devtools-pci/src/pci-checker.ts`.
  THIS TURN: `getFlowSource` extracts the named flow span (signature
  through last top-level brace group, including `authority {` keyword
  before `{`); TLS and `authority.requires` fallbacks use that span.
  Tests `tests/pci.test.mjs` **14/14** including unrelated `https://` →
  PCI-003 and unrelated `authority.requires` → PCI-008. Residual the
  author flags: brace matching does not skip braces inside
  strings/comments.

This reviewer independently re-read production + tests + dist for the
three named bodies, hashed working-tree bytes, ran the named suites,
and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not** supplied in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **44 OPEN / 76
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 44 = 0 high / 0 medium /
44 low, `PARTIAL_THIS_TREE` 76, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 44 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
graph and PCI suites import gitignored `dist/` (`packages-ts/.gitignore`
line 5 `dist/`). Named AI-guide tests `require("./galerina.js")` (source,
not dist); CLI gated by `require.main === module` at line 5860. This
reviewer did not rebuild. Dist mtime for the graph and PCI bodies is
newer than matching src and carries the named adj-list / `getFlowSource`
span extract.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | **M** HEAD blob `4e9649920c` → WT blob `5d6b22506b`. HEAD `reachable` 144–161 rescanned `for (const edge of graph.edges)` on every BFS visit. THIS TURN: one-pass adj list filtered by `edge.kind !== edgeKind`, BFS `maxVisits = graph.nodes.length + 1`. Src has UTF-8 BOM (hashed). `graphFromJSON` still unbounded `JSON.parse`. `callers` still filters `graph.edges`. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | **??** untracked. THIS TURN: “follows one edge kind via an adjacency index”; “hostile: a dense unused-kind edge set does not explode visit work” (`usesType`×200 + one `calls` → `["x0"]`, `<200ms`). Imports `../dist/semantic/SemanticGraph.js`. |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | gitignored; rebuilt this turn; `reachable` 65–95 adj + `maxVisits`; barrel `dist/index.js` re-exports `reachable` |
| `packages-ts/galerina-core/compiler/galerina.js` | **M** HEAD blob `e8fecad285` → WT blob `6f1a813525` (+87 / −12). HEAD `writeReportFiles` 3105– leaf `lstatSync(file).isSymbolicLink()` only, ENOENT continues to `writeFileSync`. ALREADY on this dirty tree: `pathIsSymlink` 3105–3122 (readlink success → link), `refuseBuildOutputLinks` 3124–3138 walks leaf→ancestors, `writeReportFiles` 3140–3158 refuses then `mkdirSync(dirname)` then refuses again then `writeFileSync`. THIS TURN did not rewrite that path (mtime `2026-09-23T08:16:14.983Z`; this-turn graph/PCI src are `09:43`/`09:45`). Extra dirty vs HEAD, **not** the named write-link bullet: `stripQuotedStrings` / `benchmarkKindFromMainBody` / extra `module.exports`. |
| `packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` | **??** untracked. ALREADY 5 tests (`../` refuse; write under build dir; dangling leaf symlink; parent-dir `docs/` symlink; lstat ENOENT still refuses via readlink). Hash `610c0ded…8534b8` matches prior rereview receipt. `require("./galerina.js")`. |
| `packages-ts/galerina-devtools-pci/src/pci-checker.ts` | **M** HEAD blob `f4eabde5b9` → WT blob `bd0e84a244`. HEAD `getFlowSource` 252–256 `return rawSource`. HEAD PCI-003 already called `hasTlsDeclaration(flowSource)` but that span was the whole file; HEAD PCI-008 called `hasAuthorityRequires(flowNode, source)` (full file, not even `flowSource`). THIS TURN: `getFlowSource` 252–279 extracts signature through last top-level brace group (lookahead identifier then `{`, so `authority {` is kept); PCI-008 now passes `flowSource`. |
| `packages-ts/galerina-devtools-pci/tests/pci.test.mjs` | **M** HEAD blob `abc4d41a5a` → WT blob `3adb27e57d` (+49). THIS TURN: unrelated `https://` → `FUNGI-PCI-003`; unrelated `authority.requires` → `FUNGI-PCI-008`. Imports `../dist/index.js`. |
| `packages-ts/galerina-devtools-pci/dist/pci-checker.js` | gitignored; rebuilt this turn; `getFlowSource` 233–268; TLS 442 uses flow span; PCI-008 463 uses flow span |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | 6286 | `d1b00d5dede8d4d86956771fdf4c7095aaa2c9f7763eb65bc2b7fa13022fd38b` |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | 1297 | `14de0614ae523f0cdd748fcd72e3ab48ed977df050e90764b2ca8b71c3af6c40` |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | 4331 | `4fc84df32c5564117bd39e128084246dc07d4db99a972ae4bd713cc0297fdc18` |
| `packages-ts/galerina-devtools-graph-algorithms/dist/index.js` | 8222 | `700a1ae0986f177a4f5295a3fa376f32c65e1fbcc6de096b2bd495755f8c77c0` |
| `packages-ts/galerina-core/compiler/galerina.js` | 226804 | `9d93b899180e6b0b0ce5ae14647a861fe7fcfb4b69cca22d3abab1488ae5c030` |
| `packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` | 4546 | `610c0ded0ced3d7071363dc8656a41efc244ccde66c6fa9f33977f40468534b8` |
| `packages-ts/galerina-devtools-pci/src/pci-checker.ts` | 28360 | `0ac4c370902305a275aecb612ab5477b3c03c8574c1b987be73d33a3e13ff508` |
| `packages-ts/galerina-devtools-pci/tests/pci.test.mjs` | 16097 | `95d2ffdd3b3823a43cba073b2f5cc27f074f090b5a7484a6b360bdc993bcb339` |
| `packages-ts/galerina-devtools-pci/dist/pci-checker.js` | 27477 | `6001e1606e83a5ac28d241299f7fc426b50178f6ba3387bb2a7d55f84179de2f` |
| `packages-ts/galerina-devtools-pci/dist/index.js` | 754 | `9cee8dac6aefce1c14defa40696a60190a7f58c87f409fa0a199b2111a0471d5` |

Independent MATCH (Get-FileHash ↔ crypto): SemanticGraph src
`d1b00d5d…2fd38b`; reachable tests `14de0614…af6c40`; SemanticGraph dist
`4fc84df3…7fdc18`; galerina.js `9d93b899…ae5c030`; ai-guide tests
`610c0ded…8534b8`; pci-checker src `0ac4c370…13ff508`; pci tests
`95d2ffdd…3bcb339`; pci-checker dist `6001e160…179de2f`; inventory
`fe79df4c…db467f7`.

Dist mtimes (UTC): `SemanticGraph.js` `2026-09-23T09:44:18.169Z` (src
`2026-09-23T09:43:11.948Z` / tests `2026-09-23T09:44:01.651Z`); graph
`dist/index.js` `2026-09-23T09:44:18.206Z`; `pci-checker.js`
`2026-09-23T09:45:21.705Z` (src `2026-09-23T09:45:15.714Z` / tests
`2026-09-23T09:44:01.651Z`); pci `dist/index.js`
`2026-09-23T09:45:21.725Z`. Named graph and PCI dist are newer than
their src. `galerina.js` `2026-09-23T08:16:14.983Z` is older than
this-turn graph/PCI src; AI-guide tests `2026-09-23T01:38:13.846Z`.
Graph/PCI dist were rebuilt this turn; `writeReportFiles` was not.
AI-guide has no dist; tests import src.

Inventory file sha256 `fe79df4ce36481a17f470e3152210a72a957e26db0c75bc5766f6aac3db467f7`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_b7c875ed001f66b8abedfc85` (`occ_45bc1e1b58af9e7363967fef`,
  path `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts`,
  scan-era `start_line` 144, title “Semantic reachability rescans every
  edge for each visited node”)
- `csf_a0b09998cf446f5ab4abfa6b` (`occ_4c3d480a850c020af5906ac5`,
  path `packages-ts/galerina-core/compiler/galerina.js`,
  scan-era `start_line` 3069, title “Generated-output writes follow
  preexisting symlinks or reparse points”)
- `csf_c840efd6f4fca9794bafb11d` (`occ_4fa7cbbd497035e31d87390f`,
  path `packages-ts/galerina-devtools-pci/src/pci-checker.ts`,
  scan-era `start_line` 236, title “PCI audit accepts TLS and authority
  evidence from unrelated flows”)

Named graph/PCI tests import gitignored dist, not src. Named AI-guide
tests import source.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. `reachable` builds adj list for requested edge kind | src 140–146; dist 67–76 `if (edge.kind !== edgeKind) continue` then `adj.set`/`push` |
| A. BFS visit cap `nodes.length+1` | src 150–152 `maxVisits = graph.nodes.length + 1`; dist 80–81 `visited.size < maxVisits` |
| A. HEAD rescanned every edge per visit | HEAD 144–161 `while (queue.length > 0)` / `for (const edge of graph.edges)` |
| A. THIS TURN tests one-kind index + dense unused-kind | WT tests 11–20 `["b","c"]`; 23–35 `["x0"]` 0.4663ms |
| A. Dist rebuilt | dist mtime 09:44:18Z > src 09:43:11Z; suite imported that dist and passed |
| A. Residual: no `JSON.parse` byte bound in this function (lives in builders) | `reachable` itself does not parse; same-file `graphFromJSON` src 203–204 / dist 121 unbounded `JSON.parse(json)` |
| A. Residual: `callers` still not indexed | src 177–180 / dist 101–104 still `graph.edges.filter` |
| B. ALREADY `refuseBuildOutputLinks` walks leaf + ancestors | src 3124–3138 `pathIsSymlink(cursor)` then `cursor = parent` until root |
| B. ALREADY refuse before and after `mkdirSync(dirname)` | src 3151–3154 |
| B. HEAD was leaf `lstat` only | HEAD `writeReportFiles` `lstatSync(file).isSymbolicLink()`; ENOENT → `writeFileSync` |
| B. THIS TURN did not rewrite that path | galerina.js mtime 08:16:14Z; extra dirty is `benchmarkKindFromMainBody` / `stripQuotedStrings` / extra exports, not `writeReportFiles` |
| B. Tests **5/5** | named suite 5 pass 0 skip; dangling leaf 2.3352ms; parent-dir 2.6983ms; lstat ENOENT 2.3732ms |
| B. Residual: `writeFileSync` after refuse is TOCTOU; no fd identity | src 3153–3154; extra probe `writeFileAfterRefuse:true`, `noFdIdentity:true` |
| C. `getFlowSource` extracts named flow span through last top-level brace group | src 252–279; dist 233–268; lookahead identifier then `{` keeps `authority {` |
| C. Empty span is fail-closed | src 253 / 256 / 277 `return ""` |
| C. TLS fallback uses that span | src 503–506 `hasTlsDeclaration(flowSource)` |
| C. `authority.requires` fallback uses that span | src 572 `hasAuthorityRequires(flowNode, flowSource)`; HEAD passed full `source` |
| C. THIS TURN tests unrelated `https://` → PCI-003 | WT tests 298–319 0.7138ms |
| C. THIS TURN tests unrelated `authority.requires` → PCI-008 | WT tests 322–343 0.6199ms |
| C. Dist rebuilt | dist mtime 09:45:21Z > src 09:45:15Z; suite imported dist barrel and passed |
| C. Residual: brace matching does not skip strings/comments | src 260–276 / dist 243–263 only test `c === "{"` / `c === "}"` |
| Reachable 2 named tests | `node --test tests/semantic-reachable.test.mjs` → 2/2 |
| AI-guide 5 named tests | `node --test ai-guide-path.test.mjs` → 5/5 |
| PCI 14 named tests | `node --test tests/pci.test.mjs` → 14/14 |
| Dist not stale for named rebuilt bodies | hashes + same order in src/dist; graph/PCI dist newer than src; named suites imported those files and passed; extra probe imported the same dist files + galerina.js src |
| Inventory 44/76/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` SemanticGraph src; `??`
   semantic-reachable tests; `M` galerina.js; `??` ai-guide-path tests;
   `M` pci-checker src; `M` pci tests; dist gitignored (not listed).

2. `node --test tests/semantic-reachable.test.mjs` in
   `packages-ts/galerina-devtools-graph-algorithms`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 143.3976`.
   One-kind index 3.4229ms; dense unused-kind 0.4663ms; both green.

3. `node --test ai-guide-path.test.mjs` in
   `packages-ts/galerina-core/compiler`
   → **5/5 pass**, 0 fail, 0 skip, `duration_ms 153.9995`.
   Dangling leaf / parent-dir / lstat ENOENT all green (symlinks not
   skipped on this host).

4. `node --test tests/pci.test.mjs` in
   `packages-ts/galerina-devtools-pci`
   → **14/14 pass**, 0 fail, 0 skip, `duration_ms 373.4834`.
   Unrelated `https://` PCI-003 0.7138ms; unrelated
   `authority.requires` PCI-008 0.6199ms; both green.

Independent extra (`%TEMP%\zt-reachable-reportlinks-pci-probe\probe.mjs`;
cwd `%TEMP%\zt-reachable-reportlinks-pci-probe`; `file://` import of
working-tree graph/PCI dist and `require` of galerina.js src; no
production write):

| probe | result |
|---|---|
| unused-kind dense graph `reachable(..., "calls")` | **`reachableHits:["x0"]`**, `reachableOnlyCalls:true`; dist adj+cap present |
| two-flow `https://` in helper, payment has `network.outbound` | **`pci003:true`**, `pciCodes:["FUNGI-PCI-003"]` |
| `writeReportFiles` refuse is source-shape | **`refuseFnPresent:true`**, `writeReportCallsRefuse:2`, `wrToStringCallsRefuse:true`, `refuseWalksAncestors:true`; residual `writeFileAfterRefuse:true`, `noFdIdentity:true` |

## Challenge 1 — does `reachable` still rescan every edge for each visited node?

**No on this dirty tree for `reachable`. CONFIRMED closed for the named
adj-list + visit-cap bullet.** HEAD looped `graph.edges` on every BFS
visit. THIS TURN builds an adjacency list for the requested kind once,
then BFS with `maxVisits = graph.nodes.length + 1`. Extra probe: 200
`usesType` edges plus one `calls` returns only `["x0"]`; dist function
text has adj + cap. Named suite 2/2 green. Named tests assert
result/timing (HEAD would also have returned `["x0"]` for n=200); the
HEAD-delta is the adj-list + cap, independently present in WT src/dist.
Residual: `graphFromJSON` still unbounded `JSON.parse`; `callers` still
filters `graph.edges` with no index. Src UTF-8 BOM is encoding noise,
not the named rescan.

Scan-era object `0f6063dd…:packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts`
is **not** recategorized. Inventory still lists the row OPEN.
Scan-era `start_line` 144 is the HEAD per-visit edge scan.

## Challenge 2 — do generated-output writes still follow preexisting symlinks or reparse points?

**No on this dirty tree for `writeReportFiles`. CONFIRMED closed for the
named ancestor+leaf link refuse. THIS TURN did not rewrite that path.**
HEAD refused only a leaf `lstat` symlink and swallowed leaf ENOENT into
`writeFileSync` (dangling link follow). The dirty tree already walks
leaf and ancestors via `pathIsSymlink` (readlink success) /
`refuseBuildOutputLinks` before and after `mkdirSync(dirname)`. Named
suite 5/5 including dangling leaf, parent-dir `docs/` symlink, and
lstat ENOENT hook — red-capable against HEAD. Extra probe: source-shape
`refuseBuildOutputLinks` ×2 then `writeFileSync`; `Function#toString`
of the exported function names that helper. Residual: TOCTOU between
last refuse and `writeFileSync`; no fd identity check. Extra dirty vs
HEAD on this file (`benchmarkKindFromMainBody`) is outside this bullet.

Scan-era object `0f6063dd…:packages-ts/galerina-core/compiler/galerina.js`
is **not** recategorized.

## Challenge 3 — can PCI TLS / `authority.requires` evidence still come from an unrelated flow? Is dist stale? Is this 124-scan closure?

**No unrelated-flow TLS/`requires` on this dirty tree for the named
fallbacks. Dist not stale for the named PCI body. Not 124-scan
closure.** HEAD `getFlowSource` returned the whole file; HEAD PCI-008
passed `source` even when `flowSource` existed. THIS TURN extracts the
named flow span through the last top-level brace group (keeping
`authority {`) and points both TLS and `authority.requires` fallbacks
at that span. Extra probe: helper `https://` + payment
`network.outbound` → `FUNGI-PCI-003` only. Named PCI-003 / PCI-008
tests are red-capable against HEAD. Dist `getFlowSource` matches src
and is newer than src; named suite imported that barrel and passed.
CSF rows remain `OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **76** `PARTIAL_THIS_TREE`, **44**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 44 low). This review does
not recategorize the rows. Residual: brace matching does not skip
braces inside strings/comments, so a hostile string/`}` can widen or
truncate the span.

## Residuals (not findings against the three named bullets)

- Reachable: `graphFromJSON` still `JSON.parse(json)` with no byte
  bound. Cap/index work is in `reachable`, not that deserializer.
  `callers` still `graph.edges.filter` (no adj index). Src file has a
  UTF-8 BOM; dist does not.
- Report writes: last `refuseBuildOutputLinks` then `writeFileSync`
  remains TOCTOU vs a replace of the leaf with a link; no `open`+`fstat`
  identity check after publication. Extra probe
  `writeFileAfterRefuse:true`, `noFdIdentity:true`.
- PCI: `getFlowSource` brace walk does not skip `{`/`}` inside strings
  or comments. `hasAuthorityRequires` still uses
  `/authority\s*\{([^}]*)\}/s` on the extracted span (first non-nested
  `authority {` only).
- Extra dirty vs HEAD on `galerina.js` (`stripQuotedStrings` /
  `benchmarkKindFromMainBody` / extra exports) is outside these three
  bullets.
- Named graph/PCI suites import gitignored dist, not src. Dist was
  confirmed non-stale for those named bodies; this receipt did not
  rebuild. AI-guide tests import src.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 44 OPEN / 76 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era per-visit edge rescan, generated-output
symlink follow, or PCI TLS/authority evidence from unrelated flows;
this dirty tree has the named adj-list + visit cap (this-turn src/dist
+ tests), already-present ancestor+leaf `refuseBuildOutputLinks` (not
rewritten this turn; 5/5 still green), and flow-span `getFlowSource`
for TLS/`requires` fallbacks, with executed red-capable evidence on
dist/src. Residuals above remain outside those bullets. Evidence is
sufficient for those bullets; insufficient for scan recategorization
and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-reachable-reportlinks-pci-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** semantic-reachable **2/2**; ai-guide-path **5/5**; pci **14/14**
- **Extra-probe:** `%TEMP%\zt-reachable-reportlinks-pci-probe` — unused-kind dense `reachable(calls)=["x0"]`; two-flow `https://` `FUNGI-PCI-003`; `writeReportFiles` source-shape `refuseBuildOutputLinks` ×2 then `writeFileSync`
- **Residuals:** `graphFromJSON` unbounded `JSON.parse`; `callers` unindexed; write TOCTOU vs replace / no fd identity; PCI brace walk ignores strings/comments
- **git status (named):** `M` SemanticGraph src; `??` semantic-reachable tests; `M` galerina.js; `??` ai-guide-path tests; `M` pci-checker src; `M` pci tests; extra dirty elsewhere on this worktree; `??` this receipt; dist gitignored. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
