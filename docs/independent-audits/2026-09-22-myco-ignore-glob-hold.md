# Independent audit — Myco ignore glob matching does not use RegExp backtracking

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: Myco ignore glob matching does not use RegExp backtracking.

- `packages-ts/galerina-tools-myco/src/ingest/walk.ts` `globMatch` is a
  linear `*` / `?` matcher (star pointer, no `new RegExp`).
- Nested-star miss `*a*a*…b` vs 48 `a`s returns `false` in under 50ms.
- Patterns longer than `MAX_IGNORE_PATTERN` (256) are skipped so an
  oversize all-star ignore does not hide `keep.txt`.

Tests: `packages-ts/galerina-tools-myco/tests/walk.test.ts` import
`../src/ingest/walk.ts` with `node --experimental-strip-types` (source,
not dist). Named hostiles: `"globMatch is a linear * / ? matcher"`,
`"hostile: nested-star ignore globs finish without regex backtracking"`,
`"hostile: ignore patterns longer than MAX_IGNORE_PATTERN are not applied"`.

Scan `csf_5272befa84a2050393d0f899` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
`e949ed71dffe1c19dd94e0c9a6edb7552af9e9a4de50f82bad05d76db9f062f1`
independently recounted from the `findings` array:
**73 OPEN / 47 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 73,
`PARTIAL_THIS_TREE` 47, `PATCHED_AUDIT_PENDING` 4; `n` 124). Header
`disposition_counts` match that recount. Assigned briefing “75 OPEN /
45 PARTIAL / 4 PATCHED” is **stale vs this file**. This review did not
re-adjudicate the other 123 IDs. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild. Tests import src; dist staleness is not on
this claim’s path.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-tools-myco/src/ingest/walk.ts` (export of
`MAX_IGNORE_BYTES` / `MAX_IGNORE_RULES` / `MAX_IGNORE_PATTERN` and
`globMatch`; body unchanged) and `M`
`packages-ts/galerina-tools-myco/tests/walk.test.ts` (+3 tests, import
of `globMatch` and `MAX_IGNORE_PATTERN`). Unrelated dirty on this
worktree was not this claim.

`globMatch` body is already in HEAD `91b4dec0` (git blob
`c5522fe4b50feb9eee53eb238786a3f1583be903`). Working-tree blob
`ad8f13ddd4d683860a71bb4e11782691f7272808`. Independent extract of
`function globMatch(...) { ... }` from HEAD vs working tree is
**byte-equal**; only the `export` keywords differ.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob used `globToRegExp` (`*` → `[^/]*`, `?` → `[^/]`)
and `return new RegExp(\`^${re}$\`)`, then stored `re` on each rule.
The linear matcher landed in `eb1645a4fd6aedec3fabb646ec5c84001aa30ff1`
(`fix(security): checkpoint runtime and tooling hardening`).

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of the
working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-tools-myco/src/ingest/walk.ts` | `bc0841960e6db9b9f8e69ed3f607dcb6cec66b4aedace43fdc822941003c6fc8` |
| `packages-ts/galerina-tools-myco/tests/walk.test.ts` | `e9c98fa6e4de69973de941a4a6c2b853fc9a98ea02ec347c9ed29c3a1b3424a5` |

HEAD test blob `55bc5c0feae58f722188e4fc8f288475ab2daa85` lacks the
three named glob/hostile cases. Working-tree test blob
`0b10ce0655b682ff04b3463ee82ef533bf8618a6`.

`parseIgnore` is module-private. `isIgnored` (src 153–166) is the only
call site of `globMatch` on the walk path. Tests import src, not dist.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `globMatch` is a linear `*` / `?` matcher (no regex backtracking) | src 69–93: two pointers + one `star` index; no `new RegExp`, no `.test` / `.match`. Working-tree file has **no** `globToRegExp` and **no** `new RegExp`. `parseIgnore` still uses `split(/\r?\n/)` (src 98) for line splitting only. |
| Nested-star miss `*a*a*…b` vs 48 `a`s is `false` in < 50ms | named hostile; independent `globMatch_nested_star_48=false` in **0.0509ms**; 200 `a`s **0.0158ms** |
| Scan-era `new RegExp` would catastrophically backtrack | reconstructed `0f24ca30` `globToRegExp` in a 1500ms `spawnSync` child: **ETIMEDOUT / SIGKILL**, empty stdout. Same pattern/value as the named hostile. |
| Patterns longer than `MAX_IGNORE_PATTERN` (256) skipped | `parseIgnore` src 113: `body.length > MAX_IGNORE_PATTERN` → `continue`. Named hostile 257-star `.mycoignore` keeps `keep.txt`. Independent `walk_257stars_rels` includes `keep.txt`. |
| Oversize all-star must not hide `keep.txt` | named hostile; independent 257-star walk lists `.mycoignore` and `keep.txt` |
| Bound is skip-oversize, not “stars never apply” | independent: `*` walk rels `[]`; 256-star walk rels `[]` (`keep.txt` hidden). `globMatch("*".repeat(256), "keep.txt")` is `true`; the 257 skip is `parseIgnore`, not the matcher. |
| Honest `*` / `?` still match | named `"globMatch is a linear * / ? matcher"`; independent `*.log`/`b.log` true, `b.txt` false, `a?c`/`abc` true, `ac` false |
| Named node tests | **9/9 pass**, 0 fail, `duration_ms 248.1833` |
| 124-finding scan | **not this claim** (`csf_5272befa84a2050393d0f899` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --experimental-strip-types --test --test-timeout=60000 packages-ts/galerina-tools-myco/tests/walk.test.ts`
   → **9/9 pass**, 0 fail, `duration_ms 248.1833`.
   - `walk honours .mycoignore basename globs and directory rules` — **green** (13.5652ms)
   - `walk honours NESTED .gitignore, scoped to its own subtree (the dss-host /target class)` — **green** (15.1215ms)
   - `walk honours a leading \`**/\` ignore rule as match-at-any-depth` — **green** (12.2285ms)
   - `walk lists over-size files as contentSkip=large AND reports them (no silent drop)` — **green** (5.6909ms)
   - `walk leaves the skip-list empty when nothing exceeds the cap` — **green** (3.3821ms)
   - `walk skips node_modules by default, REPORTS the skip, and --vendored includes it` — **green** (10.7462ms)
   - `globMatch is a linear * / ? matcher` — **green** (0.2054ms)
   - `hostile: nested-star ignore globs finish without regex backtracking` — **green** (0.7605ms)
   - `hostile: ignore patterns longer than MAX_IGNORE_PATTERN are not applied` — **green** (6.9352ms)

Independent extra probes (eval only; temp
`%TEMP%\myco-ignore-glob-probe.mjs`, not production; imports the same
src `walk.ts` via `--experimental-strip-types`). Printed `PROBE_OK`.
Node v24.18.0.

Current `globMatch` / `walk`:

- nested-star miss vs 48 `a`s → `false` (0.0509ms)
- nested-star miss vs 200 `a`s → `false` (0.0158ms)
- `*.log` / `a?c` happy paths as in the named unit test
- `MAX_IGNORE_PATTERN === 256`
- walk `*` and walk 256 stars → `keep.txt` **absent** (ignore applies)
- walk 257 stars → `keep.txt` **present** (oversize skipped)
- walk `*.log` → `keep.txt` present (non-vacuous keep)

Scan-shaped `globToRegExp` reconstruction of `0f24ca30` (same
`[^/]*` / `new RegExp` loop) on the named nested-star miss:

- child `spawnSync` 1500ms timeout → **ETIMEDOUT**, `signal: SIGKILL`,
  no result printed

That is the scan-era match: a repository-controlled `*a*a*…b` ignore
compiled to a backtracking `RegExp` and did not return. Current
`globMatch` never constructs that `RegExp` and returns `false` in
sub-millisecond time.

## Challenge 1 — does nested-star miss still finish?

**Yes. CONFIRMED.** Named hostile `assert.equal(..., false)` and
`ms < 50`. Independent 48-`a` miss 0.0509ms; 200-`a` miss 0.0158ms.
Detector can go green without hanging.

## Challenge 2 — would scan-era `RegExp` still hang?

**Yes. CONFIRMED contrast.** Independent child reconstructing
`0f24ca30` `globToRegExp` on the same pattern/value was killed at
1500ms. The linear matcher is not that instrument.

## Challenge 3 — does an oversize all-star hide `keep.txt`?

**No. CONFIRMED refused.** `parseIgnore` skips `body.length > 256`.
Named hostile and independent 257-star walk both list `keep.txt`.

## Challenge 4 — can a legal star ignore still hide `keep.txt`?

**Yes. CONFIRMED.** Independent `*` and 256-star walks return no
`keep.txt`. The 257 skip is not a vacuous “never ignore”. Detector can
go red on an admitted pattern.

## Challenge 5 — does `globMatch` construct a `RegExp`?

**No. CONFIRMED.** Src 69–93 is a star-pointer loop. Working-tree file
has no `globToRegExp` and no `new RegExp`. HEAD body is the same loop
(unexported). Line-split `/\r?\n/` in `parseIgnore` is not glob
matching.

## Residuals (not findings against the named no-backtracking claim)

- Mid-path `**` is still not gitignore `**`. `parseIgnore` only strips a
  **leading** `**/` (src 107–112); DESIGN.md §7 still says `` `**` and
  advanced forms are not supported ``. Independent
  `globMatch("a/**/b", "a/x/y/b") === true` only because this matcher’s
  `*` matches `/` as a character (also `globMatch("a/*/b", "a/x/y/b")
  === true`). Scan-era `*` was `[^/]*` (no slash). Practical subset,
  not gitignore.
- `parseIgnore` is not a full gitignore parser (no `!` re-check beyond
  last-match-wins, no `**` mid-path rewrite, no character classes,
  UTF-16 `text.length` vs `MAX_IGNORE_BYTES`, silent drop of rules
  after `MAX_IGNORE_RULES`).
- `globMatch` itself has no length cap: 257 stars still match
  `keep.txt` if called directly. The ingest bound is `parseIgnore`.
- Scan ID `csf_5272befa84a2050393d0f899`
  (`Repository-controlled ignore globs cause synchronous catastrophic
  backtracking`, medium,
  `packages-ts/galerina-tools-myco/src/ingest/walk.ts`) stays
  `PARTIAL_THIS_TREE`. Inventory recount **73 OPEN / 47 PARTIAL /
  4 PATCHED**. This review did not re-adjudicate the other 123 IDs.
  Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named linear-glob / nested-star-timeout /
oversize-skip claim. Detector is not invalid: nested-star miss is
`false` and fast; a legal `*` ignore still hides `keep.txt`; 257 stars
do not. Evidence is sufficient for those bullets; insufficient for
gitignore compatibility, mid-path `**`, scan closure, and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
