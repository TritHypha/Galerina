# Tasks

## Phase 1: Planning

- [x] Update workspace documentation for the `packages-galerina/galerina-core/` language package move
- [x] Mark the current workspace version as beta rather than a stable release
- [x] Document that maintained repo structure takes precedence over generated
  document suggestions
- [x] Document the proposed `package-galerina.json`, `galerina.lock.json` and
  `packages-galerina/` package split
- [x] Document the governed Package Resolver concept for package/module
  resolution, verification, capability/effect checks, Governed IR linking and
  provenance reporting
- [x] Document the Certified Package Registry concept for signed, versioned,
  capability-declared, policy-rated package publication before resolver use
- [x] Add grouped `packages-galerina/galerina-finance-core` beta package scaffold
- [x] Add F# comparison and Galerina positioning guidance
- [x] Split partial framework guidance into `packages-galerina/galerina-framework-app-kernel/`
- [x] Add Galerina logic, compute type and secure runtime future-support proposal
- [x] Add `packages-galerina/galerina-framework-api-server/` HTTP API serving package documentation
- [x] Add CSRF protection policy for cookie-authenticated state-changing routes
- [x] Add API response/error-handling style guidance for `try`/`catch`,
  `match`, `Result<T, E>` and route response contracts
- [x] Add app crash-handling guidance for crash policies, route boundaries,
  structured crash reports, checkpoints and supervised workers
- [x] Add environment secret handling guidance for `Secret<T>`, taint tracking,
  safe sinks, scope/lifetime rules, LLM/cache denial and secret reports
- [x] Add memory hierarchy and reliability guidance for cache-aware layout,
  L2/L3 reporting, IDE warnings and ECC-aware deployment policy
- [x] Add server platform support guidance for Nginx/Apache/Caddy reverse proxy
  generation, Node.js targets, Express adapters and Galerina-native API serving
- [x] Add secure fast routing guidance for compiled route graphs, route
  manifests, object/property authorization, effects and resource limits
- [x] Add secure HTTP response guidance for typed response contracts, security
  headers, cache/cookie policy, safe redirects, CSP and response reports
- [x] Document route-first API policy and controller-style grouping as optional
  framework sugar rather than a core Galerina concept
- [x] Document optional thin DDD guidance for domain, flow, infrastructure and
  policy boundaries without making DDD mandatory or weakening security
- [x] Add financial markets runtime safety design note
- [x] Add secure web runtime positioning
- [x] Confirm `galerina serve` / secure web runtime as the main v1 milestone,
  with a simple portable build target as the secondary v1 milestone
- [x] Document the current Node-hosted runtime position and standalone runtime
  roadmap
- [x] Add network and Ethernet I/O positioning plus `galerina-core-network` package
- [x] Add language-core maturity roadmap for missing compiler/runtime work
- [x] Add compliance and privacy framework docs plus `galerina-compliance-*`
  package scaffolds
- [x] Add data-processing framework docs plus `galerina-data-*` package scaffolds
- [x] Add typed database model/query/response docs plus `galerina-data-db` and
  `galerina-db-*` package scaffolds
- [x] Add typed browser rendering docs plus `galerina-web-*` and `galerina-target-js`
  package scaffolds
- [x] Add optical I/O and Intel Silicon Photonics design note
- [x] Add passive AI accelerator and Intel Gaudi profile design note
- [x] Add electrical infrastructure and OT package planning note
- [x] Archive finance, electrical and OT package scaffolds outside the active
  workspace until post-v2 package planning resumes
- [x] Add a core foundation roadmap that gates future work on syntax, memory,
  examples, parser, checker, CPU execution, WASM planning and reports
- [x] Complete `docs/REQUIREMENTS.md`
- [x] Complete `docs/DESIGN.md`
- [x] Document Kubernetes as an optional deployment target without creating the
  locked enterprise Kubernetes package
- [x] Add Learning Mode design for students, children, teachers and beginners
- [x] Add layered documentation structure for framework, contracts, reports and
  rules
- [x] Add Knowledge Base concept note for the documentation layer model
- [x] Add AI Understandable Architecture Policy concept covering knowledge-map
  docs, machine-readable indexes, component metadata, stable names and
  canonical examples
- [x] Document the Galerina Architecture Charter as the top-level identity for
  security-first, auditable, governed execution
- [x] Document Security Invariants And Policy Proof as the compiler/runtime
  direction for security-aware IR, immutable execution plans, no ambient
  authority, hardened mode and policy-proof reports
- [x] Document priority categories for non-negotiable rules, core language
  rules, core concepts, platform concepts, design rules and future research
- [x] Document the core `data -> flow -> permission -> boundary -> report` model
- [x] Document Trust Conversion And Data Safety, including inert unsafe values,
  `validate`/`guard`/`sanitize` conversion, safe-only contextual encoding and
  query interpolation denial
