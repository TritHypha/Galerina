# Deep Analysis: galerina-tower-citizen

Date: 2026-06-06

Scope:
- `packages-galerina/galerina-tower-citizen`
- `packages-galerina/galerina-ext-bridge-cpp`
- `galerina.mjs` runtime wiring
- related Tower/Sentinel tests

Verification run:
- `packages-galerina/galerina-tower-citizen`: 71/71 tests passing
- `packages-galerina/galerina-ext-bridge-cpp`: 13/13 tests passing

## Executive Finding

`galerina-tower-citizen` is the current source of truth for Galerina's governed inference
hardware-software interface. It is not a production accelerator by itself. Its real
value is the contract boundary: it decides which precision path is allowed, records
the decision, dispatches through a bridge registry, checks deterministic ternary
results, and erases sandbox state after execution.

The package already proves the Brain/Brawn split:
- Brain: `HybridInferenceEngine`, `TowerRuntime`, `PluginSandbox`, `AuditLogger`,
  `GovernanceEnforcer`
- Brawn: `InferenceBridge` implementations, currently stub/simulator in
  `tower-citizen` and CPU/GPU BitNet bridge seams in `galerina-ext-bridge-cpp`

The most important limitation is that the current Brawn path is mostly a correctness
and governance oracle, not a high-throughput native data path. The BitNet-compatible
packed representation exists, but the default stub decodes packed trits back into
JavaScript arrays before executing the simulator. The native CPU addon and CUDA path
are documented seams; in the verified local state, `nativeAvailable` is false and
execution falls back to the deterministic simulator.

## The Architectural Vision

The Tower implements Galerina's core governance model for inference:

```text
intent -> governed execution plan -> coordinated compute -> audit proof
```

The package is critical because it makes inference a governed lifecycle rather than
a free-form model call:

1. Load a sandbox and bind the execution to a correlation ID.
2. Plan a deterministic per-operation precision route.
3. Enforce the `ai {}` contract before compute.
4. Dispatch only through registered hardware bridges.
5. Record precision choices and bridge provenance.
6. Erase sandbox state and produce an audit receipt.

Key implementation points:
- `HybridInferenceEngine.infer()` performs the load, plan, governance gate,
  dispatch, audit, latency check, and erase sequence
  (`src/hybrid-engine.ts:168`, `src/hybrid-engine.ts:232`,
  `src/hybrid-engine.ts:251`).
- `TowerRuntime` owns the Load/Execute/Erase lifecycle and audit trail
  (`src/tower-runtime.ts:1`).
- `PluginSandbox.validate()` is the current schema gate before execution
  (`src/plugin-sandbox.ts:29`).
- `AuditLogger` emits structured LOAD/EXEC/TRAP/ERASE events and can route ledger
  writes through Sentinel egress (`src/audit-logger.ts:93`).

This should be treated as the source of truth for governed inference execution,
not for the whole Galerina language. Syntax, diagnostics, and manifest generation
still live in the compiler and KB documents.

## Brain/Brawn Synthesis

### Brain: State Management

The Brain is the policy and orchestration layer. It maintains:
- routing context: governance tier, air-gapped mode, FP4 hardware availability,
  and optional latency bound (`src/hybrid-engine.ts:176`)
- model-call governance: approved models and max call budget
  (`src/hybrid-engine.ts:295`)
- bridge registry: the active Brawn providers for each precision technique
  (`src/hybrid-engine.ts:312`)
- audit state: correlation-linked lifecycle and precision-decision records

The Brain intentionally does not implement hardware-specific math. It builds a
`HybridPlan` using `planHybridInference()`, then dispatches each decision through
the registry. Missing bridge entries currently fall through as host-native paths
for fp8/fp16 (`src/hybrid-engine.ts:329`).

This is the right architectural split for aerospace: policy can be certified once,
while hardware backends can be swapped as long as they satisfy the bridge contract.

### Brawn: Hardware Abstraction

The formal hardware boundary is `InferenceBridge`:

```ts
interface InferenceBridge {
  readonly bridgeId: string;
  readonly technique: PrecisionTechnique;
  readonly nativeAvailable: boolean;
  initialize(): void | Promise<void>;
  shutdown(): void | Promise<void>;
  execute(op: BridgeOp): BridgeResult;
}
```

