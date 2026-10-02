# Independent audit — AI-guide `writeReportFiles` path confinement

**Verdict: HOLD** (named `readlinkSync` refuse is dead). Filename is the
requested `*-hold.md` path; the heading is the verdict.

**CONFIRMED_FINDING** (new detector): `writeReportFiles` calls `fail()`
after a successful `fs.readlinkSync(file)` inside a bare `catch {}`.
`fail()` throws `Error`, so the refuse is swallowed. The dirty-tree
`readlinkSync` control cannot turn red.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer (receipt only). Nothing was committed. This
receipt is not the author’s packet and is not GPT-6 Astra.

Named claim: AI-guide write via `writeReportFiles` cannot escape the
configured build directory. `normaliseBuildOutputPath` refuses `..`
segments. Dangling symlink at `app.ai-guide.md` is refused via
`readlinkSync` before `writeFileSync`.

Hostile: `../app.ai-guide.md` throws; dangling symlink write does not
create an outside file. Positive: write under the build dir.

This is **not** 124-scan closure and **not** production admission.
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission
were not started. Reviewer did not author the dirty slice.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0 win32 x64. Named
suite requires `./galerina.js` (source, not `dist/`). This reviewer
did not rebuild.

HEAD already refused leaf symlinks with `lstatSync(file).isSymbolicLink()`
before `writeFileSync`. The dirty tree **adds** `readlinkSync` then
`fail()`, plus `rel === ".."`, plus `require.main === module` so the
new test can `require()` without running CLI `main()`. Passing tests
here are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core/compiler/galerina.js` | `13d597f27bf85d5fb6a3039213b2cce83e8f115567e77c53000cafae429b7195` |
| `packages-ts/galerina-core/compiler/ai-guide-path.test.mjs` | `fbcf0ca4ec2a9260e291cd509fd032fc0154fe9fa58382d0347f609ce04bb308` |

Dirty paths for this slice vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core/compiler/galerina.js` (+15/−2:
`readlinkSync`+bare `catch`, `rel === ".."`, `require.main` gate,
`module.exports`) and `??`
`packages-ts/galerina-core/compiler/ai-guide-path.test.mjs`.

Scan ID `csf_ecf2128fafd9c3efdffc7611` is inventoried
`PARTIAL_THIS_TREE` (author note: “writeReportFiles readlink-refuses”).
This review does **not** promote that row. Inventory
`findings.json` sha256
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
is unchanged by this receipt.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `normaliseBuildOutputPath("../app.ai-guide.md")` throws | source 4718–4734 (`..` segment); named test; independent probe `THROW:…escapes the configured build directory.` |
| `docs/../../../outside.md` throws | named test; independent `deepDotdot=THROW` |
| `./build/app.ai-guide.md` → `app.ai-guide.md` | source 4722–4723; named test; independent `normBuild=app.ai-guide.md` |
| Positive write under build dir | named test; independent `positiveExists/Body/Written=true` |
| Dangling file symlink at `app.ai-guide.md` does not create outside file **on this host** | named hostile test; independent `writeReport=THROW:Build output path is a link and is refused.`, `outsideAfterNamed=false` |
| That refuse is **via `readlinkSync`** | **false.** Source 3117–3122: `fail()` after successful `readlinkSync` is inside `catch {}`. Independent copy of that try/catch: `readlinkFailSwallowed=true`, catch saw `Error` `"Build output path is a link and is refused."` |
| `readlink` refuse still holds if `lstat` throws `ENOENT` (the Windows dangling-reparse rationale for adding `readlink`) | **false on this probe.** Monkey-patch `fs.lstatSync` → `ENOENT` on the leaf: `lstatEnoentWrite=ALLOW`, outside created with body `# lstat-enot\n` |
| Hostile detector can go red (Node follows dangling link) | independent `writeFileSync(dangling)` created outside body `FOLLOWED\n` (`rawFollowCreated=true`) |
| `O_NOFOLLOW` used on the write | **not used.** `writeFileSync(file, content, "utf8")` only. `fs.constants.O_NOFOLLOW` **ABSENT** on this win32 Node |
| TOCTOU between `readlink`/`lstat` and `writeFileSync` closed | **not closed** |
| Parent-dir symlink (`docs/` → outside) cannot redirect `docs/api-guide.md` | **not refused.** Independent: `parentDirWrite=ALLOW`, outside `api-guide.md` created. Not the named `app.ai-guide.md` leaf fixture |
| CLI `main` not run on `require()` | source 5809–5816; named suite and probes imported exports without CLI |
| 124-finding scan / production admission | **not this claim** |

On **this** host a dangling *file* symlink `lstat`s as `isSymbolicLink===true`
(`lstatIsLink=true`, `existsSync(link)===false`). The named hostile test
therefore goes green via the **HEAD `lstat` backup**, not via the new
`readlink` control. The named `/link|escapes/` regex does not tell those
apart (same `fail()` message).

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core/compiler/ai-guide-path.test.mjs`
   → **3/3 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 138.695`.
   - `normaliseBuildOutputPath refuses parent-directory segments` — **green** (1.1339ms)
   - `writeReportFiles writes AI guide under the build directory` — **green** (3.1216ms)
   - `hostile: dangling symlink cannot redirect AI-guide write outside the build directory` — **green** (2.1907ms)
     (throw matches `/link|escapes/`; `existsSync(outside)===false`).
     Symlink creation was **not** skipped.

