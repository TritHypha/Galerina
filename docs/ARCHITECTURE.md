# Architecture

## Constellation Architecture (2026-07-22 — adopted)

Galerina is structured as a **Core-first product constellation**. The full specification lives in:

- **KB canonical spec:** `../ZTF-Knowledge-Bases/galerina-constellation-architecture.md`
- **In-repo record:** `docs/architecture/constellation-architecture-2026-07-22.md`
- **Gap analysis:** `../ZTF-Knowledge-Bases/constellation-architecture-plan-2026-07-22.md`

**One-line summary:** Galerina:Core ships first as a complete independent product. Fabric, Cortex, Quantum, TritMesh, and the optional fast sister language are separate products that depend on Core — Core depends on none of them.

**Development order (confirmed):** Finish Core → TritMesh:QL → other engines.

**FUNGI-* / GALERINA-* codes:** belong exclusively to Core. Optional engines define their own namespaces (FABRIC-*, CORTEX-*, QUANTUM-*, TRITMESH-*).

---

## Overview

This workspace separates the Galerina language core from the bespoke app that uses it.

The architecture charter is:

```text
Security first.
Code second.
Authority never implicit.
```

Galerina is a secure, auditable, AI-readable execution language and governed
runtime architecture. It is not designed primarily around raw speed. It is
designed around controlled authority, verifiable execution, explicit boundaries,
architectural stability and future-capable compute models.

AI-readable architecture means AI tools should read the architecture, not infer
it. The workspace should function as a knowledge map with stable concept names,
one-concept Knowledge Base files, explicit definitions, package ownership,
component responsibility metadata, generated project graph outputs and
canonical examples where practical.

The charter concept lives in
`../../ZTF-Knowledge-Bases/architecture-charter.md`.

The AI architecture policy lives in
`../../ZTF-Knowledge-Bases/ai-understandable-architecture-policy.md`.

Galerina security architecture should be invariant-led rather than feature-led.
The core design question is what architectural rule makes a policy violation
impossible or contained. Declared security policy is part of program meaning,
so compiler IR, execution plans and reports should carry permissions,
capabilities, classifications, exposure levels, ownership, actor identity,
trust boundaries, effects, audit requirements, package authority and isolation
requirements.

The concept lives in
`../../ZTF-Knowledge-Bases/security-invariants-and-policy-proof.md`.

## Package Dependency and Data Flow Diagrams

Mermaid diagrams for the `galerina-core*` package dependency graph, the runtime
data flow (HTTP request → response), the compile-time 14-pass pipeline, and the
diagnostic code namespace table live in
`../../ZTF-Knowledge-Bases/galerina-core-package-architecture.md`.

## Documentation Coverage And Conflict Register

`docs/COVERAGE.md` is the current index for language, runtime and package
documentation coverage. When it marks a package or Knowledge Base topic as
updated, package-owned documentation must be checked before workspace-level docs
are treated as current.

Coverage currently records several unresolved documentation conflicts that must
not be implemented until reconciled:

- photonic ownership and naming: `galerina-core-photonic` owns photonic runtime
  target and execution plan semantics; `galerina-core-vector` may reference vector
  suitability only, and the conflicting `OpticalTransportMode` enums and
  `FUNGI-PHOTONIC-001` through `FUNGI-PHOTONIC-006` meanings remain unresolved.
- logic semantics: `galerina-core-logic` README and
  `galerina-core-logic-tri-decision-bool.md` are the current v0.2 canonical
  developer-facing shape for `TriState`, `Decision`, `BoolBoundaryResult` and
  Omni conversion; older `type:`/three-state Decision examples are historical.
- webhook security: `galerina-core-network-webhook.md` is the canonical v0.2
  contract for webhook HMAC, replay and idempotency. API-server docs may expose
  adapter-level names, but must map to the network package semantics.
- secret references: `galerina-core-security` owns protected secret references and
  safe sink decisions. The `reveal()` versus `unwrapForApprovedSink(sink)` shape
  is still a documentation conflict and should not be implemented without a
  package decision.
- network protocols: the current network package direction is
  `http`, `https`, `tcp`, `udp`, `grpc`, `websocket` and `quic`; older
  `ws`/`wss` wording is legacy.


Language documentation, compiler notes, examples and schemas live in
`packages-galerina/galerina-core/`
.

 Compiler pipeline contracts live in
`packages-galerina/galerina-core-compiler/`.

 Runtime execution contracts live in
`packages-galerina/galerina-core-runtime/`.

 Network I/O policy, profile, permission
and report contracts live in `packages-galerina/galerina-core-network/`.

 Security primitives live in `packages-galerina/galerina-core-security/`.


Configuration and shared reports live in `packages-galerina/galerina-core-config/` and
`packages-galerina/galerina-core-reports/`.

 Multi-state logic concepts live in `packages-galerina/galerina-core-logic/`.


Vector concepts live in `packages-galerina/galerina-core-vector/`.

 Compute planning concepts live in
`packages-galerina/galerina-core-compute/`.

 Generic AI inference contracts live in
`packages-galerina/galerina-ai/`, and low-bit/ternary AI inference support lives in
`packages-galerina/galerina-ai-lowbit/`.

 Supervised AI agent contracts live in
`packages-galerina/galerina-ai-agent/`.

 Neural-network workload contracts live in
`packages-galerina/galerina-ai-neural/`, and neuromorphic spike/event contracts live in
`packages-galerina/galerina-ai-neuromorphic/`.

 Enterprise compliance and privacy
policy contracts live outside the active workspace in
`packages-galerina-enterprise/galerina-compliance/` and the
`packages-galerina-enterprise/galerina-compliance-*` package family.

 They are not
part of the active v1 build graph unless explicitly unlocked.

 Data-processing contracts
live in `packages-galerina/galerina-data/` and the
`packages-galerina/galerina-data-*` package family.

 Database provider adapter
contracts live in `packages-galerina/galerina-db-*`.

 BitNet is one optional backend for low-bit AI.


Photonic and wavelength concepts live in
`packages-galerina/galerina-core-photonic/`.

CPU target planning lives in
`packages-galerina/galerina-target-cpu/`, optimized CPU kernel contracts live in
`packages-galerina/galerina-cpu-kernels/`, and future native executable target
planning lives in `packages-galerina/galerina-target-native/`. Future portable
systems output planning should start as native target work only after ABI,
layout, memory and report rules stabilise. WebAssembly target planning lives in
`packages-galerina/galerina-target-wasm/`, GPU target planning lives in
`packages-galerina/galerina-target-gpu/`, AI accelerator target planning lives in
`packages-galerina/galerina-target-ai-accelerator/` with passive backend profiles for devices
such as Intel Gaudi 3, and photonic target backend planning lives in
`packages-galerina/galerina-target-photonic/`, including optical I/O interconnect planning as a
data-movement target.

 The
optional Secure App Kernel design lives in `packages-galerina/galerina-framework-app-kernel/`.

 The
built-in HTTP API server package lives in `packages-galerina/galerina-framework-api-server/`.

 Developer command
tooling lives in `packages-galerina/galerina-core-cli/`, and safe project automation lives in
`packages-galerina/galerina-core-tasks/`.

 Development benchmark diagnostics live in
`packages-galerina/galerina-tools-benchmark/`.

 Project knowledge graph tooling lives in
`packages-galerina/galerina-devtools-graph-project/`.

 App source and build configuration live in
`packages-galerina/galerina-framework-example-app/`.

 Finance, electrical and
operational-technology package planning is archived outside the active
workspace under `C:\laragon\www\Galerina_Archive\packages-galerina\` and is not part of the
v1 build graph.

 App planning and operational documentation live in `docs/`.


Development-only packages should use `galerina-devtools-*` or
`galerina-tools-*` names and must not be resolved by production applications by
default.



Galerina's security architecture is secure-runtime first. The intended advantage
is broader policy: deny-by-default effects, typed API boundaries, memory-safe
values, secret-safe reports, controlled interop, production gates and AI-safe
context generation.

Galerina's first practical target is secure web application runtime code: typed
HTTP APIs, webhooks, queue workers, auth-heavy services, agent/tool gateways,
safe JSON boundaries and deployment policy. Low-level systems targets, embedded
targets and native executable output remain later output paths.

The detailed direction lives in `docs/SECURE_WEB_RUNTIME_FIRST.md`.

The current practical execution model is Node-hosted:

```text
HTTP request
  -> Node.js server
  -> Galerina framework/API server adapter
  -> Galerina App Kernel
  -> Galerina checked rules and flows
  -> Node.js executes the runtime path
  -> HTTP response
