# Galerina — AI Ergonomics Log

Running log of friction points that make Galerina harder for an AI to read, reason
about, or write correctly — with concrete suggestions. Standing project directive:
keep Galerina as easy as possible for an AI to understand, conceptualize, and write.

Each entry: **what bit**, **why it's an AI hazard**, **suggested fix**, ranked by
how much friction it adds. Newest findings appended to the log at the bottom.

---

## High-impact

### A1 — List traversal boilerplate (`.get(i)` → `match Some/None`)
Every list loop is 6 lines of ceremony around 1 line of intent:
```
mut i: Int = 0
while i < xs.count() {
  let xOpt = xs.get(i)
  match xOpt { Some(x) => { /* work */ } None => {} }
  i = i + 1
}
```
- **Hazard:** the `None => {}` arm is dead by construction (index always in bounds);
  an Ai must generate it correctly every time and a reader must skip it. Intent is
  buried. Written 4× across two Stage-B files alone.
- **Fix:** a `for x in xs { }` that desugars to exactly this. Keeps safety (no raw
  `[i]`), removes the noise. Highest-leverage readability win.

### A2b — String-literal `match` patterns silently didn't dispatch — ✅ FIXED 2026-06-02
Discovered building gir-emitter Stage-B; root-caused and fixed same day.
- **Symptom:** `match kind { "literal" => ... "arith" => ... _ => ... }` on a String value did
  **not** dispatch — every value fell through to `_`, with wrong output and **no diagnostic**.
- **Root cause:** the parser stores a string-literal match-arm pattern as the *raw* token
  value, quotes included (`"literal"` = 9 chars) — same convention as `stringLiteral`
  expression nodes, which strip quotes at eval time via `stripStringQuotes`. But
  `matchPattern()` in `interpreter.ts` compared `subject.value` (the unquoted runtime string
  `literal`, 7 chars) against the still-quoted pattern, so it never matched.
- **Fix:** `matchPattern` now strips surrounding quotes from a quoted pattern before comparing
  (`interpreter.ts`, mirroring the `stringLiteral` eval path). Regression test:
  `tests/interpreter.test.mjs` → "Interpreter - match on string literals" (3 cases). Full
  suite 2,872 green.
- **Now safe:** `match` on string literals dispatches correctly. Chained `if x == "..."` still
  works and is fine to keep, but is no longer required.

### A2 — String escape semantics are non-standard (CORRECTNESS hazard)
Discovered building the json-parse benchmark (2026-06-02):
- `\"` inside a string literal is emitted as `\"` (backslash **kept**), not `"`.
  So `"{\"name\":\"" + n + "\"}"` yields `{\"name\":\"...\"}` — **not valid JSON**.
- `\\` in a literal: backslashes are **dropped** entirely by `.replace`/lexing.
- **Hazard:** every AI is trained on C/JS/Python escape rules and will assume `\"`
  → `"` and `\\` → `\`. Silent wrong output, not a parse error — the worst kind.
- **Fix:** make string-literal escapes follow the conventional set (`\"`→`"`,
  `\\`→`\`, `\n`, `\t`), or if intentional, document loudly + emit a diagnostic on
  `\"`/`\\` so the surprise is visible.

### A2c — `SPORE-LEX-001` generic-depth counter false-positives on `a < b` — ✅ FIXED 2026-06-02
Discovered completing the Stage-B lexer; root-caused and fixed same day.
- **Symptom:** the production lexer's generic-nesting depth guard (max depth 8) treated
  **every** `<` as opening a generic type and accumulated a **global**, never-reset counter.
  Ordinary comparison loops — `while i < srcLen { ... }` repeated 8+ times — pushed the
  count past 8 and emitted a spurious `SPORE-LEX-001 "Generic type nesting exceeds maximum
  depth"` far from the real code. Contributors were writing loop guards backwards as
  `srcLen > i` to dodge it.
- **Root cause:** `genericDepth` in `lexer.ts` was a single file-global counter, `++` on
  every `<` and `--` on every `>`, never reset.
- **Fix:** reset `genericDepth = 0` at boundaries a generic type cannot cross — newline
  token emission and the structural symbols `{`/`}`/`;` (`lexer.ts`). A genuinely deep
  single-line generic still trips the diagnostic (no newline/brace before its 9th `<`),
  so detection is preserved. Regression tests in `tests/lexer.test.mjs` (4 cases:
  cross-line comparisons quiet, `;`-separated quiet, deep single-line generic still fires,
  moderate generic quiet). All 7 operand-swap workarounds in `lexer.spore` reverted to
  natural `i < srcLen` reading order. Full suite 2,906 green.

