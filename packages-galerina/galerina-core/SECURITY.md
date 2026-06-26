# Galerina Security

This document describes the security model and security goals for **Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

Security should not be added later as a framework feature. Security should be part of the language, compiler, runtime, package system, build process and deployment model from the beginning.

Galerina's strongest defensible security position is secure-runtime policy:
typed APIs, deny-by-default effects, memory-safe values, secret-safe reporting,
controlled interop, production gates and AI-safe project context.

Galerina should not claim to make Ethernet hardware faster. Its network security
position is typed, permissioned and reportable network use: deny-by-default
network access, TLS policy, host and port allowlists, raw socket restrictions,
timeouts, backpressure and deployment reports.

---

## Security Summary

Galerina should be secure by default.

The language should prevent or reduce common software risks such as:

```text
unsafe memory access
buffer overflows
use-after-free errors
null pointer errors
unhandled errors
implicit type conversion bugs
truthy/falsy logic mistakes
unsafe JSON handling
webhook replay attacks
secret leakage
unsafe dependency behaviour
compiled-in secrets
unclear runtime errors
unsafe target fallback
```

Galerina should make safe code easier to write than unsafe code.

---

## Core Security Principles

Galerina should follow these principles:

```text
No undefined.
No silent null.
No unsafe memory by default.
No hidden errors.
No accidental truthy/falsy logic.
No implicit type coercion.
No compiled secrets.
No secret logging by default.
No unverified webhooks.
No unreported target fallback.
No runtime error without source mapping.
```

---

## Security-First Defaults

A new Galerina project should start with strict security defaults.

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

The default project should be safe even if the developer does not configure advanced security settings.

---

## Threat Model

Galerina should be designed with the following threats in mind:

```text
malicious API requests
malicious JSON payloads
webhook replay attacks
oversized payload attacks
deeply nested JSON attacks
dependency supply-chain attacks
secret leakage in logs
unsafe environment variable handling
unsafe native bindings
unsafe memory usage
concurrent data races
incorrect payment/risk decisions
incorrect target fallback
debug data leakage
reverse engineering of compiled output
```

---

## Memory Safety

Galerina should be memory safe by default.

The language should protect against:

```text
use-after-free
double free
dangling references
buffer overflow
out-of-bounds access
uninitialised memory
unsafe shared mutation
data races
null pointer errors
```

Possible memory model:

```text
ownership by default
safe borrowing
immutable by default
explicit mutability
safe references
bounds-checked collections
no raw pointers in normal code
unsafe denied by default
```

---

## Unsafe Code

Unsafe code should be denied by default.

Example:

```Galerina
security {
  unsafe "deny"
}
```

If unsafe features are ever supported, they should require explicit project permission and clear source-level marking.

Example future form:

```Galerina
unsafe flow callNativeLibrary()
permissions [native_bindings] {
  ...
}
```

Unsafe code should be:

```text
easy to find
easy to audit
blocked by default
reported in security reports
excluded from secure profiles unless explicitly aLOwed
```

---

## Kernel and Driver Development

Kernel and driver development is last-stage work.

It should not be part of normal Galerina application development, normal compiler
prototype work or ordinary backend planning.

Rule:

```text
kernel and driver development is blocked by default
kernel and driver development requires explicit maintainer or project permission
kernel and driver development must wait until the language, memory model,
security model, native binding policy and target reports are stable
```

Blocked unless explicitly approved:

```text
kernel modules
operating-system drivers
privileged device access
raw hardware access
vendor SDK driver bindings
unsafe native bindings for devices
```

Galerina should get safe application, runtime, report and target-planning behaviour
right before any privileged platform work starts.

---

## Strict Types

Galerina should be strictly typed.

