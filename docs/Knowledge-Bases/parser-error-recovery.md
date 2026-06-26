# Galerina — Parser Error Recovery Policy

## Status

```
Phase 5 prerequisite
Source of truth for parser error handling
```

---

## Principle

The Galerina parser **collects diagnostics** rather than stopping at the first
error. Every parse failure produces a diagnostic and the parser continues
scanning. The resulting AST may contain `errorNode` entries where recovery
occurred — later compiler phases skip `errorNode` branches rather than
treating them as executable.

This matches the approach used in the lexer and the Phase 4 parser, where
each unexpected character/token emits a diagnostic and advances, rather than
aborting.

---

## ErrorNode

An `errorNode` AST entry is emitted wherever the parser could not produce a
valid node. Consumers of the AST must treat `errorNode` as non-executable
and non-emittable.

```typescript
// AstNodeKind addition for Phase 5
"errorNode"
```

```typescript
// Example errorNode
{
  kind: "errorNode",
  value: "<parse-error>",
  location: { file: "...", line: 4, column: 3 }
}
```

---

## Recovery Strategy

The parser uses **synchronisation tokens** to skip forward after an error.

### Statement-level synchronisation tokens

When a statement parse fails, the parser emits a diagnostic, produces an
`errorNode`, and skips forward until it reaches one of:

```typescript
export const STATEMENT_SYNC_TOKENS: ReadonlySet<string> = new Set([
  "}",       // end of block
  "return",  // next return statement
  "let",     // next binding
  "mut",     // next binding
  "readonly",// next binding
  "if",      // next conditional
  "match",   // next match expression
]);
```

### Declaration-level synchronisation tokens

When a top-level declaration parse fails, the parser emits a diagnostic and
skips until:

```typescript
export const DECLARATION_SYNC_TOKENS: ReadonlySet<string> = new Set([
  "flow",       // next flow declaration
  "secure",     // next secure flow
  "pure",       // next pure flow
  "type",       // next type declaration
  "enum",       // next enum declaration
  "import",     // next import
  "intent",     // next intent block
  "governance", // next governance block
  "api",        // next api block
]);
```

### Balanced-brace skip

When the parser encounters a `{` it cannot match to a known declaration or
statement form, it skips the entire balanced `{ ... }` block using the
existing `skipBalancedBraces()` method. This prevents cascading errors from
a single malformed block.

---

## Current Phase 4 Implementation

Phase 4 already implements partial recovery:

- **Lexer**: `advance()` on unknown characters, continuing scan.
- **`parseDeclaration()`**: unknown keyword → `advance()` + return `undefined`.
- **`parseStatement()`**: unknown token → `advance()` + return `undefined`.
- **`parseParamList()`**: position guard prevents infinite loop on bad token.
- **`parseEffectsDecl()`**: position guard prevents infinite loop on bad token.
- **`parseMatchArm()`**: advances on non-identifier pattern.

Phase 5 formalises and extends this with explicit `errorNode` production and
the sync-token skip loops described above.

---

## Multiple Errors per File

The parser must emit all diagnostics it encounters in a single pass. The
caller (or IDE integration) receives the full list and can display all errors
at once rather than requiring a fix-then-reparse cycle.

The Phase 4 `parser.ts` already accumulates diagnostics in a `ParseDiagnostic[]`
array and returns the full list in `ParseResult.diagnostics`. Phase 5 maintains
this contract.

---

## ErrorNode Propagation Rules

Phases downstream of the parser must follow these rules when they encounter
`errorNode`:

1. **Type checker**: skip type inference on `errorNode` subtrees.
2. **Effect checker**: skip effect propagation on `errorNode` subtrees.
3. **Value-state checker**: skip state annotation validation on `errorNode` subtrees.
4. **Code generation**: `errorNode` blocks compilation — the compiler may not
   emit executable output when any `errorNode` is present.
5. **Report generation**: `errorNode` presence is reported as a parse failure;
   partial reports may still be generated.

---

## Diagnostic Codes for Recovery Points

The parser emits one of two codes when it produces an `errorNode`:

| Code | Name | Used when |
|---|---|---|
| `SPORE-PARSE-001` | `UNEXPECTED_TOKEN` | Token is not valid in this position |
| `SPORE-PARSE-002` | `EXPECTED_FLOW_KEYWORD` | Flow qualifier not followed by `flow` keyword |

These codes are already in use in the Phase 4 parser.

---

## Examples

### Missing closing brace

Input:

```galerina
flow add(a: Int, b: Int) -> Int {
  return a
```

Behaviour:

```
SPORE-PARSE-001: Expected "}", got eof.
```

The parser emits the diagnostic and returns a `block` node with the `}`
missing; the program node is still returned.

### Malformed flow qualifier

Input:

```galerina
secure secure
```

Behaviour:

```
SPORE-PARSE-002: Expected "flow" after "secure".
SPORE-PARSE-001: Expected "flow", got "secure" (keyword).
... (cascading errors from failed parseFlowDecl)
```

The parser skips to the next declaration-level sync token (end of input in
this case) and returns the program node.

### Unknown top-level token

Input:

```galerina
!!! flow add(a: Int) -> Int { return a }
```

Behaviour:

```
SPORE-PARSE-001: Unexpected token "!" at top level.
SPORE-PARSE-001: Unexpected token "!" at top level.
SPORE-PARSE-001: Unexpected token "!" at top level.
```

The three `!` characters are each skipped individually. The `flow` keyword is
then encountered and parsed normally. The returned program includes the `add`
flow. This is the behaviour already verified by the Phase 4 test suite.

---

## Relationship to Phase 4

Phase 4 parser tests already verify recovery:

```javascript
it("recovers after an unexpected token at top level", () => {
  const result = parseProgram("!!! flow add(a: Int) -> Int { return a }", "test.spore");
  assert.ok(result.ast !== undefined);
});

it("reports SPORE-PARSE-002 when flow qualifier is not followed by flow", () => {
  const result = parseProgram("secure secure", "test.spore");
  const diag = result.diagnostics.find((d) => d.code === "SPORE-PARSE-002");
  assert.ok(diag !== undefined);
});
```

Phase 5 extends this with explicit `errorNode` production and the
synchronisation token loops.

---

## See Also

- `docs/Knowledge-Bases/operator-precedence.md`
- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `packages-galerina/galerina-core-compiler/src/parser.ts`
- `packages-galerina/galerina-core-compiler/tests/parser.test.mjs`