The bridge receives `BridgeOp`, which carries packed weights, activations, count,
scale, and offset (`src/bridge/interface.ts:34`). For ternary execution, `weights`
is either a BitNet I2_S `Int32Array` or an opaque native memory handle.

Current implementations:
- `StubTernaryBridge`: executes through `TPLSimulator`
  (`src/bridge/stub-provider.ts:24`)
- `StubFp4Bridge`: returns an honest unexecuted result for FP4
  (`src/bridge/stub-provider.ts:85`)
- `BitNetCpuBridge`: implements the Tower bridge contract and uses the simulator
  unless a compiled N-API addon is present
  (`../galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:29`)
- `BitNetGpuBridge`: detects NVIDIA hardware but currently uses the simulator
  because `cudaKernelReady` is false
  (`../galerina-ext-bridge-cpp/src/bitnet-gpu-bridge.ts:24`)

`createCppBridgeRegistry()` is the current Brain-to-Brawn wiring point
(`../galerina-ext-bridge-cpp/src/index.ts:48`). The CLI uses that registry when
running governed inference from a flow's `ai {}` contract (`../../galerina.mjs:514`).

## Technical Breakdown

### BitNet and TPL

`TPLSimulator` models the BitNet I2_S ternary representation:
- two bits per trit
- 16 trits per `Int32Array` word
- `0b00 = -1`, `0b01 = 0`, `0b10 = +1`
- `0b11` is illegal and should indicate corruption
- T-MAC is add/subtract/skip, not multiply

Relevant implementation:
- illegal trit encoding is defined as a sentinel (`src/tpl-simulator.ts:60`)
- decoding rejects illegal `0b11` (`src/tpl-simulator.ts:74`)
- guard canaries bracket the packed trit region (`src/tpl-simulator.ts:63`)
- `tmacVector()` accumulates with integer add/subtract/skip
  (`src/tpl-simulator.ts:212`)
- `setScale()` applies the BitNet `i2_scale` after accumulation
  (`src/tpl-simulator.ts:126`, `src/tpl-simulator.ts:238`)

The hot T-MAC loop avoids floating-point multiply. However, `scale` is a JavaScript
`number`, so non-integer scale values still enter IEEE-754 arithmetic after the
integer accumulation. For aerospace constant-time and bit-exact replay, the scale
should become an explicit fixed-point representation, such as `{ mantissa, shift }`
or a quantized integer scale plus exponent.

### Packed Memory Discipline

The simulator stores trits packed in an `Int32Array`, and `packedByteLength()` reports
the BitNet-equivalent footprint (`src/tpl-simulator.ts:286`). Sentinel integration
tests also prove staged 128-bit-aligned TPL buffers, manifest integrity checks, and
deterministic bridge execution (`tests/sentinel-integration.test.mjs:43`,
`tests/sentinel-integration.test.mjs:55`).

The main memory-wall problem is the stub bridge path:
- `StubTernaryBridge.execute()` accepts packed `Int32Array` weights
  (`src/bridge/stub-provider.ts:40`)
- it decodes those packed weights into a JavaScript `number[]`
  (`src/bridge/stub-provider.ts:51`)
- it then reloads them into a new simulator instance

That is acceptable as a correctness oracle but not as a throughput path. It expands
the packed representation, allocates per operation, and gives up the memory-bandwidth
advantage that ternary packing is meant to protect.

There is also a correctness gap: `StubTernaryBridge.decodePackedTrits()` maps illegal
encoding `0b11` to `0` instead of trapping (`src/bridge/stub-provider.ts:78`). The
simulator itself traps illegal encodings, but the bridge-side decode can mask a
corrupted packed buffer before the simulator sees it.

### NVIDIA Alignment

The current architecture has NVIDIA-aware routing but not NVIDIA-ready execution:
- `routePrecision()` chooses `fp4_block` for bandwidth-bound attention and KV-cache
  when FP4 hardware is present (`src/precision-strategy.ts:151`)
- `StubFp4Bridge` explicitly reports `executedNatively: false`
  (`src/bridge/stub-provider.ts:98`)
- the GPU BitNet bridge detects NVIDIA hardware through `nvidia-smi`, but
  `cudaKernelReady` is always false in current detection
  (`../galerina-ext-bridge-cpp/src/hardware-detect.ts:49`)

