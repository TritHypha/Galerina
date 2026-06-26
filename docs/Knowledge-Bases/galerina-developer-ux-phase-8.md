# Galerina Developer Experience Improvements — Phase 8

## Status

```text
Phase 8 implementation targets
Adopted: all three
Priority: High
```

## TL;DR
- Parser error recovery: skip to safe boundary after error so developers see all errors at once
- Source spans with end-column: enables IDE underline squiggles and precise AI patches
- `galerina explain <flowName>`: reads GIR and produces plain-English governance explanation

---

## 1. Parser Error Recovery

### Current problem

The parser often emits one diagnostic and then produces a broken AST. Developers
must fix errors one at a time and recompile.

### Recommended recovery strategy

When the parser hits an error, skip to the next safe boundary:
- newline
- `}` (closing brace)
- flow/route/fn/let/mut/readonly/return/match keywords

This allows parsing to continue and produces a batch of diagnostics.

### Phase 8 implementation

Add `recoverUntil(tokens: string[])` to the Parser class. Each statement parser
section should call `recoverUntil` on error before returning.

---

## 2. Source Spans with End Column

### Current limitation

Diagnostics have `SourceLocation` with start line and column, but no end column.
IDEs cannot draw precise underline squiggles.

### Recommended extension

```typescript
interface SourceSpan {
  startLine:   number;
  startColumn: number;
  endLine:     number;
  endColumn:   number;
}
```

### Phase 8 implementation

The lexer already has `Token.start` and `Token.end` byte offsets. Convert these
to line/column positions. Pass `endColumn` through to `ParseDiagnostic`,
`TypeDiagnostic`, `ValueStateDiagnostic`, and `EffectDiagnostic`.

---

## 3. `galerina explain <flowName>`

### Purpose

Reads the GIR output and produces a plain-English explanation of what a flow
is allowed to do — governance, effects, protected values, and audit.

### Example output

```text
Flow: createPatient
Kind: secure flow
Intent: Create a patient record with protected PII handling.
Allowed effects:
  - database.write
  - audit.write
Protected values:
  - email: protected Email (validated, redacted before audit)
Unsafe inputs:
  - rawEmail from request.body.email
Audit:
  - AuditLog.write used
  - email redacted before audit
Status: compliant
```

### Implementation

Buildable now with the existing GIR emitter. The command reads the GIR YAML
and renders it as text. No re-parsing of source code required.

### JSON mode

```bash
galerina explain createPatient --json
```

Returns the GIR JSON directly, suitable for AI tool consumption.

---

## See Also

- `docs/Knowledge-Bases/galerina-compiler-pipeline.md`
- `docs/Knowledge-Bases/galerina-gir-schema.md`
- `docs/Knowledge-Bases/ast-value-encoding.md`
