# Independent audit — app-kernel Tower subpath (no root barrel)

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

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- App-kernel no longer imports the Tower root barrel.
- `kernel.ts` imports `@galerina/tower-citizen/governance`.
- Registry modules import `/custody`, and `/governance` when they fold trits.
- Hostile source test: no `src/*.ts` uses `from "@galerina/tower-citizen"`
  without a subpath.
- Isolation Q3: `dist/kernel.js` `walkLoadGraph` Tower files are cli-check
  only (no `hybrid-engine`, no `tower-citizen/dist/index.js`).
- App-kernel focused tests **46/46**; Tower load-graph-bounds + isolation +
  products **87/87**.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/kernel.js`, hashed working-tree bytes, re-ran the named
suites, and executed an extra `walkLoadGraph` probe from `%TEMP%` (not by
trusting the named tests alone). Author-named hashes were **not** supplied.
Independent `crypto.createHash('sha256')` and `Get-FileHash` **MATCH** each
other on every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | **M** HEAD blob `6aabcb5ca5` → WT blob `81d8075df8`. HEAD imported `decideAtBoundary` / `Verdict` from `@galerina/tower-citizen` (root barrel). THIS TURN: `@galerina/tower-citizen/governance`. |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation.ts` | **M** HEAD blob `8f4cb5cc1e` → WT blob `81fce12938`. Barrel → `/custody`. |
| `packages-ts/galerina-framework-app-kernel/src/registry-runtime.ts` | **M** HEAD blob `a962a12c94` → WT blob `aa2418f03d`. Barrel → `/custody`. |
| `packages-ts/galerina-framework-app-kernel/src/registry-rotation-authority.ts` | **M** HEAD blob `c39797730e` → WT blob `72434fa886`. Split: trit fold (`decideAtBoundary` / `Verdict` / `GovernanceDiagnostic`) from `/governance`; custody symbols from `/custody`. |
| `packages-ts/galerina-framework-app-kernel/src/registry-rotation-controller.ts` | **M** HEAD blob `791b6086f5` → WT blob `b510c59554`. Same split as authority. |
| `packages-ts/galerina-framework-app-kernel/tests/tower-subpath-imports.test.mjs` | **??** untracked. Hostile source scan + kernel `/governance`-only + registry subpath assertions. |
| `packages-ts/galerina-tower-citizen/tests/rd-1295-governance-isolation.test.mjs` | **M** HEAD blob `7474b8b19b` → WT blob `c70477b9a8` (+23). THIS TURN: Q3 `app-kernel kernel.js loads only cli-check Tower, not the barrel`. |
| `packages-ts/galerina-framework-app-kernel/dist/kernel.js` | gitignored; rebuilt this turn; specifier `@galerina/tower-citizen/governance` at line 13. |

