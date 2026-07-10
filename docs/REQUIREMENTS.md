# Requirements

## Scope

This repository is a Galerina application template and package workspace. It does not
yet define one specific product domain. Requirements in this file describe what
the template, package boundaries and developer tooling must provide so a
bespoke application can be built on top of Galerina safely.

Product-specific requirements belong in this file once an app domain is chosen.
Until then, `packages-galerina/galerina-framework-example-app/` remains a minimal app area and feature placeholders
must not be treated as implemented app functionality.

## Template Goals

- Provide a clear workspace for Galerina language, compiler/runtime contracts,
  security primitives, tooling packages and bespoke app code.
- Keep language documentation in `packages-galerina/galerina-core/` and app/workspace
  documentation in `docs/`.
- Support CPU-compatible checked execution and deterministic reports as the
  practical baseline.
- Keep v1 focused on `galerina serve` and the secure web runtime.
  CPU-compatible checked execution remains the baseline, with a simple portable
  build target as a secondary v1 milestone. WASM, GPU, photonic, low-bit AI,
  AI accelerator, optical I/O and native executable support remain target
  planning unless needed to explain core type-system semantics.
- Support neural-network workloads through typed packages and target planning,
  not by making neural networks part of normal app syntax.
- Support parallel AI agents only as supervised, bounded, permissioned,
  cancelable and reportable workloads.
- Support Galerina Structured Await as the normal concurrency model: synchronous-looking
  waits with scoped child work, typed effects, timeouts, cancellation and reports
  instead of exposed future/promise plumbing.
- Support controlled recovery for batch/data flows while stopping safely on
  unsafe system or runtime integrity failures.
- Support safe application crash handling through typed errors, controlled
  panic/crash categories, app-kernel crash boundaries, structured crash reports,
  safe logging, health checks and supervised worker restart policy.
- Support storage-aware performance planning without claiming direct support for
  SSD, NVMe, M.2 or other hardware. Storage detection must be optional,
  reportable and safe when unknown.
- Give AI coding tools enough generated context to understand package ownership
  without replacing compiler, runtime, security or test checks.
- Provide safe task automation with explicit effects, permissions and reports.
- Support a future Learning Mode for students, children, teachers and beginners
  through safe examples, guided diagnostics, sandboxed execution, hints,
  teacher reports and child-safe privacy defaults.

## V1 Language Requirements

- The v1 surface must freeze around core syntax, the core type system,
  `Result<T, E>`, `Option<T>`, the memory-safety model, `galerina serve`, secure
  web runtime policy and CPU-compatible checked execution.
- Galerina's architecture charter must remain stable: security first, code
  second, authority never implicit. Raw speed must not override controlled
  authority, verifiable execution, auditability, memory safety, architectural
  stability or governed execution.
- Galerina must be designed around security invariants rather than isolated
  exploit patches. Declared security policy must be part of program meaning, so
  the compiler/runtime can prove or deny whether a flow may expose data, use an
  effect, call a package, cross a boundary or execute unsafe behaviour.
- Galerina's compiler IR should be security-aware. It should carry permissions,
  capabilities, data classification, exposure level, ownership, actor identity,
  trust boundaries, side effects, audit requirements, package authority and
  runtime isolation requirements into checking, execution planning and reports.
- Galerina execution plans should become immutable after checking. Runtime monkey
  patching, hidden behaviour injection, reflective execution, dynamic property
  injection, runtime type rewriting and metadata mutation that changes
  authority must be denied in normal code.
- Galerina high-assurance profiles should support hardened mode rules such as
  disabled runtime reflection, denied unsafe blocks, denied shell execution,
  signed-only external plugins/packages, deterministic execution enforcement,
  raw SQL denial and mandatory audit.
- Galerina ideas must be classified before they are treated as implementation
  requirements. The priority order is: non-negotiable rules, core language
  rules, core concepts, platform concepts, recommended design rules and
  future/research concepts.
- AI tools and contributors must not promote future/research concepts into v1
  scope unless requirements, tasks and package boundaries explicitly support
  them. Suggestions that violate non-negotiable rules must be rejected or
  redesigned.
- Everything beyond secure runtime execution and the simple portable build
  target must be labelled post-v1 or target planning unless it is necessary to
  define the core type system.
- Galerina must not make measured performance claims until the compiler, memory
  model, runtime and benchmark methodology exist. Current performance wording
  must be framed as a goal or opportunity, not a measured fact.
- Galerina benchmarks must separate validation from speed ranking. Fixed-operation
  mode validates matching checksums; timed 10-30 second throughput mode provides
  the official median operations-per-second score. Warm-up must use throwaway
  state and must not mutate the measured benchmark state.
- Galerina startup must prefer verified boot profiles over runtime discovery in
  production. Expensive route, policy, schema, package and target planning
  should happen at build/check time; boot should verify hashes, load the
  smallest safe runtime surface and defer optional packages until after
  readiness.
- Galerina boot snapshots, where used, must start as verified bundles of
  deterministic startup artefacts rather than raw runtime memory dumps. Startup
  cache artefacts must be bounded, content-addressed where practical, safe to
  delete, safe to bypass, non-secret and never required for correctness.
- Galerina fast response planning must combine verified boot profiles,
  precompiled route dispatch, prebuilt validators, warmed policy tables,
  bounded pools, safe inbound connection reuse and safe outbound connection
  pooling. Keep-alive policy must never bypass auth, validation, TLS, rate
  limits, body limits, backpressure or secret-safe logging.
- HTTP/1.x keep-alive, HTTP/2 multiplexing and HTTP/3/QUIC must be modeled as
  deployment-profile transport capabilities, not as core language syntax.
  Inbound and outbound connection pooling must emit network performance report
  data and remain subject to timeout, rate-limit, body-limit, backpressure,
  audit and TLS policy.
- Galerina's current practical web/API execution model must be described as
  Node-hosted. The language core must remain target-independent, Node/V8
  behavior must not define source semantics, and Node-hosted benchmarks must
  be labelled as prototype runner or host-runtime overhead rather than native
  Galerina performance.
- Galerina v1 concept documentation must keep the five-part model as the main
  teaching structure while indexing detailed concepts underneath it: routes,
  requests, responses/views, secure flows, models, contracts, policies,
  effects, capabilities, classification, context, scopes/lifetimes, errors,
  reports, packages and tests.
- Coverage-driven package documentation updates must resolve package ownership
  and canonical contract conflicts before implementation begins. If
  `docs/COVERAGE.md` lists multiple incompatible forms for the same public
  contract, the owning package README/TODO and Knowledge Base file must state
  which form is canonical or explicitly mark the conflict unresolved.
- Photonic public contracts must not be implemented from conflicting docs until
  `OpticalTransportMode`, `PhotonicRuntimeTarget`, `PhotonicExecutionPlan` and
  `FUNGI-PHOTONIC-001` through `FUNGI-PHOTONIC-006` have one package-owned canonical
  definition.
- Webhook HMAC, replay protection and idempotency contracts must use the
  `galerina-core-network` v0.2 canonical model unless an adapter explicitly maps
  its local names to that model.
- Logic-state contracts must use the `galerina-core-logic` v0.2 canonical model
  for runtime-facing docs: `TriState` with `kind`, `Decision` with
  `allow|deny|review|unknown`, evidence arrays and fail-closed Bool conversion.
- Galerina should expose `permission` as the main developer-facing authority
  concept while preserving capabilities, effects, policies, audit and reports as
  precise internal/effective concepts.
- Galerina syntax and logic principles must be secure by default, not only
  runtime-checked. Insecure behaviour should be impossible by default, and
  privileged behaviour must be visible in syntax through permissions, effects,
  input contracts, output views, ownership checks, safe sinks, budgets and audit
  declarations.
- Permission blocks must deny by default. Missing allow rules must mean denied,
  and risky action families such as database, file, network, secret, AI/tool,
  compute, shell and external API access must require explicit authority.
- Galerina must use a governed Package Resolver rather than an autoloader model.
  Imports and package references must not grant trust or hidden authority. The
  resolver must find, verify, authorize, load and link packages/modules before
  execution.
- Galerina should define a Certified Package Registry as a governed package source
  where packages are published, verified, signed, versioned,
  capability-declared and policy-rated before use.
- The Certified Package Registry must treat packages as governed authority
  requests, not passive dependencies. Registry metadata should answer package
  identity, publisher, approved version, capabilities requested, effects used,
  runtime targets, audit requirements, risk rating, security review status and
  certification level.
- The Package Resolver must check package identity, version, lockfile state,
  hash/signature, source registry, declared capabilities, declared effects,
  licence/policy, trusted status, dependency graph, conflicts, profile
  compatibility and target compatibility before linking approved modules into
  Governed IR.
- Dynamic package or module loading must be denied by default in production. If
  allowed by a development or extension profile, it must go through Authority
  Control, resolver policy, signature/hash checks, capability/effect checks,
  audit and provenance reporting.
- Request/input contracts should declare shape, required fields, size/range
  limits and allowed values before business logic, database access, AI/tool
  calls or external service calls execute.
- Output contracts must declare or inherit target context such as JSON, HTML,
  log, AI prompt, shell, SQL, URL or CSV so encoding, escaping, redaction and
  injection rules are target-aware.
- Raw SQL must be denied by default. Typed query syntax should be preferred, and
  raw SQL must require explicit high-risk authority such as `db.raw_sql`.
- Database field reads should prefer explicit field allow lists, for example
  `allow read Profiles fields: [id, owner, name]`. Broad-read forms such as
  `fields: all except [...]` may be supported only as visible, reportable,
  higher-risk syntax.
- `fields: all except [...]` must resolve known fields, remove excluded fields,
  check field `view` metadata, warn on sensitive tables and deny unknown future
  fields unless broad future-field access is explicitly approved. A safer
  `fields: all current except [...]` mode should freeze the current resolved
  field set until review.
- Security-sensitive flows should declare audit requirements and resource
  budgets. Defaults must exist, and explicit budgets should cover CPU, wall
  time, memory, body size, loops/recursion where provable, spawned tasks,
  network calls, AI/tool calls and accelerator work.
- Audit events must automatically inherit runtime execution identity. The
  runtime, not application code, owns primary actor attribution, request ID,
  route/flow, permission, active capabilities, timestamp, execution ID, result
  and trust-zone metadata.
- Application code may attach audit metadata, but it must not silently override
  runtime-owned identity fields such as primary actor, permission, request ID or
  execution ID. Attempts to override those fields should be denied or reported.
- Multi-actor audit events should support explicit metadata roles such as
  `affected_actor`, `delegated_actor`, `source_actor`, `system_actor` and
  `ai_actor`. These roles must not replace the runtime-owned `primary_actor`.
- System actors used in audit metadata, such as a payments system actor, must be
  runtime-approved identities declared in trusted runtime policy, not arbitrary
  application-created actor values.
- Galerina policies must be first-class source rules. Reusable policies should
  live under `/policies`, local policy should be placed at the smallest useful
  boundary, and policy reports must include index, definitions, effective
  enforcement, conflicts and AI/human summaries.
- Galerina must load a system-level Runtime Policy Config early in the request/boot
  lifecycle (`boot/main -> Runtime Policy Config -> Package Resolver -> Governance Checks -> Governed IR -> Runtime Execution`)
  before executing any project code. It serves as the runtime's default governance contract.
- The Runtime Policy Config must define defaults and constraints for deny-by-default mode,
  default view rules, audit settings, rate limits, budgets, package registry rules,
  cache rules, vault backends, allowed compute targets, hardware trust levels, event rules,
  secret handling, and AI/tool permissions.
- Local permissions must not exceed or override global Runtime Policy Config rules
  unless explicitly permitted by deployment policy.
- The Runtime Policy Config must remain separated from `boot/main` startup wiring:
  the policy config defines the rules of the environment, while `boot/main` declares
  the entry point wiring and module loading.
- Galerina must not use PHP-style superglobals. `Runtime.Context` is the
  runtime-owned, read-controlled execution context for the current flow. It
  contains actor, request, route, permission, capability, audit, budget and
  compute facts but is not a global variable and is not freely writable.
  `Runtime.Context` must be injected into flows only when needed; simple flows
  may omit it. Session and shared mutable state must use governed vaults, not
  global bags or hidden writable context.
- Galerina encapsulation must be based on controlled data movement rather than
  public/private field visibility alone. Secure flow boundaries, explicit
  inputs and outputs, classification, response/view contracts, capabilities,
  effects, scoped lifetimes, package exports, safe mutation rules and reports
  must define what data can move and what can leave.
- Galerina models must be treated as view-governed internal security contracts, not
  public DTOs or active-record database objects. Production model fields must
  be classified, raw models must not be returned by public routes, model
  mutations and relationships must be explicit and storage access must remain in
  repository/storage boundaries.
- Galerina may use model views inside `data` blocks to simplify response
  definitions, but model and response/view meanings must stay separate. Public
  output must still use declared views or responses, never raw internal models.
- Galerina model reports must include model index, model definitions, effective
  model rules, model exposure, model relationships, model mutation reports and
  AI-readable model summaries as report targets.