```

This must be described honestly as a Node-hosted secure Galerina layer, not a
standalone native web server/runtime. The core language and reports should
remain target-independent so future WASM, VM, native or other checked backends
can be added without changing source meaning.


The baseline trust model is practical zero trust: external input, dependency
output, generated AI content, cached data, network data, database data, uploaded
files, environment-derived values, headers, cookies, tokens, runtime metadata
and build artifacts start untrusted until validated, typed, permissioned,
provenance-checked or explicitly policy-reviewed.

 Trust transitions must be
visible in types, policies or reports.

Galerina's value-level trust model uses `safe` and `unsafe`. `unsafe` means
untrusted, not memory-unsafe. Unsafe values are inert: they cannot enter normal
runtime expressions, arithmetic, string helpers, array helpers, business logic,
query interpolation, shell execution, workers, `GlobalVault` access or runtime
APIs until trust conversion or explicit safe declaration occurs.

The approved unsafe-value conversion operations are `validate`, `guard` and
`sanitize`. `encode.*` is later contextual output handling: it requires a safe
input and returns a context-specific safe value such as `safe Html`,
`safe UrlPart`, `safe JavaScript`, `safe Css`, `safe Xml` or `safe ShellArg`.
The detailed concept lives in
`../../ZTF-Knowledge-Bases/trust-conversion-and-data-safety.md`.



Application crash handling is also policy-first.

 Galerina should distinguish
expected errors, external failures and unexpected crashes in typed outcomes and
reports.

 The core language owns `Result<T, E>`, panic/crash categories and
source-map direction.

 `galerina-framework-app-kernel` owns route, webhook and
worker crash boundaries, crash policies, safe responses, supervised restarts,
health/readiness crash state and secret-safe crash reports.

 The canonical
workspace note is `docs/APP_CRASH_HANDLING. md`.



The runtime architecture direction is the Galerina Securely Governed Runtime.

Runtime authority must be established before code acts. This authority baseline is set by the Runtime Policy Config, which defines global environment rules, defaults, and boundaries. Policy, capabilities, effects and audit hooks are part of execution itself, not optional middleware. The system-level policy configuration must load early in the lifecycle:

```text
boot/main
 -> Runtime Policy Config
 -> Package Resolver
 -> Governance Checks
 -> Governed IR
 -> Runtime Execution
```

Under this model, the runtime does not execute project code until the Runtime Policy Config is verified. Local permissions can only narrow or request authority within these global constraints; they can never exceed what the Runtime Policy Config allows. The policy configuration is kept strictly separated from `boot/main` startup wiring (which handles module registration and route loading).

The concept lives in `../../ZTF-Knowledge-Bases/runtime-policy-config.md`.

The runtime should separate a small trusted core, a governed runtime zone and an
untrusted zone for plugins, third-party packages, external services,
AI-generated code, unsafe interop and hardware accelerators.

Galerina uses a zero trust plugin model for domain extension packages. Every
plugin starts with no permissions and must explicitly declare: `safe`, `read`,
`write`, `network`, `execute`, `physical`, or `regulated`. The application must
explicitly grant capability tokens. Plugins execute inside isolated sandboxes
(WASM, container, or capability-based VMs). Audit logging is required for all
sensitive plugin actions. Plugin risk levels — low (pure computation), medium
(engineering/chemistry), high (AI/Medical/Finance/Robotics) — determine the
required sandbox strength and human approval requirements.

The full plugin security architecture is documented in
`../../ZTF-Knowledge-Bases/plugin-security-architecture.md`.

Package and module loading belongs to a governed Package Resolver, not an
autoloading mechanism. Imports are not trust. The resolver finds requested
packages/modules, checks identity, lockfile, hash/signature, registry,
capabilities, effects, licence/policy, trust status, dependencies and conflicts,
then links only approved modules into Governed IR with provenance reports.
Runtime dynamic loading, where allowed, still goes through Authority Control and
resolver policy.

The Certified Package Registry sits before the resolver. It is a governed
package source where packages are published, verified, signed, versioned,
capability-declared and policy-rated. Registry certification is evidence for
resolution and governance checks, not unrestricted authority.

The concepts live in `../../ZTF-Knowledge-Bases/certified-package-registry.md` and
`../../ZTF-Knowledge-Bases/package-resolver.md`.

Execution should follow:

```text
request -> planning -> verification -> capability locking -> execution -> audit proof
```

The runtime may use verified fast paths only when a workload matches a known
execution signature and the fast path lease remains valid. Fast paths must not
bypass policy, capability checks, effect boundaries, data contracts or audit.

Verified fast paths should be backed by a context-tagged verified execution
cache. Reuse is valid only when the current context matches the cached
verification tags: source and Governed IR hashes, permission and policy
versions, actor scope, view scope, runtime zone, compute target, hardware trust,
vault version, package version and audit level. Caches remember verified
results; Authority Control decides whether reuse is allowed and can invalidate
parser, IR, policy, view, vault, compute, schedule, audit and whole-plan caches.

The concept lives in
`../../ZTF-Knowledge-Bases/context-tagged-verified-execution-cache.md`.

AI workloads should be described as typed AI compute plans rather than opaque
model calls. The runtime can then enforce policy, minimise data, reduce copying,
batch compatible work, choose suitable hardware and produce compliance evidence.

AI-generated code and AI-driven policy changes must pass through
self-modification governance. AI can request capability leases, but cannot issue
them to itself. AI-authored code should enter quarantine, pass syntax/type and
effect checks, run sandbox tests, produce an audit report and receive human or
policy approval before promotion to trusted code.

Capability delegation must attenuate authority. A delegated capability can be
equal or narrower than the delegator's authority, never broader. No runtime
process, including an AI agent, may grant itself broader authority than its
approver chain possesses.

## Secure By Default Syntax Principles

Galerina security should be visible in syntax and logic, not only enforced as late
runtime checks.

The core principle is:

```text
Make insecure behaviour impossible by default,
and privileged behaviour visible in syntax.
```

Syntax-level security means:

- permission blocks deny by default
- risky actions require explicit authority
- request contracts define shape, limits and allowed values
- output fields use `view`
- owner-scoped data requires ownership checks such as `owner: actor`
- database field reads prefer explicit allow lists
- `fields: all except [...]` is visible broad-read syntax and requires warnings
- typed database queries are preferred over raw SQL
- raw SQL requires explicit authority such as `db.raw_sql`
- output declares or inherits target context such as JSON, HTML, log or AI prompt
- secrets cannot be returned, logged, sent to AI or cached by default
- flows have default budgets and may declare explicit budgets
- security-relevant flows declare audit events
- audit events inherit runtime actor, request, route, flow, permission and
  capability identity automatically
- authority-sensitive work has explicit or inherited governed context
- eval, raw shell, monkey patching, globals, inheritance, unsafe reflection, raw
  pointers and silent network access are denied or gated

Example permission:

```galerina
permission profile_read {
  code {
    allow db.read
    allow audit.write
  }

  data {
    allow expose view: public
    allow expose view: private owner: actor
  }

  audit required event "profile.read"
}
```

Example input contract:

```galerina
request getProfile {
  user_id: UserId required
}
```

Example target-aware response:

```galerina
response Profile.response target: json
```

Example field-read rule:

```galerina
allow read Profiles fields: [
  id,
  owner,
  name
]
```

Convenient but riskier broad-read rule:

```galerina
allow read Profiles fields: all except [
  email
]
```

The compiler/runtime should resolve known fields, remove excluded fields, check
field `view` metadata, warn on sensitive tables and deny unknown future fields
unless broad future-field access is explicitly approved. A safer broad-read
mode may use `fields: all current except [...]` to freeze the current field set.

The detailed concept is documented in
`../../ZTF-Knowledge-Bases/secure-by-default-syntax-principles.md`.
Field-read modes are documented in
`../../ZTF-Knowledge-Bases/field-read-rules.md`.
Audit actor attribution is documented in
`../../ZTF-Knowledge-Bases/audit-actor-model.md`.

## Audit Actor Attribution

Galerina audit identity should come from governed runtime context, not from
developer-supplied values.

When a flow declares:

```galerina
audit required event "profile.read"
```

or writes:

```galerina
audit.write(context, "profile.read")
```

the runtime should automatically attach:

- primary actor
- request ID
- route and flow
- permission used
- active capabilities
- timestamp
- execution ID
- result
- trust zone

Application code may add metadata, but it must not silently replace the primary
actor or other runtime-owned audit identity fields.

Multi-actor audit events may include explicit non-primary actor metadata:

```galerina
audit.write("refund.approve.completed", {
  affected_actor: customer_actor,
  system_actor: Runtime.system_actor("payments"),
  refund_id: refund.id
})
```

The runtime still injects `primary_actor` from the governed execution context.
Application code should not normally pass `primary_actor` in audit metadata.
System actors must be runtime-approved identities declared in trusted runtime
policy.



## Runtime.Context (No Superglobals)

Galerina does not use PHP-style superglobals. `Runtime.Context` is the
runtime-owned, read-controlled execution context for the current flow.

```text
Superglobals     = globally available mutable data (rejected)
Runtime.Context  = governed runtime-provided execution facts
Vaults           = governed shared/global state
```

`Runtime.Context` may contain:

```text
actor
request_id
route
method
headers allowed by policy
client info allowed by policy
permission used
capabilities granted
audit context
budget context
event source
compute context
```

The runtime creates `Runtime.Context` at the intake boundary and injects it
into flows only when the flow signature declares it:

```galerina
flow login(
  request: Login.post,
  context: Runtime.AuthContext
)
```

Simple flows may omit context:

```galerina
flow hello(
  request: Hello.get
)
```

`Runtime.Context` must not become mutable global state, hidden session storage,
an unrestricted request bag, unfiltered headers/cookies/files or a way to bypass
permissions. Session and shared mutable state belong in governed vaults.

The concept lives in
`../../ZTF-Knowledge-Bases/runtime-context-not-superglobals.md`.


Environment secret handling is a typed security boundary.

 `.