The bridge contract is too narrow for efficient tensor-core use. It lacks:
- matrix shape metadata
- strides and layout tags
- block-scale metadata for NVFP4
- tile size and alignment declarations
- pinned/device memory ownership
- stream or CUDA graph handles
- batch scheduling descriptors

As a result, the current design can audit a future NVIDIA path, but it cannot yet
stream ternary weights or NVFP4 blocks into tensor-core-ready kernels efficiently.

### TPL Simulator vs ext-bridge-cpp

`TPLSimulator` is the byte-faithful deterministic oracle. It is best viewed as the
reference kernel used for correctness, audit, and fallback.

`galerina-ext-bridge-cpp` is the production bridge seam:
- `BitNetCpuBridge` loads `bitnet_addon.node` when present
  (`../galerina-ext-bridge-cpp/src/addon-loader.ts:52`)
- the native addon contract exposes `tmac(...)`
  (`../galerina-ext-bridge-cpp/src/addon-loader.ts:34`)
- the CPU bridge cross-checks native results against the simulator for the first
  eight calls (`../galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:40`,
  `../galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:109`)

This is a strong determinism strategy, but for flight-critical assurance it should
not stop after eight calls unless a separate certified equivalence proof exists.
A configurable continuous sampling or deterministic replay mode would be safer.

## Hardened Border and Governance

### The ai Contract

The runtime path parses `ai {}` blocks and maps them into engine governance
(`../../galerina.mjs:476`, `../../galerina.mjs:488`, `../../galerina.mjs:499`). The engine
then traps unapproved models and call-budget violations before bridge dispatch
(`src/hybrid-engine.ts:232`, `src/hybrid-engine.ts:295`).

Implemented hard gates:
- `approvedModels`
- `maxModelCalls`
- optional latency invariant through routing context

Known gaps:
- if `approvedModels` is set but `request.model` is undefined, the engine currently
  allows the call (`src/hybrid-engine.ts:295`). The CLI fills in the first approved
  model, but direct API callers can omit `model`.
- `maxNewTokens` is reported but not enforced as a budget.
- `max_token_cost`, fallback policy, and model-version constraints are not represented
  in `AiGovernance`.
- the bridge registry is trusted input. A malicious or incorrect bridge can register
  for `"ternary"` and claim deterministic execution; `assertDeterminism()` only
  checks the boolean flag (`src/bridge/interface.ts:96`).

### TPL State Governance

`GovernanceEnforcer` hardcodes the default TPL policy: `0 -> 1` requires an audit
signature and schema validation (`src/governance-enforcer.ts:30`). It exposes
`signAudit()`, `markSchemaValidated()`, and `checkTransition()`.

The package comments refer to `governance.spore`, but no package-local manifest or
parsed `state_transition_policy` is currently used. The policy is a TypeScript
constant, not governed source. This is already noted in
`ARCHITECTURE_ISSUES.md`.

There is also an enforcement gap: `tmacVector()` logs a resulting transition based
on the scaled accumulator (`src/tpl-simulator.ts:239`), but it does not consult
`GovernanceEnforcer.checkTransition()` before logging a COMMIT-like result. The
single-gate path checks governance, but the vector T-MAC path is the important
inference path.

In `galerina-ext-bridge-cpp`, `canCommit()` exists but is not called by `execute()`
before native or simulator execution (`../galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:66`,
`../galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:74`). That makes the Governance
Signal standard aspirational in the bridge implementation today.

## The Aerospace Edge

### Flight-Boot Sequence

The package and tests model a two-phase boot:

1. Preflight:
   - stage weights
   - verify integrity through manifest mapping
   - allocate memory
   - lock the memory pool
   - fail fast on tamper or allocation errors

2. Flight:
   - use pre-verified weights
   - forbid allocation
   - compute deterministic results
   - buffer audit events when needed to avoid per-event disk jitter

Tests cover this directly:
- tampered weights fail in preflight (`tests/flight-boot.test.mjs:36`)
- flight allocation is forbidden (`tests/flight-boot.test.mjs:48`)
- repeated flight passes are deterministic (`tests/flight-boot.test.mjs:56`)
- batched audit can buffer then flush (`tests/flight-boot.test.mjs:66`)

This approach is mandatory for aerospace because fallible operations are not allowed
inside the timing-critical control window. Integrity verification, allocation,
device initialization, bridge selection, and policy compilation must happen before
flight execution begins.

