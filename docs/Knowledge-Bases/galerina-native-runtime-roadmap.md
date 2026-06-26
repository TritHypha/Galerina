# Galerina — Native Self-Hosted Runtime Roadmap

## Overview

The current Stage 1 compiler (`compiler/galerina.js`, CommonJS, Node.js) is the right
substrate for prototype iteration. It is not the right permanent runtime substrate for a
language whose identity is:

```text
memory-safe, security-first, governed, multi-target
native/WASM capable, supply-chain aware, runtime-policy enforcing
```

Moving to a **native governed runtime** (Rust-first) is the single highest-leverage
long-term architectural shift for Galerina.

---

## Why Node.js is Fine for Stage 1 but Not the End State

The JavaScript prototype usefully validates:

```text
grammar, parser behavior, diagnostics, basic type checking
examples, machine-readable reports, AI context generation
language design iteration
```

But long-term Galerina needs a runtime that enforces policies at the execution layer:

```text
deny undeclared effects at runtime
prevent raw secret printing
enforce request-scope memory cleanup
track capability use
emit runtime evidence
control native bindings
own sandbox boundaries
support deterministic execution modes
```

Node.js can simulate some of this. A native runtime can own it.

---

## Native Runtime vs Native Compiler vs Self-Hosted Compiler

Three distinct milestones — in order:

### 1. Native Runtime

Galerina execution engine is native. Effect dispatch, secret handling, memory policy and
reports are native. Node.js is not required to run Galerina artefacts.

**This comes first.**

### 2. Native Compiler

Parser, checker and codegen implemented in native (Rust) code.

**This follows once runtime and IR are stable.**

### 3. Self-Hosted Compiler

Galerina compiler written in Galerina.

**This is a much later milestone, only after the language is mature enough.**

---

## Rust-First Recommendation

Rust matches Galerina's goals:

```text
mature safety model
strong ecosystem
ownership/borrowing maps to Galerina semantics
good WASM support
good parsing/compiler libraries
memory safety without GC
good supply-chain tooling relative to npm
```

Zig is attractive for small runtimes and cross-compilation, but Rust better matches
Galerina's security brand. A hybrid is possible only when specifically justified:

```text
Rust: compiler pipeline, runtime policy, reports, safety-critical runtime
Zig/C: tiny target-specific kernels (only when justified)
```

---

## Runtime-Level Enforcement

A native runtime can implement:

```text
request-scoped arenas               ProtectedSecret<T> in zeroable native memory
sensitive memory zeroing            capability-checked handles
resource quotas                     bounded allocators
sandboxed effect dispatch           checked references in debug/security mode
deterministic cleanup
```

These are difficult to enforce cleanly inside Node's object model and garbage collector.

---

## Deployment Benefits

A native runtime ships as:

```text
single static binary
WASM runtime module
container image without Node
embedded runtime library
serverless-friendly executable
edge deployment artefact
```

This removes:

```text
npm install during production deploy
Node version mismatch
package script execution during deploy
npm-specific attack surface
```

---

## Suggested Native Architecture

```text
galerina-parser          lexer / parser / AST
galerina-checker         type / effect / capability checking
galerina-ir              HIR / MIR and graph models
galerina-runtime         governed execution engine
galerina-security        secrets, capabilities, policy
galerina-reports         diagnostics, source maps, governance reports
galerina-target-wasm     WASM lowering / runtime ABI
galerina-target-native   native artefact ABI
galerina-cli             check / build / run / repl / diff / graph
galerina-lsp             language server
```

If Rust crates:

```text
crates/galerina-parser
crates/galerina-checker
crates/galerina-runtime
crates/galerina-cli
```

---

## Migration Strategy (7 Stages)

### Stage 1: Freeze behaviour with golden tests

Capture current behaviour before any rewrite:

```text
parser fixtures
diagnostic snapshots
report snapshots
example outputs
security rules
CLI behavior
```

A native rewrite without tests will drift.

### Stage 2: Define stable report/schema contracts

Freeze:

```text
AST JSON schema
diagnostic schema
intent graph schema
governance report schema
package manifest schema
```

### Stage 3: Native runtime prototype

Implement a native runtime for a small checked subset:

```text
values, flows, Result/Option, effects, capabilities
SecureString / ProtectedSecret<T>, reports
```

### Stage 4: JS compiler emits portable IR

Have the current JS compiler emit a stable MIR/bytecode/JSON consumed by the native runtime:

```bash
galerina build --emit-mir
galerina-runtime run build/app.lmir
```

This bridges old and new without big-bang risk.

### Stage 5: Native compiler frontend

Port parser and checker once runtime and IR are stable.

### Stage 6: Node-free production path

Make production builds runnable without Node.js.

### Stage 7: Retire or keep JS prototype as reference

The JS implementation can remain as a compatibility layer until the native compiler is complete.

---

## Production Policy Syntax

```galerina
production_policy {
  runtime native_required
  node_runtime deny
  npm_install_scripts deny
  unsafe_native deny
  secret_memory zeroize
}
```

---

## Supply-Chain for the Native Runtime

Moving off npm for runtime deployment helps but does not eliminate supply-chain risk.
For a Rust-based runtime:

```text
Cargo.lock pinning
crate audit (cargo-audit, cargo-deny)
signed releases
reproducible builds
SBOM
dependency review
```

The native ecosystem is more compatible with Galerina's governed-deployment story, but
it is not risk-free by default.

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-RUNTIME-001` | Native runtime required for this profile |
| `SPORE-RUNTIME-002` | Node-hosted runtime cannot enforce requested memory policy |
| `SPORE-RUNTIME-003` | Native runtime ABI mismatch |
| `SPORE-RUNTIME-004` | Unsafe native runtime feature denied |
| `SPORE-RUNTIME-005` | Runtime capability enforcement failed closed |
| `SPORE-RUNTIME-006` | JS prototype backend is not allowed in production profile |
| `SPORE-RUNTIME-007` | Runtime evidence unavailable for selected backend |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Language semantics, type/effect model, diagnostic definitions |
| `galerina-core-compiler` (JS) | Prototype frontend; emits portable MIR in Stage 4 |
| `galerina-runtime` (Rust) | Governed execution, effect dispatch, capability checks, runtime reports |
| `galerina-security` (Rust) | `ProtectedSecret<T>`, `KeyHandle<T>`, request arenas, secret zeroing |
| `galerina-target-wasm` | WASM lowering and runtime ABI |
| `galerina-target-native` | Native artefact ABI |
| `galerina-core-cli` | CLI binary in Rust; replaces Node-based entry point |