env` values must
enter the app as declared secret references such as `Secret<T>`, not ordinary
strings.

 `galerina-core-security` owns protected secret references, redaction,
fingerprints, secret-derived taint tracking and safe sink decisions.


`galerina-framework-app-kernel` consumes those rules for route, webhook, worker,
LLM/cache, network and report enforcement.

 Secret metadata can appear in
reports; secret values must not.

 The canonical workspace note is
`docs/ENV_SECRETS. md`.



Memory hierarchy and reliability must be framed carefully.

 Galerina does not
directly control CPU cache levels or ECC hardware.

 `galerina-core` owns memory
model vocabulary such as ownership, views, explicit clone and layout hints.


`galerina-core-compiler` should own hot-loop, large-copy and layout diagnostics.


`galerina-core-runtime` may collect memory/cache/reliability facts where the
platform exposes them.

 `galerina-target-cpu` owns CPU capability and cache fact
detection contracts, and `galerina-core-reports` owns shared report shapes.

 The
canonical workspace note is `docs/MEMORY_HIERARCHY_RELIABILITY. md`.



Server platform support is split by role.

 Nginx, Apache and Caddy are
deployment/reverse-proxy targets that Galerina may generate safe config for.


Node.

js is both the current tooling platform and an optional runtime target.


Express, Fastify, Hono and serverless/edge systems are adapters that must
preserve the same route manifest and app-kernel enforcement.

 The built-in
`galerina-framework-api-server` remains a focused HTTP serving package, not a
full web framework.

 See `docs/SERVER_PLATFORM_SUPPORT. md`.



## V1 Surface Freeze

The v1 architecture is frozen around a small language surface:

```text
core syntax
core type system
Result / Option error and missing-value handling
the memory-safety model
CPU target support
WASM target support
compiler, runtime, security, config, reports, CLI and task tooling
core network policy contracts
```

The active core package set must expose testable contracts before broader
framework or target work depends on it.

 `galerina-core-network` owns network
policy shape, TLS requirements, endpoint allow/deny rules, backend capability
selection and network reports.

 `galerina-core-runtime` owns execution context,
runtime result/error shapes, effect decisions and runtime reports.


`galerina-core-vector` owns vector, matrix and tensor shape validation plus vector
operation reports.

 `galerina-core-photonic` remains post-v1 planning, but its
concept surface is now bounded to optical signals, logic-state mappings and
plan/report validation.



Everything beyond CPU and WASM targets is post-v1 unless it directly specifies
core type-system semantics.

 AI, GPU, AI accelerator, photonic, optical I/O,
finance, electrical, OT and other domain-specific packages must not define the
v1 language surface.

 They may remain as archived or clearly labelled post-v1
planning only.



The v1 priority order is:

```text
1.

 Finalise syntax and grammar.


2.

 Commit to the memory model.


3.

 Define Bool, Tri, Decision, Option and Result semantics.


4.

 Write at least 20 real Galerina example programs.


5.

 Build a working parser for that subset.


6.

 Only then expand package targets or domain packages.


```

The working execution plan for these gates lives in
`docs/CORE_FOUNDATION_ROADMAP. md`.



The current compiler package includes an interim syntax safety scan for the
highest-risk v1 core cases while the real parser and checker are pending.

 It
flags direct Tri branch conditions, implicit Tri/Decision/Bool assignments,
non-exhaustive Tri matches, `unknown_as: true` in secure flows, raw secret-like
literals and unsafe dynamic execution calls.

 This scan is advisory compiler
infrastructure, not a substitute for the future AST-based checker.



## Main Structure

Current single-repository structure:

```text
galerina-app/
|-- docs/
|-- packages/               # normal app/vendor package space
|-- packages-galerina/
|   |-- galerina-core/
|   |-- galerina-core-compiler/
|   |-- galerina-core-runtime/
|   |-- galerina-core-network/
|   |-- galerina-core-security/
|   |-- galerina-core-config/
|   |-- galerina-core-reports/
|   |-- galerina-core-logic/
|   |-- galerina-core-vector/
|   |-- galerina-core-compute/
|   |-- galerina-ai/
|   |-- galerina-ai-lowbit/
|   |-- galerina-ai-agent/
|   |-- galerina-ai-neural/
|   |-- galerina-ai-neuromorphic/
|   |-- galerina-data/
|   |-- galerina-data-html/
|   |-- galerina-data-search/
|   |-- galerina-data-archive/
|   |-- galerina-data-db/
|   |-- galerina-data-model/
|   |-- galerina-data-query/
|   |-- galerina-data-response/
|   |-- galerina-data-json/
|   |-- galerina-data-database/
|   |-- galerina-data-pipeline/
|   |-- galerina-data-reports/
|   |-- galerina-db-postgres/
|   |-- galerina-db-mysql/
|   |-- galerina-db-sqlite/
|   |-- galerina-db-opensearch/
|   |-- galerina-db-firestore/
|   |-- galerina-core-photonic/
|   |-- galerina-target-cpu/
|   |-- galerina-cpu-kernels/
|   |-- galerina-target-native/
|   |-- galerina-target-wasm/
|   |-- galerina-target-gpu/
|   |-- galerina-target-ai-accelerator/
|   |-- galerina-target-photonic/
|   |-- galerina-framework-app-kernel/
|   |-- galerina-framework-api-server/
|   |-- galerina-core-cli/
|   |-- galerina-core-tasks/
|   |-- galerina-tools-benchmark/
|   |-- galerina-devtools-graph-project/
|   |-- galerina-framework-example-app/
|-- packages-galerina-enterprise/
|   |-- galerina-compliance/
|   `-- galerina-compliance-*/
`-- tools/
```

Future split-repository structure:

```text
light-framework/
|-- .

git
|-- packages/
|   `-- normal app/vendor packages
|-- packages-galerina/
|   |-- .

git
|   |-- galerina-core/
|   |-- galerina-core-compiler/
|   |-- galerina-core-runtime/
|   |-- galerina-core-security/
|   |-- galerina-core-config/
|   |-- galerina-core-reports/
|   |-- galerina-core-logic/
|   |-- galerina-core-vector/
|   |-- galerina-core-compute/
|   |-- galerina-ai/
|   |-- galerina-ai-lowbit/
|   |-- galerina-ai-agent/
|   |-- galerina-ai-neural/
|   |-- galerina-ai-neuromorphic/
|   |-- galerina-core-photonic/
|   |-- galerina-target-cpu/
|   |-- galerina-cpu-kernels/
|   |-- galerina-target-native/
|   |-- galerina-target-wasm/
|   |-- galerina-target-gpu/
|   |-- galerina-target-ai-accelerator/
|   |-- galerina-target-photonic/
|   |-- galerina-framework-app-kernel/
|   |-- galerina-framework-api-server/
|   |-- galerina-core-cli/
|   |-- galerina-core-tasks/
|   |-- galerina-tools-benchmark/
|   |-- galerina-devtools-graph-project/
|   `-- galerina-framework-example-app/
|-- app/
`-- framework files
```

