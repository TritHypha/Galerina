# Independent audit — Package-graph vacuous scan, webhook event-id replay, audit-chain MAC

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

- **A** `csf_088de8906119ef06a0cc4fdf`: Package-controlled scan configuration
  in `packages-ts/galerina-devtools-package-graph/src/scanner.ts` +
  `src/reporter.ts`. Explicit missing roots already throw. THIS TURN:
  `scanOmitsCoveredDefaultRoots` + `runBoundaryGate` FAIL with a
  `vacuous border` violation when `packageGraph.roots` omits default
  `src`/`host` that still holds code. Tests in
  `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs`
  (“omitting src while it holds code fails the boundary gate”). Dist
  rebuilt with `npx tsc -p tsconfig.json`. Residual: scanner API can
  still return a narrowed graph; the gate (and
  `scripts/audit-package-border.mjs` self-test D) refuse it.
  Extensions-only narrowing of default roots is a separate vacuous-scan
  path in the audit wrapper.
- **B** `csf_a29c2f0f698df064615df16d`: Unsigned event IDs in
  `packages-ts/galerina-framework-api-server/src/webhook-admission.ts`.
  Replay identity is already `body:${bodyMacHex(...)}`. Existing unit
  test binds event-id rotation to replay. THIS TURN added HTTP: same
  signed body, new event-id AND new Idempotency-Key → 409, handler not
  dispatched. Tests `packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs`.
  Residual: kernel idempotency for non-webhook routes still keys on the
  unsigned header.
- **C** `csf_0f748088754ddb920ceb641f`: Audit-chain MAC in
  `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts`.
  Already length-prefixed v2 (`count:` + per-record byte length).
  Existing merge test. THIS TURN added split-record hostile. Tests
  `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs`
  (7 tests). Residual: epoch-aware verifier uses the same v2 encoding;
  `ZERO_KEY` default still authenticates if caller omits `hmacKey`.