- [x] Document developer-friendly permissions as the simple surface over
  capabilities, effects, policies, audit and reports
- [x] Document first-class layered policy architecture and policy report
  outputs
- [x] Document system-level Runtime Policy Config defaults, controls, syntax and load lifecycle early in boot
- [x] Document model views and data blocks as the safe simplification for
  model/request/response concepts
- [x] Add a Hello World API pattern using data, flow, permission, route and
  report concepts
- [x] Document encapsulation as controlled data movement through secure flows,
  classification, response contracts, capabilities, effects, scoped lifetimes,
  package exports, safe mutation and reports
- [x] Document models as view-governed internal security contracts with
  relationships, mutation rules, storage separation and model report targets
- [x] Document permissions, capabilities and actors as the developer-facing
  authority model
- [x] Add dedicated capability concept and permission/capability report docs
- [x] Clarify capabilities as boundary-wide actor authority separate from code
  effects
- [x] Document Galerina's software-as-declared-intent positioning
- [x] Document benchmark success and result interpretation rules for
  compute-mix validation and timed throughput scoring
- [x] Document startup and boot warmup as verified boot-profile planning
- [x] Document fast response and keep-alive as policy-controlled request-path
  optimisation
- [x] Add detailed concept map under the five-part Galerina core model
- [x] Add framework docs for routes, classification, context, scopes/lifetimes,
  errors, packages and tests
- [x] Document boundary extension concepts for events, repositories/storage and
  adapters/connectors under the five-part model
- [x] Document explicit polymorphism through contracts, adapters, variants and
  constrained generics while excluding hidden inheritance-style behaviour
- [x] Document no-inheritance and explicit-security-by-default rules
- [x] Document `_ => { ... }` match catch-all branches and safe fallback rules
- [x] Document Galerina Securely Governed Runtime principles and trust zones
- [x] Document AI compute plans as typed, governed runtime work
- [x] Document specialist AI hardware compute targets as governed CPU, GPU,
  NPU, TPU, VPU, FPGA, ASIC and future optical/photonic target planning
- [x] Document verified fast paths as leased, auditable execution signatures
- [x] Document Context Tagged Verified Execution Cache for verified plan reuse,
  specialist runtime caches, context tags, invalidation and the rule that
  caches must not own authority
- [x] Document AI self-modification governance and capability attenuation
- [x] Document malicious data and exploit resistance for authority, resource
  exhaustion, OWASP/CWE classes and hardware/runtime risk boundaries
- [x] Document deny-by-default risk features and complexity features to leave
  out of the core runtime
- [x] Document scoped vaults as controlled runtime state instead of global
  variables
- [x] Document scoped vaults as a fast response mechanism with typed owner,
  permission, TTL, sensitivity and report rules
- [x] Document boundary safety as the first Galerina proof target
- [x] Document photonic resolution rules for optical/photonic compute outputs
- [x] Document local AI review as advisory tooling where compiler checks remain
  authoritative
- [x] Document local low-bit AI review as advisory report explanation, not proof
- [x] Document MCP as a controlled AI/tool boundary under the
  `data -> flow -> permission -> boundary -> report` model
- [x] Document quantum readiness as post-quantum security first and quantum
  compute target planning later
- [ ] Complete `docs/ARCHITECTURE.md`
- [ ] Complete `docs/SECURITY.md`
- [ ] Reconcile coverage-driven documentation conflicts before implementing the
  affected public package contracts
  - [ ] Choose one canonical `OpticalTransportMode` enum and one
    `SPORE-PHOTONIC-001` through `SPORE-PHOTONIC-006` diagnostic table
  - [ ] Confirm photonic ownership between `galerina-core-photonic`,
    `galerina-core-vector`, `galerina-core-compute` and `galerina-target-photonic`
  - [ ] Align API-server webhook/replay/idempotency adapter docs with
    `galerina-core-network-webhook.md`
  - [ ] Align older Tri/Decision/Omni KB files with the current
    `galerina-core-logic` v0.2 README and `galerina-core-logic-tri-decision-bool.md`
  - [ ] Decide `ProtectedSecret<T>` reveal semantics before implementation
  - [ ] Remove or mark legacy `ws`/`wss` protocol wording in favor of
    `websocket`

## Phase 2: App Setup

- [ ] Create app entry files in `packages-galerina/galerina-framework-example-app/`
- [ ] Add app config
- [ ] Add environment schema
- [ ] Add basic route/module structure

## Phase 3: Core Features

- [ ] Add feature 1
- [ ] Add feature 2
- [ ] Add feature 3

## Phase 4: Testing

- [x] Add app-kernel hello-world checked Run Mode test
- [x] Add app-kernel vector, sum, decimal and JSON checked Run Mode fixtures
- [x] Add package scaffolds for `galerina-core-cli`, `galerina-core-tasks`, `galerina-core-logic` and
  `galerina-core-photonic`
