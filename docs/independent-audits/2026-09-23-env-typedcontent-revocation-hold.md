# Independent audit — Env secret-source, typed-content bounds, cached signing-key revocation

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

- **A** `csf_f89b4b3e81e08121ebbdabed`: Environment reads. Runtime already
  maps `Env`/`env`/`vault`/`Secrets` to `secret.read` via
  `resolveCapabilityEffect` and refuses `secret.read` without a capability
  host (`packages-ts/galerina-core-compiler/src/interpreter.ts`, **clean**
  vs HEAD). THIS TURN: `isSecretSourceExpression` treats receiver `env` as
  a secret source so `Env.get` then `log.info` is `FUNGI-SECRET-001`.
  File `packages-ts/galerina-core-compiler/src/value-state-checker.ts`.
  Tests `packages-ts/galerina-core-compiler/tests/value-state-checker.test.mjs`
  (100 tests). Dist rebuilt with `npx tsc`. Residual: authorized `Env.get`
  still returns a plain string at runtime (`env.secret` is the secure tag);
  effectful stdlib other than `secret.read` can still fall through to
  `callStdlib` when no capability host is present.
- **B** `csf_123a0c5bba057ae4781efcd9`: Typed-content interpolation.
  `scanInterpolations` already advances line/column incrementally (no
  per-site rescan from 0). THIS TURN: `MAX_TYPED_CONTENT_CHARS` 1_048_576
  and `MAX_TYPED_CONTENT_INTERPOLATIONS` 4096 refuse with
  `FUNGI-BLOCK-005`. File
  `packages-ts/galerina-core-compiler/src/typed-content-block.ts`. Tests
  `packages-ts/galerina-core-compiler/tests/typed-content-validation.test.mjs`
  (8 tests). Residual: injection `locationAt` still scans from 0 once;
  regex injection list is not a full HTML/JS/CSS parser.
- **C** `csf_f2a86f77b0c6d0e831e14640`: Cached admission vs later
  revocation. Engine already calls `revalidateCachedRevocation` and
  `revalidateCachedPhotonicCoupon` on each infer. Existing Q2
  coupon-after-cache test. THIS TURN added Q2 signing-key revocation after
  cached admission → `ERR_BRIDGE_UNATTESTED`. Tests
  `packages-ts/galerina-tower-citizen/tests/photonic-certified-admission.test.mjs`
  (16 tests). Residual: `resolveCapabilityGrant` still caches the signed
  mask once (`#capabilityResolved`); later grant-key revocation is not a
  separate re-verify of the grant bytes.

