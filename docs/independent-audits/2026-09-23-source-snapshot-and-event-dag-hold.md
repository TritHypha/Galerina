# Independent audit — source snapshot for generateManifest and EventDAG bound

**Verdict: PASS** (scoped to the two named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims:

- **A** `csf_d612a71be9f290ce1b6f2c75`: `galerina.mjs` `generateManifest(source)`
  uses the `readUntrustedSource` snapshot; no `readFileSync(fungiFile)`
  between capture and `generateManifest`.
- **B** `csf_c12eac261f985af483ce61d8`: `buildEventDAG` throws on `>8192`
  events; continuation uses a linked `Set`; `builder.build()` once after
  the loops.

This reviewer independently re-read CLI + src + dist, hashed working-tree
bytes, ran the named suites, and executed an extra probe from `%TEMP%`
(not by trusting the named tests alone).

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Claim B
tests import gitignored `dist/`. This reviewer did not rebuild. Dist
mtime `2026-09-22T12:53:20Z` is newer than src `2026-09-22T11:51:30Z` and
contains the same `MAX_AUDIT_EVENTS` / `linked` / single `builder.build()`
logic. `dist/index.js` re-exports `buildEventDAG` from
`./reporting/event-dag.js`.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `galerina.mjs` | **M** HEAD blob `e5bbafe901` → WT blob `a580e097b6`. Dirty hunks are the verify-banner gate (~1804–2011). Capture + `generateManifest(source)` are **clean vs HEAD** (line shift only: HEAD gen 2503 → WT 2479). |
| `tests/build-source-snapshot.test.mjs` | **??** untracked (blob `c45fadbedb`) |
| `packages-ts/galerina-devtools-project-graph/src/reporting/event-dag.ts` | **clean** (blob `1a60f28bc5` = HEAD) |
| `packages-ts/galerina-devtools-project-graph/tests/reporting.test.mjs` | **M** HEAD blob `31eff0bf80` → WT `ffcb7cd3b8`. Dirty is the continuation-loop source-shape test + `readFileSync` import. Oversized-list test already on HEAD. |

Scan revision `0f24ca30ef3f173c43a60c914c18b161327f2227`:

- Claim A: second `const source = readUntrustedSource(fungiFile)` at 2445
  immediately before `generateManifest` (first capture 1195). That is the
  reread detector. There was **never** a `readFileSync(fungiFile)` call.
- Claim B: no `MAX_AUDIT_EVENTS`; no `linked` Set; continuation loop
  called `builder.build()` per pair (`alreadyLinked = builder.build().outEdges(from)`
  at scan-era 146) then `return builder.build()` at 156.

## Source hashes on this tree

Author-named hashes MATCH the listed working-tree files. Independent
SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH). Claimed `event-dag.ts` digest is
the file at `src/reporting/event-dag.ts` (there is no `src/event-dag.ts`).

| path | bytes | sha256 |
|---|---|---|
| `galerina.mjs` | 188257 | `a21e6d07ef66718ebd74e959a1c91856fa849c001780318e35a571568d2641a5` |
| `tests/build-source-snapshot.test.mjs` | 737 | `2dc0b770eb3b97d622937784c9c2d64b9fe8c76ded880732cfc5a0fc238e5d05` |
| `packages-ts/galerina-devtools-project-graph/src/reporting/event-dag.ts` | 6330 | `ec2d9dd814c3df24e8f17d21195856373222565288c0552e55bf0286597cdf5b` |
| `packages-ts/galerina-devtools-project-graph/dist/reporting/event-dag.js` | 4357 | `6fd2e9a5918f3532a0e385d776c0bbf28ac1db957eb46b9336bb752e8e8fa194` |
| `packages-ts/galerina-devtools-project-graph/tests/reporting.test.mjs` | 11296 | `04f31cd0cbc5f1bd25e22c9e07cf38543730a70dc782905a9f08421c3dc1f31a` |

