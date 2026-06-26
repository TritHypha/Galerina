# Galerina — Apple Silicon Support

**Version: 1.0 — 2026-06-01**
**Status: Architecture direction — Phase 36+ implementation**

---

## Position Statement

```
Galerina treats Apple Silicon as a governed local execution target.

Apple M-Series and A-Series chips may reduce latency, reduce power use,
improve local AI performance, protect cryptographic material through
Secure Enclave-backed operations, and avoid unnecessary cloud execution.

They may never grant authority.

A flow may only use Apple Silicon acceleration after ProofGraph,
CapabilityGraph, PrivacyGraph, SafetyGraph, CostGraph and AuditGraph
requirements have already been satisfied.
```

---

## Why Apple Silicon Matters to Galerina

Apple Silicon combines in a single package:
- High-performance CPU cores (P-cores + E-cores, ARM-based)
- GPU with Metal compute
- Neural Engine (matrix/AI acceleration)
- Secure Enclave (hardware-protected cryptographic operations)
- Unified Memory (zero-copy data movement)
- Low-power architecture

This maps directly to Galerina's governance model:
- **CPU → GovernancePlane** (always holds ProofGraph and CapabilityGraph)
- **Neural Engine → ExecutionPlane** (receives sealed, pre-validated inference requests)
- **Secure Enclave → GovernanceSignature** (hardware-backed proof certificates)
- **Unified Memory → APU-style zero-copy dispatch** (CPU seals → Neural Engine reads)
- **Low power → always-on governance** (continuous audit monitoring at minimal cost)

The key market alignment:
```
Healthcare    Government    Defence    Aerospace
```
All require: **device-local computation, no cloud dependency, data sovereignty**.

Apple Silicon delivers **sovereign compute** — high performance without the data leaving the device.

---

## Apple Silicon Components

### CPU (ARM-based)

The CPU always runs the **GovernancePlane**:
- ProofGraph construction
- CapabilityGraph resolution
- AuditGraph writes
- Runtime policy enforcement

The CPU hands off **sealed, pre-validated** work to GPU/Neural Engine.

M4 CPU: ~10 P-cores + 4 E-cores. P-cores for governance-critical paths, E-cores for audit/lineage background work — mirroring the Intel P/E-core governance model.

### Neural Engine (`apple.neural_engine`)

Apple's M4 Neural Engine: 38 trillion operations per second.

In Galerina terms: **Class 1 ExecutionPlane** — receives pre-approved inference requests, returns deterministic results.

```
Input validated by CPU
    ↓
Input seal computed (hash)
    ↓
Neural Engine executes inference
    ↓
Output received by CPU
    ↓
Output seal computed (hash)
    ↓
AuditGraph records { inputSeal, outputSeal, target: "apple.neural_engine" }
```

### Secure Enclave (`apple.secure_enclave`)

Apple's dedicated security chip — separate from the application processor.

In Galerina terms: the Secure Enclave is the **hardware backing for GovernanceSignature**.

```typescript
// GovernanceSignature backed by Apple Secure Enclave:
interface SecureEnclaveBackedSignature {
  readonly algorithm: "lln.gov.sig.v1";
  readonly signerKeyId: string;
  readonly signature: string;          // signed inside Secure Enclave
  readonly attestation: string;        // hardware attestation from Secure Enclave
  readonly keyNeverLeftEnclave: true;  // key material never exported
}
```

The Secure Enclave:
- Generates the ProofGraph signing key (never exported)
- Signs ProofGraphs inside the enclave (key material inaccessible to software)
- Provides hardware attestation that signatures came from a specific device

**What this enables:** A ProofGraph signed by Apple Secure Enclave can be **verified offline** and provides hardware-level assurance that the governance compiler ran on a trusted device.

Note: **Secure Enclave is never used for general computation.** It exists only for cryptographic operations in support of GovernanceSignature. It is not a compute accelerator.

### GPU / Metal (`apple.gpu.metal`)

Metal compute for parallel workloads.

In Galerina terms: **Class 1 ExecutionPlane** — deterministic, fully observable GPU compute.

Use cases:
- Large-scale data validation (vector operations)
- Bulk redaction of PII fields
- Parallel signature verification
- Analytics workloads

### Unified Memory (`apple.unified_memory`)

Apple Silicon's unified memory architecture means CPU and Neural Engine share the same physical memory — no data copying needed for inference dispatch.

**Galerina APU pattern on Apple Silicon:**
```
CPU seals input buffer (hash, governance record)
Neural Engine reads from same memory
Neural Engine writes results to same memory
CPU reads results, validates, records output seal
```

Zero-copy dispatch dramatically reduces the energy cost of the Input Seal pattern. The seal computation (SHA-256 of input buffer) replaces what would otherwise be an expensive copy operation.

Memory bandwidth: M4 Max — 500+ GB/s. This means governance overhead (hashing, sealing) is memory-bandwidth-limited, not compute-limited — extremely fast.

