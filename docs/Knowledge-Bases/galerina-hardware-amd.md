# Galerina — AMD Hardware Support

**Version: 1.0 — 2026-06-01**
**Status: Architecture direction — Phase 33+ implementation**

---

## Position Statement

```
Galerina treats AMD hardware as a governed execution target.
AMD CPU, GPU, and NPU features may reduce cost, latency, and energy consumption.
They may never grant authority.
```

---

## AMD CPU (Zen 4 / Zen 5)

### Why AMD CPU Matters to Galerina

AMD Zen architecture is designed for:
- Dense parallelism (high core counts via CCD topology)
- Energy efficiency at scale (EPYC for cloud/server)
- Predictable execution (3D V-Cache for cache-sensitive workloads)
- Wide SIMD (native 512-bit in Zen 5)

These characteristics map well to Galerina's governance workloads:
- ProofGraph construction (compute-intensive, parallelisable)
- ExecutionGraph traversal (cache-sensitive, benefits from 3D V-Cache)
- Parallel effect checking across large codebases

### AMD CPU Governance Profiles

#### Zen 4 (`amd.zen4`)

```galerina
hardware {
  target amd.zen4
}
```

- AVX-512 256-bit and 512-bit operations
- 3D V-Cache option: ProofGraph cache-heavy traversal
- CCD locality: keep governance-critical work on same CCD

#### Zen 5 (`amd.zen5`)

```galerina
hardware {
  target amd.zen5
}
```

- Native 512-bit AVX-512 (2× throughput vs Zen 4 on 512-bit)
- Improved branch prediction (benefits while-loop heavy flows)
- Higher IPC for governance verifier hot paths

#### EPYC (`amd.epyc`)

```galerina
hardware {
  target amd.epyc
}
```

- 96–128 cores for massively parallel governance workloads
- NUMA-aware ProofGraph construction across CCDs
- Ideal for multi-tenant governed services

### CostGraph: AMD CPU Routing

```typescript
// CostGraph AMD CPU routing decisions
if (cpuCapabilities.isZen5) {
  // Native 512-bit: tensor/hash operations get AVX-512 path
  vectorAffinity = X86VectorAffinity.AMD_AVX512_NATIVE;
} else if (cpuCapabilities.isZen4 && hasVCache) {
  // 3D V-Cache: ProofGraph traversal prefers V-Cache locality
  coreAffinity = AmdCoreAffinity.VCacheCore;
} else if (cpuCapabilities.isEPYC) {
  // EPYC: governance parallel scan uses high core count
  parallelism = Math.min(cpuCapabilities.coreCount / 2, 32);
}
```

### Security Invariants on AMD CPU

- Register scrubbing between governed flows (prevent data leakage across CCD boundaries)
- Deterministic fallback: if AVX-512 is unavailable, falls back to scalar execution
- Capability isolation: no cross-CCD capability leak
- Runtime attestation: audit record includes `{ target: "amd.zen5", avx512: true }`

---

## AMD GPU (RDNA / CDNA / Instinct)

### Why AMD GPU Matters to Galerina

AMD GPU compute is designed for:
- High-throughput matrix operations (CDNA / Instinct)
- Immutable execution graphs (HIP Graphs)
- ROCm ecosystem (open-source GPU runtime)
- Data centre AI inference and training

### Execution Model: Pre-Validated Plans

```
Governance
    ↓
ProofGraph        (legality proven)
    ↓
ExecutionGraph    (dispatch plan)
    ↓
Immutable HIP Graph  (pre-validated GPU execution plan)
    ↓
ROCm Runtime      (GPU kernel execution)
```

**The runtime never launches arbitrary GPU work.** Only pre-validated execution plans derived from the GovernanceGraph.

### AMD GPU Target Classes

#### RDNA (`amd.rdna`) — General GPU Compute

```galerina
hardware {
  target amd.rdna
}
```

Use cases:
- Rendering/visualisation of governance graphs
- Parallel JSON/data parsing
- Tensor operations for non-safety-critical AI

#### CDNA (`amd.cdna`) — Data Centre AI

```galerina
hardware {
  target amd.cdna
}
```

Use cases:
- Large-scale AI inference within governed contracts
- Matrix operations for risk modelling
- Training-adjacent workloads under AI governance

#### Instinct (`amd.instinct`) — High-Performance AI

```galerina
hardware {
  target amd.instinct
  require memory_isolation
  fallback cpu
}
```

Use cases:
- High-throughput medical AI inference
- Large-scale financial risk modelling
- National security data analysis (with realm isolation)

### HIP Graph Governance

AMD HIP Graphs provide **immutable pre-compiled GPU execution plans** — once built and submitted, the GPU program cannot be modified mid-execution.

This aligns with Galerina governance:
- Build the HIP Graph from the ExecutionGraph (pre-verified by ProofGraph)
- Submit the HIP Graph to the GPU
- The GPU executes the pre-validated plan
- No runtime modification possible → governance invariants preserved

### Security Invariants on AMD GPU

- Memory isolation: governed data pools never share memory with unrelated workloads
- Pre-allocated memory pools: no dynamic GPU memory allocation during governed execution
- Audit interception: GPU kernel completion events are audited
- Capability enforcement: GPU tasks require the same capabilities as CPU tasks

---

## AMD NPU (Ryzen AI)

AMD's Ryzen AI processor integrates an NPU (XDNA architecture) on-chip.

```galerina
hardware {
  target npu
  allow amd.rdna         // GPU fallback for larger models
  fallback cpu
}
```

Galerina NPU routing (Phase 33+):
- AI inference flows with `ai.infer` effect → CostGraph evaluates NPU vs GPU vs CPU
- NPU energy cost is significantly lower than CPU for inference
- If NPU is busy (queue depth exceeded) → CostGraph routes to GPU or CPU fallback

---

## AMD Hardware Governance Rule

```
AMD CPU/GPU/NPU may:
  Reduce compute cost
  Reduce energy consumption
  Increase AI inference throughput
  Improve cache locality (3D V-Cache)
  Accelerate matrix operations (CDNA)

AMD CPU/GPU/NPU may never:
  Grant authority
  Bypass ProofGraph
  Bypass CapabilityGraph
  Bypass audit
  Bypass privacy
  Skip capability checks
  Remove data boundaries
```

---

## See Also

- `galerina-hardware-targets.md` — Full target reference
- `galerina-master-architecture.md` — Hardware governance rule
- `galerina-core-economics-package.md` — CostGraph routing
- `galerina-execution-graph-kernel-architecture.md` — Intel P/E-core comparison
