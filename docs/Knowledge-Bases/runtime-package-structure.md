# Runtime Package Structure

## Definition

Galerina packages are coarse-grained and responsibility-based. Each package owns
a clear runtime or language concern. Tiny packages for every concept are
avoided.

## Package Tiers

### Required Core Packages

These are mandatory for the compiler and runtime:

```text
galerina-core              language rules, types, diagnostics
galerina-core-compiler     parser, checker, emit planning
galerina-core-runtime      runtime command, scheduling, execution contracts
galerina-core-security     authority, capabilities, effects, policy
galerina-core-memory       memory-safe values, bounds, ownership/lifetime model
```

Memory safety is a language/runtime contract — not an optional plugin.
`galerina-core-memory` is required by the compiler/runtime.

### Optional but Official Packages

```text
galerina-core-worker       workers, queues, bounded parallelism, crash boundaries
galerina-core-network      typed network/API policy
galerina-core-compute      compute planning, capabilities, budgets, target selection
galerina-ai                generic AI inference contracts
galerina-data              data processing, streaming, memory-bounded contracts
```

Workers are separate because they are operational runtime infrastructure:
queues, bounded parallelism, crash boundaries, scheduling and reporting.

## Naming Rule

Use family prefixes that make the runtime, developer-tooling or domain role
visible from the directory name:

```text
galerina-core-*         language and runtime core
galerina-ai-*           AI compute and inference
galerina-target-*       compile target backends (cpu, wasm, gpu, etc.)
galerina-framework-*    application kernel, API server
galerina-devtools-*     development-only inspection and tooling
galerina-tools-*        diagnostics and benchmarks
```

## Naming Principle

```text
Core safety guarantees = required core packages.
Execution mechanisms = separate runtime packages.
Optional domains = optional packages.
```

Avoid names like `memory-safe-package`. Use `galerina-core-memory` — it sounds
like part of the runtime contract, not a plugin.

## Core Rule

```text
Do not make memory safety just an optional app package.
Memory safety is part of the language/runtime contract.
```
