# Independent audit — logger retention / TPL packed-trit / snapshot tmp scrub

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

- **A. `csf_fd74b2a34bfe325906af1691`**: Default logger retention. File
  `packages-ts/galerina-observability/src/logger.ts` `MemoryLogSink`.
  **Logger src unchanged this turn** (HEAD blob `63d5107488` = WT blob
  `63d5107488`). `MemoryLogSink` already caps at 4096 and drops oldest
  (`constructor(maxRecords = 4096)` + `shift()` before `push`). THIS
  TURN added tests in
  `packages-ts/galerina-observability/tests/logger.test.mjs`
  (`maxRecords:2` drop-oldest; default 4097 → 4096). Residual the
  author flags: no aggregate byte / message-size ceiling.

- **B. `csf_23eb306ca5b3cc0c49f1da9f`**: Recycled TPL packed-trit. File
  `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts`.
  THIS TURN `TPLStateBuffer` constructor fills the i32 view with 0
  (`ENC_REJECT` / encoding of −1) after allocate, so recycled 0xFF
  compute blocks are not 0b11 corruption. Also `#block` instead of
  `_block`. Tests in
  `packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs`. Dist
  rebuilt (author). Residual the author flags: Compute `free` still
  0xFF-fills; TPL init is the packed-trit compatibility layer.

- **C. `csf_ba63b06905a1b2259c3cb1a4`**: Snapshot scrub leftover `.tmp`.
  Scan-era path `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts`
  (`start_line` 112); production control THIS TURN is
  `src/atomic-writer.ts` `AtomicWriter.scrub`. `#zeroUnlinkIfPresent`
  zero-unlinks `.tmp` then `.snap` (orphaned tmp even when no snap).
  `ColdBootOrchestrator.scrub` still delegates `this.#writer.scrub(name)`.
  Tests in `tests/atomic-writer.test.mjs` + `tests/cold-boot.test.mjs`.
  Dist rebuilt (author). Residual the author flags: crash between zero
  and unlink; no exclusive crash-recovery walk of all `*.tmp`.