- Galerina boundary concept documentation must index events, repositories/storage
  and adapters/connectors as boundary specializations. Events, queue/job
  engines, large provider ecosystems and database migration systems may remain
  later implementation work unless needed by the secure web runtime.
- Galerina polymorphism must be explicit rather than hidden. Contract-based
  polymorphism, adapter-based polymorphism, union/match variants and constrained
  generics are allowed directions; inheritance-based behaviour, implicit
  provider swapping and unreported plugin dispatch must not become the main
  application model.
- Galerina must disallow inheritance and inherited authority in normal application
  source. Reuse must use composition, contracts, adapters, variants, generics,
  secure flows, explicit views/responses, explicit permissions, explicit
  effects and effective reports.
- Galerina must assume everything is unsafe until declared safe. Data, effects,
  package authority, response exposure, routes and AI-generated changes must
  earn trust through declarations, checks, policies or reports.
- Polymorphic implementations must keep permissions, effects, data exposure,
  boundaries, errors, audit requirements and selected implementation visible in
  effective reports.
- Galerina match catch-all branches using `_ => { ... }` must be documented as
  explicit fallback handling. For security-sensitive matches, catch-all branches
  must return a typed error, explicit ignored response, safe log, manual review
  or fail-closed result instead of silently swallowing unknown states.
- Galerina runtime execution must follow the Securely Governed Runtime direction:
  authority is verified before execution; policy, capabilities, effects and
  audit hooks are part of execution itself; untrusted packages, plugins,
  AI-generated code, external services and hardware accelerators may execute
  only through declared boundaries.
- Galerina must support policy proof as a first-class design target. The compiler
  and reports should be able to answer security questions such as whether a
  flow can expose restricted data, whether an actor can perform an effect,
  whether an unsafe block is allowed by profile and whether a package can reach
  network, filesystem, shell or database effects.
- Galerina must treat malicious data as an active threat. External input, API
  payloads, files, events, package metadata, AI/tool output, network data,
  storage data and hardware results must not become authority, executable code,
  infinite compute, hidden memory pressure, secret leakage or unsafe hardware
  access.
- Galerina must enforce that data cannot grant authority. Roles, permissions,
  object ownership and capability claims from untrusted data must be verified
  against runtime identity, ownership policy and granted capabilities.
- Galerina must assign bounded execution budgets to requests, tasks, AI/tool
  calls and compute plans. Budgets should cover CPU time, wall time, memory,
  recursion, loop iterations where provable, spawned tasks, network calls,
  file operations, AI/tool calls and hardware accelerator work.
- Galerina malicious-data handling must include size limits, depth limits,
  schema-first parsing, type/range/encoding validation, canonicalisation before
  policy, ownership checks, safe sinks, output encoding and taint-flow reports.
- Galerina exploit-resistance planning must use OWASP Top 10, OWASP API Security
  Top 10, OWASP ASVS and MITRE CWE Top 25 as baseline inputs for access
  control, object-level authorization, injection prevention, SSRF protection,
  resource control, secure error handling and verification levels.
- Galerina hardware/runtime risk handling must treat CPU side channels, GPU/NPU
  side channels, accelerator memory residue, DMA-capable devices, unsafe
  drivers and device plugins as governed boundaries. High-assurance deployments
  may require OS/firmware mitigations, IOMMU or equivalent protection, dedicated
  hardware for high-secret workloads and hardware-risk reports.
- Galerina capabilities must express actor, package, flow or tool authorization
  separately from technical effects. Protected actions and protected data
  exposure must declare required capabilities or permissions at secure flow,
  route, package, response/view, adapter, AI/tool, MCP and scoped vault
  boundaries.
- Galerina may use verified fast paths only for workloads that match a known
  execution signature. Fast paths must expire, remain auditable and revalidate
  when policy, package versions, model versions, hardware, trust state or output
  contracts change.
- Galerina verified fast paths should be backed by a context-tagged verified
  execution cache. Cached execution plans must be reusable only when the
  current verification context matches the cached context, including source
  hash, Governed IR hash, permission hash, policy version, actor scope, view
  scope, runtime zone, compute target, hardware trust, vault version,
  package version and audit level.
- Galerina caches must not own authority. Authority Control must decide whether a
  cached parser result, IR, policy decision, view rule, vault read, compute
  plan, schedule lane, audit buffer or full verified execution plan may be
  reused, and must be able to invalidate caches on policy, permission, view,
  vault, package, zone, trust, hardware, audit, expiry or revocation changes.
- Secrets, private data, authorization decisions, admin decisions, AI outputs,
  cross-user responses, hardware trust decisions and raw sensitive payloads must
  not be cached freely. They require strict context tags, expiry, isolation and
  explicit policy, and some categories should remain denied by default.
- Galerina AI workloads must be declared as typed AI compute plans rather than
  opaque model calls. Plans should declare input/output types, model class, data
  sensitivity, precision, latency, compute target, memory needs, allowed tools
  and audit needs.
- Galerina specialist AI hardware must be represented as governed compute targets,
  not unrestricted runtime access. CPU, GPU, NPU, TPU, VPU, FPGA, AI ASIC and
  future optical/photonic hardware must declare hardware type, provider,
  runtime/driver, supported precision, supported model formats, memory limits,
  isolation level, data sensitivity allowed, audit requirements and fallback
  target before use.
- Galerina source should prefer generic compute target classes and backend
  profiles rather than vendor-specific language syntax. Fast hardware is an
  accelerator, not an authority; the verified execution plan must allow the
  target before runtime selection.
- Galerina local AI review, including BitNet-style low-bit CPU-friendly backends,
  must remain advisory. Deterministic compiler, type, memory, policy, effect
  and report checks remain authoritative.
- Galerina MCP support, if added, must be implemented as a platform-level AI/tool
  boundary. MCP tools, resources and prompts must be declared with typed data,
  permissions, effects, auth/token-boundary rules, limits, audit and reports.
  MCP tool availability must not be treated as permission, token passthrough
  must be denied, and MCP clients must not receive direct generic vault access.
- Galerina quantum readiness must prioritise post-quantum security before quantum
  compute. Cryptography must be policy-driven and reportable, crypto inventory
  reports must identify quantum-vulnerable algorithm use, `SecureRandom` must be
  required for security randomness, and future quantum state must be measured
  into explicit classical results before controlling application flow.
- Galerina AI systems may generate code, propose policy and request capabilities,
  but they must not grant capabilities to themselves, approve their own policy
  changes, edit their own boundary or modify trust roots without external
  governance.
- Galerina must support AI-generated code quarantine before promotion to trusted
  code. Quarantine requires syntax/type checks, effect extraction, policy
  evaluation, sandbox tests, audit reports and human or policy approval.
- Galerina capability delegation must support attenuation: delegated authority may
  be equal or narrower than the delegator's authority, never broader. Authority
  should be issued as scoped, revocable, auditable leases where possible.
- Galerina AI authority must separate AI intent from authority issuance. Reasoning,
  planning, code generation, self-analysis and optimization proposals may
  request authority, but an authority kernel must evaluate policy, risk,
  approval, scope, expiry and audit before authority is leased.
- Galerina must protect immutable trust roots from runtime AI self-modification:
  compiler, policy engine, permission model, audit integrity, capability
  validator, package signing and cryptographic trust roots require external
  governance for change.
- Galerina must separate AI read, write, tool-call, package-install, migration,
  deploy and policy-edit capabilities. A permission to read context must not
  imply permission to write files, run shell commands, install packages or
  change policy.
- Galerina must deny hidden authority features by default, including dynamic eval,
  unrestricted shell execution, hidden network access, raw filesystem access,
  global mutable state, unsafe native interop, raw pointers, monkey patching,
  policy-bypassing reflection and AI self-granted capabilities.
- Galerina should leave out complexity features that hide behaviour or force
  runtime guessing, including inheritance-heavy object models, multiple
  inheritance, heavy reflection, dynamic typing as the main model, magic
  decorators, automatic global dependency injection, implicit async behaviour,
  unbounded background runtime work and large default frameworks bundled into
  the runtime.
- Galerina must not claim production language maturity until it has an enforceable
  language core: parser, AST, symbol table, type checker, memory checker, effect
  checker, module system, protocols/interfaces, trusted interop boundary, test
  model, standard library, source-mapped runtime errors and build/release modes.
- Galerina security positioning must be framed as a secure web runtime goal:
  stronger default policy for permissions, APIs, memory-safe values, secrets,
  package effects, interop, deployment and AI-readable reports.
- Galerina's first product target is secure web-application runtime code:
  APIs, webhooks, service workers, queue workers, typed JSON services,
  auth-heavy applications and agent/tool gateway backends. Low-level systems
  targets, embedded targets and native executable output remain later target
  paths.
- Galerina must keep normal source high-level while still allowing local machine
  setup to specialise runtime plans. The Machine Profile Bridge must sit between
  checked Galerina source and machine-specific execution, detect local
  capabilities, cache uncommitted local profiles, configure boot/main runtime
  settings for the deployment machine and report every adapter, fallback and
  permission decision.
- Low-level boundary syntax must use `layout native` and `interop native` as
  the official draft wording. Native blocks must declare a concrete ABI such as
  `abi c`, `abi wasm`, `abi system` or `abi plugin`; the ABI must drive layout,
  ownership, nullability, allocator and audit checks.
- Galerina must treat data and behavior as untrusted by default within reason.
  External input, dependency output, generated AI content, cached data, network
  data, database data, uploaded files, environment-derived values, headers,
  cookies, tokens, runtime metadata and build artifacts must earn trust through
  validation, typing, provenance, policy checks or explicit reviewed
  boundaries.
- Galerina syntax itself must be treated as untrusted until governed. A parser
  accepting a feature must not make that feature production-ready; each syntax
  surface must be typed, effect-checked, permissioned, bounded, source-mapped,
  tested or reportable before it is treated as safe.
- Galerina must ban monkey patching in normal code. Runtime mutation of built-ins,
  imported modules, package internals, framework methods, response serializers,
  security policies or provider functions must be denied by default. Use
  adapters, interfaces/protocols, pipelines, test-only mocks or signed hotfix
  packages instead.
- Trust transitions must be represented in types, policies or reports. A value
  must not silently move from untrusted to trusted because it crossed an
  internal function boundary.
- Galerina must treat `unsafe` values as inert until trust conversion or explicit
  safe declaration. An unsafe variable must not participate in arithmetic,
  concatenation, ordinary string helpers such as `trim`, ordinary array helpers
  such as map/filter/reduce/event counts, query interpolation, shell execution,
  worker handoff, `GlobalVault` access or business logic.
- The only normal operations allowed on an `unsafe` value are `validate`,
  `guard` and `sanitize`. Explicit safe declaration, such as `safe foo`, must be
  policy-visible and reportable. `encode.*` must require an already-safe input
  and must produce a context-specific safe output such as `safe Html`,
  `safe UrlPart`, `safe JavaScript`, `safe Css`, `safe Xml` or
  `safe ShellArg`.
- Galerina query handling must reject unsafe interpolation. `Query` must be
  treated as an immutable executable boundary artifact requiring safe
  parameters, runtime authority and audit output, not as ordinary text.
- Galerina must not claim to make Ethernet hardware faster. Network positioning
  must be framed as improving application network I/O through typed APIs,
  deny-by-default network permissions, TLS policy, backpressure, timeout policy,
  zero-copy planning, platform-aware I/O backend selection, reports and
  deployment profiles.
- Memory safety must be tied to an explicit mechanism. The current candidate is
  hybrid ownership: immutable sharing by default, one active mutable owner,
  read-only and mutable borrows, explicit moves for resources, bounds-checked
  collections and no raw pointers in normal application code.
- Galerina must not claim direct control over L1/L2/L3 CPU cache or ECC memory.
  Cache behaviour must be framed as optimisation through layout, access pattern,
  batching, copying and vectorisation guidance. ECC must be framed as a
  deployment reliability property that can only be detected or required when
  the platform exposes trustworthy evidence.
- Galerina syntax should stay readable and examples should be easy to follow,
  while types, missing values, errors, effects, package authority, dynamic
  execution, imports, JSON decoding, native interop and secret output remain
  explicit, checked and reportable.

## Postfix Type State Requirements

- Galerina must use postfix state syntax: base type first, governance state second
  (`String unsafe`, `Email safe validated`). The base type is the primary
  mental anchor; state qualifiers describe how the value may flow.
- v1 state set must be: `safe`, `unsafe`, `validated`, `unvalidated`. `secure`
  is reserved for declarations (`secure flow`), not variable state in v1.
- Unmarked values must be treated as ordinary safe values unless they originate
  from an unsafe, secure or untrusted source. Requiring state annotations on
  all values would be too noisy.
- State must not change through assignment. A value with a restrictive or risky
  state cannot flow into an ordinary value without an approved transition
  (validator, sanitizer, declassification method).
- The compiler must reject `let safe: Email safe validated = rawEmail` where
  `rawEmail` is `String unsafe unvalidated` without a validator call.
- `sanitized` must not be added as a core v1 state. Redaction and sanitization
  are context-dependent; a value may be safe for HTML but unsafe for SQL.

