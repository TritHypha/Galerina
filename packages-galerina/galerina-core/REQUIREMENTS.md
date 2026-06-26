# Galerina Requirements

This document defines the initial requirements for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The requirements in this document are intended to guide the design of the
language, compiler, optional Secure App Kernel contract, tooling,
documentation and future project structure.

---

## Requirement Levels

Requirements are grouped using the following labels:

| Level | Meaning |
|---|---|
| `MUST` | Required for the core Galerina concept |
| `SHOULD` | Strongly recommended, but may be phased in |
| `MAY` | Optional or future-facing |
| `LATER` | Not required for early prototypes |

---

## Core Requirement Summary

Galerina must support:

```text
.spore source files
strict type checking
memory safety
security-first defaults
explicit error handling
explicit missing-value handling
JSON-native development
API-native development
source maps
compiler reports
AI-readable context files
multi-target compilation planning
CPU binary compatibility
GPU planning
photonic planning
ternary simulation
secure runtime configuration
```

The build folder should also include `app.memory-report.json` and
`docs/memory-pressure-guide.md` when runtime memory policy is enabled.

Galerina architecture SHOULD be AI-understandable by design. AI tools SHOULD read
stable architecture maps, concept definitions, package ownership, generated
project graph data, report metadata and canonical examples instead of guessing
from folder names or vague component names.

Galerina documentation and generated reports SHOULD preserve stable concept
names, one-concept indexed docs where appropriate, explicit definitions,
canonical examples, indexed permissions/effects/contexts and component
responsibility metadata for compiler, runtime, security and tooling
components.

Runtime, compiler, security and tooling components SHOULD expose or document
metadata such as component name, purpose, authority-granting status,
trusted-core status, runtime stage, package owner, inputs, outputs and emitted
reports.

Galerina core defines language safety. Runtime enforcement for request handling,
auth, rate limits, idempotency, jobs and workload control belongs in the
optional Galerina Secure App Kernel. Built-in HTTP API serving belongs in
`packages-galerina/galerina-framework-api-server/`, which should load route manifests and delegate to the
kernel. Full frameworks should build above or beside that kernel.

Galerina SHOULD be designed around security invariants rather than isolated
exploit patches. Declared security policy SHOULD be part of program meaning, so
the compiler/runtime can prove or deny whether a flow may expose data, use an
effect, call a package, cross a boundary or execute unsafe behaviour.

Galerina compiler IR SHOULD be security-aware. It SHOULD carry permissions,
capabilities, data classification, exposure level, ownership, actor identity,
trust boundaries, side effects, audit requirements, package authority and
runtime isolation requirements into semantic checking, Governed IR, execution
planning and reports.

Checked execution plans SHOULD become immutable. Normal Galerina code MUST NOT
use runtime monkey patching, hidden behaviour injection, reflective execution,
dynamic property injection, runtime type rewriting or metadata mutation to
change authority after checking.

High-assurance profiles SHOULD support hardened mode rules such as disabled
runtime reflection, denied unsafe blocks, denied shell execution, signed-only
external plugins/packages, deterministic execution enforcement, raw SQL denial
and mandatory audit.

Galerina verified fast paths SHOULD be backed by a context-tagged verified
execution cache. Cached execution plans MUST be reusable only when the current
verification context matches the cached context, including source hash,
Governed IR hash, permission hash, policy version, actor scope, view scope,
runtime zone, compute target, hardware trust, vault version, package version
and audit level.

Galerina caches MUST NOT own authority. Authority Control SHOULD decide whether a
cached parser result, IR, policy decision, view rule, vault read, compute plan,
schedule lane, audit buffer or full verified execution plan may be reused, and
SHOULD be able to invalidate caches on policy, permission, view, vault,
package, zone, trust, hardware, audit, expiry or revocation changes.

Galerina SHOULD use a governed Package Resolver rather than an autoloader model.
Imports and package references MUST NOT grant trust or hidden authority. The
resolver SHOULD find, verify, authorize, load and link packages/modules before
execution.

Galerina SHOULD define a Certified Package Registry as a governed package source
where packages are published, verified, signed, versioned, capability-declared
and policy-rated before use. Registry certification SHOULD be evidence for
Package Resolver and Governance Checks, not unrestricted authority.

The Package Resolver SHOULD check package identity, version, lockfile state,
hash/signature, source registry, declared capabilities, declared effects,
licence/policy, trusted status, dependency graph, conflicts, profile
compatibility and target compatibility before linking approved modules into
Governed IR.

Dynamic package or module loading SHOULD be denied by default in production. If
allowed by a development or extension profile, it MUST go through Authority
Control, resolver policy, signature/hash checks, capability/effect checks,
audit and provenance reporting.

`galerina.lock.json` SHOULD record registry-derived package evidence where
applicable: exact version, hash, signature, publisher, source registry,
requested capabilities, effects used, certification level, dependency graph,
selected profile and approved runtime targets.

Specialised Galerina concepts belong in sibling packages. `galerina-core` may define syntax,
compiler checks and report contracts for them, but detailed package semantics
must be updated in the owning package first:

```text
packages-galerina/galerina-core-logic
packages-galerina/galerina-core-vector
packages-galerina/galerina-core-compute
packages-galerina/galerina-ai
packages-galerina/galerina-ai-lowbit
packages-galerina/galerina-core-photonic
packages-galerina/galerina-target-cpu
packages-galerina/galerina-cpu-kernels
packages-galerina/galerina-target-native
packages-galerina/galerina-target-photonic
packages-galerina/galerina-framework-app-kernel
packages-galerina/galerina-framework-api-server
packages-galerina/galerina-core-cli
packages-galerina/galerina-core-tasks
```

---

## Backend Language Evolution Requirements

### REQ-EVOLUTION-001: Language Editions

Galerina SHOULD define language editions before major syntax growth.

Editions SHOULD be declared in project metadata:

```Galerina
language {
  edition "2026"
  compatibility "stable"
}
```

Edition changes MUST be reported in build manifests, source maps, diagnostics
and AI context.

---

### REQ-EVOLUTION-002: Compatibility and Deprecation Policy

Galerina SHOULD provide a compatibility policy for syntax, reports, targets and
runtime contracts.

Deprecations SHOULD produce warnings and fix suggestions before removals.
Breaking changes SHOULD be edition-gated.

---

### REQ-EVOLUTION-003: Algebraic Variants and Exhaustive map

Galerina SHOULD treat enums, sealed variants and exhaustive `map` as core language
safety features.

The compiler SHOULD reject incomplete maps for closed state sets such as
`Option<T>`, `Result<T, E>`, `Decision`, `Tri` and declared sealed variants.

---

### REQ-EVOLUTION-004: Generic Constraints and Protocols

Galerina SHOULD support explicit generic constraints for reusable backend, numeric,
JSON and target-compatible code.

The design SHOULD avoid hidden implicit resolution. Constraints must be visible
to humans, compilers and AI tools.

---

### REQ-EVOLUTION-005: Structured Concurrency, Cancellation and Streams

Galerina SHOULD define structured concurrency primitives, cancellation propagation,
timeouts and typed streams.

These features are required for backend services, long-running workers,
streaming JSON, network I/O and safe shutdown.

---

### REQ-EVOLUTION-006: Deterministic Resource Cleanup

Galerina SHOULD define deterministic cleanup for resources such as files, sockets,
locks, temporary directories and foreign handles.

Cleanup behaviour MUST be source-mapped and must not hide errors.

---

### REQ-EVOLUTION-006A: Variables, Explicit Mutation and Vault State

Galerina v0.1 SHOULD use `let` for local flow/block-scoped variables, `mut` for
explicit mutation, `readonly` for values that cannot change after creation,
`vault` for protected shared state, `secure` for protected vault access and
`Secret<T>` for protected secret values.

Mutation MUST be visible. Assignment-style mutation without `mut` SHOULD be
diagnosed in normal Galerina code. Increment and decrement mutation without
`mut`, such as `foo++`, SHOULD also be diagnosed.

`readonly` SHOULD replace `const` in v0.1. Galerina SHOULD add `const` later only
if it needs compile-time constants that are meaningfully distinct from runtime
readonly values.

Shared state MUST NOT be ordinary global state. Shared state belongs in typed,
permission-controlled, audit-aware vault declarations and should be accessed
through protected paths such as `secure.valueName`.

Vault record writes SHOULD prefer the visible source form
`mut secure.name[key] = value` instead of direct writer-call syntax such as
`SessionVault.write(context, key, value)`. Runtime lowering MAY use internal
vault write calls, but source code should keep the governed write visible and
inherit active runtime context for actor, flow, permission, audit and trust-zone
metadata.

---

### REQ-EVOLUTION-006B: Secure By Default Syntax Principles

Galerina syntax SHOULD make security decisions visible before runtime execution.

Permission blocks MUST deny by default. Missing allow rules MUST mean denied,
and risky actions such as database, file, network, secret, AI/tool, compute,
shell and external API access SHOULD require explicit authority.

Request/input contracts SHOULD declare shape, required fields, size/range
limits and allowed values. Output contracts SHOULD declare or inherit target
context such as JSON, HTML, log, AI prompt, shell, SQL, URL or CSV so encoding
and escaping are target-aware.

Field exposure SHOULD use `view`, owner-scoped exposure SHOULD require explicit
ownership checks such as `owner: actor`, and secrets SHOULD be denied from
return values, logs, AI context, ordinary serialization, normal reports and
caches by default.

Galerina SHOULD define built-in runtime/language view levels: `public`,
`internal`, `private`, `confidential`, `secret`, `restricted` and `regulated`.
These SHOULD map conceptually to `Runtime.View.public`,
`Runtime.View.private` and the other standard view levels. `public` means safe
to expose under normal allowed response rules. `private` means owned data that
requires ownership checks such as `owner == actor` or `owner: actor`.

Common built-in view behaviour SHOULD be defined once in the runtime standard,
core policy or boot/main setup. Permission references such as
`allow expose view: private` SHOULD inherit the standard `Runtime.View.private`
owner-only rule. Permission-level conditions SHOULD normally narrow standard
view behaviour. Widening built-in view behaviour SHOULD require explicit named
policy, review, audit and report output.

Raw SQL SHOULD be denied by default. Typed query syntax SHOULD be preferred,
and raw SQL SHOULD require explicit high-risk authority such as `db.raw_sql`.

Galerina SHOULD use `safe` and `unsafe` as value trust states. `unsafe` means
untrusted or boundary-derived, not memory-unsafe. Unsafe values MUST be inert
until trust conversion or explicit safe declaration. They MUST NOT participate
in arithmetic, concatenation, ordinary string helpers such as `trim`, ordinary
array helpers such as map/filter/reduce/event counts, query interpolation,
shell execution, worker handoff, `GlobalVault` access or business logic.

The only normal operations allowed on an unsafe value SHOULD be `validate`,
`guard` and `sanitize`. Explicit safe declaration such as `safe foo` MUST be
policy-visible and reportable. `encode.*` MUST require an already-safe input
and produce a context-specific safe output such as `safe Html`, `safe UrlPart`,
`safe JavaScript`, `safe Css`, `safe Xml` or `safe ShellArg`.

Unsafe interpolation into `Query` MUST be rejected. `Query` SHOULD be treated as
an immutable executable boundary artifact requiring safe parameters, runtime
authority and audit output.

Database field reads SHOULD prefer explicit field allow lists. Broad-read
syntax such as `fields: all except [...]` MAY be supported only as visible,
reportable, higher-risk syntax. `fields: all current except [...]` SHOULD be
preferred where broad current access is needed without automatically granting
future fields.

