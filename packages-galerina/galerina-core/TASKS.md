# Galerina Tasks

This document tracks practical tasks for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The goal of this file is to break the project into clear work areas that can be completed step by step.

---

## Task Status Key

Use the following status labels:

```text
[ ] Not started
[/] In progress
[x] Complete
[!] Blocked
[?] Needs decision
```

Example:

```text
[ ] Write grammar draft
[/] Draft README
[x] Choose .spore extension
[?] Decide boot.spore vs main.spore
[!] Real photonic backend blocked by hardware access
```

---

## Current Project Stage

Current stage:

```text
Concept, documentation, package-boundary and v0.1 prototype planning
```

The project has an early Node.js-hosted checked interpreter/prototype. The
current task list should distinguish core language/compiler contracts from
package-owned implementation details.

The current priority is to define:

```text
language purpose
project structure
syntax direction
safety rules
JSON/API model
compiler architecture
build outputs
AI-friendly reports
security model
licence model
Git workflow
package boundaries
```

---

## Completed Decisions

```text
[x] Project name: Galerina / Galerina
[x] Source file extension: .spore
[x] Language should be strict typed
[x] Language should be memory safe
[x] Language should be security-first
[x] Language should be JSON-native
[x] Language should be API-native
[x] Language should support webhooks
[x] Language should include GPU as a first-class target concept
[x] Language should include photonic target planning
[x] Language should include ternary / 3-way simulation
[x] Runtime .env should stay outside compiled output
[x] Compiler should generate source maps
[x] Compiler should generate AI-readable reports
[x] Licence direction: Apache License 2.0
[x] Build output should include target/security/failure/source-map reports
[x] Documentation bundle should include Git docs
[x] Tri uses Positive/Neutral/Negative for value-level ternary state
[x] First practical implementation target: Node.js-hosted checked interpreter/prototype
[x] Separate Galerina core language concerns from the optional Secure App Kernel layer
[x] Support simple `console.log("...")` output in checked Run Mode
[x] Document package boundaries from `galerina-core` to `galerina-core-logic`, `galerina-core-vector`,
    `galerina-core-compute`, `galerina-core-photonic`, target packages, CLI and task packages
[x] Split compiler, runtime, security, config, reports, WASM target and GPU
    target responsibilities into dedicated package TODOs
[x] Split AI inference, low-bit AI backend, CPU target and CPU kernel
    responsibilities into dedicated package TODOs
```

---

## Open Decisions

```text
[?] Should the main entry file be boot.spore or main.spore?
[?] Should boot.spore contain both project config and executable logic?
[?] Should Galerina.config be required or optional?
[?] Should Galerina use braces only, indentation only, or braces with optional formatting?
[?] Should functions be called flow, fn, function, or task?
[?] Should secure flow be a keyword or an annotation?
[?] Should Result and Option be built into the language or standard library?
[?] Should Decision be built in or standard library?
[?] Should rollback be available everywhere or only in secure flows?
[?] Should compute blocks be required for accelerator targeting?
[?] Decide the compiler implementation language after the runtime-first slice is clear.
[?] Should package management be built early or deferred?
[?] What syntax should Galerina use for explicit generic constraints or protocols?
[?] What shape-type syntax should vectors, matrices and tensors use?
```

---

## Backend Language Suggestion Tasks

