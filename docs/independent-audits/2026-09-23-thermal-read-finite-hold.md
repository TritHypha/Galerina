# Independent audit — PowerGovernor.read() finite refuse

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
`csf_e145f9dfd60df70053acdab4` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `PowerGovernor.read()` now throws `PowerFault` `LSP-READ-001` when the
  injected sensor (or last reading) is non-finite, instead of returning a
  raw `NaN`/`Infinity`.
- Hostile: sensor `() => NaN` and `() => Infinity` make `read()` throw
  `LSP-READ-001`.
- Positive: finite sensor `90` still returns `90`; default `lastReading` `0`
  still returns `0`.
- `evaluate()` still refuses non-finite.
- Tests `power-governor.test.mjs` **12/12** plus `thermal-envelope.test.mjs`
  **6/6** (**18/18**).
- Residual: a throwing sensor still propagates unwrapped.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/power-governor.js`, hashed working-tree bytes, re-ran
`npx tsc -p tsconfig.json` then the named suites, and executed an extra
probe from `%TEMP%` (not by trusting the named tests alone). Independent
`crypto.createHash('sha256')` and `Get-FileHash` **MATCH** each other on
every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-sentinel-power/src/power-governor.ts` | **M** HEAD blob `d0ab12cafd` → WT blob `16d41cc81c`. HEAD `read()` returned `this.sensor()` / `this.lastReading` raw. THIS TURN: capture `tempC`, `Number.isFinite` else `PowerFault("LSP-READ-001")`. `setReading` / `evaluate` already refused non-finite on HEAD. |
| `packages-ts/galerina-core-sentinel-power/tests/power-governor.test.mjs` | **M** HEAD blob `95c1a75d72` → WT blob `d9c3c1fd48` (+9). THIS TURN: `nanSensor.read()` and `infSensor.read()` assert `LSP-READ-001`. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-sentinel-power/src/thermal-envelope.ts` | **clean** vs this HEAD. Envelope `Number.isFinite` is `LSP-ENV-001`, not the named `read()` bullet. |
| `packages-ts/galerina-core-sentinel-power/tests/thermal-envelope.test.mjs` | **clean** vs this HEAD. |
| `packages-ts/galerina-core-sentinel-power/dist/power-governor.js` | gitignored; rebuilt this review (`tsc`); `read()` 57–63 matches src finite refuse. |

Prior independent receipt
`docs/independent-audits/2026-09-23-thermal-git-poolview-hold.md` recorded
the residual that `read()` could still return raw non-finite if callers
skipped `evaluate`. That residual is closed on this dirty tree. The new
residual is an unwrapped throwing sensor.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-sentinel-power/src/power-governor.ts` | 6211 | `e6d6d37a6a34d0f3ef68307510b46b22510143046aa81d2c8d666b1dbfe7af37` | 2026-09-23T17:36:14.964Z |
| `packages-ts/galerina-core-sentinel-power/src/errors.ts` | 593 | `757de987f929398c22f13f1dc45413c8f135221a1ea5a03c1c1b7e3648eb80f7` | 2026-09-08T20:31:56.054Z |
| `packages-ts/galerina-core-sentinel-power/src/thermal-envelope.ts` | 2290 | `613081b3821f7ca67b2a88cad0300d7ddb2cd32430fdcf95dd99cf5e98d876f8` | 2026-09-08T20:31:56.061Z |
| `packages-ts/galerina-core-sentinel-power/tests/power-governor.test.mjs` | 5236 | `4703f45406f70eefa3617242d02131845e2235ddb86e8f88a90803c78123d462` | 2026-09-23T17:36:14.964Z |
| `packages-ts/galerina-core-sentinel-power/tests/thermal-envelope.test.mjs` | 1985 | `19f9abb6ccd34d8ae9c6b13a8e55a9f4a421fb2e8437625b6bf92ff2488d7a70` | 2026-09-08T20:31:56.062Z |
| `packages-ts/galerina-core-sentinel-power/dist/power-governor.js` | 5884 | `983f08afdcd914a532c99cdef2811b58aaeb8cec5384b353463c9a69110558b5` | 2026-09-23T17:37:54.302Z |
| `packages-ts/galerina-core-sentinel-power/dist/index.js` | 516 | `a69d2c7089b50d1a711464bebed76bcfddc58dfad2e336f8e6fe116f4da3e5d2` | 2026-09-23T17:37:54.305Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suites import dist (`packages-ts/.gitignore`
`dist/`). `dist/index.js` re-exports `PowerGovernor` from
`./power-governor.js`.

