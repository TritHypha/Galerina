# Galerina — Stage B Root Capability Provider

## Status

```
Stage B — Architectural Proposal (suggestion)
Priority: CRITICAL for self-hosting security
Principle: Compiler authority != Program authority. Always.
```

## TL;DR

- The Stage B self-hosted compiler is a Galerina application — it needs its own
  capabilities to read source, write build artefacts, and emit diagnostics
- Compiler authority must NEVER flow into user programs — a malicious source
  file cannot inherit `filesystem.read` from the compiler
- `RootCapabilityProvider` is the governance boundary that enforces this
  separation

---

## The Threat Model

Stage A hosts the compiler in TypeScript. Authority boundaries are implicit:
the compiler process owns filesystem access, and that access is ambient. Nothing
in Stage A prevents a user program from inheriting whatever the compiler process
can do — the separation exists only by convention, not by enforcement.

Stage B introduces a Galerina compiler. Without explicit isolation, user code
executed during compilation (macro expansion, build scripts, plugin hooks) could
potentially observe or inherit compiler-level capabilities: `filesystem.read`,
`package.write`, `manifest.read`. This is unacceptable.

The threat is not theoretical. Supply-chain attacks against build toolchains
routinely exploit exactly this gap — the moment a malicious dependency can read
the compiler's filesystem handle or write to the package output directory, the
build is compromised. Galerina must close this gap structurally, not by policy
convention alone.

---

## Core Principle

```
Compiler is trusted. Code being compiled is not.
Compiler authority never flows automatically into user programs.
```

The compiler must declare its own capabilities as a governed Galerina application.
Those capabilities are scoped to the compiler runtime. User programs receive a
separate, disjoint capability scope issued by `UserRuntime` — not inherited from
`CompilerHost`.

---

## Authority Domains

Galerina Stage B defines five authority domains. No domain inherits authority from
another automatically.

| Domain          | Holder             | Scope                                      |
| --------------- | ------------------ | ------------------------------------------ |
| `BOOTSTRAP`     | Bootstrap init     | Reads environment, initialises root scopes |
| `COMPILER`      | `CompilerHost`     | Source read, artefact write, diagnostics   |
| `BUILD`         | Build graph runner | Dependency fetch, cache read/write         |
| `USER_PROGRAM`  | `UserRuntime`      | Only what the user program declares        |
| `RUNTIME`       | Governed runtime   | Effect execution, audit emission           |

Compiler and user code never share authority. The `RootCapabilityProvider`
issues separate capability scopes to `CompilerHost` and `UserRuntime`. Neither
can escalate into the other's domain.

---

## Compiler Capability Set

The compiler declares a minimum viable capability set. Any capability not listed
here is denied by default — including capabilities that appear reasonable but are
not required for compilation.

### Declared minimum

```text
filesystem.read          — read source files, packages, config
filesystem.write         — write build artefacts and cache
package.read             — resolve and read dependency packages
manifest.read            — read package manifests and lock files
report.write             — emit diagnostics and structured error output
compiler.graph.read      — read the compilation graph state
compiler.graph.write     — mutate the compilation graph state
```

### Explicitly denied by default

```text
network.read             — compiler does not fetch from the internet at runtime
network.write            — compiler does not POST or push at runtime
secret.read              — compiler does not access secret stores
database.read            — compiler does not query databases
database.write           — compiler does not write to databases
email.send               — compiler does not send email
payment.process          — compiler does not process payments
```

Network access during package resolution is handled by the `BUILD` domain under
separate authority, not by `CompilerHost` directly.

---

## Compiler Manifest in Galerina

If the language is governance-first, the compiler must be the first program that
lives under its own rules. The compiler declares its capabilities in Galerina
source — not in JSON, not in a sidecar config file, not as ambient process
permissions. This is the milestone.

```galerina
package compiler.core
  version "0.1.0"
  trust level: compiler

contract {
  intent {
    purpose "Transform Galerina source into Governed IR artefacts"
    domain  compiler
    actor   COMPILER
  }

  effects {
    allow filesystem.read
    allow filesystem.write
    allow package.read
    allow manifest.read
    allow report.write
    allow compiler.graph.read
    allow compiler.graph.write

    deny  network.read
    deny  network.write
    deny  secret.read
    deny  database.read
    deny  database.write
    deny  email.send
    deny  payment.process
  }

  rules {
    require "Compiler capability scope is disjoint from UserRuntime scope"
    require "No compiler capability may propagate into a user-program flow"
    require "All capability grants are logged to runtime-audit.jsonl"
  }

  audit {
    required  true
    event     "compiler.capability.grant"
    event     "compiler.capability.denial"
  }
}
```

The compiler build uses this contract to prove at compile time that the
compiler's own executable cannot attempt operations outside its declared effects.
The effect checker enforces this the same way it enforces user program effects —
there is no privileged bypass for compiler code.

---

## Authority Propagation Rules

### Forbidden

```text
COMPILER capability -> USER_PROGRAM flow
  Rationale: user code is untrusted; it must not inherit compiler authority

CompilerHost filesystem.read -> UserRuntime scope
  Rationale: source file access must not leak into the compiled program's
  runtime context

BUILD dependency resolution authority -> USER_PROGRAM execution
  Rationale: resolving a package during build does not grant that package
  runtime authority beyond its own declared scope
```