---

## Apple Hardware Target IDs

| Target ID | Description |
|---|---|
| `apple.silicon` | Generic Apple Silicon (any M/A series) |
| `apple.cpu.arm64` | CPU execution (ARM64, governance-capable) |
| `apple.gpu.metal` | GPU via Metal compute |
| `apple.neural_engine` | Neural Engine for AI inference |
| `apple.secure_enclave` | Hardware-backed cryptographic operations |
| `apple.unified_memory` | Zero-copy unified memory execution |
| `apple.m_series` | M-Series Mac/iPad (high-performance local governance) |
| `apple.a_series` | A-Series iPhone/iPad (mobile governance) |
| `apple.edge.ai` | Offline sovereign AI (no cloud, local model) |

---

## Apple Security Features (use with `require`)

| Feature | Description |
|---|---|
| `no_cloud_fallback_without_policy` | Never silently fall back to cloud execution |
| `attested_provider` | Secure Enclave attestation required |
| `secure_key_boundary` | Signing keys never leave Secure Enclave |
| `no_ambient_device_authority` | Device identity does not grant Galerina authority |
| `offline_execution` | No network dependency (sovereign compute) |

---

## Example: Private Medical Note Classification

```galerina
secure flow classifyPrivateMedicalNote(
  readonly note: Protected<MedicalNote>
) -> Result<ClinicalTagReport, ClinicalInferenceError>

contract {
  intent {
    "Classify medical note privately on-device using Apple Neural Engine without sending data to cloud."
  }

  effects {
    medical.read
    ai.infer
    audit.write
  }

  value {
    classification medical
    domain healthcare
    regulatory_exposure extreme
  }

  privacy {
    pii { patientId dateOfBirth diagnosis }
    require protected_boundary before ai.infer
    require redaction before audit.write
    require local_execution
  }

  hardware {
    target apple.silicon
    allow apple.cpu.arm64
    allow apple.neural_engine
    allow apple.secure_enclave
    require no_cloud_fallback_without_policy
    require deterministic_fallback wasm
    require no_ambient_device_authority
    require attested_provider
    require secure_key_boundary
    fallback wasm
  }

  ai {
    approved_models { local_clinical_tagger_v1 }
    max_model_calls 1
    max_token_cost GBP0.00
    require offline_execution
  }

  economics {
    target_cost < GBP0.0001
    max_energy_budget 5mj
    preferred_execution apple.neural_engine
    fallback_execution wasm.simd
  }

  audit {
    require proof_graph
    require runtime_attestation
    require hardware_target_trace
    require data_boundary_trace
  }
}
{
  let validated    = validate.medicalNote(note)?
  let protected    = privacy.boundary(validated)?
  let tags         = AppleNeuralEngine.infer(protected)?

  AuditLog.write({
    event: "PrivateMedicalNoteClassified",
    target: "apple.neural_engine",
    inputHash: hash(protected),
    resultHash: hash(tags),
    cloudUsed: false
  })

  return Ok(ClinicalTagReport.from(tags))
}
```

---

## Apple Silicon Security Invariant

```
Apple Silicon may:
  Reduce power consumption
  Enable offline AI (no cloud dependency)
  Improve local inference throughput
  Protect cryptographic keys (Secure Enclave)
  Reduce data movement (unified memory)
  Improve energy-per-proof and energy-per-audit

Apple Silicon may never:
  Grant authority
  Bypass ProofGraph
  Bypass CapabilityGraph
  Bypass PrivacyGraph
  Bypass SafetyGraph
  Bypass AuditGraph
  Silently fall back to cloud execution
  Expose protected data to ambient device applications
  Use Secure Enclave for general compute
```

---

## The Sovereign Compute Advantage

Apple Silicon's combination of high performance + offline capability + Secure Enclave creates a governance use case that cloud silicon cannot match:

```
Healthcare: patient data classified on-device, never sent to cloud
Government: classified document processing with hardware attestation
Aerospace:  disconnected flight system, no network dependency
Defence:    SCIF-compatible local AI inference
```

Galerina running on Apple Silicon + Secure Enclave provides:
- GovernanceSignature hardware-backed (not software-only)
- Offline ProofGraph construction (no network for proof verification)
- Sovereign AI (Neural Engine, no cloud API call)
- Zero-copy data dispatch (unified memory, minimal exposure surface)

---

## See Also

- `galerina-hardware-compute-fabric.md` — HardwareGovernanceClass, Input Seal
- `galerina-hardware-arm.md` — ARM architecture (Apple Silicon is ARM-based)
- `galerina-hardware-google.md` — Google Axion (also ARM-based, cloud comparison)
- `galerina-hardware-npu-apu.md` — NPU/APU governance patterns
- `galerina-governance-signature.md` — GovernanceSignature (Secure Enclave backing)
- `examples/healthcare/classifyPrivateMedicalNote.spore` — Full example
