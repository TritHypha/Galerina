# Independent audit — graphFromJSON SemanticGraph JSON bounds

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This receipt
is not the author’s packet and is not GPT Astra. Passing tests here are
**not** production admission. Finding inventory was **not** promoted.
`csf_b7c875ed001f66b8abedfc85` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `graphFromJSON` now refuses oversize UTF-8 (1 MiB), nesting above depth
  32, node count above 16384, and edge/array count above 65536, before
  returning a `SemanticGraph`.
- Hostile: oversize string refused before parse; node count cap; depth
  bomb.
- Positive: small `graphToJSON` / `graphFromJSON` round-trip.
- Tests `semantic-graph-json.test.mjs` **4/4** plus `semantic-reachable`
  **2/2** (**6/6**).
- Residual: callers still unindexed; no duplicate-key scan; node fields
  not fully schema-validated.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/semantic/SemanticGraph.js`, hashed working-tree bytes,
re-ran `npx tsc -p tsconfig.json` then the named suites, and executed an
extra probe from `%TEMP%` (not by trusting the named tests alone).
Independent `crypto.createHash('sha256')` and `Get-FileHash` **MATCH**
each other on every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | **M** HEAD blob `734c6f1578` → WT blob `73da30bd28`. HEAD `graphFromJSON` was `JSON.parse(json) as SemanticGraph` then `schemaVersion !== "1.0"` throw. THIS TURN: `MAX_SEMANTIC_GRAPH_JSON_BYTES` `1_048_576`, depth 32, walk-nodes 100_000, nodes 16_384, edges 65_536; UTF-8 byte length; `walkBound`; `admitSemanticGraph`; byte check before `JSON.parse`. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-graph-json.test.mjs` | **??** untracked. THIS TURN: positive small round-trip; hostile oversize before parse; hostile node count; hostile depth bomb. Imports `../dist/semantic/SemanticGraph.js`. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | **clean** vs this HEAD (tracked). Adj-index + unused-kind dense-edge hostile. Not rewritten this slice. |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | gitignored; rebuilt this review (`tsc`); `graphFromJSON` 187–201 matches src byte-bound-then-parse; caps 120–124. |

