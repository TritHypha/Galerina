# Independent audit — Lexer FUNGI-LEX-005 line bounds (EOF + block-comment `\n`)

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: lexer `FUNGI-LEX-005` (`MAX_LINE_LENGTH` 10_000, exclusive
`>`) is applied on (1) a completed `\n` in the main scanner, (2) a `\n`
inside `/* */` block comments, and (3) EOF for the last line, including
last lines with no trailing newline. So: 10001 spaces with no newline;
`//` + 10001 chars with no newline; `/*` + 10001 chars + newline + `*/`
all emit `FUNGI-LEX-005`. A newline-terminated 10001-char line still
emits it. A 10000-char line does not.

Hostile acceptance (named): the three hostiles above, plus the
newline-terminated 10001-space line. Existing
`lexer.test.mjs` LEX-005 cases stay green.

This is **not** 124-scan closure. Production admission was not requested
and is not granted. Scan `csf_554dd888b982b37741c01b17` stays
`PARTIAL_THIS_TREE`. Inventory after this slice (authoritative count
from the slice handoff, not re-tallied here): 95 OPEN / 25 PARTIAL /
4 PATCHED_AUDIT_PENDING (124 IDs).

Node v24.18.0. Named line-bounds tests import `../dist/lexer.js`
(gitignored dist). Existing `lexer.test.mjs` imports `../dist/index.js`.
`dist/lexer.js` mtime (`2026-09-23T02:44:16.0986748+01:00`, 40664 bytes)
is newer than dirty `src/lexer.ts`
(`2026-09-23T02:44:08.2512217+01:00`, 41781 bytes) and contains the same
`emitLineTooLong` helper plus the three call sites. This reviewer did
not rebuild.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-compiler/src/lexer.ts` (helper + block-comment
`\n` check + EOF check; removed redundant `lineStartPos = pos` after
block-comment `advance()`) and untracked
`packages-ts/galerina-core-compiler/tests/lexer-line-bounds.test.mjs`.
`dist/lexer.js` is gitignored (`packages-ts/.gitignore:5:dist/`). The
worktree is dirty with many unrelated paths from other slices; those
were not used as evidence for this claim. Passing tests here are **not**
production admission.

HEAD `src/lexer.ts` (main-`\n`-only LEX-005) sha256
`62c613d4ebc2b75989a60b9fc2e3dbe16a1df87f740d6ac821604425ab64741b`.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/lexer.ts` | `6583f579d3df031ac0dc43610f7d9aa03b19d0af69891fae8c169cd5a5cd2788` |
| `packages-ts/galerina-core-compiler/dist/lexer.js` | `c413e225510f1e8b1364125b1b47cc7a2ad178c550c34800b706c92c38a182c0` |
| `packages-ts/galerina-core-compiler/tests/lexer-line-bounds.test.mjs` | `ee4bf2b0b78bd00c107137552c3b7a77eecee0792cf5103b5c6e76ea782a3ac8` |

Author hashes match (certutil). Dist is not stale vs this dirty src.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| helper `emitLineTooLong(completedLine, length)` fires iff `length > 10_000` | source `lexer.ts` 334–344; dist `lexer.js` 246–256; `severity: "warning"` |
| main scanner `\n` calls it | source 507–509; dist 376–378 `emitLineTooLong(startLine, startPos - lineStartPos)` |
| block-comment `\n` calls it (previously skipped the main newline branch) | source 535–538; dist 404–407 `emitLineTooLong(line, pos - lineStartPos)` then `advance()` |
| EOF calls it for the last line, including no trailing newline | source 962–964; dist 752–754 `emitLineTooLong(line, pos - lineStartPos)` |
| `;;` / `//` / `///` / `//fungi:` consume until `\n` then rely on main `\n` or EOF | source 548–584, 858–864; dist 417–443 and gov-comment loop. None of these consume the newline. |
| 10001 spaces + newline → LEX-005 | named test; independent probe |
| 10001 spaces, no newline → LEX-005 | named hostile; independent probe; HEAD-shaped miss |
| 10000 spaces, no newline → no LEX-005 | named claim; independent probe (exclusive `>`) |
| `//` + 10001 `x`, no newline → LEX-005 | named hostile; independent probe; comment token still emitted (`len` 10003) |
| `/*` + 10001 `x` + newline + `*/` → LEX-005 | named hostile; independent probe; HEAD-shaped miss |
| newline-terminated 10000-char line does not emit | existing `lexer.test.mjs`; independent 10000 spaces + `\n` |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-compiler/tests/lexer-line-bounds.test.mjs packages-ts/galerina-core-compiler/tests/lexer.test.mjs`
   → **68/68 pass**, 0 fail, `duration_ms 372.5577`.
   - `a newline-terminated line over 10000 characters emits FUNGI-LEX-005` (3.0584ms)
   - `hostile: last line over 10000 characters without a newline still emits FUNGI-LEX-005` — **red detector** (0.6289ms)
   - `hostile: a line comment over 10000 characters without a newline still emits FUNGI-LEX-005` — **red detector** (0.6552ms)
   - `hostile: a block comment line over 10000 characters still emits FUNGI-LEX-005` — **red detector** (0.6999ms)
   Remaining `lexer.test.mjs` green, including the Phase 18A LEX-005 pair
   (`"a".repeat(10_001) + "\n"` emits; `"a".repeat(10_000) + "\n"` does
   not). Those existing cases are newline-terminated and would also pass
   on HEAD’s main-`\n`-only check.

Independent extra probes (`%TEMP%\galerina-lexer-line-bounds-probe.mjs`;
not production; imports this tree’s `dist/lexer.js`):

- 10001 spaces + newline → LEX-005 warning, `Line 1 exceeds maximum length (10,000 characters).`; tokens `newline,eof`
- 10001 spaces, no newline → LEX-005; tokens `eof`
- 10000 spaces, no newline → no LEX-005; tokens `eof`
- 10000 spaces + newline → no LEX-005; tokens `newline,eof`
- `//` + 10001 `x`, no newline → LEX-005; comment token length 10003 still emitted
- `//` + 10001 `x` + newline → LEX-005; comment + newline + eof
- `/*` + 10001 `x` + newline + `*/` → LEX-005; tokens `newline,comment,eof`; comment length 10006 still emitted
- `///` + 10001 `x`, no newline → LEX-005; `docComment` length 10004 still emitted
- `;;` + 10001 `x`, no newline → LEX-005; `govComment` length 10003 still emitted
- `//fungi:` + 10001 `x`, no newline → LEX-005; `genComment` length 10009 still emitted
- identifier 10001, no newline → LEX-005 **and** `FUNGI-LEX-002`; identifier token length 10001 still emitted
- typed content block `html <<END\n` + 10001 `x` + `\nEND\n` → **no LEX-005** (residual; `scanContentBlock` consumes newlines via `advance()` and never calls `emitLineTooLong`)