- [x] Add package scaffolds for `galerina-core-vector`, `galerina-core-compute`,
  `galerina-target-native` and `galerina-target-photonic`
- [x] Add package scaffolds for `galerina-core-compiler`, `galerina-core-runtime`, `galerina-core-security`,
  `galerina-core-config`, `galerina-core-reports`, `galerina-target-wasm` and `galerina-target-gpu`
- [x] Add package scaffolds for `galerina-ai`, `galerina-ai-lowbit`, `galerina-target-cpu` and
  `galerina-cpu-kernels`
- [x] Add package scaffold for `galerina-ai-agent`
- [x] Add package scaffolds for `galerina-ai-neural`, `galerina-ai-neuromorphic` and
  `galerina-target-ai-accelerator`
- [x] Add package scaffold for `galerina-devtools-project-graph`
- [x] Add package scaffold for `galerina-tools-benchmark`
- [ ] Add runtime contract implementation for governed execution plans
- [ ] Add runtime contract implementation for verified fast path signatures
- [ ] Add runtime contract implementation for AI compute plan hooks
- [ ] Add agent contracts for AI-generated code quarantine
- [ ] Add agent contracts for capability leases and attenuation
- [ ] Add agent contracts for immutable AI audit logs
- [ ] Add authority-kernel contracts for AI capability requests, approver chains,
  lease expiry and revocation
- [ ] Add immutable trust-root protection diagnostics for compiler, policy,
  permission, audit, capability checker, package signing and crypto roots
- [ ] Add AI read/write/tool/package/deploy capability separation examples
- [ ] Define future MCP AI/tool boundary contract schemas after core
  permission, effect, vault and report contracts stabilise
- [ ] Define capability boundary and grant report schemas
- [ ] Define policy definition, index, effective, conflict and AI-summary report
  schemas
- [ ] Define malicious data, exploit resistance, resource budget, taint-flow and
  hardware-risk report schemas
- [ ] Define OWASP/CWE baseline mapping for Galerina diagnostics
- [ ] Define crypto inventory and post-quantum readiness report schemas
- [x] Add TODO documents for `galerina-framework-api-server` and `galerina-framework-app-kernel`
- [x] Add README and TODO documents for `packages-galerina/galerina-framework-example-app`
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add manual test checklist
- [ ] Confirm error handling
- [ ] Add beginner examples for explicit Hello World API and model-view response
  projection

## Phase 5: Deployment

- [x] Complete deployment documentation
- [x] Document deployment auto-configuration, target detection, runtime
  capability profiles, gates, readiness, smoke tests and rollback reports
- [ ] Configure environment variables
- [ ] Build the app
- [ ] Deploy to staging
- [ ] Deploy to production

## Phase 6: Tooling Packages

- [x] Implement `galerina-core-cli` command integrations
- [x] Add `Galerina task` CLI integration with `galerina-core-tasks`
- [x] Implement `galerina-core-tasks` task file loading
- [x] Implement `galerina-core-tasks` dependency graph and cycle detection
- [x] Add CLI and task runner tests
- [x] Add report generation for CLI and task runs
- [x] Add filesystem and environment permission checks for `galerina-core-tasks`
- [x] Define `galerina-devtools-project-graph` project knowledge graph contracts
- [x] Define backend-neutral `galerina-devtools-project-graph` backend policy contracts
- [x] Add galerina-native `galerina-devtools-project-graph` workspace mapping support
- [x] Add `Galerina graph` query, explain and path support
- [x] Define `galerina-tools-benchmark` benchmark and diagnostics contracts
- [ ] Implement `Galerina benchmark` runner integration
- [ ] Add light benchmark report generation
- [ ] Add benchmark privacy/shareable payload checks

## Phase 7: Logic and Photonic Packages

- [ ] Define `galerina-core-logic` syntax and reports for `Tri`, `Galerina` and Omni
  - [x] Add initial Tri operations, explicit Tri-to-Bool conversion policy,
    Galerina validation, truth-table diagnostics and tests
  - [x] Add canonical Tri and Decision logic-state helpers plus tested examples
  - [x] Add bounded Omni logic contract rules
- [ ] Define `galerina-core-photonic` wavelength, phase and amplitude model
- [x] Define photonic mappings from `galerina-core-logic`
- [x] Add examples for photonic package boundaries
- [x] Add examples for logic package boundaries
- [x] Add tests for logic and photonic package boundaries
- [x] Define `galerina-core-vector` vector, matrix and tensor value contracts
- [x] Define `galerina-ai-agent` supervised AI agent orchestration contracts
- [x] Define `galerina-ai-neural` neural-network workload contracts
- [x] Define `galerina-ai-neuromorphic` spiking/event workload contracts
- [x] Define `galerina-core-compute` compute planning and target selection rules
- [x] Define `galerina-ai` generic AI inference and safety policy contracts
- [x] Document passive generic LLM and embedding cache policy with strict keys,
  typed output validation, privacy denials, invalidation and reports
