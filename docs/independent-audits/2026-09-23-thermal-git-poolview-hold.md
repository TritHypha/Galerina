# Independent audit — thermal non-finite / git option-like base / pool view bounds

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

- **A. `csf_e145f9dfd60df70053acdab4`**: Non-finite thermal readings. File
  `packages-ts/galerina-core-sentinel-power/src/power-governor.ts`.
  **Power src unchanged this turn** (HEAD blob `d0ab12cafd` = WT blob
  `d0ab12cafd`). `setReading` and `evaluate` already throw `LSP-READ-001`
  unless `Number.isFinite`. THIS TURN added tests in
  `packages-ts/galerina-core-sentinel-power/tests/power-governor.test.mjs`
  (NaN/Infinity `setReading`; NaN sensor `evaluate` /
  `assertWithinEnvelope`). Residual the author flags: `read()` can still
  return a raw non-finite sensor value if the caller does not go through
  `evaluate`.

- **B. `csf_e28e823a7e7a74767725c9db`**: Git option-like `--base`. File
  `packages-ts/galerina-devtools-impact/src/git-changes.mjs`. Already
  rejects `base.startsWith("-")`. THIS TURN: `rev-parse --verify
  ${base}^{commit}` then only a hex SHA is passed to `git diff` with
  `--no-ext-diff` and `--` after the SHA. Tests in
  `tests/git-changes.test.mjs`. Residual the author flags:
  `--end-of-options` not used (hex SHA cannot look like an option);
  Windows git CRLF warnings on fixture.

- **C. `csf_ac73ec6448618999eb697045`**: Pool views. File
  `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts`.
  `i32`/`u8` already size from live `rec.count`. THIS TURN: also require
  `block.bytes` and `block.segment` match the live record or
  `LSM-BOUNDS-001`. Tests in
  `packages-ts/galerina-core-sentinel-memory/tests/pool.test.mjs`. Dist
  rebuilt (author). Residual the author flags: views are still
  constructed from ptr+length rather than a WeakMap-held ArrayBuffer
  slice identity.