The implementation currently demonstrates bounded-latency discipline, not a full
worst-case execution time proof. Remaining jitter sources include JavaScript GC,
`Date.now()`, JSON serialization, filesystem writes, bridge initialization, and
per-op allocation in the stub path.

## Critical Assessment

### Bottlenecks

1. Scalar TypeScript T-MAC:
   `tmacVector()` decodes each trit through bounds checks, shifts, and branch logic.
   This is deterministic but not SIMD/native throughput.

2. Stub decode/reload:
   packed weights are decoded to `number[]`, then reloaded into a fresh simulator.
   This defeats end-to-end packed memory behavior.

3. Per-inference demo allocation:
   `buildDemoTernaryOp()` creates synthetic weights and activations per operation
   (`src/hybrid-engine.ts:143`). This is useful for tests but not a real model path.

4. Audit and timing side effects:
   synchronous audit writes, `Date.now()`, hashing, JSON serialization, and sandbox
   lifecycle allocation are not flight-constant unless preflighted or moved behind
   deterministic egress/time systems.

5. Missing native kernels:
   CPU addon loading exists, but a clean checkout falls back to the simulator.
   CUDA detection exists, but the BitNet CUDA path is not active.

### Hardware Extensibility: Photonic Port

A pure-photonic matrix multiplier should be implemented as another `InferenceBridge`,
but the current `BridgeOp` needs more metadata before that can be clean:

- explicit matrix/tensor shapes
- packed ternary format version
- fixed-point scale encoding
- memory handle type and address space
- alignment and tile descriptors
- preflight calibration/proof artifact
- deterministic completion and timing proof
- governance interrupt or commit-authorization protocol

The `HybridInferenceEngine` should not know whether the bridge is CPU, GPU, or
photonic. It should only require a preflight-attested bridge capability manifest
and a deterministic result/proof. Today, the engine accepts a registry directly,
which is flexible but too trusting for a hardened border.

### Governance Blind Spots

Specific bypass or weakness points:

- `approvedModels` can be bypassed by omitting `request.model` on direct API calls.
- `maxNewTokens` and token cost are not enforced.
- `BridgeRegistry` entries are not attested, signed, or capability-checked.
- fp8/fp16 missing bridges silently become `"host-native"` audit entries; for Tier 1
  aerospace, silent host-native execution should be disallowed unless explicitly
  approved.
- `StubTernaryBridge` masks illegal packed encoding `0b11` as zero.
- bridge `shutdown()` is not called by `HybridInferenceEngine` during erase.
- `BitNetCpuBridge.canCommit()` and `BitNetGpuBridge.canCommit()` are not invoked
  by `execute()`.
- native determinism cross-checking is limited to the first eight CPU calls.

## Strategic Roadmap

### 1. Harden the Border Contract

Make the bridge registry attestable and policy-bound:
- require signed bridge manifests with `bridgeId`, technique, native availability,
  supported layout, determinism mode, and hardware identity
- reject unregistered or unsigned bridges in Tier 1/Tier 3 contexts
- require `model` when `approvedModels` is non-empty
- enforce `maxNewTokens`, `max_token_cost`, fallback policy, and model version
- disallow silent host-native fp8/fp16 fallback in aerospace mode
- call bridge `shutdown()` as part of ERASE

### 2. Preserve Packed Ternary End to End

Turn the simulator into a true packed-memory reference path:
- make `StubTernaryBridge` execute directly over packed `Int32Array`
- trap illegal `0b11` encodings at the bridge boundary
- remove per-op decode/reload allocation
- represent `i2_scale` as fixed-point metadata
- add shape/tile/layout fields to `BridgeOp`
- add continuous native-vs-simulator determinism sampling or a certified replay mode

### 3. Add a Flight Profile for Native and Future Photonic Brawn

Introduce an explicit preflight API:
- compile and freeze the `HybridPlan`
- initialize bridges and verify hardware capabilities
- allocate, verify, and pin/stage all model buffers
- lock Sentinel memory before flight
- replace wall-clock timing with Sentinel-Time logical ticks
- route audit through Sentinel-Egress with bounded flushing
- produce a signed preflight receipt that flight execution can reference

This would make the Tower suitable as an aerospace HSI: all fallible work happens
before flight, and flight execution becomes a bounded, replayable compute path with
governed hardware provenance.

