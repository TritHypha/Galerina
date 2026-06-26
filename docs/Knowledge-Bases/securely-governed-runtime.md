# Securely Governed Runtime

## Purpose

The Galerina Securely Governed Runtime is the runtime architecture direction for
checked Galerina execution.

It is designed for:

- governed execution
- auditable computation
- AI-safe development
- policy-native runtime control
- memory-aware execution
- future-capable compute models
- lightweight secure backend systems

The runtime is not designed primarily around raw speed. It is designed around:

- controlled authority
- verifiable execution
- explicit boundaries
- auditability
- architectural stability
- future compute compatibility
- efficient secure execution

## Core Philosophy

```text
Security first.
Code second.
Authority never implicit.
```

Galerina should establish governance before code is allowed to act. Packages,
plugins, AI tools, storage, network access and compute targets do not receive
authority automatically.

This runtime philosophy is the execution-focused form of the broader
[Architecture Charter](architecture-charter.md).

## Foundational Principles

### Nothing Has Authority Until Verified

Nothing is trusted by default:

- code
- plugins
- packages
- AI-generated output
- user input
- malicious data
- network data
- storage data
- runtime effects
- hardware accelerators

Authority must always be declared, visible, attributable, revocable and
auditable.

Data cannot carry authority. User input, API payloads, tool results, package
metadata and AI output may claim roles, permissions or ownership, but only the
runtime capability system may grant authority after policy evaluation.

### AI Authority Is Not Self-Granted

AI may generate code, propose policy, request capabilities and produce reports.
AI may not grant capabilities to itself, approve its own policy changes or edit
its own execution boundary.

AI-authored work must remain reproducible, reviewable, testable and auditable.
See [AI Self-Modification Governance](ai-self-modification-governance.md).

### Policy-Native Execution

Policy is not middleware. Policy is part of execution itself.

Execution must occur inside:

- capability boundaries
- package boundaries
- policy boundaries
- effect boundaries
- audit boundaries

### Effect-Aware Runtime Security

All external access must be declared before execution.

Effects include:

- filesystem
- database
- network
- shell
- AI/tool access
- GPU/NPU access
- storage
- external services
- compute accelerators

Undeclared effects fail by default.

### Malicious Data And Resource Exhaustion

Untrusted data may try to gain authority, trigger unsafe effects, exhaust CPU,
exhaust memory, exploit parsers, escape sandboxes, leak secrets or abuse
hardware accelerators.

The runtime must assign validation, boundary and execution budgets before
handling untrusted data.

See [Malicious Data And Exploit Resistance](malicious-data-and-exploit-resistance.md).

### Auditable Computation

Auditability is part of correctness.

Galerina programs should explain:

- what ran
- what data moved
- what permissions were used
- what policy approved execution
- what effects occurred
- what boundaries were crossed
- what package owned execution
- what secrets were touched
- what checks passed
- what version produced the result

If execution cannot be explained, it is not production-safe.

### Memory Security

The runtime must prevent unsafe memory access, buffer overflow, use-after-free,
uncontrolled shared mutation, secret leakage and unsafe pointer exposure.

Memory access must remain typed, bounded, auditable and deterministic.

### Future-Capable Compute

Galerina should work on binary systems today while avoiding assumptions that all
future compute is binary-only, electrical-only, CPU-local or Von Neumann-only.

Future support for tri-state logic, optical compute, photonic compute, GPU/NPU
compute and accelerator hardware must extend Galerina through declared targets
and boundaries, not through hidden runtime assumptions.

### Lightweight Runtime

The trusted runtime core should remain small, understandable, portable,
inspectable and memory-friendly.

The runtime should avoid:

- hidden global state
- unnecessary background services
- heavy dependency chains
- automatic plugin loading
- uncontrolled caches
- runtime magic

The runtime should prefer:

- explicit modules
- declared capabilities
- lazy loading after trust checks
- bounded memory
- predictable execution
- small trusted core
- optional extensions

## Verified Execution Plan

Runtime execution should follow this model:

```text
request
 -> planning
 -> verification
 -> capability locking
 -> execution
 -> audit proof
```

Core principle:

```text
Plan once.
Verify once.
Execute safely.
Audit always.
```

The runtime should build a verified execution plan, determine effects and
capabilities before execution, allocate memory predictably, minimise repeated
checks and deny undeclared behaviour immediately.

Every verified execution plan should also include CPU, wall-time, memory,
recursion, loop, task, tool-call, network and hardware access budgets where
relevant.

## Security-Positive Optimisation

Galerina may optimise memory and speed only when the optimisation preserves or
improves security.

Preferred optimisations include:

- immutable data by default
- request-scoped memory arenas
- zero-copy typed views
- copy-on-write mutation
- bounded memory
- bounded caches
- lazy loading after trust checks
- small trusted core
- precompiled policy decisions
- static effect extraction
- streaming over buffering
- deterministic cleanup
- data minimisation

Core principle:

```text
Faster only if safer or equally safe.
Smaller only if clearer or equally clear.
```

## Runtime Trust Zones

### Trusted Core

The trusted core owns execution integrity, memory integrity, policy enforcement,
capability enforcement and audit integrity.

It should remain small, understandable, inspectable and verifiable.

### Governed Runtime Zone

The governed runtime zone handles application execution, effect handling,
package boundaries, AI/tool execution and external boundaries.

### Untrusted Zone

The untrusted zone includes plugins, third-party packages, external services,
AI-generated code, hardware accelerators, foreign runtimes and unsafe interop.

Untrusted systems may execute only through declared boundaries.

## Runtime Structure

### Galerina Core

Responsible for parser, type checker, effect checker, capability declarations,
package rules, syntax stability and IR generation.

### Governed Execution Kernel

Responsible for execution, policy, effects, capabilities, audit hooks and
security checks.

### Boundary Runtime

Responsible for filesystem, database, network, shell, AI tools, GPU/NPU,
external services and compute accelerators.

All boundaries follow:

```text
declare -> approve -> execute -> audit
```

### Web/API Layer

Responsible for HTTP, routing, request contracts, response contracts, sessions
and streaming. This layer depends on the governed execution kernel for
authority.

### Backend Targets

Possible execution targets include Node-hosted runtime, WASM, CPU-native
runtime and future GPU/NPU/photonic/optical systems.

## Restricted Concepts

### Inheritance

Inheritance should be disallowed or heavily restricted. Prefer explicit
composition because inheritance hides behaviour and complicates audit paths.

### Global Mutable Variables

Global mutable state is disallowed. Use scoped vaults or declared service
vaults with owner, type, lifetime, concurrency, capability and audit rules.

### Dynamic Eval

Unrestricted runtime code generation is disallowed because it bypasses
verification, audit and policy visibility.

### Monkey Patching

Runtime mutation of behaviour is disallowed because it hides execution changes
and authority paths.

### Silent External Access

Filesystem, database, shell, network and AI/tool access must never occur
silently. All external access must be declared as effects.

## Final Principle

The purpose of the Securely Governed Runtime is trusted, governed and
explainable computation.
