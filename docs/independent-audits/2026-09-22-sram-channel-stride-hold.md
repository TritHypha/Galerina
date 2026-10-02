# Independent audit — LocalSramBus channel handles refuse out-of-stride access

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `LocalSramBus` channel handles cannot read or write outside
their 2048-byte stride.

- `channel()` returns `read`/`write` that refuse non-safe-integer
  offsets/lengths and refuse when `offset > maxInts` (512) or
  `length > maxInts - offset` (`LSM-PBI-003`).
- Hostile: `write(511, Int32Array of length 2)` on channel 0 throws
  `LSM-PBI-003` and does not change channel 1’s first word (stays 222).
- Negative offset and `Infinity` length refuse `LSM-PBI-003`.
- 513-int write and `read(512, 1)` refuse.

Tests: `packages-ts/galerina-core-sentinel-memory/tests/pbi.test.mjs`
(8 tests). Import `../dist/index.js`, which re-exports `LocalSramBus`
from `./photonic-bridge-interface.js`.

Scan `csf_e5f6b2d8cd56326fcafa7f6f` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` independently
recounts **69 OPEN / 51 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 69,
`PARTIAL_THIS_TREE` 51, `PATCHED_AUDIT_PENDING` 4, `n` 124). Assigned
hint 71/49/4 does **not** match this file. This reviewer did not
re-adjudicate the other 123 IDs. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild. Dist is gitignored (`packages-ts/.gitignore`
line 5 `dist/`). Dist `photonic-bridge-interface.js` mtime
(`2026-09-23T02:00:30.948Z`) is newer than clean-vs-HEAD
`src/photonic-bridge-interface.ts` (`2026-09-22T07:17:25.128Z`). Dist is
**not stale** vs src: both use `maxInts = stride/4`, both refuse
non-safe-integer offset/length, both refuse
`offset > maxInts || length > maxInts - offset` as `LSM-PBI-003`, both
`assertInBounds(..., base + stride)`, both `read` via `src.slice()`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-sentinel-memory/tests/pbi.test.mjs`
(+27 / −2: `instanceof HardenedBorderViolation` + `err.code` on the
existing 513-write / `read(512,1)` case; two new hostile tests).
`src/photonic-bridge-interface.ts` is **clean vs HEAD** (git blob
`756da245ae2fe520c7b7cbd8d9e1858738d26713`). Dist is untracked
(gitignored). Unrelated dirty on this worktree was not this claim.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions`. Scan-revision source
`0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of this HEAD.
That blob’s `read` checked only `pool.capacityBytes` (no safe-integer
gate, no `maxInts`); `write` checked pool capacity first and only then
`if (offset * 4 + data.length * 4 > stride)` against `base + stride`.
Current HEAD src (landed in ancestor `eb1645a4f`) already carries the
`LSM-PBI-003` stride predicates.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-sentinel-memory/src/photonic-bridge-interface.ts` | `f3ba901bce7bf19540dfcd64705cdc0d643227c902c0ae4103713887dcd5d511` |
| `packages-ts/galerina-core-sentinel-memory/dist/photonic-bridge-interface.js` | `e187e0d7d384c1a5eca26ab91fc5b37139440c33595c0e7261243f9f95123eed` |
| `packages-ts/galerina-core-sentinel-memory/tests/pbi.test.mjs` | `58faaa5ddc883178471c0919db63a9c1a6e112d2a2dc3afcb697e62307281ff7` |

`dist/index.js` (re-export only; sha256
`8a0a67daeff1b2bebbfa475ce2abd41942d6a8ea7cbd79dbe76a2ec7136dec70`)
exports `PhotonicBridgeInterface`, `LocalSramBus` from
`./photonic-bridge-interface.js`. Dist is not in HEAD. HEAD test blob
`1285cba6534b2532cd1930af857131413c42c541` already throws on 513-write
and `read(512,1)` but only `assert.ok(err)`. Working-tree test blob
`496e15a8ceff75fb1e92cdf7d43ff81a2ac2477c`.

Inventory file sha256
`360a56825276f8fc2146bfc1f16d548f89e74761607e957318df4d1a6d3c4b45`
(`n` 124, `scan_revision` `0f24ca30…`, `worktree_head` `91b4dec0…`,
`overall` `INCOMPLETE_NON_AUTHORITATIVE`). Finding
`csf_e5f6b2d8cd56326fcafa7f6f` title “SRAM channel handles can read and
write outside their stride”, medium, path
`packages-ts/galerina-core-sentinel-memory/src/photonic-bridge-interface.ts`
start_line 52, disposition `PARTIAL_THIS_TREE`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `CHANNEL_STRIDE` is 2048; `maxInts` is 512 | src 27 / 50; dist 14 / 32: `stride / 4` |
| non-safe-integer offset/length refuse `LSM-PBI-003` | src 58–59 / dist 40–41 `Number.isSafeInteger` + `>= 0`; named hostile negative / `Infinity`; independent `NaN` / `1.5` / `-Inf` same code |
| `offset > maxInts \|\| length > maxInts - offset` refuse `LSM-PBI-003` | src 61–62, 73–74 / dist 43–44, 55–56 |
| `write(511, Int32Array length 2)` throws `LSM-PBI-003`; channel 1 stays 222 | named hostile; independent `hostile_write_511_len2=HardenedBorderViolation:LSM-PBI-003`, `ch1_first_after_overflow=222` |
| 513-int write and `read(512,1)` refuse | named test + independent both `LSM-PBI-003` “channel access exceeds stride” |
| `assertInBounds` uses channel end `base + stride`, not pool capacity | src 65, 77 / dist 47, 59; `MemoryValidator.assertInBounds` src 41–55 is half-open `[ptr, ptr+len)` inside `[0, capacity)` |
| `read` returns a detached copy | src 67 / dist 49 `src.slice()`; independent mutate-returned-view leaves pool word `7` |
| Dist predicates not stale vs src | **CONFIRMED** same `maxInts`, same safe-integer gate, same `offset > maxInts \|\| length > maxInts - offset`, same `base + stride`, same `slice` |
| Scan-era `read(512,1)` would succeed | reconstructed `0f24ca30` read checks `pool.capacityBytes` only: `scan_read_512_1=NO_THROW`. Current dist refuses |
| Named node tests | **8/8 pass**, 0 fail, `duration_ms 132.8747` |
| 124-finding scan | **not this claim** (`csf_e5f6b2d8cd56326fcafa7f6f` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-memory/tests/pbi.test.mjs`
   → **8/8 pass**, 0 fail, `duration_ms 132.8747`.
   - `LocalSramBus.validateBusIntegrity() === true` — **green** (1.0324ms)
   - `channel read/write round-trips` — **green** (0.8464ms)
   - `distinct channels are strided (do not alias)` — **green** (0.1768ms)
   - `attachExternalBus('photonic') throws HardenedBorderViolation` — **green** (0.472ms)
   - `attachExternalBus('local') is a no-op (already attached)` — **green** (0.2282ms)
   - `channel read/write cannot exceed the channel stride` — **green** (0.252ms)
   - `hostile: an overflowing write cannot mutate the next channel` — **green** (0.2062ms)
   - `hostile: negative offset and non-integer length are refused` — **green** (0.1898ms)

