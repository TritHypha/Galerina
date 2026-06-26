# Galerina Phase 4 — Parser and AST: Plan, Flowchart and Suggestions

## Overview

Phase 4 is the most critical phase in Galerina's development. Without a real, enforceable parser
and AST, every governance guarantee, effect declaration, capability constraint, ownership model
and compute target is documentation-only. Phase 4 makes the language *real*.

**Core deliverable:** A deterministic, testable, source-mapped parser that produces a typed AST
conforming to a published JSON schema, with diagnostics as first-class output.

---

## Outstanding Questions Before Phase 4 Begins

The following must be resolved before Phase 4 implementation starts. Leaving them open risks
building the wrong parser or producing an AST that cannot support later phases.

### Q1: Grammar Ownership
Which package owns the Galerina grammar definition?

```text
Recommended: galerina-core-compiler
The grammar file (.galerina.peg, .lark, or hand-written recursive descent) lives in
galerina-core-compiler/src/parser/grammar.ts (or grammar.spore.peg).
galerina-core owns the AstNodeKind enum and AST node types, but not the parsing logic.
```

### Q2: Parser Technology Choice
Hand-written recursive descent, PEG grammar (e.g. PEG.js/Peggy), or separate lexer+parser?

```text
Recommended: Hand-written recursive descent
Reasons:
  - Best error recovery and error messages
  - Full control over source spans
  - No external grammar toolchain dependency
  - Easier to evolve as the language grows
  - Works with Node:test test runner already in use
```

### Q3: AstNodeKind Freeze
What is the complete AstNodeKind enum for Phase 4 (v1 surface only)?

This must be decided before implementation starts. See the proposed AstNodeKind table below.

### Q4: Error Recovery Policy
Does the parser stop at the first error, or attempt recovery to surface multiple errors?

```text
Recommended: error recovery
Produce multiple diagnostics per file. Synchronize at statement/declaration boundaries.
This matches the LSP requirement — partial ASTs must be safe to walk.
```

### Q5: Source Span Format
What is the canonical source span format in the AST?

```text
Recommended:
  { file: string, startLine: number, startCol: number, endLine: number, endCol: number }
Every AST node carries a span. The published JSON schema includes spans on all nodes.
```

### Q6: Expression Precedence Table
Has the operator precedence table been finalized?

```text
This must be documented before any expression parser is written. Precedence changes
after the parser is built are extremely expensive.
```

### Q7: Keyword Reserved Set
Is the complete reserved keyword list finalized?

```text
Phase 4 must add: deterministic, stream, yield, lazy, borrow, move, copy, pinned,
placement, stream, barrier, memoryFence, atomic, comptime, packed, aligned, simd.
These must be in the lexer before any code that uses them is processed.
```

---

