# Galerina Lexer — `src/lexer.spore`

**Phase 16, Milestone 1 — updated Phase 18A/18D**

**Phase 18A:** Token interface extended — `start`/`end` byte offsets, `endLine`/`endColumn` spans, `kindId` (TokenKindId numeric enum). Slice-based identifier scanning, direct lookahead for multi-char operators. SPORE-LEX-004 (file > 10MB), SPORE-LEX-005 (line > 10k chars), SPORE-LEX-006 (> 100 diagnostics) implemented.

**Phase 18D:** `TokenKindId` numeric enum exported — numeric IDs for Keyword(1), Identifier(0), String(2), etc. Parser `current()`/`peek()` synthetic EOF tokens now include `kindId: 11`.

**Phase 25 target:** lexer.spore token-by-token parity with TypeScript lexer on all CEC examples.

## What it is

`src/lexer.spore` is the Galerina lexer written in Galerina itself. It is the first
component of the self-hosted compiler — the first proof that Galerina can describe
its own tools.

When compiled by the TypeScript bootstrapper and executed, `lexer.spore` must
produce an identical token stream to the existing TypeScript lexer (`src/lexer.ts`).

Phase 16 additions include: precise end-position tracking (`endLine`/`endColumn`
on every token), unicode escape sequences in string literals (`\uXXXX`), and
nesting depth limits for string interpolation and nested structures.

---

## Language features required from the runtime

| Feature | Source | Status |
|---|---|---|
| `while pos < n` loops | Phase 12A | ✅ Built — interpreter supports while |
| `mut` bindings with reassignment | Phase 11A.4/11 | ✅ Built — SPORE-BINDING-005/006 enforced |
| `for item in list` iteration | Phase 12A | ✅ Built — forEachStmt in interpreter |
| `String.charAt(pos)` | Stdlib | Available |
| `String.codePoints()` | Stdlib | Available |
| `Array.empty()` | Stdlib | Available |
| `Array.push()` / `Array.append()` | Stdlib | Available |
| `record` types | Phase 4 | Available |
| `match` expressions on Char | Phase 4 | Available |
| `Result<T, E>` / `Ok` / `Err` | Phase 4 | Available |
| `Option<T>` / `Some` / `None` | Phase 4 | Available |

Phase 12A blockers (while loops, mut reassignment) are resolved. The lexer.spore itself parses with 0 errors.
Primary remaining blocker: token-by-token parity verification (Phase 25 target).

---

## Token type

```galerina
record Token {
  kind: TokenKind
  value: String
  line: Int         // start line (1-based)
  column: Int       // start column (1-based)
  endLine: Int      // end line (1-based, inclusive)
  endColumn: Int    // end column (1-based, exclusive — points after last char)
  start: Int        // byte offset of token start (inclusive)
  end: Int          // byte offset of token end (exclusive — equivalent to endOffset)
                    // use source.slice(token.start, token.end) to recover raw text
}

enum TokenKind {
  Identifier
  Keyword
  StringLiteral
  NumberLiteral
  CharLiteral
  Operator
  Symbol
  Comment
  DocComment
  Newline
  Eof
  Unknown
}
```

`Token` is a pure data record — no methods, no owned resources. It is safe to
copy freely inside the `Array<Token>` return value.

`endLine`/`endColumn` give the exclusive end position of the token's last
character, matching the half-open range convention used by LSP. For single-line
tokens `endLine == line`. For a newline token, `endLine == line` and
`endColumn == column + 1`. `start`/`end` are byte offsets into the raw source
string (UTF-8 encoded).

---

## Diagnostics — SPORE-LEX codes

The lexer emits structured `LexError` values. Phase 16 formalised three codes;
Phase 18A added two more:

| Code | Name | When emitted |
|---|---|---|
| `SPORE-LEX-001` | `ExcessiveNesting` | Generic type nesting depth exceeds 8 levels |
| `SPORE-LEX-002` | `OversizedToken` | String literal or identifier exceeds 10,000 characters |
| `SPORE-LEX-003` | `InvalidUnicodeEscape` | A `\u` or `\u{}` escape is malformed or the codepoint is out of Unicode range |
| `SPORE-LEX-004` | `FileTooLarge` | Source file exceeds 10 MB, or token count exceeds 1,000,000 |
| `SPORE-LEX-005` | `LineTooLong` | A single line exceeds 10,000 characters (warning severity) |

All errors carry `line`, `col`, and a human-readable `message`. The `code` field
is a `String` holding the `SPORE-LEX-XXX` identifier so tooling can switch on it.

```galerina
record LexError {
  code: String      // e.g. "SPORE-LEX-001"
  message: String
  line: Int
  col: Int
}
```

---

## Lexer flow structure

```galerina
pure flow tokenize(source: String) -> LexerResult

contract {
  types {
    type LexerResult = Result<Array<Token>, LexError>
    type LexError = { code: String, message: String, line: Int, col: Int }
  }

  intent {
    "Tokenize Galerina source text into a stream of tokens."
  }
}
{
  mut pos: Int = 0
  mut line: Int = 1
  mut col: Int = 1
  mut tokens: Array<Token> = Array.empty()

  while pos < source.charCount() {
    let ch: Option<Char> = source.charAt(pos)

    match ch {
      None => {
        // End of source — emit Eof and stop
        let eof: Token = Token {
          kind: TokenKind.Eof
          value: ""
          line: line
          column: col
          endLine: line
          endColumn: col
          start: pos
          end: pos
        }
        tokens = tokens.append(eof)
        return Ok(tokens)
      }

      Some(c) => {
        // Character classification via match
        match c {
          ' ' | '\t' => {
            // Skip whitespace
            pos = pos + 1
            col = col + 1
          }

          '\n' => {
            let startLine = line
            let startCol = col
            let tok: Token = Token {
              kind: TokenKind.Newline
              value: "\n"
              line: startLine
              column: startCol
              endLine: startLine
              endColumn: startCol + 1
              start: pos
              end: pos + 1
            }
            tokens = tokens.append(tok)
            pos = pos + 1
            line = line + 1
            col = 1
          }

          '"' => {
            // String literal scanning with escape handling
            // ... see String literal section below
          }

          _ => {
            // Identifier, keyword, number, operator, or symbol
            // ... see dispatch section below
          }
        }
      }
    }
  }

  // Implicit EOF at end of source
  let eof: Token = Token {
    kind: TokenKind.Eof
    value: ""
    line: line
    column: col
    endLine: line
    endColumn: col
    start: pos
    end: pos
  }
  tokens = tokens.append(eof)
  return Ok(tokens)
}
```

---

## Key implementation patterns

### Character classification

```galerina
pure flow isLetter(c: Char) -> Bool {
  let cp: Int = c.codePoint()
  return (cp >= 65 and cp <= 90) or (cp >= 97 and cp <= 122) or cp == 95
}

pure flow isDigit(c: Char) -> Bool {
  let cp: Int = c.codePoint()
  return cp >= 48 and cp <= 57
}

pure flow isAlphanumeric(c: Char) -> Bool {
  return isLetter(c) or isDigit(c)
}
```

### Identifier and keyword scanning

```galerina
pure flow scanIdentifier(source: String, pos: Int, line: Int, col: Int) -> Token {
  mut end: Int = pos
  while end < source.charCount() {
    let ch: Option<Char> = source.charAt(end)
    match ch {
      None => { end = source.charCount() }
      Some(c) => {
        if isAlphanumeric(c) {
          end = end + 1
        } else {
          end = source.charCount()  // break
        }
      }
    }
  }
  let word: String = source.slice(pos, end)
  let kind: TokenKind = if KEYWORDS.contains(word) {
    TokenKind.Keyword
  } else {
    TokenKind.Identifier
  }
  return Token { kind: kind, value: word, line: line, column: col, endLine: line, endColumn: col + word.charCount(), start: pos, end: end }
}
```

