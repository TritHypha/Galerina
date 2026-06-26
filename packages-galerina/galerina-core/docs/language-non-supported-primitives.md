# Galerina Non-Supported Native Features

## Summary

Galerina is a strict, memory-safe, security-first general-purpose programming language.

This document defines what Galerina should **not** support as native language features.

The purpose of this document is to prevent Galerina from becoming too large, unclear, unstable, or framework-like.

Galerina should provide safe primitives.

Specialist systems should be built using packages, drivers, frameworks, tooling, or external services.

---

## Guiding Rule

The main rule is:

> If a feature normally belongs in a package, library, framework, driver,
> extension, or external service, Galerina should not make that thing a native
> language feature.

Galerina may provide the safe building blocks.

Galerina should not provide the full specialist system.

---

## Core Non-Support Principle

Galerina should not natively become:

```text
a framework
a database
a CMS
a search engine
a translation engine
an AI platform
a media editor
an email platform
an authentication platform
a queue platform
a cloud provider
a browser framework
a mobile framework
an operating system
a media framework
a camera API
a device API layer
an API gateway
a load balancer
an LLM runtime
an NLP framework
a document AI platform
a text generation engine
a business rules engine
```

Galerina should instead provide:

```text
strict types
memory safety
effects
permissions
safe files
streams
binary data
network boundaries
crypto primitives
secret handling
logging primitives
testing support
runtime profiles
compiler reports
package security
interop boundaries
multi-target compilation
```

Device and phone capabilities belong behind packages, platform bindings,
operating-system APIs, drivers or frameworks. Galerina core should provide safe
types, permissions, effects, streams, buffers, compute targets, capability
detection, FFI boundaries and reports.

See `docs/device-capability-boundaries.md`.

Text AI capabilities such as summarisation, generation, embeddings, moderation,
translation, document question answering, named entity extraction and sentiment
analysis belong in packages, model providers, frameworks or external services.
Galerina core should provide typed boundaries, text validation, token policies,
redaction rules, prompt-safety hooks, effects, permissions, `compute auto` and
reports.

See `docs/text-ai-package-boundaries-and-compute-auto.md`.

Authentication products and identity platforms belong in packages, frameworks
or external identity providers. Galerina core should provide secure strings, token
validation boundaries, proven crypto primitives, route auth declarations,
proof-of-possession checks, replay protection and security reports.

See `docs/auth-token-verification-boundaries.md`.

---

# 1. Search Engines

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external services, frameworks, tooling
```

Galerina should not natively support:

```text
full-text search engines
semantic search engines
image search engines
audio search engines
video search engines
search ranking engines
web crawlers
indexing platforms
vector search engines
search result ranking models
search provider integrations
```

Galerina may provide:

```text
typed provider boundaries
streams
file access
network access
rate limits
timeouts
permissions
structured results
safe API calls
```

See `docs/search-and-translation-provider-boundaries.md` for the package/provider boundary model for search, semantic search, image search, vector search and translation.

Correct wording:

```text
Galerina supports safe primitives that search packages can use.
```

Avoid wording:

```text
Galerina natively supports search.
```

---

# 2. Translation Engines

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external services, frameworks
```

Galerina should not natively support:

```text
language translation
auto-translation
AI translation
translation memory
language detection engines
provider-specific translation APIs
hard-coded supported language lists
```

Galerina may provide:

```text
Unicode text
Locale
text direction metadata
typed API boundaries
network permissions
provider package boundaries
```

See `docs/search-and-translation-provider-boundaries.md` for safe package examples, package-defined effects and report expectations.

Correct wording:

```text
Translation belongs in packages, provider integrations, or external services.
```

Avoid wording:

```text
Galerina natively supports translation.
```

---

