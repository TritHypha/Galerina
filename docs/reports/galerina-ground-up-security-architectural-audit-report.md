# Galerina: Ground-Up Security & Architectural Audit Report

Date: 2026-06-06

Scope:
- `packages-galerina/`
- `build/`
- `examples/`
- `docs/`

Evidence used:
- `build/_fulltest4.log`: 43/43 packages passed, 4069 tests total.
- `build/graph/Galerina_GRAPH_REPORT.md`: generated workspace graph summary.
- Per-package graphs under `.graph/package-graph.json`.
- Source review of Tower, bridge, compiler, Sentinel, CLI, examples, and SOT docs.

## Executive Conclusion

Galerina has a credible governed-runtime prototype: the compiler suite passes, the
Tower/bridge path is wired, and the Sentinel packages demonstrate manifest
integrity, fixed-pool memory, logical time, thermal down-tiering, HMAC snapshots,
and HMAC-chained audit egress.

It is not yet P9/aerospace-certification ready. The strongest gaps are not test
failures; they are trust-boundary gaps:

- runtime `ai {}` enforcement is incomplete outside the CLI path
- bridge registration is not attested
- native addons are loaded by path without signature/hash verification
- Sentinel stochastic protection is hash/checksum based, not ECC/TMR
- audit ledgers and snapshots default to all-zero development keys
- constant-time claims are stronger than the JavaScript/Node implementation can
  currently prove
- shadow-kernel failover is a decision API, not an atomic integrated swap
- the generated workspace graph is stale/incomplete for the Tower/Sentinel era

## Verification Snapshot

The latest full-suite log reports:

- 43/43 packages passed
- 4069 tests total
- `galerina-tower-citizen`: 73 tests
- `galerina-ext-bridge-cpp`: 13 tests
- Sentinel packages: LSM 30, LSIO 23, LST 13, LSP 17, LSS 11, Egress 20

Evidence:
- `build/_fulltest4.log:18`
- `build/_fulltest4.log:44`
- `build/_fulltest4.log:93`
- `docs/Knowledge-Bases/galerina-runtime-status-SOT.md:15`
- `docs/Knowledge-Bases/galerina-runtime-status-SOT.md:26`
- `docs/Knowledge-Bases/galerina-runtime-status-SOT.md:36`

Passing tests establish prototype health. They do not establish certification
properties such as worst-case execution time, radiation tolerance, kernel
attestation, or hardware-enforced isolation.

## Critical Failures Before P9 Certification

### CF-1: Direct API callers can bypass `approvedModels` by omitting `model`

`HybridInferenceEngine.checkAiGovernance()` only denies an unapproved model when
`request.model !== undefined`. If `approvedModels` is configured and the direct
API caller omits `model`, the allow-list check does not fire.

Evidence:
- `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:295`
- `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:297`

The CLI mitigates this by defaulting to the first approved model:

- `galerina.mjs:510`

That is not sufficient for P9. Runtime enforcement must be correct at the engine
entry point, not only in one caller.

Required fix:
- if `approvedModels` is non-empty, require `request.model`
- treat missing model as `ERR_AI_MODEL_REQUIRED`
- enforce this before `TowerRuntime.execute()` and before bridge dispatch

### CF-2: `max_token_cost`, `maxNewTokens`, and runtime attestation are documented but not enforced

The example says the V_DPM enforces `ai {}` constraints and that token cost is
CostGraph-enforced:

- `examples/foundations/ai-inference-governed.spore:28`
- `examples/foundations/ai-inference-governed.spore:43`
- `examples/foundations/ai-inference-governed.spore:46`

The CLI parses `max_token_cost`, prints it, but does not pass it to the engine:

- `galerina.mjs:496`
- `galerina.mjs:502`
- `galerina.mjs:522`
- `galerina.mjs:541`

The engine receipt reports `maxNewTokens` as token count but does not enforce it:

- `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:55`
- `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:389`

Required fix:
- extend `AiGovernance` to include max tokens, max cost, model version, and
  runtime attestation requirements
- trap on missing/over-budget values before compute
- add tests for direct engine calls and `galerina infer`

### CF-3: Bridge registry is trusted input and bridge results are weakly attested

The engine accepts a caller-supplied `BridgeRegistry` and dispatches by precision:

- `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:312`
- `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:331`

`assertDeterminism()` only checks whether a ternary result reports
`deterministic: true`; it does not prove the bridge is approved, signed, measured,
or actually deterministic.

- `packages-galerina/galerina-tower-citizen/src/bridge/interface.ts:96`

