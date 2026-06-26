# Unified Syntax Architecture

## Definition

Galerina uses **one unified syntax** for all language concerns: application logic,
runtime configuration, build targets, security policy and effect declarations.

The file extension for all Galerina source files is `.spore`.

```text
One language.
One syntax.
One ecosystem.
```

## Why Not Multiple Syntaxes

A dual-language design creates fragmentation:

| Problem | Impact |
| --- | --- |
| Fragmented developer experience | Harder to learn |
| Multiple parsers | More compiler complexity |
| Runtime drift | Runtime rules differ from language rules |
| Tooling duplication | Editors, formatters, analyzers become harder |
| Security inconsistency | Policies become disconnected from code |
| Build confusion | Harder deployment and packaging |

Galerina is designed to be strict, predictable, auditable and governed. A single
syntax supports these goals far better.

## Five Declaration Domains

All domains share the same syntax rules. They differ in what they declare:

| Domain | Purpose |
| --- | --- |
| Program declarations | Application types, functions, business logic |
| Runtime declarations | Execution behaviour, workers, scheduling, memory |
| Compile declarations | Build targets, optimisation, artifact generation |
| Security declarations | Capabilities, permissions, policy boundaries |
| Effect declarations | Side-effect tracking and verification |

## Example: Unified .spore File

```galerina
package user_service

import database.users

type User {
  id: Id
  email: Email
}

fn get_user(id: Id) -> User {
  db.users.find(id)
}

runtime {
  memory: safe
  workers: 4
  isolation: strict
}

compile {
  target: ["wasm", "native"]
  emit: ["audit_report", "dependency_graph"]
}

security {
  allow: [
    db.read,
    network.internal
  ]

  deny: [
    file.system,
    network.external
  ]
}
```

## Domain Responsibilities

### 1. Program Layer

Application types, functions, modules, packages, data structures and business
logic.

```galerina
fn calculate_total(price: Decimal, qty: Int) -> Decimal {
  price * qty
}
```

### 2. Runtime Layer

Controls execution behaviour: workers, memory rules, isolation, resource
budgets, scheduling, fault recovery and queue management.

```galerina
runtime {
  workers: 8
  memory: safe
  scheduling: deterministic
}
```

### 3. Compile Layer

Controls build outputs: multi-target compilation, build configuration,
optimisation, packaging and artifact generation.

```galerina
compile {
  target: ["wasm", "native", "node"]
  optimisation: aggressive
  emit: ["reports", "audit"]
}
```

### 4. Security Layer

Capability declarations, permission enforcement, effect validation, policy
boundaries and least-authority execution. No ambient authority.

```galerina
security {
  allow: [
    db.read,
    network.internal
  ]

  deny: [
    network.external
  ]
}
```

### 5. Effects Layer

Explicit side-effect declarations for auditability and compile-time
verification:

```galerina
effects {
  uses: [
    db.read,
    cache.write,
    network.http
  ]
}
```

## External Backend Access

External systems are accessed only through capability-guarded interfaces. No
external access without declared permission:

```galerina
service payments {
  capability: network.internal
  endpoint "https://payments.internal"
}
```

## Suggested File Organisation

```text
src/
  main.spore
  auth.spore
  api.spore

runtime/
  workers.spore
  scheduling.spore

build/
  targets.spore
  reports.spore

security/
  policy.spore
  capabilities.spore
```

All files use valid `.spore` syntax.

## Core Principle

```text
One syntax + multiple declaration domains.

Do not split the ecosystem into multiple languages.
Do not separate runtime rules from application rules.
Keep security declarations in the same language as application logic.
```
