# Galerina — Governance Scope: High Consequence Systems

**Version: 1.0 — 2026-06-01**
**Status: Canonical market positioning — corrects "compliance language" framing**

---

## The Correction

Galerina is often demonstrated using:
- Medical records
- Patient information
- Financial transactions
- Government systems
- Personal data

Because these domains have obvious governance requirements and well-understood regulatory frameworks.

**However, Galerina's governance model is not fundamentally about PII.**

It is fundamentally about controlling and proving the safe behaviour of **high-consequence systems** — systems where failure, misuse, corruption, leakage, or unauthorised modification creates significant risk.

---

## The Right Description

**Galerina is a Governance-First Execution Platform for High Consequence Systems.**

Not: "A compliance language for PII and regulated data."

Compliance is one application of governance.
Safety, mission assurance, operational integrity, economic governance, AI governance, aerospace governance, and national infrastructure governance are all applications of the same underlying model.

---

## High Consequence Assets

Galerina treats governance as applying to any asset whose misuse creates significant risk:

| Domain | Protected Asset |
|---|---|
| Healthcare | Patient records, clinical decisions, treatment workflows, medical device interactions |
| Financial services | Transactions, market operations, risk calculations, settlement systems |
| Government | Citizen records, public services, identity infrastructure, critical systems |
| **Aerospace** | Flight control logic, navigation systems, telemetry, mission planning, safety envelopes |
| **Space systems** | Orbital mechanics, spacecraft guidance, propulsion planning, mission integrity |
| **Energy** | Grid balancing, load distribution, generation control |
| **Defence** | Mission systems, intelligence, command authority, safe-arming logic |
| **Critical infrastructure** | Water, transport, telecommunications |
| **AI systems** | Model calls, inference authority, AI agent coordination |
| **Industrial automation** | Robotics control, safety interlocks, process control |
| **Scientific research** | Data integrity, computational reproducibility, instrument authority |

The common characteristic is **consequence**, not data type.

---

## Governance Protects More Than Data

Traditional governance systems protect data.

Galerina governs:
- **Data** — what is stored and accessed
- **Capabilities** — what the code can do
- **Behaviour** — how the code executes
- **Authority** — who can approve what
- **Compute** — where execution happens
- **Models** — which AI models are approved
- **Decisions** — what the system concludes
- **Infrastructure** — what resources are consumed

In aerospace, the most valuable protected asset may not be personal data. It may be **control authority** — the right to command a flight path, fire a thruster, or authorise a maneuver. If that authority is exercised incorrectly, the consequence is mission loss or loss of life.

---

## Value Classification System

Galerina classifies assets by consequence, not data type:

```galerina
contract {
  value {
    classification safety_critical
    domain aerospace
    estimated_loss_per_incident £50000000
    regulatory_exposure extreme
  }
}
```

### Classifications

| Classification | Meaning | Example |
|---|---|---|
| `public` | No special governance required | Marketing content |
| `internal` | Standard access controls | Employee directories |
| `confidential` | Access-controlled, audited | Internal documents |
| `regulated` | Regulatory framework applies | Financial records |
| `financial` | Transaction/payment data | Payment processing |
| `medical` | Healthcare/PHI | Patient records |
| `government` | Public sector data | Citizen records |
| `safety_critical` | Failure may harm people or physical systems | Flight control |
| `mission_critical` | Failure may lose mission, asset, or strategic objective | Spacecraft maneuver |
| `national_security` | State-level consequence | Defence systems |

### The Key Distinction

```
safety_critical   = failure may directly harm people or physical systems
mission_critical  = failure may lose mission, asset, operation, or strategic objective
```

---

## Aerospace Example: Safety-Critical

```galerina
secure flow updateFlightPath(readonly telemetry: TelemetryPacket) -> Result<FlightCommand, FlightError>

contract {
  intent {
    "Update aircraft flight path using validated telemetry while preserving safety envelope."
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
    estimated_loss_per_incident £50000000
    regulatory_exposure extreme
  }

  safety {
    require deterministic_execution
    require bounded_runtime
    require validated_telemetry
    require no_unbounded_loops
    require fallback_mode_available
  }

  audit {
    require proof_graph
    require runtime_attestation
    require control_boundary_trace
  }
}
{
  let safeTelemetry   = validate.telemetry(telemetry)?
  let proposedCommand = Navigation.computePath(safeTelemetry)?
  let checkedCommand  = SafetyEnvelope.check(proposedCommand)?

  Audit.write({
    event: "FlightPathUpdated",
    commandHash: hash(checkedCommand),
    safetyEnvelope: "passed"
  })

  return Ok(checkedCommand)
}
```

