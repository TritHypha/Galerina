# Galerina Pending Additions

This document collects Galerina ideas that should be added to the documentation or checked against the current repository.

The purpose is to avoid losing important concepts while the Galerina language and documentation structure is being refined.

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

The foLOwing items should be added, reviewed or confirmed in the repository.

---

## 1. Generated Outputs in Run Mode

Status: documented in `docs/run-and-compile-modes.md`; prototype support exists for `Galerina run --generate`, `Galerina generate`, `Galerina dev` and `Galerina dev --watch`.

Galerina should be able to generate useful outputs even when the project is not fully compiled.

A full production compile should still generate the complete build artefacts, but development mode should also be able to generate reports, guides and documentation from checked source.

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

Rule:

```text
Generated explanation should not require a production compile.
Production artefacts require a compile.
```

---

## 2. Unified Development Command

Status: prototype support exists for a checked generate-and-run cycle, including `Galerina dev --watch` for re-running that cycle when `.spore` files change.

Recommended command:

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

## 2B. Safe Pattern Matching and Regex

Status: documented in `docs/safe-pattern-matching-and-regex.md` and
`docs/sytax/patterns-and-regex.md`, with usage examples in
`docs/sytax-examples/patterns-and-regex.md`; parser support, safe engine
integration, UnsafeRegex production gates, pattern reports and denied-feature
diagnostics remain pending.

Core rule:

```text
Pattern is safe, fast and default.
UnsafeRegex is advanced, explicit and audited.
Default regex must be bounded and ReDoS-resistant.
```

Pending implementation examples:

```text
parse Pattern declarations
parse pattern_policy
parse unsafe regex blocks
parse pattern_set blocks
define denied feature diagnostics
define compile-inside-loop warnings
define pattern report schema
define pattern map-manifest entries
define UnsafeRegex production gates
integrate or wrap a safe pattern engine
```

Documentation rule:

```text
When pattern syntax changes, update docs/sytax/patterns-and-regex.md.
When pattern examples change, update docs/sytax-examples/patterns-and-regex.md.
```

---

## 3. AI Token Reduction

Status: documented in `docs/ai-token-reduction.md`; prototype includes `Galerina ai-context`, `Galerina explain --for-ai` and token reports.

Core idea:

```text
Do not make AI read the whole project.
Make Galerina generate compact, trusted summaries from the code that actually compiled or checked successfully.
```

AI-friendly generated files:

```text
app.ai-guide.md
app.ai-context.json
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

---

## 4. Memory and Variable Use

Status: documented in `docs/memory-and-variable-use.md`; prototype has initial `Json.clone()` and read-only `&Json` mutation diagnostics.

Core rule:

```text
Galerina should avoid hidden copies of large values.
```

Goals:

```text
no global variable dependency
no repeated 500kb copies
safe local lifetime
fast read-only sharing
explicit copies only
better memory control
```

---

## 5. Lazy Compact JSON

Status: documented in `docs/lazy-compact-json.md`; compiler/linter checks and memory report schema remain pending.

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

---

## 6. Pure Flow Caching

Status: documented in `docs/pure-flow-caching.md`; deeper compiler support remains pending.

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

---

## 7. Memory Pressure and Disk Spill

Status: documented in `docs/memory-pressure-and-disk-spill.md`; prototype emits memory and runtime reports.

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

---

## 8. Omni Logic

Status: documented in `OMNI_LOGIC.md`, `docs/omni-logic.md`, `docs/logic-widths.md` and `docs/logic-targets.md`; prototype has initial logic mode/width checks.

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

---

## 9. Strict Global Registry

Status: documented in `docs/strict-global-registry.md`; prototype parses globals and emits global reports.

Core rule:

```text
Local by default.
Global by declaration.
Mutable only by controlled state.
Secrets always protected.
```

---

## 10. Strict Comments

Status: documented in `docs/strict-comments.md`; prototype extracts strict comments and reports mismatches.

Core rule:

```text
Strict comments are checked intent.
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