This reviewer independently re-read the three production files + tests +
dist (A required; B/C because those tests import dist; B HTTP also
imports `dist/index.js`), hashed working-tree bytes, ran the named
suites, and executed an extra probe from `%TEMP%` (not by trusting the
named tests alone). Author-named hashes were **not supplied** in the
review packet. Independent `crypto.createHash('sha256')` and
`Get-FileHash` MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **57 OPEN / 63
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 57 = 0 high / 7 medium /
50 low, `PARTIAL_THIS_TREE` 63, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is
**not** 124-scan closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suites import gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). This reviewer did not rebuild. Dist mtimes are newer than src
and carry the named controls (see hashes).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | **M** HEAD blob `0052d4c78b` → WT blob `2ea387680e` (+33 / −1). Dirty hunk exports `DEFAULT_ROOTS`, adds `dirHasCode` / `COVERAGE_EXTENSIONS`, and `scanOmitsCoveredDefaultRoots`. Explicit missing roots already throw via `admitScanRoot(..., meta.rootsExplicit)`. |
| `packages-ts/galerina-devtools-package-graph/src/reporter.ts` | **M** HEAD blob `2bf8c81165` → WT blob `b81342b818` (+11 / −1). Dirty hunk folds coverage into `orphanViolations` as `vacuous border — scan omitted default src/host coverage that still contains code`, including generate-mode FAIL before baseline write. |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | **M** HEAD blob `3c4508672f` → WT blob `ac0058675a` (+1 / −1). Re-exports `scanOmitsCoveredDefaultRoots` / `DEFAULT_ROOTS`. |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | **M** HEAD blob `61b1eea0c5` → WT blob `e567a54149` (+30). Named test: omitting `src` while it holds code fails the gate. Extra dirty (not the named hash): same-line `"foo // bar"` string does not hide the following import. |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | gitignored; rebuilt this turn (`npx tsc`); `scanOmitsCoveredDefaultRoots` 68–76 / `dirHasCode` 44–66 |
| `packages-ts/galerina-devtools-package-graph/dist/reporter.js` | gitignored; `coverageViolations` 44–50 / generate-mode FAIL 66–68 |
| `packages-ts/galerina-devtools-package-graph/dist/index.js` | gitignored; re-exports `scanOmitsCoveredDefaultRoots` / `DEFAULT_ROOTS` from `./scanner.js` |
| `packages-ts/galerina-framework-api-server/src/webhook-admission.ts` | **clean** (blob `d02ca0a39b` = HEAD). Replay identity already `body:${bodyMacHex(input.body, input.secret)}` (line 83). Event-id is still required as a non-empty header but cannot mint a fresh replay slot. |
| `packages-ts/galerina-framework-api-server/src/index.ts` | **M** HEAD blob `6b7c4113c7` → WT blob `7c4d76c49f` (+22 / −1). HTTP webhook gate (`admitWebhookReplay` then 409/401 without `kernel.handle`) already on HEAD (WT 804–828). Extra dirty this turn, **not** the named event-id hash: `requireDurableReplay` construction refuse. |
| `packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs` | **M** HEAD blob `b6dd484143` → WT blob `b3af20e78a` (+14). THIS TURN: rotated event-id + new `idempotency-key` after a 200 must 409 with handler not dispatched. Existing unit test already binds event-id rotation to replay. |
| `packages-ts/galerina-framework-api-server/dist/webhook-admission.js` | gitignored; `replayIdentity` line 41 matches src |
| `packages-ts/galerina-framework-api-server/dist/index.js` | gitignored; webhook 409/401 before kernel dispatch present |
| `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | **clean** (blob `27f8cad99d` = HEAD). Length-prefixed v2 already on HEAD (`galerina.audit-batch.v2` + `count:` + `${byteLength}:` per record). `verifyChainEpochAware` calls the same `computeBatchHash`. |
| `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs` | **M** HEAD blob `a68c1c157b` → WT blob `b4dcff41df` (+14). THIS TURN: “splitting one record into two cannot preserve the MAC”. Merge test already on HEAD. |
| `packages-ts/galerina-core-sentinel-egress/dist/audit-egress.js` | gitignored; `computeBatchHash` 28–44 / epoch-aware 250 uses the same helper; `ZERO_KEY` 9 / constructor `hmacKey ?? ZERO_KEY` 79 |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | 28845 | `06629e3f270ea1896acf6f1ce5125395b83bd813594530dcacdd19b31f257f5c` |
| `packages-ts/galerina-devtools-package-graph/src/reporter.ts` | 9345 | `2c358366cefde7fee2a100718cba752687ff9ae046ae287f727ce7daf77f46e6` |
| `packages-ts/galerina-devtools-package-graph/src/index.ts` | 515 | `ce563b4dec1da8d23ed8d5f521c1f4b57721a33c64b805537e9fc86f731a7248` |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | 27429 | `9a87044ad5333b422f35628a63788869e6266e6cc7b50fe0efe9cafc538abbb6` |
| `packages-ts/galerina-devtools-package-graph/dist/reporter.js` | 8785 | `c63e0e627745507ef76483da25b90556494190b3901e2b8f6c4135aded0c0acc` |
| `packages-ts/galerina-devtools-package-graph/dist/index.js` | 246 | `8ec00977bdd8398954b03b4cfaabbbf7a999f0aca8ca8448fa53a4490deab40f` |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | 31330 | `afa5c91fbee938ac43b7a994285426d1dc0b308368c30716c185e6827944dd4c` |
| `packages-ts/galerina-framework-api-server/src/webhook-admission.ts` | 3593 | `25a2d2c712e941dfce02b1a9b0660179f4102ac39da98c8f7496c77abf435eb1` |
| `packages-ts/galerina-framework-api-server/src/index.ts` | 38560 | `009c7b0f0ee4be815d8e0a3e3e568f57afb6e1878f418ca8e90dcab51e9fc784` |
| `packages-ts/galerina-framework-api-server/dist/webhook-admission.js` | 2435 | `421748425e2cb47f0bfd46803f37e9f8a534922efbec0795c7bef290fb3343aa` |
| `packages-ts/galerina-framework-api-server/dist/index.js` | 28929 | `8350cef55d27af722e59bd25c343eb74270d10a73661823eb2cd261cf37e5dbf` |
| `packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs` | 9031 | `da53592d643966ef1be3ab2ec2c0c1be626a2b9de01608e50234a34b84c0c45b` |
| `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | 13680 | `19c50a6478c7b0091b2e19f604af3a621103f1a93ef31de18c535383d79fe781` |
| `packages-ts/galerina-core-sentinel-egress/dist/audit-egress.js` | 11543 | `114ceaf6785471f12ceff39cefe737179565f7a61aa898121fe90778100aabc1` |
| `packages-ts/galerina-core-sentinel-egress/dist/index.js` | 542 | `2451627c7898e12d4dd653b701f0f744a19509b8bc304aa8736fc76379b4f7ef` |
| `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs` | 4196 | `56dde842054a67516fffe646f4f5f75abb8526f3626f9d4ae32d438e8f7fe022` |

