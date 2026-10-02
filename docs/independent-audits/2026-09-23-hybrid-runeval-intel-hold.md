# Independent audit — Hybrid attestation snapshot, run-eval bounds, intel indexer

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent mediums):

- **A** `csf_2f01f14cfd15ebcf53d39c71`: Hybrid signatures in
  `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts`
  `verifyAttestationHybrid`. THIS TURN added `ownAttestationSnapshot` /
  `ownManifestSnapshot` so manifest fields and signature strings are
  copied into a frozen inert object before classical verify, canonical
  preimage, and the `await import` PQ check. Tests in
  `packages-ts/galerina-tower-citizen/tests/bridge-attestation-hybrid.test.mjs`
  (10 tests including post-await getter swap must fail, and
  `hardwareIdentity` getter must not split hash from PQ). Dist rebuilt
  with `npx tsc -p tsconfig.json`. Tests import `../dist/index.js`.
- **B** `csf_14ab43fde3a4875a5afe9810`: Recursive pseudo-evaluation in
  `packages-ts/galerina-core/compiler/galerina.js`. `collectRunOutput` /
  `evaluateRunFunction` already have visiting Set, depth 32, steps
  10000. THIS TURN exported `collectRunFunctions`, `collectRunVariables`,
  `collectRunOutput` on `module.exports`. New tests
  `packages-ts/galerina-core/compiler/run-eval-bounds.test.mjs` (simple
  greet, mutual recursion, 40-deep chain). Residual the author flags:
  still a regex runner, not an admitted AST; refusal is empty string not
  a named diagnostic.
- **C** `csf_6cff52f9ec86bf43a69a0e0e`: Intelligence indexer in
  `packages-ts/galerina-devtools-intelligence/src/indexer.ts`: already
  `MAX_INTEL_FILES` 4096, FILE 1MiB, TOTAL 32MiB, DEPTH 24, CACHE 8MiB,
  FUNGI-INTEL-003. THIS TURN added tests
  `packages-ts/galerina-devtools-intelligence/tests/intel-bounds.test.mjs`
  (depth 25 throw, 1MiB+1 file throw). Tests import gitignored dist.
  Residual: 4096-file ceiling not live-exercised; oversize cache returns
  null then rebuilds rather than a named refuse.