This reviewer independently re-read production + tests + dist for the
three named bodies, hashed working-tree bytes, ran the named suites,
and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not supplied** in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **50 OPEN / 70
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 50 = 0 high / 0 medium /
50 low, `PARTIAL_THIS_TREE` 70, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 50 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suites import gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). This reviewer did not rebuild. Dist mtimes for the TPL and
atomic-writer/cold-boot bodies are newer than their src and carry the
named controls. Logger dist is newer than unchanged logger src (see
hashes).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-observability/src/logger.ts` | **clean** HEAD blob `63d5107488` = WT blob `63d5107488`. `MemoryLogSink` already `maxRecords = 4096` and `shift()`-drops oldest. No this-turn src hunk. |
| `packages-ts/galerina-observability/tests/logger.test.mjs` | **M** HEAD blob `b6a5286ba1` → WT blob `ed9920e756` (+18). THIS TURN: “MemoryLogSink drops the oldest records once the admitted ceiling is reached” (`maxRecords:2` → `["b","c"]`); “the default logger MemoryLogSink retains at most 4096 records” (4097 writes → length 4096, first `n1`, last `n4096`). Imports `../dist/index.js`. |
| `packages-ts/galerina-observability/dist/logger.js` | gitignored; **not** rebuilt this turn (src clean). `MemoryLogSink` 22–28 `maxRecords = 4096` / `shift()` + `push`. mtime newer than src. |
| `packages-ts/galerina-observability/dist/index.js` | gitignored; barrel `export * from "./logger.js"` (line 13) |
| `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts` | **M** HEAD blob `c38440eb75` → WT blob `be1c051c29` (+9 / −6). THIS TURN: `#block`; after `pool.allocate` the constructor does `this.pool.i32(this.#block).fill(0)` (ENC_REJECT / 0b00 → −1). HEAD called `i32` without fill, so a recycled Compute 0xFF block was packed-trit 0b11. |
| `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts` | **M** HEAD blob `b2245478c3` → WT blob `19a9639ab8` (+1 / −1). Extra dirty vs HEAD, **not** the named packed-trit fill: `Object.freeze` on the allocated `Block`. Compute `free` still `fillByte = 0xff` (src 171–172) — residual. |
| `packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs` | **M** HEAD blob `cee76ae6e0` → WT blob `44e6f1fd9d` (+59). THIS TURN: recycled allocation `getTrit(0/1) === -1`; plus UAF hostiles (`free+realloc`, frozen `generation`, assigning `_block`). Imports `../dist/index.js`. |
| `packages-ts/galerina-core-sentinel-memory/dist/tpl-state-buffer.js` | gitignored; rebuilt this turn; constructor `fill(0)` 35–39 / `#block` |
| `packages-ts/galerina-core-sentinel-memory/dist/static-memory-pool.js` | gitignored; `fillByte` compute `0xff` 117–118; `Object.freeze` on allocate |
| `packages-ts/galerina-core-sentinel-memory/dist/index.js` | gitignored; re-exports `TPLStateBuffer` / `StaticMemoryPool` |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | **M** HEAD blob `0c5977fa40` → WT blob `889a63c04e` (+53 / −19). THIS TURN: `scrub` calls `#zeroUnlinkIfPresent(.tmp)` then `#zeroUnlinkIfPresent(.snap)`. HEAD zeroed only live `.snap` and, on missing snap, returned at ENOENT **leaving `.tmp`**; sibling tmp was `unlinkSync` without zero. Extra dirty on this file (not the named leftover-tmp bullet): FIFO/`refuseSnapshotSpecialFile` / `openSnapshotFd`. |
| `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | **M** HEAD blob `d64c64940d` → WT blob `dd943f6a35` (+60 / −2). Extra dirty vs HEAD, **not** the named tmp-scrub hash: durable rollback-floor persist/read. `scrub` (188–191) still `this.#writer.scrub(name)` — **no new control** in the orchestrator beyond the writer change. Scan-era `start_line` 112 is now the rollback-floor compare, not `scrub`. |
| `packages-ts/galerina-core-sentinel-state/tests/atomic-writer.test.mjs` | **M** HEAD blob `ae542d0a5b` → WT blob `68d39f3cae` (+48 / −5). THIS TURN: “scrub zero-unlinks an orphaned .tmp even when no .snap exists”. Extra dirty: FIFO tests. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-sentinel-state/tests/cold-boot.test.mjs` | **M** HEAD blob `7c539ea71f` → WT blob `fdee8e03fe` (+30). THIS TURN: “scrub removes an orphaned plaintext .tmp left by an interrupted write”. Extra dirty: rollback-floor hostiles. |
| `packages-ts/galerina-core-sentinel-state/dist/atomic-writer.js` | gitignored; rebuilt this turn; `scrub` 143–146 / `#zeroUnlinkIfPresent` 147–184 |
| `packages-ts/galerina-core-sentinel-state/dist/cold-boot.js` | gitignored; `scrub` → `this.#writer.scrub(name)` 139–141 |
| `packages-ts/galerina-core-sentinel-state/dist/index.js` | gitignored; barrel re-exports `AtomicWriter` / `ColdBootOrchestrator` |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-observability/src/logger.ts` | 12712 | `ba2a590d53abec3156170fcc923eb31fe30472611517bf612d0eae287d5e79f0` |
| `packages-ts/galerina-observability/tests/logger.test.mjs` | 9975 | `41c32982c58106bedabc5065e86e7493fd0f13f8b2b29c10265355c1b68dfeea` |
| `packages-ts/galerina-observability/dist/logger.js` | 10642 | `91300697a1bc70cb55b5ebf5933b580c5998822958aa782fdd8eb6a64de3122c` |
| `packages-ts/galerina-observability/dist/index.js` | 832 | `35347d188bd4a1fb4cc19c22ff30e991774b88aa7346222655f43e09052c0c6b` |
| `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts` | 4046 | `14ba0475ea208f6697a3e81e74c2a817106b5879a1625a715edec92188f8415a` |
| `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts` | 9122 | `8a486e8b504b15b03f2ab3d8a0e095f3fd83048544958d851daf2937438bf4d3` |
| `packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs` | 4838 | `9ab0cc6458f606a77ef4d03f7a12f0928b42408e1f2c4013678353a0acbc933b` |
| `packages-ts/galerina-core-sentinel-memory/dist/tpl-state-buffer.js` | 3816 | `20f9069d0aa02ede0ec7f01c62665fedbc227a2b5c8111009ce5d7a50d011b36` |
| `packages-ts/galerina-core-sentinel-memory/dist/static-memory-pool.js` | 7919 | `0303ec75522d227cbce8bd96dcf174231c0a51210be26292490078bd18e3e273` |
| `packages-ts/galerina-core-sentinel-memory/dist/index.js` | 686 | `8a0a67daeff1b2bebbfa475ce2abd41942d6a8ea7cbd79dbe76a2ec7136dec70` |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | 7903 | `545a9f87f1225dffcc00ea5dce9bbd9f800091831a7551d252d8ff86d2e34964` |
| `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | 7747 | `9498fc013b4fef33e21b3bf3f63b1441dc76108fde47d469ac8fd4a1f2607cd4` |
| `packages-ts/galerina-core-sentinel-state/tests/atomic-writer.test.mjs` | 3896 | `c8199134478ecc54ea8c2c519726c587972db66cc1491f7c5605b5fb8cec61af` |
| `packages-ts/galerina-core-sentinel-state/tests/cold-boot.test.mjs` | 4970 | `b1f20139635654669e6f2b2677b5426773989c723a9b92d00b99cf8126826d16` |
| `packages-ts/galerina-core-sentinel-state/dist/atomic-writer.js` | 7925 | `e4b356a973c81b590c217230e13fd95bf8896484ab1ac2363be826fbf0307177` |
| `packages-ts/galerina-core-sentinel-state/dist/cold-boot.js` | 7107 | `f744e1aa09ee01adfb666c448b4dd10ca38344d0b3f8c7ad98d1c2f647e325f7` |
| `packages-ts/galerina-core-sentinel-state/dist/index.js` | 575 | `d31a1f619bd529bd44227a174478d0bc72642469dfe9ffe1fb26d2c06df18322` |

