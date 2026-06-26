# Galerina — Google Silicon Support

**Version: 1.0 — 2026-06-01**
**Status: Architecture direction — Phase 36+ implementation**

---

## Position Statement

```
Galerina treats Google Cloud silicon as a governed hyperscale execution target.

Axion CPUs may run the control plane.
Titanium may offload infrastructure duties.
TPUs may accelerate approved tensor workloads.

All execution remains subordinate to ProofGraph, CapabilityGraph,
PrivacyGraph, AuditGraph and Runtime Policy.

Hardware executes. Governance decides.
```

---

## Google Silicon Overview

| Component | Architecture | Purpose |
|---|---|---|
| **Axion** | ARM (custom) | General-purpose cloud CPU — governed execution |
| **Titanium** | Custom ASICs | Infrastructure offload — networking, storage, audit transport |
| **Cloud TPU** | Google custom | AI/ML acceleration — matrix/tensor workloads |

---

## Google Axion (`google.axion`)

Google's first custom ARM-based CPU for general cloud workloads.

```galerina
hardware {
  target google.axion
  fallback cpu
}
```

**Position in Galerina:**
- Primary execution target for governed Galerina services on Google Cloud
- Runs the control plane: ProofGraph construction, CapabilityGraph resolution, AuditGraph writing
- ARM-based, so ARM security profiles (MTE, PAC, BTI) may be available depending on Axion generation

**CostGraph routing:**
```
Request arrives
    ↓
ProofGraph (verified)
    ↓
CostGraph: Axion available and cost within budget?
    ├── Yes → google.axion (ARM-optimised execution)
    └── No  → cpu (generic fallback)
```

**Galerina benefit over commodity x86:**
- Lower cost-per-request (ARM efficiency at Google Cloud pricing)
- Lower energy per governed request
- SVE2-capable (future Axion generations) → ProofGraph construction faster

---

## Google Titanium (`google.titanium`)

Google Titanium is a custom ASIC that offloads infrastructure work from host CPUs.

Titanium handles:
- Networking I/O (packet processing, TLS termination)
- Storage I/O (NVMe, distributed block storage)
- Security operations (encryption, decryption)
- Audit/log transport

### Titanium Network Offload (`google.titanium.network`)

```galerina
hardware {
  allow google.titanium.network
}
```

Use in Galerina:
- HTTP/2 connection handling offloaded to Titanium
- TLS termination before governed request processing
- Reduces Axion CPU load for governance computation

### Titanium Audit Offload (`google.titanium.audit`)

```galerina
hardware {
  allow google.titanium.audit
}
```

**This is uniquely valuable for Galerina:**

Audit writes (`audit.write`) are required by governance but are I/O-bound, not compute-bound. Offloading audit transport to Titanium means:
- Axion CPU stays focused on governance computation
- Audit latency is reduced (Titanium dedicated I/O path)
- Audit throughput increases (no CPU contention)
- The governance requirement (`audit.write`) is still fully satisfied

**Security invariant:** Titanium may handle transport of audit records. It may not suppress, modify, or delay audit records. The ProofGraph records the audit offload in the hardware_target_trace.

---

## Google Cloud TPU (`google.tpu.*`)

Google's custom AI accelerator family, designed for matrix and tensor workloads.

### TPU Inference (`google.tpu.inference`)

```galerina
hardware {
  target google.axion
  allow google.tpu.inference
  require signed_execution_token
  fallback cpu
}
```

Use in Galerina:
- AI inference under `ai.infer` effect
- Model execution within `ai.approved_models` governance
- `ai.max_model_calls` and `ai.max_token_cost` constraints enforced before TPU dispatch

**Execution model:**
```
ai.infer effect declared
    ↓
ProofGraph verifies: approved_models, max_model_calls, privacy boundary
    ↓
CostGraph: TPU available and within ai.max_token_cost budget?
    ├── Yes → google.tpu.inference
    └── No  → google.axion (CPU inference) or deny
```

### TPU Training (`google.tpu.training`)

```galerina
hardware {
  allow google.tpu.training
  require data_boundary_trace
}
```

