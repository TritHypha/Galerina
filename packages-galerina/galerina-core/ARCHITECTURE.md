# Galerina Architecture

This document describes the proposed architecture for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The architecture is designed around one main goal:

> One `.spore` source project should be able to produce multiple checked, secure and traceable outputs.

Galerina architecture should be AI-understandable. AI tools should read stable
concept definitions, package ownership, generated project graph data, report
metadata and canonical examples rather than infer architecture from folder
names. The detailed policy lives in
`docs/ai-understandable-architecture-policy.md`.

---

## Architecture Summary

Galerina should be built as a layered system.

```text
.spore source files
   â†“
lexer
   â†“
parser
   â†“
AST
   â†“
type checker
   â†“
memory checker
   â†“
security checker
   â†“
JSON/API contract checker
   â†“
intermediate representation
   â†“
optimiser
   â†“
target planners / emitters
   â†“
build outputs and reports
```

The compiler should support normal CPU execution first, while planning for GPU, WebAssembly, photonic and ternary targets.

The compiler should also be security-invariant aware. Galerina should preserve
declared policy as program meaning through a security-aware IR that carries
permissions, capabilities, classifications, exposure levels, ownership, actor
identity, trust boundaries, effects, audit requirements, package authority and
runtime isolation requirements. The detailed language note lives in
`docs/security-invariants-and-policy-proof.md`.

---

## Runtime Kernel Boundary

Galerina core defines the language, compiler checks, type system, effects, memory
safety rules, compute planning and report contracts.

Application runtime enforcement belongs in the optional Galerina Secure App Kernel:

```text
Galerina Core
  language/compiler/type system/effects/memory/compute

Galerina Logic
  Tri, Galerina, Decision, RiskLevel, Omni logic and logic reports

Galerina Vector
  vector values, dimensions, lanes, operations and vector reports

Galerina Compute
  compute planning, capabilities, budgets, offload and target selection

Galerina AI
  generic AI inference contracts, model metadata, safety policy and reports

Galerina Low-Bit AI
  low-bit / ternary model references, backend selection and CPU inference plans

Galerina Photonic
  wavelength, phase, amplitude, optical channels and photonic vocabulary

Galerina Target CPU
  CPU capability, SIMD, threading, memory and fallback reports

Galerina CPU Kernels
  low-bit, ternary, vector and matrix CPU kernel contracts

Galerina Target Native
  future native executable target planning and artifact metadata

Galerina Target Photonic
  photonic backend target plans that use galerina-core-photonic concepts

Galerina Secure App Kernel
  request lifecycle, validation, security, auth, rate limits, jobs and reports

Galerina API Server
  HTTP listening, route manifest loading, request normalisation and safe responses

Galerina Standard Packages
  HTTP adapters, SQL adapters, Redis queues, OpenAPI generators, JS/WASM generators

Galerina Full Frameworks
  web frameworks, CMS, admin UI, frontend adapters, ORM and template systems
```

Galerina core may describe safe API and webhook contracts. The Secure App Kernel is
the layer that receives requests, validates input, applies security policy,
checks auth, controls workload, queues heavy work and routes to typed flows.

The core value trust model uses `safe` and `unsafe`. `unsafe` values are
memory-safe but untrusted. They are inert until trust conversion through
`validate`, `guard` or `sanitize`, or until an explicit safe declaration is
allowed and reported. Unsafe values cannot be used in ordinary runtime
expressions, string/array helpers, query interpolation, shell execution,
workers, `GlobalVault` access or business logic.

`encode.*` belongs after trust conversion. It requires safe input and returns a
context-specific safe output such as `safe Html`, `safe UrlPart`,
`safe JavaScript`, `safe Css`, `safe Xml` or `safe ShellArg`. The detailed
language note lives in `docs/trust-conversion-and-data-safety.md`.

Checked execution plans should become immutable before runtime execution.
Normal source must not monkey patch runtime behaviour, inject hidden behaviour,
rewrite types, mutate metadata to gain authority or use reflection as execution
authority. Hardened profiles may deny unsafe blocks, runtime reflection, shell
execution, raw SQL and unsigned packages/plugins entirely.

