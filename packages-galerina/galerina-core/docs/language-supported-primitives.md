# Galerina Language Supported Primitives

## Summary

Galerina is a strict, memory-safe, security-first general-purpose programming language.

Galerina should support safe language and runtime primitives that allow software to be built securely and clearly.

Galerina should not turn specialist application areas into native language features. Instead, Galerina should provide the foundation that packages, drivers, frameworks, tools, and external services can build on.

The guiding rule is:

> If a feature normally belongs in a package, library, framework, driver,
> extension, or external service, Galerina should not make that thing a native
> language feature.

Galerina can support the primitive building blocks.

Specialist implementations should live outside the core language.

---

## Core Language Support Principle

Galerina should support:

```text
strict types
memory safety
safe references
explicit mutation
safe copying
null handling
undefined handling
error handling
effects
permissions
files
streams
binary data
safe buffers
network boundaries
crypto primitives
secret handling
logging primitives
testing primitives
runtime profiles
compiler reports
source maps
interop boundaries
multi-target compilation
compute target selection
runtime/hardware capability detection
```

Galerina should describe specialist areas using wording like:

```text
Galerina supports safe primitives for this area.
The specialist implementation belongs in packages, drivers, frameworks, tooling, or external services.
```

For device and phone features, Galerina should support safe foundations such as
`Bytes`, `Buffer<T>`, `Stream<T>`, permissions, effects, compute targets,
capability detection, FFI/native boundaries and security reports. It should not
make camera apps, photo galleries, GPS navigation, Bluetooth stacks, media
players or mobile UI native language features.

See `docs/device-capability-boundaries.md`.

For text AI, Galerina should support safe primitives such as `Text`, Unicode handling,
`Locale`, `LanguageCode`, typed inputs/outputs, effects, permissions, token
policies, redaction policies, prompt-safety policy hooks, `compute auto` and
reports. It should not make summarisation, generation, embeddings, moderation,
translation, document question answering or NLP tasks native language features.

See `docs/text-ai-package-boundaries-and-compute-auto.md`.

For authentication and authorisation, Galerina should support safer typed
verification primitives around established standards such as bearer tokens,
JWT, OAuth 2.0, DPoP and mTLS. It should not become an identity provider,
session framework, login product or cryptography framework.

See `docs/auth-token-verification-boundaries.md`.

---

## 1. Types and Memory Safety

Galerina should have strong native support for type safety and memory safety.

Supported primitives:

```text
strict types
immutable values
explicit mutable values
safe references
safe local lifetimes
copy-on-write rules
explicit clone
explicit deep copy
safe large-value handling
safe function boundaries
safe return values
no unsafe global state by default
```

This belongs in the language because it affects every program.

Galerina should make memory behaviour clear to both humans and AI coding tools.

---

## 2. Null, Undefined and Missing Values

Galerina should provide clear handling for values that do not exist, are not available, or failed to resolve.

Supported primitives:

```text
null
undefined
missing values
optional values
typed fallbacks
safe defaults
compiler warnings
runtime failure reports
```

Galerina should avoid hidden failure states.

Code should make it obvious when a value may be missing.

Example concepts:

```text
Option<T>
Result<T, Error>
undefined blocks
fallback blocks
safe return paths
```

---

## 3. Error Handling

Galerina should support structured and typed error handling.

Supported primitives:

```text
recoverable errors
fatal errors
typed errors
error propagation
error blocks
failure reports
safe fallback paths
source-mapped runtime errors
```

Errors should be clear, auditable, and easy to trace back to the original `.spore` source file.

Galerina should support compiler and runtime reports that make failures understandable for developers and AI tools.

---

## 4. Effects and Permissions

Galerina should support explicit effects and permissions.

Supported effect areas:

```text
file.read
file.write
network.inbound
network.outbound
database.read
database.write
env.read
crypto.use
time.read
random.secure
process.spawn
memory.large
```

Effects help Galerina understand what a program or package is allowed to do.

This supports:

```text
security review
sandboxing
package auditing
runtime profiles
compiler reports
AI-readable documentation
deployment safety
```

A package should be able to declare its required effects.

Example:

```text
package document_tools requires {
  file.read
  file.write
  memory.large
}
```

---

## 5. Files, Paths and Binary Data

Galerina should support general file and binary primitives.

Supported primitives:

```text
file paths
file metadata
safe file handles
binary data
buffers
temporary files
safe uploads
MIME/type hints
file permissions
large file streaming
chunked file reading
chunked file writing
```

Galerina should support the ability to safely work with files.

Specialist document formats should be handled by packages.

For example, Galerina may provide file streams that a PDF package can use, but Galerina should not need native PDF parsing in the language itself.

---

## 6. Streams and Backpressure

Galerina should support streaming as a general primitive.

Supported primitives:

```text
file streams
network streams
binary streams
streaming JSON
streaming API responses
streaming database results
event streams
chunked processing
backpressure
cancellation
timeouts
safe memory limits
```

Streaming support is important because backend systems often process large files, large API responses, logs, events, uploads, and database results.

Galerina should make streaming safe by default.

---

## 7. Networking Boundaries

Galerina should support safe networking primitives.

Supported primitives:

```text
network permissions
typed requests
typed responses
headers
status codes
timeouts
retries
rate-limit primitives
TLS awareness
certificate handling
safe inbound access
safe outbound access
streaming responses
content-type validation
typed request body decoding
request body size limits
unknown-field policy
per-route memory budgets
rate-limit policies
concurrency limits
backpressure declarations
queue handoff metadata
load-control reports
```

Galerina should allow packages to build HTTP clients, API clients, email clients, database drivers, and provider SDKs.

Provider-specific integrations should remain outside the core language.

For API data security and load control, Galerina should support typed request
contracts, strict body policies, safe decoding, streaming request bodies,
request-scoped memory, rate-limit declarations, concurrency limits, queue
handoff metadata and reports. It should not become a web framework, load
balancer or API gateway product.

See `docs/api-data-security-and-load-control.md`.

For API duplicate detection and idempotency, Galerina should support duplicate route
checks, duplicate schema warnings, API manifests, idempotency declarations,
webhook replay protection metadata, duplicate external API warnings and
source-mapped reports. It should not provide a fixed router, API gateway or
idempotency storage backend.

See `docs/api-duplicate-detection-and-idempotency.md`.

---

## 8. Security, Crypto and Secret Handling

Galerina should support foundational security primitives.

Supported primitives:

```text
SecureString
secret memory handling
secure random
hashing
HMAC
signatures
encryption primitives
decryption primitives
constant-time comparison
certificate handling
safe environment variable access
secret redaction
token validation boundaries
verified token wrappers
request proof verification
replay protection primitives
crypto policy reports
```

Secrets should be protected by default.

Important rule:

```text
Secrets, SecureString values, private keys, tokens, passwords, credentials, and API keys must never be logged by default.
```

Galerina should make unsafe secret handling difficult and visible.

Auth-facing primitives may include:

```text
BearerToken as SecureString
JwtToken as SecureString
VerifiedJwt<TClaims>
auth_provider declarations
auth_policy declarations
scope and audience checks
issuer and expiry checks
JWKS validation policy
DPoP and mTLS proof-of-possession checks
VerifiedCapability workflow metadata
Request Proof Envelope validation
nonce and replay-cache requirements
post-quantum and hybrid crypto policy declarations
auth, token, proof and security reports
```

These are verification and safety boundaries. Identity provider
implementations, account workflows, MFA products and admin permission
dashboards remain packages, frameworks or external services.

---

## 9. Logging, Audit and Observability

Galerina should support safe observability primitives.

Supported primitives:

```text
structured logging
typed errors
runtime error reports
compiler reports
audit event primitives
metrics hooks
trace hooks
performance reports
security event reports
source-mapped runtime errors
redaction rules
```

Logging should be useful without leaking sensitive data.

Galerina should support structured logs that tools can read.

Example log areas:

```text
application logs
security logs
audit logs
performance logs
runtime failure logs
compiler reports
```

---

## 10. Testing and Verification

Galerina should have a strong testing and verification story.

Supported primitives and tooling areas:

```text
unit tests
integration tests
property tests
security tests
contract tests
snapshot tests
golden output tests
compiler checks
runtime checks
target comparison tests
```