In the current and future structure, `packages-galerina/` is the reusable Galerina package repository that
can be imported by multiple frameworks.

 It should be mounted intentionally, for
example as a Git submodule or standalone nested repository.

 The framework root
remains its own repository.

 `packages/` is reserved for normal app/vendor
packages from the host ecosystem.



`galerina-devtools-*` packages are development-only inspection and assistant-context
packages.

 `galerina-tools-*` packages are broader diagnostics, benchmark or release
utilities that may run in development or staging.

 Neither family should be
required by production runtime installs.



The proposed long-term application layout separates host ecosystem dependencies
from Galerina dependencies:

```text
package.

json
package-galerina.

json
galerina.

lock.

json
packages/
packages-galerina/
```

`package-galerina.

json` should describe selected Galerina packages and profiles.


`galerina.

lock.

json` should lock versions, source refs, checksums and profile
selection.

 This is a planned package-management boundary; current beta tooling
does not yet resolve Galerina packages from those files.



`package.

json` and NPM remain host ecosystem tooling only.

 In the current beta,
they may run JavaScript/TypeScript prototype checks, host adapter tests and
generated JS/TS interop packaging.

 They must not define the Galerina package graph,
runtime profiles, compiler target policy or production package overrides.


`galerina-core-config` owns validation for this boundary so package resolution policy
does not leak into normal NPM manifests.



## Package Layers

```text
Galerina Core
  language/compiler/type system/effects/memory/compute

Galerina Compiler
  parser, checker pipeline, core syntax safety scan, IR, diagnostics, source
  maps and compiler reports

Galerina Runtime
  execution engine for compiled or checked Galerina code

Galerina Security
  SecureString helpers, fail-closed redaction, deny-precedence permission models
  and security report contracts

Galerina Config
  project configuration, environment modes and production policy loading

Galerina Reports
  shared report schemas and report-writing contracts

Galerina Logic
  Tri operations, explicit conversion policy, Galerina validation, Decision,
  RiskLevel, Omni logic and multi-state truth tables

Galerina Vector
  vector values, dimensions, lanes, operations and vector reports

Galerina Compute
  compute planning, capabilities, budgets, effects and target selection

Galerina AI
  target-neutral AI inference, model metadata, safety policy and reports

Galerina Low-Bit AI
  low-bit / ternary model references, backend selection and CPU inference plans

Galerina Agent
  supervised AI agent definitions, tool permissions, task groups and reports

Galerina Neural
  neural models, layers, inference and training boundary contracts

Galerina Neuromorphic
  spike trains, event signals and spiking model contracts

Galerina Photonic
  wavelength, phase, amplitude, optical channels and logic-to-light mapping

Galerina Target CPU
  CPU capabilities, SIMD features, memory limits, threading and fallback reports

Galerina CPU Kernels
  GEMM, GEMV, vector, matrix, low-bit and ternary CPU kernel contracts

Galerina Target Binary
  native executable target planning, platform triples, ABI constraints, future
  portable systems output staging and artefacts

Galerina Target WASM
  WebAssembly target planning, module metadata and import/export contracts

Galerina Target GPU
  GPU target planning, kernel mapping, precision and data movement reports

Galerina Target AI Accelerator
  NPU, TPU, AI-chip and passive backend profiles, precision and operation plans

Galerina Target Photonic
  photonic backend target plans and optical I/O interconnect planning

Galerina Secure App Kernel
  request lifecycle, validation, security, auth, rate limits, jobs and reports

Galerina API Server
  HTTP listening, request normalisation, route manifest loading, safe responses

Galerina CLI
  developer commands for check, build, run, serve, reports, routes and tasks

Galerina Tasks
  safe typed project automation with declared effects and permissions

Galerina Benchmark
  development diagnostics for logic, CPU, GPU, low-bit fallback and safe reports

Galerina Project Graph
  project graph maps for packages, docs, policies, reports and AI assistance

Galerina Developer Packages
  optional staging, diagnostics, generators and experiments outside production
  install paths

Galerina Standard Packages
  HTTP adapters, SQL adapters, Redis queue, OpenAPI generator, JS/WASM generators

Galerina Full Frameworks
  web frameworks, CMS, admin UI, frontend adapters, ORM and template systems
```

The Secure App Kernel is a partial framework layer.

 It enforces safe runtime
boundaries, but it must not become a full Laravel, Django, React or WordPress
style framework.



`galerina-framework-api-server` is the built-in HTTP transport package for API services.

 It
serves HTTP, loads route manifests, applies server-level limits and passes
normalised requests into `galerina-framework-app-kernel`.

 It must not own auth decisions,
business logic, ORM design, CMS features or frontend rendering.



Browser rendering belongs in the `galerina-web` package family.

 `galerina-web-render`
owns the typed browser rendering pipeline from validated API response to typed
state, safe HTML, state diffing, streaming batches and render reports.


`galerina-web-state`, `galerina-web-components`, `galerina-web-router` and
`galerina-web-events` own focused client-state, component, route and event
contracts.

 `galerina-data-json` owns JSON validation, `galerina-data-html` owns
SafeHtml and sanitization policy, `galerina-core-security` owns browser secret and
HTML security policy, and `galerina-target-js` plus `galerina-target-wasm` own
browser-compatible output planning.

 This keeps Galerina able to compile typed UI
contracts to browser JavaScript/WASM without turning `galerina-core`, the API
server or the app kernel into a frontend framework.



Galerina API design is route-first and contract-first.

 Traditional MVC controllers
must not be required by the core language, app kernel or API server.

 Routes,
typed requests, typed responses, policies, declared effects, actions/handlers
and generated route reports are the secure API core.

 Controller-style grouping
may exist later as optional framework sugar only when it compiles into the same
secure route graph and does not hide auth, CSRF, object access, idempotency,
validation, limits, audit or effects.



Galerina may support optional thin Domain-Driven Design for business applications,
but it must not force heavyweight enterprise DDD.

 Business meaning can live in
`domain/`, application use cases in `flows/`, external systems in
`infrastructure/`, routes in `api/`, runtime controls in `policies/` and reports
in `reports/` when that structure adds clarity.

 Domain code should be pure by
default and denied from database, network, secret, file, cache and LLM effects
unless a reviewed policy says otherwise.

 DDD does not replace Galerina security,
memory or compute rules.

 The full guidance is in `docs/DOMAIN_DRIVEN_DESIGN. md`.



`galerina-core-cli` is the developer command tool.

 It coordinates compiler, runtime, API
server and task packages, but it must not own application behaviour.



`galerina-core-tasks` is the safe automation layer.

 It runs typed tasks with declared
effects and permissions.

 Raw shell is disabled by default and should only exist
later as explicit unsafe compatibility.



`galerina-tools-benchmark` is developer diagnostics.

 It should test correctness,
predictability, target fallback and privacy-safe reporting across normal
machines, CPU-only systems, GPU systems and future accelerator targets.

 It must
not run automatically in production, and light mode must stay bounded so it is
safe for ordinary development machines.



`galerina-devtools-graph-project` is developer tooling for architecture inspection and AI
assistant context.

 It may generate graph JSON, an HTML view, a graph report and
an AI map, but it must not become a source of truth for compiler validation,
runtime enforcement or security decisions.



Developer-only packages should be resolved through an explicit development
profile.

 Production lockfiles, runtime package manifests and application
deployments should not pull `galerina-devtools-*` or development-only `galerina-tools-*`
packages unless a maintainer opts into a development or staging mode.


Production boot/profile policy must additionally default-disable
`galerina-tools-benchmark` and `galerina-devtools-*`.

 If one is included in a production
build, `galerina-core-config` should require an explicit production package override
with a reason and expose that override in the runtime handoff and reports.

Galerina startup should use verified boot profiles for production.

Route graphs, policy graphs, schema validators, effects maps, package graphs
and target plans should be generated at build/check time where possible. Boot
should verify artefact hashes, load the smallest safe production surface and
defer optional AI, search, report, graph and benchmark packages until after
readiness.

Preplanned startup should use a verified artefact flow:

```text
build/check
  -> boot profile
  -> route, policy, schema, effects and runtime-plan artefacts
  -> verified boot snapshot bundle
  -> minimal cold boot
  -> safe warmup
  -> deferred optional warmup
```

The initial Galerina boot snapshot should be a deterministic bundle, not a raw
runtime memory dump. It may contain route tables, policy tables, validators,
package graph data, target plans and startup reports. It must not contain
secrets, raw request bodies, authorization decisions or non-deterministic
external data by default.

