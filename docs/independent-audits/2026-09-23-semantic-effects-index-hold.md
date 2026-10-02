# Independent audit — effectsOf() declaresEffect adjacency index

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree (`Test-Path` False). It is **not**
clean-HEAD evidence. Production sources and tests were not edited by this
reviewer. Nothing was committed, merged, pushed, or signed. `.fungi` was
not touched. This receipt is not the author’s packet and is not GPT Astra.
Passing tests here are **not** production admission. Finding inventory was
**not** promoted. `csf_b7c875ed001f66b8abedfc85` stays
**PARTIAL_THIS_TREE**. Do **not** promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `effectsOf()` now builds an adjacency index of
  `kind === "declaresEffect"` (`from -> label ?? to[]`) and returns unique
  effect strings capped at `graph.edges.length`.
- Hostile: 400 outbound `calls` edges are not effects; only the
  `declaresEffect` label is.
- Positive: `fs.read` and `net.http` returned.
- Tests `semantic-effects.test.mjs` **2/2** plus callers **2/2**,
  reachable **2/2**, graph-json **4/4** (**10/10**).
- Residual: index rebuilt per call not cached; no duplicate-key scan;
  node fields not fully schema-validated.

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
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | **M** HEAD blob `734c6f1578` → WT blob `7d48fd08eb`. HEAD `effectsOf()` was `graph.edges.filter(from===flowId && kind==="declaresEffect").map(label ?? to)`. THIS TURN: `outgoing` Map (`from -> (label ?? to)[]`) for `kind === "declaresEffect"` only; unique `seen`; `maxResults = graph.edges.length`. Same dirty file still carries the prior `graphFromJSON` bound slice and `callers()` reverse index (not re-claimed here). |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-effects.test.mjs` | **??** untracked. THIS TURN: positive `fs.read`/`net.http` with a sibling `calls` edge ignored; hostile 400 outbound `calls` + one `declaresEffect` returns `["secret.read"]` under 200 ms. Imports `../dist/semantic/SemanticGraph.js`. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-callers.test.mjs` | **??** untracked from the prior callers-index slice. Not rewritten for effects. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | **clean** vs this HEAD (tracked). Adj-index + unused-kind dense-edge hostile. Not rewritten this slice. |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-graph-json.test.mjs` | **??** untracked from the prior JSON-bound slice. Not rewritten for effects. |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | gitignored; rebuilt this review (`tsc`); `effectsOf` 129–153 matches src adjacency index (no `.filter` chain). |

Prior independent receipt
`docs/independent-audits/2026-09-23-semantic-callers-index-hold.md`
recorded that `effectsOf` still linearly filtered `graph.edges` after
the callers reverse-index slice. That unindexed-`effectsOf` residual is
closed on this dirty tree for the named `declaresEffect` adjacency
claim. The index is still rebuilt on every `effectsOf()` call.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-devtools-graph-algorithms/src/semantic/SemanticGraph.ts` | 9870 | `f6ce15d6a824a92f939c72650bf508fe4465027248f31c21b22dea50a40fc383` | 2026-09-23T18:06:06.582Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-effects.test.mjs` | 1288 | `b99da52e47fcb758d544c240d6bfde0e1c7e45e1b0198b825dedd9fd81531d45` | 2026-09-23T18:06:06.582Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-callers.test.mjs` | 1320 | `1293d83fd74a6b0999800497815db48a9969551ae38799c1890aef380e19e386` | 2026-09-23T17:59:23.307Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-reachable.test.mjs` | 1297 | `14de0614ae523f0cdd748fcd72e3ab48ed977df050e90764b2ca8b71c3af6c40` | 2026-09-23T09:44:01.651Z |
| `packages-ts/galerina-devtools-graph-algorithms/tests/semantic-graph-json.test.mjs` | 1850 | `63274c0e6328e35cf1f54934e716c851f5de775d6494c2a8732ade57d939899b` | 2026-09-23T17:43:20.501Z |
| `packages-ts/galerina-devtools-graph-algorithms/src/index.ts` | 2734 | `d3fc6d7d93a35a21858bd853a762992ecda2f97a3287387f790cd7185642c097` | 2026-09-08T20:31:56.569Z |
| `packages-ts/galerina-devtools-graph-algorithms/dist/semantic/SemanticGraph.js` | 8272 | `747572dd7e8a26e099e357da262c9ccd73f9dfb77f5d7cf9cec6f27807191b90` | 2026-09-23T18:08:19.914Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtime is newer than matching src after this
review’s `tsc`. Named suites import dist (`packages-ts/.gitignore`
`dist/`). Barrel `src/index.ts` re-exports `effectsOf` / `callers` /
`reachable` and is clean vs this HEAD.

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
| `declaresEffect` index | build `from -> (label ?? to)[]` for `kind === "declaresEffect"` only | src 200–221; dist 129–153 | hostile + positive **pass** | TEMP: `kindDeclaresEffectOnly:true` `scansAllEdges:true` `usesLabelOrTo:true` | index still walks every edge to skip non-`declaresEffect` |
| unique effect strings | duplicate labels returned once | src 213–217 `seen` | named positive has distinct `fs.read`,`net.http` | TEMP: two `fs.read` + `net.http` → `["fs.read","net.http"]` | named suite does not assert duplicate-label uniqueness; extra probe closed it |
| cap at `graph.edges.length` | `maxResults = graph.edges.length`; break | src 214, 219; dist 143, 149–150 | **not** in named 2 tests | TEMP: handmade empty-`nodes` + one effect edge → `["fs.read"]`; `capEqualsEdgesLength:1` | unique effects from those edges cannot exceed `edges.length` on a consistent graph; cap is defensive |
| hostile 400 outbound `calls` | unused-kind outbound edges are not effects | tests 21–32 | **pass** 0.3977ms | TEMP: `hits:["secret.read"]` `ms:0` `under200:true` `edgeCount:401` | index build still O(E) |
| positive `fs.read`,`net.http` | only `declaresEffect` labels | tests 11–19 | **pass** 3.138ms | TEMP `positive:["fs.read","net.http"]` | sibling `calls` ignored |
| focused tests | 2/2 + 2/2 + 2/2 + 4/4 = 10/10 | named commands below | **10/10** 0 fail 0 skip `duration_ms 188.9957` | TEMP is extra, not a count | suites import dist, not src |
| per-call rebuild residual | index not cached on the graph | src 204–211 new `Map` each call | **not** in named tests | TEMP: `rebuildsMapEachCall:true` `noCacheOnGraph:true` `noGraphCacheField:true` | **CONFIRMED residual** |
| duplicate-key scan residual | JSON duplicate keys not censused | `admitSemanticGraph` 272–294; `JSON.parse` last-wins | **not** in named effects tests | TEMP: `{"id":"a","id":"b"}` admitted `nodeId:"b"` `throws:false` `lastKeyWins:true` | **CONFIRMED residual** |
| node/edge field schema residual | node/edge fields not fully validated | `admitSemanticGraph` returns `rec as unknown as SemanticGraph` | **not** in named effects tests | TEMP: `{id:1,kind:2,name:null}` + `kind:"not-a-kind"` admitted `throws:false` | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   **M**; effects test **??**; callers test **??**; json test **??**;
   reachable test clean. `Galerina.worktrees` is not this tree.

2. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-devtools-graph-algorithms` → **exit 0**.

