# Galerina — Hardware Targets Reference

**Version: 1.0 — 2026-06-01**
**Status: Canonical hardware target definitions**

---

## The Hardware Governance Rule

```
Hardware executes.
Governance decides.
Proof verifies.
Audit records.
```

This rule applies without exception to every hardware target in this document.

---

## contract.hardware Syntax

```galerina
contract {
  hardware {
    target <target-id>              // primary execution target
    allow  <target-id>              // permitted accelerator
    deny   <target-id>              // explicitly prohibited
    require <security-feature>      // mandatory hardware security feature
    fallback <target-id>            // safe fallback when primary unavailable
  }
}
```

The `hardware` block is a **hint and constraint declaration**.

- `target`: the CostGraph preferred routing target
- `allow`: permitted accelerator for specific workloads
- `deny`: explicitly excluded (e.g., `deny cloud_gpu` for sovereign compute)
- `require`: mandatory hardware security feature — if unavailable, flow must not execute on that target
- `fallback`: CostGraph routes here when primary target is unavailable

---

## Target Identifier Reference

### WASM Targets (universal baseline)

| Target ID | Description |
|---|---|
| `wasm` | Generic WASM — portable, governed, works everywhere |
| `wasm.simd128` | WASM SIMD 128-bit — available on all modern platforms |
| `wasm.wasi` | WASM System Interface — standalone execution outside browser |

### Intel x86 Targets

| Target ID | Description |
|---|---|
| `intel` | Generic x86-64 — any Intel CPU |
| `intel.avx2` | AVX2 256-bit SIMD — i5+, Core Gen 4+ |
| `intel.avx512` | AVX-512 512-bit — Core i9 HX/K, Xeon |
| `intel.pcore` | Performance cores (P-cores) — Core 12th Gen hybrid+ |
| `intel.ecore` | Efficient cores (E-cores) — audit/lineage background work |

### AMD CPU Targets

| Target ID | Description |
|---|---|
| `amd` | Generic AMD x86-64 |
| `amd.zen4` | Zen 4 — AVX-512, 3D V-Cache option |
| `amd.zen5` | Zen 5 — native 512-bit, improved AVX-512 throughput |
| `amd.epyc` | EPYC server — high core density, CCD locality |
| `amd.vcache` | 3D V-Cache — ProofGraph cache-heavy workloads |

### AMD GPU Targets

| Target ID | Description |
|---|---|
| `amd.rdna` | RDNA — general GPU compute, graphics workloads |
| `amd.cdna` | CDNA — data centre AI/ML, matrix math |
| `amd.instinct` | Instinct MI series — high-performance AI inference |
| `amd.rocm` | ROCm runtime — any AMD GPU via ROCm |
| `amd.hip` | HIP Graphs — pre-validated immutable GPU execution plans |

### ARM Targets

| Target ID | Description |
|---|---|
| `arm` | Generic ARM — any ARMv8+ |
| `arm.neon` | NEON SIMD — universal ARM, parsing/hashing/validation |
| `arm.sve2` | SVE2 — vector-length-agnostic, scales to future ARM |
| `arm.sme2` | SME2 — streaming matrix engine, AI/tensor workloads |
| `arm.cloud` | Graviton / Azure ARM / Ampere — cloud ARM execution |
| `arm.edge` | Edge ARM — constrained devices, IoT, embedded |

### ARM Security Features (use with `require`)

| Feature ID | Description |
|---|---|
| `mte` | Memory Tagging Extension — hardware memory boundary enforcement |
| `pac` | Pointer Authentication — cryptographic pointer integrity |
| `bti` | Branch Target Identification — control flow integrity |
| `realm_isolation` | Realm Management Extension — hardware-isolated execution zones |

### Google Silicon Targets

| Target ID | Description |
|---|---|
| `google.axion` | Axion — Google's custom ARM cloud CPU (Graviton-class) |
| `google.titanium` | Titanium — infrastructure offload (networking, storage, security) |
| `google.titanium.network` | Titanium network offload |
| `google.titanium.audit` | Titanium audit/log transport offload |
| `google.tpu.inference` | Cloud TPU — low-latency AI inference |
| `google.tpu.training` | Cloud TPU — large-scale model training |
| `google.tpu.cluster` | TPU cluster — distributed tensor workloads |

### Specialised / Future Targets

| Target ID | Description |
|---|---|
| `npu` | Generic NPU — neural processing unit (Intel, Ryzen AI, etc.) |
| `apu` | APU shared memory — CPU+GPU shared memory, zero transfer cost |
| `photonic` | Photonic compute — optical interconnect (Tri, future) |
| `cpu` | Generic CPU — safe fallback for any x86 or ARM |

---

## Security Feature Requirements

When a `require` security feature is specified, the CostGraph:
1. Checks if the feature is available on the target platform
2. If **available** → routes to that target as planned
3. If **unavailable** → falls back to the `fallback` target
4. If no fallback specified → routes to WASM or CPU

This means a flow can **require** MTE on ARM but still run correctly on x86 (falling back to CPU-level bounds checking). Governance is not weakened — the safety guarantee is achieved through a different mechanism.

---

## Hardware Routing Invariant

```
The ProofGraph and GovernanceGraph are positioned entirely UPSTREAM of the
ExecutionGraph and CostGraph.

It is therefore physically impossible for a hardware routing decision
to bypass a data privacy barrier, an audit requirement, or a capability check.

Hardware routes WITHIN already-approved governance boundaries.
Hardware never CREATES governance boundaries.
```

---

## Examples

### ARM SVE2 with Security Requirements (Aerospace)

```galerina
contract {
  value { classification safety_critical domain aerospace }
  hardware {
    target arm.sve2
    require mte
    require pac
    require realm_isolation
    fallback cpu
  }
  safety { require deterministic_execution require bounded_runtime }
}
```

### AMD GPU for AI Inference (Medical)

```galerina
contract {
  value { classification medical domain healthcare }
  hardware {
    target amd.cdna
    allow amd.instinct
    require mte
    fallback cpu
    deny cloud_gpu         // no external GPU for medical data
  }
  ai { approved_models { medical_risk_v3 } max_model_calls 1 }
}
```

### Google TPU for Risk Inference (Cloud)

```galerina
contract {
  hardware {
    target google.axion
    allow google.tpu.inference
    allow google.titanium.audit
    require host_control_plane wasm
    require deterministic_fallback cpu
    fallback cpu
  }
}
```

### Intel i9 for ProofGraph Construction

```galerina
contract {
  hardware {
    target intel.avx512
    allow intel.pcore
    fallback intel.avx2
  }
}
```

---

## See Also

- `galerina-master-architecture.md` — The hardware governance rule
- `galerina-hardware-amd.md` — AMD CPU/GPU detail
- `galerina-hardware-arm.md` — ARM governance profiles
- `galerina-hardware-google.md` — Google silicon
- `galerina-execution-graph-kernel-architecture.md` — Intel P/E-core mapping
- `galerina-core-economics-package.md` — CostGraph hardware routing
