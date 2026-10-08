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
/packages-ts/galerina-core-runtime
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

## Native VOK authority floor

The experimental native Verified Object Kernel authority floor lives under
`native/vok-authority` inside this package. It is an internal implementation
module, not a nested Galerina plugin. The `.fungi` asset owns the nine-gate K3
decision; the authority crate owns the bounded opaque table and keeps its
audited OS adapter private. `unsafe` is denied crate-wide and allowed only in
that private platform module, so no separately depend-able safe executor can
bypass the affine lease.

Current evidence covers exact native/`.fungi` parity for all 19,683 K3 vectors,
private affine admitted/lease types, current-context and generation checks,
bounded exact nonce history, eager revocation, terminal value-only receipts,
OS CSPRNG adapters and one closed 16-byte execution profile. On the current
Windows x86-64 host, a live receipt proves the generated page was executable
and not writable immediately before its one call. See
`../../docs/reports/native-vok-authority-table-2026-08-02.md`.

This is a linked bounded native floor, not the general VEO backend. Caller
bytes cannot describe machine instructions, imports, relocations, constructors
or paths; the adapter emits one fixed return-value stub and never requests
RWX. Opaque VM/component-resource handles transfer into the floor as kind-only
affine tokens and never become code. The first RD-0656 VEO envelope binds
domain-separated action and object identities around the return-u64 profile;
the general linker remains HOLD. Hostile handle isolation and logical wipe are
enforced; physical media erasure stays unproven. Independent live Linux W^X and
entropy receipts are collected via `vok-live-evidence`; macOS live receipts
remain HOLD. No receipt can set `authority_released` true.

See `../../../ZTF-Knowledge-Bases/reference/language/node-hosted-runtime-roadmap.md`.

Core runtime zones:

```text
trusted core           execution integrity, memory integrity, policy and audit
governed runtime zone  application execution, effects, packages and AI/tool work
untrusted zone         plugins, third-party packages, external services, hardware accelerators and unsafe interop
```

Untrusted systems may execute only through declared boundaries.

See `../../../ZTF-Knowledge-Bases/reference/language/securely-governed-runtime.md`.

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

See `../../../ZTF-Knowledge-Bases/reference/language/verified-fast-paths.md`.

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

See `../../../ZTF-Knowledge-Bases/reference/language/ai-compute-plan.md`.

Contracts: `src/governed-plan-contracts.ts` defines the execution plan stage machine
(`validateGovernedExecutionPlan`, `startGovernedExecution`, `advanceGovernedExecution`), fast path
signatures (`createFastPathSignature`, `checkFastPath`, `FAST_PATH_NEVER_BYPASSES`) and the AI compute
plan hooks (`admitAiComputePlan`, `checkAiComputeOutput`). They are pure and fail closed; the default AI
compute policy admits nothing. Fast path signatures are not authenticated by these contracts.

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

### Deterministic reducer reference

The beta reference now admits a closed `galerina.runtime.await.v1` plan and
reduces explicit task/time events into start, cancel and terminal commands. The
plan requires 1..1024 unique task IDs, a positive safe-integer timeout and a
finite `maxInFlight` no greater than task count. Completion is one of:

```text
all + cancel_remaining
all + wait_for_all
first_success
first_result
```

The reducer is syntax-neutral, reads no clock and executes no callback. Its
state and commands are reconstructed immutable values, and runtime state is
process-local branded so copied or forged snapshots cannot advance.

The load-bearing cancellation rule is:

```text
cancellation requested != task terminated
```

On timeout, explicit cancellation, a winning race or cancel-on-error, pending
tasks are closed and running tasks receive cancel commands. The scope remains
`cancelling` until every started task acknowledges a terminal state. Only then
does the reducer emit a terminal command. Deadline equality belongs to the
timeout, so a result observed exactly at `timeoutMs` cannot win the race.

This does not claim that an in-process signal forcibly stops arbitrary work.
Untrusted or non-cooperative execution goes through the isolated host adapter
below, and the reducer only sees its outcome through an authenticated receipt.
Stream queue/backpressure enforcement is a separate runtime chapter.