## Phase 4 Intentions and Flowchart

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 4: Parser and AST                                │
│                                                                             │
│  Goal: deterministic, testable, source-mapped parser → typed AST →         │
│         published JSON schema → all Phase 5 checks have something to run   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 4.1: Lexer + Token Set                                               │
│  ─────────────────────────────                                              │
│  • Complete reserved keyword list (finalize before writing)                 │
│  • All operator tokens (arithmetic, logical, arrow, pipe, ownership)        │
│  • String/char/byte/number literal tokens                                   │
│  • Comment tokens (line and block)                                          │
│  • Span-carrying token type                                                 │
│  • Lexer tests: all keywords, operators, literals, edge cases               │
│                                                                             │
│  STAGE 4.2: AstNodeKind Enum                                                │
│  ──────────────────────────────                                             │
│  • Freeze the v1 AstNodeKind enum (see table below)                         │
│  • Add new Phase 4 node kinds (see list below)                              │
│  • Every node kind has a TypeScript interface with span                     │
│  • AstNode discriminated union type exported from galerina-core               │
│                                                                             │
│  STAGE 4.3: Grammar Productions (recursive descent)                        │
│  ─────────────────────────────────────────────────                          │
│  • Module/package-level declarations                                        │
│  • Import declarations                                                      │
│  • Flow declarations (safe/secure/pure/deterministic/stream)                │
│  • Effects list                                                             │
│  • Capabilities list                                                        │
│  • Targets list                                                             │
│  • Type annotations (scalar, generic, Tensor<T,S>, Quantized<S,T>)         │
│  • Record/enum/struct declarations (incl. packed/aligned/simd layout)      │
│  • Resource declarations                                                    │
│  • Compute blocks (compute target ...)                                      │
│  • Stream and yield expressions                                             │
│  • Placement hints (placement gpu/edge/local)                               │
│  • Ownership expressions (borrow, move, copy, pinned)                      │
│  • Barrier/memoryFence/sync expressions                                     │
│  • Atomic operation calls                                                   │
│  • GPU stream declarations                                                  │
│  • Expressions (arithmetic, logical, comparison, pipeline, pattern match)   │
│  • Statement forms (let, mut, if/match, for, while, return, throw)          │
│  • Error handling forms (try, catch, Result propagation)                   │
│                                                                             │
│  STAGE 4.4: Parser Error Recovery                                           │
│  ─────────────────────────────────                                          │
│  • Synchronize at declaration boundaries on error                           │
│  • Emit SPORE-PARSE-* diagnostics with source spans                          │
│  • Partial AST is safe to walk (no null dereferences in checkers)          │
│  • Test: every diagnostic code has at least one rejection test              │
│                                                                             │
│  STAGE 4.5: Published AST JSON Schema                                       │
│  ────────────────────────────────────                                       │
│  • `galerina ast --json` emits versioned JSON schema                          │
│  • Schema version: "spore.ast.v1"                                             │
│  • Every node has: kind, span, children                                     │
│  • Modes: --syntax-only, --resolved, --include-trivia, --compact            │
│  • Schema published to build/ast-schema.json                                │
│  • SPORE-AST-001..006 diagnostics                                             │
│                                                                             │
│  STAGE 4.6: Symbol Table (basic, no type resolution)                        │
│  ─────────────────────────────────────────────────                          │
│  • Flow names → AST node references                                         │
│  • Record/enum type names                                                   │
│  • Import resolution (within same package first)                            │
│  • Duplicate declaration detection                                          │
│  • Unresolved reference detection                                           │
│                                                                             │
│  STAGE 4.7: Parser Tests                                                    │
│  ────────────────────────                                                   │
│  • Valid parse tests (≥1 per grammar production)                            │
│  • Rejection tests (≥1 per diagnostic code)                                 │
│  • Round-trip: parse → JSON → verify schema matches                         │
│  • Error recovery tests: multi-error files produce multiple diagnostics     │
│  • Source span tests: all spans correct for known inputs                    │
│                                                                             │
│  STAGE 4.8: Tooling Wiring                                                  │
│  ────────────────────────                                                   │
│  • galerina-core-cli: `galerina check --syntax-only` uses new parser           │
│  • galerina-core-cli: `galerina ast --json` emits published schema             │
│  • galerina-lsp (stub): parser feeds partial AST to diagnostic loop          │
│  • galerina-devtools-project-graph: update to consume new AST nodes          │
│  • intent graph node/edge kinds updated for new AST kinds                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## AstNodeKind: Existing + New Phase 4 Additions

### Existing Nodes (must remain stable)

```text
FlowDecl, ApiDecl, RouteDecl, ResourceDecl, CapabilityDecl,
EffectDecl, SecretDecl, BoundaryDecl, TypeDecl, RecordDecl,
EnumDecl, FieldDecl, ImportDecl, ModuleDecl, PackageDecl,
LetDecl, MutDecl, ReturnStmt, ThrowStmt, IfExpr, MatchExpr,
ForLoop, WhileLoop, CallExpr, BinaryExpr, UnaryExpr,
PipelineExpr, TypeAnnotation, TupleExpr, ArrayExpr,
StringLiteral, NumberLiteral, BoolLiteral, Identifier,
ComputeBlock, AsyncExpr, AwaitExpr, ParallelBlock,
WorkerDecl, ChannelDecl
```

### New Phase 4 Additions

#### Execution Model
```text
DeterministicFlow       — deterministic flow <name>
DeterministicModifier   — qualifier on existing flow kinds
StreamFlow              — stream flow <name>
YieldExpression         — yield <expr>
LazyPipeline            — lazy pipeline <name> { ... }
LazyEvaluation          — lazy <expr>
```

#### Ownership and Memory
```text
BorrowExpression        — borrow <expr>
MutableBorrow           — borrow mut <expr>
MoveExpression          — move <expr>
CopyExpression          — copy <expr>
PinnedAllocation        — pinned <type> or pinned <expr>
OwnershipTransfer       — <expr> -> <placement>
BorrowScope             — { borrow ... }
SharedAllocation        — shared <expr>
```

#### Compute and Placement
```text
PlacementHint           — placement gpu/edge/local/isolated
PlacementTarget         — target identifier in placement
PlacementExpression     — flow/block/alloc + placement qualifier
PerFlowTargets          — targets [...] qualifier on flow
ComputeResourceBudget   — budget { vram ..., timeout ... }
CapabilityConstraint    — constraint metadata on flow
TargetCapabilityRule    — rule attached to compute block
ForbiddenEffect         — compiler-tracked forbidden effect
```

