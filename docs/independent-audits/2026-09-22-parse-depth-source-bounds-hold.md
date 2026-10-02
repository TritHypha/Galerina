# Independent audit — unary-prefix PARSE-DEPTH + compiler source intake bound

**Verdict: PASS** (scoped to the two named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claims:

1. Unary-prefix chains cannot bypass `FUNGI-PARSE-DEPTH-001`
   (`parsePrefixExpression` increments `exprDepth`). A 300-long `!` chain
   is refused. Shallow `-1` is not.
2. `compileFile` / `readBoundedSource` stats file size before
   `readFileSync` and refuses sources larger than
   `MAX_COMPILER_SOURCE_BYTES` (10 MiB).

Lexer `--` vs unary `-`, and TOCTOU between `stat` and `read` (post-read
length check remains), are residuals — not findings against the named
claims. This is **not** 124-scan closure. JSON-Decimal, OAuth, durable
replay, signing, and `.fungi` admission were not started.

Node v24.18.0, npm 12.0.2, Windows NT 10.0.19045. Tests import `dist/`.
`dist/parser.js` and `dist/cli.js` mtimes are newer than the dirty
`src/cli.ts` and contain the prefix-depth increment and
`statSync`-before-`readFileSync` bound. This reviewer did not rebuild.

`src/parser.ts` is **identical to HEAD**. Dirty paths on this slice:
`M` `src/cli.ts` (export of `MAX_COMPILER_SOURCE_BYTES` only);
untracked `tests/parse-depth-and-source-bounds.test.mjs`. Unrelated dirty
`src/index.ts` (WAT/runtime re-exports) is outside these claims. Passing
tests here are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/parser.ts` | `3c4f8cbcbbd569d5d151a35ed7274950375f58b9d75318ae08c29e857474041b` |
| `packages-ts/galerina-core-compiler/src/cli.ts` | `fd6cf161f2d0986eb99b64ff459926b38c419b3ceacf9b19e663797ce1878436` |
| `packages-ts/galerina-core-compiler/tests/parse-depth-and-source-bounds.test.mjs` | `eb1459993f1bcb1ab37b21e86b1f0b12668736bbb43a7fd154882f720b2c5740` |
| `packages-ts/galerina-core-compiler/dist/parser.js` | `7d1607e730a599e9345459511d12371e5930d3fe1d0e3bba3d9395e7ffac8afd` |
| `packages-ts/galerina-core-compiler/dist/cli.js` | `2cb9a37b00bdc5179cf5154683d9639d7c8c9420bd257d269fa459e5d8347703` |
| `packages-ts/galerina-core-compiler/src/lexer.ts` | `ca547d78beee3d9967c6b72a6d14ccc8dea25168a789d11d91bb5afaa2d1dfd9` |
| `packages-ts/galerina-core-compiler/dist/index.js` | `aa1d0a517aaa298ee40d5c32f18146cd875b68477b3f846c3e1ac0017eecfe5f` |

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Prefix `!` / unary `-` increments `exprDepth` per operator | source `parser.ts` `parsePrefixExpression` 2737–2760; dist `parser.js` 2100–2118 |
| Combined depth shares `MAX_EXPR_DEPTH` 256 with `parseExpression` / `parseBlock` | source 413, 1476–1512, 2416–2507; dist 82, 996–1023, 1832–1899 |
| 300-long `!` chain emits `FUNGI-PARSE-DEPTH-001` | executed suite + independent probe `CHAIN300` |
| Shallow `-1` does not emit PARSE-DEPTH | executed suite + independent `SHALLOW_MINUS` |
| `ParseAborted` is fail-closed (diagnostic already recorded) | source `parseProgram` 488–495 |
| `readBoundedSource` `statSync` then refuse `!isFile` or `size > 10 MiB` before `readFileSync` | source `cli.ts` 409–420; dist `cli.js` 258–268 |
| `compileFile` maps that throw to error diagnostic | source 423–441; executed huge-file test |
| Post-read `source.length` ceiling | source 417–419; **not independently red-tested** (stat fires first on MAX+1) |
| Hostile: source larger than 10 MiB refused | suite + independent `HUGE` size 10485761, `FUNGI-BACKEND-001` |
| Lexer `--` is not a two-char operator | source `lexer.ts` 798–818; independent `--1` is two unary minuses, no PARSE-DEPTH |
| TOCTOU between stat and read | residual; post-read length check remains |
| 124-finding scan | **not this claim** |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-compiler/tests/parse-depth-and-source-bounds.test.mjs`
   → **3/3 pass**, `fail 0`, `duration_ms 318.0119`.
   - shallow unary minus still parses without PARSE-DEPTH — **green** (2.9422ms).
   - hostile 300-long unary-not chain refused as PARSE-DEPTH-001 — **red detector** (0.7595ms).
   - `compileFile` refuses a source larger than the intake ceiling — **red detector** (8.1094ms).

Independent extra probes (`%TEMP%\galerina-parse-depth-probe.mjs`; not production; imports this tree’s `dist/`):

- `return -1` → `depth: false`, no diagnostics.
- `"!".repeat(300)` → `FUNGI-PARSE-DEPTH-001` only.
- `"!".repeat(256)` → PARSE-DEPTH. `"!".repeat(255)` → PARSE-DEPTH.
  `"!".repeat(254)` → no PARSE-DEPTH. Matches block(+1) + expression(+1)
  + N prefix increments against `MAX_EXPR_DEPTH` 256 (`N+2 > 256` ⇒
  refuse at N=255).
- `"-" .repeat(300) + "1"` → PARSE-DEPTH (unary-minus chain is not a bypass).
- `return --1` → no PARSE-DEPTH (two unary minuses; lexer does not emit `--`).
- `Buffer.alloc(MAX+1)` → `stat.size` 10485761, diagnostic
  `FUNGI-BACKEND-001` / `source exceeds the 10485760-byte compiler intake ceiling`.
- Small `ok.fungi` with `return -1` → **no** intake-ceiling diagnostic
  (fails `FUNGI-SYNTAX-015` missing `@version`, unrelated).

## Challenge 1 — can a unary-prefix chain bypass PARSE-DEPTH-001?

**No on this parser. CONFIRMED closed for `!` / unary `-` chains.**

Locators: `parser.ts` 2737–2760 (increment **after** consuming `!` or
`-`, recurse `parsePrefixExpression`, `try/finally` decrement);
`parseExpression` 2421 / `parseBlock` 1482 share the same counter;
abort at 488–495.

Without the prefix increment, a 300-`!` chain would only cost the
expression (+ block) frames and would sit under 256. Dist
`parser.js` 2107 has the same `++this.exprDepth`. Independent 300-`!`
and 300-`-` both emit `FUNGI-PARSE-DEPTH-001`. Shallow `-1` does not.

## Challenge 2 — does `compileFile` read unbounded sources?

**No on the `statSync`-before-`readFileSync` path. CONFIRMED for files
larger than 10 MiB at stat time.**

Locators: `cli.ts` 409–420; `compileFile` 423–441; dist `cli.js`
258–273. Dirty delta vs HEAD is **only** `export` of
`MAX_COMPILER_SOURCE_BYTES` (tests import it). The bound itself is at
HEAD. Independent MAX+1 file is refused as `FUNGI-BACKEND-001` with the
intake-ceiling message. Small file is not refused on that axis.

## Challenge 3 — can the detectors go red?

**Yes. CONFIRMED.** Hostile 300-`!` asserts PARSE-DEPTH present.
Hostile MAX+1 file asserts `/intake ceiling|Cannot read file/` and
`severity === "error"`. Both passed. Happy-path `-1` is the
discriminating negative for claim 1.

## Residuals (not findings against the named claims)

- Lexer `--` is **not** a two-character operator (`lexer.ts` 798–818
  has `->`, `=>`, `==`, `!=`, `<=`, `>=`, `&&`, `||`, `..` only).
  `--1` is two unary `-` tokens. That is a language-shape residual,
  not a depth bypass (two levels; independent `--1` did not trip
  PARSE-DEPTH). Comments are `//`, not `--`.
- TOCTOU remains between `statSync` and `readFileSync`. A swapped
  larger file is still fully decoded before the post-read
  `source.length` check. That check is JS string length, not byte
  length; it was **not** independently red-tested because the MAX+1
  fixture is refused at stat. Named claim is the pre-read stat.
- `loadCheckConfig` still uses unbounded `readFileSync` for JSON
  config candidates (`cli.ts` ~133). Out of the `.fungi` /
  `compileFile` claim.
- `flip(` / `all {` / `any {` prefix forms do not increment the
  unary counter; they call `parseExpression`, which does. Out of the
  named `!`/`-` chain claim.
- `parseExpression` decrements `exprDepth` on the normal-return path
  only (2506); `ParseAborted` stops the file, so a leaked counter
  does not continue the parse.
- 124-finding scan remains a separate open programme.
  Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claims. Detector is not invalid:
300-`!` turns PARSE-DEPTH red; MAX+1 turns intake-ceiling red;
shallow `-1` stays green. Evidence is sufficient for this dirty-tree
parser + `compileFile` intake bound; insufficient for scan closure,
config-file intake, and TOCTOU-proof byte accounting after a swapped
read.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