For broad-read field rules, the compiler/runtime SHOULD resolve known fields,
remove excluded fields, check `view` metadata, warn on sensitive tables and deny
unknown future fields unless broad future-field access is explicitly approved.

Flows SHOULD have default resource budgets and MAY declare explicit budgets for
CPU, wall time, memory, request body size, loop/recursion limits where
provable, spawned tasks, network calls, AI/tool calls and accelerator work.

Security-relevant flows SHOULD support audit declarations such as
`audit required event "profile.read"`.

Audit events SHOULD automatically inherit governed runtime identity, including
primary actor, request ID, route, flow, permission, active capabilities,
timestamp, execution ID, result and trust zone. Application code MAY attach
metadata but SHOULD NOT silently override runtime-owned audit identity fields.

Multi-actor audit events SHOULD support metadata roles such as
`affected_actor`, `delegated_actor`, `source_actor`, `system_actor` and
`ai_actor`. These roles MUST NOT replace runtime-owned `primary_actor`
attribution. System actors SHOULD be runtime-approved identities declared in
trusted runtime policy.

---

### REQ-EVOLUTION-007: Safe Metadata and Compile-Time Transforms

Galerina MAY support safe compile-time metadata, attributes or hygienic transforms.

Metadata and transforms MUST NOT bypass source maps, effects, permissions,
security reports or AI reports.

Compile-time metadata MAY describe declared data, views, flows, permissions,
capabilities, vaults, routes, events, packages, effects, response contracts and
audit events for documentation, tests, schema generation, audit graphs,
AI-readable indexes and Governed IR construction.

Galerina MUST NOT treat reflection as runtime object inspection or behaviour
modification in normal code. Runtime reflection patterns such as string-based
method invocation, live object listing, dynamic private-field inspection,
dynamic permission mutation and unknown module loading MUST remain denied or
outside normal Galerina source.

---

### REQ-EVOLUTION-008: Native ABI and Foreign-Call Boundary

Galerina MAY support native ABI import/export and foreign calls.

Foreign calls MUST declare types, effects, permissions, target compatibility
and unsafe boundaries. Raw pointers MUST remain unavailable in normal Galerina code.

---

### REQ-EVOLUTION-009: Shape-Aware Matrix and Vector Types

Galerina SHOULD support shape-aware vectors, matrices and tensors where practical.

Shape checks SHOULD happen at compile time where possible. Scalar fallback and
target compatibility reports are required for accelerated compute.

---

### REQ-EVOLUTION-010: Stable Diagnostics and AI Report Schemas

Galerina MUST keep diagnostics and AI report schemas stable enough for tools.

Diagnostic output SHOULD include stable IDs, severity, category, source
location, problem, why, suggested fix and safe examples where appropriate.

---

## Project File Requirements

### REQ-PROJECT-001: Use `.spore` Source Files

Galerina source files MUST use the `.spore` extension.

Examples:

```text
boot.spore
main.spore
order-service.spore
payment-webhook.spore
fraud-check.spore
```

### REQ-PROJECT-002: Project Entry File

A Galerina project SHOULD use:

```text
boot.spore
```

as the main project entry file.

Simple projects MAY use:

```text
main.spore
```

For consistency, `boot.spore` is preferred for full applications.

---

### REQ-PROJECT-003: Short Script Mode

Galerina MUST support short scripts without a full project structure.

Example:

```text
hello.spore
```

Command:

```bash
Galerina run hello.spore
```

Short scripts MUST use secure defaults:

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

### REQ-PROJECT-003A: Run Mode and Compile Mode

Galerina SHOULD support both direct Run Mode and full Compile Mode.

```text
Run Mode      = quick execution for scripts, learning and development
Compile Mode  = full production build with reports, manifests and target outputs
```

Run Mode MUST remain checked. It MUST NOT allow loose typing, undefined values,
silent null, secret printing or unsafe memory behaviour.

Compile Mode SHOULD generate:

```text
target outputs
source maps
map manifests
security reports
target reports
API reports
AI guides
AI context JSON
build manifests
generated documentation
```

Galerina SHOULD generate `app.execution-report.json` and
`docs/run-compile-mode-guide.md` for builds that declare execution policy.

Recommended rule:

```text
Run fast while developing.
Compile fully before deploying.
```

---

### REQ-PROJECT-003B: Strict Global Registry

Galerina SHOULD use local variables by default and require project-wide values to be
declared in a strict global registry.

The registry SHOULD support:

```text
readonly
config
secret
vault
```

Global values MUST have explicit types. Secret globals MUST use `SecureString`
and MUST be redacted in reports, generated documentation, source maps and AI
context. Mutable shared state MUST be declared as controlled `vault` state.

Galerina SHOULD generate:

```text
app.global-report.json
docs/global-registry-guide.md
```

The build manifest SHOULD include a hash of the global registry structure and
required environment variables without including secret values.

Recommended rule:

```text
Local by default.
Global by declaration.
Mutable only by controlled state.
Secrets always protected.
```

---

### REQ-PROJECT-004: Project Mode

Galerina SHOULD support full project mode.

Recommended structure:

```text
my-galerina-app/
â”œâ”€â”€ boot.spore
â”œâ”€â”€ Galerina.config
â”œâ”€â”€ Galerina.lock
â”œâ”€â”€ .env.example
â”œâ”€â”€ src/
â”œâ”€â”€ app/
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

## Language Safety Requirements

### REQ-SAFETY-001: Strict Types

Galerina MUST be strictly typed.

The language MUST NOT allow loose type coercion.

Invalid:

```Galerina
let total = "10" + 5
```

Valid:

```Galerina
let total: Int = toInt("10") + 5
```

Strict typing MUST apply to:

```text
strings
numbers
money
dates
times
booleans
Tri
Omni
decisions
errors
JSON payloads
matrix shapes
tensor shapes
security permissions
hardware targets
```

---

### REQ-SAFETY-002: No JavaScript-Style Undefined

Galerina MUST NOT include JavaScript-style `undefined`.

Missing values MUST be explicit.

Required type:

```Galerina
Option<T>
```

Example:

```Galerina
let customer: Option<Customer> = findCustomer(customerId)