```text
[ ] Define language edition metadata and compatibility diagnostics
[ ] Define compiler-facing Bool, Tri, Decision and Galerina syntax/report contracts
[ ] Specify algebraic variants, sealed state and exhaustive map requirements
[ ] Specify explicit generic constraints, traits or protocols
[ ] Specify structured concurrency, cancellation and typed streams
[ ] Specify deterministic cleanup for files, sockets, locks and FFI handles
[ ] Specify `let`, explicit `mut`, `readonly`, vault state, `secure` access and
    `Secret<T>` diagnostics; keep `const` deferred for v0.1; diagnose
    increment/decrement and assignment mutation without `mut`
[ ] Specify secure-by-default syntax diagnostics for deny-by-default
    permissions, explicit risky-action authority, request contracts, output
    targets, ownership checks, `view` exposure, secret-safe sinks, resource
    budgets, audit declarations, field-read rules and gated raw SQL
[ ] Specify security-invariant and policy-proof diagnostics for
    security-aware IR, mandatory classification, immutable execution plans, no
    ambient authority, hardened mode and proof/report output
[ ] Specify context-tagged verified execution cache diagnostics for verified
    plan reuse, cache tags, expiry, invalidation, specialist runtime caches and
    authority-neutral cache behaviour
[ ] Specify Package Resolver diagnostics for package/module identity,
    version/lockfile, hash/signature, registry, capabilities, effects,
    dependency conflicts, Governed IR linking and provenance reports
[ ] Specify Certified Package Registry diagnostics for publisher, signature,
    certification level, risk rating, security review status, capabilities,
    effects and lockfile evidence
[ ] Specify trust-conversion diagnostics for `safe`/`unsafe`, inert unsafe
    values, `validate`/`guard`/`sanitize`, safe-only `encode.*` and query
    interpolation denial
[ ] Specify built-in `Runtime.View` levels for public, internal, private,
    confidential, secret, restricted and regulated field exposure metadata
[ ] Specify standard view behaviour inheritance so permissions can reference
    built-in view rules, narrow them safely and report any explicit widening
[ ] Specify audit actor attribution rules so runtime context owns primary actor,
    request, route, flow, permission, capabilities, execution ID and result
    fields in audit events
[ ] Specify multi-actor audit metadata roles for affected, delegated, source,
    system and AI actors without allowing source code to override primary actor
    attribution
[/] Specify safe compile-time metadata and attributes, including a denial of
    runtime object inspection and behaviour mutation in normal Galerina code
[ ] Specify native ABI and foreign-call boundaries
[ ] Specify compiler-facing matrix/vector shape syntax and diagnostics
[ ] Specify AI-understandable architecture indexes for concepts, definitions,
    permissions, effects, contexts, package ownership and component metadata
[ ] Standardise diagnostics and AI report schemas
```

Package-boundary note:

```text
Tri / Galerina / Omni work should update packages-galerina/galerina-core-logic first.
Vector work should update packages-galerina/galerina-core-vector first.
Compute planning work should update packages-galerina/galerina-core-compute first.
AI inference work should update packages-galerina/galerina-ai first.
Low-bit AI backend work should update packages-galerina/galerina-ai-lowbit first.
Photonic vocabulary should update packages-galerina/galerina-core-photonic first.
Target backend work should update packages-galerina/galerina-target-native or
packages-galerina/galerina-target-cpu, packages-galerina/galerina-target-wasm, packages-galerina/galerina-target-gpu or
packages-galerina/galerina-target-photonic first.
CPU kernel work should update packages-galerina/galerina-cpu-kernels first.
Compiler pipeline work should update packages-galerina/galerina-core-compiler first.
Runtime execution work should update packages-galerina/galerina-core-runtime first.
Security primitive work should update packages-galerina/galerina-core-security first.
Config and report shape work should update packages-galerina/galerina-core-config or
packages-galerina/galerina-core-reports first.
galerina-core should be updated when syntax, compiler validation or report contracts
change.
```

## Moved to Package TODOs

These areas are intentionally tracked outside `galerina-core` first:

```text
Tri, Galerina, Decision and Omni semantics -> packages-galerina/galerina-core-logic/TODO.md
Vector values, lanes and operation semantics -> packages-galerina/galerina-core-vector/TODO.md
Compute planning and target selection -> packages-galerina/galerina-core-compute/TODO.md
AI inference contracts -> packages-galerina/galerina-ai/TODO.md
Low-bit AI backend -> packages-galerina/galerina-ai-lowbit/TODO.md
Photonic concepts and simulation helpers -> packages-galerina/galerina-core-photonic/TODO.md
CPU target planning -> packages-galerina/galerina-target-cpu/TODO.md
CPU kernel planning -> packages-galerina/galerina-cpu-kernels/TODO.md
Binary/native target output -> packages-galerina/galerina-target-native/TODO.md
WASM target output -> packages-galerina/galerina-target-wasm/TODO.md
GPU target output -> packages-galerina/galerina-target-gpu/TODO.md
Photonic target output -> packages-galerina/galerina-target-photonic/TODO.md
Compiler pipeline implementation -> packages-galerina/galerina-core-compiler/TODO.md
Runtime execution contracts -> packages-galerina/galerina-core-runtime/TODO.md
Security primitives and report contracts -> packages-galerina/galerina-core-security/TODO.md
Config loading contracts -> packages-galerina/galerina-core-config/TODO.md
Shared report schemas -> packages-galerina/galerina-core-reports/TODO.md
CLI command UX and dispatch -> packages-galerina/galerina-core-cli/TODO.md
Safe task automation -> packages-galerina/galerina-core-tasks/TODO.md
API transport -> packages-galerina/galerina-framework-api-server/TODO.md
Application boundary enforcement -> packages-galerina/galerina-framework-app-kernel/TODO.md
```

---

## Documentation Tasks

### Core Repository Documents

```text
[/] README.md
[x] ABOUT.md
[x] CONCEPT.md
[x] LICENCE.md
[x] REQUIREMENTS.md
[x] DESIGN.md
[ ] TASKS.md
[ ] TODO.md
[ ] ROADMAP.md
[ ] ARCHITECTURE.md
[ ] SECURITY.md
[ ] AI-INSTRUCTIONS.md
[ ] CHANGELOG.md
[ ] GETTING_STARTED.md
[ ] DEMO_hello_WORLD.md
[ ] NOTICE.md
[ ] CONTRIBUTING.md
[ ] CODE_OF_CONDUCT.md
[ ] GIT.md
[ ] COMPILED_APP_GIT.md
[ ] .env.example
[ ] .gitignore
```

---

## Additional Documentation Tasks

```text
[x] Create docs/language-rules.md
[x] Create docs/syntax.md
[x] Create docs/type-system.md
[x] Create docs/memory-safety.md
[x] Create docs/security-model.md
[x] Create docs/json-native-design.md
[x] Create docs/api-native-design.md
[x] Create docs/webhooks.md
[x] Create docs/concurrency.md
[x] Create docs/compute-blocks.md as language syntax and compiler contract reference
[x] Create docs/gpu-target.md as target declaration/report contract reference
[ ] Create docs/photonic-target.md as target declaration/report contract reference
[ ] Create docs/ternary-logic.md as syntax/report reference to galerina-core-logic
[ ] Create docs/source-maps.md
[ ] Create docs/compiler-reports.md
[ ] Create docs/ai-context.md
[ ] Create docs/deployment.md
[ ] Create docs/package-system.md
[x] Create docs/safe-pattern-matching-and-regex.md
[x] Create docs/sytax/README.md
[x] Create docs/sytax/patterns-and-regex.md
[x] Create docs/sytax-examples/README.md
[x] Create docs/sytax-examples/patterns-and-regex.md
[x] Create docs/browser-dom-and-web-platform-primitives.md
[x] Create docs/image-ai-package-boundaries-and-compute-auto.md
[x] Create docs/search-and-translation-provider-boundaries.md
[x] Create docs/video-package-boundaries-and-compute-auto.md
[ ] Define SafeHtml, DOM effect and browser permission schemas
[ ] Define push notification and service worker browser report schemas
[ ] Define browser map-manifest and AI guide summaries
[ ] Define image package effects and image policy schemas
[ ] Define image memory, security, target and precision report schemas
[ ] Define image package map-manifest and AI guide summaries
[ ] Define Pattern, UnsafeRegex and pattern_set parser support
[ ] Define pattern denied-feature diagnostics and compile-inside-loop warnings
[ ] Define pattern report and map-manifest schemas
[ ] Add docs/sytax and docs/sytax-examples files for existing syntax features
[ ] Define package-defined provider effects for search and translation packages
[ ] Define video package effects and runtime media permissions
[ ] Define search and translation provider report schemas
[ ] Define video privacy, memory and target-stage report schemas
[ ] Define provider redaction and rate-limit policy schemas
[ ] Create docs/examples.md
[x] Create docs/glossary.md
```

