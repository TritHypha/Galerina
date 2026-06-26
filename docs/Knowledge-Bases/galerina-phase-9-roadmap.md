# Galerina Phase 9 Roadmap

## Status

```
Phase 8A/8B: complete
Phase 9A: next — async runtime, remaining type inference, stdlib finalization
Phase 9B: self-hosting foundations — lexer and parser written in Galerina
```

## TL;DR
- Phase 9A completes the TypeScript runtime (async interpreter, full type inference, stdlib finalization)
- Phase 9B proves self-hosting by rewriting the lexer and parser in Galerina
- Stage B target: same input → Stage A output === Stage B output

---

## Phase 9A — TypeScript Runtime Completion

**Goal:** A fully functional TypeScript runtime at ~95%

### 9A-1: Async Interpreter

**Decision:** `executeFlow` becomes `async`. All effectful host calls return `Promise<Result<T,E>>`.

```typescript
// Current (sync)
executeFlow(name, args, ast, flows): FlowExecutionResult

// Phase 9A (async)
executeFlow(name, args, ast, flows): Promise<FlowExecutionResult>
```

**Flow qualifier rules for async:**
- `pure flow` — no await, no effects, remains logically sync
- `guarded flow` — may await effectful operations
- `secure flow` — may await effectful operations with governance checks
- `fn` — no effects, no await

**Sync HTTP** — allowed only as dev/test mock adapter. Network stubs become real async `fetch()`.

**Implementation order:**
1. Change `executeFlow` return type to `Promise<FlowExecutionResult>`
2. Make `evalCall` async
3. Replace network stubs with real `fetch()` calls
4. Update `runtime.ts` and `route-dispatcher.ts` to await

### 9A-2: Full Expression Type Inference (Phase 8B continuation)

**Goal:** SPORE-TYPE-003 (branded type enforcement) + complete expression propagation

**Branded type enforcement:**
- Track `type Email = Brand<String, "EmailAddress">` in collectDeclarations
- In assignment checking: `let email: Email = rawString` → SPORE-TYPE-003
- Requires parser to capture type alias bodies (currently uses skipBalancedBraces)

**Priority:** Fix parser's `parseTypeDecl` to capture alias body (the `= Brand<...>` part), then use it in type checker.

### 9A-3: Standard Library Finalization

**Remaining stdlib gaps:**
- `Decimal` arithmetic precision — replace `parseFloat` with arbitrary-precision library
- `Channel<T>` — async message passing (needs async interpreter)
- `Bytes.sha256()` — hashing via node:crypto
- `String.format()` with named interpolation `{name}` not just `{}`
- `Timestamp.format(pattern)` — ISO/custom formatting
- Complete `Duration` arithmetic edge cases (negative durations, rounding)

### 9A-4: Route Hardening

**Remaining route gaps:**
- Auto-JSON body parsing (Content-Type: application/json → auto-decode to record)
- Response type validation against declared route response type
- CORS preflight handling
- `X-Request-Id` header injection
- `permission` clause enforcement

### 9A-5: Governance/Proof Chain Completion

**Remaining proof chain gaps:**
- SPORE-GOV-003 (protected data without authority) — requires expression type inference
- SPORE-GOV-005 (policy purpose mismatch) — requires intent/behavior analysis
- Proof chain wired into `serve()` per-request
- SHA-256 over actual persisted JSONL audit file (not just in-memory events)

---

## Phase 9B — Self-Hosting Foundations

**Goal:** Prove Galerina can describe its own syntax by rewriting lexer and parser in Galerina.

**Decision (recorded):** Stage B targets lexer + parser first, not the entire compiler.

### Stage B1: Lexer in Galerina

Rewrite `src/lexer.ts` as Galerina source.

Key characteristics that make the lexer a good first target:
- Purely functional — takes a string, returns tokens
- No effectful operations
- Well-specified (V1_ACTIVE_KEYWORDS is already a formal list)
- Testable by comparing output against the TypeScript lexer

```galerina
pure flow lex(source: String, file: String) -> Result<Array<Token>, LexerError> {
  ...
}
```

**Success criterion:** `lex(source, file)` in Galerina produces identical tokens to the TypeScript lexer for the same input.

### Stage B2: Parser in Galerina

Rewrite `src/parser.ts` as Galerina source.

More complex than the lexer but bounded:
- Takes `Array<Token>`, returns `AstNode`
- No network, no I/O
- Well-specified (grammar in `galerina-grammar.ebnf`)

**Success criterion:** Same `.spore` input → Stage A AST === Stage B AST.

### Stage B3: Cross-verification

Run both lexer/parser implementations against the full CEC (175 examples):
1. Stage A (TypeScript): parse all examples, record ASTs
2. Stage B (Galerina): parse same examples, record ASTs
3. Compare: every AST must match exactly

### Stage B4: Downstream (later)

After lexer + parser self-host:
- Type checker in Galerina
- Effect checker in Galerina
- Full compiler self-hosting (Stage B5+)

---

## Phase 9 Success Criteria

### Phase 9A complete when:
- `executeFlow` is async
- Real HTTP via `fetch()` works
- SPORE-TYPE-003 branded type enforcement implemented
- `Decimal` uses arbitrary-precision arithmetic
- Route auto-JSON parsing works
- 95%+ TypeScript Runtime weighted score

### Phase 9B complete when:
- Galerina lexer produces identical tokens to TypeScript lexer
- Galerina parser produces identical AST to TypeScript parser
- Full CEC verified against both implementations

---

## Estimated Phase 9A Timeline

| Milestone | Complexity | % gain |
|---|---|---|
| Async interpreter | High | +6% runtime |
| SPORE-TYPE-003 (branded) | Medium | +3% type checker |
| Decimal arbitrary precision | Low | +2% stdlib |
| Route auto-JSON | Low | +2% route |
| Channel<T> | High | +2% stdlib |
| SPORE-GOV-003/005 | Medium | +2% governance |

Projected Phase 9A completion: **~93% TypeScript Runtime**

---

## See Also

- `docs/Knowledge-Bases/galerina-architecture-layers.md` — five-layer architecture
- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md` — async runtime model
- `docs/Knowledge-Bases/galerina-intent-guided-optimisation.md` — IGO runtime concept
- `docs/Knowledge-Bases/galerina-language-lessons.md` — lessons from other languages
- `docs/Knowledge-Bases/galerina-type-improvements-phase-8.md` — SPORE-TYPE-003 spec