The language should reject unsafe implicit conversion.

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
payment calculation mistakes
JSON decoding errors
unexpected boolean behaviour
currency bugs
date/time parsing bugs
API contract drift
security decision errors
```

---

## No Truthy / Falsy Logic

Galerina should not allow accidental truthy/falsy checks.

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

This prevents bugs caused by treating strings, numbers, objects or missing values as booleans.

---

## No Undefined

Galerina should not include JavaScript-style `undefined`.

Missing values should use:

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

This forces missing data to be handled.

---

## No Silent Null

Galerina should avoid silent null behaviour.

Normal application code should not rely on null.

Instead use:

```Galerina
Option<T>
```

For example:

```Galerina
Option<Customer>
Option<Order>
Option<String>
```

This reduces null pointer errors and missing-value bugs.

---

## Explicit Error Handling

Galerina should use explicit errors.

Functions that can fail should return:

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

Unhandled errors should fail compilation.

---

## Security Decisions

Security-sensitive decisions should not be represented as simple booleans when more than two states are possible.

Avoid:

```Galerina
let aLOwed: Bool = checkAccess(user)
```

Prefer:

```Galerina
enum Decision {
  ALOw
  Deny
  Review
}
```

Example:

```Galerina
secure flow accessDecision(user: User, resource: Resource) -> Decision {
  match policy.check(user, resource) {
    Valid   => ALOw
    Invalid => Deny
    Unknown => Review
  }
}
```

This is safer for:

```text
fraud checks
payment checks
access control
AI confidence
risk scoring
webhook validation
policy enforcement
```

---

## SecureString

Galerina should include a `SecureString` type for secrets.

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

`SecureString` rules:

```text
cannot be printed by default
cannot be logged by default
cannot be converted to String accidentally
should be redacted in debug output
should be cleared from memory where possible
should require explicit reveal in approved secure contexts
```

Invalid:

```Galerina
print(apiKey)
```

Expected compiler error:

```text
Security error:
Cannot print SecureString.

Suggestion:
Do not log secrets. Use safe redaction if required.
```

---

## Environment Variables and Secrets

Secrets should live outside compiled files.

Recommended sources:

```text
.env for local development
server environment variables
container secrets
cloud secrets managers
deployment platform secrets
```

Galerina should not compile real secrets into:

```text
app.bin
app.wasm
app.gpu.plan
app.photonic.plan
```

Recommended rule:

```text
Compiled files are not secret.
Secrets live outside compiled files.
```

---

## `.env` Rules

Local `.env` files should not be committed.

Commit:

```text
.env.example
```

Do not commit:

```text
.env
.env.local
.env.production
.env.staging
```

Example `.env.example`:

```env
APP_ENV=local
APP_PORT=8080
DATABASE_URL=
API_KEY=
WEBHOOK_SECRET=
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

Permissions should apply to:

```text
network access
file read access
file write access
database access
environment access
secret access
native bindings
package behaviour
external processes
```

---

## Package Permissions

Packages should declare permissions.

Example:

```Galerina
package_policy {
  aLOw_network false
  aLOw_file_write false
  aLOw_native false
  aLOw_unsafe false
}
```

The compiler or package manager should warn when a dependency requests risky permissions.

Example warning:

```text
Package galerina-external-http requests network.outbound permission.

Review before aLOwing.
```

---

## Effect System

Galerina should support an effect system.

Effects declare what a flow is aLOwed to do.

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
access current time
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

This makes side effects visible and auditable.

---

## JSON Security

Galerina should treat JSON as first-class, but not loosely typed.

Production JSON should be decoded into strict Galerina types.

Preferred:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

ALOwed when necessary:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

---

## JSON Policy

Galerina should support JSON safety policies.

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
unexpected null values
unknown fields
wrong types
unsafe number conversion
date parsing ambiguity
schema drift
```

---

## JSON Redaction

Galerina should support safe redaction.

Example:

```Galerina
log.info("Webhook received", redact(payload, fields: ["password", "token", "apiKey"]))
```

Sensitive fields should be redacted in:

```text
logs
debug reports
AI context files
failure reports
security reports
source-map explanations
```

---

## API Security

Galerina should make API security easy to configure.

API features should include:

```text
typed requests
typed responses
payload size limits
request timeouts
request cancellation
rate limiting
authentication hooks
authorisation hooks
safe JSON validation
structured logging
safe error responses
```

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

---

## Webhook Security

Webhooks should be secure by default.

Galerina should support:

```text
HMAC signature verification
timestamp validation
maximum webhook age
payload size limits
idempotency keys
replay protection
duplicate event detection
safe JSON decoding
dead-letter queues
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