This reviewer independently re-read production + tests + dist for the
three named bodies, hashed working-tree bytes, ran the named suites,
and executed an extra probe from `%TEMP%` (not by trusting the named
tests alone). Author-named hashes were **not supplied** in the review
packet. Independent `crypto.createHash('sha256')` and `Get-FileHash`
MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **47 OPEN / 73
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 47 = 0 high / 0 medium /
47 low, `PARTIAL_THIS_TREE` 73, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 47 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named power and pool
suites import gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). Git-changes tests import `../src/git-changes.mjs` (no dist).
This reviewer did not rebuild. Dist mtime for the pool body is newer
than its src and carries the named `LSM-BOUNDS-001` match. Power dist
is newer than unchanged power src (see hashes) and already contains
`Number.isFinite` / `LSP-READ-001`.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-sentinel-power/src/power-governor.ts` | **clean** HEAD blob `d0ab12cafd` = WT blob `d0ab12cafd`. `setReading` 71–76 and `evaluate` 99–103 already `Number.isFinite` → `LSP-READ-001`. `read()` 79–81 still returns `this.sensor()` raw. No this-turn src hunk. |
| `packages-ts/galerina-core-sentinel-power/src/thermal-envelope.ts` | **clean** HEAD blob `53ab60ee40` = WT blob `53ab60ee40`. Envelope `Number.isFinite` is `LSP-ENV-001`, not the named reading bullet. |
| `packages-ts/galerina-core-sentinel-power/tests/power-governor.test.mjs` | **M** HEAD blob `c98eee00be` → WT blob `95c1a75d72` (+21). THIS TURN: “non-finite setReading and sensor results refuse instead of selecting NOMINAL” (NaN/Infinity `setReading`; NaN sensor `evaluate` / `assertWithinEnvelope`). Imports `../dist/index.js`. |
| `packages-ts/galerina-core-sentinel-power/dist/power-governor.js` | gitignored; **not** rebuilt this turn (src clean). `setReading` 50–55 / `evaluate` 78–82 `Number.isFinite` → `LSP-READ-001`. `read()` 57–59 still raw. mtime newer than src, older than this-turn tests. |
| `packages-ts/galerina-core-sentinel-power/dist/index.js` | gitignored; barrel `export { PowerGovernor } from "./power-governor.js"` (line 10) |
| `packages-ts/galerina-devtools-impact/src/git-changes.mjs` | **M** HEAD blob `9cdfc36573` → WT blob `a6c16320ea` (+13 / −1). HEAD already `base.startsWith("-")`. THIS TURN: `rev-parse --verify ${base}^{commit}`, require `/^[0-9a-f]{40,64}$/i`, then `git diff --name-only -z --no-ext-diff --diff-filter=ACMRTUXB sha --`. HEAD passed the raw `base` string to `git diff` (still after `--diff-filter`, still with `--` after the ref). |
| `packages-ts/galerina-devtools-impact/tests/git-changes.test.mjs` | **M** HEAD blob `f808490835` → WT blob `ade7475d9b` (+6). THIS TURN: “option-like Git bases are refused before exec” (`--output=/tmp/pwn`, `-c`, `""`). Imports `../src/git-changes.mjs`. |
| `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts` | **M** HEAD blob `b2245478c3` → WT blob `e96d2249ff` (+16 / −1). HEAD `i32` already `const bytes = rec.count * this.blockBytes` then `new Int32Array(this.buffer, block.ptr, bytes / 4)`; HEAD `u8` already `new Uint8Array(this.buffer, block.ptr, rec.count * this.blockBytes)`. THIS TURN: both throw `LSM-BOUNDS-001` unless `block.bytes === bytes && block.segment === rec.segment`. Extra dirty vs HEAD, **not** the named view-length bullet: `Object.freeze` on the allocated `Block`. |
| `packages-ts/galerina-core-sentinel-memory/tests/pool.test.mjs` | **M** HEAD blob `33e974a5a8` → WT blob `8c472d714b` (+9). THIS TURN: “hostile: a forged Block.bytes cannot widen the live view” (`bytes: 256` → `LSM-BOUNDS-001` on `i32`/`u8`; live `i32` length 4). Imports `../dist/index.js`. |
| `packages-ts/galerina-core-sentinel-memory/dist/static-memory-pool.js` | gitignored; rebuilt this turn; `i32` 138–147 / `u8` 148–156 match check; `Object.freeze` on allocate |
| `packages-ts/galerina-core-sentinel-memory/dist/index.js` | gitignored; barrel re-exports `StaticMemoryPool` |
| `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts` | **M** extra dirty vs HEAD, **not** a named claim this receipt |
| `packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs` | **M** extra dirty vs HEAD, **not** a named claim this receipt |
| `packages-ts/galerina-core-sentinel-memory/tests/pbi.test.mjs` | **M** extra dirty vs HEAD, **not** a named claim this receipt |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-sentinel-power/src/power-governor.ts` | 6050 | `ec817ef9d86dd0163286f804f52ba4e90090aea5d7137407ae505db581292fee` |
| `packages-ts/galerina-core-sentinel-power/src/thermal-envelope.ts` | 2290 | `613081b3821f7ca67b2a88cad0300d7ddb2cd32430fdcf95dd99cf5e98d876f8` |
| `packages-ts/galerina-core-sentinel-power/tests/power-governor.test.mjs` | 4882 | `11ca9326e7dc64b69a9ebdac8c324f58562993691a556951b821be5f5276541c` |
| `packages-ts/galerina-core-sentinel-power/dist/power-governor.js` | 5709 | `9ccc1858f87d3fe16653f4e2a7cbc740e7addee94c558b1e325db0417b93537e` |
| `packages-ts/galerina-core-sentinel-power/dist/thermal-envelope.js` | 1067 | `da77c751b1ee3f42b925c61066364ffa1085e7fd90850e83c2b559b96d85f6b8` |
| `packages-ts/galerina-core-sentinel-power/dist/index.js` | 516 | `a69d2c7089b50d1a711464bebed76bcfddc58dfad2e336f8e6fe116f4da3e5d2` |
| `packages-ts/galerina-devtools-impact/src/git-changes.mjs` | 1366 | `0392b201ecc885054aece32be58c5dd944c4b77a696a37abd9f19ec7c397b629` |
| `packages-ts/galerina-devtools-impact/tests/git-changes.test.mjs` | 1539 | `34451751f16ab971e44f8c3d8ab705313efa1377b3c82a8fa529d7a455aad7fb` |
| `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts` | 9588 | `fe6c094abf11fdce09e8ffc75cc95468a55b95af0fffbfd81bd62a7506306124` |
| `packages-ts/galerina-core-sentinel-memory/tests/pool.test.mjs` | 6633 | `192e67a6738712e8676a15d470636f370e34783b9ff083f57b00a9f1619b665a` |
| `packages-ts/galerina-core-sentinel-memory/dist/static-memory-pool.js` | 8354 | `8001db3d5f2c5eea26e7da21be38b133acf6b13f0411b3c8a406832bececc32e` |
| `packages-ts/galerina-core-sentinel-memory/dist/index.js` | 686 | `8a0a67daeff1b2bebbfa475ce2abd41942d6a8ea7cbd79dbe76a2ec7136dec70` |