match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer missing")
}
```

---

### REQ-SAFETY-003: No Silent Null

Galerina MUST NOT allow silent null behaviour.

The language SHOULD avoid `null` in normal application logic.

Missing values MUST use:

```Galerina
Option<T>
```

---

### REQ-SAFETY-004: Explicit Error Handling

Galerina MUST support explicit error handling.

Functions that can fail SHOULD return:

```Galerina
Result<T, Error>
```

Example:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  let order = database.findOrder(id)

  match order {
    Some(o) => return Ok(o)
    None    => return Err(OrderError.NotFound)
  }
}
```

Unhandled errors MUST fail compilation.

---

### REQ-SAFETY-005: No Truthy/Falsy Logic

Galerina MUST NOT allow accidental truthy/falsy checks.

Invalid:

```Galerina
if order.payment.status {
  shipOrder(order)
}
```

Valid:

```Galerina
match order.payment.status {
  Paid    => shipOrder(order)
  Pending => holdForReview(order)
  Failed  => cancelOrder(order)
  Unknown => holdForReview(order)
}
```

---

### REQ-SAFETY-006: Explicit Mutability

Values SHOULD be immutable by default.

Mutable values MUST be explicit.

Immutable:

```Galerina
let name: String = "Order 123"
```

Mutable:

```Galerina
mut count: Int = 0
count = count + 1
```

---

## Memory Safety Requirements

### REQ-MEMORY-001: Memory Safety by Default

Galerina MUST be memory safe by default.

The language MUST protect against:

```text
use-after-free
double free
buffer overflow
out-of-bounds access
dangling pointers
data races
uninitialised memory
unsafe shared mutation
null pointer errors
```

---

### REQ-MEMORY-002: No Raw Pointers in Normal Code

Galerina MUST NOT allow raw pointers in normal application code.

Any low-level memory feature MUST require explicit unsafe permissions.

---

### REQ-MEMORY-003: Unsafe Denied by Default

Unsafe behaviour MUST be denied by default.

Example project rule:

```Galerina
security {
  unsafe "deny"
}
```

Unsafe code MAY be considered later for specialist runtime/compiler internals, but it MUST NOT be part of normal Galerina application development.

---

### REQ-MEMORY-004: Bounds Checking

Arrays, buffers and collections MUST be bounds checked.

Out-of-bounds access MUST fail safely with a source-mapped error.

---

### REQ-MEMORY-005: Data Race Prevention

Galerina MUST include safe concurrency rules to avoid data races.

Shared mutable state MUST be restricted, protected or explicitly declared.

---

### REQ-MEMORY-006: Runtime Memory Pressure and Spill Policy

Galerina SHOULD allow projects to declare runtime memory pressure behaviour in
`boot.spore`.

Runtime memory configuration SHOULD support:

```text
soft memory limits
hard memory limits
ordered pressure actions
optional encrypted spill storage
spill TTL
spill disk limits
spill allow lists
spill deny lists
secret redaction
```

Spill storage MUST be allow-list based. Sensitive values MUST NOT spill to disk.

Required deny-list examples:

```text
SecureString
RequestContext
SessionToken
PaymentToken
PrivateKey
```

If runtime spill is enabled, Galerina SHOULD report the policy in:

```text
app.runtime-report.json
app.memory-report.json
docs/runtime-guide.md
docs/memory-pressure-guide.md
app.ai-guide.md
app.ai-context.json
```

The memory report SHOULD include:

```text
memory pressure ladder
cache bypass behaviour
spill allow and deny rules
queue and channel overflow policy expectations
JSON stream spill expectations
compile-time memory policy checks
memory recommendations
```

A cache limit MUST NOT change correctness. The flow should calculate and return
the result, bypass cache storage and report the bypass.

---

## Security Requirements

### REQ-SECURITY-001: Security-First Defaults

Galerina MUST be secure by default.

Default rules SHOULD include:

```text
unsafe denied
undefined denied
silent null denied
implicit casts denied
truthy/falsy checks denied
secret logging denied
unhandled errors denied
source maps enabled
```

---

### REQ-SECURITY-002: SecureString

Galerina SHOULD include a `SecureString` type.

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

`SecureString` MUST NOT be printable or loggable by default.

Invalid:

```Galerina
print(apiKey)
```

Compiler error:

```text
Cannot print SecureString.
Use explicit reveal() only inside an approved secure context.
```

---

### REQ-SECURITY-003: Runtime Secrets Outside Compiled Files

Galerina MUST NOT compile real secrets into build outputs.

Secrets MUST live in:

```text
.env files for local development
server environment variables
container secrets
cloud secrets managers
deployment platform secrets
```

Compiled files MUST be treated as non-secret.

Recommended rule:

```text
Compiled files are not secret.
Secrets live outside compiled files.
```

---

### REQ-SECURITY-004: Permissions

Galerina SHOULD support project-level permissions.

Example:

```Galerina
permissions {
  network "restricted"
  file_read "allow"
  file_write "restricted"
  environment "restricted"
  native_bindings "deny"
}
```

Packages SHOULD also declare permissions.

---

### REQ-SECURITY-005: Effect System

Galerina SHOULD support an effect system.

Example:

```Galerina
pure flow calculateTax(amount: Money<GBP>) -> Money<GBP> {
  return amount * 0.20
}
```

A `pure` flow MUST NOT:

```text
read files
write files
use network
read environment variables
access current time
generate random values
change global state
```

Example with effects:

```Galerina
flow sendEmail(email: Email) -> Result<Void, EmailError>
effects [network.external] {
  return mailer.send(email)
}
```

---

## JSON Requirements

### REQ-JSON-001: JSON-Native Language Design

Galerina MUST treat JSON as a first-class data format.

