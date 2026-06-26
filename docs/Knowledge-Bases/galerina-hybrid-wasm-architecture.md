# Galerina — Hybrid WASM Architecture

## Decision (2026-05-31)

```
WASM should govern. Native should accelerate. Galerina should prove the boundary between them.
```

---

## Core Rule

```
WASM is the trusted governance / control layer.
Native is an explicitly granted acceleration layer.
```

Native code is NOT an escape hatch. It receives only:
- Verified buffers
- Verified capabilities
- Verified entry points
- Declared offsets and lengths — never raw pointers in Galerina source

---

## Build Targets

### Default (safest, most portable):
```bash
galerina build --target wasm
```
Pure WASM/WASI. All computation inside WASM. No native modules. Governance fully verifiable.

### High-performance:
```bash
galerina build --target wasm-hybrid
```
WASM control plane governs. Native data plane accelerates. Shared memory arena avoids copying.

---

## WAT Assembler Decision

## WAT Assembler — JS Package (Default)

The default Galerina toolchain uses a JS/npm WAT assembler, not a system binary.

**Rule:** The Galerina default toolchain must not require external native binaries.

**CLI behaviour:**
```
galerina build --target wasm                    → JS assembler (default, portable, CI-safe)
galerina build --target wasm --use-system-wabt  → optional native path
```

**Phase 25 toolchain path:**
```
Galerina source → WAT text (wat-emitter.ts) → JS assembler → .wasm binary
→ Node.js WebAssembly.instantiate → governed flow execution
```

**Why JS first:**
- Works on Windows/macOS/Linux
- Works in CI without native binary setup
- Consistent with Galerina's package story
- Later: wabt/wat2wasm as optional faster dev path

---

## What Each Layer Does

### WASM (control plane) governs:
```
contracts, effects, validation, routing, policy checks
request/response handling, audit proof, privacy enforcement
capability gating, response construction
```

### Native (data plane) accelerates:
```
tensor operations, NPU inference, GPU kernels, APU shared memory
video/audio processing, large matrix operations, photonic bridge runtimes
```

---

## Framing: Target Preference vs Capability

```
target preference  = planning metadata (prefer [npu, gpu, cpu])
native hardware access = capability (host.npu.inference)
```

```galerina
contract {
  effects {
    ai.inference         // authority to perform inference
  }
  targets {
    prefer [npu, gpu, cpu]   // planning hint — not authority
    fallback cpu
    deny [remote.execution]  // governance rule
  }
}
```

`ai.inference` is the authority. NPU/GPU/CPU are target preferences.
If the runtime calls a native NPU provider, that provider must be capability-gated:
```
host.npu.inference
host.gpu.compute
host.apu.shared_memory
```

---

## The Governed Shared Buffer Arena (EDA)

**Critical rule: native modules MUST NOT get raw access to WASM's linear memory.**
If a native module receives a raw pointer into WASM's heap, WASM isolation is dead.

### The Exhaustive Data Arena (EDA)

A **third memory space**, allocated by the host runtime, entirely separate from:
- WASM's linear memory (WASM's own heap)
- The native module's process memory

```
Host Runtime allocates EDA (e.g. 32MB shared region)
  ├─ tensor input  [WASM write-only via DataHandle]
  ├─ tensor output [WASM read-only via DataHandle]
  └─ scratch       [Native compute scratch space]

WASM linear memory (WASM's own heap — native NEVER touches this)
Native process memory (native's own heap — WASM NEVER touches this)
```

### DataHandle — The Only Interface

WASM never sees raw EDA pointers. It uses a host-provided resource type:
```
DataHandle { offset: u32, length: u32 }
```

Protocol for Tensor.dot:
1. Host runtime allocates EDA region
2. WASM writes tensor data to EDA via `DataHandle(0, 3072)` (768 floats × 4 bytes)
3. WASM passes DataHandle integers to host runtime (not a raw pointer)
4. Host validates handle against declared effect bounds from contract
5. Host passes the specific mapped memory block to native — NOT WASM's memory
6. Native reads from mapped region, writes result to output DataHandle
7. WASM reads result via output DataHandle
8. Host emits audit event with data sizes (not content)

### No "Zero-Copy" Promise

**Correct term: copy-minimised governed shared memory.**
Sometimes copying IS the security boundary. For PII data, copying into a sanitised buffer before native access is the right answer, not zero-copy.

### PII Boundary via Value-State Erasure