### A2d — `'\''` and `'\\'` char literals don't parse
Hit writing the lexer's own quote/backslash detection (2026-06-02):
- `'\''` (escaped single-quote) and `'\\'` (escaped backslash) char literals fail with
  "Char literal must contain exactly one character unit." Worked around by comparing
  `c.codePoint() == 39` (quote) / `== 92` (backslash) instead of char-literal equality.
- **Hazard:** every AI assumes C/JS char-escape rules; the failure forces codepoint magic
  numbers, which are unreadable. **Fix:** support the standard escaped char literals.

### A3 — `String.replace` replaces first occurrence only
`json.replace(" ", "")` removed only the **first** space, not all.
- **Hazard:** universally, `replace` on a string-pattern is global in the languages
  an AI knows from (Python `str.replace`, JS `replaceAll`); first-only is surprising
  and produces subtly wrong results.
- **Fix:** make `.replace` global, or add `.replaceAll` and have `.replace` warn /
  be explicitly first-only by name (`.replaceFirst`).

---

### A4 — `mut p = p + 1` inside a deeply-nested `if`/`while` block silently has no effect (CORRECTNESS hazard, HIGH-IMPACT)

Discovered implementing `match` arm parsing inside the self-hosted `parseStmt` flow (2026-06-03):
- A `mut p: Int = EXPR` declared inside an `if` block, then mutated via `p = p + 1` inside a **nested** `while` → `if` → `if` block hierarchy, silently **does not update the outer `p`**. The assignment executes (no error) but the mutation is lost; the outer `p` retains its original value indefinitely.
- **Root cause:** the Galerina interpreter appears to stop propagating mutation across a certain nesting depth or block-scope boundary. Mutation one or two levels deep works; mutation at four-plus levels (while → if → if → while) does not. This was confirmed by exhaustive isolation: moving the exact same loop logic into a standalone dedicated flow with its own clean scope fixed it immediately.
- **Hazard:** silent wrong output — the loop appears to run (no error, the flow returns) but all the mutations are invisible to the outer scope, so the result is as if the loop body never executed. An AI will write natural, imperative loops with a shared `p` counter without knowing this limit exists.
- **Fix (for now):** if a loop needs to mutate a variable through more than ~2 levels of nested blocks, **extract it into a separate flow** with its own scope. The `parseMatchArms` flow is the canonical example — it took `p` out of `parseStmt`'s deeply-nested scope and gave it a clean top-level home. **Longer-term:** fix the interpreter's mutation propagation across nested scopes, or document the exact nesting depth where mutation breaks and emit a warning.
- **Workaround confirmed working:** isolate any loop with a shared mutable cursor into a standalone helper flow. Pass the starting position as a param, return the ending position + result as a record.

## Known limitations of the self-hosted Stage-B subset (documented, by-design / deferred)

Surfaced by a 3-agent review of the self-hosted modules (2026-06-02). These are NOT
bugs to fix now — they're intentional scope limits or perf characteristics of the
bootstrap subset. Documented so they don't surprise later:

- **`runtime.spore` `envLookup` is O(n), `envBind` appends → O(n²) per loop.** A long
  loop that re-`store`s accumulates bindings (last-match wins, so correctness holds) but
  slows quadratically (sum 1..800 ≈ 216s). Fine for small bootstrap programs; a real
  runtime would use a map or overwrite-in-place on reassignment.
- **Division by zero → `0`** (no trap/diagnostic) in the GIR interpreter. Documented
  semantics for the subset; a governed runtime should poison/flag instead.
- **An unresolved `call` (callee not in the flow table) → `0`** silently. The emitter/a
  link pass should reject unknown callees; the interpreter just returns the sentinel.
- **Two expression lowerers coexist in `gir-emitter.spore`:** the legacy
  `emitExprGIR`/`emitFlowExprGIR` (flat `returnExpr` → op `const`/`load`/`add`/`cmp`,
  collapsing all arithmetic to `add`) vs the real `lowerExpr` (`binop`/`unop` with true
  opcodes). The runtime only consumes the `lowerExpr` form; the legacy one is
  flow-decl/returnExpr metadata only. Keep them distinct; prefer `lowerExpr`.
- **`parser.spore` `decomposeReturn` (legacy flat `returnExpr`) misclassifies a leading
  unary** (`return -1` → `literal/Unknown`). The full `body` AST is correct
  (`unary(neg, 1)`); `returnExpr` is back-compat only — read `body` for accuracy.