Independent MATCH (Get-FileHash ↔ crypto): logger src
`ba2a590d…5e79f0`; logger tests `41c32982…8dfeea`; logger dist
`91300697…e3122c`; TPL src `14ba0475…f8415a`; TPL dist
`20f9069d…011b36`; pool src `8a486e8b…38bf4d3`; atomic src
`545a9f87…e34964`; atomic dist `e4b356a9…307177`; cold-boot src
`9498fc01…2607cd4`; inventory `03b98fa8…66cb2a6`.

Dist mtimes (UTC): logger.js `2026-09-22T12:53:37.115Z` (src
`2026-09-22T11:57:55.157Z` / tests `2026-09-23T09:16:48.633Z`);
`tpl-state-buffer.js` `2026-09-23T09:16:59.210Z` (src
`2026-09-23T09:16:48.633Z`); `static-memory-pool.js`
`2026-09-23T09:16:59.198Z`; `atomic-writer.js`
`2026-09-23T09:16:59.251Z` (src `2026-09-23T09:16:48.633Z`);
`cold-boot.js` `2026-09-23T09:16:59.258Z` (src
`2026-09-23T02:15:34.045Z`). Named dist files are newer than their
src. Logger dist was not rebuilt this turn; TPL and state dist were.

Inventory file sha256 `03b98fa83a4245f1a681f541f565d39c2d3bb3d8b4b27dd018aa4e47766cb2a6`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_fd74b2a34bfe325906af1691` (`occ_2233f7f17503c14af53ba3ea`,
  path `packages-ts/galerina-observability/src/logger.ts`, scan-era
  `start_line` 42, title “Default logger retains every emitted record
  indefinitely”)
- `csf_23eb306ca5b3cc0c49f1da9f` (`occ_2bd6d2c9a3fbc2ecd497cc3e`,
  path `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts`,
  scan-era `start_line` 40, title “Recycled TPL allocations start with
  invalid packed-trit state”)
- `csf_ba63b06905a1b2259c3cb1a4` (`occ_2c690783446f7230493fb29d`,
  path `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts`,
  scan-era `start_line` 112, title “Snapshot scrub leaves plaintext
  temporary files after interrupted writes”)

Named tests import `../dist/index.js`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. `MemoryLogSink` already caps at 4096 and drops oldest | src 46–51 `maxRecords = 4096` + `shift()`; dist 22–28; HEAD blob identical |
| A. THIS TURN tests `maxRecords:2` drop-oldest | WT tests 18–24 0.1536ms `["b","c"]` |
| A. THIS TURN tests default 4097 → 4096 | WT tests 26–34 2.9907ms length 4096, `n1`…`n4096` |
| A. Logger src unchanged | git status omits logger.ts; HEAD = WT `63d5107488` |
| A. Residual: no aggregate byte / message-size ceiling | `write` bounds `#records.length` only; `msg` is an unbounded string |
| B. Constructor fills i32 with 0 after allocate | src 41–45; dist 35–39 `fill(0)` |
| B. Recycled TPL `getTrit` is −1, not LSM-TRIT-CORRUPT | WT tests 114–122 0.2415ms; extra probe `getTrit0:-1` `getTrit1:-1` |
| B. Dist rebuilt for TPL | dist mtime 09:16:59Z > src 09:16:48Z; suite imported dist and passed |
| B. Residual: Compute `free` still 0xFF-fills | pool src 171–172 / dist 117–118 `fillByte = 0xff`; extra probe `afterFreeAllFF:true` sample `[255,255,255,255]` then constructor zeros (`afterAllocAllZero:true`) |
| C. `scrub` zero-unlinks `.tmp` then `.snap` via `#zeroUnlinkIfPresent` | src 165–168 + 170–204; dist 143–184 |
| C. Orphaned tmp even when no snap | WT atomic tests 48–56 2.0044ms; cold-boot tests 111–117 1.7094ms; extra probe `tmpGone:true` `snapAfter:false` |
| C. Dist rebuilt for writer | dist mtime 09:16:59Z > src 09:16:48Z; suites imported dist and passed |
| C. Residual: crash between zero and unlink | `#zeroUnlinkIfPresent` `writeSync` zero then later `unlinkSync`; no fsync; no glob of `*.tmp` |
| Logger 22 named tests | `node --test tests/logger.test.mjs` → 22/22 |
| TPL 11 named tests | `node --test tests/tpl.test.mjs` → 11/11 |
| Atomic-writer + cold-boot 15 named tests | `node --test tests/atomic-writer.test.mjs tests/cold-boot.test.mjs` → 15/15 (Linux FIFO 5775.1302ms) |
| Dist not stale for named bodies | hashes + same order in src/dist; mtimes newer than src; named suites imported dist and passed; extra probe imported the same dist barrels |
| Inventory 50/70/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → logger src **clean**; `M`
   logger tests; `M` TPL src; `M` pool src (extra); `M` TPL tests; `M`
   atomic-writer src; `M` cold-boot src (extra); `M` atomic-writer
   tests; `M` cold-boot tests; dist gitignored (not listed).