`protected MessageText` (language strings) CANNOT cross the native boundary — it's a **compile-time type error**, not a runtime check.

```
[protected MessageText] → (WASM Tokenizer) → [compiled TensorBuffer] → (Native NPU)
    (Text strings)                              (Raw Float arrays)       (Safe compute)
```

The Governance Verifier enforces: `protected T` may not be passed to native boundaries.
The WASM tokenizer maps text → floating-point token IDs. What crosses is an anonymous `Float32Array` — no strings, no PII, no semantic content that can be exfiltrated.

### Crash Recovery: The Supervisor Model

```
Host Supervisor
  ├─ WASM control worker (governs)
  └─ Native accelerator worker (accelerates)
```

**WASM crash (controlled trap — bounds, unreachable, policy):**
- Host/supervisor catches the trap
- Writes audit event: `native_wasm_trap`
- Discards the WASM instance
- Starts clean WASM instance
- Retries if declared in contract

**Native crash (segfault — takes down its process):**
- Host supervisor intercepts `SIGCHLD`
- Transitions active WASM thread to `hardware_exception_trap`
- Writes high-priority audit event: `native_accelerator_crash`
- Falls back to declared fallback target (e.g. `wasm` or `cpu`)
- Spawns clean native worker process

**Neither directly recovers the other.** The supervisor manages both.

```galerina
targets {
  prefer [npu, gpu, wasm, cpu]
  fallback wasm            // explicit fallback — required
  deny [remote.execution]
}
```

Runtime behaviour: try NPU → crash → audit → fallback to WASM → continue serving.

---

## Phase 27 Spec: Tensor.dot — The Minimal Safe Native Plugin

The first native accelerator is deliberately minimal to prove the model safely:

```
Tensor.dot only (dot product of two Float32 vectors)
Input/output: DataHandle only — no raw pointers
No strings, no PII, no protected values
No filesystem, no network
Child-process isolation (Phase 27: process, Phase 28: component)
Signed module (SPORE-PKG-005 equivalent for native)
Audit entry required: records chosen target, buffer sizes (not content)
Fallback: cpu (always declared)
```

Component Model-compatible ABI (forward-compatible with WA Component Model):
```
interface galerina-hardware-npu {
  record tensor-view {
    offset: u32,
    length: u32,
  }
  execute-dot: func(a: tensor-view, b: tensor-view, out: tensor-view) -> result<void, u32>;
}
```

`NativeCapabilityId.NpuInference` maps directly to this interface type.

---

## Native Module Governance Rules

**All 8 rules are MANDATORY for native acceleration modules:**

1. **Signed** — native modules must be signed (same as packages: SPORE-PKG-005)
2. **Capability-declared** — must declare: `host.npu.inference`, `host.gpu.compute`, etc.
3. **No raw protected data** — WASM must never pass raw protected values unless policy allows
4. **Offset-based memory** — shared memory uses offsets and lengths, not raw pointers in Galerina source
5. **Runtime report** — native calls must appear in the runtime report
6. **Audit proof** — native target choice must be recorded in audit proof
7. **Fallback declared** — fallback target must always be declared (minimum: `cpu`)
8. **No remote inference from intent** — remote.execution must never be inferred; it must be explicitly denied or allowed

---

## Native Capability IDs

The following capability IDs are reserved for native acceleration:

```
host.npu.inference          — local NPU inference call
host.gpu.compute            — GPU compute shader execution
host.gpu.matmul             — GPU matrix multiplication
host.apu.shared_memory      — APU zero-copy shared memory
host.wasm.simd              — WASM SIMD (still WASM, but surfaced as capability)
host.photonic.bridge        — photonic compute bridge (Phase 23+)
```

These are declared in `contract.effects {}` just like any other effect:
```galerina
effects {
  ai.inference    // authority
}
// The runtime resolves: ai.inference → host.npu.inference (if NPU available)
```

---

## Complete Example: classifyMessage