Keyword detection checks if the scanned identifier matches a known keyword list.
The keyword list mirrors `V1_ACTIVE_KEYWORDS` in `src/lexer.ts`.

### String literal scanning with escape handling

```galerina
pure flow scanString(source: String, pos: Int, line: Int, col: Int) -> Result<Token, LexError>
{
  // pos is pointing at the opening "
  mut i: Int = pos + 1
  mut chars: String = ""

  while i < source.charCount() {
    let ch: Option<Char> = source.charAt(i)
    match ch {
      None => {
        return Err(LexError { code: "SPORE-LEX-001", message: "Unterminated string literal", line: line, col: col })
      }
      Some(c) => {
        match c {
          '"' => {
            // End of string literal
            return Ok(Token {
              kind: TokenKind.StringLiteral
              value: chars
              line: line
              column: col
              endLine: line
              endColumn: col + (i - pos) + 1
              start: pos
              end: i + 1
            })
          }
          '\\' => {
            // Escape sequence
            let next: Option<Char> = source.charAt(i + 1)
            match next {
              None => {
                return Err(LexError { code: "SPORE-LEX-001", message: "Incomplete escape sequence", line: line, col: col })
              }
              Some(esc) => {
                match esc {
                  'n'  => { chars = chars + "\n" }
                  't'  => { chars = chars + "\t" }
                  '"'  => { chars = chars + "\"" }
                  '\\' => { chars = chars + "\\" }
                  'u'  => {
                    // Unicode escape \uXXXX — Phase 16
                    // Validate 4 hex digits; emit SPORE-LEX-002 on failure
                    chars = chars + scanUnicodeEscape(source, i + 2).unwrapOrErr(
                      LexError { code: "SPORE-LEX-002", message: "Invalid unicode escape", line: line, col: col }
                    )
                    i = i + 4
                  }
                  _    => { chars = chars + "\\" + esc.toString() }
                }
                i = i + 2
              }
            }
          }
          _ => {
            chars = chars + c.toString()
            i = i + 1
          }
        }
      }
    }
  }

  return Err(LexError { code: "SPORE-LEX-001", message: "Unterminated string literal", line: line, col: col })
}
```

### Number literal scanning

Supports decimal, hex (`0x`), binary (`0b`), and octal (`0o`):

```galerina
pure flow scanNumber(source: String, pos: Int, line: Int, col: Int) -> Token {
  mut i: Int = pos
  let first: Option<Char> = source.charAt(i)
  let second: Option<Char> = source.charAt(i + 1)

  // Detect base prefix
  match (first, second) {
    (Some('0'), Some('x')) => { i = i + 2 }  // hex
    (Some('0'), Some('b')) => { i = i + 2 }  // binary
    (Some('0'), Some('o')) => { i = i + 2 }  // octal
    _ => { }                                   // decimal
  }

  while i < source.charCount() {
    let ch: Option<Char> = source.charAt(i)
    match ch {
      None => { i = source.charCount() }
      Some(c) => {
        if isDigit(c) or c == '_' or c == '.' {
          i = i + 1
        } else {
          i = source.charCount()  // break
        }
      }
    }
  }

  let numStr: String = source.slice(pos, i)
  return Token { kind: TokenKind.NumberLiteral, value: numStr, line: line, column: col, endLine: line, endColumn: col + (i - pos), start: pos, end: i }
}
```

---

## Checklist for `lexer.spore` to be valid Galerina

