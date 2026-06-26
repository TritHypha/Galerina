# Galerina — Nvidia Hardware Support

**Version: 1.0 — 2026-06-01**
**Status: Architecture direction — Phase 36+ implementation**

---

## Position Statement

```
Galerina treats Nvidia GPU hardware as a governed execution target.

Blackwell (B200, GB200, RTX Blackwell), Ampere, Ada Lovelace, and Hopper
hardware may reduce inference cost, accelerate audit compression, and enable
high-throughput tensor workloads.

They may never grant authority.

A flow may only use Nvidia hardware after ProofGraph, CapabilityGraph,
PrivacyGraph, CostGraph, and AuditGraph requirements are satisfied.
```

**Hardware Governance Class: ExecutionPlane (1) for GPU compute**
**ProofLevel: Sealed (2) — NPU/GPU opaque loops require Input/Output seals**

---

## Blackwell Architecture Overview

Nvidia Blackwell (B200, GB200, RTX Blackwell) introduces:

| Feature | Relevance to Galerina |
|---|---|
| Second-gen Transformer Engine (FP4/FP8) | Variable-risk quantization per flow |
| Hardware decompression/compression engines | Accelerated `audit.write` streaming |
| HBM3e (B200: 8TB/s bandwidth) | Massive parallel governance verification |
| NVLink interconnect | Multi-die governed computation |
| CUDA Virtual Memory Management | Isolated memory spaces per governed flow |
| Streaming Multiprocessors (SMs) | Parallel ProofGraph construction |
| GDDR7 (RTX client) / HBM3e (B200 enterprise) | Cost routing by memory bandwidth |

---

## Nvidia Target IDs

| Target ID | Hardware | Use Case |
|---|---|---|
| `nvidia` | Generic Nvidia GPU | Any Nvidia target |
| `nvidia.blackwell` | RTX 5090/5080, B200 | Current-gen governed compute |
| `nvidia.blackwell.rtx` | Client RTX Blackwell (GDDR7) | Local vector streams, PII masking |
| `nvidia.blackwell.b200` | Data-centre B200/GB200 (HBM3e) | Large-scale risk modelling, FP4 |
| `nvidia.hopper` | H100/H200 (HBM3) | Previous-gen enterprise AI |
| `nvidia.ada` | RTX 4090/4080 (Ada Lovelace) | Consumer-grade governed GPU |
| `nvidia.ampere` | A100/RTX 3090 | Previous enterprise baseline |

---

## CostGraph: Nvidia Hardware Detection

```typescript
interface NvidiaHardwareProfile {
  readonly tier:            NvidiaComputeTier;
  readonly smCount:         number;          // Streaming Multiprocessors
  readonly vramGBytes:      number;          // VRAM (GDDR7 or HBM3e)
  readonly hbmBandwidthTBs: number | null;   // HBM bandwidth (null for GDDR7)
  readonly hasFP4:          boolean;         // Blackwell Transformer Engine FP4
  readonly hasFP8:          boolean;         // Hopper+ FP8 support
  readonly hasDecompEngine: boolean;         // Blackwell hardware decompression
  readonly hasNVLink:       boolean;         // Multi-die NVLink fabric
}

export const enum NvidiaComputeTier {
  WasmFallback    = 0,  // Nvidia not available
  BlackwellRTX    = 1,  // Client GDDR7 (RTX 5090 etc.)
  BlackwellB200   = 2,  // Data-centre HBM3e (B200/GB200)
  HopperH100      = 3,  // Enterprise previous-gen
  AdaLovelace     = 4,  // Consumer Ada
}
```

On i5 (no Nvidia): `tier = WasmFallback`
On workstation RTX 4090: `tier = AdaLovelace`
On B200 cluster: `tier = BlackwellB200`, `hasFP4 = true`, `hasDecompEngine = true`

---

## Variable-Risk Quantization (Blackwell FP4/FP8)

The Blackwell Transformer Engine can dynamically scale precision:

```
FP4  → maximum throughput, minimal energy, accepts rounding error
FP8  → high throughput, small rounding error
FP16 → standard ML precision
FP32 → full precision, zero compliance drift
```

**The Galerina Rule: ValueGraph governs precision, not hardware.**

```galerina
contract {
  value {
    classification medical          // high-risk: FP32 locked
    estimated_loss_per_incident 5000000
  }
  hardware {
    target nvidia.blackwell.b200
    require precision_fp32          // override Transformer Engine auto-scaling
    fallback cpu
  }
}
```

```galerina
contract {
  value {
    classification internal         // low-risk: FP4 permitted
  }
  hardware {
    target nvidia.blackwell.b200
    allow precision_fp4             // Transformer Engine may compress
  }
}
```

**Implementation:**
```
ValueGraph.riskLevel(classification) → HIGH
    → CostGraph.precisionManeuver = Sovereign_FP32
    → ExecutionGraph locks Transformer Engine to FP32

ValueGraph.riskLevel(classification) → LOW
    → CostGraph.precisionManeuver = Engine_FP4
    → ExecutionGraph permits FP4 compression
```

The compiler enforces: `safety_critical` and `medical` classifications CANNOT use FP4/FP8 — the governance verifier emits `SPORE-HW-004` if `allow precision_fp4` appears on a high-risk flow.

