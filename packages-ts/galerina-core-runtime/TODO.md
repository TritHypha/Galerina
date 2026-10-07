# Galerina Runtime TODO

V1 freeze rule: the runtime package should support CPU-compatible checked
execution, WASM handoff planning, explicit `Result`/`Option` handling,
Structured Await policy hooks and the memory-safety model before post-v1 target
runtime work.

```text
[x] Create /packages-ts/galerina-core-runtime
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define runtime execution context
[x] Define checked execution contract
[x] Define compiled execution contract
[x] Define runtime effect dispatch contract
[x] Define Structured Await scope and deterministic scheduler-reducer contract
[x] Define cancellation request/acknowledged-termination propagation contract
[x] Define timeout enforcement decision contract with deadline equality
[x] Define stream backpressure runtime contract
    src/runtime-contracts.ts validateStreamBackpressurePolicy / decideStreamBackpressure (no drop mode); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Add isolated hard-termination adapter for untrusted/non-cooperative work
    src/isolated-host.ts createIsolatedHost (separate Node process under --permission with entry-only fs read, no eval; empty env; SIGKILL/TerminateProcess on deadline, host cancel or output flood with no grace period; termination claimed only after "close", else termination_unconfirmed with no receipt; spawn capability injected). Non-claims: not an OS sandbox, network not confined, CPU bounded only by the wall-clock deadline; tests/isolated-host.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Authenticate task-event and termination receipts at the host boundary
    src/isolated-host.ts createReceiptSigner / createReceiptVerifier (HMAC-SHA256 under a host-held >=32-byte key, injected primitive checked against RFC 4231; exact closed receipt shape; kind/cause agreement; constant-time MAC check; strict per-scope sequence via injected ReceiptSequenceStore refuses replay/reordering and, when the store is durable, refuses replay across verifier restarts; createMemoryReceiptSequenceStore is process-local only; forgeries burn no sequence; verified receipt -> exact StructuredAwaitEvent); tests/isolated-host.test.mjs incl. durable-restart + store-failure cases and reducer end-to-end (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define runtime memory policy contract
    src/runtime-contracts.ts validateRuntimeMemoryPolicy / decideRuntimeAllocation (zero-on-free, no shared/executable memory); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define Node-hosted runtime adapter contract
    src/runtime-contracts.ts validateNodeHostAdapter + NODE_HOST_BUILTIN_ALLOWLIST; tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define host-runtime overhead report contract
    src/runtime-contracts.ts createHostOverheadReport (integer permille; UNMEASURED/REFUSED); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define Securely Governed Runtime execution plan contract
    src/governed-plan-contracts.ts validateGovernedExecutionPlan / startGovernedExecution / advanceGovernedExecution (strict request->planning->verification->capability locking->execution->audit proof; out-of-order is terminal; exact capability lock; AI actors need a lease, never trusted-core); tests/governed-plan-contracts.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define verified fast path execution signature and invalidation contract
    src/governed-plan-contracts.ts createFastPathSignature / checkFastPath (context-tagged policy/package/output-contract hashes + model/hardware/trust; 1 h lease cap; expiry, revocation and every context change invalidate; FAST_PATH_NEVER_BYPASSES; signatures not authenticated here); tests/governed-plan-contracts.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define AI compute plan runtime hook contract
    src/governed-plan-contracts.ts admitAiComputePlan pre-execution hook (default policy admits nothing; per-target sensitivity cap; tools subset; audit required) / checkAiComputeOutput typed-output hook (literal true only, no echo); tests/governed-plan-contracts.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Implement RD-0660 `.fungi` nine-gate VOK authority fold
[x] Implement RD-0660 bounded safe VOK handle-table API
[x] Verify native VOK forged/stale/replay/context/capacity hostile corpus
[x] Benchmark native VOK against null and simpler checked-map baselines
[x] Add verified Windows/Linux/macOS OS CSPRNG adapters after table evidence
[x] Add bounded closed-profile owned-byte W^X execution floor (RD-0662)
[ ] Add opaque Galerina VM/component-resource transfer to the bounded native floor
[ ] Extend the bounded floor into the general RD-0656 VEO object/linker profile
[ ] Obtain independent live Linux and macOS W^X/entropy receipts
[ ] Prove hostile-memory isolation/integrity and physical-erasure policy
SuperGrok 2026-10-07: L45-L48 stay [ ]. TS public surface refuses opaque VM/component-resource transfer and non-closed-profile objects (admitBoundedNativeFloorTransfer; PROPOSED Galerina_RUNTIME_OPAQUE_VM_TRANSFER / NON_CLOSED_PROFILE / VEO_PROFILE_UNBUILT / FLOOR_TRANSFER_UNBOUND). No Rust/Cargo change. No native/wamr-host design. L47/L48 are PROPOSED frozen checklists, not producers.
[x] Define runtime error format
[x] Define target fallback runtime contract
    src/runtime-contracts.ts decideTargetFallback (opt-in, declared chain, exact semantics only); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define runtime resource budget contract for CPU, wall time, memory, recursion, loops, tasks, network, tools and accelerator work
    src/runtime-contracts.ts DEFAULT_RUNTIME_RESOURCE_BUDGET / validateRuntimeResourceBudget / checkRuntimeResourceUsage; tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define malicious-data intake pipeline contract for policy bounds, size, depth, schema, canonicalisation, ownership and taint checks
    src/runtime-contracts.ts admitUntrustedData (staged policy->size->parse->depth->schema->canonical->ownership; taint stays untrusted); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define runtime report format
[x] Add examples
[x] Add tests
```
