# Changelog

All notable changes to **Galerina / Galerina** will be documented in this file.

Galerina is currently in the concept, documentation and v0.1 prototype stage.

This changelog should track major decisions, design changes, documentation updates, prototype milestones and future releases.

---

## Unreleased

- Added `docs/certified-package-registry.md` to define governed package
  publication, signatures, versioning, capability/effect declarations,
  certification levels, lockfile evidence and policy-rated package use.
- Added `docs/package-resolver.md` to define governed package/module
  resolution, verification, capability/effect checks, Governed IR linking,
  dynamic-loading gates and provenance reporting.
- Added `docs/context-tagged-verified-execution-cache.md` to define
  context-tagged verified plan reuse, specialist runtime caches, invalidation
  tags and authority-neutral cache behavior.
- Added `docs/ai-understandable-architecture-policy.md` to define stable
  architecture maps, machine-readable concept indexes, component metadata and
  canonical documentation rules for AI-readable architecture.
- Added `docs/security-invariants-and-policy-proof.md` to define
  security-aware IR, immutable execution plans, no ambient authority,
  hardened profiles and compiler/report policy-proof targets.
- Added `docs/trust-conversion-and-data-safety.md` to define `safe`/`unsafe`
  trust states, inert unsafe values, approved trust conversion,
  safe-only contextual encoding and query interpolation denial.
- Added `docs/language-core-maturity-roadmap.md` to document missing Galerina
  language-core maturity work.

---

## Changelog Format

This project should foLOw a simple changelog format:

```text
## [Version] - YYYY-MM-DD

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
### Notes
```

Recommended categories:

| Category | Purpose |
|---|---|
| `Added` | New features, files, syntax ideas or documents |
| `Changed` | Updates to existing design or documentation |
| `Deprecated` | Ideas that are still mentioned but should not be used |
| `Removed` | Ideas or files that have been removed |
| `Fixed` | Corrections, typo fixes or clarified rules |
| `Security` | Security-related changes |
| `Notes` | General project notes |

---

## Versioning

Galerina should use semantic versioning once implementation starts.

Format:

```text
MAJOR.MINOR.PATCH
```

Example:

```text
0.1.0
```

During the concept stage, versions may represent documentation and design milestones rather than production software.

Example:

```text
0.1.0 = concept documentation
0.2.0 = parser prototype
0.3.0 = type checker prototype
0.4.0 = JSON/API prototype
0.5.0 = target planning prototype
```

---

## [Unreleased]

### Added

- Added language positioning guidance covering Galerina differentiators and
  missing production-readiness work.
- Added `docs/structured-await.md` plus matching `docs/sytax/` and
  `docs/sytax-examples/` entries for Galerina Structured Await: `await`, `await all`,
  `await race`, `await stream`, queue handoff, mandatory timeout policy,
  cancellation modes, scoped tasks and async reports.
- Added `docs/storage-aware-performance.md` for conservative storage-aware
  performance planning, including careful SSD/NVMe/M.2 wording, unknown-storage
  fallback, bounded cache rules, streaming large files and build/IDE index
  report direction.