# 3. Image Processing

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external tools, external services
```

Galerina should not natively support:

```text
image editing
image generation
image resizing
image compression
image classification
image format conversion
OCR
object detection
image search
graphics editing
Photoshop-style editing
```

Galerina may provide:

```text
binary data
file streams
memory limits
typed package APIs
GPU target declarations
accelerator target declarations
safe file access
structured errors
```

See `docs/image-ai-package-boundaries-and-compute-auto.md` for the package,
provider, validation, decoder-sandbox and compute-auto boundary model for image
AI and image processing workflows.

Correct wording:

```text
Galerina supports binary and stream primitives for image packages.
```

Avoid wording:

```text
Galerina natively supports image processing.
```

---

# 4. Audio Processing

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external tools, external services
```

Galerina should not natively support:

```text
audio editing
audio compression
audio conversion
speech-to-text
text-to-speech
audio classification
audio transcription
music generation
audio mixing
noise removal
voice cloning
```

Galerina may provide:

```text
binary streams
file streams
realtime streams
typed package interfaces
safe memory handling
network provider boundaries
accelerator target declarations
```

Correct wording:

```text
Audio processing belongs in packages or external services.
```

Avoid wording:

```text
Galerina natively supports audio.
```

---

# 5. Video Processing

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external tools, external services
```

Galerina should not natively support:

```text
video editing
video rendering
video compression
video conversion
video hosting
video search
video transcription
subtitle generation
frame analysis
object detection
streaming platform logic
```

Galerina may provide:

```text
binary streams
large file streaming
chunked processing
backpressure
safe memory limits
GPU target declarations
accelerator target declarations
structured errors
```

See `docs/video-package-boundaries-and-compute-auto.md` for the package/runtime/provider boundary model for video packages, camera/screen permissions, video privacy reports, video memory reports and compute auto use in video workflows.

Correct wording:

```text
Galerina supports safe streaming primitives that video packages can use.
```

Avoid wording:

```text
Galerina natively supports video processing.
```

---

# 6. Document Format Engines

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, tooling, external services
```

Galerina should not natively support:

```text
PDF parsing
PDF generation
DOCX parsing
DOCX generation
ODT parsing
XLSX parsing
CSV business mapping
OCR
document conversion
archive extraction rules
email attachment extraction
```

Galerina may provide:

```text
files
paths
metadata
binary data
streams
buffers
safe uploads
MIME/type hints
permissions
large file handling
structured errors
```

Correct wording:

```text
Galerina supports file and stream primitives. Document-specific handling belongs in packages.
```

Avoid wording:

```text
Galerina natively supports PDF, DOCX and XLSX.
```

---

# 7. Email Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, provider integrations, external services
```

Galerina should not natively support:

```text
SMTP client implementation
IMAP client implementation
email sending platform
email receiving platform
newsletter system
bounce handling
email templates
DKIM implementation
SPF implementation
DMARC implementation
provider-specific email services
```

Galerina may provide:

```text
network.outbound
typed headers
typed message payloads
attachments as streams
safe secrets
TLS/certificate handling
provider package boundaries
structured errors
```

Correct wording:

```text
Email belongs in packages or provider integrations.
```

Avoid wording:

```text
Galerina natively supports email sending.
```

---

# 8. SMS and Messaging Providers

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, provider integrations, external services
```

Galerina should not natively support:

```text
SMS sending
MMS sending
WhatsApp integrations
Telegram integrations
Slack integrations
Teams integrations
provider-specific messaging APIs
message campaign tools
delivery dashboards
```

Galerina may provide:

```text
network.outbound
typed payloads
safe secrets
rate limits
timeouts
structured errors
provider package permissions
```

Correct wording:

```text
Messaging providers belong in packages or external services.
```

Avoid wording:

```text
Galerina natively supports SMS.
```

---