Fast response should be treated as a request-path architecture concern.

The API server and app kernel should combine precompiled route dispatch,
prebuilt validators, warmed security policy tables, bounded worker pools,
inbound transport policy, outbound connection pools and network performance
reports. Keep-alive and pooling must remain policy-controlled and must not
bypass auth, validation, TLS, rate limits, body limits, timeout policy,
backpressure, secret-safe logging or audit requirements.

The fast response path should be:

```text
reusable transport connection
  -> precompiled route lookup
  -> prevalidated schema and policy
  -> warmed typed flow
  -> audited response
```

HTTP/1.x keep-alive, HTTP/2 multiplexing and HTTP/3/QUIC are deployment
transport capabilities. They are not core language syntax.



Deployment auto-configuration should be profile-driven and target-aware.


Deployment declarations record portable intent, while local machine profiles,
runtime capability profiles, tuning results and deployment secret metadata stay
out of Git.

 Production first boot should detect operating system, architecture,
CPU features, container status and memory limits before selecting runtime and
compute settings.

 Production traffic must wait for deployment gates, readiness
checks and smoke tests, with rollback metadata and deployment reports emitted
for human and AI review.

 The full model is documented in
`docs/DEPLOYMENT_AUTOCONFIG. md`.



Finance, electrical and OT packages are archived post-v2 domain planning.

 They
must not be part of active v1 package resolution, compiler targets or build
reports.

 Any future restoration must start with a new design review because
finance and OT/electrical domains carry regulatory, protocol correctness,
safety and cybersecurity requirements beyond the v1 language scope.



`galerina-core-logic` owns logic semantics such as `Tri`, `Galerina` and Omni.


The first concrete logic contract provides deterministic Tri operations,
explicit Tri-to-Bool conversion policy, Galerina definition validation, state
bounds checks and truth-table diagnostics.

 This blocks common failure modes:
unknown values silently becoming true, malformed widths escaping into reports,
duplicate state names hiding policy errors and incomplete truth tables masking
unhandled states.


`galerina-core-photonic` owns photonic concepts, representation models and simulation
vocabulary.

 Photonic mappings may consume logic states, but logic semantics stay
in `galerina-core-logic`, and backend target planning stays in `galerina-target-photonic`.



`galerina-core-vector` owns vector, matrix and tensor value concepts.

 `galerina-core-compute` owns
compute planning and target selection.

 `galerina-ai` owns generic AI inference
contracts and safety policy.

 `galerina-ai-agent` owns supervised AI agent definitions,
tool permissions, task groups, merge policies and reports.

 `galerina-ai-neural` owns
neural-network model, layer, inference and training boundaries.


`galerina-ai-neuromorphic` owns spike/event-driven model contracts.

 `galerina-ai-lowbit` owns
low-bit and ternary model references, backend selection and CPU inference
plans.

 `galerina-target-cpu` owns CPU capability and fallback planning, while
`galerina-cpu-kernels` owns optimized CPU kernel contracts.

 `galerina-target-native`,
`galerina-target-wasm`, `galerina-target-gpu`, `galerina-target-ai-accelerator` and
`galerina-target-photonic` own target-specific planning for native executable,
WebAssembly, GPU, AI accelerator, optical I/O and photonic backends.

Portable systems output is a generated backend direction, not normal application
source style. The architecture should preserve a split between the Galerina app
layer, which owns APIs, JSON, security policy and business flows, and a future
systems layer, which may own runtime internals, native ABI interop, layout-safe
buffers and accelerator bindings. Native ABI bindings must remain explicit,
source-mapped and reportable.

The Machine Profile Bridge is the planned runtime/tooling layer between
high-level Galerina source and machine-specific execution. It should detect local
capabilities, write local uncommitted capability profiles, specialise boot/main
runtime settings for the deployment machine and report every adapter, fallback
and permission decision. It must not make application source look like low-level
systems code.

Official draft wording for low-level boundaries is `layout native` and
`interop native`, with a required ABI declaration such as `abi c`, `abi wasm`,
`abi system` or `abi plugin`. The category is native; the ABI is explicit.


`galerina-tools-benchmark` may consume these packages to test target behavior, but target
capability semantics stay in the target packages.



AI accelerator support is passive and vendor-neutral.

 Galerina source should prefer
`ai_accelerator`; concrete devices such as Intel Gaudi 3 are backend profiles in
`galerina-target-ai-accelerator`, selected by config, adapter policy or capability
detection.

 The first practical integration path should use controlled adapters
over existing AI frameworks rather than a native Galerina compiler backend.

 Reports
should record backend profile, framework adapter, precision, memory tier,
topology and fallback.



Optical I/O is different from photonic compute.

 Galerina should model Intel Silicon
Photonics, OCI-style devices, optical Ethernet, co-packaged optics and photonic
interconnects as high-bandwidth deployment capabilities for moving data between
CPUs, GPUs, accelerators, memory pools and storage.

 They are not a photonic CPU
target, and normal developers should not control raw light directly.


`galerina-core-compute` owns the `optical_io` target selection and data-movement
cost model, while `galerina-core-network` owns network policy and
`galerina-target-photonic` owns optical I/O planning reports, topology hints,
fallback paths and transfer-format recommendations until a future
`galerina-io-optical` package is split out.

 This lets Galerina optimize data
locality, tensor streaming, schema-compressed transfers, accelerator placement,
energy-aware movement and remote memory safety without pretending that optical
I/O performs normal application computation.



Neural networks are typed compute workloads, not normal app syntax.

 Galerina can
define model, inference and training boundaries through `galerina-ai-neural`, while
tensor shapes stay in `galerina-core-vector` and target selection stays in `galerina-core-compute`.


Parallel AI agents are supervised orchestration workloads, not uncontrolled
background processes.

 Agent control, tool permissions and merge policies belong
in `galerina-ai-agent`; structured concurrency and cancellation belong in `galerina-core-runtime`;
heavy inference or vector work should still go through `compute flow` and
`galerina-core-compute`.


The multi-agent runtime must treat agents as untrusted workers.

 Agents exchange
typed messages through a runtime-controlled bus, use tools through a gateway,
receive secrets only through secret-guard operations, run under visibility,
memory, cache and sandbox policy, and require human approval before dangerous
actions are applied.

 The runtime must generate audit reports for agent calls,
tool use, proposed file changes, cache decisions, policy violations and human
approval requirements.

 The full model is documented in
`docs/MULTI_AGENT_RUNTIME. md`.


Passive LLM caching belongs to provider-neutral AI contracts, not ad hoc app
code.

 `galerina-ai` should define cache policy, strict key material, typed output
validation and provider-neutral cache behavior; `galerina-core-security` owns
secret/privacy checks; `galerina-core-reports` owns shared cache report shapes; and
runtime/provider adapters own storage and execution details.

 Cache use must be
safe to bypass, denied for secrets and sensitive raw data by default, invalidated
by relevant model/schema/policy/source changes, and reported without exposing
prompt text or secret values.

 See `docs/PASSIVE_LLM_CACHE. md`.


Low-bit AI is a CPU fallback path for AI inference, not a core language feature.


When a compute policy requests AI inference, Galerina can prefer AI accelerator, GPU
or NPU targets and fall back to `low_bit_ai` or CPU when the model, backend and
capability checks pass.

 BitNet may be selected as the backend today, but Galerina
source syntax should remain generic so future low-bit standards can replace it.


Target selection reports must record the selected backend, fallback reason,
token and memory limits, thread limit and warnings.



`galerina-core-security` owns shared security primitives and report contracts.

 Runtime auth
and API policy enforcement remain in `galerina-framework-app-kernel`.

 `galerina-core-config` owns
configuration loading contracts, and `galerina-core-reports` owns shared report shapes.


Reusable security decisions deny by default, matching deny grants take precedence
over matching allows and permissive default or wildcard models are diagnosed.


Redaction fails closed by default when input or rules cannot be trusted, so
reports do not leak raw secrets because a rule was malformed.



`galerina-core-config` validates project configuration, resolves environment modes and
produces runtime handoff objects with structured diagnostics.

 It represents
environment variables by safe references only: names, required flags, secret
flags, scopes and optional non-secret defaults.

 Production strictness policy
checks and default-disabled production package checks belong here, while secret
protection and redaction remain in `galerina-core-security`.



Controlled recovery belongs across language, runtime and report layers.


`galerina-core` may describe resilient flow syntax direction, but `galerina-core-runtime` owns
supervision, cancellation, retry scheduling and checkpoint/resume hooks.


