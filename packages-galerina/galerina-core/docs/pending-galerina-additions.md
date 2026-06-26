# Galerina Pending Additions

This document collects Galerina ideas that should be added to the documentation or
checked against the current repository.

The purpose is to avoid losing important concepts while the Galerina language and
documentation structure is being refined.

Status note:

```text
This file is a planning snapshot.
The live rolling tracker is docs/pending-additions.md.
```

---

## Summary

Galerina already has a strong concept around:

```text
strict types
memory safety
security-first design
JSON-native APIs
AI-friendly reports
source maps
compile and run modes
future GPU / photonic / ternary targets
```

The following items should be added, reviewed or confirmed in the repository.

---

## 1. Generated Outputs in Run Mode

Status: documented in `docs/run-and-compile-modes.md`; prototype support exists
for `Galerina run --generate`, `Galerina generate`, `Galerina dev` and `Galerina dev --watch`.

Galerina should be able to generate useful outputs even when the project is not
fully compiled.

A full production compile should still generate the complete build artefacts,
but development mode should also be able to generate reports, guides and
documentation from checked source.

Suggested commands:

```bash
Galerina run
Galerina run --generate
Galerina generate
Galerina dev
Galerina dev --watch
Galerina build
Galerina build --mode release
```

Current prototype command examples:

```bash
node compiler/galerina.js run examples/hello.spore --generate --out .build-dev-run
node compiler/galerina.js generate examples --exclude source-map-error.spore --out .build-dev
node compiler/galerina.js dev examples/hello.spore --out .build-dev
node compiler/galerina.js dev examples/hello.spore --watch --out .build-dev
node compiler/galerina.js build examples --exclude source-map-error.spore --out build/examples
```

Command behaviour:

| Command | Runs App | Generates Docs/Reports | Produces Binary |
|---|---:|---:|---:|
| `Galerina run` | Yes | Optional | No |
| `Galerina run --generate` | Yes | Yes | No |
| `Galerina generate` | No | Yes | No |
| `Galerina dev` | Yes | Yes | No |
| `Galerina dev --watch` | Yes | Yes | No |
| `Galerina build` | Optional | Yes | Yes |
| `Galerina build --mode release` | No / optional | Yes | Yes |

Development generated outputs:

```text
.build-dev/
|-- app.ai-guide.md
|-- app.ai-context.json
|-- app.ai-context.md
|-- app.api-report.json
|-- app.failure-report.json
|-- app.global-report.json
|-- app.map-manifest.json
|-- app.memory-report.json
|-- app.openapi.json
|-- app.schemas.json
|-- app.security-report.json
|-- app.source-map.json
|-- app.tokens.json
`-- docs/
    |-- ai-summary.md
    |-- api-guide.md
    |-- deployment-guide.md
    |-- docs-manifest.json
    |-- global-registry-guide.md
    |-- memory-pressure-guide.md
    |-- run-compile-mode-guide.md
    |-- runtime-guide.md
    |-- security-guide.md
    |-- type-reference.md
    `-- webhook-guide.md
```

These are development outputs. They should explain the checked source without
requiring a production binary.

Production generated outputs:

```text
build/
|-- app.bin
|-- app.wasm
|-- app.browser.js
|-- app.gpu.plan
|-- app.photonic.plan
|-- app.ternary.sim
|-- app.omni-logic.sim
|-- app.openapi.json
|-- app.schemas.json
|-- app.api-report.json
|-- app.global-report.json
|-- app.runtime-report.json
|-- app.memory-report.json
|-- app.execution-report.json
|-- app.precision-report.json
|-- app.target-report.json
|-- app.security-report.json
|-- app.failure-report.json
|-- app.source-map.json
|-- app.map-manifest.json
|-- app.tokens.json
|-- app.ai-guide.md
|-- app.ai-context.json
|-- app.ai-context.md
|-- app.build-manifest.json
`-- docs/
    |-- ai-summary.md
    |-- api-guide.md
    |-- deployment-guide.md
    |-- docs-manifest.json
    |-- global-registry-guide.md
    |-- memory-pressure-guide.md
    |-- run-compile-mode-guide.md
    |-- runtime-guide.md
    |-- security-guide.md
    |-- type-reference.md
    `-- webhook-guide.md
```