For large-scale model training within governed contracts. Every training run must have:
- `data_boundary_trace` — record what data was used in training
- Lineage tracking — data origin and retention
- AI governance constraints

### TPU Cluster (`google.tpu.cluster`)

```galerina
hardware {
  allow google.tpu.cluster
  require realm_isolation
}
```

For distributed tensor workloads across multiple TPU pods. Realm isolation ensures that workloads from different tenants cannot access each other's data.

---

## Full Medical AI Example

```galerina
secure flow runMedicalRiskInference(
  readonly patientBatch: Protected<PatientBatch>
) -> Result<RiskReport, InferenceError>

contract {
  intent {
    "Run governed medical risk inference on Google Cloud silicon
     without exposing raw patient data."
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
    estimated_loss_per_incident 5000000
  }

  privacy {
    pii { patientId dob diagnosis }
    require redaction before audit.write
    require protected_boundary before ai.infer
  }

  hardware {
    target google.axion
    allow google.tpu.inference
    allow google.titanium.audit
    require host_control_plane wasm
    require signed_execution_token
    require deterministic_fallback cpu
    require no_ambient_cloud_authority
    fallback cpu
  }

  ai {
    approved_models { medical_risk_model_v3 }
    max_model_calls 1
    max_token_cost £0.00            // local cloud inference, no external cost
    require local_cloud_region
  }

  economics {
    target_cost < £0.01
    preferred_execution google.tpu.inference
    fallback_execution google.axion
  }

  audit {
    require proof_graph
    require runtime_attestation
    require hardware_target_trace
    require data_boundary_trace
    require actor
    require trace_id
  }
}
{
  let validated    = validate.patientBatch(patientBatch)?
  let protected    = privacy.boundary(validated)?
  let result       = TPU.infer(protected)?

  AuditLog.write({
    event: "MedicalRiskInferenceCompleted",
    target: "google.tpu.inference",
    inputHash: hash(protected),
    resultHash: hash(result),
    modelVersion: "medical_risk_model_v3",
    region: "europe-west2"
  })

  return Ok(RiskReport.from(result))
}
```

This flow:
1. Requires patient data to be redacted before writing to audit
2. Requires a protected privacy boundary before AI inference
3. Routes execution to Google Axion (ARM) for control plane
4. Uses Google TPU for AI inference (governed by `ai.approved_models`)
5. Offloads audit transport to Titanium (keeps Axion CPU available for governance)
6. Falls back to CPU if TPU is unavailable
7. Records full hardware trace in audit
8. `no_ambient_cloud_authority` — Google Cloud IAM cannot override Galerina governance

---

## Google Silicon Target Classes

| Target | Stage | Description |
|---|---|---|
| `google.axion` | Phase 36 | ARM cloud CPU — governed execution plane |
| `google.titanium.network` | Phase 36 | Network offload |
| `google.titanium.audit` | Phase 36 | Audit transport offload |
| `google.tpu.inference` | Phase 37 | AI inference |
| `google.tpu.training` | Phase 44 | Model training |
| `google.tpu.cluster` | Phase 44 | Distributed tensor |
| `google.tensor.edge` | Phase 48+ | Edge Google Tensor |

---

## Security Invariant

```
Google silicon may:
  Reduce infrastructure cost
  Reduce AI inference cost
  Improve energy efficiency
  Accelerate tensor workloads
  Offload audit/log transport

Google silicon may never:
  Bypass ProofGraph
  Bypass CapabilityGraph
  Bypass privacy boundaries
  Bypass audit requirements
  Read ambient Google Cloud IAM state
  Silently move data across regions
  Grant cloud authority
  Override runtime policy
```

The key principle: `no_ambient_cloud_authority`. Google Cloud's identity and access management (IAM) does not grant authority to Galerina flows. Authority must still come through Galerina's `CapabilityGraph` and `ProofGraph`.

---

## See Also

- `galerina-hardware-targets.md` — Full target reference
- `galerina-hardware-arm.md` — ARM architecture (Axion is ARM-based)
- `galerina-master-architecture.md` — Hardware governance rule
- `galerina-core-economics-package.md` — CostGraph routing to cloud targets
- `examples/healthcare/runMedicalRiskInference.spore` — Full medical AI example