Verified fast paths should use a context-tagged verified execution cache.
Parser, IR, policy, view, vault, compute, schedule, audit and whole-plan caches
may remember verified work, but they must not grant authority. Authority
Control decides reuse and can invalidate caches when source, Governed IR,
policy, permission, actor scope, view scope, runtime zone, hardware trust,
vault, package, audit, expiry or revocation context changes. The detailed
language note lives in `docs/context-tagged-verified-execution-cache.md`.

Package and module loading belongs to a governed Package Resolver rather than
an autoloader. Imports are not trust. The resolver checks package identity,
version/lockfile state, hash/signature, registry, capabilities, effects,
licence/policy, trust status, dependency graph and conflicts before linking
approved modules into Governed IR. Runtime dynamic loading, where a profile
allows it, still goes through Authority Control. The detailed language note
lives in `docs/package-resolver.md`.

The Certified Package Registry sits before the resolver as a governed package
source for verified, signed, versioned, capability-declared and policy-rated
packages. Certification is resolver evidence, not ambient authority. The
detailed language note lives in `docs/certified-package-registry.md`.

The kernel is a partial framework layer, not a full application framework.

The built-in `galerina-framework-api-server` package is the HTTP transport layer for Galerina API
services. It should load compiler-generated API route manifests, enforce
server-level request limits, pass requests into the Secure App Kernel and write
safe HTTP responses. It is not part of Galerina core and must not become a full web
framework.

Specialised concepts are split into sibling packages. `galerina-core` should keep
language syntax, compiler checks and report contracts, while package-specific
semantics belong in the owning package:

```text
Tri / Galerina / Omni      -> packages-galerina/galerina-core-logic
vector values and lanes    -> packages-galerina/galerina-core-vector
compute target selection   -> packages-galerina/galerina-core-compute
AI inference contracts     -> packages-galerina/galerina-ai
Low-bit AI backend         -> packages-galerina/galerina-ai-lowbit
photonic concepts          -> packages-galerina/galerina-core-photonic
CPU target planning        -> packages-galerina/galerina-target-cpu
CPU kernel contracts       -> packages-galerina/galerina-cpu-kernels
binary target backend      -> packages-galerina/galerina-target-native
photonic target backend    -> packages-galerina/galerina-target-photonic
developer commands         -> packages-galerina/galerina-core-cli
safe automation tasks      -> packages-galerina/galerina-core-tasks
```

---

## Main Architecture Goals

The architecture should support:

```text
strict typing
memory safety
security-first defaults
JSON-native development
API-native development
webhook-safe workflows
source-mapped debugging
AI-readable reports
multi-target output
build-once deploy-many
future accelerator support
```

Galerina must remain useful without photonic hardware.

---

## High-Level System Diagram