This reviewer independently re-read the three production files + tests +
dist (A/B required; C because those tests import dist), hashed
working-tree bytes, ran the named suites, and executed an extra probe
from `%TEMP%` (not by trusting the named tests alone). Author-named
hashes were **not supplied** in the review packet. Independent
`crypto.createHash('sha256')` and `Get-FileHash` MATCH each other on the
listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **54 OPEN / 66
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 54 = 0 high / 4 medium /
50 low, `PARTIAL_THIS_TREE` 66, `PATCHED_AUDIT_PENDING` 4; `n` 124;
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
| `packages-ts/galerina-core-compiler/src/value-state-checker.ts` | **M** HEAD blob `14d0ea7bd4` → WT blob `6c50badece` (+2 / −2). Dirty hunk: `isSecretSourceExpression` last-segment `ns === "env"` (via `receiverSegment` lowercasing, so `Env.get` matches). Comment lists `Env.get` / `env.secret`. |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | **clean** (blob `313e598276` = HEAD). `resolveCapabilityEffect` already maps `Env.`/`env.`/`vault.`/`Secrets.` → `secret.read` (3669–3695). Interpreter refuses `secret.read` without a capability host (2758–2762) then otherwise `callStdlib`. |
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | **M** HEAD blob `25c3c6a4b4` → WT blob `9713b4ef05` (+9 / −1). Extra dirty this turn, **not** the named env hash: dangling-symlink `readlinkSync` refuse. `environmentFn` `Env.get` → `{ __tag: "string" }` vs `env.secret` → `{ __tag: "secure" }` already on HEAD (1835–1846). |
| `packages-ts/galerina-core-compiler/src/typed-content-block.ts` | **M** HEAD blob `19cced8b02` → WT blob `6000a03848` (+21). Dirty hunk exports `MAX_TYPED_CONTENT_CHARS` 1_048_576 / `MAX_TYPED_CONTENT_INTERPOLATIONS` 4096; count-cap inside `scanInterpolations`; char-bound refuse before scan. Incremental `advanceLocation` already on HEAD. |
| `packages-ts/galerina-core-compiler/src/index.ts` | **M** HEAD blob `a40b6d1ce8` → WT blob `a447dafaf7` (+8). Named: re-exports the two MAX constants. Extra dirty, **not** the named typed-content hash: `wipeSecretHeapAfterHostCopy` / `injectLoopFuel` / `invokeAdmittedExport`. |
| `packages-ts/galerina-core-compiler/tests/value-state-checker.test.mjs` | **M** HEAD blob `1a8a90986d` → WT blob `bc36358262` (+10). THIS TURN: “Env.get then logged → FUNGI-SECRET-001”. |
| `packages-ts/galerina-core-compiler/tests/typed-content-validation.test.mjs` | **M** HEAD blob `dd40afe483` → WT blob `9f9234aa96` (+29). THIS TURN: char-bound and interpolation-count `FUNGI-BLOCK-005`. |
| `packages-ts/galerina-core-compiler/dist/value-state-checker.js` | gitignored; rebuilt this turn (`npx tsc`); `ns === "env"` line 397 |
| `packages-ts/galerina-core-compiler/dist/typed-content-block.js` | gitignored; MAX 3–4 / count-cap 101 / char-bound 114–117 |
| `packages-ts/galerina-core-compiler/dist/index.js` | gitignored; re-exports MAX constants line 1234 |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | gitignored; `secret.read` refuse 2561–2564 / `Env.` map 3465–3469 |
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | **M** HEAD blob `a6ef58f690` → WT blob `1ba8b99239` (+12). Extra dirty this turn, **not** the named revocation hash: `#bridgeAttestationInFlight`. `revalidateCachedRevocation` (619–623) and `revalidateCachedPhotonicCoupon` (745–763) already on HEAD; infer still `?? this.revalidateCachedRevocation()` then coupon revalidate (842–850). `#capabilityResolved` still set once (417 / 521–522). |
| `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts` | **M** HEAD blob `93a5afd6a3` → WT blob `990e0cea41` (+49 / −5). Extra dirty, **not** the named revocation hash: `ownManifestSnapshot` / `ownAttestationSnapshot`. `evaluateSignerRevocation` already on HEAD (150–176). |
| `packages-ts/galerina-tower-citizen/src/capability-grant.ts` | **clean** (blob `3fc76a1f5a` = HEAD). `verifyCapabilityGrant` calls `evaluateSignerRevocation` once per resolve; engine does not re-enter after `#capabilityResolved`. |
| `packages-ts/galerina-tower-citizen/tests/photonic-certified-admission.test.mjs` | **M** HEAD blob `c3dbed2074` → WT blob `54ce02e072` (+31). THIS TURN: “Q2: signing-key revocation after cached admission denies the attested bridge”. Existing Q2 coupon-after-cache test remains. |
| `packages-ts/galerina-tower-citizen/dist/hybrid-engine.js` | gitignored; `revalidateCachedRevocation` 401 / coupon 531 / infer 627+632 / `#capabilityResolved` 206 |
| `packages-ts/galerina-tower-citizen/dist/bridge-attestation.js` | gitignored; `evaluateSignerRevocation` present |
| `packages-ts/galerina-tower-citizen/dist/index.js` | gitignored; barrel imported by the named suite |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-compiler/src/value-state-checker.ts` | 136647 | `3aacbc6b013ef9d0f3ede953eb773c5bf86d3dc1c36068d1e23e083d4cc493ad` |
| `packages-ts/galerina-core-compiler/src/typed-content-block.ts` | 6927 | `0a6cdbed38d8d80b2bc395a6657ee658cdff6c27dd3bb03c336887666d18a5f8` |
| `packages-ts/galerina-core-compiler/src/index.ts` | 124412 | `b4d4f7d7870d059ef8ed29e92430d1051bad3ce956c7d50a6fe84ce1d10e5840` |
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | 135369 | `80e3cc6b81c6cff00dbbf19d74deadc8000c4ca32ed26711897837f5a8788110` |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | 223938 | `93f8a48218c135615e8c149f3984313d6402b5379beb4ad59685615b0deb35f1` |
| `packages-ts/galerina-core-compiler/dist/value-state-checker.js` | 131946 | `279309e7be8b6c895bf22cf1df9a1e27a5828ec3639aa3ce4a90de6d9e5449cd` |
| `packages-ts/galerina-core-compiler/dist/typed-content-block.js` | 5855 | `126e6752750a4b7a3f5d7cf235c8afbc859a8c50112aeb022a77cac6c61ccc32` |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101424 | `1b353f8576d14da18ba0018e84c9a694d6ccb2d2f26b2857eb06af432aa00754` |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | 222498 | `ead79683d083cd0fb9d69bbb9fabab1cb2f7269e0f027e1c63edbeadb486f5ec` |
| `packages-ts/galerina-core-compiler/tests/value-state-checker.test.mjs` | 55222 | `98c7d7798fc5225a1d1c8b64a7bd30d8291636d0d32ea09839b4e2a11cdfa13b` |
| `packages-ts/galerina-core-compiler/tests/typed-content-validation.test.mjs` | 5606 | `1afba6242c9b02927ad67baaee35be25ad92db0a85494ac586e961b47e4c5d21` |
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | 73400 | `ed1f4c23be89bb6e535e743bbf255d55950d2e02c7906cf059b5ea4da56599cc` |
| `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts` | 15994 | `d0ea4894e3264b8247a1a6c093c37222a2ea2a40636c5c96667a0976e458c051` |
| `packages-ts/galerina-tower-citizen/src/capability-grant.ts` | 7369 | `dc9ed42a590a5ea11bfc872c680a209cef1b5d64edb1e97ab7bb360685347676` |
| `packages-ts/galerina-tower-citizen/dist/hybrid-engine.js` | 58511 | `8ae47a33425382573eb67a44307fc2828a818cddf2ddf365a23a48977f55501f` |
| `packages-ts/galerina-tower-citizen/dist/bridge-attestation.js` | 12394 | `4112dbf6d32f73bff6d01d2f428606b7ebd407efdc3d802184f9631c986d8503` |
| `packages-ts/galerina-tower-citizen/dist/index.js` | 10895 | `a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32` |
| `packages-ts/galerina-tower-citizen/tests/photonic-certified-admission.test.mjs` | 18468 | `19f5cd3aa6b6e8b6a15c4e0deb5ede54363e8e7dd2d885bf37e716caf5aa02c8` |

Independent MATCH (Get-FileHash ↔ crypto): A value-state src
`3aacbc6b…cc493ad`; A dist value-state `279309e7…5449cd`; B typed-content
src `0a6cdbed…18a5f8`; B dist typed-content `126e6752…61ccc32`; C hybrid
src `ed1f4c23…56599cc`; C dist hybrid `8ae47a33…f55501f`. Interpreter src
`93f8a482…deb35f1` MATCH.

Dist mtimes (UTC): compiler `value-state-checker.js`
`2026-09-23T08:48:34.204Z` / `typed-content-block.js`
`2026-09-23T08:48:34.310Z` / `index.js` `2026-09-23T08:48:34.625Z` /
`interpreter.js` `2026-09-23T08:48:34.153Z` (src `value-state-checker.ts`
`2026-09-23T08:47:23.696Z` / `typed-content-block.ts`
`2026-09-23T08:47:23.710Z` / `index.ts` `2026-09-23T08:47:23.696Z` /
`interpreter.ts` `2026-09-22T07:37:09.873Z`); tower-citizen
`hybrid-engine.js` `2026-09-23T08:17:18.052Z` / `bridge-attestation.js`
`2026-09-23T08:17:17.974Z` / `index.js` `2026-09-23T08:17:18.160Z` (src
`hybrid-engine.ts` `2026-09-23T02:27:50.185Z` / `bridge-attestation.ts`
`2026-09-23T08:17:09.312Z`). All named dist files are newer than their
src.

Inventory file sha256 `c1e41ad9f456b5949a1cc88aad3fc13932a8eb301784252e0e537fcb16ed24dc`.
`findings_json_sha256` pin `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (all still `OPEN_ON_SCAN_SNAPSHOT`, medium):