## Medium-impact

### B1 — Reserved words silently invalid as identifiers
`effects` and `target` are reserved and cannot be parameter names; using them yields
a generic syntax error (hit both writing `hasEffect`, and again in effect-checker
Stage-B 2026-06-02 naming a param `effects`). Also confirmed 2026-06-02: **`block`**
is a reserved safety keyword and cannot be a `mut`/`let` variable name — using it as a
local produced a *cascade* of "Unexpected token" parse errors (the stmt-parser worker
hit this and renamed `block`→`blk`). The reserved set spans plain-English nouns an AI
will reach for as locals (`block`, `target`, `effects`).
- **Hazard:** an AI can't predict which plain-English words are reserved; the error
  doesn't name the cause. Worse, a reserved param name produces a **cascade** of ~4
  misleading `SPORE-PARSE-001` errors ("Expected parameter name, got ...", "Expected type
  name, got ,") that point at the wrong tokens — none says "reserved word". And because
  the broken parse leaves the flow undefined, the interpreter then runs it as a silent
  no-op (empty result) rather than crashing — a probe that only checks "did it run" passes
  while doing nothing. Only the 0-parse-errors assertion catches it.
- **Fix:** allow contextual keywords as identifiers in param position, or emit
  "`effects` is a reserved word here" pointing at the actual identifier token.

### B2 — `let`-shadow vs `mut`-reassign is a silent correctness trap
`if c { let x = ... }` shadows instead of mutating the outer `x`; parses clean, runs
wrong (this was the real runtime.spore cache bug).
- **Hazard:** AIs trained on Rust/JS reach for `let` here.
- **Fix:** warn when a block-local `let` shadows an outer binding of the same name
  that is later read.

---

## Confirmed-good (keep)

- `.count()` / `.get(i)` returning `Some/None` is a sound, safe accessor — the issue
  is only the ceremony (A1), not the safety model.
- `split` / `length` match JS/Python semantics exactly — reliable, checksum-faithful
  across runtimes (basis of the json-parse benchmark's bit-for-bit checksum).
- `match` over `else if` (SPORE-SYNTAX-010) reads cleanly once learned — works for
  enum/`Some`/`None` variants AND string literals (the string-literal dispatch bug was
  fixed 2026-06-02, see A2b).
- **Recursion works** — recursive `flow`s (e.g. `fib`, `sumTo`) and **mutually**
  recursive flows (`parsePrimary` ↔ `parseExpr`) execute correctly (proven 2026-06-02
  building the self-hosted body parser). Enables real recursive-descent parsers in `.spore`.
- **Self-referential record types work** — `record Expr { children: Array<Expr> }` /
  `record Stmt { body: Array<Stmt> }` parse and a recursive flow can walk the nested
  tree (proven 2026-06-02). Real nested ASTs are expressible in self-hosted Galerina.
- Single-char operators (`< > + - * /`) and punctuation (`( ) , : = { }`) arrive as
  **Symbol** tokens; only two-char operators (`== != <= >= ->`) are **Operator** tokens.
  So lexer-token dispatch must match on `tok.value`, not `tok.kind`, for these. (Not a
  bug — just a sharp edge worth stating once; both M-A workers independently hit it.)

---

## Log

| Date | Finding | Source task |
|---|---|---|
| 2026-06-02 | A1, B1, B2 surfaced writing governance-verifier + runtime Stage-B | self-hosting push |
| 2026-06-02 | A2, A3 surfaced writing json-parse benchmark | benchmark expansion |
| 2026-06-02 | A2b (string-literal match no-dispatch), B1 cascade detail surfaced writing effect-checker + gir-emitter Stage-B (parallel workers) | self-hosting push S2+S3 |
| 2026-06-02 | A2b root-caused (matchPattern didn't strip pattern quotes) and FIXED; regression test added | interpreter fix |
| 2026-06-02 | A2c (SPORE-LEX-001 false positive on `a < b`), A2d (escaped char literals) surfaced completing lexer S5 | self-hosting push S5+S6 |
| 2026-06-02 | A2c root-caused (global genericDepth never reset) and FIXED; +4 regression tests; 7 operand-swap workarounds reverted | interpreter/lexer fix |
| 2026-06-02 | B1 extended (`block` reserved); confirmed recursion + self-referential record types work; Symbol-vs-Operator token note | M-A body parser |
| 2026-06-03 | **A4** — `p = p + 1` inside deeply-nested if/while blocks silently doesn't update outer `p`; fix = extract into a standalone flow | R6 match parsing |