HEAD `galerina.mjs` blob `e5bbafe90182130bf49a07f3193d3ce5632b179e`
(sha256 `5e370c7296f51147c4ebab7e2be474dacfd91423085d338d52f4c523227a0b9d`,
190386 bytes). Inventory sha256
`29538880ffe26c3739833b320eabb3f252ae9d2b07e8c72a71b24b9076ca2d6b`
(`findings.json` sha256
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`).

CSF rows: `csf_d612a71be9f290ce1b6f2c75` (`occ_b90532110fc4d7403bef56fc`,
medium, `galerina.mjs`, scan-era `start_line` 2445) and
`csf_c12eac261f985af483ce61d8` (`occ_bac634958faf0f88ca4c842c`, medium,
`src/reporting/event-dag.ts`, scan-era `start_line` 141). Both remain
`PARTIAL_THIS_TREE`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Capture is `const source = readUntrustedSource(fungiFile)` | WT 1241; helper 67–78 `readFileSync(path, "utf8")` after size check |
| `generateManifest` first arg is that `source` | WT 2479–2480; only call site |
| No `readFileSync(fungiFile)` between capture and gen | named test + independent slice 1241–2479 |
| No second `readUntrustedSource` between capture and gen | independent: `captureCount=1`; hits only 67 / 621 (shadow batch) / 1241; `afterCapReadUntrusted=false` |
| `generateManifest` hashes the string arg, not a file reread | `dist/manifest-generator.js` `sha256Hex(source)`; **no** `readFileSync` inside `generateManifest` |
| `buildEventDAG` throws on length `>8192` | src 92–97 / dist 22–26; named + live 8193 |
| 8192 events admitted | independent `nodeCount===8192` |
| Continuation uses linked `Set` | src 104, 133–134, 152–156 / dist 32, 58, 77–80; child-span pair emits **one** `child-span` edge, not also `continuation` |
| `builder.build()` once after loops | src 160 / dist 83 only; both after `// continuation:`; `GraphBuilder.build` may be reused after return, so in-loop `build()` would still copy |
| Named node tests | snapshot **1/1**; specified two-file run **26/26** |
| Inventory 63/57/4 | independent recount of `scan-0f6063dd-inventory-2026-09-22.json` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `node --test --test-timeout=60000 tests/build-source-snapshot.test.mjs --test-name-pattern "oversized event|continuation loop" packages-ts/galerina-devtools-project-graph/tests/reporting.test.mjs`
   → **26/26 pass**, 0 fail, 0 skipped, `duration_ms 184.2032`. On this
   Node/PowerShell invocation the name pattern did **not** filter; both
   files ran in full, including Claim A’s snapshot test.
2. Snapshot only → **1/1 pass**, `duration_ms 134.0032`.
   - `build signs the initially captured source string, not a later reread` — **green** (1.6849ms)
3. Named Claim B tests inside (1):
   - `refuses an oversized event list` — **green** (3.43ms)
   - `does not rebuild an immutable graph inside the continuation loop` — **green** (0.5885ms)

Independent extra (`%TEMP%\zt-source-snapshot-event-dag-probe.mjs`; not
production):

Claim A (`galerina.mjs` + `manifest-generator.js`):

| probe | result |
|---|---|
| capture line / gen line | 1241 / 2479 |
| `captureCount` of `const source = readUntrustedSource(fungiFile)` | **1** |
| `readUntrustedSource(` lines | 67, 621, 1241 |
| between capture and gen: `readFileSync(fungiFile)` | **false** |
| after capture: another `readUntrustedSource` | **false** |
| `generateManifest(\n        source,` | **true** |
| `generateManifest` body `readFileSync` | **false** (`sha256Hex(source)`) |
| scan-era `0f24ca30` same named regexes | would **pass** (`noReadFileSyncFungi=true`, `genArgSource=true`) while `captureCount=2` and `secondReadUntrusted=true` |

Claim B (dist `buildEventDAG`):

| probe | result |
|---|---|
| 8193 events | throw `EventDAG refuses more than 8192 audit events` |
| 8192 events | `nodeCount===8192` |
| parent+child same `traceId` | 1 edge, kind `child-span` |
| two same-trace events, no parent | 1 edge, kind `continuation` |
| `builder.build(` hits src / dist | **1 / 1**, after continuation loops |
| `MAX_AUDIT_EVENTS=8192` and `linked` Set | src + dist |

## Challenge 1 — can `generateManifest` bind a later reread of `fungiFile`?

**No. CONFIRMED closed for the named snapshot.** WT 1241 captures once
into `const source`. WT 2479 passes that binding. Independent extra:
no second `readUntrustedSource` and no `readFileSync(fungiFile)` in
between. `generateManifest` hashes `source`. Scan-era 2445 reread is
absent on HEAD and on this dirty CLI (verify-banner dirt does not
reintroduce it).

## Challenge 2 — does the named Claim A test fail scan-era?

**No. Named oracle is a weak residual.** Scan-era reread was
`readUntrustedSource(fungiFile)`, which internally `readFileSync(path)`,
never `readFileSync(fungiFile)`. The named `doesNotMatch` / first-arg
`source` checks are green on `0f24ca30` **and** on WT. Independent extra
is the scan-era differential (`captureCount` 2 → 1). Detector for the
**source claim** is not invalid; the **named test** is not a red/green
pair against the scan snapshot.

## Challenge 3 — does `buildEventDAG` copy the graph per continuation?

**No. CONFIRMED one `build()` after loops.** Scan-era continuation
called `builder.build()` per adjacent pair (full freeze-copy;
`GraphBuilder.build` documents reuse after return). WT src 148–160 /
dist 72–83 use `linked` then a single `return builder.build()`. Live
child-span pair is not also a continuation multiedge.

## Challenge 4 — can 8193 events bypass the bound?

**No. CONFIRMED throw.** `events.length > 8192` before sort. Named +
independent 8193 throw; 8192 admits.

## Challenge 5 — is this 124-scan closure or production admission?

**No.** Both IDs remain `PARTIAL_THIS_TREE`. Independent recount of 124
findings: **4** `PATCHED_AUDIT_PENDING`, **57** `PARTIAL_THIS_TREE`,
**63** `OPEN_ON_SCAN_SNAPSHOT` (13 medium / 50 low). Matches
`disposition_counts`. This review does not recategorize them.

## Residuals (not findings against the named claims)

- Named Claim A test would pass scan-era. Independent extra is required
  to see the actual reread gone.
- Named Claim A test does not spawn `galerina.mjs build` or mutate the
  `.fungi` after capture. No live TOCTOU process. This reviewer did not
  author `.fungi`.
- `readUntrustedSource` at 621 is the shadow-policy batch path, not
  `generateManifest`.
- File-level `readFileSync` in `manifest-generator.js` is compiler
  `package.json` version cache, not `generateManifest`.
- Named continuation test is src-shape (`lastIndexOf("builder.build()")`
  after `// continuation:`). It would not catch a second in-loop
  `builder.build()` plus a later return. Independent extra counts **1**.
- Duplicate `eventId`s are still pushed into `byTrace`; a self-edge is
  not the named claim.
- Bound is `events.length`, not expanded iterable size.
- Dirty `galerina.mjs` verify-banner work is **not** Claim A.
- Inventory still lists both IDs `PARTIAL_THIS_TREE`. 63 OPEN / 57
  PARTIAL / 4 PATCHED remain. Overall
  **INCOMPLETE_NON_AUTHORITATIVE**.

## Classification

No `CONFIRMED_FINDING` on the two named claims. Detector is not invalid:
scan-rev still rereads via a second `readUntrustedSource` before
`generateManifest` and still `builder.build()`s inside the continuation
loop with no 8192 cap; this dirty tree (and HEAD for the production
functions) uses the first captured `source`, a linked `Set`, one
`build()` after loops, and throws on 8193 events.

Evidence is sufficient for those bullets; insufficient for a live
post-capture file swap, a strong scan-era-failing Claim A named test,
scan recategorization, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