For multi-target compilation, Galerina should support comparison testing.

Examples:

```text
CPU output tests
WASM output tests
GPU fallback tests
accelerator fallback tests
photonic plan comparison tests
ternary simulation comparison tests
```

The goal is to prove that different targets produce safe and expected results.

---

## 11. Package and Dependency Security

Galerina should support package security at the language and tooling level.

Supported primitives and tooling areas:

```text
package manifest
lock file
hash verification
permissioned packages
effect declarations
supply-chain reports
unsafe package warnings
native binding restrictions
dependency audit reports
package security reports
```

Packages should declare what they need.

Example:

```text
package api_client requires {
  network.outbound
  env.read
}
```

Galerina tooling should be able to report:

```text
what packages are installed
what permissions packages require
what native bindings are used
what dependencies are locked
what hashes were verified
what unsafe features are enabled
```

---

## 12. Runtime Profiles

Galerina should support runtime profiles.

Supported profiles may include:

```text
development
testing
staging
production
browser
server
edge
worker
CLI
embedded
cloud
```

Runtime profiles can control:

```text
available effects
memory limits
network access
file access
logging level
debug behaviour
security restrictions
compiler checks
runtime checks
```

This allows Galerina applications to behave safely in different environments.

Example:

```text
production profile:
  debug logs disabled
  secrets redacted
  unsafe packages blocked
  file access restricted
  network access permissioned
```

---

## 13. CLI and Script Support

Galerina should support command-line and script-style programs.

Supported primitives:

```text
command arguments
stdin
stdout
stderr
exit codes
environment variables
safe config loading
interactive prompts
file access permissions
```

This allows Galerina to be used for:

```text
local scripts
build tools
importers
exporters
developer tools
automation tasks
CLI applications
```

---

## 14. Time, Dates, Decimal and Money Values

Galerina should support safe primitives for time and exact numeric values.

Supported primitives:

```text
Date
Time
DateTime
Duration
TimeZone
Locale
Decimal
Money<TCurrency>
rounding rules
number formatting
currency formatting
```

Galerina should provide safe building blocks for business software.

Business-specific rules should remain in application code or packages.

For example, Galerina can support `Money<GBP>` and `Decimal`, but VAT rules, tax rules, invoice rules, payroll rules, and banking rules should not be hard-coded into the language.

---

## 15. Interop and Foreign Function Boundaries

Galerina should support controlled interop with other ecosystems.

Supported areas:

```text
WASM target
native ABI
native interop
systems interop
external runtime bridge
JavaScript bridge
native bindings
sandboxing
permission reports
memory boundary checks
unsafe boundary declarations
```

Interop should be explicit.

Any unsafe or external boundary should be visible in compiler reports and package reports.

Example concepts:

```text
unsafe external call
foreign memory boundary
native binding permission
sandboxed module
```

---

## 16. Database Driver Boundaries

Galerina should support safe database access boundaries.

Supported primitives:

```text
database.read effect
database.write effect
typed driver boundaries
connection permissions
transactions as safe boundaries
timeouts
streaming results
structured database errors
```

Galerina should allow database drivers to be built.

Examples of package-level drivers:

```text
PostgreSQL driver
MySQL driver
SQLite driver
MongoDB driver
OpenSearch driver
vector database driver
```

The database engines and drivers should not be part of the native language.

Galerina should provide the safety model around them.

---

## 17. Safe Pattern and Regex Boundaries

Galerina should support safe pattern matching without making unsafe backtracking regex the default.

Supported primitives:

```text
Pattern
pattern.compile
pattern.matches
pattern.scan
pattern_policy
pattern_set
PatternCache
pattern reports
```

Advanced regex should be explicit:

```text
UnsafeRegex
unsafe regex block
reason requirement
timeout requirement
input length limit
security report entry
```

Detailed design lives in `docs/safe-pattern-matching-and-regex.md`.

Syntax details live in `docs/sytax/patterns-and-regex.md`.

---

## 18. Provider and Service Boundaries

Galerina should support safe provider boundaries.

Supported primitives:

```text
typed API calls
network permissions
safe secrets
rate limits
timeouts
structured responses
structured errors
fallback handling
provider package permissions
```

This allows packages to integrate with external providers.

Examples:

```text
payment providers
email providers
SMS providers
cloud providers
AI providers
search providers
translation providers
storage providers
queue providers
```

Galerina should not hard-code any provider into the language.

Search and translation are provider-boundary areas, not native language
features. See `docs/search-and-translation-provider-boundaries.md`.

Search and translation packages may define package types and package effects
such as:

```text
SearchResults<T>
SearchIndex<T>
TextEmbedding
ImageEmbedding
TranslatedText
search.read
search.write
vector_store.read
translation.run
```

These are not required Galerina core primitives.

---

## 19. Browser, WASM and Frontend Runtime Boundaries

Galerina may support browser and frontend output through runtime profiles and targets.

Supported primitives:

```text
WASM target
JavaScript interop
browser runtime profile
SafeHtml
safe DOM operations
browser effects
browser permissions
typed event boundaries
safe package permissions
permission reports
source maps
debug metadata
```

Galerina should be able to compile for browser use where appropriate.

DOM frameworks, CSS frameworks, browser routers, and component systems should be packages or frameworks.

Detailed browser, DOM, HTML, storage, push notification and service worker
primitive planning lives in `docs/browser-dom-and-web-platform-primitives.md`.

---

## 20. Accessibility Tooling Hooks

Galerina should support tooling hooks that help packages and build tools produce accessible output.

Supported primitives and tooling areas:

```text
structured reports
compiler warnings
metadata
HTML output package hooks
text direction metadata
Locale support
caption metadata
transcript metadata
```

Accessibility scanners, ARIA validators, contrast checkers, caption generators, and transcript engines should be tooling or packages.

Galerina should provide the safe metadata and reporting foundation.

---

## 21. Compute Targets

Galerina may support multiple compile and compute targets.

Supported targets may include:

```text
CPU
CPU vector
WASM
GPU
AI accelerator
photonic candidate
ternary simulation
hybrid compute plans
memory/interconnect planning
cloud compute profiles
```

Supported compiler concepts:

```text
target declarations
fallback rules
target reports
precision reports
fallback reports
runtime capability maps
security reports
performance reports
failure reports
source maps
debug metadata
```

Galerina should not hard-code one vendor, chip, cloud, or accelerator.

The language should describe what the program needs.

The compiler and tooling should decide what targets are available and safe.

Vendor-specific GPU, AI accelerator, cloud and photonic details should be
handled by target plugins, drivers and deployment profiles. Galerina core should keep
generic target categories such as `cpu`, `cpu_vector`, `gpu`,
`ai_accelerator`, `photonic_auto`, `accelerator_auto` and `safe_cpu`.

See `docs/backend-compute-support-targets.md`.

---

## 22. AI-Readable Documentation and Reports

Galerina should be designed so AI coding assistants can understand projects safely.

Supported areas:

```text
clear syntax
stable grammar
strict project structure
compiler reports
security reports
target reports
failure reports
package reports
AI-readable documentation
source maps
examples
schemas
```

Galerina should support commands such as:

```text
Galerina explain --for-ai
Galerina build --report
Galerina test --report
```

The goal is to make Galerina projects easier to inspect, audit, document, and maintain.

---

## Standard Wording for Supported Areas

Use this wording in future documents:

```text
Galerina supports safe primitives for this area.
Specialist implementations belong in packages, drivers, frameworks, tooling, or external services.
```

Use this style:

```text
Galerina supports file streams that document packages can use.
Galerina supports network primitives that email packages can use.
Galerina supports typed provider boundaries that search packages can use.
Galerina supports database driver boundaries.
Galerina supports binary and streaming primitives for media packages.
Galerina supports runtime profiles for browser, server, worker, edge and CLI use.
```

Avoid making specialist systems sound like native language features.

---

## Final Position

Galerina should provide the safe foundation for modern software.

Galerina should support:

```text
types
memory safety
effects
permissions
errors
streams
files
binary data
networking
crypto
secret handling
logging
testing
packages
runtime profiles
interop
compiler reports
source maps
multi-target compilation
```

