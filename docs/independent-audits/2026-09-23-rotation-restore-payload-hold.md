# Independent audit — rotation restore captures payloadJson/hmac once

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim `csf_6955d450f0b42e29883196a8`:
`restoreRegistryRotationCheckpoint` captures `payloadJson` and `hmac`
once, then MACs and `JSON.parse`s that captured string. A Proxy that
returns authentic `payloadJson` on first get restores
`acceptedGenerationId` of 64 `a`s. A Proxy that always returns
`{"schema":"forged"}` throws (malformed / auth / JSON / proxy invariant).

Scan row is **PARTIAL_THIS_TREE**. This review does **not** promote it.
Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **63 OPEN / 57
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 63, `PARTIAL_THIS_TREE`
57, `PATCHED_AUDIT_PENDING` 4; `n` 124; disposition sum 124). Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suite imports gitignored `../dist/index.js`. This reviewer did not
rebuild. Dist `registry-key-rotation.js` mtime `2026-09-23T07:39:03Z`
is newer than src `2026-09-23T07:38:38Z`. Independent extra probes
imported `dist/index.js` from `%TEMP%` (not production).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-tower-citizen/src/registry-key-rotation.ts` | **M** HEAD blob `62cada0e0d` → WT blob `ea0e93e512` (+14 / −5 in file; restore-only capture-before-validate) |
| `packages-ts/galerina-tower-citizen/tests/registry-key-rotation.test.mjs` | **M** HEAD blob `5af92d0845` → WT blob `03e8e5d87c` (+35 hostile Proxy asserts) |
| `packages-ts/galerina-tower-citizen/dist/registry-key-rotation.js` | gitignored (`packages-ts/.gitignore` `dist/`) |

HEAD restore already assigned `const payloadJson = checkpoint.payloadJson`
**after** live `typeof checkpoint.payloadJson` / length / hmac regex
checks, then MACed and parsed the locals. Scan revision `0f24ca30`
did **not** capture: it MACed `checkpoint.payloadJson` then
`JSON.parse(checkpoint.payloadJson)` (live gets at scan-era 264–277).
Working-tree restore captures **before** the type checks.

## Source hashes on this tree

Author-named hashes MATCH all three files. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-tower-citizen/src/registry-key-rotation.ts` | 18153 | `76f980f5c965dee7c4295097b87105201909ed65e8467ec37581353f9c6da8db` |
| `packages-ts/galerina-tower-citizen/dist/registry-key-rotation.js` | 14681 | `44c6a2b563239e9e68fd43582c77f8adf1027b525791ff0e935945f55487970c` |
| `packages-ts/galerina-tower-citizen/tests/registry-key-rotation.test.mjs` | 12447 | `62a61a176a20c9eac18a3220ba61c0b76b3facd51a57d2c4d41c9fefb6ca392b` |

Inventory file sha256 `29538880ffe26c3739833b320eabb3f252ae9d2b07e8c72a71b24b9076ca2d6b`.
`findings_json_sha256` pin `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
CSF row `csf_6955d450f0b42e29883196a8` (`occ_c1357122669f4ed6f9d7da55`,
medium, path `packages-ts/galerina-tower-citizen/src/registry-key-rotation.ts`,
scan-era `start_line` 264, title “Checkpoint restore authenticates
different bytes from the state it restores”).

`dist/index.js` re-exports `restoreRegistryRotationCheckpoint` from
`./registry-key-rotation.js` (line 93). Named tests import that barrel.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Capture `payloadJson` and `hmac` **once**, before validate | src 259–260 / dist 139–140 `const payloadJson = checkpoint.payloadJson;` then `const hmac = checkpoint.hmac;` |
| Type/length checks use captured locals, not live getters | src 261–269 / dist 141–147 `typeof payloadJson` / `typeof hmac`; src+dist `typeof checkpoint.payloadJson` **absent** in restore |
| MAC uses the captured string | src 270–274 / dist 148 `checkpointMac(ringMacKey, payloadJson)` and `Buffer.from(hmac, "hex")` |
| `JSON.parse` uses the captured string | src 283 / dist 156 `JSON.parse(payloadJson)`; no `JSON.parse(checkpoint.payloadJson)` |
| No live `checkpoint.payloadJson` / `.hmac` after the capture lines | independent body slice of src+dist restore: both **false** |
| Dist not stale vs src for capture-before-validate | hashes + same order in both bodies; dist mtime newer; named test imports dist and passed |
| Proxy first-get authentic restores 64 `a`s | named test 364–376; independent Proxy **and** `defineProperty`: `acceptedGenerationId` 64 `a`s, payload reads **1** |
| Always-`{"schema":"forged"}` throws malformed/auth/JSON/proxy | named test 377–389 `/malformed\|authentication failed\|not JSON\|proxy/i`; frozen-target Proxy → engine proxy invariant; `defineProperty` always-forged → `authentication failed` |
| Inventory 63/57/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not this claim** |

## Command receipts

1. `node --test --test-timeout=60000 --test-name-pattern "authenticates crash" packages-ts/galerina-tower-citizen/tests/registry-key-rotation.test.mjs`
   → **1/1 pass**, 0 fail, 0 skip, `duration_ms 216.598`.
   - `authenticates crash/restart state and enforces external rollback floors` — **green** (26.2704ms)

Independent extra (`%TEMP%\zt-rotation-restore-payload-probe.mjs` and
`…probe2.mjs`; `file://` import of working-tree `dist/index.js`;
symmetric genesis ring, no production write):