---

## Licence and Attribution Tasks

```text
[ ] Add official Apache-2.0 LICENSE file
[ ] Add LICENCE.md plain-English explanation
[ ] Add NOTICE.md attribution file
[ ] Add project copyright notice
[ ] Add contributor licence statement
[ ] Add licence section to README.md
[ ] Add third-party dependency licence tracking guidance
[ ] Add note that compiled Galerina apps can use their own licence
[ ] Add note that Galerina name/logo should not imply endorsement for forks
[ ] Consider adding TRADEMARKS.md later
```

---

## Git Documentation Tasks

Two Git documents are required.

### GIT.md

Purpose:

```text
Git workflow for the Galerina language/project repository itself.
```

Tasks:

```text
[ ] Explain main branch strategy
[ ] Explain feature branch naming
[ ] Explain commit message style
[ ] Explain pull request workflow
[ ] Explain issue labels
[ ] Explain release tags
[ ] Explain changelog updates
[ ] Explain versioning
[ ] Explain how to handle docs changes
[ ] Explain how to handle generated build files
[ ] Explain how to protect main branch
```

### COMPILED_APP_GIT.md

Purpose:

```text
Git and deployment guidance for applications built with Galerina.
```

Tasks:

```text
[ ] Explain what Galerina app source files should be committed
[ ] Explain what compiled files should normally not be committed
[ ] Explain when build artefacts may be committed
[ ] Explain how to store build manifests
[ ] Explain how to store deployment release records
[ ] Explain how to handle .env files
[ ] Explain how to handle .env.example
[ ] Explain how to handle source maps
[ ] Explain how to handle app.bin and app.wasm
[ ] Explain how to handle app.gpu.plan and app.photonic.plan
[ ] Explain CI/CD release tagging
[ ] Explain multi-server deployment from one artefact
```

---

## Language Design Tasks

