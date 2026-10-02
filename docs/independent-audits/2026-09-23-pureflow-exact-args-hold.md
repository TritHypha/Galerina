# Independent audit — pure-flow exact typed argument encoding

**Verdict: PASS** (scoped to this exact-args slice of already-PARTIAL
`csf_456107f3e63d6f916462d1bf`). Filename is the requested `*-hold.md`
path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation 91b4dec08 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This receipt
is not the author’s packet. Passing tests here are **not** production
admission.

Reviewer: Grok worker (not GPT Astra). Did **not** author these changes.
Finding `csf_456107f3e63d6f916462d1bf` is already `PARTIAL_THIS_TREE` from
batch 22 (source-tag / `canonicalHash(flowNode)` / captured-key skip).
This slice does **not** repeat those repairs. This review does **not**
promote the inventory row to `PATCHED_AUDIT_PENDING`.

Named claim (this slice only):

- Cache identity now uses exact typed argument encoding (not 32-bit FNV
  fingerprints in the key). Known colliding strings `1e3b337a72dda550` and
  `7d98dbeaba50bb98` still share fingerprint `455062583` but distinct
  encodings and keys. `get` compares stored exact encoding; mismatch is a
  miss. Values are owned copies. Secure / PII-like tags are
  cache-ineligible. Extra source scope over 256 bytes is hashed, not
  dropped. `executeFlow` echo of those two strings returns each string.
  Tests `tests/pure-flow-cache-identity.test.mjs` plus existing
  source-cache and flags memoization. Dist rebuilt.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read production + tests + gitignored
compiler `dist/` (named suites import `dist/`), hashed working-tree
bytes, ran the named suites, and executed an extra probe from `%TEMP%`
(not by trusting the named tests alone). Author-named hashes were **not**
supplied in the review packet. Independent `crypto.createHash('sha256')`
and `Get-FileHash` MATCH each other on the listed files.

Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **0 OPEN / 120
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 0, `PARTIAL_THIS_TREE`
120, `PATCHED_AUDIT_PENDING` 4; `n` 124; disposition sum 124). Named row
stays `PARTIAL_THIS_TREE`. Overall `INCOMPLETE_NON_AUTHORITATIVE`. This
is **not** 124-scan closure. Not production admission.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

