# Galerina Phase 27 — AI Native: Deno Deploy + Tensor.dot

## Status

Phase 27 (2026-05-31) — scaffolding complete, native plugin ABI defined.

---

## Runtime: Deno Deploy / Edge Cloud

Phase 27 introduces Deno Deploy as a supported runtime target for Galerina flows:

```bash
galerina build --target deno-deploy
galerina deploy --runtime deno
```

**Deployment profile:**
- WASM control plane runs in Deno's V8 isolate (WebAssembly.instantiate)
- Native Tensor.dot plugin runs as a child process (child-process isolation)
- EDA arena allocated by the host Deno runtime (shared memory, 32MB default)
- Audit events streamed to Deno KV or a declared audit.write sink

**Why Deno Deploy:**
- First-class WASM support (WebAssembly.instantiate in the edge isolate)
- TypeScript-native — Galerina emits typed interfaces compatible with Deno's type system
- Edge-distributed — AI inference can run close to the user
- Permissioned by default — aligns with Galerina's capability model (Deno --allow-* flags map to Galerina effects)

---

## Native Tensor.dot Plugin: EDA Model, DataHandle, Child-Process Isolation

### The Minimal Safe Native Plugin

Phase 27 introduces the first native accelerator: `Tensor.dot` (dot product of two `Float32` vectors).

The plugin is deliberately minimal to prove the governance model safely before expanding:

```
Tensor.dot only (dot product of two Float32 vectors)
Input/output: DataHandle only — no raw pointers
No strings, no PII, no protected values
No filesystem, no network access
Child-process isolation (Phase 27: process, Phase 28: component)
Signed module (SPORE-PKG-005 equivalent for native)
Audit entry required: records chosen target, buffer sizes (not content)
Fallback: cpu (always declared — SPORE-GOV-014 enforces this)
```

### EDA (Exhaustive Data Arena) Model

The EDA is a third memory space, allocated by the host runtime, separate from:
- WASM linear memory (WASM's own heap — native NEVER touches this)
- The native module's process memory (native's own heap — WASM NEVER touches this)

```
Host Runtime allocates EDA (e.g. 32MB — from contract.memory { arena 32mb })
  ├─ tensor input  [WASM write-only via DataHandle]
  ├─ tensor output [WASM read-only via DataHandle]
  └─ scratch       [Native compute scratch space]
```

### DataHandle Protocol

WASM never sees raw EDA pointers. It uses a host-provided resource type:

```
DataHandle { offset: u32, length: u32 }
```

**Step-by-step protocol for Tensor.dot:**

1. Host runtime allocates EDA region
2. WASM writes tensor data to EDA via `DataHandle(0, 3072)` (768 floats × 4 bytes)
3. WASM passes DataHandle integers to host runtime — not a raw pointer
4. Host validates handle against declared effect bounds from contract
5. Host passes the specific mapped memory block to native — NOT WASM's memory
6. Native reads from mapped region, writes result to output DataHandle
7. WASM reads result via output DataHandle
8. Host emits audit event with data sizes (not content)

**Correct term:** copy-minimised governed shared memory. "Zero-copy" is not promised — sometimes copying IS the security boundary (especially for PII data).

### Child-Process Isolation

Phase 27: native plugin runs in a separate child process.

```
Host Supervisor
  ├─ WASM control worker (governs — in V8/Deno isolate)
  └─ Native accelerator worker (accelerates — in child process)
```

The child process:
- Has no access to WASM's linear memory
- Receives only mapped EDA segments (specific offset + length)
- Cannot escalate to WASM's heap or Deno's runtime memory
- Is restarted by the supervisor on crash (SIGCHLD → `native_accelerator_crash` audit event)

Phase 28 will upgrade isolation to the WebAssembly Component Model (component-level sandboxing).

---

## Component Model ABI: tensor-view Interface

The Tensor.dot plugin uses a forward-compatible Component Model interface:

```wit
interface galerina-hardware-npu {
  record tensor-view {
    offset: u32,
    length: u32,
  }
  execute-dot: func(a: tensor-view, b: tensor-view, out: tensor-view) -> result<void, u32>;
}
```

`NativeCapabilityId.NpuInference` (`"host.npu.inference"`) maps directly to this interface type.

The `tensor-view` record is the wire representation of `DataHandle` in the Component Model ABI. It carries only offset and length — no raw pointers, no WASM memory references.

---

## Stage B: type-checker.spore Parity Goal

Phase 27 includes a Stage B parity goal: the self-hosted `type-checker.spore` should reach functional parity with the TypeScript `type-checker.ts` for the subset of types used in AI/inference flows:

- `Tensor<Float32, [768]>` — element type and shape checking (SPORE-TYPE-030, SPORE-TYPE-031)
- `protected MessageText` — value-state boundary enforcement (SPORE-VALUESTATE-006)
- `NativePluginManifest` — manifest schema validation
- `DataHandle` — offset/length type enforcement (no raw pointer types in source)

**Parity milestone:** `type-checker.spore` must emit equivalent diagnostics for the `classifyMessage` flow as `type-checker.ts` when run via the interpreter (Stage A execution).

The self-hosted checker is in `src/self-hosted/type-checker.spore`. Phase 28 will extend it to cover the full native plugin ABI surface.

---

## Security: PII Erasure