### Isolated hard termination and authenticated receipts

`src/isolated-host.ts` (zero-trust defaults, owner may revisit):

- `createIsolatedHost({ execPath, nodeMajor, spawn, signer, elapsedMs })` runs one
  guest `.mjs` in a separate Node process (Node 22 or later) with
  `--permission`, `--allow-fs-read=<entry>` only,
  `--disallow-code-generation-from-strings` and a bounded heap. The environment
  is empty (on Windows libuv still forwards its fixed set of system variables
  such as `PATH` and `TEMP`), so `NODE_OPTIONS` and host secrets do not
  reach the guest. The guest cannot write files, read other files, spawn
  processes, start workers, load addons or evaluate strings.
- On its deadline, on `cancel()` or when stdout passes `maxOutputBytes`, the
  guest is killed with `SIGKILL` (`TerminateProcess` on Windows). There is no
  grace period and no cooperative signal. Termination is claimed only after the
  child's `close` event; otherwise the run ends `termination_unconfirmed`
  with no receipt.
- Every observed outcome is turned into a `galerina.runtime.receipt.v1`
  receipt, HMAC-SHA256-signed by `createReceiptSigner` with a host-held key of
  at least 32 bytes. `createReceiptVerifier` refuses unknown keys, tampering,
  kind/cause disagreement, replays and reordering (strict per-scope sequence),
  and returns the exact `StructuredAwaitEvent` for `advanceStructuredAwait`.
  Kill causes map to `task_cancelled`, the acknowledgement a `cancelling`
  scope waits for.
- Last-seen / last-issued sequences are held in an injected
  `ReceiptSequenceStore` (required). The verifier writes the last accepted
  sequence before returning ok, so a durable store refuses replay across
  verifier restarts. `createMemoryReceiptSequenceStore` is process-local only
  and does not survive restart; hosts that need durability inject a store that
  commits before `setLastSequence` returns. A store failure refuses the
  receipt (`ERR_RUNTIME_RECEIPT_SEQUENCE_STORE`) without accepting it.
- No Node builtin is imported: the host passes `spawn`, the HMAC primitive and
  the sequence store in, and the HMAC is checked against RFC 4231 test case 2
  first.

Non-claims: this is not an OS sandbox. Network access is not confined by this
adapter, CPU use is bounded only by the wall-clock deadline, and a receipt proves
that the host observed an outcome, not that guest output is correct. Guest
output is returned as untrusted text.

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

## Runtime policy contracts

`src/runtime-contracts.ts` holds pure, fail-closed policy decisions. None of them executes guest code or performs I/O.

| Contract | What it does |
|---|---|
| Stream backpressure | `decideStreamBackpressure` accepts, pauses the producer, or fails the stream. It never drops data. |
| Memory policy | `validateRuntimeMemoryPolicy` and `decideRuntimeAllocation`: heap and single-allocation caps, zero-on-free, no shared memory. Executable memory stays with the RD-0662 W^X floor. |
| Node-hosted adapter | `validateNodeHostAdapter` requires Node 18 or later, the permission model, a closed `node:` builtin allowlist, no native addons and no eval. |
| Host-runtime overhead | `createHostOverheadReport` reports integer-nanosecond totals and integer permille overhead. Zero guest time gives `UNMEASURED`. |
| Target fallback | `decideTargetFallback` is off by default. When enabled it follows only the declared chain, uses only targets with exact semantics, and records every skipped target. |
| Resource budget | `DEFAULT_RUNTIME_RESOURCE_BUDGET` grants no network, tool or accelerator budget. `checkRuntimeResourceUsage` terminates on any overrun. |
| Malicious-data intake | `admitUntrustedData` validates positive finite policy bounds and closed key sets before staged checks: size, parse, depth/keys/strings/prototype keys, schema, canonical JSON, then owner. Admitted data stays tainted `untrusted`. |