2. `node --test tests/logger.test.mjs` in
   `packages-ts/galerina-observability`
   → **22/22 pass**, 0 fail, 0 skip, `duration_ms 154.6274`.
   Drop-oldest 0.1536ms; default 4096 cap 2.9907ms; both green.

3. `node --test tests/tpl.test.mjs` in
   `packages-ts/galerina-core-sentinel-memory`
   → **11/11 pass**, 0 fail, 0 skip, `duration_ms 155.6924`.
   Recycled packed-trit REJECT 0.2415ms; green.

4. `node --test tests/atomic-writer.test.mjs tests/cold-boot.test.mjs`
   in `packages-ts/galerina-core-sentinel-state`
   → **15/15 pass**, 0 fail, 0 skip, `duration_ms 5931.6441`.
   Orphaned-tmp atomic 2.0044ms; cold-boot tmp 1.7094ms; live Linux
   FIFO via WSL 5775.1302ms; all green.

Independent extra (`%TEMP%\zt-logger-tpl-tmpscrub-probe\probe.mjs`;
cwd `%TEMP%\zt-logger-tpl-tmpscrub-probe`; `file://` import of
working-tree dist barrels; no production write):

| probe | result |
|---|---|
| `MemoryLogSink(1)` write first then second | `msgs:["second"]`, **`droppedFirst:true`** |
| TPL `free` then realloc `getTrit(0)` | **`getTrit0:-1`**, `getTrit1:-1`, `livePtr===ptr`, `afterFreeAllFF:true` `[255,255,255,255]`, `afterAllocAllZero:true` `[0,0,0,0]` |
| plant `ckpt.tmp`, `AtomicWriter.scrub("ckpt")` | `planted:true`, **`tmpAfter:false`**, `snapAfter:false`, **`tmpGone:true`** |

## Challenge 1 — does default logger retention still grow without bound? Does `maxRecords:2` drop the oldest?