---

## Aerospace Example: Mission-Critical

```galerina
secure flow planSatelliteManeuver(readonly mission: MissionPlan) -> Result<ManeuverPlan, MissionError>

contract {
  intent {
    "Generate satellite maneuver plan within mission, fuel, timing and orbital constraints."
  }

  effects {
    mission.read
    orbit.compute
    propulsion.plan
    audit.write
  }

  value {
    classification mission_critical
    domain aerospace
    estimated_loss_per_incident £25000000
    regulatory_exposure high
  }

  economics {
    max_compute_budget 500ms_cpu
    preferred_execution wasm
  }

  safety {
    require deterministic_execution
    require bounded_runtime
    require validated_inputs
    require approved_fallback_plan
  }

  audit {
    require proof_graph
    require mission_trace
    require runtime_attestation
  }
}
{
  let validMission = validate.missionPlan(mission)?
  let maneuver     = Orbit.computeManeuver(validMission)?
  let safeManeuver = MissionConstraints.verify(maneuver)?

  Audit.write({
    event: "SatelliteManeuverPlanned",
    maneuverHash: hash(safeManeuver)
  })

  return Ok(safeManeuver)
}
```

---

## Consequence-Based Governance Scaling

The same governance model scales across all consequence levels:

| System type | Governance requirements |
|---|---|
| Marketing analytics | Basic audit, basic lineage, standard capability controls |
| E-commerce checkout | Financial effects, PII protection, transaction audit |
| Patient treatment system | PHI protection, full audit, ProofGraph, runtime attestation |
| Power grid controller | Deterministic execution, safety envelope, continuous attestation |
| Flight control system | Formal proof obligations, capability isolation, safety-critical policy |
| Spacecraft guidance | Mission-critical proof, fallback authority, orbital constraint verification |

The language, compiler, and governance framework are the same at every level. The **contract** determines which requirements apply.

---

## New Contract Sub-Blocks (Planned)

Based on this scope expansion, the following contract sub-blocks are planned:

```galerina
contract {
  value {
    classification safety_critical | mission_critical | financial | ...
    domain aerospace | healthcare | finance | government | ...
    estimated_loss_per_incident £N
    regulatory_exposure extreme | high | medium | low
  }

  safety {
    require deterministic_execution
    require bounded_runtime
    require no_unbounded_loops
    require fallback_mode_available
    require validated_inputs
  }

  lineage {
    source origin_system
    owner OwningTeam
    retention 7_years
    classification medical | financial | ...
  }

  ai {
    max_token_cost £0.01
    max_model_calls 3
    approved_models { gpt-5 claude }
  }
}
```

---

## The Market Opportunity

**Compliance (PII focus):** Healthcare, finance, government — well-understood, large market

**High Consequence Systems (expanded):** Aerospace, defence, space, energy, critical infrastructure, AI — massive, currently underserved by governance-first tooling

An aerospace system with `safety_critical` classification requires:
- Deterministic execution (every output is reproducible from inputs)
- Bounded runtime (no execution can run indefinitely)
- Formal proof that safety envelope was not violated
- Immutable audit trail of every control authority exercise
- Cryptographic attestation that the deployed code matches the verified code

Galerina's architecture — ProofGraph, ExecutionGraph, deterministic compilation, audit chain — provides all of these. The market is significantly larger than "GDPR compliance."

---

## Diagnostic Codes (Planned)

| Code | Name | Trigger |
|---|---|---|
| `SPORE-VAL-001` | SafetyCriticalGovernanceRequired | `value.classification safety_critical` without `safety.require deterministic_execution` |
| `SPORE-VAL-002` | MissionCriticalFallbackRequired | `value.classification mission_critical` without `safety.require approved_fallback_plan` |
| `SPORE-VAL-003` | ValueClassificationMissing | `estimated_loss_per_incident` > £1M without `value.classification` declared |

---

## See Also

- `galerina-governance-hierarchy.md` — The inviolable security stack
- `galerina-governance-economics-platform.md` — The commercial vision
- `galerina-execution-graph-kernel-architecture.md` — The architectural evolution
- `galerina-hybrid-wasm-native-architecture-v1.md` — WASM governs, native accelerates
