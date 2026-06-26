# Galerina — Missing Syntax Keywords and Parser Gaps

## Overview

Several critical language primitives exist in Galerina's conceptual model but are not yet
implemented in the parser, AST or compiler enforcement layers. This creates a gap between
documented semantics and actual compiler guarantees.

These are not design proposals — they are implementation priorities for Phase 4 (Parser/AST).

---

## Gap 1: `deterministic flow` Not in AstNodeKind (CRITICAL)

### The Problem

The `deterministic flow` concept is defined semantically but:
- not represented in `AstNodeKind`
- not parseable
- not enforceable by the compiler

Deterministic execution is currently documentation-only.

### Why It Matters

GPU, WASM, SIMD and distributed compute targets require deterministic scheduling,
reproducible execution, restricted effects and predictable memory behavior.

Without compiler enforcement:
- unsafe non-deterministic effects pass through to GPU targets
- distributed replay breaks
- inference reproducibility cannot be guaranteed

### Desired Syntax

```galerina
deterministic flow inference targets [gpu, wasm] {
    let result = tensor.matmul(weights, input)
    return result
}
```

### Compiler Must Reject

```text
random()
clock.now()
unrestricted async behavior
uncontrolled shared mutation
nondeterministic effects
```

### Required AST Additions

```text
DeterministicFlow
DeterministicModifier
```

---

## Gap 2: `stream flow` / `yield` / `lazy pipeline` Missing (IMPORTANT)

### The Problem

Galerina lacks streaming primitives, yield semantics and lazy evaluation.

Without them, a GPU flow generating a 10GB tensor must:
- fully allocate
- fully transfer
- fully materialize

before CPU consumers can begin processing. This is not viable for AI inference streams,
edge analytics, distributed pipelines or large-scale embeddings.

### Desired Syntax

```galerina
// Stream flow — produces values incrementally
stream flow embeddings(corpus: DataSet) -> Stream<Embedding> {
    for doc in corpus {
        let embedding = model.encode(doc)
        yield embedding
    }
}

// Lazy pipeline — evaluated on demand
lazy pipeline transform {
    source -> normalize -> embed -> index
}

// Consumer
for embedding in embeddings(corpus) {
    vectorDB.upsert(embedding)
}
```

### Required AST Additions

```text
StreamFlow
YieldExpression
LazyPipeline
LazyEvaluation
```

### Effects

Stream flows should carry a `stream.produce` effect. Consumers carry `stream.consume`.
The compiler can verify that stream producers and consumers agree on the element type.

---

## Gap 3: Placement Hints Absent from Parser (IMPORTANT)

### The Problem

Placement hints (`placement gpu`, `placement edge`, `placement local`) are discussed in
the knowledge base but:
- syntax is not defined
- parser support is absent
- runtime planning cannot rely on placement metadata

The runtime must guess execution placement without source-level guidance.

### Desired Syntax

```galerina
// Single placement
flow inference placement gpu {
    // ...
}

// Multiple placements with priority
flow analytics placement [edge, gpu, local] {
    // ...
}

// Inline placement for compute blocks
compute block matmul placement gpu {
    // ...
}

// Placement on allocation
let buffer: Tensor<Float16, [1024]> placement gpu
```

### Semantics

```text
placement gpu      — prefer GPU; fallback policy applies if unavailable
placement edge     — prefer edge node; use local if unavailable
placement local    — current process / node only
placement isolated — isolated execution context (sandbox)
```

### Required AST Additions

```text
PlacementHint
PlacementTarget
PlacementExpression
```

---

## Gap 4: Call-Site `borrow` / `move` / `copy` Not in Parser (CRITICAL)

### The Problem

The ownership model (`borrow`, `move`, `copy`) is specified in the knowledge base and
defines diagnostics, but the parser does not recognize these keywords at call sites.

Memory safety and GPU transfer safety cannot be guaranteed without parser-level
enforcement.

### Desired Syntax

```galerina
// Borrow — temporary access without ownership transfer
process(borrow tensor)
borrow tensor -> gpu_kernel()

// Mutable borrow
transform(borrow mut buffer)

// Move — transfer ownership; source becomes invalid
move tensor -> gpu_memory

// Copy — explicit value copy
let copy = copy tensor

// Pinned allocation
let buf: pinned Tensor<Float16, [1024, 1024]>
```

### Compiler Error (After Parser Addition)

```galerina
move tensor -> gpu
tensor.read()   // ERROR: tensor was moved
```

```text
SPORE-OWN-001: moved value used after move
  `tensor` was moved at line 4
  `tensor` used again at line 5
```

### Required AST Additions

```text
BorrowExpression
MutableBorrow
MoveExpression
CopyExpression
PinnedAllocation
OwnershipTransfer
BorrowScope
```

---

## Phase 4 Parser Priority Table

| Keyword/Syntax | Priority | Blocks |
|---|---|---|
| `deterministic flow` | CRITICAL | GPU/WASM target safety, distributed replay |
| `move` / `borrow` / `copy` at call sites | CRITICAL | Memory safety, GPU transfer planning |
| `stream flow` / `yield` | IMPORTANT | AI inference streams, tensor pipelines |
| `lazy pipeline` | IMPORTANT | Distributed compute efficiency |
| `placement gpu/edge/local` | IMPORTANT | Runtime orchestration, accelerator scheduling |

---

## Relationship to Phase 4 Deliverables

Phase 4 (Parser and AST) must add these keywords to:

```text
lexer token set
grammar productions
AstNodeKind enum
AST node constructors
parser tests (valid + rejection)
```

These keywords must also be reflected in:

```text
galerina ast --json schema
intent graph node/edge kinds
governance report capability declarations
LSP autocomplete (Phase 5 LSP)
```

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Keyword definitions, AST node kinds, semantic rules |
| `galerina-core-compiler` | Parser grammar, lexer tokens, AST construction, enforcement passes |
| `galerina-core-compute` | Placement hint resolution, deterministic constraint enforcement |
| `galerina-core-cli` | `galerina ast` schema updates for new node kinds |