Independent recursive scan of
`packages-ts/galerina-framework-app-kernel/src/**/*.ts`: the only
`tower-citizen` specifiers are the five files above. No root-barrel
`from`, no side-effect `import "@galerina/tower-citizen"`, no
`import("@galerina/tower-citizen")`. `src/self-hosted/` has no `.ts`
Tower imports.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other).

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | 36990 | `6758394f2ce8100c05bd841463dbafb809db658214c1d6ec4a7dc4a4ff1ca492` | 2026-09-23T17:08:44.754Z |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation.ts` | 15481 | `59c4aab2d0748a53ef602f6457b026d2c21737e2c1e183a7f4665c43b51152c3` | 2026-09-23T17:08:44.754Z |
| `packages-ts/galerina-framework-app-kernel/src/registry-runtime.ts` | 18141 | `69e8958b6391e4f96ecfb169e77df07ecb8a238ff75753b344e7ea4c101c2394` | 2026-09-23T17:08:44.754Z |
| `packages-ts/galerina-framework-app-kernel/src/registry-rotation-authority.ts` | 8322 | `6f359f4128a920efc744d9b80ac62b21b3cb52bd25d6e9a6e80a86d50545fd70` | 2026-09-23T17:08:44.754Z |
| `packages-ts/galerina-framework-app-kernel/src/registry-rotation-controller.ts` | 15253 | `2a4be45cd71ed34144a2e8729f7288d121bd0f42593dcfc6bba5a18700a0f947` | 2026-09-23T17:08:44.755Z |
| `packages-ts/galerina-framework-app-kernel/tests/tower-subpath-imports.test.mjs` | 1803 | `722c80ee4f4879b4a6510975bd1179007538b0d6f1c1a6b5a1328e9ae9e27320` | 2026-09-23T17:09:36.540Z |
| `packages-ts/galerina-tower-citizen/tests/rd-1295-governance-isolation.test.mjs` | 24387 | `38eb2bb4152cc65b1f0287f16577b5a8c6ecf0306ddb01f12c15ec3dc63a6189` | 2026-09-23T17:09:48.894Z |
| `packages-ts/galerina-framework-app-kernel/dist/kernel.js` | 29298 | `14f2972184bbfdf9a0864f48026748224e44258739c467d892e3f0843a04f7de` | 2026-09-23T17:09:55.177Z |
| `packages-ts/galerina-framework-app-kernel/dist/registry-generation.js` | 13090 | `5fbb9dd9b9713ea5b063ae0edd2e827e1e616a1fcbf0db3e7eba7d3c09ad5be7` | 2026-09-23T17:09:55.206Z |
| `packages-ts/galerina-framework-app-kernel/dist/registry-runtime.js` | 14660 | `ecfdfee5599e9b9fb0af3b5fb6e0af8baccbca2fa47de2696cbc6bd1ee9555a4` | 2026-09-23T17:09:55.247Z |
| `packages-ts/galerina-framework-app-kernel/dist/registry-rotation-authority.js` | 5982 | `6892b6e628d505ab917c89b39f5e0e6cb7136b019bf9c9579a084a952e5cd0d6` | 2026-09-23T17:09:55.222Z |
| `packages-ts/galerina-framework-app-kernel/dist/registry-rotation-controller.js` | 12477 | `e412570c2ddc9492ccd6e75d97ef2047e5f3e2b9b65352e376312dfe176c28af` | 2026-09-23T17:09:55.257Z |
| `packages-ts/galerina-framework-app-kernel/dist/index.js` | 2117 | `e9b4541e997e514b763dd762310e833fc95cffda9f615b233ccfabe37d0bfb9d` | 2026-09-23T17:09:55.291Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. App-kernel dist mtimes are newer than matching src.
This reviewer did **not** rebuild. Gitignored `dist/` already carries
`@galerina/tower-citizen/governance` on `kernel.js` and `/custody` (plus
`/governance` on trit-fold registry modules). Named suites import dist
(`packages-ts/.gitignore` `dist/`). `kernel.test.mjs` imports
`../dist/index.js` (app-kernel public barrel), not `kernel.js` in isolation.

`@galerina/tower-citizen` `package.json` exports `./governance` →
`dist/governance.js` and `./custody` → `dist/custody.js`. Cli-check
stems from `dist/product-profiles.js`: `governance`, `product-profiles`,
`trit-gates`, `three-valued-governance`, `epistemic-type-state`,
`ai-governance`, `compiled-policy`, `gate-cache`, `governance-enforcer`.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| kernel.ts /governance | `decideAtBoundary` / `Verdict` from `/governance`, not root barrel | src 41–42; dist/kernel.js 13 | tower-subpath first test **pass**; kernel suite **23/23** | TEMP walk of `dist/kernel.js`: `hasGovernance:true`, `hasBarrel:false` | type-only `Verdict` is erased in dist; runtime import is `decideAtBoundary` only |
| no src barrel | no `src/*.ts` `from "@galerina/tower-citizen"` without a subpath | recursive scan: only the five named files, all subpathed | hostile test **pass** (top-level `src/*.ts` only) | recursive Select-String same set | hostile `listTs` is non-recursive; `src/self-hosted` has no `.ts` Tower hits |
| registry /custody | generation + runtime import `/custody` | generation src 5 / dist 1; runtime src 21 / dist 4 | third test matches generation `SUBPATH`; hostile scan covers runtime | dist specifiers `/custody` | third named test does not name `registry-runtime.ts` |
| registry trit fold | authority + controller import `/governance` and `/custody` | authority src 5+14; controller src 5+32; dist both split | third test asserts authority both subpaths | dist authority/controller both split | third named test does not name `registry-rotation-controller.ts` |
| Q3 kernel.js cli-check only | Tower files from `dist/kernel.js` are cli-check; no hybrid; no Tower `dist/index.js` | dist/kernel.js specifier `/governance` | isolation Q3 **pass** 54.1503ms | TEMP: 9 Tower files = cli-check stems; `extras:[]`; `hasHybrid:false`; `hasBarrel:false`; `hasCustody:false` | `walkLoadGraph` is still not a production caller |
| focused tests | app-kernel 46/46; Tower 87/87 | named commands below | **46/46** and **87/87** | TEMP walk is extra, not a count | kernel tests load `dist/index.js` (custody residual), not isolated `kernel.js` |
| production admission | independent production admission | — | — | — | **HOLD** (not this claim) |

## Command receipts

1. `git worktree list` (cwd the named worktree) →
   `./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
   `git rev-parse HEAD` → `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`.
   `git status -sb` → `main...origin/main [ahead 1]`, dirty. Named src
   files **M**; isolation test **M**; `tower-subpath-imports.test.mjs` **??**.

2. `node --test tests/tower-subpath-imports.test.mjs tests/kernel.test.mjs tests/registry-generation.test.mjs tests/registry-rotation-authority.test.mjs tests/registry-runtime.test.mjs`
   in `packages-ts/galerina-framework-app-kernel`
   → **46/46 pass**, 0 fail, 0 skip, `duration_ms 1554.8557`.
   Breakdown: kernel 23, registry-generation 11, rotation-authority 6,
   runtime 3, tower-subpath 3.

3. `node --test tests/load-graph-bounds.test.mjs tests/rd-1295-governance-isolation.test.mjs tests/rd-1295-products.test.mjs`
   in `packages-ts/galerina-tower-citizen`
   → **87/87 pass**, 0 fail, 0 skip, `duration_ms 2520.1477`.
   New Q3 `app-kernel kernel.js loads only cli-check Tower, not the barrel`
   54.1503ms, green.

Independent extra (`%TEMP%\zt-appkernel-tower-subpath-probe\probe.mjs`;
cwd `%TEMP%\zt-appkernel-tower-subpath-probe`; `file://` import of
working-tree `dist/load-graph.js`; no production write):

| probe | result |
|---|---|
| `walkLoadGraph(app-kernel dist/kernel.js)` | `ok:true`; 16 files; 9 Tower files = cli-check stems; `extras:[]`; `hasGovernance:true`; `hasBarrel:false`; `hasHybrid:false`; `hasCustody:false` |
| `walkLoadGraph(app-kernel dist/index.js)` | `ok:true`; 55 files; `hasCustody:true`; `hasBarrel:false`; `hasHybrid:false`; extras include `custody.js`, `key-rotation.js`, `lease.js`, `quorum.js`, `registry-key-rotation.js`, `registry-public-verifier.js`, `snapshot-key-provider.js`, `bridge-attestation.js`, `capability-grant.js`, plus `@noble/post-quantum` |

## Challenge 1 — does any app-kernel `src/*.ts` still import the Tower root barrel?

**No on this dirty tree. CONFIRMED closed for the named source files.**
HEAD `kernel.ts` imported `@galerina/tower-citizen`. WT imports
`/governance`. Registry files that used the barrel now import `/custody`,
and `/governance` where they fold trits. Independent recursive scan found
no other `tower-citizen` specifiers under `src/`. Hostile test passed.
Dist `kernel.js` line 13 is `@galerina/tower-citizen/governance`.

## Challenge 2 — does `dist/kernel.js` still load hybrid or the Tower barrel? Is this production admission?

**No hybrid / no Tower barrel on `dist/kernel.js`. Not production
admission.** Named Q3 test passed. Extra TEMP walk listed exactly the nine
cli-check stems, no `hybrid-engine.js`, no `tower-citizen/dist/index.js`,
no `custody.js`. App-kernel public `dist/index.js` still loads the custody
cluster (residual below). `walkLoadGraph` remains a test/cli-check walker,
not a production check-then-load gate. Core-network still
`file:`-depends on `@galerina/tower-citizen`. Finding inventory was not
read for recategorization and is **not** promoted. Independent production
admission remains **HOLD**.

## Residuals (not findings against the named kernel.js / src subpath claim)

- **core-network still installs Tower.**
  `packages-ts/galerina-core-network/package.json` dependency
  `"@galerina/tower-citizen": "file:../galerina-tower-citizen"`. App-kernel
  `package.json` still has the same `file:` dependency.
- **registry modules still load the custody cluster.** Extra probe of
  app-kernel `dist/index.js` (public barrel re-exporting
  `registry-runtime` / rotation) loads `custody.js` plus rotation/verifier
  / `@noble/post-quantum`. Named Q3 is `dist/kernel.js` only.
- **independent production admission HOLD.** Dirty HEAD, no commit, no
  signed certified deployment, `walkLoadGraph` has no production caller.
- Hostile `listTs` is non-recursive and the third tower-subpath test does
  not name `registry-runtime.ts` / `registry-rotation-controller.ts`.
  Independent recursive scan and dist specifiers closed those files.
- Three app-kernel **tests** still import
  `../../galerina-tower-citizen/dist/index.js`
  (`registry-rotation-authority.test.mjs`, `registry-runtime.test.mjs`,
  `rd0361-kernel-auth-gate-execution.test.mjs`). That is test-side, not
  `src/*.ts`.
- Named kernel tests import app-kernel `dist/index.js`, so those 23 tests
  are pipeline evidence, not isolation evidence. Isolation is the Q3 walk
  of `kernel.js`.
- Finding inventory is **not** promoted. This receipt does not recategorize
  scan rows. Not 124-scan closure. Not Astra. Not clean-HEAD evidence.

## Classification

No `CONFIRMED_FINDING` on the named claim. Evidence is sufficient for
app-kernel source + `dist/kernel.js` leaving the Tower root barrel and
for Q3 cli-check-only Tower files on that entry. Evidence is insufficient
for production admission, for treating the app-kernel public barrel as
cli-check-only, and for inventory promotion.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