Prior independent receipt
`docs/independent-audits/2026-09-23-reachable-reportlinks-pci-hold.md`
recorded that `graphFromJSON` was still unbounded `JSON.parse` after the
`reachable` adjacency-index slice, and that `callers` was still not
indexed. The JSON bounds residual of that receipt is closed on this
dirty tree for the named caps. `callers` remains unindexed.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | 8882 | `1fe4643995b483bc20eacfd69effc7ad48491a5285652a87eefd2dbac59e64f8` | 2026-09-23T17:44:12.468Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-graph-json.test.mjs` | 1850 | `63274c0e6328e35cf1f54934e716c851f5de775d6494c2a8732ade57d939899b` | 2026-09-23T17:43:20.501Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | 1297 | `14de0614ae523f0cdd748fcd72e3ab48ed977df050e90764b2ca8b71c3af6c40` | 2026-09-23T09:44:01.650Z |
| `packages-ts/galerina-devtools-graph-algorithms/src/index.ts` | 2734 | `d3fc6d7d93a35a21858bd853a762992ecda2f97a3287387f790cd7185642c097` | 2026-09-08T20:31:56.568Z |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | 7156 | `ee64218f6afab6001f13080def65f6d51d21078e0f45f2b9cf81762679a1da6b` | 2026-09-23T17:45:38.718Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtime is newer than matching src after this
review’s `tsc`. Named suites import dist (`packages-ts/.gitignore`
`dist/`). Barrel `src/index.ts` re-exports `graphFromJSON` / `graphToJSON`
and is clean vs this HEAD.

Inventory `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` already
records `csf_b7c875ed001f66b8abedfc85` as `PARTIAL_THIS_TREE` (low;
title “Semantic reachability rescans every edge for each visited node”;
path `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts`).
Independent recount of that file: **0 OPEN / 120 PARTIAL_THIS_TREE /
4 PATCHED_AUDIT_PENDING** (`n` 124). This review does **not**
recategorize that row.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| oversize UTF-8 1 MiB refuse before parse | `json.length` or UTF-8 bytes `> 1_048_576` throws host byte bound; `JSON.parse` not reached | src 203, 209–220, 267–273; dist 120, 125–141, 187–193 | hostile test **pass** (`"x".repeat(MAX+1)` /host byte bound/) | TEMP: ASCII `MAX+1` `parseCalls:0`; `é`×524289 (`jsLength 524289`, UTF-8 `1048578`) `parseCalls:0`; exact `1048576` admits (`exactParse:1`); `1048577` refuses (`overParse:0`) | named test is ASCII, not multi-byte; extra probe closed UTF-8 |
| node count cap 16384 | `nodes.length > 16384` refused | src 206, 258–260; dist 123, 179–181 | hostile test **pass** 22.0508ms | TEMP: 16385 nodes, JSON 731552 `< 1 MiB`, message `node count exceeds the host bound` | — |
| depth bomb 32 | nesting `depth > 32` refused | src 204, 222–225; dist 121, 142–145 | hostile test **pass** (`MAX+2` nested arrays /host depth bound/) | TEMP same message | depth walk is **after** `JSON.parse`; 34-deep is within V8 parse stack |
| edge/array count 65536 | any JSON array or `edges.length > 65536` refused | src 207, 232–234, 261–263; dist 124, 152–155, 182–184 | **not** in named 4 tests | TEMP: 65537 zero `edges`, JSON 131136 `< 1 MiB`, `array exceeds the host bound` (`walkBound` fires before the edges-length message) | named suite omits this bullet; extra probe closed refuse |
| positive small round-trip | `graphToJSON` then `graphFromJSON` preserves schema/nodes/edges/id | src 199–201, 267–281; tests 14–24 | **pass** 2.6082ms | TEMP `schema:1.0` `nodes:1` `edges:1` `id:a` | `graphToJSON` itself is still unbounded `JSON.stringify` |
| focused tests | 4/4 + 2/2 = 6/6 | named commands below | **6/6** 0 fail 0 skip `duration_ms 153.8842` | TEMP is extra, not a count | suites import dist, not src |
| callers unindexed residual | `callers()` still filters `graph.edges` | src 172–181 | **not** in named json tests; reachable suite does not cover `callers` | TEMP: 5000 unused-kind edges + one `calls`; `callers(g,"a")` still returns `["a"]` by scanning all edges | **CONFIRMED residual** |
| no duplicate-key scan residual | `JSON.parse` last-wins; no key census | src 275–279 `JSON.parse` then cast | **not** in named tests | TEMP: `schemaVersion` `9.9` then `1.0` **admitted** (`threw:false`) | **CONFIRMED residual** |
| node fields not schema-validated residual | `admitSemanticGraph` checks arrays/counts only; `return rec as SemanticGraph` | src 243–265 | **not** in named tests | TEMP: `nodes:[{id:1,kind:"nope"}]` and `edges:[{from:1,to:null,kind:"not-an-edge"}]` **admitted** | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   **M**; json test **??**; reachable test clean. `Galerina.worktrees` is
   not this tree.

2. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-devtools-graph-algorithms` → **exit 0**.

3. `node --test tests/semantic-reachable.test.mjs tests/semantic-graph-json.test.mjs`
   in `packages-ts/galerina-devtools-graph-algorithms`
   → **6/6 pass**, 0 fail, 0 skip, `duration_ms 153.8842`.
   Breakdown: semantic-graph-json **4/4**, semantic-reachable **2/2**.

Independent extra (`%TEMP%\zt-semantic-graph-json-probe\probe.mjs` and
`exact.mjs`; cwd not the worktree; `file://` import of working-tree
`dist/semantic/SemanticGraph.js`; no production write):

