# Independent audit — package.fungi.json names cannot escape the build output directory

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `package.fungi.json` descriptor names cannot escape the
build output directory.

- `galerina.mjs` admits a name only if it is a string matching
  `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/` and does not contain `..`
- The write path re-checks the same rule on the artifact basename
- Hostile names `../evil`, `..\evil`, `foo/bar`, `foo..bar`,
  `a/../../outside` cause `galerina.mjs build --package` to exit 1 with
  `/not an admitted filename/` and must not write `evil.wasm` /
  `outside.wasm` outside the temp package
- An admitted name `okpkg` proceeds past the filename gate (does not
  match that error)

Tests: `tests/package-descriptor-name.test.mjs` (untracked/new). Spawns
`process.execPath` + this tree’s `galerina.mjs` with `shell: false`.

Scan `csf_1b4570816f7f2097d9cf405b` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` independently
recounts **78 OPEN / 42 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT`
78, `PARTIAL_THIS_TREE` 42, `PATCHED_AUDIT_PENDING` 4, `n` 124). This is
**not** 124-scan closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Tests
execute `galerina.mjs` directly; this reviewer did not rebuild.

Production name gate is **already in HEAD** `91b4dec0` (landed in
ancestor `0f949c4060830da1722a301df37a508ea20d69b4`). Dirty vs HEAD for
`galerina.mjs` is unrelated CBOR-subject verify
(`selectManifestAuthSubject`, net −25 lines around 1822–1983). CRLF-
normalized name-gate blocks are **byte-identical** to HEAD (first gate
HEAD/WT line 1039; write-time HEAD 2436 / WT 2411). That dirty slice is
not this claim.

Dirty slice for this claim vs HEAD `91b4dec0`: `??`
`tests/package-descriptor-name.test.mjs` (untracked; not in HEAD).
`galerina.mjs` is `M` but the two name-gate predicates are unchanged.

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of the
working-tree bytes.

| path | sha256 |
|---|---|
| `galerina.mjs` | `2bc30eedd2de9bf369dfcd0fdd09c3832ec80a6b15438e14d645d25ca45eb888` |
| `tests/package-descriptor-name.test.mjs` | `785498e38aae991f2742240689512763f5ebf10072881f17eefdaccf5d88f392` |

HEAD `galerina.mjs` git blob `e5bbafe90182130bf49a07f3193d3ce5632b179e`,
sha256 `5e370c7296f51147c4ebab7e2be474dacfd91423085d338d52f4c523227a0b9d`
(the CBOR-subject dirty copy). Working-tree git blob
`b2516539b2cabf8ad2ffe5a415c2c395dd3cde66`. Test file is not in HEAD
(git blob `4cca233cd203142a5b41047a1a6d0338eb2591df`).