`galerina-core-reports` owns processing report shapes for partial success, retries,
quarantine and failure summaries.

 `galerina-framework-app-kernel` should still prefer
transactions, rollback, idempotency and hold-for-review for security-sensitive
API workflows.



Structured Await belongs across the same boundaries.

 `galerina-core` owns `await`,
`await all`, `await race`, `await stream`, queue-await syntax, effect checks and
compiler diagnostics.

 `galerina-core-runtime` owns scheduling, scoped child tasks,
timeout enforcement, cancellation propagation, race policy and stream
backpressure.

 `galerina-framework-app-kernel` owns request scopes, route limits,
queue/job handoff policy and audit events.

 `galerina-core-reports` owns shared async
report shapes so compiler, runtime and kernel facts can be emitted consistently.


Normal Galerina developers should use Structured Await forms rather than direct
future/promise management.



Storage-aware performance is a tooling/runtime concern, not direct hardware
support.

 `galerina-core` owns language rules for streaming large data, read-only
views, explicit clone/copy-on-write and conservative cache semantics.


`galerina-core-compiler`, `galerina-core-cli` and `galerina-devtools-graph-project` may use
storage facts for incremental compilation, IDE indexes and project graph scans.


`galerina-core-runtime` may use storage facts for bounded file I/O and safe temporary
storage.

 `galerina-core-reports` owns storage and build-cache report shapes.

 Hardware
details may be unavailable, so every storage-aware optimization must have an
unknown-storage fallback and must not depend on cache correctness.



`galerina-framework-app-kernel` should not be renamed to `galerina-core-runtime`.

 A future `galerina-core-runtime`
package should execute compiled or checked Galerina code.

 The app kernel should
remain the secure application/API boundary that controls validation, auth,
idempotency, limits, jobs and runtime reports.



## Repository Boundaries

The current template keeps all files in one root Git repository while the
package boundaries are still being shaped.



Later, split reusable Galerina packages into their own `packages-galerina/` repository:

```text
light-framework/.

git
light-framework/packages-galerina/.

git
```

This is appropriate when the same packages need to be imported into different
framework repositories.

 At that point, the root framework repository should
treat `packages-galerina/` as an external dependency, not as ordinary tracked child
files.



## Checked Run Smoke Tests

The framework layer can be exercised without compiling by running Galerina core
checked Run Mode against `.

fungi` test fixtures.



```text
packages-galerina/galerina-framework-app-kernel/tests/
`-- hello-world.

fungi
```

The current smoke test runs through the Galerina core prototype:

```bash
npm.

cmd --prefix packages-galerina/galerina-framework-app-kernel run test:hello
```

## Generative Runtime Mapper

The Generative Runtime Mapper is a future advisory layer that may consume
Galerina runtime reports, project graph data, effect graphs, permission usage,
AI/tool behaviour, memory pressure, performance paths, security denials and
source-code structure to build an explainable runtime and code intelligence
map.

It should support maps such as:

```text
route -> handler -> database
route -> AI worker -> tool
API -> queue -> background worker
actor -> permission -> effect decision
module -> function -> effect usage
```

The mapper may generate:

```text
runtime graph
code graph
security graph
memory heat map
performance opportunities
risk reports
architecture suggestions
patch proposals for review
ML learning signals
```

The mapper is not an authority layer. It must not silently mutate runtime state,
source code, permission declarations, policies or deployment configuration.
It observes, explains and recommends. Any mutation remains gated by explicit
policy and human approval.

Mapper reports must separate facts from suggestions:

```text
FACT:
Route /orders allocates 128 MB average.

SUGGESTION:
Streaming JSON decode may reduce memory pressure.
```

Security boundaries are mandatory. Mapper telemetry must redact secrets,
tokens, cookies, authorization headers, raw credentials, private payloads,
sensitive personal data and private AI prompts. Future ML exports must be
structural and redacted rather than raw runtime payloads or private source.

The concept is documented in
`../../ZTF-Knowledge-Bases/generative-runtime-mapper.md`.

## AI As Untrusted Reasoning Worker

Galerina AI support should treat AI as an untrusted reasoning worker rather than
trusted program logic.

The core operating rule is:

```text
AI can suggest.
Galerina must verify.
Runtime must enforce.
```

Future AI concepts should be represented as typed contracts and reports rather
than hidden framework behaviour:

```text
AiTask
AiWorker
AiModel
AiContext
AiEvidence
AiClaim
AiDecision
AiToolCall
AiReport
```

AI runtime execution should follow a controlled pipeline:

```text
security phase
-> trusted policy
-> untrusted context
-> secret redaction
-> AI worker execution
-> structured output validation
-> evidence verification
-> permission enforcement
-> human approval when required
-> audit/report emission
```

AI output must not directly mutate state, change policy, deploy code, access
secrets, send messages, write databases or call networks unless typed policy
explicitly grants that ability and runtime enforcement allows it.

Hallucination cannot be fully eliminated, so hallucination must be made
non-authoritative. Claims without evidence remain unverified. Missing data
should produce `Unknown`, not a guess. Contradictions should reject or escalate
the decision.

Future report families should include:

```text
ai-context-report.json
ai-claim-report.json
ai-evidence-report.json
ai-tool-permission-report.json
ai-hallucination-risk-report.json
human-review-report.json
```

The concept is documented in
`../../ZTF-Knowledge-Bases/ai-as-untrusted-reasoning-worker.md`.

## Untrusted File, Asset And Base64 Boundaries

Galerina should treat uploaded files, embedded assets and base64 data URIs as
untrusted executable-adjacent content.

The runtime intake shape should be:

```text
upload or embedded asset
  -> quarantine
  -> security classification
  -> bounded inspection
  -> isolated parsing
  -> sanitisation/conversion
  -> safe asset storage
  -> optional safe AI extraction
```

The main runtime should not directly parse PDFs, Office documents, images,
SVGs, archives or media in a privileged context. Parser workers should run with
strict memory/time limits, no secrets, no ambient filesystem access and no
network access unless a policy explicitly allows it.

Safe reconstruction is preferred:

```text
image -> decode pixels -> strip metadata -> clean WebP/PNG
PDF -> render/extract -> rebuild safe PDF or safe structured text
SVG -> sanitise active content -> store safe asset
```

Active content is denied by default:

```text
PDF JavaScript
Office macros
SVG scripts
embedded executables
launch actions
external resource references
HTML in metadata
```

Base64 data should be handled as untrusted encoded asset data. Before decoding,
the runtime should run the security phase, parse metadata only, validate policy
and estimate decoded size. Large assets should generally be externalised after
validation rather than retained inline.

The concepts are documented in:

```text
../../ZTF-Knowledge-Bases/untrusted-file-asset-processing.md
../../ZTF-Knowledge-Bases/bit-width-and-base64-asset-policy.md
```

## Numeric Width And Boundary Representation

Normal application code should use safe numeric concepts that avoid silent
overflow, truncation and signedness confusion. Fixed-width and low-bit numeric
types are boundary concepts for protocols, interop, images, media,
cryptography, AI tensors, GPU kernels and hardware packages.

The runtime/compiler may optimise representation automatically where safe, but
must not silently:

```text
truncate
wrap
overflow
reinterpret signedness
```

Unsafe conversion should return explicit errors rather than raw values.
Boundary reports should make numeric-width, overflow, endianness, precision and
low-bit representation decisions visible and audit-friendly.

## Memory Pressure As Security Event

Galerina should treat low memory as a runtime security condition. Memory pressure
can be triggered accidentally, but it can also be caused deliberately through
large payloads, deep nesting, expensive parsing, concurrent request floods,
unbounded queries, file bombs and oversized AI contexts.

The runtime shape should be:

```text
request/task/worker
  -> memory budget assignment
  -> bounded allocation
  -> pressure monitoring
  -> backpressure or load shedding
  -> deterministic cleanup
  -> secret-safe report