This working tree still carries the batch-22 source-tag / flowNode-hash
repairs **and** this exact-args slice. Versus HEAD both are dirty. Versus
prior independent PASS `01a0cea3-04b1` (receipt
`docs/independent-audits/2026-09-23-pureflowcache-watcoverage-rebrand-hold.md`)
the exact-args change is the added identity.

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` | **M** HEAD blob `40316d31c` → WT blob `9d7241487`. HEAD `pureFlowCacheKey` hashed `galerinaValueFingerprint` (32-bit FNV) into the LRU key. THIS SLICE: `encodePureFlowArgs` / `admitPureFlowCacheIdentity` store `{key, exact}`; key is `productArtifactKey(sha256(flowName + sourceTag + exact))`, not FNV; `get` misses when `node.exact !== exact`; `ownGalerinaValue` on get/set; `secure`/`protected`/`redacted`/error-like tags encode to `null` (ineligible); `composeSourceBoundTag` hashes extra past 256 bytes as `:x:<sha256>`. FNV remains exported for the known collision pair. |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | **M** HEAD blob `313e59827` → WT blob `11e2e58cd`. Fast-path `executeFlow` now calls `admitPureFlowCacheIdentity` and passes `cacheIdentity.exact` into get/set. Missing identity still skips cache (batch 22; not re-claimed). |
| `packages-ts/galerina-core-compiler/src/index.ts` | **M** HEAD blob `a40b6d1ce` → WT blob `8101134b3`. Re-exports `admitPureFlowCacheIdentity`, `composeSourceBoundTag`, `encodePureFlowArgs`, `galerinaValueFingerprint` (file also carries unrelated dirty-tree edits). |
| `packages-ts/galerina-core-compiler/dist/pure-flow-cache.js` | gitignored; rebuilt this turn; exact encoding + exact-mismatch miss + owned copies present. |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | gitignored; rebuilt this turn; `getCachedPureFlow(cacheIdentity.key, cacheIdentity.exact)` present. |
| `packages-ts/galerina-core-compiler/tests/pure-flow-cache-identity.test.mjs` | **??** untracked. THIS SLICE: FNV collision pair, forced same-key miss, owned record copy, oversize extra hashed, `executeFlow` echo, date-shaped strings, secure ineligible. |
| `packages-ts/galerina-core-compiler/tests/pure-flow-source-cache.test.mjs` | **??** untracked (batch 22; not this slice). Re-run only. |
| `packages-ts/galerina-core-compiler/tests/governance/flags-and-manifest.test.mjs` | unchanged vs HEAD blob `0caf69edc`. Same-AST memoization still passes. |

Prior PASS hashes for comparison (not this slice): cache.ts
`728a984c1a09cebe51573f97d0d305ed92d606ad3902c21d4f852e5b3d69fc21`
(10432 bytes); interpreter.ts
`825c4d7aba11814a7d4acd2c84e32718e1c14c412197022734b4d4cabb937477`
(224113 bytes). Current files are larger and different.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other).

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` | 16138 | `8c9a336cbf2864b57008d7dfa6b1e20833c8dbb06a80b1fc43c1834ecd786010` | 2026-09-23T15:19:51.009Z |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | 224247 | `eb09df94d370e0ca045803b62f50e07e4bac491777013e27fa82ca2db013c868` | 2026-09-23T15:18:53.933Z |
| `packages-ts/galerina-core-compiler/src/index.ts` | 124548 | `a859967415fb87240eb3b2ecf6366d3d4a296de2595e2d08667a976042001bd5` | 2026-09-23T15:18:53.882Z |
| `packages-ts/galerina-core-compiler/dist/pure-flow-cache.js` | 15946 | `3fe1f65f523169e9a0d3c56b56a74bb673a9bec5e313a4a08cad563ecd36d5e3` | 2026-09-23T15:19:59.927Z |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | 222860 | `5db897cb95ae6e37337dd1b953d77f8dbfa1d4a9f2956f03f71cc89a23e1f9b9` | 2026-09-23T15:20:00.011Z |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101545 | `792e964257d53efefa746e9fc3f136212a9ac49b47ff963bd8a2ba01d8e72d85` | 2026-09-23T15:20:00.484Z |
| `packages-ts/galerina-core-compiler/tests/pure-flow-cache-identity.test.mjs` | 4599 | `68342a417762291e5b68ea44d3460ff29273c6562752dd70410e885d4bae9ba4` | 2026-09-23T15:19:27.598Z |
| `packages-ts/galerina-core-compiler/tests/pure-flow-source-cache.test.mjs` | 2019 | `fd74ee7e80fdd52089d3eb686e33f6001551b6c59b8da9c023b107c18f794929` | 2026-09-23T14:16:06.930Z |
| `packages-ts/galerina-core-compiler/tests/governance/flags-and-manifest.test.mjs` | 24670 | `73086e6f065070050b1b9edc505935d673ff8efae48290714e5a247b42d4c251` | 2026-09-08T20:31:55.737Z |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 70426 | `3ad76fa818a182f0e9daee052e1b7a29bd18f604a3addc62148e8112106edb07` | 2026-09-23T14:48:58.924Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row. Dist
mtimes are newer than matching src. This reviewer did **not** rebuild;
gitignored `dist/` already carries `encodePureFlowArgs`,
`node.exact !== exact`, `ownGalerinaValue`, secure-encode `return null`,
and interpreter `cacheIdentity.exact`. Suites import `dist/`
(`packages-ts/.gitignore` `dist/`).

