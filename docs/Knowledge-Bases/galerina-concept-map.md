# Galerina Concept Map

## Purpose

Galerina concepts should be easy for humans and AI tools to locate without
weakening the newer core model:

```text
data -> flow -> permission -> boundary -> report
```

The older detailed concept list still matters, but it should sit underneath the
five-concept model instead of replacing it.

The concept map is part of the AI-understandable architecture policy: AI tools
should read stable concept definitions, indexes and project graph output rather
than infer architecture from folder names alone.

---

## Governance Architecture Pipeline

Galerina's execution model follows a four-stage semantic pipeline. Each stage has
a full specification document:

```text
intent
    ↓
governed execution plan
    ↓
coordinated compute
    ↓
audit proof
```

| Stage | What it answers | Document |
|---|---|---|
| **Intent** | *Why does this system exist?* Purpose, required authority, denied boundaries, expected outcomes. Machine-readable, compiler-enforceable. | [galerina-concept-intent.md](galerina-concept-intent.md) |
| **Governed Execution Plan** | *How is the system allowed to execute?* Capabilities granted, effects allowed, resources permitted, behaviors denied. The operational contract. | [galerina-concept-governed-execution-plan.md](galerina-concept-governed-execution-plan.md) |
| **Coordinated Compute** | *How does governed execution actually occur?* Target selection, fallback coordination, memory isolation, accelerator dispatch, runtime verification. | [galerina-concept-coordinated-compute.md](galerina-concept-coordinated-compute.md) |
| **Audit Proof** | *What can be proven about execution?* Structured, verifiable runtime evidence of authority, policy compliance and safety guarantees. Not logs. | [galerina-concept-audit-proof.md](galerina-concept-audit-proof.md) |

The intent graph — the machine-readable semantic map of the entire system — is the data structure that connects these stages. See [galerina-intent-graph.md](galerina-intent-graph.md).

For the full 23-stage governance architecture (authority tracking, capability propagation, effect propagation, governance diffing, compliance generation, threat modelling and more), see [galerina-governance-architecture.md](galerina-governance-architecture.md).

---

## Core Model

| Core concept | Detailed concepts |
| --- | --- |
| `data` | models, requests, responses/views, classification, validators, projectors, redactors, generic and variant data shapes |
| `flow` | secure flows, routes, guards, context, scopes/lifetimes, errors, contract-defined behaviour, jobs, schedules |
| `permission` | policies, effects, capabilities, actor authority, audit rules |
| `boundary` | contracts, packages, repositories/storage, adapters/connectors, events, AI/tools, compute targets, polymorphic implementations |
| `report` | security reports, exposure reports, effect reports, capability reports, polymorphism reports, audit evidence, tests |

## V1-Critical Concepts

The first serious Galerina version should define these early:

- routes
- requests
- responses/views
- secure flows
- models
- contracts
- policies
- effects
- capabilities
- classification
- context
- scopes/lifetimes
- errors
- reports
- packages
- tests
- explicit polymorphism through contracts, adapters, variants and constrained
  generics
- AI-understandable architecture indexes for concepts, definitions,
  permissions, effects, contexts and component responsibilities

These concepts support secure web/API runtime work without pulling in later
platform features too early.

## Later Concepts

These remain important, but should not drive the first v1 surface:

- events
- pipelines
- jobs
- schedules
- external adapters/connectors
- compute targets
- ontology/data platform features
- native/WASM/GPU/NPU/photonic targets

They should be represented as boundaries when needed, then expanded after the
core runtime model is stable.

## Detailed Concept Definitions

### Routes

Routes define public entry points.

Security rules:

- Routes must not accept raw untyped input.
- Routes must not return raw internal models.
- Routes must connect declared requests, responses/views, flows and policies.

### Requests

Requests define what is allowed to enter.

Request contracts should control body size, content type, unknown fields,
duplicate keys, validation and classification.

### Responses

Responses or views define what may leave.

Core rule:

```text
Models are internal.
Responses/views are safe output.
```

### Effects

Effects define what code may technically do:

- database read/write
- file access
- network access
- email sending
- queue publishing
- secret access
- AI model calls
- external API calls
- audit logging

Effects are not the same as capabilities. Effects say what code can do;
capabilities say what the actor is authorised to do.

### Capabilities

Capabilities describe declared permissions or powers:

- `users.read`
- `users.pii.read`
- `orders.cancel`
- `payments.refund`
- `ai.external_tool.call`

Sensitive actions and sensitive data exposure require capabilities.

### Classification

Classification marks the sensitivity of data:

- public
- public_id
- private
- pii
- financial
- internal
- secret
- credential

Classification lets Galerina enforce rules such as:

- secret cannot be returned
- PII requires permission
- internal data cannot leave public routes
- credentials cannot be logged

### Context

Context is how Galerina avoids hidden global request state.

Context may include:

- request id
- actor/user
- tenant id
- locale
- trace id
- capabilities
- runtime environment
- audit metadata

Rule:

```text
No hidden global currentUser.
No hidden global request.
Pass context explicitly.
```

### Scopes And Lifetimes

Scopes define where sensitive values are allowed to exist.

Sensitive values such as secrets, payment tokens, credentials, temporary keys,
large memory values and native handles must not escape their permitted scope.

### Errors

Errors are explicit and typed.

Important forms include:

- `Result<T, E>`
- `Option<T>`
- `ApiError`
- `ValidationError`
- `SecurityError`
- `StorageError`
- `ExternalServiceError`

Core rule:

```text
No hidden exception paths as the default model.
```

### Match Catch-All Branch

The `_ => { ... }` branch inside a `match` means "anything else goes here".
It is the default or fallback branch.

For open-ended external values such as webhook event names, provider status
strings and future API values, `_` can be useful. For security-sensitive code it
must not silently ignore unknown cases. It should return a typed error, return
an explicit ignored response, log a safe redacted event, trigger review or fail
closed.

See [Match Catch-All Branch](match-catch-all-branch.md).

### Events

Events define typed asynchronous messages, webhook payloads, queue messages or
job payloads that cross a boundary.

Event contracts should define payload shape, topic or source, schema version,
idempotency, replay handling, classification, effects and audit rules.

Events are important boundary concepts, but full event runtime, queue, job and
schedule engines can remain later implementation work unless needed by the
secure web runtime.

See [Boundary Extension Concepts](boundary-extension-concepts.md).

### Repositories And Storage

Models should not directly own database behaviour.

Prefer explicit storage/repository boundaries:

```galerina
let user = try UsersRepository.findRequired(userId)
```

Storage contracts define data source, allowed queries, mapping, effects,
encryption requirements and parameterised query rules.

See [Boundary Extension Concepts](boundary-extension-concepts.md).

### Adapters And Connectors

Adapters connect Galerina to external systems safely.

Examples:

- payment provider adapter
- email provider adapter
- search adapter
- object storage connector
- AI model adapter

Adapters are boundaries and must be permissioned, effect-checked and
reportable.

See [Boundary Extension Concepts](boundary-extension-concepts.md).

### Polymorphism

Galerina supports explicit polymorphism through contracts, adapters, union/match
variants and constrained generics.

It should not use class inheritance as the main model, and polymorphic behaviour
must not hide permissions, effects, data exposure, boundaries, errors or audit
requirements.

See [Polymorphism](polymorphism.md).

### Packages

Packages define code and authority boundaries.

Package rules should cover exports, internal code, allowed effects, owned data,
dependencies and required permissions.

### Reports

Reports are first-class outputs.

Common reports include:

- policy reports
- model exposure reports
- contract reports
- effect reports
- capability reports
- security reports
- memory reports
- AI context reports

### Tests

Tests should understand Galerina security rules.

Useful tests include:

- route rejects raw input
- response excludes secret field
- policy denies undeclared network effect
- model requires classified fields
- flow handles `Result<T, E>` and `Option<T>`

## Best Mental Model

```text
Routes define entry points.
Requests define what can enter.
Models define internal data.
Classification defines data sensitivity.
Responses/views define what can leave.
Secure flows define controlled execution.
Policies define what is allowed.
Capabilities define who or what is authorised.
Effects define what the code can do.
Contracts define boundary agreements.
Context replaces global request state.
Scopes control sensitive lifetime.
Events define asynchronous boundary messages.
Repositories and storage define persistence boundaries.
Adapters and connectors define external integration boundaries.
Polymorphism allows different implementations only through visible contracts,
variants, constraints and reports.
Packages define code and authority boundaries.
Reports prove what was checked.
Tests verify the rules stay true.
```