Rule:

```text
Generated explanation should not require a production compile.
Production artefacts require a compile.
```

---

## 2. Unified Development Command

Status: documented in `docs/run-and-compile-modes.md`; prototype support exists
for one checked `Galerina dev` cycle and `Galerina dev --watch` can re-run that cycle when
`.spore` files change.

Galerina should have a single command for development.

Recommended:

```bash
Galerina dev
```

This should:

```text
check source
generate development outputs
update AI guide
update API docs
update schemas
run the app
watch for changes if requested
```

Prototype watch mode:

```bash
Galerina dev --watch
```

Suggested `Galerina dev` flow:

```text
read boot.spore
parse source files
type-check source
security-check source
check strict comments
check API/webhook contracts
generate development reports
generate AI guide
generate docs
run application
watch for changes if enabled
```

---

## 2A. Startup Validation

Status: documented in `docs/startup-validation.md`; full startup report,
environment validation, route/security policy checks and package permission
checks remain pending.

Core rule:

```text
Galerina must validate the project before main() runs.
```

Startup order:

```text
1. Read boot.spore
2. Validate project config
3. Validate imports and packages
4. Validate globals, env vars and secrets
5. Validate security policy
6. Validate routes/webhooks
7. Validate memory/vector/json policies
8. Load entry file
9. Run main()
```

---

## 3. AI Token Reduction

Status: documented in `docs/ai-token-reduction.md`; prototype support exists
for `Galerina ai-context`, `Galerina explain --for-ai` and `Galerina tokens`.

Core idea:

```text
Do not make AI read the whole project.
Make Galerina generate compact, trusted summaries from the code that actually compiled or checked successfully.
```

AI-friendly generated files:

```text
app.ai-guide.md
app.ai-context.json
app.ai-context.md
app.failure-report.json
app.source-map.json
app.map-manifest.json
app.tokens.json
app.api-report.json
app.security-report.json
```

Suggested commands:

```bash
Galerina ai-context
Galerina explain --for-ai
Galerina tokens
Galerina summarize
Galerina changed
```

Suggested config:

```Galerina
ai_context {
  token_budget 4000
  include_changed_files true
  include_routes true
  include_types true
  include_security_summary true
  include_strict_comments true
  exclude_generated_files true
  redact_secrets true
}
```

---

## 4. Memory and Variable Use

Status: documented in `docs/memory-and-variable-use.md`; prototype diagnostics
exist for explicit `Json.clone()` warnings and mutation through read-only
`&Json` parameters.

Core rule:

```text
Galerina should avoid hidden copies of large values.
```

Large immutable values such as JSON payloads should be passed by safe read-only
reference. They should remain local to the owning flow and be cleaned up when
no longer needed.

If a value must be modified, Galerina should use explicit mutation rules or
copy-on-write.

If a full copy is required, the developer must call:

```Galerina
clone()
```

explicitly.

Goals:

```text
no global variable dependency
no repeated 500kb copies
safe local lifetime
fast read-only sharing
explicit copies only
better memory control
```