Galerina should remain a programming language first.

Specialist systems should be built on top of Galerina, not built into Galerina itself.

---

## Refactoring Rule for Existing Galerina Documents

When reviewing existing Galerina documents, any wording that makes Galerina sound like a framework, platform, database, search engine, AI system, or media tool should be rewritten.

The aim is to separate:

```text
language primitive
standard library candidate
package area
framework area
external service area
tooling area
```

This keeps the language clean and avoids unnecessary native features.

---

## Classification Guide

Use the following guide when deciding whether something belongs in Galerina itself.

| Area                       | Should Galerina Support It? | Where It Belongs                 |
| -------------------------- | --------------------: | -------------------------------- |
| Strict types               |                   Yes | Core language                    |
| Memory safety              |                   Yes | Core language                    |
| Null / undefined handling  |                   Yes | Core language                    |
| Error handling             |                   Yes | Core language                    |
| Effects and permissions    |                   Yes | Core language                    |
| File streams               |                   Yes | Core language / standard library |
| Binary data                |                   Yes | Core language / standard library |
| Secure random              |                   Yes | Standard library                 |
| Hashing                    |                   Yes | Standard library                 |
| SecureString               |                   Yes | Core language / standard library |
| Logging primitives         |                   Yes | Standard library / tooling       |
| Testing primitives         |                   Yes | Tooling / standard library       |
| Runtime profiles           |                   Yes | Compiler / runtime               |
| Source maps                |                   Yes | Compiler                         |
| Package permission reports |                   Yes | Compiler / package tooling       |
| SQL engine                 |                    No | External database                |
| SQL driver                 |     No native feature | Package                          |
| PDF parser                 |     No native feature | Package                          |
| Email sending provider     |     No native feature | Package / external service       |
| Search engine              |                    No | External service / package       |
| Translation engine         |                    No | External service / package       |
| Image editor               |                    No | Package / external tool          |
| Video editor               |                    No | Package / external tool          |
| AI platform                |                    No | External service / package       |
| CMS                        |                    No | Framework / application          |
| Auth framework             |                    No | Framework / package              |
| Cloud hosting              |                    No | External platform                |
| Queue broker               |                    No | External service / package       |

---

## Native Language Feature Test

Before adding a feature to Galerina itself, ask:

```text
Is this needed by most programs?
Does this affect safety, typing, memory, effects, permissions, errors, or compilation?
Would this normally need a library, package, extension, driver, framework, or external service?
Can this be implemented cleanly as a package?
Would adding this to the language make Galerina harder to keep stable?
Would this create provider lock-in?
Would this make the language look like a framework rather than a language?
```

If the answer suggests the feature is specialist, it should not become native Galerina syntax.

---

## Safe Wording Examples

Use wording like this:

```text
Galerina supports safe primitives for working with files.
PDF support belongs in document packages.

Galerina supports safe primitives for networking.
Email sending belongs in provider packages.

Galerina supports typed database driver boundaries.
Specific database drivers belong in packages.

Galerina supports binary data and streams.
Image, audio and video processing belongs in packages.

Galerina supports runtime profiles and target reports.
Cloud deployment belongs in tooling or external platforms.

Galerina supports secure strings, hashing and safe random values.
Full authentication systems belong in packages or frameworks.
```

Avoid wording like this:

```text
Galerina supports PDF.
Galerina supports email.
Galerina supports search.
Galerina supports translation.
Galerina supports image processing.
Galerina supports video processing.
Galerina supports SQL.
Galerina supports NoSQL.
Galerina supports OAuth.
Galerina supports Stripe.
Galerina supports Firebase.
Galerina supports AWS.
```

---

## Package-Friendly Design

Galerina should make packages safer to build and use.

A package should be able to declare:

```text
name
version
description
required effects
required permissions
native bindings
unsafe features
runtime profiles
supported targets
dependency hashes
```

Example:

```text
package pdf_tools requires {
  file.read
  file.write
  memory.large
}

package email_provider requires {
  network.outbound
  env.read
  crypto.use
}

package postgres_driver requires {
  network.outbound
  database.read
  database.write
  env.read
}
```

This allows Galerina tooling to produce useful reports before the application runs.

