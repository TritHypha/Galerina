# Galerina — ARM Hardware Support

**Version: 1.0 — 2026-06-01**
**Status: Architecture direction — Phase 33+ implementation**

---

## Position Statement

```
Galerina treats ARM as a first-class Governance Execution Target.

ARM hardware is used to reduce energy cost, increase throughput,
improve memory safety, and strengthen isolation.

ARM hardware never grants authority.

A flow must satisfy all governance, capability, privacy, audit, safety,
and runtime policy requirements before ARM acceleration is considered.

ARM improves execution. Governance determines execution.
```

---

## Why ARM Matters to Galerina

AMD and Intel optimise for raw throughput and high-performance compute.

ARM optimises for:
- Energy efficiency
- Predictable execution
- Memory isolation
- Edge computing
- Large-scale cloud density

These characteristics map directly to Galerina's target markets:
```
Healthcare      Government      Defence
Aerospace       Edge AI         IoT
Critical Infrastructure         National Security
```

ARM's security extensions (MTE, PAC, BTI, Realm) align with Galerina's governance model in ways that x86 cannot match. ARM hardware can **enforce** governance constraints at the silicon level, not just in software.

---

## ARM CPU Profiles

### ARM Neon (`arm.neon`)

```galerina
hardware {
  target arm.neon
}
```

**Purpose:** General-purpose vector processing — the lowest common denominator.

Available on virtually all modern ARM CPUs (ARMv7+).

Best for:
- Validation pipelines
- JSON/binary parsing
- Hashing
- String operations
- Compiler workloads

This is the safe, universal baseline for ARM-deployed Galerina services.

### ARM SVE2 (`arm.sve2`)

```galerina
hardware {
  target arm.sve2
}
```

**Purpose:** Scalable Vector Extension 2 — vector-length-agnostic execution.

**The key advantage:** SVE2 code scales automatically across future ARM hardware without recompilation. A Galerina binary compiled for SVE2 will use 128-bit on Cortex-A78, 256-bit on future Graviton, 512-bit on future datacenter ARM — the same binary, better performance on newer silicon.

Best for:
- Governed analytics pipelines
- Large validation pipelines
- Cryptographic verification (GovernanceSignature generation)
- ExecutionGraph traversal
- ProofGraph construction

### ARM SME2 (`arm.sme2`)

```galerina
hardware {
  target arm.sme2
}
```

**Purpose:** Streaming Matrix Engine 2 — matrix/tensor acceleration.

This is the ARM equivalent of:
- AMD XDNA / Matrix Cores
- Intel AMX
- GPU tensor engines

Best for:
- AI inference under `ai.infer` effect
- Tensor operations for risk modelling
- Large-scale analytics
- Mission planning calculations

Under Galerina governance: AI inference using SME2 is subject to the same `ai.approved_models`, `ai.max_token_cost`, and `ai.max_model_calls` constraints as cloud AI — the hardware target does not weaken AI governance.

### ARM Cloud (`arm.cloud`)

```galerina
hardware {
  target arm.cloud
}
```

Maps to:
- AWS Graviton (3, 4+)
- Microsoft Azure Cobalt ARM
- Ampere Altra / AmpereOne
- Future ARM datacenter silicon

Galerina can optimise for cost-per-request, cost-per-proof, cost-per-audit, cost-per-AI-inference rather than maximum CPU speed — which aligns directly with cloud economics and the CostGraph architecture.

---

## ARM Security Profiles

This is where ARM becomes uniquely powerful for Galerina. ARM security extensions enforce governance constraints at the **hardware level**, making them stronger than software-only guarantees.

### Memory Tagging Extension (`require mte`)

```galerina
hardware {
  target arm.sve2
  require mte
}
```

**Purpose:** Hardware-enforced memory boundaries.

MTE assigns cryptographic tags to memory allocations. Pointer/tag mismatches trap immediately — before any data can be accessed incorrectly.

Galerina benefit:
- Governed memory regions (`createGovernedMemory`) get hardware MTE tags
- Any attempt to access governed memory via an untagged pointer → hardware trap
- Audit record generated automatically before the trap

**This prevents:**
- Buffer overruns that could bypass value-state checks
- Pointer misuse across capability boundaries
- Memory corruption in ProofGraph construction

### Pointer Authentication (`require pac`)

```galerina
hardware {
  target arm.sve2
  require pac
}
```

**Purpose:** Cryptographic pointer integrity protection.

PAC signs function pointers, return addresses, and data pointers with a hardware key. Tampered pointers fail verification and trap.

