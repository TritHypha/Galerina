# Galerina — Resource Governance

## Status

```
Phase 18+ — Design Proposal
Decision: Resource pressure is a governed runtime state, not an accidental crash
Foundation: contract.limits (implemented), contractEnforcer.ts (implemented)
Full resource governance: Phase 18+
New diagnostics: SPORE-RUNTIME-RESOURCE-001..005 (future)
```

## TL;DR

- Disk full, memory full, CPU saturated, GPU saturated should be **governed runtime states**, not crashes
- Services declare resource budgets; the runtime can reject unsafe work before it starts
- Flows declare fallback behaviour explicitly (`fallback { on disk.full -> return Err(...) }`)
- "Galerina Resource Governance" — budgets, pressure detection, fallbacks, backpressure, streaming, degraded mode

---

## 1. Declare Resource Budgets

```galerina
service ImageWorker

resources {
  memory max 512Mi
  disk temp max 2Gi
  cpu max 2 cores
  gpu optional
}
```

The runtime checks budgets at service startup and per-request. If the service would exceed its declared budget, work is rejected before it starts — not after it's half-done.

---

## 2. Require Fallback Behaviour

```galerina
secure flow resizeImage(readonly request: Request) -> ResizeResult

contract {
  types {
    type ResizeResult = Result<Response, WorkerError>
  }

  effects {
    gpu.compute
    filesystem.temp.write
  }

  fallback {
    on gpu.busy -> use cpu.compute
    on disk.full -> return Err(WorkerError.StorageUnavailable)
    on memory.pressure -> streamChunks
  }
}
{
  ...
}
```

No silent failure. No uncontrolled crash. The fallback behaviour is declared in the contract and verified by the compiler.

---

## 3. Resource Pressure Diagnostics

| Code | Name | When |
|---|---|---|
| SPORE-RUNTIME-RESOURCE-001 | DISK_FULL | Filesystem write fails due to full disk |
| SPORE-RUNTIME-RESOURCE-002 | MEMORY_PRESSURE | Flow allocates more than declared budget |
| SPORE-RUNTIME-RESOURCE-003 | CPU_SATURATED | Worker pool exhausted, no available cores |
| SPORE-RUNTIME-RESOURCE-004 | GPU_SATURATED | GPU workload cannot be scheduled |
| SPORE-RUNTIME-RESOURCE-005 | TEMP_SPACE_EXCEEDED | Temporary write exceeds declared limit |
| SPORE-RESOURCE-006 | UnboundedMemoryRead | `fs.readAll(file)` without memory budget |

---

## 4. Stream Instead of Buffer

Compiler can warn on unbounded reads:

```galerina
// WARNING: SPORE-RESOURCE-006 — unbounded memory read
let wholeFile = fs.readAll(largePath)
```

```text
SPORE-RESOURCE-006: fs.readAll() on potentially large file.
Use stream.readChunks() or declare memory budget.
```

Preferred pattern:

```galerina
// No warning — streaming declared
let stream = fs.openRead(largePath)?

for chunk in stream.chunks(64 KB) {
  processChunk(chunk)?
  writeChunk(outputPath, chunk)?
}
```

---

## 5. Backpressure by Default

For queues, APIs, workers:

```galerina
queue ImageJobs {
  maxInFlight 10
  backpressure rejectAfter 30s
}
```

If CPU/memory is full, Galerina slows or rejects new work instead of collapsing.
This maps to the existing `contract.limits { max batch size N }` model.

---

## 6. Safe Degradation

Instead of "try everything until the server dies":

```
normal mode          → full capability
  ↓ memory.pressure
reduced concurrency  → maxInFlight halved
  ↓ cpu.saturated
CPU fallback         → gpu-optional flows switch to cpu
  ↓ disk.low
read-only mode       → deny writes, serve from cache
  ↓ critical.only
reject non-critical  → only governed essential work
```

Degraded mode is declared, not discovered by accident.

---

## 7. Runtime Health Reports

```json
{
  "service": "ImageWorker",
  "resources": {
    "memory": { "used": "480Mi", "max": "512Mi", "pressure": true },
    "disk": { "temp": "1.8Gi", "max": "2Gi", "low": true },
    "cpu": { "cores": 1.9, "max": 2, "saturated": false },
    "gpu": { "available": false }
  },
  "mode": "degraded",
  "degradedSince": "2026-05-31T..."
}
```

This format lets Kubernetes/Docker/serverless platforms respond correctly:
- Kubernetes: liveness probe fails gracefully → pod replaced
- Cloudflare Workers: capacity signal → route to other region
- Fly Machines: health check → scale up

---

## 8. Compile-Time Prevention

The compiler flags risky patterns before they reach production:

```galerina
// Compiler warning at build time
let data = fs.readAll(request.params.filePath)?   // SPORE-RESOURCE-006
```

```galerina
// No warning — streaming declared
let chunks = fs.openReadChunked(path, 64 KB)?    // streaming, bounded
```

For AI inference workloads:

```galerina
// Warning if tensor larger than declared GPU memory
let embedding: Tensor<Float32, [1000000]>        // SPORE-RESOURCE-007 (future)
```

---

## Implementation Roadmap

```
Phase 16 (now): contract.limits enforcement (max request size, max batch size) ← in contractEnforcer.ts
Phase 17: service resources {} declaration
Phase 17: fallback {} block parsing
Phase 18: SPORE-RUNTIME-RESOURCE-001..005 diagnostics
Phase 18: Runtime health report format (memory/disk/cpu/gpu)
Phase 18: SPORE-RESOURCE-006 unbounded memory read warning
Phase 19: backpressure declaration (queue {})
Phase 19: degraded mode protocol
Phase 21: GPU/NPU resource governance (connects to Hardware as Capabilities)
```

---

## Relationship to Existing Galerina Concepts

| Existing concept | Resource governance role |
|---|---|
| `contract.limits { max memory 128 MB }` | Per-flow budget declaration |
| `contract.timeouts { deadline 200ms }` | CPU time bound |
| `capabilityHost.ts` | Gateway for all resource-consuming operations |
| `runtime/contractEnforcer.ts` | Enforces limits at request time |
| `runtimeReport.ts` | Records peak_memory, cpu_time, disk_writes |
| Hardware as Capabilities | GPU/NPU resource availability |

---

## Best Principle

```
Resource pressure is not an accident.
It is a known runtime condition.
Governed services declare how they respond to it.
```

Traditional: services crash or behave unpredictably when resources run out.
Galerina: resources are declared, budgets are enforced, fallbacks are required, reports are emitted.

---

## See Also

- `galerina-microservice-architecture.md` — service-level resource contracts
- `galerina-docker-container-profile.md` — container resource limits
- `galerina-ai-memory-efficiency.md` — GPU/tensor memory planning
- `galerina-cache-aware-execution.md` — CPU cache resource planning
- `galerina-governed-memory-blocks.md` — per-value memory governance
- `galerina-passive-execution-plans.md` — pre-planned execution for predictable resource usage