**No unbounded record count on this dirty tree for `MemoryLogSink`.
CONFIRMED closed for the named record-count cap (already in HEAD src;
THIS TURN tests are red-capable).** Extra probe: `MemoryLogSink(1)`
retains only `"second"`. Named suite: cap 2 keeps `b,c`; default 4097
writes leave 4096 starting at `n1`. Logger src was not modified this
turn. Residual: no aggregate byte / message-size ceiling — a single
huge `msg` is still admitted.

Scan-era object `0f6063dd…:packages-ts/galerina-observability/src/logger.ts`
is **not** recategorized. Inventory still lists the row OPEN.

## Challenge 2 — does a recycled TPL allocation read as packed-trit 0b11 / LSM-TRIT-CORRUPT?

**No on this dirty tree for TPL constructor `fill(0)`. CONFIRMED closed
for the named packed-trit init.** Extra probe: after Compute `free` the
bytes are still 0xFF; after `new TPLStateBuffer` `getTrit(0)===-1` and
the i32 view is zeros. Named suite recycled-REJECT test green. Residual:
Compute `free` still 0xFF-fills; TPL init is the compatibility layer
that maps that scrub onto ENC_REJECT before first trit access.

Scan-era object `0f6063dd…:packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts`
is **not** recategorized.

## Challenge 3 — does `scrub` leave an orphaned plaintext `.tmp` when no `.snap` exists? Is dist stale? Is this 124-scan closure?

**No leftover named `.tmp` after `AtomicWriter.scrub` on this dirty
tree. Dist not stale for the named bodies. Not 124-scan closure.**
HEAD returned at missing `.snap` and unlinked tmp without zero; THIS
TURN zeros then unlinks `.tmp` first. Extra probe planted `ckpt.tmp`
with no snap; after scrub `existsSync` is false. Dist `fill(0)` /
`#zeroUnlinkIfPresent` / `MemoryLogSink` cap match src and are newer
than src; named suites imported those dist files and passed; extra
probe imported the same dist barrels. CSF rows remain
`OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **70** `PARTIAL_THIS_TREE`, **50**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 50 low). This review does
not recategorize the rows.

## Residuals (not findings against the three named bullets)

- Logger: no aggregate byte / message-size ceiling. Cap is record
  count only (`#maxRecords` / `shift()`). Extra probe used tiny
  messages and does not claim a byte budget.
- TPL: Compute `free` still 0xFF-fills (`static-memory-pool.ts` 171–
  172). Extra probe saw `[255,255,255,255]` after free and zeros only
  after TPL constructor `fill(0)`. Extra dirty vs HEAD on the pool is
  `Object.freeze` of `Block`, not the fill byte.
- Snapshot scrub: crash between zero-overwrite and `unlinkSync` can
  leave a zeroed file at the same path; `scrub(name)` does not walk
  every `*.tmp` in the directory. FIFO/`refuseSnapshotSpecialFile` and
  cold-boot rollback-floor persistence are extra dirty vs HEAD, not
  the leftover-tmp bullet. `ColdBootOrchestrator.scrub` remains a
  one-line delegate.
- Named suites import gitignored dist, not src. Dist was confirmed
  non-stale for the named bodies; this receipt did not rebuild.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 50 OPEN / 70 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era unbounded logger retention, recycled TPL 0b11,
or leftover plaintext `.tmp` after interrupted writes; this dirty tree
has the named record-count cap (pre-existing src + this-turn tests),
TPL constructor `fill(0)`, and name-scoped zero-unlink of `.tmp` then
`.snap`, with executed red-capable evidence on dist. Residuals above
remain outside those bullets. Evidence is sufficient for those
bullets; insufficient for scan recategorization and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-logger-tpl-tmpscrub-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** logger **22/22**; TPL **11/11**; atomic-writer+cold-boot **15/15**
- **Extra-probe:** `%TEMP%\zt-logger-tpl-tmpscrub-probe` — `droppedFirst:true`; `getTrit(0)===-1`; planted `ckpt.tmp` `existsSync false` after scrub
- **Residuals:** no logger byte/message ceiling; Compute `free` still 0xFF; crash between zero and unlink; no glob of all `*.tmp`
- **git status (named):** logger src clean; `M` logger tests; `M` TPL src; `M` pool src (extra); `M` TPL tests; `M` atomic-writer src; `M` cold-boot src (extra); `M` atomic-writer tests; `M` cold-boot tests; `??` this receipt; dist gitignored. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
