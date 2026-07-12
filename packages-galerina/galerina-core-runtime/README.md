# Galerina Runtime

`galerina-core-runtime` is the future execution engine for checked or compiled Galerina code.

At the current prototype stage, practical web/API execution is Node-hosted. The
runtime package should define target-independent execution contracts while
allowing a Node host adapter to execute the current path.

```text
today: checked Galerina execution through Node.js
future: Galerina VM, WASM, native or other checked runtime targets
```

It belongs in:

```text
/packages-galerina/galerina-core-runtime
```

Use this package for:

```text
checked Galerina execution
compiled Galerina execution contracts
runtime memory policy
memory hierarchy and cache fact reporting where available
ECC/reliability fact reporting where available
effect dispatch
runtime error handling
resilient flow supervision
structured await scheduling
cancellation propagation
timeout enforcement
retry scheduling
checkpoint and resume hooks
target fallback execution
network backend dispatch contracts
network timeout and backpressure enforcement hooks
resource budget enforcement
malicious-data intake pipeline hooks
hardware risk boundary reporting
runtime reports
verified boot-profile loading
safe startup warmup hooks
governed execution planning
verified fast path planning
AI compute plan execution hooks
AI authority-kernel execution hooks
capability lease expiry and revocation hooks
Node-hosted runtime adapter contracts
host-runtime overhead reports
```

## Securely Governed Runtime

`galerina-core-runtime` should evolve as the execution package for the Galerina
Securely Governed Runtime direction.

The runtime philosophy is:

```text
Security first.
Code second.
Authority never implicit.
```

The runtime must establish governance before code acts. Packages, plugins,
AI tools, storage, network access and compute targets must not receive authority
automatically.

Runtime execution should follow:

```text
request
 -> planning
 -> verification
 -> capability locking
 -> execution
 -> audit proof
```

The runtime should treat policy, effects, capabilities and audit hooks as part
of execution itself rather than external middleware.

Data cannot grant authority. The runtime must treat user input, API payloads,
AI/tool output, package metadata, storage data and hardware results as
untrusted until validated and assigned to a governed boundary.

Every request, task, AI/tool call and compute plan should receive explicit CPU,
wall-time, memory, recursion, loop, spawned-task, network, file, tool-call and
accelerator budgets before execution.

For AI actors, the runtime must separate intent from authority. AI agents may
request capabilities and propose work, but runtime authority is issued only by a
policy-controlled authority kernel as scoped, revocable and audited leases.

AI authority execution should follow:

```text
request capability
 -> declare reason and scope
 -> evaluate policy and risk
 -> sandbox or quarantine if code/package changes are involved
 -> require approval when high risk
 -> issue scoped lease
 -> execute through declared boundary
 -> audit and expire/revoke
```

## Node-Hosted Runtime Position

Current Galerina web/API execution should be documented as:

```text
HTTP request
  -> Node.js server
  -> Galerina framework/API server adapter
  -> Galerina app kernel
  -> Galerina checked rules and flows
  -> Node.js executes the runtime path
  -> HTTP response
```

Node hosting is an implementation stage, not a language semantic guarantee.
Node/V8 behavior must not define Galerina source meaning, and benchmarks from
this path must be labelled as prototype runner or host-runtime overhead rather
than native Galerina compiler performance.

See `../../../ZTF-Knowledge-Bases/node-hosted-runtime-roadmap.md`.

Core runtime zones:

```text
trusted core           execution integrity, memory integrity, policy and audit
governed runtime zone  application execution, effects, packages and AI/tool work
untrusted zone         plugins, third-party packages, external services, hardware accelerators and unsafe interop
```

Untrusted systems may execute only through declared boundaries.

See `../../../ZTF-Knowledge-Bases/securely-governed-runtime.md`.

## Verified Fast Paths

The runtime may use verified fast paths to reduce repeated planning,
validation, allocation and compute negotiation.

A verified fast path is not less security. It is pre-verified execution for a
workload that matches a known execution signature.

Fast paths must never bypass:

```text
policy
capability limits
effect boundaries
data contracts
audit requirements
```

Fast path authority is leased and contextual, never permanent. Fast paths must
expire and must be invalidated when policy, package versions, model versions,
hardware, trust state or output contracts change.

See `../../../ZTF-Knowledge-Bases/verified-fast-paths.md`.

## AI Compute Plans

The runtime should understand AI workloads as declared compute plans rather than
opaque model calls.

AI compute plans should declare:

```text
input type
output type
model class
data sensitivity
precision
latency target
compute target
memory needs
allowed tools
audit needs
```

This lets the runtime enforce policy before execution, reduce copying, batch
compatible work, select suitable CPU/GPU/NPU/WASM targets, validate typed output
and produce compliance evidence.

See `../../../ZTF-Knowledge-Bases/ai-compute-plan.md`.

## Startup And Boot Warmup

`galerina-core-runtime` should support verified startup rather than runtime
discovery in production.

At build/check time, Galerina may generate a boot profile containing route graph
hashes, policy graph hashes, schema validator hashes, package graph hashes and
target plans. At boot, the runtime should verify those artefacts, load the
smallest safe runtime surface and expose hooks for safe warmup.

Runtime startup responsibilities include:

```text
verify boot-profile hash inputs
load prebuilt route/security/schema artefacts
load eager production packages only
defer optional AI/search/report/benchmark packages until after readiness
warm safe validators and runtime tables
deny secret caching
emit startup reports
```

Startup caches must be deterministic, non-secret, rebuildable, bounded and safe
to bypass. They must not be required for correctness.

## Structured Await Runtime

`galerina-core-runtime` should execute the lower-level mechanics behind Galerina Structured
Await while keeping those mechanics out of normal application code.

Runtime responsibilities include:

```text
create request/job/task scopes
schedule await all child work inside the parent scope
enforce await and await-group timeouts
propagate cancellation to unfinished children
apply race policies such as firstSuccess and firstResult
apply stream backpressure and max in-flight limits
dispatch network auto plans to the selected platform backend
emit runtime facts for async/concurrency reports
release resources when scopes end
```

The runtime may use futures, tasks, schedulers or polling internally, but those
types should remain package/runtime author APIs rather than the default Galerina
developer model.

## Controlled Recovery

`galerina-core-runtime` should distinguish item/data failures from system/runtime failures.

```text
item/data failure:
  may continue only when a resilient flow declares the policy

system/runtime failure:
  stop or restart safely, cancel children, release resources and report
```

Memory corruption, unsafe native failures and runtime integrity failures should
not continue blindly. Memory pressure can use controlled recovery such as
streaming mode, reduced batch size, backpressure, checkpointing or target
fallback.

## Memory Hierarchy and Reliability Facts

The runtime may report memory hierarchy and reliability facts when the platform
exposes them, such as cache line size, cache metadata or ECC status. It must not
claim direct control over CPU cache levels or ECC hardware.

When details are unavailable because the app is running in a container, VM,
managed host or restricted runtime, the runtime should report `unknown` rather
than guessing.

## Boundary

`galerina-core-runtime` executes Galerina code. It is not the secure application boundary.

```text
galerina-core-runtime
  executes checked or compiled Galerina code and Structured Await scopes

galerina-framework-app-kernel
  validates requests, checks auth, controls idempotency, rate limits, jobs and API policy

galerina-core-network
  defines network policy, profile, backend capability and report contracts
```

Final rule:

```text
galerina-core-runtime runs Galerina.
galerina-core-network describes network I/O contracts.
galerina-framework-app-kernel governs application/API runtime boundaries.
```