This reviewer independently re-read the three production files + tests +
dist (A required; C because those tests import dist; B tests require
`./galerina.js` source), hashed working-tree bytes, ran the named
suites, and executed an extra probe from `%TEMP%` (not by trusting the
named tests alone). Author-named hashes were **not supplied** in the
review packet. Independent `crypto.createHash('sha256')` and
`Get-FileHash` MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **60 OPEN / 60
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 60, `PARTIAL_THIS_TREE`
60, `PATCHED_AUDIT_PENDING` 4; `n` 124; disposition sum 124). Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named A/C
suites import gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). This reviewer did not rebuild. Dist mtimes are newer than src
and carry the named controls (see hashes).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts` | **M** HEAD blob `93a5afd6a3` → WT blob `990e0cea41` (+49 / −5). Dirty hunk is `ownManifestSnapshot` / `ownAttestationSnapshot` and the swap of the live-reference freeze for `ownAttestationSnapshot(attestation)`. |
| `packages-ts/galerina-tower-citizen/tests/bridge-attestation-hybrid.test.mjs` | **M** HEAD blob `6055911f46` → WT blob `b0099cfb29` (+38; two new hostiles: post-await getter swap, `hardwareIdentity` proxy) |
| `packages-ts/galerina-tower-citizen/dist/bridge-attestation.js` | gitignored; rebuilt this turn (`npx tsc`); `ownAttestationSnapshot` 212–222 / PQ uses `frozen.mlDsaSignature` + captured `preimage` 240 |
| `packages-ts/galerina-tower-citizen/dist/index.js` | gitignored; re-exports `verifyAttestationHybrid` from `./bridge-attestation.js` (line 85) |
| `packages-ts/galerina-core/compiler/galerina.js` | **M** HEAD blob `e8fecad285` → WT blob `6f1a813525` (+87 / −12). Visiting Set / depth 32 / steps 10000 already on HEAD (`evaluateRunFunction` / `evaluateRunExpression`). THIS TURN named repair: `module.exports` of `collectRunFunctions` / `collectRunVariables` / `collectRunOutput`, plus `if (require.main === module)` so require does not run CLI. Also extra dirty surface not in the named hash: `pathIsSymlink` / `refuseBuildOutputLinks`, `stripQuotedStrings` / `benchmarkKindFromMainBody`. |
| `packages-ts/galerina-core/compiler/run-eval-bounds.test.mjs` | **??** untracked (3 tests) |
| `packages-ts/galerina-devtools-intelligence/src/indexer.ts` | **clean** (blob `9af0bee9a4` = HEAD). Depth / file / total / cache ceilings already on HEAD. |
| `packages-ts/galerina-devtools-intelligence/tests/intel-bounds.test.mjs` | **??** untracked (2 hostiles) |
| `packages-ts/galerina-devtools-intelligence/dist/indexer.js` | gitignored; `MAX_INTEL_*` + FUNGI-INTEL-003 match src |

HEAD `verifyAttestationHybrid` still did
`manifest: attestation.manifest` (live reference) with primitive copies of
`signature` / `mlDsaSignature`, then `canonicalManifestString(frozen.manifest)`
before `await import`. A `hardwareIdentity` getter on the live manifest
could still split classical `attestationHash` from a later field read.
WT copies listed keys into `Object.freeze` before those reads.

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts` | 15994 | `d0ea4894e3264b8247a1a6c093c37222a2ea2a40636c5c96667a0976e458c051` |
| `packages-ts/galerina-tower-citizen/dist/bridge-attestation.js` | 12394 | `4112dbf6d32f73bff6d01d2f428606b7ebd407efdc3d802184f9631c986d8503` |
| `packages-ts/galerina-tower-citizen/dist/index.js` | 10895 | `a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32` |
| `packages-ts/galerina-tower-citizen/tests/bridge-attestation-hybrid.test.mjs` | 7224 | `b5893af4e2795011dd24053fbca22e55cf106955c3f62da49cb9c9f73a55128c` |
| `packages-ts/galerina-core/compiler/galerina.js` | 226804 | `9d93b899180e6b0b0ce5ae14647a861fe7fcfb4b69cca22d3abab1488ae5c030` |
| `packages-ts/galerina-core/compiler/run-eval-bounds.test.mjs` | 1427 | `185b5792ecccc513a198545fd44333742ef4f57073f5a2da60705f0696db607c` |
| `packages-ts/galerina-devtools-intelligence/src/indexer.ts` | 11749 | `1072bf8f158c4aff713e40da4e2bef62bca16f6d1f0b6545a97e0111de4e0a33` |
| `packages-ts/galerina-devtools-intelligence/dist/indexer.js` | 11041 | `80efa77cdc931b7b75841c5e6045a19cf555f2fd4ad15f7384fbe4c05d8a0869` |
| `packages-ts/galerina-devtools-intelligence/dist/index.js` | 505 | `6897698fbedfc42d2e3552a1921625a62bc355e7c01aefa9104330dccb0db26c` |
| `packages-ts/galerina-devtools-intelligence/tests/intel-bounds.test.mjs` | 1321 | `ae2bbd1eda632c216604a7aa237d856e9e52668edcafdd8b1835648f8911ce2b` |

Independent MATCH (Get-FileHash ↔ crypto): A src `d0ea4894…e458c051`;
A dist `4112dbf6…986d8503`; B src `9d93b899…ae5c030`; C src
`1072bf8f…de4e0a33`; C dist `80efa77c…d8a0869`.