## Branded Type Requirements

- Galerina must support branded types using `Brand<T, "Name">` syntax:
  `type CustomerId = Brand<String, "CustomerId">`.
- Branded types must be compile-time distinct but runtime-erased to their base
  type. The compiler rejects mixing `CustomerId` and `OrderId` even though both
  are `String` at runtime.
- External values must be validated before becoming branded domain types. Direct
  assignment from an unbranded `String` to a branded type must be a compile error.
- Brands must compose with postfix state qualifiers:
  `type SessionToken = Brand<String secure, "SessionToken">`.
- A brand alone does not validate format. Format validation must be done through
  a separate constructor or validator flow.
- The type manifest must include brand entries so runtime and schema tools can
  understand the domain identity of values.

## Enum Syntax Requirements

- Enum declarations must use PascalCase names and PascalCase cases.
- The parser must accept both newline-separated and comma-separated cases.
  The formatter must output the canonical newline-separated form.
- Enums must be closed by default. Unknown external values must fail closed at
  governed boundaries unless a boundary policy explicitly allows a fallback.
- JSON/API encoding must use case names as strings by default.
- Exhaustive `map` matching over enums must be compiler-enforced.
- Payload variants (`Paid(PaymentId)`) and explicit wire values (`Paid = "paid"`)
  are deferred future features.

## Build System Requirements

- `galerina build` must produce an execution contract, not only an executable. The
  contract includes: type manifest, effect manifest, authority manifest, route
  table, runtime plan, source maps, and structured reports.
- `galerina deploy` must consume a verified build manifest. It must not rebuild by
  default. The deploy step proves the environment accepts the package.
- Every build must produce a `build-manifest.json` with source hash, artefact
  hashes, and links to all generated manifests.
- Deploy must support `--plan` dry-run mode that shows what would be deployed
  without changing infrastructure.
- Deploy must verify required secrets exist without printing them. Secrets must
  never be embedded in compiled artefacts unless an explicit policy permits it.
- Build phases must produce plain data and remain independently verifiable.
- Incremental build outputs must be equivalent to clean builds. Correctness
  overrides caching speed.
- Runtime policy may deny deployment even if the build succeeds. Compile-time
  approval does not imply runtime permission.

## Unified Authority Requirements

- Galerina must treat authority as layered: compile time proves intent, runtime
  governs effects.
- Boundaries must degrade authority: all external input (HTTP, queue, file, AI,
  plugin) must start as `unsafe unvalidated`. Validation must restore trust.
- Runtime denial is not a failure of the type system. It is correct layered
  authority. Compiler approval does not imply runtime permission.
- The type manifest must function as a runtime governance asset, not merely
  metadata. The runtime must use it to pre-plan type contracts before execution.
- Authority must be observable. The runtime must be able to report which effects
  a flow declared, which were granted, and which were denied.
- Future cache-aware memory work should support contiguous arrays, fixed-size
  buffers, read-only views, copy-on-write for large values, explicit clone
  warnings, hot/cold data separation, structure-of-arrays layouts,
  array-of-structures layouts, false-sharing warnings, hot-loop analysis and
  memory/cache reports.
- Future ECC-aware reliability policy may require ECC-capable environments for
  high-integrity workloads, but it must fail closed or warn when ECC status is
  unknown. Reports may include ECC detected/unknown status and corrected or
  uncorrected error counts only when exposed by the OS, firmware, hardware or
  runtime environment.
- Galerina must define deterministic cleanup for explicit resources such as files,
  sockets, locks, GPU buffers, model handles, DB connections, streams and
  temporary secrets.
- `.env` values must be treated as secrets, not normal strings. Secret values
  must be declared, typed, scoped, redacted, tracked through secret-derived
  values and denied from logs, errors, caches, LLM inputs, build output and
  reports unless an explicit safe sink policy allows metadata or controlled use.
- Environment secrets must use a protected form such as `Secret<T>` or a
  secret reference. They must not silently become `String` values, be converted
  with `toString()`, escape `with secret` lifetime blocks or be returned from
  normal functions.
- Secret reports may include names, required flags, scopes, allowed operations,
  allowed destinations and fingerprints, but must never include secret values.
- Galerina must define traits, protocols or generic constraints before building a
  large reusable library ecosystem.
- Recoverable errors must be explicit in syntax and types through
  `Result<T, E>` or an equivalent typed result form. Hidden exceptions must not
  be the default application error model.
- Galerina must support a first-class Typed Error Model where fallible flows declare
  their return type as `Result<SuccessType, ErrorType>`. The compiler and runtime
  must restrict flows to only return declared success and error types, preventing
  the propagation of untyped failures, raw stack traces and unmapped exceptions.
- Custom error blocks must be definable using the `error` keyword, allowing variants
  to explicitly declare their public-facing message, HTTP status code, visibility
  (`view: public`), and whether auditing is required (`audit: required`).
- The runtime and response gates must map typed errors safely: external users must
  receive only public/safe error outputs, while the audit system receives full
  internal context. Unexpected or internal system failures must hide internal
  details by default.
- Expected application errors, external failures and unexpected runtime crashes
  must be distinguishable in types, policies or reports.
- Public routes, webhooks, scheduled tasks and workers must have a crash
  boundary directly or through an app-level default when they can write data,
  call external systems, process payments or perform other state-changing work.
- Crash reports must be structured, source-mapped where possible, secret-safe,
  request/job correlated and safe for operators or AI tools to inspect.
- Runtime crash reports must not include raw secrets, cookies, authorization
  headers, payment credentials, private customer data or unredacted payloads.
- Workers and scheduled tasks must support supervised restart policy, bounded
  retries, backoff and crash-loop detection.
- Galerina may support `try`/`catch` as readable syntax over explicit
  `Result<T, E>` flow, but `match` must remain available for branch-by-branch
  handling where every outcome matters.
- `Result<T, E>` must be documented as `Result<SuccessType, ErrorType>` for
  learners and API authors.
- Missing values must use `Option<T>` or another explicit typed missing-value
  form, not unchecked null.
- `Tri` must not silently convert to `Bool`. Branch conditions must require
  `Bool`; `Tri` values must use exhaustive `match` or an explicit conversion
  policy such as `unknown_as: false`, `unknown_as: error` or equivalent.
- AI-readable must mean concrete compiler/tooling properties: regular grammar,
  explicit effects, explicit imports, typed errors, source maps, stable
  diagnostics and machine-readable reports. It must not be a vague marketing
  label.
- Galerina architecture must be AI-understandable by design. AI tools should read
  stable architecture maps, concept definitions, package ownership, generated
  project graph data, report metadata and canonical examples instead of
  guessing from folder names or vague component names.
- Galerina documentation should maintain one-concept-per-file Knowledge Base
  entries for important concepts, stable names, explicit definitions,
  canonical examples where practical, indexed permissions/effects/contexts and
  component responsibility metadata for compiler, runtime, security and
  tooling components.
- Runtime, compiler, security and tooling components should expose or document
  metadata such as component name, purpose, authority-granting status,
  trusted-core status, runtime stage, package owner, inputs, outputs and
  emitted reports.
- Galerina must not claim legal, privacy, security, accessibility, AI governance
  or deployment compliance automatically. Compliance packages may define
  policy, evidence, review and report contracts, but compliance depends on
  jurisdiction, organisation process, deployment controls and human review.
- Galerina data processing must be package-owned and bounded. HTML parsing,
  search indexing, archive manifests, JSON/database archiving and streaming
  pipelines must live in `galerina-data-*` packages rather than becoming native
  core-language features.
- Galerina database access must be typed, validated, permissioned and reportable.
  Database storage models must be distinct from API response models, and raw
  database models containing personal, secret, hidden or internal fields must
  not be returned by public routes.
- Before adding more active packages, the project must include at least 20 real
  `.fungi` example programs covering basic, intermediate and advanced syntax.
  This requirement is currently satisfied by the 20 source fixtures in
  `packages-galerina/galerina-core/examples/`.

## Users

| User Type | Description |
|---|---|
| App developer | Builds bespoke application source in `packages-galerina/galerina-framework-example-app/` using Galerina packages. |
| Package maintainer | Evolves reusable Galerina package contracts under `packages-galerina/`. |
| Security reviewer | Reviews policy, secret handling, reports and package boundaries. |
| AI coding assistant | Uses `AGENTS.md` and `build/graph` to navigate the project safely. |
| Learner | Uses Learning Mode, examples and guided diagnostics to learn Galerina safely. |
| Teacher | Uses lessons, exercise reports and safe classroom defaults to teach Galerina. |
| Future app user | End user of the bespoke app once a product domain is defined. |
| Future app admin | Operational/admin user once a product domain is defined. |

## Core Workspace Requirements

- The root README must introduce Galerina, the workspace layout, current tooling and
  package boundaries.
- `AGENTS.md` must tell AI tools how to use the project graph and where package
  responsibilities live.
- `galerina.workspace.json` must identify the package paths and documentation roots
  used by tooling.
- Generated project graph outputs must be refreshable from the repository root.
- The workspace must keep generated compiler output out of Git unless a file is
  intentionally committed as an example or report artefact.
- Active core packages must provide typed contract exports and focused tests
  before downstream framework or target packages depend on them. The current
  core package baseline covers network policy/TLS/backend reports, runtime
  context/results/effects/reports, vector/matrix/tensor validation and bounded
  photonic planning contracts.
- Core package examples must be validated by package tests when they are used
  as contract examples rather than prose-only documentation.
- `galerina-core-cli` must route core developer commands to the current
  `galerina-core` prototype compiler until those commands have native package
  implementations.
- NPU support must be treated as AI inference target planning, not as
  general-purpose Galerina execution. Model files remain external, fallback must
  be explicit and reportable, and on-device inference must deny network
  execution unless policy explicitly changes that boundary.
- The workspace must keep secrets out of source control.
- Package READMEs and TODOs must describe package responsibility and remaining
  implementation work.
- This workspace is a beta prototype, not a stable release. Version metadata
  must use beta prerelease identifiers until release criteria are explicitly
  met.
- The future Galerina package split should be documented before implementation:
  `package.json` for normal app/vendor packages, `package-galerina.json` for Galerina
  package dependencies, `galerina.lock.json` for locked Galerina package graphs,
  `packages/` for normal vendor packages and `packages-galerina/` for Galerina packages.
- NPM and `package.json` must remain host ecosystem tooling only. They may run
  current JavaScript/TypeScript prototype checks and package generated JS/TS
  interop, but they must not define Galerina package graph resolution, Galerina runtime
  profiles, Galerina compiler target policy or Galerina production package overrides.
- The Galerina Package Resolver must use `package-galerina.json`, `galerina.lock.json`
  and resolver policy as the governed source for package/module approval. It
  must produce package resolution, package provenance, package permission,
  dependency graph and Governed IR package-map reports.
- `galerina.lock.json` must record registry-derived package evidence where
  applicable: exact version, hash, signature, publisher, source registry,
  requested capabilities, effects used, certification level, dependency graph,
  selected profile and approved runtime targets.
- Generated documents and AI-suggested structures are advisory. Repository
  package boundaries, `AGENTS.md`, `galerina.workspace.json`, package READMEs/TODOs
  and maintained docs take precedence when suggestions conflict.
- Learning Mode must teach real Galerina concepts rather than fake syntax. It may
  provide progressive levels, guided exercises, hints and beginner-friendly
  diagnostics, but examples must remain aligned with documented Galerina syntax.
- Learning Mode execution must be safe by default: no shell, no secrets, no
  filesystem writes, no external network, bounded memory and bounded runtime
  unless a lesson explicitly grants a reviewed permission.
- Learning Mode for children must avoid real-money examples, production deploys,
  personal-data collection, open chat, unsafe links and public sharing by
  default.
- Learning reports must avoid secret values, unnecessary personal data, raw
  student identifiers in shareable reports and private messages.
- Future `galerina-learn*` package names are reserved planning names only. Do not
  add active learning packages until the core examples, parser/checker and
  lesson model are stable enough to justify package ownership.

## App Requirements

The app package must remain deliberately small until a product domain is chosen.

- Bespoke app source must live in `packages-galerina/galerina-framework-example-app/`.
- App routes, modules, tests and app configuration must stay in `packages-galerina/galerina-framework-example-app/`
  or app-specific docs.
- App-specific requirements must be added to this document before implementing
  product features.
- App source must use explicit validation, explicit error handling and safe
  configuration references.
- App features must not be implemented inside `packages-galerina/galerina-core/`.
- App features must not turn `packages-galerina/galerina-framework-app-kernel/` into a full framework,
  CMS, admin dashboard, ORM or frontend framework.

## Non-Functional Requirements

- The template must be secure by default.
- The template must validate external input at typed boundaries.
- Errors must be explicit and safely reportable.
- Application effects must be deny-by-default. File, network, database, shell,
  AI, GPU and interop access must be declared before use.
- Network access must be denied by default. Inbound ports, outbound hosts, raw
  sockets, packet capture, promiscuous mode, shell network tools and wildcard
  network access must require explicit policy and report output.