# 9. Authentication Frameworks

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, frameworks, external identity providers
```

Galerina should not natively support:

```text
full login systems
user registration systems
admin role interfaces
password reset workflows
OAuth provider implementations
OIDC provider implementations
MFA products
passkey product implementations
session databases
permissions dashboards
```

Galerina may provide:

```text
secure random
password hashing primitives
constant-time comparison
secure cookies
token validation primitives
SecureString
permission/effect system
safe secret handling
structured security errors
JWT verification policy
OAuth provider declarations
scope and audience checks
DPoP and mTLS checks
request proof validation
capability-token workflow metadata
replay and nonce checks
auth/proof/security reports
```

Galerina should not invent new cryptography. It may create safer typed workflows
around proven standards such as JWT, OAuth bearer tokens, DPoP and mTLS.

Correct wording:

```text
Galerina provides security primitives that authentication packages can use.
Galerina supports safer token verification boundaries around established standards.
```

Avoid wording:

```text
Galerina includes a built-in authentication framework.
Galerina invents its own token cryptography.
```

---

# 10. Databases

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Drivers, packages, external databases
```

Galerina should not natively support:

```text
SQL database engines
NoSQL database engines
vector databases
ORM systems
query builders
migration frameworks
database admin tools
database replication
database hosting
database-specific query languages
```

Galerina may provide:

```text
typed database driver boundaries
database.read effect
database.write effect
transactions as safe boundaries
timeouts
connection permissions
streaming results
structured database errors
```

Correct wording:

```text
Database access belongs in drivers and packages.
```

Avoid wording:

```text
Galerina natively supports SQL, NoSQL and vector databases.
```

---

# 11. Queue Platforms and Background Job Systems

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, frameworks, external queue services
```

Galerina should not natively support:

```text
queue hosting
message brokers
distributed job runners
task dashboards
retry dashboards
pub/sub platforms
Kafka-style event platforms
RabbitMQ-style brokers
SQS-style queues
provider-specific queue systems
```

Galerina may provide:

```text
async
await
timeouts
retries
rate-limit primitives
worker runtime profile
typed message payloads
network permissions
structured errors
```

Correct wording:

```text
Galerina supports primitives that queue packages and worker frameworks can use.
```

Avoid wording:

```text
Galerina natively supports queues.
```

---

# 12. Browser Frameworks and DOM Systems

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, frameworks, browser runtime targets
```

Galerina should not natively support:

```text
DOM frameworks
component frameworks
CSS frameworks
HTML templating frameworks
browser routers
state management frameworks
push notification platforms
browser UI libraries
animation frameworks
frontend application frameworks
```

Galerina may provide:

```text
WASM target
JavaScript interop
browser runtime profile
typed event boundaries
permission reports
source maps
debug metadata
```

See `docs/browser-dom-and-web-platform-primitives.md` for the safe browser,
DOM, HTML, storage, push notification and service worker primitive model.

Correct wording:

```text
Browser and DOM support should be handled through runtime profiles, interop, and packages.
```

Avoid wording:

```text
Galerina natively supports the browser DOM.
```

---

# 13. Push Notifications

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, browser APIs, mobile APIs, external services
```

Galerina should not natively support:

```text
web push platforms
mobile push platforms
notification dashboards
notification scheduling systems
provider-specific push APIs
Firebase Cloud Messaging integration
Apple Push Notification Service integration
OneSignal integration
```

Galerina may provide:

```text
network.outbound
typed payloads
safe secrets
browser runtime boundaries
mobile runtime boundaries
provider package permissions
structured errors
```

Correct wording:

```text
Push notifications belong in packages, runtime integrations, or external services.
```

Avoid wording:

```text
Galerina natively supports push notifications.
```

---

# 14. Accessibility Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Tooling, packages, build reports
```

Galerina should not natively support:

```text
accessibility scanners
screen reader simulators
colour contrast report engines
ARIA validators
caption generators
subtitle generators
transcription engines
automated accessibility fixers
```

Galerina may provide:

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

Correct wording:

```text
Accessibility checks belong in tooling and packages.
```

Avoid wording:

```text
Galerina natively supports accessibility scanning.
```

---

# 15. AI Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external services, specialist runtimes
```

Galerina should not natively support:

```text
LLM hosting
model training
model inference engines
prompt management platforms
embedding databases
agent frameworks
AI workflow builders
AI search platforms
AI image generation
AI video generation
AI provider integrations
```

Galerina may provide:

```text
typed API calls
network permissions
GPU target declarations
AI accelerator target declarations
safe memory controls
streaming responses
provider boundaries
rate limits
compiler reports
AI-readable documentation
```

Correct wording:

```text
Galerina can be AI-friendly without becoming an AI platform.
```

Avoid wording:

```text
Galerina natively supports AI agents.
```

---

# 16. Cloud Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Tooling, deployment systems, external platforms
```