Independent MATCH (Get-FileHash ↔ crypto): power src
`ec817ef9…292fee`; power tests `11ca9326…76541c`; power dist
`9ccc1858…93537e`; git-changes src `0392b201…97b629`; git-changes
tests `34451751…aad7fb`; pool src `fe6c094a…306124`; pool dist
`8001db3d…ecc32e`; inventory `5361a7d7…69f290`.

Dist mtimes (UTC): `power-governor.js` `2026-09-22T12:53:16.726Z` (src
`2026-09-22T11:57:55.169Z` / tests `2026-09-23T09:29:52.490Z`);
`static-memory-pool.js` `2026-09-23T09:30:00.851Z` (src
`2026-09-23T09:29:52.490Z`); memory `dist/index.js`
`2026-09-23T09:30:00.871Z`. Named pool dist is newer than its src.
Power dist was not rebuilt this turn; pool dist was. Git-changes has
no dist; tests import src.

Inventory file sha256 `5361a7d7da035a5cbafafa2e55d32800a24f994e487ac8da236e39e46269f290`
(untracked `??` on this dirty tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (still `OPEN_ON_SCAN_SNAPSHOT`, low):

- `csf_e145f9dfd60df70053acdab4` (`occ_2e12e2d2b37dee97ca75ab9f`,
  path `packages-ts/galerina-core-sentinel-power/src/power-governor.ts`,
  scan-era `start_line` 81, title “Non-finite thermal readings select
  the nominal execution tier”)
- `csf_e28e823a7e7a74767725c9db` (`occ_3a7927bc387e8b8052b6113b`,
  path `packages-ts/galerina-devtools-impact/src/git-changes.mjs`,
  scan-era `start_line` 21, title “Impact planner passes an option-like
  base argument to Git before the option terminator”)
- `csf_ac73ec6448618999eb697045` (`occ_3fbf3d1e73f67e90b5291d8f`,
  path `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts`,
  scan-era `start_line` 195, title “Pool views trust caller-supplied
  allocation length”)

Named power/pool tests import `../dist/index.js`. Named git-changes
tests import `../src/git-changes.mjs`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A. `setReading` already throws `LSP-READ-001` unless `Number.isFinite` | src 71–76; dist 50–55; HEAD blob identical |
| A. `evaluate` already throws `LSP-READ-001` unless `Number.isFinite` | src 99–103; dist 78–82; HEAD blob identical |
| A. THIS TURN tests NaN/Infinity `setReading` | WT tests 119–128 0.2356ms `LSP-READ-001` |
| A. THIS TURN tests NaN sensor `evaluate` / `assertWithinEnvelope` | WT tests 129–137 0.2356ms `LSP-READ-001` |
| A. Power src unchanged | git status omits power-governor.ts; HEAD = WT `d0ab12cafd` |
| A. Residual: `read()` can return raw non-finite | src 79–81 / dist 57–59; extra probe `rawReadIsNaN:true` |
| B. Already rejects `base.startsWith("-")` | src 13–15 (present on HEAD `9cdfc36573`) |
| B. THIS TURN `rev-parse --verify ${base}^{commit}` then hex SHA | src 21–31; SHA `/^[0-9a-f]{40,64}$/i` |
| B. `git diff` gets `--no-ext-diff` and `--` after the SHA | src 32–34; HEAD passed raw `base` without `--no-ext-diff` |
| B. THIS TURN tests `--output=` / `-c` / `""` | WT tests 28–32 0.5697ms `/Git base/` |
| B. Residual: `--end-of-options` not used | argv is `diff … sha --`; no `--end-of-options` token |
| B. Residual: Windows git CRLF warnings on fixture | named suite printed LF→CRLF on `docs/tracked.md` twice |
| C. `i32`/`u8` already size from live `rec.count` | HEAD i32 198–200 / u8 205–206; WT still uses `rec.count * this.blockBytes` |
| C. THIS TURN `block.bytes` / `block.segment` must match live | src 199–205 and 212–218; dist 143–145 and 152–154 `LSM-BOUNDS-001` |
| C. THIS TURN forged `Block.bytes` cannot widen the view | WT tests 100–107 0.1925ms; extra probe `forgedI32.code=LSM-BOUNDS-001`, `liveI32Length:4` |
| C. Dist rebuilt for pool | dist mtime 09:30:00Z > src 09:29:52Z; suite imported dist and passed |
| C. Residual: views from ptr+length, not WeakMap slice identity | src 206 / 219 `new Int32Array(this.buffer, block.ptr, bytes / 4)` / `new Uint8Array(this.buffer, block.ptr, bytes)` |
| Power 12 named tests | `node --test tests/power-governor.test.mjs` → 12/12 |
| Git-changes 2 named tests | `node --test tests/git-changes.test.mjs` → 2/2 |
| Pool 14 named tests | `node --test tests/pool.test.mjs` → 14/14 |
| Dist not stale for named bodies | hashes + same order in src/dist; pool dist newer than src; power dist matches unchanged src; named suites imported those barrels / src and passed; extra probe imported the same dist barrels + git-changes src |
| Inventory 47/73/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → power src **clean**; `M`
   power tests; `M` git-changes src; `M` git-changes tests; `M` pool
   src; `M` pool tests; extra `M` tpl-state-buffer src / tpl tests /
   pbi tests; dist gitignored (not listed).

2. `node --test tests/power-governor.test.mjs` in
   `packages-ts/galerina-core-sentinel-power`
   → **12/12 pass**, 0 fail, 0 skip, `duration_ms 131.9179`.
   Non-finite refuse 0.2356ms; green.

3. `node --test tests/git-changes.test.mjs` in
   `packages-ts/galerina-devtools-impact`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 811.8027`.
   Option-like bases 0.5697ms; fixture 688.9591ms with two Windows
   `LF will be replaced by CRLF` warnings on `docs/tracked.md`; both
   green.

4. `node --test tests/pool.test.mjs` in
   `packages-ts/galerina-core-sentinel-memory`
   → **14/14 pass**, 0 fail, 0 skip, `duration_ms 142.6027`.
   Forged `Block.bytes` 0.1925ms; green.

Independent extra (`%TEMP%\zt-thermal-git-poolview-probe\probe.mjs`;
cwd `%TEMP%\zt-thermal-git-poolview-probe`; `file://` import of
working-tree power/memory dist barrels and git-changes src; no
production write):