---

## Hardware Decompression Engine for Audit Streaming

Blackwell's on-chip hardware decompression engine can compress audit streams at **tens of GB/s** — far faster than CPU-side audit compression.

```galerina
contract {
  effects { audit.write }
  hardware {
    target nvidia.blackwell
    allow nvidia.decompression_engine   // offload audit compression to hardware
    require audit_seal_before_compress  // Input seal computed before GPU compression
    fallback cpu
  }
}
```

**Governance invariant preserved:**
1. CPU computes `inputSeal = hash(audit_record)` before sending to GPU
2. GPU hardware compresses the audit record
3. CPU computes `outputSeal = hash(compressed_record)` after return
4. Both seals recorded in AuditGraph

The hardware cannot modify the audit record's content — only compress it. The seal chain proves fidelity.

---

## CUDA Virtual Memory Isolation (CPU-Sovereign Pattern)

The most critical Blackwell security feature for Galerina: **CUDA Virtual Memory Management** (`cuMemAddressReserve`).

```
GovernancePlane structures (CPU private):
  ProofGraph
  CapabilityGraph
  Runtime Policy
  Lease Cache

CUDA Virtual Memory Pool (GPU-accessible):
  SealedInputBuffer   ← CPU writes, GPU reads
  OutputBuffer        ← GPU writes, CPU reads
  ScratchSpace        ← GPU-private working memory

BLOCKED from GPU:
  GovernancePlane memory region (cuMemCreate with restricted access)
```

No CUDA kernel can access governance structures. The GPU receives only sealed input buffers — it cannot browse adjacent host memory.

---

## Contract Syntax

```galerina
secure flow trainRiskModel(readonly dataset: Protected<Dataset>)
-> Result<RiskModel, TrainingError>

contract {
  intent {
    "Train risk model on Nvidia Blackwell with FP32 locked for financial compliance."
  }

  effects {
    ai.infer
    audit.write
  }

  value {
    classification financial
    domain finance
    regulatory_exposure high
    estimated_loss_per_incident 10000000
  }

  hardware {
    target nvidia.blackwell.b200
    require precision_fp32
    require cuda_virtual_memory_isolation
    allow nvidia.decompression_engine
    require audit_seal_before_compress
    fallback cpu
  }

  ai {
    approved_models { risk_model_v5 }
    max_model_calls 1
    require audit_interlock
  }

  audit {
    require proof_graph
    require runtime_attestation
    require hardware_target_trace
    require precision_trace
  }
}
```

---

## Silicon Ecosystem Matrix (Complete)

| Target | Architecture | Guard | Best For |
|---|---|---|---|
| `intel` | x86 P/E-core | Intel Thread Director | Local governance compilation |
| `amd.zen5` | x86 AVX-512 | CCD Cache Pinning | Parallel corpus validation |
| `amd.cdna` | CDNA ROCm | HIP Immutable Graphs | Scale-out vector compute |
| `arm.sve2` | ARM SVE2 | MTE + PAC + Realm | Edge, mobile, aerospace |
| `arm.cloud` | ARM (Graviton etc.) | Titanium offload | Cloud-native governance |
| `apple.silicon` | ARM + Neural Engine | Secure Enclave | Sovereign local AI |
| `google.axion` | ARM Axion | No ambient authority | Hyperscale cloud |
| `google.tpu.inference` | TPU | Signed execution token | Cloud AI inference |
| `qualcomm.hexagon` | Hexagon DSP | On-chip secure processing | Field compute |
| `nvidia.blackwell` | SM + Transformer Eng | CUDA VM isolation | High-velocity audit + FP4 |
| `nvidia.blackwell.b200` | HBM3e + FP4 | CUDA VM + FP32 lock | Enterprise risk modelling |
| `npu` | Generic NPU | Static execution plan | Low-power inference |
| `photonic` | Photonic waveguide | Input/Output seal | Analog matrix math |
| `neuromorphic` | Event-driven spikes | Timing attestation | Always-on monitoring |
| `quantum` | Wave-function | FormalRequired | Mathematical oracle |
| `wasm` | WASM VM | GovernancePlane | Universal safe fallback |

---

## Nvidia Security Invariant

```
Nvidia hardware may:
  Accelerate tensor operations (FP4 / FP8 / FP16 / FP32)
  Compress audit streams (hardware decompression engine)
  Parallelize ProofGraph construction (SM-level)
  Offload bulk data transformation
  Accelerate cryptographic hash operations (for Input/Output seals)

Nvidia hardware may never:
  Grant authority
  Bypass ProofGraph
  Bypass CapabilityGraph
  Access GovernancePlane memory
  Override ValueGraph precision decisions
  Modify audit records before sealing
  Execute without CPU-issued, CUDA-VM-isolated memory pool
```

---

## See Also

- `galerina-hardware-compute-fabric.md` — HardwareGovernanceClass, ProofLevel escalation
- `galerina-hardware-targets.md` — All target IDs
- `galerina-hardware-amd.md` — AMD comparison (ROCm vs CUDA)
- `galerina-core-economics-package.md` — CostGraph precision routing