Independent extra probes (eval only; temp
`%TEMP%\sram-channel-stride-probe.mjs`, not production; imports the same
gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist, pool `totalBytes=8192`:

- `write(511, Int32Array(2))` → `HardenedBorderViolation` `LSM-PBI-003`; channel 1 first word stays `222`
- `read(-1, 1)` / `read(0, Infinity)` / `NaN` / `1.5` / `-Infinity` → `LSM-PBI-003`
- `write(0, 513 ints)` and `read(512, 1)` → `LSM-PBI-003`
- `write(511, Int32Array([111]))` succeeds; channel 1 stays `222`
- `write(0, Int32Array(512))` and `read(0, 512)` succeed (exact stride)
- `read` slice is detached (`got[0]=999` does not change pool)
- `channel(Number.MAX_SAFE_INTEGER)` / `channel(4)` → `SecurityTrap` `LSM-BOUNDS-001` on `base`
- `channel(-1)` / `1.5` / `Infinity` → `LSM-PBI-002`

Scan-shaped reconstruction of `0f24ca30` (read vs `pool.capacityBytes`
only; write inner stride `if` then `assertInBounds`):

- `read(512, 1)` → **`READ_OK`** (the scan-era hole)
- `write(511, 2)` → `LSM-BOUNDS-001` (scan-era write of this shape was already trapped, as `SecurityTrap` not `LSM-PBI-003`)
- `write(0, 513)` → `LSM-BOUNDS-001`

## Challenge 1 — does `write(511, Int32Array length 2)` mutate channel 1?

**No. CONFIRMED refused** for an ordinary `Int32Array`. Named hostile
`assert.equal(b.read(0, 1)[0], 222)` and independent
`ch1_first_after_overflow=222`. Detector can go red.

## Challenge 2 — do negative offset and `Infinity` length still proceed?

**No. CONFIRMED refused.** `Number.isSafeInteger(Infinity)===false`;
`offset < 0` trips before arithmetic. Named hostile and independent
`neg_offset` / `inf_length` are `LSM-PBI-003`.

## Challenge 3 — do 513-int write and `read(512, 1)` still proceed?

**No. CONFIRMED refused.** `513 > 512 - 0` and `1 > 512 - 512`. Named
test plus independent both `LSM-PBI-003`. Scan-era `read(512, 1)` was
`READ_OK` against pool capacity 8192.

## Challenge 4 — are dist stride checks stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist read/write predicates match src 58–79. Tests import
that dist re-export.

## Challenge 5 — is there TOCTOU on `data.length`?

**Yes, on a shadowed `length` getter; not on the named ordinary array.**
`%TypedArray%.prototype.length` is a configurable accessor. Independent
probe: `Object.defineProperty` an own getter on a real `Int32Array([111,111])`
that returns `1` for the stride check then `2` for view construction.
`write(511, data)` returned `NO_THROW` and channel 1’s first word became
`111`. A `Proxy` of `Int32Array` does the same. Ordinary
`Int32Array.from({length:2})` (named hostile) still refuses. This is
**not** a finding against the named ordinary-array bullets; it is why
the author-named residual “TOCTOU none” is **not** adopted here.

## Residuals (not findings against the named ordinary-array / numeric-offset claim)

- Shadowed / proxied `Int32Array.length` can change between the
  `maxInts` check, `assertInBounds`, and `new Int32Array(..., data.length)`.
  Snapshotting `data.length` once would close that path; not claimed
  closed. Named hostile uses a plain array and stays refused.
- `read(512, 0)` and `write(512, empty Int32Array)` are `NO_THROW`
  (half-open exclusive end; no bytes of channel 1 change).
- Huge `channel(id)` such that `id * stride` is not a safe integer, or
  `base` is past `pool.capacityBytes`, throws `SecurityTrap`
  `LSM-BOUNDS-001` from `assertInBounds` on `base`, not `LSM-PBI-003`.
  Independent `huge_id_max_safe` and `id_4_beyond_pool` confirm the gate.
- `validateBusIntegrity()` is unconditionally `true` for the local bus
  (not this claim).
- This is in-process SRAM over `StaticMemoryPool`, not a photonic host.
- Scan ID `csf_e5f6b2d8cd56326fcafa7f6f`
  (`SRAM channel handles can read and write outside their stride`,
  medium, `packages-ts/galerina-core-sentinel-memory/src/photonic-bridge-interface.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `360a56825276f8fc2146bfc1f16d548f89e74761607e957318df4d1a6d3c4b45`
  independently tallies **69 OPEN / 51 PARTIAL / 4 PATCHED**. This
  review did not re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named ordinary-`Int32Array` /
numeric-offset refuse / channel-1-stays-222 claim. Detector is not
invalid: the named hostiles go red. Evidence is sufficient for those
bullets; insufficient for shadowed-`length` isolation, scan closure,
photonic hardware, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
