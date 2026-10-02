# Independent audit — requirement-launcher output writes refuse dangling and ancestor links

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: requirement-launcher output writes refuse dangling and
ancestor output links.

- `scripts/lib/requirement-output-admission.mjs` `pathIsSymlink` uses
  `readlinkSync` (dangling links count).
- `refuseLinkedPath` walks ancestors.
- `writeOutputFile` calls `refuseLinkedPath` before `writeFileSync`.
- `admitOutputDir` refuses junctions/symlinks and requires `realpath`
  under `root/build/`.
- Hostile: junctioned `build/linked-out` throws `TEST_LINKED|TEST_ESCAPED`
  and does not write `outside/receipt.json`.
- Hostile: dangling dest symlink throws `TEST_LINKED` and does not create
  the target.
- Real `build/ok` admits and writes.

HEAD `scripts/build-requirement-launcher.mjs` used
`existsSync(current) && lstatSync(current).isSymbolicLink()` in
`refuseLinkedPath` (dangling missed: `existsSync` is `stat`, so a
dangling dest is skipped, then `writeFileSync` follows the link).
Dirty extract + `readlinkSync` is this claim. Launcher wrappers pass
closed-over `ROOT` into the extract.

Tests: `scripts/tests/requirement-output-admission.test.mjs` import
`../lib/requirement-output-admission.mjs` (no dist rebuild).

Scan `csf_87678448ed0e81dd1e9b4a88` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
`e949ed71dffe1c19dd94e0c9a6edb7552af9e9a4de50f82bad05d76db9f062f1`
(`n=124`, `overall=INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`). Independent recount of
the `findings` array matches stored `disposition_counts`:
**73 OPEN / 47 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 73,
`PARTIAL_THIS_TREE` 47, `PATCHED_AUDIT_PENDING` 4). Assigned prompt
text that this JSON “may show 75 OPEN / 45 PARTIAL / 4 PATCHED” does
**not** match this file. This is **not** 124-scan closure. Not Astra.
Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild. Named tests import the `.mjs` extract
directly.

Dirty slice for this claim vs HEAD `91b4dec0`:

- `M` `scripts/build-requirement-launcher.mjs` (+9 / −36: local
  `admitOutputDir` / `writeOutputFile` / `copyOutputFile` became
  wrappers that pass `ROOT` into the extract; inlined
  `existsSync && lstat` `refuseLinkedPath` removed). HEAD blob
  `83a53a38b3ae24791964ab59a09f407ab768dd09` (sha256
  `9bd587b95f4e697570758a207161e6530eb8b5751fca34a91b4e448de4fd604c`).
  Working-tree git blob `789d61d3d197d1ec688a87932d5b323510c486fc`.
- `??` `scripts/lib/requirement-output-admission.mjs` (not in HEAD).
  Working-tree git blob `6ea120994bbd8a732b39e55f674efe1a996e0501`.
- `??` `scripts/tests/requirement-output-admission.test.mjs` (not in
  HEAD). Working-tree git blob
  `bfd48f6a2aa32601c7accf8773531ae9e172d60c`.

Unrelated dirty on this worktree was not this claim.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes (PowerShell `Get-FileHash` and Python
`hashlib.sha256` agreed).

| path | sha256 |
|---|---|
| `scripts/lib/requirement-output-admission.mjs` | `6a7f5fad6e40b2e7f5aa64a1131f620c22ac3187246edfc767eb193e07b668d0` |
| `scripts/build-requirement-launcher.mjs` | `b00c7d9fc71f713a4635a5e2d3ffb65e3992eac09605d238452bff915ec8887a` |
| `scripts/tests/requirement-output-admission.test.mjs` | `6cf182a3c35e239535625447001672bea7fc747ab79d6803ad3395db4510e123` |