```text
- Added explicit backend runtime capability guidance to docs/backend-runtime-capability-roadmap.md.
- Added backend evolution requirements for editions, compatibility, variants, constraints, concurrency, cleanup, metadata, FFI, shape types and diagnostics.
- Added Secure App Kernel boundary guidance to AI instructions.
- Added checked Run Mode support for simple `console.log("...")` output.
- Added parser support for explicit `async flow` declarations.
- Added SPEC.md as the root entry point for Galerina specification planning.
- Added GOVERNANCE.md for early project governance and change process.
- Added COMPATIBILITY.md for repository-root, runtime, logic, output and documentation compatibility rules.
- Added OMNI_LOGIC.md as the root Omni-logic compatibility entry point.
- Added docs/omni-logic.md, docs/logic-widths.md and docs/logic-targets.md for future-compatible logic-width planning.
- Added docs/ransomware-resistant-design.md for ransomware-resistant security policy planning.
- Added docs/simple-vector-and-compute-auto.md for beginner-friendly vector syntax and compute auto target planning.
- Added docs/backend-compute-support-targets.md for CPU, GPU, AI accelerator, photonic and memory/interconnect backend target planning.
- Refactored docs/backend-compute-support-targets.md around vendor-neutral compute planning, target plugins, deployment profiles, precision/fallback reports and runtime capability maps.
- Added docs/sytax/backend-compute-targets.md and docs/sytax-examples/backend-compute-targets.md for compute target planning syntax and diagnostics.
- Added docs/search-and-translation-provider-boundaries.md to classify search, translation, vector search, image search and embeddings as package/provider areas rather than Galerina core features.
- Added docs/video-package-boundaries-and-compute-auto.md to classify video processing, video AI, camera/screen capture and video search as package/runtime/provider areas rather than Galerina core features.
- Added docs/memory-error-correction.md for memory detection, recovery, rollback, fallback and structured report planning.
- Added docs/warnings-and-diagnostics.md, docs/system-health-warnings.md, docs/disk-memory-and-cache-warnings.md and docs/error-codes.md for standard diagnostic planning.
- Added docs/security-risk-feature-ranking.md for feature-by-feature security risk ranking, memory failsafes and fail-closed defaults.
- Added docs/contracts.md, docs/modules-and-visibility.md, docs/standard-library.md, docs/testing.md, docs/observability.md and docs/compiler-backends.md.
- Added docs/package-use-registry.md for `import` versus `use`, package approval, package permissions and package reports.
- Added docs/language-supported-primitives.md and docs/language-non-supported-primitives.md for supported primitive and native non-support boundaries.
- Added docs/legacy-and-compatibility-boundaries.md for deprecated ideas, rejected legacy behaviours and explicit ecosystem compatibility boundaries.
- Added docs/dart-flutter-target.md plus matching docs/sytax/ and docs/sytax-examples/ entries for layered Dart/Flutter target support, explicit async flows and Bytes/Uint8List interop boundaries.
- Expanded Dart/Flutter target planning with support levels for Dart logic packages, Flutter package/plugin output, platform-channel contracts, Pigeon-style typed APIs, Flutter FFI/native libraries, permission reports, source maps and deferred widget syntax.
- Added docs/react-native-target.md and updated framework target planning so React Native is supported as generated mobile adapter/package interop, not Galerina Core UI syntax.
- Added `packages-galerina/galerina-framework-api-server/` positioning across Galerina core docs as the built-in HTTP API server that delegates to the Secure App Kernel.
- Added `docs/package-boundaries.md` and cross-references from Galerina core docs to
  sibling packages: `galerina-core-logic`, `galerina-core-vector`, `galerina-core-compute`, `galerina-core-photonic`,
  `galerina-target-native`, `galerina-target-photonic`, `galerina-framework-app-kernel`, `galerina-framework-api-server`,
  `galerina-core-cli` and `galerina-core-tasks`.
- Added Galerina core package-boundary references for `galerina-ai`, `galerina-ai-lowbit`,
  `galerina-target-cpu` and `galerina-cpu-kernels` so AI inference and CPU fallback stay
  outside `galerina-core`.
- Clarified `TASKS.md` and `TODO.md` so `galerina-core` tracks syntax, compiler
  validation and report contracts while package-specific semantics are handled
  by sibling package TODOs.
- Added `docs/concurrency.md` as the Galerina core structured concurrency syntax,
  compiler-check and report-contract reference.
- Added `docs/compute-blocks.md` as the Galerina core compute block syntax,
  compiler-check and report-contract reference.
- Added `docs/gpu-target.md` as the Galerina core GPU target declaration and report
  contract reference.
- Added docs/javascript-typescript-framework-targets.md plus matching docs/sytax/ and docs/sytax-examples/ entries for JavaScript, TypeScript, Node, WASM, worker and React/Angular adapter target planning.
- Added docs/device-capability-boundaries.md plus matching docs/sytax/ and docs/sytax-examples/ entries for phone/device capability boundaries, permissions, streams, buffers, compute targets, FFI and reports.
- Added docs/text-ai-package-boundaries-and-compute-auto.md plus matching docs/sytax/ and docs/sytax-examples/ entries for text AI package/provider boundaries, token policy, prompt safety, redaction, generated text safety and compute-auto reporting.
- Added docs/auth-token-verification-boundaries.md plus matching docs/sytax/ and docs/sytax-examples/ entries for JWT, bearer token, OAuth, DPoP, mTLS, request proof, capability token, hardware proof and post-quantum crypto policy boundaries.
- Added docs/api-data-security-and-load-control.md plus matching docs/sytax/ and docs/sytax-examples/ entries for typed API body policies, content-type validation, rate limits, memory budgets, streaming bodies, queue handoff, backpressure and load-control reports.
- Added docs/api-duplicate-detection-and-idempotency.md plus matching docs/sytax/ and docs/sytax-examples/ entries for duplicate route checks, duplicate schema warnings, API manifests, idempotency declarations, webhook duplicate protection and duplicate outbound API warnings.
- Added docs/api-native-design.md, docs/webhooks.md, docs/pure-flow-caching.md, docs/interoperability.md, docs/xml-support.md and docs/graphql-support.md.
- Added docs/browser-dom-and-web-platform-primitives.md for SafeHtml, DOM effects, browser permissions, fetch/storage/cookie policy, push notifications, service workers and browser reports.
- Added docs/image-ai-package-boundaries-and-compute-auto.md to classify image AI, vision models, image generation, image search, decoders and compute-auto image workflows as package/provider areas rather than Galerina core features.
- Added docs/safe-pattern-matching-and-regex.md for ReDoS-resistant Pattern defaults, UnsafeRegex audit gates, pattern sets, streaming scans and pattern reports.
- Added docs/sytax/README.md and docs/sytax/patterns-and-regex.md to start one-file-per-feature syntax documentation.
- Added docs/sytax-examples/README.md and docs/sytax-examples/patterns-and-regex.md to start one-file-per-feature good/bad syntax usage examples.
- Added docs/generated-output-and-runtime-ergonomics.md to summarise generated build outputs.
- Added docs/pending-additions.md to track pending Galerina concepts, current status and remaining implementation work.
- Added docs/pending-galerina-additions.md as a planning snapshot of core pending Galerina additions.
- Added docs/primary-lane-and-offload-nodes.md for bounded CPU offload away from the main execution lane.
- Added docs/frontend-compilation-js-wasm.md for browser JavaScript, WebAssembly and hybrid frontend target planning.
- Added docs/vector-model.md for the hybrid scalar-first, vector-aware execution model.
- Added docs/vectorised-dataset-syntax.md for `vectorize rows`, vector-preferred flows and vector-required flows.
- Added docs/hybrid-logic-and-wavelength-compute.md for hybrid binary/vector/GPU/ternary/photonic/wavelength compute planning.
- Added docs/hardware-feature-detection-and-security.md for modern CPU/GPU acceleration, hardware-assisted security and capability reporting direction.
- Added docs/kernel-and-driver-boundary.md to mark kernel and driver development as last-stage, blocked by default and permission-gated.
- Added docs/target-and-capability-model.md to define target types, aLOwed imports, capabilities, fallback and v0.1 target-check milestones.
- Added docs/feature-status.md and defined standard Implemented, Prototype, Draft, Planned, Research and Blocked labels.
- Defined draft `target browser` syntax and `capabilities` block syntax for browser/server security boundaries.
- Added docs/security-first-build-system.md to define `Galerina build` as a check, test, report, suggest and compile pipeline.
- Added docs/startup-validation.md to define project validation before `main()` runs.
- Added docs/debug-console.md for source-mapped, redacted and production-restricted console debugging.
- Added docs/memory-safety-and-developer-experience.md to capture graph
  ownership, draft/secure modes, trusted modules, interop and
  safety-without-friction design lessons.
- Added docs/lazy-compact-json.md with Lazy Compact JSON, repeated node shape detection and dataset-style JSON compaction policy.
- Added docs/memory-and-variable-use.md with local lifetime, read-only borrowing, explicit clone and copy-on-write memory rules.
- Added copied docs/ versions of existing root technical documents so docs/ can act as the detailed language design area.
- Added schemas/diagnostic.schema.json for standard Galerina diagnostic fields and code format.
- Added standard diagnostic codes, levels, categories, recovery actions, timestamps and structured source fields to compiler diagnostics.
- Added diagnostic summaries to build manifests.
- Added initial `logic width` and `logic mode` parsing with target compatibility diagnostics.
- Added `app.omni-logic.sim` as an Omni-logic simulation planning output.
- Added optional `omni` target parsing and target report support.
- Added target report logic capability summaries with native and simulated logic-width support.
- Added memory correction features and example memory integrity/fatal diagnostics to memory reports.
- Added prototype memory-variable diagnostics for explicit `Json.clone()` and mutation through read-only `&Json` parameters.
- Added planned generated outputs in Run Mode and Dev Mode.
- Added planned unified `Galerina dev` command and optional watch mode.
- Added prototype `Galerina generate`, `Galerina dev` and `Galerina run --generate` development-output commands.
- Added prototype browser target import blocking for server-only imports, with parsed `target browser`, `import` and `capabilities` syntax.
- Added examples/browser-form.spore and prototype `app.browser.js` placeholder output when a browser target is declared.
- Added v0.1 prototype CLI in compiler/galerina.js.
- Added source-mapped lexer prototype in compiler/lexer.js and `Galerina tokens`.
- Added basic formatter prototype in compiler/formatter.js and `Galerina fmt`.
- Added `Galerina test` prototype smoke tests for hello, boot, formatter and target diagnostics.
- Added strict type checker prototype for declared types, generic arity and exhaustive match branches.
- Added JSON Schema generator, `Galerina schema`, `Galerina openapi` and `app.schemas.json`.
- Added `Galerina verify`, build output hashes and build-manifest schema.
- Added `app.map-manifest.json`, generated docs under `build/docs` and docs-manifest verification.
- Added `app.ai-guide.md` generation on successful builds, with hashes recorded in the build manifest.
- Added runtime memory/spill configuration, `app.runtime-report.json` and generated runtime guide output.
- Added memory pressure report, memory pressure guide and documented cache-bypass/disk-spill safety ladder.
- Added checked Run Mode, development Serve Mode planning, execution report and run/compile mode guide.
- Added Strict Global Registry parsing, global report, generated registry guide and secret redaction checks.
- Documented the build explanation principles for compile-to-explain, successful-build AI guide accuracy and generated explanation.
- Expanded target planning reports with fallback coverage, unsupported operation summaries and source-map entries.
- Expanded `Galerina ai-context` with source, changed-file, route/type/flow, target and security summaries.
- Added `verify cpu_reference` compute syntax, precision reports and accelerator risk tracking.
- Added strict comment extraction for `/// @tag value`, including AI-context/source-map reporting and mismatch diagnostics.
- Added app.tokens.json output and tokens.schema.json.
- Added package.json scripts for check, build, AST, target and AI context output.
- Added grammar/galerina.ebnf as the first parser grammar draft.
- Added JSON schema drafts for AST, compiler reports, source maps and AI context.
- Added runnable .spore examples for strict types, Option, Result, Decision, JSON, API, webhooks, workers, rollback and compute targets.
- Added CPU-compatible build output placeholders plus GPU, photonic and ternary planning artefacts.
- Added instruction-architecture.md to define CPU baseline and photonic planning compatibility.
- Added Galerina / Galerina as the project name.
- Added `.spore` as the official source file extension.
- Added `boot.spore` as the recommended project entry file.
- Added normal CPU binary output as the primary practical target.
- Added WebAssembly output as a portability target.
- Added GPU planning as a first-class accelerator target.
- Added photonic planning as a future accelerator target.
- Added ternary / 3-way simulation as a target concept.
- Added JSON-native language design.
- Added API-native language design.
- Added webhook-first security model.
- Added strict type system requirement.
- Added memory-safety requirement.
- Added security-first defaults.
- Added explicit `Option<T>` missing-value handling.
- Added explicit `Result<T, Error>` error handling.
- Added `Decision` type concept for Allow / Deny / Review.
- Added `Tri` concept for mathematical 3-way logic.
- Added rollback and checkpoint concepts.
- Added `wait until` condition-based waiting concept.
- Added structured concurrency concepts.
- Added channels and worker pool concepts.
- Added compute block concept for accelerator-suitable work.
- Added source-map requirement for compiled outputs.
- Added AI-readable compiler report concept.
- Added `Galerina ai-context` concept.
- Added `Galerina explain --for-ai` concept.
- Added build-once, deploy-many deployment concept.
- Added `.env` outside compiled output rule.
- Added Apache License 2.0 direction.
- Added Git documentation requirement for the Galerina project.
- Added compiled app Git documentation requirement.
```

### Changed

```text
- Clarified that Galerina starts with ternary support but should remain future-compatible with wider multi-state logic systems.
- Clarified that compiler, runtime, schemas and documentation should use logic-width terminology where behaviour is not ternary-only.
- Clarified that Galerina diagnostics should use predictable warning, error and fatal code formats.
- Clarified that generated explanation does not require production compilation.
- Clarified that production artefacts require Compile Mode.
- Clarified why Galerina uses `flow` instead of `function`, `def` or `fn`.
- Clarified README prototype status, implemented command coverage and generated-output locations.
- Updated GETTING_STARTED.md from planned-only guidance to the current v0.1 prototype workflow.
- Updated docs/README.md with the runnable prototype entry points and generated documentation outputs.
- Updated docs/run-and-compile-modes.md with current prototype build commands and report output lists.
- Updated docs/pending-galerina-additions.md as a current planning snapshot with prototype status and recent package, vector and wavelength concepts.
- Refactored search and translation wording so Galerina provides safe package/provider boundaries instead of native search, translation, vector search, image search or provider SDK features.
- Refactored video wording so Galerina provides safe file, stream, effect, privacy, memory and compute boundaries instead of native video processing, codec, AI, camera or streaming features.
- Clarified roadmap and README wording so larger application support means package/convention support, not Galerina becoming an MVC or web framework.
- Clarified that direct Flutter UI/component syntax is a later-stage research layer, not the first Flutter support target.
- Clarified that React, Angular, Node, Express/Fastify and similar ecosystems should be supported through generated outputs and adapters, not by baking framework syntax into Galerina core.
- Clarified that camera, microphone, Bluetooth, GPS, notifications, media players, phone radios and mobile UI belong in packages/platform bindings/frameworks, not Galerina core.
- Clarified that text summarisation, generation, embeddings, moderation, translation, document AI and NLP tasks belong in packages/providers/frameworks, not Galerina core.
- Clarified that JWT, OAuth, bearer tokens, DPoP and mTLS should be safer typed verification workflows around established standards, not an Galerina identity provider or new cryptography system.
- Clarified that API data security and load control are language/toolchain policy and report concerns, while HTTP servers, web frameworks, load balancers, API gateways, queue backends and rate-limit stores remain outside Galerina core.
- Clarified that API duplicate detection and idempotency are compiler/toolchain safety checks and metadata, while actual routing and idempotency storage remain framework/package territory.
- Added a documentation rule that syntax changes should update the per-feature files under docs/sytax/.
- Added a documentation rule that syntax examples should be updated under docs/sytax-examples/ alongside docs/sytax/.
- Corrected compiler and examples README command paths for running from the repository root.
- Reduced repeated README prototype status content by keeping the top status section authoritative.
- Added README repository-root structure showing source directories and generated output directories.
- Updated README licence notice to reference the existing Apache-2.0 `LICENSE`, `LICENCE.md` and `NOTICE.md` files.
- Added README JSON-native examples for partial extraction, views, redaction, streaming and Lazy Compact JSON.
- Added README API-native examples for route contracts, typed handlers and schema/OpenAPI prototype commands.
- Added README webhook example details for typed events, verification order, idempotency and generated reports.
- Changed diagnostic console output to include Galerina diagnostic code and recovery action.
- Changed source file extension from the early `.language` idea to `.spore`.
- Changed project entry concept from `main.language` to `boot.spore` / `main.spore`.
- Changed photonic support from direct required hardware support to planning and validation first.
- Changed ternary support from general replacement for booleans to specific 3-way logic and decision modelling.
- Changed AI support from vague AI-friendliness to explicit AI context and AI explanation files.
- Changed JSON support from normal library feature to first-class language concern.
- Changed API/webhook support from framework-level idea to language/compiler-level concern.
```

### Deprecated

```text
- Deprecated `.language` as a source file extension.
- Deprecated `main.language` as a project registry file.
- Deprecated JavaScript-style `undefined`.
- Deprecated silent null behaviour.
- Deprecated loose truthy/falsy checks.
- Deprecated implicit type coercion.
- Deprecated the idea that Galerina requires photonic hardware to be useful.
```

### Removed

```text
- Removed early suggestion that imports should use names like `import 3way`.
- Removed early `.language` naming from current examples.
```

### Security

```text
- Added rule that real secrets must not be compiled into output files.
- Added `SecureString` concept.
- Added secret redaction requirement for logs and AI context files.
- Added webhook HMAC verification concept.
- Added replay protection requirement for webhooks.
- Added idempotency key requirement for webhooks.
- Added bearer-token, JWT, OAuth, DPoP, mTLS, request-proof and capability-token verification boundary planning.
- Added rule that Galerina must not invent new cryptography and should instead wrap proven cryptography in typed verification workflows and reports.
- Added experimental framing for hardware proof such as photonic PUFs and policy-only framing for post-quantum/hybrid crypto options.
- Added API input safety planning for strict request decoding, unknown-field denial, unsafe coercion denial, request-scoped memory, trusted proxy checks, rate limits, concurrency limits, backpressure and overload rejection.
- Added API duplicate/idempotency safety planning for duplicate route detection, duplicate type warnings, idempotency reports, webhook replay protection, duplicate external client warnings and effect-based idempotency recommendations.
- Added package permission concept.
- Added effect system concept.
- Added unsafe denied-by-default requirement.
```

### Notes

```text
- Galerina is currently a concept and documentation project.
- No production compiler exists yet.
- No real GPU or photonic backend exists yet.
- Early GPU and photonic support should be represented as plan/report outputs.
- CPU compatibility should remain essential.
```

---

## [0.1.0] - Planned

### Goal

Version `0.1.0` should establish the full concept documentation bundle.

### Planned Added

```text
- README.md
- ABOUT.md
- CONCEPT.md
- LICENSE
- LICENCE.md
- NOTICE.md
- REQUIREMENTS.md
- DESIGN.md
- TASKS.md
- TODO.md
- ROADMAP.md
- ARCHITECTURE.md
- SECURITY.md
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- AI-INSTRUCTIONS.md
- CHANGELOG.md
- GETTING_STARTED.md
- DEMO_hello_WORLD.md
- GIT.md
- COMPILED_APP_GIT.md
- .env.example
- .gitignore
- docs/
```

### Planned Documentation

```text
- Language concept
- Project purpose
- Requirements
- Design direction
- Architecture
- Security model
- AI assistant instructions
- Build outputs
- Source maps
- JSON/API model
- Webhook model
- Git workflow
- Compiled app Git workflow
```

### Planned Examples

```text
- hello world example
- boot.spore example
- strict type example
- Option example
- Result example
- Decision example
- JSON decode example
- API contract example
- Webhook example
- compute block example
```

---

## [0.2.0] - Planned

### Goal

Version `0.2.0` should introduce the first parser prototype.

### Planned Added

```text
- Lexer prototype
- Parser prototype
- AST output
- Basic `.spore` syntax parsing
- Source file and line tracking
- Basic syntax error reporting
```

### Planned Supported Syntax

```text
- boot.spore
- flow definitions
- secure flow definitions
- type definitions
- enum definitions
- let bindings
- mut bindings
- match expressions (pattern matching)
- simple imports
```

### Planned Outputs

```text
- AST JSON output
- basic failure report
- basic source-map prototype
```

---

## [0.3.0] - Planned

### Goal

Version `0.3.0` should introduce early safety checks.

### Planned Added

```text
- Strict type checker prototype
- no-undefined checks
- no-silent-null checks
- no-truthy/falsy checks
- basic Option handling checks
- basic Result handling checks
- exhaustive match checking
```

### Planned Reports

```text
- app.failure-report.json
- app.security-report.json
- app.source-map.json
```

---

## [0.4.0] - Planned

### Goal

Version `0.4.0` should introduce JSON and API concepts.

### Planned Added

```text
- JSON decode syntax
- raw Json type concept
- typed JSON decode checking
- API block parsing
- webhook block parsing
- JSON policy parsing
- OpenAPI output draft
- JSON schema output draft
```

### Planned Reports

```text
- app.api-report.json
- app.openapi.json
- JSON schema output
```

---

## [0.5.0] - Planned

### Goal

Version `0.5.0` should introduce target planning.

### Planned Added

```text
- compute block parsing
- CPU compatibility checks
- GPU plan output
- photonic plan output
- ternary simulation output
- target fallback reporting
- unsupported compute operation errors
```

### Planned Outputs

```text
- app.gpu.plan
- app.photonic.plan
- app.ternary.sim
- app.target-report.json
```

---

## [0.6.0] - Planned

### Goal

Version `0.6.0` should introduce AI-friendly tooling.

### Planned Added

```text
- Galerina ai-context
- app.ai-context.json
- app.ai-context.md
- Galerina explain --for-ai
- compact compiler error summaries
- source-map-powered explanations
```

### Planned AI Report Fields

```text
project
entry file
source files
routes
webhooks
types
permissions
targets
errors
suggested fixes
next actions
```

---

## [0.7.0] - Planned

### Goal

Version `0.7.0` should improve developer tooling.

### Planned Added

```text
- Galerina fmt
- Galerina lint
- CLI help output
- basic VS Code syntax highlighting
- example snippets
```

### Planned Linter Checks

```text
- non-exhaustive match
- webhook missing idempotency
- API route missing timeout
- JSON endpoint missing max body size
- compute block contains unsupported operation
- SecureString logged unsafely
```

---

## [1.0.0] - Future

### Goal

Version `1.0.0` should be the first stable Galerina language specification and implementation milestone.

### Possible Requirements

```text
- Stable core syntax
- Stable `.spore` file format
- Stable boot.spore structure
- Stable type system
- Stable JSON/API model
- Stable source-map format
- Stable compiler report formats
- Working parser
- Working interpreter or compiler
- Working formatter
- Working linter
- Working example projects
```

### Not Required for 1.0.0

```text
- Real photonic hardware backend
- Full production GPU backend
- Complete package manager
- Full MVC framework
- Formal verification
```

---

## Changelog Maintenance Rules

When making changes, update this file if the change affects:

```text
language syntax
project structure
compiler architecture
security rules
target outputs
file naming
licence model
AI tooling
JSON/API design
deployment model
```

Do not update the changelog for every tiny wording correction unless the correction changes meaning.

---

## Commit and Release Notes

Each release should include:

```text
version number
release date
summary
added items
changed items
security notes
breaking changes
migration notes if needed
```

Example release tag:

```text
v0.1.0
```

Example release title:

```text
Galerina v0.1.0 - Concept Documentation
```

---

## Breaking Change Policy

A breaking change should be recorded clearly.

Examples:

```text
changing file extension
changing entry file name
changing syntax
removing a type
renaming compiler output files
changing build report schemas
changing security defaults
```

Breaking changes should include migration notes.

---

## Security Change Policy

Security changes should always be listed under:

```text
### Security
```

Examples:

```text
- Added SecureString redaction.
- Changed webhook replay protection default to enabled.
- Denied native bindings by default.
- Added source-map production warning.
```

---

## Final Note

This changelog tracks Galerina as it evolves from concept to implementation.

At this stage, most entries describe design decisions and planned milestones rather than released software.

Once a compiler or toolchain exists, this file should track real releases, bug fixes, security updates and compatibility changes.