#### GPU Synchronisation
```text
AtomicOperation         — base kind for all atomics
AtomicAdd               — atomicAdd(ref, value)
AtomicMin               — atomicMin(ref, value)
AtomicMax               — atomicMax(ref, value)
AtomicExchange          — atomicExchange(ref, value)
CompareAndSwap          — compareAndSwap(ref, expected, value)
FetchAndOr              — fetchAndOr(ref, mask)
FetchAndAdd             — fetchAndAdd(ref, value)
BarrierExpression       — barrier()
MemoryFence             — memoryFence()
ThreadSync              — sync threads
SharedMemoryBlock       — shared { ... }
GPUStream               — stream <name>
StreamLaunch            — launch <kernel> on <stream>
StreamTransfer          — transfer <tensor> on <stream>
StreamAwait             — await <stream> or await [...]
ConcurrentKernel        — kernel inside stream context
```

#### Data Layout
```text
LayoutHint              — packed/aligned/simd metadata on struct
PackedStructDecl        — packed struct <name> (or structDecl.layout.packed)
AlignedHint             — aligned(N) on struct/field/param
SimdHint                — simd on struct/field
```

#### Compile-Time Evaluation
```text
ComptimeModifier        — comptime qualifier on pure flow
ComptimeConst           — const <name> = <comptime expr>
ComptimePolicy          — comptime_policy { ... }
```

#### Quantization and Neural IR
```text
QuantizedType           — Quantized<Source, Storage>
QuantizedTensor         — QuantizedTensor<S, T, Shape>
QuantizeExpr            — quantize<T>(expr, using: profile)
DequantizeExpr          — dequantize(expr)
RequantizeExpr          — requantize<T>(expr)
PrecisionPolicy         — precision_policy { ... }
NeuralGraph             — neural graph <name> { ... }
NeuralOp                — neural op (matmul, attention, etc.)
```

---

## Complete Phase 4 Deliverable Checklist

```text
□ Reserved keyword list frozen and documented
□ Operator precedence table documented
□ Lexer implemented with span-carrying tokens
□ AstNodeKind enum finalized (existing + new)
□ Every AST node interface has a span field
□ Parser covers all grammar productions (see Stage 4.3)
□ Error recovery at declaration boundaries
□ SPORE-PARSE-001..010 diagnostics defined and testable
□ `galerina ast --json` emits spore.ast.v1 schema
□ AST JSON schema published to build/
□ Symbol table: flow/type name resolution, duplicate detection
□ ≥80 parser tests (valid + rejection + span correctness)
□ Round-trip test: parse → JSON → verify schema
□ galerina-core-cli: --syntax-only uses new parser
□ galerina-devtools-project-graph: updated for new node kinds
□ intent graph updated for new AST kinds
□ SPORE-PARSE diagnostics in compiler-diagnostics.md
```

---

## Phase 4 Parser Diagnostic Codes

```text
SPORE-PARSE-001  Unexpected token
SPORE-PARSE-002  Expected declaration keyword
SPORE-PARSE-003  Unterminated string literal
SPORE-PARSE-004  Invalid numeric literal
SPORE-PARSE-005  Unclosed block or bracket
SPORE-PARSE-006  Missing return type annotation
SPORE-PARSE-007  Duplicate declaration in same scope
SPORE-PARSE-008  Invalid escape sequence
SPORE-PARSE-009  Reserved keyword used as identifier
SPORE-PARSE-010  Placement hint on non-flow/non-alloc context
SPORE-PARSE-011  Ownership expression outside allowed context
SPORE-PARSE-012  GPU stream used in non-compute context
SPORE-PARSE-013  Atomic operation on non-atomic memory region (parse-level)
SPORE-PARSE-014  Quantized type used outside neural/AI context (parse-level)
```

---

## Suggestions Before Phase 4 Begins

### Suggestion 1: Freeze the v1 Surface First

Before writing a single parser rule, document the exact set of syntactic forms that must
be parseable for v1. Every syntax form added after the parser is built is expensive.

The safest approach: write 10–15 real Galerina program files that cover the full v1 surface
and commit them as `tests/fixtures/` before the parser is written. The parser passes when
all fixtures parse correctly.

### Suggestion 2: Parse-Then-Validate, Not Parse-And-Validate

The parser should *only* produce an AST and diagnostics. It should not perform:

```text
type checking, effect checking, capability checking, ownership checking
```

These happen in separate passes (Phase 5). This separation is critical for:

```text
incremental recompilation (AST without re-checking)
LSP partial parse (valid AST for invalid files)
test isolation (test parser independent of checker)
```

### Suggestion 3: Source Spans on Every Node From Day One

Retrofitting source spans after the fact is extremely painful. Every AST node must carry a
span from the first commit. The published JSON schema depends on this.

### Suggestion 4: Test-First Grammar

Write the tests for each grammar production before writing the parser rule. This prevents
the parser from becoming untestable. Required test kinds per production:

```text
1 valid parse test (passes)
1 rejection test (fails with SPORE-PARSE-NNN)
1 span test (verifies start/end line/col)
```

### Suggestion 5: Use `node:test` Consistently

