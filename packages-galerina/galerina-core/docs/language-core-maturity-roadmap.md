# Language Core Maturity Roadmap

Galerina already has a strong direction:

```text
strict typing
explicit Option and Result
memory-safety goals
API contracts
typed JSON decoding
security policies
compute planning
source maps
reports
AI-readable project context
CPU-compatible execution baseline
```

Galerina is still a language-design and v0.1 prototype project. Planning
documents, simulation reports and prototype checker slices must not be presented
as a production compiler.

## Maturity Baseline

The core language needs enforceable compiler and runtime behavior:

```text
parser
AST
symbol table
type checker
memory checker
effect checker
permission checker
module system
protocol/interface system
trusted interop boundary
test model
standard library
source-mapped runtime errors
build and release modes
package manager
secure web runtime
```

## Required Compiler Work

| Area | Galerina needs |
|---|---|
| Parser | A real parser for the v1 syntax subset. |
| AST | Stable nodes for flows, types, routes, effects, policies and map blocks (pattern matching). |
| Symbols | Module, package, flow, type and visibility resolution. |
| Types | Strict checking for scalar, record, enum, option, result and collection types. |
| Effects | Compile-time effect declarations and permission decisions. |
| Memory | Ownership modes, read-only views, explicit clone, resource scopes and reports. |
| map (Pattern Matching) | Exhaustive handling for Result, Option, enums, Tri and Decision. |
| JSON | Typed decode/encode generation with unknown-field policy. |
| Runtime | Checked secure runtime for APIs, webhooks, queues and workers. |
| Reports | Security, memory, API, package, target and AI-safe reports. |

## Required Runtime Work

The first runtime should support secure web applications without native executable
compilation.

Required runtime capabilities:

```text
load checked project manifests
serve route manifests
apply request body limits
decode typed JSON
enforce route policy
enforce effects and permissions
redact secrets
run secure flows
emit typed responses
write source-mapped reports
cache typed IR
separate development and production profiles
```

## Standard Library Baseline

Start small:

```text
print
log
File
Path
Stream
Json
Http
Env
DateTime
Result
Option
Array
Map
Set
Pattern
Crypto
Test
Secret
SecureRandom
```

Keep framework features, ORMs, admin UI, CMS behavior and frontend framework
syntax outside the standard library.

## Priority Order

The canonical sequencing is defined in `docs/CORE_FOUNDATION_ROADMAP.md`.
This file follows that ordering. Memory semantics must be finalized before
parser stabilization because grammar and reserved keyword allocation depend
on semantic commitments. If the parser is built first, keyword conflicts and
grammar rewrites become inevitable.

1. Freeze v1 syntax and examples.
2. Commit memory model: ownership, readonly views, move semantics, borrow
   rules, bounds checks, raw pointer ban, compiler diagnostics.
3. Reserve keywords and semantic forms: produce the authoritative v1 keyword
   table before lexer implementation begins.
4. Build parser, AST and symbol table.
5. Implement type, effect and permission checks.
6. Implement Result, Option, Tri, Decision and exhaustive map semantics.
7. Implement AST-based borrow/lifetime checker (depends on parser from step 4).
8. Build secure web runtime slice.
9. Generate typed JSON codecs and route manifests.
10. Add source-mapped runtime errors.
11. Add Galerina test syntax and test reports.
12. Define package lockfile, permissions and trusted interop boundaries.
13. Add structured await, streams, cancellation and backpressure.
14. Add debug, profile and lint tooling.

## Required Positioning

Use this wording:

```text
Galerina is not yet a production compiler.
Galerina has prototype tooling and planning documents.
Galerina must implement the parser, checker, memory model, effect model, module
system, protocols, trusted interop boundary, tests, standard library and secure
runtime before production maturity claims.
```

## Outcome

```text
Galerina becomes credible when its safety, speed and AI-readability are enforced
by tooling and runtime behavior, not only described in documentation.
```