---

## 11A. Primary Lane and Offload Nodes

Status: documented in `docs/primary-lane-and-offload-nodes.md`; compiler/runtime syntax and budget checks remain pending.

Core rule:

```text
Primary lane stays responsive.
Offload nodes handle bounded background work.
CPU and memory budgets are explicit.
Failures are reported.
Security-critical work stays on the primary lane unless explicitly and safely awaited.
```

Purpose:

```text
Main task stays on the primary CPU lane.
Repetitive/background/heavy tasks are pushed to smaller worker CPU nodes.
The compiler/runtime controls how much CPU those workers are aLOwed to use.
```

---

## 11B. Frontend Compilation Targets

Status: documented in `docs/frontend-compilation-js-wasm.md`; browser target syntax, JavaScript output and hybrid WebAssembly wrapper support remain pending.

Core model:

```text
JavaScript target for browser interaction.
WebAssembly target for heavy compute.
Hybrid target for real-world frontend apps.
```

Browser output must block server-only imports, private environment access and secrets because compiled frontend code is public.

---

## 11B.1. Browser, DOM and Web Platform Primitives

Status: documented in `docs/browser-dom-and-web-platform-primitives.md`;
SafeHtml, DOM effects, browser permission policy, fetch/storage/cookie policy,
push/service worker primitives, browser security reports and AI guide summaries
remain pending.

Core rule:

```text
Galerina provides safe browser/web primitives.
Frameworks provide UI structure and developer opinions.
Browsers provide the actual Web APIs.
```

Pending implementation examples:

```text
define SafeHtml and safe HTML policy schema
define dom.read/dom.write effect checking
define browser permission policy schema
define browser fetch/storage/cookie policy schemas
define typed browser event syntax
define typed form validation syntax
define push notification and service worker report schemas
define browser security report schema
define browser map-manifest entries
define AI guide browser summary output
```

---

## 11C. Hybrid Scalar + Vector Model

Status: documented in `docs/vector-model.md` and
`docs/vectorised-dataset-syntax.md`; parser support, scalar fallback lowering,
security checks and vector reports remain pending.

Core rule:

```text
Scalar-first for workflows and side effects.
Vector-aware for repeated safe calculations.
Pure vector blocks by default.
Side effects blocked by default.
Scalar fallback for backwards compatibility.
Compiler reports every vector decision.
```

Tagline:

```text
Galerina is scalar-first, vector-aware, and security-first.
```

Dataset syntax direction:

```text
Use `vectorize rows { ... }` where row data becomes typed vector columns.
Use `pure vector flow` when an entire flow is vector-preferred.
Use `pure vector required flow` when vectorisation must succeed.
```

---

## 11C.0. Simple Vector Syntax and Compute Auto

Status: documented in `docs/simple-vector-and-compute-auto.md`; parser support, target selection implementation and runtime hardware detection remain pending.

Core rule:

```text
Keep normal code simple.
Hide hardware-specific vector details behind type aliases, models and reports.
Use `compute auto` to choose the best available safe target.
Report fallback and precision decisions.
```

Syntax direction:

```text
pure vector flow
pure vector float flow
pure vector decimal flow
pure vector required flow
compute auto
compute target photonic_mzi required when a target plugin exists
```

Pending implementation examples:

```text
parse compute auto
parse pure vector float/decimal/required modifiers
load boot.spore compute preference order
emit compute auto target selection reports
emit AI guide compute auto summaries
detect photonic_mzi target capability through target plugin or deployment profile
```

---

## 11C.1. Hybrid Logic and Wavelength Compute

Status: documented in `docs/hybrid-logic-and-wavelength-compute.md`; compiler
support, target reports, wavelength syntax and analogue precision schemas remain
pending.

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

## 11C.2. Hardware Feature Detection and Security

Status: documented in `docs/hardware-feature-detection-and-security.md`;
backend probing, target selection rules, runtime enforcement and report schemas
remain pending.

Core rule:

```text
Galerina source stays clean.
Compiler detects hardware features.
Build output selects the best safe target.
Fallback is always available.
Reports explain what was used.
```

Recommended early focus:

```text
CPU vectorisation for dataset analysis
GPU tensor planning for AI/vector workloads
control-flow protection where available
secret memory protection strategy
confidential deployment reports
hardware feature reporting in app.target-report.json
```

---

## 11C.3. Backend Compute Support Targets

Status: documented in `docs/backend-compute-support-targets.md`; target
discovery, target plugin boundaries, capability maps, parser support and
expanded target reports remain pending.

Core rule:

```text
Compute planning belongs in Galerina compiler/runtime.
Vendor-specific hardware support belongs in target plugins, drivers and deployment profiles.
Galerina provides safe compute blocks, target categories, fallback rules, precision rules and reports.
```

The backend target model includes generic categories:

```text
CPU and CPU SIMD/vector targets
GPU as a broad target category
AI accelerator as a broad tensor/model target category
photonic_auto and photonic_candidate as optional candidate categories
hybrid CPU/GPU and memory/interconnect targets
cloud compute profiles
```

Plugin/deployment-profile areas:

```text
CUDA
ROCm
Vulkan compute
Metal
OpenCL
WebGPU runtime details
TPU
Trainium
Inferentia
NPU plugins
photonic MZI/WDM/ring/crossbar plugins
cloud confidential compute mappings
provider-specific CPU/AI/security processor mappings
```

Pending implementation examples:

```text
parse compute auto
parse target chains with ai_accelerator and memory_interconnect
parse precision and tolerance metadata
parse cloud/deployment target profiles
define target plugin boundary schema
detect CPU/GPU/AI/photonic target capabilities through plugins
report target calibration/health/precision/fallback status
estimate data movement cost
emit app.compute-capability-map.json
emit app.precision-report.json
emit app.fallback-report.json
emit app.memory-report.json
emit app.cloud-target-report.json
expand app.target-report.json schema for backend target planning
```

---

## 11D. Target and Capability Model

Status: documented in `docs/target-and-capability-model.md`; feature status labels, browser target syntax, capability block syntax, import classification, browser import blocking and target/capability reporting have initial prototype support.

Core rule:

```text
Target decides capability.
Capability decides aLOwed imports.
ALOwed imports decide what code may compile.
Fallback decides what happens when the preferred target cannot run the code.
Reports explain every decision.
```

Recommended next milestone:

```text
expand browser target checks into compiled examples and JavaScript output
```

---

## 11D.1. Kernel and Driver Development Boundary

Status: documented in `docs/kernel-and-driver-boundary.md`; implementation work
is blocked by default.

Core rule:

```text
Do kernel and driver work last.
Do it only with explicit maintainer or project permission.
Do not start design, examples, code, bindings or backend work for it by default.
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

Recommended next milestone:

```text
keep documenting native bindings as denied by default
do not add kernel or driver work to early prototype milestones
```

---

## 11E. Package Use Registry

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

Syntax direction:

```text
import "./types.spore"
use std.json
use GraphQL