### Allowed

```text
COMPILER capability -> CompilerHost internal operation only
  Example: filesystem.read used to open a .spore source file

BUILD capability -> package cache read/write within BUILD domain
  Example: fetching a resolved package into the local cache

USER_PROGRAM capability -> UserRuntime governed effects only
  Example: a user flow declared with `uses database.read` executes under
  that specific grant, scoped to that flow's execution context
```

Propagation rules are enforced structurally by `RootCapabilityProvider` — not
by documentation convention.

---

## Bootstrap Runtime Architecture

```
RootCapabilityProvider
  |
  |-- CompilerHost             (COMPILER domain capability scope)
  |     |-- Parser
  |     |-- Type checker
  |     |-- Effect checker
  |     |-- GIR emitter
  |     |-- Diagnostic writer
  |
  |-- BuildGraphRunner         (BUILD domain capability scope)
  |     |-- Dependency resolver
  |     |-- Cache manager
  |     |-- Package fetcher
  |
  |-- UserRuntime              (USER_PROGRAM domain capability scope)
        |-- Governed execution
        |-- Effect dispatch
        |-- Audit emitter
```

`RootCapabilityProvider` owns authority. It issues scoped capability tokens to
each subsystem at initialisation. Tokens are not transferable. A subsystem that
receives a `COMPILER` scope token cannot forward it to `UserRuntime`.

At no point does `UserRuntime` hold a reference to `CompilerHost`'s capability
scope. The separation is structural, not nominal.

---

## Self-Hosting Verification Integration

Deterministic self-hosting verification requires that Stage A and Stage B
compilation runs produce identical output given identical input. Authority scope
is part of that guarantee.

`RootCapabilityProvider` ensures:

```text
Stage A compilation run  -> compiler receives identical declared capability set
Stage B compilation run  -> compiler receives identical declared capability set

If either run attempts an undeclared capability:
  -> the attempt is denied
  -> a denial event is written to runtime-audit.jsonl
  -> the run is marked non-deterministic
  -> verification fails
```

A capability denial during one run but not the other is a verification failure,
not a minor deviation. It indicates the two compilers are not behaviourally
equivalent.

See `galerina-deterministic-selfhost-verification.md` for the full verification
protocol.

---

## Audit Requirements

Every capability used by the compiler is auditable. The following events are
emitted to `runtime-audit.jsonl` for every compiler invocation:

```text
compiler.capability.grant    — scope issued to CompilerHost at start
compiler.capability.grant    — scope issued to UserRuntime at start
compiler.graph.read          — each read of the compilation graph
compiler.graph.write         — each mutation of the compilation graph
filesystem.read              — each source file opened by CompilerHost
filesystem.write             — each artefact written by CompilerHost
report.write                 — each diagnostic event emitted
compiler.capability.denial   — any attempted undeclared operation
```

Audit events carry the authority domain, the originating component, a
content-hash of the relevant artefact where applicable, and a monotonic
event sequence number anchored to the SPORE-Graph EventDAG.

Audit records are append-only. The compiler cannot suppress or redact its own
capability audit trail.

---

## Stage B Scope

### What is defined now

This document defines the architecture. Specifically:

```text
- Five authority domains and their boundaries
- Compiler capability set (minimum declared, maximum denied)
- RootCapabilityProvider as the governance boundary
- Authority propagation rules (forbidden and allowed)
- Bootstrap runtime component topology
- Self-hosting verification integration point
- Audit requirements per capability
```

### What is implemented in Stage B

```text
- RootCapabilityProvider component
- Compiler capability scope issuance
- UserRuntime capability scope issuance (disjoint from compiler)
- Capability denial enforcement
- Audit event emission for all compiler capability grants and denials
```

### The milestone

The compiler declares its own capabilities in Galerina source — using the same
contract syntax as any other governed Galerina program. This is the first
self-governing artefact in the Galerina toolchain. If the compiler cannot declare
its own authority under its own rules, the governance model is not yet real.

---

## Rules at a Glance

```text
1. Compiler authority is scoped to COMPILER domain. It does not leak.
2. User programs receive a USER_PROGRAM scope. It does not inherit COMPILER.
3. RootCapabilityProvider issues all scopes. No scope is ambient or inherited.
4. The compiler declares its own capabilities in Galerina source.
5. Undeclared capabilities are denied. Denials are audited.
6. Authority domains are structurally disjoint — not separated by convention.
7. Self-hosting verification requires identical authority scope across both
   Stage A and Stage B runs. Any deviation is a verification failure.
```

---

## See Also

```text
capability-registry.yaml                         — full capability definitions
galerina-semantic-graph-system.md                  — SPORE-Graph EventDAG
galerina-deterministic-selfhost-verification.md    — verification protocol
galerina-governed-memory-blocks.md                 — governed object identity
authority-model.md                               — compile-time vs runtime authority
compile-time-vs-runtime-authority.md             — boundary enforcement model
runtime-audit-log-format.md                      — runtime-audit.jsonl schema
bootstrap-runtime-roadmap.md                     — Stage A/B/C bootstrap phases
```
