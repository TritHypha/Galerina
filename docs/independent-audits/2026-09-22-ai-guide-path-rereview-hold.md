# Independent audit — AI-guide `writeReportFiles` path confinement (rereview)

**Verdict: PASS** (scoped to this named claim; prior 01a0cbe1 swallowed-fail
HOLD is closed on this dirty tree). Filename is the requested `*-hold.md`
path; the heading is the verdict.

This is a **rereview** after independent review 01a0cbe1 HOLD
`docs/independent-audits/2026-09-22-ai-guide-path-hold.md`
(sha256 then and now
`524ca24947db661c6cdf93f0e3b78524f14a04e910aa954e17a2850b1f905daa`).
That HOLD receipt was **not** overwritten. CONFIRMED then: `fail()` after
successful `fs.readlinkSync(file)` lived inside a bare `catch {}`, so the
refuse was swallowed; a synthetic `fs.lstatSync` ENOENT hook let
`writeFileSync` follow a dangling `app.ai-guide.md` symlink; a parent-dir
`docs/` symlink redirected `docs/api-guide.md` outside.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer (receipt only). Nothing was committed. This
receipt is not the author’s packet and is not GPT-6 Astra. Reviewer did
not author the dirty slice.

Named claim: `writeReportFiles` confines generated reports (including
AI-guide) under the configured build directory.
`normaliseBuildOutputPath` refuses `..` segments. `pathIsSymlink`:
successful `readlinkSync` means link; `fail()` is **not** inside the
readlink catch. `refuseBuildOutputLinks` walks from the leaf up to but
not including root, before and after `mkdirSync` of `dirname`. A dangling
leaf symlink is refused even if `lstat` throws ENOENT. A parent-directory
symlink cannot redirect nested `docs/api-guide.md`.

Hostile: `../` throws; dangling leaf does not create an outside file;
parent-dir symlink does not create an outside nested file; `lstat`
ENOENT hook still refuses via `readlink`. Positive: write under the
build dir.

This is **not** 124-scan closure and **not** production admission.
Scan `csf_ecf2128fafd9c3efdffc7611` stays `PARTIAL_THIS_TREE`.
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission
were not started.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0 win32 x64. Named
suite `require("./galerina.js")` (source, not `dist/`). CLI gated by
`require.main === module`. This reviewer did not rebuild.

HEAD `91b4dec0` already refused a leaf symlink via
`lstatSync(file).isSymbolicLink()` before `writeFileSync` (rethrow if
`err.code !== "ENOENT"`). 01a0cbe1 reviewed an intermediate dirty
`readlinkSync`+`fail()` inside a bare `catch {}`. This dirty tree
**replaces** that dead control with `pathIsSymlink` (readlink success
→ `return true`) plus `refuseBuildOutputLinks` calling `fail()` with
no surrounding `try`. Passing tests here are **not** production
admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core/compiler/galerina.js` | `06b474398ffeae98a4eb8654a5842bcd779e7add24f626006a56ddb77311637a` |
| `packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` | `610c0ded0ced3d7071363dc8656a41efc244ccde66c6fa9f33977f40468534b8` |
| `docs/independent-audits/2026-09-22-ai-guide-path-hold.md` | `524ca24947db661c6cdf93f0e3b78524f14a04e910aa954e17a2850b1f905daa` |

Author-stated hashes **match**. Prior HOLD hashes of the same two
production files (`13d597f2…` / `fbcf0ca4…`) do **not** match this
tree: the repair landed in the dirty working copy after 01a0cbe1.

Dirty paths for this slice vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core/compiler/galerina.js` (+46/−9:
`pathIsSymlink`, `refuseBuildOutputLinks`, refuse before and after
`mkdirSync(dirname)`, `rel === ".."`, `require.main` gate,
`module.exports`) and `??`
`packages-ts/galerina-core/compiler/ai-guide-path.test.mjs`.
Unrelated dirt exists elsewhere on this worktree and was not this
claim.