Galerina benefit:
- `ExecutionGraph` function dispatch is PAC-protected
- Return addresses in governance-critical code are signed
- Aligns with `capability isolation` — capability function pointers cannot be forged

**This prevents:**
- ROP (Return-Oriented Programming) attacks on governance verifier
- Control-flow hijacking via forged capability function pointers

### Branch Target Identification (`require bti`)

```galerina
hardware {
  target arm.sve2
  require bti
}
```

**Purpose:** Hardware control-flow integrity.

All valid branch targets must be marked with a BTI instruction. Branches to unmarked code trap.

**This prevents:**
- Jump-oriented programming attacks
- Control flow to unintended locations in the governance layer

### Realm Management Extension (`require realm_isolation`)

```galerina
hardware {
  target arm.sve2
  require mte
  require pac
  require realm_isolation
}
```

**Purpose:** Hardware-isolated execution zones (Confidential Computing on ARM).

Realm workloads execute in hardware-protected memory. The host OS, hypervisor, and other processes cannot access the Realm's memory or state.

Galerina benefit:
- `safety_critical` and `national_security` flows can run in hardware-isolated Realms
- Even a compromised host OS cannot read Realm memory
- Realm attestation can be included in the ProofGraph as hardware evidence

Best for:
- Government and defence workloads
- National security AI inference
- Medical AI with patient data

---

## Aerospace Example

```galerina
secure flow processFlightTelemetry(readonly telemetry: TelemetryPacket)
-> Result<FlightDecision, FlightError>

contract {
  intent {
    "Process flight telemetry with hardware-enforced memory safety and pointer integrity."
  }

  effects {
    telemetry.read
    navigation.compute
    flight_control.propose
    audit.write
  }

  value {
    classification safety_critical
    domain aerospace
    estimated_loss_per_incident 50000000
  }

  hardware {
    target arm.sve2
    require mte
    require pac
    require realm_isolation
    fallback cpu
  }

  safety {
    require deterministic_execution
    require bounded_runtime
    require validated_telemetry
    require no_unbounded_loops
  }

  audit {
    require proof_graph
    require runtime_attestation
    require hardware_target_trace
  }
}
{
  let safeTelemetry   = validate.telemetry(telemetry)?
  let proposedCommand = Navigation.computePath(safeTelemetry)?
  let checkedCommand  = SafetyEnvelope.check(proposedCommand)?

  AuditLog.write({
    event: "FlightTelemetryProcessed",
    commandHash: hash(checkedCommand),
    hardwareTarget: "arm.sve2",
    memoryTagging: "mte.enabled",
    realmIsolated: true
  })

  return Ok(checkedCommand)
}
```

This flow:
1. Requires ARM SVE2 for scalable vector telemetry processing
2. Requires MTE — hardware memory tag verification on every pointer access
3. Requires PAC — cryptographically signed function pointers
4. Requires Realm isolation — flight control logic runs in hardware-protected memory
5. Falls back to CPU if ARM SVE2 + security features unavailable
6. Records hardware target in audit trail (hardware_target_trace)

---

## ARM AI Governance (Sovereign Compute)

ARM SME2 enables **sovereign AI** — AI inference with no cloud dependency:

```galerina
contract {
  ai {
    approved_models { local_llm }
    max_token_cost £0.00          // no cloud spend
    require local_execution        // no data leaves device
  }

  hardware {
    target arm.sme2
    deny cloud_inference           // explicitly no cloud
    require mte
    fallback cpu
  }
}
```

This is extremely valuable for:
- Healthcare (patient data stays on-device)
- Government (classified data stays on-premise)
- Defence (no external network dependency)
- Aerospace (disconnected embedded operation)

---

## ARM Security Invariant

```
ARM acceleration may:
  Reduce power consumption
  Reduce latency
  Reduce cost
  Improve memory isolation (MTE)
  Strengthen pointer integrity (PAC)
  Harden control flow (BTI)
  Provide hardware isolation (Realm)
  Increase throughput (SVE2, SME2)

ARM acceleration may never:
  Grant authority
  Bypass ProofGraph
  Bypass CapabilityGraph
  Bypass audit requirements
  Bypass privacy controls
  Bypass runtime policy
  Remove safety_critical requirements
```

---

## See Also

- `galerina-hardware-targets.md` — Full target reference
- `galerina-master-architecture.md` — Hardware governance rule
- `galerina-execution-graph-kernel-architecture.md` — Intel mapping (comparison)
- `galerina-hardware-google.md` — Google Axion (also ARM-based)
- `galerina-governance-scope.md` — High-consequence system governance
- `examples/aerospace/processFlightTelemetry.spore` — Full aerospace ARM example