3. `node --test tests/semantic-reachable.test.mjs tests/semantic-graph-json.test.mjs tests/semantic-callers.test.mjs tests/semantic-effects.test.mjs`
   in `packages-ts/galerina-devtools-graph-algorithms`
   → **10/10 pass**, 0 fail, 0 skip, `duration_ms 188.9957`.
   Breakdown: semantic-effects **2/2**, semantic-callers **2/2**,
   semantic-reachable **2/2**, semantic-graph-json **4/4**.

Independent extra (`%TEMP%\zt-semantic-effects-index-probe\probe.mjs`;
cwd not the worktree; `file://` import of working-tree
`dist/semantic/SemanticGraph.js`; no production write):

| probe | result |
|---|---|
| positive `fs.read`/`net.http` with sibling `calls` | `["fs.read","net.http"]` |
| 400 outbound `calls` + one `declaresEffect` | `["secret.read"]`, `ms:0`, `under200:true` |
| 200 `usesType` + 200 `requiresCapability` + one effect | `["io"]` |
| duplicate `fs.read` labels | unique `["fs.read","net.http"]` |
| unlabeled `declaresEffect` | uses `to` → `["fs.read"]` |
| empty-string `label` | `??` keeps `""` (does not fall back to `to`) |
| missing `flowId` | `[]` |
| empty `nodes` + one effect edge | `["fs.read"]` (effects are strings, not nodes) |
| `effectsOf` source | rebuilds `outgoing` Map each call; scans all edges; no WeakMap / graph cache field; no `.filter` chain |
| `graphFromJSON` duplicate key `id` | last-wins `"b"`; no throw |
| `graphFromJSON` untyped node/edge fields | admitted; no throw |

