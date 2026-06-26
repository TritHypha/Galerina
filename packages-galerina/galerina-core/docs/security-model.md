# Galerina Security Model

This document describes the proposed security model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

Security in Galerina should be part of the language, compiler, runtime, package system, build process and deployment model.

Startup validation is part of that model. A Galerina app should validate
`boot.spore`, imports, packages, globals, secrets, security policy, routes,
webhooks and memory/vector/json policies before `main()` runs. Detailed
planning lives in `docs/startup-validation.md`.

---

## Security Model Summary

Galerina should be secure by default.

The security model should protect against:

```text
unsafe memory
silent null values
undefined values
unhandled errors
implicit type coercion
truthy/falsy mistakes
unsafe JSON payloads
unverified webhooks
secret leakage
unsafe dependency behaviour
unsafe target fallback
compiled-in secrets
unsafe source-map exposure
```

The goal is not to make all software automatically secure.

The goal is to make safe code easier to write and unsafe code harder to write.

---

## Core Security Rule

The core rule is:

```text
Safe by default.
Explicit when risky.
Reported when changed.
Source-mapped when broken.
```

Syntax follows the same rule. A parser accepting a syntax form is not enough to
make that form trusted. Every syntax surface starts untrusted and must earn use
through explicit types, effects, permissions, policies, diagnostics, source maps,
tests and generated reports.

Galerina security should be invariant-led. Declared security policy is part of
program meaning, so the compiler and runtime should prove or deny whether a
flow can expose classified data, use an effect, call a package, cross a
boundary or execute unsafe behaviour.

Security-aware IR should carry permissions, capabilities, classifications,
exposure levels, ownership, actor identity, trust boundaries, side effects,
audit requirements, package authority and runtime isolation requirements.
Checked execution plans should become immutable; normal code must not use
monkey patching, hidden behaviour injection, arbitrary runtime reflection,
dynamic property injection, runtime type rewriting or metadata mutation to gain
authority.

This means new syntax is automatically managed as:

```text
untrusted until typed
untrusted until effect-checked
untrusted until permissioned
untrusted until bounded
untrusted until source-mapped
untrusted until reportable
```

At the value level, Galerina uses `safe` and `unsafe` trust states. `unsafe`
means untrusted or boundary-derived, not memory-unsafe. Unsafe values are
inert: they cannot participate in arithmetic, concatenation, ordinary string or
array helpers, business logic, query interpolation, shell execution, worker
handoff, `GlobalVault` access or runtime APIs.

The only normal operations allowed on an unsafe value are `validate`, `guard`
and `sanitize`, or an explicit safe declaration such as `safe foo` where policy
allows and reports it. `encode.*` is not an unsafe-to-safe conversion. Encoding
requires an already-safe input and returns a context-specific safe output.

Detailed rules live in `docs/trust-conversion-and-data-safety.md`.

Security invariant and proof rules live in
`docs/security-invariants-and-policy-proof.md`.

---

## Default Security Profile

A new Galerina project should begin with strong defaults.

Example:

```Galerina
security {
  memory_safe true
  strict_types true
  null "deny"
  undefined "deny"
  unsafe "deny"
  unhandled_errors "deny"
  implicit_casts "deny"
  truthy_falsy "deny"
  secret_logging "deny"
  source_maps true
}
```

---

## No Undefined

Galerina should not include JavaScript-style `undefined`.

Invalid:

```Galerina
let value = undefined
```

Use:

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

## No Silent Null

Galerina should avoid silent null behaviour.

Missing values should be explicit.

Use:

```Galerina
Option<T>
```

Not:

```text
Customer | null | undefined
```

If JSON contains `null`, Galerina should decode it into `Option<T>` where aLOwed.

---

## Explicit Errors

Galerina should use explicit error handling.

Use:

```Galerina
Result<T, Error>
```

Example:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  let order: Option<Order> = database.findOrder(id)

  match order {
    Some(o) => return Ok(o)
    None    => return Err(OrderError.NotFound)
  }
}
```

Unhandled `Result` values should fail compilation or produce strong warnings.

---

## Strict Types

Galerina should reject implicit type coercion.

Invalid:

```Galerina
let total = "10" + 5
```

Valid:

```Galerina
let total: Int = toInt("10") + 5
```

Strict typing helps prevent:

```text
payment bugs
JSON bugs
API bugs
security decision bugs
date/time bugs
currency bugs
target compatibility bugs
```

---

## No Truthy / Falsy Logic

Only `Bool` should be used in boolean conditions.

Invalid:

```Galerina
if customer {
  process(customer)
}
```

Valid:

```Galerina
match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