| probe | result |
|---|---|
| `setReading(Number.NaN)` | **`threw:true`**, `code:LSP-READ-001`, `isPowerFault:true` |
| NaN sensor `read()` then `evaluate()` | **`rawReadIsNaN:true`**; evaluate **`code:LSP-READ-001`** |
| `discoverChangedPaths(cwd, "--output=/tmp/pwn")` | **`threw:true`**, `message:"Git base must be a non-empty ref string"` |
| forged `{bytes:256}` `pool.i32` | **`threw:true`**, `code:LSM-BOUNDS-001`, `isSecurityTrap:true`; live `i32` **`liveI32Length:4`** |

## Challenge 1 — do non-finite thermal readings still select NOMINAL? Does NaN `setReading` throw `LSP-READ-001`?

**No NOMINAL selection on this dirty tree for `setReading` / `evaluate`.
CONFIRMED closed for the named finite-reading gate (already in HEAD src;
THIS TURN tests are red-capable).** Extra probe: `setReading(NaN)` throws
`LSP-READ-001` as `PowerFault`. Named suite: NaN/Infinity `setReading`
and NaN sensor `evaluate`/`assertWithinEnvelope` green. Power src was
not modified this turn. Residual: `read()` still returns the raw
sensor value — extra probe `rawReadIsNaN:true` — so a caller that
skips `evaluate` can observe non-finite.

Scan-era object `0f6063dd…:packages-ts/galerina-core-sentinel-power/src/power-governor.ts`
is **not** recategorized. Inventory still lists the row OPEN.
Scan-era `start_line` 81 is `read()`, which remains the residual
surface.

## Challenge 2 — does an option-like `--base` still reach `git diff` before the option terminator?

**No on this dirty tree for `discoverChangedPaths`. CONFIRMED closed
for the named option-like base.** `startsWith("-")` already refused
`--output=` / `-c` on HEAD. THIS TURN additionally resolves the ref
through `rev-parse --verify ${base}^{commit}`, admits only a hex SHA,
and passes that SHA to `git diff` with `--no-ext-diff` and `--` after
the SHA. Extra probe: `--output=/tmp/pwn` throws `Git base must be a
non-empty ref string` (the pre-exec `startsWith("-")` path, not the
rev-parse failure). Named suite option-like test green. Residual:
`--end-of-options` is not used; a hex SHA cannot look like an option.
Named fixture printed Windows git CRLF warnings.