```text
                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                 â”‚    .spore source      â”‚
                 â”‚ boot.spore / src/*.sporeâ”‚
                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                           â–¼
                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                 â”‚       Lexer         â”‚
                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                           â–¼
                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                 â”‚       Parser        â”‚
                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                           â–¼
                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                 â”‚        AST          â”‚
                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â–¼                  â–¼                  â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Type Checker â”‚   â”‚Memory Checkerâ”‚   â”‚Security Checkâ”‚
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                          â–¼
                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                â”‚ JSON/API Contract    â”‚
                â”‚ Checker              â”‚
                â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â–¼
                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                â”‚ Galerina Intermediate     â”‚
                â”‚ Representation       â”‚
                â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â–¼
                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                â”‚ Optimiser / Linker   â”‚
                â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â–¼
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â–¼                  â–¼                  â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ CPU Binary   â”‚   â”‚ WASM Output  â”‚   â”‚ GPU Plan     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â–¼                  â–¼                  â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Photonic Planâ”‚   â”‚ Ternary Sim  â”‚   â”‚ Reports      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Repository Architecture

Recommended repository structure:

```text
Galerina/
â”œâ”€â”€ README.md
â”œâ”€â”€ ABOUT.md
â”œâ”€â”€ CONCEPT.md
â”œâ”€â”€ LICENSE
â”œâ”€â”€ LICENCE.md
â”œâ”€â”€ NOTICE.md
â”œâ”€â”€ REQUIREMENTS.md
â”œâ”€â”€ DESIGN.md
â”œâ”€â”€ TASKS.md
â”œâ”€â”€ TODO.md
â”œâ”€â”€ ROADMAP.md
â”œâ”€â”€ ARCHITECTURE.md
â”œâ”€â”€ SECURITY.md
â”œâ”€â”€ CONTRIBUTING.md
â”œâ”€â”€ CODE_OF_CONDUCT.md
â”œâ”€â”€ AI-INSTRUCTIONS.md
â”œâ”€â”€ CHANGELOG.md
â”œâ”€â”€ GETTING_STARTED.md
â”œâ”€â”€ DEMO_hello_WORLD.md
â”œâ”€â”€ GIT.md
â”œâ”€â”€ COMPILED_APP_GIT.md
â”œâ”€â”€ .env.example
â”œâ”€â”€ .gitignore
â”‚
â”œâ”€â”€ examples/
â”‚   â”œâ”€â”€ hello.spore
â”‚   â”œâ”€â”€ boot.spore
â”‚   â”œâ”€â”€ api-orders.spore
â”‚   â”œâ”€â”€ payment-webhook.spore
â”‚   â”œâ”€â”€ json-decode.spore
â”‚   â”œâ”€â”€ rollback.spore
â”‚   â”œâ”€â”€ compute-block.spore
â”‚   â””â”€â”€ ternary-decision.spore
â”‚
â”œâ”€â”€ compiler/
â”‚   â”œâ”€â”€ lexer/
â”‚   â”œâ”€â”€ parser/
â”‚   â”œâ”€â”€ ast/
â”‚   â”œâ”€â”€ symbols/
â”‚   â”œâ”€â”€ type-checker/
â”‚   â”œâ”€â”€ memory-checker/
â”‚   â”œâ”€â”€ security-checker/
â”‚   â”œâ”€â”€ effect-checker/
â”‚   â”œâ”€â”€ api-checker/
â”‚   â”œâ”€â”€ ir/
â”‚   â”œâ”€â”€ optimiser/
â”‚   â”œâ”€â”€ linker/
â”‚   â”œâ”€â”€ targets/
â”‚   â”œâ”€â”€ reports/
â”‚   â””â”€â”€ source-maps/
â”‚
â”œâ”€â”€ runtime/
â”‚   â”œâ”€â”€ memory/
â”‚   â”œâ”€â”€ errors/
â”‚   â”œâ”€â”€ json/
â”‚   â”œâ”€â”€ api/
â”‚   â”œâ”€â”€ webhooks/
â”‚   â”œâ”€â”€ concurrency/
â”‚   â”œâ”€â”€ rollback/
â”‚   â”œâ”€â”€ security/
â”‚   â””â”€â”€ environment/
â”‚
â”œâ”€â”€ tooling/
â”‚   â”œâ”€â”€ cli/
â”‚   â”œâ”€â”€ formatter/
â”‚   â”œâ”€â”€ linter/
â”‚   â”œâ”€â”€ language-server/
â”‚   â”œâ”€â”€ vscode-extension/
â”‚   â””â”€â”€ playground/
â”‚
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ language-rules.md
â”‚   â”œâ”€â”€ syntax.md
â”‚   â”œâ”€â”€ type-system.md
â”‚   â”œâ”€â”€ memory-safety.md
â”‚   â”œâ”€â”€ security-model.md
â”‚   â”œâ”€â”€ json-native-design.md
â”‚   â”œâ”€â”€ api-native-design.md
â”‚   â”œâ”€â”€ webhooks.md
â”‚   â”œâ”€â”€ concurrency.md
â”‚   â”œâ”€â”€ compute-blocks.md
â”‚   â”œâ”€â”€ gpu-target.md
â”‚   â”œâ”€â”€ photonic-target.md
â”‚   â”œâ”€â”€ ternary-logic.md
â”‚   â”œâ”€â”€ source-maps.md
â”‚   â”œâ”€â”€ compiler-reports.md
â”‚   â”œâ”€â”€ ai-context.md
â”‚   â”œâ”€â”€ deployment.md
â”‚   â”œâ”€â”€ package-system.md
â”‚   â”œâ”€â”€ dependencies.md
â”‚   â””â”€â”€ glossary.md
â”‚
â”œâ”€â”€ tests/
â”‚   â”œâ”€â”€ parser/
â”‚   â”œâ”€â”€ type-checker/
â”‚   â”œâ”€â”€ memory/
â”‚   â”œâ”€â”€ security/
â”‚   â”œâ”€â”€ json/
â”‚   â”œâ”€â”€ api/
â”‚   â”œâ”€â”€ reports/
â”‚   â”œâ”€â”€ source-maps/
â”‚   â””â”€â”€ targets/
â”‚
â””â”€â”€ build/
```

---

## User Project Architecture

A normal Galerina application should look like this:

```text
my-galerina-app/
â”œâ”€â”€ boot.spore
â”œâ”€â”€ Galerina.config
â”œâ”€â”€ Galerina.lock
â”œâ”€â”€ .env.example
â”œâ”€â”€ .gitignore
â”‚
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ main.spore
â”‚   â”œâ”€â”€ routes.spore
â”‚   â””â”€â”€ services/
â”‚       â”œâ”€â”€ order-service.spore
â”‚       â”œâ”€â”€ payment-service.spore
â”‚       â””â”€â”€ fraud-service.spore
â”‚
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ controllers/
â”‚   â”œâ”€â”€ models/
â”‚   â”œâ”€â”€ views/
â”‚   â”œâ”€â”€ middleware/
â”‚   â””â”€â”€ services/
â”‚
â”œâ”€â”€ components/
â”œâ”€â”€ packages/
â”œâ”€â”€ vendor/
â”œâ”€â”€ config/
â”œâ”€â”€ public/
â”œâ”€â”€ storage/
â”œâ”€â”€ tests/
â””â”€â”€ build/
```

---

## Script Architecture

Galerina must also support short scripts.

Example:

```text
hello.spore
```

Command:

```bash
Galerina run hello.spore
```

Short scripts should not require a full MVC-style structure.

Secure defaults should apply automatically:

```text
strict types enabled
memory safety enabled
undefined denied
silent null denied
unsafe denied
source maps enabled
CPU target enabled
```

---

## Project Entry Architecture

The default entry file should be:

```text
boot.spore
```

`boot.spore` should define:

```text
project name
language version
entry source file
targets
security rules
permissions
build settings
imports
```

Example:

```Galerina
project "OrderRiskDemo"