Example:

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  verifySignature(&payload)
  let eventType: String = json.pick<String>(&payload, "$.type")
  processEvent(&payload)

  return JsonResponse({ "received": true })
}
```

Expected memory behaviour:

```text
payload loaded once
payload borrowed by read-only reference
no repeated 500kb copies
payload cleaned up when handleWebhook ends
```

---

## 5. Lazy Compact JSON

Status: documented in `docs/lazy-compact-json.md`; compiler/linter support
remains pending.

Core rule:

```text
Small JSON stays simple.
Read-only JSON is borrowed.
Dataset-style JSON can use repeated node shape optimisation.
Modified or duplicated JSON is checked before copying.
Compact only when the saving is worthwhile.
Patch instead of duplicating.
Stream when very large.
Keep compact format internal.
```

Compact conversion should be considered when:

```text
JSON is modified
JSON is duplicated
JSON is patched
JSON is redacted into a new value
JSON is transformed into another structure
JSON has repeated dataset-like node shapes
JSON is repeatedly accessed in memory-heavy ways
JSON exceeds a configured node threshold and would otherwise be copied
```

Repeated node shape example:

```json
[
  { "id": "1", "name": "A", "status": "active" },
  { "id": "2", "name": "B", "status": "active" },
  { "id": "3", "name": "C", "status": "active" }
]
```

Repeated shape:

```text
id, name, status
```

Internal compact concept:

```text
schema:
  1 = id
  2 = name
  3 = status

rows:
  ["1", "A", "active"]
  ["2", "B", "active"]
  ["3", "C", "active"]
```

Suggested policy:

```Galerina
json_policy {
  max_body_size 1mb
  max_depth 32
  duplicate_keys "deny"

  compact {
    mode "lazy"

    node_threshold 1000
    repeated_key_threshold 5
    min_saving "20%"

    trigger [
      "modified",
      "duplicated",
      "patched",
      "copy_pressure",
      "repeated_node_shapes"
    ]

    repeated_node_shapes {
      enabled true
      min_shape_reuse 5
      min_matching_keys 3
      min_dataset_nodes 100
      min_saving "20%"
    }

    key_interning true
    string_interning true
    shape_detection true
    copy_on_write true
  }
}
```

---

## 6. Pure Flow Caching

Status: documented in `docs/pure-flow-caching.md`; compiler checks remain
pending.

Core rule:

```text
Only deterministic, side-effect-free flows can be cached automatically.
```

Cache limit rule:

```text
calculate the result
return the result
do not store it in cache
record cache bypass
recommend better settings if useful
```

Example:

```Galerina
pure flow normalisePostcode(postcode: String) -> String
cache {
  scope process
  max_entries 10000
  memory_limit 8mb
  eviction "least_recently_used"

  on_limit {
    action "bypass_cache"
    report true
    recommend_increase true
  }
} {
  return postcode.trim().uppercase().replace(" ", "")
}
```

---

## 7. Memory Pressure and Disk Spill

Status: documented in `docs/memory-pressure-and-disk-spill.md`; prototype
runtime and memory reports exist.

Memory pressure ladder:

```text
1. Free short-lived finished values.
2. Evict eligible caches.
3. Bypass cache storage.
4. Apply backpressure to queues and channels.
5. Spill approved data to disk if configured.
6. Reject new work safely.
7. Fail gracefully before uncontrolled out-of-memory.
```

Spill rule:

```text
Only approved non-secret data may spill to disk.
```

ALOwed:

```text
large JSON stream buffers
dead-letter queue events
temporary batch-processing data
build cache data
non-secret pure-flow cache entries
large sort/transform intermediate data
```

Denied:

```text
SecureString values
API keys
payment tokens
session secrets
private keys
raw unredacted webhook payloads
live request context
database connections
file handles
network sockets
```

---

## 8. Omni Logic

Status: documented in `OMNI_LOGIC.md`, `docs/omni-logic.md`,
`docs/logic-widths.md` and `docs/logic-targets.md`; prototype emits
Omni-logic planning artefacts.

Core model:

```text
Bool       = two-state logic
Tri        = three-state logic
Decision   = business/security three-state logic
Galerina   = future multi-state logic
```

Rule:

```text
Do not hard-code three states into the language core.
Make three-way logic a standard logic domain.
Make multi-state logic a first-class extension point.
```

Example:

```Galerina
logic RiskLevel {
  VeryLow
  Low
  Review
  High
  Critical
}
```

---

## 9. Strict Global Registry

Status: documented in `docs/strict-global-registry.md`; prototype parsing,
global reports, generated registry docs and secret redaction checks exist.

Core rule:

```text
Local by default.
Global by declaration.
Mutable only by controlled state.
Secrets always protected.
```

Example:

```Galerina
globals {
  readonly APP_NAME: String = "OrderRiskDemo"
  readonly APP_VERSION: String = "0.1.0"

  config APP_PORT: Int = env.int("APP_PORT", default: 8080)
  config API_TIMEOUT: Duration = 5s

  secret PAYMENT_WEBHOOK_SECRET: SecureString = env.secret("PAYMENT_WEBHOOK_SECRET")
}
```

---

## 10. Strict Comments

Status: documented in `docs/strict-comments.md`; prototype extraction and basic
mismatch diagnostics exist.

Core rule:

```text
Strict comments are checked intent.
```

Example:

```Galerina
/// @purpose Handles payment provider webhook events.
/// @security HMAC must be verified before JSON decoding.
/// @effects [network.inbound, database.write]
/// @idempotency Required using $.id
/// @ai-risk Do not process event data before signature verification.
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

