# Independent audit — comment markers in string literals do not hide ES imports

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: the package-graph scanner does not let comment markers
inside string literals hide real ES imports.

- `stripComments` copies `"`, `'`, `` ` `` string contents (and regex
  literals) verbatim, then strips `//`, `/* */`, and fungi `;;` comments.
- `IMPORT_RE` runs on the stripped source.
- Hostile: `const s = "foo // bar"; import "same-line-dep";` still
  records `same-line-dep`.
- Also: `const marker = "//"; import "hidden-dep"; const block = "/*";
  import "second-dep";`

Tests: `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs`
import `../dist/index.js`. Tests import dist.

Scan `csf_bc2637b129881b6961435a97` is **PARTIAL_THIS_TREE**. Inventory
**84 OPEN / 36 PARTIAL / 4 PATCHED** was recorded as assigned scan
context and was **not** independently re-counted here. This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32 x64. This reviewer did not rebuild. Dist is
gitignored (`packages-ts/.gitignore` `dist/`). `dist/scanner.js` mtime
(`2026-09-22T12:53:28Z`) is newer than clean-vs-HEAD `src/scanner.ts`
(`2026-09-22T08:26:47Z`). Dist is not stale vs src for this claim: both
copy `"`, `'`, `` ` `` and regex contents into `out` before skipping
`/* */`, `//`, and fungi `;;`, and both run `IMPORT_RE` on that
`stripComments` result. `stripComments` is module-private in both (not
exported from `dist/index.js`); `scanPackage` is the observable.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs`
(+10 lines: hostile same-line `"foo // bar"; import "same-line-dep"`).
`src/scanner.ts` is **clean vs HEAD** (git blob
`0052d4c78bd9ce7c1cd7652032c7530ffc099545`). Unrelated dirty on this
worktree was not this claim.

Older scan SHA `0f24ca30ef3f173c43a60c914c18b161327f2227` is **not** a
later clean producer. On that tree `stripComments` was a global regex
(`/\*[\s\S]*?\*/` then `(^|[^:])\/\/[^\n]*`) with **no** string-literal
copy, then `IMPORT_RE` ran on that stripped text. Independent contrast
of that regex (not this tree’s `scanPackage`) eats
`"foo // bar"; import "same-line-dep"` down to `const s = "foo \n` and
records **zero** specifiers. Briefing phrase “IMPORT_RE on raw file
text” is not exact: `0f24ca30` already stripped comments; it lacked
this string copy.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-devtools-package-graph/src/scanner.ts` | `9d7d5e0b3018e908ba390c6fab7596cbcfef42678d9386d1f3195cc5c2210608` |
| `packages-ts/galerina-devtools-package-graph/dist/scanner.js` | `b5a5b1d000b7587d75baf191412e07dd8f426b6f7ad4ab1fc1b343e360537388` |
| `packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs` | `6f9919b4f39c9588888c1085d1627a19e6a11ca40d508e7c20f768af767b6ce0` |

`dist/index.js` (re-export only; sha256
`5aaa4acc413f579f27535ba238ccba7f50d6d893087f5c99a30d20bbcf360be1`)
exports `scanPackage` from `./scanner.js`. Dist is untracked (not in
HEAD). HEAD test blob `61b1eea0c5a7f210679497f8f9db88c5bdc5f290` lacks
the hostile same-line case.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `stripComments` copies `"`, `'`, `` ` `` verbatim before stripping comments | src 417–436 / dist 355–374: quote branch writes delimiter + body (including `\\` escapes) to `out` and `continue`s **before** the `/*` / `//` / fungi `;;` skippers (src 437–450 / dist 375–390). Regex literals copied src 451–485 / dist 392–430. |
| `IMPORT_RE` runs on stripped source | `scanPackage` src 613 / dist 553: `raw = stripComments(readFileSync(...), isFungi)`; src 650–654 / dist 586–591: `IMPORT_RE.exec(raw)`. Not the pre-strip file bytes. |
| Hostile same-line `"foo // bar"; import "same-line-dep"` still recorded | Named test `"hostile: a same-line string containing // does not hide the following import"`; independent `same_line_double_slash` → `["same-line-dep"]`. |
| `marker = "//"` / `block = "/*"` do not hide following imports | Named test `"comment markers inside strings do not hide real imports"`; independent `marker_and_block_strings` → `["hidden-dep","second-dep"]`. |
| Commented-out import is **not** counted | Suite `"comments do not produce phantom imports"` (not in the name-pattern run); independent `commented_out_not_counted` → `[]`; `real_import_then_commented_import` → `["kept-dep"]` only. |
| Dist `stripComments` / `IMPORT_RE` match src | **CONFIRMED** same quote-first copy, same comment skip, same `IMPORT_RE` on `raw`. |
| Named node test | **3/3 pass**, `duration_ms 152.3502` |
| 124-finding scan | **not this claim** (`csf_bc2637b129881b6961435a97` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 --test-name-pattern "comment markers|same-line string" packages-ts/galerina-devtools-package-graph/tests/package-graph.test.mjs`
   → **3/3 pass**, 0 fail, `duration_ms 152.3502`.
   - `comment markers inside strings do not hide real imports` — **green** (17.0613ms)
   - `hostile: a same-line string containing // does not hide the following import` — **green** (4.9884ms)
   - `comment markers inside regex literals do not hide real imports` — **green** (5.1694ms)

Independent extra probes (eval only; temp
`%TEMP%\galerina-comment-hidden-imports-probe.mjs`, not production;
imports the same gitignored `dist/index.js` via `file://`):

- `const s = "foo // bar"; import "same-line-dep";` → `["same-line-dep"]`
- `const marker = "//"; import "hidden-dep"; const block = "/*"; import "second-dep";` → `["hidden-dep","second-dep"]`
- `// import axios from "axios";` plus `/* import lodash from "lodash"; */` → `[]`
- `import "kept-dep";` plus `// import "commented-dep";` plus `/* import "block-commented-dep"; */` → `["kept-dep"]`
- same-line single-quoted `'foo // bar'` → `["single-quote-dep"]`
- same-line template `` `foo // bar` `` → `["template-dep"]`
- regex `/http:\/\//` then `import "regex-hidden-dep"` → `["regex-hidden-dep"]`
- WAT emitter template `` `(import "${imp.module}" ...)` `` plus `import "node:fs"` → `["node:fs"]` only
- static `` `(import "env" "memory")` `` plus `import "kept-after-wat"` → `["kept-after-wat"]`

Probe printed `PROBE_OK` (9/9). Node v24.18.0.

Independent contrast of the **0f24ca30 regex** `stripComments` (temp
`%TEMP%\galerina-comment-hidden-imports-old-regex-contrast.mjs`; not
this tree’s scanner): same-line fixture strips to `const s = "foo \n`
and `IMPORT_RE` records `[]`. Raw `IMPORT_RE` on unstripped same-line
text still sees `same-line-dep`, but raw text also records commented
`axios` / `lodash`. The hide is the string-unaware comment strip, not
`IMPORT_RE` itself.

## Challenge 1 — does `stripComments` copy string contents before stripping comments?

**Yes. CONFIRMED.** Locator: src 417–436 / dist 355–374 run **before**
the `/*` (src 437) and `//` (src 443) skippers. Quote body including
`//` and `/*` is appended to `out` and the comment branches are not
entered for those characters. Named string tests and independent
same-line / marker / single-quote / template probes agree.

## Challenge 2 — does `IMPORT_RE` still miss a same-line import after `"foo // bar"`?

**No. CONFIRMED recorded.** Named hostile test expects
`["same-line-dep"]`. Independent `same_line_double_slash` matches.
Detector can go red: the 0f24ca30 regex contrast records `[]` on the
same fixture.

## Challenge 3 — is a commented-out import still counted?

**No. CONFIRMED not counted.** Independent `commented_out_not_counted`
is `[]`. Mixed `kept-dep` plus commented `commented-dep` /
`block-commented-dep` keeps only `kept-dep`. Suite
`"comments do not produce phantom imports"` asserts
`thirdpartyCount === 0` (not in the requested name-pattern run).

## Challenge 4 — does a regex literal containing `//` hide the following import?

**No. CONFIRMED recorded.** Named regex test and independent
`regex_literal` both record `regex-hidden-dep`. Dist copies regex
bodies when `canRegex` (src 451–485 / dist 392–430) after the `//`
check, so `/http:\/\//` is not treated as a line comment.

## Residuals (not findings against the named string-copy / same-line / commented-out claim)

- The scanner is still **regex-based**, not a TypeScript parser (file
  header src 34–38). Nested templates, division vs regex, unterminated
  strings, and mixed `IMPORT_RE` quotes (`["']([^"']+)["']`) remain
  outside this claim.
- WAT `(import "...")` / `(export "...")` is filtered **separately** by
  `isRealSpecifier` (src 139–143 / dist 90–95: reject `${` and a static
  group-1 match immediately preceded by `(`). Independent WAT probes
  keep the real ES import and drop the emitter strings. That filter is
  not `stripComments`.
- `stripComments` is not exported; tests and probes observe it only
  through `scanPackage` / `buildGraph`.
- Scan ID `csf_bc2637b129881b6961435a97` stays `PARTIAL_THIS_TREE`.
  Assigned inventory totals **84 OPEN / 36 PARTIAL / 4 PATCHED** were
  not re-counted. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named string-copy / same-line /
marker-in-string / commented-out-not-counted claim. Detector is not
invalid: the 0f24ca30 regex contrast hides `same-line-dep`; this tree
does not. Evidence is sufficient for those bullets; insufficient for
parser completeness, WAT-filter closure, scan closure, and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
