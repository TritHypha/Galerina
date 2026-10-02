# Independent audit — Myco `saveGraph` dangling `index.json` symlink refuse

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: Myco `saveGraph` refuses to write through a dangling
`.myco/index.json` symlink, so rebuild cannot create/overwrite a file
outside the cache root. Detection: `fs.readlink(dest)` succeeds →
`unsafe-path`. Linked `.myco` directory already refused.

Hostile: symlink `index.json` to a path outside root; `saveGraph`
`written=false` `unsafe-path`; outside file absent. Regular save still
works (canonical order test).

This is **not** 124-scan closure and **not** production admission.
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission
were not started.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045.0 win32 x64. Named
suite imports `../src/graph/store.ts` via
`--experimental-strip-types` (source, not `dist/`). This reviewer did
not rebuild.

HEAD already refused `lstat(dest).isSymbolicLink()` and a linked
`.myco` directory in `admitCacheDirectory`. The dirty tree **adds**
`fs.readlink(dest)` before that lstat (same dangling-reparse rationale
as `GALERINA_FS_ROOT`). Passing tests here are **not** production
admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-tools-myco/src/graph/store.ts` | `a18a9a9584649238326c3385faa6c58616b5e8fece862219af9315527481a904` |
| `packages-ts/galerina-tools-myco/tests/store.test.ts` | `b74011f8e215bad5b646251f81c6ad1e557b68b494b32faba760c96d8eeac8a2` |

Dirty paths for this slice vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-tools-myco/src/graph/store.ts` (+6 lines:
`readlink(dest)` → `unsafe-path`) and `M`
`packages-ts/galerina-tools-myco/tests/store.test.ts` (+32 lines:
dangling `index.json` test). Unrelated same-package dirt:
`packages-ts/galerina-tools-myco/.graph/BOUNDARY.md` (`node:crypto`
already imported by `store.ts` for tmp names; not this claim).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `fs.readlink(dest)` runs before `rename` | source `store.ts` 129–135 then 146–154 |
| `readlink` success → `{ written: false, reason: "unsafe-path" }` | source 131–132; executed named test; independent probe `saved.reason=unsafe-path` |
| Dangling `.myco/index.json` cannot create outside target | executed named test; independent `outsideExists: false` |
| Regular save still works (canonical order) | executed `saved index ordering is canonical…`; independent two-root save `writtenA/B true`, `equal true`, files `a.ts` then `z.ts` |
| Linked `.myco` directory already refused | `admitCacheDirectory` 171–173 / 189–192; executed linked-cache-dir test; independent `written:false` / outside index absent |
| Hostile detector can go red (Node follows dangling file symlink) | independent `writeFile(link, "FOLLOWED")` created the outside body `FOLLOWED` |
| `fs.rename(tmp, dest)` itself follows a dangling file symlink | **not on this host**. Independent rename **replaced** the dest reparse with a regular file; outside stayed absent |
| `O_NOFOLLOW` used on the write | **not used**. Write is `open(tmp,"wx")` then `rename`. `fs.constants.O_NOFOLLOW` **ABSENT** on this win32 Node |
| TOCTOU between `readlink` and `rename` closed | **not closed**. Independent plant-after-ENOENT then `rename` still does not write outside **on this host** (rename replaces dest); the check/use gap remains |
| Windows dangling `lstat` throw | **NOT VERIFIABLE** on this host: dangling file symlink `lstat.isSymbolicLink===true` (no throw); dangling junction same |
| 124-finding scan | **not this claim**. `csf_018f73bf926a34658d55adfc` stays `PARTIAL_THIS_TREE` |

HEAD without `readlink`: on **this** host `lstat` already reports
`isSymbolicLink===true`, so HEAD lstat-only would also refuse this
fixture. The throw-then-ENOENT escape that `readlink` is meant to
cover was not live-produced.

## Command receipts

1. `node --experimental-strip-types --test --test-timeout=30000 packages-ts/galerina-tools-myco/tests/store.test.ts`
   from worktree
   `./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
   → **25/25 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 304.3782`.
   - `saveGraph refuses to write through a dangling index.json symlink` — **green** (5.115ms)
     (`written===false`, `reason==="unsafe-path"`, outside `stat` fails).
     File-symlink creation was **not** skipped (`EPERM` skip path not taken).
   - `saved index ordering is canonical apart from observational createdAt` — **green** (13.6656ms)
   - `saveGraph refuses to write through a linked cache directory` — **green** (3.2543ms)
   Remaining 22 tests green (path traversal, closed record shape ×12,
   round-trip, skip tags, budgets, byte ceiling, directory-link load,
   programmatic path gate, code-unit order, crypto boundary policy).