language {
  name "Galerina"
  version "0.1"
  compatibility "stable"
}

entry "./src/main.spore"

targets {
  binary {
    enabled true
    platform "linux-x64"
    output "./build/release/app.bin"
  }

  wasm {
    enabled true
    output "./build/release/app.wasm"
  }

  gpu {
    enabled true
    mode "plan"
    check true
    fallback "binary"
    output "./build/release/app.gpu.plan"
  }

  photonic {
    enabled true
    mode "plan"
    check true
    fallback "gpu"
    output "./build/release/app.photonic.plan"
  }

  ternary {
    enabled true
    mode "simulation"
    output "./build/release/app.ternary.sim"
  }
}
```

---

## Compiler Architecture

The compiler should be modular.

Recommended compiler components:

```text
lexer
parser
AST builder
symbol table
type checker
memory checker
security checker
effect checker
JSON/API contract checker
IR generator
optimiser
linker
target planner
target emitter
source-map generator
report generator
AI context generator
```

---

## Lexer

The lexer reads `.spore` source text and produces tokens.

Input:

```Galerina
let total: Int = 10
```

Output:

```text
LET
IDENTIFIER(total)
COLON
IDENTIFIER(Int)
EQUALS
INT_LITERAL(10)
```

The lexer should track:

```text
file
line
column
token type
token value
```

This is required for source maps and good error messages.

---

## Parser

The parser turns tokens into an AST.

The parser should understand:

```text
project blocks
language blocks
target blocks
security blocks
permission blocks
imports
types
enums
flows
secure flows
pure flows
match expressions (pattern matching)
if expressions
wait-until blocks
parallel blocks
channel blocks
worker blocks
rollback blocks
compute blocks
api blocks
webhook blocks
client blocks
json policies
```

Parser errors should include:

```text
file
line
column
expected syntax
suggested fix where possible
```

---

## AST Architecture

The AST is the structured representation of Galerina source.

Example AST node types:

```text
ProjectNode
ImportNode
TypeNode
EnumNode
FlowNode
SecureFlowNode
PureFlowNode
ParameterNode
ReturnTypeNode
MatchNode
IfNode
ResultNode
OptionNode
ComputeBlockNode
ApiBlockNode
WebhookBlockNode
JsonPolicyNode
RollbackNode
ParallelNode
ChannelNode
WorkerNode
```

The AST should preserve source locations.

Example:

```json
{
  "nodeType": "FlowNode",
  "name": "processOrder",
  "source": {
    "file": "src/order-service.spore",
    "line": 12,
    "column": 1
  }
}
```

---

## Symbol Table

The symbol table tracks known names.

It should track:

```text
types
flows
variables
imports
packages
routes
webhooks
channels
workers
targets
permissions
effects
```

This aLOws the compiler to detect:

```text
unknown variables
duplicate names
invalid imports
wrong function calls
invalid route handlers
missing types
```

---

## Type Checker

The type checker enforces strict typing.

It should reject:

```text
implicit string/number conversion
truthy/falsy logic
unhandled Option values
unhandled Result values
invalid JSON decode targets
invalid route handler types
invalid matrix shapes
invalid money currency operations
```

Example invalid code:

```Galerina
let total = "10" + 5
```

Error:

```text
Type error:
Cannot add String and Int.