- `csf_f89b4b3e81e08121ebbdabed` (`occ_eedc4708c8b34cf25303bb7c`,
  path `packages-ts/galerina-core-compiler/src/interpreter.ts`,
  scan-era `start_line` 3662, title “Environment reads bypass capability
  authorization and secure-value tracking”)
- `csf_123a0c5bba057ae4781efcd9` (`occ_ef7c31bae7564c25fac4c24e`,
  path `packages-ts/galerina-core-compiler/src/typed-content-block.ts`,
  scan-era `start_line` 49, title “Typed-content interpolation validation
  performs quadratic work”)
- `csf_f2a86f77b0c6d0e831e14640` (`occ_f7b3b625842c38339f51cb26`,
  path `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts`,
  scan-era `start_line` 465, title “Cached admission ignores later
  signing-key and device revocation”)

Named A tests import `../dist/index.js` (`parseProgram` /
`checkValueStates`). Named B tests import `../dist/index.js`
(`validateTypedContentBlock` + MAX constants + `checkTypes`). Named C
tests import `../dist/index.js` (barrel re-exports
`createHybridEngine`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A runtime maps Env/env/vault/Secrets → `secret.read` | src interpreter `resolveCapabilityEffect` 3688–3695 / dist 3465–3469; **clean** vs HEAD |
| A refuses `secret.read` without a capability host | src 2758–2762 / dist 2561–2564; extra probe `noHost` `CapabilityError: environment reads require a capability host` |
| A `isSecretSourceExpression` treats receiver `env` as a secret source | src 470–478 (`ns === "env"`) / dist 397; `receiverSegment` lowercases (318–323) so `Env.get` matches |
| A `Env.get` then `log.info` → FUNGI-SECRET-001 | WT tests 1020–1028; extra probe `secret001:true` codes `["FUNGI-SECRET-001"]` |
| A 100 named tests | `node --test tests/value-state-checker.test.mjs` → 100/100 |
| A authorized `Env.get` still returns a plain string | src stdlib `environmentFn` 1840–1842 `{ __tag: "string" }`; extra probe `envGetInner:"string"` / `withHost.inner:"string"` value `"s3cret-value"`; `env.secret` tag `"secure"` |
| A other effectful stdlib falls through without a host | src interpreter 2765–2770 after the `secret.read`-only refuse; extra probe `File.readText` no host → `ok` `"fallthrough-ok"` |
| B `scanInterpolations` incremental (already) | src 117–175 `advanceLocation(content, index, open, line, column)` |
| B `MAX_TYPED_CONTENT_CHARS` 1_048_576 refuse FUNGI-BLOCK-005 | src 33 + 181–189 / dist 3 + 114–117; WT tests 116–126; extra probe `over005:true` |
| B `MAX_TYPED_CONTENT_INTERPOLATIONS` 4096 refuse FUNGI-BLOCK-005 | src 34 + 160–167 / dist 4 + 101–103; WT tests 128–141; extra probe `count005:true` |
| B 8 named tests | `node --test tests/typed-content-validation.test.mjs` → 8/8 |
| B injection `locationAt` still scans from 0 once | src `locationAt` 72–79 `advanceLocation(..., 0, index, ...)`; extra probe injection line 5 col 1 (`locationAtFromZero:true`) |
| B regex list is not a full HTML/JS/CSS parser | src 36–49 + 194–208 suggestedFix “closed injection list”; extra probe `<script>` → FUNGI-BLOCK-006 |
| C `revalidateCachedRevocation` / coupon on each infer (already) | src 842–850 / dist 627–632 |
| C existing Q2 coupon-after-cache | WT tests 268–285 |
| C THIS TURN signing-key revocation after cached admission → `ERR_BRIDGE_UNATTESTED` | WT tests 237–266 11.0293ms; extra probe first `trapCode:null`, second `"ERR_BRIDGE_UNATTESTED"` |
| C 16 named tests | `node --test tests/photonic-certified-admission.test.mjs` → 16/16 |
| C grant mask cached once (`#capabilityResolved`) | src 417 / 520–522; extra probe second trap is `ERR_BRIDGE_UNATTESTED` not `ERR_CAPABILITY_DENIED` (`grantNotReDenied:true`) |
| Dist not stale for named bodies | hashes + same order in src/dist; dist mtimes newer; named suites imported dist and passed |
| Inventory 54/66/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `node --test tests/value-state-checker.test.mjs` in
   `packages-ts/galerina-core-compiler`
   → **100/100 pass**, 0 fail, 0 skip, `duration_ms 427.4457`.
   “Env.get then logged → FUNGI-SECRET-001” 0.3584ms; green.

2. `node --test tests/typed-content-validation.test.mjs` in
   `packages-ts/galerina-core-compiler`
   → **8/8 pass**, 0 fail, 0 skip, `duration_ms 344.4121`.
   Char-bound 0.1856ms; interpolation-count 3.1282ms; both green.

3. `node --test tests/photonic-certified-admission.test.mjs` in
   `packages-ts/galerina-tower-citizen`
   → **16/16 pass**, 0 fail, 0 skip, `duration_ms 513.3755`.
   Q2 signing-key revocation after cached admission 11.0293ms; Q2
   coupon-after-cache 11.8139ms; both green.

Independent extra (`%TEMP%\zt-env-typedcontent-revocation-probe\probe.mjs`;
cwd `%TEMP%\zt-env-typedcontent-revocation-probe`; `file://` import of
working-tree dist barrels; no production write):

| probe | result |
|---|---|
| A `Env.get` then `log.info` (checker) | `secret001:true`, codes `["FUNGI-SECRET-001"]` |
| A `callStdlib` tags | `Env.get` inner `"string"`; `env.secret` `"secure"` |
| A `executeFlow` `Env.get` no host | `err` `CapabilityError: environment reads require a capability host` |
| A `executeFlow` `Env.get` with host | `ok` inner `"string"` value `"s3cret-value"` |
| A `File.readText` no host (fallthrough) | `ok` `"fallthrough-ok"` |
| B oversized block | FUNGI-BLOCK-005 `Typed content block exceeds the 1048576-character host bound.` |
| B interpolation count 4097 | FUNGI-BLOCK-005 interpolation-count |
| B injection `locationAt` from 0 | FUNGI-BLOCK-006 at line 5 col 1 (`locationAtFromZero:true`) |
| C first infer then revoke `signerKeyId` `hybrid-k1` | first `trapCode:null` / `trapFired:false`; second **`ERR_BRIDGE_UNATTESTED`** / `trapFired:true`; not `ERR_CAPABILITY_DENIED` |

## Challenge 1 — can `Env.get` still reach `log.info` without FUNGI-SECRET-001?

**No on this dirty tree for the value-state checker. CONFIRMED closed for
the named `isSecretSourceExpression` `env` receiver.** Extra probe:
`Env.get` then `log.info` is SECRET-001. Runtime already maps Env to
`secret.read` and refuses that effect without a capability host (clean
vs HEAD; extra probe no-host err). Residual below: authorized `Env.get`
is still a plain string at runtime; non-`secret.read` stdlib still
executes without a host.

Scan-era object `0f6063dd…:packages-ts/galerina-core-compiler/src/interpreter.ts`
is **not** recategorized. Inventory still lists the row OPEN.

## Challenge 2 — can typed-content interpolation still run unbounded / quadratic per site?

**No on this dirty tree for the named char and interpolation host
bounds. CONFIRMED closed for `MAX_TYPED_CONTENT_CHARS` /
`MAX_TYPED_CONTENT_INTERPOLATIONS` → FUNGI-BLOCK-005.** Extra probe:
1_048_577 chars refuses before scan; 4097 interpolations refuse
count-capped. Incremental `advanceLocation` already on HEAD. Residual
below: injection `locationAt` still walks from 0 once; the injection
list is a closed regex set, not a parser.

## Challenge 3 — is dist stale, or is this 124-scan closure? Does later signer revocation keep a cached admission live?

**Dist not stale for the named bodies. Not 124-scan closure. Cached
signing-key revocation after admission is denied.** Compiler dist MAX /
`ns === "env"` / `secret.read` refuse match src and are newer than src;
tower-citizen dist revalidate-on-infer matches src and is newer than
src; named suites imported those dist files and passed; extra probe
imported the same dist barrels. First infer admitted; later
`signerKeyId` revocation trapped `ERR_BRIDGE_UNATTESTED`. All three CSF
rows remain `OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **66** `PARTIAL_THIS_TREE`, **54**
`OPEN_ON_SCAN_SNAPSHOT` (0 high / 4 medium / 50 low). This review does
not recategorize the rows.

## Residuals (not findings against the named env secret-source / typed-content bounds / signing-key revalidate)

- **A.** Authorized `Env.get` still returns a plain string at runtime
  (`environmentFn` 1840–1842); extra probe `envGetInner:"string"` and
  with-host `inner:"string"`. `env.secret` is the secure tag (extra
  probe `"secure"`). Effectful stdlib other than `secret.read` still
  falls through to `callStdlib` when no capability host is present;
  extra probe `File.readText` no host returned `"fallthrough-ok"`.
  Extra dirty on `stdlib.ts` this turn is dangling-symlink
  `readlinkSync`, not the named env hash. `interpreter.ts` is clean vs
  HEAD (capability mapping already present).
- **B.** Injection `locationAt` still scans from index 0 once (src
  72–79); extra probe FUNGI-BLOCK-006 at the block start line/col
  (5,1), not at the `<script>` site. Regex injection list
  (`HTML_INJECTION` / `SCRIPT_INJECTION` / `CSS_INJECTION`) is not a
  full HTML/JS/CSS parser (src suggestedFix 205). Extra dirty on
  `src/index.ts`: WAT/WASM exports, not the named MAX re-export.
- **C.** `resolveCapabilityGrant` still caches the signed mask once
  (`#capabilityResolved`); extra probe later signer revocation traps
  `ERR_BRIDGE_UNATTESTED` rather than `ERR_CAPABILITY_DENIED` — grant
  bytes are not re-verified on the second infer. `verifyCapabilityGrant`
  does call `evaluateSignerRevocation`, but only on first resolve
  (`capability-grant.ts` **clean** vs HEAD). Extra dirty on
  `hybrid-engine.ts`: `#bridgeAttestationInFlight`. Extra dirty on
  `bridge-attestation.ts`: own-data snapshot copy, not the named
  revocation revalidate (already on HEAD).
- Named suites import gitignored dist, not src. Dist was confirmed
  non-stale for the named bodies; this receipt did not rebuild.
- Inventory still lists all three IDs as `OPEN_ON_SCAN_SNAPSHOT`.
  This receipt does not reclassify them. 54 OPEN / 66 PARTIAL / 4
  PATCHED remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. Detectors are not
invalid against scan-era env reads / unbounded typed-content
interpolation / cached admission ignoring later revocation; this dirty
tree has the named `env` secret-source tag, typed-content char and
interpolation host bounds, and signing-key revalidation after cached
admission, with executed red-capable evidence on dist. Residuals above
remain outside those bullets. Evidence is sufficient for those bullets;
insufficient for scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