```text
[x] Define core syntax style
[x] Define comments syntax
[x] Define strict comment syntax with `/// @tag value`
[x] Add strict comments to AI context and source-map reports
[x] Add prototype strict comment mismatch warnings
[x] Define imports syntax
[x] Define type declaration syntax
[x] Define enum syntax
[x] Define flow syntax
[x] Define secure flow syntax
[x] Define pure flow syntax
[x] Define effect declaration syntax
[x] Define Option syntax
[x] Define Result syntax
[x] Define Decision syntax
[x] Define Tri syntax
[x] Define map syntax (pattern matching)
[x] Define if syntax
[x] Define loop syntax
[x] Define wait until syntax
[x] Define rollback syntax
[x] Define checkpoint syntax
[x] Define compute block syntax
[x] Define API contract syntax
[x] Define webhook syntax
[x] Define client API syntax
[x] Define JSON policy syntax
[ ] Define package policy syntax
[x] Define permission syntax
```

---

## Type System Tasks

```text
[x] Define primitive types
[x] Define String type
[x] Define Int type
[x] Define Float type
[x] Define Decimal type
[x] Define Bool type
[x] Define Bytes type
[x] Define Array<T>
[x] Define Map<K, V>
[x] Define Option<T>
[x] Define Result<T, E>
[x] Define Decision syntax and compiler-facing contract
[x] Define Tri syntax and compiler-facing contract
[x] Define Json
[x] Define SecureString
[x] Define Money<Currency>
[x] Define Vector<N, T> syntax and compiler-facing contract
[x] Define Matrix<R, C, T> syntax and compiler-facing contract
[x] Define Tensor<Shape, T> syntax and compiler-facing contract
[x] Define Timestamp
[x] Define Duration
[x] Define type inference rules
[x] Define explicit conversion rules
[x] Define rejected implicit coercions
[x] Define exhaustive map checking
[x] Define compile-time shape checking
```

---

## Memory Safety Tasks

```text
[x] Define ownership model
[x] Define borrowing model
[x] Define mutability rules
[x] Define immutable-by-default behaviour
[x] Define safe reference rules
[x] Define collection bounds checking
[x] Define definite assignment checks
[x] Define data race prevention rules
[x] Define shared state rules
[x] Define unsafe code policy
[x] Define memory error reporting format
[x] Define SecureString memory behaviour
[x] Define runtime memory pressure block
[x] Define runtime spill allow/deny policy
[x] Define memory pressure ladder and cache bypass behaviour
[x] Define Strict Global Registry
[x] Define secret clearing expectations
```

---

## Security Tasks

```text
[x] Define security defaults
[x] Define security block syntax
[x] Define permission block syntax
[x] Define unsafe denied-by-default rule
[x] Define secret logging prevention
[x] Define SecureString rules
[x] Define package permission checks
[x] Define native binding restrictions
[x] Define file access permissions
[x] Define network access permissions
[x] Define environment access permissions
[x] Define audit logging approach
[x] Define security report schema
[x] Define security linter rules
[ ] Define threat model document
```

---

## JSON Tasks

```text
[x] Define Json type
[x] Define JsonObject type
[x] Define JsonArray type
[x] Define typed JSON decoding
[x] Define raw JSON access
[x] Define json.decode<T>
[x] Define json.pick<T>
[x] Define JSON path rules
[x] Define JSON schema generation
[x] Define OpenAPI schema output
[x] Define streaming JSON parsing
[x] Define JSON Lines support
[x] Define JSON redaction rules
[x] Define duplicate key handling
[x] Define null handling
[x] Define unknown field handling
[x] Define max depth policy
[x] Define max payload size policy
[x] Define canonical JSON output
[x] Define JSON transform syntax
```

---

## API and Webhook Tasks

```text
[x] Define api block syntax
[x] Define route syntax
[x] Define request type binding
[x] Define response type binding
[x] Define route params syntax
[x] Define query params syntax
[x] Define route error types
[x] Define handler compatibility checks
[x] Define OpenAPI output
[x] Define API report schema
[x] Define webhook block syntax
[x] Define webhook HMAC verification syntax
[x] Define replay protection syntax
[x] Define idempotency key syntax
[x] Define max body size syntax
[x] Define webhook timeout rules
[x] Define webhook retry behaviour
[x] Define API client syntax
[x] Define retry policy syntax
[x] Define circuit breaker syntax
[x] Define rate limiting syntax
```

---

## Concurrency Tasks

```text
[x] Define async task syntax
[x] Define await syntax
[x] Define parallel block syntax
[x] Define timeout behaviour
[x] Define cancellation behaviour
[x] Define channel syntax
[x] Define worker syntax
[x] Define worker pool count syntax
[x] Define backpressure options
[x] Define dead-letter queue syntax
[x] Define error handling in workers
[x] Define structured concurrency rules
[x] Define safe shared state rules
```

---

## Compute and Accelerator Tasks

```text
[x] Define compute block syntax
[x] Define compute target best
[x] Define prefer target syntax
[x] Define fallback target syntax
[x] Define CPU target syntax/report contract
[x] Define WASM target syntax/report contract
[x] Define GPU plan target syntax/report contract
[x] Define photonic plan target syntax/report contract
[x] Define ternary simulation target syntax/report contract
[x] Define unsupported operation errors
[x] Define compute purity requirements
[ ] Define compute auto parser support
[ ] Define backend compute target catalogue parser support
[ ] Define AI accelerator target syntax/report contract
[ ] Define memory/interconnect target syntax/report contract
[ ] Define photonic variant target discovery report contract
[ ] Define CPU/GPU/AI/photonic capability map report contract
[ ] Define data movement cost reporting contract
[ ] Define target calibration and health reporting contract
[ ] Define precision/tolerance report contract for backend compute targets
[x] Define matrix operation syntax/report contract
[x] Define vector operation syntax/report contract
[x] Define tensor operation syntax/report contract
[ ] Define ONNX support possibility
[x] Define accelerator report schema contract
[ ] Expand accelerator report schema contract for backend compute support targets
```

---

## Compiler Architecture Tasks

```text
[ ] Choose compiler implementation language
[ ] Define compiler package structure
[x] Define lexer
[ ] Define parser
[ ] Define AST
[ ] Define symbol table
[x] Define type checker
[ ] Define security checker
[ ] Define memory checker
[ ] Define JSON/API contract checker
[ ] Define effect checker
[ ] Define IR
[ ] Define optimiser
[ ] Define linker
[ ] Define target emitters
[ ] Define report generator
[ ] Define source-map generator
[x] Define AI context generator
```

---

## Build Pipeline Tasks

```text
[ ] Define build stages
[ ] Define debug build mode
[ ] Define release build mode
[ ] Define deterministic build rules
[ ] Define source hash generation
[x] Define output hash generation
[x] Define build manifest schema
[x] Define map manifest schema
[x] Define docs manifest schema
[x] Generate map manifest
[x] Generate API, webhook, type, security, deployment and AI docs
[x] Generate AI guide after successful build
[x] Generate runtime report and runtime guide
[x] Generate memory report and memory pressure guide
[x] Generate global report and global registry guide
[ ] Define failure report schema
[ ] Define target report schema
[ ] Define security report schema
[ ] Define API report schema
[x] Define AI context schema
[ ] Define source-map schema
[ ] Define build folder layout
```

---

## CLI Tasks

```text
[ ] Define Galerina init
[x] Define Galerina run
[x] Define Galerina serve --dev planning report
[ ] Define Galerina build
[ ] Define Galerina check
[x] Define Galerina test
[x] Define Galerina fmt
[ ] Define Galerina lint
[ ] Define Galerina explain
[ ] Define Galerina explain --for-ai
[x] Define Galerina verify
[x] Define Galerina targets
[x] Define Galerina ai-context
[x] Define Galerina schema
[ ] Define CLI help output
[ ] Define CLI error format
```

---

## AI-Friendly Tooling Tasks

```text
[ ] Define AI-INSTRUCTIONS.md
[x] Define Galerina ai-context output
[x] Define Galerina explain --for-ai output
[x] Define app.ai-context.json schema
[x] Define app.ai-context.md format
[x] Define AI-safe compiler summaries
[x] Define machine-readable error reports
[x] Define changed-files summary
[x] Define route/type summary
[x] Define target compatibility summary
[ ] Define token-efficient project summaries
[ ] Define AI assistant rules for generated code
```

---

## Source Map Tasks

```text
[ ] Define source-map JSON schema
[ ] Map generated output to original .spore files
[ ] Track original line numbers
[ ] Track original columns
[ ] Track flow/function names
[ ] Track build stage
[ ] Track target output
[ ] Support debug source maps
[ ] Support release source maps
[ ] Support external source-map storage
[ ] Add source-map lookup to Galerina explain
[ ] Add source-map lookup to Galerina explain --for-ai
```

---

## Deployment Tasks

```text
[ ] Define build-once deploy-many model
[ ] Define environment variable rules
[ ] Define .env.example format
[ ] Define secrets manager guidance
[x] Define build manifest verification
[x] Define release artefact verification
[ ] Define multi-server deployment guidance
[ ] Define health check guidance
[ ] Define rollback guidance
[ ] Define source-map handling in production
[ ] Define compiled app Git guidance
```

---

## Testing Tasks

```text
[ ] Define unit test syntax
[ ] Define integration test syntax
[ ] Define API test syntax
[ ] Define webhook test syntax
[ ] Define JSON validation tests
[x] Define target compatibility tests
[ ] Define security tests
[ ] Define memory-safety tests
[ ] Define compiler tests
[ ] Define source-map tests
[ ] Define AI report tests
[ ] Define golden file tests for compiler output
```

---

## Example Tasks

```text
[x] Create hello world example
[x] Create strict type example
[x] Create Option example
[x] Create Result example
[x] Create Decision example
[x] Create JSON decode example
[x] Create API route example
[x] Create webhook example
[x] Create parallel API call example
[x] Create worker/channel example
[x] Create rollback example
[x] Create compute block example
[x] Create GPU plan example
[x] Create photonic plan example
[x] Create ternary simulation example
[x] Create source-map error example
[x] Create AI context example
```

---

## Version 0.1 Tasks

Version 0.1 should prove the concept, not build the full language.

```text
[ ] Finalise README.md
[ ] Finalise ABOUT.md
[ ] Finalise CONCEPT.md
[ ] Finalise LICENCE.md
[ ] Finalise REQUIREMENTS.md
[ ] Finalise DESIGN.md
[ ] Finalise ARCHITECTURE.md
[ ] Finalise SECURITY.md
[ ] Finalise AI-INSTRUCTIONS.md
[ ] Finalise GETTING_STARTED.md
[ ] Finalise DEMO_hello_WORLD.md
[ ] Finalise GIT.md
[ ] Finalise COMPILED_APP_GIT.md
[x] Define grammar draft
[x] Define AST draft
[x] Define parser prototype scope
[x] Define interpreter prototype scope
[x] Define report schemas
[x] Create example .spore files
```

---

## Version 0.2 Tasks

Version 0.2 should start validating syntax and simple execution.

```text
[x] Build lexer prototype
[x] Build parser prototype
[x] Build AST model
[x] Parse hello world
[ ] Parse flow definitions
[ ] Parse type definitions
[ ] Parse enum definitions
[ ] Parse map expressions (pattern matching)
[ ] Parse Result and Option examples
[ ] Parse JSON decode examples
[x] Generate basic AST JSON output
[x] Generate simple error reports
[x] Generate source-map prototype
[x] Add basic formatter prototype
```

---

## Version 0.3 Tasks

Version 0.3 should add safety checks.

```text
[x] Add strict type checker prototype
[x] Add exhaustive map check
[x] Add no-undefined check
[x] Add no-silent-null check
[x] Add truthy/falsy rejection
[ ] Add explicit conversion checks
[x] Add simple Result handling checks
[x] Add simple Option handling checks
[ ] Add security report output
[x] Add failure report output
```

---

## Version 0.4 Tasks

Version 0.4 should add API and JSON concepts.

```text
[x] Parse api blocks
[x] Parse webhook blocks
[x] Parse JSON policies
[ ] Validate route handlers
[x] Generate JSON schema draft
[x] Generate OpenAPI draft
[x] Generate API report
[x] Generate webhook security warnings
[ ] Add idempotency key checks
[ ] Add HMAC config checks
```

---

## Version 0.5 Tasks

Version 0.5 should add target planning.

```text
[x] Parse compute blocks
[x] Validate compute purity
[x] Generate CPU compatibility report
[x] Generate GPU plan report
[x] Generate photonic plan report
[x] Generate ternary simulation report
[x] Add unsupported operation errors
[x] Add fallback report output
[x] Add Galerina targets command
```

---

## Blockers

Known blockers:

```text
[!] Real photonic backend requires hardware access or vendor SDK
[!] Real GPU backend requires backend choice
[!] Native binary compiler requires backend decision
[!] Full memory model requires deep compiler design
[!] Package manager should wait until core language rules stabilise
```

---

## Suggested Immediate Next Tasks

Recommended next work:

```text
[ ] Finish documentation bundle
[ ] Decide boot.spore vs main.spore default
[ ] Draft grammar outline
[ ] Draft example boot.spore
[ ] Draft example hello.spore
[ ] Draft parser architecture
[ ] Draft source-map schema
[x] Draft AI context schema
[ ] Draft API report schema
[ ] Draft target report schema
```

---

## Final Task Principle

Every task should support one of these goals:

```text
make Galerina safer
make Galerina clearer
make Galerina easier to debug
make Galerina better for JSON/API systems
make Galerina easier for AI tools to understand
make Galerina ready for multi-target compilation
make Galerina useful before future hardware arrives
```
