# LSGR Runtime Components

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Phase 17+

## Definition

The **Galerina Securely Governed Runtime (LSGR)** execution pipeline consists of ordered components, each with a defined role in the governed execution chain.

```text
Source
 -> Parser
 -> AST
 -> Semantic Checks
 -> Governance Checks
 -> Governed IR
 -> Governed IR Verifier
 -> Execution Classification Engine
 -> Runtime Planning
 -> Scheduler / Balancer
 -> Backend Translation
 -> Hardware Execution
 -> Assembler
 -> Response Gate
 -> Audit Proof
```

## Component Specifications

### Intake Guard

**Role:** Protects the runtime from malformed or dangerous input before planning begins.

Responsibilities: request size limits, malformed input detection, schema prechecks, encoding normalisation, rate limiting, malicious payload filtering, request budget assignment.

```text
Never expose the runtime planner directly to raw untrusted input.
```

### Parser

**Role:** Transforms Galerina source text into structured tokens and syntax trees.

Responsibilities: lexical analysis, token generation, syntax parsing, structural validation.

### AST (Abstract Syntax Tree)

**Role:** Represents source structure in a machine-readable logical form. Optimised for understanding, not execution speed.

### Semantic Checks

**Role:** Validates logical correctness.

Responsibilities: type validation, scope validation, function validation, contract validation, ownership validation.

### Governance Checks

**Role:** Validates runtime governance before execution planning.

Responsibilities: capability validation, effect validation, policy validation, security rule validation, runtime budget validation, trust validation.

```text
Governance must occur before execution exists.
```

### Governed IR

**Role:** Hardware-neutral representation of governed computation. The IR represents verified intent, not raw machine instructions. (See `neutral-governed-ir.md`.)

### Governed IR Verifier

**Role:** Verifies that IR is valid, safe, and governed before execution.

Responsibilities: memory safety validation, illegal jump detection, stack validation, effect validation, capability validation, hardware restriction validation, runtime budget validation, audit requirement validation.

```text
Unverified IR must never execute.
```

### Execution Classification Engine (ECE)

**Role:** Classifies execution nature before runtime planning — not cold vs hot, but execution nature.

Classification outputs:

```text
control compute vs dense compute vs AI compute
optical suitability
batching suitability
hardware suitability
security sensitivity
critical-path status
deferred-compute suitability
runtime priority
conversion cost
scheduling strategy
```

```text
Do not optimise blindly. Classify execution first.
```

### Runtime Director

**Role:** Builds governed execution plans.

Responsibilities: workload understanding, execution planning, dependency planning, compute planning, pipeline planning, conversion planning.

### Runtime Sheriff (Governance enforcement)

**Role:** Final runtime authority and governance enforcement.

Responsibilities: capability enforcement, effect enforcement, policy enforcement, runtime budget enforcement, execution approval, boundary enforcement, audit enforcement.

Trust level: highest. May grant/deny authority.

### Runtime Steward

**Role:** Optimises execution efficiency.

Responsibilities: batching, memory optimisation, verified fast path reuse, cache optimisation, queue optimisation, backpressure management, execution reuse.

### Compute Balancer

**Role:** Selects appropriate hardware targets.

Responsibilities: hardware availability, thermal awareness, queue pressure, trust levels, fallback routing, accelerator selection.

Targets: CPU, GPU, NPU, TPU, VPU, ASIC, FPGA, optical accelerators.

### Runtime Scheduler

**Role:** Coordinates partially asynchronous governed execution. Not uncontrolled async — **governed partial async**.

Responsibilities: task scheduling, dependency coordination, queue management, runtime budgets, execution ordering, cancellation, retries.

```text
Run independent work in parallel.
Preserve governed execution in order.
```

### Runtime Assembler

**Role:** Restores ordered governed output after parallel execution. (See `runtime-assembler.md`.)

### Response Gate

**Role:** Validates outputs before leaving the runtime.

Responsibilities: secret detection, forbidden field filtering, output schema validation, debug leakage prevention, AI output filtering, encoding validation.

```text
Governed execution includes governed output.
```

### Audit Proof System

**Role:** Creates verifiable execution records.

Tracks: policy decisions, capability decisions, hardware decisions, execution paths, runtime budgets, conversion decisions, accelerator usage, output validation.

```text
The runtime must prove why execution was allowed.
```

## Runtime Philosophy

LSGR does not ask "How can this execute faster?" It asks:

```text
What kind of computation is this,
and what is the safest and most efficient governed execution path?
```

## Final Principle

```text
Galerina should not optimise executing instructions.

Galerina should optimise governed execution of intent
across heterogeneous compute systems.
```