Independent extra probes (`%TEMP%\galerina-ai-guide-path-probe.mjs`;
not production; `require` this tree’s `galerina.js`):

- `../app.ai-guide.md` → THROW escapes
- `docs/../../../outside.md` → THROW escapes
- `foo\..\bar.md` → THROW escapes
- `C:\temp\x.md` and `/etc/passwd` → THROW escapes
- NUL in name → THROW not an admitted relative filename
- `./build/app.ai-guide.md` → `app.ai-guide.md`
- Positive `writeReportFiles(root, { "app.ai-guide.md": "# AI Guide\n" })` wrote under `root`
- Dangling file symlink: `readlink` returns the outside path; `lstat.isSymbolicLink===true`
- Production-shaped `readlinkSync` + `fail()` + bare `catch {}` → **swallowed**
- Red detector: `writeFileSync(dangling, "FOLLOWED\n")` **created** the outside file
- Named `writeReportFiles` on that leaf → THROW link refused; outside absent (**lstat backup**)
- `fs.lstatSync` patched to throw `ENOENT` on that leaf → **ALLOW**, outside body `# lstat-enot\n`
- `docs/` directory symlink + `docs/api-guide.md` → ALLOW, outside file created
- `fs.constants.O_NOFOLLOW` / `O_SYMLINK` **ABSENT**; `O_EXCL=1024`
- `typeof writeReportFiles/normaliseBuildOutputPath === "function"` after `require` (CLI not entered)

Locators: `fail` 560–562; `writeReportFiles` 3105–3134;
`normaliseBuildOutputPath` 4718–4735; `aiGuideOutput` 4635–4637;
`require.main` 5809–5816.

## Challenge 1 — does `../app.ai-guide.md` still write outside?

**No. CONFIRMED refused** at `normaliseBuildOutputPath` before any
write. Named test and independent probe both threw
`Build output path escapes the configured build directory.`

## Challenge 2 — does a dangling `app.ai-guide.md` symlink create the outside file on this host?

**No on this Windows host for a pre-existing dangling *file* symlink.**
Named hostile test and independent `writeReportFiles` both threw and
left the outside path absent. That refuse is the **HEAD `lstatSync`**
path (3123–3129), which rethrows `fail()` because `Error.code` is not
`ENOENT`.

## Challenge 3 — is that refuse via the new `readlinkSync` control?

**No. CONFIRMED dead.** `readlinkSync` success reaches `fail()`, and
the bare `catch {}` swallows it. Independent copy of 3117–3122 caught
the refuse `Error`. Detector for the *new* control cannot go red.

## Challenge 4 — if `lstat` throws `ENOENT` (the rationale for adding `readlink`), does the write still escape?

**Yes on the synthetic probe. CONFIRMED for that hook.** Patching
`fs.lstatSync` to `ENOENT` on the dangling leaf (the Windows dangling
reparse case cited on the sibling `GALERINA_FS_ROOT` slice) let
`writeFileSync` follow the link and create the outside file. Live
lstat-throw on this host remains **NOT VERIFIABLE** (file symlink
lstat succeeds), but the new `readlink` control does not close it.

## Challenge 5 — can the follow-through detector go red?

**Yes. CONFIRMED.** The same dangling-link shape without
`writeReportFiles` (`writeFileSync(link)`) created the outside file
with body `FOLLOWED\n`. The green named refuse is not vacuous on this
Node; it is the old `lstat` backup.

## Residuals (in addition to the confirmed dead `readlink` detector)

- TOCTOU between `readlink`/`lstat` and `writeFileSync`. `O_NOFOLLOW`
  is not used and is not a `fs.constants` member on this win32 Node.
- Leaf-only link check: a `docs/` directory symlink redirected
  `docs/api-guide.md` outside the build dir. Default AI-guide name is
  a build-dir leaf (`app.ai-guide.md`); nested `aiGuide.output` after
  `normaliseBuildOutputPath` can still be `docs/…`.
- `rel === ".."` is redundant with `rel.startsWith("..")` on this
  `path.relative` output; not a finding.
- CLI `main` is now gated by `require.main === module` so tests can
  import. That is a test-harness side effect, not path confinement.
- Scan `csf_ecf2128fafd9c3efdffc7611` stays `PARTIAL_THIS_TREE`.
  Inventory counts on this tree: 97 OPEN_ON_SCAN_SNAPSHOT / 23
  PARTIAL_THIS_TREE / 4 PATCHED_AUDIT_PENDING (124 IDs). Not 124-scan
  closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

- `DETECTOR_INVALID` for the dirty-tree `readlinkSync` instrument:
  `fail()` is swallowed; the named suite cannot show that detector
  going red (same message as `lstat`).
- `CONFIRMED_FINDING` on that new control: it does not refuse. Synthetic
  `lstat` `ENOENT` reproduced an outside write through a dangling
  `app.ai-guide.md` symlink.
- `..` refuse and this-host lstat-backed leaf refuse have fresh
  evidence; they do not make the named `readlinkSync` criterion PASS.
- Live Windows lstat-throw without a test hook is **NOT VERIFIABLE**
  here.

**HOLD.** Not PASS. Not production admission. Not Astra. Not 124-scan
closure. **Not clean-HEAD evidence.**