The language SHOULD support:

```text
typed JSON decoding
raw JSON handling
JSON schema generation
OpenAPI generation
streaming JSON parsing
partial JSON decoding
JSON Lines processing
JSON path access
canonical JSON output
safe redaction
schema validation
```

---

### REQ-JSON-002: JSON-Native but Strict

Galerina MUST NOT become loosely typed just because it supports JSON.

The rule SHOULD be:

```text
JSON is easy to receive.
JSON is easy to inspect.
JSON is easy to transform.
JSON is easy to output.
But production JSON should be decoded into strict Galerina types.
```

Preferred:

```Galerina
let order: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

Allowed when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

---

### REQ-JSON-003: JSON Safety Limits

Galerina SHOULD support JSON safety policies.

Example:

```Galerina
json_policy {
  max_body_size 1mb
  max_depth 32
  duplicate_keys "deny"
  unknown_fields "warn"
  null_fields "deny"
  date_format "iso8601"
}
```

Galerina SHOULD protect against:

```text
huge payloads
deeply nested payload attacks
duplicate keys
unexpected null
wrong types
missing fields
unsafe number conversion
date parsing ambiguity
secret leakage in logs
schema drift
```

---

### REQ-JSON-004: Streaming JSON

Galerina SHOULD support streaming JSON for large payloads.

Example:

```Galerina
for item in json.stream<OrderItem>(req.body) {
  process(item)
}
```

This avoids loading large payloads fully into memory.

---

### REQ-JSON-005: JSON Lines

Galerina SHOULD support JSON Lines.

Example:

```Galerina
for event in jsonl.read<Event>("./events.jsonl") {
  process(event)
}
```

---

### REQ-JSON-006: JSON Schema Generation

Galerina SHOULD generate JSON schemas from Galerina types.

Example:

```bash
Galerina schema CreateOrderRequest
```

Output:

```text
build/schemas/create-order-request.schema.json
```

---

## API and Webhook Requirements

### REQ-API-001: API-Native Design

Galerina MUST be designed for modern API-heavy systems.

The language SHOULD support:

```text
REST APIs
webhooks
typed request bodies
typed response bodies
JSON schema generation
OpenAPI generation
HMAC signature verification
webhook replay protection
idempotency keys
request timeouts
request cancellation
payload size limits
rate limiting
retry policies
circuit breakers
worker pools
channels
backpressure
dead-letter queues
structured logging
safe secret redaction
```

---

### REQ-API-002: API Contracts

Galerina SHOULD support API contract declarations.

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    errors [ValidationError, PaymentError]
    handler createOrder
  }

  GET "/orders/{id}" {
    params {
      id: OrderId
    }

    response OrderResponse
    handler getOrder
  }
}
```

The compiler SHOULD generate:

```text
OpenAPI specification
JSON schemas
request validators
response validators
test mocks
API reports
```

---

### REQ-API-003: Webhook Declaration

Galerina SHOULD support first-class webhook declarations.

Example:

```Galerina
webhook PaymentWebhook {
  path "/webhooks/payment"
  method POST

  security {
    hmac_header "Payment-Signature"
    secret env.secret("PAYMENT_WEBHOOK_SECRET")
    max_age 5m
    max_body_size 512kb
    replay_protection true
  }

  idempotency_key json.path("$.id")
  handler handlePaymentWebhook
}
```

---

### REQ-API-004: Idempotency

Galerina SHOULD support idempotency keys for APIs and webhooks.

This is required because webhooks are often delivered more than once.

Example:

```Galerina
idempotency_key json.path("$.id")
```

---

### REQ-API-005: Replay Protection

Galerina SHOULD support replay protection for signed webhooks.

Webhook security SHOULD include:

```text
signature verification
timestamp validation
maximum age
idempotency
duplicate detection
body size limits
```

---

### REQ-API-006: API Contract Checking

The Galerina compiler SHOULD check that route handlers match declared request and response types.

If a handler returns the wrong response type, the compiler SHOULD fail.

Example error:

```text
Route POST /orders expects CreateOrderResponse.
Handler createOrder returns Order.

Suggestion:
Return JsonResponse<CreateOrderResponse>.
```

---

## Concurrency Requirements

### REQ-CONCURRENCY-001: Lightweight Tasks

Galerina SHOULD support lightweight tasks for concurrent work.

Example:

```Galerina
task fetchCustomer = async getCustomer(order.customerId)
task fetchStock = async getStock(order.items)

let customer = await fetchCustomer
let stock = await fetchStock
```

---

### REQ-CONCURRENCY-002: Parallel Blocks

Galerina SHOULD support structured parallel blocks.

Example:

```Galerina
parallel {
  customer = await CustomersApi.get(input.customerId)
  stock = await StockApi.check(input.items)
  risk = await RiskApi.score(input)
} timeout 5s catch error {
  return Err(ApiError.ExternalServiceFailed(error))
}
```

---

### REQ-CONCURRENCY-003: Channels

Galerina SHOULD support channels for event processing.

Example:

```Galerina
channel orders: Channel<OrderEvent> {
  buffer 1000
  overflow "reject"
  dead_letter "./storage/dead/orders.jsonl"
}
```

---

### REQ-CONCURRENCY-004: Worker Pools

Galerina SHOULD support worker pools.

Example:

```Galerina
worker OrderWorker count 8 {
  for event in orders {
    processOrderEvent(event)
  }
}
```

---

### REQ-CONCURRENCY-005: Backpressure

Galerina SHOULD support backpressure controls.

Backpressure options MAY include:

```text
reject
wait
drop_oldest
drop_newest
dead_letter
scale_worker
```

---

## Maths and Compute Requirements

### REQ-MATH-001: Maths-Oriented Types

Galerina SHOULD include maths-oriented types.

Examples:

```text
Vector<N, T>
Matrix<R, C, T>
Tensor<Shape, T>
Decimal
Money<Currency>
```

---