Dist mtimes (UTC): tower-citizen `bridge-attestation.js`
`2026-09-23T08:17:17.974Z` / `index.js` `2026-09-23T08:17:18.160Z`
(src `bridge-attestation.ts` `2026-09-23T08:17:09.312Z`); intelligence
`indexer.js` `2026-09-22T12:53:27.640Z` / `index.js`
`2026-09-22T12:53:27.647Z` (src `indexer.ts`
`2026-09-22T11:51:54.717Z`). All named dist files are newer than their
src.

Inventory file sha256 `f1051617129e48d8c49b27673f7e81e0b138b0d9d7b4d9031873524498c355e8`.
`findings_json_sha256` pin `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (all still `OPEN_ON_SCAN_SNAPSHOT`, medium):

- `csf_2f01f14cfd15ebcf53d39c71` (`occ_d7f322c5c35c36824847e4eb`,
  path `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts`,
  scan-era `start_line` 235, title “Hybrid signatures can verify
  different manifest preimages”)
- `csf_14ab43fde3a4875a5afe9810` (`occ_ddb76580c1b34cc5061454a6`,
  path `packages-ts/galerina-core/compiler/galerina.js`, scan-era
  `start_line` 5528, title “Recursive pseudo-evaluation has no
  call-depth or cycle bound”)
- `csf_6cff52f9ec86bf43a69a0e0e` (`occ_e0a4d8601dac707fc0029853`,
  path `packages-ts/galerina-devtools-intelligence/src/indexer.ts`,
  scan-era `start_line` 103, title “Intelligence indexer reads sources
  and cache before any byte budget”)

`dist/index.js` (tower-citizen) re-exports `verifyAttestationHybrid`
from `./bridge-attestation.js` (line 85). Named hybrid tests import that
barrel. Intel-bounds tests import `../dist/index.js`, which re-exports
`buildIndex` from `./indexer.js`. Run-eval tests `createRequire` the
production `galerina.js` (no dist).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A copy manifest fields + signature strings into frozen inert object before classical / preimage / PQ | src `ownManifestSnapshot` 289–301 / `ownAttestationSnapshot` 303–313; dist 198–222. `verifyAttestationHybrid` src 324 `const frozen = ownAttestationSnapshot(attestation)` then 325 preimage / 326 `verifyAttestation(frozen)` / 332 `await import` |
| A PQ uses captured preimage + frozen `mlDsaSignature` after await (no live attestation reread) | src 336–341 / dist 240 `ml_dsa65.verify(Buffer.from(frozen.mlDsaSignature, "base64"), Buffer.from(preimage, "utf8"), …)`. Extra probe: post-await live getters throw-if-reread → 0 rereads, `ok:true`; mix A classical + B PQ → `ML-DSA signature verification failed` with hash of A |
| A post-await getter swap must fail | WT tests 71–86; extra probe mix `ok:false` |
| A `hardwareIdentity` getter must not split hash from PQ | WT tests 88–107; extra probe getterReads **1**, `split.hash === honest.hash` |
| A 10 named tests | `node --test tests/bridge-attestation-hybrid.test.mjs` → 10/10 |
| B visiting Set / depth 32 / steps 10000 already on HEAD | HEAD `evaluateRunFunction` 5636 `budget.visiting.has(name) \|\| budget.depth >= 32 \|\| budget.steps > 10000`; WT 5693 same. `evaluateRunExpression` WT 5663 `budget.depth > 32 \|\| budget.steps > 10000` |
| B THIS TURN export collectors | WT `module.exports` 5864–5878; HEAD **missing** `module.exports` (CLI was bare `main(process.argv)`) |
| B simple greet / mutual recursion / 40-deep | WT tests 18–48; extra probe `["hi"]` / `[""]` / `[""]` |
| C MAX_INTEL_FILES 4096 / FILE 1MiB / TOTAL 32MiB / DEPTH 24 / CACHE 8MiB | src 72–76 / dist 66–70 |
| C FUNGI-INTEL-003 depth and per-file | src walk 82–84 / 99–101 / file 225–227; dist 74–76 / 94–96 / 191–193 |
| C depth 25 throw + 1MiB+1 throw | WT tests 11–34; extra probe same strings |
| C 4096-file ceiling not live-exercised | named tests do not create 4096 files; extra probe did not either |
| C oversize cache returns null then rebuilds | src `loadExistingIndex` 118 `st.size > MAX_INTEL_CACHE_BYTES` → `null`; extra probe 8388609-byte `workspace.lindex` rebuilt (`filesIndexed:1`, no throw) |
| Dist not stale for named bodies | hashes + same order in src/dist; dist mtimes newer; named A/C tests imported dist and passed |
| Inventory 60/60/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `node --test tests/bridge-attestation-hybrid.test.mjs` in
   `packages-ts/galerina-tower-citizen`
   → **10/10 pass**, 0 fail, 0 skip, `duration_ms 314.2237`.
   Post-await getter swap 13.0907ms; `hardwareIdentity` proxy
   10.0601ms; both green.

2. `node --test run-eval-bounds.test.mjs` in
   `packages-ts/galerina-core/compiler`
   → **3/3 pass**, 0 fail, 0 skip, `duration_ms 150.303`.
   Simple greet 2.0646ms; mutual recursion 0.3114ms; 40-deep
   0.9642ms.

3. `node --test tests/intel-bounds.test.mjs` in
   `packages-ts/galerina-devtools-intelligence`
   → **2/2 pass**, 0 fail, 0 skip, `duration_ms 442.7348`.
   Depth-25 nesting 32.4619ms; 1MiB+1 file 86.0841ms.

Independent extra (`%TEMP%\zt-hybrid-runeval-intel-probe\probe.mjs`;
cwd `%TEMP%\zt-hybrid-runeval-intel-probe`; `file://` import of
working-tree dist barrels + `createRequire` of `galerina.js`; no
production write):