```

Memory budgets should exist at app, request, worker, parser, stream and AI
context boundaries. Allocation should be fallible and report typed errors such
as `OutOfMemory`, `MemoryLimitExceeded`, `AllocationDenied`,
`FragmentationRisk` and `BufferTooLarge` where recovery is possible.

Backpressure should happen before true out-of-memory:

```text
normal       accept requests
warning      reduce concurrency
critical     reject new risky requests
emergency    cancel non-essential work
```

The runtime should cancel low-priority background, analytics, cache and AI
summarisation work before security, authentication, audit and cleanup paths.
Streaming, paging, chunking and bounded queues are preferred over full-memory
reads and unbounded collections.

Future report families should include:

```text
memory-pressure-report.json
allocation-denied-report.json
request-memory-report.json
oom-near-miss-report.json
cleanup-report.json
```

The concept is documented in
`../../ZTF-Knowledge-Bases/memory-pressure-security.md`.

## Compile-Time Metadata Reflection

Galerina reflection should be a compiler and tooling feature, not a runtime
object-inspection feature.

The architecture rule is:

```text
Metadata may describe execution.
Metadata must not control execution at runtime.
```

The safe pipeline is:

```text
source
  -> parser
  -> AST
  -> metadata extraction
  -> semantic checks
  -> governance checks
  -> Governed IR
  -> verified execution
  -> reports
```

Compile-time metadata may describe data models, views, flows, permissions,
capabilities, vaults, routes, events, packages, effects, response contracts,
audit events and storage boundaries. It can feed documentation, test matrices,
schema generation, permission checks, route/flow/data link checks, audit
graphs, project graphs, AI architecture indexes and Governed IR creation.

Normal flow execution should not expose runtime reflection APIs that list live
objects, inspect private fields dynamically, invoke methods by string, mutate
permissions, load unknown modules or patch behaviour at runtime. Runtime gates
may consume verified metadata generated before execution, but application code
must not dynamically discover or grant authority from live objects.

The concept is documented in
`../../ZTF-Knowledge-Bases/compile-time-metadata-reflection.md`.

## Security Invariants And Policy Proof

Galerina should compile toward policy proof, not only executable output.

The compiler and runtime should be able to prove or deny questions such as:

```text
Can this flow expose restricted data?
Can this actor use this effect?
Can this package reach the network?
Can this unsafe block run in the selected profile?
```

Security-aware IR should preserve permissions, capabilities, classifications,
exposure levels, ownership, actor identity, trust boundaries, effects, audit
requirements, package authority and isolation requirements. After checking,
runtime execution plans should be immutable; normal code must not monkey patch,
inject hidden behaviour, mutate metadata to gain authority, rewrite types at
runtime or use reflection as execution authority.

High-assurance deployments should support hardened profiles that disable
runtime reflection, unsafe blocks, shell execution, unsigned packages/plugins,
raw SQL and nondeterministic execution where policy requires it, while making
audit mandatory.

The concept is documented in
`../../ZTF-Knowledge-Bases/security-invariants-and-policy-proof.md`.

## Excluded Features

Galerina deliberately excludes features that create hidden behaviour, unsafe
authority, performance unpredictability, or runtime paths that are hard to
govern and audit. These include: classes and inheritance, dynamic eval, runtime
code generation, monkey patching, global mutable variables, direct environment
variable access, raw pointers, unchecked casts, unsafe promotion, exceptions as
control flow, unbounded loops and recursion, direct thread control, shared
mutable concurrency, and implicit network/file/database access.

The full excluded features reference table with reasons and recommended
Galerina alternatives is documented in
`../../ZTF-Knowledge-Bases/excluded-features.md`.

## Governed Execution Director

Galerina should include a Governed Execution Director as the runtime planning and
coordination layer.

The Director asks:

```text
what is this?
what is allowed?
what needs to happen?
where should it run?
has it already been verified?
why is access requested?
why is data being returned?
what proof is needed?
```

The core execution shape is:

```text
data enters
  -> Director identifies it
  -> contracts and policy are checked
  -> execution plan is built
  -> compute target is selected
  -> memory path is assigned
  -> normal path or verified fast pipe is selected
  -> passive modules execute approved work
  -> audit/proof system records the result
```

The authority split is:

```text
The Director understands.
The policy decides.
The modules execute.
The audit proves.
```

The Director must not become hidden authority. It prepares and coordinates a
verified execution plan. Policy remains responsible for permission,
capability, effect and boundary decisions.

All modules should consume a shared understanding model containing data type,
sensitivity, source, owner, requested action, required effects, required
capabilities, compute shape, memory shape, output contract, audit requirement,
validation state, processing state, trust state and expiry state.

Compute, AI, storage, network and boundary modules are passive executors. They
must operate inside the verified plan and must not widen permissions, change
output contracts, select new targets or grant themselves authority.

Verified Fast Pipes skip repeated work, not required security. They may reduce
re-parsing, re-copying, re-shaping and re-planning, but must keep policy,
capability, audit, expiry, trust, revocation and boundary checks intact.

Sensitive access and output should support justified execution, where the
reason for access, output, target selection, plugin use or AI tool use becomes
part of the execution plan and audit proof.

The concept is documented in
`../../ZTF-Knowledge-Bases/governed-execution-director.md`.

## Runtime Terminology And Platform Identity

Galerina should be described as:

```text
a governance-first programming language, runtime and execution architecture
designed to coordinate secure computation across CPUs, GPUs, AI accelerators,
optical systems and future heterogeneous hardware.
```

Rather than focusing only on instruction execution, Galerina focuses on:

```text
understanding execution intent
enforcing explicit authority
planning compute economics
coordinating hardware resources
producing auditable governed execution
```

Galerina combines:

```text
governed execution
capability-based security
hardware-aware runtime orchestration
AI-native compute planning
future-neutral compute abstractions
structured auditability
operational runtime coordination
```

into a unified compute platform.

The runtime terminology should therefore move away from traditional VM,
thread-centric and CPU-centric names and toward operational responsibility
names:

| Previous Name | Updated Name |
| --- | --- |
| Director | Runtime Command |
| Sheriff | Authority Control |
| Steward | Runtime Logistics |
| Balancer | Resource Deployment Balancer / Compute Balancer |
| Scheduler | Execution Coordination Scheduler |
| Assembler | Result Assembler |

The architectural model is:

```text
intent
  -> governed execution plan
  -> coordinated compute
  -> assembled result
  -> audit proof