Inventory `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` already
records `csf_e145f9dfd60df70053acdab4` as `PARTIAL_THIS_TREE` (low;
title “Non-finite thermal readings select the nominal execution tier”;
path `packages-ts/galerina-core-sentinel-power/src/power-governor.ts`).
This review does **not** recategorize that row.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| `read()` finite refuse | sensor or last reading non-finite → `PowerFault` `LSP-READ-001` | src 79–85; dist 57–63 | hostile test **pass** (`nanSensor.read`, `infSensor.read`) | TEMP: NaN / `+Infinity` / `-Infinity` all `threw:true` `code:LSP-READ-001` | last-reading non-finite is unreachable via public `setReading` (already refuses); default is `0` |
| hostile NaN / Infinity sensor | `() => NaN` and `() => Infinity` make `read()` throw `LSP-READ-001` | tests 129–146 | same test **pass** 0.3004ms | TEMP `nanRead` / `infRead` | named tests omit `-Infinity`; extra probe closed it |
| positive finite 90 | finite sensor 90 still returns 90 | tests 103–109 `assert.equal(g.read(), 90)` | **pass** 0.1654ms | TEMP `finite90.value=90` | — |
| default lastReading 0 | `read()` defaults to 0 | tests 12–14 | **pass** 0.8647ms | TEMP `defaultRead.value=0` | — |
| `evaluate()` still refuses | non-finite evaluate throws `LSP-READ-001` | src 103–107 calls `this.read()` then redundant `isFinite`; tests 134–137 | **pass** | TEMP `nanEvaluate` / `infEvaluate` both `LSP-READ-001` | named tests cover NaN evaluate, not Infinity evaluate; extra probe closed Infinity |
| focused tests | 12/12 + 6/6 = 18/18 | named commands below | **18/18** 0 fail 0 skip `duration_ms 134.2415` | TEMP is extra, not a count | suites import dist, not src |
| throwing-sensor residual | sensor throw is not wrapped as `PowerFault` | src 80 `this.sensor()` before finite check | **not** in named tests | TEMP `throwingSensor.sameObject:true` `name:SensorBoom` `isPowerFault:false` `wrapped:false`; same on `evaluate()` | **CONFIRMED residual** |
| production admission / PATCHED | independent production admission; finding promotion | — | — | — | **HOLD**; stay **PARTIAL_THIS_TREE** |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   and tests **M**. `Galerina.worktrees` is not this tree.

2. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-core-sentinel-power` → **exit 0**.

3. `node --test tests/power-governor.test.mjs tests/thermal-envelope.test.mjs`
   in `packages-ts/galerina-core-sentinel-power`
   → **18/18 pass**, 0 fail, 0 skip, `duration_ms 134.2415`.
   Breakdown: power-governor **12/12**, thermal-envelope **6/6**.

Independent extra (`%TEMP%\zt-thermal-read-finite-probe\probe.mjs`;
cwd not the worktree; `file://` import of working-tree `dist/index.js`;
no production write):

| probe | result |
|---|---|
| default `read()` | `value: 0` |
| sensor `() => 90` `read()` | `value: 90` |
| sensor `() => NaN` `read()` | `PowerFault` `LSP-READ-001` |
| sensor `() => Infinity` `read()` | `PowerFault` `LSP-READ-001` |
| sensor `() => -Infinity` `read()` | `PowerFault` `LSP-READ-001` |
| sensor `() => NaN` / `Infinity` `evaluate()` | `PowerFault` `LSP-READ-001` |
| throwing sensor `read()` / `evaluate()` | same `Error` object, `name: SensorBoom`, **not** `PowerFault` |
| sensor `() => undefined` / `() => "90"` `read()` | `PowerFault` `LSP-READ-001` (fail-closed; extra, not named) |
| `setReading(NaN)` | `PowerFault` `LSP-READ-001` |

## Challenge 1 — does `read()` still return raw NaN/Infinity?

**No on this dirty tree. CONFIRMED closed for the named `read()` path.**
HEAD returned the sensor/last reading without `Number.isFinite`. WT
throws `PowerFault` `LSP-READ-001`. Hostile named tests and the TEMP
probe both saw `LSP-READ-001` for NaN and Infinity. Finite 90 and
default 0 still return those numbers. `evaluate()` still refuses
because it calls `read()` (and keeps a redundant `isFinite` check).

## Challenge 2 — is this PATCHED / production admission?

**No. Stay PARTIAL_THIS_TREE. Production admission HOLD.** A throwing
sensor still propagates unwrapped (`SensorBoom`, not `PowerFault`).
Named tests do not cover that residual; extra probe does. Dirty HEAD,
unsigned TypeScript, tests load gitignored `dist/`. Inventory was not
promoted. Independent production admission remains **HOLD**. Not 124-scan
closure. Not Astra. Not clean-HEAD evidence.

## Residuals (not findings against the named `read()` finite claim)

- **Throwing sensor still propagates unwrapped.** `read()` / `evaluate()`
  call `this.sensor()` before the finite check and do not catch. TEMP
  probe: `sameObject:true`, `isPowerFault:false`, `wrapped:false`.
- Named tests omit `-Infinity` `read()` and Infinity `evaluate()`. Extra
  probe closed both as `LSP-READ-001`.
- Public `setReading` already refuses non-finite, so the “last reading”
  non-finite branch of `read()` is defensive rather than live via the
  public setter. Default `lastReading` remains `0`.
- `evaluate()` `isFinite` after `this.read()` is now redundant if `read()`
  always throws first.
- Independent production admission HOLD. Dirty HEAD, no commit, no signed
  certified deployment.
- Finding inventory is **not** promoted. `csf_e145f9dfd60df70053acdab4`
  stays **PARTIAL_THIS_TREE**. This receipt does not recategorize scan
  rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named `read()` finite-refuse claim.
Evidence is sufficient that `read()` throws `LSP-READ-001` on non-finite
sensor/last reading, that finite 90 and default 0 still return, and that
`evaluate()` still refuses non-finite. Evidence is insufficient for
PATCHED promotion (throwing-sensor residual) and for production
admission.

**PASS scoped.** Hashes **MATCH**. Tests **12/12 + 6/6 = 18/18**.
Finding stays **PARTIAL_THIS_TREE**. Residual: throwing sensor
unwrapped. Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
