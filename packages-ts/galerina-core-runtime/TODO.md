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
[ ] Add isolated hard-termination adapter for untrusted/non-cooperative work
[ ] Authenticate task-event and termination receipts at the host boundary
[x] Define runtime memory policy contract
    src/runtime-contracts.ts validateRuntimeMemoryPolicy / decideRuntimeAllocation (zero-on-free, no shared/executable memory); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define Node-hosted runtime adapter contract
    src/runtime-contracts.ts validateNodeHostAdapter + NODE_HOST_BUILTIN_ALLOWLIST; tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define host-runtime overhead report contract
    src/runtime-contracts.ts createHostOverheadReport (integer permille; UNMEASURED/REFUSED); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[ ] Define Securely Governed Runtime execution plan contract
[ ] Define verified fast path execution signature and invalidation contract
[ ] Define AI compute plan runtime hook contract
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
[x] Define runtime error format
[x] Define target fallback runtime contract
    src/runtime-contracts.ts decideTargetFallback (opt-in, declared chain, exact semantics only); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define runtime resource budget contract for CPU, wall time, memory, recursion, loops, tasks, network, tools and accelerator work
    src/runtime-contracts.ts DEFAULT_RUNTIME_RESOURCE_BUDGET / validateRuntimeResourceBudget / checkRuntimeResourceUsage; tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define malicious-data intake pipeline contract for size, depth, schema, canonicalisation, ownership and taint checks
    src/runtime-contracts.ts admitUntrustedData (staged size->parse->depth->schema->canonical->ownership; taint stays untrusted); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define runtime report format
[x] Add examples
[x] Add tests
```