APIs and webhooks should support idempotency.

This prevents duplicated processing when a request or webhook is sent more than once.

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

If a webhook is too old, duplicated or has an invalid signature, Galerina should reject it safely.

---

## Rate Limiting

Galerina should support rate limiting for API routes.

Example:

```Galerina
rate_limit {
  requests 100
  window 1m
  overflow "reject"
}
```

Rate limiting should be source-mapped and included in API/security reports.

---

## Backpressure Security

Backpressure is a security concern.

If a system accepts unlimited events, it can run out of memory or crash.

Galerina channels should support buffer limits.

Example:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer 5000
  overflow "dead_letter"
  dead_letter "./storage/dead/webhooks.jsonl"
}
```

Overflow behaviour should be explicit.

Options may include:

```text
reject
wait
drop_oldest
drop_newest
dead_letter
scale_worker
```

---

## Concurrency Security

Galerina should prevent data races and unsafe shared mutation.

Concurrency features should support:

```text
structured concurrency
safe task cancellation
timeouts
channel ownership
worker isolation
restricted shared state
immutable data by default
```

Shared mutable state should require explicit safe wrappers or synchronisation.

---

## Rollback Security

Rollback should be first-class for multi-step workflows.

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
Rollback should not pretend all actions are reversible.
```

External side effects should declare whether they are reversible.

Example:

```text
database write        → reversible if transaction exists
payment capture       → reversible through refund/void
email sent            → not reversible
external webhook sent → not always reversible
```

---

## Compute Block Security

Compute blocks should be restricted.

ALOwed operations may include:

```text
pure maths
matrix operations
vector operations
tensor operations
model inference
signal processing
```

Rejected operations should include:

```text
file I/O
network I/O
database access
environment secret access
random side effects
mutable global state
unsafe native calls
```

Invalid:

```Galerina
compute target photonic {
  result = readFile("./data.txt")
}
```

Expected error:

```text
Target error:
readFile cannot run inside a photonic compute block.

Suggestion:
Move file reading outside the compute block.
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
available target
selected target
fallback reason
unsupported operations
precision changes
security implications
```

Fallback should never silently change behaviour.

---

## GPU and Photonic Security

GPU and photonic targets should be treated as restricted execution environments.

They should normally be used only for:

```text
pure compute
maths-heavy operations
model inference
matrix/tensor operations
```

They should not handle:

```text
secrets
raw environment variables
unvalidated JSON
network requests
file access
database access
business side effects
```

---

## Source Maps and Security

Source maps are essential for debugging, but they can reveal source structure.

Galerina should support:

```text
debug source maps
release source maps
external source maps
restricted source-map access
source-map stripping
```

Production source maps should be stored securely where needed.

Do not expose sensitive source maps publicly without review.

---

## Error Reporting Security

Errors should be useful but safe.

Public API errors should not leak:

```text
secrets
stack traces
internal file paths
database credentials
environment variable names where sensitive
raw webhook secrets
full source-map data
```

Internal reports may include detailed source-mapped errors.

Public responses should be safe and limited.

Example public response:

```json
{
  "error": "validation_failed",
  "message": "Request payload is invalid."
}
```

Example internal report:

```json
{
  "errorType": "JsonValidationError",
  "file": "src/routes.spore",
  "line": 22,
  "field": "customerId",
  "problem": "Missing required field"
}
```

---

## AI Context Security

AI context files should not contain secrets.

Generated AI files should redact:

```text
API keys
tokens
passwords
database passwords
webhook secrets
SecureString values
private keys
session secrets
```

Command:

```bash
Galerina ai-context
```

Should generate safe summaries.

Example safe output:

```json
{
  "project": "OrderRiskDemo",
  "routes": ["POST /orders"],
  "secrets": ["PAYMENT_WEBHOOK_SECRET"],
  "secretValues": "[redacted]"
}
```

---

## `Galerina explain --for-ai` Security

The command:

```bash
Galerina explain --for-ai
```