Inventory file sha256
`3ad76fa818a182f0e9daee052e1b7a29bd18f604a3addc62148e8112106edb07`
(`??` / dirty). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named row remains `PARTIAL_THIS_TREE` with batch-22 note. Reviewer did
not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| exact args in identity | cache identity uses exact typed encoding, not 32-bit FNV in the key | `admitPureFlowCacheIdentity` hashes `flowName\\n${admitted}\\n${exact}`; FNV not referenced in key construction | identity **7/7** first test: encodings and keys differ | TEMP: encL `1:x=S16:1e3b337a72dda550` ≠ encR `1:x=S16:7d98dbeaba50bb98`; keys `product-artifact-v1:95246ff3…:echo` ≠ `…dcaab46a…:echo` | Map **key** is still a SHA-256 digest of that encoding (see residual) |
| known FNV collision | strings `1e3b337a72dda550` / `7d98dbeaba50bb98` share fingerprint `455062583` | `galerinaValueFingerprint` still FNV-1a 32-bit | identity first test | TEMP: both fingerprints `455062583` | FNV comments still say “used only for the LRU cache key”; that comment is stale; fingerprint is exported for this pair |
| exact compare | `get` compares stored exact; mismatch is a miss | `if (exact.length > 0 && node.exact.length > 0 && node.exact !== exact) { misses++; return undefined }` | hostile forced-bucket **pass** | TEMP: `set("forced-bucket", LEFT, encL)` then `get(..., encR)` is `undefined`; `get(..., encL)` is LEFT | empty `exact=""` skips the compare (legacy flags helper still uses that path) |
| owned copies | stored / returned values are owned copies | `ownGalerinaValue` on `get` and `set` | owned-record test **pass** | TEMP: mutate returned string; later get still LEFT | list items are frozen copies; record `Map` is a new map of owned fields |
| secure / PII-like ineligible | secure / PII-like tags are cache-ineligible | `encodeValue` returns `null` for `secure`/`protected`/`redacted`/`unresolved`/`function`/`runtimeError`/`error`; `admitPureFlowCacheIdentity` then returns `null` | secure test **pass** | TEMP: secure/protected/redacted encode `null`; admit of secure is `null` | governance `ContainsPII` / `pii.*` / `phi.*` is still caller-`noCache` (comment); tag-level only is enforced here |
| extra >256 hashed | extra source scope over 256 bytes is hashed, not dropped | `composeSourceBoundTag` → `${sourceHash}:x:${sha256(extra)}` when `${sourceHash}:${extra}` exceeds 256 | compose test **pass** | TEMP: `A.repeat(300)` vs `B.repeat(300)` distinct `:x:` digests; both length 138 ≤ 256 | plaintext extra is not retained in the tag past 256; only its digest |
| executeFlow echo | colliding strings return each string | fast-path uses `cacheIdentity.exact` | executeFlow identity test **pass** | TEMP: LEFT then RIGHT (`executionTier` `sync`, not `cache`) then LEFT again (`cache`); values match each argument | non-`pureFastPath` governed path is outside this slice |
| tests + dist | identity + source-cache + flags memoization; dist rebuilt | dist mtimes after src; bodies match claim | identity **7/7**, source-cache **2/2**, flags memo **3/3** | TEMP probe imports the same gitignored `dist/index.js` | reviewer did not run `tsc` |

## Residuals (confirmed true; keep PARTIAL)

1. **flowNode hash still omits imported dependencies.**
   `sourceBoundPureFlowTag` hashes `canonicalHash(flowNode)` where
   `flowNode = buildFlowIndex(ast).get(flowName)` — the named decl node
   only. TEMP parse of `import helper from "./helper.fungi"` plus
   `return helper(x)` : `canonicalHash(echoNode) !== canonicalHash(ast)`
   and `JSON.stringify(echoNode)` does **not** contain `helper.fungi`.
   Two programs that share a local `echo` body but import different
   helpers can still share a source-bound tag. Batch-22 source-tag
   binding is unchanged.

2. **SHA-256 of the encoding is still a digest.**
   `admitPureFlowCacheIdentity` sets
   `key = productArtifactKey(context, "sha256:"+sha256(flowName+tag+exact)) + ":" + flowName`.
   Distinct encodings produced distinct keys for the known pair. A
   hypothetical SHA-256 collision on two encodings would share a Map
   key; `get` then misses because `node.exact !== exact`. Forced
   same-key miss is covered. The LRU index is not the exact string.