This avoids mistakes common in loosely typed languages.

---

## Memory Safety

Galerina should be memory safe by default.

The language should protect against:

```text
buffer overflows
use-after-free
double free
dangling references
out-of-bounds access
uninitialised memory
unsafe shared mutation
data races
null pointer errors
```

Normal Galerina code should not use raw pointers.

Unsafe behaviour should be denied by default.

---

## Unsafe Code

Default:

```Galerina
security {
  unsafe "deny"
}
```

If unsafe code is ever supported, it should be:

```text
explicit
auditable
source-mapped
permission-checked
reported in security reports
blocked in strict profiles
```

Possible future syntax:

```Galerina
unsafe flow callNativeLibrary()
permissions [native_bindings] {
  ...
}
```

---

## SecureString

Secrets should use:

```Galerina
SecureString
```

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

Rules:

```text
SecureString cannot be printed by default
SecureString cannot be logged by default
SecureString cannot be accidentally converted to String
SecureString should be redacted in reports
SecureString should be cleared from memory where possible
```

Invalid:

```Galerina
print(apiKey)
```

Valid:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

---

## Secrets Outside Compiled Files

Galerina should never compile real secrets into output files.

Do not put secrets inside:

```text
app.bin
app.wasm
app.gpu.plan
app.photonic.plan
app.ternary.sim
app.omni-logic.sim
```

Use:

```text
.env for local development
server environment variables
container secrets
cloud secrets managers
deployment platform secrets
```

Rule:

```text
Compiled files are not secret.
Secrets live outside compiled files.
```

---

## Environment Access

Environment access should be explicit.

Example:

```Galerina
let port: Int = env.int("APP_PORT", default: 8080)
let apiKey: SecureString = env.secret("API_KEY")
```

Accessing environment variables should be controlled by permissions.

Example:

```Galerina
permissions {
  environment "restricted"
}
```

---

## Permission Model

Galerina should support project-level permissions.

Example:

```Galerina
permissions {
  network "restricted"
  file_read "aLOw"
  file_write "restricted"
  environment "restricted"
  native_bindings "deny"
}
```

Permissions may apply to:

```text
network access
file reads
file writes
database access
environment access
secret access
native bindings
external processes
package behaviour
```

---

## Package Permissions

Packages should declare the permissions they need.

Example:

```Galerina
package_policy {
  aLOw_network false
  aLOw_file_write false
  aLOw_native false
  aLOw_unsafe false
}
```

The package manager should warn when a dependency asks for risky permissions.

Example warning:

```text
Package galerina-http-client requests network.outbound permission.
Review before aLOwing.
```

---

## Effect System

Galerina should include an effect system.

Effects show what a flow can do.

Example pure flow:

```Galerina
pure flow calculateTax(amount: Money<GBP>) -> Money<GBP> {
  return amount * 0.20
}
```

A pure flow must not:

```text
read files
write files
use network
read environment variables
read time
generate random numbers
change global state
```

Example effectful flow:

```Galerina
flow sendEmail(email: Email) -> Result<Void, EmailError>
effects [network.external] {
  return mailer.send(email)
}
```

---

## JSON Security

Galerina should be JSON-native but strict.

Preferred:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

ALOwed when needed:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

Production code should prefer typed JSON decoding.

---

## JSON Safety Policy

Galerina should support JSON safety limits.

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

This protects against:

```text
oversized payloads
deep nesting attacks
duplicate key ambiguity
unexpected null
missing fields
wrong types
unsafe number conversion
date parsing ambiguity
schema drift
```

---

## API Security

API routes should be explicit and typed.