- Production networked apps must require TLS policy, request/body size limits,
  route-level rate limits, timeout policy and stream backpressure for public
  routes unless an explicit reviewed override exists.
- Cookie-authenticated browser routes that change state must require CSRF
  protection by default.
- CSRF protection must support synchronizer tokens for stateful apps, signed
  double-submit cookies for stateless apps, custom CSRF headers for SPA/API
  clients, Fetch Metadata validation, Origin/Referer validation, SameSite cookie
  defaults and route-level CSRF reports.
- Routes using `GET`, `HEAD` or `OPTIONS` must not perform state-changing
  handler effects such as write, delete, payment, trade, password change, email
  change, account deletion, file upload or admin actions.
- Routes using bearer-token or other explicit non-cookie authorization may
  declare CSRF not required, but must still enforce CORS policy where relevant,
  Origin checks where useful, rate limits, request validation and audit logging.
- CSRF reports must not include CSRF token values, session identifiers, cookies,
  authorization headers or other secret-bearing values.
- Production networked apps must deny plaintext fallback, silent TLS downgrade,
  disabled certificate validation, disabled hostname validation, weak ciphers,
  expired certificates, debug proxying and secrets in URLs.
- Enterprise service-call policy must support mutual TLS, service identity,
  host allowlists and package-level network permissions.
- Sensitive payload policy must support application-layer encryption and
  metadata minimisation where transport encryption alone is not enough.
- API handlers must receive typed, validated request values by default; unknown
  fields, oversized JSON and invalid payload shapes must be rejected at the
  boundary.
- Routes must compile into a typed route graph and route manifest rather than
  remaining loose runtime strings. Route manifests must include HTTP method,
  typed path parameters, request body type, response type, auth policy,
  authorization policy, CSRF/CORS policy where relevant, rate limits, timeout,
  maximum body size, concurrency limits, declared effects, response filtering
  and audit policy.
- Route matching should use a method-indexed precompiled trie/radix-tree or
  equivalent lookup structure so runtime routing does not scan long route lists
  or build regexes on the hot path.
- State-changing routes must not compile unless auth, CSRF or an explicit
  non-cookie auth exemption, idempotency where risky, audit policy and resource
  limits are declared.
- Routes using user-supplied object identifiers must declare object-level
  authorization. Routes returning sensitive response schemas must declare or
  inherit property-level response filtering.
- Route handlers must not perform effects outside the route's declared
  database, network, file, AI, cache, secret or shell permissions.
- API route contracts should declare allowed HTTP responses by status and body
  schema, and handlers/actions must not return undeclared statuses or body
  schemas.
- HTTP responses must be typed security contracts. Each response must declare
  status code, body type, content type, cache policy, security header profile,
  cookie policy where relevant, redirect policy where relevant, field filtering
  policy and safe error exposure policy.
- Raw HTTP responses and mutable raw header maps must be denied by default
  except inside trusted low-level transport packages.
- Private/authenticated routes must not use public cache. HTML responses must
  require a CSP/security-header profile. JSON responses must declare JSON
  content type and `nosniff`. Redirects must target trusted routes or validated
  allowlisted destinations.
- API response helper naming should avoid confusing pairs such as `Response`
  and `Responses`. Prefer a clear split such as `Http` for framework HTTP
  response builders and `AppResponses` for app response body schemas.
- API response checking should report unhandled `Result` values,
  non-exhaustive known error matches, route responses returned but not declared,
  declared responses that cannot be returned and unsafe raw error messages sent
  to users.
- Galerina must not require traditional MVC controllers as a core application
  concept. The secure API core must be route contracts, typed request/response
  objects, route actions or handlers, policies, effects and generated route
  reports.
- Controller-style grouping may be supported later only as optional framework
  sugar that compiles into the same route manifest/graph and does not hide auth,
  CSRF, object access, idempotency, validation, rate limits, audit or effects.
- Galerina may support optional thin DDD structure for business applications, but
  DDD must not be required for small apps, scripts or early compiler examples.
- Thin DDD guidance must keep business rules in `domain/`, use cases in
  `flows/`, external systems in `infrastructure/`, routes in `api/`, runtime
  and security controls in `policies/`, and reports in `reports/` where that
  structure adds clarity.
- Domain code should be pure by default and must not secretly perform database,
  network, file, secret, cache or LLM effects.
- DDD must not be treated as the security model, memory model or compute
  performance model. Security must come from Galerina policies and checks, memory
  safety from Galerina memory rules, and speed from compute policies, profiling,
  caching and target reports.
- Architecture reports may warn about excessive layers, empty wrappers,
  database-shaped domains, unused abstractions, business rules inside API files
  and infrastructure effects inside domain code.
- Raw SQL, unsafe interop, raw shell execution and untrusted deserialization
  must be denied by default in production policy.
- Security reports must include risky permissions, package effects, route
  policy gaps, secret-flow risks, interop adapters and production overrides.
- CLI and task output must redact secrets, bearer tokens, cookies, private keys
  and `SecureString` values.
- Runtime configuration must stay separate from compiled output.
- Build and report artefacts must identify selected targets and fallback
  reasons where relevant.
- Documentation must be updated when architecture, requirements, security, API,
  deployment or package behavior changes.

## Workspace Package Requirements

- The Galerina language core must live in `packages-galerina/galerina-core/`.
- Compiler pipeline contracts must live in `packages-galerina/galerina-core-compiler/`.
- Runtime execution contracts must live in `packages-galerina/galerina-core-runtime/`.
- Shared security primitives must live in `packages-galerina/galerina-core-security/`.
- Project configuration contracts must live in `packages-galerina/galerina-core-config/`.
- Shared report contracts must live in `packages-galerina/galerina-core-reports/`.
- Galerina multi-state logic concepts such as `Tri`, `Galerina` and future Omni logic
  must live in `packages-galerina/galerina-core-logic/`.
- Galerina vector value, lane and operation concepts must live in
  `packages-galerina/galerina-core-vector/`.
- Galerina compute planning, capability, budget and target selection concepts must
  live in `packages-galerina/galerina-core-compute/`.
- Generic AI inference contracts, model metadata, safety policy and AI reports
  must live in `packages-galerina/galerina-ai/`.
- Low-bit and ternary AI inference contracts must live in
  `packages-galerina/galerina-ai-lowbit/`, with BitNet represented only as a backend.
- Supervised AI agent definitions, tool permissions, task groups, merge
  policies and reports must live in `packages-galerina/galerina-ai-agent/`.
- Neural-network model, layer, inference and training boundary contracts must
  live in `packages-galerina/galerina-ai-neural/`.
- Neuromorphic spike, event-signal and spiking model contracts must live in
  `packages-galerina/galerina-ai-neuromorphic/`.
- Photonic and wavelength hardware concepts must live in
  `packages-galerina/galerina-core-photonic/`.
- CPU target planning, feature detection and fallback reports must live in
  `packages-galerina/galerina-target-cpu/`.
- Optimized CPU kernel contracts must live in `packages-galerina/galerina-cpu-kernels/`.
- Native executable target planning must live in `packages-galerina/galerina-target-native/`.
- Portable systems output planning may start in
  `packages-galerina/galerina-target-native/` only after ABI, layout and memory
  report rules stabilise.
- Galerina must treat systems output as a generated backend/interop target, not
  as normal unsafe application source style.
- Future native ABI work must declare ownership, nullability, string encoding,
  allocator/free policy, blocking/thread-safety assumptions and error mapping.
- JavaScript target planning must live in `packages-galerina/galerina-target-js/`.
- WebAssembly target planning must live in `packages-galerina/galerina-target-wasm/`.
- GPU target planning must live in `packages-galerina/galerina-target-gpu/`.
- AI accelerator target planning for NPU, TPU and AI-chip backends must live in
  `packages-galerina/galerina-target-ai-accelerator/`.
- Photonic backend target planning must live in
  `packages-galerina/galerina-target-photonic/`.
- The optional Galerina Secure App Kernel must live in `packages-galerina/galerina-framework-app-kernel/`.
- The built-in Galerina HTTP API server must live in `packages-galerina/galerina-framework-api-server/`.
- Server platform support must distinguish deployment targets, runtime targets
  and adapters. Nginx, Apache and Caddy must be treated as reverse-proxy
  deployment targets; Node.js may be a tooling platform and optional runtime
  target; Express/Fastify/Hono-style integrations must be optional adapters;
  the Galerina-native API server remains the long-term preferred secure runtime.
- Browser-safe web rendering contracts must live in `packages-galerina/galerina-web/`
  and focused `galerina-web-*` packages, not in `galerina-core`, the app kernel or
  the API server.
- The Galerina developer CLI must live in `packages-galerina/galerina-core-cli/`.
- Safe Galerina project automation must live in `packages-galerina/galerina-core-tasks/`.
- Galerina benchmark and diagnostics tooling must live in `packages-galerina/galerina-tools-benchmark/`.
- Galerina project knowledge graph tooling must live in `packages-galerina/galerina-devtools-project-graph/`.
- Bespoke app source must live in `packages-galerina/galerina-framework-example-app/`.
- App documentation must live in `docs/`.
- Language documentation must stay within `packages-galerina/galerina-core/`.
- Full framework features must stay outside `packages-galerina/galerina-core/` and
  `packages-galerina/galerina-framework-app-kernel/`.
- Current development may use one root Git repository while package boundaries
  are still being shaped.
- Later, `packages-galerina/` may become its own Git repository so the Galerina packages can be
  imported into different frameworks.
- If `packages-galerina/` has its own `.git`, it must be added intentionally as a
  submodule or standalone nested repository, and the framework root must treat
  it as an external dependency.
- Development-only packages must use `galerina-devtools-*` or `galerina-tools-*` names for
  staging packages, diagnostics, generators and experiments.
- Development-only packages must be excluded from production package resolution
  and production downloads unless a maintainer explicitly opts into a
  development or staging profile.
- Production boot/profile defaults must disable development-only and benchmark
  packages such as `galerina-devtools-*` and `galerina-tools-benchmark`.
- A production build that includes a default-disabled package must declare an
  explicit production package override with a reason, and the override must be
  visible in config/build/security/deployment reports. Without that override,
  startup or build validation must fail.
- The exact developer package folder name remains provisional, but its boundary
  must stay separate from production runtime package manifests.