### REQ-MATH-002: Compile-Time Shape Checking

Galerina SHOULD support compile-time shape checking where possible.

Invalid:

```Galerina
Matrix<128, 256> * Matrix<128, 64>
```

Valid:

```Galerina
Matrix<128, 256> * Matrix<256, 64>
```

---

### REQ-MATH-003: Compute Blocks

Galerina MUST support compute blocks as a language concept.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  score = fraudModel(features)
}
```

Compute blocks SHOULD help the compiler identify accelerator-compatible workloads.

---

## Target Requirements

### REQ-TARGET-001: CPU Binary Target

Galerina MUST support normal CPU output.

Early implementations MAY begin with an interpreter before a real binary compiler exists.

Long-term output:

```text
app.bin
```

---

### REQ-TARGET-002: WebAssembly Target

Galerina SHOULD support WebAssembly output.

Output:

```text
app.wasm
```

---

### REQ-TARGET-003: GPU Planning Target

Galerina MUST include GPU as a first-class target concept.

Early output MAY be a plan file:

```text
app.gpu.plan
```

A real GPU backend MAY be added later.

---

### REQ-TARGET-004: Photonic Planning Target

Galerina MUST include photonic as a future accelerator target concept.

Early output SHOULD be a plan file:

```text
app.photonic.plan
```

A real photonic backend MAY be added later when hardware access becomes realistic.

---

### REQ-TARGET-005: Ternary Simulation Target

Galerina SHOULD support ternary / 3-way simulation.

Output:

```text
app.ternary.sim
```

---

### REQ-TARGET-006: Target Fallback

Galerina MUST support explicit target fallback.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  result = model(input)
}
```

Fallback decisions MUST be reported.

---

### REQ-TARGET-007: Target Reports

Galerina MUST generate target reports.

Output:

```text
app.target-report.json
```

The target report SHOULD explain:

```text
which targets passed
which targets failed
which targets used fallback
which compute blocks were compatible
which operations could not be accelerated
```

---

### REQ-TARGET-008: Accelerator Verification and Precision Reports

Galerina MUST treat accelerator output as local computation output.

Galerina MUST NOT imply that photonic, GPU, ternary or quantum targets produce
mysterious external data.

Accelerator output SHOULD be verifiable against CPU reference output where
practical.

Example:

```Galerina
compute target best verify cpu_reference {
  prefer photonic
  fallback gpu
  fallback cpu

  result = fraudModel(features)
}
```

Galerina SHOULD track practical accelerator risks:

```text
signal noise
precision loss
analogue drift
calibration errors
thermal effects
target mismatch
wrong fallback target
rounding differences
hardware-specific behaviour
```

The compiler/runtime SHOULD report:

```text
CPU reference result
accelerator result where available
precision difference
confidence level
fallback reason
source location
```

Output:

```text
app.precision-report.json
```

Galerina SHOULD define an accelerator error correction policy.

The policy SHOULD support:

```text
detecting divergence from CPU reference output
measuring precision difference
retrying transient target errors
falling back to the next declared target
falling back to CPU reference output when available
failing closed when tolerance is exceeded
routing uncertain security or business decisions to Review
```

Galerina MUST NOT claim hardware-level photonic error correction unless a real backend
provides it. Early versions SHOULD report correction policy and planned checks
rather than claiming runtime correction.

---

## Build Requirements

### REQ-BUILD-001: Multi-Stage Build Pipeline

Galerina MUST use a multi-stage build pipeline.

Recommended stages:

```text
1. Read project config
2. Load source files
3. Parse source
4. Build AST
5. Type-check
6. Security-check
7. Memory-check
8. Runtime memory/spill policy check
9. JSON/API contract check
10. Lower to intermediate representation
11. Optimise intermediate representation
12. Link modules
13. Split CPU/GPU/photonic-compatible workloads
14. Emit target outputs
15. Generate source maps
16. Generate map manifest
17. Generate reports
18. Generate documentation
19. Generate AI context files
```

---

### REQ-BUILD-002: Intermediate Representation

Galerina SHOULD compile into an intermediate representation before target output.

Short form:

```text
source â†’ checked IR â†’ optimised IR â†’ target outputs
```

---

### REQ-BUILD-003: Build Output

Galerina SHOULD produce build output similar to:

```text
build/
â”œâ”€â”€ app.bin
â”œâ”€â”€ app.wasm
â”œâ”€â”€ app.gpu.plan
â”œâ”€â”€ app.photonic.plan
â”œâ”€â”€ app.ternary.sim
â”œâ”€â”€ app.openapi.json
â”œâ”€â”€ app.api-report.json
â”œâ”€â”€ app.runtime-report.json
â”œâ”€â”€ app.target-report.json
â”œâ”€â”€ app.security-report.json
â”œâ”€â”€ app.failure-report.json
â”œâ”€â”€ app.source-map.json
â”œâ”€â”€ app.map-manifest.json
â”œâ”€â”€ app.ai-guide.md
â”œâ”€â”€ app.ai-context.json
â”œâ”€â”€ app.build-manifest.json
â””â”€â”€ docs/
    â”œâ”€â”€ api-guide.md
    â”œâ”€â”€ webhook-guide.md
    â”œâ”€â”€ type-reference.md
    â”œâ”€â”€ security-guide.md
    â”œâ”€â”€ runtime-guide.md
    â”œâ”€â”€ deployment-guide.md
    â”œâ”€â”€ ai-summary.md
    â””â”€â”€ docs-manifest.json
```

---

### REQ-BUILD-004: Build Manifest

Galerina MUST generate a build manifest.

Output:

```text
app.build-manifest.json
```

The manifest SHOULD include:

```text
project name
project version
compiler version
build mode
target outputs
source hash
binary hash
dependency hashes
created timestamp
```

---

### REQ-BUILD-005: Map Manifest and Generated Documentation

Galerina SHOULD support required generated documentation and a map manifest as part
of the build contract.

