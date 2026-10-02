# Independent audit — release snapshot / SLIDE stage / graph lstat

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_844ae53189ccca7718b6024b`**: Owner-release activation must not
  accept an expired authorization via inconsistent object reads. File
  `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts`.
  THIS TURN: `activateRegistryDurabilityProfile` calls
  `snapshotPlainData(authorizationValue)` before shape / window /
  signature and then uses that owned freeze. Hostile Proxy: target
  `notAfter` expired, `get` trap returns a still-valid time → refused.
  Dist rebuilt. Tests
  `tests/registry-durability-production-admission.test.mjs` **9/9**.
  Residual the author flags: `snapshotPlainData` still copies own data
  descriptors; exotic `getOwnPropertyDescriptor` traps could lie at
  snapshot time.

- **B. `csf_7e68290c158f93818c9dac5e`**: SLIDE builder must not execute
  tool files from the original path after the pin check. File
  `scripts/lib/receipt-bound-slide-build.mjs`. THIS TURN: `inspectTool`
  returns verified `{path,bytes}` rows; `stageVerifiedTool` writes them
  with flag `wx` into `mkdtemp(..., "slide-pinned-tool-")`; spawn uses
  the staged entrypoint; staging `rm` in `finally`. Tests
  `scripts/tests/receipt-bound-slide-build.test.mjs` **6/6**. Residual
  the author flags: staged tool is still executed from a filesystem
  path (`wx` write then spawn); not fd-exec.

- **C. `csf_1ebc84936ed0b9a02d25d724`**: Project graph collection must
  not follow configured-root symlinks out of the workspace. File
  `packages-ts/galerina-core-cli/src/graph-command.ts`. THIS TURN:
  `collectPath` `lstat`s via dynamic `import("node:fs/promises").lstat`;
  symlink skipped; `lstat` missing → fail-closed skip. Dist rebuilt.
  Tests `tests/graph-command.test.mjs` **2/2**. Residual the author
  flags: graph collect still readdir-follows if `lstat` is unavailable
  (fail-closed skip).

This reviewer independently re-read production + tests + dist for A and
C (those suites import gitignored `dist/`), hashed working-tree bytes,
ran the named suites, and executed an extra probe from `%TEMP%` (not by
trusting the named tests alone). Author-named hashes were **not**
supplied in the review packet. Independent `crypto.createHash('sha256')`
and `Get-FileHash` MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **20 OPEN / 100
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 20 = 0 high / 0 medium /
20 low, `PARTIAL_THIS_TREE` 100, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 20 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Named kernel and graph
suites import gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). Named slide tests import `../lib/receipt-bound-slide-build.mjs`.
This reviewer did not rebuild. Kernel dist mtime is newer than matching
src and carries `snapshotPlainData(authorizationValue)`. Graph dist
mtime is newer than matching src and carries `lstatPath` + symlink skip.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | **M** HEAD blob `5e86449e7f` → WT blob `abcbff3797` (`+3 / −2`). Sole production hunk: `activateRegistryDurabilityProfile` snapshots `authorizationValue` before `releaseAuthorizationShapeIsValid` / window / `verifyComponent`. |
| `packages-ts/galerina-framework-app-kernel/tests/registry-durability-production-admission.test.mjs` | **M** (`+27`). THIS TURN: hostile proxy `notAfter` get-trap refuse. Also an extra unsigned-manifest-field refuse (not a named-claim axis). Imports `../dist/index.js`. |
| `packages-ts/galerina-framework-app-kernel/dist/registry-durability-production-admission.js` | gitignored; rebuilt this turn; `const ownedAuthorization = snapshotPlainData(authorizationValue)` present. |
| `scripts/lib/receipt-bound-slide-build.mjs` | **M** HEAD blob `5905da70ad` → WT blob `48ac9bf208` (`+44 / −16`). `inspectTool` now returns in-memory `{path,bytes}`; `stageVerifiedTool` `mkdtemp` + `wx`; spawn `join(stagingRoot, ...ENTRYPOINT.split("/"))`; `rm` in `finally`. No longer returns `entrypointPath` under the original `toolRoot`. |
| `scripts/tests/receipt-bound-slide-build.test.mjs` | **M** (`+1 / −1`). THIS TURN: `assert.match(args[0], /slide-pinned-tool-.*checked-fungi-package-manifest-cli\.mjs$/)`. Imports src. |
| `packages-ts/galerina-core-cli/src/graph-command.ts` | **M** HEAD blob `f57e5d20e9` → WT blob `15dd6af427` (`+27 / −2`). HEAD `collectPath` used `stat` (follows). THIS TURN: static `stat` import removed; `lstatPath` dynamic import; symlink skip; `pathStat === null` skip. |
| `packages-ts/galerina-core-cli/tests/graph-command.test.mjs` | **M** (`+32 / −1`). THIS TURN: hostile symlink package root. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-cli/dist/graph-command.js` | gitignored; rebuilt this turn; `lstatPath` + `isSymbolicLink` skip present. |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | 23310 | `0dacbfb5a2487c953a2bf19eae6841bd88099c9fc7c6eda18b26eef8c5b962b0` |
| `packages-ts/galerina-framework-app-kernel/dist/registry-durability-production-admission.js` | 17863 | `62e900f6a80f6d45d6bdc9de158bf0498866131f72c32e32ecd4f180481afcfc` |
| `packages-ts/galerina-framework-app-kernel/tests/registry-durability-production-admission.test.mjs` | 11978 | `3d9b2ddaa34f44a72f60e36594f21da4348e9549cc99ea5bd9afdc870f6d372f` |
| `scripts/lib/receipt-bound-slide-build.mjs` | 47980 | `b289f52633df9ff9c6e0dab66d3d73343a339fd024d1ee3ed6930a3840605011` |
| `scripts/tests/receipt-bound-slide-build.test.mjs` | 17913 | `f4bb728633ecd64c8203d38d49d8ec42568a7d8ea959a822f994fd4c7fb07d13` |
| `packages-ts/galerina-core-cli/src/graph-command.ts` | 14089 | `3f3f10bd02dc795d980961e00c35fd207ca3b6f7332b4cbd73b954496385806b` |
| `packages-ts/galerina-core-cli/dist/graph-command.js` | 12669 | `718e3081a96406656dd8ee5d4398c3776495e71da6b367c3465eaca283c8979e` |
| `packages-ts/galerina-core-cli/tests/graph-command.test.mjs` | 4854 | `95721d044643c4f1f1573b2ece9d9e529fd41eb61c2cec0e9161c6a70db23322` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 67048 | `8e2e038d13a01406128b396d477f686802ff9271d78d7879f8919f6f924cfdb6` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above.