Scan ID `csf_ecf2128fafd9c3efdffc7611` remains inventoried
`PARTIAL_THIS_TREE` (inventory note already records the ancestor-walk
repair; this review does **not** promote that row). Inventory
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
`0e680ac2a9e34273d86fd4e79cc482e60ee30a085c3a844f5fb875322ece1f99`
cites `findings_json_sha256`
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Counts on this tree: 97 OPEN_ON_SCAN_SNAPSHOT / 23 PARTIAL_THIS_TREE /
4 PATCHED_AUDIT_PENDING (124 IDs). Overall
`INCOMPLETE_NON_AUTHORITATIVE`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `normaliseBuildOutputPath("../app.ai-guide.md")` throws | source 4742–4758 (`..` segment); named test; independent probe `dotdot=THROW:Build output path escapes the configured build directory.` |
| `docs/../../../outside.md` throws | named test; independent `deepDotdot=THROW` (same message) |
| `./build/app.ai-guide.md` → `app.ai-guide.md` | source 4746–4748; named test; independent `normBuild=app.ai-guide.md` |
| Positive write under build dir | named test; independent `positiveExists/Body/Written=true`, `positiveThrow=false` |
| Dangling file symlink at `app.ai-guide.md` does not create outside file | named hostile test; independent `writeReportDangling=THROW:Build output path is a link and is refused.`, `outsideAfterNamed=false` |
| That refuse is **via `readlinkSync`**, and `fail()` is **not** swallowed | **true on this tree.** Source: `pathIsSymlink` 3105–3122 `readlinkSync` then `return true` (`pathIsContainsFail=false`, `pathIsBareCatch=false`); `fail()` is in `refuseBuildOutputLinks` 3127–3129 with **no** `try` (`refuseHasTry=false`, `writeHasTry=false`). Independent copy of `pathIsSymlink` then `fail()`: `copyPathIsThenFail=THROW:…refused.`, `copyRefuse=THROW:…refused.` Hypothetical `fail()` still inside the **new** catch also `THROW` (`newCatchFailInsideTry`). Historical bare `catch {}` still `oldBareCatch=SWALLOWED` (the 01a0cbe1 detector; production no longer uses it) |
| `readlink` refuse still holds if `lstat` throws `ENOENT` | **true on this probe.** Monkey-patch `fs.lstatSync` → `ENOENT` on the leaf: `lstatEnoentWrite=THROW:Build output path is a link and is refused.`, `lstatEnoentOutside=false`. 01a0cbe1 had `ALLOW` and created the outside file |
| Parent-dir symlink (`docs/` → outside) cannot redirect `docs/api-guide.md` | **true on this probe.** Directory symlink created (`type=dir`); `parentDirWrite=THROW:Build output path is a link and is refused.`, `parentDirOutsideExists=false`. Named test of the same shape also green. 01a0cbe1 had `ALLOW` |
| Ancestor walk runs **before** `mkdirSync` of `dirname` | source 3151 then 3152 then 3153 then 3154; independent source-slice offsets `writeRefuseBeforeMkdir=true` (first refuse 515 < mkdir 556 < second refuse 616 < `writeFileSync` 657) |
| Hostile detector can go red (Node follows dangling link) | independent `writeFileSync(dangling)` created outside body `FOLLOWED\n` (`rawFollow=ALLOW`, `rawFollowCreated=true`) |
| `O_NOFOLLOW` used on the write | **not used.** `writeFileSync(file, content, "utf8")` only. `fs.constants.O_NOFOLLOW` / `O_SYMLINK` **ABSENT** on this win32 Node; `O_EXCL=1024` |
| TOCTOU between `readlink`/`lstat` and `writeFileSync` closed | **not closed** (residual) |
| Configured build **root itself** as a directory symlink refused | **not refused.** Independent `rootLinkWrite=ALLOW`; file appeared at the real target. Walk stops at root (3129–3135). Residual, not the named leaf/parent-dir claim |
| CLI `main` not run on `require()` | source 5833–5840; named suite and probes imported exports (`typeof writeReportFiles/normaliseBuildOutputPath === "function"`) without entering CLI |
| 124-finding scan / production admission | **not this claim** |

On **this** host a dangling *file* symlink `readlink`s to the outside
path and `lstat`s as `isSymbolicLink===true` (`existsSync(link)===false`).
The named hostile test therefore has both readlink and lstat as live
signals. The `lstat` ENOENT hook is what shows the **new** readlink
control, not the HEAD lstat backup, is what refuses.

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core/compiler/ai-guide-path.test.mjs`
   → **5/5 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 138.5238`.
   - `normaliseBuildOutputPath refuses parent-directory segments` — **green** (1.9719ms)
   - `writeReportFiles writes AI guide under the build directory` — **green** (2.6573ms)
   - `hostile: dangling symlink cannot redirect AI-guide write outside the build directory` — **green** (1.9087ms)
   - `hostile: parent-directory symlink cannot redirect nested report writes` — **green** (2.401ms)
   - `hostile: dangling leaf refuse survives lstat ENOENT (readlink must not be swallowed)` — **green** (1.8496ms)
     Symlink creation was **not** skipped.

Independent extra probes (`%TEMP%\galerina-ai-guide-rereview-probe.mjs`;
not production; `require` this tree’s `galerina.js`; temp tree removed;
`parentGone=true`; leftover outside files none):