This contract SHOULD be declared in `boot.spore`, not `main.spore`.

```text
boot.spore = project, build, config, target, report and documentation registry
main.spore = application entry point
```

Required generated outputs MAY include:

```text
app.map-manifest.json
app.global-report.json
app.runtime-report.json
app.memory-report.json
app.execution-report.json
app.ai-guide.md
docs/api-guide.md
docs/webhook-guide.md
docs/type-reference.md
docs/global-registry-guide.md
docs/runtime-guide.md
docs/memory-pressure-guide.md
docs/run-compile-mode-guide.md
docs/security-guide.md
docs/deployment-guide.md
docs/ai-summary.md
docs/docs-manifest.json
```

The map manifest SHOULD explain:

```text
which .spore files were compiled
which flows, APIs, webhooks and types exist
which routes map to which handlers
which source files map to generated outputs
which compute blocks map to CPU/GPU/photonic plans
which documentation files were generated
which source hashes produced the build
```

If a project declares documentation or map manifests as required and generation
fails, the build SHOULD fail.

The AI guide SHOULD be regenerated only after a successful compile. Failed
builds SHOULD write failure reports and SHOULD NOT overwrite the last valid AI
guide unless the project explicitly opts into that behaviour.

The AI guide SHOULD include enough build identity to prove what it describes:

```text
project
compiler version
source hash
build manifest path
compiled output path
AI context JSON path
guide hash in app.build-manifest.json
```

Build explanation principles:

```text
If Galerina can compile it, Galerina should be able to explain it.
If the code compiles, the AI guide should describe the code that actually compiled.
Compiled code should always come with generated explanation.
```

---

### REQ-BUILD-006: Deterministic Builds

Galerina SHOULD support deterministic builds.

The same source, dependencies and compiler version SHOULD produce the same build output.

---

## Source Map and Debugging Requirements

### REQ-DEBUG-001: Source Maps

Galerina MUST generate source maps.

Output:

```text
app.source-map.json
```

The source map MUST map compiled output errors back to original `.spore` files.

---

### REQ-DEBUG-002: Original File and Line Errors

Runtime and compile errors SHOULD include:

```text
original file
original line
original column
flow/function name
target output
suggested fix where possible
```

Example:

```text
Runtime error: PaymentStatus.Unknown was not handled.

Original source:
  app/services/order-service.spore:42:7

Suggestion:
  Add a map branch for Unknown.
```

---

### REQ-DEBUG-003: Debug and Release Modes

Galerina SHOULD support debug and release build modes.

Debug builds SHOULD keep more metadata.

Release builds SHOULD optimise output and MAY strip internal symbols, while keeping optional separate source maps.

---

## AI-Friendly Requirements

### REQ-AI-001: AI Context Output

Galerina MUST include an AI context concept.

Suggested command:

```bash
Galerina ai-context
```

Suggested outputs:

```text
build/app.ai-context.json
build/app.ai-context.md
```

---

### REQ-AI-002: AI Explanation Mode

Galerina SHOULD include AI explanation mode.

Suggested command:

```bash
Galerina explain --for-ai
```

This command SHOULD produce compact explanations of:

```text
compiler errors
target failures
security warnings
API contract problems
JSON validation problems
source-map traces
```

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
  "suggestedFix": "Move readFile outside the compute block and pass the parsed data into the model."
}
```

---

### REQ-AI-003: Stable Grammar

Galerina SHOULD use a stable and predictable grammar.

The language SHOULD avoid having many different ways to express the same concept.

This helps:

```text
human readability
compiler implementation
AI assistance
documentation
debugging
```

---

### REQ-AI-004: Machine-Readable Reports

Galerina SHOULD produce machine-readable reports in JSON.

Examples:

```text
app.failure-report.json
app.security-report.json
app.target-report.json
app.api-report.json
app.ai-context.json
```

---

### REQ-AI-005: Token-Efficient Project Context

Galerina SHOULD reduce the need to paste large source files into AI tools.

AI context reports SHOULD summarise:

```text
entry file
routes
types
imports
permissions
targets
errors
changed files
suggested next actions
```

---

### REQ-AI-006: Strict Comments

Galerina SHOULD support strict comments using `/// @tag value`.

Strict comments SHOULD be:

```text
machine-readable
source-mapped
AI-context readable
checked by compiler or linter where practical
rejected or redacted if they contain literal secrets
```

Version 0.1 SHOULD extract strict comments into:

```text
AST reports
app.source-map.json
app.security-report.json
app.ai-context.json
app.ai-context.md
```

Version 0.1 SHOULD warn on obvious mismatches such as:

```text
@output not matching a flow return type
@effects not matching a flow effects declaration
@request or @response not matching an API route
@security requiring HMAC when a webhook has no HMAC declaration
@verify not matching a compute block verify mode
```

Version 0.1 SHOULD NOT require strict comments on every internal helper.
Required strict-comment coverage should be introduced gradually for public,
security, API, webhook, rollback and compute-target boundaries.

---

## Deployment Requirements

### REQ-DEPLOY-001: Build Once, Deploy Many

Galerina SHOULD support build-once, deploy-many deployment.

Flow:

```text
1. Build once
2. Generate hashes
3. Generate build manifest
4. Sign or verify artefact
5. Upload artefact
6. Deploy same artefact to multiple servers
7. Each server loads its own environment variables
8. Health check each server
9. Roll back if checks fail
```

---

### REQ-DEPLOY-002: Environment-Specific Runtime Config

The same compiled artefact SHOULD be usable across different environments.

Examples:

```text
local
staging
production
server A
server B
server C
```

Environment-specific values MUST live outside the compiled output.

---

### REQ-DEPLOY-003: Build Verification

Galerina SHOULD provide verification commands.

Example:

```bash
Galerina verify build/release/app.build-manifest.json
```

Verification SHOULD check:

```text
hashes
target outputs
source maps
dependency versions
security reports
```

---