Galerina should not natively support:

```text
cloud hosting
server management
Kubernetes replacement
serverless provider platforms
edge hosting providers
cloud database providers
cloud storage providers
cloud dashboards
billing systems
provider-specific deployment systems
```

Galerina may provide:

```text
runtime profiles
deployment metadata
environment handling
safe config loading
permission reports
target reports
container-friendly builds
structured deployment outputs
```

Correct wording:

```text
Galerina can compile for cloud, server, edge, worker and CLI profiles without becoming a cloud platform.
```

Avoid wording:

```text
Galerina natively supports AWS, Azure, Google Cloud or Firebase.
```

---

# 17. Serverless and Edge Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Runtime profiles, deployment tooling, external platforms
```

Galerina should not natively support:

```text
AWS Lambda platform logic
Cloudflare Workers platform logic
Vercel Functions platform logic
Netlify Functions platform logic
Google Cloud Functions platform logic
Azure Functions platform logic
provider-specific cold start handling
provider-specific billing behaviour
```

Galerina may provide:

```text
edge runtime profile
worker runtime profile
serverless runtime profile
restricted filesystem awareness
memory limit awareness
timeout awareness
stateless execution hints
structured target reports
```

Correct wording:

```text
Serverless and edge deployment belongs in runtime profiles and tooling, not native syntax.
```

Avoid wording:

```text
Galerina natively supports Cloudflare Workers.
```

---

# 18. Business Frameworks and Business Rules

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Application code, packages, frameworks
```

Galerina should not natively support:

```text
VAT rules
tax rules
invoice rules
payroll rules
banking rules
eCommerce checkout
booking engines
CRM logic
CMS logic
job board logic
legal case management logic
manufacturing workflow logic
```

Galerina may provide:

```text
Decimal
Money<TCurrency>
Date
Time
Duration
typed records
validation primitives
safe database boundaries
structured reports
```

Correct wording:

```text
Business rules belong in application code or packages.
```

Avoid wording:

```text
Galerina natively supports VAT, payroll or invoicing.
```

---

# 19. Provider-Specific Integrations

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external services, provider SDKs
```

Galerina should not hard-code providers such as:

```text
Stripe
PayPal
Firebase
AWS
Azure
Google Cloud
OpenAI
Anthropic
SendGrid
Mailgun
Twilio
PostgreSQL
MySQL
MongoDB
OpenSearch
Elasticsearch
Pinecone
Cloudflare
Vercel
Netlify
```

Galerina may provide:

```text
typed packages
network access
secrets
permissions
effects
runtime profiles
package audit reports
provider boundaries
structured errors
```

Correct wording:

```text
Provider integrations belong in packages.
```

Avoid wording:

```text
Galerina natively supports Stripe, Firebase or AWS.
```

---

# 20. Hard-Coded Human Language Lists

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Application config, packages, provider integrations
```

Galerina should not natively support hard-coded lists such as:

```text
supported_languages ["en-GB", "fr-FR", "ja-JP", "ar", "es-ES"]
built-in translation language lists
built-in region-specific language rules
provider-specific language support
```

Galerina may provide:

```text
Locale
Unicode text
text direction metadata
formatting rules
package-defined language lists
application-defined language config
```

Correct wording:

```text
Language lists belong in application config, packages, or provider integrations.
```

Avoid wording:

```text
Galerina has built-in supported translation languages.
```

---

# 21. CMS and Website Builders

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Frameworks, packages, applications
```

Galerina should not natively support:

```text
CMS content models
page builders
visual editors
theme systems
plugin marketplaces
admin dashboards
content publishing workflows
SEO management systems
media libraries
blog engines
```

Galerina may provide:

```text
typed data structures
file access
database driver boundaries
network boundaries
runtime profiles
template package boundaries
structured reports
```

Correct wording:

```text
CMS functionality belongs in frameworks or applications built with Galerina.
```

Avoid wording:

```text
Galerina includes CMS features.
```

---

# 22. Web Frameworks

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Frameworks, packages
```