HEAD-shaped reconstruction (local replica, not production; LEX-005 only
on a non-block-comment `\n`; no EOF check):

| input | current dist | HEAD-shaped |
|---|---|---|
| 10001 spaces + newline | emit | emit |
| 10001 spaces, no newline | emit | **miss** |
| `//` + 10001 `x`, no newline | emit | **miss** |
| `/*` + 10001 `x` + newline + `*/` | emit | **miss** |

That is the claimed 3/4 hostile miss on a main-`\n`-only check. This
reviewer did not time-travel to a pre-`tsc` dist; the reconstruction is
the HEAD source shape (`git diff` shows the check lived only in the
main `\n` branch at `91b4dec0`).

## Challenge 1 — 10001 spaces with no newline still silent?

**No. CONFIRMED emit** as `FUNGI-LEX-005` warning at EOF. Locator:
source 963; dist 753. Named hostile and independent probe both emit.
HEAD-shaped reconstruction misses.

## Challenge 2 — `//` + 10001 chars with no newline still silent?

**No. CONFIRMED emit.** `//` consumes until `\n` then the EOF check
fires (`pos - lineStartPos === 10003`). Comment token is still emitted
(tokenization continues). HEAD-shaped reconstruction misses.

## Challenge 3 — `/*` + 10001 chars + newline + `*/` still silent?

**No. CONFIRMED emit** on the block-comment `\n` (source 535–536).
Without that call, `advance()` would reset `lineStartPos` and EOF would
only see `*/`. HEAD-shaped reconstruction misses. Discriminating
10000-space last line (with or without newline) does not emit.

## Challenge 4 — newline-terminated 10001-char line still emit? 10000 does not?

**Yes / yes.** Main `\n` path (source 507–509). Named first test,
existing `lexer.test.mjs` LEX-005 pair, and independent 10001/10000
space probes agree. Bound is exclusive `> 10_000`.

## Residuals (not findings against the named four)

- `FUNGI-LEX-005` is still `severity: "warning"`. Tokenization continues.
  Huge comments and identifiers are still emitted (`//` comment length
  10003; block comment 10006; identifier 10001 also raises LEX-002).
- Typed content blocks skip LEX-005: `scanContentBlock` walks with
  `advance()` and never calls `emitLineTooLong`. Independent probe
  `html <<END` + 10001 `x` + closer emitted **zero** LEX-005. Outside
  the named claim; remaining hole in line-length coverage.
- `emitLineTooLong` `diagnostics.push`es directly and does not go
  through `diag()`’s `MAX_DIAGNOSTICS` / `FUNGI-LEX-006` cap. HEAD
  already pushed LEX-005 that way on the main `\n` branch.
- `\r` is whitespace and counts toward line length before `\n` (CRLF
  is slightly stricter). CR-only last lines are covered only by EOF.
- This is not Astra. This is not production admission. Scan
  `csf_554dd888b982b37741c01b17` stays `PARTIAL_THIS_TREE`. Inventory
  95 OPEN / 25 PARTIAL / 4 PATCHED_AUDIT_PENDING (124 IDs) is the slice
  handoff count; this review did not rewrite `findings.json`.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named main-`\n` / block-comment-`\n` / EOF
claim. Detector is not invalid: the three hostile tests `assert.equal`
true. Evidence is sufficient for those three emits, the
newline-terminated 10001 emit, the discriminating 10000-char non-emit,
and the HEAD-shaped 3/4 miss; insufficient for fail-closed (warning +
token still emitted), content-block line coverage, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