## Decompilation and Reverse Engineering Requirements

### REQ-DECOMPILE-001: Honest Security Model

Galerina MUST assume compiled output can potentially be reverse engineered.

Compiled files MUST NOT be treated as secret.

---

### REQ-DECOMPILE-002: Release Hardening

Galerina MAY support release hardening features:

```text
symbol stripping
separate source maps
build signing
checksums
optional obfuscation
debug metadata separation
```

---

## Package and Dependency Requirements

### REQ-PACKAGE-001: Lockfile

Galerina SHOULD use a lockfile.

Recommended:

```text
Galerina.lock
```

The lockfile SHOULD record:

```text
dependency names
dependency versions
dependency hashes
package permissions
licence information
target compatibility
```

---

### REQ-PACKAGE-002: Package Permissions

Packages SHOULD declare permissions.

Example:

```Galerina
package_policy {
  allow_network false
  allow_file_write false
  allow_native false
  allow_unsafe false
}
```

---

### REQ-PACKAGE-003: Package Folders

Recommended structure:

```text
packages-galerina/ = Galerina ecosystem packages
vendor/   = external third-party code, native libraries, SDKs or generated files
```

### REQ-PACKAGE-004: Galerina Workspace Package Boundaries

Galerina package-specific behaviour SHOULD live in the owning package.

Ownership:

```text
galerina-core              = language syntax, compiler contracts and core safety rules
galerina-core-logic             = Tri, Galerina, Decision, RiskLevel and Omni logic
galerina-core-vector            = vector values, dimensions, lanes and vector operations
galerina-core-compute           = compute planning, capabilities, budgets and target selection
galerina-ai                = generic AI inference contracts and safety policy
galerina-ai-lowbit            = low-bit and ternary AI inference contracts
galerina-core-photonic     = wavelength, phase, amplitude and optical signal concepts
galerina-target-cpu        = CPU target capability and fallback planning
galerina-cpu-kernels       = optimized CPU kernel contracts
galerina-target-native     = future native executable target planning and artifact metadata
galerina-target-photonic   = photonic backend target planning
galerina-framework-app-kernel        = secure application/API runtime boundary
galerina-framework-api-server        = built-in HTTP transport package
galerina-core-cli               = developer command-line tooling
galerina-core-tasks             = safe project automation
```

If a change affects only package semantics, update that package documentation.
If a change affects `.spore` syntax, compiler validation, report schemas or package
registry behaviour, update `galerina-core` documentation as well.

---

## Tooling Requirements

### REQ-TOOLING-001: CLI Commands

Galerina SHOULD provide these commands:

```bash
Galerina init
Galerina run
Galerina serve --dev
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
```

---

### REQ-TOOLING-002: Formatter

Galerina SHOULD include an official formatter.

Command:

```bash
Galerina fmt
```

---

### REQ-TOOLING-003: Linter

Galerina SHOULD include an official linter.

Command:

```bash
Galerina lint
```

---

### REQ-TOOLING-004: Language Server

Galerina SHOULD eventually provide a language server for editors.

This SHOULD support:

```text
syntax diagnostics
type errors
hover information
go to definition
source-map trace lookup
target compatibility hints
security warnings
```

---

### REQ-TOOLING-005: VS Code Extension

Galerina SHOULD eventually provide a VS Code extension.

Initial support SHOULD include:

```text
syntax highlighting
file icons
basic snippets
diagnostics
formatter integration
```

---

## Documentation Requirements

### REQ-DOCS-001: Core Documentation Files

The repository SHOULD include:

```text
README.md
ABOUT.md
CONCEPT.md
LICENSE
LICENCE.md
NOTICE.md
REQUIREMENTS.md
DESIGN.md
TASKS.md
TODO.md
ROADMAP.md
ARCHITECTURE.md
SECURITY.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
AI-INSTRUCTIONS.md
CHANGELOG.md
GETTING_STARTED.md
DEMO_hello_WORLD.md
GIT.md
COMPILED_APP_GIT.md
.env.example
.gitignore
docs/
```

---

### REQ-DOCS-002: Git Documentation for Galerina Project

The repository SHOULD include:

```text
GIT.md
```

Purpose:

```text
Git workflow for the Galerina language/project repository itself.
```

---

### REQ-DOCS-003: Git Documentation for Compiled Galerina Apps

The repository SHOULD include:

```text
COMPILED_APP_GIT.md
```

Purpose:

```text
Git and deployment guidance for applications built with Galerina, including what should and should not be committed after compilation.
```

---

## Licensing Requirements

### REQ-LICENCE-001: Apache-2.0

Galerina SHOULD use the Apache License 2.0.

The repository MUST include:

```text
LICENSE
```

The project SHOULD also include:

```text
LICENCE.md
NOTICE.md
```

---

### REQ-LICENCE-002: Attribution

The project SHOULD preserve attribution through:

```text
LICENSE
NOTICE.md
README.md licence section
public Git history
clear project identity
```

---

## Initial Version 0.1 Requirements

Version 0.1 SHOULD focus on:

```text
finalised documentation
basic syntax examples
basic grammar draft
parser prototype
AST prototype
interpreter prototype
strict type checker concept
Option and Result concept
Decision type concept
JSON decoding concept
API contract concept
source-map format concept
security report format
target report format
AI context format
```

Version 0.1 SHOULD NOT require:

```text
real photonic hardware
real GPU backend
full package manager
built-in full MVC framework
production compiler
formal verification
```

---

## Final Requirement Statement

Galerina must be practical, strict, safe and future-ready.

The language should provide immediate value through:

```text
strict types
memory safety
JSON-native development
API-native development
source maps
security reports
AI-friendly compiler output
normal CPU compatibility
```

It should prepare for future value through:

```text
GPU planning
photonic planning
ternary simulation
multi-target compilation
accelerator-aware compute blocks
```

The most important requirement is that Galerina must remain useful without future hardware, while being designed to support that future when it arrives.