packages {
  use GraphQL from "./vendor/graphql" {
    version "1.4.2"
  }
}
```

---

## 11E.1. Search and Translation Provider Boundaries

Status: documented in `docs/search-and-translation-provider-boundaries.md`;
package-defined effects, provider policy schemas, redaction schemas,
rate-limit enforcement and package report schemas remain pending.

Core rule:

```text
Search and translation are not native Galerina language features.
Search and translation are package/provider/framework areas.
Galerina provides safe typed boundaries, effects, permissions, limits and reports.
```

Pending implementation examples:

```text
define package-defined effect registration
define search provider package report schema
define translation provider package report schema
define provider redaction policy schema
define provider rate-limit policy schema
define AI guide provider-boundary summaries
add provider-boundary examples after package parser support exists
```

---

## 11E.2. Video Package Boundaries and Compute Auto

Status: documented in `docs/video-package-boundaries-and-compute-auto.md`;
video package effects, browser/runtime media permissions, privacy reports,
memory reports, target stage reports and package report schemas remain
pending.

Core rule:

```text
Video processing is not a native Galerina language feature.
Video processing is a package/provider/framework/runtime area.
Galerina provides safe file, stream, effect, permission, privacy, memory and compute boundaries.
```

Pending implementation examples:

```text
define video package effect registration
define camera/screen/media runtime permission policy schema
define video privacy report schema
define video memory report schema
define video package target-stage report schema
define video package map-manifest entries
define video AI guide package summary output
add video package examples after package parser support exists
```

---

## 11E.3. Image AI Package Boundaries and Compute Auto

Status: documented in `docs/image-ai-package-boundaries-and-compute-auto.md`;
image package effects, image policy schemas, decoder sandbox rules, image
memory/security/target/precision reports and package report schemas remain
pending.

Core rule:

```text
Image AI tasks are not native Galerina language features.
Image AI is a package/provider/framework area.
Galerina provides safe file, stream, effect, permission, memory and compute boundaries.
```

Pending implementation examples:

```text
define image package effect registration
define image policy and validation schema
define image decoder sandbox policy schema
define image memory report schema
define image security report schema
define image package target and precision report schemas
define image package map-manifest entries
define AI guide image package summary output
add image package examples after package parser support exists
```

---

## 11F. Security-First Build System

Status: documented in `docs/security-first-build-system.md`; `Galerina build --with-tests`, `Galerina build --strict`, test reports and AI suggestions remain pending.

Core rule:

```text
Galerina does not compile unsafe code silently.
Galerina checks, tests, explains, reports, and suggests before producing output.
```

Recommended build pipeline:

```text
parse
type-check
check imports and target rules
run security checks
run memory checks
run vector/offload safety checks
run tests when configured
generate reports
generate suggestions
compile output
```

---

## 11F.1. Debug Console

Status: documented in `docs/debug-console.md`; compiler diagnostics, console reports, production stripping and runtime debugger integration remain pending.

Core rule:

```text
Console debugging should be simple in development.
Console debugging should be structured, source-mapped and redacted.
Production builds should warn, strip or restrict debug console calls.
```

Important defaults:

```text
SecureString values are redacted.
Large JSON is summarised.
console.scope is development/debug only by default.
```

---

## 11G. Memory Safety And Developer Experience

Status: documented in `docs/memory-safety-and-developer-experience.md`; graph
ownership, draft/secure modes, recursion reports, trusted modules and FFI syntax
remain pending.

Core rule:

```text
Do not make developers choose between safety and productivity.
Make safe patterns easier than unsafe patterns.
```

Priority foLOw-up areas:

```text
target and capability model
graph ownership model
draft vs secure mode
compiler security/test/suggestion engine
hybrid scalar + vector model
explicit clone and memory reports
trusted low-level modules
interop generator
```

---

## 12. Missing Formal Language Files

Status:

```text
SPEC.md                                      added
GOVERNANCE.md                                added
COMPATIBILITY.md                             added
docs/contracts.md                            added
docs/modules-and-visibility.md               added
docs/standard-library.md                     added
docs/error-codes.md                          added
docs/compiler-backends.md                    added
docs/testing.md                              added
docs/observability.md                        added
docs/interoperability.md                     added
docs/xml-support.md                          added
docs/graphql-support.md                      added
```

Highest priority formal files are now present, but many still need deeper specification detail.

---

## 13. SPEC.md

Status: added; needs expansion toward an official language specification.

`SPEC.md` should define the official Galerina language rules.

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

Status: documented in `docs/error-codes.md`; prototype emits standard Galerina warning/error/fatal code format.

Example families:

```text
galerina-WARN-MEM-001
galerina-ERR-MEM-001
galerina-FATAL-MEM-001
galerina-WARN-TARGET-001
galerina-ERR-LOGIC-001
```

---

## 15. Contracts

Status: documented in `docs/contracts.md`; compiler support remains pending.

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

Status: documented in `docs/modules-and-visibility.md`; compiler support remains pending.

Possible model:

```text
module
export
internal
private
trait
impl
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