Independent MATCH (Get-FileHash ↔ crypto): A scanner src
`06629e3f…1f257f5c`; A reporter src `2c358366…f77f46e6`; A dist scanner
`9a87044a…538abbb6`; B webhook src `25a2d2c7…bf435eb1`; B dist webhook
`42174842…fb3343aa`; C src `19c50a64…d79fe781`; C dist
`114ceaf6…00aabc1`.

Dist mtimes (UTC): package-graph `scanner.js`
`2026-09-23T08:32:36.486Z` / `reporter.js` `2026-09-23T08:32:36.506Z` /
`index.js` `2026-09-23T08:32:36.514Z` (src `scanner.ts`
`2026-09-23T08:31:47.072Z` / `reporter.ts` `2026-09-23T08:32:34.039Z`);
api-server `webhook-admission.js` `2026-09-23T07:58:15.897Z` /
`index.js` `2026-09-23T07:58:15.912Z` (src `webhook-admission.ts`
`2026-09-22T07:15:40.437Z` / `index.ts` `2026-09-22T15:52:06.472Z`);
egress `audit-egress.js` `2026-09-22T12:53:12.944Z` / `index.js`
`2026-09-22T12:53:12.948Z` (src `audit-egress.ts`
`2026-09-22T08:14:36.569Z`). All named dist files are newer than their
src.

Inventory file sha256 `1a3c6ad33f248bb6a38604a819563fa5e28558a107d4714bb9881adc5d460894`.
`findings_json_sha256` pin `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (all still `OPEN_ON_SCAN_SNAPSHOT`, medium):

- `csf_088de8906119ef06a0cc4fdf` (`occ_e98b7b3ea95bea1f6237ff86`,
  path `packages-ts/galerina-devtools-package-graph/src/scanner.ts`,
  scan-era `start_line` 179, title “Package-controlled scan
  configuration bypasses the dependency boundary gate”)
- `csf_a29c2f0f698df064615df16d` (`occ_e9f2ba458276cba8b453489c`,
  path `packages-ts/galerina-framework-api-server/src/webhook-admission.ts`,
  scan-era `start_line` 65, title “Unsigned event IDs allow signed
  webhook bodies to be replayed”)
- `csf_0f748088754ddb920ceb641f` (`occ_eae33efdcd97e2b39c953d18`,
  path `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts`,
  scan-era `start_line` 79, title “Audit-chain MAC does not bind record
  boundaries”)

Named A tests import `../dist/index.js`. Named B tests import
`../dist/index.js` (barrel re-exports `admitWebhookReplay` /
`createApiServer`). Named C tests import `../dist/audit-egress.js`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A explicit missing roots already throw | src `admitScanRoot` 614–632 / `scanPackage` 637–638 `required: meta.rootsExplicit`; WT test “explicit missing or escaping scan roots are refused” 7.89ms |
| A `scanOmitsCoveredDefaultRoots` when default `src`/`host` omitted but still holds code | src 114–123 / dist 68–76; `dirHasCode` walks `COVERAGE_EXTENSIONS` skipping `node_modules`/`dist`/`.myco`/symlinks |
| A `runBoundaryGate` FAIL `vacuous border` | src reporter 64–70 + generate-mode 87–89 / dist 44–50 + 66–68 |
| A omitting `src` while it holds code fails the gate | WT tests 677–698; extra probe `gateStatus:"FAIL"`, `vacuous:true` |
| A scanner API can still return a narrowed graph | extra probe `scannedRoots:["docs"]`, `filePaths:["docs/index.ts"]`, `hiddenDepVisible:false`; `buildGraph` copies `scan.roots` (graph.ts 112) |
| A gate + self-test D refuse the narrowed graph | extra probe FAIL; `scripts/audit-package-border.mjs` self-test D 194–210; `node scripts/audit-package-border.mjs --self-test` → detectors fire |
| A extensions-only narrowing is a separate audit-wrapper path | extra probe `A_ext`: roots `["src"]`, `fileCount:0`, `omits:false`, `gateStatus:"BASELINE_CREATED"`; wrapper `isVacuousScan` 64–71 (0 files + `dirHasCode`) is **not** `runBoundaryGate` |
| A 36 named tests | `node --test tests/package-graph.test.mjs` → 36/36 |
| B replay identity is authenticated body MAC | src 83 / dist 41 `body:${bodyMacHex(...)}` (clean vs HEAD) |
| B unit test binds event-id rotation to replay | WT tests 144–175; extra probe `firstOk:true`, `secondOk:false`, `secondReason:"replay"` |
| B HTTP same signed body, new event-id AND new Idempotency-Key → 409, handler not dispatched | WT tests 277–289; extra probe first 200 dispatched, rotated **409** `{"error":"replay"}`, `dispatchedAfterRotated:false` |
| B 5 named tests | `node --test tests/webhook-admission.test.mjs` → 5/5 |
| B kernel idempotency still keys on unsigned header | kernel.ts 648 `header(req.headers, policy.idempotency.header)`; extra probe same `idempotency-key` different bodies → 200 then 409 `Duplicate idempotency key 'unsigned-1'` |
| C length-prefixed v2 already on HEAD | src `computeBatchHash` 80–99 / dist 28–44 (`count:` + `${byteLength}:`); src **clean** vs HEAD |
| C merge cannot preserve MAC (already) | WT tests 77–90 |
| C split-record hostile THIS TURN | WT tests 92–104; extra probe `honest:true`, `splitOk:false` |
| C epoch-aware uses the same v2 encoding | src 334 / dist 250 `computeBatchHash(key, b.prevHash, b.records, b.epochId, b.seq)`; extra probe `epochHonest:true`, `epochSplit:false` |
| C ZERO_KEY default authenticates if `hmacKey` omitted | src 11 + 146 / dist 9 + 79; extra probe `omittedKey:true`, `injected:false` |
| C 7 named tests | `node --test tests/hmac-chain.test.mjs` → 7/7 |
| Dist not stale for named bodies | hashes + same order in src/dist; dist mtimes newer; named suites imported dist and passed |
| Inventory 57/63/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `node --test tests/package-graph.test.mjs` in
   `packages-ts/galerina-devtools-package-graph`
   → **36/36 pass**, 0 fail, 0 skip, `duration_ms 1010.5775`.
   “omitting src while it holds code fails the boundary gate”
   11.4814ms; “explicit missing or escaping scan roots are refused”
   7.89ms; both green.

2. `node --test tests/webhook-admission.test.mjs` in
   `packages-ts/galerina-framework-api-server`
   → **5/5 pass**, 0 fail, 0 skip, `duration_ms 289.0374`.
   Event-id rotation unit 0.27ms; HTTP webhook gate (incl. rotated
   event-id + new Idempotency-Key) 54.1112ms.

3. `node --test tests/hmac-chain.test.mjs` in
   `packages-ts/galerina-core-sentinel-egress`
   → **7/7 pass**, 0 fail, 0 skip, `duration_ms 196.3761`.
   Split-record hostile 2.4124ms; merge 4.9756ms; both green.

Independent extra (`%TEMP%\zt-scan-webhook-auditmac-probe\probe.mjs`;
cwd `%TEMP%\zt-scan-webhook-auditmac-probe`; `file://` import of
working-tree dist barrels; no production write):