- Finance, electrical and OT package planning must stay archived outside the
  active workspace under `C:\laragon\www\Galerina_Archive\packages-galerina\` until post-v2
  package planning resumes.
- Finance, electrical and OT packages must not be part of active v1 package
  resolution, build graph generation, compiler targets or runtime profiles.
- Any future restoration of finance, electrical or OT packages must require a
  design review because these domains carry regulatory, protocol correctness,
  safety and cybersecurity requirements beyond the v1 language scope.
- Package naming must follow `docs/PACKAGE_NAMING.md`: `galerina-target-*` for where
  code runs or compiles to, `galerina-io-*` for how data moves, `galerina-ai-*` for
  AI-specific workloads, `galerina-kernel-*` for low-level execution kernels and
  `galerina-app-*` for runtime/application framework layers.
- `galerina-target-native` and `galerina-target-photonic` must not be renamed to I/O
  package names; binary and photonic I/O should be added later as separate
  `galerina-io-*` packages.

## Archived Electrical and OT Package Requirements

These requirements are preserved as post-v2 archive notes. They do not apply to
the active v1 build graph.

- `galerina-electrical-core` must be a domain package group, not core Galerina syntax.
- `galerina-ot-core` must be an operational-technology integration package group, not
  core Galerina syntax and not a SCADA, PLC or safety controller product.
- Galerina electrical support must be positioned as modelling, validation,
  monitoring, workflow and audit support. It must not replace circuit breakers,
  relays, protective devices, PLC safety systems, grid protection, certified
  controllers or qualified electrical design.
- Early electrical contracts must start with asset models, telemetry ingestion,
  alerts, reports, capacity checks, maintenance schedules, energy reports, OT
  network policy and protection setting record/audit evidence.
- Early electrical contracts must avoid direct breaker control, relay protection
  replacement, PLC replacement, safety interlock control, unsupervised
  switching and real-time grid control.
- Electrical asset models may cover panels, circuits, breakers, cables, loads,
  meters, transformers, inverters, batteries, EV chargers, UPS, generators,
  relays and sensors.
- Electrical telemetry may cover voltage, current, power, power factor,
  frequency, phase imbalance, harmonics, temperature, breaker state, relay
  state, battery state of charge, solar generation, EV charger demand and UPS
  load.
- Electrical control policy must be deny-by-default. Reading telemetry,
  creating alerts and opening maintenance work orders are lower risk. Changing
  setpoints, switching load and breaker operations are high risk and must
  require explicit policy, approval, signed jobs, audit and suitable local
  safety interlocks.
- Protection setting support must manage records, versions, approvals, test
  evidence, rollback plans and compatibility reports. It must not replace
  protection relay behaviour.
- OT packages may define adapter boundaries for OPC UA, IEC 61850, Modbus, MQTT
  and SCADA connectors, but concrete protocol stacks and vendor integrations
  should remain package-specific and permissioned.
- OT security must require read-only defaults, network segmentation, host
  allowlists, signed commands, operator approval, mTLS where appropriate, no
  arbitrary scripts, no undeclared package network access and audit of all
  control attempts.
- Electrical and OT reports must avoid raw secrets, unnecessary personal data
  and unsafe control payloads.

## Archived Finance Package Requirements

These requirements are preserved as post-v2 archive notes. They do not apply to
the active v1 build graph.

- `galerina-finance-core` must be a domain package group, not core Galerina syntax.
- Finance support must start with typed data, deterministic maths, validation,
  audit, replay and integration contracts rather than live trading systems.
- Finance maths must disallow float money by default, require explicit rounding
  mode and make rounding decisions reportable.
- Market-data contracts must model instruments, exchanges, sessions, quotes,
  trades, order book levels, candles, snapshots, source metadata and replayable
  event streams.
- FIX support must be defined as an integration package boundary for message
  dictionaries, validation, session state, sequence numbers, heartbeats, resend
  requests, rejects, execution reports, order cancel/replace and persistence
  policy.
- Finance audit must support immutable event references, message hashes, order
  lifecycle reconstruction, risk decision reports, permission decision reports
  and redacted evidence bundles.
- Risk and pricing package work must wait until finance maths, market data and
  audit contracts are stable enough to support them.
- Galerina finance packages may wrap mature external finance ecosystems through
  controlled interop, but wrappers must declare memory
  isolation, credential policy, network permissions, audit requirements and
  fallback behaviour.
- Early Galerina finance work must not claim to implement a full stock exchange,
  HFT engine, broker-dealer platform, settlement system, clearing system,
  custody platform or regulated trading-advice engine.

## Secure App Kernel Requirements

- The kernel may define typed API boundaries, validation, auth policy,
  rate-limit policy, idempotency, replay protection, jobs and runtime reports.
- The kernel must receive raw requests and pass only typed, validated values to
  Galerina handlers unless unsafe raw access is explicitly declared.
- The kernel must enforce `boot.fungi` security policy at runtime where a runtime
  adapter is present.
- The kernel must support adapter boundaries for HTTP servers, queue backends,
  storage backends and identity providers.
- The kernel must not include CMS features, admin dashboards, page builders,
  mandatory ORM design, mandatory template engines or frontend framework syntax.
- The kernel package must support a non-compiled checked Run Mode smoke test for
  validating simple `.fungi` execution during framework development.

## API Server Requirements

- `galerina-framework-api-server` must be an HTTP serving package, not a full web framework.
- `galerina-framework-api-server` must load route manifests generated from Galerina API contracts.
- `galerina-framework-api-server` should use precompiled route lookup structures
  generated from route manifests where available, such as method-indexed
  tries/radix trees, and must reject unknown methods/paths early.
- `galerina-framework-api-server` must normalise HTTP requests before passing them to
  `galerina-framework-app-kernel`.
- `galerina-framework-api-server` must enforce server-level limits such as body size, timeout,
  connection shutdown and safe response writing.
- `galerina-framework-api-server` must not try to become Nginx, Apache, Caddy,
  Express, Fastify, Laravel, Django, Rails, a CMS, a template engine or an ORM.
- `galerina-framework-api-server` must ask `galerina-framework-app-kernel` for auth, validation, idempotency and
  typed route execution decisions.
- `galerina-framework-api-server` must redact secrets, bearer tokens, cookies and SecureString
  values from logs and reports.
- Bespoke frameworks may either use `galerina-framework-api-server` or call `galerina-framework-app-kernel`
  directly from their own HTTP layer.

## CLI and Task Requirements

- `galerina-core-cli` must provide developer commands for checking, building, running,
  serving, reporting, route inspection, security checks and task execution.
- `galerina-core-cli` may coordinate `galerina-core`, future compiler/runtime packages,
  `galerina-framework-api-server` and `galerina-core-tasks`, but must not contain application behaviour.
- `Galerina graph` must generate project graph JSON, Markdown report, AI map and HTML
  outputs.
- `Galerina task` must load task files, list tasks, resolve dependencies, detect
  cycles, support dry-run planning and write task reports.
- `galerina-core-tasks` must provide safe, typed project automation with declared effects
  and permissions.
- `galerina-core-tasks` must validate filesystem permissions as safe repository-relative
  paths.
- `galerina-core-tasks` must validate environment permissions as explicit variable names.
- `galerina-core-tasks` must deny raw shell execution by default.
- Unsafe shell support, if added later, must be explicit, permissioned,
  timeout-limited, reported and redacted.
- Both packages must redact secrets, bearer tokens, cookies, `SecureString`
  values and private key material from output and reports.

## Benchmark Requirements

- `galerina-tools-benchmark` must own benchmark configuration, task definitions, result
  types, score categories, privacy policy and report payload contracts.
- Benchmarking must prioritize correctness, fallback behavior and safe
  execution before raw speed.
- Light mode must be the default and must be bounded by total runtime, per-test
  runtime and safe memory limits.
- Full and stress modes must be explicit opt-in modes and must not run
  automatically.
- Benchmark runs must be manual, CI-explicit or development-only major-version
  checks. They must never auto-run in production.
- `galerina-tools-benchmark` must be disabled by default in production boot/package
  profiles. Even if explicitly overridden for a production validation window,
  it must not auto-run.
- GPU, low-bit AI and future accelerator tests must be optional and must report
  skipped or fallback status when unsupported.
- Public benchmark names and Galerina syntax must stay backend-neutral. BitNet may be
  selected as a low-bit backend, but benchmark categories should use
  `low_bit_ai`, `ternary_ai` or `quantized_ai`.
- Benchmark reports must omit hostname, username, project path, environment
  variables, secrets, private repo names and raw benchmark input data.
- Future benchmark sharing must be opt-in and must prepare an anonymous payload
  by default.
- Hash and byte-processing tests must be framed as generated-data throughput,
  checksum or validation tests, not password cracking, token guessing or
  malicious brute forcing.
- MD5, if benchmarked, must be labelled as a legacy checksum throughput test and
  not a secure-hashing recommendation.

## Project Graph Requirements

- `galerina-devtools-project-graph` must own project knowledge graph contracts for packages,
  documents, flows, types, effects, policies, reports, targets and decisions.
- Project graph tooling must be optional developer tooling and must not be
  required to compile or run Galerina applications.
- Project graph output may explain security and architecture relationships, but
  it must not replace compiler checks, runtime policy enforcement or security
  reports.
- Project graph scans must redact secrets by default.
- Project graph syntax and CLI commands must stay backend-neutral; `Galerina graph`
  must not become `Galerina graphify`.
- Graphify or any future graph tool must be represented as a swappable backend
  selected by policy, not as Galerina language syntax.
- Git-sourced project graph backends must be explicitly allowed and pinned to a
  commit, tag or versioned ref.
- Model-assisted extraction for documents, PDFs, images, audio or video must be
  opt-in and reported.
- Project graph outputs should include JSON, human-readable report and AI map
  paths so assistants can query project relationships without rereading every
  file.
- The native project graph mapper should map workspace packages, package docs,
  exported TypeScript contracts, package metadata, project docs and generated
  graph report outputs.

## Logic and Photonic Package Requirements

- `galerina-core-logic` must own `Tri`, `Galerina`, future Omni logic, multi-state truth
  tables, conversion rules and logic reports.
- `galerina-core-logic` must validate declared logic widths, state names, state
  indexes and truth-table coverage so malformed or incomplete logic definitions
  cannot silently become accepted semantics.
- `Tri` conversion helpers must require an explicit unknown policy. Unknown
  values must never become `true`, `Allow` or other grant states through an
  implicit conversion.
- `galerina-core-photonic` must own wavelength, phase, amplitude, optical signal,
  optical channel, photonic modelling and photonic simulation concepts.
- `galerina-core-photonic` may map logic states from `galerina-core-logic` to photonic
  representations, but it must not own the logic semantics.
- `galerina-core-vector` must own vector values, dimensions, lanes, vector operation rules
  and vector reports.
- `galerina-core-vector` must also own matrix, tensor, shape and numeric element contracts
  used by neural and compute workloads.
- `galerina-core-compute` must own compute planning, capability, budget, offload and target
  selection concepts.
- `galerina-ai` must own generic AI inference contracts, prompt/response shapes, model
  capability metadata, memory estimates, safety policy and AI reports.
- `galerina-ai-agent` must own typed agent definitions, tool permissions, agent limits,
  supervised task group plans, merge policies and agent reports.
- `galerina-ai-neural` must own neural-network model definitions, layers, activations,
  inference boundaries, training boundaries and neural reports.
- `galerina-ai-neuromorphic` must own spikes, spike trains, event signals, spiking model
  contracts and neuromorphic reports.
- `galerina-ai-lowbit` must own low-bit and ternary model references, GGUF metadata,
  quantization declarations, backend selection, CPU inference limits and low-bit
  AI inference reports.
- Enterprise `galerina-compliance` must own umbrella compliance profile, evidence
  manifest and compliance report index contracts when unlocked.
- Enterprise `galerina-compliance-*` packages must own focused policy/report
  contracts for privacy, security control mapping, data governance, audit,
  retention, AI governance, accessibility, deployment policy and compliance
  reports when unlocked. They must not provide legal advice, certification
  claims, audit databases, identity providers, data warehouses, frontend
  frameworks or CI/CD systems.
- Compliance packages must live under `packages-galerina-enterprise/` and must
  not be part of the active workspace, active v1 build graph, production
  package resolution or default runtime profiles unless explicitly unlocked by
  the project owner.
- `galerina-data` must own umbrella data-processing vocabulary, package policy,
  memory-limit, archive-integrity and report index contracts.
- `galerina-data-*` packages must own focused contracts for HTML processing,
  search, archive integrity, JSON archive, database export/archive, streaming
  pipelines and data-processing reports. They must not implement browser
  engines, database engines, search engines, object storage, unsafe parsers or
  unbounded scraping frameworks.
- `galerina-data-db`, `galerina-data-model`, `galerina-data-query` and
  `galerina-data-response` must own typed database boundary, storage model,
  query/command and safe response mapping contracts. Raw SQL must be denied by
  default unless an explicit reviewed and reported override exists.
- `galerina-web` must own umbrella browser-safe web package policy and report
  indexes.
- `galerina-web-render` must own the typed browser rendering pipeline: validated
  API response, typed state conversion, safe HTML rendering, state diffing,
  streaming batches, generated DOM/update plans and render reports.
- `galerina-web-state` must own client state, state transitions, hydration,
  partial-data states and state diff plans.
- `galerina-web-components`, `galerina-web-router` and `galerina-web-events` must own
  typed browser component, route/navigation and event contracts.
- Browser rendering must escape text by default, deny raw HTML by default,
  require `SafeHtml` or equivalent sanitized/trusted HTML for HTML rendering,
  and block rendering when API data fails schema validation.
- Browser rendering reports must include API schema status, render mode, unsafe
  HTML status, streaming status, remote image/domain warnings, performance
  warnings and redacted security findings.
- `galerina-web-*` packages must not become a browser engine, CMS, admin UI, CSS
  framework, page builder or mandatory frontend framework.
- `galerina-db-*` packages must own provider adapter contracts only. PostgreSQL,
  MySQL, SQLite, OpenSearch and Firestore adapters must not bypass typed
  models, validation, permissions, parameterised access, safe response mapping,
  archive policy or report output.
- `galerina-target-native` must own future native executable target planning,
  native ABI boundary planning and artifact metadata.
- `galerina-target-js` must own browser JavaScript output planning, ESM metadata,
  source-map rules, server-only import blocking, browser secret denial and
  JavaScript output reports.
- `galerina-target-js` may also own JavaScript/Node.js output planning metadata
  for server targets, but Node.js support must remain a target choice rather
  than the identity of Galerina.
- `galerina-target-cpu` must own CPU capability, feature, thread, memory and fallback
  planning contracts.
- `galerina-target-cpu` should own CPU cache fact detection contracts where
  available, including cache line size and exposed L1/L2/L3 metadata, while
  reporting unknown when platform details are hidden.
- `galerina-cpu-kernels` must own CPU kernel contracts for GEMM, GEMV, vector dot
  products, matrix multiplication, low-bit operations, ternary operations,
  tiling and threading plans.
- `galerina-target-wasm` must own WebAssembly target planning, module metadata and
  import/export contracts.
- `galerina-target-gpu` must own GPU target planning, kernel mapping, precision and
  data movement reports.
- `galerina-target-ai-accelerator` must own NPU, TPU, AI-chip capability reports,
  precision support, model operation mapping plans and accelerator fallback
  reports.
- AI accelerator support must be passive and vendor-neutral. Galerina source syntax
  should use `ai_accelerator`, not vendor-specific targets such as `gaudi`.
- Vendor devices such as Intel Gaudi 3 must be represented as backend profiles
  selected by config, adapter policy or capability detection.
- AI accelerator profiles must report preferred workloads, supported
  precisions, memory tiers, framework adapters, topology, fallback target and
  warnings.
- Intel Gaudi 3 should be documented as an AI accelerator profile for LLM
  inference, fine-tuning, RAG, embeddings, multimodal AI and tensor batching,
  not as a normal CPU or GPU.
- First AI accelerator implementations should prefer controlled adapters over
  existing ecosystems such as PyTorch, vLLM, Hugging Face, DeepSpeed,
  TensorFlow or PyTorch Lightning before native backend work.
- `galerina-target-photonic` must own photonic backend target planning and may use
  `galerina-core-photonic` concepts.
- `optical_io` must be treated as a high-speed data-movement and interconnect
  target, not as a normal CPU, GPU or photonic compute target.
- Galerina must not expose raw light control to normal developers. Optical I/O
  must be represented as a deployment capability for topology-aware,
  encrypted, typed data movement across optical-capable infrastructure.
- Optical I/O target planning must distinguish Ethernet, Wi-Fi, fibre, RDMA,
  RoCE, optical I/O, co-packaged optics and photonic interconnect capabilities.
- Intel Silicon Photonics and OCI-style devices must be documented as optical
  connectivity for distributed compute, AI infrastructure, accelerator
  communication, GPU disaggregation and memory pooling.
- `galerina-core-compute` must model data movement as a first-class cost for optical I/O
  planning, including transfer size, data locality, target placement, fallback
  path, serialization format, compression choice, encryption overhead and
  accelerator locality.
- Optical I/O reports must include detected interconnect, provider, bandwidth
  estimate, latency estimate, fallback path, largest transfers, compression or
  binary format use, remote memory status, topology redaction status,
  energy estimate where available and security/encryption policy.
- Optical I/O security policy must require encryption, endpoint identity,
  service identity, signed topology where available, no plaintext fallback,
  no unknown endpoint transfer, audit logging and redacted reports.
- Remote memory or memory-pool access over optical I/O must require typed access
  policy, bounds checks, timeout handling, fallback rules, audit logging and
  redacted reports.
- `galerina-tools-benchmark` should support a future `optical_io` benchmark target for
  latency, throughput, tensor transfer, schema-compressed transfer, encryption
  overhead, topology detection, remote memory read and fallback diagnostics.

## Compiler, Runtime, Security, Config and Report Requirements

- `galerina-core-compiler` must own compiler pipeline contracts for lexing, parsing, AST,
  checkers, IR, diagnostics, source maps and compiler reports.
- `galerina-core-compiler` must use the language-core maturity roadmap as a
  foundation checklist: real parser, AST, symbol table, type checker, memory
  checker, effect checker, IR, output, debug/release modes and source-mapped
  runtime errors.
- Until the full parser/checker exists, `galerina-core-compiler` must provide a
  conservative syntax safety scan for the frozen v1 core risks: direct Tri
  branch conditions, implicit Tri/Decision/Bool boundary assignments,
  non-exhaustive Tri matches, risky secure-flow unknown conversion, raw
  secret-like literals and unsafe dynamic execution forms.
- `galerina-core-runtime` must own execution contracts for checked and compiled Galerina code.
- `galerina-core-runtime` may collect runtime memory, cache and hardware
  reliability facts where the environment exposes them, but must report unknown
  status honestly for containers, VMs and managed platforms.
- `galerina-core-network` must own network I/O policy, profile, permission,
  backend capability and report contracts. It must not own HTTP framework
  behavior, TLS implementation, DNS resolver implementation, kernel driver code
  or DPDK runtime bindings.
- `galerina-core-network` must define safe-networking contracts for TLS 1.3
  policy, plaintext denial, certificate and hostname validation, mutual TLS,
  service identity, secret-safe URLs, metadata minimisation and packet-capture
  restrictions.
- `galerina-core-security` must own reusable security primitives, redaction rules,
  permission models, security diagnostics and security report contracts.
- `galerina-core-security` must support application-security positioning where
  Galerina is secure by default, typed by default, permissioned by default,
  reportable by default, deployment-aware by default and AI-safe by default.
- Security primitives must represent sensitive values as redacted references in
  reports and diagnostics, not as raw secret values.
- Security helpers must provide reusable redaction, safe token/cookie/header
  references, permission decisions and cryptographic policy validation.
- Security primitives must support `Secret<T>` or equivalent protected secret
  references, secret-derived taint tracking, secret fingerprint metadata,
  secret-safe sink decisions and fail-closed denial for logs, errors, cache,
  LLM input, build output and undeclared outbound destinations.
- Redaction helpers must fail closed by default when a rule is malformed, an
  input exceeds configured redaction limits or a replacement could re-emit the
  matched secret or surrounding context.
- Permission decisions must deny by default and must give matching deny grants
  precedence over matching allow grants. Default-allow and wildcard-allow
  models must be reportable diagnostics.
- `galerina-core-config` must own project config, environment mode and policy loading
  contracts.
- `galerina-core-config` must represent environment variables as safe references by name
  and metadata; it must not expose secret values in diagnostics or runtime
  handoff objects.
- `galerina-core-config` must provide production strictness checks for strict project mode,
  required environment variables and unsafe secret defaults.
- `galerina-core-config` must enforce production-disabled package defaults for
  development-only and benchmark packages, while supporting explicit reported
  production package overrides when policy allows them.
- `galerina-core-config` must validate the boundary between host package manifests
  and Galerina package manifests. Galerina package graph keys must not be accepted from
  `package.json`; they belong in `package-galerina.json`, `galerina.lock.json` or explicit
  Galerina config once those schemas exist.
- `galerina-core-config`, `galerina-core-security`, `galerina-core-reports` and future
  package tooling must support Package Resolver policy, including allowed
  registries, denied registries, lockfile requirement, signature/hash
  requirement, dynamic loading denial, package provenance and package permission
  reports.
- Package report contracts should include package certification, package
  provenance, package risk, package permission, dependency graph and lockfile
  reports.
- `galerina-core-reports` must own shared report schemas and report-writing contracts.
- Shared report contracts must include common metadata, generator metadata,
  diagnostic summaries and typed build, security, target, runtime, task and AI
  guide report shapes.
- Shared report contracts must include async/concurrency report shapes for
  Structured Await, including await sites, groups, missing timeout counts,
  unscoped task counts and structured-concurrency status.
- Shared report contracts should include storage and build-cache planning shapes
  for detected storage facts, unknown-storage fallback, conservative cache mode,
  cache hits, misses, bypasses, evictions and invalidations.
- Shared report contracts must include processing report shapes for resilient
  flows, partial success, retries, quarantined items and failure summaries.

## Storage-Aware Performance Requirements

- Galerina must not claim to support M.2, NVMe, SSDs or storage controllers directly.
  Operating systems, drivers, firmware and hardware controllers own physical
  storage access.
- Galerina may detect storage capability where available and use it to guide
  incremental compilation, IDE indexing, project graph scanning, large-file
  processing, JSON streaming, asset pipelines and diagnostics.
- Storage detection must degrade to `unknown` in containers, virtual machines,
  cloud volumes, network storage or restricted environments.
- Cache behavior must be conservative by default: bounded, rebuildable,
  content-addressed where practical, safe to bypass and safe to delete.
- Only deterministic, non-secret, rebuildable data may be cached automatically.
- Galerina must not automatically cache secrets, raw sensitive payloads, authorization
  decisions, non-deterministic results, database query results or external API
  responses.
- Application-level caching of database/API data must require explicit
  app/framework policy.
- Build and IDE caches must be invalidated by relevant source, config, package
  lock, tool version and policy changes.
- Large file and large JSON workflows should prefer streaming, bounded batches,
  read-only views and explicit clone/copy-on-write rules.
- Reports should show storage kind when known, unknown-storage fallback,
  recommended conservative cache mode, cache use, cache bypass and invalidation
  reasons.

## Structured Task/Wait Requirements

- Galerina uses `task` to start governed async work and `wait` to collect the
  result. `async`/`await` are not used — they imply uncontrolled async models
  that conflict with runtime governance.
- Galerina must not expose futures, promises, pinning, executors or manual polling
  as the normal application model.
- Galerina must support grouped waits through `wait all`, race waits through
  `wait race`, bounded stream processing through `wait stream`, queue handoff
  through declared queue/job contracts and retry through explicit retry policy.
- Every task must belong to a scope. When a scope ends, unfinished child work
  must be cancelled, completed or handed off according to explicit policy.
- `fn` (pure helper functions) must not use `task` or `wait`. Only `flow` may
  start tasks and collect results.
- A `flow` must not return until all required `wait` calls complete.
- Waiting on external network or database work must require timeout policy in
  production profiles.
- Cancellation must be a normal declared policy, with modes such as
  `cancelOnError`, `waitForAll`, `firstSuccess`, `firstResult`,
  `timeoutCancel` and `manualCancel`.
- Hidden background work must be denied by default. Work that outlives a
  request must use a typed, reportable queue/job contract.
- Streams must declare bounded concurrency, backpressure policy and maximum
  in-flight work.
- Compiler diagnostics should warn when independent sequential waits could use
  `wait all`.
- Build and runtime reports should expose async behaviour through deterministic
  task, wait, concurrency, timeout and queue report entries.
- The concept is documented in `../../ZTF-Knowledge-Bases/async-task-model.md`.

## Resilient Flow Requirements

- `resilient flow` must mean controlled recovery, not silent error ignoring.
- Item-level failures may continue only when the flow declares an explicit
  recovery policy.
- System/runtime failures such as memory corruption, unsafe native failure or
  runtime integrity failure must stop the affected flow or restart safely under
  supervision.
- Recoverable item failures must be classified, recorded and reported.
- Retry must apply only to errors marked retryable.
- Quarantined items must be retained safely for review rather than discarded.
- Long-running resilient flows should support checkpoint and resume where safe.
- Security-sensitive workflows should fail fast or use transactions, rollback,
  idempotency and hold-for-review policy instead of continuing.
- Recovery reports must include total, success, failed, retried, quarantined,
  stopped and failure-type summary fields.

## AI and Low-Bit Backend Requirements

- AI inference must be target-neutral at the `galerina-ai` layer.
- AI agents must declare input type, output type, tools, effects, permissions,
  memory budget, timeout, rate limits and failure behaviour.
- Parallel agents must run inside supervised task groups, queues, worker pools
  or equivalent runtime supervision.
- AI agents must be treated as untrusted workers by default.
- AI agents must not directly access files, `.env`, raw secrets, databases,
  network, terminal, Git, other agents, deployment tools or LLM memory.
- AI agents must use typed message passing through a runtime-controlled message
  bus rather than direct agent-to-agent communication.
- Agent visibility scopes must limit which files, reports and context an agent
  can see, and must exclude `.env`, secret files, private logs and raw
  production data by default.
- Agent tool use must go through a tool gateway with explicit allow and deny
  rules for commands, arguments, files, environment and result redaction.
- Agents must normally propose file changes, dependency installs, migrations and
  deployments rather than applying them directly.
- Human approval must be required by default for file writes, dependency
  installs, database migrations, production deploys, secret creation/rotation,
  bulk email, payment actions and permission changes.
- Agent memory and passive LLM cache must deny secrets, raw personal data,
  authorization headers, cookies and environment values by default.
- Multi-agent runtimes must enforce max steps, max agent calls, max retries,
  max runtime and loop detection.
- Every multi-agent run must produce an audit report covering agents used,
  tools used, files read or proposed for change, cache decisions, policy
  violations, secrets access decisions and human approval requirements.
- Agent outputs may inform decisions but must not directly authorize security,
  payment, access-control or deployment decisions.
- Neural-network support must live in `galerina-ai-neural`, not `galerina-core`.
- Neural workloads must use tensor shapes from `galerina-core-vector`, compute planning
  from `galerina-core-compute` and safety/report contracts from `galerina-ai`.
- Training flows must declare dataset reference, data policy, loss function,
  optimizer, epochs, batch size, memory limit and timeout.
- Neuromorphic support must live in `galerina-ai-neuromorphic`, separate from normal
  tensor neural networks.
- Low-bit AI support must be optional and must not be required by `galerina-core`.
- Galerina source syntax must use generic targets such as `low_bit_ai` and
  `ternary_ai`, not a backend name such as BitNet.
- BitNet should be treated as one optional backend for compatible low-bit AI
  inference when GPU, NPU or other accelerator targets are unavailable or not
  permitted.
- BitNet ternary weights and other model weight formats must not be treated as
  Galerina `Tri` truth semantics.
- AI inference declarations must include explicit model reference, context
  limit, output token limit, timeout, thread limit and memory estimate.
- AI output must be untrusted by default and must not directly authorize
  security, payment, access-control or other high-impact decisions.
- Compute target selection reports must record when `low_bit_ai` or
  `ternary_ai` was selected, which backend was used and why higher-preference
  targets were not selected.
- AI accelerator and photonic targets must be optional. CPU-compatible fallback
  must remain the baseline for Galerina developer workflows.

## Passive LLM Cache Requirements

- Galerina may support passive LLM, embedding, RAG/chunk, schema-output,
  code-analysis and AI-context caches.
- Passive cache means developers call the LLM normally and Galerina decides
  whether to read, write, bypass or block cache use according to policy.
- Passive LLM caching must be automatic only when the input and output are safe,
  typed, source-tracked, privacy-checked and reportable.
- Galerina must not cache raw secrets, API keys, access tokens, payment card data,
  authentication headers, raw customer chat messages, medical data, legal case
  data, private documents, unredacted personal data, webhook secrets, one-time
  codes or session cookies by default.
- Galerina must not cache unvalidated free-text LLM output by default. Cacheable
  LLM output should pass typed schema validation, required-field validation,
  confidence validation where relevant, unsafe-content checks and secret-leakage
  checks.
- LLM cache keys must include provider, model, model version, system prompt
  hash, input hash, context hash, output schema hash, tool manifest hash,
  temperature, `top_p`, seed where available, Galerina version, security policy
  hash and package/source hashes where relevant.
- Embedding cache keys must include text hash, embedding model, model version,
  normalisation settings, chunking settings, provider and project/tenant
  isolation key.
- Semantic cache must be disabled by default and require explicit policy. It
  must be denied by default for payments, legal decisions, medical advice,
  security decisions, webhooks, financial calculations and access control.
- Passive LLM cache entries must be invalidated when model, model version,
  system prompt, output schema, tools, RAG context, security policy, Galerina
  compiler version, package version, source file or project/tenant isolation
  key changes.
- Production LLM cache stores must require tenant isolation, encryption at rest,
  TTL, redaction, purge support, audit logging and permission checks.
- Passive LLM cache reports must include enabled state, store type, hits,
  misses, blocked counts, blocked reasons, models used, semantic-cache status,
  invalidation facts and whether secret values were stored.
- Passive LLM cache reports must not include prompt text, raw user text, secret
  values, credentials, authorization headers, cookies or unredacted personal
  data by default.

## Deployment Auto-Configuration Requirements

- Galerina deployment must be based on portable project intent, not developer
  machine assumptions.
- Deployment declarations should support target auto-detection, runtime
  capability profiles, architecture-aware builds, generated deployment
  artifacts, preflight checks, health checks, readiness checks, smoke tests,
  stability watches and rollback metadata.
- Kubernetes must be treated as an optional deployment target, not a required
  runtime for every Galerina app.
- Basic Kubernetes output may include Deployment, Service, Ingress or Gateway,
  ConfigMap, Secret references, ServiceAccount, health/readiness/startup probes,
  resource requests and limits, rollout settings and deployment reports.
- Galerina must never emit real secret values into Kubernetes YAML. Production
  Kubernetes output must prefer secret references or external secret stores and
  warn when Kubernetes Secrets are used without evidence of encryption at rest
  and least-privilege RBAC.
- Kubernetes deployment checks must block or warn on root containers, privilege
  escalation, writable root filesystems, missing resource limits, missing
  readiness probes, `.env` mounts, broad service accounts, `cluster-admin`,
  images tagged `latest`, missing image signatures where required and missing
  rollback metadata.
- Advanced Kubernetes policy packs, NetworkPolicy generation beyond basic
  declaration, RBAC minimisation, admission policy templates, secret-store
  integration templates, multi-environment overlays and production hardening
  automation must remain reserved enterprise work under `docs/ENTERPRISE.md`
  unless explicitly unlocked.
- Git-tracked deployment files should describe intent and policy. Local machine
  profiles, runtime profiles, tuning results, deployment secret metadata,
  benchmark caches and `.env` files must not be committed.
- Deployment checks must block production deployment when required secrets are
  missing, hardcoded secrets are detected, `.env` files are included in build
  output, debug mode is enabled, dev packages are included, package permissions
  are unknown, unsafe network rules are present, health/readiness endpoints are
  missing, smoke tests fail or the selected target does not match the runtime.
- Runtime capability profiles must contain metadata only. They must not contain
  secret values, private logs, raw credentials, authorization headers, cookies
  or unredacted personal data.
- Production first boot should detect operating system, architecture, CPU
  features, container status and memory limits before selecting runtime and
  compute settings.
- Runtime auto-tuning must be bounded, safe and time-limited. It must not run
  extreme benchmarks in production.
- Compute auto-selection must verify target-specific outputs against a safe
  reference where correctness or precision matters, and must fall back to a safe
  CPU scalar path when target-specific acceleration is unavailable or unsafe.
- Traffic must not be enabled until readiness checks and required smoke tests
  pass.
- Deployment reports must include target detection, build target, secret
  availability, secret exposure status, security/dependency/memory/deployment
  report status, health/readiness/smoke-test status, traffic status and rollback
  availability.
- AI-readable deployment context must include only non-secret metadata and must
  explicitly list data that must not be exposed.

## Runtime Naming Requirement

- `galerina-framework-app-kernel` must remain the secure application boundary package.
- A future `galerina-core-runtime` package, if added, should be the Galerina execution engine for
  compiled or checked Galerina code.
- `galerina-framework-app-kernel` must not be renamed to `galerina-core-runtime`, because API policy and
  code execution are separate responsibilities.

## Generative Runtime Mapper Requirements

- A future Generative Runtime Mapper may consume runtime reports, project graph
  data, effect graphs, permission reports, AI/tool reports, memory reports,
  performance reports, security-denial reports and source-code structure
  reports to build explainable runtime, security, code and optimisation maps.
- The mapper must be observational and advisory by default. It must not
  silently mutate runtime state, source code, permissions, policies or
  deployment configuration.
- Mapper output must clearly separate facts from suggestions. Runtime facts
  must come from typed reports, structured events or project graph data before
  AI-generated recommendations are added.
- Mapper suggestions may include optimisation opportunities, refactoring
  proposals, permission downgrades, route isolation, rate limiting, streaming,
  test gaps, memory-pressure reduction, compute-target candidates and security
  hardening.
- Any generated patch, runtime change, policy change or configuration change
  must be treated as a proposal requiring explicit approval.
- Mapper telemetry must redact secrets, raw credentials, private payloads,
  tokens, cookies, authorization headers, sensitive personal data and private
  AI prompts.
- Mapper exports intended for future ML training must be structural,
  redacted, provenance-linked and free of secrets and private payloads.
- The mapper must be policy-governed and auditable. It must not become
  self-authorizing, self-modifying or a bypass around Galerina capability and
  effect controls.
- Candidate mapper package planning may include runtime telemetry, runtime
  graph, runtime insight, AI runtime analysis, code graph, code insight and
  refactor planning packages, but those candidates do not imply implemented
  Galerina syntax or active package creation.

## AI As Untrusted Reasoning Worker Requirements

- Galerina must treat AI as an untrusted reasoning worker, not as trusted program
  logic. AI may suggest, Galerina must verify and the runtime must enforce.
- Future AI support should be expressed through typed contracts such as
  `AiTask`, `AiWorker`, `AiModel`, `AiContext`, `AiEvidence`, `AiClaim`,
  `AiDecision`, `AiToolCall` and `AiReport`, but these names remain planning
  concepts until syntax is formally specified.
- AI outputs must declare claims, evidence, confidence, missing information,
  requested tool use and whether human review is required.
- AI execution must happen after the security phase. A future runtime pipeline
  should load trusted policy, load untrusted context, redact secrets, run the
  AI worker, validate structured output, verify claims against evidence,
  enforce permissions, require human approval where needed and emit reports.
- Galerina cannot fully prevent hallucination, but hallucinated output must be
  non-authoritative. Claims without evidence must be unverified; claims without
  sources must not become facts; low confidence and contradictions must require
  review or escalation; missing data must return `Unknown` rather than a guess.
- AI workers must be sandboxed by default with no secrets, filesystem, network
  or database-write access unless explicitly granted by typed policy.
- AI inference, AI reasoning, AI tool use, AI memory and AI authority must be
  separate concerns. AI authority must never be automatic.
- AI output must not directly mutate state, change policy, deploy code, send
  email, access secrets, grant permissions, write databases or call external
  networks unless a typed policy explicitly grants that ability and runtime
  enforcement allows it.
- Future anti-hallucination and AI audit reports should include AI context,
  claim, evidence, tool permission, hallucination-risk and human-review
  reports.
- AI tool calls must be explicit typed runtime actions with declared purpose,
  input shape, data classification, required permission, evidence need,
  approval status, result status and audit event.

## Untrusted File And Asset Processing Requirements

- Galerina must treat images, PDFs, Office files, archives, SVGs, media files
  and embedded assets as untrusted executable-adjacent content.
- File extension and MIME type must not be treated as sufficient trust
  evidence. Security classification must consider signatures, size, structure,
  active content indicators, policy and parser risk.
- Uploaded files must enter quarantine before reaching main runtime logic,
  browser rendering, PDF rendering, AI context, filesystem persistence,
  database storage or privileged parsers.
- Parsing of untrusted files must run in isolated worker contexts with bounded
  memory, bounded runtime, no secrets, no ambient filesystem access and no
  network access unless explicitly policy-granted.
- Active content such as PDF JavaScript, Office macros, SVG scripts, embedded
  executables, launch actions, forms, external references and HTML in metadata
  must be denied by default.
- Sanitisation should prefer reconstruction from validated content, for
  example image decode plus metadata stripping plus clean re-encode, or PDF
  rendering/extraction plus safe rebuild.
- File inspection must support streaming and bounded limits, including decoded
  size estimates, page limits, pixel limits, archive depth limits, file count
  limits, memory limits and time limits.
- Raw uploaded PDFs, images, Office files and media must not be fed directly
  into AI context. They must first be quarantined, classified, sanitised and
  converted into safe structured content where AI processing is needed.
- Future report families should include file security, sanitisation,
  parser-worker, asset conversion, active-content and archive-inspection
  reports.

## Bit Width And Base64 Asset Policy Requirements

- Normal Galerina application code should not need to think about bit size, but
  low-level, binary, AI, network, image, crypto and interop boundaries must use
  explicit numeric representation.
- Safe default numeric concepts should avoid silent overflow, truncation,
  signed/unsigned confusion and architecture-specific assumptions.
- Fixed-width numeric concepts such as `UInt8`, `Int8`, `UInt16`, `Int16`,
  `UInt32`, `Int32`, `UInt64`, `Int64`, `Float32` and `Float64` remain
  necessary for binary protocols, network packets, WASM interop, GPU kernels,
  AI tensors, image/audio formats, cryptography, hardware boundaries and
  database wire protocols.
- Unsafe numeric conversion must be denied. The runtime/compiler must not
  silently truncate, wrap, overflow or reinterpret signedness.
- Boundary contracts and reports should expose integer overflow, truncation,
  signedness confusion, endianness confusion, unsafe casts, NaN abuse, timing
  attack and precision-loss risks.
- Low-bit AI formats such as `Int8`, `UInt8`, `Float16`, `BFloat16`, `Int4`,
  `UInt4`, `Binary` and `Ternary` should live in package layers such as AI,
  vector and compute packages, not ordinary application logic.
- Base64 embedded content and data URIs must be treated as untrusted encoded
  asset data, not trusted application content.
- Before decoding base64 content, Galerina must run the security phase, parse
  metadata only, validate MIME/policy/size/memory/SVG-script policy, estimate
  decoded size and report the handling decision.
- Base64 handling modes may include pass-through encoded, decode-and-validate
  and externalise-asset, but security classification, memory policy and audit
  logging must never be bypassed.
- Large embedded assets should be externalised after validation to reduce HTML
  size, memory pressure, decode amplification and cache inefficiency.
- Future report families should include numeric-width, overflow-check,
  asset-security, base64-policy, parser-worker, runtime-memory and
  sanitisation reports.

## Memory Pressure Security Requirements

- Galerina must treat low memory and near-out-of-memory conditions as security
  events, not only as crash or performance risks.
- Apps, packages, tasks, requests, parser workers and AI jobs should have
  explicit memory budgets for app memory, request memory, JSON bodies, stream
  buffers, uploaded assets, parser workers and AI context.
- Allocation must be treated as fallible. Future allocation APIs should return
  typed errors such as `OutOfMemory`, `MemoryLimitExceeded`,
  `AllocationDenied`, `FragmentationRisk` and `BufferTooLarge` where recovery
  is possible.
- The runtime should apply backpressure before true out-of-memory by reducing
  concurrency, rejecting new risky work, returning retry guidance where
  appropriate and cancelling non-essential work during emergency pressure.
- Each request and worker should have an isolated budget so one user, upload,
  AI job, parser worker or database query cannot starve the whole runtime.
- On memory pressure, Galerina should cancel low-priority work such as AI
  summarisation, cache rebuilds, analytics and background jobs before
  cancelling security, authentication, audit or cleanup paths.
- Runtime defaults should prefer streaming, paging, chunking and bounded
  queues over whole-file reads, whole-body reads, unbounded recursion,
  unbounded arrays, unlimited JSON depth, unlimited regex processing and
  unbounded database queries.
- Cleanup must be deterministic where possible, including closing files,
  releasing buffers, rolling back transactions, flushing audit logs, releasing
  workers and zeroing sensitive memory where feasible.
- OOM protection must explicitly cover attack classes such as huge JSON
  bodies, deep nesting, large uploads, concurrent request floods, expensive
  regex, large AI prompts, unbounded queries, zip bombs, image bombs and
  base64 decode amplification.
- Future report families should include memory-pressure,
  allocation-denied, request-memory, oom-near-miss and cleanup reports with
  secret-safe redaction.

## Compile-Time Metadata Reflection Requirements

- Galerina reflection must mean compile-time metadata access for proof, tooling,
  reports, audit mapping, schema generation, test generation, AI indexing and
  Governed IR creation.
- Compile-time metadata may describe declared data, views, flows, permissions,
  capabilities, vaults, routes, events, packages, effects, response contracts,
  audit events and storage boundaries.
- Metadata access must occur in compiler, tooling, semantic checking,
  governance checking, documentation generation, audit/test generation,
  project graph building, AI architecture indexing and Governed IR building
  layers before verified execution.
- Runtime object inspection and behaviour modification must be denied in
  normal Galerina execution, including listing live objects, inspecting private
  fields dynamically, invoking methods by string, dynamically loading unknown
  modules, bypassing permission checks, mutating permissions and changing
  response exposure at runtime.
- Metadata may describe execution and support verified runtime gates, but it
  must not become dynamic runtime authority or a way to discover new behaviour
  from live objects.
- Metadata extraction and reports must remain source-mapped, deterministic,
  effect-aware, permission-aware and AI-readable.
- Future report families should include metadata index, route-flow-data link,
  permission metadata, response metadata, audit graph and Governed IR metadata
  reports.

## Governed Execution Director Requirements

- Galerina should include a Governed Execution Director as the runtime planning
  and coordination layer that identifies data, checks contracts and policy,
  builds execution plans, selects allowed compute targets, assigns memory
  paths, chooses normal execution or verified fast pipes and records audit
  proof.
- The Director must not grant hidden authority. Policy remains responsible for
  permission, capability, effect and boundary decisions.
- All runtime modules should use a shared understanding model that describes
  data type, sensitivity, source, owner, requested action, required effects,
  required capabilities, compute shape, memory shape, output contract, audit
  requirement, validation state, processing state, trust state and expiry
  state.
- Compute, AI, storage, network and boundary modules must be passive executors.
  They may execute approved work but must not grant themselves authority,
  widen permissions, change response contracts or switch targets outside an
  approved execution plan.
- Verified Fast Pipes may skip repeated parsing, copying, memory shaping,
  planning, routing and validation of unchanged facts, but must never skip
  policy validity, capability limits, effect boundaries, audit, expiry checks,
  trust checks, boundary checks or revocation checks.
- Sensitive access, output and target-selection decisions should support
  justified execution, where the request reason becomes part of the execution
  plan and audit proof.
- Future report families should include execution-plan,
  shared-understanding, compute-target-decision, memory-path,
  verified-fast-pipe, justified-access, boundary-module and audit-proof
  reports.

## Runtime Terminology And Naming Requirements

- Galerina should be described as a governance-first programming language,
  runtime and execution architecture designed to coordinate secure computation
  across CPUs, GPUs, AI accelerators, optical systems and future heterogeneous
  hardware.
- Project-level descriptions should emphasize governed execution,
  capability-based security, hardware-aware runtime orchestration,
  AI-native compute planning, future-neutral compute abstractions, structured
  auditability and operational runtime coordination.
- Runtime terminology should describe operational responsibility rather than
  traditional VM, thread, web-server or instruction-executor abstractions.
- Preferred runtime component terminology should include Runtime Command,
  Authority Control, Runtime Logistics, Resource Deployment Balancer,
  Execution Coordination Scheduler and Result Assembler.
- Runtime Command replaces informal Director terminology where the focus is
  operational workload understanding, execution planning and orchestration
  planning. Existing Governed Execution Director wording may remain as an
  explanatory architecture concept until package/API names are formalized.
- Authority Control replaces informal Sheriff terminology and should describe
  capability, effect, policy, authority, containment and audit enforcement.
- Runtime Logistics replaces informal Steward terminology and should describe
  resource optimization, batching, queues, cache behavior, execution reuse,
  memory optimization and fast-path reuse.
- Resource Deployment Balancer replaces informal Balancer terminology and
  should describe governed deployment across CPU, GPU, NPU, TPU, VPU, ASIC,
  FPGA, optical accelerators and future hardware.
- Compute Balancer is the focused runtime role inside the Resource Deployment
  Balancer responsibility area. It should observe hardware availability,
  pressure and trust signals, then select the best currently available compute
  target from the approved target set.
- The Compute Balancer must not grant authority. Authority Control approves
  what targets are allowed; Runtime Logistics prepares efficient execution;
  the Compute Balancer chooses only among approved targets; passive modules
  execute.
- Compute Balancer inputs should include CPU core availability, performance
  cores, efficiency cores, GPU/NPU/TPU/VPU/ASIC/FPGA availability, memory
  pressure, VRAM pressure, temperature, power state, queue depth, device
  availability, device trust level and fallback availability.
- Future Compute Balancer report families should include compute-balancer,
  compute-target-pressure, hardware-availability, hardware-trust,
  fallback-decision, thermal-pressure and queue-pressure reports.
- Execution Coordination Scheduler replaces generic Scheduler terminology
  where dependency timing, bounded parallelism, queue coordination,
  cancellation and partially asynchronous execution are involved.
- Result Assembler should describe ordered result reconstruction, dependency
  joining, output assembly, contract restoration and execution-result
  integrity.
- New naming should prioritize operational clarity, AI readability,
  future-proof meaning, stable conceptual mapping, human understandability,
  implementation independence and minimal ambiguity.
- New terms should avoid temporary technology names, generic terms such as
  manager/helper/handler/processor/service, CPU-first assumptions,
  excessive theme naming and names that hide authority boundaries.
- Governance names and execution names must remain distinct so authority
  control, policy verification and capability validation are not confused with
  execution coordination, resource deployment or result assembly.

## Data Visibility View Requirements

- Galerina should use `view` as the official field-level data exposure term.
- `view` means who or what may see or expose the data.
- Field exposure syntax should prefer `fieldName: Type view: level` over
  older `classify` examples.
- Permission exposure rules should prefer `allow expose view: level` and
  `deny expose view: level`.
- Built-in runtime/language view levels are `public`, `internal`, `private`,
  `confidential`, `secret`, `restricted` and `regulated`, conceptually exposed
  as `Runtime.View.public`, `Runtime.View.private` and the other standard
  levels.
- `public` means safe to expose under normal allowed response rules. `private`
  means owned data that may be exposed only when ownership checks pass, such as
  `owner == actor` or `owner: actor`.
- Common view behaviour must be defined once in the runtime standard, core
  policy or boot/main setup. Permissions should reference built-in view levels
  and inherit their standard exposure rules, for example `allow expose view:
  private` should inherit the `Runtime.View.private` owner-only rule.
- Permission-level view conditions should normally narrow built-in view
  behaviour. Widening standard view behaviour must require explicit named
  policy, review, audit and report output.
- Runtime systems may use view metadata for response filtering, serialization
  filtering, audit filtering, AI context filtering, log filtering, API exposure
  checks, frontend exposure validation and model projection.
- `view` must remain separate from `zone`, `capability`, `permission`,
  `target` and `trust`.
- Broader uses of `classification` remain valid for security classification,
  input classification, AI classification, threat classification and compute
  classification. Field exposure metadata should use `view`.
- Future report families should prefer data-view and exposure-report naming
  for field visibility, while preserving compatibility aliases for older
  data-classification reports where needed.

## Variable Mutation And Vault Requirements

- Galerina v0.1 should use a small state surface: `let`, explicit `mut`,
  `readonly`, `vault`, `secure` and `Secret<T>`.
- `let` should declare local flow/block-scoped variables that are not
  accessible outside their scope and are not silently mutable.
- Mutation must be explicit. Assignment-style mutation without `mut` should
  fail in normal Galerina code. Increment and decrement mutation without `mut`,
  such as `foo++`, should also fail checker validation.
- `readonly` should define values that cannot be changed after creation, with
  no unlock mechanism in v0.1.
- `const` should not be used in v0.1 examples or core syntax direction.
  `readonly` replaces `const` unless Galerina later needs compile-time constants
  distinct from runtime readonly values.
- Shared state must live in `vault` declarations, not ordinary globals.
- Vault values must be protected, typed, permission-controlled, audit-aware and
  runtime-managed. Vault values are not normal variables.
- Protected shared state should be accessed through the `secure` path, for
  example `secure.loginCount`.
- Writes to vault values must require `mut`, for example
  `mut secure.loginCount++`.
- Vault record writes should prefer the visible source form
  `mut secure.name[key] = value` instead of direct writer-call syntax such as
  `SessionVault.write(context, key, value)`. Runtime lowering may use internal
  vault write calls, but source code must keep the governed write visible.
- Vault writes should inherit the active governed runtime context for actor,
  route/flow, permission, audit correlation, policy profile and trust-zone
  metadata rather than requiring generic `context` parameters in normal
  application code.
- Sensitive values should use `Secret<T>` or equivalent protected secret
  references that deny logging, unsafe serialization, AI exposure and
  accidental report disclosure.
- Future report families should include variable-scope, mutation,
  readonly-value, vault-access, vault-security and secret-flow reports.

## Plugin Security Requirements

- Every extension package must start with no permissions. Permissions must be
  explicitly declared by the plugin and explicitly granted by the application.
- Plugin risk levels must be recognised: low risk (pure computation: CPU/memory
  limits only), medium risk (engineering/chemistry: validation and simulation
  isolation), high risk (AI/Medical/Finance/Robotics: strict sandboxing, audit
  logging, human approval gates, tool allowlists).
- Permission categories that plugins may request: `safe` (pure computation),
  `read`, `write`, `network` (domain allowlist + TLS required), `execute` (tool
  allowlist + sandbox required), `physical` (emergency stop + simulation mode
  required), `regulated` (encryption + consent tracking + immutable audit log
  required).
- Plugins must execute inside isolated sandboxes: WASM sandboxing, container
  runtimes, or capability-based VMs. Memory, filesystem, network, and GPU
  isolation must be enforced per plugin.
- Capability tokens must be temporary and scoped. Applications grant tokens per
  use, not globally. Tokens must not be transferable between plugins.
- All sensitive plugin actions must be audited automatically: vault access,
  network calls, medical data access, financial operations, hardware control,
  tool execution.
- AI plugins must enforce tool allowlists, execution step limits, max runtime,
  context isolation (vault data must not enter prompts), and human approval for
  high-risk autonomous actions.
- Robotics/physical plugins must include simulation-first workflows, emergency
  stop support, speed limits, geofencing, and manual override capabilities.
- Third-party plugins must be signed, version-pinned, permission-manifest
  declared, dependency-scanned, and security-scored.
- The full plugin security specification is in
  `../../ZTF-Knowledge-Bases/plugin-security-architecture.md`.

## Out of Scope

- Product-specific app features before a product domain is selected.
- Full-framework behavior inside `galerina-core` or `galerina-framework-app-kernel`.
- Mandatory ORM, CMS, admin UI, template engine or frontend framework design.
- Treating project graph output as a security or compiler authority.
- Treating BitNet, Graphify or any named backend as Galerina language syntax.
- Treating neural networks, neuromorphic models or AI accelerators as mandatory
  core language features.
- Requiring future hardware for the baseline Galerina developer workflow.
- Treating the Generative Runtime Mapper as an automatic production
  self-modification system or as authority to silently rewrite code, policies
  or runtime behaviour.
- Treating AI output as proof, validation, policy authority or trusted program
  logic without typed evidence, runtime verification and permission
  enforcement.
- Treating uploaded files, embedded assets, base64 data URIs or parser outputs
  as safe because they have a familiar file extension, browser MIME type or
  successful parse result.
- Treating fixed-width numeric and low-bit AI types as normal application
  conveniences rather than explicit boundary and package-layer concepts.
- Treating out-of-memory as an ordinary crash-only failure without budgets,
  backpressure, cleanup, request isolation and security reporting.
- Treating reflection as runtime object inspection, string-based method
  invocation, dynamic permission mutation or behaviour modification in normal
  Galerina execution.
- Treating compute, AI, storage, network or boundary modules as independent
  authority layers that can bypass the Director, policy checks or audit proof.
- Treating Galerina as only a traditional VM, thread executor, web server runtime
  or instruction executor when describing the long-term architecture.
- Renaming packages, APIs or report schemas to metaphorical, hardware-specific
  or implementation-specific terms without a responsibility-based naming
  review.
- Using `classify` as the preferred field-level data exposure syntax in new
  Galerina examples.
- Using `const` in v0.1 as a separate concept from `readonly`.
- Allowing implicit mutation, unprotected shared state, generic global
  variables or direct vault access that bypasses `secure`, permission checks or
  audit.

## Success Criteria

- The root README and package docs explain the workspace clearly.
- Package boundaries are explicit and enforced through documentation and tests
  where code exists.
- Project graph outputs can be regenerated and used by AI tools.
- `Galerina task` can load, validate, dry-run and report safe task plans.
- Secrets are never committed or emitted in reports.
- A future app can add domain requirements without moving language or framework
  responsibilities into the wrong package.