Galerina should not natively support:

```text
routing frameworks
middleware frameworks
MVC frameworks
template engines
form frameworks
ORM frameworks
session frameworks
request validation frameworks
admin panels
API framework conventions
```

Galerina may provide:

```text
network.inbound
typed requests
typed responses
headers
status codes
streams
effects
permissions
runtime profiles
structured errors
content-type validation
safe body decoding policies
duplicate route checks
duplicate schema warnings
API manifest generation
idempotency declarations
webhook replay protection metadata
rate-limit declarations
concurrency limits
memory budgets
queue handoff metadata
backpressure policy
API security and load reports
```

Correct wording:

```text
Web frameworks can be built on Galerina primitives.
Galerina provides API data safety and load-control primitives that frameworks can use.
Galerina provides duplicate API and idempotency metadata that frameworks can enforce.
```

Avoid wording:

```text
Galerina includes a built-in Laravel, Django or Express equivalent.
Galerina is a load balancer or API gateway product.
```

---

# 23. UI Frameworks

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, frameworks, external UI systems
```

Galerina should not natively support:

```text
button components
form components
modal components
layout grids
CSS utility systems
design systems
theme engines
animation libraries
frontend state stores
component rendering frameworks
```

Galerina may provide:

```text
WASM target
JavaScript interop
typed event boundaries
runtime profiles
source maps
debug metadata
package boundaries
```

Correct wording:

```text
UI frameworks belong in packages or external frontend ecosystems.
```

Avoid wording:

```text
Galerina natively supports UI components.
```

---

# 24. Operating System Replacement Features

## Native Support Status

```text
Native language feature: No
Supported through primitives: Limited
Belongs in: Operating systems, runtimes, packages
```

Galerina should not become an operating system.

Galerina should not natively support:

```text
process scheduling
kernel management
device driver management
filesystem implementation
network stack implementation
user account management
window manager logic
hardware management dashboards
```

Galerina may provide controlled access to:

```text
process.spawn
file.read
file.write
network.inbound
network.outbound
env.read
system runtime profile
permission reports
```

Correct wording:

```text
Galerina can build system-aware software without becoming an operating system.
```

Avoid wording:

```text
Galerina includes operating system features.
```

---

# 25. Hardware Vendor Lock-In

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Compiler targets, drivers, vendor packages, tooling
```

Galerina should not hard-code one vendor or hardware platform.

Galerina should not natively support only:

```text
NVIDIA-specific GPU logic
AMD-specific GPU logic
Intel-specific CPU logic
AWS-specific accelerator logic
Google-specific TPU logic
Apple-specific silicon logic
Lightmatter-specific photonic logic
one photonic chip vendor
one AI accelerator vendor
```

Galerina may provide:

```text
target declarations
compute profiles
fallback rules
target reports
precision reports
runtime capability maps
performance reports
security reports
driver boundaries
```

Correct wording:

```text
Galerina should describe compute intent. Compiler targets and vendor packages handle implementation.
```

Target plugins and deployment profiles may expose provider-specific names such
as CUDA, ROCm, TPU, Trainium, Inferentia, cloud confidential compute mappings or
photonic MZI/WDM backends. These names should not be mandatory Galerina core targets.

Avoid wording:

```text
Galerina natively supports one specific chip vendor.
```

---

# 26. Media Hosting Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Applications, packages, external services
```

Galerina should not natively support:

```text
video hosting
audio hosting
image hosting
media CDN logic
media library dashboards
thumbnail generation platforms
media transcoding farms
streaming subscriptions
digital rights management platforms
```

Galerina may provide:

```text
file streams
binary data
large file handling
network access
storage provider boundaries
runtime profiles
structured errors
```

Correct wording:

```text
Media hosting belongs in applications, packages, or external platforms.
```

Avoid wording:

```text
Galerina natively supports media hosting.
```

---

# 27. Analytics Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external services, applications
```