## Challenge 1 — does `effectsOf()` still linearly filter then map?

**No on this dirty tree for the named `declaresEffect` adjacency claim.
CONFIRMED closed for `kind==="declaresEffect"` indexing, uniqueness,
and unused-kind exclusion.** HEAD filtered every edge for
`from === flowId && kind === "declaresEffect"` then mapped
`label ?? to`. WT builds `outgoing: Map<from, (label ?? to)[]>` for
`declaresEffect` only, then looks up `flowId`, dedupes with `seen`, and
stops at `graph.edges.length`. Named hostile 400 outbound `calls` edges
are not effects. Positive `fs.read` and `net.http` returned. Extra
probe: duplicate labels collapse; `usesType` / `requiresCapability`
siblings are ignored; unlabeled edges use `to`.

The index is still **constructed from a full edge walk on every call**.
That is the named residual, not a contradiction of the index itself.

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** The
adjacency index is rebuilt per `effectsOf()` call and is not stored on
the graph. `graphFromJSON` still has no duplicate-key census and still
does not fully schema-validate node/edge fields. Named tests do not
cover those residuals; extra probe does. Dirty HEAD, unsigned
TypeScript, tests load gitignored `dist/`. Inventory was not promoted.
Independent production admission remains **HOLD**. Not 124-scan
closure. Not Astra. Not clean-HEAD evidence.

## Residuals (not findings against the named effects-index claim)

- **Index rebuilt per call, not cached on the graph.** Src 204–211
  allocates a new `outgoing` Map and walks `graph.edges` every time.
  TEMP: `rebuildsMapEachCall:true`, `noGraphCacheField:true`. Repeated
  `effectsOf(g, id)` is correct but still O(E) per call.
- **No duplicate-key scan.** `graphFromJSON` → `JSON.parse` last-wins;
  `admitSemanticGraph` does not census repeated keys. TEMP:
  `{"id":"a","id":"b"}` admitted as `"b"`, `throws:false`.
- **Node/edge fields not fully schema-validated.** `admitSemanticGraph`
  checks `schemaVersion`, array-ness, and count caps, then casts.
  TEMP: `{id:1, kind:2, name:null}` and `kind:"not-a-kind"` admitted.
- `edges.length` cap is present; named tests never truncate. Unique
  effect strings from those same edges cannot exceed `edges.length` on
  a well-formed graph.
- Empty-string `label` is kept (`??`, not `||`). Named tests always
  supply non-empty labels. Out of the named claim.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_b7c875ed001f66b8abedfc85`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named `effectsOf()` adjacency-index claim.
Evidence is sufficient that `effectsOf()` indexes `kind==="declaresEffect"`
as `from -> (label ?? to)[]`, that unique effect strings are returned,
that 400 outbound `calls` edges are not effects, and that `fs.read` and
`net.http` are returned. Evidence is insufficient for PATCHED promotion
(per-call rebuild; no duplicate-key scan; node fields not fully
schema-validated) and for production admission.

**PASS scoped.** Hashes **MATCH**. Tests **2/2 + 2/2 + 2/2 + 4/4 = 10/10**.
Finding stays **PARTIAL_THIS_TREE**. Residual: index rebuilt per call
not cached; no duplicate-key scan; node fields not fully
schema-validated. Not production admission. Not Astra. Not 124-scan
closure. **Not clean-HEAD evidence.**