- [x] Define `galerina-ai-lowbit` backend contracts for low-bit AI inference
- [x] Document zero-trust multi-agent runtime boundaries for typed messages,
  tool gateways, secret guards, sandboxing, approval gates and audit reports
- [x] Define `galerina-target-cpu` CPU capability and fallback report contracts
- [x] Define `galerina-cpu-kernels` low-bit CPU kernel planning contracts
- [ ] Define `galerina-target-native` native executable target plans
- [ ] Define `galerina-target-wasm` WebAssembly target plans
- [ ] Define `galerina-target-gpu` GPU target plans
- [x] Define `galerina-target-ai-accelerator` target planning contracts
- [x] Define Intel Gaudi 3 as a passive AI accelerator backend profile
- [x] Define NPU as a generic AI inference target with explicit fallback reports
- [x] Define `optical_io` as a high-speed interconnect/data-movement target
- [x] Expand optical I/O planning with topology, secure transfer, fallback,
  benchmark and AI-cluster data-movement rules
- [ ] Define `galerina-target-photonic` photonic backend target plans
- [ ] Define future quantum target planning rules only after core compute and
  target fallback reports are stable
- [ ] Define specialist AI hardware target planning reports for NPU, TPU, VPU,
  FPGA, AI ASIC, data sensitivity, isolation and fallback

## Phase 8: Core Infrastructure Packages

- [ ] Follow `docs/CORE_FOUNDATION_ROADMAP.md` before adding new active package
  surfaces
- [ ] Freeze v1 syntax and grammar around the supported examples
- [x] Clarify that Galerina's first product target is secure web runtime code,
  not low-level systems programming
- [x] Document systems-layer direction as generated backend/ABI work,
  not normal unsafe Galerina source style
- [x] Rename future native executable package direction to `galerina-target-native`
  and document `layout native` / `interop native` ABI wording
- [x] Add Machine Profile Bridge direction for local capability detection and
  runtime setup without low-level application syntax
- [x] Add a compact Galerina syntax and logic status table
- [x] Write at least 20 real `.spore` examples covering basic, intermediate and
  advanced v1 syntax
  - [x] Add the 20th core example, `logic-review-scale.spore`
- [ ] Build a parser that accepts the v1 examples and rejects post-v1 syntax
  with clear diagnostics
- [ ] Define `galerina-core-compiler` compiler pipeline contracts
  - [x] Add an initial core syntax safety scan for unsafe Tri conversions,
    non-exhaustive Tri matches, raw secret literals and unsafe dynamic execution
- [ ] Define Galerina IR as the target-independent handoff between parser/checker
  and future VM/WASM/native outputs
- [ ] Define compute target taxonomy and capability names for CPU, GPU, NPU,
  TPU, VPU, FPGA, ASIC and future optical/photonic targets
- [x] Define `galerina-core-runtime` execution contracts
- [ ] Define Node-hosted runtime adapter contract and host-runtime overhead
  reporting
- [ ] Commit the v1 memory model as hybrid ownership, borrowing, moves,
  bounds-checking and explicit unsafe boundaries
- [ ] Finalise `Bool`, `Tri`, `Decision`, `Option` and `Result` conversion and
  branch semantics
  - [x] Add the initial runtime contract for explicit Tri-to-Bool conversion
    policy in `galerina-core-logic`
  - [x] Add canonical `Tri` and `Decision` state definitions in
    `galerina-core-logic`
- [ ] Define standard library baseline for JSON, HTTP, files, streams, crypto
  policy, dates, money and safe strings
  - [x] Capture developer ergonomics and security lessons for the Galerina
    standard library and language-core roadmap
- [ ] Define IDE/LSP, debugger, source-map and test-framework roadmap
- [ ] Define exhaustive match, sealed variant, generic constraint and protocol
  requirements for production-readiness
- [ ] Define polymorphism effective report contracts for selected
  implementations, contract implementations, generic constraints and variant
  exhaustiveness
- [ ] Define model report schemas for model index, definitions, effective rules,
  exposure, relationships, mutations and AI summaries
- [ ] Define deterministic resource cleanup model for files, sockets, streams,
  handles, DB connections and secrets
- [ ] Define FFI/trusted module model with ownership, nullability, layout and
  audit reports
- [ ] Define native ABI and portable systems-output report contracts before
  creating a dedicated ABI or systems package surface
- [ ] Define package manager and registry design with lockfile, permissions and
  reproducible builds
- [ ] Define Certified Package Registry certification levels, package evidence
  schema, risk ratings, security review status and registry policy checks
- [ ] Define Package Resolver report schemas for package resolution,
  provenance, package permissions, dependency graph and Governed IR package map
- [ ] Define simple `data { model request view }` syntax status and report
  mapping after the v1 grammar freeze