Galerina should not natively support:

```text
web analytics platforms
product analytics dashboards
ad tracking platforms
marketing attribution systems
user behaviour tracking dashboards
A/B testing platforms
session replay systems
```

Galerina may provide:

```text
structured events
logging primitives
metrics hooks
trace hooks
privacy-aware reports
redaction rules
network provider boundaries
```

Correct wording:

```text
Analytics platforms belong in packages or external services.
```

Avoid wording:

```text
Galerina natively supports analytics tracking.
```

---

# 28. Payment Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Provider packages, external payment services
```

Galerina should not natively support:

```text
card payments
bank payments
wallet payments
subscriptions
refund systems
invoice payment systems
payment dashboards
PCI provider logic
Stripe-specific logic
PayPal-specific logic
GoCardless-specific logic
```

Galerina may provide:

```text
SecureString
network.outbound
safe secrets
typed requests
typed responses
structured errors
audit logs
redaction rules
provider package boundaries
```

Correct wording:

```text
Payment processing belongs in provider packages and external services.
```

Avoid wording:

```text
Galerina natively supports payments.
```

---

# 29. File Storage Providers

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external storage providers
```

Galerina should not natively support:

```text
AWS S3-specific storage
Google Cloud Storage-specific storage
Azure Blob Storage-specific storage
Firebase Storage-specific storage
Dropbox-specific storage
OneDrive-specific storage
cloud storage dashboards
provider-specific storage rules
```

Galerina may provide:

```text
file streams
binary data
network access
safe secrets
provider boundaries
permission reports
structured errors
```

Correct wording:

```text
Cloud storage support belongs in provider packages.
```

Avoid wording:

```text
Galerina natively supports S3 or Firebase Storage.
```

---

# 30. Deployment Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Tooling, CI/CD, external platforms
```

Galerina should not natively support:

```text
CI/CD platforms
deployment dashboards
GitHub Actions replacement
GitLab CI replacement
Docker replacement
Kubernetes replacement
Terraform replacement
hosting dashboards
rollback dashboards
```

Galerina may provide:

```text
build outputs
runtime profiles
target reports
security reports
package reports
container-friendly builds
environment validation
```

Correct wording:

```text
Deployment belongs in tooling and external platforms.
```

Avoid wording:

```text
Galerina natively manages deployments.
```

---

# 31. Package Registry Hosting

## Native Support Status

```text
Native language feature: No
Supported through tooling: Yes
Belongs in: Package infrastructure, external registries
```

Galerina should not natively support:

```text
package registry hosting
package marketplace hosting
package billing
package moderation
package search platform
package web portal
```

Galerina may provide:

```text
package manifests
lock files
hash verification
dependency reports
permission reports
package signing support
supply-chain reports
```

Correct wording:

```text
Galerina supports package safety, but registry hosting is separate infrastructure.
```

Avoid wording:

```text
Galerina includes its own package marketplace.
```

---

# 32. Legal, Medical or Financial Expert Systems

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Application code, specialist packages, regulated systems
```

Galerina should not natively support:

```text
legal advice systems
medical diagnosis systems
financial advice systems
tax advice engines
insurance decision engines
credit scoring systems
compliance decision systems
```

Galerina may provide:

```text
strict types
audit logs
structured reports
Decimal
Money<TCurrency>
Date
Time
secure records
permission controls
redaction rules
```

Correct wording:

```text
Regulated domain logic belongs in specialist applications and packages.
```

Avoid wording:

```text
Galerina natively supports legal, medical or financial decisions.
```

---

# 33. Games Engines

## Native Support Status

```text
Native language feature: No
Supported through primitives: Limited
Belongs in: Packages, engines, external frameworks
```

Galerina should not natively support:

```text
game engines
physics engines
rendering engines
asset pipelines
scene graphs
animation systems
multiplayer engines
game editor tools
```

Galerina may provide:

```text
strict types
memory safety
binary data
streams
interop
GPU target declarations
runtime profiles
performance reports
```

Correct wording:

```text
Game engines can use Galerina primitives, but they are not native language features.
```

Avoid wording:

```text
Galerina includes a built-in game engine.
```

---

# 34. Data Science Platforms

## Native Support Status

```text
Native language feature: No
Supported through primitives: Yes
Belongs in: Packages, external tools, specialist runtimes
```

Galerina should not natively support:

```text
notebook platforms
dataframe engines
charting systems
machine learning platforms
statistics platforms
data cleaning frameworks
data warehouse engines
BI dashboards
```

Galerina may provide:

```text
Decimal
typed arrays
streams
file access
database driver boundaries
GPU target declarations
structured reports
interop
```

Correct wording:

```text
Data science tools belong in packages or external platforms.
```

Avoid wording:

```text
Galerina natively supports data science notebooks.
```

---

# 35. Native Support Decision Test

Before adding any feature to Galerina itself, ask:

```text
Is this needed by most programs?
Does this affect safety, typing, memory, effects, permissions, errors, or compilation?
Would this normally need a package, extension, framework, driver, or external service?
Can this be implemented cleanly as a package?
Would adding this make Galerina harder to keep stable?
Would this create provider lock-in?
Would this make Galerina look like a framework rather than a language?
```

If the feature is specialist, provider-specific, domain-specific, or application-specific, it should not be a native language feature.

---

# 36. Approved Replacement Wording

Use this wording when refactoring existing documents.

Instead of:

```text
Galerina supports PDF.
```

Use:

```text
Galerina supports file streams and binary data that PDF packages can use.
```

Instead of:

```text
Galerina supports email.
```

Use:

```text
Galerina supports networking, safe secrets and typed payloads that email packages can use.
```

Instead of:

```text
Galerina supports SQL.
```

Use:

```text
Galerina supports typed database driver boundaries. SQL drivers belong in packages.
```

Instead of:

```text
Galerina supports search.
```

Use:

```text
Galerina supports typed provider boundaries that search packages can use.
```

Instead of:

```text
Galerina supports AI.
```

Use:

```text
Galerina supports safe compute, networking and streaming primitives that AI packages can use.
```

Instead of:

```text
Galerina supports video.
```

Use:

```text
Galerina supports binary streams and backpressure primitives that video packages can use.
```

---

# 37. Final Non-Support List

Galerina should not natively support:

```text
search engines
translation engines
image editors
audio processors
video editors
PDF engines
DOCX engines
XLSX engines
email platforms
SMS platforms
authentication frameworks
SQL database engines
NoSQL database engines
vector databases
ORM frameworks
queue brokers
browser frameworks
DOM frameworks
CSS frameworks
UI frameworks
CMS platforms
AI platforms
cloud platforms
serverless provider platforms
payment platforms
analytics platforms
storage providers
deployment platforms
business rule engines
legal expert systems
medical expert systems
financial advice systems
game engines
data science platforms
provider-specific SDKs
hard-coded human language lists
hardware vendor-specific language features
```

---

# 38. Final Position

Galerina should stay focused.

Galerina is:

```text
a strict language
a memory-safe language
a security-first language
a typed language
a systems-aware language
a multi-target language
a package-aware language
an AI-readable language
a safe foundation for building software
```

Galerina is not:

```text
a framework
a database
a CMS
a search engine
a translation engine
an AI platform
a media editor
an email platform
an authentication platform
a cloud provider
a queue platform
a browser framework
a business rules engine
```

The correct model is:

```text
Galerina core:
  safe language primitives

Galerina standard library:
  common low-level utilities

Galerina packages:
  specialist capabilities

Galerina frameworks:
  application structure

Galerina tools:
  reports, builds, tests and deployment helpers

External services:
  databases, search engines, AI providers, email providers, payment providers and cloud platforms
```

Galerina should be powerful because its foundations are safe, strict and clear.

It should not become powerful by adding every possible framework, provider, or application feature into the language.