Dist mtimes (UTC): kernel `registry-durability-production-admission.js`
`2026-09-23T11:43:24.841Z` (src `2026-09-23T11:41:49.089Z`); graph
`graph-command.js` `2026-09-23T11:44:43.159Z` (src
`2026-09-23T11:44:23.072Z`). Both dist files are newer than this-turn
src and contain the named controls. Slide has no dist; tests import src.

Inventory file sha256 `8e2e038d13a01406128b396d477f686802ff9271d78d7879f8919f6f924cfdb6`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | expired authorization must not pass via inconsistent object reads | `activateRegistryDurabilityProfile` snapshots via `Object.getOwnPropertyDescriptors` before shape/window/signature; default GOPD reads the expired target, not the `get` trap | kernel **9/9** including hostile get-trap `notAfter` | `%TEMP%` get-trap expired `notAfter` → `REGISTRY_DURABILITY_PRODUCTION_RELEASE_REFUSED` | exotic GOPD trap can lie at snapshot time (author residual; extra probe with `() => true` verifier **ACCEPTED** the GOPD lie). Honest preimage-bound verifier was not shown to accept an expired signed target. |
| B | SLIDE must not exec original tool path after pin check | `inspectTool` copies bytes; `stageVerifiedTool` `wx` into `slide-pinned-tool-` temp; spawn staged entrypoint; `rm` in `finally` | slide **6/6** including staged-path `assert.match` | spawn `args[0]` = `%TEMP%\slide-pinned-tool-SKl3Tk\src\checked-fungi-package-manifest-cli.mjs`; does not contain original `toolRoot` | staged tool still executed from a filesystem path; not fd-exec (author residual). |
| C | configured-root symlink must not escape workspace | `collectPath` `lstat`; symlink return; `lstat` missing → `null` skip (no `stat` follow) | graph **2/2** including hostile symlink root (not skipped on this host) | `%TEMP%` symlink `pkg-link` → outside `secret.md`; graph JSON has neither `secret.md` nor `leaked`. Symlink test exists in the named suite | if `lstat` is unavailable, the root is skipped (fail-closed); author residual. Dirent `isSymbolicLink` plus recursive `lstat` cover children. |