- [x] Define resilient flow controlled recovery and processing report direction
- [x] Define Galerina Structured Await language, runtime, kernel and report direction
- [x] Define conservative storage-aware performance and cache planning direction
- [x] Define `galerina-core-security` primitives, redaction and permission models
- [x] Define `galerina-core-config` project config and environment mode contracts
- [x] Define `galerina-core-reports` shared report schemas
- [x] Define `galerina-core-network` network policy, TLS, backend-selection and report contracts
- [x] Add tested examples for `galerina-core-network`, `galerina-core-runtime`,
  `galerina-core-vector` and `galerina-core-photonic`

## Phase 9: Package Collection Split

- [x] Move Galerina packages from `packages/` into `packages-galerina/`
- [x] Rename ambiguous app package folder to `packages-galerina/galerina-framework-example-app`
- [x] Document package naming rules and staged rename candidates
- [ ] Decide when `packages-galerina/` is stable enough to become a reusable package
  repository
- [ ] Define `package-galerina.json` schema for Galerina package dependencies and profiles
- [ ] Define `galerina.lock.json` schema for locked Galerina package refs, checksums and
  selected profiles
- [x] Document profile-aware installer presets for web, server, agent, systems
  and future kernel project types
- [x] Use `galerina-devtools-*` and `galerina-tools-*` naming for development-only package
  families instead of a generic developer bucket
- [x] Remove stale duplicate `galerina-cli`, `galerina-compute` and `galerina-config` package
  folders after preserving the canonical `galerina-core-*` package data
- [ ] Define production versus development package resolution rules so
  production apps do not download staging packages by default
- [ ] Define resolver policy syntax for allowed registries, denied registries,
  lockfile requirements, signature/hash requirements and dynamic loading denial
- [x] Add host package manifest boundary validation so `package.json` remains
  NPM/host tooling and Galerina package graph fields stay out of host manifests
- [x] Define production boot/profile defaults that disable benchmark and
  development-only packages unless explicitly overridden and reported
- [ ] Split `packages-galerina/` into its own Git repository
- [ ] Mount `packages-galerina/` in framework repositories as a submodule or explicit
  nested repository
- [ ] Document package import workflow for different frameworks
- [ ] Add release/versioning rules for reusable Galerina packages
- [ ] Decide whether to rename `galerina-target-ai-accelerator` to `galerina-target-ai`
- [ ] Decide whether to rename `galerina-cpu-kernels` to `galerina-kernel-cpu`
- [ ] Decide whether to rename `galerina-ai-lowbit`, `galerina-ai-neural` and
  `galerina-ai-neuromorphic` under the `galerina-ai-*` naming family
- [ ] Define first `galerina-io-*` package contracts without replacing target
  packages
- [ ] Define implementation-level compliance report schemas after core parser,
  checker and package manager contracts are stable
- [ ] Define implementation-level data-processing report schemas after core
  parser, checker and package manager contracts are stable
- [ ] Define implementation-level database model, query, response and provider
  adapter report schemas after core parser and checker contracts are stable

## Phase 10: Finance Packages

- [x] Add grouped `galerina-finance-core` package planning area
- [ ] Define `galerina-finance-core-math` deterministic decimal and money contracts
- [ ] Define `galerina-finance-core-calendar` exchange calendar and trading session
  contracts
- [ ] Define `galerina-finance-core-market-data` quote, trade, order book, candle and
  replay contracts
- [ ] Define `galerina-finance-core-fix` FIX dictionary, validation and session contracts
- [ ] Define `galerina-finance-core-audit` evidence, hash-chain, reconstruction and
  redacted bundle contracts
- [ ] Decide when finance contracts should split into standalone packages

## Phase 11: Electrical and OT Packages

- [x] Add grouped `galerina-electrical-core` package planning area
- [x] Add grouped `galerina-ot-core` package planning area
- [ ] Define `galerina-electrical-assets` contracts for panels, circuits, breakers,
  cables, loads, meters, transformers, inverters, batteries, EV chargers, UPS,
  generators, relays and sensors
- [ ] Define `galerina-electrical-monitoring` telemetry contracts
- [ ] Define `galerina-electrical-capacity` load and phase-balancing checks
- [ ] Define `galerina-electrical-energy` demand, cost, carbon and optimisation reports
- [ ] Define `galerina-electrical-maintenance` inspection and test evidence contracts
- [ ] Define `galerina-electrical-protection-records` approval, test and rollback
  evidence contracts
- [ ] Define `galerina-ot-core` read-only telemetry gateway and OT network policy
  contracts
- [ ] Define future `galerina-ot-opcua`, `galerina-ot-iec61850`, `galerina-ot-modbus`,
  `galerina-ot-mqtt` and `galerina-ot-scada` package boundaries
- [ ] Keep certified protection replacement, PLC safety replacement,
  unsupervised switching and real-time grid control out of beta scope