- `../app.ai-guide.md` → THROW escapes
- `docs/../../../outside.md` → THROW escapes
- `foo\..\bar.md` → THROW escapes
- `C:\temp\x.md` and `/etc/passwd` → THROW escapes
- NUL in name → THROW not an admitted relative filename
- `./build/app.ai-guide.md` → `app.ai-guide.md`
- Positive `writeReportFiles(root, { "app.ai-guide.md": "# AI Guide\n" })` wrote under `root`
- Dangling file symlink: `readlink` returns the outside path; `lstat.isSymbolicLink===true`
- Historical bare `readlinkSync` + `fail()` + `catch {}` → still **SWALLOWED** (01a0cbe1 pattern; not in production)
- Copy of current `pathIsSymlink` (readlink → `true`) then `fail()` → **THROW**, not swallowed
- Same `fail()` hypothetically inside the new ENOENT/EINVAL/UNKNOWN catch → **THROW** (Error has no swallowed `code`)
- Red detector: `writeFileSync(dangling, "FOLLOWED\n")` **created** the outside file
- Named `writeReportFiles` on that leaf → THROW link refused; outside absent
- `fs.lstatSync` patched to throw `ENOENT` on that leaf → **THROW** link refused; outside absent
- `docs/` directory symlink + `docs/api-guide.md` → THROW link refused; outside `api-guide.md` absent
- Build-root directory symlink → ALLOW write through to the real directory (residual)
- `fs.constants.O_NOFOLLOW` / `O_SYMLINK` **ABSENT**; `O_EXCL=1024`
- `typeof writeReportFiles/normaliseBuildOutputPath === "function"` after `require` (CLI not entered)

Locators: `fail` 560–562; `pathIsSymlink` 3105–3122;
`refuseBuildOutputLinks` 3124–3138; `writeReportFiles` 3140–3158;
`normaliseBuildOutputPath` 4742–4758; `aiGuideOutput` 4659–4661;
`require.main` 5833–5840.

## Challenge 1 — does `../app.ai-guide.md` still write outside?

**No. CONFIRMED refused** at `normaliseBuildOutputPath` before any
write. Named test and independent probe both threw
`Build output path escapes the configured build directory.`

## Challenge 2 — does a dangling `app.ai-guide.md` symlink create the outside file on this host?

**No.** Named hostile test and independent `writeReportFiles` both threw
`Build output path is a link and is refused.` and left the outside path
absent. The follow-through detector (`writeFileSync` on the same
dangling link) still created `FOLLOWED\n`, so the green refuse is not
vacuous on this Node.

## Challenge 3 — is `fail()` after successful `readlinkSync` still swallowed?

**No. CLOSED.** Production `pathIsSymlink` does not call `fail()`.
Successful `readlinkSync` returns `true`; `refuseBuildOutputLinks`
calls `fail()` with no `try`/`catch`. Independent copy of that
readlink→`true`→`fail()` threw. The 01a0cbe1 bare-`catch {}` copy still
swallows, which shows the old detector can still go red and that
production no longer uses it.

## Challenge 4 — if `lstat` throws `ENOENT`, does the write still escape?

**No on the synthetic probe. CLOSED for the named hook.** Patching
`fs.lstatSync` to `ENOENT` on the dangling leaf still threw via
`readlinkSync` success; outside file absent. 01a0cbe1 reproduced an
outside write on this same hook.

## Challenge 5 — can a parent-directory symlink redirect `docs/api-guide.md`?

**No on this probe. CLOSED for the named nested path.** `docs/` was a
directory symlink (`readlink` to `outside-docs`). `writeReportFiles`
threw; outside `api-guide.md` absent. Named test of the same shape
green. 01a0cbe1 allowed the write.

## Residuals (do not reopen the closed swallowed-fail finding)

- TOCTOU between `readlink`/`lstat` and `writeFileSync`. `O_NOFOLLOW`
  is not used and is not a `fs.constants` member on this win32 Node.
- Root itself as a directory symlink is **not** walked
  (`refuseBuildOutputLinks` stops at `parent === root`). Independent
  probe: write through a symlink `outDir` ALLOW, file created at the
  real target. Not the named leaf or `docs/` parent-dir case.
- `rel === ".."` remains redundant with `rel.startsWith("..")` on this
  `path.relative` output; not a finding.
- CLI `main` is gated by `require.main === module` so tests can import.
  That is a test-harness side effect, not path confinement.
- Scan `csf_ecf2128fafd9c3efdffc7611` stays `PARTIAL_THIS_TREE`.
  Inventory counts on this tree: 97 OPEN_ON_SCAN_SNAPSHOT / 23
  PARTIAL_THIS_TREE / 4 PATCHED_AUDIT_PENDING (124 IDs). Not 124-scan
  closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

- Prior 01a0cbe1 `CONFIRMED_FINDING` / `DETECTOR_INVALID` on the
  swallowed `readlinkSync`+`fail()` instrument is **closed** on this
  dirty tree: `fail()` is outside any catch, and the `lstat` ENOENT
  hook now refuses.
- Parent-dir `docs/` escape from 01a0cbe1 is **closed** on this dirty
  tree by the ancestor walk before/after `mkdirSync(dirname)`.
- `..` refuse, dangling-leaf refuse, lstat-ENOENT refuse, parent-dir
  refuse, and positive write all have fresh independent evidence.
- Residuals (TOCTOU, missing `O_NOFOLLOW` on win32 Node, root-as-symlink)
  remain and are **not** this named claim.

**PASS** for the named confinement claim on this dirty tree. Not
production admission. Not Astra. Not 124-scan closure. **Not
clean-HEAD evidence.**