## 11. Generated Output And Runtime Ergonomics

Status: documented in `docs/generated-output-and-runtime-ergonomics.md`.

Best positioning:

```text
Galerina is designed for developers who want readable source, strict types,
memory-safe runtime behavior, built-in API/security reports, AI-friendly project
summaries and future accelerator planning.
```

Galerina differentiators:

```text
secure runtime deployment
strict types by default
explicit large value memory behaviour
Lazy Compact JSON
API/webhook contracts
security reports
AI token reduction
source maps
target reports
generated docs
```

---

## 11A. Kernel and Driver Development Boundary

Status: documented in `docs/kernel-and-driver-boundary.md`.

Core rule:

```text
Kernel and driver development is last-stage Galerina work.
It requires explicit maintainer or project permission.
It is not part of normal application, compiler prototype or target-planning work.
```

Blocked unless explicitly approved:

```text
kernel modules
operating-system drivers
privileged runtimes
raw hardware access
vendor SDK driver bindings
unsafe native bindings for devices
direct accelerator driver control
```

Docs and examples should not imply that Galerina already supports kernel or driver
development.

---

## 12. Missing Formal Language Files

Status: the original formal documentation bundle now exists. Remaining work is
depth, not file creation.

Present files include:

```text
SPEC.md
GOVERNANCE.md
COMPATIBILITY.md
docs/contracts.md
docs/modules-and-visibility.md
docs/standard-library.md
docs/error-codes.md
docs/compiler-backends.md
docs/testing.md
docs/observability.md
docs/interoperability.md
docs/kernel-and-driver-boundary.md
docs/xml-support.md
docs/graphql-support.md
```

Highest priority expansion:

```text
SPEC.md
docs/contracts.md
docs/modules-and-visibility.md
docs/standard-library.md
docs/package-use-registry.md
docs/vectorised-dataset-syntax.md
```

---

## 13. SPEC.md

Status: file exists. It should be expanded into official Galerina language rules.

It should include:

```text
keywords
file structure
comments
strict comments
types
flows
modules
imports
visibility
errors
effects
contracts
logic domains
compute blocks
API blocks
webhook blocks
run mode
compile mode
compiler reports
```

---

## 13A. Flow Keyword Rationale

Status: documented in `docs/syntax.md` and `docs/glossary.md`.

Core rule:

```text
In Galerina, a flow is the language's version of a function, but with extra meaning for security, effects, reports, rollback, AI context and target optimisation.
```

Reason:

```text
function = generic function
flow     = checked unit of behaviour that Galerina can analyse, map, report, secure, optimise and compile
```

Recommended syntax:

```Galerina
pure flow calculateVat(subtotal: Decimal) -> Decimal {
  return subtotal * 0.20
}

secure flow createOrder(req: Request) -> Result<Response, ApiError>
effects [network.inbound, database.write] {
  ...
}
```