| probe | result |
|---|---|
| honest restore | `acceptedGenerationId` 64 `a`s; payload reads **1**; hmac reads **1** |
| Proxy first-good then `{"schema":"forged"}` | restores 64 `a`s; payload reads **1** |
| Proxy always `{"schema":"forged"}` on frozen `seal()` target | throw engine proxy invariant (`read-only and non-configurable`); payload reads **1**; matches named `/proxy/` |
| `defineProperty` first-good then forged | restores 64 `a`s; reads **1** |
| `defineProperty` always forged | throw `registry rotation checkpoint authentication failed`; reads **1**; generation null |
| `defineProperty` first-forged then good | throw `authentication failed`; reads **1** |
| hmac Proxy first-good then `0`.repeat(64) | restores 64 `a`s; hmac reads **1** |
| scan-era-style getter: authentic for first 4 payload reads, then forged `b`×64 | still restores 64 `a`s; reads **1** (5th lie never observed) |
| `Object.isFrozen(checkpoint)` after `seal` | **true** |

## Challenge 1 — can a first-good then forged getter make restore parse forged bytes after HMAC of authentic bytes?

**No. CONFIRMED closed for the named getter.** Restore copies
`payloadJson` and `hmac` into locals, MACs those locals, then
`JSON.parse(payloadJson)`. Independent Proxy and `defineProperty`
first-good getters restored `a`×64 with **one** payload read; the
forged second value was never consumed. A getter that always returns
`{"schema":"forged"}` does not restore (proxy invariant on the frozen
`seal()` target, or `authentication failed` on a `defineProperty`
object). First-forged-then-good also fails authentication.

Scan-era `0f24ca30` 264–277 MACed live `checkpoint.payloadJson` then
parsed a later live get. A getter that returned authentic on the MAC
read and forged on the parse read could restore different bytes than
were authenticated. That detector is not invalid against the scan
revision. This dirty tree does not re-read after capture.

## Challenge 2 — is dist stale vs src for capture-before-validate?

**No. CONFIRMED not stale.** Dist restore (132–188) has the same
capture-then-type-then-MAC-then-parse order as src (246–316). After the
two capture lines, neither body mentions `checkpoint.payloadJson` or
`checkpoint.hmac`. Named tests and extra probes imported
`dist/index.js` and observed the claimed restore / throw.

HEAD restore still captured, but only **after** live type/length gets.
A first-good Proxy over frozen `seal()` would hit the engine invariant
on the second (forged) type-check read on HEAD; WT captures on the
first get and restores. Dist matches WT, not HEAD’s live type checks.

## Challenge 3 — is this 124-scan closure or production admission?

**No.** `csf_6955d450f0b42e29883196a8` remains `PARTIAL_THIS_TREE`.
Independent recount: **4** `PATCHED_AUDIT_PENDING`, **57**
`PARTIAL_THIS_TREE`, **63** `OPEN_ON_SCAN_SNAPSHOT`. Matches
`disposition_counts`. This review does not recategorize the row.

## Residuals (not findings against the named capture-once claim)

- Always-forged **Proxy** over `Object.freeze(seal())` throws V8/Node
  proxy invariant, not MAC. Named regex includes `proxy`. A
  `defineProperty` getter on a fresh object reaches
  `authentication failed` instead.
- `checkpoint.schema` is still a live read before capture. It is not
  used after that check.
- `floors` remains live-read for rollback bounds. Not this claim.
- HEAD already closed MAC≠parse divergence by capturing after type
  checks. WT’s extra property is capture-**first** so the first getter
  value is the authenticated/parsed string.
- Named tests import gitignored dist, not src. Dist was confirmed
  non-stale for this order; this receipt did not rebuild.
- Inventory still lists the ID as `PARTIAL_THIS_TREE`. This receipt
  does not reclassify it. 63 OPEN / 57 PARTIAL / 4 PATCHED remain.
  Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the named capture-once restore claim.
Detector is not invalid: scan-rev still MACs and parses live
`checkpoint.payloadJson`; this dirty tree captures both fields once
and authenticates/parses those strings. Evidence is sufficient for
those bullets; insufficient for scan recategorization and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