## Phase 12: Generative Runtime Mapper

- [x] Add Generative Runtime Mapper Knowledge Base concept covering runtime
  maps, code maps, security maps, AI worker maps, memory/performance maps and
  advisory-only evolution suggestions
- [x] Define requirements that mapper output separates facts from suggestions
  and remains observational by default
- [x] Define mapper security requirements for redaction, structural telemetry,
  no payload retention and no silent runtime/source mutation
- [ ] Define initial mapper report schemas for runtime topology, permission
  usage, effect flow, memory pressure, AI worker behaviour and code structure
- [ ] Decide which future packages should own mapper contracts, for example
  runtime telemetry, runtime graph, runtime insight, code graph and refactor
  planning packages
- [ ] Define review workflow for mapper-generated patch proposals and
  optimisation recommendations
- [ ] Define safe ML export rules for structural, redacted runtime/code graph
  learning signals

## Phase 13: AI As Untrusted Reasoning Worker

- [x] Add AI-as-untrusted-reasoning-worker Knowledge Base concept covering
  typed AI tasks, sandboxed workers, evidence-backed claims, tool permissions
  and hallucination containment
- [x] Define requirements that AI may suggest, Galerina must verify and runtime
  must enforce
- [x] Define requirements that AI outputs declare claims, evidence, confidence,
  missing information, tool use and human-review need
- [x] Define future anti-hallucination report families for AI context, claims,
  evidence, tool permissions, hallucination risk and human review
- [ ] Define initial schemas for `AiTask`, `AiWorker`, `AiModel`,
  `AiContext`, `AiEvidence`, `AiClaim`, `AiDecision`, `AiToolCall` and
  `AiReport`
- [ ] Define AI worker sandbox policy defaults for secrets, filesystem,
  network, database writes, memory, runtime and typed tool permissions
- [ ] Define claim-verification workflow and evidence conflict handling
- [ ] Define human-review workflow for low-confidence, contradictory or
  policy-sensitive AI decisions

## Phase 14: Untrusted File And Asset Processing

- [x] Add Untrusted File And Asset Processing Knowledge Base concept covering
  quarantine, classification, isolated parsing, sanitisation, safe
  reconstruction, active-content denial, streaming limits and AI-safe
  extraction
- [x] Add Bit Width And Base64 Asset Policy Knowledge Base concept covering
  explicit numeric boundaries, fixed-width types, no silent conversion,
  low-bit AI formats, base64 handling modes and embedded asset security
- [x] Define requirements that uploaded files and embedded assets are
  executable-adjacent untrusted content
- [x] Define requirements that parser workers run isolated with bounded memory,
  bounded runtime, no secrets, no ambient filesystem and no network by default
- [x] Define requirements that base64/data URI content must pass security
  classification, memory policy and audit logging before decode or pass-through
- [ ] Define initial `QuarantinedAsset`, `SanitizedAsset`,
  `ParserWorkerResult`, `UntrustedPdf`, `UntrustedImage`, `UnsafeSvg`,
  `ArchiveFile` and `ExecutableContent` contract schemas
- [ ] Define parser worker report schemas for file security, active content,
  sanitisation, asset conversion and archive inspection
- [ ] Define numeric-width and overflow-check report schemas
- [ ] Define base64 policy report and externalised asset decision schemas
- [ ] Define safe reconstruction profiles for image, PDF, SVG, Office and
  archive inputs

## Phase 15: Memory Pressure Security

- [x] Add Memory Pressure Security Knowledge Base concept covering memory
  budgets, fallible allocation, backpressure, request isolation,
  priority-based load shedding, deterministic cleanup and OOM attack classes
- [x] Define requirements that low memory and near-out-of-memory conditions are
  security events requiring budgets, bounds, reports and fail-safe behaviour
- [x] Define architecture direction for app/request/worker memory budgets,
  pressure monitoring, backpressure, low-priority cancellation and
  secret-safe reporting
- [ ] Define memory budget contract schemas for apps, packages, requests,
  parser workers, AI jobs, streams, uploads and database result paging
- [ ] Define typed memory error schemas for `OutOfMemory`,
  `MemoryLimitExceeded`, `AllocationDenied`, `FragmentationRisk` and
  `BufferTooLarge`
- [ ] Define backpressure and load-shedding policy schemas for normal,
  warning, critical and emergency pressure states
- [ ] Define report schemas for memory pressure, allocation denied,
  request memory, OOM near miss and cleanup reports
- [ ] Define deterministic cleanup contracts for files, buffers, transactions,
  workers, audit logs and sensitive memory

## Phase 16: Compile-Time Metadata Reflection

- [x] Add Compile-Time Metadata Reflection Knowledge Base concept covering
  metadata as compile-time proof/tooling support rather than runtime object
  inspection or behaviour modification
- [x] Define requirements that metadata may describe execution but must not
  control execution at runtime
