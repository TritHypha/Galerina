# Galerina — Lexer Optimization Roadmap

## Status

```
Phase 18 — Implementation plan
Current lexer: hand-written, cursor-based, deterministic — already good for Stage A
Improvements: allocation reduction, span completion, safety limits, keyword enum
Self-hosting goal: lexer.spore must produce identical token stream
```

## What the Current Lexer Does Well

- Hand-written, simple, deterministic, easy to audit
- Cursor loop over source text with line/column/offset tracking
- Diagnostics, doc comments, unicode escapes, nesting depth limits
- Already boring — the best kind of lexer

## Safe Improvements Now (Phase 18A)

### 1. Replace Regex Hot Paths with Direct Character Checks

Current uses regex for classification:
```js
/^[A-Z]/    // type identifier detection
/^\d+(ms|s)$/  // duration suffixes
```

Replace with direct char/suffix checks:
```ts
function isUpperAscii(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}
function hasDurationSuffix(value: string): boolean {
  return value.endsWith('ms') || value.endsWith('s') || value.endsWith('m');
}
```

Less allocation, no regex engine overhead, easier to self-host in lexer.spore.

### 2. Replace String-Building with Slice

Current `consumeWhile()` appends character-by-character to a string.
Better: record start offset, advance to end, slice once:

```ts
const start = pos;
while (pos < source.length && predicate(source[pos])) pos++;
return source.slice(start, pos);
```

Same result, fewer intermediate allocations.

### 3. Replace Multi-Char Operator `.find()` with Lookahead

Current checks multi-char operators with array `.find()` on every unknown character.
Better: switch on current + next character:

```ts
if (char === '-' && next === '>') { /* arrow */ }
if (char === '=' && next === '>') { /* fat arrow */ }
if (char === '=' && next === '=') { /* equality */ }
```

Avoids repeated array iteration on every token.

### 4. Add endLine / endColumn / endOffset

Already have `endLine` and `endColumn` from Phase 16A lexer improvements ✅.
Add `endOffset` (byte position after last character) to complete the span.

### 5. Lexer Safety Limits (SPORE-LEX-*)

Already implemented: SPORE-LEX-001 (nesting), SPORE-LEX-002 (token length), SPORE-LEX-003 (unicode escape) ✅.

Add remaining limits:
- Max file size (e.g. 10MB) → SPORE-LEX-004
- Max line length (e.g. 10,000 chars) → SPORE-LEX-005
- Max total token count (e.g. 1,000,000) → SPORE-LEX-006

### 6. TokenKind Numeric Enum (Internal)

Keep readable token objects for diagnostics/tests. Add internal compact form:

```ts
const enum TokenKindId {
  Keyword   = 0,
  Identifier = 1,
  String    = 2,
  Number    = 3,
  // ...
}
```

Parser can compare numbers instead of strings. Bridge:
- `lexer.ts` → readable Token objects (current)
- Token objects gain `kindId: TokenKindId` for fast parser comparison

## Bigger Improvements Later (Phase 19+)

### Compact Token Stream

```text
kind[]:        Int32Array (TokenKindId per token)
startOffset[]: Int32Array
endOffset[]:   Int32Array
line[]:        Int32Array
column[]:      Int32Array
```

Benefits: less GC, better parser cache locality, faster Stage B compiler.
Keep readable tokens until parser and diagnostics are stable.

### Keyword Interning

```ts
const KEYWORD_IDS = Object.freeze({
  flow:     KeywordId.Flow,
  contract: KeywordId.Contract,
  effects:  KeywordId.Effects,
});
```

Helps parser speed and AI graph output. Replaces Set<string> keyword lookup.

## Keyword Table Cleanup

Split into explicit categories:

```ts
V1_ACTIVE_KEYWORDS    // current active set ✅
V1_FUTURE_RESERVED    // planned future syntax
V1_DEPRECATED_RESERVED // no longer aligned with philosophy
```

Review candidates for `DEPRECATED_RESERVED`:
- `global_mutation` — conflicts with no-monkey-patching rule
- `hot_reload` — runtime mutation concept, against Galerina philosophy
- Any keywords that imply hidden runtime state changes

## Legacy Cleanup

- `req` compatibility → keep `request`/`req` dual-key in route-dispatcher.ts for compatibility, but all docs/examples use `request: Request` only
- `with effects [...]` → **hard error** (SPORE-SYNTAX-LEGACY-001); the parser rejects this form. Canonical form is `contract { effects {} }`. No source file may use `with effects [...]`.

## Implementation Order

```
Phase 18A:
  1. Replace regex classification with char/suffix checks
  2. Replace consumeWhile() string building with slice
  3. Replace multi-char operator .find() with lookahead
  4. Add endOffset to Token interface
  5. Add SPORE-LEX-004/005/006 (file size, line length, token count limits)
  6. Add TokenKindId internal enum

Phase 19:
  7. Compact Int32Array token stream (additive, keep readable objects)
  8. Keyword enum interning

Stage B (ongoing):
  9. lexer.spore produces identical token stream to TypeScript lexer
  10. lexer.spore handles all 9 token kinds correctly
```

## Final Principle

```
The Galerina lexer should be deterministic, bounded, span-rich,
allocation-light, and boring.

That improves speed, security, IDE tooling, AI repair, and Stage B
self-hosting without weakening Galerina's governance model.
```

## See Also

- `galerina-lexer-spore.md` — self-hosted lexer specification
- `src/self-hosted/lexer.spore` — Stage B Milestone 1 (executing)
- `galerina-performance-roadmap.md` — broader performance roadmap
</content>
</invoke>