Inventory file sha256
`ac0ff020c16dd0a8cc724cdcb317bda1439468018622c943351e89e7567e11f7`
(`n` 124, `scan_revision` `0f24ca30…`, `worktree_head` `91b4dec0…`,
`overall` `INCOMPLETE_NON_AUTHORITATIVE`). Finding
`csf_1b4570816f7f2097d9cf405b` (`Package descriptor names escape the
build output directory`, medium, `galerina.mjs` start_line 1016) is
`PARTIAL_THIS_TREE`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob of `galerina.mjs` checked only
`if (!packageDescriptor.name)` then used the name in
`join(pkgDir, packageDescriptor.entry || "src/index.fungi")` and later
`join(outDir, \`${name}.wasm\`)` with **no** filename regex and **no**
`includes("..")`. The dual gate landed in `0f949c406`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Admit only string `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/` without `..` | WT/HEAD 1036–1040: `typeof !== "string"` OR regex fail OR `includes("..")` → `not an admitted filename` / exit 1 |
| Write path re-checks the same rule | WT 2409–2412 / HEAD 2434–2437: `packageBuild ? packageDescriptor.name : basename(fungiFile, ".fungi")` then the same regex + `includes("..")` before `mkdirSync` / `writeFileSync` |
| Hostile `../evil`, `..\evil`, `foo/bar`, `foo..bar`, `a/../../outside` exit 1 with `/not an admitted filename/` | named hostile test; independent CLI rows all `status=1` and `Error: package.fungi.json name '…' is not an admitted filename` |
| Must not write `evil.wasm` / `outside.wasm` outside the temp package | named `existsSync` on `root/evil.wasm` and `dirname(root)/outside.wasm`; independent probe also `pkg/evil.wasm`, `pkg/outside.wasm`, `pkg/dist`, parent `evil.wasm`/`outside.wasm`, and any `.wasm`/`.wat`/`.lmanifest` under the temp root — all absent; `distExists=false` |
| Admitted `okpkg` proceeds past the filename gate | named second test `doesNotMatch /not an admitted filename/`; independent `okpkg` → `FUNGI-BACKEND-001` missing `src/index.fungi` (ENOENT), `admitted=false` |
| Dirty CBOR slice does not change this gate | **CONFIRMED** `git diff HEAD -- galerina.mjs` is only `selectManifestAuthSubject`; CRLF-normalized first/second blocks equal HEAD |
| Named node tests | **2/2 pass**, `duration_ms 1865.9158` |
| 124-finding scan | **not this claim** (`csf_1b4570816f7f2097d9cf405b` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 tests/package-descriptor-name.test.mjs`
   → **2/2 pass**, 0 fail, `duration_ms 1865.9158`.
   - `hostile: package descriptor names with path separators or .. are refused` — **green** (1391.3222ms)
   - `an admitted package name proceeds past the filename gate` — **green** (353.2419ms)

Independent extra probes (eval only; temp
`%TEMP%\pkg-name-gate-probe.mjs` and
`%TEMP%\pkg-name-gate-probe2.mjs`, not production; spawn the same
`galerina.mjs`). Printed `PROBE_OK` / `PROBE2_OK`. Node v24.18.0.

Predicate (same regex + `includes("..")` as WT 1036–1038 / 2410):

- `../evil`, `..\evil`, `foo/bar`, `a/../../outside` → `admitted=false` (`reOnly=false`)
- `foo..bar` → `reOnly=true`, `admitted=false` (`includes("..")` is the extra refuse)
- `okpkg`, `foo.bar`, 128× `a` → `admitted=true`
- 129× `a`, `""`, `.hidden`, `ok pkg`, `ok:pkg`, `ok\pkg` → `admitted=false`

CLI (`build --package`, `shell: false`):

- five named hostile names plus extra `../../evil` → exit 1, first-gate
  error, no wasm/wat/lmanifest under the temp tree, no `pkg/dist`
- `okpkg` without `src/index.fungi` → exit 1,
  `FUNGI-BACKEND-001` ENOENT, **not** `not an admitted filename`

Scan-shaped `join(pkg, "dist", \`${name}.wasm\`)` reconstruction of
`0f24ca30` (no filename gate):

- `../evil` / `..\evil` → `pkg\evil.wasm` (escapes `dist`)
- `foo/bar` → `pkg\dist\foo\bar.wasm`
- `foo..bar` → `pkg\dist\foo..bar.wasm` (not a path escape)
- `a/../../outside` → `pkg\outside.wasm` (escapes `dist`)
- `../../evil` → parent `evil.wasm` (escapes the package)

Current CLI never reaches that `writeFileSync` for those names.

## Challenge 1 — do hostile names still write wasm outside the package?

**No. CONFIRMED refused before write.** First gate WT 1036–1040 exits 1
with `package.fungi.json name '…' is not an admitted filename`. Named
hostile and independent CLI rows write no `evil.wasm` / `outside.wasm`
in the package parent, inside `pkg/`, or under `pkg/dist`. Detector can
go red: scan-era `join` of `../evil` / `a/../../outside` / `../../evil`
leaves `dist`.

## Challenge 2 — does `foo..bar` slip through because the regex allows `.`?

**No. CONFIRMED refused by `includes("..")`.** Independent
`foo..bar_reOnly=true` and `admitted=false`. CLI error is the first-gate
filename message. Scan-era join would have written `dist\foo..bar.wasm`
(not a traversal); the named claim still requires the refuse.

## Challenge 3 — does admitted `okpkg` still match the filename error?

**No. CONFIRMED past the gate.** Named second test
`doesNotMatch /not an admitted filename/`. Independent `okpkg` fails
later at `FUNGI-BACKEND-001` (missing entry file). That later fail is
not this claim.

## Challenge 4 — did the dirty CBOR-subject diff change the name gate?

**No. CONFIRMED unchanged vs HEAD.** Dirty hunk is
`selectManifestAuthSubject` only. CRLF-normalized first block
HEAD@1039 = WT@1039; write-time HEAD@2436 = WT@2411 (line shift is the
net −25 CBOR edit). Predicate text matches `0f949c406`.

## Residuals (not findings against the named filename-refuse / no-escape claim)

- Windows reserved device names (`CON`, `NUL`) are **not this claim**.
  Independent predicate admits both (`reOnly=true`).
- Hostile named tests never reach the write-time re-check: the first
  gate exits first. Write-time WT 2410–2412 is source-confirmed (same
  predicate; CRLF-normalized equal to HEAD) and is the basename path
  for non-`--package` builds (`basename(fungiFile, ".fungi")`).
- Named `existsSync(join(root, "evil.wasm"))` would not have observed
  scan-era `../evil` (that `join` lands in `pkg/evil.wasm`, still inside
  the temp package). Independent probe checked `pkg/evil.wasm`,
  `pkg/outside.wasm`, `pkg/dist`, and parent paths; none written.
- `foo..bar` is a filename with two dots, not a traversal; refused
  anyway as claimed.
- Scan ID `csf_1b4570816f7f2097d9cf405b` stays `PARTIAL_THIS_TREE`.
  Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `ac0ff020c16dd0a8cc724cdcb317bda1439468018622c943351e89e7567e11f7`
  `disposition_counts` independently recount **78 OPEN / 42 PARTIAL /
  4 PATCHED**. This review did not re-adjudicate the other 123 IDs.
  Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named filename-admit / hostile-refuse /
no-escape / `okpkg`-past-gate claim. Detector is not invalid: scan-era
`0f24ca30` had no regex/`..` gate and `join(dist, name.wasm)` could
leave `dist`. Evidence is sufficient for those bullets; insufficient
for Windows device names, non-`--package` basename hostility, scan
closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
