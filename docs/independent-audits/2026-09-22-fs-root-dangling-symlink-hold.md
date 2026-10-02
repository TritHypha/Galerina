# Independent audit — `fs.writeText` dangling-symlink refuse inside `GALERINA_FS_ROOT`

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `fs.writeText` / `filesystemAsync` refuses a dangling
symlink inside `GALERINA_FS_ROOT` so `writeFile` cannot create the
outside target. Detection uses `readlinkSync` (succeeds on dangling
links) before `writeFile`.

Hostile: symlink from `root/escape.txt` to a path outside root;
`writeText` must err; outside file must not exist. Regular inside write
still ok.

This is **not** 124-scan closure and **not** production admission.
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission
were not started.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0 win32 x64. Tests
import `dist/` (gitignored). `dist/stdlib.js` mtime is newer than dirty
`src/stdlib.ts` and contains the same `readlinkSync(safePath)` refuse
before `promises.writeFile`. This reviewer did not rebuild.

HEAD already refused `lstatSync(safePath).isSymbolicLink()`. The dirty
tree **adds** `readlinkSync` first (comment: lstat can throw on some
Windows dangling reparse points). Untracked
`tests/fs-root-symlink-refuse.test.mjs` is the hostile detector.
Passing tests here are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | `80e3cc6b81c6cff00dbbf19d74deadc8000c4ca32ed26711897837f5a8788110` |
| `packages-ts/galerina-core-compiler/dist/stdlib.js` | `2376fbdf975d9ef59e05a8d37057548da62b64eac8f0d65f4eb9adb2f8d0741d` |
| `packages-ts/galerina-core-compiler/tests/fs-root-symlink-refuse.test.mjs` | `09fb5cf525a06790aa529b114de775bd390243d8d374215f9ffdb81a5b9951fd` |

Dirty paths for this slice: `M`
`packages-ts/galerina-core-compiler/src/stdlib.ts`, `??`
`packages-ts/galerina-core-compiler/tests/fs-root-symlink-refuse.test.mjs`.
`dist/` is gitignored (`packages-ts/.gitignore` `dist/`).

Production call path: `callStdlib` (`stdlib.ts` 1947 / 2217) awaits
`filesystemAsync` for `fs.*` / `File.*` names. Named suite and extra
probes import `dist/stdlib.js` `callStdlib`, not the package index.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `readlinkSync(safePath)` runs before `writeFile` | source `stdlib.ts` 1774–1778 then 1820–1822; dist `stdlib.js` 1717–1719 then 1765–1766 |
| `readlink` success → `err` (`symbolic link — refusing`) | source 1776–1777; executed hostile test + independent `callStdlib` |
| Dangling symlink inside root cannot create outside target | executed hostile test; independent probe `outside after writeText false` |
| Regular inside write still ok | suite first test; independent `inside.txt` `payload` |
| Hostile detector can go red (Node follows dangling link) | independent `promises.writeFile(link)` created outside body `FOLLOWED` |
| `O_NOFOLLOW` used on the write | **not used**. `writeFile(safePath, text, "utf8")` only. `fs.constants.O_NOFOLLOW` **ABSENT** on this win32 Node |
| TOCTOU between `readlink` and `writeFile` closed | **not closed**. Independent plant-then-`writeFile` created outside `TOCTOU` |
| Windows dangling `lstat` throw (the dirty-comment rationale) | **NOT VERIFIABLE** on this host: file/dir/junction dangling reparse all `lstat.isSymbolicLink===true` |
| 124-finding scan | **not this claim** |

HEAD without `readlink`: if `lstat` throws, `existsSync(dangling)` is
`false` on this Node (follows the missing target), so `checkPath`
becomes the in-root parent and `writeFile` follows the leaf. That
escape is why `readlink` is the named detector. On **this** host the
named file-symlink fixture does **not** throw from `lstat`, so HEAD
lstat-only would also refuse here; the throw path remains unproduced.

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-compiler/tests/fs-root-symlink-refuse.test.mjs`
   → **2/2 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 198.4812`.
   - `fs.writeText writes a regular file inside GALERINA_FS_ROOT` — **green** (8.0401ms)
   - `hostile: dangling symlink inside the root cannot write outside it` — **green** (2.0431ms)
     (`__tag: "err"`, error matches `/symbolic link|symlink/`,
     `existsSync(outside)===false`). Symlink creation was **not** skipped.

Independent extra probes (`%TEMP%\galerina-fs-root-dangling-probe.mjs`
and `galerina-fs-root-reparse-probe.mjs`; not production; import this
tree’s `dist/stdlib.js`):

- `fs.constants.O_NOFOLLOW` / `O_SYMLINK` **ABSENT**; `O_EXCL=1024`.
- Dangling file symlink: `readlink` returns the outside path;
  `lstat.isSymbolicLink===true`; `existsSync(link)===false`.
- Same for `dir` and `junction` dangling reparse on this host (no lstat throw).
- Red detector: `writeFile(dangling, "FOLLOWED")` **created** the outside
  file (`detector_red: true`). Without the control, Node follows.
- `callStdlib("fs.writeText", … "escape.txt")` →
  `FileError: path 'escape.txt' is a symbolic link — refusing`;
  outside still absent.
- Extra (same function, not named suite): `File.writeText` and
  `fs.writeBytes` also `err` with the same message; outside absent.
- Regular `inside.txt` write `ok` with body `payload`.
- TOCTOU sketch: path absent at check time, then plant dangling symlink,
  then `writeFile` → outside created (`TOCTOU`).

## Challenge 1 — does `writeText` still create the outside target?

**No on this Windows host. CONFIRMED for a pre-existing dangling file
symlink at `safePath`.** Locators: `stdlib.ts` 1774–1778 (readlink
refuse) then 1820–1822 (`writeFile`). Suite hostile test and independent
`callStdlib` both returned `err` and left the outside path absent.

## Challenge 2 — can the follow-through detector go red?

**Yes. CONFIRMED.** The same dangling-link shape without the stdlib
control (`promises.writeFile(link)`) created the outside file with body
`FOLLOWED`. The green refuse test is not vacuous on this Node.

## Challenge 3 — is the write atomic (`O_NOFOLLOW`)?

**No. Residual, not a named-claim finding.** Source uses
`readlink` then `writeFile` with no flags. `O_NOFOLLOW` is absent from
`fs.constants` on this win32 Node. A replace-after-check plant still
lets `writeFile` create an outside target (independent TOCTOU sketch).

## Residuals (not findings against the named claim)

- TOCTOU between `readlinkSync` and `writeFile`: a missing path that
  later becomes a dangling symlink is not refused by this check.
- `O_NOFOLLOW` is not used. On this win32 Node it is not even a
  `fs.constants` member. POSIX `open(..., O_NOFOLLOW)` was **not**
  exercised.
- Comment rationale “lstat can throw on some Windows dangling reparse
  points” is **NOT VERIFIABLE** here: file/dir/junction dangling links
  all lstat as symbolic links. HEAD lstat-only would refuse **this**
  fixture; the throw-then-parent-realpath escape was not live-produced.
- Named suite covers `fs.writeText` only. `File.writeText` /
  `fs.writeBytes` share `filesystemAsync` and were extra-probed, not
  suite-gated.
- 124-finding scan remains a separate open programme. Overall
  disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for production
  admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid
(independent `writeFile` follow-through went red). Evidence is
sufficient for a pre-existing dangling file symlink inside
`GALERINA_FS_ROOT` on this Windows Node; insufficient for TOCTOU
closure, `O_NOFOLLOW`, the lstat-throw Windows path, and scan closure.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
