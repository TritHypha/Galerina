# Independent audit — ZeroCopyMapper stages the same bytes it verified

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `ZeroCopyMapper` stages the same bytes it verified.

- `map()` copies `ownedSource = new Uint8Array(source.byteLength);
  ownedSource.set(source)` before the integrity gate.
- SharedArrayBuffer sources are refused (`LSIO-MAP-002`).
- `enforceBlock` and `backingBytes.set` use the owned snapshot
  (`ownedSource.subarray`), not a live view of the caller `source`.
- Hostile: mutating `source[0]=0xff` inside `enforceBlock` after the
  original digest still leaves mapped `i32[0]===10`.

Tests: `packages-ts/galerina-core-sentinel-io/tests/zero-copy-mapper.test.mjs`
import `../dist/index.js`. Tests import dist. Dist `ownedSource` copy /
`LSIO-MAP-002` / `backingBytes.set(slice)` match src.

Scan `csf_78294e1131c5f50b6041a758` is **PARTIAL_THIS_TREE**. Inventory
**73 OPEN / 47 PARTIAL / 4 PATCHED** was independently recounted from
this tree’s inventory JSON `disposition_counts` and from walking all
124 `findings[].disposition` values. This is **not** 124-scan closure.
Not Astra. Not production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). Tests
import `../dist/index.js`, which re-exports `ZeroCopyMapper` from
`./zero-copy-mapper.js`. Dist `zero-copy-mapper.js` mtime
(`2026-09-22T12:53:14.192Z`) is newer than clean-vs-HEAD
`src/zero-copy-mapper.ts` (`2026-09-22T08:04:16.234Z`). Dist is **not
stale** vs src: both refuse `source.buffer instanceof SharedArrayBuffer`
with `LSIO-MAP-002`; both copy `ownedSource` then `set(source)`; both
take `slice = ownedSource.subarray(start, end)` for `enforceBlock` and
`backingBytes.set`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-sentinel-io/tests/zero-copy-mapper.test.mjs`
(+15 lines: the named hostile mutate-during-`enforceBlock` case).
`src/zero-copy-mapper.ts` is **clean vs HEAD** (git blob
`fdba468b4294b508f3c5fb36fc16d2fe99c51a2c`). Dist is untracked
(gitignored).

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-sentinel-io/src/zero-copy-mapper.ts` | `b0d9aaf7cc448c037f20b860962009bf80c1dadb5eae8be37b63f588d763fac7` |
| `packages-ts/galerina-core-sentinel-io/dist/zero-copy-mapper.js` | `a455e1e457cbee866d4b638c3389c38873f350fd1778a66fea115f7da5c2914a` |
| `packages-ts/galerina-core-sentinel-io/tests/zero-copy-mapper.test.mjs` | `c5a34bcc03233818175933c2d49ced3b9951de268d677d89c9ce10cb1aa16ff0` |