---

## Compiler and Tooling Reports

Galerina should support reports that explain what the application does and what risks exist.

Suggested report outputs:

```text
target report
security report
package report
effect report
permission report
failure report
performance report
source map report
AI explanation report
```

Example build outputs:

```text
app.target-report.json
app.security-report.json
app.package-report.json
app.effect-report.json
app.failure-report.json
app.performance-report.json
```

These reports help developers, security reviewers, deployment systems, and AI tools understand the application.

---

## Recommended Documentation Style

Each future Galerina document should clearly state whether the topic is:

```text
core language
standard library
compiler feature
runtime feature
package area
framework area
tooling area
external service
out of scope
```

Recommended section format:

```text
## Status

Classification: Package area
Native language feature: No
Supported by Galerina primitives: Yes

## Galerina Provides

- typed boundaries
- effects
- permissions
- safe errors
- streams
- reports

## Packages Provide

- specialist implementation
- provider-specific logic
- format-specific logic
- service-specific logic
```

---

## Example Classification: PDF

```text
Classification: Package area
Native language feature: No
Supported by Galerina primitives: Yes
```

Galerina provides:

```text
files
streams
binary data
memory limits
permissions
structured errors
package reports
```

A PDF package provides:

```text
PDF parsing
PDF generation
PDF text extraction
PDF metadata extraction
PDF conversion
```

---

## Example Classification: Email

```text
Classification: Package / provider area
Native language feature: No
Supported by Galerina primitives: Yes
```

Galerina provides:

```text
network.outbound
typed headers
typed payloads
attachments as streams
SecureString
env.read
TLS/certificate handling
structured errors
```

An email package provides:

```text
SMTP
IMAP
provider integration
templates
bounce handling
DKIM/SPF/DMARC handling
```

---

## Example Classification: Database

```text
Classification: Driver/package area
Native language feature: No
Supported by Galerina primitives: Yes
```

Galerina provides:

```text
database.read
database.write
typed driver boundaries
transactions as safe boundaries
timeouts
streaming results
structured errors
```

A database driver provides:

```text
PostgreSQL support
MySQL support
SQLite support
MongoDB support
OpenSearch support
vector database support
```

---

## Example Classification: Search

```text
Classification: External service / package area
Native language feature: No
Supported by Galerina primitives: Yes
```

Galerina provides:

```text
typed provider boundaries
network access
file streams
structured results
rate limits
permissions
timeouts
fallbacks
```

A search package or service provides:

```text
indexing
ranking
query parsing
full-text search
semantic search
image search
audio search
video search
```

---

## Example Classification: Image AI

```text
Classification: Package/provider/model area
Native language feature: No
Supported by Galerina primitives: Yes
```

Galerina provides:

```text
binary data
file streams
effects
permissions
memory limits
compute.run
compute auto target reports
package reports
security reports
source maps
```

An image package, model provider or external service provides:

```text
image decoding
image classification
object detection
image segmentation
image embeddings
image generation
image search
OCR
```

See `docs/image-ai-package-boundaries-and-compute-auto.md`.

---

## Example Classification: Video

```text
Classification: Package/runtime/provider area
Native language feature: No
Supported by Galerina primitives: Yes
```

Galerina provides:

```text
binary data
file streams
byte streams
effects
permissions
memory limits
compute.run
compute auto target reports
privacy reports
package reports
source maps
```

A video package, runtime package or external service provides:

```text
video codecs
video processing
video classification
video transcription
video embeddings
video search
camera access
screen capture
media playback
```

See `docs/video-package-boundaries-and-compute-auto.md`.

---

## Final Rule

Galerina should be powerful because its foundations are safe, strict and clear.

It should not become powerful by adding every possible framework feature into the language.

The correct model is:

```text
Galerina core:
  safe primitives

Galerina standard library:
  common low-level utilities

Galerina packages:
  specialist capabilities

Galerina frameworks:
  application structure

Galerina tools:
  reports, builds, tests, deployment helpers

External services:
  databases, search engines, AI providers, email providers, cloud platforms
```

This keeps Galerina small enough to understand, strict enough to trust, and flexible enough to build real software.