Original source:
  src/main.spore:8:13

Suggestion:
  Convert the String explicitly using toInt().
```

---

## Memory Checker

The memory checker enforces memory safety.

It should protect against:

```text
use-after-free
double free
dangling references
out-of-bounds access
unsafe shared mutation
data races
uninitialised variables
```

Possible approach:

```text
ownership by default
borrowing for temporary access
immutable by default
explicit mutability
safe references
bounds-checked collections
```

Unsafe memory access should be denied by default.

---

## Security Checker

The security checker enforces project security rules.

It should check:

```text
unsafe usage
secret logging
environment access
file access
network access
native bindings
package permissions
webhook verification
API timeout policies
JSON safety policies
```

Example:

```Galerina
print(env.secret("API_KEY"))
```

Error:

```text
Security error:
SecureString cannot be printed.

Original source:
  src/main.spore:14:7

Suggestion:
  Do not log secrets. Use safe redaction if required.
```

---

## Effect Checker

The effect checker checks what a flow is aLOwed to do.

Example:

```Galerina
pure flow calculateTax(amount: Money<GBP>) -> Money<GBP> {
  return amount * 0.20
}
```

This should not be aLOwed inside a pure flow:

```Galerina
let now = time.now()
```

because it reads external state.

Effects may include:

```text
file.read
file.write
network.inbound
network.outbound
database.read
database.write
environment.read
time.read
random.read
secret.read
```

---

## JSON/API Contract Checker

The JSON/API checker validates API and webhook declarations.

It should check:

```text
request type exists
response type exists
handler exists
handler accepts correct request type
handler returns correct response type
webhook has security config
webhook has idempotency policy
payload size limits exist
JSON policies are valid
OpenAPI output can be generated
```

Example error:

```text
API contract error:
POST /orders expects CreateOrderResponse.
Handler createOrder returns Order.

Original source:
  src/routes.spore:18:5

Suggestion:
  Return JsonResponse<CreateOrderResponse>.
```

---

## Intermediate Representation

Galerina should lower source code into an intermediate representation.

Pipeline:

```text
.spore source
   â†“
AST
   â†“
checked IR
   â†“
optimised IR
   â†“
