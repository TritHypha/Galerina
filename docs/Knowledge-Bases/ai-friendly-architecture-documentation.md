# AI-Friendly Architecture Documentation

## Definition

Galerina's repository, runtime structure, and documentation must be designed for **structured machine understanding** — not only human browsing. AI should never need to guess where security lives, where authority is decided, or where compute routing occurs.

```text
The architecture should be understandable without guessing.
```

## Core Rule

```text
Never require AI to guess architecture intent.
```

Everything important must be: named, declared, mapped, defined, indexed, linked.

## 1. Stable Naming Rules

Do NOT rename major runtime concepts after stabilisation. AI reasoning depends on stable naming.

Prefer specific names:

```text
Director
Sheriff
Steward
Balancer
Scheduler
Assembler
```

Over vague names like `manager`, `service`, `helper`, `processor`.

## 2. Runtime Folder Structure

```text
/runtime
  /core
  /governance
  /planning
  /execution
  /hardware
  /memory
  /audit
  /security
  /ir
  /compiler
  /docs
  /tests
```

## 3. Explicit Runtime Maps Per Component

Every major system should contain:

```text
README.md     — what it is
ARCHITECTURE.md — what it controls
SECURITY.md   — trust level and authority
TESTS.md      — what tests exist
```

## 4. Machine-Readable Runtime Index

```text
/runtime/runtime.index.yaml
```

Example structure:

```yaml
runtime:
  components:
    sheriff:
      role: governance authority
      location: runtime/governance/sheriff
      responsibilities:
        - capability enforcement
        - policy enforcement
        - runtime budgets
      depends_on:
        - governed_ir
        - audit_system
```

## 5. Runtime Graph Files

```text
/docs/runtime/runtime.graph.yaml
```

Documents execution order, dependencies, and authority boundaries:

```yaml
flow:
  - intake_guard
  - parser
  - ast
  - semantic_checks
  - governance_checks
  - governed_ir
  - ir_verifier
  - execution_classification_engine
  - runtime_director
  - sheriff
  - steward
  - balancer
  - scheduler
  - assembler
  - response_gate
  - audit
```

## 6. Definition Files

```text
/docs/runtime/definitions/
  capability.md
  effect.md
  governed_ir.md
  dense_compute.md
  control_compute.md
  verified_fast_pipe.md
```

AI struggles when terminology is ambiguous. Definitions solve this.

## 7. Architecture Decision Records (ADR)

```text
/docs/adr/
  ADR-001-governed-ir.md
  ADR-002-no-inheritance.md
  ADR-003-capability-model.md
  ADR-004-partially-async-runtime.md
```

Each ADR explains: decision, reason, tradeoffs, future implications.

## 8. Security Boundary Map

```text
/docs/runtime/security-boundaries.md
```

Shows what can grant authority, what cannot, what is trusted, what is passive.

Example:

```text
Governance enforcement = trusted authority
Scheduler             = untrusted coordinator
GPU module            = passive executor
```

## 9. Component Responsibility Tables

Every runtime component should declare:

```yaml
may_grant_authority: false
may_execute_code: true
may_access_network: false
may_schedule_tasks: true
audit_required: true
```

## 10. Data Flow Documentation

Document:

```text
data ownership
memory ownership
copy boundaries
zero-copy regions
conversion boundaries
```

Especially for AI compute, GPU, TPU, and photonic compute paths.

## 11. AI-Friendly Code Rules

```text
Use: small files, stable naming, explicit imports, minimal magic
Avoid: deep inheritance, dynamic dispatch, runtime monkey patching, hidden dependency injection
```

## 12. Runtime Metadata in Source Files

At the top of major files:

```text
Component: Runtime Sheriff
Purpose: Governance authority enforcement
Trusted: true
Grants Authority: true
Runtime Stage: Governance
Depends On: Governed IR, Capability System
```

## 13. Runtime Test Maps

```text
/docs/runtime/test-matrix.yaml
```

Maps components to their test coverage so AI can verify gaps.

## Final Principle

```text
If humans must reverse-engineer the runtime,
AI systems will struggle even more.

Design the runtime and documentation
as a structured knowledge system,
not just a code repository.
```