```

Names should describe the responsibility a component owns, not the temporary
mechanism used to implement it. This keeps the architecture readable for
humans, AI tools and future compute targets.

The Compute Balancer is the focused hardware-pressure role inside the broader
Resource Deployment Balancer responsibility. It observes CPU cores,
performance/efficiency cores, GPU, NPU, TPU, VPU, ASIC, FPGA, memory, VRAM,
temperature, power state, queue depth, device availability, trust level and
fallback options.

It may only choose from compute targets already approved by Authority Control:

```text
Approved hardware only.
Best available target.
Safe fallback always.
```

The concepts are documented in:

```text
../../ZTF-Knowledge-Bases/runtime-terminology-evolution.md
../../ZTF-Knowledge-Bases/terminology-naming-philosophy.md
../../ZTF-Knowledge-Bases/compute-balancer.md
```

## Data Visibility Views

Galerina should use `view` for field-level data exposure metadata.

The definition is:

```text
view = who or what may see or expose this data
```

Previous exposure examples used:

```galerina
message: String classify: public
```

New examples should use:

```galerina
message: String view: public
```

Permission rules should also use view terminology:

```galerina
data {
  allow expose view: public
  allow expose view: private owner: actor
  deny expose view: secret
}
```

Built-in runtime/language view levels are:

```galerina
Runtime.View {
  public
  internal
  private
  confidential
  secret
  restricted
  regulated
}
```

Equivalent declaration form:

```galerina
runtime view public
runtime view internal
runtime view private
runtime view confidential
runtime view secret
runtime view restricted
runtime view regulated
```

Meaning:

```text
public
internal
private
confidential
secret
restricted
regulated
```

`view: private` maps to `Runtime.View.private`. `allow expose view: private
owner: actor` means fields marked `Runtime.View.private` may be exposed only
when the data owner is the current actor.

Common view behaviour should be defined once:

```galerina
runtime view private {
  expose when owner == actor
}
```

Then permissions can reference the standard behaviour:

```galerina
data {
  allow expose view: public
  allow expose view: private
}
```

Meaning:

```text
public  = expose normally
private = expose only when owner == actor
```

Permission-level conditions should normally narrow standard view behaviour:

```galerina
allow expose view: private when owner == actor and purpose == "support"
```

Widening standard view behaviour requires explicit policy review, audit and
report output.

The runtime may use view metadata for response filtering, serialization
filtering, audit filtering, AI context filtering, log filtering, API exposure
checks, frontend exposure validation and model projection.

This is separate from broader security/input/AI/compute classification. Those
uses may still use `classification` where the meaning is not field exposure.

The concept is documented in
`../../ZTF-Knowledge-Bases/data-visibility-view-terminology.md`.
Built-in levels are documented in
`../../ZTF-Knowledge-Bases/builtin-view-levels.md`.
Standard behaviour inheritance is documented in
`../../ZTF-Knowledge-Bases/standard-view-behaviour.md`.

## Postfix Type State Model

Galerina uses postfix state syntax to attach governance state to values. The base
type is written first; the state qualifier follows:

```galerina
let input:  String  unsafe             = request.body("name")
let secret: String  secure             = env.secret("APP_SECRET")
let email:  Email   safe   validated   = validate.email(rawEmail)
let raw:    Json    unsafe unvalidated = boundary.api.body(request)
```

This avoids creating many wrapper types (`SecureString`, `UnsafeJson`, etc.).
The base type stays reusable; the state describes how the value may flow.

v1 state set: `safe`, `unsafe`, `validated`, `unvalidated`.

State cannot change through assignment — only through approved transition
operations (validators, sanitizers, declassification). The compiler rejects
state weakening without an explicit operation.

The concept is documented in
`../../ZTF-Knowledge-Bases/postfix-type-state-syntax.md`.

## Branded Types

Branded types give a plain representation a distinct compile-time domain identity:

```galerina
type CustomerId  = Brand<String, "CustomerId">
type OrderId     = Brand<String, "OrderId">
type SessionToken = Brand<String secure, "SessionToken">
```

`CustomerId` and `OrderId` share the same runtime representation but are
compile-time distinct. This prevents ID mixing errors at API, payment, auth,
storage and routing boundaries.

Brands compose with postfix state qualifiers. A brand alone does not validate
format — external values must be validated before being branded.

The concept is documented in
`../../ZTF-Knowledge-Bases/generic-types.md`.

## Build System Architecture

The Galerina build system produces an **execution contract**, not only an
executable. The pipeline is:

```text
source -> checked project -> manifests -> runtime plan -> artefacts -> reports
```

`galerina build` proves the package. `galerina deploy` proves the environment
accepts the package.

Build produces:
```text
app.type-manifest.json     — type contracts for runtime planning
app.effect-manifest.json   — declared effects
app.authority-manifest.json — authority declarations
app.route-table.json       — route bindings
app.runtime-plan.json      — decoder plans, startup order, fallback rules
app.build-manifest.json    — root evidence file required by deploy
```

Deploy consumes a verified build manifest. It does not rebuild. Deploy produces
a deployment report and requires rollback evidence.

The type manifest is a runtime governance asset — it bridges compile-time proof
to runtime authority and feeds: schema precompilation, decoder setup, redaction
maps, hot reload invalidation, and AI-readable context.

The concept is documented in
`../../ZTF-Knowledge-Bases/build-system-and-cli.md`.
The type manifest is documented in `../../ZTF-Knowledge-Bases/type-manifest.md`.

## Variable Mutation And Vault Model

Galerina v0.1 should keep variable and shared-state syntax small:

```text
let       normal local variable inside a flow
mut       explicit mutation action
readonly  cannot be changed after creation
vault     protected shared state
secure    access to vault state
Secret<T> protected secret value
```

`const` is deferred. `readonly` replaces `const` for now unless Galerina later
needs compile-time constants separate from runtime readonly values.

The core rule is:

```text
Variables are local by default.
Mutation must always be explicit.
Shared state must be protected.
Secrets and shared state must never be implicit.
```

Local values remain inside flow/block scope. Mutation must be visible:

```galerina
let counter: Int = 1
mut counter++
```

Unmarked mutation is not allowed:

```galerina
counter++
counter = counter + 1
```

`mut counter++` is preferred over `counter++` because the mutation marker makes
state changes visible to developers, AI tools, checker diagnostics and mutation
reports.

Readonly symbolic values replace v0.1 constants:

```galerina
readonly PI: Decimal = 3.14159
readonly MatrixSize: Int = 4
```

Shared state belongs in vaults and should be accessed through `secure`:

```galerina
vault {
  loginCount: Int {
    allow incrementLogin write
    allow getLoginCount read
    audit required
  }
}

let count = secure.loginCount
mut secure.loginCount++
```

Vault record writes should use the same visible mutation rule:

```galerina
mut secure.session[session_uuid] = {
  actor_uuid: user.uuid,
  created_at: Runtime.now(),
  expires_at: Runtime.now() + Duration.hours(12),
  revoked: false
}
```

Older source-level writer calls such as
`SessionVault.write(context, session_uuid, session)` should not be the preferred
v0.1 surface. The runtime may lower `mut secure.*` operations into internal
vault write calls, but source code should keep protected writes visible and
should inherit governed runtime context instead of passing generic `context`
parameters everywhere.

Secret values should use `Secret<T>` so logging, rendering, AI exposure,
unsafe serialization and reports can apply redaction and flow tracking.

The concept is documented in
`../../ZTF-Knowledge-Bases/variable-mutation-vault-design.md` and
`../../ZTF-Knowledge-Bases/explicit-mutation-and-vault-writes.md`.

## Phase 4 — Parser and AST

Phase 4 is the highest-priority active phase. Its goal is a deterministic, testable,
source-mapped parser that produces a typed AST conforming to a published JSON schema.

The Phase 4 plan, deliverable checklist, AstNodeKind additions, diagnostic codes,
outstanding questions and implementation suggestions live in:
`../../ZTF-Knowledge-Bases/phase-4-parser-ast-plan.md`

## Compute, Heterogeneous Targets and AI

The following Knowledge Base files cover compute, heterogeneous targets and AI features
that extend beyond the v1 surface. They should not drive v1 implementation but must be
understood before designing the parser AST and compiler passes.

| File | Contents |
|---|---|
| `galerina-compiler-enforcement-compute.md` | Capability gating, cross-target verification, resource budgets |
| `galerina-missing-syntax-keywords.md` | `deterministic flow`, `stream flow`, `yield`, placement hints, ownership at call sites |
| `galerina-memory-borrow-move-pinned.md` | `borrow`, `move`, `pinned` semantics and ownership model |
| `galerina-type-system-compute-extensions.md` | Full numeric tower, `Tensor<T,S>`, SIMD types |
| `galerina-concurrency-synchronisation-compute.md` | GPU atomics, barriers, memory fences, multi-stream |
| `galerina-ai-neural-npu-targets.md` | Neural operator IR, quantization, NPU compute target |
| `galerina-compiler-optimizations.md` | Comptime, pipeline fusion, bounds-check elimination, PGO, LLVM/MLIR |
| `galerina-data-layout-memory-hints.md` | `packed`, `aligned`, `simd` layout hints; profiling |
| `galerina-photonic-distinct-compute-model.md` | Photonic IR, wavelength types, delay-line memory |
| `galerina-native-runtime-roadmap.md` | Rust-first native runtime, 7-stage migration |

## Compliance and Governance for Regulated Industries

Finance, Medical, Government and other regulated-industry compliance is implemented at
the type and effect level, not as a framework concern:

`../../ZTF-Knowledge-Bases/galerina-compliance-governance.md`

Includes: `PII<T>`, `PHI<T>` (HIPAA), `PCI<T>` (PCI-DSS), `Classified<T>`, regulated
effects, OWASP coverage, GDPR/SOX policy syntax, break-glass access, compliance packages.

## Supply Chain and Package Governance

The Galerina-native module system (long-term npm replacement) is documented in:
`../../ZTF-Knowledge-Bases/galerina-native-module-system.md`

Cross-package capability inheritance warnings: `../../ZTF-Knowledge-Bases/galerina-developer-tooling-advanced.md`

## Developer Tooling

| File | Contents |
|---|---|
| `galerina-developer-tools.md` | LSP, diagnostics-with-fixes, governance-aware REPL |
| `galerina-developer-tooling-advanced.md` | Test skeleton generation, capability warnings, constraint-complete signatures |
| `galerina-ast-published-schema.md` | Stable public AST JSON schema |
| `galerina-intent-graph.md` | Machine-readable intent graph build artefact |
| `galerina-natural-language-governance-summary.md` | Deterministic governance summary generation |

## FUNGI-Graph

The `fungi-graph` standalone library (Apache 2.0) lives at `C:\laragon\www\FUNGI-Graph\` and
provides: graph data structures, BFS/DFS/topoSort/fixpoint algorithms, Galerina-specific
graph types (EffectGraph, BoundaryGraph, ProjectGraph, DependencyGraph), and the runtime
logging pipeline (JSONL audit writer, proof chain, event causality DAG).

Status: **complete** — 90 tests passing, built and published to `dist/`.