target outputs
```

The IR should be:

```text
typed
security-checked
source-mapped
target-aware
machine-readable
stable enough for future backends
```

The IR aLOws Galerina to support multiple outputs without duplicating the whole compiler.

---

## Optimiser

The optimiser should work on checked IR.

Possible optimisation steps:

```text
remove unused code
inline safe flows
simplify constant expressions
optimise JSON decoding
combine route tables
optimise pure compute blocks
prepare matrix/tensor operations for target planners
compress linked modules
```

Optimisation must preserve source-map traceability.

---

## Linker

The linker combines modules and packages.

It should handle:

```text
imports
packages
vendor bindings
runtime modules
generated validators
generated API routes
generated schemas
target-specific runtime components
```

The linker should produce consistent build outputs.

---

## Target Architecture

Galerina should support these target categories:

```text
binary
wasm
gpu-plan
photonic-plan
ternary-sim
```

Future targets may include:

```text
gpu-native
photonic-native
ternary-native
llvm
mlir
onnx
```

---

## CPU Binary Target

The CPU binary target is the most important practical target.

Output:

```text
app.bin
```

This target should support:

```text
normal control flow
API runtime
webhook runtime
JSON parsing
workers
channels
file access
network access
database access
rollback runtime
security checks
```

The first prototype may be interpreted before true binary output exists.

---

## WebAssembly Target

The WASM target should support portable execution.

Output:

```text
app.wasm
```

Possible uses:

```text
browser execution
edge functions
sandboxed server modules
plugin systems
portable compute modules
```

---

## GPU Target

GPU should be a first-class accelerator target.

Early output:

```text
app.gpu.plan
```

The GPU plan should explain:

```text
which compute blocks can run on GPU
which operations are supported
which operations failed
which fallback will be used
precision requirements
memory requirements
```

Future GPU output may target:

```text
CUDA
ROCm
WebGPU
Vulkan compute
MLIR GPU dialects
```

---

## Photonic Target

Photonic should begin as a planning target.

Early output:

```text
app.photonic.plan
```

The photonic plan should explain:

```text
matrix operations suitable for photonic execution
tensor operations suitable for photonic execution
unsupported operations
precision constraints
fallback targets
hardware assumptions
```

Real photonic backends should be added later only when hardware access and vendor tooling are realistic.

---

## Ternary Simulation Target

Ternary / 3-way logic should begin as a simulation target.

Output:

```text
app.ternary.sim
```

This should help test:

```text
Decision logic
Tri logic
Allow / Deny / Review flows
Positive / Neutral / Negative states
uncertainty handling
model confidence logic
```

---

## Compute Block Planner

The compute planner analyses `compute` blocks.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  score = fraudModel(features)
}
```

The planner should decide:

```text
can this run on photonic?
can this run on GPU?
can this run on CPU?
what operations are unsupported?
what fallback path is selected?
what report should be generated?
```

Unsupported example:

```Galerina
compute target photonic {
  result = readFile("./data.txt")
}
```

Error:

```text
Target error:
readFile cannot run inside a photonic compute block.

Suggestion:
Move file reading outside the compute block.
```

---

## Runtime Architecture

The runtime should provide safe execution support.

Runtime modules:

```text
memory runtime
error runtime
JSON runtime
API runtime
webhook runtime
concurrency runtime
rollback runtime
security runtime
environment runtime
logging runtime
target fallback runtime
```

---

## JSON Runtime

The JSON runtime should support:

```text
typed JSON decoding
raw JSON access
streaming JSON
partial JSON decoding
JSON Lines
canonical JSON output
schema validation
safe redaction
payload size limits
depth limits
duplicate key policy
```

---

## API Runtime

The API runtime should support:

```text
routing
typed request decoding
typed response encoding
middleware
timeouts
cancellation
rate limiting
structured logging
OpenAPI-generated validation
```

---

## Webhook Runtime

The webhook runtime should support:

```text
HMAC verification
signature timestamp checks
max age checks
payload size limits
idempotency keys
replay protection
duplicate event detection
safe JSON decoding
dead-letter queues
```

---

## Concurrency Runtime

The concurrency runtime should support:

```text
tasks
await
parallel blocks
timeouts
cancellation
channels
workers
worker pools
backpressure
dead-letter queues
safe shared state
```

---

## Rollback Runtime

The rollback runtime should support:

```text
checkpoints
restore actions
rollback handlers
compensating actions
audit trails
non-reversible action warnings
```

Rollback should not pretend every action can be undone.

External side effects should declare whether they are reversible.

---

## Security Runtime

The security runtime should support:

```text
SecureString
secret redaction
permission enforcement
environment access control
safe logging
package permission checks
native binding restrictions
```

---

## Environment Runtime

The environment runtime should load configuration from outside compiled files.

Sources may include:

```text
.env for local development
environment variables
container secrets
cloud secrets managers
deployment platform secrets
```

Example:

```Galerina
let port: Int = env.int("APP_PORT", default: 8080)
let apiKey: SecureString = env.secret("API_KEY")
```

---

## Build Output Architecture

Recommended output:

```text
build/
â”œâ”€â”€ app.bin
â”œâ”€â”€ app.wasm
â”œâ”€â”€ app.gpu.plan
â”œâ”€â”€ app.photonic.plan
â”œâ”€â”€ app.ternary.sim
â”œâ”€â”€ app.openapi.json
â”œâ”€â”€ app.api-report.json
â”œâ”€â”€ app.target-report.json
â”œâ”€â”€ app.security-report.json
â”œâ”€â”€ app.failure-report.json
â”œâ”€â”€ app.source-map.json
â”œâ”€â”€ app.ai-context.json
â””â”€â”€ app.build-manifest.json
```

---

## Build Manifest

The build manifest should describe the build.

Example:

```json
{
  "project": "order-risk-demo",
  "version": "0.1.0",
  "language": "Galerina",
  "compiler": "0.1.0",
  "mode": "release",
  "targets": ["binary", "wasm", "gpu-plan", "photonic-plan"],
  "sourceHash": "sha256:...",
  "binaryHash": "sha256:...",
  "createdAt": "2026-05-02T09:00:00Z"
}
```

The manifest helps with:

```text
deployment
rollback
verification
auditing
multi-server release control
```

---

## Source Map Architecture

Galerina must support source maps.

Source maps should connect generated output to original source.

They should include:

```text
original file
original line
original column
flow/function name
target output
compiled location
build stage
optimisation stage
```

Source maps should be used by:

```text
Galerina explain
Galerina explain --for-ai
runtime error reporting
debug tools
CI reports
AI assistants
```

---

## Report Architecture

Galerina should generate JSON reports.

Important reports:

```text
app.failure-report.json
app.security-report.json
app.target-report.json
app.api-report.json
app.ai-context.json
```

Reports should be:

```text
machine-readable
human-readable where possible
source-mapped
stable
compact
useful for CI
useful for AI assistants
```

---

## AI Context Architecture

Galerina should generate compact AI context.

Command:

```bash
Galerina ai-context
```

Outputs:

```text
build/app.ai-context.json
build/app.ai-context.md
```

The AI context should include:

```text
project name
entry file
source file summary
route summary
webhook summary
type summary
permission summary
target summary
error summary
changed file summary
suggested next actions
```

This helps reduce AI token use.

---

## AI Explain Architecture

Galerina should support:

```bash
Galerina explain --for-ai
```

This command should produce compact structured output.

Example:

```json
{
  "errorType": "TargetCompatibilityError",
  "target": "photonic",
  "file": "src/fraud-check.spore",
  "line": 18,
  "column": 12,
  "problem": "readFile cannot run inside a photonic compute block.",
  "why": "Photonic targets only support approved maths, tensor, matrix and model operations.",
  "suggestedFix": "Move readFile outside the compute block and pass parsed data into the model."
}
```

---

## CLI Architecture

Suggested CLI commands:

```bash
Galerina init
Galerina run
Galerina build
Galerina check
Galerina test
Galerina fmt
Galerina lint
Galerina explain
Galerina explain --for-ai
Galerina verify
Galerina targets
Galerina ai-context
Galerina schema
Galerina openapi
```

---

## Formatter Architecture

The formatter should provide one official style.

Command:

```bash
Galerina fmt
```

The formatter should help:

```text
human readability
AI readability
consistent documentation
smaller diffs
fewer style debates
```

---

## Linter Architecture

The linter should detect unsafe or weak patterns.

Command:

```bash
Galerina lint
```

Example checks:

```text
webhook without idempotency
API route without timeout
JSON endpoint without max body size
secret converted to String
compute block contains unsupported I/O
unused imports
non-exhaustive match
overly broad permissions
```

---

## Package Architecture

Galerina should eventually support packages.

Recommended package folders:

```text
packages-galerina/ = Galerina ecosystem packages
vendor/   = external third-party code
```

Current Galerina workspace package boundaries:

```text
packages-galerina/galerina-core
packages-galerina/galerina-core-logic
packages-galerina/galerina-core-vector
packages-galerina/galerina-core-compute
packages-galerina/galerina-core-photonic
packages-galerina/galerina-target-native
packages-galerina/galerina-target-photonic
packages-galerina/galerina-framework-app-kernel
packages-galerina/galerina-framework-api-server
packages-galerina/galerina-core-cli
packages-galerina/galerina-core-tasks
```