- [ ] Uses `while` loops (requires Phase 12A loop support in interpreter)
- [ ] Uses `mut` reassignment (`pos = pos + 1`, `tokens = tokens.append(tok)`) — requires Phase 11A.4/11 assignment runtime wiring
- [ ] Uses stdlib: `String.charAt`, `String.charCount`, `String.slice`, `Array.empty`, `Array.append`
- [ ] Uses `match` on `Char` for character classification
- [ ] Uses `match` on `Option<Char>` for safe single-character reads
- [ ] All functions are `pure flow` (no side effects — tokenizing is pure)
- [ ] Returns `Result<Array<Token>, LexError>` for error handling (unterminated strings, invalid escapes)
- [ ] Keyword detection via a `Set<String>` or `Array<String>` contains check
- [ ] Line and column tracking throughout

---

## Stub implementation (parses with current compiler)

This stub is valid Galerina as understood by the current parser (Phase 4+). It
will parse successfully but cannot be executed until Phase 12A loop support
lands. It serves as a placeholder that can be loaded by the bootstrapper.

Phase 16: the stub now uses the full 8-field Token record.

```galerina
pure flow tokenize(source: String) -> LexerResult

contract {
  types {
    type LexerResult = Result<Array<Token>, LexError>
  }

  intent {
    "Tokenize Galerina source text into a stream of tokens."
  }
}
{
  mut pos: Int = 0
  mut tokens: Array<Token> = Array.empty()

  // Implementation requires Phase 12A while-loop support.
  // When Phase 12A lands: replace this stub with the full scanning loop.

  let eof: Token = Token {
    kind: TokenKind.Eof
    value: ""
    line: 1
    column: 1
    endLine: 1
    endColumn: 1
    start: 0
    end: 0
  }

  return Ok(tokens.append(eof))
}
```

---

## Phase 18A optimizations (TypeScript reference implementation)

Phase 18A applied three performance and correctness improvements to `src/lexer.ts`.
These patterns should be mirrored in `lexer.spore` when the self-hosted lexer reaches
execution capability.

### Slice-based scanning

Identifier and number scanning no longer builds a value string character by character.
Instead, `advance()` moves the cursor without accumulating a string, and
`source.slice(startPos, pos)` recovers the raw text in one allocation at the end.

```
Before: value += advance()  // string concatenation on every character
After:  advance()           // cursor-only; value = source.slice(start, pos)
```

This eliminates O(n²) string growth for long tokens.

### Direct operator detection

The `TWO_CHAR_OPERATORS` array and `Array.includes()` call were replaced with
direct character-pair comparisons using `if/else` chains. This removes an array
allocation and an O(n) scan on every token boundary.

```
Before: TWO_CHAR_OPERATORS.includes(ch + peek(1))
After:  if (ch === "-" && next === ">") twoChar = "->"
        else if (ch === "=" && next === ">") twoChar = "=>"
        // ... and so on for all 9 two-char operators
```

### Safety limits (SPORE-LEX-004, SPORE-LEX-005)

Two new guards were added:

- `SPORE-LEX-004 FileTooLarge` — rejects source files over 10 MB before scanning begins.
  Also fires if the token stream exceeds 1,000,000 tokens during scanning.
- `SPORE-LEX-005 LineTooLong` — emits a warning (not an error) when a completed line
  exceeds 10,000 characters.

---

## Integration with the bootstrapper

Once `lexer.spore` passes its own tests, the bootstrapper compiles it:

```bash
galerina build src/lexer.spore --target node-js
```

The resulting module is loaded instead of `src/lexer.ts`. The CI test suite
runs the two lexers in parallel on the same inputs and diffs their token streams:

```text
lexer.ts output == lexer.spore output   => PASS
```

Any difference is a regression in the self-hosted lexer.

---

## See also

- `galerina-roadmap.md` — Phase 12 milestone overview
- `src/lexer.ts` — TypeScript reference implementation
- `docs/Knowledge-Bases/core-syntax-keywords.md` — keyword list
- `docs/Knowledge-Bases/galerina-syntax-loops-iteration.md` — loop syntax spec
- `docs/Knowledge-Bases/arrays-and-string-operations.md` — stdlib surface