`dist/index.js` (re-export only; sha256
`48b9180aef4c978ebb58ff67f5f44cbf9ce64c3454ca1eae26f842e5b5e4ab78`)
exports `ZeroCopyMapper` from `./zero-copy-mapper.js`. Dist is not in
HEAD. HEAD test blob `8e5930dcc989a8e734ee29591879280f6c307263` lacks
the hostile mutate-during-verify case. Working-tree test blob
`d480d43c3b8627ef6649346f0d27fcbb3a0b318a`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob of `src/zero-copy-mapper.ts` had no `ownedSource`
copy and no `LSIO-MAP-002`. It used `source.subarray(start, end)` for
both `enforceBlock` and `backingBytes.set`. The owned snapshot /
SharedArrayBuffer-source refuse landed in
`eb1645a4fd6aedec3fabb646ec5c84001aa30ff1`
(`fix(security): checkpoint runtime and tooling hardening`) and is the
same blob as HEAD.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `map()` copies an owned snapshot before the gate | src 78–79 / dist 53–54: `ownedSource = new Uint8Array(source.byteLength); ownedSource.set(source)` before the block loop |
| `enforceBlock` and `backingBytes.set` use that snapshot | src 91, 95, 97 / dist 63, 66, 67: `slice = ownedSource.subarray(...)`; gate then `backingBytes.set(slice, block.offset)` |
| SharedArrayBuffer **source** refused `LSIO-MAP-002` | src 72–77 / dist 50–52; named test `"source SharedArrayBuffer is refused (LSIO-MAP-002)"`; independent `sab_source_code=LSIO-MAP-002` |
| Hostile mutate `source[0]=0xff` after digest still `i32[0]===10` | named hostile; independent `hostile_i32_0=10`, `hostile_view0=10`, `hostile_source0=255` |
| Dist copy / refuse not stale vs src | **CONFIRMED** same SAB check, same `ownedSource.set`, same `ownedSource.subarray` for gate and stage |
| Scan-era live `source.subarray` would stage the mutation | reconstructed `0f24ca30` loop: `scan_era_hostile_i32_0=255` |
| Named node tests | **8/8 pass**, `duration_ms 132.6349` |
| 124-finding scan | **not this claim** (`csf_78294e1131c5f50b6041a758` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-io/tests/zero-copy-mapper.test.mjs`
   → **8/8 pass**, 0 fail, `duration_ms 132.6349`.
   - `map() returns blocks whose i32()/view() reflect the source bytes` — **green** (2.6047ms)
   - `mutating the source AFTER map() does NOT change the mapped view (staged once)` — **green** (0.2034ms)
   - `two calls to view() return views over the SAME backing buffer (zero-copy access)` — **green** (0.2267ms)
   - `shared:true uses a SharedArrayBuffer backing buffer` — **green** (0.2341ms)
   - `a TAMPERED source makes map() throw HardenedBorderViolation` — **green** (0.4848ms)
   - `source SharedArrayBuffer is refused (LSIO-MAP-002)` — **green** (0.2126ms)
   - `source shorter than totalBytes throws LSIO-MAP-001` — **green** (0.1725ms)
   - `hostile: mutating source during enforceBlock cannot change staged bytes` — **green** (0.2133ms)

Independent extra probes (eval only; temp
`%TEMP%\zero-copy-mapper-hold-probe.mjs`, not production; imports the same
gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist:

- hostile `source[0]=0xff` after digest → mapped `i32[0]=10`, `view()[0]=10`, caller `source[0]=255`
- SAB **source** → `SecurityTrap` `LSIO-MAP-002`
- `{ shared: true }` → `mapper.buffer instanceof SharedArrayBuffer === true`; caller `source.buffer` is still `ArrayBuffer`
- after `map()`, `view()[0]=0x99` → mapped `i32[0]=153` and backing byte 0 is `153` (`view().buffer === mapper.buffer`)

Scan-shaped reconstruction of `0f24ca30` (no `ownedSource`, `slice = source.subarray`, gate then `backingBytes.set(slice)`):

- same hostile `source[0]=0xff` after digest → staged `i32[0]=255`

That is the scan-era match: verify and stage aliased the caller buffer, so a post-digest source mutation was copied into the backing buffer. Current dist copies first and never stages the live caller view.

## Challenge 1 — does `map()` still verify a live `source` view and then stage that same live view?

**No. CONFIRMED copied first.** Locator: src 78–79 / dist 53–54 copy;
src 91 / dist 63 slice from `ownedSource`. Named hostile and independent
`hostile_i32_0=10` with `hostile_source0=255`. Detector can go green on
the honest snapshot.

## Challenge 2 — does mutating `source[0]=0xff` inside `enforceBlock` after the original digest change staged `i32[0]`?

**No. CONFIRMED still 10.** Named hostile `assert.equal(nums.i32()[0], 10)`
and independent `hostile_i32_0=10`. Scan-shaped live-`subarray` loop
stages `255`.

## Challenge 3 — is a SharedArrayBuffer **source** still admitted?

**No. CONFIRMED refused.** `LSIO-MAP-002` src 72–77 / dist 50–52. Named
test and independent `sab_source_code=LSIO-MAP-002`.

## Challenge 4 — are dist copy / `LSIO-MAP-002` checks stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist 50–54 and 63–67 are the same predicates as src 72–79
and 91–97. Tests import that dist re-export.

## Residuals (not findings against the named owned-snapshot / SAB-source-refuse claim)

- `view()` / `i32()` remain live views over the backing buffer after
  `map()`. Independent `view()[0]=0x99` mutates mapped `i32[0]` to `153`
  and backing byte 0. That is the documented zero-copy **access**
  contract, not a source TOCTOU.
- `{ shared: true }` makes the **output** backing a `SharedArrayBuffer`.
  Independent `shared_true_output_is_sab=true` while
  `shared_true_source_is_sab=false`. Cross-thread mutation of the staged
  buffer is not closed by `LSIO-MAP-002`.
- A hostile **monitor** that mutates the `bytes` argument after digest
  still poisons staging: `ownedSource.subarray` aliases the owned
  snapshot, so independent `bytes[0]=0xff` after `orig()` yields
  `hostile_monitor_mutates_slice_i32_0=255` while caller `source[0]`
  stays `10`. The named claim is caller-`source` mutation; `IntegrityMonitor`
  itself does not mutate.
- Scan ID `csf_78294e1131c5f50b6041a758`
  (`Sentinel ingestion can stage bytes different from those verified`,
  medium, `packages-ts/galerina-core-sentinel-io/src/zero-copy-mapper.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `e949ed71dffe1c19dd94e0c9a6edb7552af9e9a4de50f82bad05d76db9f062f1`
  `disposition_counts` independently recounted **73 OPEN_ON_SCAN_SNAPSHOT
  / 47 PARTIAL_THIS_TREE / 4 PATCHED_AUDIT_PENDING** (`n=124`). This
  review did not re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named owned-snapshot / SAB-source-refuse /
hostile post-digest `source` mutation claim. Detector is not invalid.
Evidence is sufficient for those bullets; insufficient for post-map
view mutability, shared output backing, untrusted-monitor slice
mutation, scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
