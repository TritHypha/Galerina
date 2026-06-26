# Neutral Governed IR

## Definition

The **Neutral Governed Intermediate Representation (IR)** is the verified, hardware-neutral execution description that Galerina compiles to before backend-specific execution. It preserves security rules, capability rules, effects, memory rules, audit requirements, compute requirements, and hardware preferences.

```text
Do not bind Galerina to binary.
Bind Galerina to verified governed IR.
```

## Why It Exists

Traditional compilation:

```text
source code -> compiler -> machine code
```

This tightly couples the language to CPU assumptions and binary execution. Galerina must instead support:

```text
CPU, GPU, NPU, TPU, VPU, ASIC, WASM,
future photonic compute, future optical compute,
future tri-state compute, future heterogeneous compute systems
```

A hardware-neutral IR provides the stable abstraction layer.

## Compilation Flow

```text
Galerina Source
  -> Parser
  -> Type System
  -> Effect Validation
  -> Capability Validation
  -> Policy Validation
  -> Security Checks
  -> Governed IR
  -> Backend Translation
  -> Hardware Execution
```

## What the IR Preserves

### Type Information

```text
request type, response type, AI input/output type,
tensor type, memory region type, stream type
```

### Effect Information

```text
filesystem access, network access, database access,
AI tool access, GPU access, shell access
```

### Capability Information

```text
capability.compute.gpu
capability.ai.infer
capability.storage.read
capability.audit.write
```

### Memory Information

```text
memory ownership, memory regions, immutability,
copy-on-write, shared views, allocation budgets
```

### Compute Information

```text
general compute, parallel compute, AI inference,
vision processing, stream processing, batch processing
```

### Hardware Preferences

```text
CPU preferred, GPU preferred, TPU allowed, NPU preferred, CPU safe fallback
```

### Audit Requirements

```text
audit required, tamper-proof audit,
high-assurance audit, compliance logging
```

## IR as Verified Execution Plan

The IR acts as a verified execution plan — the runtime already knows what work is occurring, what boundaries exist, what hardware may be used, what memory is required, what effects are allowed, and what policy applies — before execution begins.

## Runtime Integration

Each runtime component uses the IR:

| Component | IR Usage |
|---|---|
| Director | understands workload intent |
| Sheriff | validates authority and policy |
| Steward | optimises execution |
| Balancer | selects hardware targets |
| Scheduler | coordinates timing and parallelism |
| Assembler | restores ordered governed output |

## Backend Targets

The IR supports multiple backends:

```text
CPU binary
WASM
GPU compute kernels
NPU execution
TPU execution
VPU execution
ASIC execution
future photonic execution
future optical execution
future tri-state systems
```

## Fast Path Integration

Verified Fast Pipes (VPI) may reuse governed IR signatures when: same input shape, same policy state, same capabilities, same hardware route, same compute graph. This allows safe execution reuse without bypassing governance.

## Advantages Over Direct Machine Code

**Security**: runtime understands effects, capabilities, boundaries, and authority before execution.

**Optimisation**: runtime understands compute shape, memory shape, data sensitivity, batching opportunities, and hardware suitability before execution.

**AI Integration**: AI systems reason over structured governed IR rather than raw machine code.

**Auditability**: execution plans become inspectable before runtime — the IR preserves security, policy, hardware, and memory decisions.

## IR Security Rules

The IR must remain: typed, governed, auditable, deterministic, capability-aware, effect-aware, hardware-aware, memory-aware.

The IR must never become: raw unrestricted machine code, hidden runtime state, unauditable execution, implicit authority.

## Final Principle

```text
Galerina should not compile directly into hardware assumptions.

Galerina should compile into verified governed intent,
then safely translate that intent into hardware execution.
```