Example:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    errors [ValidationError, PaymentError]
    timeout 5s
    max_body_size 1mb
    handler createOrder
  }
}
```

API security should include:

```text
typed request bodies
typed response bodies
timeouts
payload size limits
rate limiting
safe error responses
structured logging
safe JSON validation
```

---

## Webhook Security

Webhooks should be secure by default.

A webhook should usually include:

```text
HMAC verification
secret from environment
max age
max body size
replay protection
idempotency key
handler
```

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

## Idempotency

Idempotency prevents duplicate processing.

This matters for:

```text
webhooks
payment captures
order creation
refunds
stock reservation
external API calls
```

Example:

```Galerina
idempotency_key json.path("$.id")
```

The runtime should detect repeated keys and avoid repeating unsafe side effects.

---

## Replay Protection

Webhook replay protection should include:

```text
signature verification
timestamp validation
maximum event age
idempotency key
duplicate detection
body hash verification where useful
```

Old or duplicated webhook events should be rejected or ignored safely.

---

## Rate Limiting

Galerina should support rate limiting for APIs.

Example:

```Galerina
rate_limit {
  requests 100
  window 1m
  overflow "reject"
}
```

Rate limiting protects against:

```text
abuse
brute force attempts
traffic spikes
resource exhaustion
```

---

## Backpressure

Backpressure is a security feature.

Unbounded queues can exhaust memory.

Example:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer 5000
  overflow "dead_letter"
  dead_letter "./storage/dead/webhooks.jsonl"
}
```

Overflow behaviour should always be explicit.

---

## Safe Concurrency

Galerina should prevent data races and unsafe shared mutation.

Concurrency should support:

```text
structured tasks
timeouts
cancellation
safe channels
worker pools
restricted shared state
immutable data by default
```

Shared mutable state should require explicit protection.

---

## Rollback Security

Rollback should be explicit.

Example:

```Galerina
secure flow completeOrder(order: Order) -> Result<Order, OrderError> {
  checkpoint beforeOrderComplete

  reserveStock(order)
  takePayment(order)
  dispatchOrder(order)

  return Ok(order)

} rollback error {
  restore beforeOrderComplete
  releaseStock(order)
  refundPayment(order)

  return Err(error)
}
```

Important rule:

```text
Rollback should not pretend all side effects are reversible.
```

External actions should declare whether they can be reversed.

---

## Compute Block Security

Compute blocks should only contain accelerator-suitable work.

ALOwed:

```text
pure maths
matrix operations
vector operations
tensor operations
model inference
signal processing
```

Rejected:

```text
file I/O
network I/O
database access
environment secret access
mutable global state
random side effects
```

Invalid:

```Galerina
compute target photonic {
  data = readFile("./data.json")
}
```

Valid:

```Galerina
data = readFile("./data.json")

compute target photonic fallback gpu fallback cpu {
  result = model(data)
}
```

---

## Target Fallback Security

Target fallback must be explicit and reported.

Example:

```Galerina
compute target best {
  prefer photonic
  fallback gpu
  fallback cpu

  score = fraudModel(features)
}
```

The compiler should report:

```text
preferred target
selected target
fallback reason
unsupported operations
precision changes
security implications
```

Fallback must never silently change behaviour.

---

## AI Context Security

AI context files must not contain secret values.

Generated files:

```text
app.ai-context.json
app.ai-context.md
```

ALOwed:

```text
route summaries
type summaries
target summaries
security settings
secret variable names
redacted placeholders
```

Not aLOwed:

```text
API key values
passwords
tokens
private keys
database passwords
webhook secret values
```

---

## `Galerina explain --for-ai` Security

The command:

```bash
Galerina explain --for-ai
```

should produce useful debugging context without leaking secrets.

It should include:

```text
error type
file
line
column
problem
why
suggested fix
safe example
```

It should not include:

```text
real secrets
raw tokens
private keys
full `.env` contents
production data
```

---

## Source Map Security

Source maps are useful but can reveal source structure.

Galerina should support:

```text
debug source maps
release source maps
external source maps
restricted source-map access
source-map stripping
```

Production source maps should usually be stored privately.

Do not expose production source maps publicly unless intentionally reviewed.

---

## Error Reporting Security

Public API errors should not expose internals.

Good public response:

```json
{
  "error": "validation_failed",
  "message": "Request payload is invalid."
}
```

Bad public response:

```json
{
  "error": "src/payment-service.spore:42 DATABASE_PASSWORD failed"
}
```

Detailed source-mapped errors should be internal.

---

## Logging Security

Logs should be structured and redacted.

Bad:

```Galerina
log.info("API key", apiKey)
```

Good:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

`SecureString` should not be loggable unless explicitly redacted.

---

## Dependency Security

Galerina should support supply-chain safety through:

```text
Galerina.lock
dependency hashes
package permissions
licence tracking
native binding warnings
unsafe code warnings
network permission warnings
file write permission warnings
```

The lockfile should include:

```text
package name
version
hash
licence
permissions
target compatibility
```

---

## Native Binding Security

Native bindings should be denied by default.

Example:

```Galerina
permissions {
  native_bindings "deny"
}
```

If enabled, native bindings should be:

```text
explicit
auditable
permission-checked
source-mapped
included in security reports
```

---

## Hardware-Assisted Security Features

Galerina should be able to request and report supported hardware-assisted security
features without making them a hidden requirement of normal application code.

Examples:

```text
control-flow protection
secret memory protection
package memory isolation
confidential deployment guidance
GPU confidential compute policy
```

Hardware support must be reported clearly, with safe fallback where possible.
Detailed planning lives in `docs/hardware-feature-detection-and-security.md`.

---

## Kernel and Driver Development

Kernel and driver development is last-stage work and is blocked by default.

It requires explicit maintainer or project permission before design, examples,
compiler support, runtime support, native bindings, backend targets or generated
stubs are added.

Kernel and driver work should wait until Galerina has:

```text
stable language specification
stable memory model
stable security model
stable effect and permission model
native binding policy
target and capability reports
source-map support
audit-friendly diagnostics
```

Blocked unless explicitly approved:

```text
kernel modules
operating-system drivers
privileged runtimes
raw device memory access
raw hardware I/O
vendor SDK driver bindings
direct accelerator driver control
```

Normal Galerina applications should use safe runtime APIs, package permissions and
accelerator planning reports instead of privileged driver access.

---

## Build Security

Galerina should generate build security metadata.

Recommended files:

```text
app.security-report.json
app.build-manifest.json
app.failure-report.json
```

The build manifest should include:

```text
source hash
output hash
dependency hashes
compiler version
build mode
target outputs
created timestamp
```

---

## Deterministic Builds

Galerina should support deterministic builds where possible.

This helps with:

```text
release verification
supply-chain security
auditability
multi-server deployment
rollback
```

---

## Deployment Security

Galerina should support build-once, deploy-many.

Flow:

```text
1. Build once
2. Generate manifest
3. Generate hashes
4. Verify artefact
5. Deploy same artefact to many servers
6. Each server loads its own environment variables
7. Health check
8. Roll back if needed
```

Do not build separately on each server unless necessary.

---

## Decompilation Reality

Compiled output can potentially be reverse engineered.

Galerina may support:

```text
symbol stripping
source-map separation
build signing
checksums
optional obfuscation
```

But the main rule is:

```text
Do not put secrets in compiled output.
```

---

## Security Reports

Galerina should generate:

```text
app.security-report.json
```

The report should include:

```text
security settings
permissions
unsafe usage
secret access
package permissions
webhook security checks
JSON policy checks
API timeout checks
native binding usage
source-map status
target fallback security notes
```

---

## Failure Reports

Galerina should generate:

```text
app.failure-report.json
```

Failure reports should include:

```text
error type
source file
source line
source column
target
build stage
suggested fix
safe example where possible
```

---

## Security Profiles

Galerina defines three main security profiles.

Profiles:

```text
default      = secure baseline for new projects
strict       = production and security-sensitive builds
development = local-only overrides with visible reporting
```

### Default

The default profile is the baseline security posture for new projects.

```text
memory safety enabled
strict types enabled
null denied
undefined denied
unsafe denied
secret logging denied
native bindings denied
unregistered package use denied
```

### Strict

Strict mode is for production, regulated systems, payment flows, security-sensitive APIs and package publication.

```text
warnings fail the build
unsafe denied
native bindings denied unless trusted and audited
secret logging denied
missing package lock hashes fail release builds
webhooks require verification, replay protection and idempotency
source-map publication requires explicit approval
AI context generation must redact secrets and production-only values
```

### Development

Development mode may allow local-only conveniences while keeping risky behaviour visible.

```text
warnings may not fail the build
mock secrets may be allowed
local webhook signature bypass requires explicit dev-only override
source maps may be generated locally
package lock warnings remain visible
native bindings remain denied by default
```

Development overrides must appear in security reports and must not silently carry into release builds.

---

## Security Linter Rules

The security linter should detect risky code before build output is produced.

Minimum linter rules:

```text
deny unregistered package use
warn unused package registrations
deny secret logging
deny SecureString to String conversion
deny missing webhook verification in strict/release builds
deny missing idempotency on mutating webhook handlers
warn broad file, network or environment permissions
deny native bindings unless trusted and audited
warn public source maps in production
deny AI context files containing secret values
warn package lock hash missing outside development
```

Linter findings should include source location, rule id, severity, suggested fix and whether strict mode turns the finding into a build failure.

---

## CI Security Checks

Galerina should support security checks in CI.

Example:

```bash
Galerina check --security
Galerina lint --security
Galerina verify build/release/app.build-manifest.json
```

CI should fail if:

```text
unsafe code is introduced
secret logging is detected
webhooks lack verification
API routes lack timeouts
JSON policies are missing
dependencies request risky permissions
target fallback is unsafe
```

---

## Security Non-Goals

Galerina should not claim to make every application secure automatically.

Developers still need:

```text
secure infrastructure
safe deployments
good monitoring
dependency updates
code reviews
secret management
testing
threat modelling
```

Galerina should reduce common mistakes, not remove all responsibility.

---

## Open Security Questions

```text
Should unsafe code exist at all?
Should production source maps be generated by default?
Should package permissions be enforced at compile time or install time?
Should Galerina include built-in CSRF support for browser apps?
Should API authentication be a language feature or framework feature?
Should AI context generation require an explicit flag in production?
```

## API Data Security and Load Control

Galerina should treat API input as unsafe until it has been decoded into strict
types and checked against route policy.

Core rule:

```text
Do not trust API input.
Decode into strict types.
Limit memory.
Limit concurrency.
Queue or reject overload safely.
Report everything.
```

Galerina should provide typed primitives and reports for:

```text
content-type validation
request body policies
strict JSON parsing
unknown-field denial
duplicate-key denial
unsafe coercion denial
per-route body size limits
per-route memory budgets
streaming request bodies
read-only request body references
request-scoped lifetime checks
IP, user, API-key and route rate limits
trusted proxy rules for client identity
route concurrency limits
queue handoff for heavy work
backpressure and overload behaviour
API security, memory and load-control reports
```

Galerina should not provide:

```text
web framework routing implementation
load balancer products
API gateway products
rate-limit storage backends
queue storage backends
request analytics dashboards
```

Detailed planning lives in `docs/api-data-security-and-load-control.md`.

---

## API Duplicate Detection and Idempotency

Galerina should detect duplicate API structure at check/build time and help prevent
duplicate runtime side effects through idempotency and replay protection.

Galerina should provide typed primitives and reports for:

```text
duplicate method/path route errors
duplicate route name warnings or errors
duplicate request/response shape warnings
API manifest generation
idempotency declarations
idempotency TTL and conflict policy checks
payload mismatch policy checks
webhook idempotency keys
webhook replay protection
duplicate external API client warnings
duplicate outbound API call warnings
security report integration
AI guide API safety summaries
```

Galerina should not provide:

```text
fixed router implementation
controller framework
middleware stack
API gateway product
admin route dashboard
idempotency storage backend
```

Detailed planning lives in
`docs/api-duplicate-detection-and-idempotency.md`.

---

## Auth, Token and Verification Boundary

Galerina should support standard auth and verification workflows safely without
becoming an identity provider or inventing cryptography.

Core rule:

```text
Do not invent new cryptography.
Do create safer language-level patterns around proven cryptography.
```

Galerina should provide typed primitives and reports for:

```text
BearerToken as SecureString
JwtToken as SecureString
VerifiedJwt<TClaims>
OAuth provider declarations
issuer/audience/scope checks
authorization code with PKCE
JWKS validation
DPoP proof-of-possession
mTLS-bound access tokens
request proof envelopes
verified capability tokens
idempotency and replay protection
post-quantum/hybrid crypto policy
experimental hardware proof policy
```

Galerina should not provide:

```text
identity provider products
login screens
MFA products
password reset workflows
session database products
admin permission dashboards
new cryptographic algorithms
```

Detailed planning lives in `docs/auth-token-verification-boundaries.md`.

---

## Final Security Principle

Galerina security should be practical, strict and visible.

The language should make unsafe behaviour:

```text
harder to write
easy to detect
easy to report
easy to trace
easy to reject in CI
```

The best Galerina security model is one where developers can build real JSON/API systems while avoiding common mistakes by default.
