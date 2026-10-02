# Independent audit — callers() reverse-adjacency index

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

- `callers()` now builds a reverse adjacency index of `kind === "calls"`
  (`to -> from[]`) and returns unique caller nodes capped at
  `graph.nodes.length`.
- Hostile: 400 `usesType` edges into the target are not callers; only
  the `calls` edge is.
- Positive: `a` and `c` calling `b` returns `[a, c]`.
- Tests `semantic-callers.test.mjs` **2/2** plus `semantic-reachable`
  **2/2** and `semantic-graph-json` **4/4** (**8/8**).
- Residual: index is rebuilt per call, not cached on the graph;
  `effectsOf` still filters all edges.

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
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | **M** HEAD blob `734c6f1578` → WT blob `66ecaa5b46`. HEAD `callers()` was `graph.edges.filter(to===nodeId && kind==="calls")` then `nodeMap.get`. THIS TURN: reverse `incoming` Map (`to -> from[]`) for `kind === "calls"` only; unique `seen`; `maxResults = graph.nodes.length`. Same dirty file still carries the prior `graphFromJSON` bound slice (not re-claimed here). |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-callers.test.mjs` | **??** untracked. THIS TURN: positive `a`/`c` → `b` returns `["a","c"]`; hostile 400 `usesType` + one `calls` returns `["only"]` under 200 ms. Imports `../dist/semantic/SemanticGraph.js`. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | **clean** vs this HEAD (tracked). Adj-index + unused-kind dense-edge hostile. Not rewritten this slice. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-graph-json.test.mjs` | **??** untracked from the prior JSON-bound slice. Not rewritten for callers. |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | gitignored; rebuilt this review (`tsc`); `callers` 99–125 matches src reverse index; `effectsOf` 129–133 still `.filter` on `graph.edges`. |

Prior independent receipt
`docs/independent-audits/2026-09-23-semantic-graph-json-hold.md`
recorded that `callers()` still linearly filtered `graph.edges` after
the JSON-bound slice. That unindexed-`callers` residual is closed on
this dirty tree for the named reverse-adjacency claim. The index is
still rebuilt on every `callers()` call. `effectsOf` is still a full
edge filter.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | 9359 | `f34c579e88af780d6358b39fdb1f4fb67cf8d2bc103040a81eeb4949438f14fe` | 2026-09-23T17:59:23.307Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-callers.test.mjs` | 1320 | `1293d83fd74a6b0999800497815db48a9969551ae38799c1890aef380e19e386` | 2026-09-23T17:59:23.307Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | 1297 | `14de0614ae523f0cdd748fcd72e3ab48ed977df050e90764b2ca8b71c3af6c40` | 2026-09-23T09:44:01.651Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-graph-json.test.mjs` | 1850 | `63274c0e6328e35cf1f54934e716c851f5de775d6494c2a8732ade57d939899b` | 2026-09-23T17:43:20.501Z |
| `packages-ts/galerina-devtools-graph-algorithms/src/index.ts` | 2734 | `d3fc6d7d93a35a21858bd853a762992ecda2f97a3287387f790cd7185642c097` | 2026-09-08T20:31:56.569Z |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | 7708 | `82af69415807117619d1cbdbd9879dd34b68145c5d10b1d17f395d38deab7c67` | 2026-09-23T18:00:51.903Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtime is newer than matching src after this
review’s `tsc`. Named suites import dist (`packages-ts/.gitignore`
`dist/`). Barrel `src/index.ts` re-exports `callers` / `reachable` /
`effectsOf` and is clean vs this HEAD.

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
| reverse `calls` index | build `to -> from[]` for `kind === "calls"` only | src 172–195; dist 99–125 | hostile + positive **pass** | TEMP: `kindCallsOnly:true` `scansAllEdges:true` | index still walks every edge to skip non-`calls` |
| unique callers | duplicate `from` ids returned once | src 185–189 `seen` | named positive has distinct `a`,`c` | TEMP: 10+10 duplicate `calls` → `["a","c"]`; two identical `a→b` `calls` → `["a"]` | named suite does not assert duplicate-edge uniqueness; extra probe closed it |
| cap at `graph.nodes.length` | `maxResults = graph.nodes.length`; break | src 186, 192; dist 113, 121–122 | **not** in named 2 tests | TEMP: empty `nodes` + one `calls` edge → `[]` | live unique callers cannot exceed unique nodeMap keys; cap is defensive |
| hostile 400 `usesType` | unused-kind inbound edges are not callers | tests 23–36 | **pass** 0.5204ms | TEMP: `ids:["only"]` `ms:0` `under200:true` | index build still O(E) |
| positive `a`,`c` → `b` | only `calls` into `b` | tests 11–21 | **pass** 3.2132ms | TEMP `positive:["a","c"]` | — |
| focused tests | 2/2 + 2/2 + 4/4 = 8/8 | named commands below | **8/8** 0 fail 0 skip `duration_ms 167.4522` | TEMP is extra, not a count | suites import dist, not src |
| per-call rebuild residual | index not cached on the graph | src 177–183 new `Map` each call | **not** in named tests | TEMP: `rebuildsMapEachCall:true` `noCacheOnGraph:true` `noGraphCacheField:true` | **CONFIRMED residual** |
| `effectsOf` residual | still filters all edges | src 200–207; dist 129–133 | **not** in named callers tests | TEMP: 3001 edges, `filtersAllEdges:true`, result `["io"]` | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   **M**; callers test **??**; json test **??**; reachable test clean.
   `Galerina.worktrees` is not this tree.

2. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-devtools-graph-algorithms` → **exit 0**.

3. `node --test tests/semantic-reachable.test.mjs tests/semantic-graph-json.test.mjs tests/semantic-callers.test.mjs`
   in `packages-ts/galerina-devtools-graph-algorithms`
   → **8/8 pass**, 0 fail, 0 skip, `duration_ms 167.4522`.
   Breakdown: semantic-callers **2/2**, semantic-reachable **2/2**,
   semantic-graph-json **4/4**.

Independent extra (`%TEMP%\zt-semantic-callers-index-probe\probe.mjs` and
`probe2.mjs`; cwd not the worktree; `file://` import of working-tree
`dist/semantic/SemanticGraph.js`; no production write):

| probe | result |
|---|---|
| positive `a`/`c` call `b` | `["a","c"]` |
| 400 `usesType` + one `calls` | `["only"]`, `ms:0` |
| duplicate `calls` edges `a→b` twice | unique `["a"]` |
| 10+10 duplicate `calls` from `a` and `c` | unique `["a","c"]` |
| empty `nodes` + one `calls` | `[]` (cap `maxResults=0`) |
| missing `from` node id | `[]` |
| `callers` source | rebuilds `incoming` Map each call; scans all edges; no WeakMap / graph cache field |
| `effectsOf` 3001 edges | still `.filter` on `graph.edges`; result `["io"]` |

## Challenge 1 — does `callers()` still linearly filter then map?

**No on this dirty tree for the named reverse-adjacency claim. CONFIRMED
closed for `kind==="calls"` indexing, uniqueness, and unused-kind
exclusion.** HEAD filtered every edge for `to === nodeId && kind ===
"calls"`. WT builds `incoming: Map<to, from[]>` for `calls` only, then
looks up `nodeId`, dedupes with `seen`, and stops at
`graph.nodes.length`. Named hostile 400 `usesType` inbound edges are
not callers. Positive `a` and `c` calling `b` returns `[a,c]`. Extra
probe: duplicate `calls` edges collapse; a `usesType` sibling is ignored.

The index is still **constructed from a full edge walk on every call**.
That is the named residual, not a contradiction of the index itself.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** The reverse
index is rebuilt per `callers()` call and is not stored on the graph.
`effectsOf` still `.filter`s `graph.edges`. Named tests do not cover
those residuals; extra probe does. Dirty HEAD, unsigned TypeScript,
tests load gitignored `dist/`. Inventory was not promoted. Independent
production admission remains **HOLD**. Not 124-scan closure. Not Astra.
Not clean-HEAD evidence.

## Residuals (not findings against the named callers-index claim)

- **Index rebuilt per call, not cached on the graph.** Src 177–183
  allocates a new `incoming` Map and walks `graph.edges` every time.
  TEMP: `rebuildsMapEachCall:true`, `noGraphCacheField:true`. Repeated
  `callers(g, id)` is correct but still O(E) per call.
- **`effectsOf` still filters all edges.** Src 200–207 / dist 129–133
  `graph.edges.filter(from===flowId && kind==="declaresEffect")`. TEMP
  3001-edge graph still returns `["io"]` via that filter.
- `nodes.length` cap is present; named tests never truncate. Unique
  resolved callers cannot exceed unique `nodeMap` keys on a well-formed
  graph. Empty-`nodes` extra probe returns `[]`.
- Prior JSON-bound residuals remain: no duplicate-key census; node/edge
  fields not fully schema-validated; `graphToJSON` unbounded
  `JSON.stringify`. Out of this callers-index claim.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_b7c875ed001f66b8abedfc85`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named `callers()` reverse-index claim.
Evidence is sufficient that `callers()` indexes `kind==="calls"` as
`to -> from[]`, that unique callers are returned, that 400 inbound
`usesType` edges are not callers, and that `a` and `c` calling `b`
returns `[a,c]`. Evidence is insufficient for PATCHED promotion
(per-call rebuild; `effectsOf` still filters all edges) and for
production admission.

**PASS scoped.** Hashes **MATCH**. Tests **2/2 + 2/2 + 4/4 = 8/8**.
Finding stays **PARTIAL_THIS_TREE**. Residual: index rebuilt per call
not cached; `effectsOf` still filters all edges. Not production
admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