### protected MessageText → compiled TensorBuffer

`protected MessageText` (language strings) CANNOT cross the native boundary. This is a **compile-time type error**, not a runtime check.

```
[protected MessageText] → (WASM Tokenizer) → [compiled TensorBuffer] → (Native NPU)
    (Text strings)                              (Raw Float arrays)       (Safe compute)
```

The Governance Verifier rule: `protected T` may not be passed to native boundaries.

The WASM tokenizer maps text → floating-point token IDs. What crosses the EDA boundary is an anonymous `Float32Array`:
- No strings
- No PII
- No semantic content that can be exfiltrated
- No human-readable labels

The audit log records only: event name, output label (classification result), buffer sizes. It does NOT record the original message text.

### compile-time proof

The compiler proves the PII boundary at compile time via value-state tracking:
- `rawText: unsafe String` — tainted, cannot reach governed sinks
- `text: protected MessageText` — protected, cannot cross native boundary
- `result.label` — derived from inference output, not from input text; safe to audit

---

## 8 Native Governance Rules

All native acceleration modules in Galerina must satisfy these rules (source: hybrid-wasm-architecture.md):

**Rule 1 — Signed**
Native modules must be signed (same scheme as packages: SPORE-PKG-005 equivalent).
The `NativePluginManifest.signature` field carries the ed25519 signature.

**Rule 2 — Capability-declared**
Must declare a specific capability: `host.npu.inference`, `host.gpu.compute`, etc.
The capability must appear in the consuming flow's `contract.effects {}`.

**Rule 3 — No raw protected data**
WASM must never pass raw `protected T` values to native boundaries.
The Governance Verifier enforces this at compile time (not runtime).

**Rule 4 — Offset-based memory**
Shared memory uses offsets and lengths (DataHandle), not raw pointers in Galerina source.
`NativePluginManifest.allowedInputHandles` / `allowedOutputHandles` bound the handle count.

**Rule 5 — Runtime report**
Native calls must appear in the runtime report.
The `RuntimeManifest` is extended with `selectedTargetProof` in Phase 27.

**Rule 6 — Audit proof**
The native target choice must be recorded in the audit proof.
`contract.audit { require selected target proof }` enforces this declaration.

**Rule 7 — Fallback declared**
A fallback target must always be declared (minimum: `cpu`).
SPORE-GOV-014 enforces this: missing fallback is a warning that escalates to error in production.

**Rule 8 — No remote inference from intent**
`remote.execution` must never be inferred from `ai.inference`.
It must be explicitly denied (`deny [remote.execution]`) or explicitly allowed.
Default: denied. No implicit remote execution from AI effects.

---

## NativePluginManifest Type

Defined in `packages-galerina/galerina-core-compiler/src/type-registry.ts`:

```typescript
export interface NativePluginManifest {
  readonly schemaVersion: "spore.native-plugin.v1";
  readonly name: string;
  readonly capability: string;          // e.g. "host.npu.inference"
  readonly hash: string;                // sha256: content hash of native binary
  readonly signature: string;           // ed25519 signature
  readonly edaArenaLimitMb: number;     // max EDA arena size
  readonly allowedInputHandles: number; // max DataHandles for input
  readonly allowedOutputHandles: number;
  readonly childProcess: true;          // Phase 27: always child process
  readonly fallback: string;            // e.g. "cpu" or "wasm"
}
```

**Example manifest for Tensor.dot:**

```json
{
  "schemaVersion": "spore.native-plugin.v1",
  "name": "galerina-tensor-dot-npu",
  "capability": "host.npu.inference",
  "hash": "sha256:a3b4c5d6e7f8...",
  "signature": "ed25519:...",
  "edaArenaLimitMb": 32,
  "allowedInputHandles": 2,
  "allowedOutputHandles": 1,
  "childProcess": true,
  "fallback": "cpu"
}
```

---

## Integration with Existing Architecture

### PassiveExecutionPlan Extension (Phase 27)

```typescript
readonly dataPlane?: {
  readonly targetPreference: readonly string[];
  readonly workloadKind: string;
  readonly arenaLimitMb?: number;
  readonly nativeCapabilities: readonly string[];
}
```

### GIR Extension (Phase 27)

`GIRFlow.execution.preferred` already carries target hints.
Phase 27 adds: `nativeImports: readonly string[]` (e.g. `["host.npu.inference"]`).

### RuntimeManifest Extension (Phase 27)

`selectedTargetProof?: string` — which native module was chosen and its hash.

---

## Build Order Context

```
Phase 24: Galerina → WAT → WASM (pure flows)
Phase 25: WASI imports gated by effects (effectful flows)
Phase 26: Shared memory arena for simple buffers
Phase 27: Native plugin ABI for Tensor.dot — THIS PHASE
Phase 28: NPU/GPU provider interface; multiple native modules; Stage B self-hosting proof
Phase 29: Full hybrid partitioner; compiler determines control_plane/data_plane split
```

---

## See Also

- `docs/Knowledge-Bases/galerina-hybrid-wasm-architecture.md` — canonical architecture document
- `examples/ai-inference/classifyMessage.spore` — the complete example
- `examples/ai-inference/GOVERNANCE_PROOF.md` — governance proof for classifyMessage
- `packages-galerina/galerina-core-compiler/src/type-registry.ts` — NativePluginManifest type