- [x] Define architecture direction for metadata extraction before semantic
  checks, governance checks, Governed IR creation, verified execution and
  report generation
- [ ] Specify formal metadata query syntax and report output shape after the
  v1 grammar freeze
- [ ] Define metadata index, route-flow-data link, permission metadata,
  response metadata, audit graph and Governed IR metadata report schemas
- [ ] Add diagnostics for denied runtime reflection patterns such as
  string-based invocation, live object listing, dynamic permission mutation and
  dynamic response exposure mutation
- [ ] Define how verified metadata is consumed by response gates, permission
  checks, audit generators, documentation generators and AI architecture
  indexes without becoming runtime authority

## Phase 17: Governed Execution Director

- [x] Add Governed Execution Director Knowledge Base concept covering shared
  understanding, execution planning, passive runtime modules, verified fast
  pipes, justified execution and audit proof
- [x] Define requirements that the Director plans and coordinates execution but
  does not grant hidden authority
- [x] Define architecture direction for Director, policy, passive modules and
  audit/proof separation
- [ ] Define shared understanding model contract fields for data, sensitivity,
  source, owner, action, effects, capabilities, compute shape, memory shape,
  output contract, audit requirement, validation state, trust state and expiry
- [ ] Define execution plan schema and lifecycle from input classification to
  passive module execution and audit proof
- [ ] Define passive module contracts for CPU, GPU, NPU, TPU, VPU, ASIC, AI,
  storage, network and boundary modules
- [ ] Define justified execution schema for access requests, output return
  reasons, hardware target reasons, plugin reasons and AI tool reasons
- [ ] Define report schemas for execution plans, shared understanding,
  compute-target decisions, memory paths, verified fast pipes,
  justified access, boundary modules and audit proof

## Phase 18: Runtime Terminology And Naming

- [x] Add Runtime Terminology Evolution Knowledge Base concept covering the
  shift from VM/thread/instruction terminology to governed operational
  coordination terminology
- [x] Add Terminology And Naming Philosophy Knowledge Base concept covering
  responsibility-based names, AI readability, future-proof terminology and
  implementation-independent naming rules
- [x] Update root and core README positioning so Galerina is described as a
  governance-first programming language, runtime and execution architecture
  for heterogeneous compute orchestration
- [x] Define runtime terminology requirements for Runtime Command, Authority
  Control, Runtime Logistics, Resource Deployment Balancer, Execution
  Coordination Scheduler and Result Assembler
- [x] Add Compute Balancer Knowledge Base concept covering approved hardware
  selection, hardware pressure, device trust, thermal state, queue depth,
  fallback decisions and the rule that the Balancer cannot grant authority
- [x] Define Compute Balancer requirements as the focused runtime role inside
  Resource Deployment Balancer responsibility
- [ ] Decide when explanatory terms such as Governed Execution Director should
  become formal package/API/report names versus architecture documentation
  names
- [ ] Define Compute Balancer report schemas for compute target pressure,
  hardware availability, hardware trust, fallback decisions, thermal pressure
  and queue pressure
- [ ] Define terminology review checklist for new runtime, compiler,
  governance, AI, hardware and report names
- [ ] Update future report/package names only after confirming package
  ownership and migration impact

## Phase 19: Data Visibility View Terminology

- [x] Add Data Visibility View Terminology Knowledge Base concept defining
  `view` as the field-level data exposure term
- [x] Define requirements that new field exposure examples use `view` instead
  of `classify`
- [x] Update key model, permission, framework and Hello World examples to use
  `view`
- [x] Document separation between field exposure views and broader security,
  input, AI, threat or compute classification
- [x] Add Built-In View Levels Knowledge Base concept defining `public`,
  `internal`, `private`, `confidential`, `secret`, `restricted` and
  `regulated` as built-in runtime/language view levels under `Runtime.View`
- [x] Define `public` as safe to expose under normal allowed response rules and
  `private` as owned data exposed only when ownership checks pass
- [x] Add Standard View Behaviour Knowledge Base concept defining that common
  view behaviour is declared once and inherited by permission references
- [x] Define that permission-level view conditions should normally narrow
  built-in view behaviour and widening requires explicit policy review/reporting
- [ ] Define compatibility diagnostics for older `classify` field exposure
  syntax
- [ ] Define formal `Runtime.View` grammar/schema and generated
  `view-level-report.json`
- [ ] Define view-behaviour inheritance and override diagnostics, including
  `view-behaviour-report.json` and `view-override-report.json`
- [ ] Define `data-view-report.json` and compatibility mapping from older
  data-classification reports
- [ ] Audit remaining documentation examples and migrate field exposure cases
  while preserving non-exposure uses of classification

## Phase 20: Variable Mutation And Vault Design

- [x] Add Variable Mutation Vault Design Knowledge Base concept covering
  local `let`, explicit `mut`, `readonly`, protected `vault`, `secure` access
  and `Secret<T>`