3. **Process-wide LRU.**
   `const SESSION_CACHE = new LRUCache()` at module scope; `MAX_ENTRIES`
   1000. Same as batch 22. Not partitioned by request, tenant, or
   isolate.

Not claimed this slice (not re-audited as new work): empty source-tag
refuse `FUNGI-CACHE-001`; two bodies of `double` not sharing 42.

## Suites (fresh this review)

From worktree, `node --test` (win32 Node v24.18.0):

- `packages-ts/galerina-core-compiler/tests/pure-flow-cache-identity.test.mjs`:
  **7/7** pass, fail 0, skipped 0, duration ~358ms. Covers FNV collision
  vs distinct encodings/keys; forced same-key miss; owned record copy;
  oversize extra hashed; `executeFlow` echo of the collision pair;
  date-shaped strings; secure ineligible.
- `packages-ts/galerina-core-compiler/tests/pure-flow-source-cache.test.mjs`:
  **2/2** pass, fail 0, skipped 0, duration ~343ms. Batch-22 empty-identity
  refuse + two-body `double` not sharing 42 (re-run only).
- `packages-ts/galerina-core-compiler/tests/governance/flags-and-manifest.test.mjs`
  `--test-name-pattern "Pure flow LRU memoization"`: **3/3** pass, fail 0,
  duration ~332ms. Same-AST `double` memoization still hits; legacy
  `getCachedPureFlow` without exact still retrieves (empty-exact
  wildcard).

## Extra probe (from `%TEMP%`, not the named tests)

Script: `%TEMP%\pureflow-exact-args-probe.mjs` importing
`packages-ts/galerina-core-compiler/dist/index.js` via `file:` URL.
`ok: true`.

- Fingerprint of both strings: **455062583** (CONFIRMED).
- Encodings: `1:x=S16:1e3b337a72dda550` ≠ `1:x=S16:7d98dbeaba50bb98`.
- Keys: `product-artifact-v1:95246ff317484fd2522cbc42198b03b860bf6758195ef93528b97bc1e9dc90c7:echo`
  ≠ `product-artifact-v1:dcaab46aa1954b4946e2b8e9b82d560f69961957a7010f5b517f67dc66ae3d84:echo`.
- Forced bucket: exact-R miss; exact-L hit; mutating the hit does not
  change the next hit.
- `secure` / `protected` / `redacted` encode `null`.
- `composeSourceBoundTag` extras of 300 `A` vs 300 `B`:
  `:x:4daeb9ac8be203281aceb5f4511220333686abfde4d2ccd50a49cd156a2e8cf5` vs
  `:x:aa744ec9b79bc1dfdcffd1aa72710e226039ede91eed8d701fa8d8bfd65f3a57`.
- `executeFlow` echo: left / right / left-again =
  `1e3b337a72dda550` / `7d98dbeaba50bb98` / `1e3b337a72dda550`;
  right tier `sync`; left-again tier `cache`.

## Inventory (not promoted)

Row `csf_456107f3e63d6f916462d1bf` / `occ_c5e5bd70a18e51bee2d7d382`:
severity low, confidence high, path
`packages-ts/galerina-core-compiler/src/pure-flow-cache.ts`, disposition
**`PARTIAL_THIS_TREE`**. Note still cites batch 22 source-tag binding and
independent PASS `01a0cea3-04b1`. This review leaves that disposition.

Live counts: **0 OPEN / 120 PARTIAL / 4 PATCHED** (124/124). OPEN
exhaustion is not closure. Independent scoped PASS is not production
admission.

## Receipt

- Reviewer: Grok independent auditor (did not author; not GPT Astra).
- Session: `01a0ceda-70d7`.
- Worktree: `rd-0873-native-fungi-bootstrap-implementation` dirty HEAD
  `91b4dec08fe4376febc9494a8023bd02912b8695`.
- No commit / merge / push / signing / `.fungi`.
- Production source not edited. This file is the only write.
- Named claim: **PASS**. Finding stays **PARTIAL_THIS_TREE**.
- Residuals confirmed: imported deps omitted from `flowNode` hash;
  SHA-256 digest still indexes the LRU; process-wide `SESSION_CACHE`.