Consumers of the extract under `scripts/`: the launcher wrappers and
this test file only.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `pathIsSymlink` uses `readlinkSync` (dangling counts) | extract 12–21: `readlinkSync(file)` success → `true`. `ENOENT` / `EINVAL` / `UNKNOWN` fall through; other errors rethrow. Independent probe: dangling dest `existsSync=false`, `pathIsSymlink=true` |
| `refuseLinkedPath` walks ancestors | extract 31–42: loop `dirname` until parent identity, `rel===""`, `rel===".."`, or `rel.startsWith("..")`; any `pathIsSymlink(current)` throws `${code}_LINKED`. Independent `ancestor_walk` on `build/linked-out/nested/receipt.json` → `TEST_LINKED` |
| `writeOutputFile` refuses before write | extract 64–67: `refuseLinkedPath(filePath, code, root)` then `writeFileSync`. No write on the hostile paths |
| `admitOutputDir` refuses junctions/symlinks and requires `realpath` under `root/build/` | extract 45–61: lexical under `root`, `refuseLinkedPath` **before** `mkdirSync`, then `pathIsSymlink` / not-dir → `_LINKED`, `realpathSync.native` rel must start with `build/` else `_ESCAPED` |
| launcher wrappers pass `ROOT` | dirty launcher 144–154: `admitOutputDirAt(dir, code, ROOT)`, `writeOutputFileAt(path, content, code, ROOT)`, `copyOutputFileAt(from, to, code, ROOT)` |
| junctioned `build/linked-out` throws and does not write outside | named hostile; independent `admit_junction_code=TEST_LINKED`, `write_junction_code=TEST_LINKED`, `outside/receipt.json` absent |
| dangling dest symlink throws and does not create the target | named hostile (this host did **not** skip); independent `dangling_write_code=TEST_LINKED`, `secret.txt` absent; pre-existing target left `orig\n` |
| real `build/ok` admits and writes | named honest tests; independent `admit_ok` / `honest_write` |
| HEAD `existsSync && lstat` missed dangling | HEAD launcher 160–175: `if (existsSync(current) && lstatSync(current).isSymbolicLink())`. Independent HEAD-shaped reconstruction: `head_dangling_detect=false`, `headRefuse` `NO_THROW` on the same dangling dest |
| Named node tests | **4/4 pass**, 0 fail, 0 skip, `duration_ms 135.0117` |
| 124-finding scan | **not this claim** (`csf_87678448ed0e81dd1e9b4a88` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 scripts/tests/requirement-output-admission.test.mjs`
   → **4/4 pass**, 0 fail, 0 cancelled, 0 skipped, `duration_ms 135.0117`.
   - `admitOutputDir admits a real directory under build/` — **green** (4.0689ms)
   - `hostile: writeOutputFile refuses a junctioned output directory` — **green** (2.7834ms)
   - `hostile: writeOutputFile refuses a dangling output symlink` — **green** (2.4396ms)
   - `writeOutputFile writes into an admitted real build directory` — **green** (3.0751ms)

   Dangling did **not** skip. This host created the file symlink
   (`symlinkSync(target, dest)` without `file symlink not permitted`).
   Junction test must pass per the assignment; it did.

Independent extra probe (eval only; temp
`%TEMP%\req-out-links-probe.mjs`, not production; imports the same
working-tree extract). Printed `PROBE_OK`. Node v24.18.0.

Current extract:

- `admitOutputDir(build/ok)` and `writeOutputFile` of `ok\n` succeed
- junction `build/linked-out` → `outside`: `pathIsSymlink=true`;
  `admitOutputDir` throws `TEST_LINKED`; `writeOutputFile(.../receipt.json)`
  throws `TEST_LINKED`; `outside/receipt.json` absent
- dangling dest `build/out/receipt.json` → `outside/secret.txt`:
  `existsSync(dest)=false`; `pathIsSymlink(dest)=true`;
  `writeOutputFile` throws `TEST_LINKED`; target absent
- pre-existing `secret.txt` (`orig\n`) is not overwritten
  (`preexist_target_code=TEST_LINKED`, bytes still `orig\n`)
- `refuseLinkedPath` on a nested path under the junction throws
  `TEST_LINKED`

HEAD-shaped reconstruction (`existsSync && lstatSync.isSymbolicLink`,
same ancestor walk as HEAD 160–169):

- junction dest still detected (`head_junction=true`)
- dangling dest **not** detected (`head_dangling_detect=false`);
  reconstructed `headRefuse` does **not** throw (`NO_THROW`)

That is the scan-era miss: `existsSync` is false on a dangling dest, so
HEAD `writeOutputFile` would have called `writeFileSync` and followed
the link. Current `readlinkSync` returns true before the write.

## Challenge 1 — does a junctioned output directory still write outside?

**No. CONFIRMED refused.** Named hostile `assert.throws` on
`admitOutputDir(linked)` (`TEST_LINKED|TEST_ESCAPED`) and
`writeOutputFile(join(linked, "receipt.json"))` (`TEST_LINKED`), plus
`existsSync(outside/receipt.json)===false`. Independent probe:
`admit_junction_code=TEST_LINKED`, `write_junction_code=TEST_LINKED`,
`outside_receipt_absent=true`. Detector can go red.

## Challenge 2 — does a dangling dest symlink still create the target?

**No. CONFIRMED refused.** Named hostile (not skipped on this host) and
independent `dangling_refused` / `dangling_target_absent`.
`pathIsSymlink` sees `readlinkSync` on the dest; `writeFileSync` is not
reached. A pre-existing outside target is left intact. Detector can go
red.

## Challenge 3 — does a real `build/ok` directory still admit and write?

**Yes. CONFIRMED.** Named honest tests and independent `admit_ok` /
`honest_write`. Detector can go green on a real directory under
`build/`.

## Challenge 4 — did HEAD `existsSync && lstat` miss dangling?

**Yes. CONFIRMED miss on HEAD-shaped detector.** Independent
`dangling_existsSync=false` and reconstructed HEAD `refuseLinkedPath`
returns `NO_THROW` on the same dangling dest. Dirty extract
`readlinkSync` is the change that makes dangling count.

## Challenge 5 — do launcher wrappers pass `ROOT`?

**Yes. CONFIRMED.** Dirty `scripts/build-requirement-launcher.mjs`
144–154. Call sites still use the local wrappers (admit of `OUTPUT` /
cargo targets; writes of worker sources, registries, receipt; copies of
protocol / cargo binaries). The extract is not imported elsewhere under
`scripts/` except the named test.

## Residuals (not findings against the named dangling/ancestor-link refuse)

- **TOCTOU** between `refuseLinkedPath` and `writeFileSync` /
  `copyFileSync` / `mkdirSync` (no `O_NOFOLLOW` reopen). Allowed by the
  named claim. A replacement of the dest with a symlink after the
  refuse is not closed.
- `writeOutputFile` / `copyOutputFile` do not themselves require dest
  `realpath` under `root/build/`. They only refuse linked paths then
  write. The launcher admits `OUTPUT` first and passes known
  OUTPUT-relative paths through wrappers. An arbitrary non-linked path
  handed to `writeOutputFile` would still write. Not the named
  dangling/ancestor-link claim.
- `refuseLinkedPath` stops when `relative(root, parent)` is empty, so
  the package root itself is not checked as a symlink.
- Finite residual of junction vs directory-symlink vs mount-point
  flavors other than `symlinkSync(..., "junction")` / file symlink was
  not re-enumerated beyond the named hostile cases. `readlinkSync`
  success is the predicate; this host’s junction and file-symlink
  creates both succeeded.
- Scan ID `csf_87678448ed0e81dd1e9b4a88`
  (`Requirement launcher writes through unverified output links`,
  medium, `scripts/build-requirement-launcher.mjs`) stays
  `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `e949ed71dffe1c19dd94e0c9a6edb7552af9e9a4de50f82bad05d76db9f062f1`
  independent `disposition_counts` are **73 OPEN / 47 PARTIAL / 4
  PATCHED**. This review did not re-adjudicate the other 123 IDs. Not
  124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named dangling-dest / ancestor-junction /
honest-`build/ok` claim. Detector is not invalid. Evidence is sufficient
for those bullets; insufficient for TOCTOU closure, a `build/` constraint
inside `writeOutputFile` itself, scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
