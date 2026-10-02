# Independent audit — capability grant snapshot (ownSignedGrant)

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim:

- **`csf_6cf7a494a713c40efe8c5d2c`**: Capability authority adopted from
  mutable input after signature verification. Files
  `packages-ts/galerina-tower-citizen/src/capability-grant.ts` and
  `src/hybrid-engine.ts` `resolveCapabilityGrant`. THIS TURN:
  `ownSignedGrant` copies `engineId` / `capabilityMask` / `grantId` and
  signature strings into a frozen object; one `preimage` is used for
  Ed25519 and ML-DSA; `verifyCapabilityGrant` returns `capabilityMask`
  from that owned grant. `resolveCapabilityGrant` already adopts
  `res.capabilityMask` (does not reread live `grant.capabilityMask`
  after `await`). Tests in
  `tests/rd0236-runtime-hardening.test.mjs`: mutating `capabilityMask`
  after snapshot cannot mint inference; getter swap after `await`
  returns mask 0. Dist rebuilt with `npx tsc` (author). Tests import
  `../dist/index.js`. Residual the author flags: grant field getters
  still fire once during `ownSignedGrant` (chimeric first-read is
  fail-closed if signatures do not match); `#capabilityResolved` still
  caches the adopted mask for later infers.

This reviewer independently re-read `capability-grant.ts` +
`resolveCapabilityGrant` + tests + dist, hashed working-tree bytes,
ran the named suite, and executed an extra probe from `%TEMP%` (not by
trusting the named tests alone). Author-named hashes were **not
supplied** in the review packet. Independent
`crypto.createHash('sha256')` and `Get-FileHash` MATCH each other on
the listed files.

Scan row remains **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote it. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **51 OPEN / 69
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 51 = 0 high / 1 medium /
50 low, `PARTIAL_THIS_TREE` 69, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The remaining OPEN medium is this ID. Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suite imports gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). This reviewer did not rebuild. Dist mtimes are newer than src
and carry the named controls (see hashes).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-tower-citizen/src/capability-grant.ts` | **M** HEAD blob `3fc76a1f5a` → WT blob `4dc92302ee` (+23 / −12). THIS TURN: `ownSignedGrant` freeze-copies `String(engineId)`, `Number(capabilityMask) >>> 0`, optional `String(grantId)`, and signature strings; `verifyCapabilityGrant` uses one `preimage = canonicalGrantString(g)` for Ed25519 and ML-DSA; returns `capabilityMask: g.capabilityMask` from the owned grant. HEAD copied a shallow unfrozen `g` from live `raw` and re-read live `signed.signature` / `signed.mlDsaSignature`, re-computing `canonicalGrantString(g)` after the ML-DSA `await import`. |
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | **M** HEAD blob `a6ef58f690` → WT blob `1ba8b99239` (+12). Extra dirty vs HEAD, **not** the named grant-snapshot hash: `#bridgeAttestationInFlight`. `resolveCapabilityGrant` (520–534) already adopts `res.capabilityMask >>> 0` and does **not** reread live `grant.capabilityMask` after `await` — **no hunk** vs HEAD in that function. `#capabilityResolved` still set once (417 / 521–522). |
| `packages-ts/galerina-tower-citizen/tests/rd0236-runtime-hardening.test.mjs` | **M** HEAD blob `30c60c6013` → WT blob `8b70826741` (+45 / −1). THIS TURN: “hostile: mutating capabilityMask after snapshot cannot mint inference authority”; “hostile: a getter that swaps the grant mask after await cannot confer ai.inference”. Imports `signCapabilityGrantHybrid` / `verifyCapabilityGrant` / `generateHybridAttestationKeypair` from `../dist/index.js`. |
| `packages-ts/galerina-tower-citizen/dist/capability-grant.js` | gitignored; rebuilt this turn (`npx tsc`); `ownSignedGrant` 50–62 / `preimage` 68 / Ed25519+ML-DSA both `Buffer.from(preimage)` 82+100 / return `g.capabilityMask` 108 |
| `packages-ts/galerina-tower-citizen/dist/hybrid-engine.js` | gitignored; `resolveCapabilityGrant` `res.capabilityMask` 309–311 / `#capabilityResolved` 206+301 |
| `packages-ts/galerina-tower-citizen/dist/index.js` | gitignored; barrel re-exports `verifyCapabilityGrant` from `./capability-grant.js` (line 87); imported by the named suite |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-tower-citizen/src/capability-grant.ts` | 7864 | `9b4a7294faef5ae32fd0ad28b9882817171e7d68059c2c8bf2ebf40bf1421363` |
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | 73400 | `ed1f4c23be89bb6e535e743bbf255d55950d2e02c7906cf059b5ea4da56599cc` |
| `packages-ts/galerina-tower-citizen/tests/rd0236-runtime-hardening.test.mjs` | 21925 | `44554e79b56e35a5999f941bc76b3184662e61bf8a783c7be5754c5d78c9b5b0` |
| `packages-ts/galerina-tower-citizen/dist/capability-grant.js` | 6563 | `db62f57edf5b7dfdcc6137abb4da932d67c41a1c02897457ad8f6fbe0af155a9` |
| `packages-ts/galerina-tower-citizen/dist/hybrid-engine.js` | 58511 | `8ae47a33425382573eb67a44307fc2828a818cddf2ddf365a23a48977f55501f` |
| `packages-ts/galerina-tower-citizen/dist/index.js` | 10895 | `a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32` |

Independent MATCH (Get-FileHash ↔ crypto): grant src
`9b4a7294…421363`; grant dist `db62f57e…f155a9`; hybrid src
`ed1f4c23…56599cc`; hybrid dist `8ae47a33…f55501f`; tests
`44554e79…c9b5b0`; barrel dist `a25d2ae0…c1d32`.

Dist mtimes (UTC): `capability-grant.js` `2026-09-23T09:05:47.636Z` /
`hybrid-engine.js` `2026-09-23T09:05:47.711Z` / `index.js`
`2026-09-23T09:05:47.819Z` (src `capability-grant.ts`
`2026-09-23T09:05:17.982Z` / `hybrid-engine.ts`
`2026-09-23T02:27:50.185Z` / tests `2026-09-23T09:05:32.484Z`). All
named dist files are newer than their src.

Inventory file sha256 `5240edb967ecdc0d6f402f1d45a01737b6bf9f4f58bf1d121200b27b480848e3`.
`findings_json_sha256` pin `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF row (still `OPEN_ON_SCAN_SNAPSHOT`, medium):

