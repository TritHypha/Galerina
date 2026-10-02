# Independent audit — persistRegistryGeneration chmod is on the staging handle

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `persistRegistryGeneration` applies `chmod 0o444` to the
staging `FileHandle` opened with `wx`, not `fs.chmod(path)`. Source
contains `handle = await fs.open(stagingPath, "wx"` and
`await handle.chmod(0o444)` and does not contain `await fs.chmod(`.

- Scan `csf_275271374b1b30b39c30222f` title: *Generation publication
  follows a replaceable pathname when changing permissions*. Inventory
  note already records chmod on the wx staging handle.
- Current persist path: exclusive `wx` create (`0o600`), write, `sync`,
  `handle.chmod(0o444)`, `sync`, `close`, then `fs.link(stagingPath,
  finalPath)`. No `await fs.chmod(` call.

Tests: `packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs`
`"hostile: publication chmod is applied to the staging handle, not a
replaceable pathname"`. Source-shape: `readFileSync` of `../src/registry-generation-store.ts`.

Scan `csf_275271374b1b30b39c30222f` is **PARTIAL_THIS_TREE**. Inventory
**69 OPEN / 51 PARTIAL / 4 PATCHED** was independently recounted from
this tree’s inventory JSON `disposition_counts` (`OPEN_ON_SCAN_SNAPSHOT`
69 / `PARTIAL_THIS_TREE` 51 / `PATCHED_AUDIT_PENDING` 4). This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). The named
hostile test does **not** import dist for the chmod assertion; it reads
src. Dist `registry-generation-store.js` mtime (`2026-09-22T16:25:37.601Z`)
is newer than working-tree src (`2026-09-22T15:52:29.681Z`). Dist persist
region is **not stale** vs src: both `open(stagingPath, "wx", 0o600)`,
both `handle.chmod(0o444)`, both then `close` and `fs.link`; neither
contains `fs.chmod(`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs`
(+25 lines). Named hostile is the last `it` in
`describe("statically linked production generation seam")` (src 705–713).
The same dirty test file also adds an unrelated
`/not owner-released/` reject on `publishRegistryGenerationWithLinkedHost`
(src 613–626); that is **not** this claim.

`src/registry-generation-store.ts` is **not file-clean vs HEAD** (git
blob HEAD `df9931499a4e43f4a9904313254ab17f36bd6f28`, working-tree
`03f1f5ce942eb0285071f96596d5aecaccaf8f79`). The dirty hunks are FIFO /
`O_NONBLOCK` in `readBoundedRegularFile` (unrelated; `open(filePath,"r")`
→ `readOnly | nonblock`). Newline-normalized `persistRegistryGeneration`
equals HEAD (`persist_nl_bytes` 4291 both; `persist_nl_equal` true).
HEAD already has `handle = await fs.open(stagingPath, "wx", 0o600)` at
813 and `await handle.chmod(0o444)` at 820. Working-tree persist chmod
path is the same text at 832 / 839. Dist is untracked (gitignored) and
includes the unrelated FIFO dirty (`isFifo`, `O_NONBLOCK`).

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of the
working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | `fcdcfa5f0903b199e09d3a99b7caf535da3813c3c59cfd9d3f74a3d27a956842` |
| `packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs` | `0f53ed5e0de2481c807f6ab101564f057d731ab6855e33f078b5da87f0e72afd` |

Dist (not author-named; gitignored; sha256
`00a86808a443f0dc2b3ad836efdc66bbcbf8f922d13d7e7817e564a12524c36f`)
persist region: `open(stagingPath, "wx", 0o600)` at 534,
`handle.chmod(0o444)` at 541, no `fs.chmod(`. Tests import
`../dist/index.js` for other cases; the named hostile reads src.

HEAD test blob `f5288c3e2d1055677575385ac0188b1878bf521b` lacks the
hostile chmod case. Working-tree test blob
`f8bd0004d4db7fc70dae2bf26e7d38a0cc1c7e8e`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| staging open is `wx` on a FileHandle | src 832 / HEAD 813 / dist 534: `handle = await fs.open(stagingPath, "wx", 0o600)` |
| `chmod 0o444` is `handle.chmod`, not path `fs.chmod` | src 839 / HEAD 820 / dist 541: `await handle.chmod(0o444)` after write/`sync`/stat, before close |
| source does not contain `await fs.chmod(` | independent scan of working-tree src: `await fs.chmod(` count 0; `fs.chmod(` count 0. Interface still declares `NodeFsPromises.chmod(path, mode)` at src 39 (type only; not a call) |
| persist chmod path already in HEAD | **CONFIRMED** newline-normalized `persistRegistryGeneration` equals HEAD. Author “src is clean vs HEAD” is true for this function, false for the file (FIFO dirty) |
| Dist persist chmod not stale vs src | **CONFIRMED** same `wx` open, same `handle.chmod(0o444)`, same close-then-`link`. Dist mtime newer than src |
| Named node test | **1/1 pass** under the assigned name pattern, `duration_ms 208.4103` |
| 124-finding scan | **not this claim** (`csf_275271374b1b30b39c30222f` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 --test-name-pattern "publication chmod" packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs`
   → **1/1 pass**, 0 fail, `duration_ms 208.4103`.
   - `hostile: publication chmod is applied to the staging handle, not a replaceable pathname` — **green** (0.9327ms)

Independent extra probes (eval only; temp
`%TEMP%\generation-handle-chmod-audit-probe.mjs` and `probe2.mjs`, not
production). Printed persist-region equality and the three hostile
regexes. Node v24.18.0.

Working-tree src regex (same predicates as the named test):

- `/handle = await fs\.open\(stagingPath, "wx"/` → match (line 832)
- `/await handle\.chmod\(0o444\)/` → match (line 839)
- `/await fs\.chmod\(/` → no match

HEAD src: same three predicates at 813 / 820 / absent.

Dist persist: `open(stagingPath, "wx", 0o600)` then `handle.chmod(0o444)`
then `close` then `fs.link(stagingPath, finalPath)`. `fs.chmod(` absent.

## Challenge 1 — does persist open staging with `wx` on a FileHandle?

**Yes. CONFIRMED.** src 832, HEAD 813, dist 534. Flag is `"wx"` with
mode `0o600`. Named hostile `assert.match` and independent regex both
match `handle = await fs.open(stagingPath, "wx"`.

## Challenge 2 — is `0o444` applied via `handle.chmod`, not `fs.chmod(path)`?

**Yes. CONFIRMED.** src 839 / HEAD 820 / dist 541 are
`await handle.chmod(0o444)`. Independent `fs.chmod(` and
`await fs.chmod(` counts on src are 0. Node `FileHandle.chmod` is the
fd/`fchmod` surface; `fs.chmod(path)` is the pathname surface. The named
claim is that source shape.

## Challenge 3 — does source still contain `await fs.chmod(`?

**No. CONFIRMED absent.** Named `assert.doesNotMatch` and independent
scan. The `NodeFsPromises.chmod(path, mode)` field at src 39 is a type
declaration, not a call, and does not match `/await fs\.chmod\(`.

## Challenge 4 — is persist chmod already in HEAD, with only the hostile test dirty?

**Persist chmod: yes. File-clean src: no.** Newline-normalized
`persistRegistryGeneration` equals HEAD. HEAD already chmod’s the wx
handle. The src **file** is dirty for unrelated FIFO/`O_NONBLOCK` in
`readBoundedRegularFile`. Dirty for this claim is the hostile test
(plus an unrelated `/not owner-released/` insert in the same test file).

## Challenge 5 — does the named test prove runtime inode mode / close-to-link TOCTOU?

**No. Not claimed.** The hostile test is source-shape only: it
`readFileSync`s TypeScript and regexes three literals. It does not call
`persistRegistryGeneration`, does not `stat` mode bits, and does not
race `close` vs `link`. That is sufficient for the named source-shape
claim and insufficient to close pathname `link` TOCTOU.

## Residuals (not findings against the named handle-chmod source-shape claim)

- **TOCTOU between `close` and `link`.** After `handle.chmod(0o444)` the
  handle is closed (`handle = undefined`) and publication is
  `await fs.link(stagingPath, finalPath)` by pathname. chmod-on-handle
  binds mode to the fd; it does not bind the later link to that inode.
  A replace of `stagingPath` in that window remains a residual. This is
  the named residual; it is why the finding stays `PARTIAL_THIS_TREE`.
- Named test is source-shape, not a live `fchmod` vs `chmod(path)` race
  and not a POSIX mode-bit proof. Windows `chmod` is not POSIX `0o444`.
- Unrelated dirty: FIFO/`O_NONBLOCK` in the same src file;
  `/not owner-released/` in the same test file; other app-kernel dirty
  paths (`host-floor.ts`, native durability, other tests) were not this
  claim.
- Dist includes the unrelated FIFO dirty. Named chmod test reads src.
- Scan ID `csf_275271374b1b30b39c30222f`
  (`Generation publication follows a replaceable pathname when changing
  permissions`, medium, high confidence,
  `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts`,
  inventory `start_line` 812) stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `360a56825276f8fc2146bfc1f16d548f89e74761607e957318df4d1a6d3c4b45`
  `disposition_counts` independently recounted **69 OPEN_ON_SCAN_SNAPSHOT
  / 51 PARTIAL_THIS_TREE / 4 PATCHED_AUDIT_PENDING**. This review did
  not re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named handle-chmod / no-`fs.chmod(path)`
source-shape claim. Detector is not invalid. Evidence is sufficient for
those bullets; insufficient for close-to-link TOCTOU closure, POSIX
mode-bit behaviour on this Windows host, scan closure, and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