Scan-era object `0f6063dd…:packages-ts/galerina-devtools-impact/src/git-changes.mjs`
is **not** recategorized.

## Challenge 3 — can a forged `Block.bytes` widen the live `i32` view? Is dist stale? Is this 124-scan closure?

**No widen on this dirty tree. Dist not stale for the named pool body.
Not 124-scan closure.** HEAD already sized `i32`/`u8` from live
`rec.count` (forged `bytes:256` would have been ignored and returned
length 4 without throwing). THIS TURN additionally throws
`LSM-BOUNDS-001` when `block.bytes` or `block.segment` disagree with
the live record — the named tests are red-capable against HEAD (HEAD
would not throw). Extra probe: forged `i32` `LSM-BOUNDS-001`; live
length 4. Dist match-check matches src and is newer than src; named
suite imported that dist and passed; extra probe imported the same
dist barrel. CSF rows remain `OPEN_ON_SCAN_SNAPSHOT`. Independent
recount: **4** `PATCHED_AUDIT_PENDING`, **73** `PARTIAL_THIS_TREE`,
**47** `OPEN_ON_SCAN_SNAPSHOT` (0 high / 0 medium / 47 low). This
review does not recategorize the rows.

## Residuals (not findings against the three named bullets)

- Thermal: `read()` still returns a raw non-finite sensor value. Cap
  is on `setReading` / `evaluate` only. Extra probe saw
  `rawReadIsNaN:true` then `evaluate` `LSP-READ-001`.
- Git: `--end-of-options` is not passed. After THIS TURN the diff
  argv is a hex SHA then `--`; SHA cannot look like an option.
  Windows git CRLF warnings on the fixture `docs/tracked.md` are
  noise, not an option-injection path.
- Pool: views are still `new Int32Array(this.buffer, block.ptr,
  bytes / 4)` / `new Uint8Array(this.buffer, block.ptr, bytes)` —
  ptr+length over the live backing store, not a WeakMap-held
  ArrayBuffer slice identity. Extra dirty vs HEAD on this file is
  `Object.freeze` of `Block`, not the named match check.
- Extra dirty vs HEAD on `tpl-state-buffer.ts`, `tests/tpl.test.mjs`,
  and `tests/pbi.test.mjs` is outside these three bullets.
- Named power/pool suites import gitignored dist, not src. Dist was
  confirmed non-stale for the named bodies; this receipt did not
  rebuild. Git-changes tests import src.
- Inventory still lists the three IDs as `OPEN_ON_SCAN_SNAPSHOT`. This
  receipt does not reclassify them. 47 OPEN / 73 PARTIAL / 4 PATCHED
  remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not
  Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. The detectors are not
invalid against scan-era non-finite NOMINAL selection, option-like Git
base before the terminator, or caller-supplied pool view length; this
dirty tree has the named finite-reading gate (pre-existing src +
this-turn tests), rev-parse-to-hex-SHA + `--no-ext-diff` + `--` after
the SHA, and live-record `block.bytes`/`block.segment` match on
`i32`/`u8`, with executed red-capable evidence on dist/src. Residuals
above remain outside those bullets. Evidence is sufficient for those
bullets; insufficient for scan recategorization and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**

## Close

- **Verdict:** PASS scoped (three named lows). Not production admission.
- **Path:** `docs/independent-audits/2026-09-23-thermal-git-poolview-hold.md`
- **Hashes MATCH?:** yes (`Get-FileHash` ↔ `crypto.createHash('sha256')`)
- **Suite counts:** power-governor **12/12**; git-changes **2/2**; pool **14/14**
- **Extra-probe:** `%TEMP%\zt-thermal-git-poolview-probe` — NaN `setReading` `LSP-READ-001`; `--output=` throws `Git base must be a non-empty ref string`; forged `Block.bytes` `i32` `LSM-BOUNDS-001`
- **Residuals:** `read()` still returns raw non-finite; `--end-of-options` not used; Windows git CRLF on fixture; views still ptr+length not WeakMap slice identity
- **git status (named):** power src clean; `M` power tests; `M` git-changes src; `M` git-changes tests; `M` pool src; `M` pool tests; extra `M` tpl-state-buffer src / tpl tests / pbi tests; `??` this receipt; dist gitignored. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
