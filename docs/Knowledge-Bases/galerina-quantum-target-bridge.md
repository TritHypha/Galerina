# Galerina Architecture: Quantum Computing Support Through Target Bridges

## Status

```
Future Architecture Proposal
Galerina should support quantum computing as a governed execution target,
not as a quantum programming language.
```

---

## Executive Summary

Galerina should **not** become a quantum programming language.

Instead:

> Galerina should become a governance-first language capable of targeting
> quantum systems through a dedicated target bridge.

Developers should never need to learn: quantum gates, qubit management,
circuit scheduling, hardware calibration, or backend-specific quantum languages.

---

## Core Principle

Galerina supports multiple execution worlds through the same source language:

```
Classical Compute
Photonic Compute
Quantum Compute
Future Compute Systems
```

---

## Proposed Architecture

```
Galerina Source
      ↓
Governed Execution Plan (GEP)
      ↓
Target Bridge
      ↓
Backend Runtime
      ↓
Audit Proof
```

The source language never directly targets hardware.

---

## Three Execution Families

### Classical
```
Galerina → Native Bridge → CPU / GPU / NPU / WASM
```
Packages: `galerina-target-cpu`, `galerina-target-gpu`, `galerina-target-wasm`, `galerina-target-native`

### Photonic
```
Galerina → Photonic Bridge → Photonic Runtime → Photonic Hardware
```
Package: `galerina-target-photonic`

### Quantum
```
Galerina → Quantum Bridge → Quantum Runtime → Simulator or Hardware
```
Package: `galerina-target-quantum`

---

## Why Not Add Quantum Syntax?

Bad approach:
```
qubit x
hadamard x
cnot x y
```

Problems: leaks backend details, not future-proof, hard for AI and developers,
breaks Galerina abstraction model.

Galerina stays focused on intent, governance, effects, compute goals, and
auditability — not hardware instructions.

---

## Correct Model: Source Developer View

```galerina
secure flow optimiseRoute(
  readonly problem: RouteProblem
) -> Result<RoutePlan, ComputeError>
effects [compute.optimisation, audit.write]
intent "Optimise route plan using best available compute target" {

  compute target best {
    prefer [quantum, photonic, gpu, cpu]
    fallback cpu
  }

  let result =
    RouteOptimizer.solve(problem)?

  AuditLog.write({
    event: "RouteOptimised"
  })

  return Ok(result)
}
```

The compiler sees: intent, effects, target preferences, compute requirements.
The compiler does **not** see: qubits, gates, circuit depth, hardware details.

---

## Quantum Bridge Responsibilities

New package: `galerina-target-quantum`

```
Quantum capability discovery
Quantum lowering
Circuit generation
Backend integration (QIR / OpenQASM)
Simulator support
Execution proof generation
```

### Quantum Bridge Pipeline

```
Governed Execution Plan
      ↓
Quantum Planner
      ↓
Quantum Bridge IR
      ↓
QIR / OpenQASM
      ↓
Simulator or Hardware
```

### Example Quantum Bridge IR (internal, developer never sees this)

```yaml
operation: optimisation
target: quantum
constraints: local_execution
fallback: cpu
audit: required
```

---

## Capability Manifest

```yaml
id: quantum

supports:
  - optimisation.qaoa
  - sampling
  - search

requires:
  - simulator_or_hardware

fallback: cpu

governance:
  requires_audit: true
```

---

## Runtime Selection Logic

```galerina
compute target best {
  prefer [quantum, gpu, cpu]
  fallback cpu
}
```

Runtime checks:
1. Quantum available?
2. Quantum calibrated?
3. Quantum supports this workload?

→ Yes: use quantum.
→ No: use GPU.
→ GPU unavailable: use CPU.

---

## Audit Proof

```yaml
execution:
  requested: quantum
  actual: quantum
  backend: simulator
  reason: optimisation_workload
```

Fallback proof:
```yaml
execution:
  requested: quantum
  actual: gpu
  reason: quantum_backend_unavailable
```

---

## Adaptive Runtime Integration

The Adaptive Runtime (see `galerina-adaptive-runtime-profiles.md`) integrates
naturally. The runtime learns:
- Workload patterns that suit quantum acceleration
- Success rates and latency across backends
- Hardware availability over time

It may automatically increase quantum utilisation as confidence grows —
always within the declared target preferences and governance constraints.

---

## Intent as Optimisation Signal

```galerina
intent "Optimise route planning"
```

Runtime can infer this is an optimisation workload and select quantum,
photonic, or GPU depending on capabilities. Intent helps optimisation.
**Intent never grants permission.**

---

## AI Workload Example

```galerina
secure flow generateEmbeddings(
  readonly text: protected Text
) -> Result<Embedding, AiError>
effects [ai.inference]
intent "Generate embeddings locally" {

  compute target best {
    prefer [photonic, gpu, cpu]
    fallback cpu
  }

  return EmbeddingModel.run(text)
}
```

Future backends — photonic, quantum, neuromorphic — could all compete for
this workload without any source change.

---

## Simulator First Strategy

Most developers will not have quantum hardware initially.

```
Simulator First → Hardware Second
```

The bridge supports quantum simulators, cloud quantum providers, and future
local quantum hardware through the same interface.

---

## Governance Requirements

Quantum execution remains fully governed:

```galerina
compute target quantum {
  require audit
  fallback cpu
}
```

Compiler emits:
```yaml
proof_required: true
fallback: cpu
```

---

## Future Hardware

Galerina assumes future hardware categories will emerge:

```
Quantum
Photonic
Neuromorphic
Analog AI
Optical AI
DNA Computing
```

**The source language should not change. Only new target bridges are added.**

---

## Recommended Package Structure

```
galerina-target-native
galerina-target-cpu
galerina-target-gpu
galerina-target-wasm

galerina-target-photonic
galerina-target-quantum

galerina-target-neuromorphic  (future)
```

Each package owns: Bridge IR, Capability Manifest, Runtime Adapter, Proof Generation.

---

## Core Principle

```
Intent
      ↓
Governed Execution Plan
      ↓
Target Bridge
      ↓
Runtime Selection
      ↓
Execution
      ↓
Audit Proof
```

Quantum computing becomes just another governed execution target.
The language remains stable. The governance model remains stable.
The audit model remains stable. Only the bridge changes.

---

## See Also

- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md` — adaptive runtime
- `docs/Knowledge-Bases/galerina-tensor-arity-decision.md` — tensor type model
- `docs/Knowledge-Bases/galerina-core-photonic-v02.md` — photonic target
- `docs/Knowledge-Bases/galerina-core-compute-v02.md` — compute model
