# What Galerina Refuses to Become

## Core Principle

```text
Galerina should govern execution,
not become an uncontrolled everything-language.
```

The most important architectural decisions are not what Galerina adds — they are what Galerina refuses to allow.

## Refused Patterns

### 1. Hidden Magic Behaviour

```text
implicit globals
implicit authority
magic dependency injection
hidden runtime mutation
automatic privilege escalation
silent imports
hidden event chains
```

Reason: breaks auditability, confuses AI tools, creates security risk.

### 2. Classical OOP Complexity

```text
inheritance
deep polymorphism
method override chains
multiple inheritance
runtime monkey patching
```

Reason: hidden behaviour chains, harder reasoning, harder audit.

Galerina prefers: composition, explicit capability usage, governed flows, typed contracts.

### 3. Arbitrary Runtime Mutation

```text
modify runtime while executing
rewrite permissions dynamically
replace runtime modules live
```

Reason: destroys verified trust, breaks cache validity, breaks audit guarantees.

### 4. Ambient Authority

Code must not access resources by default:

```text
global filesystem access
global network access
global secret access
global DB access
```

Galerina always requires explicit declaration:

```galerina
allow db.read
allow network.external
allow vault.write
```

### 5. Unsafe Reflection

Runtime inspection that bypasses governance is refused.

Allowed reflection must be:

```text
compile-time
metadata-only
permission-aware
```

### 6. Runtime Eval / Dynamic Code Injection

```text
eval()
runtime code generation
dynamic unsafe execution
```

Unless heavily sandboxed and governed. Reason: breaks verification, breaks audit, breaks trust model.

### 7. Unbounded Async/Event Chains

Event chains without budget, traceability, audit, and permission:

```text
event -> event -> event -> event  (without governance)
```

### 8. Direct Hardware Access By Default

```text
raw GPU memory access
raw device DMA
unsafe driver access
```

Galerina uses a governed compute interface instead.

### 9. Language-Level Threading Complexity

Exposing to developers:

```text
mutexes
shared mutable memory
manual thread management
```

Galerina prefers: runtime coordination, message passing, governed scheduling.

### 10. Syntax Cleverness

```text
operator abuse
symbol-heavy syntax
too much shorthand
```

Reason: hurts AI readability, global readability, and audit clarity.

### 11. Hidden Memory Ownership

```text
unclear ownership
implicit reference lifetimes
hidden shared mutation
```

Prefer: immutable locals, vaults for shared state, explicit ownership.

### 12. Over-Generalization

Galerina is not trying to become:

```text
OS
desktop UI toolkit
game engine
graphics engine
kernel replacement
```

Its strength is governed execution coordination.

### 13. Runtime Trust Assumptions

```text
cache == trusted forever
compiled == safe forever
internal == trusted automatically
```

Everything must remain context-verified, policy-aware, and revalidatable.

### 14. Weak Type Identity

```text
everything = string/int/uuid
```

Galerina prefers semantic types:

```galerina
type SessionUUID = UUID
type ActorUUID = UUID
type AuditEventId = UUID
```

### 15. AI Guessing Architecture

```text
undocumented runtime behaviour
implicit rules
undefined authority chains
```

Everything important must exist in definitions, runtime graphs, policy docs, or ADR docs.

## What Galerina Does Focus On

```text
governed execution
auditability
hardware-aware orchestration
AI readability
security-first design
context-aware verification
typed authority
response safety
runtime coordination
```

## Most Important Rule

```text
If a feature makes execution harder to explain,
harder to audit,
or harder to govern,
it probably should not be part of Galerina.
```

```text
Galerina should remove ambiguity,
not add abstraction for its own sake.
```