## Suites (fresh this review)

From worktree, `node --test`:

- `packages-ts/galerina-framework-app-kernel/tests/registry-durability-production-admission.test.mjs`:
  **9/9** pass, fail 0, duration ~217ms.
- `scripts/tests/receipt-bound-slide-build.test.mjs`:
  **6/6** pass, fail 0, duration ~5800ms.
- `packages-ts/galerina-core-cli/tests/graph-command.test.mjs`:
  **2/2** pass, fail 0, skipped 0, duration ~210ms.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/release-snap-slidestage-graphlstat-probe.mjs`
imported worktree kernel dist, slide src, and core-cli dist.
`PROBE_OK` exit 0.

- Get-trap Proxy: target `notAfter` `2026-08-01T19:00:00.000Z`, `get`
  returns `2026-08-01T20:00:00.000Z`, `now` `19:30Z` → throw
  `REGISTRY_DURABILITY_PRODUCTION_RELEASE_REFUSED`.
- Slide test source contains
  `assert.match(args[0], /slide-pinned-tool-.*checked-fungi-package-manifest-cli\.mjs$/)`.
  Live mock spawn path contained `slide-pinned-tool-` and was not under
  the original tool root.
- Graph test contains
  `hostile: a symlink package root is not followed outside the workspace`.
  Live `runCli(["graph", ...])` with a workspace package root symlink
  did not ingest outside `secret.md`.
- Additional (residual documentation, not a named-claim fail): a Proxy
  whose `getOwnPropertyDescriptor` returns a still-valid `notAfter`
  while the target is expired was **ACCEPTED** when the verifier was
  `() => true`.

## Residuals (author-flagged; independently observed)

- `snapshotPlainData` copies own data descriptors. An exotic
  `getOwnPropertyDescriptor` trap can present a still-valid window at
  snapshot time. Extra probe reproduced **ACCEPT** with verifier
  `() => true`. An honest signature over the expired target would hash a
  different `releasePreimage` than the lied snapshot; that honest-verifier
  axis was not a named-claim fail here.
- Staged SLIDE tool is still executed from a filesystem path (`wx`
  write then spawn of
  `%TEMP%\slide-pinned-tool-*\src\checked-fungi-package-manifest-cli.mjs`).
  Not fd-exec.
- Graph collect fail-closes (skips the path) when `lstat` is not a
  function. It does not `stat`-follow in that branch. Child entries are
  also skipped when `Dirent.isSymbolicLink()` is true, then `lstat`ed
  again in `collectPath`.

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 20 /
`PARTIAL_THIS_TREE` 100 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 20 remaining OPEN are low. Named three remain
OPEN. Reviewer did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. Owner-release get-trap expired `notAfter` is refused; SLIDE spawn
uses a `slide-pinned-tool-` staged path; graph collection does not
follow a configured-root symlink. Residuals remain and keep the scan
rows OPEN. **INCOMPLETE_NON_AUTHORITATIVE**. Not production admission.
Not Astra. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