This allows a malicious in-process bridge to register for `"ternary"`, return
fabricated values, and set `deterministic: true`.

Required fix:
- add signed bridge manifests and runtime bridge attestation
- pin bridge identity, package hash, native addon hash, hardware identity, and
  supported layout
- reject unmeasured bridges in certified profiles

### CF-4: Brawn depends on Brain package internals

The bridge package imports runtime values from `@galerina/tower-citizen`, not only
types. The package graph records `@galerina/ext-bridge-cpp` depending on
`@galerina/tower-citizen`:

- `packages-galerina/galerina-ext-bridge-cpp/.graph/package-graph.json:42`

Source imports include `StubTernaryBridge`, `GovernanceEnforcer`, `AuditLogger`,
and `assertDeterminism`:

- `packages-galerina/galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:20`

This does not create a package cycle, but it violates the cleanest Brain/Brawn
layering. The Brawn should depend on a narrow bridge-contract/oracle package, not
the Tower package that also owns orchestration.

Required fix:
- split `InferenceBridge`, `BridgeOp`, `BridgeResult`, determinism assertions,
  and the TPL reference oracle into a small neutral package
- keep `HybridInferenceEngine` above that layer
- make native bridges unable to instantiate independent governance state unless
  explicitly passed by the Tower

### CF-5: TPL vector path does not enforce the restricted transition policy

The scalar `gate()` path checks `GovernanceEnforcer.checkTransition()` before
lifting HOLD to COMMIT:

- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:181`

The inference-critical vector path `tmacVector()` computes a scaled result and
logs a transition, but does not consult `checkTransition()` before logging a
COMMIT-like result:

- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:212`
- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:238`
- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:239`

The native bridge defines `canCommit()`, but `execute()` does not call it before
running the reference path or native `tmac()`:

- `packages-galerina/galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:66`
- `packages-galerina/galerina-ext-bridge-cpp/src/bitnet-cpu-bridge.ts:74`
- `packages-galerina/galerina-ext-bridge-cpp/src/bitnet-gpu-bridge.ts:47`
- `packages-galerina/galerina-ext-bridge-cpp/src/bitnet-gpu-bridge.ts:52`

Required fix:
- define the vector-level commit semantics formally
- require vector T-MAC authorization when the result can advance state
- make bridge `execute()` fail closed when commit authorization is absent

### CF-6: Illegal packed ternary encoding can be masked by the stub bridge

The simulator treats `0b11` as an integrity fault:

- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:60`
- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:74`

The stub bridge decoder maps `0b11` to zero:

- `packages-galerina/galerina-tower-citizen/src/bridge/stub-provider.ts:68`
- `packages-galerina/galerina-tower-citizen/src/bridge/stub-provider.ts:78`

That can hide corrupted packed weights before they reach the simulator.

Required fix:
- throw `TPLIntegrityFault` or `SecurityTrap` on `enc === 3`
- add a regression test that injects `0b11` into a packed bridge input

### CF-7: Native addon loading is not supply-chain attested

`galerina-ext-bridge-cpp` loads a `.node` addon from candidate paths via
`createRequire()` and `existsSync()`:

- `packages-galerina/galerina-ext-bridge-cpp/src/addon-loader.ts:14`
- `packages-galerina/galerina-ext-bridge-cpp/src/addon-loader.ts:19`
- `packages-galerina/galerina-ext-bridge-cpp/src/addon-loader.ts:52`
- `packages-galerina/galerina-ext-bridge-cpp/src/addon-loader.ts:56`

The loader validates only minimal exports, not package signature, binary hash,
ABI, compiler provenance, or BitNet source revision.

Required fix:
- require a signed native-addon manifest
- pin addon SHA-256 and build provenance
- fail closed when the binary is unmeasured in certified mode

### CF-8: Audit and snapshot HMAC keys default to all-zero development keys

Sentinel Egress defaults to an all-zero HMAC key:

- `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:11`
- `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:92`

Sentinel State also defaults to an all-zero development key:

- `packages-galerina/galerina-core-sentinel-state/src/state-serializer.ts:30`
- `packages-galerina/galerina-core-sentinel-state/src/state-serializer.ts:34`
- `packages-galerina/galerina-core-sentinel-state/src/state-serializer.ts:52`

The comments correctly warn this is not production-safe, but the constructors
still permit it. That is a certification blocker.

Required fix:
- require explicit keys in production/certified profiles
- include key ID and rotation metadata in snapshots and audit batches
- fail closed if the key is absent or zero in P9 mode