| probe | result |
|---|---|
| A omit `src` while `src/index.ts` holds `hidden-dep` | scan `roots:["docs"]`, files `["docs/index.ts"]`, `hiddenDepVisible:false`; `scanOmitsCoveredDefaultRoots` **true**; `runBoundaryGate` **FAIL** `vacuous border — scan omitted default src/host coverage that still contains code` |
| A extensions-only: default roots, `extensions:[".ts"]`, only `src/bench.mjs` | `scannedRoots:["src"]`, `fileCount:0`, `omits:false`, `runBoundaryGate(check=false)` **BASELINE_CREATED** (gate does not trip; audit wrapper is the other path) |
| A `audit-package-border.mjs --self-test` (includes D) | `self-test: gate fires on unlisted-external, missing-policy AND vacuous-scan` — OK |
| B unit: same signed body, `evt-a` then `evt-b` | `{firstOk:true, secondOk:false, secondReason:"replay"}` |
| B HTTP: 200 then new event-id + new Idempotency-Key | first **200** dispatched; rotated **409** `{"error":"replay"}`; handler **not** dispatched |
| B kernel non-webhook: same unsigned `idempotency-key`, different JSON bodies | 200 `{n:1}` then 409 `Duplicate idempotency key 'unsigned-1'`; new key 200 `{n:2}`; `dispatched:2` |
| C split `"ab"` → `["a","b"]` `count:2` | `honest:true`, `splitOk:false` |
| C omit `hmacKey` (ZERO_KEY) vs injected key | `omittedKey:true`, `injected:false` |
| C epoch-aware v2 split | `epochHonest:true`, `epochSplit:false`, `epochId:1` |

## Challenge 1 — can `packageGraph.roots` still hide `src`/`host` code from the border gate?

**No for omitted default roots on this dirty tree. CONFIRMED closed for
the named `runBoundaryGate` / `scanOmitsCoveredDefaultRoots` check.**
`scanPackage` still returns the narrowed graph (`roots:["docs"]`,
`hidden-dep` invisible). The gate FAILs `vacuous border` even with an
empty allowlist. Extra probe reproduced FAIL. `audit-package-border.mjs`
self-test D (same fixture shape) fired. Explicit missing/escaping roots
still throw.