| probe | result |
|---|---|
| A live getters throw if read after `queueMicrotask` generation=1 | **no throw**; `ok:true`; `postAwaitReads` **0**; `generationAfter` 1; hash `37b9c4b1c605dad4faf28c896c0e57e7f8995d58e4527c2c2f9dc017d03ea6a0` |
| A post-await mix: classical snapshot of A + live B PQ half | `{ok:false, reason:"ML-DSA signature verification failed", hash:37b9c4b1…}` (A’s hash) |
| A `hardwareIdentity` getter returns evil on 2nd read | `ok:true`; hash equals honest; getterReads **1** |
| B `collectRunOutput` greet | `["hi"]` |
| B mutual `ping`/`pong` | `[""]` in 0ms (empty string, not a named diagnostic) |
| B 40-deep `f0`…`f40` | `[""]` in 0ms |
| B exports | `collectRunFunctions` / `collectRunVariables` / `collectRunOutput` present |
| C depth 24 + `.fungi` | admitted (`filesIndexed:1`) |
| C depth 25 | throw `FUNGI-INTEL-003: workspace nesting exceeds 24` |
| C 1MiB+1 `.fungi` | throw `FUNGI-INTEL-003: … exceeds 1048576 bytes` |
| C 8MiB+1 `workspace.lindex` then `buildIndex` | **no throw**; rebuilt `filesIndexed:1` (`cacheBytes` 8388609) |

## Challenge 1 — can hybrid still mix preimages across the `await import`?

**No. CONFIRMED closed for the named `verifyAttestationHybrid` snapshot
on this dirty tree.** WT copies signature strings and listed manifest
keys into a frozen inert object **before** classical verify, canonical
preimage, and PQ. Extra probe: live getters that throw after the
microtask were never hit (`postAwaitReads` 0) while honest A still
verified; a post-await mix of A’s Ed25519 half with B’s PQ half failed
closed on `ML-DSA signature verification failed` with **A’s** hash
(classical used the snapshot, PQ used frozen `"00"` / captured A
preimage, not live B). A `hardwareIdentity` getter was read **once**
(snapshot) and did not split `result.hash` from the honest PQ
preimage.

