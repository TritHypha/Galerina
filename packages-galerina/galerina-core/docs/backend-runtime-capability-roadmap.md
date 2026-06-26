# Backend Runtime Capability Roadmap

This document records what Galerina should support as a clear, safe backend
language and runtime without framing the work as a comparison against other
language communities.

## Scope

```text
language design
checked runtime behavior
secure web application execution
typed APIs
agent/tool gateway services
future compute target planning
AI-readable source and reports
```

Not in scope:

```text
full framework design
CMS or admin UI design
provider-specific package design
cloud platform design
low-level systems target implementation
```

## Primary Rule Set

Galerina should be designed around these rules:

```text
1. Stay developer friendly.
2. Keep the learning curve clear.
3. Make backend code strict by default.
4. Make source and reports AI-readable.
5. Treat uncertainty as an explicit state.
6. Put security policy in source-visible contracts.
7. Reduce unnecessary memory use.
8. Reduce unnecessary compute in hot paths.
9. Be vector-ready without making vector code mandatory.
10. Support repetitive AI compute tasks safely.
11. Remain CPU-compatible by default.
12. Keep runtime behavior typed, permissioned and reportable.
13. Keep framework-specific features outside the language core.
14. Make the secure web runtime the first production-value target.
```

## Secure Web Runtime Slice

The first useful backend slice should include:

```text
typed flows
typed request and response contracts
typed JSON decoding and encoding
Result and Option
exhaustive map
effects
permissions
secret handling
route manifests
source maps
runtime reports
safe package authority
production gates
```

The runtime should be able to serve checked Galerina API code without first
requiring a native executable.

## Performance Direction

Galerina should become faster for web apps by making common runtime work
precomputed, cached and compact.

Runtime optimizations:

```text
cache parsed source
cache typed IR
generate route tables
generate typed JSON codecs
precompute effect and permission checks
store route limits in compact manifests
use read-only payload views
stream large bodies
avoid hidden large copies
reuse safe runtime workers
separate dev checks from production hot paths
```

Compiler and runtime reports should expose:

```text
large payload copies
unbounded loops
expensive JSON decoding
slow route policies
unsafe fallback
hot routes
memory pressure
blocking calls
```

## Core Capability Areas

| Area | Galerina requirement |
|---|---|
| Types | Strict scalar, record, enum, option, result and collection types. |
| Control flow | `if`, loops, `map` (pattern matching), exhaustive state handling and explicit returns. |
| Errors | Declared recoverable errors through `Result`. |
| Missing values | Explicit `Option`, not silent missing values. |
| API boundaries | Typed requests, typed responses, route limits and policy reports. |
| Effects | File, network, database, AI, shell and interop effects declared before use. |
| Memory | Ownership modes, read-only views, explicit clone, resource scopes and reports. |
| Concurrency | Structured await, bounded queues, cancellation and backpressure. |
| Packages | Lockfiles, permissions, selected profiles and authority reports. |
| Interop | Trusted modules with ownership, nullability, timeout and audit rules. |
| AI context | Redacted project maps, source maps and machine-readable summaries. |
| Targets | Runtime first, web-safe module output next, isolated compute targets later. |

## Features To Keep Package-Owned

These should not become core language syntax:

```text
ORMs
CMS features
admin dashboards
frontend framework syntax
provider SDKs
cloud-specific deployment syntax
model provider APIs
database provider APIs
device APIs
accelerator vendor syntax
```

Galerina core should define contracts, checks and reports. Packages and adapters
should connect those contracts to external systems.

## Syntax Direction

Prioritize syntax that makes safety visible:

```text
secure flow
pure flow
async flow
effects [...]
Result<T, E>
Option<T>
match value { ... }
readonly view
clone(value)
resource scope
policy block
```

Avoid syntax that hides work, mutation or authority:

```text
implicit global state
implicit package authority
implicit dynamic execution
implicit secret output
implicit fallback
implicit type coercion
unchecked runtime mutation
```

## Roadmap

Priority order:

1. Freeze v1 syntax around current examples.
2. Build a parser and typed AST for the v1 subset.
3. Implement type, effect and permission checking.
4. Build the secure runtime slice for APIs and webhooks.
5. Add typed JSON codec generation.
6. Add route manifests and production gates.
7. Add memory reports for payloads, copies and resource scopes.
8. Add structured await, cancellation and bounded queues.
9. Add package permission reports and lockfile validation.
10. Add optional isolated compute targets for hot functions.

## Product Statement

```text
Galerina is a secure web runtime language: typed, memory-safe, permissioned,
reportable and AI-readable from the first useful milestone.
```