Residual below: extensions-only narrowing (`src` present in
`scannedRoots` but default `.ts`/`.fungi` matches 0 files while `.mjs`
code exists) does **not** trip `scanOmitsCoveredDefaultRoots`;
`runBoundaryGate` created a baseline. That path is the audit wrapper’s
`isVacuousScan` (0-file + `dirHasCode`), not the named THIS TURN hunk.

## Challenge 2 — can a new unsigned event-id replay the same signed webhook body over HTTP?

**No on this dirty tree for the webhook admission path. CONFIRMED closed
for `admitWebhookReplay` + `createApiServer` HTTP.** Replay identity is
the authenticated body MAC (already on HEAD). Extra probe: unit rotation
`evt-a`→`evt-b` is `replay`; HTTP first 200 then new event-id **and**
new Idempotency-Key is 409 `{"error":"replay"}` with the kernel handler
not dispatched. Residual below: kernel idempotency for **non-webhook**
routes still keys on the unsigned header (extra probe 409 on
`unsigned-1` across different bodies).

Scan-era object `0f24ca30…:packages-ts/galerina-framework-api-server/src/webhook-admission.ts`
is **not** recategorized. Inventory still lists the row OPEN.

## Challenge 3 — is dist stale, or is this 124-scan closure?

**Dist not stale for the named bodies. Not 124-scan closure.**
Package-graph dist coverage helpers match src and are newer than src;
api-server dist body-MAC + HTTP 409 match src and are newer than src;
egress dist v2 encoding matches src and is newer than src; named suites
imported those dist files and passed; extra probe imported the same dist
barrels. All three CSF rows remain `OPEN_ON_SCAN_SNAPSHOT`. Independent
recount: **4** `PATCHED_AUDIT_PENDING`, **63** `PARTIAL_THIS_TREE`,
**57** `OPEN_ON_SCAN_SNAPSHOT` (0 high / 7 medium / 50 low). This review
does not recategorize the rows.

## Residuals (not findings against the named vacuous-root gate / body-MAC replay / v2 MAC)

- **A.** Scanner API still returns a narrowed graph when
  `packageGraph.roots` omits `src`/`host`; extra probe saw
  `hidden-dep` dropped. The gate and audit self-test D refuse that
  graph. Extensions-only narrowing of default roots (keep `src`, scan
  only `.ts`, hide `.mjs`) does **not** set
  `scanOmitsCoveredDefaultRoots`; extra probe `A_ext` got
  `BASELINE_CREATED` from `runBoundaryGate`. That vacuous-scan path
  lives in `scripts/audit-package-border.mjs` `isVacuousScan` (0 files
  over a root that holds code), not in the THIS TURN reporter hunk.
  Extra dirty this turn: same-line `//` inside a string test, not the
  named coverage hash.
- **B.** Kernel idempotency for non-webhook routes still keys on the
  unsigned `Idempotency-Key` header (`kernel.ts` 648). Extra probe:
  same header, different JSON bodies → 409 duplicate without HMAC.
  `webhook-admission.ts` is clean vs HEAD (body MAC already present);
  THIS TURN’s named repair is the HTTP rotation assertion. Extra dirty
  on `src/index.ts`: `requireDurableReplay` construction refuse, not
  the named event-id hash.
- **C.** Epoch-aware verifier uses the same v2 encoding (extra probe
  split also false under `verifyChainEpochAware`). `ZERO_KEY` default
  still authenticates if the caller omits `hmacKey`; extra probe
  `omittedKey:true` (and `false` under a non-zero injected key).
  `strictKey: true` refuses the zero key at construction; default
  `strictKey` is false. Production source is clean vs HEAD; THIS TURN
  is the split-record test.
- Named suites import gitignored dist, not src. Dist was confirmed
  non-stale for the named bodies; this receipt did not rebuild.
- Inventory still lists all three IDs as `OPEN_ON_SCAN_SNAPSHOT`.
  This receipt does not reclassify them. 57 OPEN / 63 PARTIAL / 4
  PATCHED remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. Detectors are not
invalid against scan-era package-controlled roots / unsigned event-id
replay slots / newline-mergeable audit MACs; this dirty tree has the
named vacuous-root gate, body-MAC replay identity plus HTTP rotation
refusal, and length-prefixed v2 MAC (split-record red), with executed
red-capable evidence on dist. Residuals above remain outside those
bullets. Evidence is sufficient for those bullets; insufficient for
scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
