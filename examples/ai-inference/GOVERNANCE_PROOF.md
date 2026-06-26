# classifyMessage — Governance Proof (Phase 27)

## Control Plane: WASM Governs

The WASM module is the trusted governance layer. It handles all policy-bearing responsibilities:

- **Validation** — raw input (`unsafe String`) is validated through `validate.messageText()` before use
- **Privacy enforcement** — `protected MessageText` cannot cross the native boundary (compile-time type error, not runtime check)
- **Effect enforcement** — `ai.inference` and `audit.write` are declared and checked at compile time
- **Audit proof** — `AuditLog.write` records event label; `require selected target proof` enforces runtime manifest
- **Response construction** — `Response.okJson(...)` is built and returned by the WASM control plane

WASM linear memory is never exposed to the native module. The native module only receives a mapped `DataHandle` from the separate EDA arena.

## Data Plane: Native Accelerates

The native Tensor.dot plugin performs compute acceleration on the data plane:

- **Model inference** — token embedding lookup and dot-product scoring run natively
- **Tensor execution** — operates on `Float32` vectors via the `host.npu.inference` capability
- **Target preference** — runtime selects from `[npu, gpu, wasm, cpu]` in order of availability
- **Fallback** — `fallback cpu` ensures recovery if native accelerator is unavailable or crashes

The native module receives only verified buffers (offset + length `DataHandle` pairs). Raw WASM linear memory pointers are never passed.

## EDA (Exhaustive Data Arena) Model

The EDA is a third memory space — separate from both WASM linear memory and the native process heap:

```
Host Runtime allocates EDA (32mb — from contract.memory { arena 32mb })
  ├─ tensor input  [WASM write-only via DataHandle]
  ├─ tensor output [WASM read-only via DataHandle]
  └─ scratch       [Native compute scratch space]

WASM linear memory  (native NEVER touches this)
Native process heap (WASM NEVER touches this)
```

### DataHandle Protocol

WASM never sees raw EDA pointers. It uses a host-provided resource type:

```
DataHandle { offset: u32, length: u32 }
```

Protocol for this flow:

1. Host runtime allocates EDA region (32mb as declared in contract)
2. WASM tokenizer maps `protected MessageText` → `Float32Array` (no strings cross the boundary)
3. WASM writes token embeddings to EDA via `DataHandle(0, 3072)` (768 floats × 4 bytes)
4. WASM passes DataHandle integers to host runtime — not a raw pointer
5. Host validates handle against declared effect bounds from contract
6. Host passes the specific mapped memory block to native NPU plugin — NOT WASM's memory
7. Native reads from mapped region, writes classification scores to output DataHandle
8. WASM reads result via output DataHandle, constructs `ClassifyMessageResult`
9. Host emits audit event with buffer sizes (not content — no PII in audit log)

### PII Boundary via Value-State Erasure

`protected MessageText` (language strings) CANNOT cross the native boundary — this is a **compile-time type error**, enforced by the Governance Verifier:

```
[protected MessageText] → (WASM Tokenizer) → [compiled TensorBuffer] → (Native NPU)
    (Text strings)                              (Raw Float arrays)       (Safe compute)
```

The Governance Verifier enforces: `protected T` may not be passed to native boundaries.
What crosses is an anonymous `Float32Array` — no strings, no PII, no semantic content that can be exfiltrated.

## Phase 27 Native Capability: host.npu.inference via Tensor.dot Plugin

The `host.npu.inference` capability is the Phase 27 minimal safe native plugin:

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

### Component Model ABI

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

`NativeCapabilityId.NpuInference` maps directly to this interface type.

### Crash Recovery

```
Host Supervisor
  ├─ WASM control worker (governs)
  └─ Native accelerator worker (accelerates)
```

- **WASM crash** (controlled trap): supervisor catches, writes `native_wasm_trap` audit event, restarts WASM instance
- **Native crash** (segfault): supervisor intercepts SIGCHLD, transitions WASM to `hardware_exception_trap`, writes high-priority `native_accelerator_crash` audit event, falls back to `cpu`, spawns clean native worker

Neither recovers the other directly. The supervisor manages both.

## References

- `docs/Knowledge-Bases/galerina-hybrid-wasm-architecture.md` — architecture decisions and rules
- `docs/Knowledge-Bases/galerina-phase-27-ai-native.md` — Phase 27 KB doc
- `packages-galerina/galerina-core-compiler/src/type-registry.ts` — `NativePluginManifest` type