- `csf_6cf7a494a713c40efe8c5d2c` (`occ_fafdd4c57ca624fba072e2ba`,
  path `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts`,
  scan-era `start_line` 453, title “Capability authority is adopted from
  mutable input after signature verification”)

Named tests import `../dist/index.js` (`signCapabilityGrantHybrid` /
`verifyCapabilityGrant` / `createHybridEngine`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `ownSignedGrant` copies engineId/capabilityMask/grantId + signature strings into a frozen object | src 79–91 `Object.freeze` + `String`/`Number>>>0`; dist 50–62 |
| One `preimage` used for Ed25519 and ML-DSA | src `preimage` 101, Ed25519 117, ML-DSA 139; dist 68 / 82 / 100 |
| `verifyCapabilityGrant` returns `capabilityMask` from the owned grant | src 100 + 149 `capabilityMask: g.capabilityMask`; dist 66–67 + 108 |
| `resolveCapabilityGrant` adopts `res.capabilityMask`, not live `grant.capabilityMask` after `await` | src 529–531 / dist 309–311; function **clean vs HEAD** |
| Mutating `capabilityMask` after snapshot cannot mint inference | WT tests 273–294 23.8821ms; extra probe `maskIsZero:true` liveBodyAfter 32 trap `ERR_CAPABILITY_DENIED` |
| Getter swap after `await` returns mask 0 | WT tests 296–313 9.5965ms; extra probe `getterSwapAfterAwait.capabilityMask:0` `generationAfter:1` |
| 14 named tests | `node --test tests/rd0236-runtime-hardening.test.mjs` → 14/14 |
| Dist not stale for named bodies | hashes + same order in src/dist; dist mtimes newer; named suite imported dist and passed |
| Getters still fire once during `ownSignedGrant` | src 82–84 `raw.engineId` / `raw.capabilityMask` / `raw.grantId`; chimeric first-read fail-closed if signatures mismatch |
| `#capabilityResolved` caches the adopted mask | src 417 / 521–522; dist 206 / 300–301 |
| Inventory 51/69/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not this claim** |

## Command receipts

1. `git -C <worktree> rev-parse HEAD` →
   `91b4dec08fe4376febc9494a8023bd02912b8695`.
   `git status --short` for named paths → `M` grant src, `M` hybrid src,
   `M` named tests; dist gitignored (not listed).

2. `node --test tests/rd0236-runtime-hardening.test.mjs` in
   `packages-ts/galerina-tower-citizen`
   → **14/14 pass**, 0 fail, 0 skip, `duration_ms 259.3195`.
   Hostile mutate-after-snapshot 23.8821ms; getter-swap 9.5965ms; both
   green.

Independent extra (`%TEMP%\zt-capability-grant-snapshot-probe\probe.mjs`;
cwd `%TEMP%\zt-capability-grant-snapshot-probe`; `file://` import of
working-tree dist barrel; no production write):

| probe | result |
|---|---|
| Sign mask 0 hybrid, `queueMicrotask` mutate body to `ai.inference` (32), `verifyCapabilityGrant` | `ok:true`, **`capabilityMask:0`**, `maskIsZero:true`, `liveBodyAfter:32` |
| Same live grant into `createHybridEngine` then `infer` | `trapFired:true`, `trapCode:"ERR_CAPABILITY_DENIED"` |
| Getter swap after `await` (`generation` 0→1 during ML-DSA import) | `ok:true`, **`capabilityMask:0`**, `generationAfter:1`, `maskIsZero:true` |

## Challenge 1 — can mutating `capabilityMask` after snapshot mint `ai.inference`?

**No on this dirty tree for the named owned-grant snapshot.
CONFIRMED closed for `ownSignedGrant` + single `preimage` + return of
owned `g.capabilityMask`.** Extra probe: signed mask 0; after
`queueMicrotask` the live body is 32 (`ai.inference`);
`verifyCapabilityGrant.capabilityMask === 0`; engine infer traps
`ERR_CAPABILITY_DENIED`. Getter that returns 0 then 32 after `await`
still yields mask 0.

Scan-era object `0f6063dd…:packages-ts/galerina-tower-citizen/src/hybrid-engine.ts`
is **not** recategorized. Inventory still lists the row OPEN.

## Challenge 2 — is dist stale, or does `resolveCapabilityGrant` reread live `grant.capabilityMask` after `await`? Is this 124-scan closure?

**Dist not stale for the named bodies. `resolveCapabilityGrant` uses
`res.capabilityMask`, not live `grant.capabilityMask`. Not 124-scan
closure.** Dist `ownSignedGrant` / single `preimage` / owned return
match src and are newer than src; hybrid dist adopt-from-`res` matches
src (and HEAD) and is newer than src; named suite imported those dist
files and passed; extra probe imported the same dist barrel. CSF row
remains `OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **69** `PARTIAL_THIS_TREE`, **51**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 1 medium / 50 low). This review does
not recategorize the row.

## Residuals (not findings against the named owned-grant snapshot)

- Grant field getters still fire once during `ownSignedGrant` (src
  82–84). A chimeric first-read is fail-closed if the signatures do not
  match the owned preimage; extra probe getter-swap still returned mask
  0 with `generationAfter:1`. This receipt does not claim getters are
  never invoked.
- `resolveCapabilityGrant` still caches the adopted mask once
  (`#capabilityResolved` src 417 / 521–522). Later infers do not
  re-verify grant bytes. Extra dirty vs HEAD on `hybrid-engine.ts` is
  `#bridgeAttestationInFlight`, not this cache flag.
- Named suite imports gitignored dist, not src. Dist was confirmed
  non-stale for the named bodies; this receipt did not rebuild.
- Inventory still lists `csf_6cf7a494a713c40efe8c5d2c` as
  `OPEN_ON_SCAN_SNAPSHOT`. This receipt does not reclassify it. 51
  OPEN / 69 PARTIAL / 4 PATCHED remain. Worktree remains dirty HEAD
  `91b4dec0…`, **INCOMPLETE_NON_AUTHORITATIVE** for production
  admission. Not Astra. Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the named claim. The detector is not invalid
against scan-era adoption of mutable grant input after signature
verification; this dirty tree has the named frozen owned-grant copy,
single preimage, owned `capabilityMask` return, and
`res.capabilityMask` adopt, with executed red-capable evidence on dist.
Residuals above remain outside that bullet. Evidence is sufficient for
that bullet; insufficient for scan recategorization and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