| probe | result |
|---|---|
| small builder round-trip | `schema:1.0` `nodes:1` `edges:1` `id:a` |
| ASCII oversize `MAX+1` | byte bound; `JSON.parse` calls **0** |
| UTF-8 oversize `é`×524289 (1048578 bytes, JS length 524289) | byte bound; `JSON.parse` calls **0** |
| exact 1048576-byte valid object | **admitted** `schemaVersion 1.0`; parse calls **1** |
| 1048577-byte same shape | byte bound; parse calls **0** |
| 16385 nodes | node-count bound (JSON 731552 < 1 MiB) |
| 65537 compact `edges` | array bound (JSON 131136 < 1 MiB) |
| depth `MAX+2` nested arrays | host depth bound |
| duplicate `schemaVersion` | **admitted** last-wins `1.0` |
| junk node/edge fields | **admitted** |
| `callers` vs 5000 unused-kind edges | still returns `["a"]` by scanning `graph.edges` |
| non-string / JSON array / schema `2.0` | string / object / unsupported-version refuses |

## Challenge 1 — does `graphFromJSON` still unbounded-parse then return?

**No on this dirty tree for the named caps. CONFIRMED closed for byte /
node / depth / array-or-edge refuse.** HEAD parsed first and only
checked `schemaVersion`. WT refuses `MAX+1` bytes (ASCII and 2-byte UTF-8)
with `JSON.parse` call count 0. Node count 16385 and depth `MAX+2` throw
the named host-bound messages. Extra probe shows compact 65537-length
`edges` refused by the array bound. Small round-trip still restores
`schemaVersion 1.0` with one node and one edge.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** `callers()`
still linearly filters `graph.edges`. `JSON.parse` still last-wins
duplicate keys with no census. `admitSemanticGraph` still casts the
record after array/count checks; node `id`/`kind`/`name` and edge
`from`/`to`/`kind` are not schema-validated. Named tests do not cover
those residuals; extra probe does. Dirty HEAD, unsigned TypeScript,
tests load gitignored `dist/`. Inventory was not promoted. Independent
production admission remains **HOLD**. Not 124-scan closure. Not Astra.
Not clean-HEAD evidence.

## Residuals (not findings against the named JSON-bound claim)

- **`callers()` still unindexed.** Src 172–181 filters every edge.
  Reachable uses an adjacency list; `callers` does not. Same residual
  named in the prior reachable receipt.
- **No duplicate-key scan.** `{"schemaVersion":"9.9","schemaVersion":"1.0",...}`
  is admitted. Last key wins.
- **Node/edge fields not fully schema-validated.** Non-string `id`,
  unknown `kind`, `to: null`, extra keys, and extra root fields (the
  depth-test `bomb` key) are not rejected when counts/depth stay in
  bound.
- Depth/array/count walks run **after** `JSON.parse`. A parse-stack
  depth bomb larger than V8’s parser budget would surface as “not
  parseable” rather than the host depth message. The named 34-deep
  case does hit `walkBound`.
- `graphToJSON` remains unbounded `JSON.stringify`.
- `packages-ts/galerina-devtools-project-graph/src/reporting/serializer.ts`
  exports a **different** `graphFromJSON` (`fungi.graph.v1`); not this
  admission. Compiler `semantic-graph.test.mjs` imports this package’s
  `graphFromJSON` for a positive round-trip; that suite was not in the
  named re-run.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_b7c875ed001f66b8abedfc85`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named `graphFromJSON` bound claim.
Evidence is sufficient that oversize UTF-8 is refused before parse, that
node count above 16384 and nesting above depth 32 are refused, that
edge/array count above 65536 is refused (extra probe; named tests omit
it), and that a small round-trip still works. Evidence is insufficient
for PATCHED promotion (callers unindexed; no duplicate-key scan; node
fields not fully schema-validated) and for production admission.

**PASS scoped.** Hashes **MATCH**. Tests **4/4 + 2/2 = 6/6**.
Finding stays **PARTIAL_THIS_TREE**. Residual: callers unindexed; no
duplicate-key scan; node fields not fully schema-validated. Not
production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