When these packages are edited, update the owning package documentation first.
Update `galerina-core` only when the language syntax, compiler contract, report schema
or package registry behaviour changes.

Lockfile:

```text
Galerina.lock
```

The lockfile should record:

```text
dependency names
versions
hashes
licences
permissions
target compatibility
```

---

## Deployment Architecture

Galerina should support build-once, deploy-many.

Deployment flow:

```text
1. Build once
2. Generate build manifest
3. Generate hashes
4. Verify artefact
5. Upload artefact
6. Deploy same artefact to many servers
7. Each server loads its own environment variables
8. Health check
9. Roll back if needed
```

Compiled output must not contain secrets.

---

## Git Architecture

Galerina should have two Git guides.

```text
GIT.md
```

Purpose:

```text
Git workflow for the Galerina language repository itself.
```

```text
COMPILED_APP_GIT.md
```

Purpose:

```text
Git and deployment guidance for applications built with Galerina.
```

This separates language development from app deployment.

---

## Debug Architecture

Debug builds should include:

```text
detailed source maps
IR output
symbols
security reports
target reports
failure reports
AI context files
```

Release builds should include:

```text
optimised output
build manifest
security report
target report
separate source maps if enabled
stripped symbols where appropriate
```

---

## Decompilation Architecture

Galerina should assume compiled output can be reverse engineered.

Therefore:

```text
compiled files are not secret
secrets must remain outside compiled files
source maps should be controlled
release builds may strip symbols
artefacts may be signed
hashes should be generated
```

---

## Version 0.1 Architecture Scope

Version 0.1 should focus on architecture documentation and early prototypes.

Required:

```text
grammar draft
AST draft
parser prototype
interpreter prototype
source-map schema
report schemas
AI context schema
example .spore files
```

Not required:

```text
real native executable compiler
real GPU backend
real photonic backend
real package manager
production runtime
formal verification
```

---

## Future Architecture Scope

Future versions may add:

```text
LLVM backend
MLIR backend
WASM backend
GPU backend
ONNX import/export
photonic vendor backend
ternary native backend
package manager
language server
VS Code extension
web playground
debugger
deployment tooling
formal verification tools
```

---

## Final Architecture Principle

The Galerina architecture should keep the language practical and future-ready.

Immediate value:

```text
strict types
memory safety
JSON-native development
API-native development
source maps
security reports
AI-readable context
normal CPU compatibility
```

Future value:

```text
GPU planning
photonic planning
ternary simulation
multi-target compilation
accelerator-aware compute blocks
```

The architecture should make Galerina useful before future hardware becomes common.

---

## Good-Taste Architecture Principles

The Galerina architecture follows a "good taste" rule:

```text
Design the model so edge cases disappear.
```

This means the boring path should always be the safe path.

### The Five Rules

**Rule 1 — No special-case paths.**

All external boundary inputs are `unsafe unvalidated` regardless of origin
(API, webhook, CLI, queue). Use one model:

```text
Boundary<T> -> T unsafe unvalidated
```

**Rule 2 — Keep authority flat.**

Authority decisions live in a pre-planned authority graph — not scattered
through nested permission logic inside flows:

```text
flow -> effects -> runtime authority plan -> allow/deny
```

**Rule 3 — Avoid deep nesting.**

Prefer early exits and guard clauses. Use `attempt ... else error` and
`match value { ... }` to keep flows flat.

**Rule 4 — Small focused flows.**

Each flow should have one responsibility. Break large flows into:

```text
validateCheckout
priceOrder
reserveStock
capturePayment
writeAudit
```

**Rule 5 — Simple data structures.**

Pre-compute manifests and tables instead of runtime discovery:

```text
route table
type manifest
effect graph
authority plan
decoder plan
```

### Making Edge Cases Impossible

Use the type system to remove edge cases entirely:

| Pattern | What it eliminates |
| --- | --- |
| `Option<T>` | Null dereference bugs |
| `Result<T, E>` | Hidden exception paths |
| Exhaustive `match` | Missing branch bugs |
| `String unsafe unvalidated` | Implicit trust of boundary input |
| `Email safe validated` | Untrusted input reaching trusted code |
