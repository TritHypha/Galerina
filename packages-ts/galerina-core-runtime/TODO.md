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
[x] Add opaque Galerina VM/component-resource transfer to the bounded native floor
    native/vok-authority/src/resource.rs admit_vm_resource / execute_lease_with_resources (kind-only affine handles; no pointer/path/code); src/native-floor-contracts.ts admitVmResourceTransfer (SuperGrok 2026-10-08)
[x] Bind the bounded floor to the RD-0656 VEO identity envelope (return-u64 profile; empty imports/relocs)
    native/vok-authority/src/veo.rs admit_veo_object + domain-separated action_id/object_id; src/native-floor-contracts.ts admitVeoReturnU64Profile (SuperGrok 2026-10-08)
[HOLD] General RD-0656 VEO object/linker (imports, relocations, constructors, GIR lowering, independent verifier)
    admit_general_veo_linker / admitGeneralVeoLinker always refuse VOK_VEO_GENERAL_LINKER_UNAVAILABLE / Galerina_RUNTIME_VEO_GENERAL_LINKER
[x] Obtain independent live Linux W^X/entropy receipt
    vok-live-evidence os+entropy fields; Docker rust linux/amd64 receipt native/vok-authority/evidence/linux-x86_64-wx-live-20261008.json (SuperGrok 2026-10-08)
[HOLD] Obtain independent live macOS W^X/entropy receipt
    Hardened-runtime VM-region inspection is not available from this Windows SuperGrok session; platform.rs still treats macOS query as the bounded mprotect transition
[x] Prove hostile-memory isolation/integrity of opaque handles and logical wipe
    forged/stale/cross-table/resource-as-code; admit_isolation_claim LogicalWipeVerified; src/memory_policy.rs (SuperGrok 2026-10-08)
[HOLD] Physical-erasure policy
    claim_physical_erasure returns VOK_MEMORY_PHYSICAL_ERASURE_UNPROVEN; userspace logical clear+unmap only; media wipe is not a userspace proof
[x] Define runtime error format
[x] Define target fallback runtime contract
    src/runtime-contracts.ts decideTargetFallback (opt-in, declared chain, exact semantics only); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] RD-0855: separate pre-execution unavailability from denial, revocation, integrity failure and unknown execution
    src/runtime-contracts.ts classifyTargetSkip / decideGovernedTargetFallback (only authenticated pre-effect unavailable/incompatible may FALLBACK; DENY, revoked, integrity_invalid, unknown_outcome, partial_effect, cleanup_failure REFUSE with original kept and never select the next target; proposal records authorityReleased false, slideAdmission and vokDecision not-evaluated). Owner 16:52 BST three-tier order recorded as FALLBACK_TIER_ORDER. SuperGrok 2026-10-08
[HOLD] RD-0855: register 8/16-trit execution profiles (owner 2026-10-06 23:12 BST: research-only until v1; ADMITTED_TRIT_WIDTHS_V1 is 1/32/64/256; bare 8 refuses)
[HOLD] RD-0855: binary same-semantics step 3 (unresolved alternative; must name a distinct provider/implementation and reusable admission-bound contract; K3 still decides permission; decideGovernedTargetFallback never selects tier binary-same-semantics)
[x] RD-0855: bound alternative attempts by count and deadline; never replay an uncertain effect
    src/runtime-contracts.ts validateAlternativeAttemptBudget / decideGovernedTargetFallback (fail-closed DEFAULT_ALTERNATIVE_ATTEMPT_BUDGET maxAttempts=2 deadlineMs=10000; post-effect retry excluded; unknown/partial never replay; provedNonExecution may retry a non-effect). SuperGrok 2026-10-08
[HOLD] RD-0855: retry budget owner (who owns maxAttempts/deadlineMs; ALTERNATIVE_ATTEMPT_BUDGET_OWNER is OWNER-REVISIT; admitted idempotent replay of a completed effect stays excluded)
[x] Define runtime resource budget contract for CPU, wall time, memory, recursion, loops, tasks, network, tools and accelerator work
    src/runtime-contracts.ts DEFAULT_RUNTIME_RESOURCE_BUDGET / validateRuntimeResourceBudget / checkRuntimeResourceUsage; tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define malicious-data intake pipeline contract for policy bounds, size, depth, schema, canonicalisation, ownership and taint checks
    src/runtime-contracts.ts admitUntrustedData (staged policy->size->parse->depth->schema->canonical->ownership; taint stays untrusted); tests/runtime-policy-contracts.test.mjs (Grok 2026-10-05)
[x] Define runtime report format
[x] Add examples
[x] Add tests
```