### CF-9: Stochastic protection is not ECC/TMR

LSM detects invalid ternary encodings:

- `packages-galerina/galerina-core-sentinel-memory/src/tpl-state-buffer.ts:24`
- `packages-galerina/galerina-core-sentinel-memory/src/tpl-state-buffer.ts:76`

LSIO validates source blocks against SHA-256 manifests:

- `packages-galerina/galerina-core-sentinel-io/src/manifest.ts:153`
- `packages-galerina/galerina-core-sentinel-io/src/zero-copy-mapper.ts:88`

LSS validates snapshots with XOR checksum plus HMAC:

- `packages-galerina/galerina-core-sentinel-state/src/state-serializer.ts:6`
- `packages-galerina/galerina-core-sentinel-state/src/state-serializer.ts:75`

These are valuable integrity gates, but they are not ECC or TMR. They do not
continuously protect an in-memory ternary matrix from radiation-induced silent
data corruption after preflight verification and before/during bridge execution.

Required fix:
- add per-block ECC/parity metadata for TPL buffers
- add optional TMR or dual-read/majority paths for safety-critical weights
- re-verify hot blocks immediately before native bridge dispatch

### CF-10: Shadow-kernel failover is not an atomic live swap

LSP can evaluate thermal state and clamp requested kernel tier:

- `packages-galerina/galerina-core-sentinel-power/src/power-governor.ts:96`
- `packages-galerina/galerina-core-sentinel-power/src/power-governor.ts:128`

But its own architecture issue file says wiring this into `HybridEngine` bridge
selection is deferred:

- `packages-galerina/galerina-core-sentinel-power/ARCHITECTURE_ISSUES.md:20`
- `packages-galerina/galerina-core-sentinel-power/ARCHITECTURE_ISSUES.md:25`

The current implementation is a deterministic governor decision, not an atomic
kernel swap. It does not prove race-free failover under in-flight execution.

Required fix:
- introduce a preflighted kernel table and atomic monotonic tier register
- switch only at operation boundaries or via a formally modeled quiesce point
- record a signed failover event with logical tick and bridge identity

## Architectural Consistency Report

### Where code reflects the vision

The governed inference path is real:

- CLI parses `ai {}` and wires the Tower to the C++ bridge registry.
  Evidence: `galerina.mjs:476`, `galerina.mjs:519`, `galerina.mjs:522`
- `HybridInferenceEngine` performs Load, plan, governance check, dispatch, audit,
  latency check, and erase.
  Evidence: `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:232`,
  `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:251`,
  `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:283`
- `BridgeRegistry` is the Brain/Brawn dispatch seam.
  Evidence: `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:312`
- LSIO enforces manifest integrity before releasing mapped blocks.
  Evidence: `packages-galerina/galerina-core-sentinel-io/src/zero-copy-mapper.ts:88`
- LSM provides a fixed-size pool and flight allocation lock.
  Evidence: `packages-galerina/galerina-core-sentinel-memory/src/static-memory-pool.ts:97`,
  `packages-galerina/galerina-core-sentinel-memory/src/static-memory-pool.ts:159`
- LSS verifies snapshots before parsing payload.
  Evidence: `packages-galerina/galerina-core-sentinel-state/src/state-serializer.ts:93`
- LST provides a deterministic logical clock.
  Evidence: `packages-galerina/galerina-core-sentinel-time/src/logical-clock.ts:22`
- Egress batches and HMAC-chains audit records.
  Evidence: `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:121`,
  `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:167`

### Where documentation diverges

The Tower master specification claims hardware-level atomic enforcement and
runtime non-decision semantics:

- `docs/Knowledge-Bases/galerina-governed-tower-specification.md:15`
- `docs/Knowledge-Bases/galerina-governed-tower-specification.md:22`
- `docs/Knowledge-Bases/galerina-governed-tower-specification.md:57`
- `docs/Knowledge-Bases/galerina-governed-tower-specification.md:127`

The same document later marks V_DPM and DSS.wasm items as not yet implemented:

- `docs/Knowledge-Bases/galerina-governed-tower-specification.md:229`
- `docs/Knowledge-Bases/galerina-governed-tower-specification.md:230`

The inference tower document is more accurate: it states that in-WASM
`AI.infer(...)` is still a follow-up and that `governance_tier` boot mapping and
`audit_depth` fields remain tasks:

- `docs/Knowledge-Bases/galerina-governed-inference-tower.md:215`
- `docs/Knowledge-Bases/galerina-governed-inference-tower.md:231`
- `docs/Knowledge-Bases/galerina-governed-inference-tower.md:242`
- `docs/Knowledge-Bases/galerina-governed-inference-tower.md:243`

Conclusion: use `galerina-runtime-status-SOT.md` and implementation evidence as the
operational truth. Treat the master specification as target architecture unless
each claim has a source/test reference.

### Graph logic and dependency integrity

The generated workspace graph reports 54 packages and 3651 relationships:

- `build/graph/Galerina_GRAPH_REPORT.md:8`
- `build/graph/Galerina_GRAPH_REPORT.md:12`

But it does not include the current Tower, bridge, or Sentinel package nodes in
the package summary. Search hits only find tower docs and a compiler cache item,
not package nodes for `galerina-tower-citizen`, `galerina-ext-bridge-cpp`, or
`galerina-core-sentinel-*`.

Per-package graphs are more current but cover only nine packages:

- `packages-galerina/galerina-tower-citizen/.graph/package-graph.json:2`
- `packages-galerina/galerina-ext-bridge-cpp/.graph/package-graph.json:2`
- `packages-galerina/galerina-core-sentinel-memory/.graph/package-graph.json:2`

The package-graph tool has a boundary allowlist model:

- `packages-galerina/galerina-devtools-package-graph/src/reporter.ts:55`
- `packages-galerina/galerina-devtools-package-graph/src/reporter.ts:79`
- `packages-galerina/galerina-devtools-package-graph/src/reporter.ts:82`

But the audited build artifact is incomplete for the hardened-border system.

Conclusion:
- no package-cycle evidence was found in the per-package graphs reviewed
- a layering smell exists: Brawn imports Brain package runtime values
- graph coverage must be regenerated and made mandatory before certification

## Ternary Logic Integrity

The TPL path correctly models ternary packed state and integer add/subtract/skip
T-MAC:

- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:60`
- `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:229`

But there are three leaks relative to a strict ternary-only mandate:

1. `scale` is a JavaScript `number`, so non-integer scale values would use
   IEEE-754 arithmetic after integer accumulation.
   Evidence: `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:126`,
   `packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts:238`

2. The hybrid router intentionally routes sensitive ops to `fp8`/`fp16` and
   Blackwell paths to `fp4_block`.
   Evidence: `packages-galerina/galerina-tower-citizen/src/precision-strategy.ts:139`,
   `packages-galerina/galerina-tower-citizen/src/precision-strategy.ts:151`,
   `packages-galerina/galerina-tower-citizen/src/precision-strategy.ts:165`

3. The wider compiler/runtime supports Float32/Float64 tensors and parseFloat
   in multiple code paths.
   Evidence: `packages-galerina/galerina-core-compiler/src/lowering-plan.ts:35`,
   `packages-galerina/galerina-core-compiler/src/interpreter.ts:434`,
   `packages-galerina/galerina-core-compiler/src/wat-emitter.ts:1639`

This is not automatically wrong. It means the ternary-only requirement must be
scoped precisely: "no floating point on the ternary TPL inference path" is close
to implemented; "no floating point anywhere in governed inference" is not.

## Security and Hardened Border Audit

### Border leaks

Direct filesystem writes exist in:

- Tower audit logger: `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:10`
- Sentinel Egress: `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:2`
- Sentinel State: `packages-galerina/galerina-core-sentinel-state/src/atomic-writer.ts:12`

Sentinel Egress is the intended governed write path, but `AuditLogger` still
falls back to direct `appendFileSync()` when no egress sink is configured:

- `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:120`
- `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:130`

For certification, direct filesystem audit writes must be disabled in P9 mode.

### Attack surface

Examples contain many `unsafe let` boundary inputs:

- `examples/ai-inference/classifyMessage.spore:64`
- `examples/auth-service/manifestVerificationService.spore:28`
- `examples/auth-service/verifyPassword.spore:40`

Many examples validate after reading, but the audit did not prove all unsafe
bindings are dominated by trap/validation before use. These examples should be
treated as training material until a static dominance check reports that every
unsafe value is validated or trapped before use.

### Audit ledger integrity

`AuditLogger` trusts any configured `tickSource()`:

- `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:89`
- `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:107`

A malicious or compromised bridge cannot directly mutate private `AuditLogger`
fields, but any runtime component that can supply the tick source or egress sink
can falsify time semantics or suppress durability unless those dependencies are
attested.

Batching also leaks metadata: flush timing depends on record count and ring fill
state.

- `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:117`
- `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:105`
- `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:112`

For side-channel resistance, certified mode should use fixed-cadence or padded
flushes and separate secret-bearing memory activity from audit batch size.

## Dual-Threat Analysis

### Stochastic threat model

Radiation-induced bit flips:
- Current protection detects invalid ternary sentinel encodings and manifest
  mismatches.
- It does not provide ECC/TMR for valid-code bit flips, such as `0b00 -> 0b01`.
- A valid-code bit flip can silently change `-1` to `0` or `+1` to `0`.

Thermal/voltage glitching:
- LSP can down-tier based on supplied temperature.
- Real sensor ingestion is deferred.
- HybridEngine bridge selection wiring is deferred.

Evidence:
- `packages-galerina/galerina-core-sentinel-power/ARCHITECTURE_ISSUES.md:9`
- `packages-galerina/galerina-core-sentinel-power/ARCHITECTURE_ISSUES.md:20`

State corruption:
- LSS detects malformed JSON, checksum mismatch, and HMAC mismatch before parse.
- AtomicWriter uses rename, but comments explicitly state it is fsync-free.
- A crash after write but before durable media flush remains a storage-layer risk.

Evidence:
- `packages-galerina/galerina-core-sentinel-state/src/atomic-writer.ts:4`
- `packages-galerina/galerina-core-sentinel-state/src/atomic-writer.ts:42`
- `packages-galerina/galerina-core-sentinel-state/src/atomic-writer.ts:57`

### Malicious threat model

Boundary evasion:
- direct engine calls can omit `model`
- untrusted bridge registries can be supplied
- native addon loading is not attested

Capability injection:
- package-graph allowlists exist, but coverage is incomplete
- runtime does not independently enforce package graph governance for bridge
  dispatch

Side-channel leakage:
- audit flush cadence depends on event count
- Node `Date.now()`, JSON serialization, filesystem writes, and dynamic allocation
  are observable at coarse timing granularity

## Reliability and Aerospace Readiness

### Constant-time analysis

The current implementation demonstrates bounded/deterministic behavior in tests,
but it is not constant-time in the certification sense.

Non-constant sources include:

- `Date.now()` in engine and audit IDs:
  `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:225`,
  `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:104`
- per-operation allocation and synthetic demo op creation:
  `packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts:143`
- `new TPLSimulator()` and decode/reload per bridge call:
  `packages-galerina/galerina-tower-citizen/src/bridge/stub-provider.ts:51`,
  `packages-galerina/galerina-tower-citizen/src/bridge/stub-provider.ts:52`
- free-list search in LSM allocation:
  `packages-galerina/galerina-core-sentinel-memory/src/static-memory-pool.ts:130`
- filesystem appends in audit and egress:
  `packages-galerina/galerina-tower-citizen/src/audit-logger.ts:120`,
  `packages-galerina/galerina-core-sentinel-egress/src/audit-egress.ts:136`
- external process probing for GPU detection:
  `packages-galerina/galerina-ext-bridge-cpp/src/hardware-detect.ts:47`

Recommendation:
- distinguish "bounded-latency prototype" from "constant-time certified path"
- create a P9 profile that disables wall-clock IDs, direct disk writes, runtime
  bridge probing, and per-op allocation

### Fail-safe check

The shadow kernel is not an atomic failover path today. LSP decides which tier is
allowed; it does not own the live bridge pointer or enforce a swap.

Evidence:
- `packages-galerina/galerina-core-sentinel-power/src/power-governor.ts:128`
- `packages-galerina/galerina-core-sentinel-power/ARCHITECTURE_ISSUES.md:25`

Recommendation:
- implement a `KernelTierRegister` with monotonic down-tier semantics
- allow swaps only at declared operation boundaries
- log failover with LST tick, previous tier, new tier, reason, and bridge hash

## Strategic Suggestions

### 1. Create a P9 Certified Runtime Profile

Add a single runtime profile that fails closed on:

- missing model when `approvedModels` is non-empty
- missing max-token/max-cost enforcement
- zero HMAC keys
- direct filesystem audit writes
- unmeasured bridge registries
- unmeasured native addons
- host-native fp8/fp16 fallback unless explicitly approved
- runtime hardware probing inside flight execution

This makes certification posture enforceable instead of documented.

### 2. Split and Attest the Brain/Brawn Contract

Create a neutral package for:

- `InferenceBridge`
- `BridgeOp`
- `BridgeResult`
- packed layout metadata
- fixed-point scale metadata
- determinism oracle API
- signed bridge manifest schema

Then make:

- `tower-citizen` depend on the contract
- `ext-bridge-cpp` depend on the contract
- neither side import the other's runtime internals

This removes the current Brawn-to-Brain dependency and gives package-graph
governance a clean boundary to enforce.

### 3. Add Stochastic Integrity to TPL Memory

Upgrade LSM/LSIO for aerospace physics, not only malicious tamper:

- add ECC/parity per TPL block
- add optional TMR or dual-read/majority verification for safety-critical weights
- re-verify block integrity immediately before bridge dispatch
- treat valid-code bit flips as first-class SDC risks
- add periodic scrub and logical-tick-indexed memory audit

This closes the gap between tamper-evident manifests and radiation-tolerant
flight memory.

## Final Certification Position

Current Galerina is a strong high-assurance prototype with excellent test coverage
and a coherent governed-inference direction. It is not yet a P9 aerospace runtime.

The blocker is not lack of features; it is that several safety claims currently
live in comments, docs, examples, or optional configuration instead of mandatory
runtime invariants. The next hardening milestone should convert those claims into
fail-closed gates: bridge attestation, mandatory governance budgets, no zero keys,
no unmeasured native code, no silent host fallback, and no flight-path allocation
or filesystem jitter.


---

## Remediation Status (updated 2026-06-06, post-audit)

> The audit was written against `_fulltest4.log` (43/43, 4069 tests). Since then the
> suite is at **43/43, 4,085 tests**, and the following gates are now enforced.

| Finding | Status | Evidence |
|---|---|---|
| **CF-1** approvedModels bypass (missing `model`) | ✅ **FIXED** | `ERR_AI_MODEL_REQUIRED` in `checkAiGovernance()`; test `certified-profile.test.mjs`, `governance-hardening.test.mjs` |
| **CF-2** max-token / cost not enforced | ✅ **PARTIAL→FIXED** | `AiGovernance.maxNewTokens` enforced (`ERR_AI_TOKEN_BUDGET`); `maxTokenCost` recorded + required in certified mode. Full CostGraph per-call pricing remains a follow-up |
| **CF-6** `0b11` corruption masking | ✅ **FIXED** | stub bridge throws `SecurityTrap` on `enc===3`; test `governance-hardening.test.mjs` |
| **Silent host-native fallback** | ✅ **FIXED** | `denyHostNativeFallback` → `ERR_HOST_NATIVE_DENIED` |
| **CF-8** zero HMAC keys | ✅ **FIXED (opt-in strict)** | `AuditEgress`/`StateSerializer` `strictKey` reject all-zero key (`EGR-KEY-001`/`LSS-KEY-001`); forced on in certified mode |
| **P9 Certified Profile (strategic #1)** | ✅ **IMPLEMENTED** | `createHybridEngine({ certified:true })` fails closed: requires egress (no direct fs), allow-list+model, max_tokens, max_token_cost, denies host-native. `ERR_CERTIFIED_*` |
| **CF-3** bridge attestation (signed manifests) | 🔲 **OPEN** | needs signed bridge manifest schema + runtime measurement |
| **CF-4** Brawn→Brain layering | 🔲 **OPEN** | split `InferenceBridge`/oracle into a neutral contract package |
| **CF-5** vector-path commit gate / `canCommit()` in `execute()` | 🔲 **OPEN** | define vector commit semantics; fail-closed bridge execute |
| **CF-7** native addon attestation | 🔲 **OPEN** | pin addon SHA-256 + build provenance; fail closed in certified mode |
| **CF-9** ECC/TMR (valid-code bit flips) | 🔲 **OPEN** | per-block parity/ECC + optional TMR for safety-critical weights |
| **CF-10** atomic kernel failover | 🔲 **OPEN** | `KernelTierRegister` + quiesce-point swap + signed failover event |
| TPL fixed-point scale (IEEE-754 leak) | 🔲 **OPEN** | `i2_scale` → `{ mantissa, shift }` |
| Workspace graph staleness | 🔲 **OPEN** | regenerate `build/graph` for the Tower/Sentinel era (per-package graphs ARE current: 9/9 gates pass) |

**Net:** the highest-severity *fail-open* gaps (CF-1, CF-2, CF-6, CF-8, host-native)
are closed, and the P9 Certified Profile makes them mandatory rather than optional.
The remaining open items are architectural (attestation, package split, ECC/TMR,
atomic failover) — the substance of the next hardening milestone.