```galerina
guarded flow classifyMessage(
  readonly request: Request
) -> ClassifyMessageResult

contract {
  types {
    type ClassifyMessageResult = Result<Response, ApiError>
  }

  intent {
    "Classify a message locally using governed AI inference."
  }

  request {
    body {
      text: unsafe String
    }
  }

  effects {
    ai.inference
    audit.write
  }

  targets {
    prefer [npu, gpu, wasm, cpu]
    fallback cpu
    deny [remote.execution]
  }

  memory {
    arena 32mb
  }

  privacy {
    contains PII
    deny protected MessageText to remote.execution
    require redaction before audit.write
  }

  audit {
    require runtime report
    require selected target proof
  }
}
{
  unsafe let rawText: String = request.body.text
  let text: protected MessageText = validate.messageText(rawText)?
  let result = Classifier.run(text)?
  AuditLog.write({
    event: "MessageClassified",
    label: result.label
  })
  return Ok(Response.okJson({ label: result.label }))
}
```

### Compiler partitioning:

```
WASM (control plane):          Native (data plane):
  request validation             model inference
  privacy enforcement            tensor execution
  effect enforcement
  audit proof
  response construction
```

---

## Passive Execution Plan Shape (Hybrid)

```yaml
flow: classifyMessage

control_plane:
  target: wasm
  responsibilities:
    - validate_request
    - enforce_effects
    - enforce_privacy
    - emit_audit
    - construct_response

data_plane:
  target_preference: [npu, gpu, cpu]
  workload:
    kind: ai.inference
  memory:
    arena: 32mb
    access:
      input: readonly
      output: writeonly

capabilities:
  wasm_imports:
    - audit.write
  native_imports:
    - host.npu.inference

denied:
  - remote.execution
```

---

## 6-Phase Build Order

```
Phase 24 (current):
  Galerina → WAT → WASM
  Pure flows only, real instruction bodies

Phase 25:
  WASI imports gated by effects
  Effectful flows compile to WASM with typed host:* imports
  Auth service example deployed

Phase 26:
  Shared memory arena for simple buffers
  contract.memory { arena 32mb } → WASM memory segment
  First healthcare/finance example with PHI governance

Phase 27:
  Native plugin ABI for one safe operation — Tensor.dot
  host.npu.inference capability gated
  AI inference example with NPU dispatch

Phase 28:
  NPU/GPU provider interface
  Multiple native modules with capability governance
  Stage B self-hosting proof

Phase 29:
  Full hybrid partitioner
  Compiler determines control_plane/data_plane split from SemanticGraph
  Runtime manifest includes selected_target_proof
```

---

## Integration with Existing Architecture

### PassiveExecutionPlan
Extended in Phase 27+ to include `control_plane` / `data_plane` split.
The `PassiveExecutionPlan` already has `qualifier` and `steps` — extend with:
```typescript
readonly dataPlane?: {
  readonly targetPreference: readonly string[];
  readonly workloadKind: string;
  readonly arenaLimitMb?: number;
  readonly nativeCapabilities: readonly string[];
}
```

### GIR
`GIRFlow.execution.preferred` already carries target hints.
Phase 27: extend with `nativeImports: readonly string[]`.

### RuntimeManifest
Add `selectedTargetProof?: string` — which native module was chosen and its hash.

### NodeFlags
`NodeFlags.HasCompute` is set when `prefer [...]` or `compute {}` is present.
Phase 27: `TensorCandidate | HasCompute` → trigger hybrid partitioning.

---

## Crash Recovery

**Supervisor model:**

```
Host Supervisor
  ├─ WASM control worker (governs)
  └─ Native accelerator worker (accelerates)
```

**WASM crash:** controlled trap → supervisor restarts WASM instance → audit event written.

**Native crash:** segfault → supervisor catches SIGCHLD → WASM gets `hardware_exception_trap`
→ falls back to declared fallback → native worker restarted.

Neither recovers the other directly. The supervisor manages both.

**SPORE-GOV-014 (MissingFallbackTarget):** fallback is required, not optional.

```galerina
targets {
  prefer [npu, gpu, wasm, cpu]
  fallback wasm   // required — SPORE-GOV-014 enforces this
  deny [remote.execution]
}
```

---

## See Also

- `galerina-hybrid-wasm-native-architecture-v1.md` — **Canonical v1.0 document** — the full architecture including Snapdragon/NPU integration strategy
- `galerina-security-anti-abuse.md` — anti-botnet protections, SPORE-NET-001/002, process.spawn
- `galerina-gir-emitter-architecture.md` — GIR emitter and WASM lowering plan
- `galerina-runtime-interpreter-roadmap.md` — runtime evolution plan
- `galerina-explicitness-principles.md` — nothing important hidden
- `galerina-architecture-high-roi-ideas.md` — high-ROI implementation ideas
- `galerina-passive-execution-plans.md` — execution plan foundation