---

## 14. Error Codes

Status: documented in `docs/error-codes.md`; prototype diagnostics include
standard Galerina codes, levels, categories, recovery actions and source locations.

Example families:

```text
galerina-TYPE-001
galerina-SEC-001
galerina-JSON-001
galerina-API-001
galerina-WEBHOOK-001
galerina-DOC-001
galerina-CACHE-001
galerina-MEM-001
galerina-TARGET-001
galerina-LOGIC-001
```

---

## 15. Contracts

Status: documented in `docs/contracts.md`; compiler checks remain pending.

Example:

```Galerina
secure flow shipOrder(order: Order) -> Result<Shipment, ShipmentError>
requires order.payment.status == Paid
ensures result.status == Shipped
effects [database.write, network.outbound] {
  ...
}
```

---

## 16. Modules and Visibility

Status: documented in `docs/modules-and-visibility.md`; package `import` vs
`use` direction is documented in `docs/package-use-registry.md`; compiler
support remains pending.

Possible model:

```text
module
export
internal
private
trait
impl
```

Example:

```Galerina
module Orders {
  export type Order {
    id: OrderId
    status: OrderStatus
  }

  export secure flow create(input: CreateOrderRequest) -> Result<Order, OrderError> {
    ...
  }

  internal flow calculateRisk(order: Order) -> RiskScore {
    ...
  }
}
```

---

## 17. Standard Library

Status: documented in `docs/standard-library.md`; contents remain draft.

Suggested modules:

```text
std.json
std.xml
std.graphql
std.http
std.crypto
std.env
std.log
std.time
std.math
std.matrix
std.file
std.database
std.queue
std.testing
std.security
```

---

## 18. Repository Structure Clarification

Status: captured in `COMPATIBILITY.md`.

The Git repository itself represents the Galerina package root.

Equivalent intended path:

```text
packages-galerina/galerina-core/
```

But inside this repository, paths should be root-relative.

Correct:

```text
compiler/galerina.js
examples/hello.spore
schemas/ai-context.schema.json
docs/type-system.md
```

Incorrect inside this repository:

```text
packages-galerina/galerina-core/compiler/galerina.js
packages-galerina/galerina-core/examples/hello.spore
packages-galerina/galerina-core/schemas/ai-context.schema.json
```

---

## 19. TODO.md Updates

Status: updated for current known files. Remaining TODOs should track
implementation depth, not document existence.

Pending implementation examples:

```text
borrow escape checks
Lazy Compact JSON compiler/linter checks
Lazy Compact JSON memory report schema
contracts compiler checks
modules and visibility compiler model
standard library specification detail
package registry parser support
vectorised dataset parser support
hybrid wavelength target planning
```

---

## 20. CHANGELOG.md Updates

Status: the changelog tracks added documents, prototype milestones and recent
documentation refreshes. Keep adding entries under `[Unreleased]`.

Recent concepts to keep represented:

```text
generated outputs in Run Mode and Dev Mode
unified Galerina dev command
startup validation before main()
AI token reduction
memory and variable use model
Lazy Compact JSON
Pure Flow Caching
Memory Pressure and Disk Spill
Omni Logic
generated output and runtime ergonomics
Package Use Registry
Vectorised Dataset Syntax
Hybrid Logic and Wavelength Compute
```

---

## 21. Package Use Registry

Status: documented in `docs/package-use-registry.md`; parser support, package
registry validation, package permission checks and package reports remain
pending.

Core rule:

```text
Import local files.
Use approved packages.
Register packages in boot.spore.
Use packages explicitly in source files.
Report package permissions, hashes, usage and loading behaviour.
```

---

## 22. Vectorised Dataset Syntax

Status: documented in `docs/vectorised-dataset-syntax.md`; parser support,
type inference, vector reports and AI guide integration remain pending.

Core rule:

```text
Use `vectorize` where rows become columns.
Use `pure vector flow` when the whole flow is vector-preferred.
Use `pure vector required flow` only when vectorisation must succeed.
```

---

## 23. Hybrid Logic and Wavelength Compute

Status: documented in `docs/hybrid-logic-and-wavelength-compute.md` and
summarised in `README.md`; target planning docs are linked, while compiler
support remains pending.

Core rule:

```text
Use exact logic where correctness matters.
Use vector/accelerator logic where performance matters.
Use three-way logic where uncertainty matters.
Use wavelength logic only for suitable pure maths.
```

Safety direction:

```text
wavelength logic cannot perform file, network or database I/O
wavelength logic cannot handle secrets
wavelength logic cannot make final security decisions directly
analogue results must return to strict typed Galerina values
precision and tolerance must be declared
fallback must be declared
```

---

## 24. Hardware Feature Detection and Security

Status: documented in `docs/hardware-feature-detection-and-security.md`.

Core rule:

```text
Galerina source stays clean.
Compiler detects hardware features.
Build output selects the best safe target.
Fallback is always available.
Reports explain what was used.
```

Best practical early focus:

```text
CPU vectorisation for dataset analysis
GPU tensor planning for AI and vector workloads
control-flow protection where available
secret memory protection strategy
confidential deployment reports
GPU confidential compute policy
hardware feature reporting in app.target-report.json
```

This should remain target-planning and reporting work until real backends and
host capability probing exist.

---

## 25. Dart and Flutter Target Support

Status: documented in `docs/dart-flutter-target.md`.

Galerina should support Flutter through Dart output and Flutter-compatible packages.
This must stay a language/compiler target model, not a native Flutter framework
inside Galerina.

Core rule:

```text
Galerina is the language.
Dart is a target language.
Flutter is an external UI framework.
Skia and Impeller are rendering backend concerns to report.
```

Design direction:

```text
sync by default
async flow only when declared
await only inside async flows
Bytes as portable Galerina byte data
Dart.Uint8List only at explicit Dart/Flutter interop boundaries
vector compute separate from async IO
Flutter support through generated Dart packages first
Flutter package/plugin output after Dart logic package output
platform-channel contracts as explicit interop boundaries
Pigeon-style typed platform API generation as optional tooling
Flutter FFI/native-library output for compute-heavy code
permission metadata and source maps for generated Flutter artefacts
Flutter UI component syntax as later-stage research
Skia/Impeller assumptions reported, not hard-coded
```

Pending work:

```text
parse async flow
reject await outside async flow
lower async flow to Dart Future
add target dart reports
add target flutter reports
add Bytes to Dart.Uint8List conversion checks
add platform channel parser/report support
add permission metadata reports
add Pigeon-style typed API schema output or equivalent
add flutter-ffi target planning
add unsupported-platform diagnostics for Flutter FFI
add source maps from generated Dart/native bindings back to .spore files
defer Flutter UI component syntax until lower support levels are stable
emit async, platform-channel, FFI and render backend reports
```

---

## 26. JavaScript, TypeScript and Framework Target Support

Status: documented in `docs/javascript-typescript-framework-targets.md`.

Galerina should support Node.js, React, Angular and similar ecosystems through
generated JavaScript, TypeScript declarations, schemas, source maps, WASM
bridges and adapter manifests. This must stay target and tooling work, not a
native React, Angular or Node framework inside Galerina.

Core rule:

```text
Galerina is the language.
JavaScript/TypeScript are target outputs and interop layers.
Node is a runtime target.
React and Angular are external framework adapter targets.
```

Design direction:

```text
prefer ESM JavaScript output
generate TypeScript declarations
generate JSON Schema and OpenAPI from Galerina types/contracts
support browser and Node WASM bridges
support Node worker-compatible compute modules
support client_safe, server_only and worker_safe export markers
reject forbidden client and worker effects
generate React and Angular adapters as package/generator output
keep React/Angular components, JSX, decorators, routers and state frameworks out of core Galerina
```