Inside this repository, paths should be root-relative.

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

Status: updated for current known files. Remaining TODOs should track implementation depth, not just document existence.

Pending implementation examples:

```text
Galerina dev command
Galerina generate command
borrow escape checks
Lazy Compact JSON compiler/linter checks
Lazy Compact JSON memory report schema
contracts compiler checks
modules and visibility compiler model
standard library specification detail
```

---

## 20. CHANGELOG.md Updates

Status: updated under `[Unreleased]`.

Future changelog updates should distinguish:

```text
documented concept
prototype compiler behaviour
generated report output
schema change
breaking language change
```

---

## 21. Ransomware-Resistant Design

Status: documented in `docs/ransomware-resistant-design.md`; compiler/runtime enforcement remains pending.

The model covers:

```text
file access allowlists
protected paths
ransomware guard mass-operation limits
backup protection
package file/network/shell permissions
shell default deny
destructive database action controls
upload folder protections
ransomware audit reports
security report, AI guide, map manifest and build manifest integration
```

Pending implementation examples:

```text
parse ransomware_guard policy
enforce protected paths
emit ransomware-risk-report.json
add security-audit --ransomware command
add runtime mass write/rename/delete detection
integrate ransomware checks into security reports
```

---

## 22. Dart and Flutter Target Support

Status: documented in `docs/dart-flutter-target.md`; parser/backend support remains pending.

Galerina should support Dart and Flutter as layered target outputs without becoming a
Flutter framework.

Required boundary:

```text
Galerina = language and compiler/toolchain
Dart = target language
Flutter = external UI framework/package ecosystem
Skia and Impeller = rendering backend concerns to report, not core Galerina syntax
```

Documented design direction:

```text
sync by default
async flow only when declared
await only inside async flows
async flows may appear anywhere normal flows are allowed
Bytes as portable Galerina byte data
Dart.Uint8List only at explicit Dart/Flutter interop boundaries
vector compute separate from async IO
Flutter support through generated Dart package output first
Flutter package/plugin output after Dart logic package output
platform-channel contracts as explicit interop boundaries
Pigeon-style typed platform API generation as optional tooling
Flutter FFI/native-library output for compute-heavy code
permission metadata and source maps for generated Flutter artefacts
Flutter UI component syntax as later-stage research
Skia/Impeller assumptions reported, not hard-coded
```

Pending implementation examples:

```text
parse async flow
reject await outside async flow
lower async flow to Dart Future
add target dart reports
add target flutter reports
add Flutter-compatible package output layout
add Bytes to Dart.Uint8List conversion checks
add Dart type mapping reports
add platform channel parser/report support
add permission metadata reports
add Pigeon-style typed API schema output or equivalent
add flutter-ffi target planning
add native-library plus Dart binding output planning
add unsupported-platform diagnostics for Flutter FFI
add source maps from generated Dart/native bindings back to .spore files
defer Flutter UI component syntax until lower support levels are stable
emit async-report.json
emit bytes-interop-report.json
emit platform-channel-report.json
emit ffi-report.json
emit render-target-report.json
emit graphics-backend-report.json
```

---

## 23. JavaScript, TypeScript and Framework Target Support

Status: documented in `docs/javascript-typescript-framework-targets.md`; parser/backend support remains pending.

Galerina should support Node.js, React, Angular and similar ecosystems through
generated JavaScript, TypeScript declarations, schemas, source maps, WASM
bridges and adapter manifests without becoming those frameworks.

Required boundary:

```text
Galerina = language and compiler/toolchain
JavaScript/TypeScript = target output and interop layer
Node = runtime target
React/Angular = external framework adapter targets
WASM = browser/Node compute module target
```

Documented design direction:

```text
prefer ESM JavaScript output for modern framework interop
generate TypeScript declarations for Galerina exports
generate JSON Schema and OpenAPI from Galerina types/contracts
support browser and Node WASM bridges
support Node worker-compatible compute modules
support client_safe, server_only and worker_safe export markers
reject forbidden effects from client_safe exports
reject DOM/server-only effects from worker_safe exports
generate React hook/client/schema adapters as package output
generate Angular service/client/form/signal-friendly adapters as package output
keep React/Angular component syntax, JSX, decorators, routers and state frameworks out of core Galerina
```

Pending implementation examples:

```text
parse target javascript
parse target node
parse react-adapter and angular-adapter targets
parse client_safe, server_only and worker_safe export markers
emit TypeScript declarations
emit framework-adapter-manifest.json
emit js-target-report.json
emit typescript-declarations-report.json
emit wasm-bridge-report.json
emit worker-bridge-report.json
emit client-server-split-report.json
add client/server split diagnostics
add worker clone/transfer safety diagnostics
add source maps from generated JS/WASM back to .spore files
```

---

## 24. Device Capability Boundaries

Status: documented in `docs/device-capability-boundaries.md`; parser/runtime
support remains pending.

Galerina should support the safe foundations for phone and device features without
making camera, microphone, GPS, Bluetooth, notifications, media players, phone
radios or mobile UI native language features.

Required boundary:

```text
Galerina = language and compiler/toolchain
Device features = packages, platform bindings, OS APIs, drivers or frameworks
Mobile UI/app lifecycle = frameworks
Raw/privileged device access = blocked by default
```

Documented design direction:

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

Pending implementation examples:

```text
parse device permission declarations consistently
check device effects against declared permissions
reject core calls pretending to be built-in device APIs
emit device-capability-report.json
emit device-privacy-report.json
emit native-bindings-report.json for device/platform bindings
connect device compute choices to compute-target-report.json
add mobile-native target planning without mobile framework syntax
```

---

## 25. Text AI Package Boundaries and Compute Auto

Status: documented in `docs/text-ai-package-boundaries-and-compute-auto.md`;
parser/runtime/report support remains pending.

Galerina should safely support text AI packages, model providers and compute-heavy
text workflows without making text AI a native language feature.

Required boundary:

```text
Galerina = language and compiler/toolchain
Text AI tasks = packages, model providers, frameworks, applications or external services
Generated text = data, not executable instructions
```

Documented design direction:

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

Pending implementation examples:

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

## 26. Auth, Token and Verification Boundaries

Status: documented in `docs/auth-token-verification-boundaries.md`;
parser/runtime/report support remains pending.

Galerina should support modern authentication and authorisation standards through
safe typed verification boundaries without becoming an identity provider,
authentication product or cryptography framework.

Required boundary:

```text
Galerina = language and compiler/toolchain
JWT, OAuth, bearer, DPoP and mTLS = established standards to validate safely
Identity provider, login UI, MFA product and session framework = packages/frameworks/external services
New cryptographic algorithms = out of scope
```

Documented design direction:

```text
treat BearerToken and JwtToken as SecureString values
verify JWT claims before use
require issuer, audience, expiry, signature and trusted key checks
deny algorithm "none" and untrusted algorithms by default
declare OAuth providers, JWKS, PKCE and token validation policy
support DPoP and mTLS sender-constrained token checks
support request proof envelopes for high-risk routes, queues and webhooks
support capability-token workflows bound to action, resource, nonce and request hash
support idempotency and replay protection for sensitive mutations
support post-quantum/hybrid crypto policy declarations without forcing them into normal code
mark hardware proof such as photonic PUFs as experimental policy/plugin work
generate auth, token, proof, crypto policy and security reports
```

Pending implementation examples:

```text
parse auth_policy
parse auth_provider
parse route auth blocks for bearer, provider and scopes
parse verify blocks for capability and request_proof requirements
parse DPoP and mTLS policy blocks
parse crypto_policy with classical, post_quantum and hybrid modes
reject unverified JWT claim use
reject unsafe bearer-token logging/storage/client exports
reject JWT algorithm "none" and missing signature defaults
check issuer, audience, expiry and scope requirements
check DPoP/mTLS requirements on high-risk routes
check nonce/replay-cache/idempotency requirements for sensitive mutations
emit auth-report.json
emit token-report.json
emit proof-report.json
emit crypto-policy-report.json
add AI guide auth and proof summaries
```

---

## 27. API Data Security and Load Control

Status: documented in `docs/api-data-security-and-load-control.md`;
parser/runtime/report support remains pending.

Galerina should make API input safe before it reaches application logic without
becoming a web framework, load balancer or API gateway product.

Required boundary:

```text
Galerina = language and compiler/toolchain
API data safety = typed contracts, policies, limits, reports and checks
HTTP server/router/load balancer/API gateway = packages/frameworks/external systems
Queue and rate-limit storage = packages/frameworks/external systems
```

Documented design direction:

```text
decode API input into strict request types
validate Content-Type before decoding
enforce body size, depth, node and string limits
deny unknown fields and duplicate JSON keys where configured
deny unsafe implicit type coercion by default
support safe payload identification without bypassing route policy
support per-route rate, concurrency, timeout and memory budgets
support trusted-proxy rules for X-Forwarded-For and source IP decisions
support streaming request bodies with bounded buffers
support read-only request references and request-scoped lifetime checks
support queue handoff for heavy routes
support backpressure, overload rejection and many-IP abuse controls
align route concurrency with downstream connection pools
generate API security, API memory, load-control and AI guide reports
```

Pending implementation examples:

```text
parse api_policy
parse route body blocks
parse route limits blocks
parse route memory blocks
parse route queue blocks
parse runtime_policy load_distribution blocks
check content-type mismatch
check strict body decode and schema rules
check unknown-field, duplicate-key and unsafe-coercion policy
check trusted proxy requirements for forwarded headers
check request-scoped reference escape
check large request streaming requirements
check route concurrency against downstream pool limits
emit app.api-security-report.json
emit app.api-memory-report.json
emit app.load-control-report.json
add map-manifest apiDataBoundaries entries
add AI guide API data security summaries
```

---

## 28. API Duplicate Detection and Idempotency

Status: documented in `docs/api-duplicate-detection-and-idempotency.md`;
parser/runtime/report support remains pending.

Galerina should detect duplicate API structure at check/build time and help control
duplicate side effects through idempotency, replay protection and reports
without becoming a web framework or API gateway.

Required boundary:

```text
Galerina = language and compiler/toolchain
Duplicate API safety = declarations, checks, manifests, idempotency metadata and reports
Routing/controller/middleware/API gateway = packages/frameworks/external systems
Idempotency storage = packages/frameworks/external systems
```

Documented design direction:

```text
detect duplicate method/path declarations as errors
detect duplicate route names as errors or warnings
warn about duplicate request/response type shapes
allow intentionally same type shapes with explicit annotation
generate app.api-manifest.json
support idempotency blocks with key, TTL, conflict and payload mismatch policy
recommend idempotency from side-effecting route effects
support explicit idempotency exceptions with reasons
require webhook replay protection and idempotency keys in strict/release modes
warn about duplicate external API clients
warn about repeated outbound API payloads where configured
check API version conflicts
integrate duplicate/idempotency findings into security reports and AI guides
```

Pending implementation examples:

```text
parse duplicate api_policy settings
parse idempotency blocks and exceptions
parse intentionally_same_shape_as
parse external_api duplicate_policy
parse intentionally_same_base_as
detect duplicate method/path routes
detect duplicate route names
detect duplicate API type shapes
recommend idempotency from side-effecting effects
check idempotency key, TTL, conflict and payload mismatch settings
check webhook replay and idempotency requirements
warn about duplicate external API clients
warn about duplicate outbound API payloads where configured
emit app.api-manifest.json
emit app.duplicate-api-report.json
emit app.idempotency-report.json
add map-manifest route/webhook duplicate metadata
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