Independent extra probes (`%TEMP%\galerina-myco-index-symlink-probe.mjs`
and `galerina-myco-index-symlink-extra.mjs`; not production; import this
tree’s `src/graph/store.ts` with `--experimental-strip-types`):

- `fs.constants.O_NOFOLLOW` / `O_SYMLINK` **ABSENT**; `O_EXCL=1024`.
- Dangling file symlink: `readlink` returns the outside path;
  `lstat.isSymbolicLink===true`; `saveGraph` → `{written:false,
  reason:"unsafe-path"}`; outside still absent.
- Regular `saveGraph` → `{written:true}` with files `["a.ts"]` /
  terms `[["alpha",1]]`.
- Canonical order: two insert-order graphs, both `written:true`,
  JSON equal after deleting `createdAt`, files `["a.ts","z.ts"]`.
- Red detector: `writeFile(dangling, "FOLLOWED")` **created** the
  outside file (`followed: true`). Without a control, Node follows.
- `rename(tmp, dangling)` did **not** create/overwrite outside: dest
  became a regular file with body `RENAME_FOLLOWED`; outside absent.
- `rename` onto a symlink whose target **already exists** replaced
  the dest link with a regular file; outside body stayed `ORIGINAL`.
- Linked `.myco` dir (`type:"dir"`) → `unsafe-path`; outside
  `index.json` absent.
- Junction `.myco` → `unsafe-path`; outside `index.json` absent;
  `lstat.isSymbolicLink===true`.
- Existing-target file symlink: `saveGraph` `unsafe-path`; outside
  body stayed `KEEP`.
- TOCTOU sketch: dest `readlink` ENOENT, plant dangling symlink,
  then `rename` → outside still absent (rename replaced dest).
- Dangling junction: `lstat.isSymbolicLink===true` (no throw).

## Challenge 1 — does `saveGraph` still create the outside target?

**No on this Windows host. CONFIRMED for a pre-existing dangling
file symlink at `.myco/index.json`.** Locators: `store.ts` 130–135
(`readlink` refuse) then 146–154 (`open wx` tmp + `rename`). Named
hostile test and independent `saveGraph` both returned
`written:false` / `unsafe-path` and left the outside path absent.
Existing-target extra probe left outside `KEEP`.

## Challenge 2 — can the follow-through detector go red?

**Yes for `writeFile`. CONFIRMED.** The same dangling-link shape
without the `saveGraph` control (`promises.writeFile(link)`) created
the outside file with body `FOLLOWED`. The green refuse test is not
vacuous as a Node-follows-file-symlink property.

**No for `fs.rename` on this host.** Independent `rename(tmp, dest)`
replaced the dest reparse with a regular file and did not create or
overwrite the outside path. `saveGraph`’s actual write primitive is
rename, not `writeFile`. The named refuse still fires before rename.

## Challenge 3 — is the write atomic (`O_NOFOLLOW`)?

**No. Residual, not a named-claim finding.** Source uses `readlink`
then `open(tmp,"wx")` then `rename(tmp, dest)` with no dest flags.
`O_NOFOLLOW` is absent from `fs.constants` on this win32 Node.

## Residuals (not findings against the named claim)

- TOCTOU between `readlink` and `rename`: a missing path that later
  becomes a dangling symlink is not refused by this check. On this
  host the subsequent `rename` replaced dest and did not write
  outside; that is host rename semantics, not a closed check/use
  window.
- `O_NOFOLLOW` is not used. On this win32 Node it is not even a
  `fs.constants` member. POSIX `open(..., O_NOFOLLOW)` / `renameat2`
  were **not** exercised.
- Comment-adjacent rationale that `lstat` can throw on some Windows
  dangling reparse points is **NOT VERIFIABLE** here: file symlink
  and junction dangling reparse both lstat as symbolic links. HEAD
  lstat-only would refuse **this** fixture; the throw-then-ENOENT
  escape was not live-produced.
- `fs.rename` on this host does not follow a file symlink (dangling
  or live). The named “write through” harm is the `writeFile`
  follow-through, which `saveGraph` does not call for `dest`.
- Scan ID `csf_018f73bf926a34658d55adfc` stays `PARTIAL_THIS_TREE`
  (dangling `index.json` refuse added; linked `.myco` already
  refused; TOCTOU / `O_NOFOLLOW` remain). Inventory
  `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  is unchanged by this review. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid
(independent `writeFile` follow-through went red; named suite asserts
`written===false`). Evidence is sufficient for a pre-existing dangling
`.myco/index.json` file symlink on this Windows Node, plus regular
canonical save and linked-`.myco` refuse; insufficient for TOCTOU
closure, `O_NOFOLLOW`, the lstat-throw Windows path, scan closure,
and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