Pending work:

```text
parse target javascript
parse target node
parse react-adapter and angular-adapter targets
parse client_safe, server_only and worker_safe export markers
emit TypeScript declarations
emit framework adapter manifests
emit JS/WASM source maps
emit client/server split diagnostics
emit worker clone/transfer safety diagnostics
```

---

## 27. Device Capability Boundaries

Status: documented in `docs/device-capability-boundaries.md`.

Galerina should support the safe foundations for phone and device features without
making camera, microphone, GPS, Bluetooth, notifications, media players, phone
radios or mobile UI native language features.

Core rule:

```text
Galerina is the language.
Device features belong in packages, platform bindings, OS APIs, drivers or frameworks.
Mobile UI and app lifecycle belong in frameworks.
Raw/privileged device access is blocked by default.
```

Design direction:

```text
support Bytes, Buffer<T>, Stream<T>, ImageData, AudioData, SignalData, Tensor<T>, Vector<T> and Matrix<T>
support permissions and effects for device-facing packages
support async/event handling without becoming a UI framework
support compute targets such as CPU, GPU, NPU, DSP, WASM and mobile native
support runtime/hardware capability detection and safe fallback
support explicit unsafe external native/platform boundaries
report device permissions, privacy, native bindings and compute target assumptions
keep camera apps, photo galleries, FM radio, media players, GPS navigation, notifications and mobile UI out of core Galerina
```

Pending work:

```text
check device effects against declared permissions
reject core calls pretending to be built-in device APIs
emit device-capability-report.json
emit device-privacy-report.json
emit native-bindings-report.json for device/platform bindings
connect device compute choices to compute-target-report.json
add mobile-native target planning without mobile framework syntax
```

---

## 28. Text AI Package Boundaries and Compute Auto

Status: documented in `docs/text-ai-package-boundaries-and-compute-auto.md`.

Galerina should safely support text AI packages, model providers and compute-heavy
text workflows without making text AI a native language feature.

Core rule:

```text
Galerina is the language.
Text AI tasks belong in packages, model providers, frameworks, applications or external services.
Generated text is data, not executable instructions.
```

Design direction:

```text
support Text, Unicode handling, Locale, LanguageCode, typed inputs and typed outputs
support text_policy and token_policy configuration
support prompt_safety and text_redaction policy hooks
support package/provider boundaries for summarisation, generation, embeddings, translation, moderation, NLP and document AI
support compute auto for model-heavy text stages
keep loading, validation, prompt safety, redaction, final decisions and storage in CPU/exact logic
require network permissions for external providers
reject or strongly warn when generated text is executed directly
report token limits, memory, target selection, prompt safety, redaction and external provider use
```

Pending work:

```text
parse text_policy
parse token_policy
parse prompt_safety policy
parse text_redaction policy
define token-report.json schema
define text-security-report.json schema
define text-package-target-report.json schema
connect text package compute auto to backend target reports
add generated-text-not-executable diagnostics
check external provider calls against network permissions
add AI guide text package summaries
```

---

## 29. Auth, Token and Verification Boundaries

Status: documented in `docs/auth-token-verification-boundaries.md`.

Galerina should support JWT, bearer tokens, OAuth, DPoP, mTLS and future proof
policies through safe typed verification workflows. This must stay security
language/toolchain work, not a native identity provider, login framework or
new cryptography system.

Core rule:

```text
Do not invent new cryptography.
Do create safer typed verification workflows around proven cryptography.
```

Design direction:

```text
BearerToken and JwtToken are SecureString values
JWT claims are not trusted until verified
OAuth providers are declared through issuer, JWKS, audience, scopes and PKCE policy
DPoP and mTLS provide sender-constrained token checks for higher-risk APIs
request proof envelopes bind method, path, body hash, nonce and timestamp
capability-token workflows bind action, resource, expiry, nonce and request hash
idempotency and replay protection are required for sensitive mutations
hardware proof such as photonic PUFs is experimental/plugin policy work
post-quantum and hybrid crypto are crypto_policy declarations and reports
identity providers, login UI, MFA products and session frameworks stay outside Galerina core
```