- [x] Define v0.1 direction that `readonly` replaces `const` unless a distinct
  compile-time constant need appears later
- [x] Define requirements that mutation must be explicit and shared state must
  live in protected vaults
- [x] Add Explicit Mutation And Vault Writes Knowledge Base concept clarifying
  that `mut foo++` and `mut secure.*` writes are preferred while unmarked
  `foo++`, plain assignment mutation and direct source-level
  `SessionVault.write(context, ...)` calls are not the v0.1 surface
- [ ] Update parser/checker status so assignment without `mut` is diagnosed
- [ ] Update parser/checker status so increment and decrement operations
  without `mut` are diagnosed
- [ ] Define `readonly` grammar and diagnostics
- [ ] Define vault declaration grammar, `secure` access checks and generated
  read/write permission contracts
- [ ] Define variable-scope, mutation, readonly-value, vault-access,
  vault-security and secret-flow report schemas

## Phase 21: Preplanned Startup And Fast Response

- [x] Add Preplanned Startup And Fast Response Knowledge Base concept covering
  verified boot profiles, deterministic boot snapshots, phased warmup,
  precompiled app-kernel decisions, safe startup caches, keep-alive transport
  policy and outbound connection pooling
- [x] Update startup and fast response docs with boot snapshot, generation
  commands, known-safe request path and transport-profile wording
- [x] Define requirements that startup cache artefacts are deterministic,
  non-secret, bounded, content-addressed where practical, safe to delete, safe
  to bypass and never required for correctness
- [x] Define requirements that keep-alive, HTTP/2 multiplexing and HTTP/3/QUIC
  remain deployment-profile transport capabilities rather than core language
  syntax
- [ ] Define `galerina.boot-profile.v1` schema for routes, policies, validators,
  effects, package graphs, runtime plan, target plan, cache metadata and report
  references
- [ ] Define boot snapshot bundle manifest and validation rules for
  route-table, policy-table, validator, package-graph, target-plan and startup
  report artefacts
- [ ] Define `startup-report.json` and `app.network-performance-report.json`
  schemas for boot readiness, warmup state, inbound transport, outbound pools,
  cache decisions and warnings
- [ ] Define future CLI command contracts for `Galerina startup:plan`,
  `Galerina startup:warm`, `Galerina startup:report` and
  `Galerina serve --use-boot-profile`

## Phase 22: Secure By Default Syntax Principles

- [x] Add Secure By Default Syntax Principles Knowledge Base concept covering
  deny-by-default permissions, explicit authority, input contracts, output view
  rules, ownership checks, safe database syntax, target-aware encoding,
  secret-safe syntax, resource budgets, audit declarations, governed context and
  denied unsafe defaults
- [x] Define requirements that these are syntax/logic principles rather than
  only runtime checks
- [ ] Define formal permission deny-by-default diagnostics and effective
  permission reports
- [ ] Define request/input contract grammar for required fields, string length,
  numeric ranges, allowed values and body-size limits
- [ ] Define response target grammar for `json`, `html`, `log`, `ai_prompt`,
  `shell`, `sql`, `url` and `csv` encoding policy
- [ ] Define typed database query grammar and gated `db.raw_sql` authority
  diagnostics
- [ ] Define field-read permission grammar for explicit allow lists,
  `fields: all except [...]`, `fields: all current except [...]`, `fields: all`
  and related sensitivity/future-field diagnostics
- [ ] Define default and explicit `budget` grammar for CPU, memory, time,
  body-size, loop, recursion, task, network, AI/tool and accelerator limits
- [ ] Define audit declaration grammar and report schemas for security-relevant
  flows

## Phase 23: Audit Actor Model

- [x] Add Audit Actor Model Knowledge Base concept covering automatic runtime
  actor attribution, permission-based audit events, multiple actor roles,
  manual metadata limits and no silent actor spoofing
- [x] Define requirements that audit identity inherits governed runtime context
  and cannot be silently overridden by application code
- [x] Add Multi-Actor Audit Events Knowledge Base concept covering affected,
  delegated, source, system and AI actor metadata while preserving
  runtime-owned primary actor attribution
- [ ] Define audit event schema fields for actor, delegated actor, source actor,
  request ID, route, flow, permission, capabilities, timestamp, execution ID,
  result, trust zone and redaction decisions
- [ ] Define multi-actor audit schema roles for `primary_actor`,
  `affected_actor`, `delegated_actor`, `source_actor`, `system_actor` and
  `ai_actor`, including runtime-approved system actor validation
- [ ] Define diagnostics for attempts to override runtime-owned audit identity
  fields such as primary actor, request ID, permission or execution ID
- [ ] Define report schemas for `audit-actor-report.json`,
  `audit-event-report.json`, `audit-context-report.json` and
  `audit-spoofing-warning-report.json`
