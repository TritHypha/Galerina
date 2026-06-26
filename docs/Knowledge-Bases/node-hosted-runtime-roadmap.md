# Node-Hosted Runtime Roadmap

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Phase 17+

## Purpose

Galerina must be honest about its current execution model.

Today, practical Galerina web/API execution is Node-hosted. Future Galerina may
compile to secure runtime targets, but it is not currently a standalone native
web server/runtime.

## Short Definition

```text
today = Node-hosted secure Galerina layer
future = target-independent checked runtime and compiled outputs
```

## Current Position

For a web/API app today, the likely stack is:

```text
HTTP request
  -> Node.js server
  -> Galerina framework/API server adapter
  -> Galerina app kernel
  -> Galerina checked rules and flows
  -> Node.js executes the runtime path
  -> HTTP response
```

So Galerina is currently:

```text
a secure language/framework layer running on Node.js
```

It is not yet:

```text
a standalone native web server/runtime
```

## Why This Is Acceptable Now

Node hosting lets Galerina focus first on its differentiators:

- typed requests
- response contracts
- policies
- effects
- capabilities
- secure flows
- classified models
- audit reports
- AI/tool boundaries
- project graphs and AI-readable reports

Node can handle the current host runtime concerns:

- HTTP serving
- process runtime
- filesystem and network APIs
- package execution
- development tooling

## Target-Independent Design Rule

Galerina may be Node-hosted today, but the core language must remain
target-independent.

Rules:

```text
Do not bake Node.js semantics into Galerina source meaning.
Do not make V8 optimisation behaviour a language guarantee.
Do not claim native runtime speed from Node-hosted benchmark results.
Do not make Node package access equal Galerina package authority.
Do keep host runtime effects permissioned, reportable and replaceable.
```

## Roadmap Layers To Standalone Runtime

| Layer | Needed capability | Status meaning |
| --- | --- | --- |
| 1 | stable language core | syntax, AST, type system, effects and modules become stable |
| 2 | Galerina IR | typed internal instruction graph for multiple outputs |
| 3 | runtime memory model | ownership, references, buffers, allocation and cleanup |
| 4 | VM or interpreter | deterministic execution independent of V8 semantics |
| 5 | native/WASM backend | C, LLVM, Cranelift, WASM or native binary output |
| 6 | async/event runtime | scheduler, timers, sockets, cancellation and backpressure |
| 7 | HTTP/web runtime | HTTP parsing, routing, TLS, streaming and health handling |
| 8 | storage/network libraries | database, filesystem, stream and outbound network support |
| 9 | security runtime | effects, permissions, packages, AI/tools, audit and sandboxing |
| 10 | production tooling | debugger, profiler, package manager, testing and observability |

This is roughly:

```text
10-15 major architectural milestones
```

The milestones are not equal. IR, memory model, runtime execution and async I/O
are the hardest turning points.

## Recommended Work Order

```text
1. stabilise language rules
2. stabilise effect/capability/permission system
3. create Galerina IR
4. add WASM target planning and selected WASM output
5. add Galerina VM/runtime
6. add native backend
7. add async runtime
8. add HTTP/web runtime
9. add storage/network libraries
10. add production runtime tooling
```

Galerina should not build a native web server before the language core, IR, memory
model and checked runtime semantics are stable.

## Benchmark Interpretation

Node-hosted Galerina benchmarks measure:

```text
Galerina runner overhead on Node/V8
```

They do not prove:

```text
native Galerina compiler performance
```

Recommended wording:

```text
The current Galerina prototype is Node-hosted. Benchmarks can show prototype
runner overhead and checked-runtime feasibility, but they do not prove native
Galerina runtime speed.
```

## Positioning

Galerina should compete first as:

```text
secure governed execution layer
```

not as:

```text
faster Node replacement
```

The strongest current claim is:

```text
Galerina aims to make secure web/API/agent execution typed, explicit, governed,
auditable and AI-readable while initially using Node.js as a practical host.
```

## Best Short Statement

```text
Today: Galerina runs on Node.
Future: Galerina compiles to secure runtime targets.
```