HEAD still freezes a live `attestation.manifest` reference. This
reviewer did not execute HEAD dist.

`MANIFEST_SNAPSHOT_KEYS` matches `BridgeManifest` in
`packages-ts/galerina-inference-bridge-contract/src/manifest.ts`
(including `toleranceWitness` shallow-frozen). Extra dirty keys are
not in the canonical pre-image.

## Challenge 2 — can `collectRunOutput` still recurse without a bound?

**No on this dirty tree for the named regex runner. CONFIRMED closed
for visiting / depth 32 / steps 10000.** Those checks were already on
HEAD. THIS TURN’s named repair is exporting the collectors so tests
can hit them without going through CLI `main`. Named tests and the
`%TEMP%` probe observed mutual recursion and a 40-deep chain refuse as
`[""]` in <1s. Residual below: still not an admitted AST; refuse is
empty string.

Scan-era object `0f24ca30…:packages-ts/galerina-core/compiler/galerina.js`
is **not** the WT/HEAD bounded form. Inventory still lists the row
OPEN; this receipt does not recategorize it.

## Challenge 3 — is dist stale, or is this 124-scan closure?

**Dist not stale for the named bodies. Not 124-scan closure.**
Tower-citizen dist snapshot/PQ match src and are newer than src;
intelligence dist ceilings match src and are newer than src; named A/C
suites imported those dist files and passed; extra probe imported the
same dist barrels. All three CSF rows remain
`OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **60** `PARTIAL_THIS_TREE`, **60**
`OPEN_ON_SCAN_SNAPSHOT`. This review does not recategorize the rows.

## Residuals (not findings against the named snapshot / run-eval caps / intel ceilings)

- **A.** Snapshot is field-list copy, not a structured clone of unknown
  future manifest keys. Current `BridgeManifest` keys are covered.
  `toleranceWitness` is shallow-frozen; other values are copied as
  primitives. Extra probe did not find a live post-await reread.
- **B.** Still a regex runner (`/\b(?:print|console\.log)\s*\(/`,
  `flow` regex, `extractRunReturnExpression` via `indexOf("return ")`),
  not an admitted AST. Bound refusal is `return ""`, not a named
  diagnostic. Extra probe reproduced `[""]` for mutual recursion and
  40-deep. `galerina.js` also carries extra dirty surface this turn
  (`pathIsSymlink` / `refuseBuildOutputLinks`,
  `benchmarkKindFromMainBody`) not in the named export hash.
- **C.** 4096-file ceiling is in src/dist (`results.length >= MAX_INTEL_FILES`
  throw) but was **not** live-exercised by named tests or the extra
  probe. Oversize cache (`st.size > MAX_INTEL_CACHE_BYTES`) returns
  `null` then `buildIndex` rebuilds; extra probe wrote 8388609 bytes
  and observed a silent rebuild (`filesIndexed:1`), not a named
  FUNGI-INTEL-003 refuse.
- Named A/C tests import gitignored dist, not src. Dist was confirmed
  non-stale for the named bodies; this receipt did not rebuild.
- Inventory still lists all three IDs as `OPEN_ON_SCAN_SNAPSHOT`.
  This receipt does not reclassify them. 60 OPEN / 60 PARTIAL / 4
  PATCHED remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. Detectors are not
invalid against TOCTOU-hybrid / unbounded regex eval / unbounded intel
walk scan-era shapes; this dirty tree has the named snapshot, exported
run-eval caps, and intel ceilings, with executed red-capable evidence
on dist (A/C) and source (B). Residuals above remain outside those
bullets. Evidence is sufficient for those bullets; insufficient for
scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**