Galerina already uses `node:test` for compiler tests. Phase 4 parser tests should use the
same runner. All test files should be `.test.mjs`. Do not introduce Jest or Vitest.

### Suggestion 6: Separate the Grammar from the Implementation

Define grammar productions as annotated comments in the parser source, making the grammar
self-documenting:

```typescript
// grammar: FlowDecl
//   = 'flow' | ('safe' 'flow') | ('secure' 'flow') | ('pure' 'flow')
//     | ('deterministic' 'flow') | ('stream' 'flow')
//     Identifier '(' ParamList ')' '->' TypeExpr
//     EffectsClause? CapabilitiesClause? TargetsClause?
//     Block
function parseFlowDecl(tokens: TokenStream): FlowDeclNode { ... }
```

This makes Phase 5 and LSP implementors' lives much easier.

### Suggestion 7: Governance Keywords Are NOT Optional

The parser must reject any file that uses `effects`, `capabilities`, `placement`, `borrow`,
`move`, `deterministic` as bare identifiers. These are reserved. This is non-negotiable for
Phase 5 effect checking to be reliable.

### Suggestion 8: Do Not Over-Engineer the v1 AST

The v1 AST should be `flat and explicit`. Avoid:

```text
unnecessary generics in the AST (e.g. Node<T> where T is always AstNode)
deeply nested node types
implicit/optional fields that collapse to null
visitor patterns that make testing hard
```

A flat discriminated union (`{ kind: "flowDecl", ... } | { kind: "letDecl", ... }`) is easier
to test, serialize, and debug.

### Suggestion 9: Incremental Compilation Architecture Decision

Decide before Phase 4 whether the parser will support incremental re-parsing. This requires:

```text
text edit → range deletion → subtree re-parse
```

If Phase 5 and the LSP need incremental parsing, the parser must be designed for it from the
start. A full re-parse on every file change is acceptable for Phase 4 but should be noted as
a known limitation to be addressed in the LSP work.

### Suggestion 10: One Grammar, Multiple Syntax Modes

The parser should support a mode flag from the first commit:

```text
--syntax-only      Parse only. No name resolution. Fast.
--resolved         Parse + symbol table. Names are resolved.
--include-trivia   Include comments/whitespace in AST for LSP.
--compact          Minimal AST for CI/reporting.
```

This matches the published AST JSON schema design.

---

## What Phase 4 Unblocks

Completing Phase 4 unblocks every subsequent phase:

```text
Phase 5 (Type Checker)
  — depends on: typed AST, symbol table, AstNodeKind enum

Phase 5 (Effect Checker)
  — depends on: effects parsed and in AST, EffectsClause node

Phase 5 (Capability Checker)
  — depends on: capabilities parsed and in AST, CapabilityConstraint node

Phase 5 (Ownership/Borrow Checker)
  — depends on: BorrowExpression, MoveExpression, PinnedAllocation in parser

Phase 5 (Determinism Checker)
  — depends on: DeterministicFlow, DeterministicModifier in parser

Phase 6 (Runtime)
  — depends on: stable AST for MIR generation

Phase 6 (Reports)
  — depends on: intent graph which depends on AST

LSP
  — depends on: parser, AST, diagnostics, source spans

Test Generation
  — depends on: parsed flow signatures, effects, capabilities

AI Context Bundle
  — depends on: published AST JSON schema + intent graph
```

A weak Phase 4 propagates through every subsequent phase. A strong Phase 4 makes everything
else tractable.

---

## Phase 4 Package Responsibilities

| Package | Phase 4 Role |
|---|---|
| `galerina-core` | AstNodeKind enum, AST node interfaces, span format, diagnostic type |
| `galerina-core-compiler` | Lexer, parser, grammar productions, symbol table, AST JSON emitter |
| `galerina-core-cli` | `galerina check`, `galerina ast --json`, `galerina signatures` wiring |
| `galerina-devtools-project-graph` | Update to consume new AST node kinds |
| `galerina-core-reports` | Intent graph update for new AST kinds |
| `galerina-lsp` (stub) | Wire parser output to LSP diagnostic loop |

---

## Phase 4 Success Criteria

Phase 4 is complete when:

```text
1. All Phase 4 checklist items above are ticked
2. galerina-core-compiler tests: ≥80 tests, all passing
3. `galerina ast --json` on any fixture file produces valid spore.ast.v1 JSON
4. `galerina check --syntax-only` reports SPORE-PARSE-NNN on all invalid fixtures
5. No grammar production is without at least one rejection test
6. AstNodeKind enum is frozen and documented
7. Published AST JSON schema matches actual output
8. Zero TypeScript errors in galerina-core and galerina-core-compiler
9. Incremental compilation strategy decision documented
10. All new Phase 4 diagnostic codes added to compiler-diagnostics.md
```