should produce compact AI-friendly output without leaking secrets.

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
secret values
full environment files
private keys
raw tokens
sensitive production data
```

---

## Logging Security

Galerina should support structured logging with safe defaults.

Sensitive values should be redacted automatically where possible.

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

The Galerina package system should help prevent supply-chain issues.

It should support:

```text
lockfile hashes
dependency permissions
licence tracking
package source verification
native binding warnings
unsafe code warnings
network permission warnings
file write permission warnings
```

Recommended lockfile:

```text
Galerina.lock
```

The lockfile should record:

```text
package name
version
hash
licence
permissions
target compatibility
```

---

## Native Bindings

Native bindings should be denied by default.

Example:

```Galerina
permissions {
  native_bindings "deny"
}
```

If native bindings are enabled, they should be:

```text
explicit
auditable
permission-checked
included in security reports
excluded from secure profiles unless aLOwed
```

---

## Build Security

Galerina builds should generate security metadata.

Recommended output:

```text
build/app.security-report.json
build/app.build-manifest.json
build/app.failure-report.json
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

This supports verification and deployment safety.

---

## Deterministic Builds

Galerina should support deterministic builds where possible.

The same source, dependencies and compiler version should produce the same output.

This helps with:

```text
supply-chain security
release verification
auditability
reproducible builds
multi-server deployment
```

---

## Build Signing

Galerina may support build signing later.

Possible command:

```bash
Galerina verify build/release/app.build-manifest.json
```

Future support may include:

```text
artefact signing
signature verification
release attestations
dependency attestations
```

---

## Deployment Security

Galerina should support build-once, deploy-many.

Safe deployment flow:

```text
1. Build once
2. Generate manifest
3. Generate hashes
4. Verify artefact
5. Upload artefact
6. Deploy same artefact to multiple servers
7. Each server loads its own environment variables
8. Health check each server
9. Roll back if checks fail
```

Do not build separately on each production server unless necessary.

---

## Multi-Server Secrets

Each server should use its own runtime configuration.

Example:

```text
Server A → app.bin + environment variables
Server B → app.bin + environment variables
Server C → app.bin + environment variables
```

The compiled artefact should be the same.

Secrets should be injected at runtime.

---

## Decompilation and Reverse Engineering

Galerina should assume compiled output can potentially be reverse engineered.

Security should not depend on hiding secrets in compiled files.

Galerina may support:

```text
symbol stripping
debug metadata separation
external source maps
checksums
build signing
optional obfuscation
```

But the rule remains:

```text
Do not put secrets in compiled output.
```

---

## Security Reports

Galerina should generate a security report.

Output:

```text
build/app.security-report.json
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

Example:

```json
{
  "security": {
    "unsafe": "deny",
    "undefined": "deny",
    "null": "deny",
    "secretLogging": "deny"
  },
  "webhooks": [
    {
      "name": "PaymentWebhook",
      "hmac": "enabled",
      "replayProtection": true,
      "idempotency": true
    }
  ]
}
```

---

## Failure Reports

Galerina should generate failure reports.

Output:

```text
build/app.failure-report.json
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

These reports should be usable by:

```text
developers
CI pipelines
AI assistants
security tools
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
source maps are missing where required
target fallback is unsafe
```

---

## Security TODO

```text
[ ] Define full threat model
[x] Define security profiles
[x] Define SecureString behaviour
[x] Define permission model
[x] Define effect model
[x] Define package permission schema
[x] Define security report schema
[x] Define JSON security rules
[x] Define API security rules
[x] Define webhook security rules
[x] Define source-map security rules
[x] Define AI context redaction rules
[x] Define deployment security rules
[x] Define native binding policy
[x] Define CI security checks
```

---

## Security Non-Goals

Galerina should not claim to make all software automatically secure.

Security still requires:

```text
good architecture
good deployment
secure infrastructure
safe dependency choices
careful secret management
testing
reviews
monitoring
updates
```

Galerina should reduce common mistakes, not pretend security is automatic.

---

## Final Security Statement

Galerina should make secure software easier to write and unsafe software harder to write.

The language, compiler and runtime should work together to provide:

```text
strict types
memory safety
explicit errors
safe JSON handling
safe API design
secure webhook handling
secret protection
permission checks
source-mapped debugging
AI-safe reports
secure build outputs
deployment-ready manifests
```

Security must be part of Galerina from the first design stage, not an optional feature added later.
