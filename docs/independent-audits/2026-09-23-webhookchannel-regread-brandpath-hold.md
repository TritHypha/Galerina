# Independent audit — webhook channel replay / bounded registry read / brand path

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation 91b4dec08 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This receipt
is not the author’s packet. Passing tests here are **not** production
admission. `runFixLogicnBrand({ write: true })` and the brand CLI were
**not** invoked against this dirty worktree.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_30936b039d064da89a8a7b01`**: webhook replay identity is not
  consumed unless the configured channel factor is ALLOW (or no channel
  resolver is configured). Non-ALLOW / undefined channel returns 401
  without `admitWebhookReplay`. File
  `packages-ts/galerina-framework-api-server/src/index.ts`. Tests
  `tests/webhook-admission.test.mjs` including hostile non-ALLOW then
  later ALLOW succeeds. Dist rebuilt. Platform this review: win32 Node
  v24.18.0.

- **B. `csf_d61c1410698c885114d3b250`**: `readBoundedRegularFile` uses
  `handle.read` into `maxBytes+1`, never `handle.readFile`. Missing
  `read()` fail-closes. Exported. File
  `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts`.
  Tests `tests/registry-bounded-read.test.mjs`. Dist rebuilt.

- **C. `csf_6ea131d447cf245230cf6c2f`**: `isDirectRun` so import does not
  rewrite; `admitBrandRel`; `parseBrandAudit` size/shape; write uses abs
  path; `lstat` refuses symlink. File `scripts/fix-logicn-brand.mjs`.
  Tests `scripts/tests/fix-logicn-brand.test.mjs`. CLI was not run
  against this worktree.

This reviewer independently re-read production + tests + gitignored dist
(the two TypeScript suites import `dist/`; the brand script is executed
as `.mjs` source), hashed working-tree bytes, ran the named suites, and
executed an extra probe from `%TEMP%` (not by trusting the named tests
alone). Author-named hashes were **not** supplied in the review packet.
Independent `crypto.createHash('sha256')` and `Get-FileHash` MATCH each
other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **8 OPEN / 112
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 8 = 0 high / 0 medium /
8 low, `PARTIAL_THIS_TREE` 112, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 8 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure.
Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named TS suites import
gitignored `dist/` (`packages-ts/.gitignore` `dist/`). This reviewer did
not rebuild; dist mtimes are newer than matching src and carry the
claimed bodies.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-framework-api-server/src/index.ts` | **M** HEAD blob `6b7c4113c` → WT blob `e224dc22c` (+33 / −3). HEAD webhook gate was `if (webhook !== undefined && channelVerdict !== Verdict.DENY)` and still called `admitWebhookReplay` when a configured resolver returned `undefined`. THIS TURN: configured channel must be exact ALLOW before replay is consumed; DENY / non-ALLOW / configured-undefined write 401 and return. Extra dirty in the same file (not the named claim): `requireDurableReplay` construction refuse. |
| `packages-ts/galerina-framework-api-server/dist/index.js` | gitignored; rebuilt this turn; gate `channelVerdict === Verdict.DENY \|\| (resolveChannelVerdict !== undefined && channelVerdict !== Verdict.ALLOW)` present before `admitWebhookReplay`. |
| `packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs` | **M** HEAD blob `b6dd48414` → WT blob `3382cf8bc` (+102). THIS TURN: hostile non-ALLOW (`resolveChannelVerdict: () => undefined`) 401, then later ALLOW on the same store/body is 200. |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | **M** HEAD blob `df9931499` → WT blob `1c1413381` (+35 / −6). HEAD `readBoundedRegularFile` was unexported and called `handle.readFile()` after `lstat`. THIS TURN: exported; `handle.read(buf, 0, maxBytes+1, 0)`; missing `read` fail-closes; FIFO/`O_NONBLOCK` open refuse. |
| `packages-ts/galerina-framework-app-kernel/src/index.ts` | unchanged vs HEAD (star-exports `./registry-generation-store.js`, so the new export is on the package surface). |
| `packages-ts/galerina-framework-app-kernel/dist/registry-generation-store.js` | gitignored; rebuilt this turn; `handle.read` + missing-`read` throw present; no `handle.readFile()` in the function body. |
| `packages-ts/galerina-framework-app-kernel/tests/registry-bounded-read.test.mjs` | **??** untracked. THIS TURN: real file under ceiling + hostile oversize without `readFile`. |
| `scripts/fix-logicn-brand.mjs` | **M** HEAD blob `59d6a2aa3` → WT blob `032b81832` (+85 / −37). HEAD parsed stdin and rewrote at import (`writeFileSync(rel, …)`, no `lstat`). THIS TURN: `isDirectRun`, `admitBrandRel`, `parseBrandAudit` size/shape, `lstat` refuses symlink/non-file, write is `writeFileSync(abs, …)`. |
| `scripts/tests/fix-logicn-brand.test.mjs` | **??** untracked. THIS TURN: option-like/`..`/absolute refuse + oversize/unshaped stdin. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-framework-api-server/src/index.ts` | 38904 | `925ac951781461423336763af97dc9e567337d876e941b8aed5d551b2fad3584` |
| `packages-ts/galerina-framework-api-server/dist/index.js` | 29314 | `5e19b23e7820101cd1d619053b9b4d553d7952d03b76c63505bae48bc9b729ea` |
| `packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs` | 11905 | `f5f78a7431dfd61fb9598176d3e2e66b8e7c47e0afabb54904327a087a9a9f26` |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | 29054 | `cc1153934bdba51efa858e4cdad252fb49b9dd179a633822f3796baf56ce7288` |
| `packages-ts/galerina-framework-app-kernel/src/index.ts` | 2152 | `5b25afd116929e34f32ce927fbc4670034e72854126fb305dea9284adf65cc72` |
| `packages-ts/galerina-framework-app-kernel/dist/registry-generation-store.js` | 23346 | `ddef08eb62e01f3a0bf36ebc79f8794afe90e98bc3cb3a3b79fe182d53f7a935` |
| `packages-ts/galerina-framework-app-kernel/dist/index.js` | 2117 | `e9b4541e997e514b763dd762310e833fc95cffda9f615b233ccfabe37d0bfb9d` |
| `packages-ts/galerina-framework-app-kernel/tests/registry-bounded-read.test.mjs` | 1748 | `65dd5486fad201bfc1cd3912477d5dcd0b896ae4513e906f7afd0d7871737185` |
| `scripts/fix-logicn-brand.mjs` | 4514 | `39680cc13af225c393bb8c8c6ff863cecb38f38c5c221190a85d60fd480710bf` |
| `scripts/tests/fix-logicn-brand.test.mjs` | 987 | `424919d78133a6c6f588c7019aa493a03ed4ba5c869ced3a9b23556b7277d5f5` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 69245 | `12b5d3f02c6d478aaaa065775a024c6cff05d4ef34df819240871606525636af` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above. The three
listed claim files MATCH:

- `packages-ts/galerina-framework-api-server/src/index.ts` `925ac951781461423336763af97dc9e567337d876e941b8aed5d551b2fad3584`
- `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` `cc1153934bdba51efa858e4cdad252fb49b9dd179a633822f3796baf56ce7288`
- `scripts/fix-logicn-brand.mjs` `39680cc13af225c393bb8c8c6ff863cecb38f38c5c221190a85d60fd480710bf`

Dist mtimes (UTC): api-server `index.js` `2026-09-23T14:32:26Z` (src
`2026-09-23T14:31:08Z`); kernel `registry-generation-store.js`
`2026-09-23T14:32:26Z` (src `2026-09-23T14:31:13Z`). Dist is newer than
this-turn src and contains the claimed bodies.

Inventory file sha256 `12b5d3f02c6d478aaaa065775a024c6cff05d4ef34df819240871606525636af`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | replay identity not consumed unless configured channel is ALLOW, or no resolver is configured; non-ALLOW/undefined → 401 without `admitWebhookReplay`; later ALLOW succeeds | `handleRequest` 807–815: DENY or (`resolveChannelVerdict !== undefined && channelVerdict !== ALLOW`) writes 401 and returns; `admitWebhookReplay` only after that gate | webhook-admission **6/6** (hostile non-ALLOW then ALLOW **1/1** among them) | `%TEMP%` configured `undefined` 401 then ALLOW 200; DENY then `admitWebhookReplay` still `ok:true` | **no resolver** still claims replay, then kernel can 4xx (probe: required-auth 401, later claim `reason:"replay"`) |
| B | `readBoundedRegularFile` uses `handle.read` into `maxBytes+1`, never `handle.readFile`; missing `read()` fail-closes; exported | exported fn 415–477; `typeof handle.read !== "function"` throws; `cap = maxBytes+1`; no `handle.readFile()` in the body; star-exported via `src/index.ts` | registry-bounded-read **2/2** | `%TEMP%` missing `read` throws / oversize `readFileCalled=false` / real file 11 bytes | `lstat` then path `open` then `handle.read` is TOCTOU; after-stat `sameFile` does not make it an fd-open of the lstat inode; Windows FIFO/`O_NONBLOCK` is NOT VERIFIABLE |
| C | `isDirectRun` so import does not rewrite; `admitBrandRel`; `parseBrandAudit` size/shape; write uses abs path; `lstat` refuses symlink | `isDirectRun` 16–20; `admitBrandRel` 22–29; `parseBrandAudit` 31–40; `lstatSync(abs)` + `isSymbolicLink()` skip; `writeFileSync(abs, …)` | fix-logicn-brand.test **2/2** | `%TEMP%` import `isDirectRun()===false`; option-like/`..`/absolute refuse; oversize/unshaped throw; `runFixLogicnBrand.toString()` has `writeFileSync(abs` after `lstatSync(abs)` | write-after-lstat TOCTOU remains (path rewrite, not fd); CLI/`write:true` not executed here |

## Suites (fresh this review)

From worktree, `node --test`:

- `packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs`:
  **6/6** pass, fail 0, skipped 0, duration ~321ms. Platform win32 Node
  v24.18.0. Covers HMAC-before-decode, duplicate/TTL, body-bound replay
  identity, malformed claim, HTTP HMAC/replay without dispatch, and
  hostile configured non-ALLOW 401 then later ALLOW 200 on the same
  store/body.
- `packages-ts/galerina-framework-app-kernel/tests/registry-bounded-read.test.mjs`:
  **2/2** pass, fail 0, duration ~223ms. Real file under ceiling;
  oversize stub `read` length `<= maxBytes+1` and `readFile` not called.
- `scripts/tests/fix-logicn-brand.test.mjs`: **2/2** pass, fail 0,
  duration ~129ms. `admitBrandRel` option-like/`..`/absolute refuse;
  `parseBrandAudit` size/shape; `brandRelTargets` drops `../secret.ts`.
  Import of the script did not rewrite the tree. The brand CLI was not
  run against this worktree.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/webhookchannel-regread-brandpath-probe.mjs`
imported worktree api-server dist, kernel dist, and
`scripts/fix-logicn-brand.mjs`. CWD `<LOCAL_TEMP>`.
`PROBE_OK` 11/11 exit 0. Import of the brand script did not print
`FIXED` / `would fix` (`isDirectRun` false). `write: true` was not used.

- (i) configured `resolveChannelVerdict: () => undefined` → HTTP 401;
  later ALLOW on the same `MemoryReplayStore`/body → 200. Configured
  `Verdict.DENY` → 401 and a subsequent `admitWebhookReplay` is still
  `ok:true` (identity not consumed).
- (ii) residual: **no** channel resolver, `auth.mode: "required"` →
  kernel HTTP **401**, then `admitWebhookReplay` on the same store/body
  is `{ ok:false, reason:"replay" }` (identity consumed before the
  kernel 4xx).
- (iii) missing `handle.read` throws `registry generation file could not
  be opened`; oversize uses `maxBytes+1` and does not call `readFile`;
  real file under ceiling returns 11 bytes. Function body is `lstat` →
  path `open` → `handle.read` (TOCTOU residual).
- (iv) `admitBrandRel("--output=/tmp/pwn")` / `"../secret.ts"` /
  `"/etc/passwd"` / `"C:\\Windows\\system32"` are false;
  `parseBrandAudit` oversize/array/null throw; `runFixLogicnBrand`
  source contains `writeFileSync(abs` after `lstatSync(abs)` and
  `isSymbolicLink()`.

## Residuals (author-flagged; independently observed)

- Webhook replay is still consumed when **no** channel resolver is
  configured. A later kernel 4xx (probe: required-auth 401) does not
  roll back the claim. The named repair only withholds the claim when a
  resolver is configured and is not exact ALLOW (including `undefined`
  / DENY).
- Registry `readBoundedRegularFile` `lstat` then path `open` then
  `handle.read` is TOCTOU. After-read `sameFile(before, opened,
  afterRead)` / `afterPath` checks identity by `dev`/`ino`/`mtimeMs`/
  `size`, not an fd-open of the lstat inode (`O_NOFOLLOW` is not used).
  Windows-native FIFO/`O_NONBLOCK` remains NOT VERIFIABLE on this host.
- Brand rewrite is still `lstatSync(abs)` then `readFileSync(abs)` then
  `writeFileSync(abs)` — write-after-lstat TOCTOU. A swapped
  symlink/file after `lstat` can still be written. CLI/`--write` was
  not executed here.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 8 /
`PARTIAL_THIS_TREE` 112 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 8 remaining OPEN are low. Named three remain
OPEN (`csf_30936b039d064da89a8a7b01`, `csf_d61c1410698c885114d3b250`,
`csf_6ea131d447cf245230cf6c2f`). Matches author-last 8/112/4. Reviewer
did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. Configured non-ALLOW channel returns 401 without consuming
webhook replay identity, and a later ALLOW on the same store succeeds;
`readBoundedRegularFile` reads through `handle.read(maxBytes+1)` and
fail-closes when `read` is missing; brand import does not rewrite,
stdin paths are admitted, audit JSON is size/shape-bounded, and write
targets the resolved abs path after `lstat` refuses a symlink.
Residuals remain and keep the scan rows OPEN.
**INCOMPLETE_NON_AUTHORITATIVE**. Not production admission. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
