# Galerina — Compiler Phase Memory Boundaries

**Status:**
```
Stage B — Architectural Proposal (suggestion)
Priority: MEDIUM — implement after self-hosting works, before native targets
Timing: Not Stage B immediately. First get self-hosting compiler working, then introduce arenas as internal refactor.
```

**TL;DR:**
- Each compiler phase owns its memory through a dedicated boundary (arena)
- When a phase completes and transfers its artefacts, its temporary memory is destroyed
- Predictable memory usage, faster arena destruction (O(1)), clearer architecture

---

## Problem

Compilers that allocate freely across all phases accumulate memory continuously throughout the compilation run. By the time code generation completes, every intermediate structure from lexing, parsing, and type-checking remains live in the heap even though it is no longer needed.

For Galerina this matters for three reasons:

1. The self-hosted compiler must itself be a well-governed program. If it cannot reason about its own memory, it is a poor demonstration of the language's principles.
2. Native compilation targets (WASM, LLVM IR) will involve memory environments where GC is absent or constrained. Establishing phase boundaries now makes that transition cheaper.
3. The diagnostic system needs to attribute memory pressure to a specific phase. Without boundaries, all heap usage looks the same.

---

## Phase Boundary Model

Each compiler phase owns an arena. At phase completion the phase hands off only its output artefacts (the next phase's input). The arena — and all temporary memory allocated within it — is then destroyed.

```
Source Files
    |
    v
+------------------+
|  Lexing Phase    |  <-- LexerBoundary
|  TokenStream     |
+--------+---------+
         | Token[] (transferred)
         v
+------------------+
|  Parsing Phase   |  <-- ParserBoundary
|  AST Nodes       |
|  Source Spans    |
+--------+---------+
         | AST (transferred)
         v
+------------------+
|  Type Phase      |  <-- TypeBoundary
|  Typed AST       |
|  Constraint Set  |
+--------+---------+
         | Typed AST (transferred)
         v
+------------------+
|  Effect Phase    |  <-- EffectBoundary
|  Effect Graph    |
|  Taint Map       |
+--------+---------+
         | Effect-annotated AST (transferred)
         v
+------------------+
|  IR Phase        |  <-- IRBoundary
|  GIR Nodes       |
|  SSA Form        |
+--------+---------+
         | GIR (transferred)
         v
+------------------+
|  CodeGen Phase   |  <-- CodeGenBoundary
|  Output Buffers  |
+--------+---------+
         | Output Files (emitted)
         v
    Build Artefacts
```

When a phase box exits, its boundary is destroyed. Only the labelled artefacts cross the boundary line.

---

## Arena-Based Allocation

Within each phase, all temporary allocations go into the phase's arena. The arena is a contiguous block of memory that grows as needed. Destruction is O(1): release the block, not individual nodes.

**ParserArena example:**

```
ParserArena {
  nodes:       ASTNode[]        -- all AST nodes for this file
  spans:       SourceSpan[]     -- source location data
  interned:    StringTable      -- deduplicated identifiers
  scratch:     ScratchBuffer    -- temporary working space
}
```

After the parser transfers its `AST` output to the type-checker, `ParserArena` is dropped. The `StringTable`, all `ASTNode` allocations, and all `SourceSpan` records are destroyed together in one operation. The type-checker works only with the transferred typed output.

**TypeBoundary example:**

```
TypeBoundary {
  typed_ast:   TypedAST         -- output passed forward
  constraints: ConstraintSet    -- temporary, destroyed here
  unifier:     UnificationTable -- temporary, destroyed here
}
```

---

## Benefits

**Predictable memory usage.** Peak memory for a compilation run is bounded by the largest single phase plus the long-lived shared state. Memory does not grow monotonically across the full pipeline.

**Faster destruction (O(1)).** Freeing an arena is a single deallocation, not a traversal of every node. At scale — compiling large packages — this matters.

**Clearer architecture.** Phase boundaries make data flow explicit. A node that crosses a boundary must be intentionally transferred. Accidental retention of stale data becomes visible and diagnosable.

**Better self-hosting demonstration.** The self-hosted Galerina compiler should itself be a well-governed program. Explicit phase arenas demonstrate that Galerina programs can manage structured resource lifetimes without garbage-collection magic.

**Easier debugging.** When a memory diagnostic fires, it names the boundary. "BoundaryLeakDetected in ParserBoundary" is more actionable than a generic heap growth report.

---

## Long-Lived Shared State

Not all compiler state is phase-local. The following lives in `CompilerRootBoundary` for the duration of the compilation session:

```
CompilerRootBoundary {
  config:              CompilerConfig    -- flags, targets, feature gates
  diagnostic_registry: DiagnosticReg    -- all diagnostics emitted, any phase
  builtin_types:       BuiltinTypeTable  -- primitives, never rebuilt
  capability_registry: CapabilityReg    -- declared capabilities for this package
}
```

`CompilerRootBoundary` is created before any phase begins and destroyed after all output is written. Phase arenas hold a reference to it for diagnostics and config lookup, but they do not own it.

Cross-boundary references from a phase arena into `CompilerRootBoundary` are permitted. References in the opposite direction — from root into a phase arena — are not permitted, because the phase arena may be destroyed while root is still live. The effect checker enforces this.

---

## Incremental Watch Mode

In watch mode (recompile on file change), full arena destruction after every file is expensive. The incremental strategy is:

**Cache across compilations:**
- Dependency graph (which files import which)
- Package metadata (manifests, resolved versions)

**Rebuild per changed file:**
- Destroy and recreate only the phase arenas for the affected file
- Propagate through the dependency graph for files that import the changed file

**Never cache across compilations:**
- Typed AST for changed files
- Effect graphs for changed files
- Any output that depends on the changed file

This means the `CompilerRootBoundary` persists across watch iterations, while per-file phase arenas are rebuilt as needed.

---

## Diagnostic Codes

These are internal compiler diagnostics, not user-facing language errors. They appear in compiler debug output and in the governance log.

| Code | Name | Condition |
|---|---|---|
| `SPORE-MEMORY-001` | `BoundaryLeakDetected` | Memory attributed to a phase arena is still reachable after that phase completed |
| `SPORE-MEMORY-002` | `CrossBoundaryReference` | A phase arena holds a reference into another phase arena (not into CompilerRootBoundary) |
| `SPORE-MEMORY-003` | `InvalidBoundaryOwnership` | An allocation was made outside any declared boundary |

These diagnostics require the compiler to instrument its own allocation paths — a Stage B+ task, not immediate.

---

## Stage B Scope

**Do in Stage B:**
- Model the phase boundary architecture in documentation and internal design
- Structure the compiler's code so phases are clearly separated with explicit input/output types
- Use JS object scoping to approximate boundary lifetimes (phase output objects, phase-local working objects)
- Establish naming conventions (`ParserBoundary`, `TypeBoundary`, etc.)

**Do not do in Stage B:**
- Build a custom allocator — the JS GC handles actual deallocation
- Implement `SPORE-MEMORY-001/002/003` diagnostics — these require allocator instrumentation
- Full arena allocation — JS does not expose allocator-level control

The goal in Stage B is to make the architecture real in the code structure, so that when a native target or a custom runtime arrives, arenas drop in as a refactor rather than a redesign.

---

## Rules at a Glance

1. Each compiler phase allocates into its own arena.
2. Only declared output types cross a phase boundary.
3. `CompilerRootBoundary` is the only arena a phase may reference outside itself.
4. Phase arenas reference root; root does not reference phase arenas.
5. Watch mode caches dependency graph and package metadata only.
6. `SPORE-MEMORY-001/002/003` are internal diagnostics, not user errors.
7. Stage B models the architecture; it does not implement a custom allocator.

---

## See Also

- `galerina-stage-b-root-capability-provider` — root capability ownership model
- `galerina-governed-memory-blocks` — user-facing governed memory in Galerina programs
- `galerina-roadmap` — stage sequencing and priorities