Pending work:

```text
parse auth_policy
parse auth_provider
parse route auth blocks
parse verify request_proof and capability blocks
parse DPoP and mTLS policy blocks
parse crypto_policy
reject unverified JWT claim use
reject unsafe bearer-token logging or client export
check issuer, audience, expiry, scope, JWKS and algorithm requirements
emit auth, token, proof, crypto policy and security reports
add AI guide auth/security summaries
```

---

## 30. API Data Security and Load Control

Status: documented in `docs/api-data-security-and-load-control.md`.

Galerina should provide API data safety and load-control primitives for frameworks
and runtimes. This must stay language/toolchain policy and reporting work, not
a native web framework, load balancer, API gateway, queue backend or
rate-limit store.

Core rule:

```text
Do not trust API input.
Decode into strict types.
Limit memory.
Limit concurrency.
Queue or reject overload safely.
Report everything.
```

Design direction:

```text
API routes declare body policy, content type, max size and unknown-field policy
request bodies decode into typed request values before application logic
strict JSON rejects malformed input, duplicate keys and unsafe coercion
client identity must not trust proxy headers unless the proxy is trusted
routes declare rate limits, concurrency limits, timeouts and memory budgets
large request bodies stream with bounded buffers
request body references are read-only and request-scoped by default
heavy routes can hand off to queues and return accepted responses
backpressure can queue, throttle or reject overload safely
load reports explain route limits, memory use and queue handoff decisions
```

Pending work:

```text
parse api_policy
parse body, limits, memory and queue route blocks
parse runtime_policy load_distribution
check content-type and strict decode rules
check trusted proxy and forwarded header usage
check request-scoped reference escapes
check large body streaming requirements
check route concurrency against connection pool limits
emit API security, API memory and load-control reports
add AI guide API data boundary summaries
```

---

## 31. API Duplicate Detection and Idempotency

Status: documented in `docs/api-duplicate-detection-and-idempotency.md`.

Galerina should detect duplicate API structure and make duplicate side effects
visible through idempotency and replay protection metadata. This must stay
language/toolchain checking and report work, not a native router, controller
framework, middleware stack, API gateway or idempotency storage backend.

Core rule:

```text
Duplicate API structure should be detected by Galerina.
Duplicate API behaviour should be controlled by idempotency, replay protection and reports.
Actual routing remains framework/package territory.
```

Design direction:

```text
duplicate method/path declarations are errors
duplicate route names are errors or warnings by policy
duplicate request/response shapes are warnings unless marked intentional
side-effecting POST/PATCH/DELETE routes should declare idempotency
webhooks should declare replay protection and idempotency keys
idempotency requires key source, TTL, conflict mode and payload mismatch mode
duplicate external API clients should warn unless marked intentional
duplicate outbound API payloads can warn within a configured window
API manifests, duplicate reports, idempotency reports and AI guide summaries are generated
```

Pending work:

```text
parse duplicate api_policy settings
parse idempotency blocks and exceptions
parse intentionally_same_shape_as and intentionally_same_base_as
detect duplicate route conflicts
detect duplicate API type shapes
recommend idempotency from side-effecting effects
check webhook duplicate protection requirements
emit API manifest, duplicate API and idempotency reports
add AI guide API duplicate/idempotency summaries
```

---

## Final Principle

Galerina should become more than a language that runs code.

It should become a language/toolchain that can:

```text
run quickly during development
compile for production
generate trusted explanations
reduce AI token use
avoid hidden memory costs
handle JSON efficiently
produce security reports
produce source maps
produce API documentation
prepare for future compute targets
```

Final rule:

```text
Run fast while developing.
Generate explanations while checking.
Compile fully before deploying.
```
